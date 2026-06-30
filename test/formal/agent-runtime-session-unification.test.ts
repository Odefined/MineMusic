import assert from "node:assert/strict";

import {
  createActorRuntimeSession,
  type ActorDefinition,
  type AgentRuntimeTranscriptStore,
} from "../../src/agent_runtime/index.js";
import { playbackQueueAppendDescriptor } from "../../src/music_experience/stage_adapter/index.js";
import {
  assistantTextMessage,
  fakeAssistantMessageEventStream,
} from "./helpers/pi-agent-message-fixtures.js";

const sharedSessionSurface = [
  "abort",
  "actorKind",
  "readWorkspaceContext",
  "run",
  "waitForIdle",
];

const mainEvidence = await exerciseActor("main");
const radioEvidence = await exerciseActor("radio");

assert.deepEqual(mainEvidence.surface, sharedSessionSurface);
assert.deepEqual(radioEvidence.surface, sharedSessionSurface);
assert.deepEqual(mainEvidence.lifecycle, radioEvidence.lifecycle);
assert.deepEqual(mainEvidence.toolCounts, [1, 1]);
assert.deepEqual(radioEvidence.toolCounts, [1, 1]);
assert.equal(mainEvidence.loadCount, 1);
assert.equal(radioEvidence.loadCount, 1);
assert.equal(mainEvidence.saveCount, 2);
assert.equal(radioEvidence.saveCount, 2);
assert.deepEqual(mainEvidence.savedMessageCounts, [3, 5]);
assert.deepEqual(radioEvidence.savedMessageCounts, [3, 5]);
assert.match(mainEvidence.systemPrompts[0] ?? "", /Main unification test/u);
assert.match(radioEvidence.systemPrompts[0] ?? "", /Radio unification test/u);

async function exerciseActor(name: ActorDefinition["name"]) {
  let loadCount = 0;
  let saveCount = 0;
  const savedMessageCounts: number[] = [];
  const toolCounts: number[] = [];
  const systemPrompts: string[] = [];
  const lifecycle: string[] = [];
  let messages = [assistantTextMessage(`prior ${name}`)];
  const transcriptStore: AgentRuntimeTranscriptStore = {
    async load() {
      loadCount += 1;
      return messages.slice();
    },
    async save(input) {
      saveCount += 1;
      messages = input.messages.slice() as typeof messages;
      savedMessageCounts.push(messages.length);
    },
  };
  const actor: ActorDefinition = {
    name,
    runtimePolicy: {
      actorKind: name === "main" ? "main_agent" : "radio_agent",
      cascadePriority: name === "main" ? 2 : 1,
      additionalToolPreconditionBasis: name === "main"
        ? {}
        : {
            "playback.queue.append": ["radioDirectionRevision", "radioSessionRevision"],
          },
    },
    identity: {
      role: `${titleCase(name)} unification test.`,
      job: "Exercise the shared actor session.",
      persona: "Exact.",
    },
    instruction: {
      responsibilities: "Run through the shared session.",
      operatingRules: "Use the supplied context and tools.",
      prohibitions: "Do not bypass the session.",
    },
    declaredWorkspaceSections: [],
    toolPack: { stageToolNames: [playbackQueueAppendDescriptor.name] },
  };
  const session = await createActorRuntimeSession({
    ownerScope: "actor-unification-owner",
    workspaceId: "actor-unification-workspace",
    actor,
    workspaceContext: {
      async assemble() {
        return { workspaceContext: {}, commandBasis: {} };
      },
    },
    tools: [playbackQueueAppendDescriptor],
    transcriptStore,
    dispatch: {
      async dispatch() {
        throw new Error("The actor unification test does not execute tools.");
      },
    },
    contextFactory: {
      createToolContext() {
        throw new Error("The actor unification test does not create tool contexts.");
      },
    },
    agentOptions: {
      streamFn(_model, context) {
        toolCounts.push(context.tools?.length ?? 0);
        systemPrompts.push(context.systemPrompt ?? "");
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: "stop",
          message: assistantTextMessage(`${name} done`),
        });
      },
    },
  });

  for (const runId of ["first", "second"]) {
    await session.run({
      runId: `${name}-${runId}`,
      prompt: `${runId} prompt`,
      hooks: {
        beforeWorkspaceContextAssemble() {
          lifecycle.push(`${runId}:before`);
        },
        prepareRun() {
          lifecycle.push(`${runId}:prepare`);
        },
        onRunStart() {
          lifecycle.push(`${runId}:start`);
        },
        afterRun() {
          lifecycle.push(`${runId}:after`);
        },
      },
    });
  }

  return {
    surface: Object.keys(session).sort(),
    lifecycle,
    toolCounts,
    systemPrompts,
    loadCount,
    saveCount,
    savedMessageCounts,
  };
}

function titleCase(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
