import type {
  CollectionItem,
  MaterialContextBriefInput,
  MaterialContextBriefOutput,
  MaterialPoolsListInput,
  MaterialPoolsListOutput,
  MaterialQueryItem,
  MaterialQueryInput,
  MaterialQueryOutput,
  MaterialRecord,
  MaterialResolveIssue,
  MaterialResolveUnresolvedItem,
  MaterialSelectInput,
  MaterialRelatedInput,
  MaterialRelatedOutput,
  MaterialResolveCardsInput,
  MaterialResolveCardsOutput,
  MusicCandidate,
  MusicMaterial,
  PlatformLibraryItemKind,
  Ref,
  ResolveSeed,
  Result,
  SourceEntity,
  SourceLibraryItem,
  StageError,
} from "../contracts/index.js";
import type {
  CollectionPort,
  MaterialCardsPort,
  MaterialQueryPort,
  MaterialRelatedPort,
  MaterialResolvePort,
  MaterialSelectorPort,
  MaterialStorePort,
} from "../ports/index.js";
import {
  createMaterialPolicyEvaluator,
  createMaterialSorter,
} from "../material_policy/index.js";
import { createMaterialSelector } from "../material_selection/index.js";

const defaultOwnerScope = "local_profile:default";
const defaultLimit = 10;
const defaultRecentCardLimit = 5;

export type MaterialQueryService = MaterialQueryPort & MaterialRelatedPort & MaterialCardsPort & MaterialSelectorPort;

export type MaterialQueryServiceOptions = {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  collection?: CollectionPort;
  clock?: () => string;
};

type ResolvedSeedMaterials = {
  materials: MusicMaterial[];
  issues: MaterialResolveIssue[];
};

type ResolvedSeedItems = {
  items: MaterialQueryItem[];
  unresolved: MaterialResolveUnresolvedItem[];
};

type RecentMaterialCardStatus =
  | "playable"
  | "found_no_link"
  | "ambiguous"
  | "blocked"
  | "unresolved";

export function createMaterialQueryService({
  materialStore,
  materialResolve,
  collection,
  clock = () => new Date().toISOString(),
}: MaterialQueryServiceOptions): MaterialQueryService {
  const materialPolicyEvaluator = createMaterialPolicyEvaluator({
    materialStore,
    ...(collection === undefined ? {} : { collection }),
    clock,
  });
  const materialSorter = createMaterialSorter({ materialStore });
  const materialSelector = createMaterialSelector({
    materialStore,
    materialPolicyEvaluator,
    materialSorter,
  });
  const service: MaterialQueryService = {
    async resolveCards(input) {
      const ownerScope = input.ownerScope ?? defaultOwnerScope;
      const resolved = await resolveSeedItems({
        materialStore,
        materialResolve,
        ownerScope,
        seeds: input.seeds,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      });

      if (!resolved.ok) {
        return resolved;
      }

      return ok({
        items: resolved.value.items,
        ...(resolved.value.unresolved.length === 0 ? {} : { unresolved: resolved.value.unresolved }),
      });
    },

    async query(input) {
      const ownerScope = input.ownerScope ?? defaultOwnerScope;
      const limit = normalizeLimit(input.limit);
      const pool = input.pool ?? { kind: "all" };
      const resolved = pool.kind === "collection"
        ? await collectionMaterials({
            materialStore,
            materialResolve,
            ...(collection === undefined ? {} : { collection }),
            ownerScope,
            pool,
            ...(input.q === undefined ? {} : { q: input.q }),
          })
        : pool.kind === "source_library"
        ? await sourceLibraryMaterials({
            materialStore,
            materialResolve,
            ownerScope,
            pool,
            ...(input.q === undefined ? {} : { q: input.q }),
          })
        : pool.kind === "all"
        ? await allSourceLibraryMaterials({
            materialStore,
            ownerScope,
            ...(input.q === undefined ? {} : { q: input.q }),
          })
        : await materialsForCandidatePool({
            materialStore,
            materialResolve,
            ownerScope,
            pool,
          });

      if (!resolved.ok) {
        return resolved;
      }

      const selectable = await selectableMaterialsForQuery({
        materialStore,
        ownerScope,
        materials: resolved.value,
        returnKind: input.returnKind,
        preferenceHints: input.preferenceHints,
        exclude: input.exclude,
      });

      if (!selectable.ok) {
        return selectable;
      }

      const offset = parseCursor(input.cursor);
      const selected = await materialSelector.select({
        ownerScope,
        candidates: selectable.value.map((candidate) => ({
          materialId: materialRefToMaterialId(candidate.material.materialRef),
          material: candidate.material,
          ...(candidate.score === undefined ? {} : { score: candidate.score }),
        })),
        policy: selectorPolicyForQuery(input),
        sort: selectorSortForQuery(input),
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      });

      if (!selected.ok) {
        return selected;
      }

      const page = selected.value.items.slice(offset, offset + limit);
      const nextCursor = offset + limit < selected.value.items.length ? encodeCursor(offset + limit) : undefined;

      return ok({
        basis: {
          pool: poolLabel(pool),
          applied: appliedLabels(input),
        },
        items: page,
        ...(nextCursor === undefined ? {} : { nextCursor }),
      });
    },

    async related(input) {
      return relatedForInput({
        materialStore,
        materialResolve,
        materialSelector,
        ownerScope: input.ownerScope ?? defaultOwnerScope,
        input,
      });
    },

    async select(input) {
      return materialSelector.select(input);
    },

    async contextBrief(input) {
      return contextBriefForInput(materialStore, input);
    },

    async listPools(input) {
      return listPoolsForInput({
        materialStore,
        ...(collection === undefined ? {} : { collection }),
        input,
      });
    },
  };

  return service;
}

export function materialRefToMaterialId(materialRef: Ref): string {
  return materialRef.id;
}

export function materialIdToRef(materialId: string): Ref {
  return {
    namespace: "minemusic",
    kind: "material",
    id: materialId,
  };
}

async function currentMaterialRecordForRef(
  materialStore: MaterialStorePort,
  materialRef: Ref,
): Promise<Result<MaterialRecord | null>> {
  const current = await materialStore.resolveMaterialRedirect({ materialRef });

  if (!current.ok) {
    return current;
  }

  return materialStore.getMaterialRecord({ materialRef: current.value });
}

export function recentCardsFromEvents(
  events: Array<{ id: string; type: string; payload: unknown }>,
  limit = defaultRecentCardLimit,
): NonNullable<import("../contracts/index.js").StageContext["recentCards"]> {
  const recentCards: NonNullable<import("../contracts/index.js").StageContext["recentCards"]> = [];

  for (const event of [...events].reverse()) {
    if (event.type !== "recommendation.presented") {
      continue;
    }

    if (!isRecord(event.payload) || !Array.isArray(event.payload.cards)) {
      continue;
    }

    if (typeof event.payload.presentedAt !== "string") {
      continue;
    }

    for (const [index, card] of event.payload.cards.entries()) {
      if (!isRecord(card)) {
        continue;
      }
      const title = titleFromPresentedEventItem(card);

      if (title === undefined) {
        continue;
      }

      const materialId = materialIdFromCardPayload(card);

      if (materialId === undefined) {
        continue;
      }

      recentCards.push({
        materialId,
        title,
        ...(typeof card.subtitle === "string" ? { subtitle: card.subtitle } : {}),
        position: typeof card.position === "number" ? card.position : index + 1,
        presentedAt: typeof card.presentedAt === "string" ? card.presentedAt : event.payload.presentedAt,
        eventId: event.id,
        status: materialCardStatusFromEventValue(card.status),
      });

      if (recentCards.length >= limit) {
        return recentCards;
      }
    }
  }

  return recentCards;
}

function titleFromPresentedEventItem(card: Record<string, unknown>): string | undefined {
  return typeof card.title === "string"
    ? card.title
    : typeof card.label === "string" ? card.label : undefined;
}

function materialIdFromCardPayload(card: Record<string, unknown>): string | undefined {
  if (typeof card.materialId === "string" && card.materialId.length > 0) {
    return card.materialId;
  }

  return undefined;
}

async function resolveSeeds({
  materialResolve,
  ownerScope,
  seeds,
  limit,
}: {
  materialResolve: MaterialResolvePort;
  ownerScope: string;
  seeds: ResolveSeed[];
  limit?: number;
}): Promise<Result<ResolvedSeedMaterials>> {
  if (seeds.length === 0) {
    return ok({ materials: [], issues: [] });
  }

  const candidates = seeds.map((seed, index) => seedToCandidate(seed, index));
  const resolved = await materialResolve.resolve({
    kind: "candidate_set",
    ownerScope,
    candidates,
    ...(limit === undefined ? {} : { limitPerCandidate: limit }),
  });

  if (!resolved.ok) {
    return resolved;
  }

  return ok({
    materials:
      resolved.value.kind === "candidate_set"
        ? dedupeMaterials(resolved.value.results.flatMap((result) => result.materials))
        : resolved.value.result.materials,
    issues:
      resolved.value.kind === "candidate_set"
        ? resolved.value.results.flatMap((result) => result.issues ?? [])
        : resolved.value.result.issues ?? [],
  });
}

async function resolveSeedItems({
  materialStore,
  materialResolve,
  ownerScope,
  seeds,
  limit,
}: {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  ownerScope: string;
  seeds: ResolveSeed[];
  limit?: number;
}): Promise<Result<ResolvedSeedItems>> {
  const items: MaterialQueryItem[] = [];
  const unresolved: MaterialResolveUnresolvedItem[] = [];

  for (const [index, seed] of seeds.entries()) {
    const materialId = materialIdForSeed(seed);

    if (materialId !== undefined) {
      const resolved = await resolveMaterialRefSeed({
        materialStore,
        ownerScope,
        seed,
        materialId,
      });

      if (!resolved.ok) {
        return resolved;
      }

      items.push(...resolved.value.items);
      unresolved.push(...resolved.value.unresolved);
      continue;
    }

    const resolved = await resolveSeeds({
      materialResolve,
      ownerScope,
      seeds: [seed],
      ...(limit === undefined ? {} : { limit }),
    });

    if (!resolved.ok) {
      return resolved;
    }

    items.push(...resolved.value.materials.map(materialToQueryItem));

    if (resolved.value.materials.length === 0) {
      unresolved.push({ label: seed.text ?? `seed-${index + 1}` });
    }
  }

  return ok({ items, unresolved });
}

async function resolveMaterialRefSeed({
  materialStore,
  ownerScope,
  seed,
  materialId,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  seed: ResolveSeed;
  materialId: string;
}): Promise<Result<ResolvedSeedItems>> {
  const materialRef = materialIdToRef(materialId);
  const record = await currentMaterialRecordForRef(materialStore, materialRef);

  if (!record.ok) {
    return record;
  }

  if (record.value === null) {
    return ok({
      items: [],
      unresolved: [{
        label: seed.text ?? materialId,
      }],
    });
  }

  const material = await projectMaterialRecord(materialStore, record.value, {
    ownerScope,
    purpose: "resolve.cards",
  });

  return material.ok ? ok({ items: [materialToQueryItem(material.value)], unresolved: [] }) : material;
}

function materialIdForSeed(seed: ResolveSeed): string | undefined {
  if (seed.materialId !== undefined) {
    return seed.materialId;
  }

  return undefined;
}

async function resolveCandidates({
  materialResolve,
  ownerScope,
  candidates,
  limitPerCandidate,
}: {
  materialResolve: MaterialResolvePort;
  ownerScope: string;
  candidates: MusicCandidate[];
  limitPerCandidate?: number;
}): Promise<Result<MusicMaterial[]>> {
  if (candidates.length === 0) {
    return ok([]);
  }

  const resolved = await materialResolve.resolve({
    kind: "candidate_set",
    ownerScope,
    candidates,
    ...(limitPerCandidate === undefined ? {} : { limitPerCandidate }),
  });

  if (!resolved.ok) {
    return resolved;
  }

  return ok(
    resolved.value.kind === "candidate_set"
      ? dedupeMaterials(resolved.value.results.flatMap((result) => result.materials))
      : resolved.value.result.materials,
  );
}

async function materialsForCandidatePool({
  materialStore,
  materialResolve,
  ownerScope,
  pool,
}: {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  ownerScope: string;
  pool: Extract<NonNullable<MaterialQueryInput["pool"]>, { kind: "related" }>;
}): Promise<Result<MusicMaterial[]>> {
  const candidates = await relatedPoolCandidates({
    materialStore,
    ownerScope,
    pool,
  });

  if (!candidates.ok) {
    return candidates;
  }

  return resolveCandidates({
    materialResolve,
    ownerScope,
    candidates: candidates.value,
  });
}

async function sourceLibraryMaterials({
  materialStore,
  materialResolve,
  ownerScope,
  pool,
  q,
}: {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  ownerScope: string;
  pool: Extract<NonNullable<MaterialQueryInput["pool"]>, { kind: "source_library" }>;
  q?: string;
}): Promise<Result<MusicMaterial[]>> {
  const areas = pool.areas ?? ["saved_tracks"];
  const materials: MusicMaterial[] = [];

  for (const area of areas) {
    const libraryKind = libraryKindForArea(area);
    const items = await materialStore.listSourceLibraryItems({
      ownerScope,
      status: "present",
      libraryKind,
      ...(pool.providerId === undefined ? {} : { providerId: pool.providerId }),
    });

    if (!items.ok) {
      return items;
    }

    for (const item of items.value) {
      if (area === "saved_albums" && pool.expand === "tracks") {
        const expanded = await tracklistCandidatesForReleaseItem(materialStore, item);

        if (!expanded.ok) {
          return expanded;
        }

        const resolved = await resolveCandidates({
          materialResolve,
          ownerScope,
          candidates: expanded.value.filter((candidate) => matchesQueryText(candidate.label, q)),
        });

        if (!resolved.ok) {
          return resolved;
        }

        materials.push(...resolved.value);
        continue;
      }

      if (!matchesQueryText(item.label, q)) {
        continue;
      }

      const material = await projectStoredSourceLibraryItem({
        materialStore,
        ownerScope,
        item,
      });

      if (!material.ok) {
        return material;
      }

      materials.push(material.value);
    }
  }

  return ok(dedupeMaterials(materials));
}

async function allSourceLibraryMaterials({
  materialStore,
  ownerScope,
  q,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  q?: string;
}): Promise<Result<MusicMaterial[]>> {
  const items = await materialStore.listSourceLibraryItems({
    ownerScope,
    status: "present",
  });

  if (!items.ok) {
    return items;
  }

  const materials: MusicMaterial[] = [];

  for (const item of items.value.filter((entry) => matchesQueryText(entry.label, q))) {
    const material = await projectStoredSourceLibraryItem({
      materialStore,
      ownerScope,
      item,
    });

    if (!material.ok) {
      return material;
    }

    materials.push(material.value);
  }

  return ok(dedupeMaterials(materials));
}

async function projectStoredSourceLibraryItem({
  materialStore,
  ownerScope,
  item,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  item: SourceLibraryItem;
}): Promise<Result<MusicMaterial>> {
  const record = await materialStore.getOrCreateBySourceRef({
    sourceRef: item.sourceRef,
    kind: sourceKindToMaterialKind(item.sourceKind),
    primarySourceRef: item.sourceRef,
  });

  if (!record.ok) {
    return record;
  }

  return projectMaterialRecord(materialStore, record.value, {
    ownerScope,
    purpose: "resolve.cards",
    fallbackLabel: item.label,
  });
}

async function collectionMaterials({
  materialStore,
  materialResolve,
  collection,
  ownerScope,
  pool,
  q,
}: {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  collection?: CollectionPort;
  ownerScope: string;
  pool: Extract<NonNullable<MaterialQueryInput["pool"]>, { kind: "collection" }>;
  q?: string;
}): Promise<Result<MusicMaterial[]>> {
  if (collection === undefined) {
    return ok([]);
  }

  const items = await collectionItemsForPool({ collection, ownerScope, pool });

  if (!items.ok) {
    return items;
  }

  const materials: MusicMaterial[] = [];

  for (const item of items.value.filter((entry) => matchesQueryText(entry.label, q))) {
    const itemMaterials = await materialForCollectionItem({
      materialStore,
      materialResolve,
      ownerScope,
      item,
    });

    if (!itemMaterials.ok) {
      return itemMaterials;
    }

    materials.push(...itemMaterials.value);
  }

  return ok(dedupeMaterials(materials));
}

async function collectionItemsForPool({
  collection,
  ownerScope,
  pool,
}: {
  collection: CollectionPort;
  ownerScope: string;
  pool: Extract<NonNullable<MaterialQueryInput["pool"]>, { kind: "collection" }>;
}): Promise<Result<CollectionItem[]>> {
  let collectionId = pool.ref;

  if (collectionId === undefined && pool.label !== undefined) {
    const collections = await collection.listCollections({ ownerScope, includeRemoved: false });

    if (!collections.ok) {
      return collections;
    }

    collectionId = collections.value.find((entry) => entry.label === pool.label)?.id;

    if (collectionId === undefined) {
      return ok([]);
    }
  }

  return collection.listItems({
    ownerScope,
    ...(collectionId === undefined ? {} : { collectionId }),
    ...(pool.relation === undefined ? {} : { relationKind: pool.relation }),
  });
}

async function materialForCollectionItem({
  materialStore,
  materialResolve,
  ownerScope,
  item,
}: {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  ownerScope: string;
  item: CollectionItem;
}): Promise<Result<MusicMaterial[]>> {
  if (item.materialRef !== undefined) {
    const material = await materialForCollectionMaterialRef({
      materialStore,
      ownerScope,
      item,
      materialRef: item.materialRef,
    });

    if (!material.ok || material.value.length > 0 || item.canonicalRef === undefined) {
      return material;
    }
  }

  if (item.canonicalRef === undefined) {
    return ok([]);
  }

  return resolveCandidates({
    materialResolve,
    ownerScope,
    candidates: [candidateForCollectionItem(item)],
  });
}

async function materialForCollectionMaterialRef({
  materialStore,
  ownerScope,
  item,
  materialRef,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  item: CollectionItem;
  materialRef: Ref;
}): Promise<Result<MusicMaterial[]>> {
  const record = await currentMaterialRecordForRef(materialStore, materialRef);

  if (!record.ok) {
    return record;
  }

  if (record.value === null) {
    return ok([]);
  }

  const material = await projectMaterialRecord(materialStore, record.value, {
    ownerScope,
    purpose: "collection.snapshot",
    fallbackLabel: item.materialSnapshot?.label ?? item.label,
  });

  return material.ok ? ok([material.value]) : material;
}

async function relatedPoolCandidates({
  materialStore,
  ownerScope,
  pool,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  pool: Extract<NonNullable<MaterialQueryInput["pool"]>, { kind: "related" }>;
}): Promise<Result<MusicCandidate[]>> {
  const related = await relatedCandidates({
    materialStore,
    ownerScope,
    materialId: pool.materialId,
    relation: pool.relation,
  });

  if (!related.ok) {
    return related;
  }

  return ok(related.value.candidates);
}

async function tracklistCandidatesForReleaseItem(
  materialStore: MaterialStorePort,
  item: SourceLibraryItem,
): Promise<Result<MusicCandidate[]>> {
  const entity = await materialStore.getSourceEntity({ sourceRef: item.sourceRef });

  if (!entity.ok) {
    return entity;
  }

  if (entity.value?.kind !== "release") {
    return ok([]);
  }

  return ok(
    (entity.value.tracklist ?? [])
      .flatMap((track, index): MusicCandidate[] => track.sourceRef === undefined ? [] : [{
        id: `source-library:${item.id}:track:${index}`,
        label: track.title,
        expectedKind: "recording",
        sourceRef: track.sourceRef,
        query: {
          text: track.title,
          sourceRef: track.sourceRef,
        },
      }]),
  );
}

function candidateForCollectionItem(item: CollectionItem): MusicCandidate {
  const canonicalRef = item.canonicalRef;

  if (canonicalRef === undefined) {
    throw new Error("Collection material-only items cannot be resolved through canonical collection compatibility.");
  }

  return {
    id: `collection:${item.id}`,
    label: item.label,
    expectedKind: canonicalRef.kind,
    canonicalRef,
    query: {
      text: item.label,
      canonicalRef,
    },
  };
}

function seedToCandidate(seed: ResolveSeed, index: number): MusicCandidate {
  const sourceRef = seed.sourceRef;
  const canonicalRef = seed.canonicalRef;
  const text = seed.text ?? seed.materialId ?? sourceRef?.label ?? canonicalRef?.label ?? `seed-${index + 1}`;

  return {
    id: `seed:${index + 1}`,
    label: text,
    ...(seed.kind === undefined ? {} : { expectedKind: normalizeSeedKind(seed.kind) }),
    ...(sourceRef === undefined ? {} : { sourceRef }),
    ...(canonicalRef === undefined ? {} : { canonicalRef }),
    query: {
      text,
      ...(sourceRef === undefined ? {} : { sourceRef }),
      ...(canonicalRef === undefined ? {} : { canonicalRef }),
    },
    ...(seed.reason === undefined ? {} : { reason: seed.reason }),
  };
}

async function projectMaterialRecord(
  materialStore: MaterialStorePort,
  record: MaterialRecord,
  context: {
    ownerScope: string;
    purpose: "resolve.cards" | "context.brief" | "collection.snapshot";
    fallbackLabel?: string;
  },
): Promise<Result<MusicMaterial>> {
  const currentRef = await materialStore.resolveMaterialRedirect({ materialRef: record.materialRef });

  if (!currentRef.ok) {
    return currentRef;
  }

  const currentRecord = sameRef(currentRef.value, record.materialRef)
    ? ok(record)
    : await materialStore.getMaterialRecord({ materialRef: currentRef.value });

  if (!currentRecord.ok) {
    return currentRecord;
  }

  if (currentRecord.value === null) {
    return fail({
      code: "material_registry.conflict",
      message: `Material redirect target '${currentRef.value.id}' was not found.`,
      module: "material_store",
      retryable: false,
    });
  }

  const sourceRefs = sourceRefsForMaterialRecord(currentRecord.value);
  const sourceEntities = await sourceEntitiesForRefs(materialStore, sourceRefs);

  if (!sourceEntities.ok) {
    return sourceEntities;
  }

  const label = await labelForMaterialRecord(materialStore, currentRecord.value);

  if (!label.ok) {
    return label;
  }

  const playableLinks = playableLinksForSourceEntities(sourceEntities.value);
  const displayLabel = label.value === currentRecord.value.materialRef.id && context.fallbackLabel !== undefined
    ? context.fallbackLabel
    : label.value;

  return ok({
    id: currentRecord.value.materialRef.id,
    materialRef: currentRecord.value.materialRef,
    kind: normalizeSeedKind(currentRecord.value.kind),
    label: displayLabel,
    state: projectedStateForMaterialRecord(currentRecord.value, playableLinks),
    identityState: currentRecord.value.identityState,
    ...(currentRecord.value.canonicalRef === undefined ? {} : { canonicalRef: currentRecord.value.canonicalRef }),
    ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
    ...(playableLinks.length === 0 ? {} : { playableLinks }),
  });
}

export async function materialForMaterialId({
  materialStore,
  materialId,
  ownerScope,
  purpose,
}: {
  materialStore: MaterialStorePort;
  materialId: string;
  ownerScope: string;
  purpose: "resolve.cards" | "context.brief" | "collection.snapshot";
}): Promise<Result<MusicMaterial | null>> {
  const record = await currentMaterialRecordForRef(materialStore, materialIdToRef(materialId));

  if (!record.ok) {
    return record;
  }

  if (record.value === null) {
    return ok(null);
  }

  return projectMaterialRecord(materialStore, record.value, { ownerScope, purpose });
}

function sourceRefsForMaterialRecord(record: MaterialRecord): Ref[] {
  const refs = record.primarySourceRef === undefined
    ? [...record.sourceRefs]
    : [record.primarySourceRef, ...record.sourceRefs];
  const seen = new Set<string>();
  const uniqueRefs: Ref[] = [];

  for (const ref of refs) {
    const key = `${ref.namespace}:${ref.kind}:${ref.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueRefs.push(ref);
  }

  return uniqueRefs;
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
  if (playableLinks.length === 0) {
    return "grounded";
  }

  return record.identityState === "canonical_confirmed" ? "confirmed_playable" : "source_only_playable";
}

async function labelForMaterialRecord(
  materialStore: MaterialStorePort,
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

type SelectableMaterialCandidate = {
  material: MusicMaterial;
  score?: number;
};

async function selectableMaterialsForQuery({
  materialStore,
  ownerScope,
  materials,
  returnKind,
  preferenceHints,
  exclude,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  materials: MusicMaterial[];
  returnKind?: MaterialQueryInput["returnKind"];
  preferenceHints?: MaterialQueryInput["preferenceHints"];
  exclude?: MaterialQueryInput["exclude"];
}): Promise<Result<SelectableMaterialCandidate[]>> {
  const excludedMaterialIds = await excludedMaterialIdsForInput({
    materialStore,
    materialIds: exclude?.materialIds ?? [],
  });

  if (!excludedMaterialIds.ok) {
    return excludedMaterialIds;
  }

  const preferHints = preferredHints(preferenceHints);
  const filtered: SelectableMaterialCandidate[] = [];

  for (const material of dedupeMaterials(materials)) {
    if (!matchesReturnKind(material, returnKind)) {
      continue;
    }

    if (excludedMaterialIds.value.has(materialRefToMaterialId(material.materialRef))) {
      continue;
    }

    if (matchesAnyHint(material, avoidHints(preferenceHints))) {
      continue;
    }

    filtered.push({
      material,
      ...(preferHints.length === 0 ? {} : { score: hintScore(material, preferHints) }),
    });
  }

  return ok(filtered);
}

function selectorPolicyForQuery(input: MaterialQueryInput | MaterialRelatedInput): NonNullable<MaterialSelectInput["policy"]> {
  return {
    purpose: "candidate_selection",
    ...(input.constraints?.availability === undefined ? {} : { availability: input.constraints.availability }),
    ...(input.constraints?.identity === undefined ? {} : { identity: input.constraints.identity }),
    ...(input.exclude?.relations === undefined ? {} : { excludeRelations: input.exclude.relations }),
    ...(input.exclude?.recent === undefined ? {} : { freshness: input.exclude.recent }),
  };
}

function selectorSortForQuery(input: MaterialQueryInput): NonNullable<MaterialSelectInput["sort"]> {
  const preferHints = preferredHints(input.preferenceHints);

  if ((input.order === undefined || input.order === "relevance") && preferHints.length > 0) {
    return { order: "score" };
  }

  if (input.order === "random" ||
    input.order === "recently_added" ||
    input.order === "least_recently_recommended") {
    return { order: input.order };
  }

  return { order: "preserve" };
}

async function excludedMaterialIdsForInput({
  materialStore,
  materialIds,
}: {
  materialStore: MaterialStorePort;
  materialIds: string[];
}): Promise<Result<Set<string>>> {
  const excludedMaterialIds = new Set(materialIds);

  for (const materialId of materialIds) {
    const current = await materialStore.resolveMaterialRedirect({ materialRef: materialIdToRef(materialId) });

    if (!current.ok) {
      return current;
    }

    excludedMaterialIds.add(materialRefToMaterialId(current.value));
  }

  return ok(excludedMaterialIds);
}

async function relatedForInput({
  materialStore,
  materialResolve,
  materialSelector,
  ownerScope,
  input,
}: {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  materialSelector: MaterialSelectorPort;
  ownerScope: string;
  input: MaterialRelatedInput;
}): Promise<Result<MaterialRelatedOutput>> {
  const related = await relatedCandidates({
    materialStore,
    ownerScope,
    materialId: input.materialId,
    relation: input.relation,
  });

  if (!related.ok) {
    return related;
  }

  const resolved = await resolveCandidates({
    materialResolve,
    ownerScope,
    candidates: related.value.candidates,
  });

  if (!resolved.ok) {
    return resolved;
  }

  const seedMaterialRef = materialIdToRef(input.materialId);
  const currentSeedMaterialRef = await materialStore.resolveMaterialRedirect({ materialRef: seedMaterialRef });

  if (!currentSeedMaterialRef.ok) {
    return currentSeedMaterialRef;
  }

  const selectable = await selectableMaterialsForQuery({
    materialStore,
    ownerScope,
    materials: resolved.value.filter((material) =>
      !sameRef(material.materialRef, seedMaterialRef) && !sameRef(material.materialRef, currentSeedMaterialRef.value)
    ),
    exclude: {
      ...input.exclude,
      materialIds: [
        ...(input.exclude?.materialIds ?? []),
        input.materialId,
        materialRefToMaterialId(currentSeedMaterialRef.value),
      ],
    },
  });

  if (!selectable.ok) {
    return selectable;
  }

  const selected = await materialSelector.select({
    ownerScope,
    candidates: selectable.value.map((candidate) => ({
      materialId: materialRefToMaterialId(candidate.material.materialRef),
      material: candidate.material,
      ...(candidate.score === undefined ? {} : { score: candidate.score }),
    })),
    policy: selectorPolicyForQuery(input),
    sort: { order: "preserve" },
    limit: normalizeLimit(input.limit),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  });

  if (!selected.ok) {
    return selected;
  }

  return ok({
    basis: related.value.basis,
    ...(related.value.basisLabel === undefined ? {} : { basisLabel: related.value.basisLabel }),
    items: selected.value.items,
  });
}

function materialToQueryItem(material: MusicMaterial): MaterialQueryItem {
  return {
    materialId: materialRefToMaterialId(material.materialRef),
    material,
  };
}

async function relatedCandidates({
  materialStore,
  materialId,
  relation,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  materialId: string;
  relation: MaterialRelatedInput["relation"];
}): Promise<Result<{
  basis: MaterialRelatedOutput["basis"];
  basisLabel?: string;
  candidates: MusicCandidate[];
}>> {
  const seedRecord = await currentMaterialRecordForRef(materialStore, materialIdToRef(materialId));

  if (!seedRecord.ok) {
    return seedRecord;
  }

  if (seedRecord.value === null) {
    return ok({ basis: "fallback_text", candidates: [] });
  }

  if (relation === "same_artist" || relation === "similar") {
    const sameArtist = await sameArtistCandidates(materialStore, seedRecord.value.sourceRefs);

    if (!sameArtist.ok) {
      return sameArtist;
    }

    if (sameArtist.value.candidates.length > 0 || relation === "same_artist") {
      return sameArtist;
    }
  }

  const sameAlbum = await sameAlbumCandidates(materialStore, seedRecord.value.sourceRefs);

  if (!sameAlbum.ok) {
    return sameAlbum;
  }

  return sameAlbum.value.candidates.length > 0
    ? sameAlbum
    : ok({ basis: "fallback_text", candidates: [] });
}

async function sameArtistCandidates(
  materialStore: MaterialStorePort,
  sourceRefs: Ref[],
): Promise<Result<{
  basis: "confirmed_artist" | "source_artist" | "fallback_text";
  basisLabel?: string;
  candidates: MusicCandidate[];
}>> {
  const seedTracks = await sourceEntitiesForRefs(materialStore, sourceRefs);

  if (!seedTracks.ok) {
    return seedTracks;
  }

  const seedArtistRefs = seedTracks.value
    .filter((entity) => entity.kind === "track")
    .flatMap((entity) => entity.artistSourceRefs ?? []);
  const canonicalArtists = await canonicalArtistRefsForSourceArtistRefs(materialStore, seedArtistRefs);

  if (!canonicalArtists.ok) {
    return canonicalArtists;
  }

  if (canonicalArtists.value.length > 0) {
    const candidates = await trackCandidatesForCanonicalArtist(materialStore, canonicalArtists.value[0] as Ref, sourceRefs);

    if (!candidates.ok) {
      return candidates;
    }

    const canonical = await materialStore.getCanonical({ ref: canonicalArtists.value[0] as Ref });

    if (!canonical.ok) {
      return canonical;
    }

    return ok({
      basis: "confirmed_artist",
      ...(canonical.value?.label === undefined ? {} : { basisLabel: canonical.value.label }),
      candidates: candidates.value,
    });
  }

  const sourceArtistRef = seedArtistRefs[0];

  if (sourceArtistRef === undefined) {
    return ok({ basis: "fallback_text", candidates: [] });
  }

  const candidates = await trackCandidatesForSourceArtist(materialStore, sourceArtistRef, sourceRefs);

  if (!candidates.ok) {
    return candidates;
  }

  const artist = await materialStore.getSourceEntity({ sourceRef: sourceArtistRef });

  if (!artist.ok) {
    return artist;
  }

  return ok({
    basis: "source_artist",
    ...(artist.value?.label === undefined ? {} : { basisLabel: artist.value.label }),
    candidates: candidates.value,
  });
}

async function sameAlbumCandidates(
  materialStore: MaterialStorePort,
  sourceRefs: Ref[],
): Promise<Result<{
  basis: "source_album" | "fallback_text";
  basisLabel?: string;
  candidates: MusicCandidate[];
}>> {
  const seedEntities = await sourceEntitiesForRefs(materialStore, sourceRefs);

  if (!seedEntities.ok) {
    return seedEntities;
  }

  const releaseRef =
    seedEntities.value.find((entity) => entity.kind === "release")?.sourceRef ??
    seedEntities.value
      .filter((entity) => entity.kind === "track")
      .find((entity) => entity.releaseSourceRef !== undefined)?.releaseSourceRef;

  if (releaseRef === undefined) {
    return ok({ basis: "fallback_text", candidates: [] });
  }

  const release = await materialStore.getSourceEntity({ sourceRef: releaseRef });

  if (!release.ok) {
    return release;
  }

  if (release.value?.kind !== "release") {
    return ok({ basis: "fallback_text", candidates: [] });
  }

  const seedRefKeys = new Set(sourceRefs.map(refKey));
  const candidates = (release.value.tracklist ?? [])
    .flatMap((track, index): MusicCandidate[] =>
      track.sourceRef === undefined || seedRefKeys.has(refKey(track.sourceRef))
        ? []
        : [{
      id: `related:${release.value?.sourceRef.id}:track:${index}`,
      label: track.title,
      expectedKind: "recording",
      sourceRef: track.sourceRef,
      query: {
        text: track.title,
        sourceRef: track.sourceRef,
      },
    }]);

  return ok({
    basis: "source_album",
    basisLabel: release.value.label,
    candidates,
  });
}

async function sourceEntitiesForRefs(
  materialStore: MaterialStorePort,
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

async function canonicalArtistRefsForSourceArtistRefs(
  materialStore: MaterialStorePort,
  sourceArtistRefs: Ref[],
): Promise<Result<Ref[]>> {
  const refs: Ref[] = [];

  for (const sourceRef of sourceArtistRefs) {
    const binding = await materialStore.getConfirmedCanonicalBinding({ sourceRef });

    if (!binding.ok) {
      return binding;
    }

    if (binding.value?.canonicalRef.kind === "artist") {
      refs.push(binding.value.canonicalRef);
    }
  }

  return ok(dedupeRefs(refs));
}

async function trackCandidatesForCanonicalArtist(
  materialStore: MaterialStorePort,
  canonicalArtistRef: Ref,
  excludeSourceRefs: Ref[],
): Promise<Result<MusicCandidate[]>> {
  const tracks = await materialStore.listSourceEntities({ kind: "track" });

  if (!tracks.ok) {
    return tracks;
  }

  const excludeKeys = new Set(excludeSourceRefs.map(refKey));
  const candidates: MusicCandidate[] = [];

  for (const entity of tracks.value.filter((entity) => entity.kind === "track")) {
    if (excludeKeys.has(refKey(entity.sourceRef))) {
      continue;
    }

    const artistRefs = entity.artistSourceRefs ?? [];
    const canonicalArtists = await canonicalArtistRefsForSourceArtistRefs(materialStore, artistRefs);

    if (!canonicalArtists.ok) {
      return canonicalArtists;
    }

    if (canonicalArtists.value.some((artistRef) => sameRef(artistRef, canonicalArtistRef))) {
      candidates.push(candidateForSourceEntity(entity));
    }
  }

  return ok(candidates);
}

async function trackCandidatesForSourceArtist(
  materialStore: MaterialStorePort,
  sourceArtistRef: Ref,
  excludeSourceRefs: Ref[],
): Promise<Result<MusicCandidate[]>> {
  const tracks = await materialStore.listSourceEntities({ kind: "track" });

  if (!tracks.ok) {
    return tracks;
  }

  const excludeKeys = new Set(excludeSourceRefs.map(refKey));

  return ok(
    tracks.value
      .filter(
        (entity) =>
          entity.kind === "track" &&
          !excludeKeys.has(refKey(entity.sourceRef)) &&
          (entity.artistSourceRefs ?? []).some((artistRef) => sameRef(artistRef, sourceArtistRef)),
      )
      .map(candidateForSourceEntity),
  );
}

function candidateForSourceEntity(entity: SourceEntity): MusicCandidate {
  return {
    id: `source-entity:${entity.sourceRef.id}`,
    label: entity.label,
    expectedKind: sourceKindToMaterialKind(entity.kind),
    sourceRef: entity.sourceRef,
    query: {
      text: entity.label,
      sourceRef: entity.sourceRef,
    },
  };
}

async function contextBriefForInput(
  materialStore: MaterialStorePort,
  input: MaterialContextBriefInput,
): Promise<Result<MaterialContextBriefOutput>> {
  const requestedFields = new Set(input.fields);
  const materialId = input.materialId;

  const requestedRef = materialIdToRef(materialId);
  const requestedRecord = await materialStore.getMaterialRecord({ materialRef: requestedRef });

  if (!requestedRecord.ok) {
    return requestedRecord;
  }

  const currentRef = await materialStore.resolveMaterialRedirect({ materialRef: requestedRef });

  if (!currentRef.ok) {
    return currentRef;
  }

  const record = await materialStore.getMaterialRecord({ materialRef: currentRef.value });

  if (!record.ok) {
    return record;
  }

  if (record.value === null) {
    return ok({ materialId, title: materialId, warnings: ["material_not_found"] });
  }

  const canonical = record.value.canonicalRef === undefined
    ? ok(null)
    : await materialStore.getCanonical({ ref: record.value.canonicalRef });

  if (!canonical.ok) {
    return canonical;
  }

  const sourceEntities = await sourceEntitiesForRefs(materialStore, record.value.sourceRefs);

  if (!sourceEntities.ok) {
    return sourceEntities;
  }

  const sourceTrack = sourceEntities.value.find((entity) => entity.kind === "track");
  const warnings: string[] = [];

  const statusRecord = requestedRecord.value ?? record.value;

  if (requestedFields.has("status") && statusRecord.status !== "active") {
    warnings.push(`material_${statusRecord.status}`);
  }

  if (requestedFields.has("version")) {
    return ok({
      materialId: materialRefToMaterialId(record.value.materialRef),
      title: canonical.value?.label ?? sourceTrack?.label ?? record.value.materialRef.id,
      ...(!requestedFields.has("artist") || sourceTrack?.artistLabels?.[0] === undefined
        ? {}
        : { artist: { name: sourceTrack.artistLabels.join(", "), confidence: "source" as const } }),
      ...(!requestedFields.has("album") || sourceTrack?.releaseLabel === undefined
        ? {}
        : { album: { title: sourceTrack.releaseLabel, confidence: "source" as const } }),
      version: { status: "not_checked", confidence: "uncertain" },
      ...(warnings.length === 0 ? {} : { warnings }),
    });
  }

  return ok({
    materialId: materialRefToMaterialId(record.value.materialRef),
    title: canonical.value?.label ?? sourceTrack?.label ?? record.value.materialRef.id,
    ...(!requestedFields.has("artist") || sourceTrack?.artistLabels?.[0] === undefined
      ? {}
      : { artist: { name: sourceTrack.artistLabels.join(", "), confidence: "source" } }),
    ...(!requestedFields.has("album") || sourceTrack?.releaseLabel === undefined
      ? {}
      : { album: { title: sourceTrack.releaseLabel, confidence: "source" } }),
    ...(warnings.length === 0 ? {} : { warnings }),
  });
}

async function listPoolsForInput({
  materialStore,
  collection,
  input,
}: {
  materialStore: MaterialStorePort;
  collection?: CollectionPort;
  input: MaterialPoolsListInput;
}): Promise<Result<MaterialPoolsListOutput>> {
  const ownerScope = input.ownerScope ?? defaultOwnerScope;
  const kinds = input.kinds ?? ["source_library", "collection", "dynamic"];
  const pools: MaterialPoolsListOutput["pools"] = [];

  if (kinds.includes("source_library")) {
    const sourceItems = await materialStore.listSourceLibraryItems({ ownerScope, status: "present" });

    if (!sourceItems.ok) {
      return sourceItems;
    }

    pools.push({
      ref: "source_library:saved_tracks",
      label: "Saved tracks",
      type: "source_library",
      returnKinds: ["recording"],
      count: sourceItems.value.filter((item) => item.libraryKind === "saved_source_track").length,
    });
    pools.push({
      ref: "source_library:saved_albums",
      label: "Saved albums",
      type: "source_library",
      returnKinds: ["release", "recording"],
      count: sourceItems.value.filter((item) => item.libraryKind === "saved_source_release").length,
    });
  }

  if (kinds.includes("collection") && collection !== undefined) {
    const collections = await collection.listCollections({ ownerScope, includeRemoved: false });

    if (!collections.ok) {
      return collections;
    }

    pools.push(
      ...collections.value.map((entry) => ({
        ref: entry.id,
        label: entry.label,
        type: "collection" as const,
        returnKinds: [entry.collectionKind],
      })),
    );
  }

  if (kinds.includes("dynamic")) {
    pools.push({
      ref: "dynamic:related",
      label: "Related material",
      type: "dynamic",
      returnKinds: ["recording", "artist", "release"],
    });
  }

  return ok({ pools });
}

function appliedLabels(input: MaterialQueryInput): string[] {
  const applied: string[] = [];

  if (input.constraints?.availability !== undefined) {
    applied.push(`availability:${input.constraints.availability}`);
  }

  if (input.constraints?.identity !== undefined) {
    applied.push(`identity:${input.constraints.identity}`);
  }

  if (input.returnKind !== undefined) {
    applied.push(`returnKind:${input.returnKind}`);
  }

  if (input.preferenceHints?.prefer !== undefined) {
    applied.push(`prefer:${input.preferenceHints.prefer.join(",")}`);
  }

  if (input.preferenceHints?.avoid !== undefined) {
    applied.push(`avoid:${input.preferenceHints.avoid.join(",")}`);
  }

  if (input.preferenceHints?.activity !== undefined) {
    applied.push(`activity:${input.preferenceHints.activity}`);
  }

  if (input.preferenceHints?.mood !== undefined) {
    applied.push(`mood:${input.preferenceHints.mood.join(",")}`);
  }

  if (input.preferenceHints?.energy !== undefined) {
    applied.push(`energy:${input.preferenceHints.energy}`);
  }

  if (input.preferenceHints?.vocal !== undefined) {
    applied.push(`vocal:${input.preferenceHints.vocal}`);
  }

  if (input.exclude?.relations !== undefined) {
    applied.push(`exclude_relations:${input.exclude.relations.join(",")}`);
  }

  if (input.exclude?.recent !== undefined) {
    applied.push("exclude_recent");
  }

  return applied;
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined || !cursor.startsWith("mq_")) {
    return 0;
  }

  const offset = Number.parseInt(cursor.slice("mq_".length), 10);

  return Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
}

function encodeCursor(offset: number): string {
  return `mq_${offset}`;
}

function poolLabel(pool: NonNullable<MaterialQueryInput["pool"]>): string {
  if (pool.kind === "source_library") {
    return `source_library:${(pool.areas ?? ["saved_tracks"]).join(",")}`;
  }

  if (pool.kind === "collection") {
    return `collection:${pool.ref ?? pool.label ?? pool.relation ?? "all"}`;
  }

  if (pool.kind === "related") {
    return `related:${pool.relation}`;
  }

  return "all";
}

function libraryKindForArea(area: "saved_tracks" | "saved_albums" | "followed_artists"): PlatformLibraryItemKind {
  switch (area) {
    case "saved_tracks":
      return "saved_source_track";
    case "saved_albums":
      return "saved_source_release";
    case "followed_artists":
      return "saved_source_artist";
  }
}

function sourceKindToMaterialKind(kind: "track" | "release" | "artist"): string {
  switch (kind) {
    case "track":
      return "recording";
    case "release":
      return "release";
    case "artist":
      return "artist";
  }
}

function normalizeSeedKind(kind: string): string {
  switch (kind) {
    case "song":
    case "track":
      return "recording";
    case "album":
      return "release_group";
    default:
      return kind;
  }
}

function matchesQueryText(label: string, q: string | undefined): boolean {
  return q === undefined || label.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase());
}

function matchesAnyHint(material: MusicMaterial, hints: string[] | undefined): boolean {
  if (hints === undefined || hints.length === 0) {
    return false;
  }

  const text = searchableMaterialText(material);

  return normalizeHints(hints).some((hint) => text.includes(hint));
}

function preferredHints(preferenceHints: MaterialQueryInput["preferenceHints"]): string[] {
  if (preferenceHints === undefined) {
    return [];
  }

  return [
    ...(preferenceHints.prefer ?? []),
    ...(preferenceHints.activity === undefined ? [] : [preferenceHints.activity]),
    ...(preferenceHints.mood ?? []),
    ...(preferenceHints.energy === undefined ? [] : [preferenceHints.energy]),
    ...(preferenceHints.vocal === "prefer" ? vocalHints() : []),
  ];
}

function avoidHints(preferenceHints: MaterialQueryInput["preferenceHints"]): string[] {
  if (preferenceHints === undefined) {
    return [];
  }

  return [
    ...(preferenceHints.avoid ?? []),
    ...(preferenceHints.vocal === "avoid" ? vocalHints() : []),
  ];
}

function vocalHints(): string[] {
  return ["vocal", "voice", "singing", "lyrics"];
}

function hintScore(material: MusicMaterial, hints: string[] | undefined): number {
  if (hints === undefined || hints.length === 0) {
    return 0;
  }

  const text = searchableMaterialText(material);

  return normalizeHints(hints).filter((hint) => text.includes(hint)).length;
}

function searchableMaterialText(material: MusicMaterial): string {
  return [
    material.label,
    material.notes,
    ...(material.evidence ?? []).map((evidence) => evidence.note),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLocaleLowerCase();
}

function normalizeHints(hints: string[]): string[] {
  return hints
    .map((hint) => hint.trim().toLocaleLowerCase())
    .filter((hint) => hint.length > 0);
}

function matchesReturnKind(material: MusicMaterial, returnKind: MaterialQueryInput["returnKind"]): boolean {
  if (returnKind === undefined) {
    return true;
  }

  return normalizedReturnKinds(returnKind).has(material.kind);
}

function normalizedReturnKinds(returnKind: NonNullable<MaterialQueryInput["returnKind"]>): Set<string> {
  switch (returnKind) {
    case "album":
      return new Set(["release", "release_group"]);
    default:
      return new Set([returnKind]);
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return defaultLimit;
  }

  return Math.max(1, Math.min(50, Math.floor(limit)));
}

function dedupeMaterials(materials: MusicMaterial[]): MusicMaterial[] {
  const byRef = new Map<string, MusicMaterial>();

  for (const material of materials) {
    byRef.set(refKey(material.materialRef), material);
  }

  return [...byRef.values()];
}

function dedupeRefs(refs: Ref[]): Ref[] {
  const byKey = new Map<string, Ref>();

  for (const ref of refs) {
    byKey.set(refKey(ref), ref);
  }

  return [...byKey.values()];
}

function isMaterialCardStatus(value: unknown): value is RecentMaterialCardStatus {
  return (
    value === "playable" ||
    value === "found_no_link" ||
    value === "ambiguous" ||
    value === "blocked" ||
    value === "unresolved"
  );
}

function materialCardStatusFromEventValue(value: unknown): RecentMaterialCardStatus {
  return value === "playable_unverified"
    ? "playable"
    : isMaterialCardStatus(value) ? value : "unresolved";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
