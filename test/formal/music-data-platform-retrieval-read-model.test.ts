import assert from "node:assert/strict";

import {
  refKey,
} from "../../src/contracts/index.js";
import type {
  MaterialEntityKind,
  Ref,
  SourceAlbum,
  SourceArtist,
  SourceEntity,
  SourceTrack,
} from "../../src/contracts/index.js";
import {
  DEFAULT_OWNER_SCOPE,
  createMaterialTextProjectionCommands,
  createMusicDataPlatformRetrievalReadPort,
  createOwnerCatalogProjectionCommands,
  createOwnerRelationPoolRef,
  createProjectionMaintenanceCommands,
  createSourceLibraryRef,
  isMusicDataPlatformError,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformSourceLibrarySchema,
  type CreateMusicDataPlatformRetrievalReadPortInput,
  type MusicDataPlatformRetrievalMaterialRow,
  type MusicDataPlatformRetrievalReadPort,
  type MusicDataPlatformRetrievalSearchInput,
  type MusicDataPlatformRetrievalSearchPage,
  type RetrievalFreshness,
  type RetrievalMatchedTextTokenEvidence,
  type RetrievalOrder,
  type RetrievalReadCursorPosition,
  type RetrievalReadPoolFilter,
  type RetrievalTextField,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createOwnerMaterialRelationCommands } from "../../src/music_data_platform/owner_material_relation_commands.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import { SqliteMusicDatabase } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;
type CursorByOrder<Order extends RetrievalReadCursorPosition["order"]> = Extract<
  RetrievalReadCursorPosition,
  { order: Order }
>;

function createIdentityTestCommands(
  db: Parameters<typeof createIdentityWriteCommands>[0]["db"],
  now: string,
) {
  return createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
}

function createOwnerRelationTestCommands(
  db: Parameters<typeof createOwnerMaterialRelationCommands>[0]["db"],
  now: string,
) {
  return createOwnerMaterialRelationCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
}

export type _createMusicDataPlatformRetrievalReadPortInputShape = Expect<
  Equal<keyof CreateMusicDataPlatformRetrievalReadPortInput, "db">
>;

export type _retrievalOrderShape = Expect<
  Equal<RetrievalOrder, "text_relevance" | "recently_added" | "stable">
>;

export type _retrievalTextFieldShape = Expect<
  Equal<RetrievalTextField, "title" | "artist" | "album" | "version" | "alias">
>;

export type _retrievalReadPoolFilterShape = Expect<
  Equal<keyof RetrievalReadPoolFilter, "allOf" | "anyOf" | "noneOf">
>;

export type _recentlyAddedCursorShape = Expect<
  Equal<
    keyof CursorByOrder<"recently_added">,
    "order" | "recentlyAddedAt" | "materialRefKey"
  >
>;

export type _stableCursorShape = Expect<
  Equal<keyof CursorByOrder<"stable">, "order" | "materialRefKey">
>;

export type _retrievalMatchedTextTokenEvidenceShape = Expect<
  Equal<keyof RetrievalMatchedTextTokenEvidence, "field" | "tokens">
>;

export type _musicDataPlatformRetrievalSearchInputShape = Expect<
  Equal<
    keyof MusicDataPlatformRetrievalSearchInput,
    "ownerScope" | "text" | "materialKind" | "poolFilter" | "order" | "limit" | "cursorPosition"
  >
>;

export type _musicDataPlatformRetrievalMaterialRowShape = Expect<
  Equal<
    keyof MusicDataPlatformRetrievalMaterialRow,
    | "materialRef"
    | "materialKind"
    | "titleText"
    | "artistText"
    | "albumText"
    | "versionText"
    | "aliasText"
    | "recentlyAddedAt"
    | "matchedPoolRefs"
    | "matchedTextFields"
    | "matchedTextTokensByField"
    | "matchedTokenCount"
    | "rankScore"
  >
>;

export type _musicDataPlatformRetrievalSearchPageShape = Expect<
  Equal<keyof MusicDataPlatformRetrievalSearchPage, "rows" | "nextCursorPosition">
>;

export type _retrievalFreshnessShape = Expect<
  Equal<keyof RetrievalFreshness, "status" | "dirtyTargetCount" | "failedTargetCount">
>;

export type _musicDataPlatformRetrievalReadPortShape = Expect<
  Equal<keyof MusicDataPlatformRetrievalReadPort, "searchOwnerCatalogMaterials" | "getRetrievalFreshness">
>;

const defaultDatabase = initializedDatabase();
const defaultLibraryRef = sourceLibraryRef(DEFAULT_OWNER_SCOPE, "130950618", "saved_source_track");
const alphaSource = sourceTrack("1001", "Alpha Source");
const betaSource = sourceTrack("1002", "Beta Source");
const blockedSource = sourceTrack("1003", "Blocked Source");
const alphaMaterialRef = materialRef("recording", "m_alpha");
const betaMaterialRef = materialRef("recording", "m_beta");
const blockedMaterialRef = materialRef("recording", "m_blocked");

defaultDatabase.transaction((db) => {
  const identity = createIdentityTestCommands(db, "2026-06-14T00:00:00.000Z");
  const ownerRelations = createOwnerRelationTestCommands(db, "2026-06-14T00:01:00.000Z");
  const libraries = createSourceLibraryRepositories({ db });

  bindSourceToMaterial(identity, alphaSource, alphaMaterialRef);
  bindSourceToMaterial(identity, betaSource, betaMaterialRef);
  bindSourceToMaterial(identity, blockedSource, blockedMaterialRef);

  libraries.libraries.upsert({
    libraryRef: defaultLibraryRef,
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: defaultLibraryRef,
    sourceRefKey: refKey(alphaSource.sourceRef),
    addedAt: "2026-06-14T01:00:00.000Z",
    providerAddedAt: "2026-06-10T01:00:00.000Z",
    firstImportedAt: "2026-06-14T01:00:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: defaultLibraryRef,
    sourceRefKey: refKey(betaSource.sourceRef),
    addedAt: "2026-06-14T03:00:00.000Z",
    providerAddedAt: "2026-06-10T03:00:00.000Z",
    firstImportedAt: "2026-06-14T03:00:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: defaultLibraryRef,
    sourceRefKey: refKey(blockedSource.sourceRef),
    addedAt: "2026-06-14T05:00:00.000Z",
    providerAddedAt: "2026-06-10T05:00:00.000Z",
    firstImportedAt: "2026-06-14T05:00:00.000Z",
  });
  ownerRelations.recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: blockedMaterialRef,
    relationKind: "blocked",
    origin: "user_explicit",
  });
  createMaterialTextProjectionCommands({
    db,
    now: "2026-06-14T00:02:00.000Z",
  }).rebuildMaterialTextDocument({
    materialRef: alphaMaterialRef,
  });
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-14T00:03:00.000Z",
  }).rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: defaultLibraryRef,
  });
});

const defaultReadPort = createMusicDataPlatformRetrievalReadPort({
  db: defaultDatabase.context(),
});
const defaultPage = defaultReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "recently_added",
  limit: 10,
});
assert.deepEqual(
  defaultPage.rows.map((row) => refKey(row.materialRef)),
  [refKey(betaMaterialRef), refKey(alphaMaterialRef)],
);
assert.equal(defaultPage.nextCursorPosition, undefined);
assert.equal(defaultPage.rows[0]?.titleText, "");
assert.equal(defaultPage.rows[0]?.artistText, "");
assert.equal(defaultPage.rows[0]?.matchedTextFields.length, 0);
assert.equal(defaultPage.rows[0]?.matchedTextTokensByField, undefined);
assert.equal(defaultPage.rows[0]?.matchedTokenCount, undefined);
assert.equal(defaultPage.rows[0]?.rankScore, undefined);
assert.deepEqual(defaultPage.rows[0]?.matchedPoolRefs, []);
assert.equal(defaultPage.rows[1]?.titleText, "alpha source");
defaultDatabase.close();

const libraryPoolDatabase = initializedDatabase();
const libraryAPoolRef = sourceLibraryRef(DEFAULT_OWNER_SCOPE, "2001", "saved_source_track");
const libraryBPoolRef = sourceLibraryRef(DEFAULT_OWNER_SCOPE, "2002", "saved_source_track");
const poolSourceOne = sourceTrack("2001", "Pool One");
const poolSourceTwo = sourceTrack("2002", "Pool Two");
const poolSourceThree = sourceTrack("2003", "Pool Three");
const poolMaterialOne = materialRef("recording", "m_pool_1");
const poolMaterialTwo = materialRef("recording", "m_pool_2");
const poolMaterialThree = materialRef("recording", "m_pool_3");

libraryPoolDatabase.transaction((db) => {
  const identity = createIdentityTestCommands(db, "2026-06-14T01:00:00.000Z");
  const libraries = createSourceLibraryRepositories({ db });

  bindSourceToMaterial(identity, poolSourceOne, poolMaterialOne);
  bindSourceToMaterial(identity, poolSourceTwo, poolMaterialTwo);
  bindSourceToMaterial(identity, poolSourceThree, poolMaterialThree);

  upsertLibrary(libraries, libraryAPoolRef, DEFAULT_OWNER_SCOPE, "2001", "saved_source_track");
  upsertLibrary(libraries, libraryBPoolRef, DEFAULT_OWNER_SCOPE, "2002", "saved_source_track");

  libraries.items.upsert({
    libraryRef: libraryAPoolRef,
    sourceRefKey: refKey(poolSourceOne.sourceRef),
    addedAt: "2026-06-14T01:00:00.000Z",
    providerAddedAt: "2026-06-11T01:00:00.000Z",
    firstImportedAt: "2026-06-14T01:00:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: libraryAPoolRef,
    sourceRefKey: refKey(poolSourceTwo.sourceRef),
    addedAt: "2026-06-14T02:00:00.000Z",
    providerAddedAt: "2026-06-11T02:00:00.000Z",
    firstImportedAt: "2026-06-14T02:00:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: libraryBPoolRef,
    sourceRefKey: refKey(poolSourceOne.sourceRef),
    addedAt: "2026-06-14T03:00:00.000Z",
    providerAddedAt: "2026-06-11T03:00:00.000Z",
    firstImportedAt: "2026-06-14T03:00:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: libraryBPoolRef,
    sourceRefKey: refKey(poolSourceThree.sourceRef),
    addedAt: "2026-06-14T04:00:00.000Z",
    providerAddedAt: "2026-06-11T04:00:00.000Z",
    firstImportedAt: "2026-06-14T04:00:00.000Z",
  });

  const projectionCommands = createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-14T01:05:00.000Z",
  });
  projectionCommands.rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: libraryAPoolRef,
  });
  projectionCommands.rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: libraryBPoolRef,
  });
});

const libraryPoolReadPort = createMusicDataPlatformRetrievalReadPort({
  db: libraryPoolDatabase.context(),
});
const allOfPage = libraryPoolReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "stable",
  limit: 10,
  poolFilter: {
    allOf: [libraryAPoolRef, libraryBPoolRef],
  },
});
assert.deepEqual(
  allOfPage.rows.map((row) => refKey(row.materialRef)),
  [refKey(poolMaterialOne)],
);
assert.deepEqual(
  allOfPage.rows[0]?.matchedPoolRefs.map((ref) => refKey(ref)),
  [refKey(libraryAPoolRef), refKey(libraryBPoolRef)],
);

const anyOfPage = libraryPoolReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "stable",
  limit: 10,
  poolFilter: {
    anyOf: [libraryBPoolRef],
  },
});
assert.deepEqual(
  anyOfPage.rows.map((row) => refKey(row.materialRef)),
  [refKey(poolMaterialOne), refKey(poolMaterialThree)],
);
assert.deepEqual(
  anyOfPage.rows.map((row) => row.matchedPoolRefs.map((ref) => refKey(ref))),
  [[refKey(libraryBPoolRef)], [refKey(libraryBPoolRef)]],
);

const noneOfPage = libraryPoolReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "stable",
  limit: 10,
  poolFilter: {
    noneOf: [libraryBPoolRef],
  },
});
assert.deepEqual(
  noneOfPage.rows.map((row) => refKey(row.materialRef)),
  [refKey(poolMaterialTwo)],
);
assert.deepEqual(noneOfPage.rows[0]?.matchedPoolRefs, []);

const normalizedEmptyPoolPage = libraryPoolReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "stable",
  limit: 10,
  poolFilter: {
    allOf: [],
  },
});
assert.deepEqual(
  normalizedEmptyPoolPage.rows.map((row) => refKey(row.materialRef)),
  [refKey(poolMaterialOne), refKey(poolMaterialTwo), refKey(poolMaterialThree)],
);
libraryPoolDatabase.close();

const relationPoolDatabase = initializedDatabase();
const savedRecordingRef = materialRef("recording", "m_saved_recording");
const savedAlbumRef = materialRef("album", "m_saved_album");
const favoriteArtistRef = materialRef("artist", "m_favorite_artist");
const savedPoolRef = createOwnerRelationPoolRef({
  ownerScope: DEFAULT_OWNER_SCOPE,
  relationKind: "saved",
});
const favoritePoolRef = createOwnerRelationPoolRef({
  ownerScope: DEFAULT_OWNER_SCOPE,
  relationKind: "favorite",
});

relationPoolDatabase.transaction((db) => {
  const identity = createIdentityTestCommands(db, "2026-06-14T02:00:00.000Z");
  const ownerRelations = createOwnerRelationTestCommands(db, "2026-06-14T02:01:00.000Z");
  const projectionCommands = createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-14T02:02:00.000Z",
  });

  identity.upsertMaterialRecord({ materialRef: savedRecordingRef, kind: "recording" });
  identity.upsertMaterialRecord({ materialRef: savedAlbumRef, kind: "album" });
  identity.upsertMaterialRecord({ materialRef: favoriteArtistRef, kind: "artist" });

  ownerRelations.recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: savedRecordingRef,
    relationKind: "saved",
    origin: "user_explicit",
  });
  ownerRelations.recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: savedAlbumRef,
    relationKind: "saved",
    origin: "user_explicit",
  });
  ownerRelations.recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: favoriteArtistRef,
    relationKind: "favorite",
    origin: "user_explicit",
  });

  projectionCommands.rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: savedRecordingRef,
  });
  projectionCommands.rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: savedAlbumRef,
  });
  projectionCommands.rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: favoriteArtistRef,
  });
});

const relationPoolReadPort = createMusicDataPlatformRetrievalReadPort({
  db: relationPoolDatabase.context(),
});
const savedPoolPage = relationPoolReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "stable",
  limit: 10,
  poolFilter: {
    anyOf: [savedPoolRef],
  },
});
assert.deepEqual(
  savedPoolPage.rows.map((row) => refKey(row.materialRef)),
  [refKey(savedAlbumRef), refKey(savedRecordingRef)],
);
assert.deepEqual(
  savedPoolPage.rows.map((row) => row.matchedPoolRefs.map((ref) => refKey(ref))),
  [[refKey(savedPoolRef)], [refKey(savedPoolRef)]],
);

const savedAlbumOnlyPage = relationPoolReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "stable",
  limit: 10,
  materialKind: "album",
  poolFilter: {
    anyOf: [savedPoolRef],
  },
});
assert.deepEqual(
  savedAlbumOnlyPage.rows.map((row) => refKey(row.materialRef)),
  [refKey(savedAlbumRef)],
);

const favoriteArtistPage = relationPoolReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "stable",
  limit: 10,
  materialKind: "artist",
  poolFilter: {
    anyOf: [favoritePoolRef],
  },
});
assert.deepEqual(
  favoriteArtistPage.rows.map((row) => refKey(row.materialRef)),
  [refKey(favoriteArtistRef)],
);

const emptyPoolDatabase = initializedDatabase();
const emptyPoolPage = createMusicDataPlatformRetrievalReadPort({
  db: emptyPoolDatabase.context(),
}).searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "stable",
  limit: 10,
  poolFilter: {
    anyOf: [favoritePoolRef],
  },
});
assert.deepEqual(emptyPoolPage.rows, []);
emptyPoolDatabase.close();
relationPoolDatabase.close();

const paginationDatabase = initializedDatabase();
const paginationLibraryRef = sourceLibraryRef(DEFAULT_OWNER_SCOPE, "3001", "saved_source_track");
const paginationSourceA = sourceTrack("3001", "Page A");
const paginationSourceB = sourceTrack("3002", "Page B");
const paginationSourceC = sourceTrack("3003", "Page C");
const paginationMaterialA = materialRef("recording", "m_page_a");
const paginationMaterialB = materialRef("recording", "m_page_b");
const paginationMaterialC = materialRef("recording", "m_page_c");

paginationDatabase.transaction((db) => {
  const identity = createIdentityTestCommands(db, "2026-06-14T03:00:00.000Z");
  const libraries = createSourceLibraryRepositories({ db });

  bindSourceToMaterial(identity, paginationSourceA, paginationMaterialA);
  bindSourceToMaterial(identity, paginationSourceB, paginationMaterialB);
  bindSourceToMaterial(identity, paginationSourceC, paginationMaterialC);

  upsertLibrary(libraries, paginationLibraryRef, DEFAULT_OWNER_SCOPE, "3001", "saved_source_track");
  libraries.items.upsert({
    libraryRef: paginationLibraryRef,
    sourceRefKey: refKey(paginationSourceA.sourceRef),
    addedAt: "2026-06-14T01:00:00.000Z",
    providerAddedAt: "2026-06-12T03:00:00.000Z",
    firstImportedAt: "2026-06-14T01:00:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: paginationLibraryRef,
    sourceRefKey: refKey(paginationSourceB.sourceRef),
    addedAt: "2026-06-14T02:00:00.000Z",
    providerAddedAt: "2026-06-12T03:00:00.000Z",
    firstImportedAt: "2026-06-14T02:00:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: paginationLibraryRef,
    sourceRefKey: refKey(paginationSourceC.sourceRef),
    addedAt: "2026-06-14T03:00:00.000Z",
    providerAddedAt: "2026-06-12T01:00:00.000Z",
    firstImportedAt: "2026-06-14T03:00:00.000Z",
  });
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-14T03:05:00.000Z",
  }).rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: paginationLibraryRef,
  });
});

const paginationReadPort = createMusicDataPlatformRetrievalReadPort({
  db: paginationDatabase.context(),
});
const stablePageOne = paginationReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "stable",
  limit: 2,
});
assert.deepEqual(
  stablePageOne.rows.map((row) => refKey(row.materialRef)),
  [refKey(paginationMaterialA), refKey(paginationMaterialB)],
);
assert.deepEqual(stablePageOne.nextCursorPosition, {
  order: "stable",
  materialRefKey: refKey(paginationMaterialB),
});

const stablePageTwo = paginationReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "stable",
  limit: 2,
  cursorPosition: stablePageOne.nextCursorPosition,
});
assert.deepEqual(
  stablePageTwo.rows.map((row) => refKey(row.materialRef)),
  [refKey(paginationMaterialC)],
);

const recentPageOne = paginationReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "recently_added",
  limit: 1,
});
assert.deepEqual(
  recentPageOne.rows.map((row) => refKey(row.materialRef)),
  [refKey(paginationMaterialA)],
);
assert.deepEqual(recentPageOne.nextCursorPosition, {
  order: "recently_added",
  recentlyAddedAt: "2026-06-12T03:00:00.000Z",
  materialRefKey: refKey(paginationMaterialA),
});

const recentPageTwo = paginationReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "recently_added",
  limit: 1,
  cursorPosition: recentPageOne.nextCursorPosition,
});
assert.deepEqual(
  recentPageTwo.rows.map((row) => refKey(row.materialRef)),
  [refKey(paginationMaterialB)],
);
const recentPageTwoCursor = recentPageTwo.nextCursorPosition;
if (recentPageTwoCursor === undefined) {
  throw new Error("expected recently_added page 2 to expose a continuation cursor");
}

const recentPageThree = paginationReadPort.searchOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "recently_added",
  limit: 1,
  cursorPosition: recentPageTwoCursor,
});
assert.deepEqual(
  recentPageThree.rows.map((row) => refKey(row.materialRef)),
  [refKey(paginationMaterialC)],
);
paginationDatabase.close();

const validationDatabase = initializedDatabase();
const validationReadPort = createMusicDataPlatformRetrievalReadPort({
  db: validationDatabase.context(),
});
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: "other_owner",
    order: "stable",
    limit: 10,
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_scope_unsupported",
);
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "stable",
    limit: 10,
    text: "plainsong",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_read_invalid",
);
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "text_relevance",
    limit: 10,
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_read_invalid",
);
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "stable",
    limit: 0,
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_read_invalid",
);
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "stable",
    limit: 10,
    materialKind: "bad_kind" as MaterialEntityKind,
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_read_invalid",
);
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "recently_added",
    limit: 10,
    cursorPosition: {
      order: "recently_added",
      recentlyAddedAt: "not-a-date",
      materialRefKey: refKey(materialRef("recording", "cursor_bad")),
    },
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_read_invalid",
);
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "stable",
    limit: 10,
    cursorPosition: {
      order: "text_relevance",
      matchedTokenCount: 1,
      bestFieldPriority: 1,
      rankSortValue: 1,
      materialRefKey: refKey(materialRef("recording", "cursor_text")),
    },
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_read_invalid",
);
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "stable",
    limit: 10,
    poolFilter: {
      allOf: [materialRef("recording", "unsupported_pool")],
    },
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_read_invalid",
);
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "stable",
    limit: 10,
    poolFilter: {
      anyOf: [sourceLibraryRef(DEFAULT_OWNER_SCOPE, "missing", "saved_source_track")],
    },
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.source_library_not_found",
);

validationDatabase.transaction((db) => {
  const libraries = createSourceLibraryRepositories({ db });
  const foreignLibraryRef = sourceLibraryRef("other_owner", "777", "saved_source_track");

  libraries.libraries.upsert({
    libraryRef: foreignLibraryRef,
    ownerScope: "other_owner",
    providerId: "netease",
    providerAccountId: "777",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-14T04:00:00.000Z",
    updatedAt: "2026-06-14T04:00:00.000Z",
  });
});
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "stable",
    limit: 10,
    poolFilter: {
      anyOf: [sourceLibraryRef("other_owner", "777", "saved_source_track")],
    },
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.source_library_owner_scope_mismatch",
);
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "stable",
    limit: 10,
    poolFilter: {
      anyOf: [createOwnerRelationPoolRef({
        ownerScope: "other_owner",
        relationKind: "saved",
      })],
    },
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_relation_pool_ref_invalid",
);
assert.throws(
  () => validationReadPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "stable",
    limit: 10,
    poolFilter: {
      anyOf: [{
        namespace: "owner_material_relation_pool",
        kind: "blocked",
        id: "rp_blocked",
      }],
    },
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid",
);
validationDatabase.close();

const freshnessDatabase = initializedDatabase();
const freshnessReadPort = createMusicDataPlatformRetrievalReadPort({
  db: freshnessDatabase.context(),
});
const freshnessLibraryRef = sourceLibraryRef(DEFAULT_OWNER_SCOPE, "9001", "saved_source_track");
const freshnessMaterialRef = materialRef("recording", "m_fresh");

freshnessDatabase.transaction((db) => {
  const commands = createProjectionMaintenanceCommands({
    db,
    now: "2026-06-14T05:00:00.000Z",
  });

  commands.markProjectionTargetDirty({
    projectionKind: "owner_catalog_source_library",
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: freshnessLibraryRef,
  });
  commands.markProjectionTargetDirty({
    projectionKind: "owner_catalog_relation_material",
    ownerScope: "other_owner",
    materialRef: freshnessMaterialRef,
  });

  const failedTarget = commands.markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: freshnessMaterialRef,
  });
  commands.markProjectionFailed({
    projectionKind: "material_text",
    targetKey: failedTarget.targetKey,
    expectedDirtyGeneration: failedTarget.dirtyGeneration,
    failureCode: "test_failure",
    failureMessage: "test failure",
  });
});

assert.deepEqual(
  freshnessReadPort.getRetrievalFreshness({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }),
  {
    status: "possibly_stale",
    dirtyTargetCount: 1,
    failedTargetCount: 1,
  },
);
const currentFreshnessDatabase = initializedDatabase();
assert.deepEqual(
  createMusicDataPlatformRetrievalReadPort({
    db: currentFreshnessDatabase.context(),
  }).getRetrievalFreshness({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }),
  { status: "current" },
);
currentFreshnessDatabase.close();
freshnessDatabase.close();

function initializedDatabase(): ReturnType<typeof SqliteMusicDatabase.open> {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformSourceLibrarySchema,
      musicDataPlatformOwnerRelationSchema,
      musicDataPlatformOwnerCatalogEntriesSchema,
      musicDataPlatformOwnerCatalogViewSchema,
      musicDataPlatformMaterialTextProjectionSchema,
      musicDataPlatformProjectionMaintenanceSchema,
    ],
  });
  return database;
}

function bindSourceToMaterial(
  identity: ReturnType<typeof createIdentityTestCommands>,
  source: SourceEntity,
  nextMaterialRef: Ref,
): void {
  identity.upsertSourceRecord({ entity: source });
  identity.upsertMaterialRecord({
    materialRef: nextMaterialRef,
    kind: nextMaterialRef.kind as MaterialEntityKind,
  });
  identity.bindSourceToMaterial({
    sourceRef: source.sourceRef,
    materialRef: nextMaterialRef,
    makePrimary: true,
  });
}

function upsertLibrary(
  libraries: ReturnType<typeof createSourceLibraryRepositories>,
  libraryRef: Ref,
  ownerScope: string,
  providerAccountId: string,
  libraryKind: "saved_source_track" | "saved_source_album" | "followed_source_artist",
): void {
  libraries.libraries.upsert({
    libraryRef,
    ownerScope,
    providerId: "netease",
    providerAccountId,
    libraryKind,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  });
}

function materialRef(kind: MaterialEntityKind, id: string): Ref {
  return {
    namespace: "material",
    kind,
    id,
  };
}

function sourceTrack(id: string, title: string): SourceTrack {
  return {
    kind: "track",
    sourceRef: sourceRef("track", id),
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
  };
}

function sourceAlbum(id: string, title: string): SourceAlbum {
  return {
    kind: "album",
    sourceRef: sourceRef("album", id),
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
  };
}

function sourceArtist(id: string, name: string): SourceArtist {
  return {
    kind: "artist",
    sourceRef: sourceRef("artist", id),
    providerId: "netease",
    providerEntityId: id,
    label: name,
    name,
  };
}

function sourceRef(kind: "track" | "album" | "artist", id: string): Ref {
  return {
    namespace: "source_netease",
    kind,
    id,
  };
}

function sourceLibraryRef(
  ownerScope: string,
  providerAccountId: string,
  libraryKind: "saved_source_track" | "saved_source_album" | "followed_source_artist",
): Ref {
  return createSourceLibraryRef({
    ownerScope,
    providerId: "netease",
    providerAccountId,
    libraryKind,
  });
}
