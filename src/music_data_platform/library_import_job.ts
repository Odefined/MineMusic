import type {
  BackgroundWorkBackend,
  BackgroundWorkHandler,
} from "../background_work/index.js";
import { type StageError } from "../contracts/kernel.js";
import type { SourceLibraryImportBatchRecord } from "./source_library_records.js";
import type { SourceLibraryImportService } from "./source_library_import.js";
import {
  LIBRARY_IMPORT_ADVANCE_JOB_TYPE,
  libraryImportJobSubmitFailureError,
  libraryImportAdvanceIdempotencyKey,
} from "./library_import_commands.js";

export type LibraryImportAdvanceJobPayload = {
  batchId: string;
};

export type LibraryImportJobRetryPolicy = {
  limit: number;
  backoffMs: number;
};

export type CreateLibraryImportJobHandlerInput = {
  advance: Pick<SourceLibraryImportService, "advanceOnePage">;
  failBatch: Pick<SourceLibraryImportService, "markBatchFailed">;
  backgroundWork: Pick<BackgroundWorkBackend, "submit">;
  pacingDelayMs: number;
  retry: LibraryImportJobRetryPolicy;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

// Each job advances ONE provider page, then submits the next job when the batch is still
// running with a cursor (chained self-driving). Provider-page failures (read call +
// batch-membership validation) are returned by advanceOnePage as Result(false) WITHOUT
// marking the batch failed, so they are retried here with backoff; retry exhaustion marks
// the batch failed. Write failures and post-Extension invariant violations throw out of
// advanceOnePage (batch already marked failed) and are propagated, not retried.
export function createLibraryImportJobHandler(
  input: CreateLibraryImportJobHandlerInput,
): BackgroundWorkHandler<Record<string, unknown>> {
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? defaultSleep;

  return async (job) => {
    if (job.jobType !== LIBRARY_IMPORT_ADVANCE_JOB_TYPE) {
      throw new Error(`Library import handler received unexpected job type '${job.jobType}'.`);
    }

    const batchId = parseAdvancePayload(job.payload).batchId;

    let attempt = 0;
    let advanced: { batch: SourceLibraryImportBatchRecord } | undefined;

    while (advanced === undefined) {
      attempt += 1;
      // advanceOnePage throws only for non-retriable failures (write failure /
      // post-Extension invariant) — propagate those immediately.
      const result = await input.advance.advanceOnePage({ batchId });

      if (result.ok) {
        advanced = result.value;
        break;
      }

      if (attempt >= input.retry.limit) {
        await input.failBatch.markBatchFailed({ batchId, error: result.error });
        throw new LibraryImportAdvanceError(batchId, attempt, result.error);
      }

      await sleep(input.retry.backoffMs * 2 ** (attempt - 1));
    }

    const batch = advanced!.batch;

    // Chain: submit the next advance job when the batch is still running with a cursor.
    // A completed/failed batch or an exhausted provider (no nextCursor) terminates the chain.
    if (batch.status === "running" && batch.cursor !== undefined) {
      const runAfter = new Date(now().getTime() + input.pacingDelayMs);
      try {
        await input.backgroundWork.submit({
          jobType: LIBRARY_IMPORT_ADVANCE_JOB_TYPE,
          payload: { batchId },
          idempotencyKey: libraryImportAdvanceIdempotencyKey(batchId, batch.cursor),
          runAfter,
        });
      } catch (error) {
        const failure = libraryImportJobSubmitFailureError(error);
        await input.failBatch.markBatchFailed({ batchId, error: failure });
        throw new LibraryImportNextSubmitError(batchId, batch.cursor, failure, error);
      }
    }
  };
}

function parseAdvancePayload(payload: unknown): LibraryImportAdvanceJobPayload {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Library import advance job payload must be an object.");
  }
  const batchId = (payload as { batchId?: unknown }).batchId;
  if (typeof batchId !== "string" || batchId.length === 0) {
    throw new Error("Library import advance job payload batchId must be a non-empty string.");
  }
  return { batchId };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class LibraryImportAdvanceError extends Error {
  constructor(batchId: string, attempts: number, failure: StageError) {
    super(
      `Library import advance failed for batch '${batchId}' after ${attempts} attempt(s): ${failure.code}: ${failure.message}`,
    );
    this.name = "LibraryImportAdvanceError";
  }
}

class LibraryImportNextSubmitError extends Error {
  constructor(batchId: string, cursor: string, failure: StageError, cause: unknown) {
    super(
      `Library import failed to submit next advance job for batch '${batchId}' at cursor '${cursor}': ${failure.code}: ${failure.message}`,
    );
    this.name = "LibraryImportNextSubmitError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
