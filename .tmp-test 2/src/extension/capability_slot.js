import { isRefComponentSafe } from "../contracts/index.js";
export function defineCapabilitySlot(input) {
    if (!isCapabilitySlotIdSafe(input.id)) {
        throw new Error(`Capability slot id '${input.id}' must be lowercase kebab-case.`);
    }
    return {
        id: input.id,
        cardinality: input.cardinality,
        writePolicy: input.writePolicy,
    };
}
export function isCapabilitySlotIdSafe(id) {
    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) && isRefComponentSafe(id);
}
