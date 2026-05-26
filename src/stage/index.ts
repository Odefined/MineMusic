import type {
  MusicMaterial,
  Result,
  StageContext,
  StageError,
  StageSession,
} from "../contracts/index.js";
import type {
  EventPort,
  MaterialGatePort,
  MemoryPort,
  SessionContextPort,
} from "../ports/index.js";

type SessionContextOptions = {
  sessions?: StageSession[];
  memory: MemoryPort;
  events: EventPort;
};

type MaterialGateOptions = {
  sessionContext: SessionContextPort;
  events: EventPort;
};

export function createSessionContext({
  sessions = [],
  memory,
  events,
}: SessionContextOptions): SessionContextPort {
  const sessionsById = new Map(sessions.map((session) => [session.id, cloneSession(session)]));
  const getSession: SessionContextPort["getSession"] = async ({ sessionId }) => {
    const session = sessionsById.get(sessionId);

    if (session === undefined) {
      return sessionNotFound(sessionId);
    }

    return ok(cloneSession(session));
  };

  return {
    getSession,

    async readContext({ sessionId }) {
      const sessionResult = await getSession({ sessionId });

      if (!sessionResult.ok) {
        return sessionResult;
      }

      const session = sessionResult.value;
      const memoryResult = await memory.summarizeForSession({ sessionId });

      if (!memoryResult.ok) {
        return memoryResult;
      }

      const context: StageContext = {
        session,
        memorySummaries: memoryResult.value,
        ...(session.posture === "canonical_review"
          ? { guidance: canonicalReviewGuidance() }
          : {}),
      };

      return ok(context);
    },

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

  };
}

function canonicalReviewGuidance(): string[] {
  return [
    "Provisional Review v1 only supports provisional recordings.",
    "Call canonical.review.inspect before canonical.review.apply for a subject.",
    "Choose update only with one selected MusicBrainz recording ref and at least two non-label support reasons from inspected facts.",
    "Choose defer when inspected facts are incomplete, ambiguous, or contradictory.",
    "Apply derives activate or merge from current Canonical Store state; the agent must not choose activate, merge, or a merge target.",
    "Use only refs, Knowledge Item ids, and anchors returned by canonical.review.inspect.",
  ];
}

export function createMaterialGate({
  sessionContext,
  events,
}: MaterialGateOptions): MaterialGatePort {
  return {
    async prepareMaterials({ sessionId, materials, purpose }) {
      const sessionResult = await sessionContext.getSession({ sessionId });

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

type MaterialGatePurpose = Parameters<MaterialGatePort["prepareMaterials"]>[0]["purpose"];

function gateMaterialForPurpose(
  material: MusicMaterial,
  purpose: MaterialGatePurpose,
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
