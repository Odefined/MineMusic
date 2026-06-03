import type {
  CollectionItem,
  MaterialContextBriefInput,
  MaterialContextBriefOutput,
  MaterialPoolsListInput,
  MaterialPoolsListOutput,
  MaterialQueryItem,
  MaterialQueryInput,
  MaterialSelectInput,
  MaterialRelatedInput,
  MaterialRelatedOutput,
  MusicCandidate,
  MusicMaterial,
  PlatformLibraryItemKind,
  Ref,
  Result,
  SourceEntity,
  SourceLibraryItem,
} from "../../contracts/index.js";
import type {
  MaterialContextBriefPort,
  MaterialQueryCollectionReadPort,
  MaterialPoolsPort,
  MaterialQueryPort,
  MaterialProjectionStorePort,
  MaterialQueryStorePort,
  MaterialRelatedPort,
  MaterialResolvePort,
  MaterialSelectorPort,
  MaterialSourceLibraryMaterializerPort,
  SourceLibraryReadStorePort,
} from "../../ports/index.js";
import { sourceKindToMaterialKind } from "../kinds.js";
import {
  currentMaterialRecordForRef,
  materialIdToRef,
  materialRefToMaterialId,
  projectMaterialRecord,
  sourceEntitiesForRefs,
} from "../projection/index.js";

const defaultOwnerScope = "local_profile:default";
const defaultLimit = 10;

export type MaterialQueryService =
  MaterialQueryPort &
  MaterialRelatedPort &
  MaterialContextBriefPort &
  MaterialPoolsPort;

export type MaterialQueryServiceOptions = {
  materialStore: MaterialQueryStorePort;
  materialResolve: MaterialResolvePort;
  materialSelector: MaterialSelectorPort;
  sourceLibraryMaterializer: MaterialSourceLibraryMaterializerPort;
  collection?: MaterialQueryCollectionReadPort;
};

export function createMaterialQueryService({
  materialStore,
  materialResolve,
  materialSelector,
  sourceLibraryMaterializer,
  collection,
}: MaterialQueryServiceOptions): MaterialQueryService {
  const service: MaterialQueryService = {
    async query(input) {
      const ownerScope = input.ownerScope ?? defaultOwnerScope;
      const limit = normalizeLimit(input.limit);
      const pool = input.pool ?? { kind: "all" };
      const resolved = pool.kind === "collection"
        ? await collectionMaterials({
            materialStore,
            ...(collection === undefined ? {} : { collection }),
            ownerScope,
            pool,
            ...(input.q === undefined ? {} : { q: input.q }),
          })
        : pool.kind === "source_library"
        ? await sourceLibraryMaterials({
            materialStore,
            materialResolve,
            sourceLibraryMaterializer,
            ownerScope,
            pool,
            ...(input.q === undefined ? {} : { q: input.q }),
          })
        : pool.kind === "all"
        ? await allSourceLibraryMaterials({
            materialStore,
            sourceLibraryMaterializer,
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
  materialStore: MaterialQueryStorePort;
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
  sourceLibraryMaterializer,
  ownerScope,
  pool,
  q,
}: {
  materialStore: MaterialQueryStorePort;
  materialResolve: MaterialResolvePort;
  sourceLibraryMaterializer: MaterialSourceLibraryMaterializerPort;
  ownerScope: string;
  pool: Extract<NonNullable<MaterialQueryInput["pool"]>, { kind: "source_library" }>;
  q?: string;
}): Promise<Result<MusicMaterial[]>> {
  const target = pool.target ?? "library_item";
  const validation = validateSourceLibraryPoolTarget(pool);

  if (!validation.ok) {
    return validation;
  }

  const materials: MusicMaterial[] = [];

  for (const libraryKind of pool.libraryKinds) {
    const items = await materialStore.listSourceLibraryItems({
      ownerScope,
      status: "present",
      libraryKind,
      ...(pool.providerId === undefined ? {} : { providerId: pool.providerId }),
      ...(pool.providerAccountId === undefined ? {} : { providerAccountId: pool.providerAccountId }),
    });

    if (!items.ok) {
      return items;
    }

    for (const item of items.value) {
      if (target === "release_tracks") {
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

      const material = await sourceLibraryMaterializer.materialForSourceLibraryItem({
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
  sourceLibraryMaterializer,
  ownerScope,
  q,
}: {
  materialStore: MaterialQueryStorePort;
  sourceLibraryMaterializer: MaterialSourceLibraryMaterializerPort;
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
    const material = await sourceLibraryMaterializer.materialForSourceLibraryItem({
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

function validateSourceLibraryPoolTarget(
  pool: Extract<NonNullable<MaterialQueryInput["pool"]>, { kind: "source_library" }>,
): Result<void> {
  if (
    pool.target === "release_tracks" &&
    (pool.libraryKinds.length !== 1 || pool.libraryKinds[0] !== "saved_source_release")
  ) {
    return {
      ok: false,
      error: {
        code: "material_query.invalid_pool",
        message: "release_tracks target requires libraryKinds: ['saved_source_release'].",
        module: "material_query",
        retryable: false,
      },
    };
  }

  return ok(undefined);
}

async function collectionMaterials({
  materialStore,
  collection,
  ownerScope,
  pool,
  q,
}: {
  materialStore: MaterialProjectionStorePort;
  collection?: MaterialQueryCollectionReadPort;
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
  collection: MaterialQueryCollectionReadPort;
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
  ownerScope,
  item,
}: {
  materialStore: MaterialProjectionStorePort;
  ownerScope: string;
  item: CollectionItem;
}): Promise<Result<MusicMaterial[]>> {
  return materialForCollectionMaterialRef({
    materialStore,
    ownerScope,
    item,
    materialRef: item.materialRef,
  });
}

async function materialForCollectionMaterialRef({
  materialStore,
  ownerScope,
  item,
  materialRef,
}: {
  materialStore: MaterialProjectionStorePort;
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
    fallbackLabel: item.label,
  });

  return material.ok ? ok([material.value]) : material;
}

async function relatedPoolCandidates({
  materialStore,
  ownerScope,
  pool,
}: {
  materialStore: MaterialQueryStorePort;
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
  materialStore: MaterialProjectionStorePort,
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

type SelectableMaterialCandidate = {
  material: MusicMaterial;
  score?: number;
};

async function selectableMaterialsForQuery({
  materialStore,
  materials,
  returnKind,
  preferenceHints,
  exclude,
}: {
  materialStore: MaterialProjectionStorePort;
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
  materialStore: MaterialProjectionStorePort;
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
  materialStore: MaterialQueryStorePort;
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
  materialStore: MaterialQueryStorePort;
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
  materialStore: MaterialQueryStorePort,
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
  materialStore: MaterialProjectionStorePort,
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

async function canonicalArtistRefsForSourceArtistRefs(
  materialStore: MaterialQueryStorePort,
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
  materialStore: MaterialQueryStorePort,
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
  materialStore: MaterialQueryStorePort,
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
  materialStore: MaterialProjectionStorePort,
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
  materialStore: SourceLibraryReadStorePort;
  collection?: MaterialQueryCollectionReadPort;
  input: MaterialPoolsListInput;
}): Promise<Result<MaterialPoolsListOutput>> {
  const ownerScope = input.ownerScope ?? defaultOwnerScope;
  const kinds = input.kinds ?? ["all", "source_library", "collection"];
  const pools: MaterialPoolsListOutput["pools"] = [];

  if (kinds.includes("all")) {
    pools.push({
      label: "All material",
      pool: { kind: "all" },
      returnKinds: ["recording", "artist", "release", "release_group"],
    });
  }

  if (kinds.includes("source_library")) {
    const sourceItems = await materialStore.listSourceLibraryItems({ ownerScope, status: "present" });

    if (!sourceItems.ok) {
      return sourceItems;
    }

    pools.push(...sourceLibraryPoolsForItems(sourceItems.value));
  }

  if (kinds.includes("collection") && collection !== undefined) {
    const collections = await collection.listCollections({ ownerScope, includeRemoved: false });

    if (!collections.ok) {
      return collections;
    }

    for (const entry of collections.value) {
      const items = await collection.listItems({
        ownerScope,
        collectionId: entry.id,
        includeRemoved: false,
      });

      if (!items.ok) {
        return items;
      }

      if (items.value.length === 0 && input.includeEmpty !== true) {
        continue;
      }

      pools.push({
        label: entry.label,
        pool: {
          kind: "collection",
          ref: entry.id,
          label: entry.label,
          relation: entry.relationKind,
        },
        returnKinds: [entry.collectionKind],
        count: items.value.length,
      });
    }
  }

  return ok({ pools });
}

function sourceLibraryPoolsForItems(items: SourceLibraryItem[]): MaterialPoolsListOutput["pools"] {
  const grouped = new Map<string, {
    providerId: string;
    providerAccountId: string;
    libraryKind: PlatformLibraryItemKind;
    count: number;
  }>();

  for (const item of items) {
    const key = `${item.providerId}:${item.providerAccountId}:${item.libraryKind}`;
    const group = grouped.get(key);

    if (group === undefined) {
      grouped.set(key, {
        providerId: item.providerId,
        providerAccountId: item.providerAccountId,
        libraryKind: item.libraryKind,
        count: 1,
      });
      continue;
    }

    group.count += 1;
  }

  const pools: MaterialPoolsListOutput["pools"] = [];

  for (const group of grouped.values()) {
    pools.push({
      label: sourceLibraryPoolLabel(group),
      pool: {
        kind: "source_library",
        libraryKinds: [group.libraryKind],
        providerId: group.providerId,
        providerAccountId: group.providerAccountId,
      },
      returnKinds: [materialKindForLibraryKind(group.libraryKind)],
      count: group.count,
    });

    if (group.libraryKind === "saved_source_release") {
      pools.push({
        label: `Tracks from ${sourceLibraryPoolLabel(group)}`,
        pool: {
          kind: "source_library",
          libraryKinds: [group.libraryKind],
          providerId: group.providerId,
          providerAccountId: group.providerAccountId,
          target: "release_tracks",
        },
        returnKinds: ["recording"],
        count: group.count,
      });
    }
  }

  return pools;
}

function sourceLibraryPoolLabel({
  providerId,
  providerAccountId,
  libraryKind,
}: {
  providerId: string;
  providerAccountId: string;
  libraryKind: PlatformLibraryItemKind;
}): string {
  return `${providerId}/${providerAccountId} ${labelForLibraryKind(libraryKind)}`;
}

function labelForLibraryKind(libraryKind: PlatformLibraryItemKind): string {
  switch (libraryKind) {
    case "saved_source_track":
      return "saved tracks";
    case "saved_source_release":
      return "saved releases";
    case "saved_source_artist":
      return "saved artists";
  }
}

function materialKindForLibraryKind(libraryKind: PlatformLibraryItemKind): string {
  switch (libraryKind) {
    case "saved_source_track":
      return "recording";
    case "saved_source_release":
      return "release";
    case "saved_source_artist":
      return "artist";
  }
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
    return [
      "source_library",
      pool.libraryKinds.join(","),
      pool.target ?? "library_item",
    ].join(":");
  }

  if (pool.kind === "collection") {
    return `collection:${pool.ref ?? pool.label ?? pool.relation ?? "all"}`;
  }

  if (pool.kind === "related") {
    return `related:${pool.relation}`;
  }

  return "all";
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

function sameRef(left: Ref, right: Ref): boolean {
  return refKey(left) === refKey(right);
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
