import type { BackgroundWorkHandler } from "../background_work/index.js";
import type { MusicDatabase } from "../storage/database.js";
import {
  createMaterialTextProjectionCommands,
} from "./material_text_projection_commands.js";
import {
  createOwnerCatalogProjectionCommands,
} from "./owner_catalog_projection.js";
import {
  assertProjectionMaintenanceKind,
  createProjectionMaintenanceCommands,
  type ProjectionMaintenanceKind,
} from "./projection_maintenance_commands.js";
import {
  createProjectionMaintenanceRecords,
} from "./projection_maintenance_records.js";
import {
  compactProjectionMaintenanceFailure,
  dispatchProjectionTarget,
} from "./projection_maintenance_runner.js";
import {
  createSearchMetadataProjectionCommands,
} from "./search_metadata_projection_commands.js";

export const PROJECTION_MAINTENANCE_JOB_TYPE = "music_data_platform.projection_maintenance";

export type ProjectionMaintenanceJobPayload = {
  projectionKind: ProjectionMaintenanceKind;
  targetKey: string;
  expectedDirtyGeneration: number;
};

export type CreateProjectionMaintenanceJobHandlerInput = {
  database: MusicDatabase;
  now: () => string;
  // Maximum retry count before a persistently failing target is marked failed.
  // Must equal the retryLimit the dispatcher submits with, so the final-attempt
  // test (retryCount >= retryLimit) lines up with pg-boss's own retry budget.
  // pg-boss v12 exposes retryCount to the work handler only via includeMetadata.
  retryLimit: number;
};

// Rebuilds a single dirty projection target. A real rebuild failure throws
// until the retry budget is exhausted; on the final attempt the target is
// marked failed and the job resolves. A generation mismatch (the target was
// re-dirtied after this job was submitted) is not a failure — a newer job
// carries the new generation and will rebuild it.
export function createProjectionMaintenanceJobHandler(
  input: CreateProjectionMaintenanceJobHandlerInput,
): BackgroundWorkHandler<Record<string, unknown>> {
  return async (job) => {
    if (job.jobType !== PROJECTION_MAINTENANCE_JOB_TYPE) {
      throw new Error(
        `Projection maintenance handler received unexpected job type '${job.jobType}'.`,
      );
    }

    const payload = parseProjectionMaintenanceJobPayload(job.payload);

    const target = await createProjectionMaintenanceRecords({
      db: input.database.context(),
    }).getProjectionTarget({
      projectionKind: payload.projectionKind,
      targetKey: payload.targetKey,
    });

    // Target already rebuilt (row deleted) or already terminal: nothing to do.
    if (target === undefined || target.status === "failed") {
      return;
    }

    // Stale job: the target was re-dirtied after this job was submitted, so the
    // generation it carries no longer matches the current row. A newer job was
    // submitted for the new generation and will rebuild it — this one no-ops
    // rather than doing a redundant rebuild or deleting a newer dirty cycle.
    if (target.dirtyGeneration !== payload.expectedDirtyGeneration) {
      return;
    }

    try {
      await input.database.transaction(async (db) => {
        const now = input.now();
        await dispatchProjectionTarget({
          target,
          ownerCatalogProjectionCommands: createOwnerCatalogProjectionCommands({ db, now }),
          materialTextProjectionCommands: createMaterialTextProjectionCommands({ db, now }),
          searchMetadataProjectionCommands: createSearchMetadataProjectionCommands({ db, now }),
        });

        await createProjectionMaintenanceCommands({ db, now }).markProjectionClean({
          projectionKind: payload.projectionKind,
          targetKey: payload.targetKey,
          expectedDirtyGeneration: payload.expectedDirtyGeneration,
        });
      });
    } catch (error) {
      const retryCount = job.retryCount ?? 0;
      if (retryCount < input.retryLimit) {
        throw error;
      }

      const failure = compactProjectionMaintenanceFailure(error, payload.projectionKind);
      await input.database.transaction(async (db) => {
        await createProjectionMaintenanceCommands({
          db,
          now: input.now(),
        }).markProjectionFailed({
          projectionKind: payload.projectionKind,
          targetKey: payload.targetKey,
          expectedDirtyGeneration: payload.expectedDirtyGeneration,
          failureCode: failure.failureCode,
          failureMessage: failure.failureMessage,
        });
      });
    }
  };
}

function parseProjectionMaintenanceJobPayload(
  payload: unknown,
): ProjectionMaintenanceJobPayload {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Projection maintenance job payload must be an object.");
  }

  const projectionKind = (payload as { projectionKind?: unknown }).projectionKind;
  if (typeof projectionKind !== "string") {
    throw new Error("Projection maintenance job payload projectionKind must be a string.");
  }
  assertProjectionMaintenanceKind(projectionKind);

  const targetKey = (payload as { targetKey?: unknown }).targetKey;
  if (typeof targetKey !== "string" || targetKey.length === 0) {
    throw new Error("Projection maintenance job payload targetKey must be a non-empty string.");
  }

  const expectedDirtyGeneration = (payload as { expectedDirtyGeneration?: unknown }).expectedDirtyGeneration;
  if (
    typeof expectedDirtyGeneration !== "number" ||
    !Number.isInteger(expectedDirtyGeneration) ||
    expectedDirtyGeneration <= 0
  ) {
    throw new Error(
      "Projection maintenance job payload expectedDirtyGeneration must be a positive integer.",
    );
  }

  return {
    projectionKind,
    targetKey,
    expectedDirtyGeneration,
  };
}
