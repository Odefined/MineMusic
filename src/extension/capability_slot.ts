import { isRefComponentSafe } from "../contracts/index.js";

export type CapabilityCardinality = "single" | "many" | "many-by-id";

export type CapabilityWritePolicy =
  | "none"
  | "request-scoped-only"
  | "application-service-command-only"
  | "core-only";

export type CapabilitySlot<T> = {
  readonly id: string;
  readonly cardinality: CapabilityCardinality;
  readonly writePolicy: CapabilityWritePolicy;
};

export type DefineCapabilitySlotInput = {
  id: string;
  cardinality: CapabilityCardinality;
  writePolicy: CapabilityWritePolicy;
};

export function defineCapabilitySlot<T>(input: DefineCapabilitySlotInput): CapabilitySlot<T> {
  if (!isCapabilitySlotIdSafe(input.id)) {
    throw new Error(`Capability slot id '${input.id}' must be lowercase kebab-case.`);
  }

  return {
    id: input.id,
    cardinality: input.cardinality,
    writePolicy: input.writePolicy,
  };
}

export function isCapabilitySlotIdSafe(id: string): boolean {
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) && isRefComponentSafe(id);
}
