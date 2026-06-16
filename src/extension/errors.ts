import type { Result, StageError } from "../contracts/kernel.js";

export function extensionError(
  code: string,
  message: string,
  cause?: unknown,
  retryable = false,
): StageError {
  return {
    code,
    message,
    area: "extension",
    retryable,
    ...(cause === undefined ? {} : { cause }),
  };
}

export function failExtension<T = never>(
  code: string,
  message: string,
  cause?: unknown,
  retryable = false,
): Result<T> {
  return {
    ok: false,
    error: extensionError(code, message, cause, retryable),
  };
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
