export type BackgroundWorkSubmission = "created" | "deduplicated";

export type BackgroundWorkSubmitInput<Payload extends object = Record<string, unknown>> = {
  jobType: string;
  payload: Payload;
  idempotencyKey?: string;
  runAfter?: Date;
};

export type BackgroundWorkSubmitResult = {
  jobId: string;
  submission: BackgroundWorkSubmission;
};

export type BackgroundWorkJob<Payload extends object = Record<string, unknown>> = {
  jobId: string;
  jobType: string;
  payload: Payload;
  signal: AbortSignal;
};

export type BackgroundWorkHandler<Payload extends object = Record<string, unknown>> = (
  job: BackgroundWorkJob<Payload>,
) => Promise<void>;

export type RegisterBackgroundWorkHandlerInput<Payload extends object = Record<string, unknown>> = {
  jobType: string;
  handler: BackgroundWorkHandler<Payload>;
};

export type BackgroundWorkBackend = {
  submit<Payload extends object>(
    input: BackgroundWorkSubmitInput<Payload>,
  ): Promise<BackgroundWorkSubmitResult>;
  registerHandler<Payload extends object>(
    input: RegisterBackgroundWorkHandlerInput<Payload>,
  ): void;
  start(): Promise<void>;
  stop(): Promise<void>;
};
