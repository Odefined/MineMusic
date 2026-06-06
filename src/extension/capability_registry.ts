import { isRefComponentSafe, type Result } from "../contracts/index.js";
import type { CapabilitySlot } from "./capability_slot.js";
import { failExtension, ok } from "./errors.js";

export type CapabilityRegistration<T> = {
  pluginId: string;
  key: string;
  value: T;
};

export type CapabilityRegistry = {
  register<T>(slot: CapabilitySlot<T>, registration: CapabilityRegistration<T>): Result<void>;
  list<T>(slot: CapabilitySlot<T>): readonly CapabilityRegistration<T>[];
  get<T>(slot: CapabilitySlot<T>, key: string): CapabilityRegistration<T> | undefined;
};

export type CreateCapabilityRegistryInput = {
  slots: readonly CapabilitySlot<unknown>[];
};

type SlotState = {
  slot: CapabilitySlot<unknown>;
  registrations: CapabilityRegistration<unknown>[];
};

export function createCapabilityRegistry(input: CreateCapabilityRegistryInput): CapabilityRegistry {
  const slots = new Map<string, SlotState>();

  for (const slot of input.slots) {
    slots.set(slot.id, {
      slot,
      registrations: [],
    });
  }

  return {
    register<T>(slot: CapabilitySlot<T>, registration: CapabilityRegistration<T>): Result<void> {
      const state = slots.get(slot.id);

      if (state === undefined) {
        return failExtension(
          "extension.unknown_capability",
          `Capability slot '${slot.id}' is not known to this registry.`,
        );
      }

      if (state.slot.writePolicy === "core-only") {
        return failExtension(
          "extension.core_only_capability_registration",
          `Capability slot '${slot.id}' is core-only and cannot be registered by a plugin.`,
        );
      }

      if (!isRefComponentSafe(registration.key)) {
        return failExtension(
          "extension.invalid_capability_registration_key",
          `Capability registration key '${registration.key}' must be non-empty and must not contain ':'.`,
        );
      }

      if (state.slot.cardinality === "single" && state.registrations.length > 0) {
        return failExtension(
          "extension.duplicate_capability_registration",
          `Capability slot '${slot.id}' allows only one registration.`,
        );
      }

      if (
        state.slot.cardinality === "many-by-id" &&
        state.registrations.some((existing) => existing.key === registration.key)
      ) {
        return failExtension(
          "extension.duplicate_capability_registration",
          `Capability slot '${slot.id}' already has registration '${registration.key}'.`,
        );
      }

      state.registrations.push(registration as CapabilityRegistration<unknown>);
      return ok(undefined);
    },
    list<T>(slot: CapabilitySlot<T>): readonly CapabilityRegistration<T>[] {
      return [...(slots.get(slot.id)?.registrations ?? [])] as CapabilityRegistration<T>[];
    },
    get<T>(slot: CapabilitySlot<T>, key: string): CapabilityRegistration<T> | undefined {
      return slots.get(slot.id)?.registrations.find((registration) => registration.key === key) as
        | CapabilityRegistration<T>
        | undefined;
    },
  };
}
