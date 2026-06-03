import type { Ref, Result } from "../../src/contracts/index.js";
import { createEventService } from "../../src/events/index.js";
import {
  createInMemoryEventRepository,
  createInMemoryMaterialActivityRepository,
  createInMemoryMaterialSessionActivityRepository,
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

async function recommendationEventUpdatesActivityFromPayloadCards(): Promise<void> {
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialSessionActivity = createInMemoryMaterialSessionActivityRepository();
  const materialRef = ref("minemusic", "material", "activity-material");
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    materialActivity,
    materialSessionActivity,
    idFactory: createSequence("event"),
    clock: createClock([
      "2026-05-30T01:00:00.000Z",
      "2026-05-30T01:05:00.000Z",
    ]),
  });

  await assertOk(
    events.record({
      event: {
        sessionId: "session-1",
        actor: "stage",
        type: "recommendation.presented",
        payload: {
          ownerScope: "local_profile:night",
          cards: [
            {
              materialRef,
              title: "Activity Material",
            },
          ],
        },
      },
    }),
  );
  await assertOk(
    events.record({
      event: {
        sessionId: "session-1",
        actor: "stage",
        type: "recommendation.presented",
        payload: {
          ownerScope: "local_profile:night",
          cards: [{ materialRef }],
        },
      },
    }),
  );

  const activity = await assertOk(
    materialActivity.getActivity({
      ownerScope: "local_profile:night",
      materialRef,
    }),
  );
  const sessionActivity = await assertOk(
    materialSessionActivity.getSessionActivity({
      ownerScope: "local_profile:night",
      sessionId: "session-1",
      materialRef,
    }),
  );

  assert(activity?.lastRecommendedAt === "2026-05-30T01:05:00.000Z", "recommendation cards should update lastRecommendedAt");
  assert(sessionActivity?.recommendedCount === 2, "recommendation cards should increment session recommendation count");
}

async function recommendationEventUpdatesActivityFromMaterialIds(): Promise<void> {
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialSessionActivity = createInMemoryMaterialSessionActivityRepository();
  const materialRef = ref("minemusic", "material", "compact-card-activity");
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    materialActivity,
    materialSessionActivity,
    idFactory: createSequence("event"),
    clock: () => "2026-05-30T01:10:00.000Z",
  });

  await assertOk(
    events.record({
      event: {
        sessionId: "session-1",
        actor: "stage",
        type: "recommendation.presented",
        payload: {
          ownerScope: "local_profile:night",
          cards: [
            {
              materialId: materialRef.id,
              title: "Compact Card Activity",
              state: "source_only_playable",
            },
          ],
        },
      },
    }),
  );

  const activity = await assertOk(
    materialActivity.getActivity({
      ownerScope: "local_profile:night",
      materialRef,
    }),
  );
  const sessionActivity = await assertOk(
    materialSessionActivity.getSessionActivity({
      ownerScope: "local_profile:night",
      sessionId: "session-1",
      materialRef,
    }),
  );

  assert(activity?.lastRecommendedAt === "2026-05-30T01:10:00.000Z", "material ids should update lastRecommendedAt");
  assert(sessionActivity?.recommendedCount === 1, "material ids should increment session recommendation count");
}

async function activityIsKeyedByOwnerScopeAndMaterialRef(): Promise<void> {
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialSessionActivity = createInMemoryMaterialSessionActivityRepository();
  const materialRef = ref("minemusic", "material", "opened-material");
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    materialActivity,
    materialSessionActivity,
    idFactory: createSequence("event"),
    clock: () => "2026-05-30T02:00:00.000Z",
  });

  await assertOk(
    events.record({
      event: {
        sessionId: "session-1",
        actor: "stage",
        type: "material.opened",
        target: materialRef,
        payload: {
          ownerScope: "local_profile:default",
        },
      },
    }),
  );

  const defaultOwnerActivity = await assertOk(
    materialActivity.getActivity({
      ownerScope: "local_profile:default",
      materialRef,
    }),
  );
  const otherOwnerActivity = await assertOk(
    materialActivity.getActivity({
      ownerScope: "local_profile:other",
      materialRef,
    }),
  );

  assert(defaultOwnerActivity?.lastOpenedAt === "2026-05-30T02:00:00.000Z", "material.opened should update opened activity");
  assert(otherOwnerActivity === null, "activity should be stored by ownerScope and materialRef together");
}

async function eventStoresMaterialSnapshotTargetAndUpdatesActivity(): Promise<void> {
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialSessionActivity = createInMemoryMaterialSessionActivityRepository();
  const materialRef = ref("minemusic", "material", "snapshot-target-material");
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    materialActivity,
    materialSessionActivity,
    idFactory: createSequence("event"),
    clock: () => "2026-05-30T02:30:00.000Z",
  });

  const recorded = await assertOk(
    events.record({
      event: {
        sessionId: "session-1",
        actor: "stage",
        type: "material.played",
        target: {
          kind: "material",
          materialRef,
          snapshot: {
            materialRef,
            id: "resolved-material-1",
            kind: "recording",
            label: "Snapshot Material",
            state: "source_only_playable",
            identityState: "source_backed",
          },
        },
        payload: {
          ownerScope: "local_profile:default",
        },
      },
    }),
  );
  const activity = await assertOk(
    materialActivity.getActivity({
      ownerScope: "local_profile:default",
      materialRef,
    }),
  );
  const sessionActivity = await assertOk(
    materialSessionActivity.getSessionActivity({
      ownerScope: "local_profile:default",
      sessionId: "session-1",
      materialRef,
    }),
  );

  assert(
    typeof recorded.target === "object" &&
      recorded.target !== null &&
      "snapshot" in recorded.target &&
      recorded.target.snapshot.label === "Snapshot Material",
    "event should store the material snapshot target",
  );
  assert(activity?.lastPlayedAt === "2026-05-30T02:30:00.000Z", "material snapshot target should update activity");
  assert(sessionActivity?.playedCount === 1, "material snapshot target should update session activity");
}

function createSequence(prefix: string): () => string {
  let next = 1;
  return () => `${prefix}-${next++}`;
}

function createClock(values: string[]): () => string {
  let next = 0;
  return () => values[next++] ?? values[values.length - 1] ?? "2026-05-30T00:00:00.000Z";
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

await recommendationEventUpdatesActivityFromPayloadCards();
await recommendationEventUpdatesActivityFromMaterialIds();
await activityIsKeyedByOwnerScopeAndMaterialRef();
await eventStoresMaterialSnapshotTargetAndUpdatesActivity();
