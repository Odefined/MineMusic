import type {
  AgentActorKind,
  ConcernRevisionChange,
  ConcernRevisionChangeActor,
  ConcernRevisionChangeConcern,
  ConcernRevisionSet,
} from "../contracts/kernel.js";

export type AgentRunCascadeLease = {
  abortSignal: AbortSignal;
  abort(reason?: Error): void;
  release(): void;
};

export type AgentRunCascadeCoordinator = {
  register(input: {
    runId: string;
    actor: AgentActorKind;
    basis: ConcernRevisionSet;
  }): AgentRunCascadeLease;
  observeRevisionChange(change: ConcernRevisionChange): void;
  abortAll(reason?: Error): void;
};

type ActiveAgentRun = {
  runId: string;
  actor: AgentActorKind;
  basis: ConcernRevisionSet;
  abortController: AbortController;
};

export function createAgentRunCascadeCoordinator(input: {
  ownerScope: string;
}): AgentRunCascadeCoordinator {
  const activeRuns = new Map<string, ActiveAgentRun>();

  return {
    register(runInput) {
      if (activeRuns.has(runInput.runId)) {
        throw new Error(`Agent Runtime run '${runInput.runId}' is already registered.`);
      }
      const activeRun: ActiveAgentRun = {
        ...runInput,
        abortController: new AbortController(),
      };
      activeRuns.set(runInput.runId, activeRun);
      return {
        abortSignal: activeRun.abortController.signal,
        abort(reason) {
          activeRun.abortController.abort(reason);
        },
        release() {
          activeRuns.delete(activeRun.runId);
        },
      };
    },
    observeRevisionChange(change) {
      if (change.ownerScope !== input.ownerScope) {
        return;
      }
      for (const activeRun of activeRuns.values()) {
        if (
          basisIncludesConcern(activeRun.basis, change.concern) &&
          canAbort({ writer: change.actor, runActor: activeRun.actor })
        ) {
          activeRun.abortController.abort(new Error(
            `Concern '${change.concern}' advanced to revision ${change.newRevision}.`,
          ));
        }
      }
    },
    abortAll(reason) {
      for (const activeRun of activeRuns.values()) {
        activeRun.abortController.abort(reason);
      }
      activeRuns.clear();
    },
  };
}

function basisIncludesConcern(
  basis: ConcernRevisionSet,
  concern: ConcernRevisionChangeConcern,
): boolean {
  switch (concern) {
    case "radio-direction":
      return basis.radioDirectionRevision !== undefined;
    case "queue":
      return basis.queueRevision !== undefined;
    case "radio-session":
      return basis.radioSessionRevision !== undefined;
    case "playback":
      return basis.playbackRevision !== undefined;
  }
}

function canAbort(input: {
  writer: ConcernRevisionChangeActor;
  runActor: AgentActorKind;
}): boolean {
  return actorPriority(input.writer) > actorPriority(input.runActor);
}

function actorPriority(actor: ConcernRevisionChangeActor): number {
  switch (actor) {
    case "user":
      return 3;
    case "main_agent":
      return 2;
    case "radio_agent":
      return 1;
  }
}
