import type { Result } from "../contracts/kernel.js";
import { isRefComponentSafe } from "../contracts/kernel.js";

export type CapabilityCardinality = "single" | "many" | "many-by-id";

export type CapabilityWritePolicy =
  | "none"
  | "request-scoped-only"
  | "application-service-command-only"
  | "core-only";

/**
 * The minimal structural view of a slot that the registry stores. The registry
 * only consults id / cardinality / writePolicy, never `validateRegistration`,
 * so storing this identity (instead of CapabilitySlot<unknown>) avoids the
 * variance problem that `validateRegistration` (contravariant in T) creates for
 * CapabilitySlot<SourceProvider> → CapabilitySlot<unknown> assignability.
 */
export type CapabilitySlotIdentity = {
  readonly id: string;
  readonly cardinality: CapabilityCardinality;
  readonly writePolicy: CapabilityWritePolicy;
};

export type CapabilityRegistrationValidationInput<T> = {
  pluginId: string;
  key: string;
  value: T;
};

export type CapabilitySlot<T> = {
  readonly id: string;
  readonly cardinality: CapabilityCardinality;
  readonly writePolicy: CapabilityWritePolicy;
  /**
   * Optional slot-specific validation run through the generic registration path.
   * Keeping this on the slot (rather than per-slot wrapper functions) is what
   * makes registration open/closed: a new slot declares its validator with the
   * slot and needs no PluginActivationContext or runtime change (ADR-0018).
   */
  readonly validateRegistration?: (
    input: CapabilityRegistrationValidationInput<T>,
  ) => Result<void>;
};

export type DefineCapabilitySlotInput<T> = {
  id: string;
  cardinality: CapabilityCardinality;
  writePolicy: CapabilityWritePolicy;
  validateRegistration?: (
    input: CapabilityRegistrationValidationInput<T>,
  ) => Result<void>;
};

export function defineCapabilitySlot<T>(
  input: DefineCapabilitySlotInput<T>,
): CapabilitySlot<T> {
  if (!isCapabilitySlotIdSafe(input.id)) {
    throw new Error(`Capability slot id '${input.id}' must be lowercase kebab-case.`);
  }

  return {
    id: input.id,
    cardinality: input.cardinality,
    writePolicy: input.writePolicy,
    ...(input.validateRegistration === undefined
      ? {}
      : { validateRegistration: input.validateRegistration }),
  };
}

export function isCapabilitySlotIdSafe(id: string): boolean {
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) && isRefComponentSafe(id);
}
