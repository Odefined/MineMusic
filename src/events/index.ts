import type { MaterialActivity, Ref, Result, StageEvent } from "../contracts/index.js";
import type { EventPort, EventRepository, MaterialActivityRepository } from "../ports/index.js";

type EventServiceOptions = {
  repository: EventRepository;
  materialActivity?: MaterialActivityRepository;
  idFactory?: () => string;
  clock?: () => string;
};

export function createEventService({
  repository,
  materialActivity,
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

      if (materialActivity !== undefined) {
        const projected = await updateMaterialActivityForEvent(materialActivity, stored.value);

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

async function updateMaterialActivityForEvent(
  repository: MaterialActivityRepository,
  event: StageEvent,
): Promise<Result<StageEvent>> {
  const updateKind = activityUpdateKindForEvent(event.type);

  if (updateKind === null) {
    return ok(event);
  }

  const ownerScope = ownerScopeFromPayload(event.payload) ?? "local_profile:default";
  const materialRefs = materialRefsForEvent(event);

  for (const materialRef of materialRefs) {
    const existing = await repository.getActivity({ ownerScope, materialRef });

    if (!existing.ok) {
      return existing;
    }

    const activity = applyActivityUpdate({
      current: existing.value,
      ownerScope,
      materialRef,
      updateKind,
      timestamp: event.time,
    });
    const stored = await repository.putActivity({ activity });

    if (!stored.ok) {
      return stored;
    }
  }

  return ok(event);
}

function applyActivityUpdate({
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
        recommendedCountSession: (base.recommendedCountSession ?? 0) + 1,
        updatedAt: timestamp,
      };
    case "opened":
      return {
        ...base,
        lastOpenedAt: timestamp,
        openedCountSession: (base.openedCountSession ?? 0) + 1,
        updatedAt: timestamp,
      };
    case "played":
      return {
        ...base,
        lastPlayedAt: timestamp,
        playedCountSession: (base.playedCountSession ?? 0) + 1,
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

function activityUpdateKindForEvent(type: string): "recommended" | "opened" | "played" | "skipped" | null {
  switch (type) {
    case "recommendation.presented":
    case "recommendation_presented":
      return "recommended";
    case "material.opened":
    case "link.opened":
    case "material_opened":
    case "link_opened":
      return "opened";
    case "material.played":
    case "material_played":
      return "played";
    case "material.skipped":
    case "material_skipped":
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
  refs.push(...refValue(payload.ref));
  refs.push(...refValue(payload.material));

  if (Array.isArray(payload.cards)) {
    for (const card of payload.cards) {
      if (!isRecord(card)) {
        continue;
      }

      refs.push(...refValue(card.materialRef));
      refs.push(...refValue(card.ref));
      refs.push(...refValue(card.material));
    }
  }

  return refs.filter(isMaterialRef);
}

function refValue(value: unknown): Ref[] {
  if (isRef(value)) {
    return [value];
  }

  if (typeof value === "string" && isCompactMaterialCardRef(value)) {
    return [materialRefFromCompactCardRef(value)];
  }

  if (isRecord(value) && isRef(value.materialRef)) {
    return [value.materialRef];
  }

  return [];
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

function isCompactMaterialCardRef(value: string): boolean {
  return value.startsWith("mat_") && value.length > "mat_".length;
}

function materialRefFromCompactCardRef(value: string): Ref {
  return {
    namespace: "minemusic",
    kind: "material",
    id: safeDecodeURIComponent(value.slice("mat_".length)),
  };
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
