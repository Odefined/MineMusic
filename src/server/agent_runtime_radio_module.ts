import type { BackgroundWorkBackend } from "../background_work/index.js";
import type {
  AgentRuntimeStageToolContextFactoryPort,
  MainRadioNotifyChannel,
  StageToolDispatchPort,
} from "../agent_runtime/index.js";
import {
  createMineMusicPiAgentAdapter,
  createPiRadioRefillRunPort,
  createPostgresRadioTranscriptStore,
  createRadioSupervisor,
  createStageToolBridge,
  isStageToolErrorDetails,
  restoreRadioAgentTranscript,
  toPiToolName,
  type CreatePiRadioRefillRunPortInput,
  type MineMusicPiAgentAdapterOptions,
  type RadioWakeDecision,
  type RadioSupervisor,
} from "../agent_runtime/index.js";
import type { RadioWakeReason } from "../contracts/agent_runtime.js";
import type {
  MusicExperienceQueueAppendOutput,
  ToolCallOutput,
  ToolDeclaration,
} from "../contracts/stage_interface.js";
import type { WorkbenchMusicExperienceReadPort } from "../contracts/workbench_interface.js";
import {
  createMusicExperienceQueuePlaybackRecords,
  DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID,
} from "../music_experience/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import type { MusicDatabaseContext } from "../storage/index.js";
import { createWorkspaceReadModelComposer } from "../workbench_interface/index.js";

export type CreateAgentRuntimeRadioModuleInput = {
  ownerScope?: string;
  workspaceId?: string;
  database(): MusicDatabaseContext | undefined;
  backgroundWork(): BackgroundWorkBackend | undefined;
  musicExperienceRead(): WorkbenchMusicExperienceReadPort | undefined;
  notifyChannel(): MainRadioNotifyChannel | undefined;
  agentOptions(): MineMusicPiAgentAdapterOptions | undefined;
  tools(): readonly ToolDeclaration[];
  dispatch(): StageToolDispatchPort | undefined;
  contextFactory(): AgentRuntimeStageToolContextFactoryPort | undefined;
};

export type AgentRuntimeRadioModule = RuntimeModule & {
  wake(reason: RadioWakeReason): Promise<RadioWakeDecision>;
};

const radioBaseSystemPrompt = [
  "You are the MineMusic Radio Agent.",
  "Run one bounded refill turn when woken.",
  "Use the Radio Run Floor as durable direction truth and avoid material already in the queue.",
].join("\n");

const radioQueueAppendToolName = "music.experience.queue.append";
const radioQueueAppendPiToolName = toPiToolName(radioQueueAppendToolName);

export const RADIO_STAGE_TOOL_NAMES = [
  "music.discovery.list_scopes",
  "music.discovery.lookup",
  "library.catalog.list_scopes",
  "library.catalog.browse",
  "library.catalog.sample",
  "library.catalog.summary",
  "music.experience.queue.append",
] as const;

export function selectRadioStageToolDeclarations(
  tools: readonly ToolDeclaration[],
): readonly ToolDeclaration[] {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  return RADIO_STAGE_TOOL_NAMES.map((name) => {
    const tool = toolsByName.get(name);
    if (tool === undefined) {
      throw new Error(`Radio Agent requires Stage tool '${name}'.`);
    }
    return tool;
  });
}

export function createAgentRuntimeRadioModule(
  input: CreateAgentRuntimeRadioModuleInput,
): AgentRuntimeRadioModule {
  const ownerScope = input.ownerScope ?? "local";
  const workspaceId = input.workspaceId ?? DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID;
  let supervisor: RadioSupervisor | undefined;
  let currentRadioBasis: {
    radioDirectionRevision: number;
    radioSessionRevision: number;
  } | undefined;
  let radioToolBridgeCache: {
    sourceTools: readonly ToolDeclaration[];
    declarations: readonly ToolDeclaration[];
    bridge: ReturnType<typeof createStageToolBridge>;
  } | undefined;

  return {
    descriptor: {
      id: "agent-runtime-radio",
      ownerArea: "agent_runtime",
      label: "Agent Runtime Radio",
    },
    async initialize() {
      radioToolBridgeCache = undefined;
      const db = requirePort(input.database(), "music database");
      const backgroundWork = requirePort(input.backgroundWork(), "Background Work");
      const musicExperienceRead = requirePort(input.musicExperienceRead(), "Music Experience read model");
      const notifyChannel = requirePort(input.notifyChannel(), "Main Radio notify channel");
      const agentOptions = requirePort(input.agentOptions(), "Radio Agent stream options");
      const transcriptStore = createPostgresRadioTranscriptStore({ db });
      // The records object closes over only {db, workspaceId} (no per-read
      // mutable state), so it is built once and shared by the pacing read.
      const queuePlaybackRecords = createMusicExperienceQueuePlaybackRecords({ db, workspaceId });
      const agent = createMineMusicPiAgentAdapter({
        systemPrompt: radioBaseSystemPrompt,
        tools: [],
        dispatch: lazyDispatch(input),
        contextFactory: radioContextFactory(),
        stageSessionId: "radio",
        agentOptions,
      });
      await restoreRadioAgentTranscript({
        ownerScope,
        workspaceId,
        agent,
        transcriptStore,
      });

      const runStartRead = createWorkspaceReadModelComposer({
        clock: () => new Date().toISOString(),
        musicExperience: musicExperienceRead,
      });
      const runPort = createPiRadioRefillRunPort({
        ownerScope,
        workspaceId,
        agent,
        transcriptStore,
        baseSystemPrompt: radioBaseSystemPrompt,
        runStartRead,
        clock: () => new Date().toISOString(),
        prepareRun(payload, _runStartContext) {
          currentRadioBasis = {
            radioDirectionRevision: payload.radioDirectionRevision,
            radioSessionRevision: payload.radioSessionRevision,
          };
          agent.state.tools = radioTools();
        },
        resultFromMessages: radioResultFromMessages,
      });

      supervisor = createRadioSupervisor({
        ownerScope,
        workspaceId,
        backgroundWork,
        runPort,
        notifyChannel,
        pacingRead: {
          async readRadioPacing(readInput) {
            const snapshot = await queuePlaybackRecords.read({ ownerScope: readInput.ownerScope });
            return {
              queueDepth: snapshot.queue.length,
              radioDirectionRevision: snapshot.radioDirectionRevision,
              radioSessionRevision: snapshot.radioSessionRevision,
            };
          },
        },
      });

      return { ok: true, value: {} };
    },
    wake(reason) {
      const radioSupervisor = requirePort(supervisor, "Radio supervisor");
      return radioSupervisor.wake(reason);
    },
    async stop() {
      await supervisor?.stop();
      supervisor = undefined;
      currentRadioBasis = undefined;
      radioToolBridgeCache = undefined;
      return { ok: true, value: undefined };
    },
  };
  function radioContextFactory(): AgentRuntimeStageToolContextFactoryPort {
    return {
      createToolContext(perCall) {
        const factory = input.contextFactory();
        if (factory === undefined) {
          throw new Error("Radio Agent context factory used before Stage Runtime is ready.");
        }
        return factory.createToolContext({
          ...perCall,
          actor: "radio_agent",
          ...(currentRadioBasis === undefined ? {} : { commandBasis: currentRadioBasis }),
        });
      },
    };
  }

  function radioTools(): ReturnType<typeof createStageToolBridge> {
    const tools = input.tools();
    if (tools.length === 0) {
      throw new Error("Radio Agent tools used before Stage Runtime is ready.");
    }
    if (radioToolBridgeCache?.sourceTools === tools) {
      return radioToolBridgeCache.bridge;
    }

    const declarations = selectRadioStageToolDeclarations(tools);
    if (
      radioToolBridgeCache !== undefined &&
      sameToolDeclarations(radioToolBridgeCache.declarations, declarations)
    ) {
      radioToolBridgeCache = {
        ...radioToolBridgeCache,
        sourceTools: tools,
      };
      return radioToolBridgeCache.bridge;
    }

    const bridge = createStageToolBridge({
      tools: declarations,
      dispatch: lazyDispatch(input),
      contextFactory: radioContextFactory(),
      stageSessionId: "radio",
    });
    radioToolBridgeCache = {
      sourceTools: tools,
      declarations,
      bridge,
    };
    return bridge;
  }
}

function sameToolDeclarations(
  left: readonly ToolDeclaration[],
  right: readonly ToolDeclaration[],
): boolean {
  return left.length === right.length &&
    left.every((tool, index) => tool === right[index]);
}

type RadioResultFromMessagesInput = Parameters<NonNullable<CreatePiRadioRefillRunPortInput["resultFromMessages"]>>[0];

export function radioResultFromMessages(input: RadioResultFromMessagesInput) {
  let appendedCount = 0;
  for (const message of input.newMessages) {
    if (message.role !== "toolResult" || message.toolName !== radioQueueAppendPiToolName) {
      continue;
    }
    if (message.isError) {
      const error = isStageToolErrorDetails(message.details) ? message.details.error : undefined;
      if (error?.code === "voided_stale" || error?.code === "operation_aborted") {
        return radioVoidedStaleResult(input);
      }
      throw new Error(`Radio refill run '${input.runId}' failed during ${radioQueueAppendToolName}.`);
    }
    const output = queueAppendOutputFromToolDetails(message.details);
    appendedCount += output.items.length;
  }

  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: appendedCount > 0 ? "appended" as const : "no_action" as const,
    appendedCount,
  };
}

function radioVoidedStaleResult(input: RadioResultFromMessagesInput) {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "voided_stale" as const,
    appendedCount: 0,
  };
}

function queueAppendOutputFromToolDetails(details: unknown): MusicExperienceQueueAppendOutput {
  if (details === null || typeof details !== "object") {
    throw new Error("Radio queue append tool result details were not an object.");
  }

  const record = details as { toolName?: unknown; result?: unknown };
  if (record.toolName !== radioQueueAppendToolName) {
    throw new Error("Radio queue append tool result details used the wrong tool name.");
  }
  if (record.result === null || typeof record.result !== "object") {
    throw new Error("Radio queue append tool result payload was not an object.");
  }

  const output = record.result as Partial<MusicExperienceQueueAppendOutput>;
  if (!Array.isArray(output.items) || typeof output.queueLength !== "number" || typeof output.queueRevision !== "number") {
    throw new Error("Radio queue append tool result payload had an invalid shape.");
  }

  return output as MusicExperienceQueueAppendOutput;
}

function lazyDispatch(input: CreateAgentRuntimeRadioModuleInput): StageToolDispatchPort {
  return {
    dispatch(dispatchInput) {
      const dispatch = input.dispatch();
      if (dispatch === undefined) {
        throw new Error("Radio Agent dispatch used before Stage Runtime is ready.");
      }
      return dispatch.dispatch(dispatchInput);
    },
  };
}

function requirePort<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Agent Runtime Radio module requires initialized ${label}.`);
  }
  return value;
}
