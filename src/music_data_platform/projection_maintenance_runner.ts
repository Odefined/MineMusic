import type { MusicDatabase } from "../storage/database.js";
import { isMusicDataPlatformError } from "./errors.js";
import {
  createMaterialTextProjectionCommands,
} from "./material_text_projection_commands.js";
import {
  createOwnerCatalogProjectionCommands,
} from "./owner_catalog_projection.js";
import {
  createProjectionMaintenanceCommands,
  parseProjectionMaintenanceTargetPayload,
  type ProjectionMaintenanceKind,
} from "./projection_maintenance_commands.js";
import {
  createProjectionMaintenanceRecords,
  type ProjectionMaintenanceTargetRecord,
} from "./projection_maintenance_records.js";
import {
  createSearchMetadataProjectionCommands,
} from "./search_metadata_projection_commands.js";

export type CreateProjectionMaintenanceRunnerInput = {
  database: MusicDatabase;
  now: string;
};

export type ProjectionMaintenanceRunSummary = {
  selectedCount: number;
  rebuiltCount: number;
  failedCount: number;
  skippedStaleGenerationCount: number;
};

export type ProjectionMaintenanceRunner = {
  runProjectionMaintenance(input?: {
    limit?: number;
  }): Promise<ProjectionMaintenanceRunSummary>;
};

export function createProjectionMaintenanceRunner(
  input: CreateProjectionMaintenanceRunnerInput,
): ProjectionMaintenanceRunner {
  return {
    async runProjectionMaintenance(runInput) {
      const selectedTargets = await createProjectionMaintenanceRecords({
        db: input.database.context(),
      }).listPendingProjectionTargets(runInput);
      const summary: ProjectionMaintenanceRunSummary = {
        selectedCount: selectedTargets.length,
        rebuiltCount: 0,
        failedCount: 0,
        skippedStaleGenerationCount: 0,
      };

      for (const target of selectedTargets) {
        try {
          const cleaned = await input.database.transaction(async (db) => {
            await dispatchProjectionTarget({
              target,
              ownerCatalogProjectionCommands: createOwnerCatalogProjectionCommands({
                db,
                now: input.now,
              }),
              materialTextProjectionCommands: createMaterialTextProjectionCommands({
                db,
                now: input.now,
              }),
              searchMetadataProjectionCommands: createSearchMetadataProjectionCommands({
                db,
                now: input.now,
              }),
            });

            return (await createProjectionMaintenanceCommands({
              db,
              now: input.now,
            }).markProjectionClean({
              projectionKind: target.projectionKind,
              targetKey: target.targetKey,
              expectedDirtyGeneration: target.dirtyGeneration,
            })).cleaned;
          });

          if (cleaned) {
            summary.rebuiltCount += 1;
          } else {
            summary.skippedStaleGenerationCount += 1;
          }
        } catch (error) {
          const failure = compactProjectionMaintenanceFailure(error, target.projectionKind);
          const failed = await input.database.transaction(async (db) =>
            (await createProjectionMaintenanceCommands({
              db,
              now: input.now,
            }).markProjectionFailed({
              projectionKind: target.projectionKind,
              targetKey: target.targetKey,
              expectedDirtyGeneration: target.dirtyGeneration,
              failureCode: failure.failureCode,
              failureMessage: failure.failureMessage,
            })).failed);

          if (failed) {
            summary.failedCount += 1;
          } else {
            summary.skippedStaleGenerationCount += 1;
          }
        }
      }

      return summary;
    },
  };
}

async function dispatchProjectionTarget(input: {
  target: ProjectionMaintenanceTargetRecord;
  ownerCatalogProjectionCommands: ReturnType<typeof createOwnerCatalogProjectionCommands>;
  materialTextProjectionCommands: ReturnType<typeof createMaterialTextProjectionCommands>;
  searchMetadataProjectionCommands: ReturnType<typeof createSearchMetadataProjectionCommands>;
}): Promise<void> {
  const payload = parseProjectionMaintenanceTargetPayload({
    projectionKind: input.target.projectionKind,
    targetPayloadJson: input.target.targetPayloadJson,
  });

  switch (payload.projectionKind) {
    case "owner_catalog_source_library":
      await input.ownerCatalogProjectionCommands.rebuildSourceLibraryEntriesForLibrary({
        ownerScope: payload.ownerScope,
        libraryRef: payload.libraryRef,
      });
      return;
    case "owner_catalog_source_library_material":
      await input.ownerCatalogProjectionCommands.rebuildSourceLibraryEntriesForMaterial({
        ownerScope: payload.ownerScope,
        materialRef: payload.materialRef,
      });
      return;
    case "owner_catalog_relation_material":
      await input.ownerCatalogProjectionCommands.rebuildOwnerRelationEntries({
        ownerScope: payload.ownerScope,
        materialRef: payload.materialRef,
      });
      return;
    case "material_text":
      await input.materialTextProjectionCommands.rebuildMaterialTextDocument({
        materialRef: payload.materialRef,
      });
      await input.searchMetadataProjectionCommands.rebuildSearchMetadataDocument({
        materialRef: payload.materialRef,
      });
      return;
  }
}

function compactProjectionMaintenanceFailure(
  error: unknown,
  projectionKind: ProjectionMaintenanceKind,
): {
  failureCode: string;
  failureMessage: string;
} {
  if (isMusicDataPlatformError(error)) {
    return {
      failureCode: error.code,
      failureMessage: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      failureCode: "music_data.projection_maintenance_target_invalid",
      failureMessage: `${projectionKind} rebuild failed: ${error.message}`,
    };
  }

  return {
    failureCode: "music_data.projection_maintenance_target_invalid",
    failureMessage: `${projectionKind} rebuild failed with a non-Error exception.`,
  };
}
