import type {
  Agent,
  AgentContext,
  AgentMessage,
  AgentTool,
  AfterToolCallContext,
  AfterToolCallResult,
} from "@earendil-works/pi-agent-core";

import type { AgentActorKind } from "../contracts/kernel.js";
import type { ToolCallOutput } from "../contracts/stage_interface.js";
import type { ActorDefinition } from "./actor_definition.js";
import {
  createCommandBasisTracker,
  type CommandBasisTracker,
} from "./command_basis_tracker.js";
import type {
  AgentRuntimeStageToolContextFactoryPort,
  StageToolDispatchPort,
  StageToolResultObserver,
} from "./stage_tool_bridge.js";
import {
  renderAgentRuntimeSystemPrompt,
  type EncodedWorkspaceContext,
} from "./workspace_context_encoder.js";
import { renderWorkspaceContextDiff } from "./workspace_context_diff.js";
import type {
  WorkspaceContextAssembler,
  WorkspaceContextAssembly,
} from "./workspace_context_assembler.js";

export type MineMusicAgentHarnessTurnState = {
  workspaceContext: EncodedWorkspaceContext;
  commandBasis: WorkspaceContextAssembly["commandBasis"];
  systemPrompt: string;
  tools: readonly AgentTool[];
};

export type MineMusicAgentHarnessPromptInput = string | AgentMessage | AgentMessage[];

export type MineMusicAgentHarnessRunResult = {
  turnState: MineMusicAgentHarnessTurnState;
  newMessages: readonly AgentMessage[];
};

export type MineMusicAgentHarness = {
  createTurnState(input: {
    tools: readonly AgentTool[];
  }): Promise<MineMusicAgentHarnessTurnState>;
  runAgentTurn(input: {
    prompt: MineMusicAgentHarnessPromptInput;
    tools?: readonly AgentTool[];
    turnState?: MineMusicAgentHarnessTurnState;
    abortSignal?: AbortSignal;
  }): Promise<MineMusicAgentHarnessRunResult>;
  createToolContextFactory(
    factory: AgentRuntimeStageToolContextFactoryPort,
  ): AgentRuntimeStageToolContextFactoryPort;
  wrapDispatch(dispatch: StageToolDispatchPort): StageToolDispatchPort;
};

export function createMineMusicAgentHarness(input: {
  agent(): Agent;
  actor: ActorDefinition;
  ownerScope: string;
  workspaceContext: WorkspaceContextAssembler;
}): MineMusicAgentHarness {
  const actorKind = actorKindForDefinition(input.actor);
  let activeTurnState: MineMusicAgentHarnessTurnState | undefined;
  let commandBasisTracker: CommandBasisTracker | undefined;
  let refreshNeeded = false;
  let refreshedTurnStateReady = false;

  const prepareNextTurn: NonNullable<Agent["prepareNextTurn"]> = async (signal) => {
    // pi @0.80.2 fidelity: Agent.createLoopConfig forwards
    // Agent.prepareNextTurn into runLoop (dist/agent.js:278-304), and
    // runLoop applies the returned replacement context after turn_end and
    // before the next provider request (dist/agent-loop.js:125-144).
    // AgentHarness uses the same seam to rebuild turn state from session
    // (dist/harness/agent-harness.js:366-375).
    if (activeTurnState === undefined || signal?.aborted || !refreshNeeded) {
      return undefined;
    }
    refreshNeeded = false;
    if (!refreshedTurnStateReady) {
      activeTurnState = await createTurnState({ tools: input.agent().state.tools });
    }
    refreshedTurnStateReady = false;
    installMineMusicAgentHarnessTurnState({ agent: input.agent(), turnState: activeTurnState });
    return {
      context: createMineMusicAgentHarnessContext({
        agent: input.agent(),
        turnState: activeTurnState,
      }),
    };
  };

  return {
    createTurnState,
    async runAgentTurn(runInput) {
      const agent = input.agent();
      assertNoActiveHarnessTurn();
      const originalPrepareNextTurn = agent.prepareNextTurn;
      const originalAfterToolCall = agent.afterToolCall;
      if (originalPrepareNextTurn !== undefined) {
        throw new Error(`MineMusic AgentHarness for actor '${input.actor.name}' owns pi prepareNextTurn.`);
      }
      const abortAgent = () => {
        agent.abort();
      };
      agent.prepareNextTurn = prepareNextTurn;
      agent.afterToolCall = async (context, signal) => {
        const afterToolCallResult = await originalAfterToolCall?.(context, signal);
        return appendWorkspaceContextDiffToToolResult({
          context,
          afterToolCallResult,
          ...(signal === undefined ? {} : { signal }),
        });
      };
      try {
        const turnState = await startAgentHarnessTurn({
          ...(runInput.tools === undefined ? {} : { tools: runInput.tools }),
          ...(runInput.turnState === undefined ? {} : { turnState: runInput.turnState }),
        });
        const firstNewMessageIndex = agent.state.messages.length;
        runInput.abortSignal?.addEventListener("abort", abortAgent, { once: true });
        await promptAgent(agent, runInput.prompt);
        return {
          turnState,
          newMessages: agent.state.messages.slice(firstNewMessageIndex),
        };
      } finally {
        runInput.abortSignal?.removeEventListener("abort", abortAgent);
        if (originalPrepareNextTurn === undefined) {
          delete agent.prepareNextTurn;
        } else {
          agent.prepareNextTurn = originalPrepareNextTurn;
        }
        if (originalAfterToolCall === undefined) {
          delete agent.afterToolCall;
        } else {
          agent.afterToolCall = originalAfterToolCall;
        }
        endAgentHarnessTurn();
      }
    },
    createToolContextFactory(factory) {
      return {
        createToolContext(perCall) {
          const preconditionBasis = commandBasisTracker?.preconditionBasisForTool(perCall.toolName);
          return factory.createToolContext({
            ...perCall,
            actor: actorKind,
            ...(preconditionBasis === undefined ? {} : { preconditionBasis }),
          });
        },
      };
    },
    wrapDispatch(dispatch) {
      return {
        async dispatch(dispatchInput) {
          const result = await dispatch.dispatch(dispatchInput);
          observeToolResult({ toolName: dispatchInput.toolName, result });
          return result;
        },
      };
    },
  };

  async function startAgentHarnessTurn(startInput: {
    tools?: readonly AgentTool[];
    turnState?: MineMusicAgentHarnessTurnState;
  }): Promise<MineMusicAgentHarnessTurnState> {
    assertNoActiveHarnessTurn();
    const turnState = startInput.turnState ?? await createTurnState({
      tools: startInput.tools ?? input.agent().state.tools,
    });
    activeTurnState = turnState;
    commandBasisTracker = createCommandBasisTracker({
      owner: actorKind,
      initialBasis: turnState.commandBasis,
    });
    installMineMusicAgentHarnessTurnState({ agent: input.agent(), turnState });
    return turnState;
  }

  function assertNoActiveHarnessTurn(): void {
    if (activeTurnState !== undefined || commandBasisTracker !== undefined) {
      throw new Error(`MineMusic AgentHarness for actor '${input.actor.name}' cannot start while a turn is active.`);
    }
  }

  function endAgentHarnessTurn(): void {
    activeTurnState = undefined;
    commandBasisTracker = undefined;
    refreshNeeded = false;
    refreshedTurnStateReady = false;
  }

  async function createTurnState(turnInput: {
    tools: readonly AgentTool[];
  }): Promise<MineMusicAgentHarnessTurnState> {
    // Mirrors pi AgentHarness.createTurnState shape
    // (dist/harness/agent-harness.js:255-287): build context/resources/tools,
    // then derive the system prompt for the provider context.
    const assembly = await input.workspaceContext.assemble({
      actor: input.actor,
      ownerScope: input.ownerScope,
    });

    return {
      workspaceContext: assembly.workspaceContext,
      commandBasis: assembly.commandBasis,
      systemPrompt: renderAgentRuntimeSystemPrompt({
        actor: input.actor,
        workspaceContext: assembly.workspaceContext,
      }),
      tools: turnInput.tools.slice(),
    };
  }

  function observeToolResult(observation: Parameters<StageToolResultObserver>[0]): void {
    if (commandBasisTracker?.absorbToolResult(observation.result) === true) {
      refreshNeeded = true;
      refreshedTurnStateReady = false;
    }
  }

  async function appendWorkspaceContextDiffToToolResult(input: {
    context: AfterToolCallContext;
    afterToolCallResult: AfterToolCallResult | undefined;
    signal?: AbortSignal;
  }): Promise<AfterToolCallResult | undefined> {
    const isError = input.afterToolCallResult?.isError ?? input.context.isError;
    if (isError || input.signal?.aborted || activeTurnState === undefined) {
      return input.afterToolCallResult;
    }
    const originalDetails = input.context.result.details;
    if (!isToolCallOutput(originalDetails) || originalDetails.runtime?.changedBasis === undefined || !refreshNeeded) {
      return input.afterToolCallResult;
    }

    const beforeWorkspaceContext = activeTurnState.workspaceContext;
    activeTurnState = await createTurnState({ tools: activeTurnState.tools });
    refreshedTurnStateReady = true;
    const diff = renderWorkspaceContextDiff({
      before: beforeWorkspaceContext,
      after: activeTurnState.workspaceContext,
    });
    if (diff === undefined) {
      return input.afterToolCallResult;
    }

    return {
      ...input.afterToolCallResult,
      content: [
        ...(input.afterToolCallResult?.content ?? input.context.result.content),
        { type: "text", text: diff },
      ],
    };
  }
}

async function promptAgent(agent: Agent, prompt: MineMusicAgentHarnessPromptInput): Promise<void> {
  // pi @0.80.2 fidelity: Agent.prompt normalizes all supported prompt shapes
  // and awaits runPromptMessages (dist/agent.js:217-223); runWithLifecycle then
  // awaits the loop/listeners before resolving (dist/agent.js:261-327, 360-399).
  // Keep that surface intact instead of normalizing MineMusic prompts or adding
  // a second wait loop.
  if (typeof prompt === "string") {
    await agent.prompt(prompt);
    return;
  }
  if (Array.isArray(prompt)) {
    await agent.prompt(prompt);
    return;
  }
  await agent.prompt(prompt);
}

function installMineMusicAgentHarnessTurnState(input: {
  agent: Agent;
  turnState: MineMusicAgentHarnessTurnState;
}): void {
  // pi @0.80.2 fidelity:
  // - low-level Agent snapshots state before runAgentLoop
  //   (node_modules/@earendil-works/pi-agent-core/dist/agent.js:261-276);
  // - AgentHarness lets before_agent_start override the system prompt before
  //   createContext(..., beforeResult?.systemPrompt) enters runAgentLoop
  //   (dist/harness/agent-harness.js:476-493).
  // MineMusic keeps low-level Agent as runtime owner, so installing the prepared
  // provider context must happen before Agent.prompt() creates that snapshot.
  input.agent.state.systemPrompt = input.turnState.systemPrompt;
  input.agent.state.tools = input.turnState.tools.slice();
}

function createMineMusicAgentHarnessContext(input: {
  agent: Agent;
  turnState: MineMusicAgentHarnessTurnState;
}): AgentContext {
  // pi @0.80.2 fidelity: AgentLoopConfig.prepareNextTurn returns a replacement
  // AgentContext that runLoop uses before the next provider request
  // (dist/agent-loop.js:125-144). Keep the same provider shape as
  // Agent.createContextSnapshot(): systemPrompt, messages, tools.
  return {
    systemPrompt: input.turnState.systemPrompt,
    messages: input.agent.state.messages.slice(),
    tools: input.turnState.tools.slice(),
  };
}

function actorKindForDefinition(actor: ActorDefinition): AgentActorKind {
  switch (actor.name) {
    case "main":
      return "main_agent";
    case "radio":
      return "radio_agent";
  }
}

function isToolCallOutput(value: unknown): value is ToolCallOutput {
  return value !== null &&
    typeof value === "object" &&
    typeof (value as { toolName?: unknown }).toolName === "string" &&
    "result" in value;
}
