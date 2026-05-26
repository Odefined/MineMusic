import { createCanonicalMaintenance, createCanonicalStore } from "../../src/canonical/index.js";
import type {
  CanonicalRecord,
  KnowledgeItem,
  Ref,
  Result,
  StageSession,
} from "../../src/contracts/index.js";
import type {
  EventPort,
  MemoryPort,
  MusicKnowledgePort,
  SessionContextPort,
} from "../../src/ports/index.js";
import { createEventService } from "../../src/events/index.js";
import { createSessionContext } from "../../src/stage/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryEventRepository,
} from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

const reviewSession: StageSession = {
  id: "review-session",
  posture: "canonical_review",
  activeInstruments: [],
};

const sourceRef: Ref = {
  namespace: "source:netease",
  kind: "track",
  id: "track-1",
};

const mbRecordingRef: Ref = {
  namespace: "musicbrainz",
  kind: "recording",
  id: "mb-recording-1",
};

function createSessionContextFor(session: StageSession): SessionContextPort {
  const memory: MemoryPort = {
    summarizeForSession: async () => ({ ok: true, value: [] }),
    propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "memory-proposal-1" } }),
    accept: async () => ({
      ok: true,
      value: { id: "memory-1", text: "memory", kind: "contextual_preference" },
    }),
  };
  const events: EventPort = createEventService({
    repository: createInMemoryEventRepository(),
    clock: () => "2026-05-27T00:00:00.000Z",
  });

  return createSessionContext({
    sessions: [session],
    memory,
    events,
  });
}

async function listsOnlyCurrentProvisionalRecordings(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: (() => {
      const ids = ["provisional-recording", "provisional-artist"];

      return () => ids.shift() ?? "unexpected";
    })(),
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const provisionalRecording = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Review Track",
      evidence: [sourceRef],
    }),
  );

  await assertOk(
    store.recordProvisionalRelations({
      subjectRef: provisionalRecording.ref,
      sourceRef,
      relations: [
        {
          predicate: "has_duration_ms",
          objectKind: "duration_ms",
          objectValue: 123456,
        },
      ],
    }),
  );
  await assertOk(
    store.createProvisional({
      kind: "artist",
      label: "Review Artist",
    }),
  );
  await assertOk(
    repository.put({
      ref: { namespace: "minemusic", kind: "recording", id: "active-recording" },
      kind: "recording",
      label: "Active Recording",
      status: "active",
    }),
  );
  await assertOk(
    repository.put({
      ref: { namespace: "minemusic", kind: "recording", id: "merged-recording" },
      kind: "recording",
      label: "Merged Recording",
      status: "merged",
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
  });
  const listed = await assertOk(
    maintenance.reviewList({
      sessionId: reviewSession.id,
    }),
  );

  assert(listed.items.length === 1, "review list should only include current provisional recordings");
  assert(listed.items[0]?.subjectRef.id === provisionalRecording.ref.id, "review list should return the provisional recording");
  assert(listed.items[0]?.sourceRefCount === 1, "review list should include source ref count");
  assert(listed.items[0]?.relationCount === 1, "review list should include relation count");
}

async function requiresCanonicalReviewPosture(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor({
      ...reviewSession,
      posture: "recommendation",
    }),
  });
  const result = await maintenance.reviewList({ sessionId: reviewSession.id });

  assert(!result.ok, "review tools should reject non-review posture");
  assert(result.error.code === "canonical.review_invalid", "wrong posture should use canonical review error");
}

async function inspectsNeutralFactsAndExactMusicBrainzNeighbors(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: (() => {
      const ids = ["review-subject", "neighbor-artist", "neighbor-release"];

      return () => ids.shift() ?? "unexpected";
    })(),
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Review Track",
      evidence: [sourceRef],
    }),
  );
  const artist = await assertOk(
    store.createProvisional({
      kind: "artist",
      label: "Review Artist",
      evidence: [{ namespace: "source:netease", kind: "artist", id: "artist-1" }],
    }),
  );
  const release = await assertOk(
    store.createProvisional({
      kind: "release",
      label: "Review Release",
      evidence: [{ namespace: "source:netease", kind: "album", id: "album-1" }],
    }),
  );
  const exactCurrent: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "exact-current" },
    kind: "recording",
    label: "Exact Current",
    status: "active",
    sourceRefs: [mbRecordingRef],
  };
  const labelOnlyCurrent: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "label-only-current" },
    kind: "recording",
    label: "Review Track",
    status: "active",
  };
  const knowledgeItem: KnowledgeItem = {
    kind: "structured",
    providerId: "musicbrainz",
    source: {
      ref: mbRecordingRef,
      label: "MusicBrainz recording",
    },
    nodes: [
      {
        id: "recording",
        type: "recording",
        ref: mbRecordingRef,
        label: "Review Track",
      },
    ],
    relations: [],
  };
  const knowledge: MusicKnowledgePort = {
    query: async ({ query }) => ({
      ok: true,
      value: {
        items: [
          {
            ...knowledgeItem,
            metadata: { query },
          },
        ],
      },
    }),
  };

  await assertOk(repository.put(exactCurrent));
  await assertOk(repository.put(labelOnlyCurrent));
  await assertOk(
    store.recordProvisionalRelations({
      subjectRef: subject.ref,
      sourceRef,
      providerId: "netease",
      relations: [
        {
          predicate: "performed_by",
          objectKind: "artist",
          objectRef: artist.ref,
          objectLabel: artist.label,
        },
        {
          predicate: "appears_on_release",
          objectKind: "release",
          objectRef: release.ref,
          objectLabel: release.label,
        },
      ],
    }),
  );
  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      providerId: "netease",
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Review Track",
            artistLabels: ["Review Artist"],
            releaseLabel: "Review Release",
            durationMs: 123456,
            trackPosition: {
              discNumber: "1",
              trackNumber: 2,
              trackCount: 10,
            },
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    idFactory: () => "inspection-1",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );

  assert(inspection.inspectionId === "inspection-1", "inspect should return an inspection id");
  assert(inspection.subject.ref.id === subject.ref.id, "inspect should return the subject");
  assert(inspection.outgoingRelations.length === 2, "inspect should return outgoing relations");
  assert(inspection.incomingRelations.length === 0, "inspect should return incoming relations");
  assert(inspection.provisionalHints.length === 1, "inspect should return provisional hints");
  assert(
    inspection.neighborRecords.some((record) => record.ref.id === artist.ref.id) &&
      inspection.neighborRecords.some((record) => record.ref.id === release.ref.id),
    "inspect should return direct neighbor canonical records",
  );
  assert(inspection.knowledgeItems[0]?.id !== undefined, "inspect should expose citable Knowledge item ids");
  assert(
    inspection.anchors.some((anchor) => anchor.providerRef?.id === mbRecordingRef.id),
    "inspect should build provider-ref anchors for inspected MusicBrainz recordings",
  );
  assert(
    inspection.relatedCurrentRecords.length === 1 &&
      inspection.relatedCurrentRecords[0]?.ref.id === exactCurrent.ref.id,
    "related current records should come only from exact inspected MusicBrainz recording refs",
  );
  assert(!("recommendedAction" in inspection), "inspect must not return an action recommendation");
  assert(!("mergeTargetRef" in inspection), "inspect must not preselect a merge target");
}

async function inspectWithoutKnowledgeProviderReturnsLocalFactsAndWarning(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "local-only-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Local Only Track",
      evidence: [sourceRef],
    }),
  );
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );

  assert(inspection.subject.ref.id === subject.ref.id, "local inspect should still return the subject");
  assert(inspection.knowledgeItems.length === 0, "local inspect should not invent Knowledge facts");
  assert(
    inspection.warnings?.some((warning) => warning.includes("No Music Knowledge provider")),
    "local inspect should explain missing Knowledge provider as a warning",
  );
}

await listsOnlyCurrentProvisionalRecordings();
await requiresCanonicalReviewPosture();
await inspectsNeutralFactsAndExactMusicBrainzNeighbors();
await inspectWithoutKnowledgeProviderReturnsLocalFactsAndWarning();
