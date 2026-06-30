import type { BackgroundWorkBackend } from "../background_work/index.js";
import type {
  AgentRuntimeStageToolContextFactoryPort,
  AgentRunCascadeCoordinator,
  MainRadioNotifyChannel,
  RadioSessionControlResult,
  StageToolDispatchPort,
} from "../agent_runtime/index.js";
import {
  createAgentRuntimeBackgroundRefillPort,
  createActorRuntimeSession,
  createPostgresAgentRuntimeTranscriptStore,
  createRadioSessionToolRegistrations,
  createRadioSupervisor,
  createRadioRunResultRecorder,
  createWorkspaceContextAssembler,
  radioDefinition,
  radioSessionInstrument,
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
  MusicExperienceRadioSessionCommand,
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
  radioSession(): MusicExperienceRadioSessionCommand | undefined;
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
  let activeSession: Awaited<ReturnType<typeof createActorRuntimeSession>> | undefined;
  let lifecycleState: "Running" | "Paused" | "Shutdown" = "Shutdown";

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
      const radioSession = requirePort(input.radioSession(), "Music Experience Radio Session command");
      const notifyChannel = requirePort(input.notifyChannel(), "Main Radio notify channel");
      const agentOptions = requirePort(input.agentOptions(), "Radio Agent stream options");
      const cascade = requirePort(input.cascade(), "Agent Runtime cascade coordinator");
      const dispatch = requirePort(input.dispatch(), "Stage dispatch");
      const contextFactory = requirePort(input.contextFactory(), "Stage tool context factory");
      const transcriptStore = createPostgresAgentRuntimeTranscriptStore({ db });
      const queuePlaybackRecords = createMusicExperienceQueuePlaybackRecords({ db, workspaceId });
      const radioTruthRecords = createMusicExperienceRadioTruthRecords({ db, workspaceId });
      const workspaceContext = createWorkspaceContextAssembler({
        musicExperience: musicExperienceRead,
      });

      const runPort = createAgentRuntimeBackgroundRefillPort({
        session: {
          get actorKind() {
            return requirePort(activeSession, "active Radio session").actorKind;
          },
          readWorkspaceContext() {
            return requirePort(activeSession, "active Radio session").readWorkspaceContext();
          },
          run(runInput) {
            return requirePort(activeSession, "active Radio session").run(runInput);
          },
          abort() {
            requirePort(activeSession, "active Radio session").abort();
          },
          waitForIdle() {
            return requirePort(activeSession, "active Radio session").waitForIdle();
          },
        },
        cascade,
        createResultRecorder: createRadioRunResultRecorder,
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
        initialWakeGateState: "Shutdown",
      });

      return {
        ok: true,
        value: {
          instruments: [radioSessionInstrument],
          tools: createRadioSessionToolRegistrations({
            start: () => startRadioSession(),
            pause: () => pauseRadioSession(),
            shutdown: () => shutdownRadioSession(),
            resume: () => resumeRadioSession(),
          }),
        },
      };

      async function createRadioSession() {
        return await createActorRuntimeSession({
          ownerScope,
          workspaceId,
          actor: radioDefinition,
          workspaceContext,
          tools: input.tools(),
          dispatch,
          contextFactory,
          transcriptStore,
          clock: () => new Date().toISOString(),
          agentOptions,
        });
      }

      async function startRadioSession() {
        if (lifecycleState !== "Shutdown") {
          return invalidTransition("radio.session.start", lifecycleState, "Shutdown");
        }
        const previousState = lifecycleState;
        activeSession = await createRadioSession();
        const transitioned = await radioSession.transitionRadioSession({
          ownerScope,
          operation: "start",
          now: new Date().toISOString(),
        });
        if (!transitioned.ok) {
          activeSession = undefined;
          return transitioned;
        }
        lifecycleState = "Running";
        supervisor?.transitionWakeGate("Running");
        await supervisor?.wake("low_watermark");
        return radioSessionControlOutput({
          previousState,
          state: lifecycleState,
          wakeRequested: true,
          transitioned: transitioned.value,
        });
      }

      async function pauseRadioSession() {
        if (lifecycleState === "Shutdown") {
          return invalidTransition("radio.session.pause", lifecycleState, "Running");
        }
        const previousState = lifecycleState;
        if (lifecycleState === "Paused") {
          return invalidTransition("radio.session.pause", previousState, "Running");
        }
        supervisor?.transitionWakeGate("Paused");
        activeSession?.abort();
        const transitioned = await radioSession.transitionRadioSession({
          ownerScope,
          operation: "pause",
          now: new Date().toISOString(),
        });
        if (!transitioned.ok) {
          return transitioned;
        }
        lifecycleState = "Paused";
        return radioSessionControlOutput({
          previousState,
          state: lifecycleState,
          wakeRequested: false,
          transitioned: transitioned.value,
        });
      }

      async function shutdownRadioSession() {
        const previousState = lifecycleState;
        if (lifecycleState === "Shutdown") {
          return invalidTransition("radio.session.shutdown", previousState, "Running or Paused");
        }
        supervisor?.transitionWakeGate("Shutdown");
        activeSession?.abort();
        await activeSession?.waitForIdle();
        await transcriptStore.deactivateActive?.({
          ownerScope,
          workspaceId,
          actor: "radio_agent",
          reason: "radio_shutdown",
          now: new Date().toISOString(),
        });
        activeSession = undefined;
        const transitioned = await radioSession.transitionRadioSession({
          ownerScope,
          operation: "shutdown",
          now: new Date().toISOString(),
        });
        if (!transitioned.ok) {
          return transitioned;
        }
        lifecycleState = "Shutdown";
        return radioSessionControlOutput({
          previousState,
          state: lifecycleState,
          wakeRequested: false,
          transitioned: transitioned.value,
        });
      }

      async function resumeRadioSession() {
        if (lifecycleState !== "Paused") {
          return invalidTransition("radio.session.resume", lifecycleState, "Paused");
        }
        const previousState = lifecycleState;
        activeSession ??= await createRadioSession();
        const transitioned = await radioSession.transitionRadioSession({
          ownerScope,
          operation: "resume",
          now: new Date().toISOString(),
        });
        if (!transitioned.ok) {
          return transitioned;
        }
        lifecycleState = "Running";
        supervisor?.transitionWakeGate("Running");
        await supervisor?.wake("low_watermark");
        return radioSessionControlOutput({
          previousState,
          state: lifecycleState,
          wakeRequested: true,
          transitioned: transitioned.value,
        });
      }
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
      activeSession = undefined;
      lifecycleState = "Shutdown";
      return { ok: true, value: undefined };
    },
  };
}

function invalidTransition(
  toolName: string,
  current: "Running" | "Paused" | "Shutdown",
  required: string,
): {
  ok: false;
  error: {
    code: "radio_session_invalid_transition";
    message: string;
    area: "agent_runtime";
    retryable: false;
    suggestedFix: string;
  };
} {
  return {
    ok: false,
    error: {
      code: "radio_session_invalid_transition",
      message: `${toolName} requires Radio to be ${required}; current state is ${current}.`,
      area: "agent_runtime",
      retryable: false,
      suggestedFix: "Use the Radio session control that matches the current lifecycle state.",
    },
  };
}

function radioSessionControlOutput(input: {
  previousState: "Running" | "Paused" | "Shutdown";
  state: "Running" | "Paused" | "Shutdown";
  wakeRequested: boolean;
  transitioned: {
    radioSessionRevision: number;
    playbackRevision: number;
    playbackEffect: "unchanged" | "paused_existing" | "resumed_existing";
  };
}): { ok: true; value: RadioSessionControlResult } {
  return {
    ok: true,
    value: {
      previousState: input.previousState,
      state: input.state,
      radioSessionRevision: input.transitioned.radioSessionRevision,
      playbackEffect: input.transitioned.playbackEffect,
      wakeRequested: input.wakeRequested,
      changedBasis: {
        radioSessionRevision: input.transitioned.radioSessionRevision,
        ...(input.transitioned.playbackEffect === "unchanged"
          ? {}
          : { playbackRevision: input.transitioned.playbackRevision }),
      },
    },
  };
}

function requirePort<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Agent Runtime Radio module requires initialized ${label}.`);
  }
  return value;
}
