import { refKey, } from "../contracts/index.js";
export function createSourceLibraryRepositories(input) {
    const { db } = input;
    const items = {
        get(itemKey) {
            const row = db.get(`
          SELECT * FROM source_library_items
          WHERE provider_id = ?
            AND provider_account_id = ?
            AND library_kind = ?
            AND source_ref_key = ?
        `, [
                itemKey.providerId,
                itemKey.providerAccountId,
                itemKey.libraryKind,
                itemKey.sourceRefKey,
            ]);
            return row === undefined ? undefined : sourceLibraryItemFromRow(row);
        },
        upsert(record) {
            db.run(`
          INSERT INTO source_library_items (
            provider_id,
            provider_account_id,
            library_kind,
            source_ref_key,
            added_at,
            provider_added_at,
            first_imported_at,
            last_seen_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(provider_id, provider_account_id, library_kind, source_ref_key)
          DO UPDATE SET
            added_at = excluded.added_at,
            provider_added_at = excluded.provider_added_at,
            last_seen_at = excluded.last_seen_at
        `, [
                record.providerId,
                record.providerAccountId,
                record.libraryKind,
                record.sourceRefKey,
                record.addedAt ?? null,
                record.providerAddedAt ?? null,
                record.firstImportedAt,
                record.lastSeenAt,
            ]);
            return requireRecord(items.get({
                providerId: record.providerId,
                providerAccountId: record.providerAccountId,
                libraryKind: record.libraryKind,
                sourceRefKey: record.sourceRefKey,
            }), "source library item upsert did not return a stored record");
        },
    };
    const batches = {
        get(input) {
            const row = db.get("SELECT * FROM source_library_import_batches WHERE batch_id = ?", [input.batchId]);
            return row === undefined ? undefined : sourceLibraryImportBatchFromRow(row);
        },
        insert(record) {
            db.run(`
          INSERT INTO source_library_import_batches (
            batch_id,
            provider_id,
            provider_account_id,
            library_kind,
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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                record.batchId,
                record.providerId,
                record.providerAccountId ?? null,
                record.libraryKind,
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
            ]);
            return requireRecord(batches.get({ batchId: record.batchId }), "source library import batch insert did not return a stored record");
        },
        upsert(record) {
            db.run(`
          INSERT INTO source_library_import_batches (
            batch_id,
            provider_id,
            provider_account_id,
            library_kind,
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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(batch_id) DO UPDATE SET
            provider_account_id = excluded.provider_account_id,
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
        `, [
                record.batchId,
                record.providerId,
                record.providerAccountId ?? null,
                record.libraryKind,
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
            ]);
            return requireRecord(batches.get({ batchId: record.batchId }), "source library import batch upsert did not return a stored record");
        },
    };
    const itemOutcomes = {
        insert(record) {
            db.run(`
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
        `, [
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
            ]);
            return record;
        },
        listForBatch(input) {
            return db.all(`
          SELECT * FROM source_library_import_item_outcomes
          WHERE batch_id = ?
          ORDER BY sequence ASC
        `, [input.batchId]).map(sourceLibraryImportItemOutcomeFromRow);
        },
    };
    return {
        items,
        batches,
        itemOutcomes,
    };
}
export function sourceLibraryItemKey(input) {
    return {
        providerId: input.providerId,
        providerAccountId: input.providerAccountId,
        libraryKind: input.libraryKind,
        sourceRefKey: refKey(input.sourceRef),
    };
}
function sourceLibraryItemFromRow(row) {
    return {
        providerId: row.provider_id,
        providerAccountId: row.provider_account_id,
        libraryKind: row.library_kind,
        sourceRefKey: row.source_ref_key,
        ...(row.added_at === null ? {} : { addedAt: row.added_at }),
        ...(row.provider_added_at === null ? {} : { providerAddedAt: row.provider_added_at }),
        firstImportedAt: row.first_imported_at,
        lastSeenAt: row.last_seen_at,
    };
}
function sourceLibraryImportBatchFromRow(row) {
    return {
        batchId: row.batch_id,
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
}
function sourceLibraryImportItemOutcomeFromRow(row) {
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
function requireRecord(record, message) {
    if (record === undefined) {
        throw new Error(message);
    }
    return record;
}
