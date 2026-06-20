import { refKey, type Ref } from "../contracts/kernel.js";
import type { PlatformLibraryKind, SourceLibraryImportBatchStatus, SourceLibraryImportCompletionReason, SourceLibraryImportItemOutcome } from "../contracts/music_data_platform.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertOwnerScope } from "./owner_scope.js";
import {
  assertSourceLibraryRef,
  createSourceLibraryRef,
} from "./source_library_ref.js";

export type SourceLibraryRecord = {
  libraryRef: Ref;
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  libraryKind: PlatformLibraryKind;
  createdAt: string;
  updatedAt: string;
};

export type SourceLibraryItemRecord = {
  libraryRef: Ref;
  sourceRefKey: string;
  addedAt: string;
  providerAddedAt?: string;
  firstImportedAt: string;
};

export type SourceLibraryImportBatchRecord = {
  batchId: string;
  ownerScope: string;
  providerId: string;
  providerAccountId?: string;
  libraryKind: PlatformLibraryKind;
  libraryRef?: Ref;
  status: SourceLibraryImportBatchStatus;
  cursor?: string;
  maxNewItems?: number;
  processedCount: number;
  importedCount: number;
  alreadyPresentCount: number;
  failedCount: number;
  completionReason?: SourceLibraryImportCompletionReason;
  failureCode?: string;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type SourceLibraryImportItemOutcomeRecord = {
  batchId: string;
  sequence: number;
  outcome: SourceLibraryImportItemOutcome;
  sourceRefKey?: string;
  providerId?: string;
  providerEntityId?: string;
  materialRefKey?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
};

export type CreateSourceLibraryRepositoriesInput = {
  db: MusicDatabaseContext;
};

export type SourceLibraryRepositories = {
  libraries: SourceLibraryRepository;
  items: SourceLibraryItemRepository;
  batches: SourceLibraryImportBatchRepository;
  itemOutcomes: SourceLibraryImportItemOutcomeRepository;
};

export type SourceLibraryRepository = {
  get(input: { libraryRef: Ref }): Promise<SourceLibraryRecord | undefined>;
  listByOwnerScope(input: { ownerScope: string }): Promise<readonly SourceLibraryRecord[]>;
  findByOwnerProviderIdentity(input: {
    ownerScope: string;
    providerId: string;
    providerAccountId: string;
    libraryKind: PlatformLibraryKind;
  }): Promise<SourceLibraryRecord | undefined>;
  upsert(record: SourceLibraryRecord): Promise<SourceLibraryRecord>;
};

export type SourceLibraryItemRepository = {
  get(input: {
    libraryRef: Ref;
    sourceRefKey: string;
  }): Promise<SourceLibraryItemRecord | undefined>;
  upsert(record: SourceLibraryItemRecord): Promise<SourceLibraryItemRecord>;
  deleteItemsNotObservedInBatch(input: {
    libraryRef: Ref;
    batchId: string;
  }): Promise<{
    deletedCount: number;
  }>;
};

export type SourceLibraryImportBatchRepository = {
  get(input: { batchId: string }): Promise<SourceLibraryImportBatchRecord | undefined>;
  insert(record: SourceLibraryImportBatchRecord): Promise<SourceLibraryImportBatchRecord>;
  upsert(record: SourceLibraryImportBatchRecord): Promise<SourceLibraryImportBatchRecord>;
};

export type SourceLibraryImportItemOutcomeRepository = {
  insert(record: SourceLibraryImportItemOutcomeRecord): Promise<SourceLibraryImportItemOutcomeRecord>;
  listForBatch(input: { batchId: string }): Promise<readonly SourceLibraryImportItemOutcomeRecord[]>;
};

type SourceLibraryRow = {
  library_ref_key: string;
  owner_scope: string;
  provider_id: string;
  provider_account_id: string;
  library_kind: PlatformLibraryKind;
  created_at: string;
  updated_at: string;
};

type SourceLibraryItemRow = {
  library_ref_key: string;
  source_ref_key: string;
  added_at: string;
  provider_added_at: string | null;
  first_imported_at: string;
  owner_scope: string;
  provider_id: string;
  provider_account_id: string;
  library_kind: PlatformLibraryKind;
};

type SourceLibraryImportBatchRow = {
  batch_id: string;
  owner_scope: string;
  provider_id: string;
  provider_account_id: string | null;
  library_kind: PlatformLibraryKind;
  library_ref_key: string | null;
  status: SourceLibraryImportBatchStatus;
  cursor: string | null;
  max_new_items: number | null;
  processed_count: number;
  imported_count: number;
  already_present_count: number;
  failed_count: number;
  completion_reason: SourceLibraryImportCompletionReason | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
};

type SourceLibraryImportItemOutcomeRow = {
  batch_id: string;
  sequence: number;
  outcome: SourceLibraryImportItemOutcome;
  source_ref_key: string | null;
  provider_id: string | null;
  provider_entity_id: string | null;
  material_ref_key: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

export function createSourceLibraryRepositories(
  input: CreateSourceLibraryRepositoriesInput,
): SourceLibraryRepositories {
  const { db } = input;

  const libraries: SourceLibraryRepository = {
    async get(input) {
      const row = await db.get<SourceLibraryRow>(
        "SELECT * FROM source_libraries WHERE library_ref_key = ?",
        [refKey(input.libraryRef)],
      );

      return row === undefined ? undefined : sourceLibraryFromRow(row);
    },
    async listByOwnerScope(input) {
      assertOwnerScope(input.ownerScope);

      return (await db.all<SourceLibraryRow>(
        `
          SELECT * FROM source_libraries
          WHERE owner_scope = ?
          ORDER BY provider_id ASC, provider_account_id ASC, library_kind ASC
        `,
        [input.ownerScope],
      )).map(sourceLibraryFromRow);
    },
    async findByOwnerProviderIdentity(input) {
      const row = await db.get<SourceLibraryRow>(
        `
          SELECT * FROM source_libraries
          WHERE owner_scope = ?
            AND provider_id = ?
            AND provider_account_id = ?
            AND library_kind = ?
        `,
        [
          input.ownerScope,
          input.providerId,
          input.providerAccountId,
          input.libraryKind,
        ],
      );

      return row === undefined ? undefined : sourceLibraryFromRow(row);
    },
    async upsert(record) {
      assertSourceLibraryRecordConsistency(record);

      await db.run(
        `
          INSERT INTO source_libraries (
            library_ref_key,
            owner_scope,
            provider_id,
            provider_account_id,
            library_kind,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(library_ref_key) DO UPDATE SET
            owner_scope = excluded.owner_scope,
            provider_id = excluded.provider_id,
            provider_account_id = excluded.provider_account_id,
            library_kind = excluded.library_kind,
            updated_at = excluded.updated_at
        `,
        [
          refKey(record.libraryRef),
          record.ownerScope,
          record.providerId,
          record.providerAccountId,
          record.libraryKind,
          record.createdAt,
          record.updatedAt,
        ],
      );

      return requireRecord(
        await libraries.get({ libraryRef: record.libraryRef }),
        "source library upsert did not return a stored record",
      );
    },
  };

  const items: SourceLibraryItemRepository = {
    async get(input) {
      const row = await db.get<SourceLibraryItemRow>(
        `
          SELECT
            i.library_ref_key,
            i.source_ref_key,
            i.added_at,
            i.provider_added_at,
            i.first_imported_at,
            l.owner_scope,
            l.provider_id,
            l.provider_account_id,
            l.library_kind
          FROM source_library_items i
          JOIN source_libraries l
            ON l.library_ref_key = i.library_ref_key
          WHERE i.library_ref_key = ?
            AND i.source_ref_key = ?
        `,
        [refKey(input.libraryRef), input.sourceRefKey],
      );

      return row === undefined ? undefined : sourceLibraryItemFromRow(row);
    },
    async upsert(record) {
      assertSourceLibraryItemRecordConsistency(record);

      await db.run(
        `
          INSERT INTO source_library_items (
            library_ref_key,
            source_ref_key,
            added_at,
            provider_added_at,
            first_imported_at
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(library_ref_key, source_ref_key) DO UPDATE SET
            added_at = excluded.added_at,
            provider_added_at = excluded.provider_added_at
        `,
        [
          refKey(record.libraryRef),
          record.sourceRefKey,
          record.addedAt,
          record.providerAddedAt ?? null,
          record.firstImportedAt,
        ],
      );

      return requireRecord(
        await items.get({
          libraryRef: record.libraryRef,
          sourceRefKey: record.sourceRefKey,
        }),
        "source library item upsert did not return a stored record",
      );
    },
    async deleteItemsNotObservedInBatch(input) {
      assertSourceLibraryRef(input.libraryRef);

      const libraryRefKey = refKey(input.libraryRef);
      await assertImportBatchMatchesLibraryRef({
        batchId: input.batchId,
        db,
        libraryRefKey,
      });
      const deletedCount = Number((await db.get<{ count: number | string }>(
        `
          SELECT COUNT(*) AS count
          FROM source_library_items AS current_items
          WHERE current_items.library_ref_key = ?
            AND NOT EXISTS (
              SELECT 1
              FROM source_library_import_item_outcomes AS observed
              WHERE observed.batch_id = ?
                AND observed.outcome IN ('imported', 'already_present')
                AND observed.source_ref_key = current_items.source_ref_key
            )
        `,
        [libraryRefKey, input.batchId],
      ))?.count ?? 0);

      if (deletedCount === 0) {
        return { deletedCount: 0 };
      }

      await db.run(
        `
          DELETE FROM source_library_items
          WHERE library_ref_key = ?
            AND NOT EXISTS (
              SELECT 1
              FROM source_library_import_item_outcomes AS observed
              WHERE observed.batch_id = ?
                AND observed.outcome IN ('imported', 'already_present')
                AND observed.source_ref_key = source_library_items.source_ref_key
            )
        `,
        [libraryRefKey, input.batchId],
      );

      return { deletedCount };
    },
  };

  const batches: SourceLibraryImportBatchRepository = {
    async get(input) {
      const row = await db.get<SourceLibraryImportBatchRow>(
        "SELECT * FROM source_library_import_batches WHERE batch_id = ?",
        [input.batchId],
      );

      return row === undefined ? undefined : sourceLibraryImportBatchFromRow(row);
    },
    async insert(record) {
      assertSourceLibraryImportBatchConsistency(record);

      await db.run(
        `
          INSERT INTO source_library_import_batches (
            batch_id,
            owner_scope,
            provider_id,
            provider_account_id,
            library_kind,
            library_ref_key,
            status,
            cursor,
            max_new_items,
            processed_count,
            imported_count,
            already_present_count,
            failed_count,
            completion_reason,
            failure_code,
            failure_message,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          record.batchId,
          record.ownerScope,
          record.providerId,
          record.providerAccountId ?? null,
          record.libraryKind,
          optionalRefKey(record.libraryRef),
          record.status,
          record.cursor ?? null,
          record.maxNewItems ?? null,
          record.processedCount,
          record.importedCount,
          record.alreadyPresentCount,
          record.failedCount,
          record.completionReason ?? null,
          record.failureCode ?? null,
          record.failureMessage ?? null,
          record.createdAt,
          record.updatedAt,
        ],
      );

      return requireRecord(
        await batches.get({ batchId: record.batchId }),
        "source library import batch insert did not return a stored record",
      );
    },
    async upsert(record) {
      assertSourceLibraryImportBatchConsistency(record);

      await db.run(
        `
          INSERT INTO source_library_import_batches (
            batch_id,
            owner_scope,
            provider_id,
            provider_account_id,
            library_kind,
            library_ref_key,
            status,
            cursor,
            max_new_items,
            processed_count,
            imported_count,
            already_present_count,
            failed_count,
            completion_reason,
            failure_code,
            failure_message,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(batch_id) DO UPDATE SET
            owner_scope = excluded.owner_scope,
            provider_account_id = excluded.provider_account_id,
            library_ref_key = excluded.library_ref_key,
            status = excluded.status,
            cursor = excluded.cursor,
            processed_count = excluded.processed_count,
            imported_count = excluded.imported_count,
            already_present_count = excluded.already_present_count,
            failed_count = excluded.failed_count,
            completion_reason = excluded.completion_reason,
            failure_code = excluded.failure_code,
            failure_message = excluded.failure_message,
            updated_at = excluded.updated_at
        `,
        [
          record.batchId,
          record.ownerScope,
          record.providerId,
          record.providerAccountId ?? null,
          record.libraryKind,
          optionalRefKey(record.libraryRef),
          record.status,
          record.cursor ?? null,
          record.maxNewItems ?? null,
          record.processedCount,
          record.importedCount,
          record.alreadyPresentCount,
          record.failedCount,
          record.completionReason ?? null,
          record.failureCode ?? null,
          record.failureMessage ?? null,
          record.createdAt,
          record.updatedAt,
        ],
      );

      return requireRecord(
        await batches.get({ batchId: record.batchId }),
        "source library import batch upsert did not return a stored record",
      );
    },
  };

  const itemOutcomes: SourceLibraryImportItemOutcomeRepository = {
    async insert(record) {
      await db.run(
        `
          INSERT INTO source_library_import_item_outcomes (
            batch_id,
            sequence,
            outcome,
            source_ref_key,
            provider_id,
            provider_entity_id,
            material_ref_key,
            error_code,
            error_message,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          record.batchId,
          record.sequence,
          record.outcome,
          record.sourceRefKey ?? null,
          record.providerId ?? null,
          record.providerEntityId ?? null,
          record.materialRefKey ?? null,
          record.errorCode ?? null,
          record.errorMessage ?? null,
          record.createdAt,
        ],
      );

      return record;
    },
    async listForBatch(input) {
      return (await db.all<SourceLibraryImportItemOutcomeRow>(
        `
          SELECT * FROM source_library_import_item_outcomes
          WHERE batch_id = ?
          ORDER BY sequence ASC
        `,
        [input.batchId],
      )).map(sourceLibraryImportItemOutcomeFromRow);
    },
  };

  return {
    libraries,
    items,
    batches,
    itemOutcomes,
  };
}

export function sourceLibraryItemKey(input: {
  libraryRef: Ref;
  sourceRef: Parameters<typeof refKey>[0];
}): {
  libraryRefKey: string;
  sourceRefKey: string;
} {
  assertSourceLibraryRef(input.libraryRef);

  return {
    libraryRefKey: refKey(input.libraryRef),
    sourceRefKey: refKey(input.sourceRef),
  };
}

function sourceLibraryFromRow(row: SourceLibraryRow): SourceLibraryRecord {
  const libraryRef = createSourceLibraryRef({
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    providerAccountId: row.provider_account_id,
    libraryKind: row.library_kind,
  });

  assertStoredLibraryRefMatchesRow(libraryRef, row.library_ref_key);

  return {
    libraryRef,
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    providerAccountId: row.provider_account_id,
    libraryKind: row.library_kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sourceLibraryItemFromRow(row: SourceLibraryItemRow): SourceLibraryItemRecord {
  const libraryRef = createSourceLibraryRef({
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    providerAccountId: row.provider_account_id,
    libraryKind: row.library_kind,
  });

  assertStoredLibraryRefMatchesRow(libraryRef, row.library_ref_key);

  return {
    libraryRef,
    sourceRefKey: row.source_ref_key,
    addedAt: row.added_at,
    ...(row.provider_added_at === null ? {} : { providerAddedAt: row.provider_added_at }),
    firstImportedAt: row.first_imported_at,
  };
}

function sourceLibraryImportBatchFromRow(row: SourceLibraryImportBatchRow): SourceLibraryImportBatchRecord {
  const record: SourceLibraryImportBatchRecord = {
    batchId: row.batch_id,
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    ...(row.provider_account_id === null ? {} : { providerAccountId: row.provider_account_id }),
    libraryKind: row.library_kind,
    status: row.status,
    ...(row.cursor === null ? {} : { cursor: row.cursor }),
    ...(row.max_new_items === null ? {} : { maxNewItems: row.max_new_items }),
    processedCount: row.processed_count,
    importedCount: row.imported_count,
    alreadyPresentCount: row.already_present_count,
    failedCount: row.failed_count,
    ...(row.completion_reason === null ? {} : { completionReason: row.completion_reason }),
    ...(row.failure_code === null ? {} : { failureCode: row.failure_code }),
    ...(row.failure_message === null ? {} : { failureMessage: row.failure_message }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.library_ref_key === null) {
    return record;
  }

  if (row.provider_account_id === null) {
    throw new Error("Source library import batch stored library_ref_key without provider_account_id.");
  }

  const libraryRef = createSourceLibraryRef({
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    providerAccountId: row.provider_account_id,
    libraryKind: row.library_kind,
  });

  assertStoredLibraryRefMatchesRow(libraryRef, row.library_ref_key);

  return {
    ...record,
    libraryRef,
  };
}

function sourceLibraryImportItemOutcomeFromRow(
  row: SourceLibraryImportItemOutcomeRow,
): SourceLibraryImportItemOutcomeRecord {
  return {
    batchId: row.batch_id,
    sequence: row.sequence,
    outcome: row.outcome,
    ...(row.source_ref_key === null ? {} : { sourceRefKey: row.source_ref_key }),
    ...(row.provider_id === null ? {} : { providerId: row.provider_id }),
    ...(row.provider_entity_id === null ? {} : { providerEntityId: row.provider_entity_id }),
    ...(row.material_ref_key === null ? {} : { materialRefKey: row.material_ref_key }),
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    createdAt: row.created_at,
  };
}

function assertSourceLibraryRecordConsistency(record: SourceLibraryRecord): void {
  assertOwnerScope(record.ownerScope);
  assertSourceLibraryRef(record.libraryRef);

  const expectedRef = createSourceLibraryRef({
    ownerScope: record.ownerScope,
    providerId: record.providerId,
    providerAccountId: record.providerAccountId,
    libraryKind: record.libraryKind,
  });

  if (refKey(expectedRef) !== refKey(record.libraryRef)) {
    throw new MusicDataPlatformError({
      code: "music_data.record_ref_key_mismatch",
      message: "Source library ref does not match owner/provider/account/library identity.",
    });
  }
}

function assertSourceLibraryItemRecordConsistency(record: SourceLibraryItemRecord): void {
  assertSourceLibraryRef(record.libraryRef);

  if (record.addedAt.length === 0 || record.firstImportedAt.length === 0) {
    throw new Error("Source library item timestamps must be non-empty strings.");
  }
}

function assertSourceLibraryImportBatchConsistency(record: SourceLibraryImportBatchRecord): void {
  assertOwnerScope(record.ownerScope);

  if (record.libraryRef !== undefined) {
    assertSourceLibraryRef(record.libraryRef);

    if (record.providerAccountId === undefined) {
      throw new MusicDataPlatformError({
        code: "music_data.record_ref_key_mismatch",
        message: "Source library import batch cannot store libraryRef without providerAccountId.",
      });
    }

    const expectedRef = createSourceLibraryRef({
      ownerScope: record.ownerScope,
      providerId: record.providerId,
      providerAccountId: record.providerAccountId,
      libraryKind: record.libraryKind,
    });

    if (refKey(expectedRef) !== refKey(record.libraryRef)) {
      throw new MusicDataPlatformError({
        code: "music_data.record_ref_key_mismatch",
        message: "Source library import batch libraryRef does not match owner/provider/account/library identity.",
      });
    }
  }
}

async function assertImportBatchMatchesLibraryRef(input: {
  batchId: string;
  db: MusicDatabaseContext;
  libraryRefKey: string;
}): Promise<void> {
  const row = await input.db.get<{ library_ref_key: string | null }>(
    "SELECT library_ref_key FROM source_library_import_batches WHERE batch_id = ?",
    [input.batchId],
  );

  if (row === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.source_library_import_batch_not_found",
      message: `Source library import batch '${input.batchId}' was not found.`,
    });
  }

  if (row.library_ref_key !== input.libraryRefKey) {
    throw new MusicDataPlatformError({
      code: "music_data.record_ref_key_mismatch",
      message: "Source library reconciliation batch libraryRef does not match the target library ref.",
    });
  }
}

function assertStoredLibraryRefMatchesRow(libraryRef: Ref, storedRefKey: string): void {
  if (refKey(libraryRef) !== storedRefKey) {
    throw new MusicDataPlatformError({
      code: "music_data.record_ref_key_mismatch",
      message: "Stored source library ref key does not match the derived source library ref.",
    });
  }
}

function optionalRefKey(ref: Ref | undefined): string | null {
  return ref === undefined ? null : refKey(ref);
}

function requireRecord<T>(record: T | undefined, message: string): T {
  if (record === undefined) {
    throw new Error(message);
  }

  return record;
}
