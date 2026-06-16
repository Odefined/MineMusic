import { isRecord, isStageErrorLike, isSourceEntityKind } from "./type_guards.js";
import { assertRefSafe, isRefComponentSafe, type Result } from "../contracts/kernel.js";
import type { ProviderMaterialCandidate, SourceEntityKind, SourceQuery, SourceProvider, SourceProviderCapability } from "../contracts/music_data_platform.js";
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
    capability === "playable_links";
}



