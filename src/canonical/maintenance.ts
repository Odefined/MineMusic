import type {
  CanonicalRecord,
  CanonicalRelation,
  KnowledgeItem,
  KnowledgeNode,
  KnowledgeQuery,
  KnowledgeRelation,
  ProvisionalRelationCandidate,
  ProvisionalReviewAnchor,
  ProvisionalReviewApplyInput,
  ProvisionalReviewApplyOutput,
  ProvisionalReviewInspection,
  ProvisionalReviewInspectInput,
  ProvisionalReviewRefToken,
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

type ReleaseAppearanceDraft = Omit<
  NonNullable<NonNullable<ProvisionalReviewInspection["detail"]>["releaseAppearances"]>[number],
  "refToken"
>;

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

    async reviewInspect(input) {
      const { sessionId, subjectRef } = input;
      const posture = await ensureReviewPosture(sessionContext, sessionId);

      if (!posture.ok) {
        return posture;
      }

      if (input.view === "detail") {
        return reviewInspectDetail({
          snapshots,
          clock,
          input,
        });
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
      const refTokens = buildRefTokenBindings(providerRefs);
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
        ...(refTokens.length === 0 ? {} : { refTokens }),
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

        return applyUpdateDecision({
          storage,
          events,
          clock,
          input,
          inspection: commonGate.value.inspection,
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

function reviewInspectDetail({
  snapshots,
  clock,
  input,
}: {
  snapshots: Map<string, ReviewSnapshot>;
  clock: () => string;
  input: ProvisionalReviewInspectInput;
}): Result<ProvisionalReviewInspection> {
  const inspectionId = input.inspectionId;

  if (inspectionId === undefined) {
    return fail({
      code: "canonical.review_invalid",
      message: "Detail inspection requires the latest summary inspection id.",
      module: "canonical",
      retryable: false,
    });
  }

  const recordingToken = input.recordingRefToken;

  if (recordingToken === undefined) {
    return fail({
      code: "canonical.review_invalid",
      message: "Detail inspection requires a recording ref token from the current inspection.",
      module: "canonical",
      retryable: false,
    });
  }

  const snapshot = snapshots.get(snapshotKey(input.sessionId, input.subjectRef));

  if (snapshot === undefined) {
    return fail({
      code: "canonical.review_invalid",
      message: "No latest inspection snapshot exists for this session and subject. Run summary inspect again.",
      module: "canonical",
      retryable: false,
    });
  }

  if (snapshot.inspection.inspectionId !== inspectionId) {
    return fail({
      code: "canonical.review_invalid",
      message: "Inspection id is stale for this session and subject. Run summary inspect again.",
      module: "canonical",
      retryable: false,
    });
  }

  if (Date.parse(snapshot.inspection.expiresAt) <= Date.parse(clock())) {
    return fail({
      code: "canonical.review_invalid",
      message: "Inspection snapshot has expired. Run summary inspect again.",
      module: "canonical",
      retryable: false,
    });
  }

  const recordingRef = resolveReviewToken(snapshot.inspection, recordingToken, "recording");

  if (!recordingRef.ok) {
    return recordingRef;
  }

  const include = new Set(input.include ?? []);
  const detail: NonNullable<ProvisionalReviewInspection["detail"]> = {
    recordingRefToken: recordingToken,
    recordingRef: recordingRef.value,
  };

  if (include.has("releaseAppearances")) {
    detail.releaseAppearances = releaseAppearancesForRecording(
      snapshot.inspection,
      recordingRef.value,
    ).map((appearance) => ({
      ...appearance,
      refToken: getOrAddRefToken(snapshot.inspection, appearance.ref, "release"),
    }));
  }

  if (include.has("releaseTrackPositions")) {
    if ((input.releaseRefTokens ?? []).length === 0) {
      return fail({
        code: "canonical.review_invalid",
        message: "Release track position detail requires release ref tokens from the current inspection.",
        module: "canonical",
        retryable: false,
      });
    }

    const releaseRefs: Array<{ token: ProvisionalReviewRefToken; ref: Ref }> = [];

    for (const token of input.releaseRefTokens ?? []) {
      const ref = resolveReviewToken(snapshot.inspection, token, "release");

      if (!ref.ok) {
        return ref;
      }

      releaseRefs.push({ token, ref: ref.value });
    }

    detail.releaseTrackPositions = releaseRefs
      .map(({ token, ref }) => releaseTrackPositionsForRecording(
        snapshot.inspection,
        recordingRef.value,
        ref,
        token,
      ))
      .filter((positions): positions is NonNullable<typeof positions> => positions !== undefined);

    if (detail.releaseTrackPositions.length < releaseRefs.length) {
      detail.warnings = [
        ...(detail.warnings ?? []),
        "Requested track position detail is unavailable in the current inspection snapshot.",
      ];
    }
  }

  return ok({
    ...snapshot.inspection,
    detail,
  });
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

async function applyUpdateDecision({
  storage,
  events,
  clock,
  input,
  inspection,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  events: EventPort | undefined;
  clock: () => string;
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>;
  inspection: ProvisionalReviewInspection;
}): Promise<Result<ProvisionalReviewApplyOutput>> {
  const currentRecords = await storage.findCurrentRecordsBySourceRef({
    sourceRef: input.selectedProviderRef,
    excludeRef: input.subjectRef,
    kind: "recording",
  });

  if (!currentRecords.ok) {
    return currentRecords;
  }

  if (currentRecords.value.length > 1) {
    return fail({
      code: "canonical.invariant_failed",
      message: "More than one current canonical recording carries the selected MusicBrainz recording ref.",
      module: "canonical",
      retryable: false,
    });
  }

  if (currentRecords.value.length === 0) {
    return activateSubject({
      storage,
      events,
      input,
      inspection,
    });
  }

  const target = currentRecords.value[0];

  if (target === undefined) {
    return fail({
      code: "canonical.invariant_failed",
      message: "Merge target lookup produced no target after invariant check.",
      module: "canonical",
      retryable: false,
    });
  }

  return mergeSubject({
    storage,
    events,
    clock,
    input,
    inspection,
    target,
  });
}

async function activateSubject({
  storage,
  events,
  input,
  inspection,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  events: EventPort | undefined;
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>;
  inspection: ProvisionalReviewInspection;
}): Promise<Result<ProvisionalReviewApplyOutput>> {
  const activatedLabel = selectedRecordingLabel(inspection, input.selectedProviderRef) ?? inspection.subject.label;
  const activatedAliases = mergeAliases([
    ...(inspection.subject.aliases ?? []),
    ...sourceAliases(inspection),
  ], activatedLabel);
  const activated: CanonicalRecord = {
    ...inspection.subject,
    label: activatedLabel,
    status: "active",
    sourceRefs: uniqueRefs([
      ...(inspection.subject.sourceRefs ?? []),
      input.selectedProviderRef,
    ]),
    ...(activatedAliases === undefined ? {} : { aliases: activatedAliases }),
  };
  const stored = await storage.put(activated, {
    sourceRefForConflict: input.selectedProviderRef,
  });

  if (!stored.ok) {
    return stored;
  }

  await recordOptionalEvent(events, {
    sessionId: input.sessionId,
    actor: "stage",
    type: "canonical.activated",
    target: input.subjectRef,
    payload: {
      subjectRef: input.subjectRef,
      inspectionId: input.inspectionId,
      selectedProviderRef: input.selectedProviderRef,
      reason: input.reason,
    },
  });

  return ok({
    subjectRef: input.subjectRef,
    action: "update",
    selectedProviderRef: input.selectedProviderRef,
    appliedAction: "activate",
  });
}

async function mergeSubject({
  storage,
  events,
  clock,
  input,
  inspection,
  target,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  events: EventPort | undefined;
  clock: () => string;
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>;
  inspection: ProvisionalReviewInspection;
  target: CanonicalRecord;
}): Promise<Result<ProvisionalReviewApplyOutput>> {
  const movedSourceRefs = uniqueRefs([
    ...(target.sourceRefs ?? []),
    ...(inspection.subject.sourceRefs ?? []),
    input.selectedProviderRef,
  ]);
  const conflict = await findMergeSourceRefConflict({
    storage,
    targetRef: target.ref,
    subjectRef: input.subjectRef,
    sourceRefs: movedSourceRefs,
  });

  if (!conflict.ok) {
    return conflict;
  }

  if (conflict.value !== null) {
    return fail({
      code: "canonical.source_ref_conflict",
      message: `Source ref '${refKey(conflict.value.sourceRef)}' is already attached to canonical record '${conflict.value.record.ref.id}'.`,
      module: "canonical",
      retryable: false,
    });
  }

  const mergedSubject: CanonicalRecord = {
    ...inspection.subject,
    status: "merged",
    sourceRefs: [],
    mergedIntoRef: target.ref,
  };
  const storedSubject = await storage.put(mergedSubject);

  if (!storedSubject.ok) {
    return storedSubject;
  }

  const targetAliases = mergeAliases([
    ...(target.aliases ?? []),
    ...(inspection.subject.aliases ?? []),
    inspection.subject.label,
    ...sourceAliases(inspection),
  ], target.label);
  const survivingTarget: CanonicalRecord = {
    ...target,
    sourceRefs: movedSourceRefs,
    ...(targetAliases === undefined ? {} : { aliases: targetAliases }),
  };
  const storedTarget = await storage.put(survivingTarget, {
    sourceRefForConflict: input.selectedProviderRef,
  });

  if (!storedTarget.ok) {
    return storedTarget;
  }

  for (const relation of inspection.outgoingRelations) {
    const movedRelation: CanonicalRelation = {
      ...relation,
      id: `merged:${target.ref.id}:${relation.id}`,
      subjectRef: target.ref,
      updatedAt: clock(),
    };
    const storedRelation = await storage.putRelation(movedRelation);

    if (!storedRelation.ok) {
      return storedRelation;
    }
  }

  await recordOptionalEvent(events, {
    sessionId: input.sessionId,
    actor: "stage",
    type: "canonical.merged",
    target: input.subjectRef,
    payload: {
      subjectRef: input.subjectRef,
      targetRef: target.ref,
      inspectionId: input.inspectionId,
      selectedProviderRef: input.selectedProviderRef,
      reason: input.reason,
    },
  });

  return ok({
    subjectRef: input.subjectRef,
    action: "update",
    selectedProviderRef: input.selectedProviderRef,
    appliedAction: "merge",
    targetRef: target.ref,
  });
}

async function findMergeSourceRefConflict({
  storage,
  targetRef,
  subjectRef,
  sourceRefs,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  targetRef: Ref;
  subjectRef: Ref;
  sourceRefs: Ref[];
}): Promise<Result<{ sourceRef: Ref; record: CanonicalRecord } | null>> {
  const records = await storage.listRecords();

  if (!records.ok) {
    return records;
  }

  for (const sourceRef of sourceRefs) {
    const conflict = records.value.find(
      (record) =>
        !sameRef(record.ref, targetRef) &&
        !sameRef(record.ref, subjectRef) &&
        (record.sourceRefs ?? []).some((candidateRef) => sameRef(candidateRef, sourceRef)),
    );

    if (conflict !== undefined) {
      return ok({ sourceRef, record: conflict });
    }
  }

  return ok(null);
}

async function recordOptionalEvent(
  events: EventPort | undefined,
  event: Parameters<EventPort["record"]>[0]["event"],
): Promise<void> {
  if (events === undefined) {
    return;
  }

  await events.record({ event });
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

function buildRefTokenBindings(refs: Ref[]): NonNullable<ProvisionalReviewInspection["refTokens"]> {
  return uniqueRefs(refs).map((ref, index) => ({
    token: {
      kind: "recording",
      id: `mbrec-${index + 1}`,
    },
    ref,
  }));
}

function resolveReviewToken(
  inspection: ProvisionalReviewInspection,
  token: ProvisionalReviewRefToken,
  expectedKind: ProvisionalReviewRefToken["kind"],
): Result<Ref> {
  if (token.kind !== expectedKind) {
    return fail({
      code: "canonical.review_invalid",
      message: `Review token '${token.id}' must be a ${expectedKind} token from the current inspection.`,
      module: "canonical",
      retryable: false,
    });
  }

  const binding = (inspection.refTokens ?? []).find((candidate) =>
    sameReviewToken(candidate.token, token),
  );

  if (binding === undefined || binding.token.kind !== expectedKind) {
    return fail({
      code: "canonical.review_invalid",
      message: `Review token '${token.id}' was not found in the current inspection snapshot.`,
      module: "canonical",
      retryable: false,
    });
  }

  return ok(binding.ref);
}

function getOrAddRefToken(
  inspection: ProvisionalReviewInspection,
  ref: Ref,
  kind: ProvisionalReviewRefToken["kind"],
): ProvisionalReviewRefToken {
  const existing = (inspection.refTokens ?? []).find((binding) =>
    binding.token.kind === kind && sameRef(binding.ref, ref),
  );

  if (existing !== undefined) {
    return existing.token;
  }

  const prefix = kind === "recording" ? "mbrec" : "mbrel";
  const nextId = (inspection.refTokens ?? []).filter((binding) => binding.token.kind === kind).length + 1;
  const token: ProvisionalReviewRefToken = {
    kind,
    id: `${prefix}-${nextId}`,
  };
  inspection.refTokens = [
    ...(inspection.refTokens ?? []),
    { token, ref },
  ];

  return token;
}

function sameReviewToken(left: ProvisionalReviewRefToken, right: ProvisionalReviewRefToken): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function releaseAppearancesForRecording(
  inspection: ProvisionalReviewInspection,
  recordingRef: Ref,
): ReleaseAppearanceDraft[] {
  const byRef = new Map<string, ReleaseAppearanceDraft>();

  for (const item of inspection.knowledgeItems) {
    if (item.kind !== "structured") {
      continue;
    }

    const recordingNode = item.nodes.find((node) =>
      node.ref !== undefined && sameRef(node.ref, recordingRef),
    );

    if (recordingNode === undefined) {
      continue;
    }

    const releaseNodes = [
      ...releaseNodesFromAppearanceRelations(item.nodes, item.relations, recordingNode.id),
      ...releaseNodesFromTracklistRelations(item.nodes, item.relations, recordingNode.id),
    ];

    for (const node of releaseNodes) {
      const appearance = releaseAppearanceFromNode(node);

      if (appearance === undefined || byRef.has(refKey(appearance.ref))) {
        continue;
      }

      byRef.set(refKey(appearance.ref), appearance);
    }
  }

  return [...byRef.values()];
}

function releaseTrackPositionsForRecording(
  inspection: ProvisionalReviewInspection,
  recordingRef: Ref,
  releaseRef: Ref,
  releaseToken: ProvisionalReviewRefToken,
): NonNullable<NonNullable<ProvisionalReviewInspection["detail"]>["releaseTrackPositions"]>[number] | undefined {
  for (const item of inspection.knowledgeItems) {
    if (item.kind !== "structured") {
      continue;
    }

    const releaseNode = item.nodes.find((node) =>
      node.ref !== undefined && sameRef(node.ref, releaseRef),
    );
    const recordingNode = item.nodes.find((node) =>
      node.ref !== undefined && sameRef(node.ref, recordingRef),
    );

    if (releaseNode === undefined || recordingNode === undefined) {
      continue;
    }

    const positions = trackPositionsForReleaseAndRecording({
      nodes: item.nodes,
      relations: item.relations,
      releaseNodeId: releaseNode.id,
      recordingNodeId: recordingNode.id,
    });

    if (positions.length === 0) {
      continue;
    }

    const releaseFacts = releaseFactsFromNode(releaseNode);

    return {
      refToken: releaseToken,
      ref: releaseRef,
      title: releaseFacts.title,
      ...(releaseFacts.date === undefined ? {} : { date: releaseFacts.date }),
      ...(releaseFacts.country === undefined ? {} : { country: releaseFacts.country }),
      positions,
    };
  }

  return undefined;
}

function releaseNodesFromAppearanceRelations(
  nodes: KnowledgeNode[],
  relations: KnowledgeRelation[],
  recordingNodeId: string,
): KnowledgeNode[] {
  return relations
    .filter((relation) => relation.type === "release_appearance")
    .filter((relation) =>
      relation.endpoints.some((endpoint) =>
        endpoint.nodeId === recordingNodeId && (endpoint.role === undefined || endpoint.role === "recording"),
      ),
    )
    .map((relation) => nodeForEndpointRole(nodes, relation, "release"))
    .filter((node): node is KnowledgeNode => node?.ref?.kind === "release");
}

function releaseNodesFromTracklistRelations(
  nodes: KnowledgeNode[],
  relations: KnowledgeRelation[],
  recordingNodeId: string,
): KnowledgeNode[] {
  const trackNodeIds = relations
    .filter((relation) => relation.type === "represents_recording")
    .filter((relation) =>
      relation.endpoints.some((endpoint) =>
        endpoint.nodeId === recordingNodeId && (endpoint.role === undefined || endpoint.role === "recording"),
      ),
    )
    .map((relation) => nodeIdForEndpointRole(relation, "track"))
    .filter((nodeId): nodeId is string => nodeId !== undefined);
  const mediumNodeIds = relations
    .filter((relation) => relation.type === "has_track")
    .filter((relation) => relation.endpoints.some((endpoint) => trackNodeIds.includes(endpoint.nodeId)))
    .map((relation) => nodeIdForEndpointRole(relation, "medium"))
    .filter((nodeId): nodeId is string => nodeId !== undefined);

  return relations
    .filter((relation) => relation.type === "has_medium")
    .filter((relation) => relation.endpoints.some((endpoint) => mediumNodeIds.includes(endpoint.nodeId)))
    .map((relation) => nodeForEndpointRole(nodes, relation, "release"))
    .filter((node): node is KnowledgeNode => node?.ref?.kind === "release");
}

function trackPositionsForReleaseAndRecording({
  nodes,
  relations,
  releaseNodeId,
  recordingNodeId,
}: {
  nodes: KnowledgeNode[];
  relations: KnowledgeRelation[];
  releaseNodeId: string;
  recordingNodeId: string;
}): NonNullable<NonNullable<ProvisionalReviewInspection["detail"]>["releaseTrackPositions"]>[number]["positions"] {
  const mediumNodes = relations
    .filter((relation) => relation.type === "has_medium")
    .filter((relation) => relation.endpoints.some((endpoint) => endpoint.nodeId === releaseNodeId))
    .map((relation) => nodeForEndpointRole(nodes, relation, "medium"))
    .filter((node): node is KnowledgeNode => node !== undefined);
  const positions: NonNullable<NonNullable<ProvisionalReviewInspection["detail"]>["releaseTrackPositions"]>[number]["positions"] = [];

  for (const mediumNode of mediumNodes) {
    const trackNodes = relations
      .filter((relation) => relation.type === "has_track")
      .filter((relation) => relation.endpoints.some((endpoint) => endpoint.nodeId === mediumNode.id))
      .map((relation) => nodeForEndpointRole(nodes, relation, "track"))
      .filter((node): node is KnowledgeNode => node !== undefined);

    for (const trackNode of trackNodes) {
      const representsSelectedRecording = relations
        .filter((relation) => relation.type === "represents_recording")
        .some((relation) =>
          relation.endpoints.some((endpoint) => endpoint.nodeId === trackNode.id) &&
            relation.endpoints.some((endpoint) => endpoint.nodeId === recordingNodeId),
        );

      if (!representsSelectedRecording) {
        continue;
      }

      const disc = stringFromUnknown(mediumNode.properties?.position);
      const track = numberFromUnknown(trackNode.properties?.position);
      const trackCount = numberFromUnknown(mediumNode.properties?.trackCount);
      const trackTitle = stringFromUnknown(trackNode.properties?.title) ?? trackNode.label;
      const trackLengthMs = numberFromUnknown(trackNode.properties?.lengthMs);

      positions.push({
        ...(disc === undefined ? {} : { disc }),
        ...(track === undefined ? {} : { track }),
        ...(trackCount === undefined ? {} : { trackCount }),
        ...(trackTitle === undefined ? {} : { trackTitle }),
        ...(trackLengthMs === undefined ? {} : { trackLengthMs }),
      });
    }
  }

  return positions;
}

function releaseAppearanceFromNode(node: KnowledgeNode): ReleaseAppearanceDraft | undefined {
  if (node.ref === undefined) {
    return undefined;
  }

  const facts = releaseFactsFromNode(node);

  return {
    ref: node.ref,
    title: facts.title,
    ...(facts.date === undefined ? {} : { date: facts.date }),
    ...(facts.country === undefined ? {} : { country: facts.country }),
    ...(facts.disambiguation === undefined ? {} : { disambiguation: facts.disambiguation }),
  };
}

function releaseFactsFromNode(node: KnowledgeNode): {
  title: string;
  date?: string;
  country?: string;
  disambiguation?: string;
} {
  const title = stringFromUnknown(node.properties?.title) ?? node.label ?? node.ref?.label ?? node.ref?.id ?? node.id;
  const date = stringFromUnknown(node.properties?.date);
  const country = stringFromUnknown(node.properties?.country);
  const disambiguation = stringFromUnknown(node.properties?.disambiguation);

  return {
    title,
    ...(date === undefined ? {} : { date }),
    ...(country === undefined ? {} : { country }),
    ...(disambiguation === undefined ? {} : { disambiguation }),
  };
}

function nodeForEndpointRole(
  nodes: KnowledgeNode[],
  relation: KnowledgeRelation,
  role: string,
): KnowledgeNode | undefined {
  const nodeId = nodeIdForEndpointRole(relation, role);

  return nodeId === undefined ? undefined : nodes.find((node) => node.id === nodeId);
}

function nodeIdForEndpointRole(relation: KnowledgeRelation, role: string): string | undefined {
  return relation.endpoints.find((endpoint) => endpoint.role === role)?.nodeId;
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
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

function selectedRecordingLabel(
  inspection: ProvisionalReviewInspection,
  selectedProviderRef: Ref,
): string | undefined {
  for (const item of inspection.knowledgeItems) {
    if (item.source.ref !== undefined && sameRef(item.source.ref, selectedProviderRef) && item.source.label !== undefined) {
      return item.source.label;
    }

    if (item.kind === "structured") {
      const node = item.nodes.find((candidate) =>
        candidate.ref !== undefined && sameRef(candidate.ref, selectedProviderRef) && candidate.label !== undefined,
      );

      if (node?.label !== undefined) {
        return node.label;
      }
    }
  }

  return undefined;
}

function sourceAliases(inspection: ProvisionalReviewInspection): string[] {
  return inspection.provisionalHints.flatMap((hint) => [
    hint.facts.title,
    hint.sourceRef.label,
  ]).filter((alias): alias is string => alias !== undefined && alias.trim().length > 0);
}

function mergeAliases(aliases: string[], primaryLabel: string): string[] | undefined {
  const normalizedPrimary = normalizeAlias(primaryLabel);
  const byKey = new Map<string, string>();

  for (const alias of aliases) {
    const normalized = normalizeAlias(alias);

    if (normalized.length === 0 || normalized === normalizedPrimary) {
      continue;
    }

    if (!byKey.has(normalized)) {
      byKey.set(normalized, alias.trim());
    }
  }

  const merged = [...byKey.values()];

  return merged.length === 0 ? undefined : merged;
}

function normalizeAlias(alias: string): string {
  return alias.trim().replace(/\s+/g, " ").toLocaleLowerCase();
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
