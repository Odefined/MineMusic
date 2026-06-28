import { createHash } from "node:crypto";

import {
  PgBoss,
  type ConstructorOptions,
  type FindJobsOptions,
  type JobWithMetadata,
  type Queue,
  type SendOptions,
  type StopOptions,
  type WorkOptions,
} from "pg-boss";

import type {
  BackgroundWorkBackend,
  BackgroundWorkAwaitTerminalInput,
  BackgroundWorkHandler,
  BackgroundWorkSubmitInput,
  BackgroundWorkSubmitResult,
  BackgroundWorkTerminalState,
} from "./backend.js";

export type PgBossBackgroundWorkClient = {
  start(): Promise<unknown>;
  stop(options?: StopOptions): Promise<void>;
  createQueue(name: string, options?: Omit<Queue, "name">): Promise<void>;
  send(name: string, data?: object | null, options?: SendOptions): Promise<string | null>;
  findJobs<Payload extends object>(
    name: string,
    options?: FindJobsOptions,
  ): Promise<readonly { id: string; data: Payload }[]>;
  getJobById<Payload extends object>(
    name: string,
    id: string,
  ): Promise<JobWithMetadata<Payload> | null>;
  work<Payload extends object>(
    name: string,
    options: WorkOptions,
    handler: (jobs: JobWithMetadata<Payload>[]) => Promise<void>,
  ): Promise<string>;
};

export type CreatePgBossBackgroundWorkBackendInput = {
  connectionString?: string;
  schema?: string;
  maxConnections?: number;
  queueOptions?: Omit<Queue, "name">;
  workOptions?: WorkOptions;
  stopOptions?: StopOptions;
  terminalPollIntervalMs?: number;
  client?: PgBossBackgroundWorkClient;
};

type HandlerRegistration = {
  handler: BackgroundWorkHandler<object>;
};

const jobTypePattern = /^[A-Za-z0-9_.\-/]+$/;
const deterministicJobNamespace = "minemusic.background_work.job";

export function createPgBossBackgroundWorkBackend(
  input: CreatePgBossBackgroundWorkBackendInput,
): BackgroundWorkBackend {
  const client = input.client ?? createPgBossClient(input);
  const handlers = new Map<string, HandlerRegistration>();
  const createdQueues = new Set<string>();
  let clientStarted = false;
  let workersStarted = false;
  let lifecycleAbortController = new AbortController();

  return {
    async submit<Payload extends object>(
      submitInput: BackgroundWorkSubmitInput<Payload>,
    ): Promise<BackgroundWorkSubmitResult> {
      const jobType = assertJobType(submitInput.jobType);
      await ensureClientStarted();
      await ensureQueue(jobType);

      const idempotencyKey = normalizedOptionalString(submitInput.idempotencyKey);
      const expectedJobId = idempotencyKey === undefined
        ? undefined
        : deterministicJobId(jobType, idempotencyKey);
      const options: SendOptions = {
        ...(expectedJobId === undefined ? {} : { id: expectedJobId }),
        ...(submitInput.runAfter === undefined ? {} : { startAfter: submitInput.runAfter }),
        ...(submitInput.retryLimit === undefined ? {} : { retryLimit: submitInput.retryLimit }),
        ...(submitInput.retryDelay === undefined ? {} : { retryDelay: submitInput.retryDelay }),
        ...(submitInput.retryBackoff === undefined ? {} : { retryBackoff: submitInput.retryBackoff }),
      };

      const createdJobId = await client.send(jobType, submitInput.payload, options);
      if (createdJobId !== null) {
        return {
          jobId: createdJobId,
          submission: "created",
        };
      }

      if (expectedJobId === undefined) {
        throw new Error(`Background Work backend did not create job '${jobType}'.`);
      }

      const existingJobId = await findExistingJobId(jobType, expectedJobId);
      if (existingJobId === undefined) {
        throw new Error(`Background Work backend deduplicated job '${jobType}' but no existing job was found.`);
      }

      return {
        jobId: existingJobId,
        submission: "deduplicated",
      };
    },

    registerHandler<Payload extends object>(registerInput: {
      jobType: string;
      handler: BackgroundWorkHandler<Payload>;
    }): void {
      if (workersStarted) {
        throw new Error("Background Work handlers must be registered before workers start.");
      }

      const jobType = assertJobType(registerInput.jobType);
      if (handlers.has(jobType)) {
        throw new Error(`Background Work handler already registered for '${jobType}'.`);
      }

      handlers.set(jobType, {
        handler: registerInput.handler as BackgroundWorkHandler<object>,
      });
    },

    async awaitTerminal(awaitInput: BackgroundWorkAwaitTerminalInput): Promise<BackgroundWorkTerminalState> {
      const jobType = assertJobType(awaitInput.jobType);
      await ensureClientStarted();
      const signal = awaitInput.signal === undefined
        ? lifecycleAbortController.signal
        : AbortSignal.any([awaitInput.signal, lifecycleAbortController.signal]);

      // Phase B has one in-process Radio supervisor observing one job at a time.
      // Multi-owner/multi-instance scale should promote this to a backend-backed
      // event/coordination primitive instead of multiplying polling observers.
      while (true) {
        signal.throwIfAborted();
        const job = await client.getJobById<object>(jobType, awaitInput.jobId);
        if (job === null) {
          throw new Error(`Background Work job '${awaitInput.jobId}' was not found.`);
        }

        const terminal = terminalState(job);
        if (terminal !== undefined) {
          return terminal;
        }

        await sleep(input.terminalPollIntervalMs ?? 1000, signal);
      }
    },

    async start(): Promise<void> {
      if (workersStarted) {
        return;
      }

      await ensureClientStarted();
      for (const [jobType, registration] of handlers) {
        await ensureQueue(jobType);
        await client.work<object>(
          jobType,
          {
            batchSize: 1,
            ...(input.workOptions ?? {}),
            // Force metadata so handlers can observe retryCount/retryLimit and
            // distinguish a final attempt from a retriable one (pg-boss v12 has
            // no onComplete failure hook, so retry-state observation happens in
            // the work handler itself).
            includeMetadata: true,
          },
          async (jobs) => {
            for (const job of jobs) {
              await registration.handler({
                jobId: job.id,
                jobType: job.name,
                payload: job.data,
                signal: job.signal,
                retryCount: job.retryCount,
                retryLimit: job.retryLimit,
              });
            }
          },
        );
      }
      workersStarted = true;
    },

    async stop(): Promise<void> {
      if (!clientStarted) {
        return;
      }

      lifecycleAbortController.abort(new Error("Background Work backend stopped during terminal observation."));
      await client.stop(input.stopOptions ?? { graceful: true, close: true });
      clientStarted = false;
      workersStarted = false;
      createdQueues.clear();
    },
  };

  async function ensureClientStarted(): Promise<void> {
    if (clientStarted) {
      return;
    }

    if (lifecycleAbortController.signal.aborted) {
      lifecycleAbortController = new AbortController();
    }
    await client.start();
    clientStarted = true;
  }

  async function ensureQueue(jobType: string): Promise<void> {
    if (createdQueues.has(jobType)) {
      return;
    }

    await client.createQueue(jobType, input.queueOptions);
    createdQueues.add(jobType);
  }

  async function findExistingJobId(jobType: string, expectedJobId: string): Promise<string | undefined> {
    const jobs = await client.findJobs(jobType, { id: expectedJobId });
    return jobs.find((job) => job.id === expectedJobId)?.id;
  }
}

function terminalState(job: JobWithMetadata<object>): BackgroundWorkTerminalState | undefined {
  switch (job.state) {
    case "completed":
      return { jobId: job.id, state: "succeeded", output: job.output };
    case "failed":
      return { jobId: job.id, state: "failed", output: job.output };
    case "cancelled":
      return { jobId: job.id, state: "cancelled", output: job.output };
    case "active":
    case "created":
    case "retry":
      return undefined;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      try {
        signal?.throwIfAborted();
      } catch (error) {
        reject(error);
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createPgBossClient(input: CreatePgBossBackgroundWorkBackendInput): PgBossBackgroundWorkClient {
  const connectionString = normalizedOptionalString(input.connectionString);
  if (connectionString === undefined) {
    throw new Error("PgBoss Background Work backend requires a Postgres connection string.");
  }

  const schema = normalizedOptionalString(input.schema);
  const options: ConstructorOptions = {
    connectionString,
    schedule: false,
  };
  if (schema !== undefined) {
    options.schema = schema;
  }
  if (input.maxConnections !== undefined) {
    options.max = input.maxConnections;
  }

  return new PgBoss(options);
}

function assertJobType(jobType: string): string {
  if (jobType.length === 0 || jobType.trim() !== jobType || !jobTypePattern.test(jobType)) {
    throw new Error(`Background Work job type '${jobType}' is invalid.`);
  }

  return jobType;
}

function normalizedOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function deterministicJobId(jobType: string, idempotencyKey: string): string {
  const bytes = createHash("sha256")
    .update(deterministicJobNamespace)
    .update("\0")
    .update(jobType)
    .update("\0")
    .update(idempotencyKey)
    .digest();
  const byte6 = bytes[6];
  const byte8 = bytes[8];
  if (byte6 === undefined || byte8 === undefined) {
    throw new Error("Background Work idempotency hash did not contain enough bytes.");
  }
  bytes[6] = (byte6 & 0x0f) | 0x50;
  bytes[8] = (byte8 & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
