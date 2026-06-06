import type { Result, StageError } from "../contracts/index.js";

export function extensionError(code: string, message: string, cause?: unknown): StageError {
  return {
    code,
    message,
    area: "extension",
    retryable: false,
    ...(cause === undefined ? {} : { cause }),
  };
}

export function failExtension<T = never>(code: string, message: string, cause?: unknown): Result<T> {
  return {
    ok: false,
    error: extensionError(code, message, cause),
  };
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
