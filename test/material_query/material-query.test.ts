import type {
  CollectionPort,
  MaterialStorePort,
  SourceGroundingPort,
} from "../../src/ports/index.js";
import type {
  Collection,
  CollectionItem,
  CanonicalRecord,
  Ref,
  Result,
  SourceReleaseTracklistItem,
  SourceMaterial,
} from "../../src/contracts/index.js";
import { createEventService } from "../../src/events/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material_store/index.js";
import { createMaterialQueryService, materialRefToCardRef } from "../../src/material_query/index.js";
import { createMaterialResolveService } from "../../src/material_resolve/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryEventRepository,
  createInMemoryMaterialActivityRepository,
  createInMemorySourceEntityStoreRepository,
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

async function querySavedTracksReturnsOnlySavedTrackMaterials(): Promise<void> {
  const savedSourceRef = ref("source:fixture", "track", "saved-track");
  const outsideSourceRef = ref("source:fixture", "track", "outside-track");
  const { materialStore, sourceGrounding } = createMaterialQueryHarness([
    sourceMaterial("Saved Track", savedSourceRef),
    sourceMaterial("Outside Track", outsideSourceRef),
  ]);
  await putLibraryTrack(materialStore, savedSourceRef, "Saved Track");

  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({
      materialStore,
      sourceGrounding,
    }),
  });
  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "saved track query should not return pool-external materials");
  assert(output.items[0]?.title === "Saved Track", "saved track query should return the saved track card");
}

async function resolveCardsResolvesSourceBackedCardRefsWithoutTextSearch(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "source-ref-seed-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Source Ref Seed Track", sourceRef),
  ]);
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));

  const output = await assertOk(
    materialQuery.resolveCards({
      ownerScope: "local_profile:default",
      seeds: [{ ref: materialRefToCardRef(record.materialRef) }],
    }),
  );

  assert(output.items.length === 1, "resolve cards should return one card for a source-backed material ref");
  assert(output.items[0]?.title === "Source Ref Seed Track", "resolve cards should load the referenced source material instead of text-searching the card ref");
  assert(output.items[0]?.status === "playable_unverified", "source-backed material refs should preserve source-backed status");
}

async function resolveCardsResolvesCanonicalConfirmedCardRefs(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "canonical-ref-seed-track");
  const canonicalRef = ref("minemusic", "recording", "canonical-ref-seed");
  const canonical: CanonicalRecord = {
    ref: canonicalRef,
    kind: "recording",
    label: "Canonical Ref Seed",
    status: "active",
  };
  const { canonicalRepository, materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Provider Ref Seed", sourceRef),
  ]);
  await assertOk(canonicalRepository.put(canonical));
  const record = await assertOk(materialStore.getOrCreateByCanonicalRef({ canonicalRef, kind: "recording", sourceRefs: [sourceRef] }));

  const output = await assertOk(
    materialQuery.resolveCards({
      ownerScope: "local_profile:default",
      seeds: [{ ref: materialRefToCardRef(record.materialRef) }],
    }),
  );

  assert(output.items.length === 1, "resolve cards should return one card for a canonical material ref");
  assert(output.items[0]?.title === "Canonical Ref Seed", "canonical material refs should project canonical display labels");
  assert(output.items[0]?.status === "playable", "canonical material refs with source links should become playable cards");
}

async function resolveCardsReturnsUnresolvedForUnknownCardRefs(): Promise<void> {
  const { materialQuery } = createMaterialQueryServiceHarness([]);

  const output = await assertOk(
    materialQuery.resolveCards({
      ownerScope: "local_profile:default",
      seeds: [{ ref: "mat_missing-material" }],
    }),
  );

  assert(output.items.length === 1, "unknown material refs should still produce a decision card");
  assert(output.items[0]?.status === "unresolved", "unknown material refs should be unresolved");
  assert(output.items[0]?.reason === "material_not_found", "unknown material refs should explain material_not_found");
}

async function querySavedAlbumsExpandedToTracksReturnsRecordingCards(): Promise<void> {
  const releaseRef = ref("source:fixture", "release", "saved-release");
  const firstTrackRef = ref("source:fixture", "track", "album-track-1");
  const secondTrackRef = ref("source:fixture", "track", "album-track-2");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Album Track One", firstTrackRef),
    sourceMaterial("Album Track Two", secondTrackRef),
  ]);
  await putLibraryRelease(materialStore, releaseRef, "Saved Album", [
    { sourceRef: firstTrackRef, title: "Album Track One" },
    { sourceRef: secondTrackRef, title: "Album Track Two" },
  ]);

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_albums"], expand: "tracks" },
      limit: 10,
    }),
  );

  assert(output.items.length === 2, "expanded saved albums should return track cards");
  assert(output.items.every((item) => item.status === "playable_unverified"), "expanded album tracks should resolve as recording cards");
  assert(
    output.items.map((item) => item.title).join(",") === "Album Track One,Album Track Two",
    "expanded album query should preserve release tracklist order",
  );
}

async function queryReturnKindFiltersResolvedMaterials(): Promise<void> {
  const trackRef = ref("source:fixture", "track", "return-kind-track");
  const artistRef = ref("source:fixture", "artist", "return-kind-artist");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Return Kind Track", trackRef),
    sourceMaterial("Return Kind Artist", artistRef, "artist"),
  ]);
  await putLibraryTrack(materialStore, trackRef, "Return Kind Track");
  await putLibraryArtist(materialStore, artistRef, "Return Kind Artist");

  const recordings = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks", "followed_artists"] },
      returnKind: "recording",
      limit: 10,
    }),
  );
  const artists = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks", "followed_artists"] },
      returnKind: "artist",
      limit: 10,
    }),
  );

  assert(recordings.items.length === 1 && recordings.items[0]?.title === "Return Kind Track", "returnKind recording should keep only recording materials");
  assert(artists.items.length === 1 && artists.items[0]?.title === "Return Kind Artist", "returnKind artist should keep only artist materials");
}

async function querySavedAlbumsAppliesTrackLevelTextAfterExpansion(): Promise<void> {
  const releaseRef = ref("source:fixture", "release", "query-release");
  const firstTrackRef = ref("source:fixture", "track", "query-album-track-1");
  const secondTrackRef = ref("source:fixture", "track", "query-album-track-2");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Quiet Needle", firstTrackRef),
    sourceMaterial("Bright Lantern", secondTrackRef),
  ]);
  await putLibraryRelease(materialStore, releaseRef, "Mismatched Album Label", [
    { sourceRef: firstTrackRef, title: "Quiet Needle" },
    { sourceRef: secondTrackRef, title: "Bright Lantern" },
  ]);

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_albums"], expand: "tracks" },
      q: "Lantern",
      returnKind: "recording",
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "saved album expansion should apply q to expanded track labels");
  assert(output.items[0]?.title === "Bright Lantern", "saved album expansion should find matching track labels");
}

async function queryCursorPaginatesMaterialCards(): Promise<void> {
  const firstRef = ref("source:fixture", "track", "cursor-track-1");
  const secondRef = ref("source:fixture", "track", "cursor-track-2");
  const thirdRef = ref("source:fixture", "track", "cursor-track-3");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Cursor Track One", firstRef),
    sourceMaterial("Cursor Track Two", secondRef),
    sourceMaterial("Cursor Track Three", thirdRef),
  ]);
  await putLibraryTrack(materialStore, firstRef, "Cursor Track One");
  await putLibraryTrack(materialStore, secondRef, "Cursor Track Two");
  await putLibraryTrack(materialStore, thirdRef, "Cursor Track Three");

  const firstPage = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      limit: 2,
    }),
  );
  assert(firstPage.nextCursor !== undefined, "first cursor page should expose a continuation cursor");
  const secondPage = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      cursor: firstPage.nextCursor,
      limit: 2,
    }),
  );

  assert(firstPage.items.length === 2, "first cursor page should respect limit");
  assert(secondPage.items.length === 1, "second cursor page should continue after the first page");
  assert(secondPage.items[0]?.title === "Cursor Track Three", "cursor should preserve deterministic pool order");
}

async function leastRecentlyRecommendedOrderUsesMaterialActivity(): Promise<void> {
  const neverRef = ref("source:fixture", "track", "never-recommended-track");
  const oldRef = ref("source:fixture", "track", "old-recommended-track");
  const newRef = ref("source:fixture", "track", "new-recommended-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Never Recommended", neverRef),
    sourceMaterial("Old Recommended", oldRef),
    sourceMaterial("New Recommended", newRef),
  ]);
  await putLibraryTrack(materialStore, neverRef, "Never Recommended");
  await putLibraryTrack(materialStore, oldRef, "Old Recommended");
  await putLibraryTrack(materialStore, newRef, "New Recommended");
  await putRecommendedActivityForSource(materialStore, oldRef, "2026-05-30T01:00:00.000Z");
  await putRecommendedActivityForSource(materialStore, newRef, "2026-05-30T02:00:00.000Z");

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      order: "least_recently_recommended",
      limit: 10,
    }),
  );

  assert(
    output.items.map((item) => item.title).join(",") === "Never Recommended,Old Recommended,New Recommended",
    "least_recently_recommended should use MaterialActivity timestamps",
  );
}

async function recentlyAddedOrderUsesSourceLibraryTimestamps(): Promise<void> {
  const olderRef = ref("source:fixture", "track", "older-library-track");
  const newerRef = ref("source:fixture", "track", "newer-library-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Older Library Track", olderRef),
    sourceMaterial("Newer Library Track", newerRef),
  ]);
  await putLibraryTrack(materialStore, olderRef, "Older Library Track", "2026-05-28T00:00:00.000Z");
  await putLibraryTrack(materialStore, newerRef, "Newer Library Track", "2026-05-30T00:00:00.000Z");

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      order: "recently_added",
      limit: 10,
    }),
  );

  assert(
    output.items.map((item) => item.title).join(",") === "Newer Library Track,Older Library Track",
    "recently_added should order source-library materials by newest library timestamp first",
  );
}

async function queryPreferenceHintsFilterAndRankMaterials(): Promise<void> {
  const pianoRef = ref("source:fixture", "track", "preference-piano-track");
  const ambientRef = ref("source:fixture", "track", "preference-ambient-track");
  const sleepyPianoRef = ref("source:fixture", "track", "preference-sleepy-piano-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Medium Writing Calm Piano", pianoRef),
    sourceMaterial("Ambient Focus", ambientRef),
    sourceMaterial("Sleepy Vocal Piano", sleepyPianoRef),
  ]);
  await putLibraryTrack(materialStore, pianoRef, "Medium Writing Calm Piano");
  await putLibraryTrack(materialStore, ambientRef, "Ambient Focus");
  await putLibraryTrack(materialStore, sleepyPianoRef, "Sleepy Vocal Piano");

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      preferenceHints: {
        activity: "writing",
        mood: ["calm"],
        energy: "medium",
        vocal: "avoid",
        prefer: ["piano"],
        avoid: ["sleepy"],
      },
      limit: 10,
    }),
  );

  assert(
    output.items.map((item) => item.title).join(",") === "Medium Writing Calm Piano,Ambient Focus",
    "preference hints should rank positive text hints while avoid and vocal=avoid hard-filter matching materials",
  );
  assert(output.basis?.applied?.includes("activity:writing"), "preference activity should be reported as applied");
  assert(output.basis?.applied?.includes("mood:calm"), "preference mood should be reported as applied");
  assert(output.basis?.applied?.includes("energy:medium"), "preference energy should be reported as applied");
  assert(output.basis?.applied?.includes("vocal:avoid"), "preference vocal policy should be reported as applied");
}

async function queryCollectionPoolCanResolveByLabel(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "collection-label-source-track");
  const canonicalRef = ref("minemusic", "recording", "collection-label-canonical-track");
  const canonical: CanonicalRecord = {
    ref: canonicalRef,
    kind: "recording",
    label: "Collection Label Track",
    status: "active",
  };
  const collectionRecord: Collection = {
    id: "collection-night-coding",
    ownerScope: "local_profile:default",
    collectionKind: "recording",
    relationKind: "custom",
    label: "Night coding",
    createdAt: "2026-05-30T00:00:00.000Z",
  };
  const collectionItem: CollectionItem = {
    id: "collection-item-night-track",
    collectionId: collectionRecord.id,
    canonicalRef,
    label: "Collection Label Track",
    createdAt: "2026-05-30T00:00:00.000Z",
  };
  const collection = createCollectionPortStub([collectionRecord], [collectionItem]);
  const { canonicalRepository, materialQuery } = createMaterialQueryServiceHarness(
    [sourceMaterial("Collection Label Track", sourceRef)],
    { collection },
  );
  await assertOk(canonicalRepository.put(canonical));

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "collection", label: "Night coding" },
      returnKind: "recording",
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "collection label pool should resolve matching collection items");
  assert(output.items[0]?.title === "Collection Label Track", "collection label pool should return the collection item card");
}

async function explicitPoolDoesNotFallbackOutsidePool(): Promise<void> {
  const outsideSourceRef = ref("source:fixture", "track", "outside-track");
  const { materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Outside Track", outsideSourceRef),
  ]);

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      limit: 10,
    }),
  );

  assert(output.items.length === 0, "explicit source-library pool should not fallback to provider search results");
}

async function relationExclusionsRemoveBlockedWrongVersionAndNotPlayable(): Promise<void> {
  const blockedRef = ref("source:fixture", "track", "blocked-track");
  const wrongVersionRef = ref("source:fixture", "track", "wrong-version-track");
  const notPlayableRef = ref("source:fixture", "track", "not-playable-track");
  const keptRef = ref("source:fixture", "track", "kept-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Blocked Track", blockedRef),
    sourceMaterial("Wrong Version Track", wrongVersionRef),
    sourceMaterial("Not Playable Track", notPlayableRef),
    sourceMaterial("Kept Track", keptRef),
  ]);
  await putLibraryTrack(materialStore, blockedRef, "Blocked Track");
  await putLibraryTrack(materialStore, wrongVersionRef, "Wrong Version Track");
  await putLibraryTrack(materialStore, notPlayableRef, "Not Playable Track");
  await putLibraryTrack(materialStore, keptRef, "Kept Track");
  await putRelationForSource(materialStore, "blocked-relation", blockedRef, "blocked");
  await putRelationForSource(materialStore, "wrong-version-relation", wrongVersionRef, "wrong_version");
  await putRelationForSource(materialStore, "not-playable-relation", notPlayableRef, "not_playable");

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      exclude: { relations: ["blocked", "wrong_version", "not_playable"] },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "relation exclusions should remove active negative relation materials");
  assert(output.items[0]?.title === "Kept Track", "relation exclusions should keep unrelated material");
}

async function recentRecommendedHardExcludeWorks(): Promise<void> {
  const recentRef = ref("source:fixture", "track", "recent-track");
  const keptRef = ref("source:fixture", "track", "not-recent-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Recent Track", recentRef),
    sourceMaterial("Not Recent Track", keptRef),
  ]);
  await putLibraryTrack(materialStore, recentRef, "Recent Track");
  await putLibraryTrack(materialStore, keptRef, "Not Recent Track");
  const recentRecord = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef: recentRef, kind: "recording" }));
  await assertOk(
    materialStore.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: recentRecord.materialRef,
        lastRecommendedAt: "2026-05-30T01:00:00.000Z",
        recommendedCountSession: 1,
        updatedAt: "2026-05-30T01:00:00.000Z",
      },
    }),
  );

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      exclude: { recent: { recommended: "session", mode: "hard" } },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "recent recommended hard exclude should remove session-recommended material");
  assert(output.items[0]?.title === "Not Recent Track", "recent recommended hard exclude should keep not-recent material");
}

async function compactRecommendationCardEventsUpdateRecentExclusions(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "compact-event-track");
  const { materialActivity, materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Compact Event Track", sourceRef),
  ]);
  await putLibraryTrack(materialStore, sourceRef, "Compact Event Track");
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    materialActivity,
    idFactory: () => "event-compact-card",
    clock: () => "2026-05-30T02:00:00.000Z",
  });
  await assertOk(
    events.record({
      event: {
        sessionId: "session-1",
        actor: "stage",
        type: "recommendation.presented",
        payload: {
          ownerScope: "local_profile:default",
          cards: [
            {
              ref: materialRefToCardRef(record.materialRef),
              title: "Compact Event Track",
              status: "playable_unverified",
            },
          ],
        },
      },
    }),
  );
  const activity = await assertOk(
    materialActivity.getActivity({
      ownerScope: "local_profile:default",
      materialRef: record.materialRef,
    }),
  );
  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      exclude: { recent: { recommended: "session", mode: "hard" } },
      limit: 10,
    }),
  );

  assert(activity?.recommendedCountSession === 1, "compact MaterialCard.ref strings should update MaterialActivity");
  assert(output.items.length === 0, "recent exclusion should filter compact-card recommendation events");
}

async function recentOpenedAndPlayedHardExcludeWorksByWindow(): Promise<void> {
  const openedRef = ref("source:fixture", "track", "opened-track");
  const playedRef = ref("source:fixture", "track", "played-track");
  const keptRef = ref("source:fixture", "track", "old-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness(
    [
      sourceMaterial("Opened Track", openedRef),
      sourceMaterial("Played Track", playedRef),
      sourceMaterial("Old Track", keptRef),
    ],
    { clock: () => "2026-05-30T02:00:00.000Z" },
  );
  await putLibraryTrack(materialStore, openedRef, "Opened Track");
  await putLibraryTrack(materialStore, playedRef, "Played Track");
  await putLibraryTrack(materialStore, keptRef, "Old Track");
  await putActivityForSource(materialStore, openedRef, { lastOpenedAt: "2026-05-30T01:30:00.000Z", openedCountSession: 1 });
  await putActivityForSource(materialStore, playedRef, { lastPlayedAt: "2026-05-30T01:45:00.000Z", playedCountSession: 1 });
  await putActivityForSource(materialStore, keptRef, { lastOpenedAt: "2026-05-29T01:30:00.000Z", openedCountSession: 1 });

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      exclude: { recent: { opened: "1h", played: "1h", mode: "hard" } },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "recent opened/played hard exclude should honor the requested window");
  assert(output.items[0]?.title === "Old Track", "recent opened/played hard exclude should keep older material");
}

async function compactCardsDoNotExposeRawMaterialInternals(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "compact-track");
  const canonicalRef = ref("minemusic", "recording", "compact-canonical");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    {
      ...sourceMaterial("Compact Track", sourceRef),
      canonicalRef,
      evidence: [{ kind: "source", source: sourceRef, note: "raw evidence" }],
    },
  ]);
  await putLibraryTrack(materialStore, sourceRef, "Compact Track");

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      limit: 1,
    }),
  );
  const card = output.items[0] as unknown as Record<string, unknown>;

  assert(typeof card.ref === "string" && card.ref.startsWith("mat_"), "compact card should expose only an opaque material ref");
  assert(!("canonicalRef" in card), "compact card should not expose canonicalRef");
  assert(!("sourceRefs" in card), "compact card should not expose sourceRefs");
  assert(!("evidence" in card), "compact card should not expose raw evidence");
  assert(!("providerAccountId" in card), "compact card should not expose provider account data");
  assert(!("tracklist" in card), "compact card should not expose raw tracklists");
}

function createMaterialQueryHarness(sourceMaterials: SourceMaterial[]): {
  canonicalRepository: ReturnType<typeof createInMemoryCanonicalRecordRepository>;
  materialActivity: ReturnType<typeof createInMemoryMaterialActivityRepository>;
  materialStore: MaterialStorePort;
  sourceGrounding: SourceGroundingPort;
} {
  let nextMaterialId = 1;
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => `query-material-${nextMaterialId++}`,
      now: () => "2026-05-30T00:00:00.000Z",
    }),
    materialActivity,
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const sourceGrounding: SourceGroundingPort = {
    ground: async ({ query }) => ({
      ok: true,
      value: structuredClone(
        query.sourceRef === undefined
          ? sourceMaterials
          : sourceMaterials.filter((material) =>
              (material.sourceRefs ?? []).some((sourceRef) => sameRef(sourceRef, query.sourceRef as Ref)),
            ),
      ),
    }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };

  return { canonicalRepository, materialActivity, materialStore, sourceGrounding };
}

function createMaterialQueryServiceHarness(
  sourceMaterials: SourceMaterial[],
  options: { clock?: () => string; collection?: CollectionPort } = {},
) {
  const { canonicalRepository, materialActivity, materialStore, sourceGrounding } = createMaterialQueryHarness(sourceMaterials);
  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({
      materialStore,
      sourceGrounding,
    }),
    ...(options.collection === undefined ? {} : { collection: options.collection }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });

  return { canonicalRepository, materialActivity, materialStore, sourceGrounding, materialQuery };
}

function createCollectionPortStub(collections: Collection[], items: CollectionItem[]): CollectionPort {
  return {
    initializeOwnerCollections: async () => ({ ok: true, value: [] }),
    addItemToSystemCollection: async () => ({ ok: true, value: items[0] as CollectionItem }),
    removeItemFromSystemCollection: async () => ({ ok: true, value: items[0] as CollectionItem }),
    addItemToCollection: async () => ({ ok: true, value: items[0] as CollectionItem }),
    removeItemFromCollection: async () => ({ ok: true, value: items[0] as CollectionItem }),
    updateItem: async () => ({ ok: true, value: items[0] as CollectionItem }),
    listItems: async ({ ownerScope, collectionId, relationKind }) => ({
      ok: true,
      value: items.filter((item) =>
        (collectionId === undefined || item.collectionId === collectionId) &&
          collections.some((collection) =>
            collection.id === item.collectionId &&
              collection.ownerScope === ownerScope &&
              (relationKind === undefined || collection.relationKind === relationKind),
          ),
      ),
    }),
    listCollections: async ({ ownerScope, includeRemoved }) => ({
      ok: true,
      value: collections.filter((collection) =>
        collection.ownerScope === ownerScope &&
          (includeRemoved === true || collection.removedAt === undefined),
      ),
    }),
    createCollection: async () => ({ ok: true, value: collections[0] as Collection }),
    updateCollection: async () => ({ ok: true, value: collections[0] as Collection }),
    removeCollection: async () => ({ ok: true, value: collections[0] as Collection }),
    filterBlocked: async () => ({ ok: true, value: [] }),
  };
}

async function putLibraryTrack(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  label: string,
  addedAt = "2026-05-30T00:00:00.000Z",
): Promise<void> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "track",
        label,
        title: label,
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
  await assertOk(
    materialStore.putSourceLibraryItem({
      item: {
        id: `item-${sourceRef.id}`,
        ownerScope: "local_profile:default",
        providerId: "fixture",
        providerAccountId: "fixture-account",
        sourceRef,
        sourceKind: "track",
        libraryKind: "saved_source_track",
        label,
        addedAt,
        lastSeenAt: addedAt,
        status: "present",
      },
    }),
  );
}

async function putLibraryRelease(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  label: string,
  tracklist: SourceReleaseTracklistItem[],
): Promise<void> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "release",
        label,
        title: label,
        tracklist,
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
  await assertOk(
    materialStore.putSourceLibraryItem({
      item: {
        id: `item-${sourceRef.id}`,
        ownerScope: "local_profile:default",
        providerId: "fixture",
        providerAccountId: "fixture-account",
        sourceRef,
        sourceKind: "release",
        libraryKind: "saved_source_release",
        label,
        lastSeenAt: "2026-05-30T00:00:00.000Z",
        status: "present",
      },
    }),
  );
}

async function putLibraryArtist(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  label: string,
): Promise<void> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "artist",
        label,
        name: label,
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
  await assertOk(
    materialStore.putSourceLibraryItem({
      item: {
        id: `item-${sourceRef.id}`,
        ownerScope: "local_profile:default",
        providerId: "fixture",
        providerAccountId: "fixture-account",
        sourceRef,
        sourceKind: "artist",
        libraryKind: "saved_source_artist",
        label,
        lastSeenAt: "2026-05-30T00:00:00.000Z",
        status: "present",
      },
    }),
  );
}

async function putRelationForSource(
  materialStore: MaterialStorePort,
  id: string,
  sourceRef: Ref,
  relationKind: "blocked" | "wrong_version" | "not_playable",
): Promise<void> {
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));

  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id,
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        relationKind,
        scope: { level: "source", sourceRef },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
}

async function putActivityForSource(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  activity: {
    lastOpenedAt?: string;
    openedCountSession?: number;
    lastPlayedAt?: string;
    playedCountSession?: number;
  },
): Promise<void> {
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));

  await assertOk(
    materialStore.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        ...activity,
        updatedAt: activity.lastOpenedAt ?? activity.lastPlayedAt ?? "2026-05-30T00:00:00.000Z",
      },
    }),
  );
}

async function putRecommendedActivityForSource(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  lastRecommendedAt: string,
): Promise<void> {
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));

  await assertOk(
    materialStore.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        lastRecommendedAt,
        recommendedCountSession: 1,
        updatedAt: lastRecommendedAt,
      },
    }),
  );
}

function sourceMaterial(label: string, sourceRef: Ref, kind = "recording"): SourceMaterial {
  return {
    id: sourceRef.id,
    kind,
    label,
    state: "source_only_playable",
    sourceRefs: [sourceRef],
    playableLinks: [
      {
        url: `https://example.test/${sourceRef.id}`,
        sourceRef,
      },
    ],
  };
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

await querySavedTracksReturnsOnlySavedTrackMaterials();
await resolveCardsResolvesSourceBackedCardRefsWithoutTextSearch();
await resolveCardsResolvesCanonicalConfirmedCardRefs();
await resolveCardsReturnsUnresolvedForUnknownCardRefs();
await querySavedAlbumsExpandedToTracksReturnsRecordingCards();
await queryReturnKindFiltersResolvedMaterials();
await querySavedAlbumsAppliesTrackLevelTextAfterExpansion();
await queryCursorPaginatesMaterialCards();
await leastRecentlyRecommendedOrderUsesMaterialActivity();
await recentlyAddedOrderUsesSourceLibraryTimestamps();
await queryPreferenceHintsFilterAndRankMaterials();
await queryCollectionPoolCanResolveByLabel();
await explicitPoolDoesNotFallbackOutsidePool();
await relationExclusionsRemoveBlockedWrongVersionAndNotPlayable();
await recentRecommendedHardExcludeWorks();
await compactRecommendationCardEventsUpdateRecentExclusions();
await recentOpenedAndPlayedHardExcludeWorksByWindow();
await compactCardsDoNotExposeRawMaterialInternals();
