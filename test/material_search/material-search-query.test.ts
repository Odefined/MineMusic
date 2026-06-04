import {
  createMaterialSearchDocumentProvider,
  createMaterialSearchService,
} from "../../src/material/index.js";
import { createSqliteMaterialSearchIndex } from "../../src/storage/index.js";
import {
  activeMaterial,
  assert,
  assertOk,
  collection,
  collectionItem,
  FakeMaterialSearchCollection,
  FakeMaterialSearchStore,
  libraryItem,
  materialRef,
  sourceRef,
} from "./material-search-test-harness.js";

async function textSearchUsesSearchIndexAndPreservesInternalEvidence(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const blue = materialRef("blue-train");
  const red = materialRef("red-clay");
  const blueSource = sourceRef("track", "blue-source");
  const redSource = sourceRef("track", "red-source");
  store.putMaterial(activeMaterial(blue, "recording", [blueSource]));
  store.putMaterial(activeMaterial(red, "recording", [redSource]));
  store.putSource({
    kind: "track",
    sourceRef: blueSource,
    providerId: "fixture",
    label: "Blue Train",
    title: "Blue Train",
    artistLabels: ["John Coltrane"],
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });
  store.putSource({
    kind: "track",
    sourceRef: redSource,
    providerId: "fixture",
    label: "Red Clay",
    title: "Red Clay",
    artistLabels: ["Freddie Hubbard"],
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });
  store.putLibraryItem(libraryItem({ id: "blue-library", sourceRef: blueSource }));
  store.putLibraryItem(libraryItem({ id: "red-library", sourceRef: redSource }));
  const documentProvider = createMaterialSearchDocumentProvider({ materialStore: store });
  const searchIndex = createSqliteMaterialSearchIndex({ documents: documentProvider });
  const search = createMaterialSearchService({ materialStore: store, collection: collections, searchIndex });

  const result = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{ kind: "source_library" }],
    text: "Coltrane",
    limit: 10,
  }));

  assert(result.hits.length === 1, "text search should only return matching visible materials");
  assert(result.hits[0]?.materialRef.id === blue.id, "SearchIndex should match source-derived text");
  assert(result.hits[0]?.score !== undefined, "text search should return internal score");
  assert(
    result.hits[0]?.evidence?.some((evidence) => evidence.field === "source_artist_labels") === true,
    "text search should preserve internal field-level evidence",
  );
  assert(
    result.hits[0]?.provenance?.some((provenance) => provenance.kind === "source_library") === true,
    "text search should preserve internal provenance for diagnostics/audit",
  );
}

async function textSearchFindsCollectionOnlyMaterial(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const material = materialRef("collection-only-lantern");
  const source = sourceRef("track", "collection-only-lantern-source");
  store.putMaterial(activeMaterial(material, "recording", [source]));
  store.putSource({
    kind: "track",
    sourceRef: source,
    providerId: "fixture",
    label: "Collection Only Lantern",
    title: "Collection Only Lantern",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });
  collections.putCollection(collection({ id: "custom", relationKind: "custom" }));
  collections.putItem(collectionItem("custom", material));
  const documentProvider = createMaterialSearchDocumentProvider({ materialStore: store });
  const searchIndex = createSqliteMaterialSearchIndex({ documents: documentProvider });
  const search = createMaterialSearchService({ materialStore: store, collection: collections, searchIndex });

  const result = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{ kind: "collection", relation: "custom" }],
    text: "Lantern",
    limit: 10,
  }));

  assert(
    result.hits.length === 1 && result.hits[0]?.materialRef.id === material.id,
    "text search should build and match SearchDocuments for collection-only visible materials",
  );
}

async function emptyTextBrowseSortsByProvenancePriority(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const favorite = materialRef("favorite-hit");
  const saved = materialRef("saved-hit");
  const custom = materialRef("custom-hit");
  const sourceOnly = materialRef("source-hit");
  const source = sourceRef("track", "source-hit");

  for (const record of [
    activeMaterial(favorite),
    activeMaterial(saved),
    activeMaterial(custom),
    activeMaterial(sourceOnly, "recording", [source]),
  ]) {
    store.putMaterial(record);
  }
  store.putLibraryItem(libraryItem({ id: "source-library", sourceRef: source }));
  collections.putCollection(collection({ id: "favorite", relationKind: "favorite" }));
  collections.putCollection(collection({ id: "saved", relationKind: "saved" }));
  collections.putCollection(collection({ id: "custom", relationKind: "custom", label: "A Custom List" }));
  collections.putItem(collectionItem("custom", custom, 1));
  collections.putItem(collectionItem("saved", saved));
  collections.putItem(collectionItem("favorite", favorite));

  const search = createMaterialSearchService({ materialStore: store, collection: collections });
  const result = await assertOk(search.search({
    ownerScope: "local_profile:default",
    text: "   ",
    limit: 10,
  }));

  assert(
    result.hits.map((hit) => hit.materialRef.id).join(",") ===
      [favorite.id, saved.id, custom.id, sourceOnly.id].join(","),
    "empty-text browse should sort favorite > saved > custom > source_library",
  );
}

await textSearchUsesSearchIndexAndPreservesInternalEvidence();
await textSearchFindsCollectionOnlyMaterial();
await emptyTextBrowseSortsByProvenancePriority();
