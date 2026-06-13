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
    markProjectionInvalidated(invalidationInput) {
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
      resolveImportBatchLibraryScope(commandInput) {
        assertWorkflowFacingOwnerScope(commandInput.batch.ownerScope);
        return sourceLibrary.resolveImportBatchLibraryScope(commandInput);
      },
      recordImportItem(commandInput) {
        assertWorkflowFacingOwnerScope(commandInput.batch.ownerScope);
        return sourceLibrary.recordImportItem(commandInput);
      },
      recordImportItemFailure(commandInput) {
        assertWorkflowFacingBatchOwnerScope(
          sourceLibraryReads,
          commandInput.batchId,
        );
        return sourceLibrary.recordImportItemFailure(commandInput);
      },
      failImportBatch(commandInput) {
        assertWorkflowFacingBatchOwnerScope(
          sourceLibraryReads,
          commandInput.batchId,
        );
        return sourceLibrary.failImportBatch(commandInput);
      },
      completeImportBatch(commandInput) {
        assertWorkflowFacingOwnerScope(commandInput.batch.ownerScope);
        return sourceLibrary.completeImportBatch(commandInput);
      },
      advanceImportBatchCursor(commandInput) {
        assertWorkflowFacingOwnerScope(commandInput.batch.ownerScope);
        return sourceLibrary.advanceImportBatchCursor(commandInput);
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

function assertWorkflowFacingBatchOwnerScope(
  sourceLibraryReads: ReturnType<typeof createSourceLibraryReadPort>,
  batchId: string,
): void {
  const batch = sourceLibraryReads.getImportBatch({ batchId });

  if (batch !== undefined) {
    assertWorkflowFacingOwnerScope(batch.ownerScope);
  }
}
