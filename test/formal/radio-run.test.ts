import assert from "node:assert/strict";
import type { StreamFn } from "@earendil-works/pi-agent-core";

import {
  createInMemoryRadioTranscriptStore,
  createMineMusicPiAgentAdapter,
  createPiRadioRefillRunPort,
  radioResultFromMessages,
  restoreRadioAgentTranscript,
  type RadioTranscriptStore,
} from "../../src/agent_runtime/index.js";
import type { StageToolContext } from "../../src/contracts/stage_interface.js";
import {
  assistantErrorMessage,
  assistantTextMessage,
  fakeAssistantMessageEventStream,
} from "./helpers/pi-agent-message-fixtures.js";
import type { RadioRefillRunJobPayload } from "../../src/contracts/agent_runtime.js";

const key = {
  ownerScope: "owner_radio_run",
  workspaceId: "default",
};

{
  const transcriptStore = createInMemoryRadioTranscriptStore();
  const firstAgent = createTestRadioAgent("first");
  const runStarts: string[] = [];
  const runPort = createPiRadioRefillRunPort({
    ...key,
    agent: firstAgent,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromMessages: defaultRadioResult,
    onRunStart(payload) {
      runStarts.push(`${payload.wakeReason}:${payload.refillGeneration}`);
    },
  });

  await runPort.runRadioRefill({
    runId: "radio-job-1",
    payload: payload(1),
    signal: new AbortController().signal,
  });

  assert.equal(firstAgent.state.messages.length, 2);
  assert.equal(transcriptStore.snapshot(key).length, 2);

  await transcriptStore.save({
    ...key,
    messages: [],
    now: "2026-06-28T00:00:01.000Z",
  });

  await runPort.runRadioRefill({
    runId: "radio-job-2",
    payload: payload(2),
    signal: new AbortController().signal,
  });

  assert.equal(firstAgent.state.messages.length, 4);
  assert.equal(transcriptStore.snapshot(key).length, 4);
  assert.deepEqual(runStarts, ["low_watermark:1", "low_watermark:2"]);

  const restartedAgent = createTestRadioAgent("restart");
  await restoreRadioAgentTranscript({
    ...key,
    agent: restartedAgent,
    transcriptStore,
  });
  assert.equal(restartedAgent.state.messages.length, 4);

  const restartedRunPort = createPiRadioRefillRunPort({
    ...key,
    agent: restartedAgent,
    transcriptStore,
    clock: () => "2026-06-28T00:00:02.000Z",
    resultFromMessages: defaultRadioResult,
  });
  await restartedRunPort.runRadioRefill({
    runId: "radio-job-3",
    payload: payload(3),
    signal: new AbortController().signal,
  });
  assert.equal(restartedAgent.state.messages.length, 6);
  assert.equal(transcriptStore.snapshot(key).length, 6);
}

{
  const transcriptStore = createInMemoryRadioTranscriptStore();
  let observedSystemPrompt = "";
  let observedMessagesJson = "";
  let observedToolCount = 0;
  const agent = createTestRadioAgent("floor", {
    streamFn(_model, context) {
      observedSystemPrompt = context.systemPrompt ?? "";
      observedMessagesJson = JSON.stringify(context.messages);
      observedToolCount = context.tools?.length ?? 0;
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "stop",
        message: assistantTextMessage("floor"),
      });
    },
  });
  const runPort = createPiRadioRefillRunPort({
    ...key,
    agent,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromMessages: defaultRadioResult,
    baseSystemPrompt: "Base radio prompt.",
    runStartRead: {
      async readWorkspace() {
        return workspaceReadModelFixture();
      },
    },
    prepareRun() {
      agent.state.tools = [fakeRadioTool() as never];
    },
  });

  await runPort.runRadioRefill({
    runId: "radio-job-floor",
    payload: payload(4),
    signal: new AbortController().signal,
  });

  assert.match(observedSystemPrompt, /Base radio prompt\./);
  assert.match(observedSystemPrompt, /Radio Run Floor:/);
  assert.match(observedSystemPrompt, /radio\.directionRevision: 7/);
  assert.match(observedSystemPrompt, /musicExperience\.queueLength: 1/);
  assert.match(observedMessagesJson, /target about 5 tracks/);
  assert.equal(observedToolCount, 1);
}

{
  assert.deepEqual(radioResultFromMessages({
    runId: "radio-result-test",
    payload: payloadWithRevisions({ refillGeneration: 11, radioSessionRevision: 3, radioDirectionRevision: 5 }),
    newMessages: [{
      role: "toolResult",
      toolCallId: "queue-append-call",
      toolName: "music_experience_queue_append",
      content: [{ type: "text", text: "ok" }],
      details: {
        toolName: "music.experience.queue.append",
        result: {
          items: [
            { item: { kind: "material", id: "material:one" }, position: 0 },
            { item: { kind: "material", id: "material:two" }, position: 1 },
          ],
          queueLength: 2,
          queueRevision: 9,
        },
      },
      isError: false,
      timestamp: 0,
    }],
  }), {
    runId: "radio-result-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "appended",
    appendedCount: 2,
  });

  assert.throws(() => radioResultFromMessages({
    runId: "radio-result-error-test",
    payload: payloadWithRevisions({ refillGeneration: 12, radioSessionRevision: 3, radioDirectionRevision: 5 }),
    newMessages: [{
      role: "toolResult",
      toolCallId: "queue-append-call",
      toolName: "music_experience_queue_append",
      content: [{ type: "text", text: "append failed" }],
      details: {},
      isError: true,
      timestamp: 0,
    }],
  }), /failed during music\.experience\.queue\.append/);

  assert.deepEqual(radioResultFromMessages({
    runId: "radio-result-stale-test",
    payload: payloadWithRevisions({ refillGeneration: 13, radioSessionRevision: 3, radioDirectionRevision: 5 }),
    newMessages: [{
      role: "toolResult",
      toolCallId: "queue-append-call",
      toolName: "music_experience_queue_append",
      content: [{ type: "text", text: "Music Experience command basis was stale at commit time." }],
      details: {
        toolName: "music.experience.queue.append",
        error: {
          code: "voided_stale",
          message: "Music Experience command basis was stale at commit time.",
          area: "music_experience",
          retryable: true,
        },
      },
      isError: true,
      timestamp: 0,
    }],
  }), {
    runId: "radio-result-stale-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "voided_stale",
    appendedCount: 0,
  });

  assert.deepEqual(radioResultFromMessages({
    runId: "radio-result-idle-test",
    payload: payloadWithRevisions({ refillGeneration: 14, radioSessionRevision: 3, radioDirectionRevision: 5 }),
    newMessages: [assistantTextMessage("radio idle")],
  }), {
    runId: "radio-result-idle-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "no_action",
    appendedCount: 0,
  });
}

{
  const transcriptStore = createInMemoryRadioTranscriptStore();
  const agent = createTestRadioAgent("error", {
    streamFn() {
      return fakeAssistantMessageEventStream({
        type: "error",
        reason: "error",
        error: assistantErrorMessage("error", "provider exploded"),
      });
    },
  });
  const runPort = createPiRadioRefillRunPort({
    ...key,
    agent,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromMessages: defaultRadioResult,
  });

  await assert.rejects(
    () => runPort.runRadioRefill({
      runId: "radio-job-error",
      payload: payload(5),
      signal: new AbortController().signal,
    }),
    /ended error: provider exploded/,
  );
}

{
  const transcriptStore: RadioTranscriptStore = {
    async load() {
      return [];
    },
    async save() {
      throw new Error("transcript save failed");
    },
  };
  const runPort = createPiRadioRefillRunPort({
    ...key,
    agent: createTestRadioAgent("save-failed"),
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromMessages: defaultRadioResult,
  });

  await assert.rejects(
    () => runPort.runRadioRefill({
      runId: "radio-job-save-failed",
      payload: payload(6),
      signal: new AbortController().signal,
    }),
    /transcript save failed/,
  );
}

{
  const transcriptStore = createInMemoryRadioTranscriptStore();
  const controller = new AbortController();
  const agent = createTestRadioAgent("abort", {
    async streamFn(_model, _context, options) {
      const message = assistantErrorMessage("aborted", "background job aborted");
      setTimeout(() => controller.abort(), 0);
      if (options?.signal !== undefined && !options.signal.aborted) {
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener("abort", () => resolve(), { once: true });
          setTimeout(resolve, 0);
        });
      }
      return fakeAssistantMessageEventStream({
        type: "error",
        reason: "aborted",
        error: message,
      });
    },
  });
  const originalAbort = agent.abort.bind(agent);
  let abortCalls = 0;
  agent.abort = () => {
    abortCalls += 1;
    originalAbort();
  };
  const runPort = createPiRadioRefillRunPort({
    ...key,
    agent,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromMessages: defaultRadioResult,
  });
  const running = runPort.runRadioRefill({
    runId: "radio-job-abort",
    payload: payload(7),
    signal: controller.signal,
  });

  assert.deepEqual(await running, {
    runId: "radio-job-abort",
    radioDirectionRevision: 0,
    radioSessionRevision: 0,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  assert.equal(abortCalls, 1);
}

{
  const transcriptStore = createInMemoryRadioTranscriptStore();
  const controller = new AbortController();
  controller.abort();
  const runPort = createPiRadioRefillRunPort({
    ...key,
    agent: createTestRadioAgent("pre-abort"),
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromMessages: defaultRadioResult,
  });

  assert.deepEqual(await runPort.runRadioRefill({
    runId: "radio-job-pre-abort",
    payload: payload(8),
    signal: controller.signal,
  }), {
    runId: "radio-job-pre-abort",
    radioDirectionRevision: 0,
    radioSessionRevision: 0,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  assert.equal(transcriptStore.snapshot(key).length, 0);
}

{
  const transcriptStore = createInMemoryRadioTranscriptStore();
  const agent = createTestRadioAgent("concurrent");
  let resolveRead: ((value: ReturnType<typeof workspaceReadModelFixture>) => void) | undefined;
  const runPort = createPiRadioRefillRunPort({
    ...key,
    agent,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromMessages: defaultRadioResult,
    runStartRead: {
      readWorkspace() {
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      },
    },
  });
  const firstRun = runPort.runRadioRefill({
    runId: "radio-job-concurrent-1",
    payload: payload(9),
    signal: new AbortController().signal,
  });

  await assert.rejects(
    () => runPort.runRadioRefill({
      runId: "radio-job-concurrent-2",
      payload: payload(10),
      signal: new AbortController().signal,
    }),
    /cannot start while 'radio-job-concurrent-1' is active/,
  );
  assert.ok(resolveRead !== undefined);
  resolveRead(workspaceReadModelFixture());
  await firstRun;
}

{
  const transcriptStore = createInMemoryRadioTranscriptStore();
  const runPort = createPiRadioRefillRunPort({
    ...key,
    agent: createTestRadioAgent("missing-result-extractor"),
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
  });

  await assert.rejects(
    () => runPort.runRadioRefill({
      runId: "radio-job-missing-result-extractor",
      payload: payload(11),
      signal: new AbortController().signal,
    }),
    /has no result extractor/,
  );
}

{
  const transcriptStore = createInMemoryRadioTranscriptStore();
  await transcriptStore.save({
    ...key,
    messages: [{ role: "assistant" } as never],
    now: "2026-06-28T00:00:00.000Z",
  });

  await assert.rejects(
    () => restoreRadioAgentTranscript({
      ...key,
      agent: createTestRadioAgent("corrupt"),
      transcriptStore,
    }),
    /Stored Radio transcript message at index 0 is invalid/,
  );
}

function payload(refillGeneration: number) {
  return payloadWithRevisions({
    refillGeneration,
    radioSessionRevision: 0,
    radioDirectionRevision: 0,
  });
}

function payloadWithRevisions(input: {
  refillGeneration: number;
  radioSessionRevision: number;
  radioDirectionRevision: number;
}) {
  return {
    workspaceId: key.workspaceId,
    ownerScope: key.ownerScope,
    radioSessionRevision: input.radioSessionRevision,
    radioDirectionRevision: input.radioDirectionRevision,
    wakeReason: "low_watermark" as const,
    refillGeneration: input.refillGeneration,
    suggestedAppendCount: 5,
  };
}

function defaultRadioResult(input: {
  runId: string;
  payload: RadioRefillRunJobPayload;
}) {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "no_action" as const,
    appendedCount: 0,
  };
}

function createTestRadioAgent(label: string, input: { streamFn?: StreamFn } = {}) {
  let streamCallCount = 0;
  return createMineMusicPiAgentAdapter({
    systemPrompt: `You are Radio ${label}.`,
    tools: [],
    dispatch: {
      async dispatch() {
        throw new Error("Radio run transcript test has no tools.");
      },
    },
    contextFactory: {
      createToolContext(input) {
        return createMinimalContext(input.sessionId, input.requestId, input.abortSignal);
      },
    },
    stageSessionId: `stage-${label}`,
    agentOptions: {
      streamFn(...streamInput) {
        if (input.streamFn !== undefined) {
          return input.streamFn(...streamInput);
        }
        streamCallCount += 1;
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: "stop",
          message: assistantTextMessage(`${label}-${streamCallCount}`),
        });
      },
    },
  });
}

function createMinimalContext(
  sessionId: string,
  requestId: string,
  abortSignal?: AbortSignal,
): StageToolContext {
  return {
    ownerScope: key.ownerScope,
    sessionId,
    requestId,
    clock: () => "2026-06-28T00:00:00.000Z",
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
            code: "agent_runtime.lookup_cursor_unavailable",
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

function fakeRadioTool() {
  return {
    name: "radio_fake_tool",
    label: "Radio fake tool",
    description: "A fake Radio tool for provider context snapshot tests.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    async execute() {
      return {
        content: [{ type: "text" as const, text: "ok" }],
        details: { ok: true },
      };
    },
  };
}

function workspaceReadModelFixture() {
  return {
    ownerScope: key.ownerScope,
    capturedAt: "2026-06-28T00:00:00.000Z",
    musicExperience: {
      revision: 11,
      queue: [{
        position: 0,
        item: { kind: "material" as const, id: "material:already-queued" },
        label: "Already Queued",
      }],
      radio: {
        directionRevision: 7,
        direction: {
          motif: { kind: "text" as const, text: "late night neon" },
          activeVariations: [],
        },
        posture: {
          lean: [],
          stale: false,
        },
      },
    },
  };
}
