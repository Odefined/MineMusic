import assert from "node:assert/strict";

import {
  createPgBossBackgroundWorkBackend,
  type PgBossBackgroundWorkClient,
} from "../../src/background_work/index.js";
import type { JobWithMetadata } from "pg-boss";

const localizeJobType = "music_data_platform.localize_provider_source";

type SendOptionsForFake = Parameters<PgBossBackgroundWorkClient["send"]>[2];
type WorkOptionsForFake = Parameters<PgBossBackgroundWorkClient["work"]>[1];
type FindJobsOptionsForFake = Parameters<PgBossBackgroundWorkClient["findJobs"]>[1];

type FakeWorkHandler = (jobs: JobWithMetadata[]) => Promise<void>;

type SendCall = {
  name: string;
  data?: object | null;
  options?: SendOptionsForFake;
};

type WorkCall = {
  name: string;
  options: WorkOptionsForFake;
  handler: FakeWorkHandler;
};

class FakePgBossClient implements PgBossBackgroundWorkClient {
  startCount = 0;
  readonly stopCalls: unknown[] = [];
  readonly createdQueues: string[] = [];
  readonly sendCalls: SendCall[] = [];
  readonly findJobsCalls: { name: string; id?: string }[] = [];
  readonly workCalls: WorkCall[] = [];
  private readonly jobs = new Map<string, {
    name: string;
    data: object | null | undefined;
    state: JobWithMetadata["state"];
    output?: object | null;
  }>();
  private generatedJobId = 0;

  async start(): Promise<unknown> {
    this.startCount += 1;
    return this;
  }

  async stop(options?: unknown): Promise<void> {
    this.stopCalls.push(options);
  }

  async createQueue(name: string): Promise<void> {
    if (!this.createdQueues.includes(name)) {
      this.createdQueues.push(name);
    }
  }

  async send(name: string, data?: object | null, options?: SendOptionsForFake): Promise<string | null> {
    this.sendCalls.push({
      name,
      ...(data === undefined ? {} : { data }),
      ...(options === undefined ? {} : { options }),
    });
    const id = options?.id ?? `00000000-0000-4000-8000-${String(++this.generatedJobId).padStart(12, "0")}`;

    if (this.jobs.has(id)) {
      return null;
    }

    this.jobs.set(id, { name, data, state: "created" });
    return id;
  }

  async findJobs<Payload extends object>(
    name: string,
    options?: FindJobsOptionsForFake,
  ): Promise<readonly { id: string; data: Payload }[]> {
    const id = typeof options?.id === "string" ? options.id : undefined;
    this.findJobsCalls.push({
      name,
      ...(id === undefined ? {} : { id }),
    });

    if (id === undefined) {
      return [];
    }

    const job = this.jobs.get(id);
    if (job === undefined || job.name !== name) {
      return [];
    }

    return [{ id, data: job.data as Payload }];
  }

  async getJobById<Payload extends object>(name: string, id: string): Promise<JobWithMetadata<Payload> | null> {
    const job = this.jobs.get(id);
    if (job === undefined || job.name !== name) {
      return null;
    }

    return fakeJob({
      id,
      name,
      data: job.data as Payload,
      signal: new AbortController().signal,
      state: job.state,
      ...(job.output === undefined ? {} : { output: job.output }),
    });
  }

  setJobState(id: string, state: JobWithMetadata["state"], output?: object | null): void {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new Error(`Unknown fake job ${id}`);
    }
    job.state = state;
    if (output !== undefined) {
      job.output = output;
    }
  }

  async work<Payload extends object>(
    name: string,
    options: WorkOptionsForFake,
    handler: (jobs: JobWithMetadata<Payload>[]) => Promise<void>,
  ): Promise<string> {
    this.workCalls.push({
      name,
      options,
      handler: handler as FakeWorkHandler,
    });
    return `worker-${this.workCalls.length}`;
  }
}

{
  const client = new FakePgBossClient();
  const backend = createPgBossBackgroundWorkBackend({ client });

  const submitted = await backend.submit({
    jobType: localizeJobType,
    payload: { sourceRefKey: "source_netease:track:1001" },
  });

  assert.equal(submitted.submission, "created");
  assert.equal(client.startCount, 1);
  assert.deepEqual(client.createdQueues, [localizeJobType]);
  assert.equal(client.workCalls.length, 0);

  backend.registerHandler({
    jobType: localizeJobType,
    async handler() {},
  });

  await backend.start();

  assert.equal(client.startCount, 1);
  assert.deepEqual(client.createdQueues, [localizeJobType]);
  assert.deepEqual(client.workCalls.map((call) => call.name), [localizeJobType]);
}

{
  const client = new FakePgBossClient();
  const backend = createPgBossBackgroundWorkBackend({ client });

  const runAfter = new Date("2026-06-20T12:00:00.000Z");
  const first = await backend.submit({
    jobType: localizeJobType,
    payload: { sourceRefKey: "source_netease:track:1002" },
    idempotencyKey: "source_netease:track:1002|bitrate:320000|policy:1",
    runAfter,
  });
  const second = await backend.submit({
    jobType: localizeJobType,
    payload: { sourceRefKey: "source_netease:track:1002" },
    idempotencyKey: "source_netease:track:1002|bitrate:320000|policy:1",
    runAfter,
  });

  assert.equal(first.submission, "created");
  assert.equal(second.submission, "deduplicated");
  assert.equal(second.jobId, first.jobId);
  assert.match(first.jobId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(client.sendCalls[0]?.options?.id, first.jobId);
  assert.equal(client.sendCalls[0]?.options?.startAfter, runAfter);
  assert.equal(client.findJobsCalls.length, 1);
  assert.deepEqual(client.findJobsCalls[0], {
    name: localizeJobType,
    id: first.jobId,
  });
}

{
  const client = new FakePgBossClient();
  const backend = createPgBossBackgroundWorkBackend({ client });
  const signal = new AbortController().signal;
  const seenJobs: unknown[] = [];

  backend.registerHandler({
    jobType: localizeJobType,
    async handler(job) {
      seenJobs.push(job);
    },
  });
  await backend.start();

  await client.workCalls[0]?.handler([
    fakeJob({
      id: "a5f91a6d-91fc-4c2e-a213-b8db121e9f51",
      name: localizeJobType,
      data: { sourceRefKey: "source_netease:track:1003" },
      signal,
    }),
  ]);

  assert.deepEqual(seenJobs, [
    {
      jobId: "a5f91a6d-91fc-4c2e-a213-b8db121e9f51",
      jobType: localizeJobType,
      payload: { sourceRefKey: "source_netease:track:1003" },
      signal,
      retryCount: 0,
      retryLimit: 0,
    },
  ]);
}

{
  const client = new FakePgBossClient();
  const backend = createPgBossBackgroundWorkBackend({ client });

  backend.registerHandler({
    jobType: localizeJobType,
    async handler() {},
  });
  assert.throws(() =>
    backend.registerHandler({
      jobType: localizeJobType,
      async handler() {},
    }),
  /already registered/);

  await backend.start();

  assert.throws(() =>
    backend.registerHandler({
      jobType: "music_data_platform.other_job",
      async handler() {},
    }),
  /before workers start/);
}

{
  const client = new FakePgBossClient();
  const backend = createPgBossBackgroundWorkBackend({ client });

  backend.registerHandler({
    jobType: localizeJobType,
    async handler() {},
  });
  await backend.start();
  await backend.stop();

  assert.deepEqual(client.stopCalls, [{ graceful: true, close: true }]);
}

{
  const client = new FakePgBossClient();
  const backend = createPgBossBackgroundWorkBackend({ client, terminalPollIntervalMs: 1 });
  const submitted = await backend.submit({
    jobType: localizeJobType,
    payload: { sourceRefKey: "source_netease:track:1004" },
    idempotencyKey: "terminal-source_netease:track:1004",
  });

  client.setJobState(submitted.jobId, "completed", { status: "ok" });

  assert.deepEqual(await backend.awaitTerminal(submitted.jobId), {
    jobId: submitted.jobId,
    state: "succeeded",
    output: { status: "ok" },
  });
}

function fakeJob<Payload extends object>(input: {
  id: string;
  name: string;
  data: Payload;
  signal: AbortSignal;
  state?: JobWithMetadata["state"];
  output?: object | null;
}): JobWithMetadata<Payload> {
  const epoch = new Date(0);
  // Backend reads id/name/data/signal/retryCount/retryLimit; the remaining
  // JobWithMetadata fields are filled with inert defaults so the fake satisfies
  // the type without exercising any pg-boss semantics.
  return {
    id: input.id,
    name: input.name,
    data: input.data,
    signal: input.signal,
    groupId: null,
    groupTier: null,
    expireInSeconds: 900,
    heartbeatSeconds: null,
    priority: 0,
    state: input.state ?? "active",
    retryLimit: 0,
    retryCount: 0,
    retryDelay: 0,
    retryBackoff: false,
    startAfter: epoch,
    startedOn: epoch,
    singletonKey: null,
    singletonOn: null,
    deleteAfterSeconds: 604800,
    createdOn: epoch,
    completedOn: null,
    keepUntil: epoch,
    policy: "standard",
    heartbeatOn: null,
    blocked: false,
    blocking: false,
    pendingDependencies: 0,
    deadLetter: "",
    output: input.output ?? {},
  } as JobWithMetadata<Payload>;
}
