import { createEventService } from "../../src/events/index.js";
import { createInMemoryEventRepository } from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, "expected Result.ok");
  return awaited.value;
}

async function recordsFactualEventsAndListsBySession(): Promise<void> {
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    idFactory: () => "event-1",
    clock: () => "2026-05-17T00:00:00.000Z",
  });

  const recorded = await assertOk(
    events.record({
      event: {
        sessionId: "session-1",
        actor: "stage",
        type: "recommendation_presented",
        payload: { materialState: "source_only_playable" },
      },
    }),
  );
  const sessionEvents = await assertOk(events.listBySession({ sessionId: "session-1" }));
  const otherSessionEvents = await assertOk(events.listBySession({ sessionId: "session-2" }));

  assert(recorded.id === "event-1", "event service should assign ids");
  assert(recorded.time === "2026-05-17T00:00:00.000Z", "event service should assign time");
  assert(sessionEvents.length === 1, "event service should list events by session");
  assert(otherSessionEvents.length === 0, "event service should not leak events across sessions");
  assert(
    (sessionEvents[0]?.payload as { materialState?: string }).materialState === "source_only_playable",
    "source-only material state should remain factual event payload",
  );
}

await recordsFactualEventsAndListsBySession();
