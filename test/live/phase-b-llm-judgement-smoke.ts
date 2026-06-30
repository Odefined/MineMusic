import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  resolve,
} from "node:path";
import { Client } from "pg";
import {
  getEnvApiKey,
  streamSimple,
} from "@earendil-works/pi-ai/compat";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type {
  AgentMessage,
  StreamFn,
} from "@earendil-works/pi-agent-core";

import {
  createActorRuntimeSession,
  createAgentRuntimeUserTurnController,
  createInMemoryAgentRuntimeTranscriptStore,
  createWorkspaceContextAssembler,
  mainDefinition,
  type MineMusicPiAgentAdapterOptions,
} from "../../src/agent_runtime/index.js";
import { DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID } from "../../src/music_experience/index.js";
import { createServerHost } from "../../src/server/index.js";
import {
  createPostgresTestSchema,
  dropPostgresTestSchema,
  postgresTestDatabaseUrl,
} from "../support/postgres.js";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
  cwd(): string;
  pid: number;
};

loadLocalEnvFile();

const liveEnabled = process.env.MINEMUSIC_LIVE_PHASE_B_LLM === "1";

if (!liveEnabled) {
  console.log("Skipping Phase B LLM judgement smoke. Set MINEMUSIC_LIVE_PHASE_B_LLM=1 to enable.");
} else {
  await runLiveSmoke();
}

async function runLiveSmoke(): Promise<void> {
  const provider = nonBlank(process.env.MINEMUSIC_PHASE_B_LLM_PROVIDER) ?? "openai";
  const modelId = nonBlank(process.env.MINEMUSIC_PHASE_B_LLM_MODEL) ?? "gpt-4.1-mini";
  const lookupModelId = modelCatalogId(provider, modelId);
  const exactModel = builtinModels().getModel(provider, modelId);
  const catalogModel = exactModel ?? builtinModels().getModel(provider, lookupModelId);

  if (catalogModel === undefined) {
    console.error(`Phase B LLM judgement smoke failed: unknown model ${provider}/${modelId}.`);
    process.exitCode = 1;
    return;
  }
  const liveModel = {
    ...catalogModel,
    id: nonBlank(process.env.MINEMUSIC_PHASE_B_LLM_WIRE_MODEL) ?? modelId,
    baseUrl: nonBlank(process.env.MINEMUSIC_PHASE_B_LLM_BASE_URL) ?? catalogModel.baseUrl,
  };

  const apiKey = getEnvApiKey(liveModel.provider);
  if (apiKey === undefined) {
    console.error(`Phase B LLM judgement smoke failed: no API key found for provider '${liveModel.provider}'.`);
    process.exitCode = 1;
    return;
  }

  const databaseUrl = postgresTestDatabaseUrl();
  const databaseSchema = `minemusic_live_phase_b_llm_${process.pid}`;
  await createPostgresTestSchema({ connectionString: databaseUrl, schema: databaseSchema });

  const streamCalls: string[] = [];
  const ncmBaseUrl = nonBlank(process.env.MINEMUSIC_NCM_BASE_URL);
  const agentOptions = createLiveAgentOptions({
    streamCalls,
    model: liveModel,
    maxTokens: positiveIntegerFromEnv(process.env.MINEMUSIC_PHASE_B_LLM_MAX_TOKENS) ?? 1500,
  });
  const host = createServerHost({
    config: {
      database: {
        url: databaseUrl,
        schema: databaseSchema,
      },
      plugins: {
        "minemusic.ncm": {
          ...(ncmBaseUrl === undefined
            ? {}
            : { baseUrl: ncmBaseUrl }),
        },
      },
    },
    radioAgentOptions: agentOptions,
  });
  const dispatchLog: string[] = [];

  try {
    const started = await host.start();
    if (!started.ok) {
      fail(`startup: ${started.error.code} ${started.error.message}`);
      return;
    }

    const contextFactory = host.toolContextFactory();
    const musicExperienceRead = host.musicExperienceRead();
    if (contextFactory === undefined || musicExperienceRead === undefined) {
      fail("Server Host did not expose the Stage context factory or Music Experience read model.");
      return;
    }

    const mainSession = await createActorRuntimeSession({
      ownerScope: "local",
      workspaceId: DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID,
      actor: mainDefinition,
      workspaceContext: createWorkspaceContextAssembler({
        musicExperience: musicExperienceRead,
      }),
      tools: host.snapshot().interfaceContract.tools,
      dispatch: {
        dispatch(input) {
          dispatchLog.push(input.toolName);
          return host.dispatch(input.ctx, {
            toolName: input.toolName,
            payload: input.payload,
          });
        },
      },
      contextFactory: {
        createToolContext(input) {
          return contextFactory.createToolContext(input);
        },
      },
      transcriptStore: createInMemoryAgentRuntimeTranscriptStore(),
      llmProviderSessionId: "phase-b-live-main",
      agentOptions,
    });
    const main = createAgentRuntimeUserTurnController({ session: mainSession });
    console.log(`Model: ${liveModel.provider}/${liveModel.id}`);

    const customMessage = nonBlank(process.env.MINEMUSIC_PHASE_B_LLM_USER_MESSAGE);
    if (customMessage !== undefined) {
      const custom = await runJudgementTurn({
        main,
        dispatchLog,
        label: "custom",
        userMessage: customMessage,
      });
      if (!assertHealthyTurn(custom)) {
        return;
      }
      assertRadioSessionStart(custom, "custom natural-language request");
    } else {
      const negative = await runJudgementTurn({
        main,
        dispatchLog,
        label: "negative-control",
        userMessage:
          "先别接管后面的播放流，也不要连续往下放；只帮我找一首适合凌晨写代码、带一点霓虹合成器感觉的歌，给一句理由就停。",
      });
      if (!assertHealthyTurn(negative)) {
        return;
      }
      if (radioToolDecisions(negative.stageDispatches).length > 0) {
        fail("Negative control used radio tools even though the user asked for one bounded recommendation.");
        return;
      }

      const positive = await runJudgementTurn({
        main,
        dispatchLog,
        label: "positive-control",
        userMessage:
          "我不想一首首点了。接下来半小时你接管我的听歌流，围绕凌晨写代码、霓虹合成器、不要太炸，保持这个氛围往下走。",
      });
      if (!assertHealthyTurn(positive)) {
        return;
      }
      assertRadioSessionStart(positive, "positive continuous-flow request");
    }

    const projection = await musicExperienceRead.readWorkspaceProjection({ ownerScope: "local" });
    console.log(`Final radio direction revision: ${projection.radio.directionRevision}`);
    console.log(`Final radio motif: ${projection.radio.direction.motif === undefined ? "(none)" : JSON.stringify(projection.radio.direction.motif)}`);
    console.log(`Final radio variations: ${projection.radio.direction.activeVariations.length}`);
    console.log(`Final queue depth: ${projection.queue.length}`);
    console.log(`Provider calls: ${streamCalls.length} (${streamCalls.join(", ")})`);

    if (dispatchLog.includes("radio.session.start")) {
      const transcript = await waitForRadioTranscript({
        connectionString: databaseUrl,
        schema: databaseSchema,
        timeoutMs: positiveIntegerFromEnv(process.env.MINEMUSIC_PHASE_B_LLM_RADIO_WAIT_MS) ?? 45_000,
      });
      if (transcript === undefined) {
        fail("Main started Radio, but no Radio Agent transcript was checkpointed before timeout.");
        return;
      }
      console.log(`Radio transcript messages: ${transcript.messageCount}`);
      const transcriptJsonPath = nonBlank(process.env.MINEMUSIC_PHASE_B_LLM_TRANSCRIPT_JSON);
      if (transcriptJsonPath !== undefined) {
        const writtenPath = writeTranscriptJson({
          path: transcriptJsonPath,
          payload: {
            actor: "radio_agent",
            messageCount: transcript.messageCount,
            messages: transcript.messages,
          },
        });
        console.log(`Radio transcript JSON: ${writtenPath}`);
      }
    }
  } finally {
    const stopped = await host.stop();
    if (!stopped.ok && process.exitCode !== 1) {
      fail(`shutdown: ${stopped.error.code} ${stopped.error.message}`);
    }
    await dropPostgresTestSchema({ connectionString: databaseUrl, schema: databaseSchema });
  }
}

async function runJudgementTurn(input: {
  main: ReturnType<typeof createAgentRuntimeUserTurnController>;
  dispatchLog: string[];
  label: string;
  userMessage: string;
}): Promise<{
  label: string;
  userMessage: string;
  stageDispatches: readonly string[];
  assistantToolCalls: readonly string[];
  stopReason: string | undefined;
  errorMessage: string | undefined;
  assistantResponseText: string | undefined;
}> {
  const firstDispatch = input.dispatchLog.length;
  const turn = await input.main.runUserTurn({ userMessage: input.userMessage });
  const stageDispatches = input.dispatchLog.slice(firstDispatch);
  const assistantToolCalls = assistantToolCallNames(turn.newMessages);
  console.log(`[${input.label}] user: ${input.userMessage}`);
  console.log(`[${input.label}] assistant tool calls: ${assistantToolCalls.join(", ") || "(none)"}`);
  console.log(`[${input.label}] stage dispatches: ${stageDispatches.join(", ") || "(none)"}`);
  console.log(`[${input.label}] stopReason: ${turn.stopReason ?? "(none)"}`);
  if (turn.assistantResponseText !== undefined) {
    console.log(`[${input.label}] response: ${oneLine(turn.assistantResponseText)}`);
  }
  return {
    label: input.label,
    userMessage: input.userMessage,
    stageDispatches,
    assistantToolCalls,
    stopReason: turn.stopReason,
    errorMessage: turn.errorMessage,
    assistantResponseText: turn.assistantResponseText,
  };
}

function assertHealthyTurn(turn: {
  label: string;
  stopReason: string | undefined;
  errorMessage: string | undefined;
}): boolean {
  if (turn.stopReason === "error" || turn.stopReason === "aborted") {
    fail(`${turn.label} Main Agent ended ${turn.stopReason}: ${turn.errorMessage ?? "no error message"}`);
    return false;
  }
  return true;
}

function assertRadioSessionStart(turn: {
  stageDispatches: readonly string[];
}, label: string): void {
  if (!turn.stageDispatches.includes("radio.session.start")) {
    fail(`Main Agent did not start Radio for ${label}.`);
  }
}

function radioToolDecisions(toolNames: readonly string[]): readonly string[] {
  return toolNames.filter((toolName) =>
    toolName.startsWith("radio.motif.") ||
    toolName.startsWith("radio.variations.") ||
    toolName.startsWith("radio.session.")
  );
}

function createLiveAgentOptions(input: {
  streamCalls: string[];
  model: NonNullable<ReturnType<ReturnType<typeof builtinModels>["getModel"]>>;
  maxTokens: number;
}): MineMusicPiAgentAdapterOptions {
  const streamFn: StreamFn = (_model, context, options) => {
    input.streamCalls.push(`${input.model.provider}/${input.model.id}`);
    return streamSimple(input.model, context, {
      ...options,
      maxTokens: input.maxTokens,
    });
  };

  return {
    streamFn,
    getApiKey(provider) {
      return getEnvApiKey(provider);
    },
    maxRetryDelayMs: 10_000,
    toolExecution: "sequential",
  };
}

function modelCatalogId(provider: string, modelId: string): string {
  if (provider === "deepseek" && modelId === "DeepSeek-V4-Flash") {
    return "deepseek-v4-flash";
  }
  if (provider === "deepseek" && modelId === "DeepSeek-V4-Pro") {
    return "deepseek-v4-pro";
  }
  return modelId;
}

function assistantToolCallNames(messages: readonly AgentMessage[]): string[] {
  const names: string[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    for (const content of message.content) {
      if (content.type === "toolCall") {
        names.push(content.name);
      }
    }
  }
  return names;
}

async function waitForRadioTranscript(input: {
  connectionString: string;
  schema: string;
  timeoutMs: number;
}): Promise<{
  messageCount: number;
  messages: unknown;
} | undefined> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const transcript = await readRadioTranscript(input);
    if (transcript !== undefined) {
      return transcript;
    }
    await sleep(1500);
  }
  return undefined;
}

async function readRadioTranscript(input: {
  connectionString: string;
  schema: string;
}): Promise<{
  messageCount: number;
  messages: unknown;
} | undefined> {
  const client = new Client({ connectionString: input.connectionString });
  await client.connect();
  try {
    const result = await client.query<{
      message_count: string;
      messages_json: string | unknown;
    }>(
      `
        SELECT
          jsonb_array_length(messages_json) AS message_count,
          messages_json
        FROM ${quoteIdentifier(input.schema)}.agent_runtime_actor_sessions
        WHERE owner_scope = 'local'
          AND workspace_id = $1
          AND actor_kind = 'radio_agent'
          AND active = TRUE
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID],
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : {
        messageCount: Number.parseInt(row.message_count, 10),
        messages: storedJson(row.messages_json),
      };
  } finally {
    await client.end();
  }
}

function writeTranscriptJson(input: {
  path: string;
  payload: unknown;
}): string {
  const outputPath = resolve(process.cwd(), input.path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(input.payload, null, 2)}\n`, "utf8");
  return outputPath;
}

function storedJson(value: string | unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function positiveIntegerFromEnv(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function oneLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function fail(message: string): void {
  console.error(`Phase B LLM judgement smoke failed: ${message}`);
  process.exitCode = 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadLocalEnvFile(): void {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    process.env[key] ??= unquoteEnvValue(rawValue);
  }
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
