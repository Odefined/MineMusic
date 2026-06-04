import type { MaterialActivity, MaterialSessionActivity, Ref, Result, StageEvent } from "../contracts/index.js";
import type {
  EventPort,
  EventRepository,
  MaterialActivityRepository,
  MaterialSessionActivityRepository,
} from "../ports/index.js";
import { materialIdToRef } from "../material/projection/index.js";

type EventServiceOptions = {
  repository: EventRepository;
  materialActivity?: MaterialActivityRepository;
  materialSessionActivity?: MaterialSessionActivityRepository;
  idFactory?: () => string;
  clock?: () => string;
};

export function createEventService({
  repository,
  materialActivity,
  materialSessionActivity,
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

      const stored = await repository.put(recorded);

      if (!stored.ok) {
        return stored;
      }

      if (materialActivity !== undefined || materialSessionActivity !== undefined) {
        const projected = await updateMaterialActivityForEvent({
          ...(materialActivity === undefined ? {} : { materialActivity }),
          ...(materialSessionActivity === undefined ? {} : { materialSessionActivity }),
          event: stored.value,
        });

        if (!projected.ok) {
          return projected;
        }
      }

      return stored;
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

async function updateMaterialActivityForEvent({
  materialActivity,
  materialSessionActivity,
  event,
}: {
  materialActivity?: MaterialActivityRepository;
  materialSessionActivity?: MaterialSessionActivityRepository;
  event: StageEvent;
}): Promise<Result<StageEvent>> {
  const updateKind = activityUpdateKindForEvent(event.type);

  if (updateKind === null) {
    return ok(event);
  }

  const ownerScope = ownerScopeFromPayload(event.payload) ?? "local_profile:default";
  const materialRefs = materialRefsForEvent(event);

  for (const materialRef of materialRefs) {
    if (materialActivity !== undefined) {
      const existing = await materialActivity.getActivity({ ownerScope, materialRef });

      if (!existing.ok) {
        return existing;
      }

      const activity = applyAggregateActivityUpdate({
        current: existing.value,
        ownerScope,
        materialRef,
        updateKind,
        timestamp: event.time,
      });
      const stored = await materialActivity.putActivity({ activity });

      if (!stored.ok) {
        return stored;
      }
    }

    if (materialSessionActivity !== undefined) {
      const existing = await materialSessionActivity.getSessionActivity({
        ownerScope,
        sessionId: event.sessionId,
        materialRef,
      });

      if (!existing.ok) {
        return existing;
      }

      const activity = applySessionActivityUpdate({
        current: existing.value,
        ownerScope,
        sessionId: event.sessionId,
        materialRef,
        updateKind,
        timestamp: event.time,
      });
      const stored = await materialSessionActivity.putSessionActivity({ activity });

      if (!stored.ok) {
        return stored;
      }
    }
  }

  return ok(event);
}

function applyAggregateActivityUpdate({
  current,
  ownerScope,
  materialRef,
  updateKind,
  timestamp,
}: {
  current: MaterialActivity | null;
  ownerScope: string;
  materialRef: Ref;
  updateKind: "recommended" | "opened" | "played" | "skipped";
  timestamp: string;
}): MaterialActivity {
  const base: MaterialActivity = current ?? {
    ownerScope,
    materialRef,
    updatedAt: timestamp,
  };

  switch (updateKind) {
    case "recommended":
      return {
        ...base,
        lastRecommendedAt: timestamp,
        updatedAt: timestamp,
      };
    case "opened":
      return {
        ...base,
        lastOpenedAt: timestamp,
        updatedAt: timestamp,
      };
    case "played":
      return {
        ...base,
        lastPlayedAt: timestamp,
        updatedAt: timestamp,
      };
    case "skipped":
      return {
        ...base,
        lastSkippedAt: timestamp,
        updatedAt: timestamp,
      };
  }
}

function applySessionActivityUpdate({
  current,
  ownerScope,
  sessionId,
  materialRef,
  updateKind,
  timestamp,
}: {
  current: MaterialSessionActivity | null;
  ownerScope: string;
  sessionId: string;
  materialRef: Ref;
  updateKind: "recommended" | "opened" | "played" | "skipped";
  timestamp: string;
}): MaterialSessionActivity {
  const base: MaterialSessionActivity = current ?? {
    ownerScope,
    sessionId,
    materialRef,
    updatedAt: timestamp,
  };

  switch (updateKind) {
    case "recommended":
      return {
        ...base,
        recommendedCount: (base.recommendedCount ?? 0) + 1,
        updatedAt: timestamp,
      };
    case "opened":
      return {
        ...base,
        openedCount: (base.openedCount ?? 0) + 1,
        updatedAt: timestamp,
      };
    case "played":
      return {
        ...base,
        playedCount: (base.playedCount ?? 0) + 1,
        updatedAt: timestamp,
      };
    case "skipped":
      return {
        ...base,
        skippedCount: (base.skippedCount ?? 0) + 1,
        updatedAt: timestamp,
      };
  }
}

function activityUpdateKindForEvent(type: string): "recommended" | "opened" | "played" | "skipped" | null {
  switch (type) {
    case "recommendation.presented":
      return "recommended";
    case "material.opened":
    case "link.opened":
      return "opened";
    case "material.played":
      return "played";
    case "material.skipped":
      return "skipped";
    default:
      return null;
  }
}

function materialRefsForEvent(event: StageEvent): Ref[] {
  const refs = new Map<string, Ref>();

  if (event.target !== undefined) {
    const targetRefs = refValue(event.target);

    for (const ref of targetRefs.filter(isMaterialRef)) {
      refs.set(refKey(ref), ref);
    }
  }

  for (const ref of materialRefsFromPayload(event.payload)) {
    refs.set(refKey(ref), ref);
  }

  return [...refs.values()];
}

function materialRefsFromPayload(payload: unknown): Ref[] {
  if (!isRecord(payload)) {
    return [];
  }

  const refs: Ref[] = [];

  refs.push(...refValue(payload.materialRef));
  refs.push(...materialIdValue(payload.materialId));

  if (Array.isArray(payload.cards)) {
    for (const card of payload.cards) {
      if (!isRecord(card)) {
        continue;
      }

      refs.push(...refValue(card.materialRef));
      refs.push(...materialIdValue(card.materialId));
    }
  }

  return refs.filter(isMaterialRef);
}

function refValue(value: unknown): Ref[] {
  if (isRef(value)) {
    return [value];
  }

  if (isRecord(value) && isRef(value.materialRef)) {
    return [value.materialRef];
  }

  return [];
}

function materialIdValue(value: unknown): Ref[] {
  return typeof value === "string" && value.length > 0 ? [materialIdToRef(value)] : [];
}

function ownerScopeFromPayload(payload: unknown): string | undefined {
  if (!isRecord(payload) || typeof payload.ownerScope !== "string") {
    return undefined;
  }

  return payload.ownerScope;
}

function isMaterialRef(ref: Ref): boolean {
  return ref.namespace === "minemusic" && ref.kind === "material";
}

function isRef(value: unknown): value is Ref {
  return (
    isRecord(value) &&
    typeof value.namespace === "string" &&
    typeof value.kind === "string" &&
    typeof value.id === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createDefaultIdFactory(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}
