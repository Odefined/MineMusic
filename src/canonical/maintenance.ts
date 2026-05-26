import type {
  CanonicalRecord,
  CanonicalRelation,
  KnowledgeItem,
  KnowledgeQuery,
  ProvisionalRelationCandidate,
  ProvisionalReviewAnchor,
  ProvisionalReviewApplyInput,
  ProvisionalReviewApplyOutput,
  ProvisionalReviewInspection,
  ProvisionalReviewListOutput,
  Ref,
  Result,
  StageError,
  StageWarning,
} from "../contracts/index.js";
import type {
  CanonicalMaintenancePort,
  CanonicalRecordRepository,
  EventPort,
  MusicKnowledgePort,
  SessionContextPort,
} from "../ports/index.js";
import {
  isCurrentCanonicalRecord,
  sameRef,
} from "./normalization.js";
import { createCanonicalStorage } from "./storage.js";

type CanonicalMaintenanceOptions = {
  repository: CanonicalRecordRepository;
  sessionContext: SessionContextPort;
  knowledge?: MusicKnowledgePort;
  events?: EventPort;
  idFactory?: () => string;
  clock?: () => string;
  inspectionTtlMs?: number;
};

type ReviewSnapshot = {
  sessionId: string;
  subjectRef: Ref;
  inspection: ProvisionalReviewInspection;
};

const defaultInspectionTtlMs = 5 * 60 * 1000;

export function createCanonicalMaintenance({
  repository,
  sessionContext,
  knowledge,
  events,
  idFactory = createDefaultIdFactory("inspection"),
  clock = () => new Date().toISOString(),
  inspectionTtlMs = defaultInspectionTtlMs,
}: CanonicalMaintenanceOptions): CanonicalMaintenancePort {
  const storage = createCanonicalStorage({ repository });
  const snapshots = new Map<string, ReviewSnapshot>();

  return {
    async reviewList({ sessionId, limit, cursor }) {
      const posture = await ensureReviewPosture(sessionContext, sessionId);

      if (!posture.ok) {
        return posture;
      }

      const records = await storage.listRecords();

      if (!records.ok) {
        return records;
      }

      const start = decodeCursor(cursor);

      if (!start.ok) {
        return start;
      }

      const matched = records.value
        .filter((record) => record.kind === "recording" && record.status === "provisional")
        .sort((left, right) => refKey(left.ref).localeCompare(refKey(right.ref)));
      const requestedLimit = normalizeLimit(limit);
      const page = matched.slice(start.value, start.value + requestedLimit);
      const items: ProvisionalReviewListOutput["items"] = [];

      for (const record of page) {
        const relations = await storage.listRelations({ subjectRef: record.ref });

        if (!relations.ok) {
          return relations;
        }

        items.push({
          subjectRef: record.ref,
          kind: "recording",
          label: record.label,
          sourceRefCount: record.sourceRefs?.length ?? 0,
          relationCount: relations.value.length,
        });
      }

      const output: ProvisionalReviewListOutput = { items };
      const nextIndex = start.value + page.length;

      if (nextIndex < matched.length) {
        output.nextCursor = encodeCursor(nextIndex);
      }

      return ok(output);
    },

    async reviewInspect({ sessionId, subjectRef }) {
      const posture = await ensureReviewPosture(sessionContext, sessionId);

      if (!posture.ok) {
        return posture;
      }

      const subjectResult = await readReviewSubject(storage, subjectRef);

      if (!subjectResult.ok) {
        return subjectResult;
      }

      const subject = subjectResult.value;
      const outgoingRelations = await storage.listRelations({ subjectRef });

      if (!outgoingRelations.ok) {
        return outgoingRelations;
      }

      const allRelations = await storage.listRelations({});

      if (!allRelations.ok) {
        return allRelations;
      }

      const incomingRelations = allRelations.value.filter((relation) =>
        relation.objectRef !== undefined && sameRef(relation.objectRef, subjectRef),
      );
      const provisionalHints = await storage.listProvisionalHints({ subjectRef });

      if (!provisionalHints.ok) {
        return provisionalHints;
      }

      const neighborRecords = await readNeighborRecords({
        storage,
        outgoingRelations: outgoingRelations.value,
        incomingRelations,
      });

      if (!neighborRecords.ok) {
        return neighborRecords;
      }

      const knowledgeResult = await readReviewKnowledge({
        knowledge,
        sessionId,
        subject,
        outgoingRelations: outgoingRelations.value,
        provisionalHints: provisionalHints.value,
      });
      const knowledgeItems = knowledgeResult.items;
      const warnings = knowledgeResult.warnings.map((warning) => warning.message);
      const anchors = buildAnchors({
        subjectRef,
        knowledgeItems,
        outgoingRelations: outgoingRelations.value,
        provisionalHints: provisionalHints.value,
      });
      const providerRefs = anchors
        .map((anchor) => anchor.providerRef)
        .filter((ref): ref is Ref => ref !== undefined && isMusicBrainzRecordingRef(ref));
      const relatedCurrentRecords = await readRelatedCurrentRecords({
        storage,
        subjectRef,
        providerRefs,
      });

      if (!relatedCurrentRecords.ok) {
        return relatedCurrentRecords;
      }

      const inspection: ProvisionalReviewInspection = {
        inspectionId: idFactory(),
        subject,
        outgoingRelations: outgoingRelations.value,
        incomingRelations,
        provisionalHints: provisionalHints.value,
        neighborRecords: neighborRecords.value,
        relatedCurrentRecords: relatedCurrentRecords.value,
        knowledgeItems,
        anchors: [
          ...anchors,
          ...relatedCurrentRecords.value.map((record, index) =>
            activeNeighborAnchor({
              subjectRef,
              record,
              index,
            }),
          ),
        ],
        relationCandidates: buildRelationCandidates({
          subjectRef,
          outgoingRelations: outgoingRelations.value,
        }),
        ...(warnings.length === 0 ? {} : { warnings }),
        expiresAt: new Date(Date.parse(clock()) + inspectionTtlMs).toISOString(),
      };

      snapshots.set(snapshotKey(sessionId, subjectRef), {
        sessionId,
        subjectRef,
        inspection,
      });

      return ok(inspection);
    },

    async reviewApply(input: ProvisionalReviewApplyInput): Promise<Result<ProvisionalReviewApplyOutput>> {
      const commonGate = await validateApplyCommon({
        sessionContext,
        storage,
        snapshots,
        clock,
        input,
      });

      if (!commonGate.ok) {
        return commonGate;
      }

      if (input.action === "defer") {
        const deferGate = validateDeferDecision(input, commonGate.value.inspection);

        if (!deferGate.ok) {
          return deferGate;
        }

        if (events === undefined) {
          return fail({
            code: "event.record_failed",
            message: "EventPort is required to record provisional review defer decisions.",
            module: "events",
            retryable: false,
          });
        }

        const recorded = await events.record({
          event: {
            sessionId: input.sessionId,
            actor: "stage",
            type: "provisional_review.deferred",
            target: input.subjectRef,
            payload: {
              subjectRef: input.subjectRef,
              inspectionId: input.inspectionId,
              reason: input.reason,
              supportingRefs: input.supportingRefs ?? [],
              supportingKnowledgeItemIds: input.supportingKnowledgeItemIds ?? [],
              supportingAnchorIds: input.supportingAnchorIds ?? [],
            },
          },
        });

        if (!recorded.ok) {
          return recorded;
        }

        return ok({
          subjectRef: input.subjectRef,
          action: "defer",
          appliedAction: "defer",
        });
      }

      if (input.action === "update") {
        const updateGate = validateUpdateDecision(input, commonGate.value.inspection);

        if (!updateGate.ok) {
          return updateGate;
        }

        return fail({
          code: "canonical.review_invalid",
          message: "canonical.review.apply update effects are not implemented in this slice.",
          module: "canonical",
          retryable: false,
        });
      }

      return fail({
        code: "canonical.review_invalid",
        message: `Unsupported Provisional Review action '${String((input as { action?: unknown }).action)}'.`,
        module: "canonical",
        retryable: false,
      });
    },
  };
}

function createDefaultIdFactory(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

async function ensureReviewPosture(
  sessionContext: SessionContextPort,
  sessionId: string,
): Promise<Result<void>> {
  const session = await sessionContext.getSession({ sessionId });

  if (!session.ok) {
    return session;
  }

  if (session.value.posture !== "canonical_review") {
    return fail({
      code: "canonical.review_invalid",
      message: "Canonical review tools require canonical_review session posture.",
      module: "canonical",
      retryable: false,
    });
  }

  return ok(undefined);
}

async function readReviewSubject(
  storage: ReturnType<typeof createCanonicalStorage>,
  subjectRef: Ref,
): Promise<Result<CanonicalRecord>> {
  const subject = await storage.get(subjectRef);

  if (!subject.ok) {
    return subject;
  }

  if (subject.value === null) {
    return fail({
      code: "canonical.not_found",
      message: `Canonical record '${subjectRef.id}' was not found.`,
      module: "canonical",
      retryable: false,
    });
  }

  if (subject.value.kind !== "recording" || subject.value.status !== "provisional") {
    return fail({
      code: "canonical.review_invalid",
      message: "Provisional Review v1 only supports current provisional recordings.",
      module: "canonical",
      retryable: false,
    });
  }

  return ok(subject.value);
}

async function validateApplyCommon({
  sessionContext,
  storage,
  snapshots,
  clock,
  input,
}: {
  sessionContext: SessionContextPort;
  storage: ReturnType<typeof createCanonicalStorage>;
  snapshots: Map<string, ReviewSnapshot>;
  clock: () => string;
  input: ProvisionalReviewApplyInput;
}): Promise<Result<ReviewSnapshot>> {
  const posture = await ensureReviewPosture(sessionContext, input.sessionId);

  if (!posture.ok) {
    return posture;
  }

  const snapshot = snapshots.get(snapshotKey(input.sessionId, input.subjectRef));

  if (snapshot === undefined) {
    return fail({
      code: "canonical.review_invalid",
      message: "No latest inspection snapshot exists for this session and subject.",
      module: "canonical",
      retryable: false,
    });
  }

  if (snapshot.inspection.inspectionId !== input.inspectionId) {
    return fail({
      code: "canonical.review_invalid",
      message: "Inspection id is stale for this session and subject.",
      module: "canonical",
      retryable: false,
    });
  }

  if (Date.parse(snapshot.inspection.expiresAt) <= Date.parse(clock())) {
    return fail({
      code: "canonical.review_invalid",
      message: "Inspection snapshot has expired.",
      module: "canonical",
      retryable: false,
    });
  }

  if (!sameRef(snapshot.subjectRef, input.subjectRef)) {
    return fail({
      code: "canonical.review_invalid",
      message: "Inspection snapshot subject does not match apply subject.",
      module: "canonical",
      retryable: false,
    });
  }

  const subject = await readReviewSubject(storage, input.subjectRef);

  if (!subject.ok) {
    return subject;
  }

  const citations = validateCitations(input, snapshot.inspection);

  if (!citations.ok) {
    return citations;
  }

  return ok(snapshot);
}

function validateDeferDecision(
  input: Extract<ProvisionalReviewApplyInput, { action: "defer" }>,
  _inspection: ProvisionalReviewInspection,
): Result<void> {
  if (input.reason.trim().length === 0) {
    return fail({
      code: "canonical.review_invalid",
      message: "Defer decisions require a non-empty reason.",
      module: "canonical",
      retryable: false,
    });
  }

  return ok(undefined);
}

function validateUpdateDecision(
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>,
  inspection: ProvisionalReviewInspection,
): Result<void> {
  if (input.reason.trim().length === 0) {
    return fail({
      code: "canonical.review_invalid",
      message: "Update decisions require a non-empty reason.",
      module: "canonical",
      retryable: false,
    });
  }

  if (!isMusicBrainzRecordingRef(input.selectedProviderRef)) {
    return fail({
      code: "canonical.review_invalid",
      message: "Update decisions must select a MusicBrainz recording ref.",
      module: "canonical",
      retryable: false,
    });
  }

  if (!inspectionContainsRef(inspection, input.selectedProviderRef)) {
    return fail({
      code: "canonical.review_invalid",
      message: "Selected provider ref was not returned by the latest inspection.",
      module: "canonical",
      retryable: false,
    });
  }

  if (!selectedProviderRefIsCited(input, inspection)) {
    return fail({
      code: "canonical.review_invalid",
      message: "Update decisions must cite inspected facts for the selected provider ref.",
      module: "canonical",
      retryable: false,
    });
  }

  const uniqueReasonKinds = [...new Set(input.supportingReasonKinds)];

  if (uniqueReasonKinds.length < 2) {
    return fail({
      code: "canonical.review_invalid",
      message: "Update decisions require at least two non-label support reason kinds.",
      module: "canonical",
      retryable: false,
    });
  }

  for (const reasonKind of uniqueReasonKinds) {
    if (!supportReasonKindIsGrounded(reasonKind, inspection, input)) {
      return fail({
        code: "canonical.review_invalid",
        message: `Support reason kind '${reasonKind}' is not grounded in inspected facts.`,
        module: "canonical",
        retryable: false,
      });
    }
  }

  return ok(undefined);
}

function validateCitations(
  input: ProvisionalReviewApplyInput,
  inspection: ProvisionalReviewInspection,
): Result<void> {
  const inspectedRefKeys = inspectedRefs(inspection);
  const inspectedKnowledgeItemIds = new Set(
    inspection.knowledgeItems.map((item, index) => item.id ?? knowledgeItemId(item, index)),
  );
  const inspectedAnchorIds = new Set(inspection.anchors.map((anchor) => anchor.id));

  for (const ref of input.supportingRefs ?? []) {
    if (!inspectedRefKeys.has(refKey(ref))) {
      return fail({
        code: "canonical.review_invalid",
        message: `Supporting ref '${refKey(ref)}' was not returned by the latest inspection.`,
        module: "canonical",
        retryable: false,
      });
    }
  }

  for (const knowledgeItemId of input.supportingKnowledgeItemIds ?? []) {
    if (!inspectedKnowledgeItemIds.has(knowledgeItemId)) {
      return fail({
        code: "canonical.review_invalid",
        message: `Supporting Knowledge item '${knowledgeItemId}' was not returned by the latest inspection.`,
        module: "canonical",
        retryable: false,
      });
    }
  }

  for (const anchorId of input.supportingAnchorIds ?? []) {
    if (!inspectedAnchorIds.has(anchorId)) {
      return fail({
        code: "canonical.review_invalid",
        message: `Supporting anchor '${anchorId}' was not returned by the latest inspection.`,
        module: "canonical",
        retryable: false,
      });
    }
  }

  return ok(undefined);
}

function selectedProviderRefIsCited(
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>,
  inspection: ProvisionalReviewInspection,
): boolean {
  if ((input.supportingRefs ?? []).some((ref) => sameRef(ref, input.selectedProviderRef))) {
    return true;
  }

  const citedAnchorIds = new Set(input.supportingAnchorIds ?? []);

  if (
    inspection.anchors.some(
      (anchor) =>
        citedAnchorIds.has(anchor.id) &&
        anchor.providerRef !== undefined &&
        sameRef(anchor.providerRef, input.selectedProviderRef),
    )
  ) {
    return true;
  }

  const citedKnowledgeItemIds = new Set(input.supportingKnowledgeItemIds ?? []);

  return inspection.knowledgeItems.some((item, index) => {
    const itemId = item.id ?? knowledgeItemId(item, index);

    if (!citedKnowledgeItemIds.has(itemId)) {
      return false;
    }

    return knowledgeItemRefs(item).some((ref) => sameRef(ref, input.selectedProviderRef));
  });
}

function supportReasonKindIsGrounded(
  reasonKind: string,
  inspection: ProvisionalReviewInspection,
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>,
): boolean {
  const citedAnchorIds = new Set(input.supportingAnchorIds ?? []);
  const citedKnowledgeItemIds = new Set(input.supportingKnowledgeItemIds ?? []);
  const citedRefs = new Set((input.supportingRefs ?? []).map(refKey));
  const citedAnchors = inspection.anchors.filter((anchor) => citedAnchorIds.has(anchor.id));
  const citedKnowledgeItems = inspection.knowledgeItems.filter((item, index) =>
    citedKnowledgeItemIds.has(item.id ?? knowledgeItemId(item, index)),
  );

  switch (reasonKind) {
    case "artist_credit":
      return (
        inspection.outgoingRelations.some((relation) => relation.predicate === "performed_by") ||
        citedKnowledgeItems.some((item) => knowledgeItemContainsText(item, "artist"))
      );
    case "duration":
      return (
        inspection.outgoingRelations.some((relation) => relation.predicate === "has_duration_ms") ||
        inspection.provisionalHints.some((hint) => hint.facts.durationMs !== undefined) ||
        citedKnowledgeItems.some((item) => knowledgeItemContainsText(item, "duration"))
      );
    case "isrc":
      return citedKnowledgeItems.some((item) => knowledgeItemContainsText(item, "isrc"));
    case "release_appearance":
      return (
        inspection.outgoingRelations.some((relation) => relation.predicate === "appears_on_release") ||
        inspection.provisionalHints.some((hint) => hint.facts.releaseLabel !== undefined) ||
        citedKnowledgeItems.some((item) => knowledgeItemContainsText(item, "release"))
      );
    case "source_ref_context":
      return inspection.provisionalHints.some((hint) => citedRefs.has(refKey(hint.sourceRef))) ||
        citedAnchors.some((anchor) => anchor.id.startsWith("source-ref-context:"));
    case "direct_relation_context":
      return inspection.outgoingRelations.length > 0 || inspection.incomingRelations.length > 0;
    case "tracklist_context":
      return (
        inspection.provisionalHints.some((hint) => hint.facts.trackPosition !== undefined) ||
        citedKnowledgeItems.some((item) => knowledgeItemContainsText(item, "track"))
      );
    case "active_neighbor_anchor":
      return citedAnchors.some((anchor) => anchor.kind === "active_neighbor");
    default:
      return false;
  }
}

function inspectedRefs(inspection: ProvisionalReviewInspection): Set<string> {
  return new Set(
    [
      inspection.subject.ref,
      ...(inspection.subject.sourceRefs ?? []),
      ...inspection.outgoingRelations.flatMap(relationRefs),
      ...inspection.incomingRelations.flatMap(relationRefs),
      ...inspection.provisionalHints.flatMap((hint) => [
        hint.subjectRef,
        hint.sourceRef,
        hint.facts.releaseSourceRef,
      ]),
      ...inspection.neighborRecords.flatMap(recordRefs),
      ...inspection.relatedCurrentRecords.flatMap(recordRefs),
      ...inspection.knowledgeItems.flatMap(knowledgeItemRefs),
      ...inspection.anchors.flatMap(anchorRefs),
      ...inspection.relationCandidates.flatMap(relationCandidateRefs),
    ]
      .filter((ref): ref is Ref => ref !== undefined)
      .map(refKey),
  );
}

function inspectionContainsRef(
  inspection: ProvisionalReviewInspection,
  ref: Ref,
): boolean {
  return inspectedRefs(inspection).has(refKey(ref));
}

function relationRefs(relation: CanonicalRelation): Array<Ref | undefined> {
  return [
    relation.subjectRef,
    relation.objectRef,
    relation.sourceRef,
  ];
}

function relationCandidateRefs(candidate: ProvisionalRelationCandidate): Array<Ref | undefined> {
  return [
    candidate.subjectRef,
    candidate.objectRef,
    candidate.sourceRef,
  ];
}

function recordRefs(record: CanonicalRecord): Ref[] {
  return [record.ref, ...(record.sourceRefs ?? [])];
}

function anchorRefs(anchor: ProvisionalReviewAnchor): Array<Ref | undefined> {
  return [
    anchor.subjectRef,
    anchor.providerRef,
    ...anchor.relatedCanonicalRefs,
    ...anchor.supportingRefs,
  ];
}

function knowledgeItemRefs(item: KnowledgeItem): Ref[] {
  return [
    item.source.ref,
    ...(item.kind === "structured" ? item.nodes.map((node) => node.ref) : []),
  ].filter((ref): ref is Ref => ref !== undefined);
}

function knowledgeItemContainsText(item: KnowledgeItem, text: string): boolean {
  return JSON.stringify(item).toLocaleLowerCase().includes(text);
}

async function readNeighborRecords({
  storage,
  outgoingRelations,
  incomingRelations,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  outgoingRelations: CanonicalRelation[];
  incomingRelations: CanonicalRelation[];
}): Promise<Result<CanonicalRecord[]>> {
  const neighborRefs = uniqueRefs([
    ...outgoingRelations
      .map((relation) => relation.objectRef)
      .filter((ref): ref is Ref => ref !== undefined),
    ...incomingRelations.map((relation) => relation.subjectRef),
  ]);
  const records: CanonicalRecord[] = [];

  for (const ref of neighborRefs) {
    const record = await storage.get(ref);

    if (!record.ok) {
      return record;
    }

    if (record.value !== null) {
      records.push(record.value);
    }
  }

  return ok(records);
}

async function readReviewKnowledge({
  knowledge,
  sessionId,
  subject,
  outgoingRelations,
  provisionalHints,
}: {
  knowledge: MusicKnowledgePort | undefined;
  sessionId: string;
  subject: CanonicalRecord;
  outgoingRelations: CanonicalRelation[];
  provisionalHints: ProvisionalReviewInspection["provisionalHints"];
}): Promise<{
  items: KnowledgeItem[];
  warnings: StageWarning[];
}> {
  if (knowledge === undefined) {
    return {
      items: [],
      warnings: [
        {
          code: "canonical.review_knowledge_unavailable",
          message: "No Music Knowledge provider is available for review inspection.",
          module: "canonical",
        },
      ],
    };
  }

  const query = buildKnowledgeQuery({ subject, outgoingRelations, provisionalHints });
  const result = await knowledge.query({ query, sessionId });

  if (!result.ok) {
    return {
      items: [],
      warnings: [
        {
          code: String(result.error.code),
          message: result.error.message,
          module: "canonical",
        },
      ],
    };
  }

  return {
    items: result.value.items.map((item, index) => withKnowledgeItemId(item, index)),
    warnings: result.warnings ?? [],
  };
}

function buildKnowledgeQuery({
  subject,
  outgoingRelations,
  provisionalHints,
}: {
  subject: CanonicalRecord;
  outgoingRelations: CanonicalRelation[];
  provisionalHints: ProvisionalReviewInspection["provisionalHints"];
}): KnowledgeQuery {
  const firstRecordingHint = provisionalHints.find((hint) => hint.kind === "source_recording_context");
  const title = firstRecordingHint?.facts.title ?? subject.label;
  const artist = firstRecordingHint?.facts.artistLabels?.join(" ") ??
    outgoingRelations
      .filter((relation) => relation.predicate === "performed_by")
      .map((relation) => relation.objectLabel)
      .filter((label): label is string => label !== undefined)
      .join(" ");
  const release = firstRecordingHint?.facts.releaseLabel ??
    outgoingRelations.find((relation) => relation.predicate === "appears_on_release")?.objectLabel;
  const fieldQuery = {
    title,
    ...(artist.length === 0 ? {} : { artist }),
    ...(release === undefined ? {} : { release }),
  };

  return {
    fieldQuery,
    purpose: "review",
    formats: ["structured"],
    entityKinds: ["recording"],
    expand: ["credits", "relations", "release_labels", "tracklist"],
    limit: 10,
  };
}

function withKnowledgeItemId(item: KnowledgeItem, index: number): KnowledgeItem {
  if (item.id !== undefined) {
    return structuredClone(item);
  }

  return {
    ...structuredClone(item),
    id: knowledgeItemId(item, index),
  };
}

function buildAnchors({
  subjectRef,
  knowledgeItems,
  outgoingRelations,
  provisionalHints,
}: {
  subjectRef: Ref;
  knowledgeItems: KnowledgeItem[];
  outgoingRelations: CanonicalRelation[];
  provisionalHints: ProvisionalReviewInspection["provisionalHints"];
}): ProvisionalReviewAnchor[] {
  const providerRefs = collectMusicBrainzRecordingRefs(knowledgeItems);
  const providerAnchors = [...providerRefs.values()].map(({ ref, knowledgeItemIds }, index) => ({
    id: `provider-ref:${index + 1}`,
    kind: "provider_ref",
    role: "determining",
    subjectRef,
    providerRef: ref,
    relatedCanonicalRefs: [],
    supportingRefs: [ref],
    supportingKnowledgeItemIds: knowledgeItemIds,
  }) satisfies ProvisionalReviewAnchor);
  const sourceAnchors = outgoingRelations.map((relation, index) => ({
    id: `source-relation:${index + 1}`,
    kind: "source_relation",
    role: "supporting",
    subjectRef,
    relatedCanonicalRefs: relation.objectRef === undefined ? [] : [relation.objectRef],
    supportingRefs: [
      relation.sourceRef,
      ...(relation.objectRef === undefined ? [] : [relation.objectRef]),
    ],
    supportingKnowledgeItemIds: [],
    notes: [`${relation.predicate}:${relation.objectLabel ?? relation.objectValue ?? relation.objectKind}`],
  }) satisfies ProvisionalReviewAnchor);
  const hintAnchors = provisionalHints.map((hint, index) => ({
    id: `source-ref-context:${index + 1}`,
    kind: "source_relation",
    role: "supporting",
    subjectRef,
    relatedCanonicalRefs: [],
    supportingRefs: [
      hint.sourceRef,
      ...(hint.facts.releaseSourceRef === undefined ? [] : [hint.facts.releaseSourceRef]),
    ],
    supportingKnowledgeItemIds: [],
    notes: [JSON.stringify(hint.facts)],
  }) satisfies ProvisionalReviewAnchor);

  return [...providerAnchors, ...sourceAnchors, ...hintAnchors];
}

function collectMusicBrainzRecordingRefs(
  knowledgeItems: KnowledgeItem[],
): Map<string, { ref: Ref; knowledgeItemIds: string[] }> {
  const refs = new Map<string, { ref: Ref; knowledgeItemIds: string[] }>();

  knowledgeItems.forEach((item, index) => {
    const itemId = item.id ?? knowledgeItemId(item, index);
    const candidates = [
      item.source.ref,
      ...(item.kind === "structured" ? item.nodes.map((node) => node.ref) : []),
    ].filter((ref): ref is Ref => ref !== undefined && isMusicBrainzRecordingRef(ref));

    for (const ref of candidates) {
      const key = refKey(ref);
      const existing = refs.get(key);

      if (existing === undefined) {
        refs.set(key, { ref, knowledgeItemIds: [itemId] });
      } else if (!existing.knowledgeItemIds.includes(itemId)) {
        existing.knowledgeItemIds.push(itemId);
      }
    }
  });

  return refs;
}

async function readRelatedCurrentRecords({
  storage,
  subjectRef,
  providerRefs,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  subjectRef: Ref;
  providerRefs: Ref[];
}): Promise<Result<CanonicalRecord[]>> {
  const records: CanonicalRecord[] = [];

  for (const providerRef of uniqueRefs(providerRefs)) {
    const currentRecords = await storage.findCurrentRecordsBySourceRef({
      sourceRef: providerRef,
      excludeRef: subjectRef,
      kind: "recording",
    });

    if (!currentRecords.ok) {
      return currentRecords;
    }

    records.push(...currentRecords.value);
  }

  return ok(
    uniqueRecords(records).filter((record) => isCurrentCanonicalRecord(record)),
  );
}

function activeNeighborAnchor({
  subjectRef,
  record,
  index,
}: {
  subjectRef: Ref;
  record: CanonicalRecord;
  index: number;
}): ProvisionalReviewAnchor {
  const providerRefs = (record.sourceRefs ?? []).filter(isMusicBrainzRecordingRef);

  return {
    id: `active-neighbor:${index + 1}`,
    kind: "active_neighbor",
    role: "supporting",
    subjectRef,
    ...(providerRefs[0] === undefined ? {} : { providerRef: providerRefs[0] }),
    relatedCanonicalRefs: [record.ref],
    supportingRefs: [record.ref, ...providerRefs],
    supportingKnowledgeItemIds: [],
  };
}

function buildRelationCandidates({
  subjectRef,
  outgoingRelations,
}: {
  subjectRef: Ref;
  outgoingRelations: CanonicalRelation[];
}): ProvisionalRelationCandidate[] {
  return outgoingRelations.map((relation, index) => ({
    id: `direct-relation:${index + 1}`,
    subjectRef,
    predicate: relation.predicate,
    objectKind: relation.objectKind,
    ...(relation.objectRef === undefined ? {} : { objectRef: relation.objectRef }),
    ...(relation.objectLabel === undefined ? {} : { objectLabel: relation.objectLabel }),
    ...(relation.objectValue === undefined ? {} : { objectValue: relation.objectValue }),
    sourceRef: relation.sourceRef,
    ...(relation.providerId === undefined ? {} : { providerId: relation.providerId }),
    supportingKnowledgeItemIds: [],
    supportingAnchorIds: [`source-relation:${index + 1}`],
  }));
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 25;
  }

  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function decodeCursor(cursor: string | undefined): Result<number> {
  if (cursor === undefined) {
    return ok(0);
  }

  const decoded = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);

  if (!Number.isInteger(decoded) || decoded < 0) {
    return fail({
      code: "canonical.review_invalid",
      message: "Review list cursor is invalid.",
      module: "canonical",
      retryable: false,
    });
  }

  return ok(decoded);
}

function encodeCursor(index: number): string {
  return Buffer.from(String(index), "utf8").toString("base64url");
}

function uniqueRefs(refs: Ref[]): Ref[] {
  const byKey = new Map<string, Ref>();

  for (const ref of refs) {
    byKey.set(refKey(ref), ref);
  }

  return [...byKey.values()];
}

function uniqueRecords(records: CanonicalRecord[]): CanonicalRecord[] {
  const byKey = new Map<string, CanonicalRecord>();

  for (const record of records) {
    byKey.set(refKey(record.ref), record);
  }

  return [...byKey.values()];
}

function knowledgeItemId(item: KnowledgeItem, index: number): string {
  const sourceRef = item.source.ref === undefined ? "no-source-ref" : refKey(item.source.ref);

  return `${item.providerId}:${sourceRef}:${index + 1}`;
}

function isMusicBrainzRecordingRef(ref: Ref): boolean {
  return ref.namespace === "musicbrainz" && ref.kind === "recording";
}

function snapshotKey(sessionId: string, subjectRef: Ref): string {
  return `${sessionId}:${refKey(subjectRef)}`;
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
