import assert from "node:assert/strict";
import type { StreamFn } from "@earendil-works/pi-agent-core";

import {
  createAgentRuntimeRadioRefillRunPort as createProductionRadioRefillRunPort,
  createAgentRunCascadeCoordinator,
  createActorRuntimeSession,
  createInMemoryAgentRuntimeTranscriptStore,
  createRadioRunResultRecorder,
  createWorkspaceContextAssembler,
  radioRunFinishDescriptor,
  toPiToolName,
  withRadioRunFinishGuards,
  type ActorRuntimeSession,
  type AgentRuntimeTranscriptStore,
  type RadioRunResultRecorder,
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

const fakeUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const key = {
  ownerScope: "owner_radio_run",
  workspaceId: "default",
  actor: "radio_agent" as const,
};

function observeFinish(
  recorder: RadioRunResultRecorder,
  declaration: {
    judgement: "refill_complete" | "no_action" | "candidate_exhaustion_by_direction";
    summary?: string;
    rationale?: string;
  } = { judgement: "refill_complete" },
): void {
  recorder.observeToolResult({
    toolName: radioRunFinishDescriptor.name,
    result: {
      ok: true,
      value: {
        toolName: radioRunFinishDescriptor.name,
        result: { declaration },
      },
    },
  });
}

function assistantMessageWithToolCalls(
  calls: readonly { id: string; name: string; arguments: Record<string, unknown> }[],
) {
  return {
    role: "assistant" as const,
    content: calls.map((call) => ({
      type: "toolCall" as const,
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    })),
    api: "openai" as const,
    provider: "openai" as const,
    model: "fake",
    usage: fakeUsage,
    stopReason: "toolUse" as const,
    timestamp: 0,
  };
}

function createAgentRuntimeRadioRefillRunPort(input: {
  session: ActorRuntimeSession;
  ownerScope?: string;
  workspaceId?: string;
  actor?: AgentActorKind;
  transcriptStore?: AgentRuntimeTranscriptStore;
  clock?: () => string;
  workspaceContext?: WorkspaceContextAssembler;
  promptForPayload?: Parameters<typeof createProductionRadioRefillRunPort>[0]["promptForPayload"];
  cascade?: Parameters<typeof createProductionRadioRefillRunPort>[0]["cascade"];
  hooks?: Parameters<typeof createProductionRadioRefillRunPort>[0]["hooks"];
  resultFromRun?: ReturnType<
    Parameters<typeof createProductionRadioRefillRunPort>[0]["createResultRecorder"]
  >["result"];
  createResultRecorder?: Parameters<typeof createProductionRadioRefillRunPort>[0]["createResultRecorder"];
}) {
  return createProductionRadioRefillRunPort({
    session: input.session,
    ...(input.cascade === undefined ? {} : { cascade: input.cascade }),
    ...(input.promptForPayload === undefined ? {} : { promptForPayload: input.promptForPayload }),
    ...(input.hooks === undefined ? {} : { hooks: input.hooks }),
    createResultRecorder: input.createResultRecorder ?? (() => ({
      observeToolResult() {},
      result: input.resultFromRun!,
    })),
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
  const firstSession = await createTestActorRuntimeSession("first", {
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
  });
  const runStarts: string[] = [];
  const runPort = createAgentRuntimeRadioRefillRunPort({
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

  assert.equal(transcriptStore.snapshot(key).length, 4);
  assert.deepEqual(runStarts, ["radio-job-1", "radio-job-2"]);

  const restartedSession = await createTestActorRuntimeSession("restart", {
    transcriptStore,
    clock: () => "2026-06-28T00:00:02.000Z",
  });
  const restartedRunPort = createAgentRuntimeRadioRefillRunPort({
    session: restartedSession,
    resultFromRun: defaultRadioResult,
  });
  await restartedRunPort.runRadioRefill({
    runId: "radio-job-3",
    payload: payload(3),
    signal: new AbortController().signal,
  });
  assert.equal(transcriptStore.snapshot(key).length, 6);
}

{
  const transcript = createCountingTranscriptStore();
  const actorSession = await createTestActorRuntimeSession("checkpoint", {
    transcriptStore: transcript.store,
    clock: () => "2026-06-28T00:00:00.000Z",
  });
  const runPort = createAgentRuntimeRadioRefillRunPort({
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
  const actorSession = await createTestActorRuntimeSession("floor", {
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
  const runPort = createAgentRuntimeRadioRefillRunPort({
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
  assert.equal(observedMessagesJson.includes("\\\"runId\\\""), false);
  assert.equal(observedMessagesJson.includes("radio-job-floor"), false);
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
  const actorSession = await createTestActorRuntimeSession("stale-posture", {
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
  const runPort = createAgentRuntimeRadioRefillRunPort({
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
  const actorSession = await createTestActorRuntimeSession("basis-tracker", {
    transcriptStore,
    tools: [playbackQueueAppendDescriptor, playbackQueueMoveDescriptor, radioLeanAddDescriptor, radioRunFinishDescriptor],
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
                queueLength: 0,
              },
              runtime: {
                changedBasis: { queueRevision: 12 },
                queueMutation: { kind: "append", affectedCount: 0 },
                queueItems: [],
              },
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
              runtime: {
                changedBasis: { queueRevision: 13 },
                queueMutation: { kind: "move", affectedCount: 1 },
              },
            },
          };
        }
        if (input.toolName === radioRunFinishDescriptor.name) {
          return {
            ok: true,
            value: {
              toolName: input.toolName,
              result: {
                declaration: {
                  judgement: "refill_complete",
                },
              },
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
      if (streamCallCount === 5) {
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: "toolUse",
          message: assistantMessageWithToolCall(
            "radio-basis-finish",
            toPiToolName(radioRunFinishDescriptor.name),
            { judgement: "refill_complete" },
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
  const runPort = createAgentRuntimeRadioRefillRunPort({
    ...key,
    session: actorSession,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    createResultRecorder: createRadioRunResultRecorder,
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

  const basisRunResult = await runPort.runRadioRefill({
    runId: "radio-job-basis",
    payload: payloadWithRevisions({ refillGeneration: 18, radioSessionRevision: 3, radioDirectionRevision: 7 }),
    signal: new AbortController().signal,
  });

  assert.equal(basisRunResult.outcome, "queue_corrected");

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
    {
      toolName: "radio.run.finish",
      preconditionBasis: undefined,
      actor: "radio_agent",
    },
  ]);
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  let streamCalled = false;
  const actorSession = await createTestActorRuntimeSession("stale-payload", {
    transcriptStore,
    streamFn() {
      streamCalled = true;
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "stop",
        message: assistantTextMessage("should not run"),
      });
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
  });
  const runPort = createAgentRuntimeRadioRefillRunPort({
    ...key,
    session: actorSession,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
  });

  assert.deepEqual(await runPort.runRadioRefill({
    runId: "radio-job-stale-payload",
    payload: payloadWithRevisions({ refillGeneration: 19, radioSessionRevision: 99, radioDirectionRevision: 99 }),
    signal: new AbortController().signal,
  }), {
    runId: "radio-job-stale-payload",
    radioDirectionRevision: 99,
    radioSessionRevision: 99,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  assert.equal(streamCalled, false);
  assert.equal(transcriptStore.snapshot(key).length, 0);
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const actorSession = await createTestActorRuntimeSession("terminal-candidate-exhaustion", {
    transcriptStore,
    tools: [radioRunFinishDescriptor],
    dispatch: {
      async dispatch(input) {
        assert.equal(input.toolName, radioRunFinishDescriptor.name);
        return {
          ok: true,
          value: {
            toolName: input.toolName,
            result: {
              declaration: input.payload,
            },
          },
        };
      },
    },
    streamFn() {
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "toolUse",
        message: assistantMessageWithToolCall(
          "radio-finish-candidate-exhaustion",
          toPiToolName(radioRunFinishDescriptor.name),
          {
            judgement: "candidate_exhaustion_by_direction",
            summary: "Found candidates, but none fit the current motif and variations.",
          },
        ),
      });
    },
  });
  const runPort = createAgentRuntimeRadioRefillRunPort({
    ...key,
    session: actorSession,
    transcriptStore,
    createResultRecorder: createRadioRunResultRecorder,
  });

  assert.deepEqual(await runPort.runRadioRefill({
    runId: "radio-job-terminal-candidate-exhaustion",
    payload: payloadWithRevisions({ refillGeneration: 20, radioSessionRevision: 0, radioDirectionRevision: 7 }),
    signal: new AbortController().signal,
  }), {
    runId: "radio-job-terminal-candidate-exhaustion",
    radioDirectionRevision: 7,
    radioSessionRevision: 0,
    outcome: "no_action",
    appendedCount: 0,
    declaration: {
      judgement: "candidate_exhaustion_by_direction",
      summary: "Found candidates, but none fit the current motif and variations.",
    },
    notify: {
      speechLevel: "Notify",
      severity: "low",
      eventKind: "candidate_exhaustion_by_direction",
      runId: "radio-job-terminal-candidate-exhaustion",
      radioDirectionRevision: 7,
      summary: "Found candidates, but none fit the current motif and variations.",
    },
  });
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  let appendDispatchCount = 0;
  let finishDispatchCount = 0;
  let streamCallCount = 0;
  const actorSession = await createTestActorRuntimeSession("terminal-sole-call", {
    transcriptStore,
    tools: [playbackQueueAppendDescriptor, radioRunFinishDescriptor],
    dispatch: {
      async dispatch(input) {
        if (input.toolName === playbackQueueAppendDescriptor.name) {
          appendDispatchCount += 1;
          return {
            ok: true,
            value: {
              toolName: input.toolName,
              result: {
                queueLength: 1,
              },
              runtime: {
                queueItems: [{ item: "[material:material:blocked]", index: 0, provenance: "radio_agent" }],
              },
            },
          };
        }
        finishDispatchCount += 1;
        return {
          ok: true,
          value: {
            toolName: input.toolName,
            result: {
              declaration: input.payload,
            },
          },
        };
      },
    },
    streamFn() {
      streamCallCount += 1;
      if (streamCallCount === 1) {
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: "toolUse",
          message: assistantMessageWithToolCalls([
            {
              id: "mixed-append",
              name: toPiToolName(playbackQueueAppendDescriptor.name),
              arguments: { items: ["[material:mixed]"] },
            },
            {
              id: "mixed-finish",
              name: toPiToolName(radioRunFinishDescriptor.name),
              arguments: { judgement: "refill_complete" },
            },
          ]),
        });
      }
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "toolUse",
        message: assistantMessageWithToolCall(
          "radio-finish-only",
          toPiToolName(radioRunFinishDescriptor.name),
          { judgement: "no_action", summary: "The mixed finish was retried as a sole call." },
        ),
      });
    },
  });
  const runPort = createAgentRuntimeRadioRefillRunPort({
    ...key,
    session: actorSession,
    transcriptStore,
    createResultRecorder: createRadioRunResultRecorder,
  });

  const result = await runPort.runRadioRefill({
    runId: "radio-job-terminal-sole-call",
    payload: payloadWithRevisions({ refillGeneration: 21, radioSessionRevision: 0, radioDirectionRevision: 7 }),
    signal: new AbortController().signal,
  });

  assert.equal(appendDispatchCount, 0);
  assert.equal(finishDispatchCount, 1);
  assert.equal(result.outcome, "no_action");
  assert.deepEqual(result.declaration, {
    judgement: "no_action",
    summary: "The mixed finish was retried as a sole call.",
  });
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
          queueLength: 2,
        },
        runtime: {
          changedBasis: { queueRevision: 9 },
          queueMutation: { kind: "append", affectedCount: 2 },
          queueItems: [
            { item: "[material:material:one]", index: 0, provenance: "radio_agent" },
            { item: "[material:material:two]", index: 1, provenance: "radio_agent" },
          ],
        },
      },
    },
  });
  observeFinish(appendedRecorder);
  assert.deepEqual(appendedRecorder.result({
    runId: "radio-result-test",
    payload: payloadWithRevisions({ refillGeneration: 11, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "appended",
    appendedCount: 2,
    declaration: { judgement: "refill_complete" },
  });

  const missingDeclarationRecorder = createRadioRunResultRecorder();
  assert.throws(() => missingDeclarationRecorder.result({
    runId: "radio-result-missing-declaration-test",
    payload: payloadWithRevisions({ refillGeneration: 22, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), /produced no terminal declaration/);

  const invalidFinishRecorder = createRadioRunResultRecorder();
  assert.throws(() => invalidFinishRecorder.observeToolResult({
    toolName: radioRunFinishDescriptor.name,
    result: {
      ok: true,
      value: {
        toolName: radioRunFinishDescriptor.name,
        result: {
          declaration: {
            judgement: "candidate_exhaustion_by_direction",
            summary: 123,
          },
        },
      },
    },
  }), /invalid shape/);

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
          queueLength: 2,
        },
        runtime: {
          changedBasis: { queueRevision: 10 },
          queueMutation: { kind: "replace", affectedCount: 1 },
          queueItems: [{ item: "[material:material:replacement]", index: 1, provenance: "radio_agent" }],
        },
      },
    },
  });
  observeFinish(correctedRecorder);
  assert.deepEqual(correctedRecorder.result({
    runId: "radio-result-corrected-test",
    payload: payloadWithRevisions({ refillGeneration: 17, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-corrected-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "queue_corrected",
    appendedCount: 0,
    declaration: { judgement: "refill_complete" },
  });

  const appendedContradictionRecorder = createRadioRunResultRecorder();
  appendedContradictionRecorder.observeToolResult({
    toolName: "playback.queue.append",
    result: {
      ok: true,
      value: {
        toolName: "playback.queue.append",
        result: {
          queueLength: 1,
        },
        runtime: {
          queueItems: [{ item: "[material:material:one]", index: 0, provenance: "radio_agent" }],
        },
      },
    },
  });
  observeFinish(appendedContradictionRecorder, {
    judgement: "candidate_exhaustion_by_direction",
    summary: "Contradicts append facts.",
  });
  assert.throws(() => appendedContradictionRecorder.result({
    runId: "radio-result-appended-contradiction-test",
    payload: payloadWithRevisions({ refillGeneration: 23, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), /declared candidate exhaustion after appending queue items/);

  const correctedContradictionRecorder = createRadioRunResultRecorder();
  correctedContradictionRecorder.observeToolResult({
    toolName: "playback.queue.move",
    result: {
      ok: true,
      value: {
        toolName: "playback.queue.move",
        result: {
          from: 2,
          to: 1,
          queueLength: 3,
        },
        runtime: {
          changedBasis: { queueRevision: 12 },
          queueMutation: { kind: "move", affectedCount: 1 },
        },
      },
    },
  });
  observeFinish(correctedContradictionRecorder, {
    judgement: "candidate_exhaustion_by_direction",
    summary: "Contradicts correction facts.",
  });
  assert.throws(() => correctedContradictionRecorder.result({
    runId: "radio-result-corrected-contradiction-test",
    payload: payloadWithRevisions({ refillGeneration: 24, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), /declared candidate exhaustion after correcting the queue/);

  const changedBasisOnlyRecorder = createRadioRunResultRecorder();
  changedBasisOnlyRecorder.observeToolResult({
    toolName: "playback.queue.move",
    result: {
      ok: true,
      value: {
        toolName: "playback.queue.move",
        result: {
          queueLength: 3,
        },
        runtime: { changedBasis: { queueRevision: 12 } },
      },
    },
  });
  observeFinish(changedBasisOnlyRecorder);
  assert.throws(() => changedBasisOnlyRecorder.result({
    runId: "radio-result-changed-basis-only-test",
    payload: payloadWithRevisions({ refillGeneration: 25, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), /refill complete without appending or correcting the queue/);

  const nonQueueMutationRecorder = createRadioRunResultRecorder();
  nonQueueMutationRecorder.observeToolResult({
    toolName: "radio.lean.add",
    result: {
      ok: true,
      value: {
        toolName: "radio.lean.add",
        result: {
          posture: { lean: [], stale: false },
        },
        runtime: {
          changedBasis: { radioDirectionRevision: 12 },
          queueMutation: { kind: "move", affectedCount: 1 },
        },
      },
    },
  });
  observeFinish(nonQueueMutationRecorder);
  assert.throws(() => nonQueueMutationRecorder.result({
    runId: "radio-result-non-queue-mutation-test",
    payload: payloadWithRevisions({ refillGeneration: 26, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), /refill complete without appending or correcting the queue/);

  const correctedThenFailedRecorder = createRadioRunResultRecorder();
  correctedThenFailedRecorder.observeToolResult({
    toolName: "playback.queue.replace",
    result: {
      ok: true,
      value: {
        toolName: "playback.queue.replace",
        result: {
          queueLength: 2,
        },
        runtime: {
          changedBasis: { queueRevision: 11 },
          queueMutation: { kind: "replace", affectedCount: 1 },
          queueItems: [{ item: "[material:material:replacement]", index: 1, provenance: "radio_agent" }],
        },
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
  observeFinish(correctedThenFailedRecorder);
  assert.deepEqual(correctedThenFailedRecorder.result({
    runId: "radio-result-corrected-then-failed-test",
    payload: payloadWithRevisions({ refillGeneration: 18, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-corrected-then-failed-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "queue_corrected",
    appendedCount: 0,
    declaration: { judgement: "refill_complete" },
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
          queueLength: 1,
        },
        runtime: {
          queueItems: [{ item: "[material:material:one]", index: 0, provenance: "radio_agent" }],
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
  observeFinish(appendedThenStaleRecorder);
  assert.deepEqual(appendedThenStaleRecorder.result({
    runId: "radio-result-appended-then-stale-test",
    payload: payloadWithRevisions({ refillGeneration: 15, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-appended-then-stale-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "appended",
    appendedCount: 1,
    declaration: { judgement: "refill_complete" },
  });

  const appendedThenAbortRecorder = createRadioRunResultRecorder();
  appendedThenAbortRecorder.observeToolResult({
    toolName: "playback.queue.append",
    result: {
      ok: true,
      value: {
        toolName: "playback.queue.append",
        result: {
          queueLength: 1,
        },
        runtime: {
          queueItems: [{ item: "[material:material:one]", index: 0, provenance: "radio_agent" }],
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
  observeFinish(appendedThenAbortRecorder);
  assert.deepEqual(appendedThenAbortRecorder.result({
    runId: "radio-result-appended-then-abort-test",
    payload: payloadWithRevisions({ refillGeneration: 16, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-appended-then-abort-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "appended",
    appendedCount: 1,
    declaration: { judgement: "refill_complete" },
  });

  const idleRecorder = createRadioRunResultRecorder();
  observeFinish(idleRecorder, { judgement: "no_action", summary: "Queue already fits." });
  assert.deepEqual(idleRecorder.result({
    runId: "radio-result-idle-test",
    payload: payloadWithRevisions({ refillGeneration: 14, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), {
    runId: "radio-result-idle-test",
    radioDirectionRevision: 5,
    radioSessionRevision: 3,
    outcome: "no_action",
    appendedCount: 0,
    declaration: { judgement: "no_action", summary: "Queue already fits." },
  });

  const noProgressCompleteRecorder = createRadioRunResultRecorder();
  observeFinish(noProgressCompleteRecorder, { judgement: "refill_complete" });
  assert.throws(() => noProgressCompleteRecorder.result({
    runId: "radio-result-no-progress-complete-test",
    payload: payloadWithRevisions({ refillGeneration: 25, radioSessionRevision: 3, radioDirectionRevision: 5 }),
  }), /declared refill complete without appending or correcting the queue/);
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const actorSession = await createTestActorRuntimeSession("error", {
    streamFn() {
      return fakeAssistantMessageEventStream({
        type: "error",
        reason: "error",
        error: assistantErrorMessage("error", "provider exploded"),
      });
    },
  });
  const runPort = createAgentRuntimeRadioRefillRunPort({
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
  const saveFailedSession = await createTestActorRuntimeSession("save-failed", {
    transcriptStore,
  });
  const runPort = createAgentRuntimeRadioRefillRunPort({
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
  let agentSignalAborted = false;
  const actorSession = await createTestActorRuntimeSession("abort", {
    async streamFn(_model, _context, options) {
      const message = assistantErrorMessage("aborted", "background job aborted");
      setTimeout(() => controller.abort(), 0);
      if (options?.signal !== undefined && !options.signal.aborted) {
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener("abort", () => {
            agentSignalAborted = true;
            resolve();
          }, { once: true });
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
  const runPort = createAgentRuntimeRadioRefillRunPort({
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
    radioDirectionRevision: 7,
    radioSessionRevision: 0,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  assert.equal(agentSignalAborted, true);
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const controller = new AbortController();
  controller.abort();
  const runPort = createAgentRuntimeRadioRefillRunPort({
    ...key,
    session: await createTestActorRuntimeSession("pre-abort"),
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
    radioDirectionRevision: 7,
    radioSessionRevision: 0,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  assert.equal(transcriptStore.snapshot(key).length, 0);
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const controller = new AbortController();
  let streamCalled = false;
  const runPort = createAgentRuntimeRadioRefillRunPort({
    ...key,
    session: await createTestActorRuntimeSession("prompt-abort", {
      transcriptStore,
      streamFn() {
        streamCalled = true;
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: "stop",
          message: assistantTextMessage("should not stream"),
        });
      },
    }),
    transcriptStore,
    ...radioRunDefaults(),
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
    async promptForPayload() {
      controller.abort();
      return "late prompt";
    },
  });

  assert.deepEqual(await runPort.runRadioRefill({
    runId: "radio-job-prompt-abort",
    payload: payload(20),
    signal: controller.signal,
  }), {
    runId: "radio-job-prompt-abort",
    radioDirectionRevision: 7,
    radioSessionRevision: 0,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  assert.equal(streamCalled, false);
  assert.equal(transcriptStore.snapshot(key).length, 0);
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  const cascade = createAgentRunCascadeCoordinator({ ownerScope: key.ownerScope });
  let resolveRead: ((value: WorkspaceContextAssembly | Promise<WorkspaceContextAssembly>) => void) | undefined;
  let streamCalled = false;
  const actorSession = await createTestActorRuntimeSession("cascade-start-abort", {
    transcriptStore,
    workspaceContext: {
      assemble() {
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      },
    },
    streamFn() {
      streamCalled = true;
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "stop",
        message: assistantTextMessage("should not stream"),
      });
    },
  });
  const runPort = createAgentRuntimeRadioRefillRunPort({
    ...key,
    session: actorSession,
    cascade,
    transcriptStore,
    clock: () => "2026-06-28T00:00:00.000Z",
    resultFromRun: defaultRadioResult,
  });
  const running = runPort.runRadioRefill({
    runId: "radio-job-cascade-start-abort",
    payload: payload(21),
    signal: new AbortController().signal,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(resolveRead !== undefined);
  cascade.observeRevisionChange({
    ownerScope: key.ownerScope,
    concern: "radio-direction",
    newRevision: 8,
    actor: "main_agent",
  });
  resolveRead({
    workspaceContext: {},
    commandBasis: {
      queueRevision: 11,
      radioDirectionRevision: 7,
      radioSessionRevision: 0,
      playbackRevision: 0,
    },
  });

  assert.deepEqual(await running, {
    runId: "radio-job-cascade-start-abort",
    radioDirectionRevision: 7,
    radioSessionRevision: 0,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  assert.equal(streamCalled, false);
  assert.equal(transcriptStore.snapshot(key).length, 0);
}

{
  const transcriptStore = createInMemoryAgentRuntimeTranscriptStore();
  let resolveRead: ((value: WorkspaceContextAssembly | Promise<WorkspaceContextAssembly>) => void) | undefined;
  const actorSession = await createTestActorRuntimeSession("concurrent", {
    transcriptStore,
    workspaceContext: {
      assemble() {
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      },
    },
  });
  const runPort = createAgentRuntimeRadioRefillRunPort({
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
      runtimePolicy: {
        actorKind: "radio_agent",
        cascadePriority: 1,
        additionalToolPreconditionBasis: {
          "playback.queue.append": ["radioDirectionRevision", "radioSessionRevision"],
        },
      },
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
  const actorSession = await createTestActorRuntimeSession("async-result");
  let releaseResult: (() => void) | undefined;
  const resultWait = new Promise<void>((resolve) => {
    releaseResult = resolve;
  });
  const runPort = createAgentRuntimeRadioRefillRunPort({
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
  await transcriptStore.save({
    ...key,
    messages: [{ role: "assistant" } as never],
    now: "2026-06-28T00:00:00.000Z",
  });

  await assert.rejects(
    () => createTestActorRuntimeSession("corrupt", { transcriptStore }),
    /Stored Agent Runtime transcript message at index 0 is invalid/,
  );
}

function payload(refillGeneration: number) {
  return payloadWithRevisions({
    refillGeneration,
    radioSessionRevision: 0,
    radioDirectionRevision: 7,
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
    declaration: { judgement: "no_action" as const },
  };
}

async function createTestActorRuntimeSession(label: string, input: {
  streamFn?: StreamFn;
  transcriptStore?: AgentRuntimeTranscriptStore;
  workspaceContext?: ReturnType<typeof emptyWorkspaceContext>;
  tools?: readonly ToolDeclaration[];
  dispatch?: StageToolDispatchPort;
  clock?: () => string;
} = {}): Promise<ActorRuntimeSession> {
  let streamCallCount = 0;
  const stageToolNames = (input.tools ?? []).map((tool) => tool.name);
  const radioQueueToolNames = new Set([
    "playback.queue.append",
    "playback.queue.remove",
    "playback.queue.replace",
    "playback.queue.move",
    "playback.queue.clear",
  ]);
  const additionalToolPreconditionBasis = Object.fromEntries(
    stageToolNames
      .filter((toolName) => radioQueueToolNames.has(toolName))
      .map((toolName) => [toolName, ["radioDirectionRevision", "radioSessionRevision"]] as const),
  );
  return createActorRuntimeSession({
    ownerScope: key.ownerScope,
    workspaceId: key.workspaceId,
    actor: {
      name: "radio",
      runtimePolicy: {
        actorKind: "radio_agent",
        cascadePriority: 1,
        additionalToolPreconditionBasis,
      },
      identity: {
        role: `Radio test ${label}.`,
        job: "Run radio refill trigger tests.",
        persona: "Precise.",
      },
      instruction: {
        responsibilities: "Run.",
        operatingRules: "Use tools when the test asks.",
        prohibitions: "None.",
      },
      declaredWorkspaceSections: ["listening", "radio"],
      toolPack: { stageToolNames },
    },
    workspaceContext: input.workspaceContext ?? emptyWorkspaceContext(),
    tools: input.tools ?? [],
    dispatch: input.dispatch ?? {
      async dispatch() {
        throw new Error("Radio refill trigger test has no default tools.");
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
    transcriptStore: input.transcriptStore ?? createInMemoryAgentRuntimeTranscriptStore(),
    clock: input.clock ?? (() => "2026-06-28T00:00:00.000Z"),
    agentOptions: withRadioRunFinishGuards({
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
    }),
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
    actorTrustBasis: "user-intent-backed",
    askBeforeSourceOfTruthEdits: false,
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
