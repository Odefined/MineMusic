import type {
  CapabilitySlot,
  Result,
  StageError,
} from "../contracts/index.js";
import type { PluginRegistryPort } from "../ports/index.js";

export function createPluginRegistry(): PluginRegistryPort {
  const providers = new Map<CapabilitySlot, Map<string, unknown>>();

  return {
    async registerProvider({ slot, providerId, provider }) {
      let slotProviders = providers.get(slot);

      if (slotProviders === undefined) {
        slotProviders = new Map<string, unknown>();
        providers.set(slot, slotProviders);
      }

      slotProviders.set(providerId, provider);

      return ok(undefined);
    },

    async listProviders({ slot }) {
      return ok([...getSlotProviders(providers, slot).keys()]);
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

function getSlotProviders(
  providers: Map<CapabilitySlot, Map<string, unknown>>,
  slot: CapabilitySlot,
): Map<string, unknown> {
  return providers.get(slot) ?? new Map<string, unknown>();
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
