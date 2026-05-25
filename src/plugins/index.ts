import type {
  CapabilitySlot,
  InstrumentProviderDescriptor,
  Result,
  StageError,
} from "../contracts/index.js";
import type { PluginRegistryPort } from "../ports/index.js";

export function createPluginRegistry(): PluginRegistryPort {
  const providers = new Map<CapabilitySlot, Map<string, unknown>>();
  const providerDescriptors = new Map<CapabilitySlot, Map<string, InstrumentProviderDescriptor>>();

  return {
    async registerProvider({ slot, providerId, provider, descriptor }) {
      let slotProviders = providers.get(slot);

      if (slotProviders === undefined) {
        slotProviders = new Map<string, unknown>();
        providers.set(slot, slotProviders);
      }

      slotProviders.set(providerId, provider);
      const providerDescriptor = descriptor ?? readProviderDescriptor(provider);

      if (providerDescriptor !== undefined) {
        let slotProviderDescriptors = providerDescriptors.get(slot);

        if (slotProviderDescriptors === undefined) {
          slotProviderDescriptors = new Map<string, InstrumentProviderDescriptor>();
          providerDescriptors.set(slot, slotProviderDescriptors);
        }

        slotProviderDescriptors.set(
          providerId,
          normalizeProviderDescriptor({
            slot,
            providerId,
            descriptor: providerDescriptor,
          }),
        );
      }

      return ok(undefined);
    },

    async listProviders({ slot }) {
      return ok([...getSlotProviders(providers, slot).keys()]);
    },

    async listProviderDescriptors({ slot }) {
      return ok(
        [...getSlotProviderDescriptors(providerDescriptors, slot).values()]
          .map((descriptor) => structuredClone(descriptor)),
      );
    },

    async getProvider({ slot, providerId }) {
      const provider = getSlotProviders(providers, slot).get(providerId);

      if (provider === undefined) {
        return fail({
          code: "plugin.provider_not_found",
          message: `No provider registered for slot '${slot}' with id '${providerId}'.`,
          module: "plugins",
          retryable: false,
        });
      }

      return ok(provider);
    },
  };
}

function readProviderDescriptor(provider: unknown): InstrumentProviderDescriptor | undefined {
  if (typeof provider !== "object" || provider === null || !("descriptor" in provider)) {
    return undefined;
  }

  const descriptor = (provider as { descriptor?: unknown }).descriptor;

  if (isProviderDescriptor(descriptor)) {
    return descriptor;
  }

  return undefined;
}

function isProviderDescriptor(descriptor: unknown): descriptor is InstrumentProviderDescriptor {
  return (
    typeof descriptor === "object" &&
    descriptor !== null &&
    typeof (descriptor as { id?: unknown }).id === "string" &&
    typeof (descriptor as { label?: unknown }).label === "string" &&
    typeof (descriptor as { slot?: unknown }).slot === "string" &&
    typeof (descriptor as { status?: unknown }).status === "string"
  );
}

function normalizeProviderDescriptor({
  slot,
  providerId,
  descriptor,
}: {
  slot: CapabilitySlot;
  providerId: string;
  descriptor: InstrumentProviderDescriptor;
}): InstrumentProviderDescriptor {
  return structuredClone({
    ...descriptor,
    id: providerId,
    slot,
  });
}

function getSlotProviders(
  providers: Map<CapabilitySlot, Map<string, unknown>>,
  slot: CapabilitySlot,
): Map<string, unknown> {
  return providers.get(slot) ?? new Map<string, unknown>();
}

function getSlotProviderDescriptors(
  providerDescriptors: Map<CapabilitySlot, Map<string, InstrumentProviderDescriptor>>,
  slot: CapabilitySlot,
): Map<string, InstrumentProviderDescriptor> {
  return providerDescriptors.get(slot) ?? new Map<string, InstrumentProviderDescriptor>();
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
