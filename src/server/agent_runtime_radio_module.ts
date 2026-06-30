import type {
  AgentRuntimeStageToolContextFactoryPort,
  AgentRunCascadeCoordinator,
  MainRadioNotifyChannel,
  RadioSessionControlResult,
  StageToolDispatchPort,
} from "../agent_runtime/index.js";
import {
  createAgentRuntimeRadioRefillRunPort,
  createActorRuntimeSession,
  createPostgresAgentRuntimeTranscriptStore,
  createRadioSessionToolRegistrations,
  createRadioRunFinishToolRegistration,
  createRadioSupervisor,
  createRadioRunResultRecorder,
  createWorkspaceContextAssembler,
  radioDefinition,
  radioSessionInstrument,
  withRadioRunFinishGuards,
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
  let transitionSerialization: Promise<void> = Promise.resolve();

  return {
    descriptor: {
      id: "agent-runtime-radio",
      ownerArea: "agent_runtime",
      label: "Agent Runtime Radio",
    },
    async initialize() {
      const db = requirePort(input.database(), "music database");
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

      const runPort = createAgentRuntimeRadioRefillRunPort({
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
          tools: [
            ...createRadioSessionToolRegistrations({
              start: () => startRadioSession(),
              pause: () => pauseRadioSession(),
              shutdown: () => shutdownRadioSession(),
              resume: () => resumeRadioSession(),
            }),
            createRadioRunFinishToolRegistration(),
          ],
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
          agentOptions: withRadioRunFinishGuards(agentOptions),
        });
      }

      async function startRadioSession() {
        return await serializeTransition(async () => {
          if (lifecycleState !== "Shutdown") {
            return invalidTransition("radio.session.start", lifecycleState, "Shutdown");
          }
          const previousState = lifecycleState;
          const now = new Date().toISOString();
          let session: Awaited<ReturnType<typeof createActorRuntimeSession>> | undefined;
          try {
            await transcriptStore.deactivateActive?.({
              ownerScope,
              workspaceId,
              actor: "radio_agent",
              reason: "superseded",
              now,
            });
            session = await createRadioSession();
            const transitioned = await radioSession.transitionRadioSession({
              ownerScope,
              operation: "start",
              now,
            });
            if (!transitioned.ok) {
              session.abort();
              return transitioned;
            }
            activeSession = session;
            lifecycleState = "Running";
            supervisor?.transitionWakeGate("Running");
            try {
              await supervisor?.wake("low_watermark");
            } catch {
              return wakeFailure("radio.session.start");
            }
            return radioSessionControlOutput({
              previousState,
              state: lifecycleState,
              wakeRequested: true,
              transitioned: transitioned.value,
            });
          } catch {
            session?.abort();
            return runtimeFailure("radio.session.start");
          }
        });
      }

      async function pauseRadioSession() {
        return await serializeTransition(async () => {
          if (lifecycleState === "Shutdown") {
            return invalidTransition("radio.session.pause", lifecycleState, "Running");
          }
          const previousState = lifecycleState;
          if (lifecycleState === "Paused") {
            return invalidTransition("radio.session.pause", previousState, "Running");
          }
          try {
            const transitioned = await radioSession.transitionRadioSession({
              ownerScope,
              operation: "pause",
              now: new Date().toISOString(),
            });
            if (!transitioned.ok) {
              return transitioned;
            }
            lifecycleState = "Paused";
            supervisor?.transitionWakeGate("Paused");
            activeSession?.abort();
            return radioSessionControlOutput({
              previousState,
              state: lifecycleState,
              wakeRequested: false,
              transitioned: transitioned.value,
            });
          } catch {
            return runtimeFailure("radio.session.pause");
          }
        });
      }

      async function shutdownRadioSession() {
        return await serializeTransition(async () => {
          const previousState = lifecycleState;
          if (lifecycleState === "Shutdown") {
            return invalidTransition("radio.session.shutdown", previousState, "Running or Paused");
          }
          const now = new Date().toISOString();
          try {
            const transitioned = await radioSession.transitionRadioSession({
              ownerScope,
              operation: "shutdown",
              now,
            });
            if (!transitioned.ok) {
              return transitioned;
            }
            lifecycleState = "Shutdown";
            supervisor?.transitionWakeGate("Shutdown");
            const session = activeSession;
            activeSession = undefined;
            session?.abort();
            try {
              await session?.waitForIdle();
              await transcriptStore.deactivateActive?.({
                ownerScope,
                workspaceId,
                actor: "radio_agent",
                reason: "radio_shutdown",
                now,
              });
            } catch {
              return cleanupFailure();
            }
            return radioSessionControlOutput({
              previousState,
              state: lifecycleState,
              wakeRequested: false,
              transitioned: transitioned.value,
            });
          } catch {
            return runtimeFailure("radio.session.shutdown");
          }
        });
      }

      async function resumeRadioSession() {
        return await serializeTransition(async () => {
          if (lifecycleState !== "Paused") {
            return invalidTransition("radio.session.resume", lifecycleState, "Paused");
          }
          const previousState = lifecycleState;
          let createdSession: Awaited<ReturnType<typeof createActorRuntimeSession>> | undefined;
          try {
            createdSession = activeSession === undefined
              ? await createRadioSession()
              : undefined;
            const session = createdSession ?? activeSession;
            const transitioned = await radioSession.transitionRadioSession({
              ownerScope,
              operation: "resume",
              now: new Date().toISOString(),
            });
            if (!transitioned.ok) {
              return transitioned;
            }
            activeSession = session;
            lifecycleState = "Running";
            supervisor?.transitionWakeGate("Running");
            try {
              await supervisor?.wake("low_watermark");
            } catch {
              return wakeFailure("radio.session.resume");
            }
            return radioSessionControlOutput({
              previousState,
              state: lifecycleState,
              wakeRequested: true,
              transitioned: transitioned.value,
            });
          } catch {
            createdSession?.abort();
            return runtimeFailure("radio.session.resume");
          }
        });
      }

      function serializeTransition<T>(run: () => Promise<T>): Promise<T> {
        const scheduled = transitionSerialization.then(run, run);
        transitionSerialization = scheduled.then(
          () => undefined,
          () => undefined,
        );
        return scheduled;
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

function runtimeFailure(toolName: string): {
  ok: false;
  error: {
    code: "radio_session_runtime_failed";
    message: string;
    area: "agent_runtime";
    retryable: true;
    suggestedFix: string;
  };
} {
  return {
    ok: false,
    error: {
      code: "radio_session_runtime_failed",
      message: `${toolName} could not complete because the Radio runtime boundary failed.`,
      area: "agent_runtime",
      retryable: true,
      suggestedFix: "Retry the Radio session control if it is still desired.",
    },
  };
}

function wakeFailure(toolName: "radio.session.start" | "radio.session.resume"): {
  ok: false;
  error: {
    code: "radio_session_wake_failed";
    message: string;
    area: "agent_runtime";
    retryable: true;
    suggestedFix: string;
  };
} {
  return {
    ok: false,
    error: {
      code: "radio_session_wake_failed",
      message: `${toolName} set Radio running, but the refill wake request failed.`,
      area: "agent_runtime",
      retryable: true,
      suggestedFix: "Radio is already Running; do not retry radio.session.start or radio.session.resume (both will be rejected). The queue refill is retried automatically on the next low-watermark wake.",
    },
  };
}

function cleanupFailure(): {
  ok: false;
  error: {
    code: "radio_session_cleanup_failed";
    message: string;
    area: "agent_runtime";
    retryable: false;
    suggestedFix: string;
  };
} {
  return {
    ok: false,
    error: {
      code: "radio_session_cleanup_failed",
      message: "radio.session.shutdown set Radio to Shutdown, but transcript cleanup did not finish; the leftover transcript row will be superseded on the next radio.session.start.",
      area: "agent_runtime",
      retryable: false,
      suggestedFix: "No retry is needed: Radio is already shut down. Any leftover transcript row is superseded when Radio is next started.",
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
