import type {
  MaterialActivity,
  MaterialPolicyDecision,
  MaterialPolicyDropCode,
  MaterialPolicyEvaluationInput,
  MaterialRecord,
  MaterialSortCandidate,
  MaterialSortInput,
  MaterialSortOutput,
  MusicMaterial,
  Ref,
  Result,
  SourceEntity,
} from "../../contracts/index.js";
import type {
  CollectionPort,
  MaterialPolicyEvaluatorPort,
  MaterialPolicyStorePort,
  MaterialSorterPort,
  MaterialSorterStorePort,
} from "../../ports/index.js";
import { projectMaterialRelations } from "./relation_projection.js";

type MaterialPolicyEvaluatorOptions = {
  materialStore: MaterialPolicyStorePort;
  collection?: CollectionPort;
  clock?: () => string;
};

type MaterialSorterOptions = {
  materialStore: MaterialSorterStorePort;
  clock?: () => string;
};

export function createMaterialPolicyEvaluator({
  materialStore,
  collection,
  clock = () => new Date().toISOString(),
}: MaterialPolicyEvaluatorOptions): MaterialPolicyEvaluatorPort {
  return {
    async evaluate(input) {
      return evaluateMaterialPolicy({
        materialStore,
        ...(collection === undefined ? {} : { collection }),
        input,
        now: clock(),
      });
    },
  };
}

export function createMaterialSorter({
  materialStore,
}: MaterialSorterOptions): MaterialSorterPort {
  return {
    async sort(input) {
      return sortMaterials({ materialStore, input });
    },
  };
}

async function evaluateMaterialPolicy({
  materialStore,
  collection,
  input,
  now,
}: {
  materialStore: MaterialPolicyStorePort;
  collection?: CollectionPort;
  input: MaterialPolicyEvaluationInput;
  now: string;
}): Promise<Result<MaterialPolicyDecision>> {
  const currentRef = await materialStore.resolveMaterialRedirect({ materialRef: materialIdToRef(input.materialId) });

  if (!currentRef.ok) {
    return currentRef;
  }

  const record = await materialStore.getMaterialRecord({ materialRef: currentRef.value });

  if (!record.ok) {
    return record;
  }

  if (record.value === null) {
    return ok(drop("material_not_found", `Material '${input.materialId}' was not found.`));
  }

  const material = input.material === undefined
    ? await projectMaterialRecord(materialStore, record.value)
    : ok(currentMaterialForEvaluation(input.material, currentRef.value, record.value));

  if (!material.ok) {
    return material;
  }

  const relationEvaluated = await applyRelationPolicy({
    materialStore,
    ownerScope: input.ownerScope,
    material: material.value,
    excludeRelations: input.policy.excludeRelations ?? [],
    dropBlockedByDefault: input.policy.purpose === "recommendation_presentation",
  });

  if (!relationEvaluated.ok) {
    return relationEvaluated;
  }

  if (relationEvaluated.value.decision === "drop") {
    return ok(relationEvaluated.value);
  }

  let evaluatedMaterial = relationEvaluated.value.material;
  const warnings = [...(relationEvaluated.value.warnings ?? [])];

  const collectionBlocked = await blockedByCollection({
    ...(collection === undefined ? {} : { collection }),
    ownerScope: input.ownerScope,
    material: evaluatedMaterial,
    shouldApply: input.policy.purpose === "recommendation_presentation" ||
      (input.policy.excludeRelations ?? []).includes("blocked"),
  });

  if (!collectionBlocked.ok) {
    return collectionBlocked;
  }

  if (collectionBlocked.value) {
    return ok(drop("blocked", "Material is blocked by collection policy."));
  }

  if (input.policy.availability === "playable" && (evaluatedMaterial.playableLinks?.length ?? 0) === 0) {
    return ok(drop("not_available", "Material does not have a playable link."));
  }

  if (input.policy.identity === "confirmed_only" && evaluatedMaterial.identityState !== "canonical_confirmed") {
    return ok(drop("identity_not_confirmed", "Material identity is not canonical-confirmed."));
  }

  const freshness = await evaluateFreshness({
    materialStore,
    ownerScope: input.ownerScope,
    materialRef: evaluatedMaterial.materialRef,
    input,
    now,
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  });

  if (!freshness.ok) {
    return freshness;
  }

  if (freshness.value.decision === "drop") {
    return ok(freshness.value);
  }

  warnings.push(...freshness.value.warnings);

  if (warnings.length > 0) {
    return ok({
      decision: "degrade",
      material: evaluatedMaterial,
      warnings,
    });
  }

  return ok({
    decision: "allow",
    material: evaluatedMaterial,
  });
}

async function applyRelationPolicy({
  materialStore,
  ownerScope,
  material,
  excludeRelations,
  dropBlockedByDefault,
}: {
  materialStore: MaterialPolicyStorePort;
  ownerScope: string;
  material: MusicMaterial;
  excludeRelations: NonNullable<MaterialPolicyEvaluationInput["policy"]["excludeRelations"]>;
  dropBlockedByDefault: boolean;
}): Promise<Result<MaterialPolicyDecision>> {
  if (material.state === "blocked" && (dropBlockedByDefault || excludeRelations.includes("blocked"))) {
    return ok(drop("blocked", "Material is blocked."));
  }

  if (excludeRelations.length === 0 && !dropBlockedByDefault) {
    return ok({ decision: "allow", material });
  }

  const relations = await materialStore.listMaterialRelations({
    ownerScope,
    materialRef: material.materialRef,
    status: "active",
  });

  if (!relations.ok) {
    return relations;
  }

  const projected = projectMaterialRelations({
    material,
    relations: relations.value,
    shouldApplyRelation: (relation) =>
      relation.relationKind === "blocked" && dropBlockedByDefault
        ? true
        : excludeRelations.includes(relation.relationKind as never),
    materialBlockedBehavior: "drop",
    dropWhenNotPlayableLeavesNoLinks: true,
    dropWhenSourceRemovedToEmpty: true,
  });

  if (projected.decision === "drop") {
    return ok(drop(projected.code, projected.reason));
  }

  if (projected.decision === "degrade") {
    return ok({
      decision: "degrade",
      material: projected.material,
      warnings: projected.warnings,
    });
  }

  return ok({
    decision: "allow",
    material: projected.material,
    ...(projected.warnings.length === 0 ? {} : { warnings: projected.warnings }),
  });
}

async function blockedByCollection({
  collection,
  ownerScope,
  material,
  shouldApply,
}: {
  collection?: CollectionPort;
  ownerScope: string;
  material: MusicMaterial;
  shouldApply: boolean;
}): Promise<Result<boolean>> {
  if (collection === undefined || !shouldApply) {
    return ok(false);
  }

  const materialBlocked = await collection.filterBlockedMaterials({
    ownerScope,
    materialRefs: [material.materialRef],
  });

  if (!materialBlocked.ok) {
    return materialBlocked;
  }

  if (materialBlocked.value.some((ref) => sameRef(ref, material.materialRef))) {
    return ok(true);
  }

  if (material.canonicalRef === undefined) {
    return ok(false);
  }

  const canonicalBlocked = await collection.filterBlocked({
    ownerScope,
    canonicalRefs: [material.canonicalRef],
  });

  if (!canonicalBlocked.ok) {
    return canonicalBlocked;
  }

  return ok(canonicalBlocked.value.some((ref) => sameRef(ref, material.canonicalRef as Ref)));
}

async function evaluateFreshness({
  materialStore,
  ownerScope,
  sessionId,
  materialRef,
  input,
  now,
}: {
  materialStore: MaterialPolicyStorePort;
  ownerScope: string;
  sessionId?: string;
  materialRef: Ref;
  input: MaterialPolicyEvaluationInput;
  now: string;
}): Promise<Result<
  | { decision: "allow"; warnings: string[] }
  | { decision: "drop"; code: MaterialPolicyDropCode; reason: string }
>> {
  const freshness = input.policy.freshness;

  if (freshness === undefined || freshness.mode === "off") {
    return ok({ decision: "allow", warnings: [] });
  }

  const activity = await materialStore.getMaterialActivity({ ownerScope, materialRef });

  if (!activity.ok) {
    return activity;
  }

  const sessionActivity =
    sessionId === undefined || !freshnessNeedsSessionActivity(freshness)
      ? ok(null)
      : await materialStore.getMaterialSessionActivity({ ownerScope, sessionId, materialRef });

  if (!sessionActivity.ok) {
    return sessionActivity;
  }

  const match =
    freshnessMatch(activity.value?.lastRecommendedAt, sessionActivity.value?.recommendedCount, freshness.recommended, now, "recently_recommended") ??
    freshnessMatch(activity.value?.lastPlayedAt, sessionActivity.value?.playedCount, freshness.played, now, "recently_played") ??
    freshnessMatch(activity.value?.lastOpenedAt, sessionActivity.value?.openedCount, freshness.opened, now, "recently_opened");

  if (match === undefined) {
    return ok({ decision: "allow", warnings: [] });
  }

  if (freshness.mode === "soft") {
    return ok({ decision: "allow", warnings: [match] });
  }

  return ok(drop(match, `Material is ${match.replace(/_/g, " ")}.`));
}

function freshnessNeedsSessionActivity(
  freshness: NonNullable<MaterialPolicyEvaluationInput["policy"]["freshness"]>,
): boolean {
  return freshness.recommended === "session" || freshness.played === "session" || freshness.opened === "session";
}

function freshnessMatch(
  timestamp: string | undefined,
  sessionScopedCount: number | undefined,
  window: "session" | "1h" | "24h" | "7d" | undefined,
  now: string,
  code: Extract<MaterialPolicyDropCode, "recently_recommended" | "recently_played" | "recently_opened">,
): typeof code | undefined {
  if (window === undefined) {
    return undefined;
  }

  if (window === "session") {
    return (sessionScopedCount ?? 0) > 0 ? code : undefined;
  }

  if (timestamp === undefined) {
    return undefined;
  }

  return Date.parse(timestamp) >= Date.parse(now) - recentWindowMs(window) ? code : undefined;
}

async function sortMaterials({
  materialStore,
  input,
}: {
  materialStore: MaterialSorterStorePort;
  input: MaterialSortInput;
}): Promise<Result<MaterialSortOutput>> {
  const candidates = [...input.candidates];
  const order = input.policy?.order ?? "preserve";

  if (order === "preserve") {
    return ok({ candidates });
  }

  if (order === "score") {
    return ok({
      candidates: candidates.map(withIndex).sort((left, right) =>
        (right.score ?? 0) - (left.score ?? 0) || left.index - right.index
      ).map(withoutIndex),
    });
  }

  if (order === "random") {
    return ok({
      candidates: candidates.map(withIndex).sort((left, right) => {
        const delta = stableHash(refKey(left.material.materialRef)) - stableHash(refKey(right.material.materialRef));

        return delta === 0 ? left.index - right.index : delta;
      }).map(withoutIndex),
    });
  }

  if (order === "least_recently_recommended") {
    const activityByRef = new Map<string, MaterialActivity | null>();

    for (const candidate of candidates) {
      const activity = await materialStore.getMaterialActivity({
        ownerScope: input.ownerScope,
        materialRef: candidate.material.materialRef,
      });

      if (!activity.ok) {
        return activity;
      }

      activityByRef.set(refKey(candidate.material.materialRef), activity.value);
    }

    return ok({
      candidates: candidates.map(withIndex).sort((left, right) => {
        const leftRecommended = activityByRef.get(refKey(left.material.materialRef))?.lastRecommendedAt;
        const rightRecommended = activityByRef.get(refKey(right.material.materialRef))?.lastRecommendedAt;

        if (leftRecommended === undefined && rightRecommended !== undefined) {
          return -1;
        }

        if (leftRecommended !== undefined && rightRecommended === undefined) {
          return 1;
        }

        if (leftRecommended !== undefined && rightRecommended !== undefined && leftRecommended !== rightRecommended) {
          return leftRecommended.localeCompare(rightRecommended);
        }

        return left.index - right.index;
      }).map(withoutIndex),
    });
  }

  const addedAtByRef = new Map<string, string | undefined>();

  for (const candidate of candidates) {
    const addedAt = await recentlyAddedAtForMaterial(materialStore, input.ownerScope, candidate.material);

    if (!addedAt.ok) {
      return addedAt;
    }

    addedAtByRef.set(refKey(candidate.material.materialRef), addedAt.value);
  }

  return ok({
    candidates: candidates.map(withIndex).sort((left, right) => {
      const leftAddedAt = addedAtByRef.get(refKey(left.material.materialRef));
      const rightAddedAt = addedAtByRef.get(refKey(right.material.materialRef));

      if (leftAddedAt === undefined && rightAddedAt !== undefined) {
        return 1;
      }

      if (leftAddedAt !== undefined && rightAddedAt === undefined) {
        return -1;
      }

      if (leftAddedAt !== undefined && rightAddedAt !== undefined && leftAddedAt !== rightAddedAt) {
        return rightAddedAt.localeCompare(leftAddedAt);
      }

      return left.index - right.index;
    }).map(withoutIndex),
  });
}

async function projectMaterialRecord(
  materialStore: MaterialPolicyStorePort,
  record: MaterialRecord,
): Promise<Result<MusicMaterial>> {
  const sourceRefs = sourceRefsForMaterialRecord(record);
  const sourceEntities = await sourceEntitiesForRefs(materialStore, sourceRefs);

  if (!sourceEntities.ok) {
    return sourceEntities;
  }

  const label = await labelForMaterialRecord(materialStore, record);

  if (!label.ok) {
    return label;
  }

  const playableLinks = playableLinksForSourceEntities(sourceEntities.value);

  return ok({
    id: record.materialRef.id,
    materialRef: record.materialRef,
    kind: record.kind,
    label: label.value,
    state: projectedStateForMaterialRecord(record, playableLinks),
    identityState: record.identityState,
    ...(record.canonicalRef === undefined ? {} : { canonicalRef: record.canonicalRef }),
    ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
    ...(playableLinks.length === 0 ? {} : { playableLinks }),
  });
}

function currentMaterialForEvaluation(
  material: MusicMaterial,
  currentRef: Ref,
  record: MaterialRecord,
): MusicMaterial {
  const { canonicalRef: _canonicalRef, ...materialWithoutCanonical } = material;

  return {
    ...materialWithoutCanonical,
    materialRef: currentRef,
    identityState: record.identityState,
    ...(record.canonicalRef === undefined ? {} : { canonicalRef: record.canonicalRef }),
  };
}

function sourceRefsForMaterialRecord(record: MaterialRecord): Ref[] {
  const refs = record.primarySourceRef === undefined
    ? [...record.sourceRefs]
    : [record.primarySourceRef, ...record.sourceRefs];
  const seen = new Set<string>();
  const uniqueRefs: Ref[] = [];

  for (const ref of refs) {
    const key = refKey(ref);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueRefs.push(ref);
  }

  return uniqueRefs;
}

async function sourceEntitiesForRefs(
  materialStore: MaterialPolicyStorePort,
  sourceRefs: Ref[],
): Promise<Result<SourceEntity[]>> {
  const entities: SourceEntity[] = [];

  for (const sourceRef of sourceRefs) {
    const entity = await materialStore.getSourceEntity({ sourceRef });

    if (!entity.ok) {
      return entity;
    }

    if (entity.value !== null) {
      entities.push(entity.value);
    }
  }

  return ok(entities);
}

function playableLinksForSourceEntities(
  entities: SourceEntity[],
): NonNullable<MusicMaterial["playableLinks"]> {
  return entities.flatMap((entity) =>
    entity.providerUrl === undefined
      ? []
      : [{
          url: entity.providerUrl,
          label: entity.label,
          sourceRef: entity.sourceRef,
        }],
  );
}

function projectedStateForMaterialRecord(
  record: MaterialRecord,
  playableLinks: NonNullable<MusicMaterial["playableLinks"]>,
): MusicMaterial["state"] {
  if (record.status !== "active") {
    return "unresolved";
  }

  if (playableLinks.length === 0) {
    return "grounded";
  }

  return record.identityState === "canonical_confirmed" ? "confirmed_playable" : "source_only_playable";
}

async function labelForMaterialRecord(
  materialStore: MaterialPolicyStorePort,
  record: MaterialRecord,
): Promise<Result<string>> {
  if (record.canonicalRef !== undefined) {
    const canonical = await materialStore.getCanonical({ ref: record.canonicalRef });

    if (!canonical.ok) {
      return canonical;
    }

    if (canonical.value !== null) {
      return ok(canonical.value.label);
    }
  }

  const sourceRef = record.primarySourceRef ?? record.sourceRefs[0];

  if (sourceRef !== undefined) {
    const source = await materialStore.getSourceEntity({ sourceRef });

    if (!source.ok) {
      return source;
    }

    if (source.value !== null) {
      return ok(source.value.label);
    }
  }

  return ok(record.materialRef.label ?? record.materialRef.id);
}

async function recentlyAddedAtForMaterial(
  materialStore: MaterialSorterStorePort,
  ownerScope: string,
  material: MusicMaterial,
): Promise<Result<string | undefined>> {
  const sourceTimes: string[] = [];

  for (const sourceRef of material.sourceRefs ?? []) {
    const items = await materialStore.listSourceLibraryItems({
      ownerScope,
      sourceRef,
      status: "present",
    });

    if (!items.ok) {
      return items;
    }

    sourceTimes.push(...items.value.map((item) => item.addedAt ?? item.lastSeenAt));
  }

  if (sourceTimes.length > 0) {
    const sorted = [...sourceTimes].sort();

    return ok(sorted[sorted.length - 1]);
  }

  const record = await materialStore.getMaterialRecord({ materialRef: material.materialRef });

  if (!record.ok) {
    return record;
  }

  return ok(record.value?.createdAt);
}

function drop(code: MaterialPolicyDropCode, reason: string): Extract<MaterialPolicyDecision, { decision: "drop" }> {
  return {
    decision: "drop",
    code,
    reason,
  };
}

function materialIdToRef(materialId: string): Ref {
  return {
    namespace: "minemusic",
    kind: "material",
    id: materialId,
  };
}

function recentWindowMs(window: "1h" | "24h" | "7d"): number {
  switch (window) {
    case "1h":
      return 60 * 60 * 1000;
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
  }
}

function stableHash(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function withIndex(candidate: MaterialSortCandidate, index: number): MaterialSortCandidate & { index: number } {
  return { ...candidate, index };
}

function withoutIndex(candidate: MaterialSortCandidate & { index: number }): MaterialSortCandidate {
  const { index: _index, ...rest } = candidate;

  return rest;
}

function sameRef(left: Ref, right: Ref): boolean {
  return refKey(left) === refKey(right);
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
