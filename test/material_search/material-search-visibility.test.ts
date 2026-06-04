import { createMaterialSearchService } from "../../src/material/index.js";
import {
  activeMaterial,
  assert,
  assertError,
  assertOk,
  collection,
  collectionItem,
  FakeMaterialSearchCollection,
  FakeMaterialSearchStore,
  libraryItem,
  materialRef,
  refKey,
  relation,
  sourceRef,
} from "./material-search-test-harness.js";

async function allScopeUsesOwnerVisibleLocalCatalogNotGlobalRecords(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const libraryMaterial = materialRef("library-visible");
  const customMaterial = materialRef("custom-visible");
  const absentButCollectedMaterial = materialRef("absent-but-collected");
  const globalOnlyMaterial = materialRef("global-only");
  const relationOnlyMaterial = materialRef("relation-only");
  const missingSource = sourceRef("track", "missing-source-record");
  const librarySource = sourceRef("track", "library-source");
  const absentSource = sourceRef("track", "absent-source");

  for (const record of [
    activeMaterial(libraryMaterial, "recording", [librarySource]),
    activeMaterial(customMaterial),
    activeMaterial(absentButCollectedMaterial, "recording", [absentSource]),
    activeMaterial(globalOnlyMaterial),
    activeMaterial(relationOnlyMaterial),
  ]) {
    store.putMaterial(record);
  }
  store.putLibraryItem(libraryItem({ id: "library-present", sourceRef: librarySource }));
  store.putLibraryItem(libraryItem({ id: "library-missing", sourceRef: missingSource }));
  store.putLibraryItem(libraryItem({ id: "library-absent", sourceRef: absentSource, status: "absent" }));
  store.putRelation(relation(relationOnlyMaterial, "saved"));
  collections.putCollection(collection({ id: "custom-collection", relationKind: "custom" }));
  collections.putCollection(collection({ id: "saved-collection", relationKind: "saved" }));
  collections.putItem(collectionItem("custom-collection", customMaterial));
  collections.putItem(collectionItem("saved-collection", absentButCollectedMaterial));

  const search = createMaterialSearchService({ materialStore: store, collection: collections });
  const result = await assertOk(search.search({ ownerScope: "local_profile:default" }));
  const hitIds = result.hits.map((hit) => hit.materialRef.id);

  assert(hitIds.includes(libraryMaterial.id), "present Source Library item should grant all-scope visibility");
  assert(hitIds.includes(customMaterial.id), "custom Collection membership should grant all-scope visibility");
  assert(
    hitIds.includes(absentButCollectedMaterial.id),
    "absent Source Library state should not revoke positive Collection visibility",
  );
  assert(!hitIds.includes(globalOnlyMaterial.id), "all must not mean global MaterialRecord listing");
  assert(!hitIds.includes(relationOnlyMaterial.id), "material-level saved relation must not grant visibility");
  assert(
    result.warnings?.some((warning) => warning.code === "material_search.missing_material_record" &&
      warning.sourceRef !== undefined &&
      refKey(warning.sourceRef) === refKey(missingSource)) === true,
    "present Source Library items without durable MaterialRecord should warn and skip",
  );
}

async function sourceLibraryScopeHonorsProviderAccountKindAndTargetKindFilters(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const p1Track = materialRef("p1-track");
  const p2Track = materialRef("p2-track");
  const p1Release = materialRef("p1-release");
  const p1TrackSource = sourceRef("track", "p1-track-source");
  const p2TrackSource = sourceRef("track", "p2-track-source");
  const p1ReleaseSource = sourceRef("release", "p1-release-source");
  store.putMaterial(activeMaterial(p1Track, "recording", [p1TrackSource]));
  store.putMaterial(activeMaterial(p2Track, "recording", [p2TrackSource]));
  store.putMaterial(activeMaterial(p1Release, "release", [p1ReleaseSource]));
  store.putLibraryItem(libraryItem({
    id: "p1-track",
    sourceRef: p1TrackSource,
    providerId: "p1",
    providerAccountId: "acct-a",
    libraryKind: "saved_source_track",
  }));
  store.putLibraryItem(libraryItem({
    id: "p2-track",
    sourceRef: p2TrackSource,
    providerId: "p2",
    providerAccountId: "acct-a",
    libraryKind: "saved_source_track",
  }));
  store.putLibraryItem(libraryItem({
    id: "p1-release",
    sourceRef: p1ReleaseSource,
    providerId: "p1",
    providerAccountId: "acct-a",
    libraryKind: "saved_source_release",
  }));
  const search = createMaterialSearchService({ materialStore: store, collection: collections });

  const scoped = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{
      kind: "source_library",
      providerId: "p1",
      providerAccountId: "acct-a",
      libraryKinds: ["saved_source_track"],
    }],
  }));
  const releaseOnly = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{
      kind: "source_library",
      providerId: "p1",
      providerAccountId: "acct-a",
    }],
    targetKind: "release",
  }));

  assert(scoped.hits.length === 1 && scoped.hits[0]?.materialRef.id === p1Track.id, "source_library filters should narrow the owner source pool");
  assert(releaseOnly.hits.length === 1 && releaseOnly.hits[0]?.materialRef.id === p1Release.id, "targetKind should filter after source_library scope collection");
}

async function collectionLabelResolutionHandlesZeroAmbiguousAndMismatchCases(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const material = materialRef("collection-item");
  store.putMaterial(activeMaterial(material));
  collections.putCollection(collection({ id: "collection-one", relationKind: "custom", label: "Road Trip" }));
  collections.putCollection(collection({ id: "collection-two", relationKind: "custom", label: "Road Trip" }));
  collections.putItem(collectionItem("collection-one", material));
  const search = createMaterialSearchService({ materialStore: store, collection: collections });

  const missing = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{ kind: "collection", label: "Does Not Exist" }],
  }));

  assert(missing.hits.length === 0, "zero collection label matches should return an empty result");
  await assertError(
    search.search({
      ownerScope: "local_profile:default",
      scopes: [{ kind: "collection", label: "Road Trip" }],
    }),
    "material_search.invalid_scope",
  );
  await assertError(
    search.search({
      ownerScope: "local_profile:default",
      scopes: [{ kind: "collection", collectionId: "collection-one", label: "Wrong Label" }],
    }),
    "material_search.invalid_scope",
  );
}

await allScopeUsesOwnerVisibleLocalCatalogNotGlobalRecords();
await sourceLibraryScopeHonorsProviderAccountKindAndTargetKindFilters();
await collectionLabelResolutionHandlesZeroAmbiguousAndMismatchCases();
