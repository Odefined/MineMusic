import assert from "node:assert/strict";
import type { StreamFn } from "@earendil-works/pi-agent-core";

import {
  createAgentRuntimeBackgroundRefillPort as createProductionBackgroundRefillPort,
  createActorRuntimeSession,
  createInMemoryAgentRuntimeTranscriptStore,
  createRadioRunResultRecorder,
  createWorkspaceContextAssembler,
  toPiToolName,
  type ActorRuntimeSession,
  type AgentRuntimeTranscriptStore,
  type StageToolDispatchPort,
  type WorkspaceContextAssembler,
  type WorkspaceContextAssembly,
} from "../../src/agent_runtime/index.js";
import type { StageToolContext, ToolDeclaration } from "../../src/contracts/stage_interface.js";
import type { MusicExperienceWorkspaceProjection } from "../../src/contracts/music_experience.js";
import type { AgentActorKind, ConcernRevisionSet } from "../../src/contracts/kernel.js";
import {
  playbackQueueAppendDescriptor,
  playbackQueueMoveDescriptor,
  radioLeanAddDescriptor,
} from "../../src/music_experience/stage_adapter/index.js";
import {
  assistantErrorMessage,
  assistantMessageWithToolCall,
  assistantTextMessage,
  fakeAssistantMessageEventStream,
} from "./helpers/pi-agent-message-fixtures.js";
import type { RadioRefillRunJobPayload } from "../../src/contracts/agent_runtime.js";

const key = {
  ownerScope: "owner_radio_run",
  workspaceId: "default",
  actor: "radio_agent" as const,
};

function createAgentRuntimeBackgroundRefillPort(input: {
  session: ActorRuntimeSession;
  ownerScope?: string;
  workspaceId?: string;
  actor?: AgentActorKind;
  transcriptStore?: AgentRuntimeTranscriptStore;
  clock?: () => string;
  workspaceContext?: WorkspaceContextAssembler;
  promptForPayload?: Parameters<typeof createProductionBackgroundRefillPort>[0]["promptForPayload"];
  hooks?: Parameters<typeof createProductionBackgroundRefillPort>[0]["hooks"];
  resultFromRun?: Parameters<typeof createProductionBackgroundRefillPort>[0]["resultFromRun"];
}) {
  return createProductionBackgroundRefillPort({
    session: input.session,
    ...(input.promptForPayload === undefined ? {} : { promptForPayload: input.promptForPayload }),
    ...(input.hooks === undefined ? {} : { hooks: input.hooks }),
    ...(input.resultFromRun === undefined ? {} : { resultFromRun: input.resultFromRun }),
  });
}

function createCountingTranscriptStore(): {
  store: AgentRuntimeTranscriptStore;
  loadCount(): number;
  saveCount(): number;
  snapshot(): readonly Parameters<AgentRuntimeTranscriptStore["save"]>[0]["messages"][number][];
} {
  let loads = 0;
  let saves = 0;
  let messages: readonly Parameters<AgentRuntimeTranscriptStore["save"]>[0]["messages"][number][] = [];
  return {
    store: {
      async load() {
        loads += 1;
        return messages.slice();
      },
      async save(input) {
        saves += 1;
        messages = input.messages.slice();
      },
    },
    loadCount() {
      return loads;
    },
    saveCount() {
      return saves;
    },
    snapshot() {
      return messages;
    },
  };
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const firstSession = createTestActorRuntimeSession("first", {
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
  });
  const runStarts: string[] = [];
  const runPort = createAgentRuntimeBackgroundRefillPort({
    session: firstSession,
    resultFromRun: defaultRadioResult,
    hooks: {
      onRunStart(input) {
        runStarts.push(input.runId);
      },
    },
  });

  await runPort.runRadioRefill({
    runId: "radio-job-1",
    payload: payload(1),
    signal: new AbortController().signal,
  });

  assert.equal(firstSession.agent.state.messages.length, 2);
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

  assert.equal(firstSession.agent.state.messages.length, 4);
  assert.equal(transcriptStore.snapshot(key).length, 4);
  assert.deepEqual(runStarts, ["radio-job-1", "radio-job-2"]);

  const restartedSession = createTestActorRuntimeSession("restart", {
    transcriptStore,
    clock: () => "2026-06-28T00:00:02.000Z",
  });
  await restartedSession.restoreTranscript();
  assert.equal(restartedSession.agent.state.messages.length, 4);

  const restartedRunPort = createAgentRuntimeBackgroundRefillPort({
    session: restartedSession,
    resultFromRun: defaultRadioResult,
  });
  await restartedRunPort.runRadioRefill({
    runId: "radio-job-3",
    payload: payload(3),
    signal: new AbortController().signal,
  });
  assert.equal(restartedSession.agent.state.messages.length, 6);
  assert.equal(transcriptStore.snapshot(key).length, 6);
}

{
  const transcript = createCountingTranscriptStore();
  const actorSession = createTestActorRuntimeSession("checkpoint", {
    transcriptStore: transcript.store,
    clock: () => "2026-06-28T00:00:00.000Z",
  });
  await actorSession.restoreTranscript();
  const runPort = createAgentRuntimeBackgroundRefillPort({
    session: actorSession,
    resultFromRun: defaultRadioResult,
  });

  await runPort.runRadioRefill({
    runId: "radio-job-checkpoint-1",
    payload: payload(21),
    signal: new AbortController().signal,
  });
  await runPort.runRadioRefill({
    runId: "radio-job-checkpoint-2",
    payload: payload(22),
    signal: new AbortController().signal,
  });

  assert.equal(transcript.loadCount(), 1);
  assert.equal(transcript.saveCount(), 2);
  assert.equal(transcript.snapshot().length, 4);
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  let observedSystemPrompt = "";
  let observedMessagesJson = "";
  let observedToolCount = 0;
  const actorSession = createTestActorRuntimeSession("floor", {
    transcriptStore,
    tools: [playbackQueueAppendDescriptor],
    workspaceContext: createWorkspaceContextAssembler({
      musicExperience: {
        async readWorkspaceProjection() {
          return workspaceProjectionFixture();
        },
      },
    }),
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
  const runPort = createAgentRuntimeBackgroundRefillPort({
    ...key,
    session: actorSession,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
    workspaceContext: createWorkspaceContextAssembler({
      musicExperience: {
        async readWorkspaceProjection() {
          return workspaceProjectionFixture();
        },
      },
    }),
  });

  await runPort.runRadioRefill({
    runId: "radio-job-floor",
    payload: {
      ...payload(4),
      wakeReason: "direction_changed",
      suggestedAppendCount: 0,
    },
    signal: new AbortController().signal,
  });

  assert.match(observedSystemPrompt, /MineMusic Agent Context/);
  assert.match(observedSystemPrompt, /Actor Identity:/);
  assert.match(observedSystemPrompt, /Workspace Context:/);
  assert.match(observedSystemPrompt, /radio:\ndirection:/);
  assert.equal(observedSystemPrompt.includes("directionRevision"), false);
  assert.equal(observedSystemPrompt.includes("commandedRevisionStamp"), false);
  assert.match(observedSystemPrompt, /0\. recording "Already Queued" \[material:material:already-queued\]/);
  assert.equal(observedSystemPrompt.includes("Radio Run Floor:"), false);
  assert.match(observedMessagesJson, /radio_refill/);
  assert.equal(
    observedMessagesJson.includes("\\\"wakeReason\\\": \\\"direction_changed\\\""),
    true,
  );
  assert.equal(observedMessagesJson.includes("\\\"suggestedAppendCount\\\": 0"), true);
  assert.equal(observedMessagesJson.includes("radioDirectionRevision"), false);
  assert.equal(observedMessagesJson.includes("radioSessionRevision"), false);
  assert.equal(observedToolCount, 1);
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  let observedSystemPrompt = "";
  let projection = workspaceProjectionFixture({
    posture: {
      lean: [{ kind: "text", text: "old stale lean" }],
      commandedRevisionStamp: 6,
      stale: true,
    },
  });
  const actorSession = createTestActorRuntimeSession("stale-posture", {
    transcriptStore,
    workspaceContext: createWorkspaceContextAssembler({
      musicExperience: {
        async readWorkspaceProjection() {
          return projection;
        },
      },
    }),
    streamFn(_model, context) {
      observedSystemPrompt = context.systemPrompt ?? "";
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "stop",
        message: assistantTextMessage("stale cleared"),
      });
    },
  });
  let clearCalls = 0;
  const runPort = createAgentRuntimeBackgroundRefillPort({
    ...key,
    session: actorSession,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
    hooks: {
      async beforeWorkspaceContextAssemble() {
        if (projection.radio.posture.stale) {
          clearCalls += 1;
          projection = workspaceProjectionFixture({
            posture: {
              lean: [],
              commandedRevisionStamp: 7,
              stale: false,
            },
          });
        }
      },
    },
    workspaceContext: createWorkspaceContextAssembler({
      musicExperience: {
        async readWorkspaceProjection() {
          return projection;
        },
      },
    }),
  });

  await runPort.runRadioRefill({
    runId: "radio-job-stale-posture",
    payload: payloadWithRevisions({ refillGeneration: 17, radioSessionRevision: 0, radioDirectionRevision: 7 }),
    signal: new AbortController().signal,
  });

  assert.equal(clearCalls, 1);
  assert.equal(observedSystemPrompt.includes("old stale lean"), false);
  assert.match(observedSystemPrompt, /posture:\nlean:\nempty\nstale: false/u);
  assert.equal(observedSystemPrompt.includes("commandedRevisionStamp"), false);
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const observedContexts: {
    toolName: string;
    preconditionBasis: unknown;
    actor: unknown;
  }[] = [];
  let streamCallCount = 0;
  const actorSession = createTestActorRuntimeSession("basis-tracker", {
    transcriptStore,
    tools: [playbackQueueAppendDescriptor, playbackQueueMoveDescriptor, radioLeanAddDescriptor],
    dispatch: {
      async dispatch(input) {
        observedContexts.push({
          toolName: input.toolName,
          preconditionBasis: input.ctx.preconditionBasis,
          actor: input.ctx.actor,
        });
        if (input.toolName === playbackQueueAppendDescriptor.name) {
          return {
            ok: true,
            value: {
              toolName: input.toolName,
              result: {
                items: [],
                queueLength: 0,
              },
              runtime: { changedBasis: { queueRevision: 12 } },
            },
          };
        }
        if (input.toolName === playbackQueueMoveDescriptor.name) {
          return {
            ok: true,
            value: {
              toolName: input.toolName,
              result: {
                queueLength: 0,
              },
              runtime: { changedBasis: { queueRevision: 13 } },
            },
          };
        }
        return {
          ok: true,
          value: {
            toolName: input.toolName,
            result: {
              posture: {
                lean: [],
                stale: false,
              },
            },
            runtime: { changedBasis: { radioDirectionRevision: 8 } },
          },
        };
      },
    },
    workspaceContext: createWorkspaceContextAssembler({
      musicExperience: {
        async readWorkspaceProjection() {
          return workspaceProjectionFixture({
            concernRevisions: {
              queueRevision: 11,
              radioDirectionRevision: 7,
              radioSessionRevision: 3,
              playbackRevision: 0,
            },
          });
        },
      },
    }),
    streamFn() {
      streamCallCount += 1;
      if (streamCallCount === 1) {
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: "toolUse",
          message: assistantMessageWithToolCall(
            "radio-basis-queue",
            toPiToolName(playbackQueueAppendDescriptor.name),
            { items: ["[material:basis_queue]"] },
          ),
        });
      }
      if (streamCallCount === 2) {
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: "toolUse",
          message: assistantMessageWithToolCall(
            "radio-basis-queue-move",
            toPiToolName(playbackQueueMoveDescriptor.name),
            { from: 0, to: 0 },
          ),
        });
      }
      if (streamCallCount === 3) {
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: "toolUse",
          message: assistantMessageWithToolCall(
            "radio-basis-lean-1",
            toPiToolName(radioLeanAddDescriptor.name),
            { value: { kind: "text", text: "drier drums" } },
          ),
        });
      }
      if (streamCallCount === 4) {
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: "toolUse",
          message: assistantMessageWithToolCall(
            "radio-basis-lean-2",
            toPiToolName(radioLeanAddDescriptor.name),
            { value: { kind: "text", text: "less gloss" } },
          ),
        });
      }
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "stop",
        message: assistantTextMessage("basis checked"),
      });
    },
  });
  const runPort = createAgentRuntimeBackgroundRefillPort({
    ...key,
    session: actorSession,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
    workspaceContext: createWorkspaceContextAssembler({
      musicExperience: {
        async readWorkspaceProjection() {
          return workspaceProjectionFixture({
            concernRevisions: {
              queueRevision: 11,
              radioDirectionRevision: 7,
              radioSessionRevision: 3,
              playbackRevision: 0,
            },
          });
        },
      },
    }),
  });

  await runPort.runRadioRefill({
    runId: "radio-job-basis",
    payload: payloadWithRevisions({ refillGeneration: 18, radioSessionRevision: 99, radioDirectionRevision: 99 }),
    signal: new AbortController().signal,
  });

  assert.deepEqual(observedContexts, [
    {
      toolName: "playback.queue.append",
      preconditionBasis: { radioDirectionRevision: 7, radioSessionRevision: 3 },
      actor: "radio_agent",
    },
    {
      toolName: "playback.queue.move",
      preconditionBasis: { queueRevision: 12, radioDirectionRevision: 7, radioSessionRevision: 3 },
      actor: "radio_agent",
    },
    {
      toolName: "radio.lean.add",
      preconditionBasis: { radioDirectionRevision: 7 },
      actor: "radio_agent",
    },
    {
      toolName: "radio.lean.add",
      preconditionBasis: { radioDirectionRevision: 8 },
      actor: "radio_agent",
    },
  ]);
}

{
  const appendedRecorder = createRadioRunResultRecorder();
  appendedRecorder.observeToolResult({
    toolName: "playback.queue.append",
    result: {
      ok: true,
      value: {
        toolName: "playback.queue.append",
        result: {
          items: [
            { item: "[material:material:one]", index: 0 },
            { item: "[material:material:two]", index: 1 },
          ],
          queueLength: 2,
        },
        runtime: { changedBasis: { queueRevision: 9 } },
      },
    },
  });
  assert.deepEqual(appendedRecorder.result({
    runId: "radio-result-test",
    payload: payloadWithRevisions({ refillGeneration: 11, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "appended",
    appendedCount: 2,
  });

  const failedRecorder = createRadioRunResultRecorder();
  failedRecorder.observeToolResult({
    toolName: "playback.queue.append",
    result: {
      ok: false,
      error: {
        code: "queue_append_failed",
        message: "append failed",
        area: "music_experience",
        retryable: false,
      },
    },
  });
  assert.throws(() => failedRecorder.result({
    runId: "radio-result-error-test",
    payload: payloadWithRevisions({ refillGeneration: 12, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), /failed during playback\.queue\.append/);

  const correctedRecorder = createRadioRunResultRecorder();
  correctedRecorder.observeToolResult({
    toolName: "playback.queue.replace",
    result: {
      ok: true,
      value: {
        toolName: "playback.queue.replace",
        result: {
          item: "[material:material:replacement]",
          index: 1,
          queueLength: 2,
        },
        runtime: { changedBasis: { queueRevision: 10 } },
      },
    },
  });
  assert.deepEqual(correctedRecorder.result({
    runId: "radio-result-corrected-test",
    payload: payloadWithRevisions({ refillGeneration: 17, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-corrected-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "queue_corrected",
    appendedCount: 0,
  });

  const correctedThenFailedRecorder = createRadioRunResultRecorder();
  correctedThenFailedRecorder.observeToolResult({
    toolName: "playback.queue.replace",
    result: {
      ok: true,
      value: {
        toolName: "playback.queue.replace",
        result: {
          item: "[material:material:replacement]",
          index: 1,
          queueLength: 2,
        },
        runtime: { changedBasis: { queueRevision: 11 } },
      },
    },
  });
  correctedThenFailedRecorder.observeToolResult({
    toolName: "playback.queue.remove",
    result: {
      ok: false,
      error: {
        code: "queue_item_not_editable",
        message: "That queue item cannot be edited by this actor.",
        area: "music_experience",
        retryable: false,
      },
    },
  });
  assert.deepEqual(correctedThenFailedRecorder.result({
    runId: "radio-result-corrected-then-failed-test",
    payload: payloadWithRevisions({ refillGeneration: 18, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-corrected-then-failed-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "queue_corrected",
    appendedCount: 0,
  });

  const staleRecorder = createRadioRunResultRecorder();
  staleRecorder.observeToolResult({
    toolName: "playback.queue.append",
    result: {
      ok: false,
        error: {
          code: "voided_stale",
          message: "Music Experience command basis was stale at commit time.",
          area: "music_experience",
          retryable: true,
        },
    },
  });
  assert.deepEqual(staleRecorder.result({
    runId: "radio-result-stale-test",
    payload: payloadWithRevisions({ refillGeneration: 13, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-stale-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "voided_stale",
    appendedCount: 0,
  });

  const appendedThenStaleRecorder = createRadioRunResultRecorder();
  appendedThenStaleRecorder.observeToolResult({
    toolName: "playback.queue.append",
    result: {
      ok: true,
      value: {
        toolName: "playback.queue.append",
        result: {
          items: [
            { item: "[material:material:one]", index: 0 },
          ],
          queueLength: 1,
        },
      },
    },
  });
  appendedThenStaleRecorder.observeToolResult({
    toolName: "playback.queue.append",
    result: {
      ok: false,
      error: {
        code: "voided_stale",
        message: "Music Experience command basis was stale at commit time.",
        area: "music_experience",
        retryable: true,
      },
    },
  });
  assert.deepEqual(appendedThenStaleRecorder.result({
    runId: "radio-result-appended-then-stale-test",
    payload: payloadWithRevisions({ refillGeneration: 15, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-appended-then-stale-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "appended",
    appendedCount: 1,
  });

  const appendedThenAbortRecorder = createRadioRunResultRecorder();
  appendedThenAbortRecorder.observeToolResult({
    toolName: "playback.queue.append",
    result: {
      ok: true,
      value: {
        toolName: "playback.queue.append",
        result: {
          items: [
            { item: "[material:material:one]", index: 0 },
          ],
          queueLength: 1,
        },
      },
    },
  });
  appendedThenAbortRecorder.observeToolResult({
    toolName: "playback.queue.append",
    result: {
      ok: false,
      error: {
        code: "operation_aborted",
        message: "Radio run was aborted.",
        area: "music_experience",
        retryable: true,
      },
    },
  });
  assert.deepEqual(appendedThenAbortRecorder.result({
    runId: "radio-result-appended-then-abort-test",
    payload: payloadWithRevisions({ refillGeneration: 16, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-appended-then-abort-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "appended",
    appendedCount: 1,
  });

  const idleRecorder = createRadioRunResultRecorder();
  assert.deepEqual(idleRecorder.result({
    runId: "radio-result-idle-test",
    payload: payloadWithRevisions({ refillGeneration: 14, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-idle-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "no_action",
    appendedCount: 0,
  });
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const actorSession = createTestActorRuntimeSession("error", {
    streamFn() {
      return fakeAssistantMessageEventStream({
        type: "error",
        reason: "error",
        error: assistantErrorMessage("error", "provider exploded"),
      });
    },
  });
  const runPort = createAgentRuntimeBackgroundRefillPort({
    ...key,
    session: actorSession,
    transcriptStore,
    ...radioRunDefaults(),
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
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
  const transcriptStore: AgentRuntimeTranscriptStore = {
    async load() {
      return [];
    },
    async save() {
      throw new Error("transcript save failed");
    },
  };
  const saveFailedSession = createTestActorRuntimeSession("save-failed", {
    transcriptStore,
  });
  const runPort = createAgentRuntimeBackgroundRefillPort({
    ...key,
    session: saveFailedSession,
    transcriptStore,
    ...radioRunDefaults(),
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
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
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const controller = new AbortController();
  const actorSession = createTestActorRuntimeSession("abort", {
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
  const originalAbort = actorSession.agent.abort.bind(actorSession.agent);
  let abortCalls = 0;
  actorSession.agent.abort = () => {
    abortCalls += 1;
    originalAbort();
  };
  const runPort = createAgentRuntimeBackgroundRefillPort({
    ...key,
    session: actorSession,
    transcriptStore,
    ...radioRunDefaults(),
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
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
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const controller = new AbortController();
  controller.abort();
  const runPort = createAgentRuntimeBackgroundRefillPort({
    ...key,
    session: createTestActorRuntimeSession("pre-abort"),
    transcriptStore,
    ...radioRunDefaults(),
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
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
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  let resolveRead: ((value: WorkspaceContextAssembly | Promise<WorkspaceContextAssembly>) => void) | undefined;
  const actorSession = createTestActorRuntimeSession("concurrent", {
    transcriptStore,
    workspaceContext: {
      assemble() {
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      },
    },
  });
  const runPort = createAgentRuntimeBackgroundRefillPort({
    ...key,
    session: actorSession,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
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
    /cannot start .* while 'radio-job-concurrent-1' is active/,
  );
  assert.ok(resolveRead !== undefined);
  resolveRead(createWorkspaceContextAssembler({
    musicExperience: {
      async readWorkspaceProjection() {
        return workspaceProjectionFixture();
      },
    },
  }).assemble({
    actor: {
      name: "radio",
      identity: {
        role: "Radio test.",
        job: "Run radio tests.",
        persona: "Precise.",
      },
      instruction: {
        responsibilities: "Run.",
        operatingRules: "Use `playback_queue_append`.",
        prohibitions: "None.",
      },
      declaredWorkspaceSections: ["listening", "radio"],
      toolPack: { stageToolNames: ["playback.queue.append"] },
    },
    ownerScope: key.ownerScope,
  }));
  await firstRun;
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const actorSession = createTestActorRuntimeSession("async-result");
  let releaseResult: (() => void) | undefined;
  const resultWait = new Promise<void>((resolve) => {
    releaseResult = resolve;
  });
  const runPort = createAgentRuntimeBackgroundRefillPort({
    ...key,
    session: actorSession,
    transcriptStore,
    ...radioRunDefaults(),
    clock: () => "2026-06-28T00:00:00.000Z",
    async resultFromRun(input) {
      await resultWait;
      return defaultRadioResult(input);
    },
  });
  const firstRun = runPort.runRadioRefill({
    runId: "radio-job-result-held-1",
    payload: payload(15),
    signal: new AbortController().signal,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.rejects(
    () => runPort.runRadioRefill({
      runId: "radio-job-result-held-2",
      payload: payload(16),
      signal: new AbortController().signal,
    }),
    /cannot start .* while 'radio-job-result-held-1' is active/,
  );

  assert.ok(releaseResult !== undefined);
  releaseResult();
  await firstRun;
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const runPort = createAgentRuntimeBackgroundRefillPort({
    ...key,
    session: createTestActorRuntimeSession("missing-result-extractor"),
    transcriptStore,
    ...radioRunDefaults(),
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
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  await transcriptStore.save({
    ...key,
    messages: [{ role: "assistant" } as never],
    now: "2026-06-28T00:00:00.000Z",
  });

  const corruptSession = createTestActorRuntimeSession("corrupt", {
    transcriptStore,
  });
  await assert.rejects(
    () => corruptSession.restoreTranscript(),
    /Stored Agent Runtime transcript message at index 0 is invalid/,
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

function createTestActorRuntimeSession(label: string, input: {
  streamFn?: StreamFn;
  transcriptStore?: AgentRuntimeTranscriptStore;
  workspaceContext?: ReturnType<typeof emptyWorkspaceContext>;
  tools?: readonly ToolDeclaration[];
  dispatch?: StageToolDispatchPort;
  clock?: () => string;
} = {}): ActorRuntimeSession {
  let streamCallCount = 0;
  return createActorRuntimeSession({
    ownerScope: key.ownerScope,
    workspaceId: key.workspaceId,
    actor: {
      name: "radio",
      identity: {
        role: `Radio test ${label}.`,
        job: "Run background refill trigger tests.",
        persona: "Precise.",
      },
      instruction: {
        responsibilities: "Run.",
        operatingRules: "Use tools when the test asks.",
        prohibitions: "None.",
      },
      declaredWorkspaceSections: ["listening", "radio"],
      toolPack: { stageToolNames: (input.tools ?? []).map((tool) => tool.name) },
    },
    workspaceContext: input.workspaceContext ?? emptyWorkspaceContext(),
    tools: input.tools ?? [],
    dispatch: input.dispatch ?? {
      async dispatch() {
        throw new Error("Background refill trigger test has no default tools.");
      },
    },
    contextFactory: {
      createToolContext(input) {
        return createMinimalContext(
          input.sessionId,
          input.requestId,
          input.abortSignal,
          input.preconditionBasis,
          input.actor,
        );
      },
    },
    stageSessionId: `stage-${label}`,
    ...(input.transcriptStore === undefined ? {} : { transcriptStore: input.transcriptStore }),
    clock: input.clock ?? (() => "2026-06-28T00:00:00.000Z"),
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
  preconditionBasis?: ConcernRevisionSet,
  actor?: AgentActorKind,
): StageToolContext {
  return {
    ownerScope: key.ownerScope,
    sessionId,
    requestId,
    clock: () => "2026-06-28T00:00:00.000Z",
    ...(abortSignal === undefined ? {} : { abortSignal }),
    ...(preconditionBasis === undefined ? {} : { preconditionBasis }),
    ...(actor === undefined ? {} : { actor }),
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

function radioRunDefaults(): {
  workspaceContext: ReturnType<typeof emptyWorkspaceContext>;
} {
  return {
    workspaceContext: emptyWorkspaceContext(),
  };
}

function emptyWorkspaceContext() {
  return createWorkspaceContextAssembler({
    musicExperience: {
      async readWorkspaceProjection() {
        return workspaceProjectionFixture();
      },
    },
  });
}

function workspaceProjectionFixture(input: {
  posture?: MusicExperienceWorkspaceProjection["radio"]["posture"];
  concernRevisions?: MusicExperienceWorkspaceProjection["concernRevisions"];
} = {}): MusicExperienceWorkspaceProjection {
  return {
    concernRevisions: input.concernRevisions ?? {
      queueRevision: 11,
      radioDirectionRevision: 7,
      radioSessionRevision: 0,
      playbackRevision: 0,
    },
    revision: 11,
    queue: [{
      position: 0,
      item: "[material:material:already-queued]" as const,
      materialKind: "recording",
      label: "Already Queued",
      provenance: "radio_agent",
    }],
    radio: {
      directionRevision: 7,
      direction: {
        motif: { kind: "text" as const, text: "late night neon" },
        activeVariations: [],
      },
      posture: {
        ...(input.posture ?? {
          lean: [],
          stale: false,
        }),
      },
    },
  };
}
