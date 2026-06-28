import type { BackgroundWorkBackend } from "../background_work/index.js";
import type {
  AgentRuntimeStageToolContextFactoryPort,
  StageToolDispatchPort,
} from "../agent_runtime/index.js";
import {
  createInMemoryMainRadioNotifyChannel,
  createMineMusicPiAgentAdapter,
  createPiRadioRefillRunPort,
  createPostgresRadioTranscriptStore,
  createRadioSupervisor,
  createStageToolBridge,
  restoreRadioAgentTranscript,
  type RadioWakeDecision,
  type RadioSupervisor,
} from "../agent_runtime/index.js";
import type { RadioWakeReason } from "../contracts/agent_runtime.js";
import type { ToolCallOutput, ToolDeclaration } from "../contracts/stage_interface.js";
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

  return {
    descriptor: {
      id: "agent-runtime-radio",
      ownerArea: "agent_runtime",
      label: "Agent Runtime Radio",
    },
    async initialize() {
      const db = requirePort(input.database(), "music database");
      const backgroundWork = requirePort(input.backgroundWork(), "Background Work");
      const musicExperienceRead = requirePort(input.musicExperienceRead(), "Music Experience read model");
      const transcriptStore = createPostgresRadioTranscriptStore({ db });
      const agent = createMineMusicPiAgentAdapter({
        systemPrompt: radioBaseSystemPrompt,
        tools: [],
        dispatch: lazyDispatch(input),
        contextFactory: radioContextFactory(),
        stageSessionId: "radio",
        agentOptions: {},
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
      });

      supervisor = createRadioSupervisor({
        ownerScope,
        workspaceId,
        backgroundWork,
        runPort,
        notifyChannel: createInMemoryMainRadioNotifyChannel(),
        pacingRead: {
          async readRadioPacing(readInput) {
            const snapshot = await createMusicExperienceQueuePlaybackRecords({
              db,
              workspaceId,
            }).read({ ownerScope: readInput.ownerScope });
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
      supervisor?.setLifecycle("Shutdown");
      supervisor = undefined;
      currentRadioBasis = undefined;
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
    return createStageToolBridge({
      tools,
      dispatch: lazyDispatch(input),
      contextFactory: radioContextFactory(),
      stageSessionId: "radio",
    });
  }
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
