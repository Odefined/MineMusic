import assert from "node:assert/strict";

import {
  refKey,
  type PlatformLibraryCandidate,
  type PlatformLibraryReadInput,
  type PlatformLibraryReadResult,
  type Ref,
  type Result,
  type SourceEntity,
} from "../../src/contracts/index.js";
import {
  DEFAULT_OWNER_SCOPE,
  createIdentityWriteCommands,
  createMaterialRefFactory,
  createSourceLibraryRef,
  createSourceLibraryImportService,
  isMusicDataPlatformError,
  musicDataPlatformIdentitySchema,
  musicDataPlatformSourceLibrarySchema,
  type PlatformLibraryReadPort,
  type SourceLibraryImportBatchRecord,
  type SourceLibraryImportItemOutcomeRecord,
  type SourceLibraryRecord,
  type SourceLibraryItemRecord,
  type SourceLibraryCommands,
  type SourceLibraryReadPort,
} from "../../src/music_data_platform/index.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import { SqliteMusicDatabase } from "../../src/storage/index.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

type ForbiddenKeys<T, Keys extends PropertyKey> = Extract<keyof T, Keys>;
type ProviderReadRequest = {
  providerId: string;
  request: PlatformLibraryReadInput;
};

export type _sourceLibraryRecordShape = Expect<
  Equal<
    keyof SourceLibraryRecord,
    | "libraryRef"
    | "ownerScope"
    | "providerId"
    | "providerAccountId"
    | "libraryKind"
    | "createdAt"
    | "updatedAt"
  >
>;

export type _sourceLibraryItemRecordShape = Expect<
  Equal<
    keyof SourceLibraryItemRecord,
    | "libraryRef"
    | "sourceRefKey"
    | "addedAt"
    | "providerAddedAt"
    | "firstImportedAt"
    | "lastSeenAt"
  > &
    Equal<
      ForbiddenKeys<
        SourceLibraryItemRecord,
        | "materialRef"
        | "materialRefKey"
        | "canonicalRef"
        | "canonicalRefKey"
        | "query"
        | "rank"
        | "score"
        | "projection"
        | "cardSeed"
        | "status"
      >,
      never
    >
>;

export type _sourceLibraryBatchRecordShape = Expect<
  Equal<
    keyof SourceLibraryImportBatchRecord,
    | "batchId"
    | "ownerScope"
    | "providerId"
    | "providerAccountId"
    | "libraryKind"
    | "libraryRef"
    | "status"
    | "cursor"
    | "maxNewItems"
    | "processedCount"
    | "importedCount"
    | "alreadyPresentCount"
    | "failedCount"
    | "completionReason"
    | "failureCode"
    | "failureMessage"
    | "createdAt"
    | "updatedAt"
  >
>;

export type _sourceLibraryItemOutcomeRecordShape = Expect<
  Equal<
    keyof SourceLibraryImportItemOutcomeRecord,
    | "batchId"
    | "sequence"
    | "outcome"
    | "sourceRefKey"
    | "providerId"
    | "providerEntityId"
    | "materialRefKey"
    | "errorCode"
    | "errorMessage"
    | "createdAt"
  >
>;

export type _sourceLibraryCommandKeys = Expect<
  Equal<
    keyof SourceLibraryCommands,
    | "createImportBatch"
    | "resolveImportBatchLibraryScope"
    | "recordImportItem"
    | "recordImportItemFailure"
    | "failImportBatch"
    | "completeImportBatch"
    | "advanceImportBatchCursor"
  >
>;

export type _sourceLibraryReadPortKeys = Expect<
  Equal<
    keyof SourceLibraryReadPort,
    "getImportBatch"
  >
>;

const repositoryDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
repositoryDatabase.initialize({
  schemas: [
    musicDataPlatformIdentitySchema,
    musicDataPlatformSourceLibrarySchema,
  ],
});

repositoryDatabase.transaction((db) => {
  const commands = createIdentityWriteCommands({ db, now: "2026-06-08T00:00:00.000Z" });
  const source = sourceTrack("1001", "Repository Track");
  const materialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_repo",
  };

  commands.upsertSourceRecord({
    entity: source,
  });
  commands.upsertMaterialRecord({
    materialRef,
    kind: "recording",
  });
  commands.bindSourceToMaterial({
    sourceRef: source.sourceRef,
    materialRef,
    makePrimary: true,
  });
});

repositoryDatabase.transaction((db) => {
  const repositories = createSourceLibraryRepositories({ db });
  const libraryRef = sourceLibraryRef("130950618", "saved_source_track");
  const library = repositories.libraries.upsert({
    libraryRef,
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  });
  const item = repositories.items.upsert({
    libraryRef,
    sourceRefKey: refKey(sourceRef("track", "1001")),
    addedAt: "2026-06-08T00:00:00.000Z",
    providerAddedAt: "2026-06-07T00:00:00.000Z",
    firstImportedAt: "2026-06-08T00:00:00.000Z",
    lastSeenAt: "2026-06-08T00:00:00.000Z",
  });

  assert.equal(refKey(library.libraryRef), refKey(libraryRef));
  assert.equal(item.addedAt, "2026-06-08T00:00:00.000Z");
  assert.equal(item.providerAddedAt, "2026-06-07T00:00:00.000Z");
  assert.equal(refKey(item.libraryRef), refKey(libraryRef));

  const repeated = repositories.items.upsert({
    ...item,
    lastSeenAt: "2026-06-08T00:01:00.000Z",
  });

  assert.equal(repeated.firstImportedAt, "2026-06-08T00:00:00.000Z");
  assert.equal(repeated.addedAt, "2026-06-08T00:00:00.000Z");
  assert.equal(repeated.providerAddedAt, "2026-06-07T00:00:00.000Z");
  assert.equal(repeated.lastSeenAt, "2026-06-08T00:01:00.000Z");

  const batch = repositories.batches.upsert({
    batchId: "repo-batch",
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    libraryRef,
    status: "running",
    cursor: "10",
    maxNewItems: 50,
    processedCount: 1,
    importedCount: 1,
    alreadyPresentCount: 0,
    failedCount: 0,
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  });
  assert.equal(batch.cursor, "10");
  assert.equal(batch.ownerScope, DEFAULT_OWNER_SCOPE);
  assert.equal(refKey(batch.libraryRef ?? libraryRef), refKey(libraryRef));

  const outcome = repositories.itemOutcomes.insert({
    batchId: "repo-batch",
    sequence: 1,
    outcome: "imported",
    sourceRefKey: item.sourceRefKey,
    providerId: "netease",
    providerEntityId: "1001",
    materialRefKey: "material:recording:m_repo",
    createdAt: "2026-06-08T00:00:00.000Z",
  });

  assert.deepEqual(repositories.itemOutcomes.listForBatch({ batchId: "repo-batch" }), [outcome]);
});

const itemColumns = repositoryDatabase.context().all<{ name: string }>(
  "PRAGMA table_info(source_library_items)",
).map((column) => column.name);
for (const forbiddenColumn of [
  "provider_id",
  "provider_account_id",
  "library_kind",
  "material_ref_key",
  "canonical_ref_key",
  "query",
  "rank",
  "score",
  "projection_json",
  "card_seed_json",
  "status",
]) {
  assert.equal(itemColumns.includes(forbiddenColumn), false);
}
const batchColumns = repositoryDatabase.context().all<{ name: string }>(
  "PRAGMA table_info(source_library_import_batches)",
).map((column) => column.name);
assert.equal(batchColumns.includes("owner_scope"), true);
assert.equal(batchColumns.includes("library_ref_key"), true);
const itemForeignKeys = repositoryDatabase.context().all<{ table: string; from: string; to: string }>(
  "PRAGMA foreign_key_list(source_library_items)",
);
assert.equal(
  itemForeignKeys.some((row) =>
    row.table === "source_libraries" && row.from === "library_ref_key" && row.to === "library_ref_key"
  ),
  true,
);
assert.equal(
  itemForeignKeys.some((row) =>
    row.table === "source_material_bindings" && row.from === "source_ref_key" && row.to === "source_ref_key"
  ),
  true,
);
assert.equal(
  uniqueIndexCovers(repositoryDatabase, "source_libraries", [
    "owner_scope",
    "provider_id",
    "provider_account_id",
    "library_kind",
  ]),
  true,
);
assert.equal(
  repositoryDatabase.context().all<{ table: string; from: string; to: string }>(
    "PRAGMA foreign_key_list(source_library_import_batches)",
  ).some((row) => row.table === "source_libraries" && row.from === "library_ref_key" && row.to === "library_ref_key"),
  true,
);
assert.throws(() => repositoryDatabase.transaction((db) => {
  createSourceLibraryRepositories({ db }).batches.upsert({
    batchId: "invalid-batch",
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    libraryKind: "saved_source_track",
    libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
    status: "running",
    processedCount: 0,
    importedCount: 0,
    alreadyPresentCount: 0,
    failedCount: 0,
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  });
}));
repositoryDatabase.close();

const materialRefFactory = createMaterialRefFactory({
  nextOpaqueId: () => "opaque_1",
});
const generatedMaterialRef = materialRefFactory.createMaterialRef("recording");
assert.deepEqual(generatedMaterialRef, {
  namespace: "material",
  kind: "recording",
  id: "m_opaque_1",
});
assert.equal(refKey(generatedMaterialRef), "material:recording:m_opaque_1");
assert.equal(generatedMaterialRef.id.includes("netease"), false);
assert.equal(generatedMaterialRef.id.includes("1001"), false);
assert.throws(() => createMaterialRefFactory({
  nextOpaqueId: () => "bad:id",
}).createMaterialRef("recording"), (error) =>
  isMusicDataPlatformError(error) &&
  error.code === "music_data.material_ref_invalid" &&
  error.message === "Material ref id must be a non-empty ref-safe string.");

const duplicateDatabase = initializedDatabase();
const duplicateReads = scriptedReadPort([
  okRead({
    providerId: "netease",
    providerAccountId: "130950618",
    kind: "saved_source_track",
    candidates: [
      platformCandidate("saved_source_track", sourceTrack("1001", "Duplicate One")),
      platformCandidate("saved_source_track", sourceTrack("1001", "Duplicate One Refresh")),
    ],
  }),
]);
const duplicateImport = createSourceLibraryImportService({
  database: duplicateDatabase,
  platformLibraryProvider: duplicateReads.port,
  materialRefFactory: createMaterialRefFactory({
    nextOpaqueId: () => "duplicate_material",
  }),
  now: fixedNow("2026-06-08T01:00:00.000Z"),
  newBatchId: () => "duplicate-batch",
});
const duplicateResult = await assertOk(duplicateImport.startImport({
  providerId: "netease",
  libraryKind: "saved_source_track",
  limit: 2,
}));

assert.equal(duplicateReads.requests[0]?.request.providerAccountId, undefined);
assert.equal(duplicateReads.requests[0]?.request.limit, 2);
assert.equal(duplicateResult.batch.status, "completed");
assert.equal(duplicateResult.batch.ownerScope, DEFAULT_OWNER_SCOPE);
assert.equal(duplicateResult.batch.providerAccountId, "130950618");
assert.equal(
  refKey(duplicateResult.batch.libraryRef ?? sourceLibraryRef("130950618", "saved_source_track")),
  refKey(sourceLibraryRef("130950618", "saved_source_track")),
);
assert.equal(duplicateResult.batch.completionReason, "provider_exhausted");
assert.equal(duplicateResult.batch.processedCount, 2);
assert.equal(duplicateResult.batch.importedCount, 1);
assert.equal(duplicateResult.batch.alreadyPresentCount, 1);
assert.deepEqual(duplicateResult.itemResults.map((item) => item.outcome.outcome), [
  "imported",
  "already_present",
]);
assert.equal(
  duplicateDatabase.context().get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM material_records",
  )?.count,
  1,
);
assert.deepEqual(
  {
    ...duplicateDatabase.context().get<{
      library_ref_key: string;
      source_ref_key: string;
      added_at: string;
      provider_added_at: string | null;
      first_imported_at: string;
      last_seen_at: string;
    }>(
      `
        SELECT
          library_ref_key,
          source_ref_key,
          added_at,
          provider_added_at,
          first_imported_at,
          last_seen_at
        FROM source_library_items
      `,
    ),
  },
  {
    library_ref_key: refKey(sourceLibraryRef("130950618", "saved_source_track")),
    source_ref_key: refKey(sourceRef("track", "1001")),
    added_at: "2026-06-08T01:00:00.000Z",
    provider_added_at: null,
    first_imported_at: "2026-06-08T01:00:00.000Z",
    last_seen_at: "2026-06-08T01:00:00.000Z",
  },
);
assert.equal(
  duplicateDatabase.context().get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM source_library_items WHERE source_ref_key = ?",
    [refKey(sourceRef("track", "1001"))],
  )?.count,
  1,
);
const providerAddedAtDatabase = initializedDatabase();
const providerAddedAtReads = scriptedReadPort([
  okRead({
    providerId: "netease",
    providerAccountId: "130950618",
    kind: "saved_source_track",
    candidates: [
      platformCandidate(
        "saved_source_track",
        sourceTrack("1001", "Provider Added One"),
        "2026-06-07T01:00:00.000Z",
      ),
    ],
    nextCursor: "1",
  }),
  okRead({
    providerId: "netease",
    providerAccountId: "130950618",
    kind: "saved_source_track",
    candidates: [
      platformCandidate("saved_source_track", sourceTrack("1001", "Provider Added One Refresh")),
    ],
  }),
]);
const providerAddedAtImport = createSourceLibraryImportService({
  database: providerAddedAtDatabase,
  platformLibraryProvider: providerAddedAtReads.port,
  materialRefFactory: createMaterialRefFactory({
    nextOpaqueId: () => "provider_added_material",
  }),
  now: scriptedNow([
    "2026-06-08T06:00:00.000Z",
    "2026-06-08T06:01:00.000Z",
    "2026-06-08T06:02:00.000Z",
    "2026-06-08T06:03:00.000Z",
    "2026-06-08T06:04:00.000Z",
    "2026-06-08T06:05:00.000Z",
  ]),
  newBatchId: () => "provider-added-batch",
});
const providerAddedAtStart = await assertOk(providerAddedAtImport.startImport({
  providerId: "netease",
  libraryKind: "saved_source_track",
  limit: 1,
}));
assert.equal(providerAddedAtStart.batch.status, "running");
assert.equal(
  refKey(providerAddedAtStart.batch.libraryRef ?? sourceLibraryRef("130950618", "saved_source_track")),
  refKey(sourceLibraryRef("130950618", "saved_source_track")),
);
assert.equal(
  providerAddedAtStart.itemResults[0]?.sourceLibraryItem?.addedAt,
  "2026-06-08T06:02:00.000Z",
);
assert.equal(
  providerAddedAtStart.itemResults[0]?.sourceLibraryItem?.providerAddedAt,
  "2026-06-07T01:00:00.000Z",
);
const providerAddedAtContinue = await assertOk(providerAddedAtImport.continueImport({
  batchId: "provider-added-batch",
  limit: 1,
}));
assert.equal(providerAddedAtContinue.batch.status, "completed");
assert.equal(
  refKey(providerAddedAtContinue.batch.libraryRef ?? sourceLibraryRef("130950618", "saved_source_track")),
  refKey(sourceLibraryRef("130950618", "saved_source_track")),
);
assert.equal(
  providerAddedAtContinue.itemResults[0]?.sourceLibraryItem?.addedAt,
  "2026-06-08T06:02:00.000Z",
);
assert.equal(
  providerAddedAtContinue.itemResults[0]?.sourceLibraryItem?.providerAddedAt,
  "2026-06-07T01:00:00.000Z",
);
assert.deepEqual(
  {
    ...providerAddedAtDatabase.context().get<{
      library_ref_key: string;
      added_at: string;
      provider_added_at: string;
      first_imported_at: string;
      last_seen_at: string;
    }>(
      `
        SELECT
          library_ref_key,
          added_at,
          provider_added_at,
          first_imported_at,
          last_seen_at
        FROM source_library_items
        WHERE source_ref_key = ?
      `,
      [refKey(sourceRef("track", "1001"))],
    ),
  },
  {
    library_ref_key: refKey(sourceLibraryRef("130950618", "saved_source_track")),
    added_at: "2026-06-08T06:02:00.000Z",
    provider_added_at: "2026-06-07T01:00:00.000Z",
    first_imported_at: "2026-06-08T06:02:00.000Z",
    last_seen_at: "2026-06-08T06:05:00.000Z",
  },
);
providerAddedAtDatabase.close();
const completedContinue = await assertOk(duplicateImport.continueImport({
  batchId: "duplicate-batch",
  limit: 1,
}));
assert.equal(completedContinue.batch.status, "completed");
assert.equal(duplicateReads.requests.length, 1);
duplicateDatabase.close();

const invalidLimitDatabase = initializedDatabase();
const invalidLimitReads = scriptedReadPort([]);
const invalidLimitImport = createSourceLibraryImportService({
  database: invalidLimitDatabase,
  platformLibraryProvider: invalidLimitReads.port,
  materialRefFactory: createMaterialRefFactory({
    nextOpaqueId: () => "unused",
  }),
  now: fixedNow("2026-06-08T01:30:00.000Z"),
  newBatchId: () => "invalid-limit-batch",
});
assertErrorCode(
  await invalidLimitImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 101,
  }),
  "music_data.invalid_source_library_import_input",
);
assert.equal(invalidLimitReads.requests.length, 0);
assert.equal(
  createSourceLibraryRepositories({ db: invalidLimitDatabase.context() })
    .batches.get({ batchId: "invalid-limit-batch" }),
  undefined,
);
assertErrorCode(
  await invalidLimitImport.startImport({
    providerId: " netease ",
    libraryKind: "saved_source_track",
    limit: 1,
  }),
  "music_data.invalid_source_library_import_input",
);
assertErrorCode(
  await invalidLimitImport.startImport({
    providerId: "netease",
    providerAccountId: " 130950618 ",
    libraryKind: "saved_source_track",
    limit: 1,
  }),
  "music_data.invalid_source_library_import_input",
);
assert.equal(invalidLimitReads.requests.length, 0);
invalidLimitDatabase.close();

const invalidDefaultLimitDatabase = initializedDatabase();
const invalidDefaultLimitReads = scriptedReadPort([]);
const invalidDefaultLimitImport = createSourceLibraryImportService({
  database: invalidDefaultLimitDatabase,
  platformLibraryProvider: invalidDefaultLimitReads.port,
  materialRefFactory: createMaterialRefFactory({
    nextOpaqueId: () => "unused",
  }),
  now: fixedNow("2026-06-08T01:35:00.000Z"),
  newBatchId: () => "invalid-default-limit-batch",
  defaultLimit: 101,
});
assertErrorCode(
  await invalidDefaultLimitImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
  }),
  "music_data.invalid_source_library_import_input",
);
assert.equal(invalidDefaultLimitReads.requests.length, 0);
assert.equal(
  createSourceLibraryRepositories({ db: invalidDefaultLimitDatabase.context() })
    .batches.get({ batchId: "invalid-default-limit-batch" }),
  undefined,
);
invalidDefaultLimitDatabase.close();

const collisionDatabase = initializedDatabase();
const collisionReads = scriptedReadPort([
  okRead({
    providerId: "netease",
    providerAccountId: "130950618",
    kind: "saved_source_track",
    candidates: [],
  }),
]);
const collisionImport = createSourceLibraryImportService({
  database: collisionDatabase,
  platformLibraryProvider: collisionReads.port,
  materialRefFactory: createMaterialRefFactory({
    nextOpaqueId: () => "unused",
  }),
  now: fixedNow("2026-06-08T01:45:00.000Z"),
  newBatchId: () => "collision-batch",
});
await assertOk(collisionImport.startImport({
  providerId: "netease",
  libraryKind: "saved_source_track",
  limit: 1,
}));
assertErrorCode(
  await collisionImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 1,
  }),
  "music_data.source_library_import_batch_id_collision",
);
assert.equal(collisionReads.requests.length, 1);
collisionDatabase.close();

const failedItemDatabase = initializedDatabase();
let materialIdIndex = 0;
const materialIds = ["ok_material", "bad:material"];
const failedItemImport = createSourceLibraryImportService({
  database: failedItemDatabase,
  platformLibraryProvider: scriptedReadPort([
    okRead({
      providerId: "netease",
      providerAccountId: "130950618",
      kind: "saved_source_track",
      candidates: [
        platformCandidate("saved_source_track", sourceTrack("1001", "Good Track")),
        platformCandidate("saved_source_track", sourceTrack("1002", "Bad Track")),
      ],
    }),
  ]).port,
  materialRefFactory: createMaterialRefFactory({
    nextOpaqueId: () => materialIds[materialIdIndex++] ?? "fallback",
  }),
  now: fixedNow("2026-06-08T02:00:00.000Z"),
  newBatchId: () => "failed-item-batch",
});
const failedItemResult = await assertOk(failedItemImport.startImport({
  providerId: "netease",
  providerAccountId: "130950618",
  libraryKind: "saved_source_track",
  limit: 2,
}));

assert.equal(failedItemResult.batch.status, "completed");
assert.equal(failedItemResult.batch.importedCount, 1);
assert.equal(failedItemResult.batch.failedCount, 1);
assert.deepEqual(failedItemResult.itemResults.map((item) => item.outcome.outcome), [
  "imported",
  "failed",
]);
assert.equal(
  failedItemDatabase.context().get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM source_records",
  )?.count,
  1,
);
assert.equal(
  failedItemDatabase.context().get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM source_library_items",
  )?.count,
  1,
);
failedItemDatabase.close();

const unresolvedAccountDatabase = initializedDatabase();
const unresolvedAccountImport = createSourceLibraryImportService({
  database: unresolvedAccountDatabase,
  platformLibraryProvider: scriptedReadPort([
    okRead({
      providerId: "netease",
      kind: "saved_source_track",
      candidates: [],
    }),
  ]).port,
  materialRefFactory: createMaterialRefFactory({
    nextOpaqueId: () => "unused",
  }),
  now: fixedNow("2026-06-08T03:00:00.000Z"),
  newBatchId: () => "unresolved-account-batch",
});
assertErrorCode(
  await unresolvedAccountImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 1,
  }),
  "music_data.source_library_account_unresolved",
);
assert.equal(
  createSourceLibraryRepositories({ db: unresolvedAccountDatabase.context() })
    .batches.get({ batchId: "unresolved-account-batch" })?.status,
  "failed",
);
unresolvedAccountDatabase.close();

const invalidAccountDatabase = initializedDatabase();
const invalidAccountImport = createSourceLibraryImportService({
  database: invalidAccountDatabase,
  platformLibraryProvider: scriptedReadPort([
    okRead({
      providerId: "netease",
      providerAccountId: "bad:account",
      kind: "saved_source_track",
      candidates: [],
    }),
  ]).port,
  materialRefFactory: createMaterialRefFactory({
    nextOpaqueId: () => "unused",
  }),
  now: fixedNow("2026-06-08T03:30:00.000Z"),
  newBatchId: () => "invalid-account-batch",
});
assertErrorCode(
  await invalidAccountImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 1,
  }),
  "music_data.source_library_account_invalid",
);
assert.equal(
  createSourceLibraryRepositories({ db: invalidAccountDatabase.context() })
    .batches.get({ batchId: "invalid-account-batch" })?.status,
  "failed",
);
invalidAccountDatabase.close();

for (const invalidPageCase of [
  {
    batchId: "wrong-page-provider-batch",
    read: okRead({
      providerId: "spotify",
      providerAccountId: "130950618",
      kind: "saved_source_track",
      candidates: [],
    }),
  },
  {
    batchId: "wrong-page-kind-batch",
    read: okRead({
      providerId: "netease",
      providerAccountId: "130950618",
      kind: "saved_source_album",
      candidates: [],
    }),
  },
  {
    batchId: "wrong-source-provider-batch",
    read: okRead({
      providerId: "netease",
      providerAccountId: "130950618",
      kind: "saved_source_track",
      candidates: [
        platformCandidate(
          "saved_source_track",
          {
            ...sourceTrack("1001", "Wrong Source Provider"),
            providerId: "spotify",
            sourceRef: {
              namespace: "source_spotify",
              kind: "track",
              id: "1001",
            },
          },
        ),
      ],
    }),
  },
  {
    batchId: "wrong-candidate-kind-batch",
    read: okRead({
      providerId: "netease",
      providerAccountId: "130950618",
      kind: "saved_source_track",
      candidates: [
        platformCandidate("saved_source_album", sourceTrack("1001", "Wrong Candidate Kind")),
      ],
    }),
  },
  {
    batchId: "candidate-account-mismatch-batch",
    read: okRead({
      providerId: "netease",
      providerAccountId: "130950618",
      kind: "saved_source_track",
      candidates: [
        {
          ...platformCandidate("saved_source_track", sourceTrack("1001", "Wrong Candidate Account")),
          providerAccountId: "other-account",
        },
      ],
    }),
  },
  {
    batchId: "unsafe-candidate-account-batch",
    read: okRead({
      providerId: "netease",
      providerAccountId: "130950618",
      kind: "saved_source_track",
      candidates: [
        {
          ...platformCandidate("saved_source_track", sourceTrack("1001", "Unsafe Candidate Account")),
          providerAccountId: " 130950618 ",
        },
      ],
    }),
  },
  {
    batchId: "unsafe-source-ref-batch",
    read: okRead({
      providerId: "netease",
      providerAccountId: "130950618",
      kind: "saved_source_track",
      candidates: [
        platformCandidate("saved_source_track", sourceTrack(" bad-id ", "Unsafe Source Ref")),
      ],
    }),
  },
] as const) {
  const invalidPageDatabase = initializedDatabase();
  const invalidPageReads = scriptedReadPort([invalidPageCase.read]);
  const invalidPageImport = createSourceLibraryImportService({
    database: invalidPageDatabase,
    platformLibraryProvider: invalidPageReads.port,
    materialRefFactory: createMaterialRefFactory({
      nextOpaqueId: () => "unused",
    }),
    now: fixedNow("2026-06-08T03:45:00.000Z"),
    newBatchId: () => invalidPageCase.batchId,
  });

  assertErrorCode(
    await invalidPageImport.startImport({
      providerId: "netease",
      libraryKind: "saved_source_track",
      limit: 1,
    }),
    "music_data.source_library_provider_page_invalid",
  );
  assert.equal(invalidPageReads.requests.length, 1);
  assert.equal(
    createSourceLibraryRepositories({ db: invalidPageDatabase.context() })
      .batches.get({ batchId: invalidPageCase.batchId })?.status,
    "failed",
  );
  assert.equal(countRows(invalidPageDatabase, "source_records"), 0);
  assert.equal(countRows(invalidPageDatabase, "source_library_items"), 0);
  invalidPageDatabase.close();
}

const mismatchDatabase = initializedDatabase();
const mismatchReads = scriptedReadPort([
  okRead({
    providerId: "netease",
    providerAccountId: "130950618",
    kind: "saved_source_track",
    candidates: [platformCandidate("saved_source_track", sourceTrack("1001", "Page One"))],
    nextCursor: "1",
  }),
  okRead({
    providerId: "netease",
    providerAccountId: "other-account",
    kind: "saved_source_track",
    candidates: [platformCandidate("saved_source_track", sourceTrack("1002", "Page Two"))],
  }),
]);
const mismatchImport = createSourceLibraryImportService({
  database: mismatchDatabase,
  platformLibraryProvider: mismatchReads.port,
  materialRefFactory: createMaterialRefFactory({
    nextOpaqueId: () => "mismatch_material",
  }),
  now: fixedNow("2026-06-08T04:00:00.000Z"),
  newBatchId: () => "mismatch-batch",
});
const mismatchStart = await assertOk(mismatchImport.startImport({
  providerId: "netease",
  libraryKind: "saved_source_track",
  limit: 1,
}));
assert.equal(mismatchStart.batch.status, "running");
assert.equal(mismatchStart.batch.cursor, "1");
assert.equal(mismatchReads.requests.length, 1);
assertErrorCode(
  await mismatchImport.continueImport({
    batchId: "mismatch-batch",
    limit: 1,
  }),
  "music_data.source_library_account_mismatch",
);
const mismatchContinueRequest = requestAt(mismatchReads.requests, 1);
assert.equal(mismatchContinueRequest.request.providerAccountId, "130950618");
assert.equal(mismatchContinueRequest.request.cursor, "1");
assert.equal(
  createSourceLibraryRepositories({ db: mismatchDatabase.context() })
    .batches.get({ batchId: "mismatch-batch" })?.status,
  "failed",
);
mismatchDatabase.close();

const maxNewDatabase = initializedDatabase();
const maxNewReads = scriptedReadPort([
  okRead({
    providerId: "netease",
    providerAccountId: "130950618",
    kind: "saved_source_track",
    candidates: [platformCandidate("saved_source_track", sourceTrack("1001", "Max One"))],
    nextCursor: "1",
  }),
]);
const maxNewImport = createSourceLibraryImportService({
  database: maxNewDatabase,
  platformLibraryProvider: maxNewReads.port,
  materialRefFactory: createMaterialRefFactory({
    nextOpaqueId: () => "max_new_material",
  }),
  now: fixedNow("2026-06-08T05:00:00.000Z"),
  newBatchId: () => "max-new-batch",
});
const maxNewResult = await assertOk(maxNewImport.startImport({
  providerId: "netease",
  libraryKind: "saved_source_track",
  limit: 10,
  maxNewItems: 1,
}));
assert.equal(maxNewReads.requests[0]?.request.limit, 1);
assert.equal(maxNewResult.batch.status, "completed");
assert.equal(maxNewResult.batch.completionReason, "max_new_items_reached");
assert.equal(maxNewResult.batch.cursor, undefined);
maxNewDatabase.close();

function initializedDatabase(): ReturnType<typeof SqliteMusicDatabase.open> {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformSourceLibrarySchema,
    ],
  });

  return database;
}

function scriptedReadPort(results: readonly Result<PlatformLibraryReadResult>[]): {
  port: PlatformLibraryReadPort;
  requests: ProviderReadRequest[];
} {
  const requests: ProviderReadRequest[] = [];
  let index = 0;

  return {
    requests,
    port: {
      readPlatformLibraryProvider(input) {
        requests.push(input);
        const result = results[index] ?? results[results.length - 1];
        index += 1;

        if (result === undefined) {
          throw new Error("Missing scripted provider read result.");
        }

        return Promise.resolve(result);
      },
    },
  };
}

function okRead(value: PlatformLibraryReadResult): Result<PlatformLibraryReadResult> {
  return {
    ok: true,
    value,
  };
}

function platformCandidate(
  libraryKind: PlatformLibraryCandidate["libraryKind"],
  sourceEntity: SourceEntity,
  providerAddedAt?: string,
): PlatformLibraryCandidate {
  return {
    libraryKind,
    sourceEntity,
    ...(providerAddedAt === undefined ? {} : { providerAddedAt }),
  };
}

function scriptedNow(timestamps: readonly string[]): () => string {
  let index = 0;

  return () => {
    const timestamp = timestamps[index] ?? timestamps[timestamps.length - 1];
    index += 1;

    if (timestamp === undefined) {
      throw new Error("Missing scripted timestamp.");
    }

    return timestamp;
  };
}

function sourceTrack(id: string, title: string): SourceEntity {
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
  libraryKind: PlatformLibraryCandidate["libraryKind"],
): Ref {
  return createSourceLibraryRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId,
    libraryKind,
  });
}

function countRows(database: ReturnType<typeof SqliteMusicDatabase.open>, tableName: string): number {
  const row = database.context().get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${tableName}`,
  );

  return row?.count ?? 0;
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

function fixedNow(value: string): () => string {
  return () => value;
}

function requestAt(requests: readonly ProviderReadRequest[], index: number): ProviderReadRequest {
  const request = requests[index];

  if (request === undefined) {
    throw new Error("Expected provider request to be present.");
  }

  return request;
}

async function assertOk<T>(result: Promise<Result<T>> | Result<T>): Promise<T> {
  const awaited = await result;

  if (!awaited.ok) {
    throw new Error(awaited.error.message);
  }

  return awaited.value;
}

function assertErrorCode(result: Result<unknown>, code: string): void {
  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, code);
    assert.equal(result.error.area, "music_data_platform");
  }
}
