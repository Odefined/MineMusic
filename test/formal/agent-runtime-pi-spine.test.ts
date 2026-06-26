import assert from "node:assert/strict";

import type { StreamFn } from "@earendil-works/pi-agent-core";

import type { Result } from "../../src/contracts/kernel.js";
import type {
  InstrumentDescriptor,
  JsonSchema,
  StageToolContext,
  ToolCallOutput,
  ToolDeclaration,
} from "../../src/contracts/stage_interface.js";
import {
  createMineMusicPiAgent,
  createStageToolBridge,
  type StageToolDispatchPort,
} from "../../src/agent_runtime/index.js";

const testInstrument: InstrumentDescriptor = {
  id: "agent.test",
  label: "Agent Test",
  ownerArea: "agent_runtime",
};

const inputSchema = {
  type: "object",
  properties: { query: { type: "string" } },
  required: ["query"],
  additionalProperties: false,
} as const satisfies JsonSchema;

const outputSchema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
} as const satisfies JsonSchema;

const descriptor: ToolDeclaration = {
  name: "agent.test.lookup",
  instrumentId: testInstrument.id,
  label: "Lookup",
  ownerArea: "agent_runtime",
  description: "Lookup through the Stage tool bridge.",
  usage: {
    useWhen: "Use in Agent Runtime bridge tests.",
    doNotUseWhen: "Do not use for production music lookup.",
    outputSemantics: "Returns a compact answer.",
  },
  examples: [{ prompt: "lookup x", expects: "call" }],
  sideEffect: {
    durableUserStateWrite: false,
    runtimeStateWrite: false,
    externalCall: false,
  },
  invocationPolicy: {
    defaultDecision: "auto",
    dataEgress: "none",
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema,
  outputSchema,
  errors: [
    {
      code: "agent.test.bad_query",
      retryable: false,
      suggestedFixTemplate: "Use a non-empty query.",
    },
  ],
  resultSummary(result) {
    return `answer=${(result as { answer?: string }).answer ?? "unknown"}`;
  },
};

{
  let dispatched:
    | {
      ctx: StageToolContext;
      toolName: string;
      payload: unknown;
    }
    | undefined;
  const controller = new AbortController();
  const dispatch: StageToolDispatchPort = {
    async dispatch(input) {
      dispatched = input;
      return {
        ok: true,
        value: {
          toolName: input.toolName,
          result: { answer: "found" },
        },
      };
    },
  };
  const [tool] = createStageToolBridge({
    tools: [descriptor],
    dispatch,
    contextFactory: {
      createToolContext(input: {
        sessionId: string;
        requestId: string;
        abortSignal?: AbortSignal;
      }) {
        return createMinimalContext(input.sessionId, input.requestId, input.abortSignal);
      },
    },
    sessionId: "agent-session",
  });

  assert.equal(tool?.name, descriptor.name);
  assert.equal(tool?.parameters, descriptor.inputSchema);

  const output = await tool?.execute("tool-call-1", { query: "x" }, controller.signal);

  assert.deepEqual(output?.details, {
    toolName: descriptor.name,
    result: { answer: "found" },
  });
  assert.equal(output?.content[0]?.type, "text");
  assert.equal(output?.content[0]?.text, "answer=found");
  assert.equal(dispatched?.toolName, descriptor.name);
  assert.deepEqual(dispatched?.payload, { query: "x" });
  assert.equal(dispatched?.ctx.sessionId, "agent-session");
  assert.equal(dispatched?.ctx.requestId, "tool-call-1");
  assert.equal(dispatched?.ctx.abortSignal, controller.signal);
}

{
  const [tool] = createStageToolBridge({
    tools: [descriptor],
    dispatch: {
      async dispatch(): Promise<Result<ToolCallOutput>> {
        return {
          ok: false,
          error: {
            code: "agent.test.bad_query",
            message: "Bad query.",
            area: "agent_runtime",
            retryable: false,
            suggestedFix: "Use a better query.",
          },
        };
      },
    },
    contextFactory: {
      createToolContext(input: {
        sessionId: string;
        requestId: string;
        abortSignal?: AbortSignal;
      }) {
        return createMinimalContext(input.sessionId, input.requestId);
      },
    },
    sessionId: "agent-session",
  });

  await assert.rejects(
    () => {
      assert.ok(tool !== undefined);
      return tool.execute("tool-call-2", { query: "" });
    },
    /Bad query\.\nSuggested fix: Use a better query\./u,
  );
}

{
  let streamCallCount = 0;
  const agent = createMineMusicPiAgent({
    systemPrompt: "You are a MineMusic test agent.",
    tools: [descriptor],
    dispatch: {
      async dispatch(input) {
        return {
          ok: true,
          value: {
            toolName: input.toolName,
            result: { answer: "from-pi" },
          },
        };
      },
    },
    contextFactory: {
      createToolContext(input: {
        sessionId: string;
        requestId: string;
        abortSignal?: AbortSignal;
      }) {
        return createMinimalContext(input.sessionId, input.requestId, input.abortSignal);
      },
    },
    sessionId: "agent-session",
    agentOptions: {
      streamFn() {
        streamCallCount += 1;
        const message = streamCallCount === 1
          ? assistantMessageWithToolCall("tool-call-3", descriptor.name, { query: "x" })
          : assistantTextMessage("done");
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: streamCallCount === 1 ? "toolUse" : "stop",
          message,
        });
      },
    },
  });

  assert.equal(agent.state.systemPrompt, "You are a MineMusic test agent.");
  assert.equal(agent.state.tools.length, 1);

  await agent.prompt("lookup x");

  assert.equal(streamCallCount, 2);
  const toolResult = agent.state.messages.find((message) => message.role === "toolResult");
  assert.equal(toolResult?.toolName, descriptor.name);
  assert.equal(toolResult?.isError, false);
  assert.deepEqual(toolResult?.details, {
    toolName: descriptor.name,
    result: { answer: "from-pi" },
  });
}

function createMinimalContext(
  sessionId: string,
  requestId: string,
  abortSignal?: AbortSignal,
): StageToolContext {
  return {
    ownerScope: "local",
    sessionId,
    requestId,
    clock: () => "2026-06-26T00:00:00.000Z",
    ...(abortSignal === undefined ? {} : { abortSignal }),
    handleMinting: {
      async mint() {
        throw new Error("Handle minting is unavailable in this test.");
      },
      async resolve() {
        throw new Error("Handle resolution is unavailable in this test.");
      },
    },
    lookupCursors: {
      async register() {
        throw new Error("Lookup cursor registration is unavailable in this test.");
      },
      async resolve() {
        return {
          ok: false,
          error: {
            code: "agent.test.lookup_cursor_unavailable",
            message: "Lookup cursor resolution is unavailable in this test.",
            area: "agent_runtime",
            retryable: false,
          },
        };
      },
    },
    providerAvailability: {
      async isProviderAvailable() {
        return false;
      },
    },
    executionGate: {
      async preflight() {
        return {
          decision: "allow",
          auditLevel: "none",
        };
      },
    },
  };
}

function assistantMessageWithToolCall(id: string, name: string, args: Record<string, unknown>) {
  return {
    role: "assistant" as const,
    content: [{ type: "toolCall" as const, id, name, arguments: args }],
    api: "openai" as const,
    provider: "openai" as const,
    model: "fake",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse" as const,
    timestamp: 0,
  };
}

function assistantTextMessage(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    api: "openai" as const,
    provider: "openai" as const,
    model: "fake",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop" as const,
    timestamp: 0,
  };
}

function fakeAssistantMessageEventStream(event: {
  type: "done";
  reason: "toolUse" | "stop";
  message: ReturnType<typeof assistantMessageWithToolCall> | ReturnType<typeof assistantTextMessage>;
}): ReturnType<StreamFn> {
  return ({
    async *[Symbol.asyncIterator]() {
      yield event;
    },
    result() {
      return Promise.resolve(event.message);
    },
  } as unknown) as ReturnType<StreamFn>;
}
