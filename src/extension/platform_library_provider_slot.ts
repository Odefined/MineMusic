import { isRecord, isStageErrorLike, isSourceEntityKind } from "./type_guards.js";
import { assertRefSafe, isRefComponentSafe, type Result } from "../contracts/kernel.js";
import type { PlatformLibraryCandidate, PlatformLibraryKind, PlatformLibraryProvider, PlatformLibraryReadInput, PlatformLibraryReadResult, SourceEntityKind } from "../contracts/music_data_platform.js";
import type { CapabilityRegistry } from "./capability_registry.js";
import { defineCapabilitySlot } from "./capability_slot.js";
import { invokeCapability } from "./capability_dispatch.js";
import { failExtension, ok } from "./errors.js";

export const platformLibraryProviderSlot = defineCapabilitySlot<PlatformLibraryProvider>({
  id: "platform-library-provider",
  cardinality: "many-by-id",
  writePolicy: "none",
  validateRegistration: ({ pluginId, key, value }) =>
    validatePlatformLibraryProviderRegistration({ pluginId, providerId: key, provider: value }),
});

export type PlatformLibraryProviderRegistration = {
  pluginId: string;
  providerId: string;
  provider: PlatformLibraryProvider;
};

export type PlatformLibraryProviderReadInput = {
  providerId: string;
  request: PlatformLibraryReadInput;
};

export type PlatformLibraryProviderReadResult = PlatformLibraryReadResult;

export async function readPlatformLibraryProvider(
  registry: CapabilityRegistry,
  input: PlatformLibraryProviderReadInput,
): Promise<Result<PlatformLibraryProviderReadResult>> {
  const inputValidation = validatePlatformLibraryProviderReadInput(input);

  if (!inputValidation.ok) {
    return inputValidation;
  }

  const requestSnapshot = copyPlatformLibraryReadInput(input.request);

  return invokeCapability<PlatformLibraryProvider, PlatformLibraryProviderReadResult>(
    registry,
    platformLibraryProviderSlot,
    input.providerId,
    {
      label: "Platform library provider",
      notFoundCode: "extension.platform_library_provider_not_found",
      failedCode: "extension.platform_library_provider_read_failed",
      capabilityCheck: (registration) => {
        if (!registration.value.descriptor.libraryKinds.includes(requestSnapshot.kind)) {
          return failExtension(
            "extension.platform_library_provider_kind_unsupported",
            `Platform library provider '${input.providerId}' does not support library kind '${requestSnapshot.kind}'.`,
          );
        }
        return ok(undefined);
      },
      invoke: (registration) =>
        registration.value.read(copyPlatformLibraryReadInput(requestSnapshot)),
      validateOutput: (value) =>
        validatePlatformLibraryProviderReadResult(
          input.providerId,
          requestSnapshot,
          value as PlatformLibraryReadResult,
        ),
      shapeResult: (value) => value as PlatformLibraryProviderReadResult,
    },
  );
}

export function validatePlatformLibraryProviderRegistration(
  registration: PlatformLibraryProviderRegistration,
): Result<void> {
  if (!isRecord(registration)) {
    return failExtension(
      "extension.invalid_platform_library_provider_registration",
      "Platform library provider registration must be an object.",
    );
  }

  if (typeof registration.pluginId !== "string" || registration.pluginId.length === 0) {
    return failExtension(
      "extension.invalid_platform_library_provider_registration",
      "Platform library provider registration pluginId must be a non-empty string.",
    );
  }

  if (!isRefComponentSafe(registration.providerId)) {
    return failExtension(
      "extension.unsafe_provider_id",
      "Platform library provider id must be a non-empty string and must not contain ':'.",
    );
  }

  const providerValidation = validatePlatformLibraryProvider(
    registration.provider,
    registration.providerId,
  );

  if (!providerValidation.ok) {
    return providerValidation;
  }

  if (registration.providerId !== registration.provider.descriptor.providerId) {
    return failExtension(
      "extension.provider_id_mismatch",
      `Platform library provider registration '${registration.providerId}' must match descriptor providerId '${registration.provider.descriptor.providerId}'.`,
    );
  }

  return ok(undefined);
}

function copyPlatformLibraryReadInput(input: PlatformLibraryReadInput): PlatformLibraryReadInput {
  return {
    kind: input.kind,
    ...(input.providerAccountId === undefined ? {} : { providerAccountId: input.providerAccountId }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  };
}

function validatePlatformLibraryProviderReadInput(
  input: PlatformLibraryProviderReadInput,
): Result<void> {
  if (!isRecord(input)) {
    return failExtension(
      "extension.invalid_platform_library_provider_read_input",
      "Platform library provider read input must be an object.",
    );
  }

  if (!isRefComponentSafe(input.providerId)) {
    return failExtension(
      "extension.invalid_platform_library_provider_read_input",
      "Platform library provider id must be a non-empty string and must not contain ':'.",
    );
  }

  const request = input.request;

  if (!isRecord(request)) {
    return failExtension(
      "extension.invalid_platform_library_provider_read_input",
      "Platform library provider request must be an object.",
    );
  }

  if (!isPlatformLibraryKind(request.kind)) {
    return failExtension(
      "extension.invalid_platform_library_provider_read_input",
      `Platform library kind '${String(request.kind)}' is not supported.`,
    );
  }

  if (
    request.providerAccountId !== undefined &&
    !isRefComponentSafe(request.providerAccountId)
  ) {
    return failExtension(
      "extension.invalid_platform_library_provider_read_input",
      "Platform library providerAccountId must be a non-empty safe id when present.",
    );
  }

  if (
    request.limit !== undefined &&
    (typeof request.limit !== "number" || !Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100)
  ) {
    return failExtension(
      "extension.invalid_platform_library_provider_read_input",
      "Platform library read limit must be an integer from 1 through 100.",
    );
  }

  if (
    request.cursor !== undefined &&
    (typeof request.cursor !== "string" || request.cursor.trim().length === 0)
  ) {
    return failExtension(
      "extension.invalid_platform_library_provider_read_input",
      "Platform library cursor must be non-empty when present.",
    );
  }

  if (request.sessionId !== undefined && typeof request.sessionId !== "string") {
    return failExtension(
      "extension.invalid_platform_library_provider_read_input",
      "Platform library sessionId must be a string when present.",
    );
  }

  return ok(undefined);
}

function validatePlatformLibraryProvider(
  provider: PlatformLibraryProvider,
  registrationProviderId: string,
): Result<void> {
  if (!isRecord(provider)) {
    return invalidPlatformLibraryProviderDescriptor("Platform library provider must be an object.");
  }

  if (!isRecord(provider.descriptor)) {
    return invalidPlatformLibraryProviderDescriptor("Platform library provider descriptor must be an object.");
  }

  const { descriptor } = provider;

  if (!isRefComponentSafe(descriptor.providerId)) {
    return invalidPlatformLibraryProviderDescriptor(
      "Platform library provider descriptor providerId must be a non-empty string and must not contain ':'.",
    );
  }

  if (descriptor.providerId !== registrationProviderId) {
    return ok(undefined);
  }

  if (typeof descriptor.label !== "string" || descriptor.label.trim().length === 0) {
    return invalidPlatformLibraryProviderDescriptor(
      "Platform library provider descriptor label must be a non-empty string.",
    );
  }

  if (!Array.isArray(descriptor.libraryKinds) || descriptor.libraryKinds.length === 0) {
    return invalidPlatformLibraryProviderDescriptor(
      "Platform library provider descriptor libraryKinds must be a non-empty array.",
    );
  }

  const seenKinds = new Set<PlatformLibraryKind>();

  for (const kind of descriptor.libraryKinds) {
    if (!isPlatformLibraryKind(kind)) {
      return invalidPlatformLibraryProviderDescriptor(
        "Platform library provider descriptor libraryKinds include an unsupported value.",
      );
    }

    if (seenKinds.has(kind)) {
      return invalidPlatformLibraryProviderDescriptor(
        "Platform library provider descriptor libraryKinds must not contain duplicates.",
      );
    }

    seenKinds.add(kind);
  }

  if (typeof provider.read !== "function") {
    return invalidPlatformLibraryProviderDescriptor(
      "Platform library provider read must be a function.",
    );
  }

  return ok(undefined);
}

function validatePlatformLibraryProviderReadResult(
  providerId: string,
  request: PlatformLibraryReadInput,
  result: PlatformLibraryReadResult,
): Result<void> {
  if (!isRecord(result)) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned a malformed result.`,
    );
  }

  if (result.providerId !== providerId) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned result for provider '${String(result.providerId)}'.`,
    );
  }

  if (result.kind !== request.kind) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned kind '${String(result.kind)}' outside requested kind.`,
    );
  }

  if (
    result.providerAccountId !== undefined &&
    !isRefComponentSafe(result.providerAccountId)
  ) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned an invalid providerAccountId.`,
    );
  }

  if (
    request.providerAccountId !== undefined &&
    request.providerAccountId !== result.providerAccountId
  ) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned a different providerAccountId.`,
    );
  }

  if (!Array.isArray(result.candidates)) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned a non-array candidate list.`,
    );
  }

  if (request.limit !== undefined && result.candidates.length > request.limit) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned more candidates than requested.`,
    );
  }

  if (
    result.nextCursor !== undefined &&
    (typeof result.nextCursor !== "string" || result.nextCursor.trim().length === 0)
  ) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned an invalid nextCursor.`,
    );
  }

  if (
    result.totalCountHint !== undefined &&
    (
      typeof result.totalCountHint !== "number" ||
      !Number.isInteger(result.totalCountHint) ||
      result.totalCountHint < 0
    )
  ) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned an invalid totalCountHint.`,
    );
  }

  for (const candidate of result.candidates) {
    const candidateValidation = validatePlatformLibraryCandidate(providerId, result, candidate);

    if (!candidateValidation.ok) {
      return candidateValidation;
    }
  }

  return ok(undefined);
}

function validatePlatformLibraryCandidate(
  providerId: string,
  result: PlatformLibraryReadResult,
  candidate: PlatformLibraryCandidate,
): Result<void> {
  if (!isRecord(candidate)) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned a malformed candidate.`,
    );
  }

  if (candidate.libraryKind !== result.kind) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned candidate outside requested library kind.`,
    );
  }

  if (
    candidate.providerAccountId !== undefined &&
    !isRefComponentSafe(candidate.providerAccountId)
  ) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned candidate with invalid providerAccountId.`,
    );
  }

  if (
    result.providerAccountId !== undefined &&
    candidate.providerAccountId !== undefined &&
    candidate.providerAccountId !== result.providerAccountId
  ) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned candidate for a different providerAccountId.`,
    );
  }

  if (candidate.providerAddedAt !== undefined && typeof candidate.providerAddedAt !== "string") {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned candidate with invalid providerAddedAt.`,
    );
  }

  if (!isRecord(candidate.sourceEntity)) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned candidate without sourceEntity.`,
    );
  }

  return validatePlatformLibrarySourceEntity(providerId, result.kind, candidate.sourceEntity);
}

function validatePlatformLibrarySourceEntity(
  providerId: string,
  libraryKind: PlatformLibraryKind,
  sourceEntity: Record<string, unknown>,
): Result<void> {
  if (!isRecord(sourceEntity.sourceRef)) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned sourceEntity without sourceRef.`,
    );
  }

  const sourceRef = sourceEntity.sourceRef;

  if (
    typeof sourceRef.namespace !== "string" ||
    typeof sourceRef.kind !== "string" ||
    typeof sourceRef.id !== "string"
  ) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned malformed sourceRef.`,
    );
  }

  if (typeof sourceEntity.providerId !== "string") {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned sourceEntity without providerId.`,
    );
  }

  if (typeof sourceEntity.providerEntityId !== "string") {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned sourceEntity without providerEntityId.`,
    );
  }

  if (typeof sourceEntity.kind !== "string" || !isSourceEntityKind(sourceEntity.kind)) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned unsupported source kind.`,
    );
  }

  const expectedKind = sourceKindForLibraryKind(libraryKind);
  if (sourceEntity.kind !== expectedKind) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned source kind '${sourceEntity.kind}' for library kind '${libraryKind}'.`,
    );
  }

  const expectedNamespace = `source_${providerId}`;

  if (sourceEntity.providerId !== providerId) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned source for provider '${sourceEntity.providerId}'.`,
    );
  }

  if (sourceRef.namespace !== expectedNamespace) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned source namespace '${sourceRef.namespace}' instead of '${expectedNamespace}'.`,
    );
  }

  if (sourceRef.kind !== sourceEntity.kind) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned source ref kind '${sourceRef.kind}' for '${sourceEntity.kind}'.`,
    );
  }

  try {
    assertRefSafe({
      namespace: sourceRef.namespace,
      kind: sourceRef.kind,
      id: sourceRef.id,
    });
  } catch {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned unsafe source ref.`,
    );
  }

  if (!isRefComponentSafe(sourceEntity.providerEntityId)) {
    return invalidPlatformLibraryReadOutput(
      `Platform library provider '${providerId}' returned unsafe provider entity id.`,
    );
  }

  return ok(undefined);
}

function sourceKindForLibraryKind(kind: PlatformLibraryKind): SourceEntityKind {
  switch (kind) {
    case "saved_source_track":
      return "track";
    case "saved_source_album":
      return "album";
    case "followed_source_artist":
      return "artist";
  }
}

function invalidPlatformLibraryReadOutput(message: string): Result<never> {
  return failExtension("extension.invalid_platform_library_provider_read_output", message);
}

function invalidPlatformLibraryProviderDescriptor(message: string): Result<never> {
  return failExtension("extension.invalid_platform_library_provider_descriptor", message);
}

function isPlatformLibraryKind(kind: unknown): kind is PlatformLibraryKind {
  return kind === "saved_source_track" ||
    kind === "saved_source_album" ||
    kind === "followed_source_artist";
}



