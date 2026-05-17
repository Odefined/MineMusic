import type {
  Handbook,
  MusicMaterial,
  Result,
  StageError,
  StageSession,
} from "../contracts/index.js";
import type {
  CanonicalStorePort,
  EffectBoundaryPort,
  EventPort,
  InstrumentCatalogPort,
  MemoryPort,
  SourceResolutionPort,
  StageKernelPort,
} from "../ports/index.js";

type StageKernelOptions = {
  sessions?: StageSession[];
  instruments: InstrumentCatalogPort;
  memory: MemoryPort;
  events: EventPort;
  effects: EffectBoundaryPort;
  source: SourceResolutionPort;
  canonical: CanonicalStorePort;
};

export function createStageKernel({
  sessions = [],
  instruments,
  memory,
  events,
  effects: _effects,
  source: _source,
  canonical: _canonical,
}: StageKernelOptions): StageKernelPort {
  const sessionsById = new Map(sessions.map((session) => [session.id, cloneSession(session)]));
  const getSession: StageKernelPort["getSession"] = async ({ sessionId }) => {
    const session = sessionsById.get(sessionId);

    if (session === undefined) {
      return sessionNotFound(sessionId);
    }

    return ok(cloneSession(session));
  };

  return {
    getSession,

    async updateSession({ sessionId, patch }) {
      const session = sessionsById.get(sessionId);

      if (session === undefined) {
        return sessionNotFound(sessionId);
      }

      const updatedSession: StageSession = {
        ...session,
        ...patch,
        id: session.id,
      };

      sessionsById.set(sessionId, cloneSession(updatedSession));
      await events.record({
        event: {
          sessionId,
          actor: "stage",
          type: "stage.session.updated",
          payload: { patch },
        },
      });

      return ok(cloneSession(updatedSession));
    },

    async compileHandbook({ sessionId }) {
      const sessionResult = await getSession({ sessionId });

      if (!sessionResult.ok) {
        return sessionResult;
      }

      const session = sessionResult.value;
      const [instrumentResult, memoryResult] = await Promise.all([
        instruments.list({ session }),
        memory.summarizeForSession({ sessionId }),
      ]);

      if (!instrumentResult.ok) {
        return instrumentResult;
      }

      if (!memoryResult.ok) {
        return memoryResult;
      }

      const handbook: Handbook = {
        sessionId,
        rules: [
          "Only present playable links when material state is confirmed_playable or source_only_playable.",
          "Normal playable-link display is not playback.",
          "Do not turn weak guesses into durable memory.",
        ],
        ...(session.vibe === undefined ? {} : { stageVibe: session.vibe }),
        availableInstruments: instrumentResult.value,
        permissionBoundaries: [
          "open_link, play, queue_add, playlist_write, source_writeback, memory_update, and notification require effect proposals.",
        ],
        memorySummaries: memoryResult.value,
        pluginGuidance: ["Provider internals stay behind public capability slots."],
      };

      await events.record({
        event: {
          sessionId,
          actor: "stage",
          type: "stage.handbook.compiled",
          payload: { instrumentCount: handbook.availableInstruments.length },
        },
      });

      return ok(handbook);
    },

    async prepareMaterials({ sessionId, materials, purpose }) {
      const sessionResult = await getSession({ sessionId });

      if (!sessionResult.ok) {
        return sessionResult;
      }

      const preparedMaterials = materials.map((material) => gateMaterialForPurpose(material, purpose));

      await events.record({
        event: {
          sessionId,
          actor: "stage",
          type: "stage.materials.prepared",
          payload: {
            purpose,
            count: preparedMaterials.length,
          },
        },
      });

      return ok(preparedMaterials);
    },
  };
}

function gateMaterialForPurpose(
  material: MusicMaterial,
  purpose: "recommendation" | "memory" | "effect" | "conversation",
): MusicMaterial {
  if (purpose === "conversation") {
    return cloneMaterial(material);
  }

  if (material.state === "confirmed_playable" || material.state === "source_only_playable") {
    return cloneMaterial(material);
  }

  return withoutPlayableLinks(material);
}

function withoutPlayableLinks(material: MusicMaterial): MusicMaterial {
  const { playableLinks: _playableLinks, ...materialWithoutPlayableLinks } = material;

  return cloneMaterial(materialWithoutPlayableLinks);
}

function sessionNotFound(sessionId: string): Result<never> {
  return fail({
    code: "stage.session_not_found",
    message: `Stage session '${sessionId}' was not found.`,
    module: "stage",
    retryable: false,
  });
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}

function cloneSession(session: StageSession): StageSession {
  return structuredClone(session);
}

function cloneMaterial(material: MusicMaterial): MusicMaterial {
  return structuredClone(material);
}
