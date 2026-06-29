import type { BackgroundWorkBackend } from "../background_work/index.js";
import type {
  AgentRuntimeStageToolContextFactoryPort,
  MainRadioNotifyChannel,
  RadioRunResultRecorder,
  RadioToolBridgeCache,
  StageToolDispatchPort,
} from "../agent_runtime/index.js";
import {
  createMineMusicPiAgentAdapter,
  createPiRadioRefillRunPort,
  createPostgresRadioTranscriptStore,
  createRadioSupervisor,
  createRadioToolBridge,
  createRadioRunResultRecorder,
  createWorkspaceContextAssembler,
  radioDefinition,
  renderAgentRuntimeSystemPrompt,
  restoreRadioAgentTranscript,
  type MineMusicPiAgentAdapterOptions,
  type RadioWakeDecision,
  type RadioSupervisor,
} from "../agent_runtime/index.js";
import type { RadioWakeReason } from "../contracts/agent_runtime.js";
import type {
  ToolDeclaration,
} from "../contracts/stage_interface.js";
import type {
  MusicExperienceRadioTruthCommand,
  MusicExperienceWorkspaceProjectionPort,
} from "../contracts/music_experience.js";
import {
  createMusicExperienceQueuePlaybackRecords,
  DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID,
} from "../music_experience/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import type { MusicDatabaseContext } from "../storage/index.js";

export type CreateAgentRuntimeRadioModuleInput = {
  ownerScope?: string;
  workspaceId?: string;
  database(): MusicDatabaseContext | undefined;
  backgroundWork(): BackgroundWorkBackend | undefined;
  musicExperienceRead(): MusicExperienceWorkspaceProjectionPort | undefined;
  radioTruth(): MusicExperienceRadioTruthCommand | undefined;
  notifyChannel(): MainRadioNotifyChannel | undefined;
  agentOptions(): MineMusicPiAgentAdapterOptions | undefined;
  tools(): readonly ToolDeclaration[];
  dispatch(): StageToolDispatchPort | undefined;
  contextFactory(): AgentRuntimeStageToolContextFactoryPort | undefined;
};

export type AgentRuntimeRadioModule = RuntimeModule & {
  wake(reason: RadioWakeReason): Promise<RadioWakeDecision>;
};

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
  let currentRunResultRecorder: RadioRunResultRecorder | undefined;
  let radioToolBridgeCache: RadioToolBridgeCache | undefined;

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
        systemPrompt: renderAgentRuntimeSystemPrompt({
          actor: radioDefinition,
          workspaceContext: {},
        }),
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

      const workspaceContext = createWorkspaceContextAssembler({
        musicExperience: musicExperienceRead,
      });
      const runPort = createPiRadioRefillRunPort({
        ownerScope,
        workspaceId,
        agent,
        transcriptStore,
        actor: radioDefinition,
        workspaceContext,
        clock: () => new Date().toISOString(),
        async beforeWorkspaceContextAssemble(payload) {
          const projection = await musicExperienceRead.readWorkspaceProjection({ ownerScope });
          if (!projection.radio.posture.stale) {
            return;
          }
          const radioTruth = requirePort(input.radioTruth(), "Music Experience Radio Truth command");
          const cleared = await radioTruth.clearRadioLean({
            ownerScope,
            commandedRevisionStamp: payload.radioDirectionRevision,
            now: new Date().toISOString(),
          });
          if (!cleared.ok) {
            throw new Error(`Radio run-start failed to clear stale posture: ${cleared.error.code}`, {
              cause: cleared.error,
            });
          }
        },
        prepareRun(payload, _workspaceContext) {
          currentRunResultRecorder = createRadioRunResultRecorder();
          currentRadioBasis = {
            radioDirectionRevision: payload.radioDirectionRevision,
            radioSessionRevision: payload.radioSessionRevision,
          };
          agent.state.tools = radioTools();
        },
        resultFromRun(resultInput) {
          const recorder = requirePort(currentRunResultRecorder, "Radio run result recorder");
          try {
            return recorder.result(resultInput);
          } finally {
            currentRunResultRecorder = undefined;
          }
        },
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
      currentRunResultRecorder = undefined;
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
          ...(currentRadioBasis === undefined ? {} : { preconditionBasis: currentRadioBasis }),
        });
      },
    };
  }

  function radioTools(): RadioToolBridgeCache["bridge"] {
    radioToolBridgeCache = createRadioToolBridge({
      sourceTools: input.tools(),
      ...(radioToolBridgeCache === undefined ? {} : { cache: radioToolBridgeCache }),
      dispatch: lazyDispatch(input),
      contextFactory: radioContextFactory(),
      stageSessionId: "radio",
      observeToolResult(result) {
        currentRunResultRecorder?.observeToolResult(result);
      },
    });
    return radioToolBridgeCache.bridge;
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
