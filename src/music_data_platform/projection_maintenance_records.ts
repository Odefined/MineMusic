import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import {
  assertProjectionMaintenanceKind,
  type ProjectionMaintenanceKind,
  type ProjectionMaintenanceTargetStatus,
} from "./projection_maintenance_commands.js";

export type CreateProjectionMaintenanceRecordsInput = {
  db: MusicDatabaseContext;
};

export type GetProjectionTargetInput = {
  projectionKind: ProjectionMaintenanceKind;
  targetKey: string;
};

export type ListPendingProjectionTargetsInput = {
  limit?: number;
};

export type ProjectionMaintenanceTargetRecord = {
  projectionKind: ProjectionMaintenanceKind;
  targetKey: string;
  targetPayloadJson: string;
  status: ProjectionMaintenanceTargetStatus;
  dirtyGeneration: number;
  failureCode?: string;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectionMaintenanceRecords = {
  getProjectionTarget(
    input: GetProjectionTargetInput,
  ): ProjectionMaintenanceTargetRecord | undefined;
  listPendingProjectionTargets(
    input?: ListPendingProjectionTargetsInput,
  ): readonly ProjectionMaintenanceTargetRecord[];
};

type ProjectionMaintenanceTargetRow = {
  projection_kind: string;
  target_key: string;
  target_payload_json: string;
  status: string;
  dirty_generation: number;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
};

export function createProjectionMaintenanceRecords(
  input: CreateProjectionMaintenanceRecordsInput,
): ProjectionMaintenanceRecords {
  const { db } = input;

  return {
    getProjectionTarget(readInput) {
      assertProjectionMaintenanceKind(readInput.projectionKind);
      assertProjectionMaintenanceTargetKey(readInput.targetKey);

      const row = db.get<ProjectionMaintenanceTargetRow>(
        `
          SELECT *
          FROM projection_maintenance_targets
          WHERE projection_kind = ?
            AND target_key = ?
        `,
        [readInput.projectionKind, readInput.targetKey],
      );

      return row === undefined ? undefined : projectionMaintenanceTargetFromRow(row);
    },
    listPendingProjectionTargets(readInput) {
      const limit = validatedPendingLimit(readInput?.limit);
      const rows = limit === undefined
        ? db.all<ProjectionMaintenanceTargetRow>(
          `
            SELECT *
            FROM projection_maintenance_targets
            WHERE status IN ('dirty', 'failed')
            ORDER BY updated_at ASC, projection_kind ASC, target_key ASC
          `,
        )
        : db.all<ProjectionMaintenanceTargetRow>(
          `
            SELECT *
            FROM projection_maintenance_targets
            WHERE status IN ('dirty', 'failed')
            ORDER BY updated_at ASC, projection_kind ASC, target_key ASC
            LIMIT ?
          `,
          [limit],
        );

      return rows.map(projectionMaintenanceTargetFromRow);
    },
  };
}

function projectionMaintenanceTargetFromRow(
  row: ProjectionMaintenanceTargetRow,
): ProjectionMaintenanceTargetRecord {
  assertProjectionMaintenanceKind(row.projection_kind);
  assertProjectionMaintenanceTargetKey(row.target_key);

  if (row.status !== "dirty" && row.status !== "failed") {
    throw invalidProjectionMaintenanceRecord(
      `Projection maintenance target status '${row.status}' is invalid.`,
    );
  }

  if (!Number.isInteger(row.dirty_generation) || row.dirty_generation <= 0) {
    throw invalidProjectionMaintenanceRecord(
      "Projection maintenance dirty generation must be a positive integer.",
    );
  }

  return {
    projectionKind: row.projection_kind,
    targetKey: row.target_key,
    targetPayloadJson: row.target_payload_json,
    status: row.status,
    dirtyGeneration: row.dirty_generation,
    ...(row.failure_code === null ? {} : { failureCode: row.failure_code }),
    ...(row.failure_message === null ? {} : { failureMessage: row.failure_message }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validatedPendingLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) {
    return undefined;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw invalidProjectionMaintenanceRecord(
      "Projection maintenance pending-target limit must be a positive integer.",
    );
  }

  return limit;
}

function assertProjectionMaintenanceTargetKey(targetKey: string): void {
  if (!targetKey.startsWith("pmt_") || targetKey.length <= 4) {
    throw invalidProjectionMaintenanceRecord(
      "Projection maintenance target key must start with 'pmt_'.",
    );
  }
}

function invalidProjectionMaintenanceRecord(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.projection_maintenance_target_invalid",
    message,
  });
}
