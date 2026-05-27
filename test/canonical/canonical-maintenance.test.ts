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

async function deferRecordsEventAndLeavesIdentityUnchanged(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const eventRepository = createInMemoryEventRepository();
  const events = createEventService({
    repository: eventRepository,
    clock: () => "2026-05-27T00:00:00.000Z",
    idFactory: () => "defer-event",
  });
  const store = createCanonicalStore({
    repository,
    idFactory: () => "defer-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Deferred Track",
      evidence: [sourceRef],
    }),
  );
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    events,
    idFactory: () => "defer-inspection",
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
      action: "defer",
      reason: "Inspected MusicBrainz facts are ambiguous.",
      supportingRefs: [sourceRef],
    }),
  );
  const loaded = await assertOk(store.get({ ref: subject.ref }));
  const recordedEvents = await assertOk(events.listBySession({ sessionId: reviewSession.id }));

  assert(applied.appliedAction === "defer", "defer apply should report defer");
  assert(loaded?.status === "provisional", "defer should leave canonical identity state unchanged");
  assert(recordedEvents.length === 1, "defer should record exactly one event");
  assert(recordedEvents[0]?.type === "provisional_review.deferred", "defer event type should be stable");
  assert(recordedEvents[0]?.target?.id === subject.ref.id, "defer event should target the subject");
}

async function deferRejectsEmptyReasonAndUninspectedCitations(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const events = createEventService({ repository: createInMemoryEventRepository() });
  const store = createCanonicalStore({
    repository,
    idFactory: () => "invalid-defer-subject",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Invalid Deferred Track",
      evidence: [sourceRef],
    }),
  );
  const maintenance = createCanonicalMaintenance({
    repository,
    sessionContext: createSessionContextFor(reviewSession),
    events,
    idFactory: () => "invalid-defer-inspection",
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
    action: "defer",
    reason: " ",
  });
  const invalidCitation = await maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "defer",
    reason: "Citation is not inspected.",
    supportingRefs: [{ namespace: "source:netease", kind: "track", id: "not-inspected" }],
  });

  assert(!emptyReason.ok, "defer should reject empty reason");
  assert(emptyReason.error.code === "canonical.review_invalid", "empty defer reason should use review error");
  assert(!invalidCitation.ok, "defer should reject uninspected supporting refs");
  assert(invalidCitation.error.code === "canonical.review_invalid", "invalid citations should use review error");
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
    action: "defer",
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
    action: "defer",
    reason: "Expired inspection.",
  });

  assert(!expired.ok, "apply should reject expired inspections");
  assert(expired.error.message.includes("expired"), "expired inspection should explain the failure");
}

async function updateGateRejectsUnsupportedOrUngroundedDecisions(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const events = createEventService({ repository: createInMemoryEventRepository() });
  const store = createCanonicalStore({
    repository,
    idFactory: () => "update-gate-subject",
    clock: () => "2026-05-27T00:00:00.000Z",
  });
  const subject = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Update Gate Track",
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
            title: "Update Gate Track",
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
  const knowledge: MusicKnowledgePort = {
    query: async () => ({
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
                properties: {
                  duration: 1000,
                  release: "Update Release",
                  track: "1",
                  isrc: "USFIXTURE1",
                  artist: "Update Artist",
                },
              },
            ],
            relations: [],
          },
        ],
      },
    }),
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
    selectedProviderRef: { namespace: "musicbrainz", kind: "release", id: "mb-release" },
    supportingReasonKinds: ["duration", "release_appearance"],
    reason: "Wrong provider ref kind.",
  });
  const absentRef = await maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "update",
    selectedProviderRef: { namespace: "musicbrainz", kind: "recording", id: "absent" },
    supportingReasonKinds: ["duration", "release_appearance"],
    reason: "Absent provider ref.",
  });
  const labelOnly = await maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "update",
    selectedProviderRef: mbRecordingRef,
    supportingReasonKinds: ["duration"],
    reason: "Only one reason kind.",
    supportingRefs: [mbRecordingRef],
  });
  const activated = await assertOk(maintenance.reviewApply({
    sessionId: reviewSession.id,
    inspectionId: inspection.inspectionId,
    subjectRef: subject.ref,
    action: "update",
    selectedProviderRef: mbRecordingRef,
    supportingReasonKinds: ["duration", "release_appearance"],
    reason: "Duration and release appearance support this MusicBrainz recording.",
    supportingRefs: [mbRecordingRef],
    supportingKnowledgeItemIds: ["knowledge-recording"],
    supportingAnchorIds: ["provider-ref:1"],
  }));
  const loaded = await assertOk(store.get({ ref: subject.ref }));

  assert(!unsupported.ok, "unsupported action strings should fail");
  assert(unsupported.error.message.includes("Unsupported"), "unsupported action should be explicit");
  assert(!wrongKind.ok, "update should reject non-recording MusicBrainz refs");
  assert(!absentRef.ok, "update should reject refs absent from inspection");
  assert(!labelOnly.ok, "update should reject label-only or single-reason decisions");
  assert(activated.appliedAction === "activate", "valid update should activate when no current record has the MB ref");
  assert(loaded?.status === "active", "activation should make the subject active");
  assert(
    loaded?.sourceRefs?.some((ref) => ref.id === mbRecordingRef.id),
    "activation should attach the selected MusicBrainz recording ref",
  );
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
      label: "Merge Track",
      evidence: [sourceRef],
    }),
  );
  const target: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "merge-target" },
    kind: "recording",
    label: "Merge Target",
    status: "active",
    sourceRefs: [mbRecordingRef],
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
                  duration: 1000,
                  release: "Merge Release",
                },
              },
            ],
            relations: [],
          },
        ],
      },
    }),
  };

  await assertOk(repository.put(target));
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
      selectedProviderRef: mbRecordingRef,
      supportingReasonKinds: ["duration", "release_appearance"],
      reason: "Shared exact MB recording ref on the current target means merge.",
      supportingRefs: [mbRecordingRef],
      supportingKnowledgeItemIds: ["merge-knowledge"],
      supportingAnchorIds: ["provider-ref:1"],
    }),
  );
  const resolvedSource = await assertOk(store.resolveSourceRef({ ref: sourceRef }));
  const redirectedSubject = await assertOk(store.get({ ref: subject.ref }));
  const rawRecords = await assertOk(repository.list());
  const rawSubject = rawRecords.find((record) => record.ref.id === subject.ref.id);
  const rawTarget = rawRecords.find((record) => record.ref.id === target.ref.id);
  const targetRelations = await assertOk(store.listRelations({ subjectRef: target.ref }));
  const recordedEvents = await assertOk(events.listBySession({ sessionId: reviewSession.id }));

  assert(applied.appliedAction === "merge", "update should merge when exactly one current target has the MB ref");
  assert(applied.targetRef?.id === target.ref.id, "merge output should include the target ref");
  assert(resolvedSource?.ref.id === target.ref.id, "moved source refs should resolve to the surviving target");
  assert(redirectedSubject?.ref.id === target.ref.id, "ordinary get should follow merged subject redirects");
  assert(rawSubject?.status === "merged", "raw subject should be historical after merge");
  assert(rawSubject?.mergedIntoRef?.id === target.ref.id, "raw subject should persist redirect target");
  assert(rawTarget?.sourceRefs?.some((ref) => ref.id === sourceRef.id), "target should receive subject source refs");
  assert(targetRelations.some((relation) => relation.predicate === "has_duration_ms"), "safe direct subject relations should be copied to target");
  assert(recordedEvents.some((event) => event.type === "canonical.merged"), "merge should record a canonical.merged event");
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
                  duration: 1000,
                  release: "Invariant Release",
                },
              },
            ],
            relations: [],
          },
        ],
      },
    }),
  };

  await assertOk(
    repository.put({
      ref: { namespace: "minemusic", kind: "recording", id: "first-current" },
      kind: "recording",
      label: "First Current",
      status: "active",
      sourceRefs: [mbRecordingRef],
    }),
  );
  await assertOk(
    repository.put({
      ref: { namespace: "minemusic", kind: "recording", id: "second-current" },
      kind: "recording",
      label: "Second Current",
      status: "provisional",
      sourceRefs: [mbRecordingRef],
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
    selectedProviderRef: mbRecordingRef,
    supportingReasonKinds: ["duration", "release_appearance"],
    reason: "Invariant failure.",
    supportingRefs: [mbRecordingRef],
    supportingKnowledgeItemIds: ["invariant-knowledge"],
    supportingAnchorIds: ["provider-ref:1"],
  });

  assert(!result.ok, "apply should fail when more than one current record has the selected MB ref");
  assert(result.error.code === "canonical.invariant_failed", "multiple exact MB current records should be an invariant failure");
}

await listsOnlyCurrentProvisionalRecordings();
await requiresCanonicalReviewPosture();
await inspectsNeutralFactsAndExactMusicBrainzNeighbors();
await inspectWithoutKnowledgeProviderReturnsLocalFactsAndWarning();
await detailInspectReusesSnapshotAndReturnsReleaseContexts();
await deferRecordsEventAndLeavesIdentityUnchanged();
await deferRejectsEmptyReasonAndUninspectedCitations();
await applyRejectsStaleAndExpiredInspections();
await updateGateRejectsUnsupportedOrUngroundedDecisions();
await updateMergesWhenExactlyOneCurrentRecordHasSelectedMusicBrainzRef();
await updateFailsWhenMultipleCurrentRecordsHaveSelectedMusicBrainzRef();
