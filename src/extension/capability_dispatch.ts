// Generic capability dispatch skeleton (ADR-0018). The find → capability-check
// → invoke → result-shape-check → error-passthrough → output-validation ladder
// was duplicated byte-for-byte between searchSourceProvider and
// readPlatformLibraryProvider; this module owns it once. Each slot supplies a
// descriptor carrying only what varies: the label/codes for messages, the
// capability-support check, the provider invocation, the output validator, and
// the result shaper. capability_registry.ts stays registration-only.

import type { Result } from "../contracts/kernel.js";
import type {
  CapabilityRegistration,
  CapabilityRegistry,
} from "./capability_registry.js";
import type { CapabilitySlot } from "./capability_slot.js";
import { failExtension, ok } from "./errors.js";
import { isResultLike } from "./type_guards.js";

export type CapabilityDispatchDescriptor<T, OUT> = {
  /** Human-readable noun used in error messages, e.g. "Source provider". */
  readonly label: string;
  /** Error code for "no registration for this provider id". */
  readonly notFoundCode: string;
  /** Error code for invocation throw, malformed result, and provider failure. */
  readonly failedCode: string;
  /** Reject the registration if the provider cannot serve this call. */
  capabilityCheck(registration: CapabilityRegistration<T>): Result<void>;
  /** Call the provider method and return its raw result. */
  invoke(registration: CapabilityRegistration<T>): Promise<unknown>;
  /** Validate the provider's returned value. */
  validateOutput(value: unknown): Result<void>;
  /** Shape the validated value into the public result. */
  shapeResult(value: unknown): OUT;
};

export async function invokeCapability<T, OUT>(
  registry: CapabilityRegistry,
  slot: CapabilitySlot<T>,
  providerId: string,
  descriptor: CapabilityDispatchDescriptor<T, OUT>,
): Promise<Result<OUT>> {
  const registration = registry.get(slot, providerId);

  if (registration === undefined) {
    return failExtension(
      descriptor.notFoundCode,
      `${descriptor.label} '${providerId}' is not registered.`,
    );
  }

  const capabilitySupport = descriptor.capabilityCheck(registration);
  if (!capabilitySupport.ok) {
    return capabilitySupport;
  }

  let raw: unknown;

  try {
    raw = await descriptor.invoke(registration);
  } catch (cause) {
    return failExtension(
      descriptor.failedCode,
      `${descriptor.label} '${providerId}' invocation threw.`,
      cause,
    );
  }

  if (!isResultLike(raw)) {
    return failExtension(
      descriptor.failedCode,
      `${descriptor.label} '${providerId}' returned a malformed result.`,
      raw,
    );
  }

  if (!raw.ok) {
    return failExtension(
      descriptor.failedCode,
      `${descriptor.label} '${providerId}' invocation failed: ${raw.error.code} ${raw.error.message}`,
      raw.error,
      raw.error.retryable,
    );
  }

  const outputValidation = descriptor.validateOutput(raw.value);
  if (!outputValidation.ok) {
    return outputValidation;
  }

  return ok(descriptor.shapeResult(raw.value));
}
