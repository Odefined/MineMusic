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
  ProvisionalReviewAutoUpdateItem,
  ProvisionalReviewAutoUpdateOutput,
  ProvisionalReviewAutoUpdateReasonCode,
  ProvisionalReviewDecisionOrigin,
  ProvisionalReviewInspection,
  ProvisionalReviewInspectInput,
  ProvisionalReviewRefToken,
  ProvisionalReviewListOutput,
  Ref,
  Result,
  StageError,
  StageWarning,
} from "../../contracts/index.js";
import type {
  CanonicalMaintenancePort,
  CanonicalRecordRepository,
  EventPort,
  MusicKnowledgePort,
  SessionContextPort,
} from "../../ports/index.js";
import {
  isCurrentCanonicalRecord,
  sameRef,
} from "./normalization.js";
import { qualifyReviewRecordings } from "./review-qualification.js";
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

type AutoUpdateRunState = {
  runId: string;
  processedSubjectKeys: Set<string>;
  expiresAtMs: number;
  busy: boolean;
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
const defaultAutoUpdateRunTtlMs = 20 * 60 * 1000;

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
  const autoUpdateRuns = new Map<string, AutoUpdateRunState>();
  const autoUpdateRunIdFactory = createDefaultIdFactory("auto-review-run");

  return {
    async reviewList({ sessionId, limit, cursor, includeCannotConfirm = false }) {
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

      const hiddenCannotConfirmSubjects = includeCannotConfirm
        ? ok(new Set<string>())
        : await reviewStateSubjectRefKeys({ storage, outcome: "cannot_confirm" });

      if (!hiddenCannotConfirmSubjects.ok) {
        return hiddenCannotConfirmSubjects;
      }

      const matched = records.value
        .filter((record) => record.kind === "recording" && record.status === "provisional")
        .filter((record) => !hiddenCannotConfirmSubjects.value.has(refKey(record.ref)))
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

      const inspectionResult = await readSummaryReviewInspection({
        storage,
        knowledge,
        sessionId,
        subjectRef,
        idFactory,
        clock,
        inspectionTtlMs,
      });

      if (!inspectionResult.ok) {
        return inspectionResult;
      }

      const inspection = inspectionResult.value;

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

      if (input.action === "cannot_confirm") {
        const cannotConfirmGate = validateCannotConfirmDecision(input, commonGate.value.inspection);

        if (!cannotConfirmGate.ok) {
          return cannotConfirmGate;
        }

        if (events === undefined) {
          return fail({
            code: "event.record_failed",
            message: "EventPort is required to record cannot-confirm identity review decisions.",
            module: "events",
            retryable: false,
          });
        }

        const recorded = await events.record({
          event: {
            sessionId: input.sessionId,
            actor: "stage",
            type: "provisional_review.cannot_confirm_identity",
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

        const reviewedAt = clock();
        const reviewState = await storage.putReviewState({
          subjectRef: input.subjectRef,
          outcome: "cannot_confirm",
          reason: input.reason,
          lastInspectionId: input.inspectionId,
          lastSessionId: input.sessionId,
          createdAt: reviewedAt,
          updatedAt: reviewedAt,
        });

        if (!reviewState.ok) {
          return reviewState;
        }

        return ok({
          subjectRef: input.subjectRef,
          action: "cannot_confirm",
          appliedAction: "cannot_confirm",
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
          decisionOrigin: "agent",
        });
      }

      return fail({
        code: "canonical.review_invalid",
        message: `Unsupported Provisional Review action '${String((input as { action?: unknown }).action)}'.`,
        module: "canonical",
        retryable: false,
      });
    },

    async reviewAutoUpdate(input) {
      const posture = await ensureReviewPosture(sessionContext, input.sessionId);

      if (!posture.ok) {
        return posture;
      }

      if (!("subjectRef" in input) || input.subjectRef === undefined) {
        const batchInput = input as { limit?: number; runId?: string; includeCannotConfirm?: boolean };

        return reviewAutoUpdateBatch({
          storage,
          knowledge,
          events,
          snapshots,
          runs: autoUpdateRuns,
          sessionId: input.sessionId,
          limit: batchInput.limit,
          runId: batchInput.runId,
          includeCannotConfirm: batchInput.includeCannotConfirm,
          idFactory,
          runIdFactory: autoUpdateRunIdFactory,
          clock,
          inspectionTtlMs,
          runTtlMs: defaultAutoUpdateRunTtlMs,
        });
      }

      return reviewAutoUpdateSingleSubject({
        storage,
        knowledge,
        events,
        snapshots,
        sessionId: input.sessionId,
        subjectRef: input.subjectRef,
        includeCannotConfirm: input.includeCannotConfirm,
        idFactory,
        clock,
        inspectionTtlMs,
      });
    },

    async clearReviewState({ subjectRef }) {
      return storage.deleteReviewState({ subjectRef });
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

async function reviewStateSubjectRefKeys({
  storage,
  outcome,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  outcome: "cannot_confirm";
}): Promise<Result<Set<string>>> {
  const states = await storage.listReviewStates({ outcome });

  if (!states.ok) {
    return states;
  }

  return ok(new Set(states.value.map((state) => refKey(state.subjectRef))));
}

async function readSummaryReviewInspection({
  storage,
  knowledge,
  sessionId,
  subjectRef,
  idFactory,
  clock,
  inspectionTtlMs,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  knowledge: MusicKnowledgePort | undefined;
  sessionId: string;
  subjectRef: Ref;
  idFactory: () => string;
  clock: () => string;
  inspectionTtlMs: number;
}): Promise<Result<ProvisionalReviewInspection>> {
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

  return ok(inspection);
}

async function reviewAutoUpdateSingleSubject({
  storage,
  knowledge,
  events,
  snapshots,
  sessionId,
  subjectRef,
  includeCannotConfirm,
  idFactory,
  clock,
  inspectionTtlMs,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  knowledge: MusicKnowledgePort | undefined;
  events: EventPort | undefined;
  snapshots: Map<string, ReviewSnapshot>;
  sessionId: string;
  subjectRef: Ref;
  includeCannotConfirm: boolean | undefined;
  idFactory: () => string;
  clock: () => string;
  inspectionTtlMs: number;
}): Promise<Result<ProvisionalReviewAutoUpdateOutput>> {
  if (includeCannotConfirm !== true) {
    const hiddenStates = await storage.listReviewStates({ subjectRef, outcome: "cannot_confirm" });

    if (!hiddenStates.ok) {
      return hiddenStates;
    }

    if (hiddenStates.value.length > 0) {
      return ok({
        mode: "single",
        item: {
          subjectRef,
          outcome: "not_qualified",
          reasonCodes: ["cannot_confirm_hidden"],
        },
      });
    }
  }

  const inspectionResult = await readSummaryReviewInspection({
    storage,
    knowledge,
    sessionId,
    subjectRef,
    idFactory,
    clock,
    inspectionTtlMs,
  });

  if (!inspectionResult.ok) {
    return ok({
      mode: "single",
      item: autoUpdateErrorItem(subjectRef, inspectionResult.error),
    });
  }

  const inspection = inspectionResult.value;

  snapshots.set(snapshotKey(sessionId, subjectRef), {
    sessionId,
    subjectRef,
    inspection,
  });

  const qualification = qualifyReviewRecordings({
    provisionalHints: inspection.provisionalHints,
    knowledgeItems: inspection.knowledgeItems,
  });

  if (qualification.qualifiedRecordingRefs.length !== 1) {
    return ok({
      mode: "single",
      item: {
        subjectRef,
        outcome: "not_qualified",
        reasonCodes: autoUpdateNotQualifiedReasonCodes(qualification),
      },
    });
  }

  const selectedProviderRef = qualification.qualifiedRecordingRefs[0];

  if (selectedProviderRef === undefined) {
    return ok({
      mode: "single",
      item: {
        subjectRef,
        outcome: "not_qualified",
        reasonCodes: ["no_musicbrainz_recording_facts"],
      },
    });
  }

  const selectedProviderRefToken = getOrAddRefToken(inspection, selectedProviderRef, "recording");
  const applied = await applyUpdateDecision({
    storage,
    events,
    input: {
      sessionId,
      inspectionId: inspection.inspectionId,
      subjectRef,
      action: "update",
      selectedProviderRefToken,
      reason: "Automatically qualified by Provisional Review v3.",
    },
    inspection,
    selectedProviderRef,
    decisionOrigin: "automatic",
  });

  if (!applied.ok) {
    return ok({
      mode: "single",
      item: autoUpdateErrorItem(subjectRef, applied.error),
    });
  }

  const appliedUpdate = applied.value as Extract<ProvisionalReviewApplyOutput, { action: "update" }>;

  snapshots.delete(snapshotKey(sessionId, subjectRef));

  return ok({
    mode: "single",
    item: {
      subjectRef,
      outcome: "updated",
      effect: appliedUpdate.appliedAction === "activate" ? "activated" : "merged",
      ...(appliedUpdate.warnings === undefined ? {} : { warnings: appliedUpdate.warnings }),
    },
  });
}

function autoUpdateNotQualifiedReasonCodes(
  qualification: ReturnType<typeof qualifyReviewRecordings>,
): ProvisionalReviewAutoUpdateReasonCode[] {
  const reasonCodes = qualification.reasonCodes.length > 0
    ? qualification.reasonCodes
    : qualification.recordings.flatMap((recording) => recording.reasonCodes);

  return uniqueAutoUpdateReasonCodes(
    reasonCodes.length === 0 ? ["no_musicbrainz_recording_facts"] : reasonCodes,
  );
}

function autoUpdateErrorItem(subjectRef: Ref | undefined, error: StageError): ProvisionalReviewAutoUpdateItem {
  return {
    ...(subjectRef === undefined ? {} : { subjectRef }),
    outcome: "error",
    errorCode: String(error.code),
    message: error.message,
  };
}

function uniqueAutoUpdateReasonCodes(
  reasonCodes: ProvisionalReviewAutoUpdateReasonCode[],
): ProvisionalReviewAutoUpdateReasonCode[] {
  return [...new Set(reasonCodes)];
}

async function reviewAutoUpdateBatch({
  storage,
  knowledge,
  events,
  snapshots,
  runs,
  sessionId,
  limit,
  runId,
  includeCannotConfirm,
  idFactory,
  runIdFactory,
  clock,
  inspectionTtlMs,
  runTtlMs,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  knowledge: MusicKnowledgePort | undefined;
  events: EventPort | undefined;
  snapshots: Map<string, ReviewSnapshot>;
  runs: Map<string, AutoUpdateRunState>;
  sessionId: string;
  limit: number | undefined;
  runId: string | undefined;
  includeCannotConfirm: boolean | undefined;
  idFactory: () => string;
  runIdFactory: () => string;
  clock: () => string;
  inspectionTtlMs: number;
  runTtlMs: number;
}): Promise<Result<ProvisionalReviewAutoUpdateOutput>> {
  const nowMs = Date.parse(clock());
  const limitUsed = normalizeAutoUpdateBatchLimit(limit);
  const run = readOrCreateAutoUpdateRun({ runs, runId, runIdFactory, nowMs, runTtlMs });

  if (!run.ok) {
    return ok({
      mode: "batch",
      runId: runId ?? "",
      limitUsed,
      updatedCount: 0,
      notQualifiedCount: 0,
      errorCount: 1,
      items: [{ outcome: "error", errorCode: run.errorCode }],
      hasMore: false,
    });
  }

  if (run.value.busy) {
    return ok({
      mode: "batch",
      runId: run.value.runId,
      limitUsed,
      updatedCount: 0,
      notQualifiedCount: 0,
      errorCount: 1,
      items: [{ outcome: "error", errorCode: "run_busy" }],
      hasMore: true,
    });
  }

  run.value.busy = true;

  try {
    const subjectRefs = await listAutoUpdateBatchSubjectRefs({ storage, includeCannotConfirm });

    if (!subjectRefs.ok) {
      return subjectRefs;
    }

    const selectedSubjectRefs = subjectRefs.value
      .filter((subjectRef) => !run.value.processedSubjectKeys.has(refKey(subjectRef)))
      .slice(0, limitUsed);
    const items: ProvisionalReviewAutoUpdateItem[] = [];
    let updatedCount = 0;
    let notQualifiedCount = 0;
    let errorCount = 0;

    for (const subjectRef of selectedSubjectRefs) {
      const output = await reviewAutoUpdateSingleSubject({
        storage,
        knowledge,
        events,
        snapshots,
        sessionId,
        subjectRef,
        includeCannotConfirm,
        idFactory,
        clock,
        inspectionTtlMs,
      });

      run.value.processedSubjectKeys.add(refKey(subjectRef));

      if (!output.ok) {
        errorCount += 1;
        items.push({
          subjectRef,
          outcome: "error",
          errorCode: String(output.error.code),
          message: output.error.message,
        });
        continue;
      }

      if (output.value.mode !== "single") {
        errorCount += 1;
        items.push({ subjectRef, outcome: "error", errorCode: "canonical.invariant_failed" });
        continue;
      }

      const item = output.value.item;

      if (item.outcome === "updated") {
        updatedCount += 1;
      } else if (item.outcome === "not_qualified") {
        notQualifiedCount += 1;
        items.push(item);
      } else {
        errorCount += 1;
        items.push(item);
      }
    }

    const remainingSubjectRefs = await listAutoUpdateBatchSubjectRefs({ storage, includeCannotConfirm });

    if (!remainingSubjectRefs.ok) {
      return remainingSubjectRefs;
    }

    return ok({
      mode: "batch",
      runId: run.value.runId,
      limitUsed,
      updatedCount,
      notQualifiedCount,
      errorCount,
      items,
      hasMore: remainingSubjectRefs.value.some((subjectRef) =>
        !run.value.processedSubjectKeys.has(refKey(subjectRef))
      ),
    });
  } finally {
    run.value.busy = false;
  }
}

function readOrCreateAutoUpdateRun({
  runs,
  runId,
  runIdFactory,
  nowMs,
  runTtlMs,
}: {
  runs: Map<string, AutoUpdateRunState>;
  runId: string | undefined;
  runIdFactory: () => string;
  nowMs: number;
  runTtlMs: number;
}): { ok: true; value: AutoUpdateRunState } | { ok: false; errorCode: string } {
  for (const [candidateRunId, run] of runs) {
    if (run.expiresAtMs <= nowMs) {
      runs.delete(candidateRunId);
    }
  }

  if (runId !== undefined) {
    const run = runs.get(runId);

    return run === undefined ? { ok: false, errorCode: "run_not_found" } : { ok: true, value: run };
  }

  const newRunId = runIdFactory();
  const run: AutoUpdateRunState = {
    runId: newRunId,
    processedSubjectKeys: new Set<string>(),
    expiresAtMs: nowMs + runTtlMs,
    busy: false,
  };

  runs.set(newRunId, run);

  return { ok: true, value: run };
}

async function listAutoUpdateBatchSubjectRefs({
  storage,
  includeCannotConfirm,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  includeCannotConfirm: boolean | undefined;
}): Promise<Result<Ref[]>> {
  const records = await storage.listRecords();

  if (!records.ok) {
    return records;
  }

  const hiddenCannotConfirmSubjects = includeCannotConfirm === true
    ? ok(new Set<string>())
    : await reviewStateSubjectRefKeys({ storage, outcome: "cannot_confirm" });

  if (!hiddenCannotConfirmSubjects.ok) {
    return hiddenCannotConfirmSubjects;
  }

  return ok(records.value
    .filter((record) => record.kind === "recording" && record.status === "provisional")
    .filter((record) => !hiddenCannotConfirmSubjects.value.has(refKey(record.ref)))
    .sort((left, right) => refKey(left.ref).localeCompare(refKey(right.ref)))
    .map((record) => record.ref));
}

function normalizeAutoUpdateBatchLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) {
    return 10;
  }

  return Math.min(50, Math.floor(limit));
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

function validateCannotConfirmDecision(
  input: Extract<ProvisionalReviewApplyInput, { action: "cannot_confirm" }>,
  _inspection: ProvisionalReviewInspection,
): Result<void> {
  if (input.reason.trim().length === 0) {
    return fail({
      code: "canonical.review_invalid",
      message: "Cannot-confirm decisions require a non-empty reason.",
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
  decisionOrigin,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  events: EventPort | undefined;
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>;
  inspection: ProvisionalReviewInspection;
  selectedProviderRef: Ref;
  decisionOrigin: ProvisionalReviewDecisionOrigin;
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
      decisionOrigin,
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
    decisionOrigin,
  });
}

async function activateSubject({
  storage,
  events,
  input,
  inspection,
  selectedProviderRef,
  decisionOrigin,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  events: EventPort | undefined;
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>;
  inspection: ProvisionalReviewInspection;
  selectedProviderRef: Ref;
  decisionOrigin: ProvisionalReviewDecisionOrigin;
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
      decisionOrigin,
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
  decisionOrigin,
}: {
  storage: ReturnType<typeof createCanonicalStorage>;
  events: EventPort | undefined;
  input: Extract<ProvisionalReviewApplyInput, { action: "update" }>;
  inspection: ProvisionalReviewInspection;
  selectedProviderRef: Ref;
  target: CanonicalRecord;
  decisionOrigin: ProvisionalReviewDecisionOrigin;
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
      decisionOrigin,
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

  const recordingQueries = buildReviewRecordingKnowledgeQueries({ subject, outgoingRelations, provisionalHints });
  const items: KnowledgeItem[] = [];
  const recordingItems: ReviewRecordingKnowledgeItem[] = [];
  const seenRecordingItemKeys = new Set<string>();
  const warnings: StageWarning[] = [];
  let shortSegmentRecordingCount = 0;

  for (const plannedQuery of recordingQueries) {
    const result = await knowledge.query({ query: plannedQuery.query, sessionId });

    if (!result.ok) {
      warnings.push({
        code: String(result.error.code),
        message: result.error.message,
        module: "canonical",
      });
      continue;
    }

    warnings.push(...(result.warnings ?? []));

    for (const item of result.value.items) {
      if (
        plannedQuery.precision === "short_segment" &&
        shortSegmentRecordingCount >= maxShortSegmentReviewRecordings
      ) {
        continue;
      }

      const itemKey = reviewRecordingKnowledgeItemKey(item);

      if (itemKey !== undefined && seenRecordingItemKeys.has(itemKey)) {
        continue;
      }

      if (itemKey !== undefined) {
        seenRecordingItemKeys.add(itemKey);
      }

      if (plannedQuery.precision === "short_segment") {
        shortSegmentRecordingCount += 1;
      }

      recordingItems.push({
        item,
        precision: plannedQuery.precision,
        order: recordingItems.length,
      });
    }

    if (reviewRecordingSearchHasEnoughFacts({
      knowledgeItems: recordingItems.map(({ item }) => item),
      provisionalHints,
    })) {
      break;
    }
  }

  const sortedRecordingItems = sortReviewRecordingItems({
    items: recordingItems,
    provisionalHints,
  });
  items.push(...sortedRecordingItems.map(({ item }) => item));

  if (sortedRecordingItems.some((entry) => entry.precision === "short_segment")) {
    warnings.push({
      code: "canonical.review_broad_title_fragment_results",
      message: "broad_title_fragment_results: Broad title-fragment MusicBrainz results are included; compare them cautiously.",
      module: "canonical",
    });
  }

  const releaseTracklistRefs = reviewReleaseTracklistRefs({
    knowledgeItems: sortedRecordingItems.map(({ item }) => item),
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

type ReviewRecordingSearchPrecision =
  | "release_strict"
  | "strict"
  | "cleaned_release"
  | "cleaned"
  | "combined_segment"
  | "short_segment";

type ReviewRecordingKnowledgeQuery = {
  query: KnowledgeQuery;
  precision: ReviewRecordingSearchPrecision;
};

type ReviewRecordingKnowledgeItem = {
  item: KnowledgeItem;
  precision: ReviewRecordingSearchPrecision;
  order: number;
};

const maxShortSegmentReviewRecordings = 3;
const maxReviewRecordingQueries = 10;

function buildReviewRecordingKnowledgeQueries({
  subject,
  outgoingRelations,
  provisionalHints,
}: {
  subject: CanonicalRecord;
  outgoingRelations: CanonicalRelation[];
  provisionalHints: ProvisionalReviewInspection["provisionalHints"];
}): ReviewRecordingKnowledgeQuery[] {
  const source = reviewSearchSource({ subject, outgoingRelations, provisionalHints });
  const queries: ReviewRecordingKnowledgeQuery[] = [];
  const seen = new Set<string>();

  if (source.releaseDate !== undefined) {
    pushReviewRecordingQuery(queries, seen, buildReviewRecordingFieldQuery({
      title: source.title,
      ...(source.artists.length === 0 ? {} : { artist: source.artists.join(" ") }),
      ...(source.release === undefined ? {} : { release: source.release }),
      date: source.releaseDate,
    }), source.release === undefined ? "strict" : "release_strict");
  }

  if (source.release !== undefined) {
    pushReviewRecordingQuery(queries, seen, buildReviewRecordingFieldQuery({
      title: source.title,
      ...(source.artists.length === 0 ? {} : { artist: source.artists.join(" ") }),
      release: source.release,
    }), "release_strict");
  }

  pushReviewRecordingQuery(queries, seen, buildReviewRecordingFieldQuery({
    title: source.title,
    ...(source.artists.length === 0 ? {} : { artist: source.artists.join(" ") }),
  }), "strict");

  for (const plannedQuery of buildReviewRecordingFallbackQueries(source)) {
    pushReviewRecordingQuery(queries, seen, plannedQuery.query, plannedQuery.precision);
  }

  return queries.slice(0, maxReviewRecordingQueries);
}

function reviewSearchSource({
  subject,
  outgoingRelations,
  provisionalHints,
}: {
  subject: CanonicalRecord;
  outgoingRelations: CanonicalRelation[];
  provisionalHints: ProvisionalReviewInspection["provisionalHints"];
}): {
  title: string;
  artists: string[];
  release?: string;
  releaseDate?: string;
} {
  const firstRecordingHint = provisionalHints.find((hint) => hint.kind === "source_recording_context");
  const title = firstRecordingHint?.facts.title ?? subject.label;
  const artists = firstRecordingHint?.facts.artistLabels ??
    outgoingRelations
      .filter((relation) => relation.predicate === "performed_by")
      .map((relation) => relation.objectLabel)
      .filter((label): label is string => label !== undefined);
  const release = firstRecordingHint?.facts.releaseLabel ??
    outgoingRelations
      .find((relation) => relation.predicate === "appears_on_release" && relation.objectLabel !== undefined)
      ?.objectLabel;

  return {
    title,
    artists: uniqueStrings(artists),
    ...(release === undefined ? {} : { release }),
    ...(firstRecordingHint?.facts.releaseDate === undefined ? {} : { releaseDate: firstRecordingHint.facts.releaseDate }),
  };
}

function buildReviewRecordingFallbackQueries(source: {
  title: string;
  artists: string[];
  release?: string;
}): ReviewRecordingKnowledgeQuery[] {
  const queries: ReviewRecordingKnowledgeQuery[] = [];
  const titleFragments = reviewSearchTitleFragments(source.title);
  const primaryArtist = source.artists[0];
  const secondaryArtist = source.artists[1];
  const cleanedTitle = titleFragments[0] ?? cleanReviewSearchTitle(source.title);
  const rightSegment = titleFragments.find((fragment) => fragment !== cleanedTitle);
  const combinedSegment = titleFragments.find((fragment) =>
    fragment !== cleanedTitle && fragment !== rightSegment
  );

  if (source.release !== undefined) {
    pushDefinedReviewQuery(queries, cleanedTitle, primaryArtist, source.release, "cleaned_release");
    pushDefinedReviewQuery(queries, cleanedTitle, secondaryArtist, source.release, "cleaned_release");
    pushDefinedReviewQuery(queries, cleanedTitle, undefined, source.release, "cleaned_release");
  }

  pushDefinedReviewQuery(queries, cleanedTitle, primaryArtist, undefined, "cleaned");
  pushDefinedReviewQuery(queries, combinedSegment, primaryArtist, source.release, "combined_segment");
  pushDefinedReviewQuery(queries, combinedSegment, undefined, source.release, "combined_segment");
  pushDefinedReviewQuery(queries, combinedSegment, primaryArtist, undefined, "combined_segment");
  pushDefinedReviewQuery(queries, rightSegment, primaryArtist, source.release, "short_segment");
  pushDefinedReviewQuery(queries, rightSegment, undefined, source.release, "short_segment");
  pushDefinedReviewQuery(queries, rightSegment, primaryArtist, undefined, "short_segment");

  return queries;
}

function pushDefinedReviewQuery(
  queries: ReviewRecordingKnowledgeQuery[],
  title: string | undefined,
  artist: string | undefined,
  release: string | undefined,
  precision: ReviewRecordingSearchPrecision,
): void {
  if (title === undefined || title.length === 0) {
    return;
  }

  queries.push({
    query: buildReviewRecordingFieldQuery({
      title,
      ...(artist === undefined ? {} : { artist }),
      ...(release === undefined ? {} : { release }),
    }),
    precision,
  });
}

function buildReviewRecordingFieldQuery({
  title,
  artist,
  release,
  date,
}: {
  title: string;
  artist?: string;
  release?: string;
  date?: string;
}): KnowledgeQuery {
  const fieldQuery = {
    title,
    ...(artist === undefined || artist.length === 0 ? {} : { artist }),
    ...(release === undefined || release.length === 0 ? {} : { release }),
    ...(date === undefined || date.length === 0 ? {} : { date }),
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

function pushReviewRecordingQuery(
  queries: ReviewRecordingKnowledgeQuery[],
  seen: Set<string>,
  query: KnowledgeQuery,
  precision: ReviewRecordingSearchPrecision,
): void {
  const key = reviewKnowledgeQueryKey(query);

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  queries.push({ query, precision });
}

function reviewKnowledgeQueryKey(query: KnowledgeQuery): string {
  if ("fieldQuery" in query) {
    return JSON.stringify({
      fieldQuery: query.fieldQuery,
      entityKinds: query.entityKinds,
      expand: query.expand,
      limit: query.limit,
    });
  }

  if ("text" in query) {
    return JSON.stringify({
      text: query.text,
      entityKinds: query.entityKinds,
      expand: query.expand,
      limit: query.limit,
    });
  }

  return JSON.stringify(query);
}

function sortReviewRecordingItems({
  items,
  provisionalHints,
}: {
  items: ReviewRecordingKnowledgeItem[];
  provisionalHints: ProvisionalReviewInspection["provisionalHints"];
}): ReviewRecordingKnowledgeItem[] {
  const qualification = qualifyReviewRecordings({
    provisionalHints,
    knowledgeItems: items.map(({ item }) => item),
  });
  const qualifiedRefKeys = new Set(qualification.qualifiedRecordingRefs.map(refKey));

  return [...items].sort((left, right) => {
    const qualificationDelta = reviewRecordingQualificationRank(left, qualifiedRefKeys) -
      reviewRecordingQualificationRank(right, qualifiedRefKeys);

    if (qualificationDelta !== 0) {
      return qualificationDelta;
    }

    const precisionDelta = reviewRecordingPrecisionRank(left.precision) -
      reviewRecordingPrecisionRank(right.precision);

    return precisionDelta === 0 ? left.order - right.order : precisionDelta;
  });
}

function reviewRecordingQualificationRank(
  item: ReviewRecordingKnowledgeItem,
  qualifiedRefKeys: Set<string>,
): number {
  return reviewIdentityRecordingRefs(item.item).some((ref) => qualifiedRefKeys.has(refKey(ref))) ? 0 : 1;
}

function reviewRecordingPrecisionRank(precision: ReviewRecordingSearchPrecision): number {
  switch (precision) {
    case "release_strict":
      return 0;
    case "strict":
      return 1;
    case "cleaned_release":
      return 2;
    case "cleaned":
      return 3;
    case "combined_segment":
      return 4;
    case "short_segment":
      return 5;
  }
}

function reviewRecordingSearchHasEnoughFacts({
  knowledgeItems,
  provisionalHints,
}: {
  knowledgeItems: KnowledgeItem[];
  provisionalHints: ProvisionalReviewInspection["provisionalHints"];
}): boolean {
  if (knowledgeItems.length === 0) {
    return false;
  }

  if (!provisionalHints.some((hint) => hint.facts.releaseLabel !== undefined)) {
    return true;
  }

  return reviewReleaseTracklistRefs({ knowledgeItems, provisionalHints }).length > 0;
}

function reviewRecordingKnowledgeItemKey(item: KnowledgeItem): string | undefined {
  const refs = reviewIdentityRecordingRefs(item).map(refKey).sort();

  if (refs.length > 0) {
    return refs.join("|");
  }

  if (item.id !== undefined) {
    return item.id;
  }

  return item.source.ref === undefined ? undefined : refKey(item.source.ref);
}

function reviewSearchTitleFragments(title: string): string[] {
  const cleaned = cleanReviewSearchTitle(title);
  const rawSegments = cleaned
    .split(/\s*(?:[:：]|[–—]|\/|／)\s*/u)
    .map(cleanReviewSearchTitle)
    .filter((segment) => segment.length > 0);
  const strippedSegments = rawSegments
    .map(stripReviewSegmentNumbering)
    .filter(isMeaningfulReviewTitleFragment);
  const fragments = [cleaned];
  const rightSegment = strippedSegments.at(-1);
  const previousSegment = strippedSegments.at(-2);

  if (rightSegment !== undefined) {
    fragments.push(rightSegment);
  } else if (rawSegments.length > 1) {
    fragments.push(stripReviewSegmentNumbering(rawSegments[rawSegments.length - 2] ?? ""));
  }

  if (previousSegment !== undefined && rightSegment !== undefined) {
    fragments.push(`${previousSegment} ${rightSegment}`);
  }

  return uniqueStrings(fragments.map(cleanReviewSearchTitle).filter(isMeaningfulReviewTitleFragment)).slice(0, 3);
}

function cleanReviewSearchTitle(title: string): string {
  return title
    .replace(/\([^)]*\b(?:feat\.?|featuring|ft\.?)\b[^)]*\)/giu, " ")
    .replace(/\[[^\]]*\b(?:feat\.?|featuring|ft\.?)\b[^\]]*\]/giu, " ")
    .replace(/\s+\b(?:feat\.?|featuring|ft\.?)\b.+$/iu, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:：\-–—/／]+|[\s,.;:：\-–—/／]+$/g, "")
    .trim();
}

function stripReviewSegmentNumbering(segment: string): string {
  return cleanReviewSearchTitle(
    segment.replace(/^\s*(?:(?:[IVXLCDM]+|\d+)\s*[.)．:：-]\s*|(?:[IVXLCDM]+|\d+)\s+)/iu, ""),
  );
}

function isMeaningfulReviewTitleFragment(fragment: string): boolean {
  const normalized = normalizeAlias(fragment);

  if (normalized.length === 0) {
    return false;
  }

  if (/^(?:no\.?\s*)?\d+$/iu.test(normalized)) {
    return false;
  }

  if (/^(?:disc|track|part|suite)$/iu.test(normalized)) {
    return false;
  }

  return hasCjkText(fragment) || normalized.length >= 3;
}

function hasCjkText(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(value);
}

function uniqueStrings(values: string[]): string[] {
  const byKey = new Map<string, string>();

  for (const value of values) {
    const normalized = normalizeAlias(value);

    if (normalized.length === 0 || byKey.has(normalized)) {
      continue;
    }

    byKey.set(normalized, value);
  }

  return [...byKey.values()];
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
