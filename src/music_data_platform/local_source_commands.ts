import { refKey, type Ref, type Result } from "../contracts/kernel.js";
import type { SourceEntity, SourceTrack } from "../contracts/music_data_platform.js";
import type { MusicDatabase } from "../storage/database.js";
import { MusicDataPlatformError, type MusicDataPlatformErrorCode } from "./errors.js";
import { createIdentityReadPort } from "./identity_read_model.js";
import { materialKindForSourceKind } from "./material_ref.js";
import type { MaterialRefFactory } from "./material_ref_factory.js";
import { runSourceOfTruthWrite } from "./source_of_truth_write_commands.js";
import type { ProjectionMaintenanceDispatcher } from "./projection_maintenance_dispatcher.js";
import { createLocalSourceRef } from "./local_source_ref.js";
import {
  normalizeLocalSourceContentMd5,
  normalizeLocalSourceRelativePath,
} from "./local_source_path.js";

export type CreateLocalSourceCommandInput = {
  database: MusicDatabase;
  materialRefFactory: MaterialRefFactory;
  now?: () => string;
  projectionMaintenanceDispatcher?: ProjectionMaintenanceDispatcher;
};

export type LocalSourceCommand = {
  createLocalSource(input: CreateLocalSourceInput): Promise<Result<CreateLocalSourceResult>>;
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
  rootId: string;
  relativePath: string;
  contentMd5: string;
  kind: "track";
  materialRef?: Ref;
  descriptiveMetadata?: LocalSourceDescriptiveMetadata;
};

export type LocalSourceDescriptiveMetadata =
  Pick<SourceTrack, "label" | "title"> &
  Partial<Pick<
    SourceTrack,
    | "artistLabels"
    | "artistSourceRefs"
    | "albumLabel"
    | "albumSourceRef"
    | "trackPosition"
    | "durationMs"
    | "versionInfo"
  >>;

export type CreateLocalSourceResult = {
  materialRef: Ref;
  created: boolean;
};

// Scenario-B caller-input failures that bindSourceToMaterial surfaces as
// MusicDataPlatformError. Only these are translated to Result at the
// createLocalSource boundary; every other throw is an invariant (source/identity
// shape, primary-source binding) and must crash rather than become a Result.
const CREATE_LOCAL_SOURCE_RESULT_FAILURE_CODES: ReadonlySet<MusicDataPlatformErrorCode> = new Set([
  "music_data.material_not_found",
  "music_data.material_not_writable",
  "music_data.record_kind_mismatch",
]);

export function createLocalSourceCommand(
  input: CreateLocalSourceCommandInput,
): LocalSourceCommand {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    async createLocalSource(commandInput) {
      // createLocalSource is the owning command boundary for local-source
      // registration. The transaction body may throw MusicDataPlatformError,
      // but only declared scenario-B caller-input failures (missing / wrong-kind
      // / non-writable materialRef) become Result — invariant violations
      // propagate as throws (one failure channel; let broken invariants crash).
      // The transaction has already rolled back, so there is no partial write.
      try {
        return await runSourceOfTruthWrite({
          database: input.database,
          now: now(),
          dispatcher: input.projectionMaintenanceDispatcher,
          fn: async (db, writes) => {
            const normalizedRelativePath = normalizeLocalSourceRelativePath(commandInput.relativePath);
            const normalizedContentMd5 = normalizeLocalSourceContentMd5(commandInput.contentMd5);
            const sourceRef = createLocalSourceRef({
              rootId: commandInput.rootId,
              relativePath: normalizedRelativePath,
              kind: commandInput.kind,
            });

            // Idempotency short-circuit (mirrors candidate_commit). A local source
            // is one root-relative path bound to ONE material; the binding is fixed once
            // written. A replay returns the existing material. A later call that
            // names a DIFFERENT material is a conflict (same path -> two
            // materials), surfaced explicitly rather than silently rebinding.
            const identityRead = createIdentityReadPort({ db });
            const existingSourceRecord = await identityRead.getSourceRecord({ sourceRef });
            if (existingSourceRecord !== undefined) {
              if (
                existingSourceRecord.entity.origin !== "local_file" ||
                existingSourceRecord.entity.rootId !== commandInput.rootId ||
                existingSourceRecord.entity.relativePath !== normalizedRelativePath ||
                existingSourceRecord.entity.contentMd5 !== normalizedContentMd5
              ) {
                return failLocalSource(
                  "music_data.local_source_identity_conflict",
                  "Local source path is already registered with different local source facts.",
                );
              }
            }
            const existingBinding = await identityRead.findMaterialForSource({ sourceRef });
            if (existingBinding !== undefined) {
              if (
                commandInput.materialRef !== undefined &&
                refKey(existingBinding.materialRef) !== refKey(commandInput.materialRef)
              ) {
                return failLocalSource(
                  "music_data.local_source_material_conflict",
                  "Local source path is already bound to a different material.",
                );
              }
              return ok({ materialRef: existingBinding.materialRef, created: false });
            }

            const localSourceEntity = buildLocalSourceEntity({
              sourceRef,
              rootId: commandInput.rootId,
              relativePath: normalizedRelativePath,
              contentMd5: normalizedContentMd5,
              ...(commandInput.descriptiveMetadata === undefined ? {} : { descriptiveMetadata: commandInput.descriptiveMetadata }),
            });
            await writes.identity.upsertSourceRecord({ entity: localSourceEntity });

            if (commandInput.materialRef === undefined) {
              const materialKind = materialKindForSourceKind(commandInput.kind);
              const materialRef = input.materialRefFactory.createMaterialRef(materialKind);
              await writes.identity.upsertMaterialRecord({ materialRef, kind: materialKind });
              await writes.identity.bindSourceToMaterial({
                sourceRef,
                materialRef,
              });
              return ok({ materialRef, created: true });
            }

            await writes.identity.bindSourceToMaterial({
              sourceRef,
              materialRef: commandInput.materialRef,
            });
            return ok({ materialRef: commandInput.materialRef, created: true });
          },
        });
      } catch (cause) {
        if (
          cause instanceof MusicDataPlatformError &&
          CREATE_LOCAL_SOURCE_RESULT_FAILURE_CODES.has(cause.code)
        ) {
          return failLocalSource(cause.code, cause.message);
        }
        throw cause;
      }
    },
  };
}

function buildLocalSourceEntity(input: {
  sourceRef: Ref;
  rootId: string;
  relativePath: string;
  contentMd5: string;
  descriptiveMetadata?: LocalSourceDescriptiveMetadata;
}): SourceEntity {
  const descriptiveMetadata = input.descriptiveMetadata ?? placeholderLocalSourceMetadata({
    relativePath: input.relativePath,
    sourceRef: input.sourceRef,
  });
  const entity: SourceTrack = {
    origin: "local_file",
    sourceRef: input.sourceRef,
    rootId: input.rootId,
    relativePath: input.relativePath,
    contentMd5: input.contentMd5,
    kind: "track",
    ...descriptiveMetadata,
  };
  return entity;
}

function placeholderLocalSourceMetadata(input: {
  relativePath: string;
  sourceRef: Ref;
}): LocalSourceDescriptiveMetadata {
  // Bare local-file intake has no source metadata yet; a later tag import can
  // upsert richer descriptive fields without changing root/path identity.
  const fileName = input.relativePath.split("/").at(-1) ?? input.sourceRef.id;
  const extensionIndex = fileName.lastIndexOf(".");
  const stem = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const placeholder = stem.length === 0 ? input.sourceRef.id : stem;
  return {
    label: placeholder,
    title: placeholder,
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function failLocalSource(code: MusicDataPlatformErrorCode, message: string, retryable = false): Result<never> {
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
