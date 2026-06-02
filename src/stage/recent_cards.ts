import type {
  MaterialState,
  StageContext,
} from "../contracts/index.js";

const defaultRecentCardLimit = 5;

export function recentCardsFromEvents(
  events: Array<{ id: string; type: string; payload: unknown }>,
  limit = defaultRecentCardLimit,
): NonNullable<StageContext["recentCards"]> {
  const recentCards: NonNullable<StageContext["recentCards"]> = [];

  for (const event of [...events].reverse()) {
    if (event.type !== "recommendation.presented") {
      continue;
    }

    if (!isRecord(event.payload) || !Array.isArray(event.payload.cards)) {
      continue;
    }

    if (typeof event.payload.presentedAt !== "string") {
      continue;
    }

    for (const [index, card] of event.payload.cards.entries()) {
      if (!isRecord(card)) {
        continue;
      }
      const title = titleFromPresentedEventItem(card);

      if (title === undefined) {
        continue;
      }

      const materialId = materialIdFromCardPayload(card);

      if (materialId === undefined) {
        continue;
      }

      const state = materialStateFromEventValue(card.state);

      if (state === undefined) {
        continue;
      }

      recentCards.push({
        materialId,
        title,
        ...(typeof card.subtitle === "string" ? { subtitle: card.subtitle } : {}),
        position: typeof card.position === "number" ? card.position : index + 1,
        presentedAt: typeof card.presentedAt === "string" ? card.presentedAt : event.payload.presentedAt,
        eventId: event.id,
        state,
      });

      if (recentCards.length >= limit) {
        return recentCards;
      }
    }
  }

  return recentCards;
}

function titleFromPresentedEventItem(card: Record<string, unknown>): string | undefined {
  return typeof card.title === "string"
    ? card.title
    : typeof card.label === "string" ? card.label : undefined;
}

function materialIdFromCardPayload(card: Record<string, unknown>): string | undefined {
  if (typeof card.materialId === "string" && card.materialId.length > 0) {
    return card.materialId;
  }

  return undefined;
}

function materialStateFromEventValue(value: unknown): MaterialState | undefined {
  return isMaterialState(value) ? value : undefined;
}

function isMaterialState(value: unknown): value is MaterialState {
  return (
    value === "grounded" ||
    value === "confirmed_playable" ||
    value === "source_only_playable" ||
    value === "exploration" ||
    value === "unresolved" ||
    value === "blocked" ||
    value === "verbal_only"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
