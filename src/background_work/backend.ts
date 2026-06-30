export type BackgroundWorkSubmission = "created" | "deduplicated";

export type BackgroundWorkQueuePolicy =
  | "standard"
  | "short"
  | "singleton"
  | "stately"
  | "exclusive"
  | "key_strict_fifo";

export type BackgroundWorkSubmitInput<Payload extends object = Record<string, unknown>> = {
  jobType: string;
  payload: Payload;
  idempotencyKey?: string;
  singletonKey?: string;
  queuePolicy?: BackgroundWorkQueuePolicy;
  runAfter?: Date;
  // pg-boss retry policy. When omitted, pg-boss applies its queue/constructor
  // defaults. Carried so domain callers can declare per-job retry without
  // re-implementing a retry loop (ADR-0027).
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
};

export type BackgroundWorkSubmitResult = {
  jobId: string;
  submission: BackgroundWorkSubmission;
};

export type BackgroundWorkTerminalState =
  | { jobId: string; state: "succeeded"; output?: object | null }
  | { jobId: string; state: "failed"; output?: object | null }
  | { jobId: string; state: "cancelled"; output?: object | null };

export type BackgroundWorkAwaitTerminalInput = {
  jobType: string;
  jobId: string;
  signal?: AbortSignal;
};

export type BackgroundWorkJob<Payload extends object = Record<string, unknown>> = {
  jobId: string;
  jobType: string;
  payload: Payload;
  signal: AbortSignal;
  // Present when the backend runs workers with metadata (pg-boss
  // `includeMetadata`). Handlers that need to distinguish a final attempt from
  // a retriable one read these; handlers that do not simply ignore them.
  retryCount?: number;
  retryLimit?: number;
};

export type BackgroundWorkHandler<Payload extends object = Record<string, unknown>> = (
  job: BackgroundWorkJob<Payload>,
) => Promise<void>;

export type RegisterBackgroundWorkHandlerInput<Payload extends object = Record<string, unknown>> = {
  jobType: string;
  queuePolicy?: BackgroundWorkQueuePolicy;
  handler: BackgroundWorkHandler<Payload>;
};

export type BackgroundWorkBackend = {
  submit<Payload extends object>(
    input: BackgroundWorkSubmitInput<Payload>,
  ): Promise<BackgroundWorkSubmitResult>;
  registerHandler<Payload extends object>(
    input: RegisterBackgroundWorkHandlerInput<Payload>,
  ): void;
  awaitTerminal(input: BackgroundWorkAwaitTerminalInput): Promise<BackgroundWorkTerminalState>;
  start(): Promise<void>;
  stop(): Promise<void>;
};
