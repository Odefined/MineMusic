import assert from "node:assert/strict";

import type { BackgroundWorkSubmitInput } from "../../src/background_work/index.js";
import type { Result, StageError } from "../../src/contracts/kernel.js";
import {
  createLibraryImportJobHandler,
  LIBRARY_IMPORT_ADVANCE_JOB_TYPE,
  libraryImportAdvanceIdempotencyKey,
  type SourceLibraryImportBatchRecord,
} from "../../src/music_data_platform/index.js";

const now = "2026-06-21T00:00:00.000Z";

{
  const submitCalls: BackgroundWorkSubmitInput<Record<string, unknown>>[] = [];
  const failedBatches: { batchId: string; error: StageError }[] = [];
  const handler = createLibraryImportJobHandler({
    advance: {
      async advanceOnePage(): Promise<Result<{ batch: SourceLibraryImportBatchRecord }>> {
        return ok({
          batch: batchRecord({
            status: "running",
            cursor: "page-2",
          }),
        });
      },
    },
    failBatch: {
      async markBatchFailed(input) {
        failedBatches.push(input);
      },
    },
    backgroundWork: {
      async submit(input) {
        submitCalls.push(input as BackgroundWorkSubmitInput<Record<string, unknown>>);
        throw new Error("queue unavailable");
      },
    },
    pacingDelayMs: 3000,
    retry: { limit: 3, backoffMs: 1 },
    now: () => new Date(now),
    sleep: async () => {},
  });

  await assert.rejects(async () => await handler({
    jobId: "job-1",
    jobType: LIBRARY_IMPORT_ADVANCE_JOB_TYPE,
    payload: { batchId: "batch-1" },
    signal: new AbortController().signal,
  }), /queue unavailable/u);

  assert.deepEqual(submitCalls, [
    {
      jobType: LIBRARY_IMPORT_ADVANCE_JOB_TYPE,
      payload: { batchId: "batch-1" },
      idempotencyKey: libraryImportAdvanceIdempotencyKey("batch-1", "page-2"),
      runAfter: new Date("2026-06-21T00:00:03.000Z"),
    },
  ]);
  assert.deepEqual(failedBatches, [
    {
      batchId: "batch-1",
      error: {
        code: "music_data.source_library_import_job_submit_failed",
        message: "queue unavailable",
        area: "music_data_platform",
        retryable: true,
      },
    },
  ]);
}

function batchRecord(overrides: Partial<SourceLibraryImportBatchRecord> = {}): SourceLibraryImportBatchRecord {
  return {
    batchId: "batch-1",
    ownerScope: "local",
    providerId: "netease",
    libraryKind: "saved_source_track",
    status: "running",
    processedCount: 0,
    importedCount: 0,
    alreadyPresentCount: 0,
    failedCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function ok<T>(value: T): Result<T> {
  return {
    ok: true,
    value,
  };
}
