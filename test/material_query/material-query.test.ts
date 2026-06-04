import type {
  MaterialPolicyCollectionBlockPort,
  MaterialQueryCollectionReadPort,
  MaterialResolvePort,
  MaterialSearchCollectionPort,
  MaterialSelectorPort,
  MaterialStorePort,
  SourceGroundingPort,
} from "../../src/ports/index.js";
import type {
  Collection,
  CollectionItem,
  Ref,
  Result,
  SourceReleaseTracklistItem,
  MusicMaterial,
  SourceMaterial,
} from "../../src/contracts/index.js";
import { createCollectionService } from "../../src/collection/index.js";
import { createEventService } from "../../src/events/index.js";
import { createMaterializationService } from "../../src/material/materialization/index.js";
import { createMaterialSearchDocumentProvider, createMaterialSearchService } from "../../src/material/search/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material/store/index.js";
import { materialRefToMaterialId } from "../../src/material/projection/index.js";
import { createMaterialQueryService as createMaterialQueryServiceBase } from "../../src/material/query/index.js";
import { createMaterialPolicyEvaluator, createMaterialSorter } from "../../src/material/policy/index.js";
import { createMaterialResolveService as createMaterialResolveServiceBase } from "../../src/material/resolve/index.js";
import { createMaterialSelector } from "../../src/material/selection/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryCollectionRepository,
  createInMemoryEventRepository,
  createInMemoryMaterialActivityRepository,
  createInMemoryMaterialSessionActivityRepository,
  createInMemorySourceEntityStoreRepository,
  createSqliteMaterialSearchIndex,
} from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function itemTitle(item: { material: MusicMaterial } | undefined): string | undefined {
  return item?.material.label;
}

function itemMaterialState(
  item: { material: MusicMaterial } | undefined,
): MusicMaterial["state"] | undefined {
  return item?.material.state;
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
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
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "saved track query should not return pool-external materials");
  assert(itemTitle(output.items[0]) === "Saved Track", "saved track query should return the saved track card");
}

async function materialQueryServiceDoesNotExposeSelectorCapability(): Promise<void> {
  const { materialQuery } = createMaterialQueryServiceHarness([]);

  assert(!("select" in materialQuery), "MaterialQueryService should not expose selector capability");
}

async function querySavedTracksProjectsStoredPlayableLinksWithoutProviderGrounding(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "stored-playable-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([]);
  await putLibraryTrack(materialStore, sourceRef, "Stored Playable Track", "2026-05-30T00:00:00.000Z", {
    providerUrl: "https://example.test/stored-playable-track",
  });

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      constraints: { availability: "playable" },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "saved-track query should project stored SourceEntity links without provider re-grounding");
  assert(itemTitle(output.items[0]) === "Stored Playable Track", "stored SourceEntity label should become the domain item label");
  assert(itemMaterialState(output.items[0]) === "source_only_playable", "stored SourceEntity providerUrl should become source_only_playable material");
  assert(!("identityConfidence" in (output.items[0] as Record<string, unknown>)), "domain query items should not expose identity confidence");
}

async function querySkipsUnbackedProviderResults(): Promise<void> {
  const seedRef = ref("source:fixture", "track", "unbacked-query-seed");
  const relatedRef = ref("source:fixture", "track", "unbacked-query-related");
  const releaseRef = ref("source:fixture", "release", "unbacked-query-release");
  const { materialStore } = createMaterialQueryHarness([]);
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef: seedRef,
        providerId: "fixture",
        kind: "track",
        label: "Unbacked Query Seed",
        title: "Unbacked Query Seed",
        releaseSourceRef: releaseRef,
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef: releaseRef,
        providerId: "fixture",
        kind: "release",
        label: "Unbacked Query Release",
        title: "Unbacked Query Release",
        tracklist: [{ sourceRef: relatedRef, title: "Unbacked Query Track" }],
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
  const seedRecord = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef: seedRef, kind: "recording" }));
  const sourceGrounding: SourceGroundingPort = {
    ground: async () => ({
      ok: true,
      value: [
        {
          id: "unbacked-query-result",
          kind: "recording",
          label: "Unbacked Query Track",
          state: "unresolved",
        },
      ],
    }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
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
      pool: { kind: "related", materialId: materialRefToMaterialId(seedRecord.materialRef), relation: "same_album" },
      limit: 10,
    }),
  );

  assert(output.items.length === 0, "query should not emit cards for unbacked provider results");
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
      pool: { kind: "source_library", libraryKinds: ["saved_source_release"], target: "release_tracks" },
      limit: 10,
    }),
  );

  assert(output.items.length === 2, "expanded saved albums should return track cards");
  assert(output.items.every((item) => itemMaterialState(item) === "source_only_playable"), "expanded album tracks should resolve as source_only_playable recording materials");
  assert(
    (output.items.map(itemTitle)).join(",") === "Album Track One,Album Track Two",
    "expanded album query should preserve release tracklist order",
  );
}

async function queryTargetKindFiltersResolvedMaterials(): Promise<void> {
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
      pool: { kind: "source_library", libraryKinds: ["saved_source_track", "saved_source_artist"] },
      targetKind: "recording",
      limit: 10,
    }),
  );
  const artists = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", libraryKinds: ["saved_source_track", "saved_source_artist"] },
      targetKind: "artist",
      limit: 10,
    }),
  );

  assert(recordings.items.length === 1 && itemTitle(recordings.items[0]) === "Return Kind Track", "targetKind recording should keep only recording materials");
  assert(artists.items.length === 1 && itemTitle(artists.items[0]) === "Return Kind Artist", "targetKind artist should keep only artist materials");
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
      pool: { kind: "source_library", libraryKinds: ["saved_source_release"], target: "release_tracks" },
      text: "Lantern",
      targetKind: "recording",
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "saved album expansion should apply text to expanded track labels");
  assert(itemTitle(output.items[0]) === "Bright Lantern", "saved album expansion should find matching track labels");
}

async function queryRejectsInvalidReleaseTracksSourceLibraryPool(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "invalid-release-target-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Invalid Release Target Track", sourceRef),
  ]);
  await putLibraryTrack(materialStore, sourceRef, "Invalid Release Target Track");

  const output = await materialQuery.query({
    ownerScope: "local_profile:default",
    pool: { kind: "source_library", libraryKinds: ["saved_source_track"], target: "release_tracks" },
    limit: 10,
  });

  assert(!output.ok, "release_tracks target should reject non-release source-library pools");
  assert(
    !output.ok && output.error.code === "material_query.invalid_pool",
    "release_tracks target should fail with an explicit invalid-pool error",
  );
}

async function listPoolsDisambiguatesProviderAccountsInSourceLibraryLabels(): Promise<void> {
  const firstRef = ref("source:fixture", "track", "account-one-track");
  const secondRef = ref("source:fixture", "track", "account-two-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([]);
  assert(materialQuery.listPools !== undefined, "material query service should expose pool listing");
  await putLibraryTrack(materialStore, firstRef, "Account One Track", "2026-05-30T00:00:00.000Z", {
    providerAccountId: "account-one",
  });
  await putLibraryTrack(materialStore, secondRef, "Account Two Track", "2026-05-30T00:00:00.000Z", {
    providerAccountId: "account-two",
  });

  const output = await assertOk(
    materialQuery.listPools({
      ownerScope: "local_profile:default",
      kinds: ["source_library"],
    }),
  );
  const labels = output.pools.map((pool) => pool.label);

  assert(labels.includes("fixture/account-one saved tracks"), "pool labels should include the first provider account");
  assert(labels.includes("fixture/account-two saved tracks"), "pool labels should include the second provider account");
  assert(new Set(labels).size === labels.length, "source-library pool labels should not collide across accounts");
}

async function queryCursorPaginatesDomainItems(): Promise<void> {
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
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      limit: 2,
    }),
  );
  assert(firstPage.nextCursor !== undefined, "first cursor page should expose a continuation cursor");
  const secondPage = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      cursor: firstPage.nextCursor,
      limit: 2,
    }),
  );

  assert(firstPage.items.length === 2, "first cursor page should respect limit");
  assert(secondPage.items.length === 1, "second cursor page should continue after the first page");
  assert(itemTitle(secondPage.items[0]) === "Cursor Track Three", "cursor should preserve deterministic pool order");
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
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      order: "least_recently_recommended",
      limit: 10,
    }),
  );

  assert(
    (output.items.map(itemTitle)).join(",") === "Never Recommended,Old Recommended,New Recommended",
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
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      order: "recently_added",
      limit: 10,
    }),
  );

  assert(
    (output.items.map(itemTitle)).join(",") === "Newer Library Track,Older Library Track",
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
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
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
    (output.items.map(itemTitle)).join(",") === "Medium Writing Calm Piano,Ambient Focus",
    "preference hints should rank positive text hints while avoid and vocal=avoid hard-filter matching materials",
  );
  assert(output.basis?.applied?.includes("activity:writing"), "preference activity should be reported as applied");
  assert(output.basis?.applied?.includes("mood:calm"), "preference mood should be reported as applied");
  assert(output.basis?.applied?.includes("energy:medium"), "preference energy should be reported as applied");
  assert(output.basis?.applied?.includes("vocal:avoid"), "preference vocal policy should be reported as applied");
}

async function queryCollectionPoolCanResolveByLabel(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "collection-label-source-track");
  const collectionRecord: Collection = {
    id: "collection-night-coding",
    ownerScope: "local_profile:default",
    collectionKind: "recording",
    relationKind: "custom",
    label: "Night coding",
    createdAt: "2026-05-30T00:00:00.000Z",
  };
  const { materialStore, sourceGrounding } = createMaterialQueryServiceHarness([
    sourceMaterial("Collection Label Track", sourceRef),
  ]);
  await putSourceTrack(materialStore, sourceRef, "Collection Label Track");
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  const collectionItem: CollectionItem = {
    id: "collection-item-night-track",
    collectionId: collectionRecord.id,
    materialRef: record.materialRef,
    label: "Collection Label Track",
    createdAt: "2026-05-30T00:00:00.000Z",
  };
  const collection = createCollectionPortStub([collectionRecord], [collectionItem]);
  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({
      materialStore,
      sourceGrounding,
    }),
    collectionRead: collection,
  });

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "collection", label: "Night coding" },
      targetKind: "recording",
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "collection label pool should resolve matching collection items");
  assert(itemTitle(output.items[0]) === "Collection Label Track", "collection label pool should return the collection item card");
}

async function queryCollectionPoolReturnsMaterialOnlyItems(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "collection-material-only-source");
  const collectionRecord: Collection = {
    id: "collection-material-only",
    ownerScope: "local_profile:default",
    collectionKind: "recording",
    relationKind: "custom",
    label: "Material-only collection",
    createdAt: "2026-05-30T00:00:00.000Z",
  };
  const { materialStore, sourceGrounding } = createMaterialQueryServiceHarness([
    sourceMaterial("Source Only Collection Track", sourceRef),
  ]);
  await putSourceTrack(materialStore, sourceRef, "Source Only Collection Track");
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  const collectionItem: CollectionItem = {
    id: "collection-item-material-only",
    collectionId: collectionRecord.id,
    materialRef: record.materialRef,
    label: "Source Only Collection Track",
    createdAt: "2026-05-30T00:00:00.000Z",
  };
  const collection = createCollectionPortStub([collectionRecord], [collectionItem]);
  const queryWithCollection = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({
      materialStore,
      sourceGrounding,
    }),
    collectionRead: collection,
  });

  const output = await assertOk(
    queryWithCollection.query({
      ownerScope: "local_profile:default",
      pool: { kind: "collection", ref: collectionRecord.id },
      targetKind: "recording",
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "collection pool should return material-only collection items");
  assert(output.items[0]?.materialId === materialRefToMaterialId(record.materialRef), "returned card should point to the collection material id");
  assert(itemTitle(output.items[0]) === "Source Only Collection Track", "material-only collection items should resolve to compact cards");
}

async function queryCollectionMaterialRefsUseStoredPlayableLinks(): Promise<void> {
  const fixture = await createCollectionMaterialRefFixture({
    sourceId: "collection-stored-playable",
    label: "Collection Stored Playable",
    providerUrl: "https://example.test/collection-stored-playable",
  });

  const output = await assertOk(
    fixture.materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "collection", ref: fixture.collectionRecord.id },
      constraints: { availability: "playable" },
      targetKind: "recording",
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "collection materialRef query should project stored links without provider re-grounding");
  assert(output.items[0]?.materialId === materialRefToMaterialId(fixture.record.materialRef), "collection materialRef query should keep the stored material id");
  assert(itemMaterialState(output.items[0]) === "source_only_playable", "collection materialRef query should return source_only_playable material from stored SourceEntity providerUrl");
}

async function queryCollectionPoolSkipsUnprojectableMaterialRefs(): Promise<void> {
  const missingRef = ref("minemusic", "material", "missing-collection-track");
  const collectionRecord: Collection = {
    id: "collection-missing-material",
    ownerScope: "local_profile:default",
    collectionKind: "recording",
    relationKind: "custom",
    label: "Missing material collection",
    createdAt: "2026-05-30T00:00:00.000Z",
  };
  const collectionItem: CollectionItem = {
    id: "collection-item-missing-material",
    collectionId: collectionRecord.id,
    materialRef: missingRef,
    label: "Missing Material Track",
    createdAt: "2026-05-30T00:00:00.000Z",
  };
  const collection = createCollectionPortStub([collectionRecord], [collectionItem]);
  const { materialStore, sourceGrounding } = createMaterialQueryServiceHarness([]);
  const queryWithCollection = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({
      materialStore,
      sourceGrounding,
    }),
    collectionRead: collection,
  });

  const output = await assertOk(
    queryWithCollection.query({
      ownerScope: "local_profile:default",
      pool: { kind: "collection", ref: collectionRecord.id },
      targetKind: "recording",
      limit: 10,
    }),
  );

  assert(output.items.length === 0, "collection pool should skip items that cannot project from Material Store");
}

async function explicitPoolDoesNotFallbackOutsidePool(): Promise<void> {
  const outsideSourceRef = ref("source:fixture", "track", "outside-track");
  const { materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Outside Track", outsideSourceRef),
  ]);

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
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
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      exclude: { relations: ["blocked", "wrong_version", "not_playable"] },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "relation exclusions should remove active negative relation materials");
  assert(itemTitle(output.items[0]) === "Kept Track", "relation exclusions should keep unrelated material");
}

async function relationExclusionsRemoveCollectionBlockedMaterials(): Promise<void> {
  const blockedRef = ref("source:fixture", "track", "collection-blocked-track");
  const keptRef = ref("source:fixture", "track", "collection-kept-track");
  const { materialStore, sourceGrounding } = createMaterialQueryServiceHarness([
    sourceMaterial("Collection Blocked Track", blockedRef),
    sourceMaterial("Collection Kept Track", keptRef),
  ]);
  await putLibraryTrack(materialStore, blockedRef, "Collection Blocked Track");
  await putLibraryTrack(materialStore, keptRef, "Collection Kept Track");
  const blockedRecord = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef: blockedRef, kind: "recording" }));
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    idFactory: createSequence("event"),
    clock: () => "2026-05-30T00:00:00.000Z",
  });
  const collection = createCollectionService({
    repository: createInMemoryCollectionRepository(),
    events,
    materialStore,
    idFactory: createSequence("collection"),
    clock: () => "2026-05-30T00:00:00.000Z",
  });
  await assertOk(collection.initializeOwnerCollections({ ownerScope: "local_profile:default" }));
  await assertOk(
    collection.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "blocked",
      materialRef: blockedRecord.materialRef,
      collectionKind: "recording",
      label: "Collection Blocked Track",
    }),
  );
  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({
      materialStore,
      sourceGrounding,
    }),
    collectionBlock: collection,
  });

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      exclude: { relations: ["blocked"] },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "blocked relation exclusion should remove Collection-blocked materials");
  assert(itemTitle(output.items[0]) === "Collection Kept Track", "blocked relation exclusion should keep unblocked material");
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
    materialStore.putMaterialSessionActivity({
      activity: {
        ownerScope: "local_profile:default",
        sessionId: "session-1",
        materialRef: recentRecord.materialRef,
        recommendedCount: 1,
        updatedAt: "2026-05-30T01:00:00.000Z",
      },
    }),
  );

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      sessionId: "session-1",
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      exclude: { recent: { recommended: "session", mode: "hard" } },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "recent recommended hard exclude should remove session-recommended material");
  assert(itemTitle(output.items[0]) === "Not Recent Track", "recent recommended hard exclude should keep not-recent material");
}

async function recentRecommendedSessionExcludeUsesMaterialSessionActivity(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "session-scoped-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Session Scoped Track", sourceRef),
  ]);
  await putLibraryTrack(materialStore, sourceRef, "Session Scoped Track");
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  await assertOk(
    materialStore.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        lastRecommendedAt: "2026-05-30T01:00:00.000Z",
        updatedAt: "2026-05-30T01:00:00.000Z",
      },
    }),
  );
  await assertOk(
    materialStore.putMaterialSessionActivity({
      activity: {
        ownerScope: "local_profile:default",
        sessionId: "session-a",
        materialRef: record.materialRef,
        recommendedCount: 1,
        updatedAt: "2026-05-30T01:00:00.000Z",
      },
    }),
  );

  const sessionA = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      sessionId: "session-a",
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      exclude: { recent: { recommended: "session", mode: "hard" } },
      limit: 10,
    }),
  );
  const sessionB = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      sessionId: "session-b",
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      exclude: { recent: { recommended: "session", mode: "hard" } },
      limit: 10,
    }),
  );

  assert(sessionA.items.length === 0, "session recent exclusion should exclude material from the same session");
  assert(sessionB.items.length === 1, "session recent exclusion should not leak across sessions");
  assert(itemTitle(sessionB.items[0]) === "Session Scoped Track", "other sessions should keep the material");
}

async function compactRecommendationCardEventsUpdateRecentExclusions(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "compact-event-track");
  const { materialActivity, materialSessionActivity, materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Compact Event Track", sourceRef),
  ]);
  await putLibraryTrack(materialStore, sourceRef, "Compact Event Track");
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    materialActivity,
    materialSessionActivity,
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
              materialId: materialRefToMaterialId(record.materialRef),
              title: "Compact Event Track",
              state: "source_only_playable",
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
  const sessionActivity = await assertOk(
    materialSessionActivity.getSessionActivity({
      ownerScope: "local_profile:default",
      sessionId: "session-1",
      materialRef: record.materialRef,
    }),
  );
  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      sessionId: "session-1",
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      exclude: { recent: { recommended: "session", mode: "hard" } },
      limit: 10,
    }),
  );

  assert(activity?.lastRecommendedAt === "2026-05-30T02:00:00.000Z", "recommendation materialId should update aggregate MaterialActivity");
  assert(sessionActivity?.recommendedCount === 1, "recommendation materialId should update session MaterialActivity");
  assert(output.items.length === 0, "recent exclusion should filter recommendation events");
}

async function contextBriefFieldsSelectArtistAlbumVersionAndStatus(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "context-brief-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([]);
  await putLibraryTrack(materialStore, sourceRef, "Context Brief Track", "2026-05-30T00:00:00.000Z", {
    artistLabels: ["Context Artist"],
    releaseLabel: "Context Album",
  });
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  const materialId = materialRefToMaterialId(record.materialRef);
  assert(materialQuery.contextBrief !== undefined, "material query service should expose contextBrief");

  const artistOnly = await assertOk(
    materialQuery.contextBrief({
      materialId,
      fields: ["artist"],
    }),
  );
  const albumOnly = await assertOk(
    materialQuery.contextBrief({
      materialId,
      fields: ["album"],
    }),
  );
  const versionOnly = await assertOk(
    materialQuery.contextBrief({
      materialId,
      fields: ["version"],
    }),
  );

  assert(artistOnly.artist?.name === "Context Artist", "artist field should include source artist info");
  assert(!("album" in artistOnly), "artist-only context brief should not include album info");
  assert(!("warnings" in artistOnly), "artist-only context brief should not include status/version warnings");
  assert(albumOnly.album?.title === "Context Album", "album field should include source album info");
  assert(!("artist" in albumOnly), "album-only context brief should not include artist info");
  assert(versionOnly.version?.status === "not_checked", "version field should report neutral unchecked status");
  assert(versionOnly.warnings === undefined, "version field should not warn during ordinary context checks");
  assert(!("artist" in versionOnly) && !("album" in versionOnly), "version-only context brief should not include artist or album info");
}

async function contextBriefStatusFieldReturnsOnlyStatusWarnings(): Promise<void> {
  const mergedRef = ref("source:fixture", "track", "context-brief-merged-track");
  const survivorRef = ref("source:fixture", "track", "context-brief-survivor-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([]);
  await putLibraryTrack(materialStore, mergedRef, "Merged Context Track", "2026-05-30T00:00:00.000Z", {
    artistLabels: ["Merged Artist"],
    releaseLabel: "Merged Album",
  });
  await putLibraryTrack(materialStore, survivorRef, "Survivor Context Track");
  const mergedRecord = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef: mergedRef, kind: "recording" }));
  const survivorRecord = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef: survivorRef, kind: "recording" }));
  await assertOk(
    materialStore.mergeMaterials({
      from: mergedRecord.materialRef,
      into: survivorRecord.materialRef,
      reason: "test duplicate merge",
    }),
  );
  assert(materialQuery.contextBrief !== undefined, "material query service should expose contextBrief");

  const statusOnly = await assertOk(
    materialQuery.contextBrief({
      materialId: materialRefToMaterialId(mergedRecord.materialRef),
      fields: ["status"],
    }),
  );

  assert(statusOnly.warnings?.includes("material_merged"), "status field should include material status warnings");
  assert(!("artist" in statusOnly), "status-only context brief should not include artist info");
  assert(!("album" in statusOnly), "status-only context brief should not include album info");
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
  await putActivityForSource(materialStore, openedRef, { lastOpenedAt: "2026-05-30T01:30:00.000Z" });
  await putActivityForSource(materialStore, playedRef, { lastPlayedAt: "2026-05-30T01:45:00.000Z" });
  await putActivityForSource(materialStore, keptRef, { lastOpenedAt: "2026-05-29T01:30:00.000Z" });

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      exclude: { recent: { opened: "1h", played: "1h", mode: "hard" } },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "recent opened/played hard exclude should honor the requested window");
  assert(itemTitle(output.items[0]) === "Old Track", "recent opened/played hard exclude should keep older material");
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
      pool: { kind: "source_library", libraryKinds: ["saved_source_track"] },
      limit: 1,
    }),
  );
  const card = output.items[0] as unknown as Record<string, unknown>;

  assert(typeof card.materialId === "string", "compact card should expose a material id");
  assert(!("ref" in card), "compact card should not expose alternate ref handles");
  assert(!("canonicalRef" in card), "compact card should not expose canonicalRef");
  assert(!("sourceRefs" in card), "compact card should not expose sourceRefs");
  assert(!("evidence" in card), "compact card should not expose raw evidence");
  assert(!("providerAccountId" in card), "compact card should not expose provider account data");
  assert(!("tracklist" in card), "compact card should not expose raw tracklists");
}

function createMaterialQueryHarness(sourceMaterials: SourceMaterial[]): {
  canonicalRepository: ReturnType<typeof createInMemoryCanonicalRecordRepository>;
  materialActivity: ReturnType<typeof createInMemoryMaterialActivityRepository>;
  materialSessionActivity: ReturnType<typeof createInMemoryMaterialSessionActivityRepository>;
  materialStore: MaterialStorePort;
  sourceGrounding: SourceGroundingPort;
} {
  let nextMaterialId = 1;
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialSessionActivity = createInMemoryMaterialSessionActivityRepository();
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => `query-material-${nextMaterialId++}`,
      now: () => "2026-05-30T00:00:00.000Z",
    }),
    materialActivity,
    materialSessionActivity,
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

  return { canonicalRepository, materialActivity, materialSessionActivity, materialStore, sourceGrounding };
}

function createMaterialQueryServiceHarness(
  sourceMaterials: SourceMaterial[],
  options: {
    clock?: () => string;
    collectionRead?: MaterialQueryCollectionReadPort;
    collectionBlock?: MaterialPolicyCollectionBlockPort;
  } = {},
) {
  const { canonicalRepository, materialActivity, materialSessionActivity, materialStore, sourceGrounding } =
    createMaterialQueryHarness(sourceMaterials);
  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({
      materialStore,
      sourceGrounding,
    }),
    ...(options.collectionRead === undefined ? {} : { collectionRead: options.collectionRead }),
    ...(options.collectionBlock === undefined ? {} : { collectionBlock: options.collectionBlock }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });

  return { canonicalRepository, materialActivity, materialSessionActivity, materialStore, sourceGrounding, materialQuery };
}

function createMaterialQueryService({
  materialStore,
  materialResolve,
  collectionRead,
  collectionBlock,
  clock,
  materialSelector,
}: {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  collectionRead?: MaterialQueryCollectionReadPort;
  collectionBlock?: MaterialPolicyCollectionBlockPort;
  clock?: () => string;
  materialSelector?: MaterialSelectorPort;
}) {
  const selector = materialSelector ?? createMaterialSelectorForTest({
    materialStore,
    ...(collectionBlock === undefined ? {} : { collectionBlock }),
    ...(clock === undefined ? {} : { clock }),
  });
  const materialSearchDocuments = createMaterialSearchDocumentProvider({ materialStore });
  const materialSearchIndex = createSqliteMaterialSearchIndex({ documents: materialSearchDocuments });
  const materialSearch = createMaterialSearchService({
    materialStore,
    collection: materialSearchCollectionPort({
      ...(collectionRead === undefined ? {} : { collectionRead }),
    }),
    searchIndex: materialSearchIndex,
  });

  return createMaterialQueryServiceBase({
    materialStore,
    materialResolve,
    materialSearch,
    materialSelector: selector,
    ...(collectionRead === undefined ? {} : { collection: collectionRead }),
  });
}

function materialSearchCollectionPort({
  collectionRead,
}: {
  collectionRead?: MaterialQueryCollectionReadPort;
}): MaterialSearchCollectionPort {
  return {
    listItems: collectionRead?.listItems ?? (async () => ok([])),
    listCollections: collectionRead?.listCollections ?? (async () => ok([])),
  };
}

function createMaterialResolveService({
  materialStore,
  sourceGrounding,
}: {
  materialStore: MaterialStorePort;
  sourceGrounding: SourceGroundingPort;
}) {
  const materialPolicyEvaluator = createMaterialPolicyEvaluator({ materialStore });

  return createMaterialResolveServiceBase({
    materialStore,
    sourceGrounding,
    sourceMaterializer: createMaterializationService({ materialStore }),
    materialPolicyEvaluator,
  });
}

function createMaterialSelectorForTest({
  materialStore,
  collectionBlock,
  clock,
}: {
  materialStore: MaterialStorePort;
  collectionBlock?: MaterialPolicyCollectionBlockPort;
  clock?: () => string;
}): MaterialSelectorPort {
  const materialPolicyEvaluator = createMaterialPolicyEvaluator({
    materialStore,
    ...(collectionBlock === undefined ? {} : { collection: collectionBlock }),
    ...(clock === undefined ? {} : { clock }),
  });
  const materialSorter = createMaterialSorter({ materialStore });

  return createMaterialSelector({
    materialStore,
    materialPolicyEvaluator,
    materialSorter,
  });
}

async function createCollectionMaterialRefFixture({
  sourceId,
  label,
  providerUrl,
}: {
  sourceId: string;
  label: string;
  providerUrl: string;
}) {
  const sourceRef = ref("source:fixture", "track", sourceId);
  const collectionRecord: Collection = {
    id: `${sourceId}-collection`,
    ownerScope: "local_profile:default",
    collectionKind: "recording",
    relationKind: "custom",
    label: `${label} collection`,
    createdAt: "2026-05-30T00:00:00.000Z",
  };
  const { materialStore, sourceGrounding } = createMaterialQueryServiceHarness([]);
  await putLibraryTrack(materialStore, sourceRef, label, "2026-05-30T00:00:00.000Z", { providerUrl });
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  const collection = createCollectionPortStub([collectionRecord], [{
    id: `${sourceId}-collection-item`,
    collectionId: collectionRecord.id,
    materialRef: record.materialRef,
    label,
    createdAt: "2026-05-30T00:00:00.000Z",
  }]);
  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({
      materialStore,
      sourceGrounding,
    }),
    collectionRead: collection,
  });

  return { collectionRecord, materialQuery, record };
}

function createCollectionPortStub(
  collections: Collection[],
  items: CollectionItem[],
): MaterialQueryCollectionReadPort {
  return {
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
  };
}

function createSequence(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

async function putSourceTrack(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  label: string,
  providerUrl = `https://example.test/${sourceRef.id}`,
): Promise<void> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "track",
        label,
        title: label,
        providerUrl,
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
}

async function putLibraryTrack(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  label: string,
  addedAt = "2026-05-30T00:00:00.000Z",
  context: {
    artistLabels?: string[];
    releaseLabel?: string;
    providerUrl?: string;
    providerAccountId?: string;
  } = {},
): Promise<void> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "track",
        label,
        title: label,
        ...(context.providerUrl === undefined ? {} : { providerUrl: context.providerUrl }),
        ...(context.artistLabels === undefined ? {} : { artistLabels: context.artistLabels }),
        ...(context.releaseLabel === undefined ? {} : { releaseLabel: context.releaseLabel }),
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
        providerAccountId: context.providerAccountId ?? "fixture-account",
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
  await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
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
  await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "release" }));
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
  await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "artist" }));
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
    lastPlayedAt?: string;
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
await materialQueryServiceDoesNotExposeSelectorCapability();
await querySavedTracksProjectsStoredPlayableLinksWithoutProviderGrounding();
await querySkipsUnbackedProviderResults();
await querySavedAlbumsExpandedToTracksReturnsRecordingCards();
await queryTargetKindFiltersResolvedMaterials();
await querySavedAlbumsAppliesTrackLevelTextAfterExpansion();
await queryRejectsInvalidReleaseTracksSourceLibraryPool();
await listPoolsDisambiguatesProviderAccountsInSourceLibraryLabels();
await queryCursorPaginatesDomainItems();
await leastRecentlyRecommendedOrderUsesMaterialActivity();
await recentlyAddedOrderUsesSourceLibraryTimestamps();
await queryPreferenceHintsFilterAndRankMaterials();
await queryCollectionPoolCanResolveByLabel();
await queryCollectionPoolReturnsMaterialOnlyItems();
await queryCollectionMaterialRefsUseStoredPlayableLinks();
await queryCollectionPoolSkipsUnprojectableMaterialRefs();
await explicitPoolDoesNotFallbackOutsidePool();
await relationExclusionsRemoveBlockedWrongVersionAndNotPlayable();
await relationExclusionsRemoveCollectionBlockedMaterials();
await recentRecommendedHardExcludeWorks();
await recentRecommendedSessionExcludeUsesMaterialSessionActivity();
await compactRecommendationCardEventsUpdateRecentExclusions();
await contextBriefFieldsSelectArtistAlbumVersionAndStatus();
await contextBriefStatusFieldReturnsOnlyStatusWarnings();
await recentOpenedAndPlayedHardExcludeWorksByWindow();
await compactCardsDoNotExposeRawMaterialInternals();
