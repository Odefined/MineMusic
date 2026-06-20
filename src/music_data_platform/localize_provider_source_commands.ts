import type {
  BackgroundWorkBackend,
  BackgroundWorkSubmitResult,
} from "../background_work/index.js";
import {
  refKey,
  type Ref,
  type Result,
} from "../contracts/kernel.js";
import {
  LOCALIZE_PROVIDER_SOURCE_JOB_TYPE,
  LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION,
  providerIdFromSourceNamespace,
  type LocalizeProviderSourceJobPayload,
  type LocalizeProviderSourcePayloadRef,
} from "./localize_provider_source_job.js";
import { MusicDataPlatformError } from "./errors.js";
import { musicDataPlatformRefKey } from "./ref_validation.js";

export type LocalizeProviderSourceRequest = {
  sourceRef: Ref;
  preferredBitrate?: number;
  runAfter?: Date;
};

export type LocalizeProviderSourceSubmissionResult = BackgroundWorkSubmitResult & {
  jobType: typeof LOCALIZE_PROVIDER_SOURCE_JOB_TYPE;
  targetPolicyVersion: typeof LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION;
};

export type LocalizeProviderSourceCommand = {
  submit(input: LocalizeProviderSourceRequest): Promise<Result<LocalizeProviderSourceSubmissionResult>>;
};

export type CreateLocalizeProviderSourceCommandInput = {
  backgroundWork: Pick<BackgroundWorkBackend, "submit">;
};

export function createLocalizeProviderSourceCommand(
  input: CreateLocalizeProviderSourceCommandInput,
): LocalizeProviderSourceCommand {
  return {
    async submit(request) {
      const validation = validateRequest(request);
      if (!validation.ok) {
        return validation;
      }

      const sourceRef = payloadRefFor(request.sourceRef);
      const submitted = await input.backgroundWork.submit<LocalizeProviderSourceJobPayload>({
        jobType: LOCALIZE_PROVIDER_SOURCE_JOB_TYPE,
        payload: {
          sourceRef,
          targetPolicyVersion: LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION,
          ...(request.preferredBitrate === undefined ? {} : { preferredBitrate: request.preferredBitrate }),
        },
        idempotencyKey: localizeProviderSourceIdempotencyKey({
          sourceRef,
          ...(request.preferredBitrate === undefined ? {} : { preferredBitrate: request.preferredBitrate }),
        }),
        ...(request.runAfter === undefined ? {} : { runAfter: request.runAfter }),
      });

      return ok({
        ...submitted,
        jobType: LOCALIZE_PROVIDER_SOURCE_JOB_TYPE,
        targetPolicyVersion: LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION,
      });
    },
  };
}

export function localizeProviderSourceIdempotencyKey(input: {
  sourceRef: LocalizeProviderSourcePayloadRef;
  preferredBitrate?: number;
}): string {
  return [
    `source:${refKey(input.sourceRef)}`,
    `bitrate:${input.preferredBitrate ?? "provider_default"}`,
    `targetPolicy:${LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION}`,
  ].join("|");
}

function validateRequest(request: LocalizeProviderSourceRequest): Result<void> {
  if (!isRecord(request)) {
    return failLocalizeSubmit("music_data.localize_invalid_request", "Localize request must be an object.");
  }

  const sourceRefValidation = validateSourceRef(request.sourceRef);
  if (!sourceRefValidation.ok) {
    return sourceRefValidation;
  }

  if (request.sourceRef.kind !== "track") {
    return failLocalizeSubmit("music_data.localize_no_audio_stream", "Localize requires a track sourceRef; albums and artists have no audio stream.");
  }

  if (providerIdFromSourceNamespace(request.sourceRef.namespace) === undefined) {
    return failLocalizeSubmit(
      "music_data.localize_provider_unresolved",
      `Cannot resolve provider id from source namespace '${request.sourceRef.namespace}'.`,
    );
  }

  if (
    request.preferredBitrate !== undefined &&
    (!Number.isInteger(request.preferredBitrate) || request.preferredBitrate <= 0)
  ) {
    return failLocalizeSubmit("music_data.localize_invalid_bitrate", "Localize request preferredBitrate must be a positive integer when present.");
  }

  return ok(undefined);
}

function payloadRefFor(sourceRef: Ref): LocalizeProviderSourcePayloadRef {
  return {
    namespace: sourceRef.namespace,
    kind: sourceRef.kind,
    id: sourceRef.id,
  };
}

function validateSourceRef(value: unknown): Result<LocalizeProviderSourcePayloadRef> {
  if (!isRecord(value)) {
    return failLocalizeSubmit("music_data.localize_invalid_source_ref", "Localize request sourceRef must be an object.");
  }

  if (
    typeof value.namespace !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.id !== "string"
  ) {
    return failLocalizeSubmit("music_data.localize_invalid_source_ref", "Localize request sourceRef must contain string namespace, kind, and id.");
  }

  const sourceRef = {
    namespace: value.namespace,
    kind: value.kind,
    id: value.id,
  };

  try {
    musicDataPlatformRefKey({
      ref: sourceRef,
      fieldName: "sourceRef",
      code: "music_data.localize_invalid_source_ref",
    });
  } catch (cause) {
    if (cause instanceof MusicDataPlatformError) {
      return failLocalizeSubmit(cause.code, cause.message);
    }
    throw cause;
  }

  return ok(sourceRef);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function failLocalizeSubmit(code: string, message: string, retryable = false): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      area: "music_data_platform",
      retryable,
    },
  };
}
