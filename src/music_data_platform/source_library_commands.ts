import { refKey, type Ref } from "../contracts/kernel.js";
import type { PlatformLibraryKind, SourceLibraryImportCompletionReason, SourceLibraryImportItemOutcome } from "../contracts/music_data_platform.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { createIdentityReadPort } from "./identity_read_model.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertOwnerScope } from "./owner_scope.js";
import type { ProjectionInvalidationCommands } from "./projection_maintenance_commands.js";
import {
  createSourceLibraryRepositories,
  type SourceLibraryImportBatchRecord,
  type SourceLibraryImportItemOutcomeRecord,
  type SourceLibraryItemRecord,
} from "./source_library_records.js";
import { createSourceLibraryRef } from "./source_library_ref.js";

export type CreateSourceLibraryCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
  projectionInvalidationCommands: ProjectionInvalidationCommands;
};

export type CreateSourceLibraryImportBatchInput = {
  batchId: string;
  ownerScope: string;
  providerId: string;
  providerAccountId?: string;
  libraryKind: PlatformLibraryKind;
  maxNewItems?: number;
};

export type ResolveSourceLibraryImportBatchScopeInput = {
  batch: SourceLibraryImportBatchRecord;
  providerAccountId: string;
};

export type RecordSourceLibraryImportItemInput = {
  batch: SourceLibraryImportBatchRecord;
  sourceRef: Ref;
  providerId: string;
  providerEntityId: string;
  materialRef: Ref;
  providerAddedAt?: string;
};

export type RecordSourceLibraryImportItemResult = {
  sourceLibraryItem: SourceLibraryItemRecord;
  outcome: SourceLibraryImportItemOutcomeRecord;
  batch: SourceLibraryImportBatchRecord;
};

export type RecordSourceLibraryImportItemFailureInput = {
  batchId: string;
  sourceRefKey?: string;
  providerId: string;
  providerEntityId: string;
  errorCode: string;
  errorMessage: string;
};

export type RecordSourceLibraryImportItemFailureResult = {
  outcome: SourceLibraryImportItemOutcomeRecord;
  batch: SourceLibraryImportBatchRecord;
};

export type FailSourceLibraryImportBatchInput = {
  batchId: string;
  errorCode: string;
  errorMessage: string;
};

export type CompleteSourceLibraryImportBatchInput = {
  batch: SourceLibraryImportBatchRecord;
  completionReason: SourceLibraryImportCompletionReason;
};

export type AdvanceSourceLibraryImportBatchCursorInput = {
  batch: SourceLibraryImportBatchRecord;
  cursor: string;
};

export type SourceLibraryCommands = {
  createImportBatch(input: CreateSourceLibraryImportBatchInput): SourceLibraryImportBatchRecord;
  resolveImportBatchLibraryScope(
    input: ResolveSourceLibraryImportBatchScopeInput,
  ): SourceLibraryImportBatchRecord;
  recordImportItem(
    input: RecordSourceLibraryImportItemInput,
  ): RecordSourceLibraryImportItemResult;
  recordImportItemFailure(
    input: RecordSourceLibraryImportItemFailureInput,
  ): RecordSourceLibraryImportItemFailureResult;
  failImportBatch(
    input: FailSourceLibraryImportBatchInput,
  ): SourceLibraryImportBatchRecord | undefined;
  completeImportBatch(
    input: CompleteSourceLibraryImportBatchInput,
  ): SourceLibraryImportBatchRecord;
  advanceImportBatchCursor(
    input: AdvanceSourceLibraryImportBatchCursorInput,
  ): SourceLibraryImportBatchRecord;
};

export function createSourceLibraryCommands(
  input: CreateSourceLibraryCommandsInput,
): SourceLibraryCommands {
  const identityRead = createIdentityReadPort({ db: input.db });
  const repositories = createSourceLibraryRepositories({ db: input.db });

  return {
    createImportBatch(commandInput) {
      assertOwnerScope(commandInput.ownerScope);

      if (repositories.batches.get({ batchId: commandInput.batchId }) !== undefined) {
        throw new MusicDataPlatformError({
          code: "music_data.source_library_import_batch_id_collision",
          message: `Source library import batch '${commandInput.batchId}' already exists.`,
        });
      }

      return repositories.batches.insert({
        batchId: commandInput.batchId,
        ownerScope: commandInput.ownerScope,
        providerId: commandInput.providerId,
        ...(commandInput.providerAccountId === undefined ? {} : { providerAccountId: commandInput.providerAccountId }),
        libraryKind: commandInput.libraryKind,
        status: "running",
        ...(commandInput.maxNewItems === undefined ? {} : { maxNewItems: commandInput.maxNewItems }),
        processedCount: 0,
        importedCount: 0,
        alreadyPresentCount: 0,
        failedCount: 0,
        createdAt: input.now,
        updatedAt: input.now,
      });
    },
    resolveImportBatchLibraryScope(commandInput) {
      const libraryRef = createSourceLibraryRef({
        ownerScope: commandInput.batch.ownerScope,
        providerId: commandInput.batch.providerId,
        providerAccountId: commandInput.providerAccountId,
        libraryKind: commandInput.batch.libraryKind,
      });
      const existingLibrary = repositories.libraries.get({ libraryRef });

      repositories.libraries.upsert({
        libraryRef,
        ownerScope: commandInput.batch.ownerScope,
        providerId: commandInput.batch.providerId,
        providerAccountId: commandInput.providerAccountId,
        libraryKind: commandInput.batch.libraryKind,
        createdAt: existingLibrary?.createdAt ?? input.now,
        updatedAt: input.now,
      });

      return repositories.batches.upsert({
        ...commandInput.batch,
        providerAccountId: commandInput.providerAccountId,
        libraryRef,
        updatedAt: input.now,
      });
    },
    recordImportItem(commandInput) {
      const batchScope = requireBatchLibraryScope(commandInput.batch);
      const sourceRefKey = refKey(commandInput.sourceRef);
      const materialRefKey = refKey(commandInput.materialRef);
      const currentBinding = identityRead.findMaterialForSource({
        sourceRef: commandInput.sourceRef,
      });

      if (
        currentBinding === undefined ||
        refKey(currentBinding.materialRef) !== materialRefKey
      ) {
        throw new MusicDataPlatformError({
          code: "music_data.source_library_material_binding_mismatch",
          message: "Source library item write requires the provided material ref to match the current source-material binding.",
        });
      }

      const existingItem = repositories.items.get({
        libraryRef: batchScope.libraryRef,
        sourceRefKey,
      });
      const nextProviderAddedAt = commandInput.providerAddedAt ?? existingItem?.providerAddedAt;
      const shouldWriteItem = existingItem === undefined ||
        nextProviderAddedAt !== existingItem.providerAddedAt;
      const sourceLibraryItem = shouldWriteItem
        ? repositories.items.upsert({
          libraryRef: batchScope.libraryRef,
          sourceRefKey,
          addedAt: existingItem?.addedAt ?? input.now,
          ...(nextProviderAddedAt === undefined ? {} : { providerAddedAt: nextProviderAddedAt }),
          firstImportedAt: existingItem?.firstImportedAt ?? input.now,
        })
        : existingItem;
      const outcomeKind: SourceLibraryImportItemOutcome =
        existingItem === undefined ? "imported" : "already_present";
      const outcome = repositories.itemOutcomes.insert({
        batchId: commandInput.batch.batchId,
        sequence: commandInput.batch.processedCount + 1,
        outcome: outcomeKind,
        sourceRefKey,
        providerId: commandInput.providerId,
        providerEntityId: commandInput.providerEntityId,
        materialRefKey,
        createdAt: input.now,
      });
      const batch = repositories.batches.upsert(incrementBatchCounts(
        commandInput.batch,
        outcomeKind,
        input.now,
      ));

      if (shouldWriteItem) {
        input.projectionInvalidationCommands.markProjectionInvalidated({
          writes: [{
            writeKind: "source_library_item_written",
            ownerScope: commandInput.batch.ownerScope,
            sourceRef: commandInput.sourceRef,
          }],
        });
      }

      if (sourceLibraryItem === undefined) {
        throw new Error("source library item write did not return a stored record");
      }

      return {
        sourceLibraryItem,
        outcome,
        batch,
      };
    },
    recordImportItemFailure(commandInput) {
      const batch = requireImportBatch(
        repositories.batches.get({ batchId: commandInput.batchId }),
        commandInput.batchId,
      );
      const outcome = repositories.itemOutcomes.insert({
        batchId: commandInput.batchId,
        sequence: batch.processedCount + 1,
        outcome: "failed",
        ...(commandInput.sourceRefKey === undefined ? {} : { sourceRefKey: commandInput.sourceRefKey }),
        providerId: commandInput.providerId,
        providerEntityId: commandInput.providerEntityId,
        errorCode: commandInput.errorCode,
        errorMessage: commandInput.errorMessage,
        createdAt: input.now,
      });
      const updatedBatch = repositories.batches.upsert(incrementBatchCounts(
        batch,
        "failed",
        input.now,
      ));

      return {
        outcome,
        batch: updatedBatch,
      };
    },
    failImportBatch(commandInput) {
      const batch = repositories.batches.get({ batchId: commandInput.batchId });

      if (batch === undefined) {
        return undefined;
      }

      return repositories.batches.upsert({
        ...withoutCursor(batch),
        status: "failed",
        failureCode: commandInput.errorCode,
        failureMessage: commandInput.errorMessage,
        updatedAt: input.now,
      });
    },
    completeImportBatch(commandInput) {
      const completedBatch = repositories.batches.upsert({
        ...withoutCursor(commandInput.batch),
        status: "completed",
        completionReason: commandInput.completionReason,
        updatedAt: input.now,
      });

      if (
        commandInput.completionReason !== "provider_exhausted" ||
        completedBatch.failedCount > 0 ||
        completedBatch.libraryRef === undefined
      ) {
        return completedBatch;
      }

      const reconciliation = repositories.items.deleteItemsNotObservedInBatch({
        libraryRef: completedBatch.libraryRef,
        batchId: completedBatch.batchId,
      });

      if (reconciliation.deletedCount > 0) {
        input.projectionInvalidationCommands.markProjectionInvalidated({
          writes: [{
            writeKind: "source_library_scope_written",
            ownerScope: completedBatch.ownerScope,
            libraryRef: completedBatch.libraryRef,
          }],
        });
      }

      return completedBatch;
    },
    advanceImportBatchCursor(commandInput) {
      return repositories.batches.upsert({
        ...commandInput.batch,
        cursor: commandInput.cursor,
        updatedAt: input.now,
      });
    },
  };
}

function incrementBatchCounts(
  batch: SourceLibraryImportBatchRecord,
  outcome: SourceLibraryImportItemOutcome,
  timestamp: string,
): SourceLibraryImportBatchRecord {
  return {
    ...batch,
    processedCount: batch.processedCount + 1,
    importedCount: batch.importedCount + (outcome === "imported" ? 1 : 0),
    alreadyPresentCount: batch.alreadyPresentCount + (outcome === "already_present" ? 1 : 0),
    failedCount: batch.failedCount + (outcome === "failed" ? 1 : 0),
    updatedAt: timestamp,
  };
}

function withoutCursor(
  batch: SourceLibraryImportBatchRecord,
): Omit<SourceLibraryImportBatchRecord, "cursor"> {
  const { cursor: _cursor, ...rest } = batch;

  return rest;
}

function requireBatchLibraryScope(
  batch: SourceLibraryImportBatchRecord,
): {
  libraryRef: Ref;
} {
  if (batch.providerAccountId === undefined || batch.libraryRef === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.source_library_import_batch_scope_missing",
      message: "Source library import batch is missing resolved library scope.",
    });
  }

  return {
    libraryRef: batch.libraryRef,
  };
}

function requireImportBatch(
  batch: SourceLibraryImportBatchRecord | undefined,
  batchId: string,
): SourceLibraryImportBatchRecord {
  if (batch === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.source_library_import_batch_not_found",
      message: `Source library import batch '${batchId}' was not found.`,
    });
  }

  return batch;
}
