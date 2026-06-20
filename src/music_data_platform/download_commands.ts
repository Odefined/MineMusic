import { createHash } from "node:crypto";

import {
  type Ref,
  type Result,
} from "../contracts/kernel.js";
import type { DownloadSource } from "../contracts/music_data_platform.js";
import type { MusicDatabase } from "../storage/database.js";
import {
  createDownloadJobRepository,
  type DownloadJobRecord,
  type DownloadJobRepository,
  type DownloadJobState,
} from "./download_records.js";

export type DownloadOverwrite = "error" | "overwrite" | "skip";

export type DownloadRequest = {
  sourceRef: Ref;
  providerId?: string;
  outputDir: string;
  filename: string;
  preferredBitrate?: number;
  overwrite?: DownloadOverwrite;
  createDir?: boolean;
  sessionId?: string;
};

export type DownloadJobId = string;

export type DownloadJobStatus = {
  jobId: DownloadJobId;
  state: DownloadJobState;
  providerId: string;
  sourceRef: Ref;
  outputPath: string;
  bytesDownloaded: number;
  totalBytes?: number;
  container?: string;
  bitrate?: number;
  sizeBytes?: number;
  md5?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type DownloadCommands = {
  start(request: DownloadRequest): Promise<Result<DownloadJobId>>;
  status(jobId: DownloadJobId): Promise<Result<DownloadJobStatus>>;
  /** Wait for every in-flight background download to settle. Call before
   * closing the database so a shutdown cannot race the background writer. */
  drain(): Promise<void>;
};

// Narrow read port over the source-provider download_source capability.
// Production wraps ExtensionRuntime.getSourceProviderDownloadSource; tests
// inject a fake. Keeps the command decoupled from the extension layer.
export type DownloadSourceProvider = {
  getDownloadSource(input: {
    providerId: string;
    sourceRef: Ref;
    preferredBitrate?: number;
    sessionId?: string;
  }): Promise<Result<DownloadSource>>;
};

// Asynchronous, backpressured write sink. Streaming the body chunk-by-chunk
// (instead of writeFileSync on a full buffer) keeps large downloads from
// blocking the event loop or buffering the whole file in memory.
export type MediaFileSink = {
  append(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
};

// Narrow filesystem write port. Production wraps node:fs streams; tests inject
// an in-memory sink. The command never touches the filesystem directly.
export type MediaFileWriter = {
  exists(path: string): boolean;
  ensureDir(dir: string): void;
  remove(path: string): void;
  openSink(path: string): MediaFileSink;
};

export type CreateDownloadCommandsInput = {
  database: MusicDatabase;
  downloadSourceProvider: DownloadSourceProvider;
  fetch?: typeof fetch;
  fileWriter: MediaFileWriter;
  clock: () => string;
  generateJobId: () => string;
};

const SOURCE_NAMESPACE_PREFIX = "source_";

export function createDownloadCommands(
  input: CreateDownloadCommandsInput,
): DownloadCommands {
  const fetchImpl = input.fetch ?? fetch;
  const jobs: DownloadJobRepository = createDownloadJobRepository({
    db: input.database.context(),
  });
  const inFlight = new Map<string, Promise<void>>();

  return {
    async start(request) {
      const validation = validateRequest(request);

      if (!validation.ok) {
        return validation;
      }

      const providerId = request.providerId ?? providerIdFromNamespace(request.sourceRef.namespace);

      if (providerId === undefined) {
        return failDownload(
          "music_data.download_provider_unresolved",
          `Cannot resolve provider id from source namespace '${request.sourceRef.namespace}'.`,
        );
      }

      const outputPath = joinPath(request.outputDir, request.filename);
      const overwrite = request.overwrite ?? "error";

      // Decide from the LOCAL path first: skip/error must not depend on the
      // provider/cookie/network being reachable.
      if (input.fileWriter.exists(outputPath)) {
        if (overwrite === "error") {
          return failDownload(
            "music_data.download_output_exists",
            `Output path '${outputPath}' already exists.`,
          );
        }

        if (overwrite === "skip") {
          const now = input.clock();
          const jobId = input.generateJobId();
          await jobs.insert({
            jobId,
            providerId,
            sourceRef: request.sourceRef,
            outputPath,
            state: "completed",
            bytesDownloaded: 0,
            createdAt: now,
            updatedAt: now,
          });
          return ok(jobId);
        }

        // overwrite === "overwrite": remove before the background write.
        input.fileWriter.remove(outputPath);
      }

      if ((request.createDir ?? false) === true) {
        input.fileWriter.ensureDir(request.outputDir);
      }

      // Resolve a downloadable source only when we actually need to download,
      // so a missing source (no copyright / expired cookie) is an immediate
      // failure leaving no orphan job behind.
      const source = await input.downloadSourceProvider.getDownloadSource({
        providerId,
        sourceRef: request.sourceRef,
        ...(request.preferredBitrate === undefined ? {} : { preferredBitrate: request.preferredBitrate }),
        ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
      });

      if (!source.ok) {
        return source;
      }

      const jobId = input.generateJobId();
      const startedAt = input.clock();
      await jobs.insert(recordFor({
        jobId,
        providerId,
        sourceRef: request.sourceRef,
        outputPath,
        source: source.value,
        state: "running",
        bytesDownloaded: 0,
        now: startedAt,
      }));

      // Track the background task so drain() can wait for it at shutdown.
      const jobPromise = runDownload(jobId, outputPath, source.value, fetchImpl, input.fileWriter, jobs, input.clock)
        .finally(() => {
          inFlight.delete(jobId);
        });
      inFlight.set(jobId, jobPromise);

      return ok(jobId);
    },

    async status(jobId) {
      const record = await jobs.get({ jobId });

      if (record === undefined) {
        return failDownload(
          "music_data.download_job_not_found",
          `Download job '${jobId}' was not found.`,
        );
      }

      return ok(recordToStatus(record));
    },

    async drain() {
      if (inFlight.size === 0) {
        return;
      }
      // allSettled: runDownload never rejects (it catches internally), but this
      // keeps drain robust if that ever changes.
      await Promise.allSettled([...inFlight.values()]);
    },
  };
}

async function runDownload(
  jobId: string,
  outputPath: string,
  source: DownloadSource,
  fetchImpl: typeof fetch,
  fileWriter: MediaFileWriter,
  jobs: DownloadJobRepository,
  clock: () => string,
): Promise<void> {
  let sink: MediaFileSink | undefined;

  try {
    const response = await fetchImpl(source.url);

    if (!response.ok) {
      await markFailed(jobs, jobId, clock, "music_data.download_http_failed", `Download HTTP ${response.status}.`);
      return;
    }

    if (response.body === null) {
      await markFailed(jobs, jobId, clock, "music_data.download_http_failed", "Download response had no body.");
      return;
    }

    // Stream the body chunk-by-chunk: append to the sink (backpressured), fold
    // each chunk into the md5, and count bytes — never buffering the whole file
    // in memory and never blocking the event loop on a synchronous write.
    sink = fileWriter.openSink(outputPath);
    const hash = createHash("md5");
    let bytes = 0;
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const buffer = value instanceof Uint8Array ? value : new Uint8Array(value);
        await sink.append(buffer);
        hash.update(buffer);
        bytes += buffer.length;
      }
    } finally {
      reader.releaseLock();
    }

    await sink.close();
    sink = undefined;

    // Integrity checks AFTER streaming, BEFORE recording completed. On failure
    // the partial file is removed so the output path is either correct or absent.
    if (source.sizeBytes !== undefined && bytes !== source.sizeBytes) {
      fileWriter.remove(outputPath);
      await markFailed(jobs, jobId, clock, "music_data.download_size_mismatch", `Expected ${source.sizeBytes} bytes but received ${bytes}.`);
      return;
    }

    if (source.md5 !== undefined) {
      const actualMd5 = hash.digest("hex");

      if (actualMd5 !== source.md5) {
        fileWriter.remove(outputPath);
        await markFailed(jobs, jobId, clock, "music_data.download_integrity_failed", `md5 ${actualMd5} does not match provider ${source.md5}.`);
        return;
      }
    }

    const current = await jobs.get({ jobId });

    if (current === undefined) {
      return;
    }

    await jobs.update({
      ...current,
      state: "completed",
      bytesDownloaded: bytes,
      updatedAt: clock(),
    });
  } catch (cause) {
    if (sink !== undefined) {
      await sink.close().catch(() => {
        // best-effort: the sink may already be broken
      });
    }

    try {
      fileWriter.remove(outputPath);
    } catch {
      // best-effort cleanup of a partial file
    }

    await markFailed(
      jobs,
      jobId,
      clock,
      "music_data.download_fetch_failed",
      `Download fetch or write failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

async function markFailed(
  jobs: DownloadJobRepository,
  jobId: string,
  clock: () => string,
  code: string,
  message: string,
): Promise<void> {
  // Defensive at the shutdown boundary: if the database is already closed the
  // job cannot be updated, and rethrowing here would surface from the
  // background task as an unhandled rejection. Swallow — the job simply stops
  // at whatever state last persisted.
  try {
    const current = await jobs.get({ jobId });

    if (current === undefined) {
      return;
    }

    await jobs.update({
      ...current,
      state: "failed",
      errorCode: code,
      errorMessage: message,
      updatedAt: clock(),
    });
  } catch {
    // no-op: see comment above.
  }
}

function recordFor(input: {
  jobId: string;
  providerId: string;
  sourceRef: Ref;
  outputPath: string;
  source: DownloadSource;
  state: DownloadJobState;
  bytesDownloaded: number;
  now: string;
}): DownloadJobRecord {
  return {
    jobId: input.jobId,
    state: input.state,
    providerId: input.providerId,
    sourceRef: input.sourceRef,
    outputPath: input.outputPath,
    bytesDownloaded: input.bytesDownloaded,
    ...(input.source.sizeBytes === undefined ? {} : { totalBytes: input.source.sizeBytes }),
    ...(input.source.container === undefined ? {} : { container: input.source.container }),
    ...(input.source.bitrate === undefined ? {} : { bitrate: input.source.bitrate }),
    ...(input.source.sizeBytes === undefined ? {} : { sizeBytes: input.source.sizeBytes }),
    ...(input.source.md5 === undefined ? {} : { md5: input.source.md5 }),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function recordToStatus(record: DownloadJobRecord): DownloadJobStatus {
  return {
    jobId: record.jobId,
    state: record.state,
    providerId: record.providerId,
    sourceRef: record.sourceRef,
    outputPath: record.outputPath,
    bytesDownloaded: record.bytesDownloaded,
    ...(record.totalBytes === undefined ? {} : { totalBytes: record.totalBytes }),
    ...(record.container === undefined ? {} : { container: record.container }),
    ...(record.bitrate === undefined ? {} : { bitrate: record.bitrate }),
    ...(record.sizeBytes === undefined ? {} : { sizeBytes: record.sizeBytes }),
    ...(record.md5 === undefined ? {} : { md5: record.md5 }),
    ...(record.errorCode === undefined ? {} : { errorCode: record.errorCode }),
    ...(record.errorMessage === undefined ? {} : { errorMessage: record.errorMessage }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function validateRequest(request: DownloadRequest): Result<void> {
  if (!isRecord(request)) {
    return failDownload("music_data.download_invalid_request", "Download request must be an object.");
  }

  // sourceRef safety is guaranteed upstream: slot dispatch validates the ref
  // before the command runs. The command owns only the semantic check — only
  // tracks carry an audio stream to download.
  if (request.sourceRef.kind !== "track") {
    return failDownload("music_data.download_no_audio_stream", "Download requires a track sourceRef; albums and artists have no audio stream.");
  }

  if (typeof request.outputDir !== "string" || request.outputDir.length === 0) {
    return failDownload("music_data.download_invalid_output_dir", "Download request outputDir must be a non-empty string.");
  }

  if (typeof request.filename !== "string" || request.filename.length === 0 || request.filename.includes("/") || request.filename.includes("\\")) {
    return failDownload("music_data.download_invalid_filename", "Download request filename must be a non-empty string without path separators.");
  }

  if (request.providerId !== undefined && (typeof request.providerId !== "string" || request.providerId.length === 0)) {
    return failDownload("music_data.download_invalid_provider_id", "Download request providerId must be a non-empty string when present.");
  }

  if (
    request.preferredBitrate !== undefined &&
    (typeof request.preferredBitrate !== "number" || !Number.isInteger(request.preferredBitrate) || request.preferredBitrate <= 0)
  ) {
    return failDownload("music_data.download_invalid_bitrate", "Download request preferredBitrate must be a positive integer when present.");
  }

  if (
    request.overwrite !== undefined &&
    request.overwrite !== "error" &&
    request.overwrite !== "overwrite" &&
    request.overwrite !== "skip"
  ) {
    return failDownload("music_data.download_invalid_overwrite", "Download request overwrite must be error, overwrite, or skip when present.");
  }

  return ok(undefined);
}

function providerIdFromNamespace(namespace: string): string | undefined {
  if (!namespace.startsWith(SOURCE_NAMESPACE_PREFIX)) {
    return undefined;
  }

  // source_local is the local-source namespace, not a provider; refuse it so a
  // stray local sourceRef never fabricates a fake provider id "local".
  if (namespace === "source_local") {
    return undefined;
  }

  const providerId = namespace.slice(SOURCE_NAMESPACE_PREFIX.length);

  // providerId inherits safety from the upstream-validated namespace (a safe
  // namespace minus the fixed `source_` prefix is still a safe component).
  return providerId.length === 0 ? undefined : providerId;
}

function joinPath(dir: string, filename: string): string {
  return dir.endsWith("/") ? `${dir}${filename}` : `${dir}/${filename}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function failDownload(code: string, message: string, retryable = false): Result<never> {
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
