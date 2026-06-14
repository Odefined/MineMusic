import {
  isRefComponentSafe,
  refKey,
  type Ref,
} from "../contracts/index.js";
import {
  MusicDataPlatformError,
  type MusicDataPlatformErrorCode,
} from "./errors.js";

type RefInput = Pick<Ref, "namespace" | "kind" | "id">;

export function assertMusicDataPlatformRefComponentSafe(input: {
  value: unknown;
  fieldName: string;
  code: MusicDataPlatformErrorCode;
  message?: string;
}): asserts input is {
  value: string;
  fieldName: string;
  code: MusicDataPlatformErrorCode;
  message?: string;
} {
  if (!isRefComponentSafe(input.value)) {
    throw new MusicDataPlatformError({
      code: input.code,
      message: input.message ?? `${input.fieldName} must be a non-empty ref-safe string.`,
    });
  }
}

export function assertMusicDataPlatformRefSafe(input: {
  ref: RefInput;
  fieldName: string;
  code: MusicDataPlatformErrorCode;
  message?: string;
}): void {
  assertMusicDataPlatformRefComponentSafe({
    value: input.ref.namespace,
    fieldName: `${input.fieldName}.namespace`,
    code: input.code,
    ...(input.message === undefined ? {} : { message: input.message }),
  });
  assertMusicDataPlatformRefComponentSafe({
    value: input.ref.kind,
    fieldName: `${input.fieldName}.kind`,
    code: input.code,
    ...(input.message === undefined ? {} : { message: input.message }),
  });
  assertMusicDataPlatformRefComponentSafe({
    value: input.ref.id,
    fieldName: `${input.fieldName}.id`,
    code: input.code,
    ...(input.message === undefined ? {} : { message: input.message }),
  });
}

export function musicDataPlatformRefKey(input: {
  ref: RefInput;
  fieldName: string;
  code: MusicDataPlatformErrorCode;
}): string {
  assertMusicDataPlatformRefSafe(input);
  return refKey(input.ref);
}

export function assertMusicDataPlatformPublicRefKey(input: {
  refKey: string;
  fieldName: string;
  code: MusicDataPlatformErrorCode;
}): void {
  if (typeof input.refKey !== "string" || input.refKey.length === 0) {
    throw new MusicDataPlatformError({
      code: input.code,
      message: `${input.fieldName} must be a non-empty ref key string.`,
    });
  }

  const parts = input.refKey.split(":");

  if (parts.length !== 3) {
    throw new MusicDataPlatformError({
      code: input.code,
      message: `${input.fieldName} must be a namespace:kind:id ref key.`,
    });
  }

  assertMusicDataPlatformRefSafe({
    ref: {
      namespace: parts[0]!,
      kind: parts[1]!,
      id: parts[2]!,
    },
    fieldName: input.fieldName,
    code: input.code,
  });
}
