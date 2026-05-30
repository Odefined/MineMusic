import type {
  CollectionItem,
  MaterialActivity,
  MaterialCard,
  MaterialCardAction,
  MaterialCardStatus,
  MaterialContextBriefInput,
  MaterialContextBriefOutput,
  MaterialPoolsListInput,
  MaterialPoolsListOutput,
  MaterialQueryInput,
  MaterialQueryOutput,
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
} from "../contracts/index.js";
import type {
  CollectionPort,
  MaterialCardsPort,
  MaterialQueryPort,
  MaterialRelatedPort,
  MaterialResolvePort,
  MaterialStorePort,
} from "../ports/index.js";

const defaultOwnerScope = "local_profile:default";
const defaultLimit = 10;
const defaultRecentCardLimit = 5;

export type MaterialQueryService = MaterialQueryPort & MaterialRelatedPort & MaterialCardsPort;

export type MaterialQueryServiceOptions = {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  collection?: CollectionPort;
  clock?: () => string;
};

export function createMaterialQueryService({
  materialStore,
  materialResolve,
  collection,
  clock = () => new Date().toISOString(),
}: MaterialQueryServiceOptions): MaterialQueryService {
  const service: MaterialQueryService = {
    async resolveCards(input) {
      const ownerScope = input.ownerScope ?? defaultOwnerScope;
      const materials = await resolveSeeds({
        materialResolve,
        ownerScope,
        seeds: input.seeds,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      });

      if (!materials.ok) {
        return materials;
      }

      return ok({
        items: materials.value.map((material) => toMaterialCard(material)),
      });
    },

    async query(input) {
      const ownerScope = input.ownerScope ?? defaultOwnerScope;
      const limit = normalizeLimit(input.limit);
      const pool = input.pool ?? { kind: "all" };
      const candidates = await candidatesForPool({
        materialStore,
        ...(collection === undefined ? {} : { collection }),
        ownerScope,
        pool,
        ...(input.q === undefined ? {} : { q: input.q }),
      });

      if (!candidates.ok) {
        return candidates;
      }

      const resolved = await resolveCandidates({
        materialResolve,
        ownerScope,
        candidates: candidates.value,
      });

      if (!resolved.ok) {
        return resolved;
      }

      const filtered = await filterMaterials({
        materialStore,
        ownerScope,
        materials: resolved.value,
        constraints: input.constraints,
        exclude: input.exclude,
        clock,
      });

      if (!filtered.ok) {
        return filtered;
      }

      const ordered = orderMaterials(filtered.value, input.order, ownerScope);
      const items = ordered.slice(0, limit).map((material) => toMaterialCard(material));

      return ok({
        basis: {
          pool: poolLabel(pool),
          applied: appliedLabels(input),
        },
        items,
      });
    },

    async related(input) {
      return relatedForInput({
        materialStore,
        materialResolve,
        ownerScope: input.ownerScope ?? defaultOwnerScope,
        input,
        clock,
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

export function materialRefToCardRef(materialRef: Ref): string {
  return `mat_${encodeURIComponent(materialRef.id)}`;
}

export function cardRefToMaterialRef(ref: string): Ref {
  const id = ref.startsWith("mat_") ? decodeURIComponent(ref.slice("mat_".length)) : ref;

  return {
    namespace: "minemusic",
    kind: "material",
    id,
  };
}

export function toMaterialCard(material: MusicMaterial): MaterialCard {
  const subtitle = subtitleForMaterial(material);
  const actions = toMaterialCardActions(material);

  return {
    ref: materialRefToCardRef(material.materialRef),
    title: material.label,
    ...(subtitle === undefined ? {} : { subtitle }),
    status: toMaterialCardStatus(material),
    ...(material.notes === undefined ? {} : { reason: material.notes }),
    ...(actions.length === 0 ? {} : { actions }),
  };
}

export function toMaterialCardStatus(material: MusicMaterial): MaterialCardStatus {
  if (material.identityState === "ambiguous") {
    return "ambiguous";
  }

  switch (material.state) {
    case "confirmed_playable":
      return material.identityState === "canonical_confirmed" ? "playable" : "playable_unverified";
    case "source_only_playable":
      return "playable_unverified";
    case "grounded":
      return "found_no_link";
    case "blocked":
      return "blocked";
    case "unresolved":
    case "exploration":
    case "verbal_only":
      return "unresolved";
  }
}

export function toMaterialCardActions(material: MusicMaterial): MaterialCardAction[] {
  const actions: MaterialCardAction[] = [];

  if ((material.playableLinks ?? []).length > 0 && material.state !== "blocked") {
    actions.push("open");
  }

  actions.push("more_like_this");

  if (hasArtistBasis(material)) {
    actions.push("same_artist");
  }

  if (hasAlbumBasis(material)) {
    actions.push("same_album");
  }

  if (material.identityState !== "canonical_confirmed" || (material.sourceRefs?.length ?? 0) > 0) {
    actions.push("not_this_version");
  }

  actions.push("block", "remember");

  return actions;
}

export function recentCardsFromEvents(
  events: Array<{ id: string; type: string; payload: unknown }>,
  limit = defaultRecentCardLimit,
): NonNullable<import("../contracts/index.js").StageContext["recentCards"]> {
  const recentCards: NonNullable<import("../contracts/index.js").StageContext["recentCards"]> = [];

  for (const event of [...events].reverse()) {
    if (event.type !== "recommendation.presented" && event.type !== "recommendation_presented") {
      continue;
    }

    if (!isRecord(event.payload) || !Array.isArray(event.payload.cards)) {
      continue;
    }

    for (const [index, card] of event.payload.cards.entries()) {
      if (!isRecord(card) || typeof card.ref !== "string" || typeof card.title !== "string") {
        continue;
      }

      recentCards.push({
        ref: card.ref,
        title: card.title,
        ...(typeof card.subtitle === "string" ? { subtitle: card.subtitle } : {}),
        position: index + 1,
        eventId: event.id,
        status: isMaterialCardStatus(card.status) ? card.status : "unresolved",
      });

      if (recentCards.length >= limit) {
        return recentCards;
      }
    }
  }

  return recentCards;
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
}): Promise<Result<MusicMaterial[]>> {
  if (seeds.length === 0) {
    return ok([]);
  }

  const candidates = seeds.map((seed, index) => seedToCandidate(seed, index));
  const resolved = await resolveCandidates({
    materialResolve,
    ownerScope,
    candidates,
    ...(limit === undefined ? {} : { limitPerCandidate: limit }),
  });

  if (!resolved.ok) {
    return resolved;
  }

  return ok(resolved.value);
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

async function candidatesForPool({
  materialStore,
  collection,
  ownerScope,
  pool,
  q,
}: {
  materialStore: MaterialStorePort;
  collection?: CollectionPort;
  ownerScope: string;
  pool: NonNullable<MaterialQueryInput["pool"]>;
  q?: string;
}): Promise<Result<MusicCandidate[]>> {
  switch (pool.kind) {
    case "source_library":
      return sourceLibraryCandidates({
        materialStore,
        ownerScope,
        pool,
        ...(q === undefined ? {} : { q }),
      });
    case "collection":
      return collectionCandidates({
        ...(collection === undefined ? {} : { collection }),
        ownerScope,
        pool,
        ...(q === undefined ? {} : { q }),
      });
    case "related":
      return relatedPoolCandidates({ materialStore, ownerScope, pool });
    case "all":
      return allSourceLibraryCandidates({
        materialStore,
        ownerScope,
        ...(q === undefined ? {} : { q }),
      });
  }
}

async function sourceLibraryCandidates({
  materialStore,
  ownerScope,
  pool,
  q,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  pool: Extract<NonNullable<MaterialQueryInput["pool"]>, { kind: "source_library" }>;
  q?: string;
}): Promise<Result<MusicCandidate[]>> {
  const areas = pool.areas ?? ["saved_tracks"];
  const candidates: MusicCandidate[] = [];

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

    for (const item of items.value.filter((item) => matchesQueryText(item.label, q))) {
      if (area === "saved_albums" && pool.expand === "tracks") {
        const expanded = await tracklistCandidatesForReleaseItem(materialStore, item);

        if (!expanded.ok) {
          return expanded;
        }

        candidates.push(...expanded.value);
        continue;
      }

      candidates.push(candidateForSourceLibraryItem(item));
    }
  }

  return ok(candidates);
}

async function allSourceLibraryCandidates({
  materialStore,
  ownerScope,
  q,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  q?: string;
}): Promise<Result<MusicCandidate[]>> {
  const items = await materialStore.listSourceLibraryItems({
    ownerScope,
    status: "present",
  });

  if (!items.ok) {
    return items;
  }

  return ok(items.value.filter((item) => matchesQueryText(item.label, q)).map(candidateForSourceLibraryItem));
}

async function collectionCandidates({
  collection,
  ownerScope,
  pool,
  q,
}: {
  collection?: CollectionPort;
  ownerScope: string;
  pool: Extract<NonNullable<MaterialQueryInput["pool"]>, { kind: "collection" }>;
  q?: string;
}): Promise<Result<MusicCandidate[]>> {
  if (collection === undefined) {
    return ok([]);
  }

  const items = await collection.listItems({
    ownerScope,
    ...(pool.ref === undefined ? {} : { collectionId: pool.ref }),
    ...(pool.relation === undefined ? {} : { relationKind: pool.relation }),
  });

  if (!items.ok) {
    return items;
  }

  return ok(
    items.value
      .filter((item) => matchesQueryText(item.label, q))
      .map((item) => candidateForCollectionItem(item)),
  );
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
    ref: pool.ref,
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

function candidateForSourceLibraryItem(item: SourceLibraryItem): MusicCandidate {
  return {
    id: `source-library:${item.id}`,
    label: item.label,
    expectedKind: sourceKindToMaterialKind(item.sourceKind),
    sourceRef: item.sourceRef,
    query: {
      text: item.label,
      sourceRef: item.sourceRef,
    },
    sourceLibraryScope: {
      providerId: item.providerId,
      providerAccountId: item.providerAccountId,
      libraryKind: item.libraryKind,
      status: "present",
    },
  };
}

function candidateForCollectionItem(item: CollectionItem): MusicCandidate {
  return {
    id: `collection:${item.id}`,
    label: item.label,
    expectedKind: item.canonicalRef.kind,
    canonicalRef: item.canonicalRef,
    query: {
      text: item.label,
      canonicalRef: item.canonicalRef,
    },
  };
}

function seedToCandidate(seed: ResolveSeed, index: number): MusicCandidate {
  const sourceRef = seed.sourceRef;
  const canonicalRef = seed.canonicalRef;
  const text = seed.text ?? seed.ref ?? sourceRef?.label ?? canonicalRef?.label ?? `seed-${index + 1}`;

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

async function filterMaterials({
  materialStore,
  ownerScope,
  materials,
  constraints,
  exclude,
  clock,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  materials: MusicMaterial[];
  constraints?: MaterialQueryInput["constraints"];
  exclude?: MaterialQueryInput["exclude"];
  clock: () => string;
}): Promise<Result<MusicMaterial[]>> {
  const excludedRefs = new Set(exclude?.refs ?? []);
  const filtered: MusicMaterial[] = [];

  for (const material of materials) {
    if (excludedRefs.has(materialRefToCardRef(material.materialRef))) {
      continue;
    }

    if (constraints?.availability === "playable" && (material.playableLinks?.length ?? 0) === 0) {
      continue;
    }

    if (constraints?.identity === "confirmed_only" && material.identityState !== "canonical_confirmed") {
      continue;
    }

    const relationExcluded = await excludedByRelations(materialStore, ownerScope, material, exclude?.relations);

    if (!relationExcluded.ok) {
      return relationExcluded;
    }

    if (relationExcluded.value) {
      continue;
    }

    const recentExcluded = await excludedByRecentActivity({
      materialStore,
      ownerScope,
      materialRef: material.materialRef,
      recent: exclude?.recent,
      now: clock(),
    });

    if (!recentExcluded.ok) {
      return recentExcluded;
    }

    if (recentExcluded.value) {
      continue;
    }

    filtered.push(material);
  }

  return ok(filtered);
}

async function excludedByRelations(
  materialStore: MaterialStorePort,
  ownerScope: string,
  material: MusicMaterial,
  excludedRelations: NonNullable<NonNullable<MaterialQueryInput["exclude"]>["relations"]> | undefined,
): Promise<Result<boolean>> {
  if (excludedRelations === undefined || excludedRelations.length === 0) {
    return ok(false);
  }

  const relations = await materialStore.listMaterialRelations({
    ownerScope,
    materialRef: material.materialRef,
    status: "active",
  });

  if (!relations.ok) {
    return relations;
  }

  const sourceRefKeys = new Set((material.sourceRefs ?? []).map(refKey));

  return ok(
    relations.value.some((relation) => {
      if (!excludedRelations.includes(relation.relationKind as never)) {
        return false;
      }

      return relation.scope.level !== "source" || sourceRefKeys.has(refKey(relation.scope.sourceRef));
    }),
  );
}

async function excludedByRecentActivity({
  materialStore,
  ownerScope,
  materialRef,
  recent,
  now,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  materialRef: Ref;
  recent?: NonNullable<MaterialQueryInput["exclude"]>["recent"];
  now: string;
}): Promise<Result<boolean>> {
  if (recent === undefined || recent.mode === "soft") {
    return ok(false);
  }

  const activity = await materialStore.getMaterialActivity({ ownerScope, materialRef });

  if (!activity.ok) {
    return activity;
  }

  if (activity.value === null) {
    return ok(false);
  }

  return ok(
    matchesRecent(activity.value.lastRecommendedAt, activity.value.recommendedCountSession, recent.recommended, now) ||
      matchesRecent(activity.value.lastOpenedAt, activity.value.openedCountSession, recent.opened, now) ||
      matchesRecent(activity.value.lastPlayedAt, activity.value.playedCountSession, recent.played, now),
  );
}

function matchesRecent(
  timestamp: string | undefined,
  sessionCount: number | undefined,
  window: "session" | "1h" | "24h" | "7d" | undefined,
  now: string,
): boolean {
  if (window === undefined) {
    return false;
  }

  if (window === "session") {
    return (sessionCount ?? 0) > 0;
  }

  if (timestamp === undefined) {
    return false;
  }

  return Date.parse(timestamp) >= Date.parse(now) - recentWindowMs(window);
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

async function relatedForInput({
  materialStore,
  materialResolve,
  ownerScope,
  input,
  clock,
}: {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  ownerScope: string;
  input: MaterialRelatedInput;
  clock: () => string;
}): Promise<Result<MaterialRelatedOutput>> {
  const related = await relatedCandidates({
    materialStore,
    ownerScope,
    ref: input.ref,
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

  const seedMaterialRef = cardRefToMaterialRef(input.ref);
  const filtered = await filterMaterials({
    materialStore,
    ownerScope,
    materials: resolved.value.filter((material) => !sameRef(material.materialRef, seedMaterialRef)),
    constraints: input.constraints,
    exclude: {
      ...input.exclude,
      refs: [...(input.exclude?.refs ?? []), input.ref],
    },
    clock,
  });

  if (!filtered.ok) {
    return filtered;
  }

  return ok({
    basis: related.value.basis,
    ...(related.value.basisLabel === undefined ? {} : { basisLabel: related.value.basisLabel }),
    items: filtered.value.slice(0, normalizeLimit(input.limit)).map(toMaterialCard),
  });
}

async function relatedCandidates({
  materialStore,
  ref,
  relation,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  ref: string;
  relation: MaterialRelatedInput["relation"];
}): Promise<Result<{
  basis: MaterialRelatedOutput["basis"];
  basisLabel?: string;
  candidates: MusicCandidate[];
}>> {
  const seedRecord = await materialStore.getMaterialRecord({ materialRef: cardRefToMaterialRef(ref) });

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
  const record = await materialStore.getMaterialRecord({ materialRef: cardRefToMaterialRef(input.ref) });

  if (!record.ok) {
    return record;
  }

  if (record.value === null) {
    return ok({ ref: input.ref, title: input.ref, warnings: ["material_not_found"] });
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

  return ok({
    ref: input.ref,
    title: canonical.value?.label ?? sourceTrack?.label ?? record.value.materialRef.id,
    ...(sourceTrack?.artistLabels?.[0] === undefined
      ? {}
      : { artist: { name: sourceTrack.artistLabels.join(", "), confidence: "source" } }),
    ...(sourceTrack?.releaseLabel === undefined
      ? {}
      : { album: { title: sourceTrack.releaseLabel, confidence: "source" } }),
    ...(record.value.status === "active" ? {} : { warnings: [`material_${record.value.status}`] }),
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

function orderMaterials(
  materials: MusicMaterial[],
  order: MaterialQueryInput["order"],
  ownerScope: string,
): MusicMaterial[] {
  const deduped = dedupeMaterials(materials);

  if (order === "random") {
    return [...deduped].sort((left, right) => refKey(left.materialRef).localeCompare(refKey(right.materialRef)));
  }

  if (order === "least_recently_recommended") {
    return [...deduped].sort((left, right) => {
      const leftKey = `${ownerScope}:${left.materialRef.id}`;
      const rightKey = `${ownerScope}:${right.materialRef.id}`;

      return leftKey.localeCompare(rightKey);
    });
  }

  return deduped;
}

function appliedLabels(input: MaterialQueryInput): string[] {
  const applied: string[] = [];

  if (input.constraints?.availability !== undefined) {
    applied.push(`availability:${input.constraints.availability}`);
  }

  if (input.constraints?.identity !== undefined) {
    applied.push(`identity:${input.constraints.identity}`);
  }

  if (input.exclude?.relations !== undefined) {
    applied.push(`exclude_relations:${input.exclude.relations.join(",")}`);
  }

  if (input.exclude?.recent !== undefined) {
    applied.push("exclude_recent");
  }

  return applied;
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

function subtitleForMaterial(material: MusicMaterial): string | undefined {
  const evidenceNote = material.evidence?.find((evidence) => evidence.note !== undefined)?.note;

  if (evidenceNote === undefined || evidenceNote.includes(":")) {
    return undefined;
  }

  return evidenceNote;
}

function hasArtistBasis(material: MusicMaterial): boolean {
  return (material.evidence ?? []).some((evidence) => evidence.kind.includes("artist")) ||
    (material.sourceRefs ?? []).some((sourceRef) => sourceRef.kind === "artist" || sourceRef.kind === "track");
}

function hasAlbumBasis(material: MusicMaterial): boolean {
  return (material.evidence ?? []).some((evidence) => evidence.kind.includes("album") || evidence.kind.includes("release")) ||
    (material.sourceRefs ?? []).some((sourceRef) => sourceRef.kind === "release" || sourceRef.kind === "track");
}

function matchesQueryText(label: string, q: string | undefined): boolean {
  return q === undefined || label.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase());
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

function isMaterialCardStatus(value: unknown): value is MaterialCardStatus {
  return (
    value === "playable" ||
    value === "playable_unverified" ||
    value === "found_no_link" ||
    value === "ambiguous" ||
    value === "blocked" ||
    value === "unresolved"
  );
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
