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
  createIdentityWriteCommands,
  createMaterialRefFactory,
  createSourceLibraryImportService,
  createSourceLibraryRepositories,
  musicDataPlatformIdentitySchema,
  musicDataPlatformSourceLibrarySchema,
  sourceLibraryItemKey,
  type PlatformLibraryReadPort,
  type SourceLibraryImportBatchRecord,
  type SourceLibraryImportItemOutcomeRecord,
  type SourceLibraryItemRecord,
} from "../../src/music_data_platform/index.js";
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

export type _sourceLibraryItemRecordShape = Expect<
  Equal<
    keyof SourceLibraryItemRecord,
    | "providerId"
    | "providerAccountId"
    | "libraryKind"
    | "sourceRefKey"
    | "addedAt"
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
    | "providerId"
    | "providerAccountId"
    | "libraryKind"
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

const repositoryDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
repositoryDatabase.initialize({
  schemas: [
    musicDataPlatformIdentitySchema,
    musicDataPlatformSourceLibrarySchema,
  ],
});

repositoryDatabase.transaction((db) => {
  createIdentityWriteCommands({ db, now: "2026-06-08T00:00:00.000Z" }).upsertSourceRecord({
    entity: sourceTrack("1001", "Repository Track"),
  });
});

repositoryDatabase.transaction((db) => {
  const repositories = createSourceLibraryRepositories({ db });
  const item = repositories.items.upsert({
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    sourceRefKey: refKey(sourceRef("track", "1001")),
    addedAt: "2026-06-07T00:00:00.000Z",
    firstImportedAt: "2026-06-08T00:00:00.000Z",
    lastSeenAt: "2026-06-08T00:00:00.000Z",
  });

  assert.equal(item.addedAt, "2026-06-07T00:00:00.000Z");

  const repeated = repositories.items.upsert({
    ...item,
    lastSeenAt: "2026-06-08T00:01:00.000Z",
  });

  assert.equal(repeated.firstImportedAt, "2026-06-08T00:00:00.000Z");
  assert.equal(repeated.lastSeenAt, "2026-06-08T00:01:00.000Z");

  const batch = repositories.batches.upsert({
    batchId: "repo-batch",
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
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
}).createMaterialRef("recording"));

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
assert.equal(duplicateResult.batch.providerAccountId, "130950618");
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
assert.equal(
  duplicateDatabase.context().get<{ source_ref_key: string }>(
    "SELECT source_ref_key FROM source_library_items",
  )?.source_ref_key,
  refKey(sourceRef("track", "1001")),
);
const completedContinue = await assertOk(duplicateImport.continueImport({
  batchId: "duplicate-batch",
  limit: 1,
}));
assert.equal(completedContinue.batch.status, "completed");
assert.equal(duplicateReads.requests.length, 1);
duplicateDatabase.close();

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
  addedAt?: string,
): PlatformLibraryCandidate {
  return {
    libraryKind,
    sourceEntity,
    ...(addedAt === undefined ? {} : { addedAt }),
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
