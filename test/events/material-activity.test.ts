import type { Ref, Result } from "../../src/contracts/index.js";
import { createEventService } from "../../src/events/index.js";
import { materialRefToCardRef } from "../../src/material_query/index.js";
import {
  createInMemoryEventRepository,
  createInMemoryMaterialActivityRepository,
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
  const materialRef = ref("minemusic", "material", "activity-material");
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    materialActivity,
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
              ref: materialRef,
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

  assert(activity?.lastRecommendedAt === "2026-05-30T01:05:00.000Z", "recommendation cards should update lastRecommendedAt");
  assert(activity.recommendedCountSession === 2, "recommendation cards should increment recommendation count");
}

async function recommendationEventUpdatesActivityFromCompactCardRefs(): Promise<void> {
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialRef = ref("minemusic", "material", "compact-card-activity");
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    materialActivity,
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
              ref: materialRefToCardRef(materialRef),
              title: "Compact Card Activity",
              status: "playable_unverified",
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

  assert(activity?.lastRecommendedAt === "2026-05-30T01:10:00.000Z", "compact card refs should update lastRecommendedAt");
  assert(activity.recommendedCountSession === 1, "compact card refs should increment recommendation count");
}

async function activityIsKeyedByOwnerScopeAndMaterialRef(): Promise<void> {
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialRef = ref("minemusic", "material", "opened-material");
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    materialActivity,
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
await recommendationEventUpdatesActivityFromCompactCardRefs();
await activityIsKeyedByOwnerScopeAndMaterialRef();
