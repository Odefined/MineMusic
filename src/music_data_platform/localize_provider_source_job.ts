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
import { MAIN_LOCAL_SOURCE_ROOT_ID, normalizeLocalSourceRelativePath } from "./local_source_path.js";
import { createLocalSourceRef } from "./local_source_ref.js";
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

    const sourceKey = sourceKeyForFilename(payload.sourceRef);
    const target = targetPathForDownload({
      rootDir,
      providerSource: providerSource,
      sourceRef: payload.sourceRef,
      downloadSource: source.value,
    });
    const ownsFinalFile = await finalizeDownloadedFile({
      identityRead: input.identityRead,
      fileStore: input.fileStore,
      stagingPath,
      finalPath: target.finalPath,
      relativePath: target.relativePath,
    });

    const registered = await input.localSourceCommand.createLocalSource({
      rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
      relativePath: target.relativePath,
      contentMd5: downloaded.actualMd5,
      kind: "track",
      materialRef: binding.materialRef,
      descriptiveMetadata: descriptiveMetadataFromProviderSource(providerSource, sourceKey),
    });

    if (!registered.ok) {
      if (ownsFinalFile) {
        input.fileStore.remove(target.finalPath);
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
    input.source.label.length === 0
  ) {
    throw localizeError(
      "music_data.record_kind_mismatch",
      "Localize provider source record must include label metadata.",
    );
  }

  return input.source;
}

function descriptiveMetadataFromProviderSource(source: SourceTrack, sourceKey: string): LocalSourceDescriptiveMetadata {
  const title = textOrFallback(source.title, sourceKey);
  return {
    label: textOrFallback(source.label, title),
    title,
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
  identityRead: LocalizeProviderSourceBindingLookup;
  fileStore: LocalizeProviderSourceFileStore;
  stagingPath: string;
  finalPath: string;
  relativePath: string;
}): Promise<boolean> {
  input.fileStore.ensureDir(directoryOf(input.finalPath));

  if (input.fileStore.exists(input.finalPath)) {
    const sourceRef = createLocalSourceRef({
      rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
      relativePath: input.relativePath,
      kind: "track",
    });
    const existingLocalSource = await input.identityRead.getSourceRecord({ sourceRef });
    if (
      existingLocalSource === undefined ||
      existingLocalSource.entity.origin !== "local_file" ||
      existingLocalSource.entity.rootId !== MAIN_LOCAL_SOURCE_ROOT_ID ||
      existingLocalSource.entity.relativePath !== input.relativePath
    ) {
      input.fileStore.remove(input.stagingPath);
      throw localizeError(
        "music_data.localize_final_path_collision",
        `Final local source path '${input.finalPath}' already exists without matching Local Source registration.`,
      );
    }

    input.fileStore.remove(input.stagingPath);
    return false;
  }

  await input.fileStore.move(input.stagingPath, input.finalPath);
  return true;
}

function targetPathForDownload(input: {
  rootDir: string;
  providerSource: SourceTrack;
  sourceRef: Ref;
  downloadSource: DownloadSource;
}): { finalPath: string; relativePath: string } {
  const ext = extensionForContainer(input.downloadSource.container);
  const sourceKey = sourceKeyForFilename(input.sourceRef);
  const artist = filenameComponent(input.providerSource.artistLabels?.[0], "Unknown Artist");
  const album = filenameComponent(input.providerSource.albumLabel, "Unknown Album");
  const title = filenameComponent(input.providerSource.title, sourceKey);
  const track = trackNumberComponent(input.providerSource.trackPosition?.trackNumber);
  const fileName = filenameComponent(`${track} - ${title} [${sourceKey}].${ext}`, `${track} - ${sourceKey}.${ext}`);
  const relativePath = normalizeLocalSourceRelativePath(joinPath("downloads", artist, album, fileName));
  return {
    relativePath,
    finalPath: joinPath(input.rootDir, relativePath),
  };
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

function sourceKeyForFilename(sourceRef: Ref): string {
  return filenameComponent(refKey(sourceRef).replace(/:/gu, "-"), "source");
}

function trackNumberComponent(trackNumber: number | undefined): string {
  if (trackNumber === undefined || !Number.isInteger(trackNumber) || trackNumber <= 0) {
    return "00";
  }
  return trackNumber.toString().padStart(2, "0");
}

function filenameComponent(value: string | undefined, fallback: string): string {
  const candidate = textOrFallback(value, fallback)
    .replace(/[\\/]/gu, " ")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const safe = candidate.length === 0 || candidate === "." || candidate === ".."
    ? fallback
    : candidate;
  return safe.length > 96 ? safe.slice(0, 96).trimEnd() : safe;
}

function textOrFallback(value: string | undefined, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
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
