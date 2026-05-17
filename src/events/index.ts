import type { Result, StageEvent } from "../contracts/index.js";
import type { EventPort, EventRepository } from "../ports/index.js";

type EventServiceOptions = {
  repository: EventRepository;
  idFactory?: () => string;
  clock?: () => string;
};

export function createEventService({
  repository,
  idFactory = createDefaultIdFactory("event"),
  clock = () => new Date().toISOString(),
}: EventServiceOptions): EventPort {
  return {
    async record({ event }) {
      const recorded: StageEvent = {
        ...event,
        id: idFactory(),
        time: clock(),
      };

      return repository.put(recorded);
    },

    async listBySession({ sessionId }) {
      const events = await repository.list();

      if (!events.ok) {
        return events;
      }

      return ok(events.value.filter((event) => event.sessionId === sessionId));
    },
  };
}

function createDefaultIdFactory(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
