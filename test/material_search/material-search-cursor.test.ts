import {
  createMaterialSearchDocumentProvider,
  createMaterialSearchService,
} from "../../src/material/index.js";
import { createSqliteMaterialSearchIndex } from "../../src/storage/index.js";
import {
  activeMaterial,
  assert,
  assertError,
  assertOk,
  FakeMaterialSearchCollection,
  FakeMaterialSearchStore,
  libraryItem,
  materialRef,
  sourceRef,
} from "./material-search-test-harness.js";

async function searchCursorPaginatesAndRejectsShapeMismatch(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const first = materialRef("a-train");
  const second = materialRef("b-train");
  const third = materialRef("c-train");
  const firstSource = sourceRef("track", "a-train-source");
  const secondSource = sourceRef("track", "b-train-source");
  const thirdSource = sourceRef("track", "c-train-source");

  for (const [material, source] of [
    [first, firstSource],
    [second, secondSource],
    [third, thirdSource],
  ] as const) {
    store.putMaterial(activeMaterial(material, "recording", [source]));
    store.putSource({
      kind: "track",
      sourceRef: source,
      providerId: "fixture",
      label: `Train ${material.id}`,
      title: `Train ${material.id}`,
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z",
    });
    store.putLibraryItem(libraryItem({ id: `library-${material.id}`, sourceRef: source }));
  }

  const documentProvider = createMaterialSearchDocumentProvider({ materialStore: store });
  const searchIndex = createSqliteMaterialSearchIndex({ documents: documentProvider });
  const search = createMaterialSearchService({ materialStore: store, collection: collections, searchIndex });
  const pageOne = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{ kind: "source_library" }],
    text: "Train",
    limit: 2,
  }));

  assert(pageOne.hits.map((hit) => hit.materialRef.id).join(",") === "a-train,b-train", "first Search page should be stable");
  assert(pageOne.nextCursor !== undefined, "first Search page should return a Search-owned cursor");

  store.putSource({
    kind: "track",
    sourceRef: thirdSource,
    providerId: "fixture",
    label: "Train c-train refreshed",
    title: "Train c-train refreshed",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:01:00.000Z",
  });
  await assertOk(searchIndex.markDirty({ materialRef: third }));

  const pageTwo = await assertOk(search.search({
    ownerScope: "local_profile:default",
    scopes: [{ kind: "source_library" }],
    text: "Train",
    limit: 2,
    cursor: pageOne.nextCursor,
  }));

  assert(pageTwo.hits.length === 1 && pageTwo.hits[0]?.materialRef.id === third.id, "cursor should page through Search hits");
  assert(pageTwo.nextCursor === undefined, "last Search page should not return a cursor");

  await assertError(
    search.search({
      ownerScope: "local_profile:default",
      scopes: [{ kind: "source_library" }],
      text: "Blue",
      limit: 2,
      cursor: pageOne.nextCursor,
    }),
    "material_search.invalid_cursor",
  );
}

await searchCursorPaginatesAndRejectsShapeMismatch();
