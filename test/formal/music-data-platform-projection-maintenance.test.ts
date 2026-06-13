import assert from "node:assert/strict";

import {
  refKey,
  type Ref,
} from "../../src/contracts/index.js";
import * as musicDataPlatform from "../../src/music_data_platform/index.js";
import {
  DEFAULT_OWNER_SCOPE,
  createIdentityWriteCommands,
  createMaterialTextProjectionRecords,
  createOwnerCatalogRecords,
  createOwnerMaterialRelationCommands,
  createOwnerRelationPoolRef,
  createProjectionMaintenanceCommands,
  createProjectionMaintenanceRecords,
  createProjectionMaintenanceRunner,
  createSourceLibraryRef,
  isMusicDataPlatformError,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformSourceLibrarySchema,
  type CreateProjectionMaintenanceCommandsInput,
  type CreateProjectionMaintenanceRecordsInput,
  type CreateProjectionMaintenanceRunnerInput,
  type GetProjectionTargetInput,
  type ListPendingProjectionTargetsInput,
  type ProjectionMaintenanceCleanInput,
  type ProjectionMaintenanceCleanResult,
  type ProjectionMaintenanceCommands,
  type ProjectionMaintenanceFailedInput,
  type ProjectionMaintenanceFailedResult,
  type ProjectionMaintenanceKind,
  type ProjectionMaintenanceRecords,
  type ProjectionMaintenanceRunSummary,
  type ProjectionMaintenanceRunner,
  type ProjectionMaintenanceTargetDirtyResult,
  type ProjectionMaintenanceTargetInput,
  type ProjectionMaintenanceTargetRecord,
  type ProjectionMaintenanceTargetStatus,
} from "../../src/music_data_platform/index.js";
import {
  assertProjectionMaintenanceKind,
  parseProjectionMaintenanceTargetPayload,
} from "../../src/music_data_platform/projection_maintenance_commands.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import {
  SqliteMusicDatabase,
  type MusicDatabase,
  type MusicDatabaseParameter,
  type MusicDatabaseTransactionContext,
} from "../../src/storage/index.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;
type ProjectionMaintenanceTargetByKind<Kind extends ProjectionMaintenanceKind> = Extract<
  ProjectionMaintenanceTargetInput,
  { projectionKind: Kind }
>;

export type _createProjectionMaintenanceCommandsInputShape = Expect<
  Equal<keyof CreateProjectionMaintenanceCommandsInput, "db" | "now">
>;

export type _projectionMaintenanceKindShape = Expect<
  Equal<
    ProjectionMaintenanceKind,
    | "owner_catalog_source_library"
    | "owner_catalog_source_library_material"
    | "owner_catalog_relation_material"
    | "material_text"
  >
>;

export type _projectionMaintenanceTargetStatusShape = Expect<
  Equal<ProjectionMaintenanceTargetStatus, "dirty" | "failed">
>;

export type _projectionMaintenanceSourceLibraryTargetInputShape = Expect<
  Equal<
    keyof ProjectionMaintenanceTargetByKind<"owner_catalog_source_library">,
    "projectionKind" | "ownerScope" | "libraryRef"
  >
>;

export type _projectionMaintenanceSourceLibraryMaterialTargetInputShape = Expect<
  Equal<
    keyof ProjectionMaintenanceTargetByKind<"owner_catalog_source_library_material">,
    "projectionKind" | "ownerScope" | "materialRef"
  >
>;

export type _projectionMaintenanceRelationMaterialTargetInputShape = Expect<
  Equal<
    keyof ProjectionMaintenanceTargetByKind<"owner_catalog_relation_material">,
    "projectionKind" | "ownerScope" | "materialRef"
  >
>;

export type _projectionMaintenanceMaterialTextTargetInputShape = Expect<
  Equal<
    keyof ProjectionMaintenanceTargetByKind<"material_text">,
    "projectionKind" | "materialRef"
  >
>;

export type _projectionMaintenanceTargetDirtyResultShape = Expect<
  Equal<keyof ProjectionMaintenanceTargetDirtyResult, "targetKey" | "dirtyGeneration">
>;

export type _projectionMaintenanceCleanInputShape = Expect<
  Equal<
    keyof ProjectionMaintenanceCleanInput,
    | "projectionKind"
    | "targetKey"
    | "expectedDirtyGeneration"
  >
>;

export type _projectionMaintenanceCleanResultShape = Expect<
  Equal<keyof ProjectionMaintenanceCleanResult, "cleaned">
>;

export type _projectionMaintenanceFailedInputShape = Expect<
  Equal<
    keyof ProjectionMaintenanceFailedInput,
    | "projectionKind"
    | "targetKey"
    | "expectedDirtyGeneration"
    | "failureCode"
    | "failureMessage"
  >
>;

export type _projectionMaintenanceFailedResultShape = Expect<
  Equal<keyof ProjectionMaintenanceFailedResult, "failed">
>;

export type _projectionMaintenanceCommandsShape = Expect<
  Equal<
    keyof ProjectionMaintenanceCommands,
    | "markProjectionTargetDirty"
    | "markProjectionClean"
    | "markProjectionFailed"
  >
>;

export type _createProjectionMaintenanceRecordsInputShape = Expect<
  Equal<keyof CreateProjectionMaintenanceRecordsInput, "db">
>;

export type _getProjectionTargetInputShape = Expect<
  Equal<keyof GetProjectionTargetInput, "projectionKind" | "targetKey">
>;

export type _listPendingProjectionTargetsInputShape = Expect<
  Equal<keyof ListPendingProjectionTargetsInput, "limit">
>;

export type _projectionMaintenanceTargetRecordShape = Expect<
  Equal<
    keyof ProjectionMaintenanceTargetRecord,
    | "projectionKind"
    | "targetKey"
    | "targetPayloadJson"
    | "status"
    | "dirtyGeneration"
    | "failureCode"
    | "failureMessage"
    | "createdAt"
    | "updatedAt"
  >
>;

export type _projectionMaintenanceRecordsShape = Expect<
  Equal<keyof ProjectionMaintenanceRecords, "getProjectionTarget" | "listPendingProjectionTargets">
>;

export type _createProjectionMaintenanceRunnerInputShape = Expect<
  Equal<keyof CreateProjectionMaintenanceRunnerInput, "database" | "now">
>;

export type _projectionMaintenanceRunSummaryShape = Expect<
  Equal<
    keyof ProjectionMaintenanceRunSummary,
    | "selectedCount"
    | "rebuiltCount"
    | "failedCount"
    | "skippedStaleGenerationCount"
  >
>;

export type _projectionMaintenanceRunnerShape = Expect<
  Equal<keyof ProjectionMaintenanceRunner, "runProjectionMaintenance">
>;

assert.equal("assertProjectionMaintenanceKind" in musicDataPlatform, false);
assert.equal("parseProjectionMaintenanceTargetPayload" in musicDataPlatform, false);

assert.throws(
  () => assertProjectionMaintenanceKind("bad-kind"),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.projection_maintenance_kind_invalid",
);
assert.throws(
  () => parseProjectionMaintenanceTargetPayload({
    projectionKind: "material_text",
    targetPayloadJson: "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\"}}",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.projection_maintenance_target_invalid",
);
assert.throws(
  () => parseProjectionMaintenanceTargetPayload({
    projectionKind: "material_text",
    targetPayloadJson: "{\"materialRef\":{\"namespace\":\"source_netease\",\"kind\":\"track\",\"id\":\"bad\"}}",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.material_ref_invalid",
);

const schemaDatabase = initializedDatabase();
assert.equal(
  schemaDatabase.context().get<{ type: string }>(
    "SELECT type FROM sqlite_schema WHERE name = 'projection_maintenance_targets'",
  )?.type,
  "table",
);
assert.equal(
  schemaDatabase.context().get<{ name: string }>(
    "SELECT name FROM sqlite_schema WHERE type = 'index' AND name = 'projection_maintenance_targets_pending_order_idx'",
  )?.name,
  "projection_maintenance_targets_pending_order_idx",
);
const schemaColumns = schemaDatabase.context().all<{ name: string; pk: number }>(
  "PRAGMA table_info(projection_maintenance_targets)",
);
assert.deepEqual(
  schemaColumns.map((column) => column.name),
  [
    "projection_kind",
    "target_key",
    "target_payload_json",
    "status",
    "dirty_generation",
    "failure_code",
    "failure_message",
    "created_at",
    "updated_at",
  ],
);
assert.equal(schemaColumns[0]?.pk, 1);
assert.equal(schemaColumns[1]?.pk, 2);
schemaDatabase.transaction((db) => {
  assert.throws(
    () =>
      db.run(
        `
          INSERT INTO projection_maintenance_targets (
            projection_kind,
            target_key,
            target_payload_json,
            status,
            dirty_generation,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          "material_text",
          "bad_key",
          "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_schema\"}}",
          "dirty",
          1,
          "2026-06-13T12:00:00.000Z",
          "2026-06-13T12:00:00.000Z",
        ],
      ),
  );
  assert.throws(
    () =>
      db.run(
        `
          INSERT INTO projection_maintenance_targets (
            projection_kind,
            target_key,
            target_payload_json,
            status,
            dirty_generation,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          "material_text",
          "pmt_schema",
          "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_schema\"}}",
          "dirty",
          0,
          "2026-06-13T12:00:00.000Z",
          "2026-06-13T12:00:00.000Z",
        ],
      ),
  );
});
schemaDatabase.close();

const commandDatabase = initializedDatabase();
const libraryTargetRef = sourceLibraryRef("130950618", "saved_source_track");
const materialTextTargetWithLabel: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_dirty",
  label: "Ignored Label",
};
const materialTextTarget: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_dirty",
};
assert.throws(
  () =>
    commandDatabase.transaction((db) =>
      createProjectionMaintenanceCommands({
        db,
        now: "2026-06-13T12:09:00.000Z",
      }).markProjectionTargetDirty({
        projectionKind: "material_text",
        materialRef: {
          namespace: "source_netease",
          kind: "track",
          id: "bad_projection_target",
        },
      })),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.material_ref_invalid",
);

const initialDirty = commandDatabase.transaction((db) =>
  createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:10:00.000Z",
  }).markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: materialTextTargetWithLabel,
  }));
assert.equal(initialDirty.targetKey.startsWith("pmt_"), true);
assert.equal(initialDirty.dirtyGeneration, 1);

const repeatedDirty = commandDatabase.transaction((db) =>
  createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:11:00.000Z",
  }).markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: materialTextTarget,
  }));
assert.equal(repeatedDirty.targetKey, initialDirty.targetKey);
assert.equal(repeatedDirty.dirtyGeneration, 2);

const libraryDirty = commandDatabase.transaction((db) =>
  createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:12:00.000Z",
  }).markProjectionTargetDirty({
    projectionKind: "owner_catalog_source_library",
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: {
      ...libraryTargetRef,
      label: "Ignored Library Label",
    },
  }));
assert.equal(libraryDirty.dirtyGeneration, 1);

const commandRecords = createProjectionMaintenanceRecords({
  db: commandDatabase.context(),
});
assert.deepEqual(
  commandRecords.listPendingProjectionTargets().map((target) => target.targetKey),
  [initialDirty.targetKey, libraryDirty.targetKey],
);
assert.equal(commandRecords.listPendingProjectionTargets({ limit: 1 }).length, 1);

const materialTextRow = commandRecords.getProjectionTarget({
  projectionKind: "material_text",
  targetKey: initialDirty.targetKey,
});
assert.equal(
  materialTextRow?.targetPayloadJson,
  "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_dirty\"}}",
);
assert.equal(materialTextRow?.status, "dirty");
assert.equal(materialTextRow?.dirtyGeneration, 2);

const failedDirty = commandDatabase.transaction((db) =>
  createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:13:00.000Z",
  }).markProjectionFailed({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
    expectedDirtyGeneration: 2,
    failureCode: "fixture.failed",
    failureMessage: "fixture failure",
  }));
assert.deepEqual(failedDirty, { failed: true });
assert.deepEqual(
  commandRecords.getProjectionTarget({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
  }),
  {
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
    targetPayloadJson:
      "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_dirty\"}}",
    status: "failed",
    dirtyGeneration: 2,
    failureCode: "fixture.failed",
    failureMessage: "fixture failure",
    createdAt: "2026-06-13T12:10:00.000Z",
    updatedAt: "2026-06-13T12:13:00.000Z",
  },
);

const clearedDirty = commandDatabase.transaction((db) =>
  createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:14:00.000Z",
  }).markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: materialTextTarget,
  }));
assert.equal(clearedDirty.dirtyGeneration, 3);
assert.deepEqual(
  commandRecords.getProjectionTarget({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
  }),
  {
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
    targetPayloadJson:
      "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_dirty\"}}",
    status: "dirty",
    dirtyGeneration: 3,
    createdAt: "2026-06-13T12:10:00.000Z",
    updatedAt: "2026-06-13T12:14:00.000Z",
  },
);
assert.deepEqual(
  commandDatabase.transaction((db) =>
    createProjectionMaintenanceCommands({
      db,
      now: "2026-06-13T12:15:00.000Z",
    }).markProjectionClean({
      projectionKind: "material_text",
      targetKey: initialDirty.targetKey,
      expectedDirtyGeneration: 2,
    })),
  { cleaned: false },
);
assert.equal(
  commandRecords.getProjectionTarget({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
  })?.dirtyGeneration,
  3,
);
assert.deepEqual(
  commandDatabase.transaction((db) =>
    createProjectionMaintenanceCommands({
      db,
      now: "2026-06-13T12:16:00.000Z",
    }).markProjectionClean({
      projectionKind: "material_text",
      targetKey: initialDirty.targetKey,
      expectedDirtyGeneration: 3,
    })),
  { cleaned: true },
);
assert.equal(
  commandRecords.getProjectionTarget({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
  }),
  undefined,
);
commandDatabase.close();

const runnerSuccessDatabase = initializedDatabase();
const runnerMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_runner_success",
};
const runnerLibraryRef = sourceLibraryRef("130950618", "saved_source_track");
const runnerSource = sourceTrack("3001", "Runner Success");
runnerSuccessDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T12:20:00.000Z" });
  const libraries = createSourceLibraryRepositories({ db });

  identity.upsertSourceRecord({ entity: runnerSource });
  identity.upsertMaterialRecord({ materialRef: runnerMaterialRef, kind: "recording" });
  identity.bindSourceToMaterial({
    sourceRef: runnerSource.sourceRef,
    materialRef: runnerMaterialRef,
    makePrimary: true,
  });
  libraries.libraries.upsert({
    libraryRef: runnerLibraryRef,
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-13T12:20:00.000Z",
    updatedAt: "2026-06-13T12:20:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: runnerLibraryRef,
    sourceRefKey: refKey(runnerSource.sourceRef),
    addedAt: "2026-06-13T12:20:30.000Z",
    providerAddedAt: "2026-06-13T12:19:30.000Z",
    firstImportedAt: "2026-06-13T12:20:30.000Z",
    lastSeenAt: "2026-06-13T12:20:30.000Z",
  });
  const maintenance = createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:21:00.000Z",
  });
  maintenance.markProjectionTargetDirty({
    projectionKind: "owner_catalog_source_library_material",
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: runnerMaterialRef,
  });
  maintenance.markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: runnerMaterialRef,
  });
});
const runnerSuccessSummary = createProjectionMaintenanceRunner({
  database: runnerSuccessDatabase,
  now: "2026-06-13T12:22:00.000Z",
}).runProjectionMaintenance();
assert.deepEqual(runnerSuccessSummary, {
  selectedCount: 2,
  rebuiltCount: 2,
  failedCount: 0,
  skippedStaleGenerationCount: 0,
});
assert.deepEqual(
  createProjectionMaintenanceRecords({ db: runnerSuccessDatabase.context() }).listPendingProjectionTargets(),
  [],
);
assert.equal(
  createMaterialTextProjectionRecords({ db: runnerSuccessDatabase.context() }).getMaterialTextDocument({
    materialRef: runnerMaterialRef,
  })?.materialRefKey,
  refKey(runnerMaterialRef),
);
assert.equal(
  createOwnerCatalogRecords({ db: runnerSuccessDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: runnerLibraryRef,
  }).length,
  1,
);
runnerSuccessDatabase.close();

const runnerLibraryScopeDatabase = initializedDatabase();
const runnerLibraryScopeMaterialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "m_runner_library_scope",
};
const runnerLibraryScopeLibraryRef = sourceLibraryRef("130950619", "saved_source_track");
const runnerLibraryScopeSource = sourceTrack("3002", "Runner Library Scope");
runnerLibraryScopeDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T12:24:00.000Z" });
  const libraries = createSourceLibraryRepositories({ db });

  identity.upsertSourceRecord({ entity: runnerLibraryScopeSource });
  identity.upsertMaterialRecord({
    materialRef: runnerLibraryScopeMaterialRef,
    kind: "recording",
  });
  identity.bindSourceToMaterial({
    sourceRef: runnerLibraryScopeSource.sourceRef,
    materialRef: runnerLibraryScopeMaterialRef,
    makePrimary: true,
  });
  libraries.libraries.upsert({
    libraryRef: runnerLibraryScopeLibraryRef,
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950619",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-13T12:24:00.000Z",
    updatedAt: "2026-06-13T12:24:00.000Z",
  });
  libraries.items.upsert({
    libraryRef: runnerLibraryScopeLibraryRef,
    sourceRefKey: refKey(runnerLibraryScopeSource.sourceRef),
    addedAt: "2026-06-13T12:24:30.000Z",
    providerAddedAt: "2026-06-13T12:23:30.000Z",
    firstImportedAt: "2026-06-13T12:24:30.000Z",
    lastSeenAt: "2026-06-13T12:24:30.000Z",
  });
  createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:25:00.000Z",
  }).markProjectionTargetDirty({
    projectionKind: "owner_catalog_source_library",
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: runnerLibraryScopeLibraryRef,
  });
});
assert.deepEqual(
  createProjectionMaintenanceRunner({
    database: runnerLibraryScopeDatabase,
    now: "2026-06-13T12:26:00.000Z",
  }).runProjectionMaintenance(),
  {
    selectedCount: 1,
    rebuiltCount: 1,
    failedCount: 0,
    skippedStaleGenerationCount: 0,
  },
);
assert.deepEqual(
  createProjectionMaintenanceRecords({ db: runnerLibraryScopeDatabase.context() }).listPendingProjectionTargets(),
  [],
);
assert.deepEqual(
  createOwnerCatalogRecords({ db: runnerLibraryScopeDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: runnerLibraryScopeLibraryRef,
  }).map((entry) => ({
    entryKind: entry.entryKind,
    materialRefKey: entry.materialRefKey,
  })),
  [
    {
      entryKind: "source_library",
      materialRefKey: refKey(runnerLibraryScopeMaterialRef),
    },
  ],
);
runnerLibraryScopeDatabase.close();

const runnerRelationDatabase = initializedDatabase();
const runnerRelationMaterialRef = materialRef("recording", "m_runner_relation");
const runnerRelationPoolRef = createOwnerRelationPoolRef({
  ownerScope: DEFAULT_OWNER_SCOPE,
  relationKind: "saved",
});
runnerRelationDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T12:27:00.000Z" });
  const relations = createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-13T12:27:30.000Z",
  });

  identity.upsertMaterialRecord({ materialRef: runnerRelationMaterialRef, kind: "recording" });
  relations.recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: runnerRelationMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
  });
  createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:28:00.000Z",
  }).markProjectionTargetDirty({
    projectionKind: "owner_catalog_relation_material",
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: runnerRelationMaterialRef,
  });
});
assert.deepEqual(
  createProjectionMaintenanceRunner({
    database: runnerRelationDatabase,
    now: "2026-06-13T12:29:00.000Z",
  }).runProjectionMaintenance(),
  {
    selectedCount: 1,
    rebuiltCount: 1,
    failedCount: 0,
    skippedStaleGenerationCount: 0,
  },
);
assert.deepEqual(
  createProjectionMaintenanceRecords({ db: runnerRelationDatabase.context() }).listPendingProjectionTargets(),
  [],
);
assert.deepEqual(
  createOwnerCatalogRecords({ db: runnerRelationDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
    entryRef: runnerRelationPoolRef,
  }).map((entry) => ({
    entryKind: entry.entryKind,
    materialRefKey: entry.materialRefKey,
  })),
  [
    {
      entryKind: "owner_relation",
      materialRefKey: refKey(runnerRelationMaterialRef),
    },
  ],
);
runnerRelationDatabase.close();

const runnerLimitDatabase = initializedDatabase();
runnerLimitDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T12:30:00.000Z" });
  identity.upsertMaterialRecord({ materialRef: materialRef("recording", "m_limit_1"), kind: "recording" });
  identity.upsertMaterialRecord({ materialRef: materialRef("recording", "m_limit_2"), kind: "recording" });
  const maintenance = createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:31:00.000Z",
  });
  maintenance.markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: materialRef("recording", "m_limit_1"),
  });
  maintenance.markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: materialRef("recording", "m_limit_2"),
  });
});
const runnerLimitSummary = createProjectionMaintenanceRunner({
  database: runnerLimitDatabase,
  now: "2026-06-13T12:32:00.000Z",
}).runProjectionMaintenance({ limit: 1 });
assert.deepEqual(runnerLimitSummary, {
  selectedCount: 1,
  rebuiltCount: 1,
  failedCount: 0,
  skippedStaleGenerationCount: 0,
});
assert.equal(
  createProjectionMaintenanceRecords({ db: runnerLimitDatabase.context() }).listPendingProjectionTargets().length,
  1,
);
runnerLimitDatabase.close();

const runnerMalformedDatabase = initializedDatabase();
runnerMalformedDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T12:40:00.000Z" });
  identity.upsertMaterialRecord({ materialRef: materialRef("recording", "m_malformed"), kind: "recording" });
  createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:41:00.000Z",
  }).markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: materialRef("recording", "m_malformed"),
  });
  db.run(
    `
      INSERT INTO projection_maintenance_targets (
        projection_kind,
        target_key,
        target_payload_json,
        status,
        dirty_generation,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 'dirty', 1, ?, ?)
    `,
    [
      "owner_catalog_source_library_material",
      "pmt_malformed_target",
      "{\"ownerScope\":1}",
      "2026-06-13T12:41:30.000Z",
      "2026-06-13T12:41:30.000Z",
    ],
  );
});
const runnerMalformed = createProjectionMaintenanceRunner({
  database: runnerMalformedDatabase,
  now: "2026-06-13T12:42:00.000Z",
});
assert.deepEqual(runnerMalformed.runProjectionMaintenance(), {
  selectedCount: 2,
  rebuiltCount: 1,
  failedCount: 1,
  skippedStaleGenerationCount: 0,
});
assert.equal(
  createMaterialTextProjectionRecords({ db: runnerMalformedDatabase.context() }).getMaterialTextDocument({
    materialRef: materialRef("recording", "m_malformed"),
  })?.materialRefKey,
  refKey(materialRef("recording", "m_malformed")),
);
assert.deepEqual(
  createProjectionMaintenanceRecords({ db: runnerMalformedDatabase.context() }).getProjectionTarget({
    projectionKind: "owner_catalog_source_library_material",
    targetKey: "pmt_malformed_target",
  }),
  {
    projectionKind: "owner_catalog_source_library_material",
    targetKey: "pmt_malformed_target",
    targetPayloadJson: "{\"ownerScope\":1}",
    status: "failed",
    dirtyGeneration: 1,
    failureCode: "music_data.projection_maintenance_target_invalid",
    failureMessage: "Projection maintenance target payload must contain exactly: ownerScope, materialRef.",
    createdAt: "2026-06-13T12:41:30.000Z",
    updatedAt: "2026-06-13T12:42:00.000Z",
  },
);
assert.deepEqual(runnerMalformed.runProjectionMaintenance(), {
  selectedCount: 1,
  rebuiltCount: 0,
  failedCount: 1,
  skippedStaleGenerationCount: 0,
});
runnerMalformedDatabase.close();

const runnerInvalidMaterialRefDatabase = initializedDatabase();
runnerInvalidMaterialRefDatabase.transaction((db) => {
  db.run(
    `
      INSERT INTO projection_maintenance_targets (
        projection_kind,
        target_key,
        target_payload_json,
        status,
        dirty_generation,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 'dirty', 1, ?, ?)
    `,
    [
      "material_text",
      "pmt_invalid_material_ref_target",
      "{\"materialRef\":{\"namespace\":\"source_netease\",\"kind\":\"track\",\"id\":\"bad\"}}",
      "2026-06-13T12:49:00.000Z",
      "2026-06-13T12:49:00.000Z",
    ],
  );
});
assert.deepEqual(
  createProjectionMaintenanceRunner({
    database: runnerInvalidMaterialRefDatabase,
    now: "2026-06-13T12:49:30.000Z",
  }).runProjectionMaintenance(),
  {
    selectedCount: 1,
    rebuiltCount: 0,
    failedCount: 1,
    skippedStaleGenerationCount: 0,
  },
);
assert.deepEqual(
  createProjectionMaintenanceRecords({ db: runnerInvalidMaterialRefDatabase.context() }).getProjectionTarget({
    projectionKind: "material_text",
    targetKey: "pmt_invalid_material_ref_target",
  }),
  {
    projectionKind: "material_text",
    targetKey: "pmt_invalid_material_ref_target",
    targetPayloadJson:
      "{\"materialRef\":{\"namespace\":\"source_netease\",\"kind\":\"track\",\"id\":\"bad\"}}",
    status: "failed",
    dirtyGeneration: 1,
    failureCode: "music_data.material_ref_invalid",
    failureMessage: "Material ref namespace/kind must match MineMusic material identity.",
    createdAt: "2026-06-13T12:49:00.000Z",
    updatedAt: "2026-06-13T12:49:30.000Z",
  },
);
runnerInvalidMaterialRefDatabase.close();

const rollbackDatabase = initializedDatabase();
rollbackDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T12:50:00.000Z" });
  identity.upsertMaterialRecord({ materialRef: materialRef("recording", "m_rollback"), kind: "recording" });
  createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:51:00.000Z",
  }).markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: materialRef("recording", "m_rollback"),
  });
});
const rollbackRunner = createProjectionMaintenanceRunner({
  database: wrapDatabaseWithRunInterceptor(rollbackDatabase, ({ sql }) => {
    if (sql.includes("INSERT INTO material_text_documents")) {
      throw new Error("injected rebuild failure");
    }
  }),
  now: "2026-06-13T12:52:00.000Z",
});
assert.deepEqual(rollbackRunner.runProjectionMaintenance(), {
  selectedCount: 1,
  rebuiltCount: 0,
  failedCount: 1,
  skippedStaleGenerationCount: 0,
});
assert.equal(
  createMaterialTextProjectionRecords({ db: rollbackDatabase.context() }).getMaterialTextDocument({
    materialRef: materialRef("recording", "m_rollback"),
  }),
  undefined,
);
assert.deepEqual(
  createProjectionMaintenanceRecords({ db: rollbackDatabase.context() }).listPendingProjectionTargets(),
  [
    {
      projectionKind: "material_text",
      targetKey: createProjectionMaintenanceRecords({ db: rollbackDatabase.context() })
        .listPendingProjectionTargets()[0]!.targetKey,
      targetPayloadJson:
        "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_rollback\"}}",
      status: "failed",
      dirtyGeneration: 1,
      failureCode: "music_data.projection_maintenance_target_invalid",
      failureMessage: "material_text rebuild failed: injected rebuild failure",
      createdAt: "2026-06-13T12:51:00.000Z",
      updatedAt: "2026-06-13T12:52:00.000Z",
    },
  ],
);
rollbackDatabase.close();

const staleDatabase = initializedDatabase();
const staleMaterialRef = materialRef("recording", "m_stale");
staleDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T13:00:00.000Z" });
  identity.upsertMaterialRecord({ materialRef: staleMaterialRef, kind: "recording" });
  createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T13:01:00.000Z",
  }).markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: staleMaterialRef,
  });
});
const staleRunner = createProjectionMaintenanceRunner({
  database: wrapDatabaseWithRunInterceptor(staleDatabase, ({ sql, context }) => {
    if (sql.includes("INSERT INTO material_text_documents")) {
      createProjectionMaintenanceCommands({
        db: context,
        now: "2026-06-13T13:02:00.000Z",
      }).markProjectionTargetDirty({
        projectionKind: "material_text",
        materialRef: staleMaterialRef,
      });
    }
  }),
  now: "2026-06-13T13:03:00.000Z",
});
assert.deepEqual(staleRunner.runProjectionMaintenance(), {
  selectedCount: 1,
  rebuiltCount: 0,
  failedCount: 0,
  skippedStaleGenerationCount: 1,
});
assert.equal(
  createMaterialTextProjectionRecords({ db: staleDatabase.context() }).getMaterialTextDocument({
    materialRef: staleMaterialRef,
  })?.materialRefKey,
  refKey(staleMaterialRef),
);
const staleRow = createProjectionMaintenanceRecords({ db: staleDatabase.context() }).listPendingProjectionTargets()[0];
assert.equal(staleRow?.status, "dirty");
assert.equal(staleRow?.dirtyGeneration, 2);
assert.deepEqual(
  createProjectionMaintenanceRunner({
    database: staleDatabase,
    now: "2026-06-13T13:04:00.000Z",
  }).runProjectionMaintenance(),
  {
    selectedCount: 1,
    rebuiltCount: 1,
    failedCount: 0,
    skippedStaleGenerationCount: 0,
  },
);
assert.deepEqual(
  createProjectionMaintenanceRecords({ db: staleDatabase.context() }).listPendingProjectionTargets(),
  [],
);
staleDatabase.close();

function initializedDatabase(): ReturnType<typeof SqliteMusicDatabase.open> {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformSourceLibrarySchema,
      musicDataPlatformOwnerCatalogEntriesSchema,
      musicDataPlatformOwnerRelationSchema,
      musicDataPlatformOwnerCatalogViewSchema,
      musicDataPlatformMaterialTextProjectionSchema,
      musicDataPlatformProjectionMaintenanceSchema,
    ],
  });

  return database;
}

function materialRef(kind: "recording" | "album" | "artist" | "work" | "release", id: string): Ref {
  return {
    namespace: "material",
    kind,
    id,
  };
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
    sourceRef: {
      namespace: "source_netease",
      kind: "track",
      id,
    },
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
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

function wrapDatabaseWithRunInterceptor(
  database: MusicDatabase,
  interceptor: (input: {
    sql: string;
    params: readonly MusicDatabaseParameter[] | undefined;
    context: MusicDatabaseTransactionContext;
  }) => void,
): MusicDatabase {
  return {
    initialize(input) {
      database.initialize(input);
    },
    context() {
      return database.context();
    },
    transaction(operation) {
      return database.transaction((db) => {
        let interceptorActive = false;
        const proxiedContext = {
          run(sql: string, params?: readonly MusicDatabaseParameter[]) {
            db.run(sql, params);

            if (interceptorActive) {
              return;
            }

            interceptorActive = true;
            try {
              interceptor({
                sql,
                params,
                context: proxiedContext as MusicDatabaseTransactionContext,
              });
            } finally {
              interceptorActive = false;
            }
          },
          all<Row>(sql: string, params?: readonly MusicDatabaseParameter[]) {
            return db.all<Row>(sql, params);
          },
          get<Row>(sql: string, params?: readonly MusicDatabaseParameter[]) {
            return db.get<Row>(sql, params);
          },
        };

        return operation(proxiedContext as MusicDatabaseTransactionContext);
      });
    },
    close() {
      database.close();
    },
  };
}
