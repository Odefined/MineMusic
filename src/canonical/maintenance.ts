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
  StageEvent,
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

type SelectedRecordingWriteFacts = {
  label: string;
  aliases: string[];
  facts: Record<string, unknown>;
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
    async reviewList({ sessionId, limit, cursor, excludeReviewed = true }) {
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

      const reviewedSubjects = excludeReviewed
        ? await reviewedSubjectRefKeys({ events, sessionId })
        : ok(new Set<string>());

      if (!reviewedSubjects.ok) {
        return reviewedSubjects;
      }

      const matched = records.value
        .filter((record) => record.kind === "recording" && record.status === "provisional")
        .filter((record) => !reviewedSubjects.value.has(refKey(record.ref)))
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
          input,
          inspection: commonGate.value.inspection,
          selectedProviderRef: updateGate.value,
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

async function reviewedSubjectRefKeys({
  events,
  sessionId,
}: {
  events: EventPort | undefined;
  sessionId: string;
}): Promise<Result<Set<string>>> {
  if (events === undefined) {
    return ok(new Set());
  }

  const listed = await events.listBySession({ sessionId });

  if (!listed.ok) {
    return listed;
  }

  return ok(new Set(
    listed.value
      .filter(isReviewProgressEvent)
      .map((event) => event.target)
      .filter((ref): ref is Ref => ref !== undefined)
      .map(refKey),
  ));
}

function isReviewProgressEvent(event: StageEvent): boolean {
  return event.type === "provisional_review.deferred" ||
    event.type === "canonical.activated" ||
    event.type === "canonical.merged";
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
): Result<Ref> {
  if (input.reason.trim().length === 0) {
    return fail({
      code: "canonical.review_invalid",
      message: "Update decisions require a non-empty reason.",
      module: "canonical",
      retryable: false,
    });
  }

  const selectedToken = (input as { selectedProviderRefToken?: ProvisionalReviewRefToken }).selectedProviderRefToken;

  if (selectedToken === undefined) {
    return fail({
      code: "canonical.review_invalid",
      message: "Update decisions require a selected provider ref token.",
      module: "canonical",
      retryable: false,
    });
  }

  const selectedProviderRef = resolveReviewToken(
    inspection,
    selectedToken,
    "recording",
  );

  if (!selectedProviderRef.ok) {
    return selectedProviderRef;
  }

  if (!isMusicBrainzRecordingRef(selectedProviderRef.value)) {
    return fail({
      code: "canonical.review_invalid",
      message: "Update decisions must select a MusicBrainz recording ref.",
      module: "canonical",
      retryable: false,
    });
  }

  return ok(selectedProviderRef.value);
}

async function applyUpdateDecision({
  storage,
  events,
  input,
  inspection,
  selectedProviderRef,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  events: EventPort | undefined;
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>;
  inspection: ProvisionalReviewInspection;
  selectedProviderRef: Ref;
}): Promise<Result<ProvisionalReviewApplyOutput>> {
  const currentRecords = await storage.findCurrentRecordsByProviderIdentity({
    providerId: selectedProviderRef.namespace,
    entityKind: selectedProviderRef.kind,
    providerEntityId: selectedProviderRef.id,
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
      selectedProviderRef,
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
    input,
    inspection,
    selectedProviderRef,
    target,
  });
}

async function activateSubject({
  storage,
  events,
  input,
  inspection,
  selectedProviderRef,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  events: EventPort | undefined;
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>;
  inspection: ProvisionalReviewInspection;
  selectedProviderRef: Ref;
}): Promise<Result<ProvisionalReviewApplyOutput>> {
  const selectedFacts = selectedRecordingWriteFacts(inspection, selectedProviderRef);
  const activatedLabel = selectedFacts.label;
  const activatedAliases = mergeAliases([
    ...selectedFacts.aliases,
    ...(inspection.subject.aliases ?? []),
    inspection.subject.label,
    ...sourceAliases(inspection),
  ], activatedLabel);
  const activated: CanonicalRecord = {
    ...inspection.subject,
    label: activatedLabel,
    status: "active",
    sourceRefs: uniqueRefs(inspection.subject.sourceRefs ?? []),
    facts: selectedFacts.facts,
    ...(activatedAliases === undefined ? {} : { aliases: activatedAliases }),
  };
  const committed = await storage.commitChanges({
    putRecords: [activated],
    putProviderIdentities: [providerIdentityForRecording(activated.ref, selectedProviderRef)],
    deleteRelationIds: sourceDerivedRelationIds(inspection),
  });

  if (!committed.ok) {
    return committed;
  }

  const warnings = await recordUpdateEvent(events, {
    sessionId: input.sessionId,
    actor: "stage",
    type: "canonical.activated",
    target: input.subjectRef,
    payload: {
      subjectRef: input.subjectRef,
      inspectionId: input.inspectionId,
      selectedProviderRef,
      selectedProviderRefToken: input.selectedProviderRefToken,
      reason: input.reason,
    },
  });

  const output: Extract<ProvisionalReviewApplyOutput, { action: "update" }> = {
    subjectRef: input.subjectRef,
    action: "update",
    selectedProviderRef,
    selectedProviderRefToken: input.selectedProviderRefToken,
    appliedAction: "activate",
    ...(warnings.length === 0 ? {} : { warnings }),
  };

  return ok(output);
}

async function mergeSubject({
  storage,
  events,
  input,
  inspection,
  selectedProviderRef,
  target,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  events: EventPort | undefined;
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>;
  inspection: ProvisionalReviewInspection;
  selectedProviderRef: Ref;
  target: CanonicalRecord;
}): Promise<Result<ProvisionalReviewApplyOutput>> {
  const selectedFacts = selectedRecordingWriteFacts(inspection, selectedProviderRef);
  const movedSourceRefs = uniqueRefs([
    ...(target.sourceRefs ?? []),
    ...(inspection.subject.sourceRefs ?? []),
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
  const targetAliases = mergeAliases([
    ...selectedFacts.aliases,
    ...(target.aliases ?? []),
    target.label,
    ...(inspection.subject.aliases ?? []),
    inspection.subject.label,
    ...sourceAliases(inspection),
  ], selectedFacts.label);
  const survivingTarget: CanonicalRecord = {
    ...target,
    label: selectedFacts.label,
    sourceRefs: movedSourceRefs,
    facts: selectedFacts.facts,
    ...(targetAliases === undefined ? {} : { aliases: targetAliases }),
  };
  const committed = await storage.commitChanges({
    putRecords: [mergedSubject, survivingTarget],
    putProviderIdentities: [providerIdentityForRecording(target.ref, selectedProviderRef)],
    deleteRelationIds: sourceDerivedRelationIds(inspection),
  });

  if (!committed.ok) {
    return committed;
  }

  const warnings = await recordUpdateEvent(events, {
    sessionId: input.sessionId,
    actor: "stage",
    type: "canonical.merged",
    target: input.subjectRef,
    payload: {
      subjectRef: input.subjectRef,
      targetRef: target.ref,
      inspectionId: input.inspectionId,
      selectedProviderRef,
      selectedProviderRefToken: input.selectedProviderRefToken,
      reason: input.reason,
    },
  });

  const output: Extract<ProvisionalReviewApplyOutput, { action: "update" }> = {
    subjectRef: input.subjectRef,
    action: "update",
    selectedProviderRef,
    selectedProviderRefToken: input.selectedProviderRefToken,
    appliedAction: "merge",
    ...(warnings.length === 0 ? {} : { warnings }),
  };

  return ok(output);
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

async function recordUpdateEvent(
  events: EventPort | undefined,
  event: Parameters<EventPort["record"]>[0]["event"],
): Promise<string[]> {
  if (events === undefined) {
    return [];
  }

  const recorded = await events.record({ event });

  if (recorded.ok) {
    return [];
  }

  return [
    "Audit event recording failed after canonical update.",
  ];
}

function providerIdentityForRecording(canonicalRef: Ref, selectedProviderRef: Ref) {
  return {
    canonicalRef,
    providerId: selectedProviderRef.namespace,
    entityKind: selectedProviderRef.kind,
    providerEntityId: selectedProviderRef.id,
  };
}

function sourceDerivedRelationIds(inspection: ProvisionalReviewInspection): string[] {
  return inspection.outgoingRelations
    .filter((relation) => relation.status === "provisional")
    .map((relation) => relation.id);
}

function selectedRecordingWriteFacts(
  inspection: ProvisionalReviewInspection,
  selectedProviderRef: Ref,
): SelectedRecordingWriteFacts {
  const node = selectedRecordingNode(inspection, selectedProviderRef);
  const properties = node?.properties ?? {};
  const label = stringProperty(properties.title) ?? node?.label ?? selectedProviderRef.label ?? inspection.subject.label;
  const aliases = stringArrayProperty(properties.aliases);
  const facts = removeUndefinedFacts({
    artistCreditText: stringProperty(properties.artistCreditText),
    durationMs: numberProperty(properties.durationMs),
    isrcs: stringArrayProperty(properties.isrcs),
    disambiguation: stringProperty(properties.disambiguation),
  });

  return {
    label,
    aliases,
    facts,
  };
}

function selectedRecordingNode(
  inspection: ProvisionalReviewInspection,
  selectedProviderRef: Ref,
): KnowledgeNode | undefined {
  for (const item of inspection.knowledgeItems) {
    if (item.kind !== "structured") {
      continue;
    }

    const node = item.nodes.find((candidate) =>
      candidate.ref !== undefined && sameRef(candidate.ref, selectedProviderRef),
    );

    if (node !== undefined) {
      return node;
    }
  }

  return undefined;
}

function removeUndefinedFacts(facts: Record<string, unknown | undefined>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(facts).filter((entry): entry is [string, unknown] => entry[1] !== undefined),
  );
}

function stringProperty(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberProperty(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringArrayProperty(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
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

  const items = [...result.value.items];
  const warnings = [...(result.warnings ?? [])];
  const releaseTracklistRefs = reviewReleaseTracklistRefs({
    knowledgeItems: items,
    provisionalHints,
  });

  for (const releaseRef of releaseTracklistRefs) {
    const tracklistResult = await knowledge.query({
      query: buildReleaseTracklistKnowledgeQuery(releaseRef),
      sessionId,
    });

    if (!tracklistResult.ok) {
      warnings.push({
        code: String(tracklistResult.error.code),
        message: tracklistResult.error.message,
        module: "canonical",
      });
      continue;
    }

    items.push(...tracklistResult.value.items);
    warnings.push(...(tracklistResult.warnings ?? []));
  }

  return {
    items: items.map((item, index) => withKnowledgeItemId(item, index)),
    warnings,
  };
}

function reviewReleaseTracklistRefs({
  knowledgeItems,
  provisionalHints,
}: {
  knowledgeItems: KnowledgeItem[];
  provisionalHints: ProvisionalReviewInspection["provisionalHints"];
}): Ref[] {
  const sourceReleaseLabels = new Set(
    provisionalHints
      .filter((hint) => hint.kind === "source_recording_context")
      .map((hint) => hint.facts.releaseLabel)
      .filter((label): label is string => label !== undefined)
      .map(normalizeAlias),
  );

  if (sourceReleaseLabels.size === 0) {
    return [];
  }

  const refs = new Map<string, Ref>();

  for (const item of knowledgeItems) {
    if (item.kind !== "structured") {
      continue;
    }

    for (const relation of item.relations.filter((candidate) => candidate.type === "release_appearance")) {
      const releaseNode = nodeForEndpointRole(item.nodes, relation, "release");

      if (releaseNode?.ref === undefined || releaseNode.ref.namespace !== "musicbrainz") {
        continue;
      }

      const releaseFacts = releaseFactsFromNode(releaseNode);

      if (!sourceReleaseLabels.has(normalizeAlias(releaseFacts.title))) {
        continue;
      }

      refs.set(refKey(releaseNode.ref), releaseNode.ref);
    }
  }

  return [...refs.values()];
}

function buildReleaseTracklistKnowledgeQuery(releaseRef: Ref): KnowledgeQuery {
  return {
    providerRef: releaseRef,
    purpose: "review",
    formats: ["structured"],
    entityKinds: ["release"],
    expand: ["tracklist"],
    limit: 1,
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
  const fieldQuery = {
    title,
    ...(artist.length === 0 ? {} : { artist }),
  };

  return {
    fieldQuery,
    purpose: "review",
    formats: ["structured"],
    entityKinds: ["recording"],
    expand: ["releases"],
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
    const candidates = reviewIdentityRecordingRefs(item);

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

function reviewIdentityRecordingRefs(item: KnowledgeItem): Ref[] {
  const refs: Ref[] = [];

  if (item.source.ref !== undefined && isMusicBrainzRecordingRef(item.source.ref)) {
    refs.push(item.source.ref);
  }

  if (item.kind === "structured") {
    const rootNode = item.nodes.find((node) => node.id === item.rootNodeId);

    if (rootNode?.ref !== undefined && isMusicBrainzRecordingRef(rootNode.ref)) {
      refs.push(rootNode.ref);
    }
  }

  return uniqueRefs(refs);
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
