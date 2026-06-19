import { refKey, type Ref, type Result } from "../contracts/kernel.js";
import type { SourceEntity, SourceTrack } from "../contracts/music_data_platform.js";
import type { MusicDatabase } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { createIdentityReadPort } from "./identity_read_model.js";
import { materialKindForSourceKind } from "./material_ref.js";
import type { MaterialRefFactory } from "./material_ref_factory.js";
import { createMusicDataPlatformSourceOfTruthWriteCommands } from "./source_of_truth_write_commands.js";
import { createLocalSourceRef } from "./local_source_ref.js";

export type CreateLocalSourceCommandInput = {
  database: MusicDatabase;
  materialRefFactory: MaterialRefFactory;
  now?: () => string;
};

export type LocalSourceCommand = {
  createLocalSource(input: CreateLocalSourceInput): Result<CreateLocalSourceResult>;
};

// materialRef presence selects the material relationship:
//  - omitted (scenario A): the local source has no provider origin, so it
//    self-builds a material with itself as primary source.
//  - present (scenario B): the local source is a local copy of a material
//    already built by a provider source (e.g. a download product), and binds
//    to it WITHOUT stealing primary (the provider source keeps primary).
// kind is "track" today: local sources are audio files. album/artist local
// sources are future work.
export type CreateLocalSourceInput = {
  md5: string;
  kind: "track";
  materialRef?: Ref;
};

export type CreateLocalSourceResult = {
  materialRef: Ref;
  created: boolean;
};

export function createLocalSourceCommand(
  input: CreateLocalSourceCommandInput,
): LocalSourceCommand {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    createLocalSource(commandInput) {
      // createLocalSource is the owning command boundary for local-source
      // registration. The transaction body may throw MusicDataPlatformError for
      // an expected caller-input failure in scenario B (caller-supplied
      // materialRef missing or kind-incompatible, surfaced via
      // bindSourceToMaterial). Per CLAUDE.md expected failures are Result<T>,
      // so translate at this boundary — the transaction has already rolled
      // back, so there is no partial write.
      try {
        return input.database.transaction((db) => {
          const timestamp = now();
          const sourceRef = createLocalSourceRef({
            md5: commandInput.md5,
            kind: commandInput.kind,
          });

          // Idempotency short-circuit (mirrors candidate_commit). A local source
          // is one file (md5) bound to ONE material; the binding is fixed once
          // written. A replay returns the existing material. A later call that
          // names a DIFFERENT material is a conflict (same file -> two
          // materials), surfaced explicitly rather than silently rebinding.
          const identityRead = createIdentityReadPort({ db });
          const existingBinding = identityRead.findMaterialForSource({ sourceRef });
          if (existingBinding !== undefined) {
            if (
              commandInput.materialRef !== undefined &&
              refKey(existingBinding.materialRef) !== refKey(commandInput.materialRef)
            ) {
              return failLocalSource(
                "music_data.local_source_material_conflict",
                "Local source (md5) is already bound to a different material.",
              );
            }
            return ok({ materialRef: existingBinding.materialRef, created: false });
          }

          const writes = createMusicDataPlatformSourceOfTruthWriteCommands({
            db,
            now: timestamp,
          });

          const localSourceEntity = buildLocalSourceEntity({
            sourceRef,
            md5: commandInput.md5,
          });
          writes.identity.upsertSourceRecord({ entity: localSourceEntity });

          if (commandInput.materialRef === undefined) {
            const materialKind = materialKindForSourceKind(commandInput.kind);
            const materialRef = input.materialRefFactory.createMaterialRef(materialKind);
            writes.identity.upsertMaterialRecord({ materialRef, kind: materialKind });
            writes.identity.bindSourceToMaterial({
              sourceRef,
              materialRef,
              makePrimary: true,
            });
            return ok({ materialRef, created: true });
          }

          writes.identity.bindSourceToMaterial({
            sourceRef,
            materialRef: commandInput.materialRef,
            makePrimary: false,
          });
          return ok({ materialRef: commandInput.materialRef, created: true });
        });
      } catch (cause) {
        if (cause instanceof MusicDataPlatformError) {
          return failLocalSource(cause.code, cause.message);
        }
        throw cause;
      }
    },
  };
}

function buildLocalSourceEntity(input: {
  sourceRef: Ref;
  md5: string;
}): SourceEntity {
  // The entity carries no rich metadata here: the import layer fills
  // title/artist from file tags (follow-up) and upserts again. Until then
  // label/title are placeholders. origin/providerEntityId (md5) are the dedup
  // identity and must not change on that re-upsert.
  const normalizedMd5 = input.md5.toLowerCase();
  const placeholder = `Local file ${normalizedMd5.slice(0, 8)}`;
  const entity: SourceTrack = {
    origin: "local_file",
    sourceRef: input.sourceRef,
    providerEntityId: normalizedMd5,
    kind: "track",
    label: placeholder,
    title: placeholder,
  };
  return entity;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function failLocalSource(code: string, message: string, retryable = false): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      area: "music_data_platform",
      retryable,
    },
  };
}
