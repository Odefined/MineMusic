import type { ProjectionMaintenanceInvalidatedTarget } from "./projection_maintenance_commands.js";

/**
 * Narrow port for dispatching projection-maintenance rebuild jobs after a
 * source-of-truth write transaction commits.
 *
 * Domain code depends only on this port, never on the background-work backend
 * (ADR-0027: domain areas must depend on the MineMusic Background Work port,
 * not on pg-boss APIs or tables). The adapter that binds this port to a
 * `BackgroundWorkBackend` lives in the server/runtime assembly layer.
 */
export type ProjectionMaintenanceDispatcher = {
  submitDirty(
    targets: readonly ProjectionMaintenanceInvalidatedTarget[],
  ): Promise<void>;
};
