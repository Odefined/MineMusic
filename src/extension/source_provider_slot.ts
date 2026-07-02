import { isRecord, isStageErrorLike, isSourceEntityKind } from "./type_guards.js";
import { assertRefSafe, isRefComponentSafe, type Ref, type Result } from "../contracts/kernel.js";
import type { DownloadSource, PlayableLink, ProviderMaterialCandidate, SourceEntityKind, SourceQuery, SourceProvider, SourceProviderCapability } from "../contracts/music_data_platform.js";
import type { CapabilityRegistry } from "./capability_registry.js";
import { defineCapabilitySlot } from "./capability_slot.js";
import { invokeCapability } from "./capability_dispatch.js";
import { failExtension, ok } from "./errors.js";

export const sourceProviderSlot = defineCapabilitySlot<SourceProvider>({
  id: "source-provider",
  cardinality: "many-by-id",
  writePolicy: "none",
  validateRegistration: ({ pluginId, key, value }) =>
    validateSourceProviderRegistration({ pluginId, providerId: key, provider: value }),
});

export type SourceProviderRegistration = {
  pluginId: string;
  providerId: string;
  provider: SourceProvider;
};

export type SourceProviderSearchInput = {
  providerId: string;
  query: SourceQuery;
  sessionId?: string;
};

export type SourceProviderSearchResult = {
  providerId: string;
  query: SourceQuery;
  candidates: readonly ProviderMaterialCandidate[];
};

export async function searchSourceProvider(
  registry: CapabilityRegistry,
  input: SourceProviderSearchInput,
): Promise<Result<SourceProviderSearchResult>> {
  const inputValidation = validateSourceProviderSearchInput(input);

  if (!inputValidation.ok) {
    return inputValidation;
  }

  const querySnapshot = copySourceQuery(input.query);

  return invokeCapability<SourceProvider, SourceProviderSearchResult>(
    registry,
    sourceProviderSlot,
    input.providerId,
    {
      label: "Source provider",
      notFoundCode: "extension.source_provider_not_found",
      failedCode: "extension.source_provider_search_failed",
      capabilityCheck: (registration) => {
        const provider = registration.value;
        if (
          !provider.descriptor.capabilities.includes("search") ||
          provider.search === undefined
        ) {
          return failExtension(
            "extension.source_provider_search_unsupported",
            `Source provider '${input.providerId}' does not support search.`,
          );
        }
        return ok(undefined);
      },
      invoke: (registration) =>
        registration.value.search!({
          query: copySourceQuery(querySnapshot),
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        }),
      validateOutput: (value) =>
        validateSourceProviderSearchResult({
          providerId: input.providerId,
          query: querySnapshot,
          candidates: value as readonly ProviderMaterialCandidate[],
        }),
      shapeResult: (value) => ({
        providerId: input.providerId,
        query: querySnapshot,
        candidates: value as readonly ProviderMaterialCandidate[],
      }),
    },
  );
}

export type SourceProviderDownloadSourceInput = {
  providerId: string;
  sourceRef: Ref;
  preferredBitrate?: number;
  sessionId?: string;
};

export type SourceProviderDownloadSourceResult = {
  providerId: string;
  downloadSource: DownloadSource;
};

export type SourceProviderPlayableLinksInput = {
  providerId: string;
  sourceRef: Ref;
  sessionId?: string;
};

export type SourceProviderPlayableLinksResult = {
  providerId: string;
  sourceRef: Ref;
  playableLinks: readonly PlayableLink[];
};

export async function getSourceProviderPlayableLinks(
  registry: CapabilityRegistry,
  input: SourceProviderPlayableLinksInput,
): Promise<Result<SourceProviderPlayableLinksResult>> {
  const inputValidation = validateSourceProviderPlayableLinksInput(input);

  if (!inputValidation.ok) {
    return inputValidation;
  }

  return invokeCapability<SourceProvider, SourceProviderPlayableLinksResult>(
    registry,
    sourceProviderSlot,
    input.providerId,
    {
      label: "Source provider",
      notFoundCode: "extension.source_provider_not_found",
      failedCode: "extension.source_provider_playable_links_failed",
      capabilityCheck: (registration) => {
        const provider = registration.value;
        if (
          !provider.descriptor.capabilities.includes("playable_links") ||
          provider.getPlayableLinks === undefined
        ) {
          return failExtension(
            "extension.source_provider_playable_links_unsupported",
            `Source provider '${input.providerId}' does not support playable_links.`,
          );
        }
        return ok(undefined);
      },
      invoke: (registration) =>
        registration.value.getPlayableLinks!({
          sourceRef: input.sourceRef,
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        }),
      validateOutput: (value) =>
        validateSourceProviderPlayableLinksResult({
          providerId: input.providerId,
          playableLinks: value,
        }),
      shapeResult: (value) => ({
        providerId: input.providerId,
        sourceRef: input.sourceRef,
        playableLinks: value as readonly PlayableLink[],
      }),
    },
  );
}

export async function getSourceProviderDownloadSource(
  registry: CapabilityRegistry,
  input: SourceProviderDownloadSourceInput,
): Promise<Result<SourceProviderDownloadSourceResult>> {
  const inputValidation = validateSourceProviderDownloadSourceInput(input);

  if (!inputValidation.ok) {
    return inputValidation;
  }

  return invokeCapability<SourceProvider, SourceProviderDownloadSourceResult>(
    registry,
    sourceProviderSlot,
    input.providerId,
    {
      label: "Source provider",
      notFoundCode: "extension.source_provider_not_found",
      failedCode: "extension.source_provider_download_source_failed",
      capabilityCheck: (registration) => {
        const provider = registration.value;
        if (
          !provider.descriptor.capabilities.includes("download_source") ||
          provider.getDownloadSource === undefined
        ) {
          return failExtension(
            "extension.source_provider_download_source_unsupported",
            `Source provider '${input.providerId}' does not support download_source.`,
          );
        }
        return ok(undefined);
      },
      invoke: (registration) =>
        registration.value.getDownloadSource!({
          sourceRef: input.sourceRef,
          ...(input.preferredBitrate === undefined ? {} : { preferredBitrate: input.preferredBitrate }),
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        }),
      validateOutput: (value) =>
        validateSourceProviderDownloadSourceResult({
          providerId: input.providerId,
          downloadSource: value as DownloadSource,
        }),
      shapeResult: (value) => ({
        providerId: input.providerId,
        downloadSource: value as DownloadSource,
      }),
    },
  );
}

export function validateSourceProviderRegistration(
  registration: SourceProviderRegistration,
): Result<void> {
  if (!isRecord(registration)) {
    return failExtension(
      "extension.invalid_source_provider_registration",
      "Source provider registration must be an object.",
    );
  }

  if (typeof registration.pluginId !== "string" || registration.pluginId.length === 0) {
    return failExtension(
      "extension.invalid_source_provider_registration",
      "Source provider registration pluginId must be a non-empty string.",
    );
  }

  if (!isRefComponentSafe(registration.providerId)) {
    return failExtension(
      "extension.unsafe_provider_id",
      "Source provider id must be a non-empty string and must not contain ':'.",
    );
  }

  const providerValidation = validateSourceProvider(registration.provider, registration.providerId);

  if (!providerValidation.ok) {
    return providerValidation;
  }

  if (registration.providerId !== registration.provider.descriptor.providerId) {
    return failExtension(
      "extension.provider_id_mismatch",
      `Source provider registration '${registration.providerId}' must match descriptor providerId '${registration.provider.descriptor.providerId}'.`,
    );
  }

  return ok(undefined);
}

function copySourceQuery(query: SourceQuery): SourceQuery {
  return {
    text: query.text,
    ...(query.targetKinds === undefined ? {} : { targetKinds: query.targetKinds.slice() }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
    ...(query.offset === undefined ? {} : { offset: query.offset }),
  };
}

function validateSourceProviderSearchInput(input: SourceProviderSearchInput): Result<void> {
  if (!isRecord(input)) {
    return failExtension(
      "extension.invalid_source_provider_search_input",
      "Source provider search input must be an object.",
    );
  }

  if (!isRefComponentSafe(input.providerId)) {
    return failExtension(
      "extension.invalid_source_provider_search_input",
      "Source provider id must be a non-empty string and must not contain ':'.",
    );
  }

  const query = input.query;

  if (!isRecord(query)) {
    return failExtension(
      "extension.invalid_source_provider_search_input",
      "Source provider search query must be an object.",
    );
  }

  if (typeof query.text !== "string" || query.text.trim().length === 0) {
    return failExtension(
      "extension.invalid_source_provider_search_input",
      "Source provider search query text must be non-empty.",
    );
  }

  if (
    query.limit !== undefined &&
    (typeof query.limit !== "number" || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50)
  ) {
    return failExtension(
      "extension.invalid_source_provider_search_input",
      "Source provider search limit must be an integer from 1 through 50.",
    );
  }

  if (
    query.offset !== undefined &&
    (typeof query.offset !== "number" || !Number.isInteger(query.offset) || query.offset < 0)
  ) {
    return failExtension(
      "extension.invalid_source_provider_search_input",
      "Source provider search offset must be a non-negative integer.",
    );
  }

  if (query.targetKinds !== undefined) {
    if (!Array.isArray(query.targetKinds) || query.targetKinds.length === 0) {
      return failExtension(
        "extension.invalid_source_provider_search_input",
        "Source provider search targetKinds must be non-empty when present.",
      );
    }

    for (const kind of query.targetKinds) {
      if (!isSourceEntityKind(kind)) {
        return failExtension(
          "extension.invalid_source_provider_search_input",
          `Source provider search target kind '${String(kind)}' is not supported.`,
        );
      }
    }
  }

  if (input.sessionId !== undefined && typeof input.sessionId !== "string") {
    return failExtension(
      "extension.invalid_source_provider_search_input",
      "Source provider search sessionId must be a string when present.",
    );
  }

  return ok(undefined);
}

function validateSourceProvider(provider: SourceProvider, registrationProviderId: string): Result<void> {
  if (!isRecord(provider)) {
    return invalidSourceProviderDescriptor("Source provider must be an object.");
  }

  if (!isRecord(provider.descriptor)) {
    return invalidSourceProviderDescriptor("Source provider descriptor must be an object.");
  }

  const { descriptor } = provider;

  if (!isRefComponentSafe(descriptor.providerId)) {
    return invalidSourceProviderDescriptor(
      "Source provider descriptor providerId must be a non-empty string and must not contain ':'.",
    );
  }

  if (descriptor.providerId !== registrationProviderId) {
    return ok(undefined);
  }

  if (typeof descriptor.label !== "string" || descriptor.label.trim().length === 0) {
    return invalidSourceProviderDescriptor("Source provider descriptor label must be a non-empty string.");
  }

  if (!Array.isArray(descriptor.capabilities)) {
    return invalidSourceProviderDescriptor("Source provider descriptor capabilities must be an array.");
  }

  const seenCapabilities = new Set<SourceProviderCapability>();

  for (const capability of descriptor.capabilities) {
    if (!isSourceProviderCapability(capability)) {
      return invalidSourceProviderDescriptor("Source provider descriptor capabilities include an unsupported value.");
    }

    if (seenCapabilities.has(capability)) {
      return invalidSourceProviderDescriptor("Source provider descriptor capabilities must not contain duplicates.");
    }

    seenCapabilities.add(capability);
  }

  if (seenCapabilities.has("search") && typeof provider.search !== "function") {
    return invalidSourceProviderDescriptor(
      "Source provider descriptor declares search but provider.search is not a function.",
    );
  }

  if (seenCapabilities.has("playable_links") && typeof provider.getPlayableLinks !== "function") {
    return invalidSourceProviderDescriptor(
      "Source provider descriptor declares playable_links but provider.getPlayableLinks is not a function.",
    );
  }

  if (seenCapabilities.has("download_source") && typeof provider.getDownloadSource !== "function") {
    return invalidSourceProviderDescriptor(
      "Source provider descriptor declares download_source but provider.getDownloadSource is not a function.",
    );
  }

  if (seenCapabilities.has("entity_picture_url") && typeof provider.getEntityPictureUrl !== "function") {
    return invalidSourceProviderDescriptor(
      "Source provider descriptor declares entity_picture_url but provider.getEntityPictureUrl is not a function.",
    );
  }

  if (seenCapabilities.has("song_lyrics") && typeof provider.getSongLyrics !== "function") {
    return invalidSourceProviderDescriptor(
      "Source provider descriptor declares song_lyrics but provider.getSongLyrics is not a function.",
    );
  }

  return ok(undefined);
}

function validateSourceProviderSearchResult(result: SourceProviderSearchResult): Result<void> {
  if (!Array.isArray(result.candidates)) {
    return invalidSearchOutput(
      `Source provider '${result.providerId}' returned a non-array candidate list.`,
    );
  }

  for (const candidate of result.candidates) {
    if (!isRecord(candidate)) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned a malformed candidate.`,
      );
    }

    const { sourceEntity } = candidate;

    if (!isRecord(sourceEntity)) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned a candidate without sourceEntity.`,
      );
    }

    if (!isRecord(sourceEntity.sourceRef)) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned a candidate without sourceRef.`,
      );
    }

    const sourceRef = sourceEntity.sourceRef;

    if (
      typeof sourceRef.namespace !== "string" ||
      typeof sourceRef.kind !== "string" ||
      typeof sourceRef.id !== "string"
    ) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned a malformed sourceRef.`,
      );
    }

    if (typeof sourceEntity.providerId !== "string") {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned a candidate without providerId.`,
      );
    }

    if (typeof sourceEntity.providerEntityId !== "string") {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned a candidate without providerEntityId.`,
      );
    }

    if (!isSourceEntityKind(sourceEntity.kind)) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned an unsupported source kind.`,
      );
    }

    const expectedNamespace = `source_${result.providerId}`;

    if (sourceEntity.providerId !== result.providerId) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned candidate for provider '${sourceEntity.providerId}'.`,
      );
    }

    if (sourceRef.namespace !== expectedNamespace) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned source namespace '${sourceRef.namespace}' instead of '${expectedNamespace}'.`,
      );
    }

    if (sourceRef.kind !== sourceEntity.kind) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned source kind '${sourceRef.kind}' for '${sourceEntity.kind}'.`,
      );
    }

    try {
      assertRefSafe({
        namespace: sourceRef.namespace,
        kind: sourceRef.kind,
        id: sourceRef.id,
      });
    } catch {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned an unsafe source ref.`,
      );
    }

    if (!isRefComponentSafe(sourceEntity.providerEntityId)) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned an unsafe provider entity id.`,
      );
    }

    if (
      candidate.providerScore !== undefined &&
      (
        typeof candidate.providerScore !== "number" ||
        !Number.isFinite(candidate.providerScore) ||
        candidate.providerScore < 0 ||
        candidate.providerScore > 1
      )
    ) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned providerScore outside 0..1.`,
      );
    }

    if (
      result.query.targetKinds !== undefined &&
      !result.query.targetKinds.includes(sourceEntity.kind)
    ) {
      return invalidSearchOutput(
        `Source provider '${result.providerId}' returned '${sourceEntity.kind}' outside requested targetKinds.`,
      );
    }
  }

  return ok(undefined);
}

function invalidSearchOutput(message: string): Result<never> {
  return failExtension("extension.invalid_source_provider_search_output", message);
}

function invalidSourceProviderDescriptor(message: string): Result<never> {
  return failExtension("extension.invalid_source_provider_descriptor", message);
}


function isSourceProviderCapability(capability: unknown): capability is SourceProviderCapability {
  return capability === "search" ||
    capability === "playable_links" ||
    capability === "download_source" ||
    capability === "entity_picture_url" ||
    capability === "song_lyrics";
}

function validateSourceProviderDownloadSourceInput(input: SourceProviderDownloadSourceInput): Result<void> {
  if (!isRecord(input)) {
    return failExtension(
      "extension.invalid_source_provider_download_source_input",
      "Source provider download_source input must be an object.",
    );
  }

  if (!isRefComponentSafe(input.providerId)) {
    return failExtension(
      "extension.invalid_source_provider_download_source_input",
      "Source provider id must be a non-empty string and must not contain ':'.",
    );
  }

  const sourceRef = input.sourceRef;

  if (!isRecord(sourceRef)) {
    return failExtension(
      "extension.invalid_source_provider_download_source_input",
      "Source provider download_source sourceRef must be an object.",
    );
  }

  if (
    typeof sourceRef.namespace !== "string" ||
    typeof sourceRef.kind !== "string" ||
    typeof sourceRef.id !== "string"
  ) {
    return failExtension(
      "extension.invalid_source_provider_download_source_input",
      "Source provider download_source sourceRef must have string namespace, kind, and id.",
    );
  }

  try {
    assertRefSafe({
      namespace: sourceRef.namespace,
      kind: sourceRef.kind,
      id: sourceRef.id,
    });
  } catch {
    return failExtension(
      "extension.invalid_source_provider_download_source_input",
      "Source provider download_source sourceRef must be a safe ref.",
    );
  }

  // A provider may only resolve its own namespace's refs — symmetric with the
  // search output namespace check. Without this, a mismatched provider/ref
  // pair could resolve another provider's id.
  const expectedNamespace = `source_${input.providerId}`;
  if (sourceRef.namespace !== expectedNamespace) {
    return failExtension(
      "extension.invalid_source_provider_download_source_input",
      `Source provider download_source sourceRef namespace '${sourceRef.namespace}' must match '${expectedNamespace}'.`,
    );
  }

  if (
    input.preferredBitrate !== undefined &&
    (typeof input.preferredBitrate !== "number" ||
      !Number.isInteger(input.preferredBitrate) ||
      input.preferredBitrate <= 0)
  ) {
    return failExtension(
      "extension.invalid_source_provider_download_source_input",
      "Source provider download_source preferredBitrate must be a positive integer when present.",
    );
  }

  if (input.sessionId !== undefined && typeof input.sessionId !== "string") {
    return failExtension(
      "extension.invalid_source_provider_download_source_input",
      "Source provider download_source sessionId must be a string when present.",
    );
  }

  return ok(undefined);
}

function validateSourceProviderPlayableLinksInput(input: SourceProviderPlayableLinksInput): Result<void> {
  if (!isRecord(input)) {
    return failExtension(
      "extension.invalid_source_provider_playable_links_input",
      "Source provider playable_links input must be an object.",
    );
  }

  if (!isRefComponentSafe(input.providerId)) {
    return failExtension(
      "extension.invalid_source_provider_playable_links_input",
      "Source provider id must be a non-empty string and must not contain ':'.",
    );
  }

  const sourceRef = input.sourceRef;

  if (!isRecord(sourceRef)) {
    return failExtension(
      "extension.invalid_source_provider_playable_links_input",
      "Source provider playable_links sourceRef must be an object.",
    );
  }

  if (
    typeof sourceRef.namespace !== "string" ||
    typeof sourceRef.kind !== "string" ||
    typeof sourceRef.id !== "string"
  ) {
    return failExtension(
      "extension.invalid_source_provider_playable_links_input",
      "Source provider playable_links sourceRef must have string namespace, kind, and id.",
    );
  }

  try {
    assertRefSafe({
      namespace: sourceRef.namespace,
      kind: sourceRef.kind,
      id: sourceRef.id,
    });
  } catch {
    return failExtension(
      "extension.invalid_source_provider_playable_links_input",
      "Source provider playable_links sourceRef must be a safe ref.",
    );
  }

  const expectedNamespace = `source_${input.providerId}`;
  if (sourceRef.namespace !== expectedNamespace) {
    return failExtension(
      "extension.invalid_source_provider_playable_links_input",
      `Source provider playable_links sourceRef namespace '${sourceRef.namespace}' must match '${expectedNamespace}'.`,
    );
  }

  if (input.sessionId !== undefined && typeof input.sessionId !== "string") {
    return failExtension(
      "extension.invalid_source_provider_playable_links_input",
      "Source provider playable_links sessionId must be a string when present.",
    );
  }

  return ok(undefined);
}

function validateSourceProviderDownloadSourceResult(result: {
  providerId: string;
  downloadSource: unknown;
}): Result<void> {
  const downloadSource = result.downloadSource;

  if (!isRecord(downloadSource)) {
    return invalidDownloadSourceOutput(
      `Source provider '${result.providerId}' returned a non-object download source.`,
    );
  }

  if (typeof downloadSource.url !== "string" || downloadSource.url.trim().length === 0) {
    return invalidDownloadSourceOutput(
      `Source provider '${result.providerId}' returned a download source without a usable url.`,
    );
  }

  if (typeof downloadSource.container !== "string" || downloadSource.container.trim().length === 0) {
    return invalidDownloadSourceOutput(
      `Source provider '${result.providerId}' returned a download source without a usable format.`,
    );
  }

  if (
    downloadSource.bitrate !== undefined &&
    (typeof downloadSource.bitrate !== "number" ||
      !Number.isFinite(downloadSource.bitrate) ||
      downloadSource.bitrate <= 0)
  ) {
    return invalidDownloadSourceOutput(
      `Source provider '${result.providerId}' returned a download source with an invalid bitrate.`,
    );
  }

  if (
    downloadSource.sizeBytes !== undefined &&
    (typeof downloadSource.sizeBytes !== "number" ||
      !Number.isInteger(downloadSource.sizeBytes) ||
      downloadSource.sizeBytes < 0)
  ) {
    return invalidDownloadSourceOutput(
      `Source provider '${result.providerId}' returned a download source with an invalid sizeBytes.`,
    );
  }

  if (
    downloadSource.md5 !== undefined &&
    (typeof downloadSource.md5 !== "string" || downloadSource.md5.trim().length === 0)
  ) {
    return invalidDownloadSourceOutput(
      `Source provider '${result.providerId}' returned a download source with an invalid md5.`,
    );
  }

  if (
    downloadSource.expiresAt !== undefined &&
    (typeof downloadSource.expiresAt !== "string" || downloadSource.expiresAt.trim().length === 0)
  ) {
    return invalidDownloadSourceOutput(
      `Source provider '${result.providerId}' returned a download source with an invalid expiresAt.`,
    );
  }

  return ok(undefined);
}

function validateSourceProviderPlayableLinksResult(result: {
  providerId: string;
  playableLinks: unknown;
}): Result<void> {
  if (!Array.isArray(result.playableLinks)) {
    return invalidPlayableLinksOutput(
      `Source provider '${result.providerId}' returned a non-array playable links list.`,
    );
  }

  for (const playableLink of result.playableLinks) {
    if (!isRecord(playableLink)) {
      return invalidPlayableLinksOutput(
        `Source provider '${result.providerId}' returned a malformed playable link.`,
      );
    }

    if (typeof playableLink.url !== "string" || playableLink.url.trim().length === 0) {
      return invalidPlayableLinksOutput(
        `Source provider '${result.providerId}' returned a playable link without a usable url.`,
      );
    }

    if (
      playableLink.label !== undefined &&
      (typeof playableLink.label !== "string" || playableLink.label.trim().length === 0)
    ) {
      return invalidPlayableLinksOutput(
        `Source provider '${result.providerId}' returned a playable link with an invalid label.`,
      );
    }

    if (
      playableLink.requiresAccount !== undefined &&
      typeof playableLink.requiresAccount !== "boolean"
    ) {
      return invalidPlayableLinksOutput(
        `Source provider '${result.providerId}' returned a playable link with an invalid requiresAccount flag.`,
      );
    }
  }

  return ok(undefined);
}

function invalidDownloadSourceOutput(message: string): Result<never> {
  return failExtension("extension.invalid_source_provider_download_source_output", message);
}

function invalidPlayableLinksOutput(message: string): Result<never> {
  return failExtension("extension.invalid_source_provider_playable_links_output", message);
}

