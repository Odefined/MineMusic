import {
  isRefComponentSafe,
  type Result,
  type SourceProvider,
} from "../contracts/index.js";
import type { CapabilityRegistry } from "./capability_registry.js";
import { defineCapabilitySlot } from "./capability_slot.js";
import { failExtension, ok } from "./errors.js";

export const sourceProviderSlot = defineCapabilitySlot<SourceProvider>({
  id: "source-provider",
  cardinality: "many-by-id",
  writePolicy: "none",
});

export type SourceProviderRegistration = {
  pluginId: string;
  providerId: string;
  provider: SourceProvider;
};

export function registerSourceProvider(
  registry: CapabilityRegistry,
  registration: SourceProviderRegistration,
): Result<void> {
  const validation = validateSourceProviderRegistration(registration);

  if (!validation.ok) {
    return validation;
  }

  return registry.register(sourceProviderSlot, {
    pluginId: registration.pluginId,
    key: registration.providerId,
    value: registration.provider,
  });
}

export function listSourceProviders(registry: CapabilityRegistry): readonly SourceProviderRegistration[] {
  return registry.list(sourceProviderSlot).map((registration) => ({
    pluginId: registration.pluginId,
    providerId: registration.key,
    provider: registration.value,
  }));
}

export function getSourceProvider(
  registry: CapabilityRegistry,
  providerId: string,
): SourceProviderRegistration | undefined {
  const registration = registry.get(sourceProviderSlot, providerId);

  if (registration === undefined) {
    return undefined;
  }

  return {
    pluginId: registration.pluginId,
    providerId: registration.key,
    provider: registration.value,
  };
}

export function validateSourceProviderRegistration(
  registration: SourceProviderRegistration,
): Result<void> {
  if (!isRefComponentSafe(registration.providerId)) {
    return failExtension(
      "extension.unsafe_provider_id",
      `Source provider id '${registration.providerId}' must be non-empty and must not contain ':'.`,
    );
  }

  if (registration.providerId !== registration.provider.descriptor.providerId) {
    return failExtension(
      "extension.provider_id_mismatch",
      `Source provider registration '${registration.providerId}' must match descriptor providerId '${registration.provider.descriptor.providerId}'.`,
    );
  }

  return ok(undefined);
}
