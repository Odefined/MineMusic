import assert from "node:assert/strict";

import {
  refKey,
  type Ref,
} from "../../src/contracts/index.js";
import {
  DEFAULT_OWNER_SCOPE,
  createOwnerCatalogProjectionCommands,
  createOwnerCatalogRecords,
  createSourceLibraryRef,
  isMusicDataPlatformError,
  musicDataPlatformIdentitySchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformSourceLibrarySchema,
  type OwnerCatalogMaterialRecord,
  type OwnerCatalogProjectionCommands,
  type OwnerMaterialEntryRecord,
  type RebuildOwnerRelationEntriesInput,
  type RebuildSourceLibraryEntriesForLibraryInput,
  type RebuildSourceLibraryEntriesForMaterialInput,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import { SqliteMusicDatabase } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

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

export type _ownerMaterialEntryRecordShape = Expect<
  Equal<
    keyof OwnerMaterialEntryRecord,
    | "entryKey"
    | "ownerScope"
    | "entryKind"
    | "entryRefKey"
    | "materialRefKey"
    | "visibilityRole"
    | "active"
    | "provenanceJson"
    | "createdAt"
    | "updatedAt"
  >
>;

export type _ownerCatalogMaterialRecordShape = Expect<
  Equal<
    keyof OwnerCatalogMaterialRecord,
    | "ownerScope"
    | "materialRefKey"
    | "positiveEntryCount"
    | "updatedAt"
    | "recentlyAddedAt"
    | "provenanceJson"
  >
>;

export type _ownerCatalogProjectionCommandsShape = Expect<
  Equal<
    keyof OwnerCatalogProjectionCommands,
    | "rebuildSourceLibraryEntriesForLibrary"
    | "rebuildSourceLibraryEntriesForMaterial"
    | "rebuildOwnerRelationEntries"
  >
>;

export type _rebuildSourceLibraryEntriesForLibraryInputShape = Expect<
  Equal<keyof RebuildSourceLibraryEntriesForLibraryInput, "ownerScope" | "libraryRef">
>;

export type _rebuildSourceLibraryEntriesForMaterialInputShape = Expect<
  Equal<keyof RebuildSourceLibraryEntriesForMaterialInput, "ownerScope" | "materialRef">
>;

export type _rebuildOwnerRelationEntriesInputShape = Expect<
  Equal<keyof RebuildOwnerRelationEntriesInput, "ownerScope" | "materialRef">
>;

const groupedDatabase = initializedDatabase();
const ownerCatalogView = groupedDatabase.context().get<{ type: string }>(
  "SELECT type FROM sqlite_schema WHERE name = 'owner_material_catalog_view'",
);
assert.equal(ownerCatalogView?.type, "view");
const ownerEntryColumns = groupedDatabase.context().all<{ name: string }>(
  "PRAGMA table_info(owner_material_entries)",
).map((column) => column.name);
for (const forbiddenColumn of [
  "source_ref_key",
  "provider_id",
  "provider_account_id",
  "library_kind",
  "query",
  "rank",
  "score",
  "display_links_json",
  "card_seed_json",
  "raw_provider_payload_json",
  "stage_interface_output_json",
]) {
  assert.equal(ownerEntryColumns.includes(forbiddenColumn), false);
}
assert.equal(
  uniqueIndexCovers(groupedDatabase, "owner_material_entries", [
    "owner_scope",
    "entry_kind",
    "entry_ref_key",
    "material_ref_key",
  ]),
  true,
);
const groupedLibraryRef = sourceLibraryRef("130950618", "saved_source_track");
const groupedMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_grouped",
};

groupedDatabase.transaction((db) => {
  const commands = createIdentityTestCommands(db, "2026-06-08T00:00:00.000Z");
  const repositories = createSourceLibraryRepositories({ db });
  const firstSource = sourceTrack("1001", "Grouped One");
  const secondSource = sourceTrack("1002", "Grouped Two");

  commands.upsertSourceRecord({ entity: firstSource });
  commands.upsertSourceRecord({ entity: secondSource });
  commands.upsertMaterialRecord({
    materialRef: groupedMaterialRef,
    kind: "recording",
  });
  commands.bindSourceToMaterial({
    sourceRef: firstSource.sourceRef,
    materialRef: groupedMaterialRef,
    makePrimary: true,
  });
  commands.bindSourceToMaterial({
    sourceRef: secondSource.sourceRef,
    materialRef: groupedMaterialRef,
  });

  repositories.libraries.upsert({
    libraryRef: groupedLibraryRef,
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  });
  repositories.items.upsert({
    libraryRef: groupedLibraryRef,
    sourceRefKey: refKey(firstSource.sourceRef),
    addedAt: "2026-06-08T01:00:00.000Z",
    providerAddedAt: "2026-06-07T01:00:00.000Z",
    firstImportedAt: "2026-06-08T01:00:00.000Z",
  });
  repositories.items.upsert({
    libraryRef: groupedLibraryRef,
    sourceRefKey: refKey(secondSource.sourceRef),
    addedAt: "2026-06-08T03:00:00.000Z",
    providerAddedAt: "2026-06-07T03:00:00.000Z",
    firstImportedAt: "2026-06-08T03:00:00.000Z",
  });
});

const groupedSummary = groupedDatabase.transaction((db) => {
  return createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-09T00:00:00.000Z",
  }).rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: groupedLibraryRef,
  });
});
assert.deepEqual(groupedSummary, {
  sourceLibraryItemCount: 2,
  projectedEntryCount: 1,
  obsoleteEntryDeleteCount: 0,
});

const groupedReadPort = createOwnerCatalogRecords({ db: groupedDatabase.context() });
const groupedEntries = groupedReadPort.listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryRef: groupedLibraryRef,
});
assert.equal(groupedEntries.length, 1);
assert.equal(groupedEntries[0]?.entryKind, "source_library");
assert.equal(groupedEntries[0]?.entryRefKey, refKey(groupedLibraryRef));
assert.equal(groupedEntries[0]?.materialRefKey, refKey(groupedMaterialRef));
assert.equal(groupedEntries[0]?.active, true);
assert.deepEqual(groupedEntries[0]?.provenanceJson, {
  kind: "source_library",
  libraryRefKey: refKey(groupedLibraryRef),
  sourceItemCount: 2,
  firstAddedAt: "2026-06-08T01:00:00.000Z",
  lastAddedAt: "2026-06-08T03:00:00.000Z",
  firstProviderAddedAt: "2026-06-07T01:00:00.000Z",
  lastProviderAddedAt: "2026-06-07T03:00:00.000Z",
});

const groupedCatalog = groupedReadPort.listOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
});
assert.equal(groupedCatalog.length, 1);
assert.equal(groupedCatalog[0]?.materialRefKey, refKey(groupedMaterialRef));
assert.equal(groupedCatalog[0]?.positiveEntryCount, 1);
assert.equal(groupedCatalog[0]?.recentlyAddedAt, "2026-06-07T03:00:00.000Z");
assert.deepEqual(groupedCatalog[0]?.provenanceJson, [groupedEntries[0]?.provenanceJson]);

const groupedRepeatSummary = groupedDatabase.transaction((db) => {
  return createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-09T00:05:00.000Z",
  }).rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: groupedLibraryRef,
  });
});
assert.deepEqual(groupedRepeatSummary, {
  sourceLibraryItemCount: 2,
  projectedEntryCount: 1,
  obsoleteEntryDeleteCount: 0,
});
groupedDatabase.close();

const missingLibraryDatabase = initializedDatabase();
assert.throws(
  () => missingLibraryDatabase.transaction((db) => {
    createOwnerCatalogProjectionCommands({
      db,
      now: "2026-06-09T01:00:00.000Z",
    }).rebuildSourceLibraryEntriesForLibrary({
      ownerScope: DEFAULT_OWNER_SCOPE,
      libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
    });
  }),
  (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.source_library_not_found",
);
missingLibraryDatabase.close();

const ownerMismatchDatabase = initializedDatabase();
ownerMismatchDatabase.transaction((db) => {
  createSourceLibraryRepositories({ db }).libraries.upsert({
    libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  });
});
assert.throws(
  () => ownerMismatchDatabase.transaction((db) => {
    createOwnerCatalogProjectionCommands({
      db,
      now: "2026-06-09T01:05:00.000Z",
    }).rebuildSourceLibraryEntriesForLibrary({
      ownerScope: "other_owner",
      libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
    });
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.source_library_owner_scope_mismatch",
);
ownerMismatchDatabase.close();

const rebindDatabase = initializedDatabase();
const rebindLibraryRef = sourceLibraryRef("130950618", "saved_source_track");
const rebindSource = sourceTrack("1001", "Rebind Track");
const firstMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_before",
};
const secondMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_after",
};

rebindDatabase.transaction((db) => {
  const commands = createIdentityTestCommands(db, "2026-06-08T00:00:00.000Z");
  const repositories = createSourceLibraryRepositories({ db });

  commands.upsertSourceRecord({ entity: rebindSource });
  commands.upsertMaterialRecord({ materialRef: firstMaterialRef, kind: "recording" });
  commands.bindSourceToMaterial({
    sourceRef: rebindSource.sourceRef,
    materialRef: firstMaterialRef,
    makePrimary: true,
  });
  repositories.libraries.upsert({
    libraryRef: rebindLibraryRef,
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  });
  repositories.items.upsert({
    libraryRef: rebindLibraryRef,
    sourceRefKey: refKey(rebindSource.sourceRef),
    addedAt: "2026-06-08T01:00:00.000Z",
    firstImportedAt: "2026-06-08T01:00:00.000Z",
  });
});

rebindDatabase.transaction((db) => {
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-09T02:00:00.000Z",
  }).rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: rebindLibraryRef,
  });
});

const rebindSummaries = rebindDatabase.transaction((db) => {
  const commands = createIdentityTestCommands(db, "2026-06-09T02:05:00.000Z");

  commands.upsertMaterialRecord({
    materialRef: secondMaterialRef,
    kind: "recording",
  });
  commands.bindSourceToMaterial({
    sourceRef: rebindSource.sourceRef,
    materialRef: secondMaterialRef,
    makePrimary: true,
  });

  const projectionCommands = createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-09T02:06:00.000Z",
  });
  return {
    previousMaterial: projectionCommands.rebuildSourceLibraryEntriesForMaterial({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: firstMaterialRef,
    }),
    nextMaterial: projectionCommands.rebuildSourceLibraryEntriesForMaterial({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: secondMaterialRef,
    }),
  };
});
assert.deepEqual(rebindSummaries, {
  previousMaterial: {
    sourceLibraryItemCount: 0,
    projectedEntryCount: 0,
    obsoleteEntryDeleteCount: 1,
  },
  nextMaterial: {
    sourceLibraryItemCount: 1,
    projectedEntryCount: 1,
    obsoleteEntryDeleteCount: 0,
  },
});

const rebindEntries = createOwnerCatalogRecords({ db: rebindDatabase.context() })
  .listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: rebindLibraryRef,
  });
assert.deepEqual(
  rebindEntries.map((entry) => entry.materialRefKey),
  [refKey(secondMaterialRef)],
);
rebindDatabase.close();

const mergeDatabase = initializedDatabase();
const mergeLibraryRef = sourceLibraryRef("130950618", "saved_source_track");
const mergeSource = sourceTrack("1001", "Merge Track");
const loserMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_loser",
};
const winnerMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_winner",
};

mergeDatabase.transaction((db) => {
  const commands = createIdentityTestCommands(db, "2026-06-08T00:00:00.000Z");
  const repositories = createSourceLibraryRepositories({ db });

  commands.upsertSourceRecord({ entity: mergeSource });
  commands.upsertMaterialRecord({ materialRef: loserMaterialRef, kind: "recording" });
  commands.upsertMaterialRecord({ materialRef: winnerMaterialRef, kind: "recording" });
  commands.bindSourceToMaterial({
    sourceRef: mergeSource.sourceRef,
    materialRef: loserMaterialRef,
    makePrimary: true,
  });
  repositories.libraries.upsert({
    libraryRef: mergeLibraryRef,
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  });
  repositories.items.upsert({
    libraryRef: mergeLibraryRef,
    sourceRefKey: refKey(mergeSource.sourceRef),
    addedAt: "2026-06-08T01:00:00.000Z",
    firstImportedAt: "2026-06-08T01:00:00.000Z",
  });
});

mergeDatabase.transaction((db) => {
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-09T03:00:00.000Z",
  }).rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: mergeLibraryRef,
  });
});

const mergeSummaries = mergeDatabase.transaction((db) => {
  const commands = createIdentityTestCommands(db, "2026-06-09T03:05:00.000Z");

  commands.mergeMaterialRecord({
    loserMaterialRef,
    winnerMaterialRef,
  });
  const projectionCommands = createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-09T03:06:00.000Z",
  });
  return {
    loserMaterial: projectionCommands.rebuildSourceLibraryEntriesForMaterial({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: loserMaterialRef,
    }),
    winnerMaterial: projectionCommands.rebuildSourceLibraryEntriesForMaterial({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: winnerMaterialRef,
    }),
  };
});
assert.deepEqual(mergeSummaries, {
  loserMaterial: {
    sourceLibraryItemCount: 0,
    projectedEntryCount: 0,
    obsoleteEntryDeleteCount: 1,
  },
  winnerMaterial: {
    sourceLibraryItemCount: 1,
    projectedEntryCount: 1,
    obsoleteEntryDeleteCount: 0,
  },
});

const mergeReadPort = createOwnerCatalogRecords({ db: mergeDatabase.context() });
const mergeEntries = mergeReadPort.listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryRef: mergeLibraryRef,
});
assert.deepEqual(
  mergeEntries.map((entry) => entry.materialRefKey),
  [refKey(winnerMaterialRef)],
);
assert.deepEqual(
  mergeReadPort.listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }).map((row) => row.materialRefKey),
  [refKey(winnerMaterialRef)],
);
mergeDatabase.close();

const emptyLibraryDatabase = initializedDatabase();
emptyLibraryDatabase.transaction((db) => {
  createSourceLibraryRepositories({ db }).libraries.upsert({
    libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  });
});
const emptySummary = emptyLibraryDatabase.transaction((db) => {
  return createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-09T04:00:00.000Z",
  }).rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
  });
});
assert.deepEqual(emptySummary, {
  sourceLibraryItemCount: 0,
  projectedEntryCount: 0,
  obsoleteEntryDeleteCount: 0,
});
emptyLibraryDatabase.close();

function initializedDatabase(): ReturnType<typeof SqliteMusicDatabase.open> {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformSourceLibrarySchema,
      musicDataPlatformOwnerCatalogEntriesSchema,
      musicDataPlatformOwnerRelationSchema,
      musicDataPlatformOwnerCatalogViewSchema,
    ],
  });

  return database;
}

function sourceTrack(id: string, title: string): {
  kind: "track";
  sourceRef: Ref;
  providerId: string;
  providerEntityId: string;
  label: string;
  title: string;
} {
  return {
    kind: "track",
    sourceRef: sourceRef("track", id),
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
  };
}

function sourceRef(kind: string, id: string): Ref {
  return {
    namespace: "source_netease",
    kind,
    id,
  };
}

function sourceLibraryRef(
  providerAccountId: string,
  libraryKind: "saved_source_track" | "saved_source_album" | "followed_source_artist",
): Ref {
  return createSourceLibraryRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId,
    libraryKind,
  });
}

function uniqueIndexCovers(
  database: ReturnType<typeof SqliteMusicDatabase.open>,
  tableName: string,
  columnNames: readonly string[],
): boolean {
  return database.context().all<{ name: string; unique: number }>(
    `PRAGMA index_list(${quotedPragmaName(tableName)})`,
  ).some((index) => {
    if (index.unique !== 1) {
      return false;
    }

    const indexColumns = database.context().all<{ name: string }>(
      `PRAGMA index_info(${quotedPragmaName(index.name)})`,
    ).map((column) => column.name);

    return indexColumns.length === columnNames.length &&
      columnNames.every((columnName) => indexColumns.includes(columnName));
  });
}

function quotedPragmaName(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
