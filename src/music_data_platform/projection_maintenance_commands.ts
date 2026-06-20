import { refKey, type Ref } from "../contracts/kernel.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { createDeterministicRefDigest } from "./ref_digest.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import {
  assertOwnerMaterialRelationKind,
  type OwnerMaterialRelationKind,
} from "./owner_material_relation_ref.js";
import { DEFAULT_OWNER_SCOPE, assertOwnerScope } from "./owner_scope.js";
import {
  assertMusicDataPlatformRefSafe,
  musicDataPlatformRefKey,
} from "./ref_validation.js";
import { assertSourceLibraryRef } from "./source_library_ref.js";

export type ProjectionMaintenanceKind =
  | "owner_catalog_source_library"
  | "owner_catalog_source_library_material"
  | "owner_catalog_relation_material"
  | "material_text";

export type ProjectionMaintenanceTargetStatus =
  | "dirty"
  | "failed";

export type ProjectionSourceWrite =
  | {
      writeKind: "source_record_written";
      sourceRef: Ref;
    }
  | {
      writeKind: "material_record_written";
      materialRef: Ref;
    }
  | {
      writeKind: "canonical_record_written";
      canonicalRef: Ref;
    }
  | {
      writeKind: "source_material_binding_written";
      sourceRef: Ref;
      previousMaterialRef?: Ref;
      nextMaterialRef?: Ref;
    }
  | {
      writeKind: "source_library_item_written";
      ownerScope: string;
      sourceRef: Ref;
    }
  | {
      writeKind: "source_library_scope_written";
      ownerScope: string;
      libraryRef: Ref;
    }
  | {
      writeKind: "owner_relation_written";
      ownerScope: string;
      relationKind: OwnerMaterialRelationKind;
      materialRef: Ref;
    };

export type ProjectionMaintenanceInvalidationInput = {
  writes: readonly [ProjectionSourceWrite, ...ProjectionSourceWrite[]];
};

export type ProjectionMaintenanceInvalidationResult = {
  writeCount: number;
  targetCount: number;
};

export type ProjectionInvalidationCommands = {
  markProjectionInvalidated(
    input: ProjectionMaintenanceInvalidationInput,
  ): Promise<ProjectionMaintenanceInvalidationResult>;
};

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

export type ProjectionMaintenanceCommands = ProjectionInvalidationCommands & {
  markProjectionTargetDirty(
    input: ProjectionMaintenanceTargetInput,
  ): Promise<ProjectionMaintenanceTargetDirtyResult>;
  markProjectionClean(
    input: ProjectionMaintenanceCleanInput,
  ): Promise<ProjectionMaintenanceCleanResult>;
  markProjectionFailed(
    input: ProjectionMaintenanceFailedInput,
  ): Promise<ProjectionMaintenanceFailedResult>;
};

type ProjectionMaintenanceTargetRow = {
  dirty_generation: number;
};

type MaterialRecordEntityRow = {
  entity_json: string;
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
    async markProjectionTargetDirty(commandInput) {
      const normalizedTarget = normalizeProjectionMaintenanceTarget(commandInput);
      return upsertDirtyTarget(input, normalizedTarget);
    },
    async markProjectionInvalidated(commandInput) {
      if (commandInput.writes.length === 0) {
        throw invalidProjectionMaintenanceTarget(
          "Projection maintenance invalidation writes must be non-empty.",
        );
      }

      const uniqueTargets = new Map<string, NormalizedProjectionMaintenanceTarget>();

      for (const write of commandInput.writes) {
        for (const target of await planProjectionInvalidationTargets(input.db, write)) {
          const normalizedTarget = normalizeProjectionMaintenanceTarget(target);
          uniqueTargets.set(
            `${normalizedTarget.projectionKind}\u0000${normalizedTarget.targetKey}`,
            normalizedTarget,
          );
        }
      }

      for (const target of uniqueTargets.values()) {
        await upsertDirtyTarget(input, target);
      }

      return {
        writeCount: commandInput.writes.length,
        targetCount: uniqueTargets.size,
      };
    },
    async markProjectionClean(commandInput) {
      assertProjectionMaintenanceKind(commandInput.projectionKind);
      assertProjectionMaintenanceTargetKey(commandInput.targetKey);
      const expectedDirtyGeneration = assertExpectedDirtyGeneration(
        commandInput.expectedDirtyGeneration,
      );
      const row = await input.db.get<ProjectionMaintenanceTargetRow>(
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

      await input.db.run(
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
    async markProjectionFailed(commandInput) {
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
      const row = await input.db.get<ProjectionMaintenanceTargetRow>(
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

      await input.db.run(
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

async function upsertDirtyTarget(
  input: CreateProjectionMaintenanceCommandsInput,
  normalizedTarget: NormalizedProjectionMaintenanceTarget,
): Promise<ProjectionMaintenanceTargetDirtyResult> {
  await input.db.run(
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

  const row = await input.db.get<ProjectionMaintenanceTargetRow>(
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
}

async function planProjectionInvalidationTargets(
  db: MusicDatabaseTransactionContext,
  write: ProjectionSourceWrite,
): Promise<readonly ProjectionMaintenanceTargetInput[]> {
  switch (write.writeKind) {
    case "source_record_written": {
      assertSafeRef(write.sourceRef, "sourceRef");
      const currentMaterialRef = await findCurrentMaterialRefForSource(db, write.sourceRef);
      return currentMaterialRef === undefined
        ? []
        : [{ projectionKind: "material_text", materialRef: currentMaterialRef }];
    }
    case "material_record_written":
      assertMaterialRef(write.materialRef);
      return materialScopedTargets(DEFAULT_OWNER_SCOPE, write.materialRef);
    case "canonical_record_written": {
      assertSafeRef(write.canonicalRef, "canonicalRef");
      return (await findMaterialRefsForCanonical(db, write.canonicalRef)).map((materialRef) => ({
        projectionKind: "material_text" as const,
        materialRef,
      }));
    }
    case "source_material_binding_written": {
      assertSafeRef(write.sourceRef, "sourceRef");

      if (write.previousMaterialRef === undefined && write.nextMaterialRef === undefined) {
        throw invalidProjectionMaintenanceTarget(
          "Projection maintenance source_material_binding_written must include previousMaterialRef or nextMaterialRef.",
        );
      }

      const uniqueMaterialRefs = new Map<string, Ref>();
      for (const materialRef of [write.previousMaterialRef, write.nextMaterialRef]) {
        if (materialRef === undefined) {
          continue;
        }
        assertMaterialRef(materialRef);
        uniqueMaterialRefs.set(refKey(materialRef), materialRef);
      }

      return Array.from(uniqueMaterialRefs.values()).flatMap((materialRef) =>
        materialScopedTargets(DEFAULT_OWNER_SCOPE, materialRef).filter((target) =>
          target.projectionKind !== "owner_catalog_relation_material"
        )
      );
    }
    case "source_library_item_written": {
      assertOwnerScope(write.ownerScope);
      assertSafeRef(write.sourceRef, "sourceRef");
      const currentMaterialRef = await findCurrentMaterialRefForSource(db, write.sourceRef);
      return currentMaterialRef === undefined
        ? []
        : [{
          projectionKind: "owner_catalog_source_library_material",
          ownerScope: write.ownerScope,
          materialRef: currentMaterialRef,
        }];
    }
    case "source_library_scope_written":
      assertOwnerScope(write.ownerScope);
      assertSourceLibraryRef(write.libraryRef);
      return [{
        projectionKind: "owner_catalog_source_library",
        ownerScope: write.ownerScope,
        libraryRef: write.libraryRef,
      }];
    case "owner_relation_written":
      assertOwnerScope(write.ownerScope);
      assertOwnerMaterialRelationKind(write.relationKind);
      assertMaterialRef(write.materialRef);
      return [{
        projectionKind: "owner_catalog_relation_material",
        ownerScope: write.ownerScope,
        materialRef: write.materialRef,
      }];
  }
}

function materialScopedTargets(
  ownerScope: string,
  materialRef: Ref,
): readonly ProjectionMaintenanceTargetInput[] {
  return [
    { projectionKind: "material_text", materialRef },
    {
      projectionKind: "owner_catalog_source_library_material",
      ownerScope,
      materialRef,
    },
    {
      projectionKind: "owner_catalog_relation_material",
      ownerScope,
      materialRef,
    },
  ];
}

async function findCurrentMaterialRefForSource(
  db: MusicDatabaseTransactionContext,
  sourceRef: Ref,
): Promise<Ref | undefined> {
  const row = await db.get<MaterialRecordEntityRow>(
    `
      SELECT m.entity_json
      FROM source_material_bindings b
      JOIN material_records m
        ON m.ref_key = b.material_ref_key
      WHERE b.source_ref_key = ?
    `,
    [refKey(sourceRef)],
  );

  return row === undefined ? undefined : materialRefFromEntityJson(row.entity_json);
}

async function findMaterialRefsForCanonical(
  db: MusicDatabaseTransactionContext,
  canonicalRef: Ref,
): Promise<readonly Ref[]> {
  return (await db.all<MaterialRecordEntityRow>(
    `
      SELECT entity_json
      FROM material_records
      WHERE canonical_ref_key = ?
    `,
    [refKey(canonicalRef)],
  )).map((row) => materialRefFromEntityJson(row.entity_json));
}

function materialRefFromEntityJson(entityJson: string): Ref {
  let parsed: unknown;

  try {
    parsed = JSON.parse(entityJson);
  } catch (cause) {
    throw invalidProjectionMaintenanceTarget(
      "Stored material entity JSON is not valid JSON.",
      cause,
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw invalidProjectionMaintenanceTarget(
      "Stored material entity JSON must be an object.",
    );
  }

  const materialRef = (parsed as { materialRef?: unknown }).materialRef;
  const ref = refFromPayload(materialRef, "materialRef");
  assertMaterialRef(ref);
  return ref;
}

function assertSafeRef(ref: Ref, fieldName: string): void {
  assertMusicDataPlatformRefSafe({
    ref,
    fieldName: `Projection maintenance ${fieldName}`,
    code: "music_data.projection_maintenance_target_invalid",
  });
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

  musicDataPlatformRefKey({
    ref,
    fieldName: `Projection maintenance ${fieldName}`,
    code: "music_data.projection_maintenance_target_invalid",
  });
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
