import { createCanonicalMaintenance, createCanonicalStore } from "../../src/material/store/canonical/index.js";
import type {
  CanonicalRecord,
  KnowledgeItem,
  KnowledgeNode,
  KnowledgeQuery,
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

function musicBrainzRecordingKnowledgeItem({
  id,
  title,
  artistCreditText,
  durationMs,
  releaseTitle,
}: {
  id: string;
  title: string;
  artistCreditText?: string;
  durationMs?: number;
  releaseTitle?: string;
}): KnowledgeItem {
  const recordingRef: Ref = {
    namespace: "musicbrainz",
    kind: "recording",
    id,
    label: title,
  };
  const releaseRef: Ref | undefined = releaseTitle === undefined
    ? undefined
    : {
        namespace: "musicbrainz",
        kind: "release",
        id: `${id}-release`,
        label: releaseTitle,
      };
  const nodes: KnowledgeNode[] = [
    {
      id: `recording:${id}`,
      type: "recording",
      ref: recordingRef,
      label: title,
      properties: {
        title,
        ...(artistCreditText === undefined ? {} : { artistCreditText }),
        ...(durationMs === undefined ? {} : { durationMs }),
      },
    },
  ];

  if (releaseRef !== undefined && releaseTitle !== undefined) {
    nodes.push({
      id: `release:${releaseRef.id}`,
      type: "release",
      ref: releaseRef,
      label: releaseTitle,
      properties: { title: releaseTitle },
    });
  }

  return {
    id: `knowledge-${id}`,
    kind: "structured",
    providerId: "musicbrainz",
    source: { ref: recordingRef },
    rootNodeId: `recording:${id}`,
    nodes,
    relations: releaseRef === undefined
      ? []
      : [
          {
            type: "release_appearance",
            endpoints: [
              { nodeId: `recording:${id}`, role: "recording" },
              { nodeId: `release:${releaseRef.id}`, role: "release" },
            ],
          },
        ],
  };
}

function createSessionContextFor(session: StageSession): SessionContextPort {
  const memory: MemoryPort = {
    summarizeForSession: async () => ({ ok: true, value: [] }),
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
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
            releaseDate: "2015-09-11",
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
  const reviewQuery = inspection.knowledgeItems[0]?.metadata?.query as {
    expand?: string[];
    fieldQuery?: { title?: string; artist?: string; release?: string; date?: string };
  } | undefined;
  assert(
    reviewQuery?.expand?.join(",") === "releases",
    "review summary inspect should request release facts without unrelated recording expansions",
  );
  assert(
    reviewQuery?.fieldQuery?.title === "Review Track" &&
      reviewQuery.fieldQuery.artist === "Review Artist" &&
      reviewQuery.fieldQuery.release === "Review Release" &&
      reviewQuery.fieldQuery.date === "2015-09-11",
    "review summary inspect should query first by source title, artist, release, and release date when date context exists",
  );
  assert(
    inspection.anchors.some((anchor) => anchor.providerRef?.id === mbRecordingRef.id),
    "inspect should build provider-ref anchors for inspected MusicBrainz recordings",
  );
  assert(
    inspection.refTokens?.some(
      (entry) =>
        entry.token.kind === "recording" &&
        entry.token.id === "mbrec-1" &&
        entry.ref.namespace === "musicbrainz" &&
        entry.ref.kind === "recording" &&
        entry.ref.id === mbRecordingRef.id,
    ),
    "inspect should store MusicBrainz recording token bindings with the inspection snapshot",
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

async function summaryInspectFallsBackToCleanedTitleSingleArtistAndRelease(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "fallback-feat-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "月 feat. ヰ世界情緒 - Guiano, ヰ世界情緒",
      evidence: [sourceRef],
    }),
  );
  const queries: KnowledgeQuery[] = [];
  const knowledge: MusicKnowledgePort = {
    query: async ({ query }) => {
      queries.push(query);

      if ("providerRef" in query) {
        return { ok: true, value: { items: [] } };
      }

      if (
        "fieldQuery" in query &&
        query.fieldQuery.title === "月" &&
        query.fieldQuery.artist === "ヰ世界情緒" &&
        query.fieldQuery.release === "花鳥風月"
      ) {
        return {
          ok: true,
          value: {
            items: [
              musicBrainzRecordingKnowledgeItem({
                id: "mb-collab-recording",
                title: "月",
                artistCreditText: "Guianoヰ世界情緒",
                durationMs: 214360,
                releaseTitle: "花鳥風月",
              }),
            ],
          },
        };
      }

      return { ok: true, value: { items: [] } };
    },
  };

  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "月 feat. ヰ世界情緒",
            artistLabels: ["Guiano", "ヰ世界情緒"],
            releaseLabel: "花鳥風月",
            releaseDate: "2021-06-30",
            durationMs: 214360,
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    idFactory: () => "fallback-feat-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const fieldQueries = queries.filter((query): query is KnowledgeQuery & { fieldQuery: NonNullable<KnowledgeQuery["fieldQuery"]> } =>
    "fieldQuery" in query
  );

  assert(
    fieldQueries[0]?.fieldQuery.title === "月 feat. ヰ世界情緒" &&
      fieldQueries[0]?.fieldQuery.artist === "Guiano ヰ世界情緒" &&
      fieldQueries[0]?.fieldQuery.release === "花鳥風月" &&
      fieldQueries[0]?.fieldQuery.date === "2021-06-30",
    "fallback inspect should start with strict source title, joined artist, release, and release date when release date context exists",
  );
  assert(
    fieldQueries[1]?.fieldQuery.title === "月 feat. ヰ世界情緒" &&
      fieldQueries[1]?.fieldQuery.artist === "Guiano ヰ世界情緒" &&
      fieldQueries[1]?.fieldQuery.release === "花鳥風月" &&
      fieldQueries[1]?.fieldQuery.date === undefined,
    "fallback inspect should retry strict source title, joined artist, and release without date after the date-scoped query",
  );
  assert(
    fieldQueries[2]?.fieldQuery.title === "月 feat. ヰ世界情緒" &&
      fieldQueries[2]?.fieldQuery.artist === "Guiano ヰ世界情緒" &&
      fieldQueries[2]?.fieldQuery.release === undefined &&
      fieldQueries[2]?.fieldQuery.date === undefined,
    "fallback inspect should retry strict source title and joined artist without release after the release-scoped query",
  );
  assert(
    fieldQueries.some((query) =>
      query.fieldQuery.title === "月" &&
        query.fieldQuery.artist === "ヰ世界情緒" &&
        query.fieldQuery.release === "花鳥風月"
    ),
    "fallback inspect should try cleaned title with individual source artists and release",
  );
  assert(
    inspection.refTokens?.some((binding) => binding.ref.id === "mb-collab-recording") === true,
    "fallback inspect should expose the MusicBrainz recording found by cleaned title fallback",
  );
}

async function summaryInspectFallsBackToStrongTitleSegments(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "fallback-segment-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Sonatas and Partitas, for Solo Violin,BWV 1004 – Partita No. 2 in D minor:Chaconne - Aaron Rosand",
      evidence: [sourceRef],
    }),
  );
  const queries: KnowledgeQuery[] = [];
  const knowledge: MusicKnowledgePort = {
    query: async ({ query }) => {
      queries.push(query);

      if ("providerRef" in query) {
        return { ok: true, value: { items: [] } };
      }

      if (
        "fieldQuery" in query &&
        query.fieldQuery.title === "Chaconne" &&
        query.fieldQuery.artist === "Aaron Rosand" &&
        query.fieldQuery.release === "Unaccompanied Violin"
      ) {
        return {
          ok: true,
          value: {
            items: [
              musicBrainzRecordingKnowledgeItem({
                id: "mb-chaconne-recording",
                title: "Partita no. 2 in D minor: V. Chaconne",
                artistCreditText: "Aaron Rosand",
                durationMs: 837613,
                releaseTitle: "Unaccompanied Violin",
              }),
            ],
          },
        };
      }

      return { ok: true, value: { items: [] } };
    },
  };

  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Sonatas and Partitas, for Solo Violin,BWV 1004 – Partita No. 2 in D minor:Chaconne",
            artistLabels: ["Aaron Rosand"],
            releaseLabel: "Unaccompanied Violin",
            durationMs: 839000,
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    idFactory: () => "fallback-segment-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const fieldQueries = queries.filter((query): query is KnowledgeQuery & { fieldQuery: NonNullable<KnowledgeQuery["fieldQuery"]> } =>
    "fieldQuery" in query
  );

  assert(
    fieldQueries.some((query) =>
      query.fieldQuery.title === "Chaconne" &&
        query.fieldQuery.artist === "Aaron Rosand" &&
        query.fieldQuery.release === "Unaccompanied Violin"
    ),
    "fallback inspect should try right-side title segments from strong separators",
  );
  assert(
    inspection.refTokens?.some((binding) => binding.ref.id === "mb-chaconne-recording") === true,
    "fallback inspect should expose the MusicBrainz recording found by title segment fallback",
  );
}

async function summaryInspectCapsBroadShortSegmentResults(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "fallback-broad-segment-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Concerto in D Minor after Marcello, BWV 974:II. Adagio - Glenn Gould",
      evidence: [sourceRef],
    }),
  );
  const queries: KnowledgeQuery[] = [];
  const broadAdagioItems = Array.from({ length: 5 }, (_, index) =>
    musicBrainzRecordingKnowledgeItem({
      id: `mb-broad-adagio-${index + 1}`,
      title: `${index + 1}. Adagio`,
      artistCreditText: "Glenn Gould",
    })
  );
  const knowledge: MusicKnowledgePort = {
    query: async ({ query }) => {
      queries.push(query);

      if ("providerRef" in query) {
        return { ok: true, value: { items: [] } };
      }

      if (
        "fieldQuery" in query &&
        query.fieldQuery.title === "Adagio" &&
        query.fieldQuery.artist === "Glenn Gould" &&
        query.fieldQuery.release === undefined
      ) {
        return {
          ok: true,
          value: { items: broadAdagioItems },
        };
      }

      return { ok: true, value: { items: [] } };
    },
  };

  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Concerto in D Minor after Marcello, BWV 974:II. Adagio",
            artistLabels: ["Glenn Gould"],
            releaseLabel: "Bach: Italian Concerto",
            durationMs: 287000,
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    idFactory: () => "fallback-broad-segment-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const fieldQueries = queries.filter((query): query is KnowledgeQuery & { fieldQuery: NonNullable<KnowledgeQuery["fieldQuery"]> } =>
    "fieldQuery" in query
  );
  const combinedIndex = fieldQueries.findIndex((query) =>
    query.fieldQuery.title === "Concerto in D Minor after Marcello, BWV 974 Adagio" &&
      query.fieldQuery.artist === "Glenn Gould"
  );
  const shortIndex = fieldQueries.findIndex((query) =>
    query.fieldQuery.title === "Adagio" &&
      query.fieldQuery.artist === "Glenn Gould" &&
      query.fieldQuery.release === undefined
  );

  assert(combinedIndex >= 0, "fallback inspect should try combined title segments");
  assert(shortIndex >= 0, "fallback inspect should eventually try broad right-side title segments");
  assert(combinedIndex < shortIndex, "combined title segment queries should run before broad short-segment queries");
  assert(
    inspection.refTokens?.filter((binding) => binding.token.kind === "recording").length === 3,
    "short-segment fallback should cap broad recording facts",
  );
  assert(
    inspection.warnings?.some((warning) => warning.startsWith("broad_title_fragment_results:")) === true,
    "short-segment fallback should warn that broad title-fragment facts are present",
  );
}

async function summaryInspectOrdersQualifiedRecordingFactsFirst(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "qualified-order-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Intro - The xx",
      evidence: [sourceRef],
    }),
  );
  const weakItem = qualificationRecordingKnowledgeItem({
    id: "mb-weak",
    title: "Intro",
    artistLabel: "The xx",
    durationMs: 127000,
    releaseTitle: "Other Release",
    releaseDate: "2009-08-14",
  });
  const qualifiedItem = qualificationRecordingKnowledgeItem({
    id: "mb-qualified",
    title: "Intro",
    artistLabel: "The xx",
    durationMs: 127000,
    releaseTitle: "xx",
    releaseDate: "2009-08-14",
  });
  const knowledge: MusicKnowledgePort = {
    query: async ({ query }) => {
      if ("providerRef" in query) {
        return { ok: true, value: { items: [] } };
      }

      return {
        ok: true,
        value: {
          items: [weakItem, qualifiedItem],
        },
      };
    },
  };

  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Intro",
            artistLabels: ["The xx"],
            releaseLabel: "xx",
            releaseDate: "2009-08-14",
            durationMs: 127000,
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    idFactory: () => "qualified-order-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const recordingTokens = inspection.refTokens?.filter((binding) => binding.token.kind === "recording") ?? [];

  assert(recordingTokens[0]?.ref.id === "mb-qualified", "qualified recording facts should sort before weaker facts");
  assert(recordingTokens[1]?.ref.id === "mb-weak", "weaker recording facts should remain after qualified facts");
}

function qualificationRecordingKnowledgeItem({
  id,
  title,
  artistLabel,
  durationMs,
  releaseTitle,
  releaseDate,
}: {
  id: string;
  title: string;
  artistLabel: string;
  durationMs: number;
  releaseTitle: string;
  releaseDate: string;
}): KnowledgeItem {
  const recordingRef: Ref = {
    namespace: "musicbrainz",
    kind: "recording",
    id,
    label: title,
  };
  const artistRef: Ref = {
    namespace: "musicbrainz",
    kind: "artist",
    id: `${id}-artist`,
    label: artistLabel,
  };
  const releaseRef: Ref = {
    namespace: "musicbrainz",
    kind: "release",
    id: `${id}-release`,
    label: releaseTitle,
  };

  return {
    id: `knowledge-${id}`,
    kind: "structured",
    providerId: "musicbrainz",
    source: { ref: recordingRef },
    rootNodeId: `recording:${id}`,
    nodes: [
      {
        id: `recording:${id}`,
        type: "recording",
        ref: recordingRef,
        label: title,
        properties: {
          title,
          durationMs,
          artistCreditText: artistLabel,
        },
      },
      {
        id: `artist:${id}-artist`,
        type: "artist",
        ref: artistRef,
        label: artistLabel,
        properties: {
          name: artistLabel,
        },
      },
      {
        id: `release:${id}-release`,
        type: "release",
        ref: releaseRef,
        label: releaseTitle,
        properties: {
          title: releaseTitle,
          date: releaseDate,
        },
      },
    ],
    relations: [
      {
        type: "artist_credit",
        endpoints: [
          { nodeId: `recording:${id}`, role: "credited_entity" },
          { nodeId: `artist:${id}-artist`, role: "artist" },
        ],
      },
      {
        type: "release_appearance",
        endpoints: [
          { nodeId: `recording:${id}`, role: "recording" },
          { nodeId: `release:${id}-release`, role: "release" },
        ],
      },
    ],
  };
}

async function summaryInspectFetchesMatchedReleaseTracklistsIntoSnapshot(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "tracklist-summary-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Snapshot Track",
      evidence: [sourceRef],
    }),
  );
  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Snapshot Track",
            artistLabels: ["Snapshot Artist"],
            releaseLabel: "Snapshot Release",
          },
        },
      ],
    }),
  );

  const releaseRef: Ref = {
    namespace: "musicbrainz",
    kind: "release",
    id: "snapshot-release-mbid",
  };
  const unmatchedReleaseRef: Ref = {
    namespace: "musicbrainz",
    kind: "release",
    id: "unmatched-release-mbid",
  };
  const otherTrackRecordingRef: Ref = {
    namespace: "musicbrainz",
    kind: "recording",
    id: "other-track-recording-mbid",
  };
  const queries: KnowledgeQuery[] = [];
  const recordingItem: KnowledgeItem = {
    id: "snapshot-recording",
    kind: "structured",
    providerId: "musicbrainz",
    source: { ref: mbRecordingRef },
    rootNodeId: "recording:mb-recording-1",
    nodes: [
      {
        id: "recording:mb-recording-1",
        type: "recording",
        ref: mbRecordingRef,
        label: "Snapshot Track",
        properties: {
          title: "Snapshot Track",
          artistCreditText: "Snapshot Artist",
        },
      },
      {
        id: "release:snapshot-release-mbid",
        type: "release",
        ref: releaseRef,
        label: "Snapshot Release",
        properties: {
          title: "Snapshot Release",
          date: "2009-01-07",
        },
      },
      {
        id: "release:unmatched-release-mbid",
        type: "release",
        ref: unmatchedReleaseRef,
        label: "Unmatched Release",
        properties: {
          title: "Unmatched Release",
          date: "2010",
        },
      },
    ],
    relations: [
      {
        type: "release_appearance",
        endpoints: [
          { nodeId: "recording:mb-recording-1", role: "recording" },
          { nodeId: "release:snapshot-release-mbid", role: "release" },
        ],
      },
      {
        type: "release_appearance",
        endpoints: [
          { nodeId: "recording:mb-recording-1", role: "recording" },
          { nodeId: "release:unmatched-release-mbid", role: "release" },
        ],
      },
    ],
  };
  const releaseTracklistItem: KnowledgeItem = {
    id: "snapshot-release-tracklist",
    kind: "structured",
    providerId: "musicbrainz",
    source: { ref: releaseRef },
    rootNodeId: "release:snapshot-release-mbid",
    nodes: [
      {
        id: "release:snapshot-release-mbid",
        type: "release",
        ref: releaseRef,
        label: "Snapshot Release",
        properties: {
          title: "Snapshot Release",
          date: "2009-01-07",
        },
      },
      {
        id: "medium:snapshot-release-mbid:1",
        type: "medium",
        properties: {
          position: 1,
          trackCount: 9,
        },
      },
      {
        id: "track:snapshot-track",
        type: "track",
        label: "Snapshot Track",
        properties: {
          position: 2,
          title: "Snapshot Track",
          lengthMs: 188933,
        },
      },
      {
        id: "recording:mb-recording-1",
        type: "recording",
        ref: mbRecordingRef,
        label: "Snapshot Track",
      },
      {
        id: "track:other-snapshot-track",
        type: "track",
        label: "Other Snapshot Track",
        properties: {
          position: 3,
          title: "Other Snapshot Track",
          lengthMs: 199000,
        },
      },
      {
        id: "recording:other-track-recording-mbid",
        type: "recording",
        ref: otherTrackRecordingRef,
        label: "Other Snapshot Track",
      },
    ],
    relations: [
      {
        type: "has_medium",
        endpoints: [
          { nodeId: "release:snapshot-release-mbid", role: "release" },
          { nodeId: "medium:snapshot-release-mbid:1", role: "medium" },
        ],
      },
      {
        type: "has_track",
        endpoints: [
          { nodeId: "medium:snapshot-release-mbid:1", role: "medium" },
          { nodeId: "track:snapshot-track", role: "track" },
        ],
      },
      {
        type: "represents_recording",
        endpoints: [
          { nodeId: "track:snapshot-track", role: "track" },
          { nodeId: "recording:mb-recording-1", role: "recording" },
        ],
      },
      {
        type: "has_track",
        endpoints: [
          { nodeId: "medium:snapshot-release-mbid:1", role: "medium" },
          { nodeId: "track:other-snapshot-track", role: "track" },
        ],
      },
      {
        type: "represents_recording",
        endpoints: [
          { nodeId: "track:other-snapshot-track", role: "track" },
          { nodeId: "recording:other-track-recording-mbid", role: "recording" },
        ],
      },
    ],
  };
  const knowledge: MusicKnowledgePort = {
    query: async ({ query }) => {
      queries.push(query);

      if ("providerRef" in query) {
        return {
          ok: true,
          value: { items: [releaseTracklistItem] },
        };
      }

      return {
        ok: true,
        value: { items: [recordingItem] },
      };
    },
  };
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    idFactory: () => "summary-tracklist-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });

  const summary = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const appearances = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
      view: "detail",
      inspectionId: summary.inspectionId,
      recordingRefToken: { kind: "recording", id: "mbrec-1" },
      include: ["releaseAppearances"],
    }),
  );
  const releaseToken = appearances.detail?.releaseAppearances?.[0]?.refToken;

  assert(releaseToken !== undefined, "release appearance detail should expose release token from summary snapshot");

  const positions = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
      view: "detail",
      inspectionId: summary.inspectionId,
      recordingRefToken: { kind: "recording", id: "mbrec-1" },
      include: ["releaseTrackPositions"],
      releaseRefTokens: [releaseToken],
    }),
  );
  const tracklistQuery = queries[1];
  const position = positions.detail?.releaseTrackPositions?.[0]?.positions[0];

  assert(queries.length === 2, "summary inspect should fetch matched release tracklist into the snapshot");
  assert(
    tracklistQuery !== undefined &&
      "providerRef" in tracklistQuery &&
      tracklistQuery.providerRef.id === releaseRef.id &&
      tracklistQuery.expand?.join(",") === "tracklist",
    "summary tracklist lookup should use providerRef and request only tracklist detail",
  );
  assert(
    position?.disc === "1" &&
      position.track === 2 &&
      position.trackCount === 9 &&
      position.trackTitle === "Snapshot Track" &&
      position.trackLengthMs === 188933,
    "track position detail should project tracklist facts gathered during summary inspect",
  );
  assert(
    summary.refTokens?.filter((binding) => binding.token.kind === "recording").length === 1 &&
      summary.refTokens[0]?.ref.id === mbRecordingRef.id,
    "summary recording tokens should come from recording lookup roots, not release tracklist recording nodes",
  );
}

async function detailInspectReusesSnapshotAndReturnsReleaseContexts(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "detail-subject",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Detail Track",
      evidence: [sourceRef],
    }),
  );
  const releaseRef: Ref = {
    namespace: "musicbrainz",
    kind: "release",
    id: "release-mbid-1",
  };
  const otherReleaseRef: Ref = {
    namespace: "musicbrainz",
    kind: "release",
    id: "release-mbid-2",
  };
  const otherRecordingRef: Ref = {
    namespace: "musicbrainz",
    kind: "recording",
    id: "other-recording",
  };
  const knowledgeItem: KnowledgeItem = {
    id: "detail-knowledge",
    kind: "structured",
    providerId: "musicbrainz",
    source: { ref: mbRecordingRef },
    rootNodeId: "recording:mb-recording-1",
    nodes: [
      {
        id: "recording:mb-recording-1",
        type: "recording",
        ref: mbRecordingRef,
        label: "Detail Track",
        properties: {
          title: "Detail Track",
          artistCreditText: "Detail Artist",
          durationMs: 123000,
        },
      },
      {
        id: "recording:other-recording",
        type: "recording",
        ref: otherRecordingRef,
        label: "Other Track",
      },
      {
        id: "release:release-mbid-1",
        type: "release",
        ref: releaseRef,
        label: "Detail Release",
        properties: {
          title: "Detail Release",
          date: "2009-01-07",
          country: "JP",
          disambiguation: "first press",
        },
      },
      {
        id: "release:release-mbid-2",
        type: "release",
        ref: otherReleaseRef,
        label: "Other Release",
        properties: {
          title: "Other Release",
          date: "2010",
        },
      },
      {
        id: "medium:release-mbid-1:1",
        type: "medium",
        properties: {
          position: 1,
          trackCount: 10,
        },
      },
      {
        id: "track:track-mbid-1",
        type: "track",
        label: "Detail Track",
        properties: {
          position: 2,
          number: "2",
          title: "Detail Track",
          lengthMs: 123000,
        },
      },
      {
        id: "track:other-track",
        type: "track",
        label: "Other Track",
        properties: {
          position: 3,
          title: "Other Track",
        },
      },
    ],
    relations: [
      {
        type: "release_appearance",
        endpoints: [
          { nodeId: "recording:mb-recording-1", role: "recording" },
          { nodeId: "release:release-mbid-1", role: "release" },
        ],
      },
      {
        type: "release_appearance",
        endpoints: [
          { nodeId: "recording:mb-recording-1", role: "recording" },
          { nodeId: "release:release-mbid-2", role: "release" },
        ],
      },
      {
        type: "has_medium",
        endpoints: [
          { nodeId: "release:release-mbid-1", role: "release" },
          { nodeId: "medium:release-mbid-1:1", role: "medium" },
        ],
      },
      {
        type: "has_track",
        endpoints: [
          { nodeId: "medium:release-mbid-1:1", role: "medium" },
          { nodeId: "track:track-mbid-1", role: "track" },
        ],
      },
      {
        type: "represents_recording",
        endpoints: [
          { nodeId: "track:track-mbid-1", role: "track" },
          { nodeId: "recording:mb-recording-1", role: "recording" },
        ],
      },
      {
        type: "has_track",
        endpoints: [
          { nodeId: "medium:release-mbid-1:1", role: "medium" },
          { nodeId: "track:other-track", role: "track" },
        ],
      },
      {
        type: "represents_recording",
        endpoints: [
          { nodeId: "track:other-track", role: "track" },
          { nodeId: "recording:other-recording", role: "recording" },
        ],
      },
    ],
  };
  const knowledge: MusicKnowledgePort = {
    query: async () => ({
      ok: true,
      value: { items: [knowledgeItem] },
    }),
  };
  let idCalls = 0;
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    idFactory: () => {
      idCalls += 1;
      return `inspection-${idCalls}`;
    },
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const summary = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const appearances = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
      view: "detail",
      inspectionId: summary.inspectionId,
      recordingRefToken: { kind: "recording", id: "mbrec-1" },
      include: ["releaseAppearances"],
    }),
  );
  const firstReleaseToken = appearances.detail?.releaseAppearances?.[0]?.refToken;
  const secondReleaseToken = appearances.detail?.releaseAppearances?.[1]?.refToken;
  assert(appearances.inspectionId === summary.inspectionId, "detail inspect should reuse the summary inspection id");
  assert(appearances.expiresAt === summary.expiresAt, "detail inspect should not refresh snapshot expiry");
  assert(idCalls === 1, "detail inspect should not create a new inspection snapshot");
  assert(
    appearances.detail?.releaseAppearances?.[0]?.title === "Detail Release" &&
      appearances.detail.releaseAppearances[0]?.date === "2009-01-07" &&
      appearances.detail.releaseAppearances[0]?.country === "JP" &&
      firstReleaseToken?.kind === "release" &&
      firstReleaseToken.id === "mbrel-1",
    "release appearance detail should return compact release facts and release tokens",
  );

  assert(firstReleaseToken !== undefined, "release appearance detail should provide a release token");

  const trackPositions = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
      view: "detail",
      inspectionId: summary.inspectionId,
      recordingRefToken: { kind: "recording", id: "mbrec-1" },
      include: ["releaseTrackPositions"],
      releaseRefTokens: [firstReleaseToken],
    }),
  );
  const position = trackPositions.detail?.releaseTrackPositions?.[0]?.positions[0];

  assert(
    trackPositions.detail?.releaseTrackPositions?.length === 1 &&
      trackPositions.detail.releaseTrackPositions[0]?.refToken.id === firstReleaseToken.id,
    "track position detail should only return requested releases",
  );
  assert(
    trackPositions.detail?.releaseTrackPositions?.[0]?.positions.length === 1 &&
      position?.disc === "1" &&
      position.track === 2 &&
      position.trackCount === 10 &&
      position.trackTitle === "Detail Track" &&
      position.trackLengthMs === 123000,
    "track position detail should only return positions for the selected recording",
  );

  assert(secondReleaseToken !== undefined, "release appearance detail should provide stable tokens for all release appearances");

  const missingTrackPosition = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
      view: "detail",
      inspectionId: summary.inspectionId,
      recordingRefToken: { kind: "recording", id: "mbrec-1" },
      include: ["releaseTrackPositions"],
      releaseRefTokens: [secondReleaseToken],
    }),
  );

  assert(
    missingTrackPosition.detail?.releaseTrackPositions?.length === 0,
    "missing track position detail should stay compact instead of returning raw tracklists",
  );
  assert(
    missingTrackPosition.detail?.warnings?.some((warning) => warning.includes("track position")) === true,
    "missing track position detail should include a compact warning",
  );
}

async function cannotConfirmRecordsEventStateAndLeavesIdentityUnchanged(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const eventRepository = createInMemoryEventRepository();
  const events = createEventService({
    repository: eventRepository,
    clock: () => "2026-05-27T00:00:00.000Z",
    idFactory: () => "cannot-confirm-event",
  });
  const store = createCanonicalStore({
    repository,
    idFactory: () => "cannot-confirm-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Cannot Confirm Track",
      evidence: [sourceRef],
    }),
  );
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    events,
    idFactory: () => "cannot-confirm-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const applied = await assertOk(
    maintenance.reviewApply({
      sessionId: reviewSession.id,
      inspectionId: inspection.inspectionId,
      subjectRef: subject.ref,
      action: "cannot_confirm",
      reason: "Inspected MusicBrainz facts are ambiguous.",
    }),
  );
  const loaded = await assertOk(store.get({ ref: subject.ref }));
  const recordedEvents = await assertOk(events.listBySession({ sessionId: reviewSession.id }));
  const reviewStates = await assertOk(repository.listReviewStates({ subjectRef: subject.ref }));

  assert(applied.appliedAction === "cannot_confirm", "cannot_confirm apply should report cannot_confirm");
  assert(loaded?.status === "provisional", "cannot_confirm should leave canonical identity state unchanged");
  assert(recordedEvents.length === 1, "cannot_confirm should record exactly one event");
  assert(recordedEvents[0]?.type === "provisional_review.cannot_confirm_identity", "cannot_confirm event type should be stable");
  assert(
    recordedEvents[0]?.target !== undefined &&
      "id" in recordedEvents[0].target &&
      recordedEvents[0].target.id === subject.ref.id,
    "cannot_confirm event should target the subject",
  );
  assert(reviewStates[0]?.outcome === "cannot_confirm", "cannot_confirm should write review state");
}

async function reviewListSuppressesCannotConfirmSubjectsAcrossSessions(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const eventRepository = createInMemoryEventRepository();
  const events = createEventService({
    repository: eventRepository,
    clock: () => "2026-05-27T00:00:00.000Z",
    idFactory: (() => {
      let next = 1;
      return () => `review-event-${next++}`;
    })(),
  });
  const store = createCanonicalStore({
    repository,
    idFactory: (() => {
      const ids = ["batch-cannot-confirm", "batch-fresh"];
      return () => ids.shift() ?? "unexpected";
    })(),
  });
  const cannotConfirm = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Cannot Confirm Track",
      evidence: [sourceRef],
    }),
  );
  const fresh = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Fresh Track",
      evidence: [{ namespace: "source:netease", kind: "track", id: "track-2" }],
    }),
  );
  const otherSession: StageSession = {
    ...reviewSession,
    id: "other-review-session",
  };
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    events,
    idFactory: () => "batch-inspection",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: cannotConfirm.ref,
    }),
  );

  await assertOk(
    maintenance.reviewApply({
      sessionId: reviewSession.id,
      inspectionId: inspection.inspectionId,
      subjectRef: cannotConfirm.ref,
      action: "cannot_confirm",
      reason: "Needs more release evidence.",
    }),
  );

  const defaultList = await assertOk(
    maintenance.reviewList({
      sessionId: reviewSession.id,
    }),
  );
  const optOutList = await assertOk(
    maintenance.reviewList({
      sessionId: reviewSession.id,
      includeCannotConfirm: true,
    }),
  );
  const optOutFirstPage = await assertOk(
    maintenance.reviewList({
      sessionId: reviewSession.id,
      limit: 1,
      includeCannotConfirm: true,
    }),
  );
  assert(optOutFirstPage.nextCursor !== undefined, "first opt-out page should return a cursor");
  const optOutSecondPage = await assertOk(
    maintenance.reviewList({
      sessionId: reviewSession.id,
      limit: 1,
      cursor: optOutFirstPage.nextCursor,
      includeCannotConfirm: true,
    }),
  );
  const otherSessionMaintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(otherSession),
    events,
  });
  const otherSessionList = await assertOk(
    otherSessionMaintenance.reviewList({
      sessionId: otherSession.id,
    }),
  );
  const loadedCannotConfirm = await assertOk(store.get({ ref: cannotConfirm.ref }));

  assert(
    defaultList.items.length === 1 && defaultList.items[0]?.subjectRef.id === fresh.ref.id,
    "default review list should suppress cannot-confirm subjects",
  );
  assert(
    optOutList.items.some((item) => item.subjectRef.id === cannotConfirm.ref.id) &&
      optOutList.items.some((item) => item.subjectRef.id === fresh.ref.id),
    "callers should be able to opt in to cannot-confirm subjects",
  );
  assert(
    optOutFirstPage.items.length === 1 &&
      optOutSecondPage.items.length === 1 &&
      new Set([...optOutFirstPage.items, ...optOutSecondPage.items].map((item) => item.subjectRef.id)).size === 2,
    "cursor pagination should remain valid when callers opt out of reviewed-subject suppression",
  );
  assert(
    !otherSessionList.items.some((item) => item.subjectRef.id === cannotConfirm.ref.id),
    "review suppression should hide cannot-confirm subjects across sessions by default",
  );
  assert(loadedCannotConfirm?.status === "provisional", "cannot-confirm subjects should remain provisional");

  await assertOk(maintenance.clearReviewState({
    subjectRef: cannotConfirm.ref,
    reason: "Source evidence changed.",
  }));

  const reopenedList = await assertOk(
    otherSessionMaintenance.reviewList({
      sessionId: otherSession.id,
    }),
  );

  assert(
    reopenedList.items.some((item) => item.subjectRef.id === cannotConfirm.ref.id),
    "clearing review state should make cannot-confirm subjects reviewable again",
  );
}

async function cannotConfirmRejectsEmptyReason(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const events = createEventService({ repository: createInMemoryEventRepository() });
  const store = createCanonicalStore({
    repository,
    idFactory: () => "invalid-cannot-confirm-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Invalid Cannot Confirm Track",
      evidence: [sourceRef],
    }),
  );
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    events,
    idFactory: () => "invalid-cannot-confirm-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const emptyReason = await maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "cannot_confirm",
    reason: " ",
  });

  assert(!emptyReason.ok, "cannot_confirm should reject empty reason");
  assert(emptyReason.error.code === "canonical.review_invalid", "empty cannot_confirm reason should use review error");
}

async function applyRejectsStaleAndExpiredInspections(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const events = createEventService({ repository: createInMemoryEventRepository() });
  const store = createCanonicalStore({
    repository,
    idFactory: () => "stale-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Stale Track",
      evidence: [sourceRef],
    }),
  );
  const ids = ["inspection-old", "inspection-new"];
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    events,
    idFactory: () => ids.shift() ?? "unexpected",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const oldInspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const stale = await maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: oldInspection.inspectionId,
    subjectRef: subject.ref,
    action: "cannot_confirm",
    reason: "Use old inspection.",
  });

  assert(!stale.ok, "apply should reject stale inspection ids");
  assert(stale.error.message.includes("stale"), "stale inspection should explain the failure");

  const expiryRepository = createInMemoryCanonicalRecordRepository();
  const expiryStore = createCanonicalStore({
    repository: expiryRepository,
    idFactory: () => "expired-subject",
  });
  const expiredSubject = await assertOk(
    expiryStore.createProvisional({
      kind: "recording",
      label: "Expired Track",
      evidence: [sourceRef],
    }),
  );
  const times = ["2026-05-27T00:00:00.000Z", "2026-05-27T00:00:02.000Z"];
  const expiringMaintenance = createCanonicalMaintenance({
    repository: expiryRepository,
    sessionContext: createSessionContextFor(reviewSession),
    events,
    idFactory: () => "expired-inspection",
    clock: () => times.shift() ?? "2026-05-27T00:00:02.000Z",
    inspectionTtlMs: 1,
  });
  const expiredInspection = await assertOk(
    expiringMaintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: expiredSubject.ref,
    }),
  );
  const expired = await expiringMaintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: expiredInspection.inspectionId,
    subjectRef: expiredSubject.ref,
    action: "cannot_confirm",
    reason: "Expired inspection.",
  });

  assert(!expired.ok, "apply should reject expired inspections");
  assert(expired.error.message.includes("expired"), "expired inspection should explain the failure");
}

async function updateGateRejectsUnsupportedOrUngroundedDecisions(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const eventRepository = createInMemoryEventRepository();
  const events = createEventService({
    repository: eventRepository,
    idFactory: () => "activate-event",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const store = createCanonicalStore({
    repository,
    idFactory: () => "update-gate-subject",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Source Label - Update Artist",
      evidence: [sourceRef],
    }),
  );
  await assertOk(
    store.recordProvisionalRelations({
      subjectRef: subject.ref,
      sourceRef,
      relations: [
        {
          predicate: "has_duration_ms",
          objectKind: "duration_ms",
          objectValue: 1000,
        },
      ],
    }),
  );
  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Source Title",
            artistLabels: ["Update Artist"],
            releaseLabel: "Update Release",
            durationMs: 1000,
            trackPosition: {
              trackNumber: 1,
            },
          },
        },
      ],
    }),
  );
  let knowledgeQueries = 0;
  const knowledge: MusicKnowledgePort = {
    query: async () => {
      knowledgeQueries += 1;

      return {
        ok: true,
        value: {
          items: [
            {
              id: "knowledge-recording",
              kind: "structured",
              providerId: "musicbrainz",
              source: { ref: mbRecordingRef },
              nodes: [
                {
                  id: "recording",
                  type: "recording",
                  ref: mbRecordingRef,
                  label: "Update Gate Track",
                  properties: {
                    title: "Update Gate Track",
                    durationMs: 1000,
                    artistCreditText: "Update Artist",
                    isrcs: ["USFIXTURE1"],
                    disambiguation: "album version",
                    aliases: ["Update Gate Alias"],
                  },
                },
              ],
              relations: [],
            },
          ],
        },
      };
    },
  };
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    events,
    idFactory: () => "update-gate-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const knowledgeQueriesAfterInspect = knowledgeQueries;

  const unsupported = await maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "merge",
    reason: "Agent must not choose merge.",
  } as never);
  const wrongKind = await maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "update",
    selectedProviderRefToken: { kind: "release", id: "mbrel-1" },
    reason: "Wrong provider ref kind.",
  });
  const absentRef = await maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "update",
    selectedProviderRefToken: { kind: "recording", id: "missing-token" },
    reason: "Absent provider ref.",
  });
  const emptyReason = await maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "update",
    selectedProviderRefToken: { kind: "recording", id: "mbrec-1" },
    reason: " ",
  });
  const activated = await assertOk(maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "update",
    selectedProviderRefToken: { kind: "recording", id: "mbrec-1" },
    reason: "Duration and release appearance support this MusicBrainz recording.",
  }));
  const loaded = await assertOk(store.get({ ref: subject.ref }));
  const providerMatches = repository.findCurrentByProviderIdentity === undefined
    ? []
    : await assertOk(repository.findCurrentByProviderIdentity({
        providerId: "musicbrainz",
        entityKind: "recording",
        providerEntityId: mbRecordingRef.id,
      }));
  const remainingRelations = await assertOk(store.listRelations({ subjectRef: subject.ref }));
  const remainingHints = await assertOk(store.listProvisionalHints({ subjectRef: subject.ref }));
  const recordedEvents = await assertOk(events.listBySession({ sessionId: reviewSession.id }));

  assert(!unsupported.ok, "unsupported action strings should fail");
  assert(unsupported.error.message.includes("Unsupported"), "unsupported action should be explicit");
  assert(!wrongKind.ok, "update should reject non-recording review tokens");
  assert(!absentRef.ok, "update should reject tokens absent from inspection");
  assert(!emptyReason.ok, "update should reject empty reason");
  assert(activated.appliedAction === "activate", "valid update should activate when no current record has the MB ref");
  assert(activated.selectedProviderRefToken.id === "mbrec-1", "update output should preserve the selected token");
  assert(loaded?.status === "active", "activation should make the subject active");
  assert(loaded?.label === "Update Gate Track", "activation should use the MusicBrainz recording title as label");
  assert(
    loaded?.sourceRefs?.some((ref) => ref.namespace === "musicbrainz") !== true,
    "activation should not store the MusicBrainz recording ref in sourceRefs",
  );
  assert(providerMatches.length === 1 && providerMatches[0]?.ref.id === subject.ref.id, "activation should write provider identity");
  assert(loaded?.facts?.artistCreditText === "Update Artist", "activation should store MusicBrainz artist credit fact");
  assert(loaded?.facts?.durationMs === 1000, "activation should store MusicBrainz duration fact");
  assert((loaded?.facts?.isrcs as string[] | undefined)?.[0] === "USFIXTURE1", "activation should store MusicBrainz ISRC facts");
  assert(loaded?.facts?.disambiguation === "album version", "activation should store MusicBrainz disambiguation fact");
  assert(loaded?.aliases?.[0] === "Update Gate Alias", "MusicBrainz aliases should be ordered before source aliases");
  assert(loaded?.aliases?.includes("Source Label - Update Artist") === true, "activation should keep old source label as alias");
  assert(loaded?.aliases?.includes("Source Title") === true, "activation should keep source title as alias");
  assert(remainingRelations.length === 1, "activation should keep source-derived provisional relations");
  assert(remainingRelations[0]?.status === "provisional", "activation should not rewrite provisional relation status");
  assert(remainingHints.length === 1, "activation should keep provisional hints as review context");
  assert(recordedEvents.some((event) => event.type === "canonical.activated"), "activation should record an update audit event");
  assert(
    recordedEvents.some((event) =>
      event.type === "canonical.activated" &&
        (event.payload as { decisionOrigin?: string } | undefined)?.decisionOrigin === "agent"
    ),
    "manual update audit event should record agent decision origin",
  );
  assert(
    knowledgeQueries === knowledgeQueriesAfterInspect,
    "apply should use the stored inspection snapshot without fetching new Knowledge facts",
  );
}

async function autoUpdateSingleSubjectActivatesWhenOneRecordingQualifies(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const eventRepository = createInMemoryEventRepository();
  const events = createEventService({
    repository: eventRepository,
    idFactory: () => "auto-activate-event",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const store = createCanonicalStore({
    repository,
    idFactory: () => "auto-update-subject",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Auto Source Label",
      evidence: [sourceRef],
    }),
  );
  const selectedRef: Ref = {
    namespace: "musicbrainz",
    kind: "recording",
    id: "mb-auto-recording",
    label: "Auto Track",
  };
  const knowledge: MusicKnowledgePort = {
    query: async ({ query }) => {
      if ("providerRef" in query) {
        return { ok: true, value: { items: [] } };
      }

      return {
        ok: true,
        value: {
          items: [
            qualificationRecordingKnowledgeItem({
              id: selectedRef.id,
              title: "Auto Track",
              artistLabel: "Auto Artist",
              durationMs: 100000,
              releaseTitle: "Auto Release",
              releaseDate: "2020-01-02",
            }),
          ],
        },
      };
    },
  };

  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Auto Track",
            artistLabels: ["Auto Artist"],
            releaseLabel: "Auto Release",
            releaseDate: "2020-01-02",
            durationMs: 100000,
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    events,
    idFactory: () => "auto-update-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const output = await assertOk(
    maintenance.reviewAutoUpdate({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const loaded = await assertOk(store.get({ ref: subject.ref }));
  const providerMatches = repository.findCurrentByProviderIdentity === undefined
    ? []
    : await assertOk(repository.findCurrentByProviderIdentity({
        providerId: "musicbrainz",
        entityKind: "recording",
        providerEntityId: selectedRef.id,
      }));
  const recordedEvents = await assertOk(events.listBySession({ sessionId: reviewSession.id }));

  assert(output.mode === "single", "single-subject auto update should return single mode");
  assert(output.item.outcome === "updated", "qualified single-subject auto update should update");
  assert(output.item.outcome === "updated" && output.item.effect === "activated", "auto update should activate without an existing target");
  assert(!("inspectionId" in output), "auto update output should not expose inspection id");
  assert(!("inspectionId" in output.item), "auto update item should not expose inspection id");
  assert(loaded?.status === "active", "auto update should activate the subject");
  assert(loaded?.label === "Auto Track", "auto update should write the selected MusicBrainz title");
  assert(providerMatches.length === 1 && providerMatches[0]?.ref.id === subject.ref.id, "auto update should write provider identity");
  assert(
    recordedEvents.some((event) =>
      event.type === "canonical.activated" &&
        (event.payload as { decisionOrigin?: string } | undefined)?.decisionOrigin === "automatic"
    ),
    "auto update audit event should record automatic decision origin",
  );
}

async function autoUpdateSingleSubjectMergesWhenOneCurrentRecordHasSelectedIdentity(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "auto-merge-subject",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Auto Merge Source",
      evidence: [sourceRef],
    }),
  );
  const selectedRef: Ref = {
    namespace: "musicbrainz",
    kind: "recording",
    id: "mb-auto-merge-recording",
    label: "Auto Merge Track",
  };
  const target: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "auto-merge-target" },
    kind: "recording",
    label: "Old Auto Merge Target",
    status: "active",
  };

  assert(repository.commitChanges !== undefined, "in-memory repository should support canonical changesets");
  await assertOk(
    repository.commitChanges({
      putRecords: [target],
      putProviderIdentities: [
        {
          canonicalRef: target.ref,
          providerId: selectedRef.namespace,
          entityKind: selectedRef.kind,
          providerEntityId: selectedRef.id,
        },
      ],
    }),
  );
  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Auto Merge Track",
            artistLabels: ["Auto Merge Artist"],
            releaseLabel: "Auto Merge Release",
            releaseDate: "2020-01-02",
            durationMs: 100000,
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge: {
      query: async ({ query }) => {
        if ("providerRef" in query) {
          return { ok: true, value: { items: [] } };
        }

        return {
          ok: true,
          value: {
            items: [
              qualificationRecordingKnowledgeItem({
                id: selectedRef.id,
                title: "Auto Merge Track",
                artistLabel: "Auto Merge Artist",
                durationMs: 100000,
                releaseTitle: "Auto Merge Release",
                releaseDate: "2020-01-02",
              }),
            ],
          },
        };
      },
    },
    idFactory: () => "auto-merge-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const output = await assertOk(
    maintenance.reviewAutoUpdate({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const providerMatches = repository.findCurrentByProviderIdentity === undefined
    ? []
    : await assertOk(repository.findCurrentByProviderIdentity({
        providerId: selectedRef.namespace,
        entityKind: selectedRef.kind,
        providerEntityId: selectedRef.id,
      }));

  assert(output.mode === "single", "single auto update should return single mode for merge");
  assert(output.item.outcome === "updated" && output.item.effect === "merged", "auto update should merge into existing provider identity owner");
  assert(providerMatches.length === 1 && providerMatches[0]?.ref.id === target.ref.id, "auto merge should keep provider identity on target");
}

async function autoUpdateSingleSubjectReturnsErrorWhenProviderIdentityInvariantFails(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "auto-invariant-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Auto Invariant Source",
      evidence: [sourceRef],
    }),
  );
  const firstCurrent: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "auto-first-current" },
    kind: "recording",
    label: "Auto First Current",
    status: "active",
  };
  const secondCurrent: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "auto-second-current" },
    kind: "recording",
    label: "Auto Second Current",
    status: "provisional",
  };

  await assertOk(repository.put(firstCurrent));
  await assertOk(repository.put(secondCurrent));
  repository.findCurrentByProviderIdentity = async () => ({
    ok: true,
    value: [firstCurrent, secondCurrent],
  });
  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Auto Invariant Track",
            artistLabels: ["Auto Invariant Artist"],
            releaseLabel: "Auto Invariant Release",
            releaseDate: "2020-01-02",
            durationMs: 100000,
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge: {
      query: async ({ query }) => {
        if ("providerRef" in query) {
          return { ok: true, value: { items: [] } };
        }

        return {
          ok: true,
          value: {
            items: [
              qualificationRecordingKnowledgeItem({
                id: "mb-auto-invariant-recording",
                title: "Auto Invariant Track",
                artistLabel: "Auto Invariant Artist",
                durationMs: 100000,
                releaseTitle: "Auto Invariant Release",
                releaseDate: "2020-01-02",
              }),
            ],
          },
        };
      },
    },
    idFactory: () => "auto-invariant-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const output = await assertOk(
    maintenance.reviewAutoUpdate({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );

  assert(output.mode === "single", "invariant auto update should still return single mode");
  assert(output.item.outcome === "error", "invariant failure should return an error item");
  assert(output.item.outcome === "error" && output.item.errorCode === "canonical.invariant_failed", "invariant failure should preserve error code");
}

async function autoUpdateNotQualifiedDoesNotWriteReviewStateOrEvent(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const eventRepository = createInMemoryEventRepository();
  const events = createEventService({
    repository: eventRepository,
    idFactory: () => "auto-not-qualified-event",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const store = createCanonicalStore({
    repository,
    idFactory: () => "auto-not-qualified-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Auto Not Qualified Source",
      evidence: [sourceRef],
    }),
  );

  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Auto Not Qualified Track",
            artistLabels: ["Auto Not Qualified Artist"],
            releaseLabel: "Auto Not Qualified Release",
            releaseDate: "2020-01-02",
            durationMs: 100000,
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge: {
      query: async () => ({ ok: true, value: { items: [] } }),
    },
    events,
    idFactory: () => "auto-not-qualified-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const output = await assertOk(
    maintenance.reviewAutoUpdate({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const states = await assertOk(repository.listReviewStates({ subjectRef: subject.ref }));
  const recordedEvents = await assertOk(events.listBySession({ sessionId: reviewSession.id }));

  assert(output.mode === "single", "not-qualified auto update should return single mode");
  assert(output.item.outcome === "not_qualified", "missing qualified facts should not update");
  assert(output.item.outcome === "not_qualified" && output.item.reasonCodes.includes("no_musicbrainz_recording_facts"), "not-qualified should explain missing MB facts");
  assert(states.length === 0, "not-qualified auto update should not write review state");
  assert(recordedEvents.length === 0, "not-qualified auto update should not record events");
}

async function autoUpdateRespectsCannotConfirmReviewStateByDefault(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "auto-hidden-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Auto Hidden Source",
      evidence: [sourceRef],
    }),
  );
  let knowledgeQueries = 0;

  await assertOk(repository.putReviewState({
    state: {
      subjectRef: subject.ref,
      outcome: "cannot_confirm",
      reason: "Cannot confirm from inspect.",
      lastSessionId: reviewSession.id,
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
    },
  }));

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge: {
      query: async () => {
        knowledgeQueries += 1;
        return { ok: true, value: { items: [] } };
      },
    },
  });
  const output = await assertOk(
    maintenance.reviewAutoUpdate({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );

  assert(output.mode === "single", "hidden cannot-confirm auto update should return single mode");
  assert(output.item.outcome === "not_qualified", "hidden cannot-confirm subject should not auto-update by default");
  assert(
    output.item.outcome === "not_qualified" && output.item.reasonCodes.includes("cannot_confirm_hidden"),
    "hidden cannot-confirm subject should return cannot_confirm_hidden",
  );
  assert(knowledgeQueries === 0, "hidden cannot-confirm subject should not fetch Knowledge by default");
}

async function autoUpdateReturnsErrorItemForNonProvisionalSubject(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const activeRef: Ref = {
    namespace: "minemusic",
    kind: "recording",
    id: "auto-active-subject",
  };
  await assertOk(repository.put({
    ref: activeRef,
    kind: "recording",
    label: "Already Active",
    status: "active",
  }));

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge: {
      query: async () => ({ ok: true, value: { items: [] } }),
    },
  });
  const output = await assertOk(
    maintenance.reviewAutoUpdate({
      sessionId: reviewSession.id,
      subjectRef: activeRef,
    }),
  );

  assert(output.mode === "single", "non-provisional auto update should return single mode");
  assert(output.item.outcome === "error", "non-provisional auto update should return an error item");
  assert(output.item.outcome === "error" && output.item.errorCode === "canonical.review_invalid", "non-provisional error item should preserve review error code");
}

async function autoUpdateBatchUsesDefaultLimitAndRunProgress(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: (() => {
      let nextId = 1;
      return () => `auto-batch-subject-${nextId++}`;
    })(),
  });

  for (let index = 1; index <= 12; index += 1) {
    const source: Ref = {
      namespace: "source:netease",
      kind: "track",
      id: `auto-batch-track-${index}`,
    };
    const subject = await assertOk(
      store.createProvisional({
        kind: "recording",
        label: `Auto Batch Source ${index}`,
        evidence: [source],
      }),
    );

    await assertOk(
      store.recordProvisionalHints({
        subjectRef: subject.ref,
        sourceRef: source,
        hints: [
          {
            kind: "source_recording_context",
            facts: {
              title: "Auto Batch Track",
              artistLabels: ["Auto Batch Artist"],
              releaseLabel: "Auto Batch Release",
              releaseDate: "2020-01-02",
              durationMs: 100000,
            },
          },
        ],
      }),
    );
  }

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge: {
      query: async ({ query }) => {
        if ("providerRef" in query) {
          return { ok: true, value: { items: [] } };
        }

        return {
          ok: true,
          value: {
            items: [
              qualificationRecordingKnowledgeItem({
                id: "mb-auto-batch-recording",
                title: "Auto Batch Track",
                artistLabel: "Auto Batch Artist",
                durationMs: 100000,
                releaseTitle: "Auto Batch Release",
                releaseDate: "2020-01-02",
              }),
            ],
          },
        };
      },
    },
    idFactory: (() => {
      let nextId = 1;
      return () => `auto-batch-inspection-${nextId++}`;
    })(),
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const first = await assertOk(maintenance.reviewAutoUpdate({ sessionId: reviewSession.id }));

  assert(first.mode === "batch", "batch auto update should return batch mode");
  assert(first.limitUsed === 10, "batch auto update should default limit to 10");
  assert(first.updatedCount === 10, "first batch call should update up to the default limit");
  assert(first.items.length === 0, "batch auto update should omit updated rows by default");
  assert(first.hasMore === true, "first batch call should report remaining unprocessed subjects");

  const second = await assertOk(maintenance.reviewAutoUpdate({ sessionId: reviewSession.id, runId: first.runId }));

  assert(second.mode === "batch", "batch continuation should return batch mode");
  assert(second.runId === first.runId, "batch continuation should keep the same run id");
  assert(second.updatedCount === 2, "batch continuation should skip previously processed subjects");
  assert(second.items.length === 0, "batch continuation should still omit updated rows by default");
  assert(second.hasMore === false, "batch continuation should report no remaining subjects after processing all current items");

  const capped = await assertOk(maintenance.reviewAutoUpdate({ sessionId: reviewSession.id, limit: 999 }));

  assert(capped.mode === "batch", "new capped batch call should return batch mode");
  assert(capped.limitUsed === 50, "batch limit should cap at 50");
}

async function autoUpdateBatchReturnsRunNotFoundForUnknownOrExpiredRun(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const times = [
    "2026-05-27T00:00:00.000Z",
    "2026-05-27T00:21:00.000Z",
  ];
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    clock: () => times.shift() ?? "2026-05-27T00:21:00.000Z",
  });
  const created = await assertOk(maintenance.reviewAutoUpdate({ sessionId: reviewSession.id }));
  const expired = await assertOk(maintenance.reviewAutoUpdate({ sessionId: reviewSession.id, runId: created.mode === "batch" ? created.runId : "missing" }));
  const unknown = await assertOk(maintenance.reviewAutoUpdate({ sessionId: reviewSession.id, runId: "missing-run" }));

  assert(created.mode === "batch", "empty batch should still create a batch run");
  assert(expired.mode === "batch" && expired.items[0]?.outcome === "error", "expired run should return an error item");
  assert(
    expired.mode === "batch" && expired.items[0]?.outcome === "error" && expired.items[0].errorCode === "run_not_found",
    "expired run should use run_not_found",
  );
  assert(
    unknown.mode === "batch" && unknown.items[0]?.outcome === "error" && unknown.items[0].errorCode === "run_not_found",
    "unknown run should use run_not_found",
  );
}

async function autoUpdateBatchContinuesAfterPerItemErrors(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: (() => {
      let nextId = 1;
      return () => `auto-error-batch-subject-${nextId++}`;
    })(),
  });

  for (let index = 1; index <= 2; index += 1) {
    const source: Ref = {
      namespace: "source:netease",
      kind: "track",
      id: `auto-error-batch-track-${index}`,
    };
    const subject = await assertOk(
      store.createProvisional({
        kind: "recording",
        label: `Auto Error Batch Source ${index}`,
        evidence: [source],
      }),
    );

    await assertOk(
      store.recordProvisionalHints({
        subjectRef: subject.ref,
        sourceRef: source,
        hints: [
          {
            kind: "source_recording_context",
            facts: {
              title: "Auto Error Batch Track",
              artistLabels: ["Auto Error Batch Artist"],
              releaseLabel: "Auto Error Batch Release",
              releaseDate: "2020-01-02",
              durationMs: 100000,
            },
          },
        ],
      }),
    );
  }

  const firstCurrent: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "auto-error-first-current" },
    kind: "recording",
    label: "Auto Error First Current",
    status: "active",
  };
  const secondCurrent: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "auto-error-second-current" },
    kind: "recording",
    label: "Auto Error Second Current",
    status: "provisional",
  };
  let providerIdentityLookupCount = 0;

  await assertOk(repository.put(firstCurrent));
  await assertOk(repository.put(secondCurrent));
  repository.findCurrentByProviderIdentity = async () => {
    providerIdentityLookupCount += 1;

    return {
      ok: true,
      value: providerIdentityLookupCount === 1 ? [firstCurrent, secondCurrent] : [],
    };
  };

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge: {
      query: async ({ query }) => {
        if ("providerRef" in query) {
          return { ok: true, value: { items: [] } };
        }

        return {
          ok: true,
          value: {
            items: [
              qualificationRecordingKnowledgeItem({
                id: "mb-auto-error-batch-recording",
                title: "Auto Error Batch Track",
                artistLabel: "Auto Error Batch Artist",
                durationMs: 100000,
                releaseTitle: "Auto Error Batch Release",
                releaseDate: "2020-01-02",
              }),
            ],
          },
        };
      },
    },
    idFactory: (() => {
      let nextId = 1;
      return () => `auto-error-batch-inspection-${nextId++}`;
    })(),
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const output = await assertOk(maintenance.reviewAutoUpdate({ sessionId: reviewSession.id, limit: 2 }));

  assert(output.mode === "batch", "per-item error batch should return batch mode");
  assert(output.errorCount === 1, "one invariant failure should count as one error");
  assert(output.updatedCount === 1, "batch should continue after a per-item error");
  assert(output.items.length === 1 && output.items[0]?.outcome === "error", "batch should return the error item");
}

async function autoUpdateBatchSkipsCannotConfirmSubjectsUnlessIncluded(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: (() => {
      const ids = ["auto-hidden-batch-subject", "auto-visible-batch-subject"];
      return () => ids.shift() ?? "unexpected-auto-batch-subject";
    })(),
  });
  const hidden = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Auto Hidden Batch Source",
      evidence: [{ namespace: "source:netease", kind: "track", id: "auto-hidden-batch-track" }],
    }),
  );
  const visible = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Auto Visible Batch Source",
      evidence: [{ namespace: "source:netease", kind: "track", id: "auto-visible-batch-track" }],
    }),
  );
  for (const subject of [hidden, visible]) {
    await assertOk(
      store.recordProvisionalHints({
        subjectRef: subject.ref,
        sourceRef: subject.sourceRefs?.[0] ?? sourceRef,
        hints: [
          {
            kind: "source_recording_context",
            facts: {
              title: subject.label,
              artistLabels: ["Auto Batch Artist"],
              releaseLabel: "Auto Batch Release",
              releaseDate: "2020-01-02",
              durationMs: 100000,
            },
          },
        ],
      }),
    );
  }
  await assertOk(repository.putReviewState({
    state: {
      subjectRef: hidden.ref,
      outcome: "cannot_confirm",
      reason: "Cannot confirm from inspect.",
      lastSessionId: reviewSession.id,
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
    },
  }));

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge: {
      query: async () => ({ ok: true, value: { items: [] } }),
    },
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const defaultOutput = await assertOk(maintenance.reviewAutoUpdate({ sessionId: reviewSession.id, limit: 10 }));
  const includeOutput = await assertOk(maintenance.reviewAutoUpdate({
    sessionId: reviewSession.id,
    limit: 10,
    includeCannotConfirm: true,
  }));

  assert(defaultOutput.mode === "batch", "default hidden batch should return batch mode");
  assert(defaultOutput.notQualifiedCount === 1, "default batch should process only the visible not-qualified subject");
  assert(includeOutput.mode === "batch", "include hidden batch should return batch mode");
  assert(includeOutput.notQualifiedCount === 2, "includeCannotConfirm batch should include hidden cannot-confirm subjects");
}

async function updateMergesWhenExactlyOneCurrentRecordHasSelectedMusicBrainzRef(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const eventRepository = createInMemoryEventRepository();
  const events = createEventService({
    repository: eventRepository,
    idFactory: () => "merge-event",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const store = createCanonicalStore({
    repository,
    idFactory: () => "merge-subject",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Merge Source Label",
      evidence: [sourceRef],
    }),
  );
  const targetSourceRef: Ref = {
    namespace: "source:netease",
    kind: "track",
    id: "target-track",
  };
  const target: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "merge-target" },
    kind: "recording",
    label: "Old Merge Target",
    status: "active",
    sourceRefs: [targetSourceRef],
  };
  const knowledge: MusicKnowledgePort = {
    query: async () => ({
      ok: true,
      value: {
        items: [
          {
            id: "merge-knowledge",
            kind: "structured",
            providerId: "musicbrainz",
            source: { ref: mbRecordingRef, label: "Merge Target" },
            nodes: [
              {
                id: "recording",
                type: "recording",
                ref: mbRecordingRef,
                label: "Merge Target",
                properties: {
                  title: "Merge Target",
                  durationMs: 1000,
                  artistCreditText: "Merge Artist",
                  aliases: ["Merge Alias"],
                },
              },
            ],
            relations: [],
          },
        ],
      },
    }),
  };

  assert(repository.commitChanges !== undefined, "in-memory repository should support canonical changesets");
  await assertOk(
    repository.commitChanges({
      putRecords: [target],
      putProviderIdentities: [
        {
          canonicalRef: target.ref,
          providerId: "musicbrainz",
          entityKind: "recording",
          providerEntityId: mbRecordingRef.id,
        },
      ],
    }),
  );
  await assertOk(
    store.recordProvisionalRelations({
      subjectRef: subject.ref,
      sourceRef,
      relations: [
        {
          predicate: "has_duration_ms",
          objectKind: "duration_ms",
          objectValue: 1000,
        },
      ],
    }),
  );
  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Merge Track",
            releaseLabel: "Merge Release",
            durationMs: 1000,
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    events,
    idFactory: () => "merge-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const applied = await assertOk(
    maintenance.reviewApply({
      sessionId: reviewSession.id,
      inspectionId: inspection.inspectionId,
      subjectRef: subject.ref,
      action: "update",
      selectedProviderRefToken: { kind: "recording", id: "mbrec-1" },
      reason: "Shared exact MB recording ref on the current target means merge.",
    }),
  );
  const resolvedSource = await assertOk(store.resolveSourceRef({ ref: sourceRef }));
  const redirectedSubject = await assertOk(store.get({ ref: subject.ref }));
  const rawRecords = await assertOk(repository.list());
  const rawSubject = rawRecords.find((record) => record.ref.id === subject.ref.id);
  const rawTarget = rawRecords.find((record) => record.ref.id === target.ref.id);
  const targetRelations = await assertOk(store.listRelations({ subjectRef: target.ref }));
  const subjectRelations = await assertOk(store.listRelations({ subjectRef: subject.ref }));
  const recordedEvents = await assertOk(events.listBySession({ sessionId: reviewSession.id }));

  assert(applied.appliedAction === "merge", "update should merge when exactly one current target has the MB ref");
  assert(applied.selectedProviderRefToken.id === "mbrec-1", "merge output should preserve the selected token");
  assert(resolvedSource?.ref.id === target.ref.id, "moved source refs should resolve to the surviving target");
  assert(redirectedSubject?.ref.id === target.ref.id, "ordinary get should follow merged subject redirects");
  assert(rawSubject?.status === "merged", "raw subject should be historical after merge");
  assert(rawSubject?.mergedIntoRef?.id === target.ref.id, "raw subject should persist redirect target");
  assert(rawTarget?.sourceRefs?.some((ref) => ref.id === sourceRef.id), "target should receive subject source refs");
  assert(rawTarget?.sourceRefs?.some((ref) => ref.id === targetSourceRef.id), "target should keep existing source refs");
  assert(rawTarget?.sourceRefs?.some((ref) => ref.namespace === "musicbrainz") !== true, "merge should not store MusicBrainz ref in sourceRefs");
  assert(rawTarget?.label === "Merge Target", "merge should rewrite target label from MusicBrainz title");
  assert(rawTarget?.facts?.artistCreditText === "Merge Artist", "merge should rewrite target facts from MusicBrainz facts");
  assert(rawTarget?.aliases?.[0] === "Merge Alias", "merge should place MusicBrainz aliases before source aliases");
  assert(targetRelations.length === 0, "source-derived subject relations should not be copied to target");
  assert(subjectRelations.length === 1, "source-derived subject relations should stay on the merged subject");
  assert(subjectRelations[0]?.status === "provisional", "merge should not rewrite provisional relation status");
  assert(recordedEvents.some((event) => event.type === "canonical.merged"), "merge should record a canonical.merged event");
}

async function updateReturnsWarningWhenAuditEventFailsAfterCommit(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "audit-warning-subject",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Audit Warning Track",
      evidence: [sourceRef],
    }),
  );
  const knowledge: MusicKnowledgePort = {
    query: async () => ({
      ok: true,
      value: {
        items: [
          {
            kind: "structured",
            providerId: "musicbrainz",
            source: { ref: mbRecordingRef },
            nodes: [
              {
                id: "recording",
                type: "recording",
                ref: mbRecordingRef,
                properties: {
                  title: "Audit Warning Track",
                },
              },
            ],
            relations: [],
          },
        ],
      },
    }),
  };
  const events: EventPort = {
    record: async () => ({
      ok: false,
      error: {
        code: "event.record_failed",
        message: "Audit sink is unavailable.",
        module: "events",
        retryable: true,
      },
    }),
    listBySession: async () => ({ ok: true, value: [] }),
  };
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    events,
    idFactory: () => "audit-warning-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const applied = await assertOk(
    maintenance.reviewApply({
      sessionId: reviewSession.id,
      inspectionId: inspection.inspectionId,
      subjectRef: subject.ref,
      action: "update",
      selectedProviderRefToken: { kind: "recording", id: "mbrec-1" },
      reason: "Facts align despite audit warning.",
    }),
  );
  const loaded = await assertOk(store.get({ ref: subject.ref }));

  assert(applied.action === "update", "audit warning fixture should apply update");
  assert(loaded?.status === "active", "audit event failure should not roll back canonical update");
  assert(
    applied.warnings?.some((warning) => warning.includes("Audit event")) === true,
    "audit event failure should return a compact warning",
  );
}

async function updateFailsWhenMultipleCurrentRecordsHaveSelectedMusicBrainzRef(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: () => "invariant-subject",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Invariant Track",
      evidence: [sourceRef],
    }),
  );
  const knowledge: MusicKnowledgePort = {
    query: async () => ({
      ok: true,
      value: {
        items: [
          {
            id: "invariant-knowledge",
            kind: "structured",
            providerId: "musicbrainz",
            source: { ref: mbRecordingRef },
            nodes: [
              {
                id: "recording",
                type: "recording",
                ref: mbRecordingRef,
                properties: {
                  title: "Invariant Track",
                  durationMs: 1000,
                },
              },
            ],
            relations: [],
          },
        ],
      },
    }),
  };

  const firstCurrent: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "first-current" },
    kind: "recording",
    label: "First Current",
    status: "active",
  };
  const secondCurrent: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "second-current" },
    kind: "recording",
    label: "Second Current",
    status: "provisional",
  };
  await assertOk(repository.put(firstCurrent));
  await assertOk(repository.put(secondCurrent));
  repository.findCurrentByProviderIdentity = async () => ({
    ok: true,
    value: [firstCurrent, secondCurrent],
  });
  await assertOk(
    store.recordProvisionalHints({
      subjectRef: subject.ref,
      sourceRef,
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            durationMs: 1000,
            releaseLabel: "Invariant Release",
          },
        },
      ],
    }),
  );

  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    knowledge,
    idFactory: () => "invariant-inspection",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const inspection = await assertOk(
    maintenance.reviewInspect({
      sessionId: reviewSession.id,
      subjectRef: subject.ref,
    }),
  );
  const result = await maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "update",
    selectedProviderRefToken: { kind: "recording", id: "mbrec-1" },
    reason: "Invariant failure.",
  });

  assert(!result.ok, "apply should fail when more than one current record has the selected MB ref");
  assert(result.error.code === "canonical.invariant_failed", "multiple exact MB current records should be an invariant failure");
}

await listsOnlyCurrentProvisionalRecordings();
await requiresCanonicalReviewPosture();
await inspectsNeutralFactsAndExactMusicBrainzNeighbors();
await inspectWithoutKnowledgeProviderReturnsLocalFactsAndWarning();
await summaryInspectFallsBackToCleanedTitleSingleArtistAndRelease();
await summaryInspectFallsBackToStrongTitleSegments();
await summaryInspectCapsBroadShortSegmentResults();
await summaryInspectOrdersQualifiedRecordingFactsFirst();
await summaryInspectFetchesMatchedReleaseTracklistsIntoSnapshot();
await detailInspectReusesSnapshotAndReturnsReleaseContexts();
await cannotConfirmRecordsEventStateAndLeavesIdentityUnchanged();
await reviewListSuppressesCannotConfirmSubjectsAcrossSessions();
await cannotConfirmRejectsEmptyReason();
await applyRejectsStaleAndExpiredInspections();
await updateGateRejectsUnsupportedOrUngroundedDecisions();
await autoUpdateSingleSubjectActivatesWhenOneRecordingQualifies();
await autoUpdateSingleSubjectMergesWhenOneCurrentRecordHasSelectedIdentity();
await autoUpdateSingleSubjectReturnsErrorWhenProviderIdentityInvariantFails();
await autoUpdateNotQualifiedDoesNotWriteReviewStateOrEvent();
await autoUpdateRespectsCannotConfirmReviewStateByDefault();
await autoUpdateReturnsErrorItemForNonProvisionalSubject();
await autoUpdateBatchUsesDefaultLimitAndRunProgress();
await autoUpdateBatchReturnsRunNotFoundForUnknownOrExpiredRun();
await autoUpdateBatchContinuesAfterPerItemErrors();
await autoUpdateBatchSkipsCannotConfirmSubjectsUnlessIncluded();
await updateMergesWhenExactlyOneCurrentRecordHasSelectedMusicBrainzRef();
await updateReturnsWarningWhenAuditEventFailsAfterCommit();
await updateFailsWhenMultipleCurrentRecordsHaveSelectedMusicBrainzRef();
