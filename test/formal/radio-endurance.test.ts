import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  AgentMessage,
  StreamFn,
} from "@earendil-works/pi-agent-core";

import {
  createActorRuntimeSession,
  encodeWorkspaceContext,
  radioDefinition,
  radioRunFinishDescriptor,
  toPiToolName,
  withRadioRunFinishGuards,
  type AgentRuntimeStageToolContextFactoryPort,
  type AgentRuntimeTranscriptKey,
  type AgentRuntimeTranscriptStore,
  type StageToolDispatchPort,
} from "../../src/agent_runtime/index.js";
import type { MusicExperienceWorkspaceProjection } from "../../src/contracts/music_experience.js";
import type {
  StageToolContext,
  ToolDeclaration,
} from "../../src/contracts/stage_interface.js";
import { createMemoryProposalUnitStore } from "../../src/effect_boundary/index.js";
import {
  assistantMessageWithToolCall,
  assistantTextMessage,
  fakeAssistantMessageEventStream,
} from "./helpers/pi-agent-message-fixtures.js";

const ownerScope = "radio-endurance-owner";
const workspaceId = "radio-endurance-workspace";
const transcriptKey: AgentRuntimeTranscriptKey = {
  ownerScope,
  workspaceId,
  actor: "radio_agent",
};

await assertPinnedPiAgentCoreVersion();

{
  const transcriptStore = createMutableTranscriptStore();
  const projection = enduranceProjection();

  const seedSession = await createSharedActorSession({
    projection: () => projection,
    transcriptStore,
    streamFn() {
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "stop",
        message: assistantTextMessage(
          "fragile transcript-only memory: use the hidden blue path, not the durable floor",
        ),
      });
    },
  });

  await seedSession.run({
    runId: "radio-endurance-seed",
    prompt: "seed the ordinary long-lived actor transcript",
  });
  assert.match(
    JSON.stringify(transcriptStore.snapshot(transcriptKey)),
    /fragile transcript-only memory/u,
    "seed run must prove there was transcript content to erode",
  );

  await erodePersistedTranscript(transcriptStore);
  assert.equal(
    JSON.stringify(transcriptStore.snapshot(transcriptKey)).includes("fragile transcript-only memory"),
    false,
    "the acceptance must mutate persisted transcript state, not only a provider view",
  );

  const observed = {
    systemPrompt: "",
    messagesJson: "",
    toolNames: [] as string[],
  };
  let finishDispatchCount = 0;
  const restartedSession = await createSharedActorSession({
    projection: () => projection,
    transcriptStore,
    dispatch: finishDispatch(() => {
      finishDispatchCount += 1;
    }),
    streamFn(_model, context) {
      observed.systemPrompt = context.systemPrompt ?? "";
      observed.messagesJson = JSON.stringify(context.messages);
      observed.toolNames = (context.tools ?? []).map((tool) => (tool as { name?: string }).name ?? "");
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "toolUse",
        message: assistantMessageWithToolCall(
          "radio-endurance-finish",
          toPiToolName(radioRunFinishDescriptor.name),
          {
            judgement: "no_action",
            summary: "Restart floor rebuilt from durable context.",
          },
        ),
      });
    },
  });

  const restartedRun = await restartedSession.run({
    runId: "radio-endurance-restart",
    prompt: "resume after process restart",
  });

  assert.equal(restartedRun.outcome, "completed");
  assert.equal(finishDispatchCount, 1, "terminal declaration must remain a real callable tool after restart");
  assert.equal(transcriptStore.loadCount(), 2, "reconstruction must load once per actor session, not per run");
  assert.equal(transcriptStore.saveCount(), 3, "seed, persisted erosion, and restarted run must all checkpoint");
  assertPromptRebuiltFromFloor(observed.systemPrompt);
  assert.equal(observed.messagesJson.includes("fragile transcript-only memory"), false);
  assert.equal(observed.systemPrompt.includes("radioDirectionRevision"), false);
  assert.equal(observed.systemPrompt.includes("radioSessionRevision"), false);
  assert.equal(observed.systemPrompt.includes("commandedRevisionStamp"), false);
  assert.ok(observed.toolNames.includes("radio_run_finish"));
  assert.ok(observed.toolNames.includes("playback_queue_remove"));
  assert.ok(observed.toolNames.includes("playback_queue_replace"));
  assert.ok(observed.toolNames.includes("playback_queue_move"));
  assert.ok(observed.toolNames.includes("playback_queue_clear"));
}

{
  const transcriptStore = createMutableTranscriptStore();
  await erodePersistedTranscript(transcriptStore);
  let projection = enduranceProjection({
    posture: {
      lean: [{ kind: "text", text: "old stale lean" }],
      commandedRevisionStamp: 8,
      stale: true,
    },
  });
  let clearStalePostureCalls = 0;
  let observedSystemPrompt = "";

  const restartedSession = await createSharedActorSession({
    projection: () => projection,
    transcriptStore,
    dispatch: finishDispatch(),
    streamFn(_model, context) {
      observedSystemPrompt = context.systemPrompt ?? "";
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "toolUse",
        message: assistantMessageWithToolCall(
          "radio-endurance-stale-posture-finish",
          toPiToolName(radioRunFinishDescriptor.name),
          { judgement: "no_action", summary: "Stale posture cleared before context assembly." },
        ),
      });
    },
  });

  await restartedSession.run({
    runId: "radio-endurance-stale-posture",
    prompt: "resume after restart with stale posture",
    hooks: {
      beforeWorkspaceContextAssemble() {
        if (!projection.radio.posture.stale) {
          return;
        }
        clearStalePostureCalls += 1;
        projection = enduranceProjection({
          posture: {
            lean: [],
            commandedRevisionStamp: projection.radio.directionRevision,
            stale: false,
          },
        });
      },
    },
  });

  assert.equal(clearStalePostureCalls, 1);
  assert.equal(observedSystemPrompt.includes("old stale lean"), false);
  assert.match(observedSystemPrompt, /posture:\nlean:\nempty\nstale: false/u);
}

async function assertPinnedPiAgentCoreVersion(): Promise<void> {
  const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const installedPiPackageJson = JSON.parse(
    await readFile(join(process.cwd(), "node_modules/@earendil-works/pi-agent-core/package.json"), "utf8"),
  ) as { version?: string };
  assert.equal(
    packageJson.dependencies?.["@earendil-works/pi-agent-core"],
    "0.80.2",
    "PR7 endurance is audited against pi-agent-core 0.80.2; re-audit transcript reconstruction before bumping.",
  );
  assert.equal(
    installedPiPackageJson.version,
    "0.80.2",
    "Installed pi-agent-core must match the PR7 endurance audit version.",
  );
}

async function erodePersistedTranscript(store: MutableTranscriptStore): Promise<void> {
  await store.save({
    ...transcriptKey,
    messages: [assistantTextMessage("eroded summary: durable floor remains the source of direction")],
    now: "2026-06-30T00:00:01.000Z",
  });
}

async function createSharedActorSession(input: {
  projection: () => MusicExperienceWorkspaceProjection;
  transcriptStore: AgentRuntimeTranscriptStore;
  streamFn: StreamFn;
  dispatch?: StageToolDispatchPort;
}) {
  return await createActorRuntimeSession({
    ownerScope,
    workspaceId,
    actor: radioDefinition,
    workspaceContext: {
      async assemble() {
        const projection = input.projection();
        return {
          workspaceContext: encodeWorkspaceContext({
            sections: radioDefinition.declaredWorkspaceSections,
            musicExperience: projection,
          }),
          commandBasis: {
            ...projection.concernRevisions,
          },
        };
      },
    },
    tools: radioToolDeclarations(),
    transcriptStore: input.transcriptStore,
    dispatch: input.dispatch ?? finishDispatch(),
    contextFactory: {
      createToolContext(perCall) {
        return createMinimalContext(perCall);
      },
    },
    clock: () => "2026-06-30T00:00:00.000Z",
    agentOptions: withRadioRunFinishGuards({
      streamFn: input.streamFn,
    }),
  });
}

function assertPromptRebuiltFromFloor(systemPrompt: string): void {
  assert.match(systemPrompt, /MineMusic Agent Context/u);
  assert.match(systemPrompt, /radio:\ndirection:\nmotif: "late night neon"/u);
  assert.match(systemPrompt, /activeVariations:\n0\. "rain on glass"/u);
  assert.match(systemPrompt, /posture:\nlean:\n0\. "soft-focus synth lift"\nstale: false/u);
  assert.match(
    systemPrompt,
    /0\. recording "Already Queued" - "Fixture Artist" \[material:radio_queue_1\] added by radio/u,
  );
}

function enduranceProjection(input: {
  posture?: MusicExperienceWorkspaceProjection["radio"]["posture"];
} = {}): MusicExperienceWorkspaceProjection {
  return {
    concernRevisions: {
      queueRevision: 12,
      radioDirectionRevision: 9,
      radioSessionRevision: 4,
      playbackRevision: 2,
    },
    revision: 12,
    nowPlaying: {
      item: "[material:now_playing]" as const,
      materialKind: "recording",
      label: "Now Playing",
      artistsText: "Fixture Artist",
    },
    queue: [
      {
        position: 0,
        item: "[material:radio_queue_1]" as const,
        materialKind: "recording",
        label: "Already Queued",
        artistsText: "Fixture Artist",
        provenance: "radio_agent",
      },
    ],
    radio: {
      directionRevision: 9,
      direction: {
        motif: { kind: "text", text: "late night neon" },
        activeVariations: [{ kind: "text", text: "rain on glass" }],
      },
      posture: input.posture ?? {
        lean: [{ kind: "text", text: "soft-focus synth lift" }],
        commandedRevisionStamp: 9,
        stale: false,
      },
    },
  };
}

type MutableTranscriptStore = AgentRuntimeTranscriptStore & {
  snapshot(input: AgentRuntimeTranscriptKey): readonly AgentMessage[];
  loadCount(): number;
  saveCount(): number;
};

function createMutableTranscriptStore(): MutableTranscriptStore {
  const messagesByKey = new Map<string, readonly AgentMessage[]>();
  let loads = 0;
  let saves = 0;
  return {
    async load(input) {
      loads += 1;
      return messagesByKey.get(transcriptStoreKey(input))?.slice() ?? [];
    },
    async save(input) {
      saves += 1;
      messagesByKey.set(transcriptStoreKey(input), input.messages.slice());
    },
    snapshot(input) {
      return messagesByKey.get(transcriptStoreKey(input)) ?? [];
    },
    loadCount() {
      return loads;
    },
    saveCount() {
      return saves;
    },
  };
}

function transcriptStoreKey(input: AgentRuntimeTranscriptKey): string {
  return `${input.ownerScope}\0${input.workspaceId}\0${input.actor}`;
}

function radioToolDeclarations(): readonly ToolDeclaration[] {
  return radioDefinition.toolPack.stageToolNames.map((name) =>
    name === radioRunFinishDescriptor.name ? radioRunFinishDescriptor : stubToolDeclaration(name)
  );
}

function stubToolDeclaration(name: string): ToolDeclaration {
  return {
    name,
    instrumentId: "test.radio.endurance",
    label: name,
    ownerArea: "agent_runtime",
    description: `Endurance fixture declaration for ${name}.`,
    usage: {
      useWhen: "Used by the Radio actor definition during endurance acceptance.",
      doNotUseWhen: "Do not execute this stub in the endurance test.",
      outputSemantics: "No public output; the tool must not be called in this test.",
    },
    examples: [
      { prompt: `call ${name}`, expects: "call" },
      { prompt: `avoid ${name}`, expects: "avoid" },
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
    inputSchema: {
      type: "object",
      additionalProperties: true,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
    },
    errors: [],
    resultSummary() {
      return `${name} endurance stub`;
    },
  };
}

function finishDispatch(onFinish?: () => void): StageToolDispatchPort {
  return {
    async dispatch(input) {
      assert.equal(input.toolName, radioRunFinishDescriptor.name);
      onFinish?.();
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
  };
}

function createMinimalContext(input: Parameters<AgentRuntimeStageToolContextFactoryPort["createToolContext"]>[0]): StageToolContext {
  return {
    ownerScope,
    sessionId: input.sessionId,
    requestId: input.requestId,
    actorTrustBasis: "user-intent-backed",
    askBeforeSourceOfTruthEdits: false,
    clock: () => "2026-06-30T00:00:00.000Z",
    ...(input.actor === undefined ? {} : { actor: input.actor }),
    ...(input.preconditionBasis === undefined ? {} : { preconditionBasis: input.preconditionBasis }),
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
    handleMinting: {
      async mint() {
        throw new Error("Handle minting is unavailable in radio endurance acceptance.");
      },
      async resolve() {
        throw new Error("Handle resolution is unavailable in radio endurance acceptance.");
      },
    },
    lookupCursors: {
      async register() {
        throw new Error("Lookup cursor registration is unavailable in radio endurance acceptance.");
      },
      async resolve() {
        return {
          ok: false,
          error: {
            code: "agent_runtime.lookup_cursor_unavailable",
            message: "Lookup cursor resolution is unavailable in radio endurance acceptance.",
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
    proposalUnits: createMemoryProposalUnitStore({
      clock: () => "2026-06-30T00:00:00.000Z",
    }),
    executionGate: {
      async preflight() {
        return { decision: "allow", auditLevel: "none" };
      },
    },
  };
}
