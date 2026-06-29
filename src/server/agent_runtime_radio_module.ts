import type { BackgroundWorkBackend } from "../background_work/index.js";
import type {
  AgentRuntimeStageToolContextFactoryPort,
  AgentRunCascadeCoordinator,
  MainRadioNotifyChannel,
  RadioRunResultRecorder,
  StageToolDispatchPort,
} from "../agent_runtime/index.js";
import {
  createAgentRuntimeBackgroundRefillPort,
  createActorRuntimeSession,
  createPostgresAgentRuntimeTranscriptStore,
  createRadioSupervisor,
  createRadioRunResultRecorder,
  createWorkspaceContextAssembler,
  radioDefinition,
  type MineMusicPiAgentAdapterOptions,
  type RadioWakeDecision,
  type RadioSupervisor,
} from "../agent_runtime/index.js";
import type { RadioWakeReason } from "../contracts/agent_runtime.js";
import type { ConcernRevisionChange } from "../contracts/kernel.js";
import type {
  ToolDeclaration,
} from "../contracts/stage_interface.js";
import type {
  MusicExperienceRadioTruthCommand,
  MusicExperienceWorkspaceProjectionPort,
} from "../contracts/music_experience.js";
import {
  createMusicExperienceQueuePlaybackRecords,
  createMusicExperienceRadioTruthRecords,
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
  cascade(): AgentRunCascadeCoordinator | undefined;
};

export type AgentRuntimeRadioModule = RuntimeModule & {
  wake(reason: Extract<RadioWakeReason, "low_watermark">): Promise<RadioWakeDecision>;
  observeRevisionChange(change: ConcernRevisionChange): void;
};

export function createAgentRuntimeRadioModule(
  input: CreateAgentRuntimeRadioModuleInput,
): AgentRuntimeRadioModule {
  const ownerScope = input.ownerScope ?? "local";
  const workspaceId = input.workspaceId ?? DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID;
  let supervisor: RadioSupervisor | undefined;
  let runResultRecorder: RadioRunResultRecorder | undefined;

  return {
    descriptor: {
      id: "agent-runtime-radio",
      ownerArea: "agent_runtime",
      label: "Agent Runtime Radio",
    },
    async initialize() {
      runResultRecorder = createRadioRunResultRecorder();
      const db = requirePort(input.database(), "music database");
      const backgroundWork = requirePort(input.backgroundWork(), "Background Work");
      const musicExperienceRead = requirePort(input.musicExperienceRead(), "Music Experience read model");
      const notifyChannel = requirePort(input.notifyChannel(), "Main Radio notify channel");
      const agentOptions = requirePort(input.agentOptions(), "Radio Agent stream options");
      const cascade = requirePort(input.cascade(), "Agent Runtime cascade coordinator");
      const transcriptStore = createPostgresAgentRuntimeTranscriptStore({ db });
      const queuePlaybackRecords = createMusicExperienceQueuePlaybackRecords({ db, workspaceId });
      const radioTruthRecords = createMusicExperienceRadioTruthRecords({ db, workspaceId });
      const workspaceContext = createWorkspaceContextAssembler({
        musicExperience: musicExperienceRead,
      });
      const session = createActorRuntimeSession({
        ownerScope,
        workspaceId,
        actor: radioDefinition,
        workspaceContext,
        tools: input.tools(),
        dispatch: lazyDispatch(input),
        contextFactory: radioContextFactory(),
        stageSessionId: "radio",
        transcriptStore,
        clock: () => new Date().toISOString(),
        agentOptions,
        observeToolResult(result) {
          requirePort(runResultRecorder, "Radio run result recorder").observeToolResult(result);
        },
      });
      await session.restoreTranscript();

      const runPort = createAgentRuntimeBackgroundRefillPort({
        session,
        cascade,
        hooks: {
          async beforeWorkspaceContextAssemble() {
            const radioTruthSnapshot = await radioTruthRecords.read({ ownerScope });
            if (!radioTruthSnapshot.posture.stale) {
              return;
            }
            const radioTruth = requirePort(input.radioTruth(), "Music Experience Radio Truth command");
            const cleared = await radioTruth.clearRadioLean({
              ownerScope,
              commandedRevisionStamp: radioTruthSnapshot.radioDirectionRevision,
              now: new Date().toISOString(),
            });
            if (!cleared.ok) {
              throw new Error(`Radio run-start failed to clear stale posture: ${cleared.error.code}`, {
                cause: cleared.error,
              });
            }
          },
        },
        resultFromRun(resultInput) {
          return requirePort(runResultRecorder, "Radio run result recorder").result(resultInput);
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
    observeRevisionChange(change) {
      const radioSupervisor = requirePort(supervisor, "Radio supervisor");
      radioSupervisor.observeRevisionChange(change);
    },
    async stop() {
      await supervisor?.stop();
      supervisor = undefined;
      runResultRecorder = undefined;
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
        });
      },
    };
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
