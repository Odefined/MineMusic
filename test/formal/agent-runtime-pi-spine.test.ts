import assert from "node:assert/strict";

import type { Ref, Result } from "../../src/contracts/kernel.js";
import type {
  InstrumentDescriptor,
  JsonSchema,
  MusicDiscoveryLookupOutput,
  StageToolContext,
  StageToolRegistration,
  ToolCallOutput,
  ToolDeclaration,
} from "../../src/contracts/stage_interface.js";
import type {
  RetrievalQueryHit,
  RetrievalQueryInput,
  RetrievalQueryResult,
  RetrievalQueryService,
} from "../../src/music_intelligence/index.js";
import {
  toPiToolName,
  type MineMusicPiAgentAdapterOptions,
  type StageToolDispatchPort,
} from "../../src/agent_runtime/index.js";
import { createMineMusicPiAgentAdapter } from "../../src/agent_runtime/pi_engine.js";
import { createStageToolBridge } from "../../src/agent_runtime/stage_tool_bridge.js";
import {
  createInMemoryMusicScopeAvailabilityPort,
  createMusicDiscoveryLookupRegistration,
  musicDiscoveryInstrument,
  musicDiscoveryLookupDescriptor,
} from "../../src/music_intelligence/stage_adapter/index.js";
import {
  createStageInterface,
  renderModelVisibleToolDescription,
} from "../../src/stage_interface/index.js";
import {
  assistantMessageWithToolCall,
  assistantTextMessage,
  fakeAssistantMessageEventStream,
} from "./helpers/pi-agent-message-fixtures.js";

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
  examples: [
    { prompt: "lookup x", expects: "call" },
    { prompt: "lookup x without using agent.test.lookup", expects: "avoid" },
  ],
  sideEffect: {
    durableUserStateWrite: false,
    ownerCurationWrite: false,
    runtimeStateWrite: false,
    externalCall: false,
  },
  invocationPolicy: {
    defaultDecision: "auto",
    impactClass: "read",
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

const stageA1bInstrument: InstrumentDescriptor = {
  id: "stage.a1b",
  label: "Stage A1b",
  ownerArea: "stage_interface",
};

const stageA1bDescriptor: ToolDeclaration = {
  ...descriptor,
  name: "stage.a1b.lookup",
  instrumentId: stageA1bInstrument.id,
  label: "Stage A1b Lookup",
  ownerArea: "stage_interface",
  description: "Lookup through Stage dispatch for A1b gate tests.",
  usage: {
    useWhen: "Use in A1b dispatch gate tests.",
    doNotUseWhen: "Do not use outside A1b dispatch gate tests.",
    outputSemantics: "Returns a compact answer.",
  },
  errors: [
    {
      code: "stage.a1b.bad_query",
      retryable: false,
      suggestedFixTemplate: "Use a non-empty query.",
    },
  ],
};

const piToolName = toPiToolName(descriptor.name);

assert.equal(piToolName, "agent_test_lookup");

assert.throws(
  () => createStageToolBridge({
    tools: [
      descriptor,
      {
        ...descriptor,
        name: "agent.test_lookup",
      },
    ],
    dispatch: {
      async dispatch() {
        return {
          ok: true,
          value: {
            toolName: descriptor.name,
            result: { answer: "found" },
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
    stageSessionId: "stage-session",
  }),
  /Stage tool names 'agent\.test\.lookup' and 'agent\.test_lookup' both map to provider-safe tool name 'agent_test_lookup'\./u,
);

{
  const writeDescriptor: ToolDeclaration = {
    ...descriptor,
    name: "agent.test.write",
    sideEffect: {
      durableUserStateWrite: false,
      ownerCurationWrite: false,
      runtimeStateWrite: true,
      externalCall: false,
    },
    invocationPolicy: {
      ...descriptor.invocationPolicy,
      impactClass: "local-bounded",
      readOnlyHint: false,
    },
  };
  const tools = createStageToolBridge({
    tools: [descriptor, writeDescriptor],
    dispatch: {
      async dispatch() {
        throw new Error("Execution mode contract test must not dispatch.");
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
    stageSessionId: "stage-session-execution-mode",
  });

  assert.equal(tools.find((tool) => tool.name === piToolName)?.executionMode, undefined);
  assert.equal(tools.find((tool) => tool.name === toPiToolName(writeDescriptor.name))?.executionMode, "sequential");
}

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
    stageSessionId: "stage-session",
  });

  assert.equal(tool?.name, piToolName);
  assert.equal(tool?.parameters, descriptor.inputSchema);
  assert.equal(tool?.description, renderModelVisibleToolDescription(descriptor));
  assert.match(tool?.description ?? "", /"lookup x without using agent\.test\.lookup" -> avoid/u);

  const output = await tool?.execute("tool-call-1", { query: "x" }, controller.signal);

  assert.deepEqual(output?.details, {
    toolName: descriptor.name,
    result: { answer: "found" },
  });
  assert.equal(output?.content[0]?.type, "text");
  assert.equal(output?.content[0]?.text, "answer=found");
  assert.equal(dispatched?.toolName, descriptor.name);
  assert.deepEqual(dispatched?.payload, { query: "x" });
  assert.equal(dispatched?.ctx.sessionId, "stage-session");
  assert.equal(dispatched?.ctx.requestId, "tool-call-1");
  assert.equal(dispatched?.ctx.abortSignal, controller.signal);
}

{
  const throwingSummaryDescriptor: ToolDeclaration = {
    ...descriptor,
    resultSummary() {
      throw new Error("broken resultSummary");
    },
  };
  const [tool] = createStageToolBridge({
    tools: [throwingSummaryDescriptor],
    dispatch: {
      async dispatch(input) {
        return {
          ok: true,
          value: {
            toolName: input.toolName,
            result: { answer: "found" },
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
    stageSessionId: "stage-session",
  });

  await assert.rejects(
    () => {
      assert.ok(tool !== undefined);
      return tool.execute("tool-call-summary-throws", { query: "x" });
    },
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      if (error instanceof Error) {
        assert.equal(error.message, "Tool 'agent.test.lookup' public text invariant failed: resultSummary failed.");
        assert.equal(error.message.includes("broken resultSummary"), false);
      }
      return true;
    },
  );
}

{
  const emptySummaryDescriptor: ToolDeclaration = {
    ...descriptor,
    resultSummary() {
      return "   ";
    },
  };
  const [tool] = createStageToolBridge({
    tools: [emptySummaryDescriptor],
    dispatch: {
      async dispatch(input) {
        return {
          ok: true,
          value: {
            toolName: input.toolName,
            result: { answer: "found" },
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
    stageSessionId: "stage-session",
  });

  await assert.rejects(
    () => {
      assert.ok(tool !== undefined);
      return tool.execute("tool-call-summary-empty", { query: "x" });
    },
    /Tool 'agent\.test\.lookup' public text invariant failed: resultSummary returned empty text\./u,
  );
}

{
  const leakySummaryDescriptor: ToolDeclaration = {
    ...descriptor,
    resultSummary() {
      return "leaked material:recording:m_internal here";
    },
  };
  const [tool] = createStageToolBridge({
    tools: [leakySummaryDescriptor],
    dispatch: {
      async dispatch(input) {
        return {
          ok: true,
          value: {
            toolName: input.toolName,
            result: { answer: "found" },
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
    stageSessionId: "stage-session",
  });

  await assert.rejects(
    () => {
      assert.ok(tool !== undefined);
      return tool.execute("tool-call-summary-leaks", { query: "x" });
    },
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      if (error instanceof Error) {
        assert.equal(error.message, "Tool 'agent.test.lookup' public text invariant failed: resultSummary exposes internal anchors.");
        assert.equal(error.message.includes("material:recording:m_internal"), false);
      }
      return true;
    },
  );
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
    stageSessionId: "stage-session",
  });

  assert.ok(tool !== undefined);
  const failed = await tool.execute("tool-call-2", { query: "" });
  assert.equal(failed.content[0]?.type, "text");
  assert.match(failed.content[0]?.text ?? "", /Bad query\.\nSuggested fix: Use a better query\./u);
  assert.deepEqual(failed.details, {
    toolName: descriptor.name,
    error: {
      code: "agent.test.bad_query",
      message: "Bad query.",
      area: "agent_runtime",
      retryable: false,
      suggestedFix: "Use a better query.",
    },
  });
}

{
  const [tool] = createStageToolBridge({
    tools: [descriptor],
    dispatch: {
      async dispatch(): Promise<Result<ToolCallOutput>> {
        return {
          ok: false,
          error: {
            code: "stage_interface.invalid_output",
            message: "Internal schema failure leaked materialRef abc.",
            area: "stage_interface",
            retryable: false,
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
    stageSessionId: "stage-session",
  });

  await assert.rejects(
    () => {
      assert.ok(tool !== undefined);
      return tool.execute("tool-call-internal-failure", { query: "x" });
    },
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      if (error instanceof Error) {
        assert.equal(error.message, "Tool 'agent.test.lookup' failed due to an internal runtime error.");
        assert.equal(error.message.includes("materialRef"), false);
      }
      return true;
    },
  );
}

{
  let streamCallCount = 0;
  const agent = createMineMusicPiAgentAdapter({
    systemPrompt: "You are a MineMusic test agent.",
    tools: [descriptor],
    dispatch: {
      async dispatch(input) {
        return {
          ok: true,
          value: {
            toolName: input.toolName,
            result: { answer: "from-pi" },
            runtime: { changedBasis: { queueRevision: 4 } },
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
    stageSessionId: "stage-session",
    llmProviderSessionId: "provider-session",
    agentOptions: {
      streamFn() {
        streamCallCount += 1;
        const message = streamCallCount === 1
          ? assistantMessageWithToolCall("tool-call-3", piToolName, { query: "x" })
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
  assert.equal(agent.sessionId, "provider-session");
  assert.equal(agent.state.tools.length, 1);
  assert.equal(agent.state.tools[0]?.name, piToolName);

  await agent.prompt("lookup x");

  assert.equal(streamCallCount, 2);
  const toolResult = agent.state.messages.find((message) => message.role === "toolResult");
  assert.equal(toolResult?.toolName, piToolName);
  assert.equal(toolResult?.isError, false);
  assert.equal(toolResult?.content[0]?.type, "text");
  assert.equal(toolResult?.content[0]?.text.includes("changedBasis"), false);
  assert.deepEqual(toolResult?.details, {
    toolName: descriptor.name,
    result: { answer: "from-pi" },
    runtime: { changedBasis: { queueRevision: 4 } },
  });
}

{
  let handlerCallCount = 0;
  const gateInputs: unknown[] = [];
  const stageRegistration: StageToolRegistration = {
    descriptor: stageA1bDescriptor,
    handler() {
      handlerCallCount += 1;
      return {
        ok: true,
        value: { answer: "should-not-run" },
      };
    },
  };
  const stageInterface = createStageInterface({
    instruments: [stageA1bInstrument],
    registrations: [stageRegistration],
  });
  let streamCallCount = 0;
  const agent = createMineMusicPiAgentAdapter({
    systemPrompt: "You are a MineMusic test agent.",
    tools: [stageA1bDescriptor],
    dispatch: {
      dispatch(input) {
        return stageInterface.dispatch(input.ctx, {
          toolName: input.toolName,
          payload: input.payload,
        });
      },
    },
    contextFactory: {
      createToolContext(input: {
        sessionId: string;
        requestId: string;
        abortSignal?: AbortSignal;
      }) {
        return {
          ...createMinimalContext(input.sessionId, input.requestId, input.abortSignal),
          executionGate: {
            async preflight(gateInput) {
              gateInputs.push(gateInput);
              return {
                decision: "ask",
                auditLevel: "metadata",
                publicReason: "Needs approval before running this tool.",
              };
            },
          },
        };
      },
    },
    stageSessionId: "stage-session",
    llmProviderSessionId: "provider-session",
    agentOptions: {
      streamFn() {
        streamCallCount += 1;
        const message = streamCallCount === 1
          ? assistantMessageWithToolCall("tool-call-stage-gate", toPiToolName(stageA1bDescriptor.name), { query: "x" })
          : assistantTextMessage("done");
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: streamCallCount === 1 ? "toolUse" : "stop",
          message,
        });
      },
    },
  });

  await agent.prompt("lookup x");

  assert.equal(streamCallCount, 2);
  assert.equal(handlerCallCount, 0);
  assert.equal(gateInputs.length, 1);
  assert.deepEqual(gateInputs[0], {
    descriptor: stageA1bDescriptor,
    ownerScope: "local",
    sessionId: "stage-session",
    requestId: "tool-call-stage-gate",
    arguments: { query: "x" },
    actorTrustBasis: "user-intent-backed",
    askBeforeSourceOfTruthEdits: false,
  });
  assert.equal(agent.sessionId, "provider-session");
  const toolResult = agent.state.messages.find((message) => message.role === "toolResult");
  assert.equal(toolResult?.toolName, toPiToolName(stageA1bDescriptor.name));
  assert.equal(toolResult?.isError, true);
  assert.equal(toolResult?.content[0]?.type, "text");
  assert.equal(toolResult?.content[0]?.text, "Needs approval before running this tool.");
}

{
  const lookupPiToolName = toPiToolName(musicDiscoveryLookupDescriptor.name);
  const lookupQueryCalls: RetrievalQueryInput[] = [];
  const mintedAnchors: unknown[] = [];
  const materialRef = ref("material", "recording", "m_agent_runtime_lookup");
  const retrievalQuery: RetrievalQueryService = {
    async query(input) {
      lookupQueryCalls.push(input);
      return retrievalResult({
        input,
        hits: [
          materialHit({
            materialRef,
            title: "whoo",
            artistsText: "Nemophila",
            album: "Seize the Fate",
            versionText: "live",
          }),
        ],
      });
    },
  };
  const stageInterface = createStageInterface({
    instruments: [musicDiscoveryInstrument],
    registrations: [
      createMusicDiscoveryLookupRegistration({
        retrievalQuery,
        scopeAvailability: createInMemoryMusicScopeAvailabilityPort({
          sourceLibraries: [],
          relations: [],
          providers: [],
          collections: [],
        }),
      }),
    ],
  });
  let streamCallCount = 0;
  let secondProviderMessagesJson = "";
  const agent = createMineMusicPiAgentAdapter({
    systemPrompt: "You are a MineMusic test agent.",
    tools: [musicDiscoveryLookupDescriptor],
    dispatch: {
      dispatch(input) {
        return stageInterface.dispatch(input.ctx, {
          toolName: input.toolName,
          payload: input.payload,
        });
      },
    },
    contextFactory: {
      createToolContext(input: {
        sessionId: string;
        requestId: string;
        abortSignal?: AbortSignal;
      }) {
        return createLookupContext(input.sessionId, input.requestId, mintedAnchors, input.abortSignal);
      },
    },
    stageSessionId: "stage-session",
    llmProviderSessionId: "provider-session",
    agentOptions: {
      streamFn(_model, context) {
        streamCallCount += 1;
        if (streamCallCount === 2) {
          secondProviderMessagesJson = JSON.stringify(context.messages);
        }
        const message = streamCallCount === 1
          ? assistantMessageWithToolCall("tool-call-real-lookup", lookupPiToolName, {
              lookupText: "whoo",
              targetKind: "recording",
              scopes: ["[library]"],
              limit: 1,
            })
          : assistantTextMessage("done");
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: streamCallCount === 1 ? "toolUse" : "stop",
          message,
        });
      },
    },
  });

  assert.equal(lookupPiToolName, "music_discovery_lookup");
  assert.equal(agent.state.tools[0]?.name, lookupPiToolName);

  await agent.prompt("lookup whoo");

  assert.equal(streamCallCount, 2);
  assert.deepEqual(lookupQueryCalls, [
    {
      ownerScope: "local",
      text: "whoo",
      materialKind: "recording",
      pools: {
        anyOf: [{ kind: "local_catalog" }],
      },
      order: "text_relevance",
      limit: 1,
      sessionId: "stage-session",
    },
  ]);
  assert.deepEqual(mintedAnchors, [
    {
      materialRef: "material:recording:m_agent_runtime_lookup",
    },
  ]);

  const toolResult = agent.state.messages.find((message) => message.role === "toolResult");
  assert.equal(toolResult?.toolName, lookupPiToolName);
  assert.equal(toolResult?.isError, false);
  assert.equal(toolResult?.content[0]?.type, "text");
  assert.match(toolResult?.content[0]?.text ?? "", /1 item\(s\) returned; end of results\./u);
  assert.match(toolResult?.content[0]?.text ?? "", /0\. "whoo - Nemophila" \[material:public_material_1\]/u);
  assert.match(toolResult?.content[0]?.text ?? "", /title: "whoo"; artists: "Nemophila"; album: "Seize the Fate"; version: "live"/u);
  assert.equal(toolResult?.details?.toolName, musicDiscoveryLookupDescriptor.name);
  assert.equal(secondProviderMessagesJson.includes('"details"'), false);
  assert.match(secondProviderMessagesJson, /whoo - Nemophila/u);

  const output = toolResult?.details?.result as MusicDiscoveryLookupOutput | undefined;
  assert.deepEqual(output, {
    items: [
      {
        handle: "[material:public_material_1]",
        description: {
          label: "whoo - Nemophila",
          title: "whoo",
          artistsText: "Nemophila",
          album: "Seize the Fate",
          versionText: "live",
        },
      },
    ],
  });
  assertPiLookupOutputIsVeiled(output);
}

{
  let streamCallCount = 0;
  const agent = createMineMusicPiAgentAdapter({
    systemPrompt: "You are a MineMusic test agent.",
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
        return createMinimalContext(input.sessionId, input.requestId, input.abortSignal);
      },
    },
    stageSessionId: "stage-session",
    agentOptions: {
      streamFn() {
        streamCallCount += 1;
        const message = streamCallCount === 1
          ? assistantMessageWithToolCall("tool-call-4", piToolName, { query: "" })
          : assistantTextMessage("done");
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: streamCallCount === 1 ? "toolUse" : "stop",
          message,
        });
      },
    },
  });

  await agent.prompt("lookup x");

  assert.equal(streamCallCount, 2);
  const toolResult = agent.state.messages.find((message) => message.role === "toolResult");
  assert.equal(toolResult?.toolName, piToolName);
  assert.equal(toolResult?.isError, true);
  assert.equal(toolResult?.content[0]?.type, "text");
  assert.match(toolResult?.content[0]?.text ?? "", /Bad query\.\nSuggested fix: Use a better query\./u);
  assert.deepEqual(toolResult?.details, {
    toolName: descriptor.name,
    error: {
      code: "agent.test.bad_query",
      message: "Bad query.",
      area: "agent_runtime",
      retryable: false,
      suggestedFix: "Use a better query.",
    },
  });
}

{
  let streamCallCount = 0;
  const agent = createMineMusicPiAgentAdapter({
    systemPrompt: "You are a MineMusic test agent.",
    tools: [descriptor],
    dispatch: {
      async dispatch(): Promise<Result<ToolCallOutput>> {
        return {
          ok: false,
          error: {
            code: "stage_interface.tool_handler_failed",
            message: "Handler threw with sourceRef xyz.",
            area: "stage_interface",
            retryable: false,
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
    stageSessionId: "stage-session",
    agentOptions: {
      streamFn() {
        streamCallCount += 1;
        const message = streamCallCount === 1
          ? assistantMessageWithToolCall("tool-call-5", piToolName, { query: "x" })
          : assistantTextMessage("done");
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: streamCallCount === 1 ? "toolUse" : "stop",
          message,
        });
      },
    },
  });

  await agent.prompt("lookup x");

  assert.equal(streamCallCount, 2);
  const toolResult = agent.state.messages.find((message) => message.role === "toolResult");
  assert.equal(toolResult?.toolName, piToolName);
  assert.equal(toolResult?.isError, true);
  assert.equal(toolResult?.content[0]?.type, "text");
  assert.equal(toolResult?.content[0]?.text, "Tool 'agent.test.lookup' failed due to an internal runtime error.");
  assert.equal(JSON.stringify(toolResult).includes("sourceRef"), false);
}

{
  const leakySummaryDescriptor: ToolDeclaration = {
    ...descriptor,
    resultSummary() {
      return "leaked sourceRef source_netease:track:1901371647";
    },
  };
  let streamCallCount = 0;
  const agent = createMineMusicPiAgentAdapter({
    systemPrompt: "You are a MineMusic test agent.",
    tools: [leakySummaryDescriptor],
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
    stageSessionId: "stage-session",
    agentOptions: {
      streamFn() {
        streamCallCount += 1;
        const message = streamCallCount === 1
          ? assistantMessageWithToolCall("tool-call-6", piToolName, { query: "x" })
          : assistantTextMessage("done");
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: streamCallCount === 1 ? "toolUse" : "stop",
          message,
        });
      },
    },
  });

  await agent.prompt("lookup x");

  assert.equal(streamCallCount, 2);
  const toolResult = agent.state.messages.find((message) => message.role === "toolResult");
  assert.equal(toolResult?.toolName, piToolName);
  assert.equal(toolResult?.isError, true);
  assert.equal(toolResult?.content[0]?.type, "text");
  assert.equal(toolResult?.content[0]?.text, "Tool 'agent.test.lookup' public text invariant failed: resultSummary exposes internal anchors.");
  assert.equal(JSON.stringify(toolResult).includes("sourceRef"), false);
  assert.equal(JSON.stringify(toolResult).includes("source_netease:track:1901371647"), false);
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
    actorTrustBasis: "user-intent-backed",
    askBeforeSourceOfTruthEdits: false,
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

function createLookupContext(
  sessionId: string,
  requestId: string,
  mintedAnchors: unknown[],
  abortSignal?: AbortSignal,
): StageToolContext {
  return {
    ...createMinimalContext(sessionId, requestId, abortSignal),
    handleMinting: {
      async mint(input) {
        mintedAnchors.push(input.internalAnchor);
        return `public_${input.handleKind}_${mintedAnchors.length}`;
      },
      async resolve() {
        return undefined;
      },
    },
  };
}

function retrievalResult(input: {
  input: RetrievalQueryInput;
  hits: readonly RetrievalQueryHit[];
}): RetrievalQueryResult {
  return {
    query: {
      ownerScope: input.input.ownerScope ?? "local",
      ...(input.input.text === undefined ? {} : { text: input.input.text }),
      ...(input.input.materialKind === undefined ? {} : { materialKind: input.input.materialKind }),
      ...(input.input.pools === undefined ? {} : { pools: input.input.pools }),
      order: "text_relevance",
    },
    basis: {
      ownerCatalogVisibilityApplied: true,
      blockedMaterialsExcluded: true,
    },
    hits: input.hits,
    page: {
      limit: input.input.limit ?? 20,
    },
  };
}

function materialHit(input: {
  materialRef: Ref;
  title?: string;
  artistsText?: string;
  album?: string;
  versionText?: string;
}): RetrievalQueryHit {
  return {
    kind: "material",
    materialRef: input.materialRef,
    materialKind: "recording",
    display: {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.artistsText === undefined ? {} : { artistsText: input.artistsText }),
      ...(input.album === undefined ? {} : { album: input.album }),
      ...(input.versionText === undefined ? {} : { versionText: input.versionText }),
    },
    pools: {
      matched: [],
    },
    basis: {
      textMatched: true,
      poolFilterApplied: true,
      positivePoolMatched: true,
    },
  };
}

function ref(namespace: string, kind: string, id: string): Ref {
  return {
    namespace,
    kind,
    id,
  };
}

function assertPiLookupOutputIsVeiled(output: MusicDiscoveryLookupOutput | undefined): void {
  assert.ok(output !== undefined);
  const text = JSON.stringify(output);
  for (const forbidden of [
    "m_agent_runtime_lookup",
    "materialRef",
    "materialCandidateRef",
    "sourceRef",
    "canonicalRef",
    "internal_cursor",
  ]) {
    assert.equal(text.includes(forbidden), false, `pi lookup output leaked internal token '${forbidden}'`);
  }
}
