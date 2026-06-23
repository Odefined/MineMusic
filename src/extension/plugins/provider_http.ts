// Shared HTTP robustness helpers for provider plugins (NCM, QQ, ...). Both
// plugins talk to a sibling local bridge process over plain fetch; this module
// owns the cross-cutting #88 concerns — a per-request timeout (so a hung bridge
// cannot block the calling path), a per-response byte cap streamed so a runaway
// bridge cannot OOM the process, and the mapping of those transport failures onto
// each plugin's existing *_provider_unavailable / *_malformed_response codes (no
// new error codes). Plugin-specific pre/post handling (URL building, payload issue
// checks, HTTP-status special cases like QQ 401) stays in each plugin; this module
// only owns the generic bound/abort/parse mechanics, parameterized by a profile.
import type { Result } from "../../contracts/kernel.js";
import { failExtension, ok } from "../errors.js";

export type ProviderHttpBounds = {
  timeoutMs: number;
  maxBytes: number;
};

export type ProviderHttpProfile = {
  /** Display label (e.g. "NCM", "QQ"), used in diagnostic messages. */
  providerLabel: string;
  /** Error code for invalid config (bounds validation failure). */
  invalidConfigCode: string;
  /** Error code for malformed or too-large responses. */
  malformedCode: string;
  /** Error code for transport unavailability (timeout, network, HTTP failure). */
  providerUnavailableCode: string;
};

// Default per-request timeout. Generous enough to never trip a slow-but-healthy
// bridge, tight enough that a hung process does not block the calling path. (#88)
export function defaultProviderRequestTimeoutMs(): number {
  return 10_000;
}

// Default per-response byte bound. Legit provider JSON payloads (search, library
// reads, lyrics, song url/detail) are well under 1 MiB; 5 MiB is a safe ceiling
// that bounds a runaway/misbehaving local bridge without tripping real traffic. (#88)
export function defaultProviderMaxResponseBytes(): number {
  return 5 * 1024 * 1024;
}

// Resolve the per-request HTTP bounds from plugin config. The timeout and byte cap
// each default to a safe constant when omitted, so a hung or runaway bridge is
// bounded without operators having to opt in. Both must be positive integers when
// present; anything else is invalid config surfaced at this boundary. (#88)
export function resolveProviderHttpBounds(
  config: Record<string, unknown>,
  profile: ProviderHttpProfile,
): Result<ProviderHttpBounds> {
  const timeoutMs = resolvePositiveIntegerBound(
    config.requestTimeoutMs,
    defaultProviderRequestTimeoutMs(),
    "requestTimeoutMs",
    "milliseconds value",
    profile,
  );

  if (!timeoutMs.ok) {
    return timeoutMs;
  }

  const maxBytes = resolvePositiveIntegerBound(
    config.maxResponseBytes,
    defaultProviderMaxResponseBytes(),
    "maxResponseBytes",
    "byte count",
    profile,
  );

  if (!maxBytes.ok) {
    return maxBytes;
  }

  return ok({
    timeoutMs: timeoutMs.value,
    maxBytes: maxBytes.value,
  });
}

function resolvePositiveIntegerBound(
  value: unknown,
  fallback: number,
  field: string,
  unit: string,
  profile: ProviderHttpProfile,
): Result<number> {
  if (value === undefined) {
    return ok(fallback);
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return failExtension(
      profile.invalidConfigCode,
      `${profile.providerLabel} plugin ${field} must be a positive integer ${unit} when present.`,
    );
  }

  return ok(value);
}

// fetch with an abort-on-timeout. A manual AbortController (rather than
// AbortSignal.timeout) lets us clearTimeout on settlement, so a fast response
// never leaves a pending timer that would keep the event loop alive in tests. The
// timeout only bounds a fetchImpl that honors the abort signal — the global fetch
// and the test stubs both do; a custom config.fetch that ignores init.signal and
// never settles would hang past the timeout (an inherent property of cooperative
// cancellation, not something this helper can force). (#88)
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: URL,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Read and JSON-parse a response body with a hard byte cap. The body is streamed
// (not buffered wholesale via .text()) so a response exceeding the cap is rejected
// mid-stream and cannot OOM the process; the cap is enforced before JSON.parse so a
// runaway response is rejected before it can be buffered. Failure mapping is split
// by channel so a torn connection is consistently retryable: transport-level failures
// during the read (a reader.read() rejection on a torn connection, or a response.text()
// rejection on a null body) map onto *_provider_unavailable, while a body that exceeds
// the cap or fails JSON.parse maps onto *_malformed_response. (#88)
export async function readBoundedJson(
  response: Response,
  maxBytes: number,
  profile: ProviderHttpProfile,
  origin: string,
): Promise<Result<unknown>> {
  const textResult = await readBoundedText(response, maxBytes, profile, origin);

  if (!textResult.ok) {
    return textResult;
  }

  try {
    return ok(JSON.parse(textResult.value));
  } catch {
    return failExtension(
      profile.malformedCode,
      `${profile.providerLabel} provider returned malformed JSON.`,
    );
  }
}

// Stream a response body into text with a hard byte cap. Anything thrown by the read
// is a transport-level failure (the body stream errored or the connection tore
// mid-body) and is mapped onto *_provider_unavailable via providerUnavailable; the
// oversize return stays *_malformed_response and JSON.parse is left to the caller. On
// the oversize path the reader is cancelled so a runaway bridge cannot keep the socket
// open after the response has been rejected — cancel runs before the finally
// releaseLock because it requires the lock held. (#88)
async function readBoundedText(
  response: Response,
  maxBytes: number,
  profile: ProviderHttpProfile,
  origin: string,
): Promise<Result<string>> {
  try {
    if (response.body === null) {
      return ok(await response.text());
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let assembled = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        received += value.byteLength;

        if (received > maxBytes) {
          await reader.cancel();
          return failExtension(
            profile.malformedCode,
            `${profile.providerLabel} provider response exceeded the ${maxBytes}-byte bound.`,
          );
        }

        assembled += decoder.decode(value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }

    return ok(assembled + decoder.decode());
  } catch (error) {
    return providerUnavailable(origin, error, profile);
  }
}

// A timed-out request is a transport-level "provider not responding": map it onto
// the profile's *_provider_unavailable code (retryable), with a message that names
// the timeout for diagnosis. Other transport errors keep the generic unavailable
// message. No new error code. (#88)
export function providerUnavailable(
  origin: string,
  error: unknown,
  profile: ProviderHttpProfile,
): Result<never> {
  return failExtension(
    profile.providerUnavailableCode,
    providerUnavailableMessage(origin, error, profile),
    undefined,
    true,
  );
}

function providerUnavailableMessage(
  origin: string,
  error: unknown,
  profile: ProviderHttpProfile,
): string {
  if (isAbortError(error)) {
    return `${profile.providerLabel} provider at ${origin} did not respond within the request timeout.`;
  }

  return `${profile.providerLabel} provider is unavailable at ${origin}.`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError");
}

// Type guard for the injected/global fetch impl. config.fetch arrives as unknown
// (plugin config is a Record<string, unknown>); narrowing with
// typeof === "function" alone widens to the broad Function type, which is not
// assignable to the fetch signature fetchWithTimeout expects. This predicate
// narrows to typeof fetch so the typed helper typechecks, with the same runtime
// check the prior `typeof fetchJson !== "function"` guard used.
export function isFetchImpl(value: unknown): value is typeof fetch {
  return typeof value === "function";
}
