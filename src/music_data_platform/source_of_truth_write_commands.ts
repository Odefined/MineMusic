import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import {
  createIdentityWriteCommands,
  type IdentityWriteCommands,
} from "./identity_write_model.js";
import {
  createOwnerMaterialRelationCommands,
  type OwnerMaterialRelationCommands,
} from "./owner_material_relation_commands.js";
import { createProjectionMaintenanceCommands } from "./projection_maintenance_commands.js";
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
  const projectionInvalidationCommands = createProjectionMaintenanceCommands({
    db: input.db,
    now: input.now,
  });

  return {
    identity: createIdentityWriteCommands({
      db: input.db,
      now: input.now,
      projectionInvalidationCommands,
    }),
    sourceLibrary: createSourceLibraryCommands({
      db: input.db,
      now: input.now,
      projectionInvalidationCommands,
    }),
    ownerRelations: createOwnerMaterialRelationCommands({
      db: input.db,
      now: input.now,
      projectionInvalidationCommands,
    }),
  };
}
