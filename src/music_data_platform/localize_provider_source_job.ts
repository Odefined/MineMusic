import { createHash } from "node:crypto";

import type {
  BackgroundWorkHandler,
  BackgroundWorkJob,
} from "../background_work/index.js";
import {
  refKey,
  type Ref,
} from "../contracts/kernel.js";
import type { DownloadSource, SourceEntity, SourceTrack } from "../contracts/music_data_platform.js";
import type { DownloadSourceProvider } from "./download_commands.js";
import {
  downloadToFile,
  type MediaFileWriter,
} from "./download_to_file.js";
import {
  MusicDataPlatformError,
  type MusicDataPlatformErrorCode,
} from "./errors.js";
import type { IdentityReadPort } from "./identity_read_model.js";
import type { LocalSourceCommand, LocalSourceDescriptiveMetadata } from "./local_source_commands.js";
import { musicDataPlatformRefKey } from "./ref_validation.js";

export const LOCALIZE_PROVIDER_SOURCE_JOB_TYPE = "music_data_platform.localize_provider_source";
export const LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION = 1;

export type LocalizeProviderSourcePayloadRef = Pick<Ref, "namespace" | "kind" | "id">;

export type LocalizeProviderSourceJobPayload = {
  sourceRef: LocalizeProviderSourcePayloadRef;
  targetPolicyVersion: number;
  preferredBitrate?: number;
};

export type LocalizeProviderSourceFileStore = MediaFileWriter & {
  md5(path: string): string | Promise<string>;
  move(fromPath: string, toPath: string): void | Promise<void>;
};

export type LocalizeProviderSourceBindingLookup = Pick<IdentityReadPort, "findMaterialForSource" | "getSourceRecord">;

export type CreateLocalizeProviderSourceJobHandlerInput = {
  identityRead: LocalizeProviderSourceBindingLookup;
  downloadSourceProvider: DownloadSourceProvider;
  localSourceCommand: Pick<LocalSourceCommand, "createLocalSource">;
  localSourcesRootDir: string;
  fileStore: LocalizeProviderSourceFileStore;
  fetch?: typeof fetch;
};

type ParsedLocalizeJob = {
  sourceRef: Ref;
  targetPolicyVersion: number;
  preferredBitrate?: number;
};

export function createLocalizeProviderSourceJobHandler(
  input: CreateLocalizeProviderSourceJobHandlerInput,
): BackgroundWorkHandler<Record<string, unknown>> {
  const rootDir = normalizeLocalSourcesRootDir(input.localSourcesRootDir);
  const fetchImpl = input.fetch ?? fetch;

  return async (job) => {
    if (job.jobType !== LOCALIZE_PROVIDER_SOURCE_JOB_TYPE) {
      throw localizeError(
        "music_data.localize_invalid_payload",
        `Localize handler received unexpected job type '${job.jobType}'.`,
      );
    }

    const payload = parseLocalizeProviderSourceJobPayload(job.payload);

    if (payload.sourceRef.kind !== "track") {
      throw localizeError(
        "music_data.localize_no_audio_stream",
        "Localize requires a track sourceRef; albums and artists have no audio stream.",
      );
    }

    const providerId = providerIdFromSourceNamespace(payload.sourceRef.namespace);
    if (providerId === undefined) {
      throw localizeError(
        "music_data.localize_provider_unresolved",
        `Cannot resolve provider id from source namespace '${payload.sourceRef.namespace}'.`,
      );
    }

    const binding = await input.identityRead.findMaterialForSource({
      sourceRef: payload.sourceRef,
    });
    if (binding === undefined) {
      throw localizeError(
        "music_data.localize_material_binding_missing",
        `No material binding exists for source '${refKey(payload.sourceRef)}'.`,
      );
    }

    const providerSourceRecord = await input.identityRead.getSourceRecord({
      sourceRef: payload.sourceRef,
    });
    if (providerSourceRecord === undefined) {
      throw localizeError(
        "music_data.source_not_found",
        `No source record exists for source '${refKey(payload.sourceRef)}'.`,
      );
    }

    const providerSource = assertLocalizableProviderTrackSource({
      source: providerSourceRecord.entity,
      providerId,
    });

    const source = await input.downloadSourceProvider.getDownloadSource({
      providerId,
      sourceRef: payload.sourceRef,
      ...(payload.preferredBitrate === undefined ? {} : { preferredBitrate: payload.preferredBitrate }),
    });
    if (!source.ok) {
      throw localizeError(
        "music_data.localize_download_source_failed",
        `Provider download source failed: ${source.error.code}: ${source.error.message}`,
        source.error,
      );
    }

    const stagingPath = stagingPathForJob(rootDir, job);
    input.fileStore.ensureDir(joinPath(rootDir, ".staging"));

    const downloaded = await downloadToFile({
      source: source.value,
      outputPath: stagingPath,
      fetch: fetchImpl,
      fileWriter: input.fileStore,
    });

    if (!downloaded.ok) {
      throw localizeError(
        "music_data.localize_download_failed",
        `${downloaded.errorCode}: ${downloaded.errorMessage}`,
        downloaded,
      );
    }

    const finalPath = finalPathForDownload(rootDir, source.value, downloaded.actualMd5);
    const ownsFinalFile = await finalizeDownloadedFile({
      fileStore: input.fileStore,
      stagingPath,
      finalPath,
      actualMd5: downloaded.actualMd5,
    });

    const registered = await input.localSourceCommand.createLocalSource({
      md5: downloaded.actualMd5,
      kind: "track",
      filePath: finalPath,
      materialRef: binding.materialRef,
      descriptiveMetadata: descriptiveMetadataFromProviderSource(providerSource),
    });

    if (!registered.ok) {
      if (ownsFinalFile) {
        input.fileStore.remove(finalPath);
      }

      throw localizeError(
        "music_data.localize_local_source_registration_failed",
        `Local Source registration failed: ${registered.error.code}: ${registered.error.message}`,
        registered.error,
      );
    }
  };
}

function assertLocalizableProviderTrackSource(input: {
  source: SourceEntity;
  providerId: string;
}): SourceTrack {
  if (
    input.source.origin !== "provider" ||
    input.source.kind !== "track" ||
    input.source.providerId !== input.providerId
  ) {
    throw localizeError(
      "music_data.record_kind_mismatch",
      "Localize source record must be a provider track matching the source namespace.",
    );
  }

  if (
    typeof input.source.label !== "string" ||
    input.source.label.length === 0 ||
    typeof input.source.title !== "string" ||
    input.source.title.length === 0
  ) {
    throw localizeError(
      "music_data.record_kind_mismatch",
      "Localize provider source record must include label and title metadata.",
    );
  }

  return input.source;
}

function descriptiveMetadataFromProviderSource(source: SourceTrack): LocalSourceDescriptiveMetadata {
  return {
    label: source.label,
    title: source.title,
    ...(source.artistLabels === undefined ? {} : { artistLabels: source.artistLabels }),
    ...(source.artistSourceRefs === undefined ? {} : { artistSourceRefs: source.artistSourceRefs }),
    ...(source.albumLabel === undefined ? {} : { albumLabel: source.albumLabel }),
    ...(source.albumSourceRef === undefined ? {} : { albumSourceRef: source.albumSourceRef }),
    ...(source.trackPosition === undefined ? {} : { trackPosition: source.trackPosition }),
    ...(source.durationMs === undefined ? {} : { durationMs: source.durationMs }),
    ...(source.versionInfo === undefined ? {} : { versionInfo: source.versionInfo }),
  };
}

export function parseLocalizeProviderSourceJobPayload(payload: unknown): ParsedLocalizeJob {
  if (!isRecord(payload)) {
    throw localizeError("music_data.localize_invalid_payload", "Localize job payload must be an object.");
  }

  const keys = Object.keys(payload).sort();
  if (!arrayEquals(keys, payload.preferredBitrate === undefined
    ? ["sourceRef", "targetPolicyVersion"]
    : ["preferredBitrate", "sourceRef", "targetPolicyVersion"])) {
    throw localizeError("music_data.localize_invalid_payload", "Localize job payload has unexpected fields.");
  }

  const sourceRef = parsePayloadRef(payload.sourceRef);

  if (payload.targetPolicyVersion !== LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION) {
    throw localizeError(
      "music_data.localize_invalid_payload",
      `Localize job targetPolicyVersion must be ${LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION}.`,
    );
  }

  const preferredBitrate = payload.preferredBitrate;
  if (
    preferredBitrate !== undefined &&
    (typeof preferredBitrate !== "number" || !Number.isInteger(preferredBitrate) || preferredBitrate <= 0)
  ) {
    throw localizeError("music_data.localize_invalid_payload", "Localize job preferredBitrate must be a positive integer when present.");
  }

  return {
    sourceRef,
    targetPolicyVersion: payload.targetPolicyVersion,
    ...(preferredBitrate === undefined ? {} : { preferredBitrate }),
  };
}

export function providerIdFromSourceNamespace(namespace: string): string | undefined {
  const prefix = "source_";
  if (!namespace.startsWith(prefix) || namespace === "source_local") {
    return undefined;
  }

  const providerId = namespace.slice(prefix.length);
  return providerId.length === 0 ? undefined : providerId;
}

function parsePayloadRef(value: unknown): Ref {
  if (!isRecord(value)) {
    throw localizeError("music_data.localize_invalid_payload", "Localize job sourceRef must be an object.");
  }

  if (!arrayEquals(Object.keys(value).sort(), ["id", "kind", "namespace"])) {
    throw localizeError("music_data.localize_invalid_payload", "Localize job sourceRef has unexpected fields.");
  }

  if (
    typeof value.namespace !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.id !== "string"
  ) {
    throw localizeError("music_data.localize_invalid_payload", "Localize job sourceRef must contain ref-safe namespace, kind, and id.");
  }

  const sourceRef = {
    namespace: value.namespace,
    kind: value.kind,
    id: value.id,
  };
  musicDataPlatformRefKey({
    ref: sourceRef,
    fieldName: "payload.sourceRef",
    code: "music_data.localize_invalid_payload",
  });

  return sourceRef;
}

async function finalizeDownloadedFile(input: {
  fileStore: LocalizeProviderSourceFileStore;
  stagingPath: string;
  finalPath: string;
  actualMd5: string;
}): Promise<boolean> {
  input.fileStore.ensureDir(directoryOf(input.finalPath));

  if (input.fileStore.exists(input.finalPath)) {
    const existingMd5 = (await input.fileStore.md5(input.finalPath)).toLowerCase();
    if (existingMd5 !== input.actualMd5) {
      input.fileStore.remove(input.stagingPath);
      throw localizeError(
        "music_data.localize_final_path_collision",
        `Final local source path '${input.finalPath}' exists with different content.`,
      );
    }

    input.fileStore.remove(input.stagingPath);
    return false;
  }

  await input.fileStore.move(input.stagingPath, input.finalPath);
  return true;
}

function finalPathForDownload(rootDir: string, source: DownloadSource, actualMd5: string): string {
  const ext = extensionForContainer(source.container);
  const normalizedMd5 = actualMd5.toLowerCase();
  return joinPath(rootDir, "tracks", normalizedMd5.slice(0, 2), `${normalizedMd5}.${ext}`);
}

function extensionForContainer(container: string): string {
  const ext = container.startsWith(".") ? container.slice(1) : container;
  if (!/^[a-z0-9][a-z0-9_-]{0,15}$/u.test(ext)) {
    throw localizeError(
      "music_data.localize_invalid_container",
      "Download source container must be a safe non-empty extension.",
    );
  }
  return ext.toLowerCase();
}

function stagingPathForJob(rootDir: string, job: BackgroundWorkJob<Record<string, unknown>>): string {
  const safeJobId = createHash("sha256").update(job.jobId).digest("hex").slice(0, 32);
  return joinPath(rootDir, ".staging", `${safeJobId}.part`);
}

function normalizeLocalSourcesRootDir(rootDir: string): string {
  if (typeof rootDir !== "string" || rootDir.length === 0 || rootDir.trim() !== rootDir) {
    throw localizeError(
      "music_data.localize_config_missing",
      "Localize requires explicit localSources.rootDir or MINEMUSIC_LOCAL_SOURCES_ROOT.",
    );
  }

  if (rootDir === "/") {
    return rootDir;
  }

  const normalized = rootDir.replace(/\/+$/u, "");
  if (normalized.length === 0) {
    throw localizeError(
      "music_data.localize_config_missing",
      "Localize requires explicit localSources.rootDir or MINEMUSIC_LOCAL_SOURCES_ROOT.",
    );
  }

  return normalized;
}

function directoryOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

function joinPath(root: string, ...parts: readonly string[]): string {
  const normalizedRoot = root === "/" ? "" : root;
  return [normalizedRoot, ...parts].join("/");
}

function localizeError(
  code: MusicDataPlatformErrorCode,
  message: string,
  cause?: unknown,
): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function arrayEquals(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}
