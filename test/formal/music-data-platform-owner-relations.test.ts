import assert from "node:assert/strict";

import {
  refKey,
  type Ref,
} from "../../src/contracts/index.js";
import {
  DEFAULT_OWNER_SCOPE,
  assertOwnerMaterialRelationRef,
  assertOwnerRelationPoolRef,
  createIdentityWriteCommands,
  createOwnerCatalogProjectionCommands,
  createOwnerCatalogRecords,
  createOwnerMaterialRelationCommands,
  createOwnerMaterialRelationRecords,
  createOwnerMaterialRelationRef,
  createOwnerRelationPoolRef,
  createSourceLibraryRef,
  isMusicDataPlatformError,
  musicDataPlatformIdentitySchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformSourceLibrarySchema,
  type GetOwnerMaterialRelationInput,
  type ListOwnerMaterialRelationsInput,
  type OwnerMaterialRelationRecord,
  type OwnerRelationEntryKind,
  type OwnerRelationEntryProjectionSummary,
  type RecordOwnerMaterialRelationInput,
  type RemoveOwnerMaterialRelationInput,
} from "../../src/music_data_platform/index.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import {
  SqliteMusicDatabase,
  type MusicDatabaseTransactionContext,
} from "../../src/storage/index.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

export type _ownerMaterialRelationRecordShape = Expect<
  Equal<
    keyof OwnerMaterialRelationRecord,
    | "relationRef"
    | "relationRefKey"
    | "ownerScope"
    | "materialRef"
    | "materialRefKey"
    | "relationKind"
    | "origin"
    | "status"
    | "note"
    | "createdAt"
    | "updatedAt"
  >
>;

export type _recordOwnerMaterialRelationInputShape = Expect<
  Equal<
    keyof RecordOwnerMaterialRelationInput,
    | "ownerScope"
    | "materialRef"
    | "relationKind"
    | "origin"
    | "note"
  >
>;

export type _removeOwnerMaterialRelationInputShape = Expect<
  Equal<
    keyof RemoveOwnerMaterialRelationInput,
    | "ownerScope"
    | "materialRef"
    | "relationKind"
  >
>;

export type _getOwnerMaterialRelationInputShape = Expect<
  Equal<
    keyof GetOwnerMaterialRelationInput,
    | "ownerScope"
    | "materialRef"
    | "relationKind"
  >
>;

export type _listOwnerMaterialRelationsInputShape = Expect<
  Equal<
    keyof ListOwnerMaterialRelationsInput,
    | "ownerScope"
    | "materialRef"
    | "relationKinds"
    | "status"
  >
>;

export type _ownerRelationEntryProjectionSummaryShape = Expect<
  Equal<
    keyof OwnerRelationEntryProjectionSummary,
    | "relationFactCount"
    | "projectedEntryCount"
    | "obsoleteEntryDeleteCount"
  >
>;

const relationRefMaterial: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_relation_ref",
};
const savedRelationRef = createOwnerMaterialRelationRef({
  ownerScope: DEFAULT_OWNER_SCOPE,
  materialRef: relationRefMaterial,
  relationKind: "saved",
});
assert.deepEqual(
  savedRelationRef,
  createOwnerMaterialRelationRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: relationRefMaterial,
    relationKind: "saved",
  }),
);
assert.notEqual(
  refKey(savedRelationRef),
  refKey(createOwnerMaterialRelationRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: relationRefMaterial,
    relationKind: "favorite",
  })),
);
assert.notEqual(
  refKey(savedRelationRef),
  refKey(createOwnerMaterialRelationRef({
    ownerScope: "other_owner",
    materialRef: relationRefMaterial,
    relationKind: "saved",
  })),
);
assertOwnerMaterialRelationRef(savedRelationRef);

const savedPoolRef = createOwnerRelationPoolRef({
  ownerScope: DEFAULT_OWNER_SCOPE,
  relationKind: "saved",
});
assert.deepEqual(
  savedPoolRef,
  createOwnerRelationPoolRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "saved",
  }),
);
assert.notEqual(
  refKey(savedPoolRef),
  refKey(createOwnerRelationPoolRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "favorite",
  })),
);
assertOwnerRelationPoolRef(savedPoolRef);
assert.throws(
  () => assertOwnerRelationPoolRef({
    namespace: "owner_material_relation_pool",
    kind: "blocked",
    id: "rp_blocked",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid",
);

const schemaDatabase = initializedDatabase();
assert.equal(
  schemaDatabase.context().get<{ type: string }>(
    "SELECT type FROM sqlite_schema WHERE name = 'owner_material_relations'",
  )?.type,
  "table",
);
assert.equal(
  schemaDatabase.context().get<{ type: string }>(
    "SELECT type FROM sqlite_schema WHERE name = 'owner_material_catalog_view'",
  )?.type,
  "view",
);
const relationColumns = schemaDatabase.context().all<{ name: string }>(
  "PRAGMA table_info(owner_material_relations)",
).map((column) => column.name);
for (const forbiddenColumn of [
  "scope_level",
  "source_ref_key",
  "version_ref_key",
  "event_ref_key",
  "link_ref_key",
  "feedback_json",
  "memory_preference",
]) {
  assert.equal(relationColumns.includes(forbiddenColumn), false);
}
assert.equal(
  uniqueIndexCovers(schemaDatabase, "owner_material_relations", [
    "owner_scope",
    "material_ref_key",
    "relation_kind",
  ]),
  true,
);
assert.equal(
  schemaDatabase.context().get<{ type: string }>(
    "SELECT type FROM sqlite_schema WHERE name = 'owner_material_signals'",
  ),
  undefined,
);
schemaDatabase.close();

const recordDatabase = initializedDatabase();
const recordMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_record",
};
const secondRecordMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_record_second",
};

recordDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T00:00:00.000Z" });
  identity.upsertMaterialRecord({ materialRef: recordMaterialRef, kind: "recording" });
  identity.upsertMaterialRecord({ materialRef: secondRecordMaterialRef, kind: "recording" });
});

const initialSaved = recordDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:01:00.000Z",
  }).recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
    note: "first note",
  }));
assert.equal(initialSaved.status, "active");
assert.equal(initialSaved.origin, "user_explicit");
assert.equal(initialSaved.note, "first note");
assert.equal(
  createOwnerCatalogRecords({ db: recordDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
  }).length,
  0,
);

const rewrittenSaved = recordDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:02:00.000Z",
  }).recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
    origin: "imported",
  }));
assert.equal(rewrittenSaved.relationRefKey, initialSaved.relationRefKey);
assert.equal(rewrittenSaved.createdAt, initialSaved.createdAt);
assert.equal(rewrittenSaved.updatedAt, "2026-06-13T00:02:00.000Z");
assert.equal(rewrittenSaved.origin, "imported");
assert.equal("note" in rewrittenSaved, false);

const removedSaved = recordDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:03:00.000Z",
  }).removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
  }));
assert.equal(removedSaved.status, "removed");
assert.equal(removedSaved.updatedAt, "2026-06-13T00:03:00.000Z");
assert.equal(removedSaved.origin, "imported");
assert.equal("note" in removedSaved, false);

const recordReadPort = createOwnerMaterialRelationRecords({
  db: recordDatabase.context(),
});
assert.equal(
  recordReadPort.getOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
  })?.status,
  "removed",
);
assert.deepEqual(
  recordReadPort.listOwnerMaterialRelations({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }),
  [],
);
assert.deepEqual(
  recordReadPort.listOwnerMaterialRelations({
    ownerScope: DEFAULT_OWNER_SCOPE,
    status: "removed",
  }).map((record) => record.relationKind),
  ["saved"],
);

const removedAgain = recordDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:04:00.000Z",
  }).removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
  }));
assert.equal(removedAgain.status, "removed");
assert.equal(removedAgain.updatedAt, "2026-06-13T00:03:00.000Z");

const reactivatedSaved = recordDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:05:00.000Z",
  }).recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
    origin: "system",
    note: "reactivated",
  }));
assert.equal(reactivatedSaved.status, "active");
assert.equal(reactivatedSaved.createdAt, initialSaved.createdAt);
assert.equal(reactivatedSaved.updatedAt, "2026-06-13T00:05:00.000Z");
assert.equal(reactivatedSaved.origin, "system");
assert.equal(reactivatedSaved.note, "reactivated");

const favoriteWithNote = recordDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:06:00.000Z",
  }).recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: secondRecordMaterialRef,
    relationKind: "favorite",
    origin: "user_explicit",
    note: "keep this note",
  }));
const removedFavorite = recordDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:07:00.000Z",
  }).removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: secondRecordMaterialRef,
    relationKind: "favorite",
  }));
assert.equal(removedFavorite.status, "removed");
assert.equal(removedFavorite.origin, favoriteWithNote.origin);
assert.equal(removedFavorite.note, "keep this note");

assert.throws(
  () => createOwnerMaterialRelationRecords({
    db: recordDatabase.context(),
  }).listOwnerMaterialRelations({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKinds: [],
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid",
);
recordDatabase.close();

const archivedDatabase = initializedDatabase();
const archivedMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_archived_relation",
};
archivedDatabase.transaction((db) => {
  createIdentityWriteCommands({ db, now: "2026-06-13T00:08:00.000Z" })
    .upsertMaterialRecord({ materialRef: archivedMaterialRef, kind: "recording" });
  insertOwnerMaterialRelationRow(db, {
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: archivedMaterialRef,
    relationKind: "saved",
    origin: "system",
    status: "archived",
    note: "archived note",
    createdAt: "2026-06-13T00:08:30.000Z",
    updatedAt: "2026-06-13T00:08:30.000Z",
  });
});
const archivedReadPort = createOwnerMaterialRelationRecords({
  db: archivedDatabase.context(),
});
assert.equal(
  archivedReadPort.getOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: archivedMaterialRef,
    relationKind: "saved",
  })?.status,
  "archived",
);
assert.equal(
  archivedReadPort.listOwnerMaterialRelations({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }).length,
  0,
);
assert.equal(
  archivedReadPort.listOwnerMaterialRelations({
    ownerScope: DEFAULT_OWNER_SCOPE,
    status: "archived",
  }).length,
  1,
);
const archivedReactivated = archivedDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:09:00.000Z",
  }).recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: archivedMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
  }));
assert.equal(archivedReactivated.status, "active");
assert.equal(archivedReactivated.createdAt, "2026-06-13T00:08:30.000Z");
assert.equal("note" in archivedReactivated, false);
archivedDatabase.close();

const validationDatabase = initializedDatabase();
const validationMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_validation",
};
validationDatabase.transaction((db) => {
  createIdentityWriteCommands({ db, now: "2026-06-13T00:10:00.000Z" })
    .upsertMaterialRecord({ materialRef: validationMaterialRef, kind: "recording" });
});
assert.throws(
  () => validationDatabase.transaction((db) =>
    createOwnerMaterialRelationCommands({
      db,
      now: "2026-06-13T00:11:00.000Z",
    }).recordOwnerMaterialRelation({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: validationMaterialRef,
      relationKind: "saved",
    } as unknown as RecordOwnerMaterialRelationInput)),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid",
);
assert.throws(
  () => validationDatabase.transaction((db) =>
    createOwnerMaterialRelationCommands({
      db,
      now: "2026-06-13T00:11:30.000Z",
    }).recordOwnerMaterialRelation({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: validationMaterialRef,
      relationKind: "saved",
      origin: "unknown",
    } as unknown as RecordOwnerMaterialRelationInput)),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid",
);
assert.throws(
  () => validationDatabase.transaction((db) =>
    createOwnerMaterialRelationCommands({
      db,
      now: "2026-06-13T00:12:00.000Z",
    }).recordOwnerMaterialRelation({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: validationMaterialRef,
      relationKind: "saved",
      origin: "user_explicit",
      note: "",
    })),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid",
);
assert.throws(
  () => validationDatabase.transaction((db) =>
    createOwnerMaterialRelationCommands({
      db,
      now: "2026-06-13T00:12:30.000Z",
    }).recordOwnerMaterialRelation({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: {
        namespace: "material",
        kind: "recording",
        id: "m_missing",
      },
      relationKind: "saved",
      origin: "user_explicit",
    })),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.material_not_found",
);
const loserValidationMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_loser_validation",
};
const winnerValidationMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_winner_validation",
};
validationDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T00:13:00.000Z" });
  const relations = createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:13:15.000Z",
  });
  identity.upsertMaterialRecord({ materialRef: loserValidationMaterialRef, kind: "recording" });
  identity.upsertMaterialRecord({ materialRef: winnerValidationMaterialRef, kind: "recording" });
  relations.recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: loserValidationMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
  });
  identity.mergeMaterialRecord({
    loserMaterialRef: loserValidationMaterialRef,
    winnerMaterialRef: winnerValidationMaterialRef,
  });
});
assert.throws(
  () => validationDatabase.transaction((db) =>
    createOwnerMaterialRelationCommands({
      db,
      now: "2026-06-13T00:13:30.000Z",
    }).recordOwnerMaterialRelation({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: loserValidationMaterialRef,
      relationKind: "saved",
      origin: "user_explicit",
    })),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.material_not_writable",
);
assert.throws(
  () => validationDatabase.transaction((db) =>
    createOwnerMaterialRelationCommands({
      db,
      now: "2026-06-13T00:13:45.000Z",
    }).removeOwnerMaterialRelation({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: loserValidationMaterialRef,
      relationKind: "saved",
    })),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.material_not_writable",
);
const mergedTargetRelation = createOwnerMaterialRelationRecords({
  db: validationDatabase.context(),
}).getOwnerMaterialRelation({
  ownerScope: DEFAULT_OWNER_SCOPE,
  materialRef: loserValidationMaterialRef,
  relationKind: "saved",
});
assert.equal(mergedTargetRelation?.status, "active");
assert.equal(mergedTargetRelation?.updatedAt, "2026-06-13T00:13:15.000Z");
assert.throws(
  () => validationDatabase.transaction((db) =>
    createOwnerMaterialRelationCommands({
      db,
      now: "2026-06-13T00:14:00.000Z",
    }).removeOwnerMaterialRelation({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: validationMaterialRef,
      relationKind: "blocked",
    })),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_not_found",
);
validationDatabase.close();

const projectionDatabase = initializedDatabase();
const projectionMaterialOne: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_projection_one",
};
const projectionMaterialTwo: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_projection_two",
};
projectionDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T00:20:00.000Z" });
  const relations = createOwnerMaterialRelationCommands({ db, now: "2026-06-13T00:20:00.000Z" });

  identity.upsertMaterialRecord({ materialRef: projectionMaterialOne, kind: "recording" });
  identity.upsertMaterialRecord({ materialRef: projectionMaterialTwo, kind: "recording" });
  relations.recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: projectionMaterialOne,
    relationKind: "saved",
    origin: "user_explicit",
  });
  createOwnerMaterialRelationCommands({ db, now: "2026-06-13T00:21:00.000Z" })
    .recordOwnerMaterialRelation({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: projectionMaterialOne,
      relationKind: "favorite",
      origin: "user_explicit",
    });
  createOwnerMaterialRelationCommands({ db, now: "2026-06-13T00:22:00.000Z" })
    .recordOwnerMaterialRelation({
      ownerScope: DEFAULT_OWNER_SCOPE,
      materialRef: projectionMaterialTwo,
      relationKind: "saved",
      origin: "user_explicit",
    });
});
assert.equal(
  createOwnerCatalogRecords({ db: projectionDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
  }).length,
  0,
);
const projectionSummary = projectionDatabase.transaction((db) =>
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T00:23:00.000Z",
  }).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }));
assert.deepEqual(projectionSummary, {
  relationFactCount: 3,
  projectedEntryCount: 3,
  obsoleteEntryDeleteCount: 0,
});
const projectionReadPort = createOwnerCatalogRecords({ db: projectionDatabase.context() });
const projectionEntries = projectionReadPort.listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryKind: "owner_relation",
});
assert.equal(projectionEntries.length, 3);
const projectionSavedPoolRef = createOwnerRelationPoolRef({
  ownerScope: DEFAULT_OWNER_SCOPE,
  relationKind: "saved",
});
const projectionFavoritePoolRef = createOwnerRelationPoolRef({
  ownerScope: DEFAULT_OWNER_SCOPE,
  relationKind: "favorite",
});
assert.equal(
  projectionReadPort.listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: projectionSavedPoolRef,
  }).length,
  2,
);
assert.equal(
  projectionReadPort.listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: projectionFavoritePoolRef,
  }).length,
  1,
);
assert.deepEqual(
  requireOwnerRelationEntry(
    projectionEntries,
    projectionSavedPoolRef,
    projectionMaterialOne,
  ).provenanceJson,
  {
    kind: "owner_relation",
    relationKind: "saved",
    ownerRelationPoolRefKey: refKey(projectionSavedPoolRef),
    relationFactCount: 1,
    lastRelationUpdatedAt: "2026-06-13T00:20:00.000Z",
  },
);
assert.deepEqual(
  requireOwnerRelationEntry(
    projectionEntries,
    projectionFavoritePoolRef,
    projectionMaterialOne,
  ).provenanceJson,
  {
    kind: "owner_relation",
    relationKind: "favorite",
    ownerRelationPoolRefKey: refKey(projectionFavoritePoolRef),
    relationFactCount: 1,
    lastRelationUpdatedAt: "2026-06-13T00:21:00.000Z",
  },
);
assert.deepEqual(
  requireOwnerRelationEntry(
    projectionEntries,
    projectionSavedPoolRef,
    projectionMaterialTwo,
  ).provenanceJson,
  {
    kind: "owner_relation",
    relationKind: "saved",
    ownerRelationPoolRefKey: refKey(projectionSavedPoolRef),
    relationFactCount: 1,
    lastRelationUpdatedAt: "2026-06-13T00:22:00.000Z",
  },
);
assert.deepEqual(
  createOwnerCatalogRecords({ db: projectionDatabase.context() }).listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }).map((row) => ({
    materialRefKey: row.materialRefKey,
    positiveEntryCount: row.positiveEntryCount,
  })),
  [
    {
      materialRefKey: refKey(projectionMaterialTwo),
      positiveEntryCount: 1,
    },
    {
      materialRefKey: refKey(projectionMaterialOne),
      positiveEntryCount: 2,
    },
  ],
);
projectionDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:24:00.000Z",
  }).removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: projectionMaterialOne,
    relationKind: "saved",
  }));
const projectionCleanupSummary = projectionDatabase.transaction((db) =>
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T00:25:00.000Z",
  }).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "saved",
    materialRef: projectionMaterialOne,
  }));
assert.deepEqual(projectionCleanupSummary, {
  relationFactCount: 0,
  projectedEntryCount: 0,
  obsoleteEntryDeleteCount: 1,
});
const projectionEntriesAfterCleanup = createOwnerCatalogRecords({
  db: projectionDatabase.context(),
}).listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryKind: "owner_relation",
});
assert.equal(
  projectionEntriesAfterCleanup.some((entry) =>
    entry.entryRefKey === refKey(projectionSavedPoolRef) &&
    entry.materialRefKey === refKey(projectionMaterialOne)
  ),
  false,
);
assert.equal(
  projectionEntriesAfterCleanup.some((entry) =>
    entry.entryRefKey === refKey(projectionFavoritePoolRef) &&
    entry.materialRefKey === refKey(projectionMaterialOne)
  ),
  true,
);
assert.equal(
  projectionEntriesAfterCleanup.some((entry) =>
    entry.entryRefKey === refKey(projectionSavedPoolRef) &&
    entry.materialRefKey === refKey(projectionMaterialTwo)
  ),
  true,
);
assert.throws(
  () => projectionDatabase.transaction((db) =>
    createOwnerCatalogProjectionCommands({
      db,
      now: "2026-06-13T00:26:00.000Z",
    }).rebuildOwnerRelationEntries({
      ownerScope: DEFAULT_OWNER_SCOPE,
      relationKind: "blocked" as unknown as OwnerRelationEntryKind,
    })),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid",
);
projectionDatabase.close();

const blockedDatabase = initializedDatabase();
const blockedMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_blocked",
};
blockedDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T00:30:00.000Z" });
  identity.upsertMaterialRecord({ materialRef: blockedMaterialRef, kind: "recording" });
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:31:00.000Z",
  }).recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: blockedMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
  });
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T00:32:00.000Z",
  }).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
  });
});
const blockedReadPort = createOwnerCatalogRecords({ db: blockedDatabase.context() });
assert.equal(
  blockedReadPort.listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }).length,
  1,
);
blockedDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:33:00.000Z",
  }).recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: blockedMaterialRef,
    relationKind: "blocked",
    origin: "user_explicit",
  }));
assert.equal(
  blockedReadPort.listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }).length,
  0,
);
blockedDatabase.transaction((db) =>
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T00:33:30.000Z",
  }).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }));
assert.equal(
  createOwnerCatalogRecords({ db: blockedDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
  }).length,
  1,
);
blockedDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:34:00.000Z",
  }).removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: blockedMaterialRef,
    relationKind: "blocked",
  }));
assert.equal(
  blockedReadPort.listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }).length,
  1,
);
blockedDatabase.close();

const mixedDatabase = initializedDatabase();
const mixedMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_mixed",
};
const mixedSource = sourceTrack("2001", "Mixed Track");
const mixedLibraryRef = sourceLibraryRef("130950618", "saved_source_track");
mixedDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T00:40:00.000Z" });
  const libraries = createSourceLibraryRepositories({ db });

  identity.upsertSourceRecord({ entity: mixedSource });
  identity.upsertMaterialRecord({ materialRef: mixedMaterialRef, kind: "recording" });
  identity.bindSourceToMaterial({
    sourceRef: mixedSource.sourceRef,
    materialRef: mixedMaterialRef,
    makePrimary: true,
  });

  libraries.libraries.upsert({
    libraryRef: mixedLibraryRef,
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-13T00:41:00.000Z",
    updatedAt: "2026-06-13T00:41:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: mixedLibraryRef,
    sourceRefKey: refKey(mixedSource.sourceRef),
    addedAt: "2026-06-13T00:41:30.000Z",
    providerAddedAt: "2026-06-07T03:00:00.000Z",
    firstImportedAt: "2026-06-13T00:41:30.000Z",
    lastSeenAt: "2026-06-13T00:41:30.000Z",
  });
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T00:42:00.000Z",
  }).rebuildSourceLibraryEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: mixedLibraryRef,
  });
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:50:00.000Z",
  }).recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: mixedMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
  });
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T00:51:00.000Z",
  }).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "saved",
  });
});
const mixedCatalogRow = requireCatalogRow(
  createOwnerCatalogRecords({ db: mixedDatabase.context() }).listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
  }),
  refKey(mixedMaterialRef),
);
assert.equal(mixedCatalogRow.positiveEntryCount, 2);
assert.equal(mixedCatalogRow.recentlyAddedAt, "2026-06-07T03:00:00.000Z");
assert.deepEqual(
  sortProvenance(mixedCatalogRow.provenanceJson),
  sortProvenance([
    {
      kind: "source_library",
      libraryRefKey: refKey(mixedLibraryRef),
      sourceItemCount: 1,
      firstAddedAt: "2026-06-13T00:41:30.000Z",
      lastAddedAt: "2026-06-13T00:41:30.000Z",
      firstProviderAddedAt: "2026-06-07T03:00:00.000Z",
      lastProviderAddedAt: "2026-06-07T03:00:00.000Z",
      lastSeenAt: "2026-06-13T00:41:30.000Z",
    },
    {
      kind: "owner_relation",
      relationKind: "saved",
      ownerRelationPoolRefKey: refKey(savedPoolRef),
      relationFactCount: 1,
      lastRelationUpdatedAt: "2026-06-13T00:50:00.000Z",
    },
  ]),
);
mixedDatabase.transaction((db) =>
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T00:52:00.000Z",
  }).removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: mixedMaterialRef,
    relationKind: "saved",
  }));
mixedDatabase.transaction((db) =>
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T00:53:00.000Z",
  }).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "saved",
  }));
const mixedEntriesAfterCleanup = createOwnerCatalogRecords({
  db: mixedDatabase.context(),
}).listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
});
assert.equal(
  mixedEntriesAfterCleanup.some((entry) => entry.entryKind === "source_library"),
  true,
);
assert.equal(
  mixedEntriesAfterCleanup.some((entry) =>
    entry.entryKind === "owner_relation" &&
    entry.entryRefKey === refKey(savedPoolRef)
  ),
  false,
);
mixedDatabase.close();

const mergedRelationDatabase = initializedDatabase();
const mergedLoserMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_relation_loser",
};
const mergedWinnerMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_relation_winner",
};
mergedRelationDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T01:00:00.000Z" });
  const relations = createOwnerMaterialRelationCommands({ db, now: "2026-06-13T01:01:00.000Z" });

  identity.upsertMaterialRecord({ materialRef: mergedLoserMaterialRef, kind: "recording" });
  identity.upsertMaterialRecord({ materialRef: mergedWinnerMaterialRef, kind: "recording" });
  relations.recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: mergedLoserMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
  });
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T01:02:00.000Z",
  }).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
  });
});
mergedRelationDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T01:03:00.000Z" });
  identity.mergeMaterialRecord({
    loserMaterialRef: mergedLoserMaterialRef,
    winnerMaterialRef: mergedWinnerMaterialRef,
  });
});
const mergedProjectionSummary = mergedRelationDatabase.transaction((db) =>
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T01:04:00.000Z",
  }).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "saved",
  }));
assert.deepEqual(mergedProjectionSummary, {
  relationFactCount: 1,
  projectedEntryCount: 0,
  obsoleteEntryDeleteCount: 1,
});
assert.equal(
  createOwnerMaterialRelationRecords({
    db: mergedRelationDatabase.context(),
  }).getOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: mergedLoserMaterialRef,
    relationKind: "saved",
  })?.status,
  "active",
);
assert.equal(
  createOwnerCatalogRecords({ db: mergedRelationDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
  }).length,
  0,
);
mergedRelationDatabase.close();

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

function insertOwnerMaterialRelationRow(
  db: MusicDatabaseTransactionContext,
  input: {
    ownerScope: string;
    materialRef: Ref;
    relationKind: "saved" | "favorite" | "blocked";
    origin: "user_explicit" | "imported" | "system";
    status: "active" | "removed" | "archived";
    note?: string;
    createdAt: string;
    updatedAt: string;
  },
): void {
  const relationRef = createOwnerMaterialRelationRef({
    ownerScope: input.ownerScope,
    materialRef: input.materialRef,
    relationKind: input.relationKind,
  });

  db.run(
    `
      INSERT INTO owner_material_relations (
        relation_ref_key,
        relation_ref_json,
        owner_scope,
        material_ref_key,
        material_ref_json,
        relation_kind,
        origin,
        status,
        note,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      refKey(relationRef),
      JSON.stringify(relationRef),
      input.ownerScope,
      refKey(input.materialRef),
      JSON.stringify(input.materialRef),
      input.relationKind,
      input.origin,
      input.status,
      input.note ?? null,
      input.createdAt,
      input.updatedAt,
    ],
  );
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

function requireOwnerRelationEntry(
  entries: readonly {
    entryRefKey: string;
    materialRefKey: string;
    provenanceJson: Record<string, unknown>;
  }[],
  poolRef: Ref,
  materialRef: Ref,
): {
  entryRefKey: string;
  materialRefKey: string;
  provenanceJson: Record<string, unknown>;
} {
  const entry = entries.find((candidate) =>
    candidate.entryRefKey === refKey(poolRef) &&
    candidate.materialRefKey === refKey(materialRef)
  );

  if (entry === undefined) {
    throw new Error("Expected owner relation entry was not found.");
  }

  return entry;
}

function requireCatalogRow(
  rows: readonly {
    materialRefKey: string;
    positiveEntryCount: number;
    recentlyAddedAt: string;
    provenanceJson: readonly Record<string, unknown>[];
  }[],
  materialRefKey: string,
): {
  materialRefKey: string;
  positiveEntryCount: number;
  recentlyAddedAt: string;
  provenanceJson: readonly Record<string, unknown>[];
} {
  const row = rows.find((candidate) => candidate.materialRefKey === materialRefKey);

  if (row === undefined) {
    throw new Error("Expected owner catalog row was not found.");
  }

  return row;
}

function sortProvenance(
  provenance: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  return [...provenance].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
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
