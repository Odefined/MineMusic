import type {
  Result,
  StageContext,
  StageError,
  StageSession,
} from "../contracts/index.js";
import { recentCardsFromEvents } from "./recent_cards.js";
import type {
  EventPort,
  MemoryPort,
  SessionContextPort,
} from "../ports/index.js";

type SessionContextOptions = {
  sessions?: StageSession[];
  memory: MemoryPort;
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

      const eventsResult = await events.listBySession({ sessionId });

      if (!eventsResult.ok) {
        return eventsResult;
      }

      const recentCards = recentCardsFromEvents(eventsResult.value);

      const context: StageContext = {
        session,
        memorySummaries: memoryResult.value,
        ...(recentCards.length === 0 ? {} : { recentCards }),
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
    "Provisional Review v3 supports provisional recording maintenance.",
    "For batch review, call canonical.review.auto_update({ limit }) first; continue with the returned runId while hasMore is true.",
    "After auto_update, inspect only not_qualified or error subjects that need manual review.",
    "For manual update, require semantic recording identity and version compatibility from inspected facts; do not pick the closest-looking MusicBrainz result.",
    "knowledgeFacts are lookup facts, not update candidates.",
    "For manual list review, call canonical.review.list with small pages and no cursor until no items remain; the default excludes cannot-confirm review-state subjects, and includeCannotConfirm true opts in.",
    "Use summary inspect by default; detail requires the latest inspectionId plus a recordingRefToken from summary.",
    "Use releaseAppearances detail to get release tokens, then request releaseTrackPositions with releaseRefTokens only for relevant releases.",
    "Inspect returns compact facts for judgment, not action recommendations or merge targets.",
    "Apply update with one selectedProviderRefToken and a short reason, or apply cannot_confirm with a short reason; cannot_confirm is a normal safe outcome, not a failure.",
    "Choose cannot_confirm when inspected facts are incomplete, ambiguous, contradictory, or do not establish version compatibility.",
    "Apply derives activate or merge from current Canonical Store state; the agent must not choose activate, merge, or a merge target.",
    "Do not ask for raw/full inspection output; use detail views only when compact summary facts are insufficient.",
  ];
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
