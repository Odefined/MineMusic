import { isRefComponentSafe } from "../contracts/index.js";
import { failExtension, ok } from "./errors.js";
export function createCapabilityRegistry(input) {
    const slots = new Map();
    for (const slot of input.slots) {
        slots.set(slot.id, {
            slot,
            registrations: [],
        });
    }
    return {
        register(slot, registration) {
            const state = slots.get(slot.id);
            if (state === undefined) {
                return failExtension("extension.unknown_capability", `Capability slot '${slot.id}' is not known to this registry.`);
            }
            if (state.slot.writePolicy === "core-only") {
                return failExtension("extension.core_only_capability_registration", `Capability slot '${slot.id}' is core-only and cannot be registered by a plugin.`);
            }
            if (!isRefComponentSafe(registration.key)) {
                return failExtension("extension.invalid_capability_registration_key", `Capability registration key '${registration.key}' must be non-empty and must not contain ':'.`);
            }
            if (state.slot.cardinality === "single" && state.registrations.length > 0) {
                return failExtension("extension.duplicate_capability_registration", `Capability slot '${slot.id}' allows only one registration.`);
            }
            if (state.slot.cardinality === "many-by-id" &&
                state.registrations.some((existing) => existing.key === registration.key)) {
                return failExtension("extension.duplicate_capability_registration", `Capability slot '${slot.id}' already has registration '${registration.key}'.`);
            }
            state.registrations.push(registration);
            return ok(undefined);
        },
        list(slot) {
            return [...(slots.get(slot.id)?.registrations ?? [])];
        },
        get(slot, key) {
            return slots.get(slot.id)?.registrations.find((registration) => registration.key === key);
        },
    };
}
