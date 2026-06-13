import {
  refKey,
  type Ref,
} from "../contracts/index.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { createDeterministicRefDigest } from "./ref_digest.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import { assertOwnerScope } from "./owner_scope.js";
import { assertSourceLibraryRef } from "./source_library_ref.js";

export type ProjectionMaintenanceKind =
  | "owner_catalog_source_library"
  | "owner_catalog_source_library_material"
  | "owner_catalog_relation_material"
  | "material_text";

export type ProjectionMaintenanceTargetStatus =
  | "dirty"
  | "failed";

export type CreateProjectionMaintenanceCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
};

export type ProjectionMaintenanceTargetInput =
  | {
      projectionKind: "owner_catalog_source_library";
      ownerScope: string;
      libraryRef: Ref;
    }
  | {
      projectionKind: "owner_catalog_source_library_material";
      ownerScope: string;
      materialRef: Ref;
    }
  | {
      projectionKind: "owner_catalog_relation_material";
      ownerScope: string;
      materialRef: Ref;
    }
  | {
      projectionKind: "material_text";
      materialRef: Ref;
    };

export type ProjectionMaintenanceTargetDirtyResult = {
  targetKey: string;
  dirtyGeneration: number;
};

export type ProjectionMaintenanceCleanInput = {
  projectionKind: ProjectionMaintenanceKind;
  targetKey: string;
  expectedDirtyGeneration: number;
};

export type ProjectionMaintenanceCleanResult = {
  cleaned: boolean;
};

export type ProjectionMaintenanceFailedInput = {
  projectionKind: ProjectionMaintenanceKind;
  targetKey: string;
  expectedDirtyGeneration: number;
  failureCode: string;
  failureMessage: string;
};

export type ProjectionMaintenanceFailedResult = {
  failed: boolean;
};

export type ProjectionMaintenanceCommands = {
  markProjectionTargetDirty(
    input: ProjectionMaintenanceTargetInput,
  ): ProjectionMaintenanceTargetDirtyResult;
  markProjectionClean(
    input: ProjectionMaintenanceCleanInput,
  ): ProjectionMaintenanceCleanResult;
  markProjectionFailed(
    input: ProjectionMaintenanceFailedInput,
  ): ProjectionMaintenanceFailedResult;
};

type ProjectionMaintenanceTargetRow = {
  dirty_generation: number;
};

type RefPayload = {
  namespace: string;
  kind: string;
  id: string;
};

type OwnerCatalogSourceLibraryPayload = {
  ownerScope: string;
  libraryRef: RefPayload;
};

type OwnerCatalogMaterialPayload = {
  ownerScope: string;
  materialRef: RefPayload;
};

type MaterialTextPayload = {
  materialRef: RefPayload;
};

export function createProjectionMaintenanceCommands(
  input: CreateProjectionMaintenanceCommandsInput,
): ProjectionMaintenanceCommands {
  return {
    markProjectionTargetDirty(commandInput) {
      const normalizedTarget = normalizeProjectionMaintenanceTarget(commandInput);

      input.db.run(
        `
          INSERT INTO projection_maintenance_targets (
            projection_kind,
            target_key,
            target_payload_json,
            status,
            dirty_generation,
            failure_code,
            failure_message,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, 'dirty', 1, NULL, NULL, ?, ?)
          ON CONFLICT(projection_kind, target_key) DO UPDATE SET
            target_payload_json = excluded.target_payload_json,
            status = 'dirty',
            dirty_generation = projection_maintenance_targets.dirty_generation + 1,
            failure_code = NULL,
            failure_message = NULL,
            updated_at = excluded.updated_at
        `,
        [
          normalizedTarget.projectionKind,
          normalizedTarget.targetKey,
          normalizedTarget.targetPayloadJson,
          input.now,
          input.now,
        ],
      );

      const row = input.db.get<ProjectionMaintenanceTargetRow>(
        `
          SELECT dirty_generation
          FROM projection_maintenance_targets
          WHERE projection_kind = ?
            AND target_key = ?
        `,
        [normalizedTarget.projectionKind, normalizedTarget.targetKey],
      );

      if (row === undefined) {
        throw invalidProjectionMaintenanceTarget(
          "Projection maintenance dirty target was missing after upsert.",
        );
      }

      return {
        targetKey: normalizedTarget.targetKey,
        dirtyGeneration: row.dirty_generation,
      };
    },
    markProjectionClean(commandInput) {
      assertProjectionMaintenanceKind(commandInput.projectionKind);
      assertProjectionMaintenanceTargetKey(commandInput.targetKey);
      const expectedDirtyGeneration = assertExpectedDirtyGeneration(
        commandInput.expectedDirtyGeneration,
      );
      const row = input.db.get<ProjectionMaintenanceTargetRow>(
        `
          SELECT dirty_generation
          FROM projection_maintenance_targets
          WHERE projection_kind = ?
            AND target_key = ?
        `,
        [commandInput.projectionKind, commandInput.targetKey],
      );

      if (row === undefined || row.dirty_generation !== expectedDirtyGeneration) {
        return { cleaned: false };
      }

      input.db.run(
        `
          DELETE FROM projection_maintenance_targets
          WHERE projection_kind = ?
            AND target_key = ?
            AND dirty_generation = ?
        `,
        [
          commandInput.projectionKind,
          commandInput.targetKey,
          expectedDirtyGeneration,
        ],
      );

      return { cleaned: true };
    },
    markProjectionFailed(commandInput) {
      assertProjectionMaintenanceKind(commandInput.projectionKind);
      assertProjectionMaintenanceTargetKey(commandInput.targetKey);
      const expectedDirtyGeneration = assertExpectedDirtyGeneration(
        commandInput.expectedDirtyGeneration,
      );
      const failureCode = validatedFailureField(
        commandInput.failureCode,
        "Projection maintenance failure code cannot be empty.",
      );
      const failureMessage = validatedFailureField(
        commandInput.failureMessage,
        "Projection maintenance failure message cannot be empty.",
      );
      const row = input.db.get<ProjectionMaintenanceTargetRow>(
        `
          SELECT dirty_generation
          FROM projection_maintenance_targets
          WHERE projection_kind = ?
            AND target_key = ?
        `,
        [commandInput.projectionKind, commandInput.targetKey],
      );

      if (row === undefined || row.dirty_generation !== expectedDirtyGeneration) {
        return { failed: false };
      }

      input.db.run(
        `
          UPDATE projection_maintenance_targets
          SET status = 'failed',
              failure_code = ?,
              failure_message = ?,
              updated_at = ?
          WHERE projection_kind = ?
            AND target_key = ?
            AND dirty_generation = ?
        `,
        [
          failureCode,
          failureMessage,
          input.now,
          commandInput.projectionKind,
          commandInput.targetKey,
          expectedDirtyGeneration,
        ],
      );

      return { failed: true };
    },
  };
}

export function assertProjectionMaintenanceKind(
  value: string,
): asserts value is ProjectionMaintenanceKind {
  if (
    value !== "owner_catalog_source_library" &&
    value !== "owner_catalog_source_library_material" &&
    value !== "owner_catalog_relation_material" &&
    value !== "material_text"
  ) {
    throw invalidProjectionMaintenanceKind(
      `Projection maintenance kind '${value}' is not supported.`,
    );
  }
}

export function parseProjectionMaintenanceTargetPayload(input: {
  projectionKind: ProjectionMaintenanceKind;
  targetPayloadJson: string;
}): ProjectionMaintenanceTargetInput {
  assertProjectionMaintenanceKind(input.projectionKind);

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.targetPayloadJson);
  } catch (cause) {
    throw invalidProjectionMaintenanceTarget(
      "Projection maintenance target payload is not valid JSON.",
      cause,
    );
  }

  switch (input.projectionKind) {
    case "owner_catalog_source_library": {
      const payload = requireObjectPayload(parsed);
      assertExactObjectKeys(payload, ["ownerScope", "libraryRef"]);
      const ownerScope = requireStringField(payload.ownerScope, "ownerScope");
      assertOwnerScope(ownerScope);
      const libraryRef = refFromPayload(payload.libraryRef, "libraryRef");
      assertSourceLibraryRef(libraryRef);
      return {
        projectionKind: input.projectionKind,
        ownerScope,
        libraryRef,
      };
    }
    case "owner_catalog_source_library_material":
    case "owner_catalog_relation_material": {
      const payload = requireObjectPayload(parsed);
      assertExactObjectKeys(payload, ["ownerScope", "materialRef"]);
      const ownerScope = requireStringField(payload.ownerScope, "ownerScope");
      assertOwnerScope(ownerScope);
      const materialRef = refFromPayload(payload.materialRef, "materialRef");
      assertMaterialRef(materialRef);
      return {
        projectionKind: input.projectionKind,
        ownerScope,
        materialRef,
      };
    }
    case "material_text": {
      const payload = requireObjectPayload(parsed);
      assertExactObjectKeys(payload, ["materialRef"]);
      const materialRef = refFromPayload(payload.materialRef, "materialRef");
      assertMaterialRef(materialRef);
      return {
        projectionKind: input.projectionKind,
        materialRef,
      };
    }
  }
}

type NormalizedProjectionMaintenanceTarget = {
  projectionKind: ProjectionMaintenanceKind;
  targetKey: string;
  targetPayloadJson: string;
};

function normalizeProjectionMaintenanceTarget(
  input: ProjectionMaintenanceTargetInput,
): NormalizedProjectionMaintenanceTarget {
  const projectionKind = input.projectionKind;
  const targetPayloadJson = buildNormalizedTargetPayloadJson(input);
  return {
    projectionKind,
    targetKey: `pmt_${createDeterministicRefDigest([projectionKind, targetPayloadJson])}`,
    targetPayloadJson,
  };
}

function buildNormalizedTargetPayloadJson(input: ProjectionMaintenanceTargetInput): string {
  switch (input.projectionKind) {
    case "owner_catalog_source_library": {
      assertOwnerScope(input.ownerScope);
      assertSourceLibraryRef(input.libraryRef);
      const payload: OwnerCatalogSourceLibraryPayload = {
        ownerScope: input.ownerScope,
        libraryRef: normalizedRefPayload(input.libraryRef),
      };
      return JSON.stringify(payload);
    }
    case "owner_catalog_source_library_material":
    case "owner_catalog_relation_material": {
      assertOwnerScope(input.ownerScope);
      assertMaterialRef(input.materialRef);
      const payload: OwnerCatalogMaterialPayload = {
        ownerScope: input.ownerScope,
        materialRef: normalizedRefPayload(input.materialRef),
      };
      return JSON.stringify(payload);
    }
    case "material_text": {
      assertMaterialRef(input.materialRef);
      const payload: MaterialTextPayload = {
        materialRef: normalizedRefPayload(input.materialRef),
      };
      return JSON.stringify(payload);
    }
  }
}

function normalizedRefPayload(ref: Ref): RefPayload {
  refKey(ref);
  return {
    namespace: ref.namespace,
    kind: ref.kind,
    id: ref.id,
  };
}

function assertProjectionMaintenanceTargetKey(targetKey: string): void {
  if (!targetKey.startsWith("pmt_") || targetKey.length <= 4) {
    throw invalidProjectionMaintenanceTarget(
      "Projection maintenance target key must start with 'pmt_'.",
    );
  }
}

function assertExpectedDirtyGeneration(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new MusicDataPlatformError({
      code: "music_data.projection_maintenance_generation_mismatch",
      message: "Projection maintenance expected dirty generation must be a positive integer.",
    });
  }

  return value;
}

function validatedFailureField(value: string, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidProjectionMaintenanceTarget(message);
  }

  return value;
}

function requireObjectPayload(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidProjectionMaintenanceTarget(
      "Projection maintenance target payload must be a JSON object.",
    );
  }

  return value as Record<string, unknown>;
}

function assertExactObjectKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  const keys = Object.keys(value);

  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw invalidProjectionMaintenanceTarget(
      `Projection maintenance target payload must contain exactly: ${expectedKeys.join(", ")}.`,
    );
  }
}

function requireStringField(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw invalidProjectionMaintenanceTarget(
      `Projection maintenance target payload field '${fieldName}' must be a string.`,
    );
  }

  return value;
}

function refFromPayload(value: unknown, fieldName: string): Ref {
  const payload = requireObjectPayload(value);
  assertExactObjectKeys(payload, ["namespace", "kind", "id"]);

  const ref = {
    namespace: requireStringField(payload.namespace, `${fieldName}.namespace`),
    kind: requireStringField(payload.kind, `${fieldName}.kind`),
    id: requireStringField(payload.id, `${fieldName}.id`),
  } satisfies RefPayload;

  refKey(ref);
  return ref;
}

function invalidProjectionMaintenanceKind(
  message: string,
  cause?: unknown,
): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.projection_maintenance_kind_invalid",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function invalidProjectionMaintenanceTarget(
  message: string,
  cause?: unknown,
): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.projection_maintenance_target_invalid",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
