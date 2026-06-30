import type {
  Agent,
  AgentMessage,
} from "@earendil-works/pi-agent-core";

import type {
  AgentActorKind,
  ConcernRevisionSet,
} from "../contracts/kernel.js";
import type { ToolDeclaration } from "../contracts/stage_interface.js";
import {
  createMineMusicAgentHarness,
  type MineMusicAgentHarnessPromptInput,
  type MineMusicAgentHarnessRunResult,
  type MineMusicAgentHarnessTurnState,
} from "./agent_harness.js";
import {
  actorKindForDefinition,
  selectActorStageToolDeclarations,
  type ActorDefinition,
  validateActorDefinition,
} from "./actor_definition.js";
import {
  createMineMusicPiAgentAdapter,
  type CreateMineMusicPiAgentAdapterInput,
} from "./pi_engine.js";
import type {
  AgentRuntimeStageToolContextFactoryPort,
  StageToolDispatchPort,
  StageToolResultObserver,
} from "./stage_tool_bridge.js";
import {
  cappedAgentTranscript,
  type AgentRuntimeTranscriptStore,
} from "./agent_transcript_store.js";
import type { AgentRunCascadeCoordinator } from "./agent_run_cascade.js";
import type { EncodedWorkspaceContext } from "./workspace_context_encoder.js";
import type { WorkspaceContextAssembler } from "./workspace_context_assembler.js";

export type ActorRuntimeSessionRunResult = MineMusicAgentHarnessRunResult & {
  workspaceContext: EncodedWorkspaceContext;
};

export type ActorRuntimeSessionRunHooks = {
  beforeWorkspaceContextAssemble?: (input: {
    runId: string;
    signal: AbortSignal;
  }) => Promise<void> | void;
  prepareRun?: (input: {
    runId: string;
    workspaceContext: EncodedWorkspaceContext;
    signal: AbortSignal;
  }) => Promise<void> | void;
  onRunStart?: (input: {
    runId: string;
    workspaceContext: EncodedWorkspaceContext;
    signal: AbortSignal;
  }) => Promise<void> | void;
  onToolResult?: (input: {
    runId: string;
    toolName: string;
    result: Parameters<StageToolResultObserver>[0]["result"];
  }) => Promise<void> | void;
  afterRun?: (input: {
    runId: string;
    workspaceContext: EncodedWorkspaceContext;
    signal: AbortSignal;
    newMessages: readonly AgentMessage[];
  }) => Promise<void> | void;
};

export type ActorRuntimeSession = {
  actorKind: AgentActorKind;
  readWorkspaceContext(): Promise<EncodedWorkspaceContext>;
  run(input: {
    runId: string;
    prompt: MineMusicAgentHarnessPromptInput | ((input: {
      workspaceContext: EncodedWorkspaceContext;
    }) => MineMusicAgentHarnessPromptInput | Promise<MineMusicAgentHarnessPromptInput>);
    basis?: ConcernRevisionSet;
    abortSignal?: AbortSignal;
    cascade?: AgentRunCascadeCoordinator;
    hooks?: ActorRuntimeSessionRunHooks;
  }): Promise<ActorRuntimeSessionRunResult>;
  abort(): void;
  waitForIdle(): Promise<void>;
};

export type CreateActorRuntimeSessionInput = Omit<
  CreateMineMusicPiAgentAdapterInput,
  "systemPrompt" | "tools" | "stageSessionId" | "initialMessages"
> & {
  ownerScope: string;
  workspaceId: string;
  actor: ActorDefinition;
  workspaceContext: WorkspaceContextAssembler;
  tools: readonly ToolDeclaration[];
  transcriptStore: AgentRuntimeTranscriptStore;
  clock?: () => string;
  maxTranscriptMessages?: number;
};

type ActiveRun = {
  runId: string;
  hooks?: ActorRuntimeSessionRunHooks;
};

export async function createActorRuntimeSession(
  input: CreateActorRuntimeSessionInput,
): Promise<ActorRuntimeSession> {
  validateActorDefinition(input.actor);
  const actorKind = actorKindForDefinition(input.actor);
  const maxTranscriptMessages = input.maxTranscriptMessages ?? 200;
  cappedAgentTranscript([], maxTranscriptMessages);
  let activeRun: ActiveRun | undefined;
  let agent: Agent;

  if (input.agentOptions.prepareNextTurn !== undefined) {
    throw new Error(`MineMusic Agent Runtime session for actor '${input.actor.name}' owns pi prepareNextTurn.`);
  }

  const harness = createMineMusicAgentHarness({
    agent: () => agent,
    actor: input.actor,
    ownerScope: input.ownerScope,
    workspaceContext: input.workspaceContext,
    async observeToolResult(result) {
      if (activeRun === undefined) {
        throw new Error(`MineMusic Agent Runtime observed a tool result outside an active actor run.`);
      }
      await activeRun.hooks?.onToolResult?.({
        runId: activeRun.runId,
        ...result,
      });
    },
  });

  agent = createMineMusicPiAgentAdapter({
    dispatch: harness.wrapDispatch(input.dispatch),
    contextFactory: harness.createToolContextFactory(input.contextFactory),
    tools: selectActorStageToolDeclarations({
      actor: input.actor,
      tools: input.tools,
    }),
    systemPrompt: "",
    stageSessionId: `${input.workspaceId}:${input.actor.name}`,
    ...(input.llmProviderSessionId === undefined
      ? {}
      : { llmProviderSessionId: input.llmProviderSessionId }),
    agentOptions: input.agentOptions,
  });

  agent.subscribe(async (event, signal) => {
    if (event.type === "agent_end") {
      await input.transcriptStore.save({
        ownerScope: input.ownerScope,
        workspaceId: input.workspaceId,
        actor: actorKind,
        messages: cappedAgentTranscript(agent.state.messages, maxTranscriptMessages),
        now: input.clock?.() ?? new Date().toISOString(),
      });
    }
  });

  agent.state.messages = (await input.transcriptStore.load({
    ownerScope: input.ownerScope,
    workspaceId: input.workspaceId,
    actor: actorKind,
  })).slice();

  return {
    actorKind,
    async readWorkspaceContext() {
      return (await harness.createTurnState({
        tools: agent.state.tools,
      })).workspaceContext;
    },
    async run(runInput) {
      if (activeRun !== undefined) {
        throw new Error(
          `MineMusic Agent Runtime session for actor '${input.actor.name}' cannot start '${runInput.runId}' while '${activeRun.runId}' is active.`,
        );
      }
      let cascadeLease = runInput.basis === undefined || runInput.cascade === undefined
        ? undefined
        : runInput.cascade.register({
          runId: runInput.runId,
          priority: input.actor.runtimePolicy.cascadePriority,
          basis: runInput.basis,
        });
      let signal = combinedAbortSignal(runInput.abortSignal, cascadeLease?.abortSignal);
      if (signal.aborted) {
        return abortedBeforeStartResult();
      }

      activeRun = {
        runId: runInput.runId,
        ...(runInput.hooks === undefined ? {} : { hooks: runInput.hooks }),
      };
      try {
        await runInput.hooks?.beforeWorkspaceContextAssemble?.({
          runId: runInput.runId,
          signal,
        });
        if (signal.aborted) {
          return abortedBeforeStartResult();
        }
        const initialTurnState = await harness.createTurnState({
          tools: agent.state.tools,
        });
        await runInput.hooks?.prepareRun?.({
          runId: runInput.runId,
          workspaceContext: initialTurnState.workspaceContext,
          signal,
        });
        if (cascadeLease === undefined && runInput.cascade !== undefined) {
          const basis = Object.keys(initialTurnState.commandBasis).length === 0
            ? undefined
            : initialTurnState.commandBasis;
          if (basis !== undefined) {
            cascadeLease = runInput.cascade.register({
              runId: runInput.runId,
              priority: input.actor.runtimePolicy.cascadePriority,
              basis,
            });
            signal = combinedAbortSignal(runInput.abortSignal, cascadeLease.abortSignal);
          }
        }
        if (signal.aborted) {
          return {
            turnState: initialTurnState,
            workspaceContext: initialTurnState.workspaceContext,
            newMessages: [],
          };
        }
        await runInput.hooks?.onRunStart?.({
          runId: runInput.runId,
          workspaceContext: initialTurnState.workspaceContext,
          signal,
        });
        if (signal.aborted) {
          return {
            turnState: initialTurnState,
            workspaceContext: initialTurnState.workspaceContext,
            newMessages: [],
          };
        }
        const turnState = {
          ...initialTurnState,
          tools: agent.state.tools,
        };
        const prompt = typeof runInput.prompt === "function"
          ? await runInput.prompt({ workspaceContext: initialTurnState.workspaceContext })
          : runInput.prompt;
        const result = await harness.runAgentTurn({
          prompt,
          turnState,
          abortSignal: signal,
        });
        await runInput.hooks?.afterRun?.({
          runId: runInput.runId,
          workspaceContext: result.turnState.workspaceContext,
          signal,
          newMessages: result.newMessages,
        });
        return {
          ...result,
          workspaceContext: result.turnState.workspaceContext,
        };
      } finally {
        cascadeLease?.release();
        activeRun = undefined;
      }
    },
    abort() {
      agent.abort();
    },
    waitForIdle() {
      return agent.waitForIdle();
    },
  };
}

function combinedAbortSignal(
  externalSignal: AbortSignal | undefined,
  cascadeSignal: AbortSignal | undefined,
): AbortSignal {
  if (externalSignal === undefined && cascadeSignal === undefined) {
    return new AbortController().signal;
  }
  if (externalSignal === undefined) {
    return cascadeSignal!;
  }
  if (cascadeSignal === undefined) {
    return externalSignal;
  }
  return AbortSignal.any([externalSignal, cascadeSignal]);
}

async function abortedBeforeStartResult(): Promise<ActorRuntimeSessionRunResult> {
  const turnState: MineMusicAgentHarnessTurnState = {
    workspaceContext: {},
    commandBasis: {},
    systemPrompt: "",
    tools: [],
  };
  return {
    turnState,
    workspaceContext: turnState.workspaceContext,
    newMessages: [],
  };
}
