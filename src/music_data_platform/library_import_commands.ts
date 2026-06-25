import type {
  BackgroundWorkBackend,
  BackgroundWorkSubmitResult,
} from "../background_work/index.js";
import { type Result, type StageError } from "../contracts/kernel.js";
import type { PlatformLibraryKind } from "../contracts/music_data_platform.js";
import { isUniqueViolation } from "../storage/index.js";
import type { SourceLibraryImportBatchRecord } from "./source_library_records.js";
import type { SourceLibraryImportService } from "./source_library_import.js";

export const LIBRARY_IMPORT_ADVANCE_JOB_TYPE = "music_data_platform.library_import_advance";

export type LibraryImportStartRequest = {
  providerId: string;
  providerAccountId?: string;
  libraryKind: PlatformLibraryKind;
  maxNewItems?: number;
};

export type LibraryImportStartSubmission = {
  batch: SourceLibraryImportBatchRecord;
  started: "created" | "reused";
  jobId?: string;
};

export type LibraryImportStartCommand = {
  submit(input: LibraryImportStartRequest): Promise<Result<LibraryImportStartSubmission>>;
};

export type CreateLibraryImportStartCommandInput = {
  start: Pick<SourceLibraryImportService, "startImport">;
  failBatch: Pick<SourceLibraryImportService, "markBatchFailed">;
  findRunningBatch(input: {
    ownerScope: string;
    providerId: string;
    libraryKind: PlatformLibraryKind;
  }): Promise<SourceLibraryImportBatchRecord | undefined>;
  backgroundWork: Pick<BackgroundWorkBackend, "submit">;
  ownerScope: string;
};

export function libraryImportAdvanceIdempotencyKey(batchId: string, cursor: string): string {
  return `library_import:advance:${batchId}:${cursor}`;
}

export function libraryImportJobSubmitFailureError(error: unknown): StageError {
  return {
    code: "music_data.source_library_import_job_submit_failed",
    message: error instanceof Error && error.message.length > 0
      ? error.message
      : "Library import failed to submit a background job.",
    area: "music_data_platform",
    retryable: true,
  };
}

export function createLibraryImportStartCommand(
  input: CreateLibraryImportStartCommandInput,
): LibraryImportStartCommand {
  return {
    async submit(request) {
      const validation = validateStartRequest(request);
      if (!validation.ok) {
        return validation;
      }

      const lookup = {
        ownerScope: input.ownerScope,
        providerId: request.providerId,
        libraryKind: request.libraryKind,
      };

      // Idempotent: a running batch for this library already has a self-driving chain in
      // progress — return it without submitting a duplicate first job.
      const existing = await input.findRunningBatch(lookup);
      if (existing !== undefined) {
        return ok({ batch: existing, started: "reused" });
      }

      let created: Result<{ batch: SourceLibraryImportBatchRecord }>;
      try {
        created = await input.start.startImport({
          providerId: request.providerId,
          ...(request.providerAccountId === undefined ? {} : { providerAccountId: request.providerAccountId }),
          libraryKind: request.libraryKind,
          ...(request.maxNewItems === undefined ? {} : { maxNewItems: request.maxNewItems }),
        });
      } catch (error) {
        // A concurrent start inserted a running batch between our check and insert,
        // hitting the partial unique index (Postgres SQLSTATE 23505). Treat as reuse.
        if (isUniqueViolation(error)) {
          const concurrent = await input.findRunningBatch(lookup);
          if (concurrent !== undefined) {
            return ok({ batch: concurrent, started: "reused" });
          }
        }
        throw error;
      }

      if (!created.ok) {
        return created;
      }

      const batch = created.value.batch;

      // Submit the first advance job (fire-and-forget). If submission fails, mark the
      // batch failed so we do not leave an orphan running batch with no driving job.
      let submitted: BackgroundWorkSubmitResult;
      try {
        submitted = await input.backgroundWork.submit({
          jobType: LIBRARY_IMPORT_ADVANCE_JOB_TYPE,
          payload: { batchId: batch.batchId },
          idempotencyKey: libraryImportAdvanceIdempotencyKey(batch.batchId, "init"),
        });
      } catch (error) {
        await input.failBatch.markBatchFailed({
          batchId: batch.batchId,
          error: libraryImportJobSubmitFailureError(error),
        });
        return failSubmit();
      }

      return ok({ batch, started: "created", jobId: submitted.jobId });
    },
  };
}

function validateStartRequest(request: LibraryImportStartRequest): Result<void> {
  if (!isPlatformLibraryKind(request.libraryKind)) {
    return fail(
      "music_data.invalid_source_library_import_input",
      "Library import libraryKind is not supported.",
    );
  }

  if (request.maxNewItems !== undefined && (!Number.isInteger(request.maxNewItems) || request.maxNewItems <= 0)) {
    return fail(
      "music_data.invalid_source_library_import_input",
      "Library import maxNewItems must be a positive integer when present.",
    );
  }

  return ok(undefined);
}

function isPlatformLibraryKind(value: unknown): value is PlatformLibraryKind {
  return value === "saved_source_track" || value === "saved_source_album" || value === "followed_source_artist";
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(code: string, message: string): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      area: "music_data_platform",
      retryable: false,
    },
  };
}

function failSubmit(): Result<never> {
  return {
    ok: false,
    error: {
      code: "music_data.source_library_import_job_submit_failed",
      message: "Library import failed to submit its first background job.",
      area: "music_data_platform",
      retryable: true,
    },
  };
}
