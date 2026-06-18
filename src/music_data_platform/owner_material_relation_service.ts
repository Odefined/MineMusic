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
  }): LibraryRelationServiceState;
  editRelation(input: {
    ownerScope: string;
    materialRef: Ref;
    edit: LibraryRelationEdit;
    now: string;
  }): LibraryRelationServiceState;
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
    getRelationState(readInput) {
      return readRelationState({
        db: input.database.context(),
        ownerScope: readInput.ownerScope,
        materialRef: readInput.materialRef,
        requireWritable: false,
      });
    },
    editRelation(editInput) {
      return input.database.transaction((db) => {
        readRelationState({
          db,
          ownerScope: editInput.ownerScope,
          materialRef: editInput.materialRef,
          requireWritable: true,
        });

        const commands = createMusicDataPlatformSourceOfTruthWriteCommands({
          db,
          now: editInput.now,
        }).ownerRelations;
        const existing = relationSet({
          db,
          ownerScope: editInput.ownerScope,
          materialRef: editInput.materialRef,
        });

        switch (editInput.edit) {
          case "save":
            removeIfActive(commands, existing, editInput, "blocked");
            record(commands, editInput, "saved");
            break;
          case "unsave":
            removeIfActive(commands, existing, editInput, "saved");
            break;
          case "favorite":
            removeIfActive(commands, existing, editInput, "blocked");
            record(commands, editInput, "favorite");
            break;
          case "unfavorite":
            removeIfActive(commands, existing, editInput, "favorite");
            break;
          case "block":
            removeIfActive(commands, existing, editInput, "saved");
            removeIfActive(commands, existing, editInput, "favorite");
            record(commands, editInput, "blocked");
            break;
          case "unblock":
            removeIfActive(commands, existing, editInput, "blocked");
            break;
        }

        return relationStateFromKinds(relationSet({
          db,
          ownerScope: editInput.ownerScope,
          materialRef: editInput.materialRef,
        }));
      });
    },
  };
}

function readRelationState(input: {
  db: MusicDatabaseContext;
  ownerScope: string;
  materialRef: Ref;
  requireWritable: boolean;
}): LibraryRelationServiceState {
  assertWorkflowFacingOwnerScope(input.ownerScope);
  requireMaterial(input.db, input.materialRef, input.requireWritable);

  return relationStateFromKinds(relationSet({
    db: input.db,
    ownerScope: input.ownerScope,
    materialRef: input.materialRef,
  }));
}

function relationSet(input: {
  db: MusicDatabaseContext;
  ownerScope: string;
  materialRef: Ref;
}): ReadonlySet<OwnerMaterialRelationKind> {
  const records = createOwnerMaterialRelationRecords({ db: input.db });

  return new Set(records.listOwnerMaterialRelations({
    ownerScope: input.ownerScope,
    materialRef: input.materialRef,
  }).map((record) => record.relationKind));
}

function relationStateFromKinds(kinds: ReadonlySet<OwnerMaterialRelationKind>): LibraryRelationServiceState {
  return {
    saved: kinds.has("saved"),
    favorite: kinds.has("favorite"),
    blocked: kinds.has("blocked"),
  };
}

function record(
  commands: ReturnType<typeof createMusicDataPlatformSourceOfTruthWriteCommands>["ownerRelations"],
  input: {
    ownerScope: string;
    materialRef: Ref;
  },
  relationKind: OwnerMaterialRelationKind,
): void {
  commands.recordOwnerMaterialRelation({
    ownerScope: input.ownerScope,
    materialRef: input.materialRef,
    relationKind,
    origin: "user_explicit",
  });
}

function removeIfActive(
  commands: ReturnType<typeof createMusicDataPlatformSourceOfTruthWriteCommands>["ownerRelations"],
  existing: ReadonlySet<OwnerMaterialRelationKind>,
  input: {
    ownerScope: string;
    materialRef: Ref;
  },
  relationKind: OwnerMaterialRelationKind,
): void {
  if (!existing.has(relationKind)) {
    return;
  }

  commands.removeOwnerMaterialRelation({
    ownerScope: input.ownerScope,
    materialRef: input.materialRef,
    relationKind,
  });
}

function requireMaterial(
  db: MusicDatabaseContext,
  materialRef: Ref,
  requireWritable: boolean,
): void {
  assertMaterialRef(materialRef);

  const row = db.get<MaterialLifecycleRow>(
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
