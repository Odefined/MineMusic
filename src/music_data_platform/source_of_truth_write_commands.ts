import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import {
  createIdentityWriteCommands,
  type IdentityWriteCommands,
} from "./identity_write_model.js";
import {
  createOwnerMaterialRelationCommands,
  type OwnerMaterialRelationCommands,
} from "./owner_material_relation_commands.js";
import {
  createProjectionMaintenanceCommands,
  type ProjectionInvalidationCommands,
} from "./projection_maintenance_commands.js";
import { DEFAULT_OWNER_SCOPE } from "./owner_scope.js";
import { createSourceLibraryReadPort } from "./source_library_read_model.js";
import {
  createSourceLibraryCommands,
  type SourceLibraryCommands,
} from "./source_library_commands.js";
import type { SourceLibraryImportBatchRecord } from "./source_library_records.js";

export type CreateMusicDataPlatformSourceOfTruthWriteCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
};

export type MusicDataPlatformSourceOfTruthWriteCommands = {
  identity: IdentityWriteCommands;
  sourceLibrary: SourceLibraryCommands;
  ownerRelations: OwnerMaterialRelationCommands;
};

export function createMusicDataPlatformSourceOfTruthWriteCommands(
  input: CreateMusicDataPlatformSourceOfTruthWriteCommandsInput,
): MusicDataPlatformSourceOfTruthWriteCommands {
  const projectionMaintenanceCommands = createProjectionMaintenanceCommands({
    db: input.db,
    now: input.now,
  });
  const projectionInvalidationCommands: ProjectionInvalidationCommands = {
    async markProjectionInvalidated(invalidationInput) {
      return projectionMaintenanceCommands.markProjectionInvalidated(
        invalidationInput,
      );
    },
  };
  const sourceLibraryReads = createSourceLibraryReadPort({ db: input.db });

  const identity = createIdentityWriteCommands({
    db: input.db,
    now: input.now,
    projectionInvalidationCommands,
  });
  const sourceLibrary = createSourceLibraryCommands({
    db: input.db,
    now: input.now,
    projectionInvalidationCommands,
  });
  const ownerRelations = createOwnerMaterialRelationCommands({
    db: input.db,
    now: input.now,
    projectionInvalidationCommands,
  });

  return {
    identity,
    sourceLibrary: {
      createImportBatch(commandInput) {
        assertWorkflowFacingOwnerScope(commandInput.ownerScope);
        return sourceLibrary.createImportBatch(commandInput);
      },
      async resolveImportBatchLibraryScope(commandInput) {
        return sourceLibrary.resolveImportBatchLibraryScope({
          ...commandInput,
          batch: await requireWorkflowFacingBatch(
            sourceLibraryReads,
            commandInput.batch.batchId,
          ),
        });
      },
      async recordImportItem(commandInput) {
        return sourceLibrary.recordImportItem({
          ...commandInput,
          batch: await requireWorkflowFacingBatch(
            sourceLibraryReads,
            commandInput.batch.batchId,
          ),
        });
      },
      async recordImportItemFailure(commandInput) {
        await assertWorkflowFacingBatchOwnerScope(
          sourceLibraryReads,
          commandInput.batchId,
        );
        return sourceLibrary.recordImportItemFailure(commandInput);
      },
      async failImportBatch(commandInput) {
        await assertWorkflowFacingBatchOwnerScope(
          sourceLibraryReads,
          commandInput.batchId,
        );
        return sourceLibrary.failImportBatch(commandInput);
      },
      async completeImportBatch(commandInput) {
        return sourceLibrary.completeImportBatch({
          ...commandInput,
          batch: await requireWorkflowFacingBatch(
            sourceLibraryReads,
            commandInput.batch.batchId,
          ),
        });
      },
      async advanceImportBatchCursor(commandInput) {
        return sourceLibrary.advanceImportBatchCursor({
          ...commandInput,
          batch: await requireWorkflowFacingBatch(
            sourceLibraryReads,
            commandInput.batch.batchId,
          ),
        });
      },
    },
    ownerRelations: {
      recordOwnerMaterialRelation(commandInput) {
        assertWorkflowFacingOwnerScope(commandInput.ownerScope);
        return ownerRelations.recordOwnerMaterialRelation(commandInput);
      },
      removeOwnerMaterialRelation(commandInput) {
        assertWorkflowFacingOwnerScope(commandInput.ownerScope);
        return ownerRelations.removeOwnerMaterialRelation(commandInput);
      },
    },
  };
}

function assertWorkflowFacingOwnerScope(ownerScope: string): void {
  if (ownerScope !== DEFAULT_OWNER_SCOPE) {
    throw new MusicDataPlatformError({
      code: "music_data.owner_scope_unsupported",
      message: `Workflow-facing source-of-truth writes currently support only owner scope '${DEFAULT_OWNER_SCOPE}'.`,
    });
  }
}

async function requireWorkflowFacingBatch(
  sourceLibraryReads: ReturnType<typeof createSourceLibraryReadPort>,
  batchId: string,
): Promise<SourceLibraryImportBatchRecord> {
  const batch = await sourceLibraryReads.getImportBatch({ batchId });

  if (batch === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.source_library_import_batch_not_found",
      message: `Source library import batch '${batchId}' was not found.`,
    });
  }

  assertWorkflowFacingOwnerScope(batch.ownerScope);

  return batch;
}

async function assertWorkflowFacingBatchOwnerScope(
  sourceLibraryReads: ReturnType<typeof createSourceLibraryReadPort>,
  batchId: string,
): Promise<void> {
  const batch = await sourceLibraryReads.getImportBatch({ batchId });

  if (batch !== undefined) {
    assertWorkflowFacingOwnerScope(batch.ownerScope);
  }
}
