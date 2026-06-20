import type { Ref } from "../contracts/kernel.js";
import { refKey } from "../contracts/kernel.js";
import type { MusicDatabase, MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import {
  createOwnerMaterialRelationRecords,
} from "./owner_material_relation_records.js";
import type {
  OwnerMaterialRelationKind,
} from "./owner_material_relation_ref.js";
import { DEFAULT_OWNER_SCOPE } from "./owner_scope.js";
import {
  createMusicDataPlatformSourceOfTruthWriteCommands,
} from "./source_of_truth_write_commands.js";

export type LibraryRelationServiceState = {
  saved: boolean;
  favorite: boolean;
  blocked: boolean;
};

export type LibraryRelationEdit =
  | "save"
  | "unsave"
  | "favorite"
  | "unfavorite"
  | "block"
  | "unblock";

export type LibraryRelationService = {
  getRelationState(input: {
    ownerScope: string;
    materialRef: Ref;
  }): Promise<LibraryRelationServiceState>;
  editRelation(input: {
    ownerScope: string;
    materialRef: Ref;
    edit: LibraryRelationEdit;
    now: string;
  }): Promise<LibraryRelationServiceState>;
};

export type CreateLibraryRelationServiceInput = {
  database: MusicDatabase;
};

type MaterialLifecycleRow = {
  ref_key: string;
  lifecycle_status: string;
};

export function createLibraryRelationService(
  input: CreateLibraryRelationServiceInput,
): LibraryRelationService {
  return {
    async getRelationState(readInput) {
      return readRelationState({
        db: input.database.context(),
        ownerScope: readInput.ownerScope,
        materialRef: readInput.materialRef,
        requireWritable: false,
      });
    },
    async editRelation(editInput) {
      return input.database.transaction(async (db) => {
        await readRelationState({
          db,
          ownerScope: editInput.ownerScope,
          materialRef: editInput.materialRef,
          requireWritable: true,
        });

        const commands = createMusicDataPlatformSourceOfTruthWriteCommands({
          db,
          now: editInput.now,
        }).ownerRelations;
        const existing = await relationSet({
          db,
          ownerScope: editInput.ownerScope,
          materialRef: editInput.materialRef,
        });

        switch (editInput.edit) {
          case "save":
            await removeIfActive(commands, existing, editInput, "blocked");
            await record(commands, editInput, "saved");
            break;
          case "unsave":
            await removeIfActive(commands, existing, editInput, "saved");
            break;
          case "favorite":
            await removeIfActive(commands, existing, editInput, "blocked");
            await record(commands, editInput, "favorite");
            break;
          case "unfavorite":
            await removeIfActive(commands, existing, editInput, "favorite");
            break;
          case "block":
            await removeIfActive(commands, existing, editInput, "saved");
            await removeIfActive(commands, existing, editInput, "favorite");
            await record(commands, editInput, "blocked");
            break;
          case "unblock":
            await removeIfActive(commands, existing, editInput, "blocked");
            break;
        }

        return relationStateFromKinds(await relationSet({
          db,
          ownerScope: editInput.ownerScope,
          materialRef: editInput.materialRef,
        }));
      });
    },
  };
}

async function readRelationState(input: {
  db: MusicDatabaseContext;
  ownerScope: string;
  materialRef: Ref;
  requireWritable: boolean;
}): Promise<LibraryRelationServiceState> {
  assertWorkflowFacingOwnerScope(input.ownerScope);
  await requireMaterial(input.db, input.materialRef, input.requireWritable);

  return relationStateFromKinds(await relationSet({
    db: input.db,
    ownerScope: input.ownerScope,
    materialRef: input.materialRef,
  }));
}

async function relationSet(input: {
  db: MusicDatabaseContext;
  ownerScope: string;
  materialRef: Ref;
}): Promise<ReadonlySet<OwnerMaterialRelationKind>> {
  const records = createOwnerMaterialRelationRecords({ db: input.db });
  const relationRecords = await records.listOwnerMaterialRelations({
    ownerScope: input.ownerScope,
    materialRef: input.materialRef,
  });

  return new Set(relationRecords.map((record) => record.relationKind));
}

function relationStateFromKinds(kinds: ReadonlySet<OwnerMaterialRelationKind>): LibraryRelationServiceState {
  return {
    saved: kinds.has("saved"),
    favorite: kinds.has("favorite"),
    blocked: kinds.has("blocked"),
  };
}

async function record(
  commands: ReturnType<typeof createMusicDataPlatformSourceOfTruthWriteCommands>["ownerRelations"],
  input: {
    ownerScope: string;
    materialRef: Ref;
  },
  relationKind: OwnerMaterialRelationKind,
): Promise<void> {
  await commands.recordOwnerMaterialRelation({
    ownerScope: input.ownerScope,
    materialRef: input.materialRef,
    relationKind,
    origin: "user_explicit",
  });
}

async function removeIfActive(
  commands: ReturnType<typeof createMusicDataPlatformSourceOfTruthWriteCommands>["ownerRelations"],
  existing: ReadonlySet<OwnerMaterialRelationKind>,
  input: {
    ownerScope: string;
  materialRef: Ref;
  },
  relationKind: OwnerMaterialRelationKind,
): Promise<void> {
  if (!existing.has(relationKind)) {
    return;
  }

  await commands.removeOwnerMaterialRelation({
    ownerScope: input.ownerScope,
    materialRef: input.materialRef,
    relationKind,
  });
}

async function requireMaterial(
  db: MusicDatabaseContext,
  materialRef: Ref,
  requireWritable: boolean,
): Promise<void> {
  assertMaterialRef(materialRef);

  const row = await db.get<MaterialLifecycleRow>(
    `
      SELECT ref_key, lifecycle_status
      FROM material_records
      WHERE ref_key = ?
    `,
    [refKey(materialRef)],
  );

  if (row === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.material_not_found",
      message: "Library relation target material record was not found.",
    });
  }

  if (row.lifecycle_status !== "active") {
    throw new MusicDataPlatformError({
      code: requireWritable
        ? "music_data.material_not_writable"
        : "music_data.material_not_found",
      message: requireWritable
        ? "Library relation target material record must be active."
        : "Library relation target material record is not available.",
    });
  }
}

function assertWorkflowFacingOwnerScope(ownerScope: string): void {
  if (ownerScope !== DEFAULT_OWNER_SCOPE) {
    throw new MusicDataPlatformError({
      code: "music_data.owner_scope_unsupported",
      message: `Workflow-facing library relation operations currently support only owner scope '${DEFAULT_OWNER_SCOPE}'.`,
    });
  }
}
