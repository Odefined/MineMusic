import type {
  BackgroundWorkBackend,
  BackgroundWorkHandler,
  BackgroundWorkSubmitInput,
} from "../background_work/index.js";
import type { Result } from "../contracts/kernel.js";
import type { LocalSourceScanFilesystemPort } from "./local_source_scan_filesystem_port.js";
import type { LocalSourceScanReadPort } from "./local_source_scan_read_model.js";
import type { LocalSourceScanService } from "./local_source_scan_service.js";
import type { LocalSourceScanBatchRecord, LocalSourceScanWorkItemRecord } from "./local_source_scan_records.js";
import type { LocalSourceScanExclusions } from "./local_source_scan_policy.js";
import {
  DISCOVERY_DIRECTORY_CHUNK,
  LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE,
  PROCESSING_AUDIO_CHUNK,
  RECONCILIATION_DELETION_CHUNK,
  type LocalSourceScanAdvanceCommands,
  type LocalSourceScanAudioInspectOutcome,
} from "./local_source_scan_advance_commands.js";
import { isTerminalScanBatchStatus } from "./local_source_scan_state.js";

// Phase 26C self-driving advance job (D42, D44). Each invocation reads the
// durable batch phase, advances one bounded unit (directory discovery or audio
// processing), and submits the next job with a deterministic
// generation-keyed id only while the batch remains non-terminal. Payloads carry
// only `{ batchId }` — no paths, parser output, or counters cross the job
// boundary. The handler performs filesystem I/O between bounded units and calls
// the advance command boundary for every durable write; it never touches
// repositories or SQL directly.

export type LocalSourceScanAdvanceJobPayload = {
  batchId: string;
};

export function localSourceScanAdvanceIdempotencyKey(batchId: string, advanceGeneration: number): string {
  return `local_source_scan:advance:${batchId}:${advanceGeneration}`;
}

// pg-boss retry policy for scan advance jobs. Unlike library import (which
// retries provider-page reads in an in-handler backoff loop), the scan advance
// handler performs one bounded unit per job and relies on pg-boss to retry the
// whole job on transient failure. pg-boss's queue default is retryLimit 2 with
// retryDelay 0 and no backoff, so transient failures (a momentarily locked DB,
// a briefly unavailable root) are retried immediately and can exhaust the
// budget before the system recovers. The composition root declares an explicit
// policy with a base delay and exponential backoff so retries get breathing
// room, and threads it into the start command, the re-chain submit, and D44
// startup recovery. The handler's `isFinalAttempt` reads `job.retryLimit`
// (populated by pg-boss from this policy) to mark the batch failed only on the
// last attempt.
export type LocalSourceScanSubmitRetry = Pick<
  BackgroundWorkSubmitInput,
  "retryLimit" | "retryDelay" | "retryBackoff"
>;

export type CreateLocalSourceScanAdvanceJobHandlerInput = {
  read: Pick<LocalSourceScanReadPort, "getBatch" | "listPendingDirectories" | "listPendingAudioFiles">;
  filesystemPort: LocalSourceScanFilesystemPort;
  commands: LocalSourceScanAdvanceCommands;
  backgroundWork: Pick<BackgroundWorkBackend, "submit">;
  resolveExclusions(rootId: string): LocalSourceScanExclusions;
  now?: () => string;
  directoryChunk?: number;
  audioChunk?: number;
  deletionChunk?: number;
  maxConcurrentFiles?: number;
  // Spread into the re-chain submit so pg-boss retries transient failures and
  // `isFinalAttempt` sees a non-zero retryLimit. Optional for backward
  // compatibility with tests that drive the handler directly.
  submitRetry?: LocalSourceScanSubmitRetry;
};

export function createLocalSourceScanAdvanceJobHandler(
  input: CreateLocalSourceScanAdvanceJobHandlerInput,
): BackgroundWorkHandler<LocalSourceScanAdvanceJobPayload> {
  const now = input.now ?? (() => new Date().toISOString());
  const directoryChunk = input.directoryChunk ?? DISCOVERY_DIRECTORY_CHUNK;
  const audioChunk = input.audioChunk ?? PROCESSING_AUDIO_CHUNK;
  const deletionChunk = input.deletionChunk ?? RECONCILIATION_DELETION_CHUNK;
  const maxConcurrentFiles = input.maxConcurrentFiles ?? 4;

  return async (job) => {
    if (job.jobType !== LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE) {
      throw new Error(`Local source scan handler received unexpected job type '${job.jobType}'.`);
    }
    const batchId = parseAdvancePayload(job.payload).batchId;
    const batch = await input.read.getBatch({ batchId });
    if (batch === undefined || isTerminalScanBatchStatus(batch.status)) {
      return;
    }

    // Cancellation observed between bounded units (D18): finalize as cancelled
    // and stop the chain. The current unit's already-committed work survives.
    if (batch.status === "cancel_requested") {
      await input.commands.finalize({ batchId, now: now() });
      return;
    }

    const exclusions = input.resolveExclusions(batch.rootId);

    try {
      if (batch.phase === undefined || batch.phase === "discovering") {
        await runDiscoveryStep({ input, batch, exclusions, directoryChunk, now: now() });
      } else if (batch.phase === "processing") {
        await runProcessingStep({ input, batch, audioChunk, maxConcurrentFiles, now: now() });
      } else {
        // reconciling: bounded deletion of disappeared Sources (D7, D8, D10).
        // When no candidates remain, finalize; otherwise fall through to bump
        // and resubmit for the next chunk. Reconciliation is uncancellable
        // (D43): a cancel_requested batch reaches this branch only if cancel
        // was accepted earlier, which is rejected once reconciling begins.
        const { candidatesRemaining } = await input.commands.advanceReconciliation({ batchId, limit: deletionChunk, now: now() });
        if (candidatesRemaining === 0) {
          await input.commands.finalize({ batchId, now: now() });
          return;
        }
      }
    } catch (cause) {
      // Transient system failures (adapter throw, db failure) propagate so
      // Background Work retries the bounded job. On the final attempt, mark the
      // batch failed so retry exhaustion never strands a non-terminal batch.
      if (isFinalAttempt(job)) {
        await input.commands.markBatchFailed({
          batchId,
          code: "music_data.scan_batch_failed",
          message: cause instanceof Error && cause.message.length > 0 ? cause.message : "Scan batch failed after retry exhaustion.",
          now: now(),
        });
      }
      throw cause;
    }

    // Re-chain: bump the generation and submit the next job with a deterministic
    // id while the batch is still active. bumpAdvanceGeneration returns undefined
    // for a terminal batch, which stops the chain.
    const nextGeneration = await input.commands.bumpAdvanceGeneration({ batchId, now: now() });
    if (nextGeneration === undefined) {
      return;
    }
    try {
      await input.backgroundWork.submit({
        jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE,
        payload: { batchId },
        idempotencyKey: localSourceScanAdvanceIdempotencyKey(batchId, nextGeneration),
        ...(input.submitRetry ?? {}),
      });
    } catch (cause) {
      await input.commands.markBatchFailed({
        batchId,
        code: "music_data.scan_job_submit_failed",
        message: cause instanceof Error && cause.message.length > 0 ? cause.message : "Scan failed to submit its next background job.",
        now: now(),
      });
    }
  };
}

async function runDiscoveryStep(args: {
  input: CreateLocalSourceScanAdvanceJobHandlerInput;
  batch: LocalSourceScanBatchRecord;
  exclusions: LocalSourceScanExclusions;
  directoryChunk: number;
  now: string;
}): Promise<void> {
  const { input, batch, exclusions, directoryChunk, now } = args;
  const dirs = await input.read.listPendingDirectories({ batchId: batch.batchId, limit: directoryChunk });
  for (const dir of dirs) {
    const listing = await input.filesystemPort.listDirectory({
      rootId: batch.rootId,
      relativeDirectoryPath: dir.relativePath,
    });
    if (!listing.ok) {
      // Per-DIRECTORY unreadable is census-fatal (D10, D27): the traversal is
      // untrusted, so the batch fails and reconciliation never runs.
      await input.commands.markBatchFailed({
        batchId: batch.batchId,
        code: "music_data.scan_directory_unreadable",
        message: listing.error.message,
        now,
      });
      return;
    }
    await input.commands.enqueueDirectoryChildren({
      batchId: batch.batchId,
      parentRelativePath: dir.relativePath,
      entries: listing.value,
      exclusions,
      now,
    });
  }
  // If the directory frontier is exhausted, complete the census and advance to
  // processing (fixing the discovered-file total).
  const remaining = await input.read.listPendingDirectories({ batchId: batch.batchId, limit: 1 });
  if (remaining.length === 0) {
    await input.commands.completeCensus({ batchId: batch.batchId, now });
  }
}

async function runProcessingStep(args: {
  input: CreateLocalSourceScanAdvanceJobHandlerInput;
  batch: LocalSourceScanBatchRecord;
  audioChunk: number;
  maxConcurrentFiles: number;
  now: string;
}): Promise<void> {
  const { input, batch, audioChunk, maxConcurrentFiles, now } = args;
  const files = await input.read.listPendingAudioFiles({ batchId: batch.batchId, limit: audioChunk });
  await runWithConcurrency(files, maxConcurrentFiles, async (file) => {
    const inspected = await input.filesystemPort.inspectAudioFile({
      rootId: batch.rootId,
      relativePath: file.relativePath,
    });
    const inspectOutcome: LocalSourceScanAudioInspectOutcome = inspected.ok
      ? { kind: "ok", contentMd5: inspected.value.contentMd5, metadata: inspected.value.metadata }
      : { kind: "failed", code: inspected.error.code, message: inspected.error.message };
    await input.commands.recordAudioOutcome({
      batchId: batch.batchId,
      relativePath: file.relativePath,
      workSizeBytes: file.sizeBytes,
      workModifiedAtMs: file.modifiedAtMs,
      inspect: inspectOutcome,
      now,
    });
  });
  // If no audio work remains, hand off to reconciliation (26D runs deletion).
  const remaining = await input.read.listPendingAudioFiles({ batchId: batch.batchId, limit: 1 });
  if (remaining.length === 0) {
    await input.commands.prepareReconciliation({ batchId: batch.batchId, now });
  }
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  if (concurrency < 1) {
    throw new Error("Scan processing concurrency must be at least 1.");
  }
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item !== undefined) {
        await task(item);
      }
    }
  }
  const workers: Promise<void>[] = [];
  const width = Math.min(concurrency, items.length);
  for (let i = 0; i < width; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
}

function isFinalAttempt(job: { retryCount?: number; retryLimit?: number }): boolean {
  return job.retryCount !== undefined && job.retryLimit !== undefined && job.retryCount >= job.retryLimit;
}

function parseAdvancePayload(payload: unknown): LocalSourceScanAdvanceJobPayload {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Local source scan advance job payload must be an object.");
  }
  const batchId = (payload as { batchId?: unknown }).batchId;
  if (typeof batchId !== "string" || batchId.length === 0) {
    throw new Error("Local source scan advance job payload batchId must be a non-empty string.");
  }
  return { batchId };
}

// startScan wrapper (D17): creates the durable batch via the service, then
// submits the first advance job (generation 0). A submit failure fails the
// batch so no orphan active batch is left without a driving job. Mirrors the
// library-import start command boundary.
export type LocalSourceScanStartCommand = {
  submit(input: { rootId: string }): Promise<Result<{ batchId: string }>>;
};

export type CreateLocalSourceScanStartCommandInput = {
  service: Pick<LocalSourceScanService, "startScan">;
  advanceCommands: Pick<LocalSourceScanAdvanceCommands, "markBatchFailed">;
  backgroundWork: Pick<BackgroundWorkBackend, "submit">;
  now?: () => string;
  // Spread into the first advance submit (generation 0) so the opening job is
  // retryable. Optional for backward compatibility.
  submitRetry?: LocalSourceScanSubmitRetry;
};

export function createLocalSourceScanStartCommand(
  input: CreateLocalSourceScanStartCommandInput,
): LocalSourceScanStartCommand {
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async submit({ rootId }) {
      const started = await input.service.startScan({ rootId });
      if (!started.ok) {
        return started;
      }
      const batchId = started.value.batchId;
      try {
        await input.backgroundWork.submit({
          jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE,
          payload: { batchId },
          idempotencyKey: localSourceScanAdvanceIdempotencyKey(batchId, 0),
          ...(input.submitRetry ?? {}),
        });
      } catch (cause) {
        await input.advanceCommands.markBatchFailed({
          batchId,
          code: "music_data.scan_job_submit_failed",
          message: cause instanceof Error && cause.message.length > 0 ? cause.message : "Scan failed to submit its first background job.",
          now: now(),
        });
        return {
          ok: false,
          error: {
            code: "music_data.scan_job_submit_failed",
            message: "Scan failed to submit its first background job.",
            area: "music_data_platform",
            retryable: true,
          },
        };
      }
      return { ok: true, value: { batchId } };
    },
  };
}

// D44 process-restart recovery. Runtime initialization calls this after root
// readiness to resubmit every non-terminal batch's current advance generation,
// closing the crash window between an advance transaction commit and the
// next-job submit. The handler bumps `advanceGeneration` (commit) and then
// submits the next job keyed on the new value, so the stored generation always
// identifies the next job that should drive the batch. Resubmitting at the
// stored generation is therefore always correct: a still-in-flight job is
// collapsed by pg-boss's deterministic-id dedup, and a lost submit is re-driven.
// A cancel_requested batch resumes only to finalize as cancelled; terminal
// batches are excluded by the query. MDP-owned so the idempotency-key format
// and job-type constant stay out of Server Host.
export type LocalSourceScanRecovery = {
  resumeNonTerminalBatches(): Promise<void>;
};

export type CreateLocalSourceScanRecoveryInput = {
  read: Pick<LocalSourceScanReadPort, "listNonTerminalBatches">;
  backgroundWork: Pick<BackgroundWorkBackend, "submit">;
  ownerScope: string;
  submitRetry?: LocalSourceScanSubmitRetry;
};

export function createLocalSourceScanRecovery(
  input: CreateLocalSourceScanRecoveryInput,
): LocalSourceScanRecovery {
  return {
    async resumeNonTerminalBatches() {
      const batches = await input.read.listNonTerminalBatches({ ownerScope: input.ownerScope });
      for (const batch of batches) {
        await input.backgroundWork.submit({
          jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE,
          payload: { batchId: batch.batchId },
          idempotencyKey: localSourceScanAdvanceIdempotencyKey(batch.batchId, batch.advanceGeneration),
          ...(input.submitRetry ?? {}),
        });
      }
    },
  };
}
