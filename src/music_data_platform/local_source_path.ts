import { MusicDataPlatformError, type MusicDataPlatformErrorCode } from "./errors.js";
import { assertMusicDataPlatformRefComponentSafe } from "./ref_validation.js";

export const MAIN_LOCAL_SOURCE_ROOT_ID = "main";

export function assertLocalSourceRootId(
  value: string,
  code: MusicDataPlatformErrorCode = "music_data.local_source_ref_invalid",
): void {
  assertMusicDataPlatformRefComponentSafe({
    value,
    fieldName: "rootId",
    code,
    message: "Local source rootId must be a non-empty ref-safe string.",
  });
}

export function normalizeLocalSourceRelativePath(
  value: string,
  code: MusicDataPlatformErrorCode = "music_data.local_source_ref_invalid",
): string {
  if (typeof value !== "string") {
    throw invalidLocalSourcePath(code, "Local source relativePath must be a string.");
  }
  if (value.length === 0) {
    throw invalidLocalSourcePath(code, "Local source relativePath must be non-empty.");
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    throw invalidLocalSourcePath(code, "Local source relativePath must not contain control characters.");
  }
  if (/^[A-Za-z]:/u.test(value)) {
    throw invalidLocalSourcePath(code, "Local source relativePath must not be a drive path.");
  }

  const slashPath = value.replace(/\\/gu, "/");
  if (slashPath.startsWith("/")) {
    throw invalidLocalSourcePath(code, "Local source relativePath must not be absolute.");
  }

  const parts: string[] = [];
  for (const part of slashPath.split("/")) {
    if (part.length === 0 || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length === 0) {
        throw invalidLocalSourcePath(code, "Local source relativePath must not escape its root.");
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  const normalized = parts.join("/");
  if (normalized.length === 0) {
    throw invalidLocalSourcePath(code, "Local source relativePath must identify a file below its root.");
  }
  return normalized;
}

export function assertNormalizedLocalSourceRelativePath(
  value: string,
  code: MusicDataPlatformErrorCode = "music_data.local_source_ref_invalid",
): void {
  const normalized = normalizeLocalSourceRelativePath(value, code);
  if (normalized !== value) {
    throw invalidLocalSourcePath(code, "Local source relativePath must already be MineMusic-normalized.");
  }
}

export function normalizeLocalSourceContentMd5(
  value: string,
  code: MusicDataPlatformErrorCode = "music_data.local_source_ref_invalid",
): string {
  if (typeof value !== "string") {
    throw invalidLocalSourcePath(code, "Local source contentMd5 must be a string.");
  }
  const normalized = value.toLowerCase();
  assertLocalSourceContentMd5(normalized, code);
  return normalized;
}

export function assertLocalSourceContentMd5(
  value: string,
  code: MusicDataPlatformErrorCode = "music_data.local_source_ref_invalid",
): void {
  assertMusicDataPlatformRefComponentSafe({
    value,
    fieldName: "contentMd5",
    code,
    message: "Local source contentMd5 must be a non-empty ref-safe string.",
  });
  if (!/^[0-9a-f]{32}$/u.test(value)) {
    throw invalidLocalSourcePath(code, "Local source contentMd5 must be 32 lowercase hex characters.");
  }
}

function invalidLocalSourcePath(
  code: MusicDataPlatformErrorCode,
  message: string,
): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code,
    message,
  });
}
