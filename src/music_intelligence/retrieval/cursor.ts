import type {
  MixedRetrievalCursorPosition,
  RetrievalReadCursorPosition,
} from "../../music_data_platform/index.js";
import { MusicIntelligenceError } from "../errors.js";

export type RetrievalCursorPayload = {
  version: 2;
  queryFingerprint: string;
  position: RetrievalReadCursorPosition | MixedRetrievalCursorPosition;
  resultSetId?: string;
};

export type DecodedRetrievalCursor = {
  position: RetrievalReadCursorPosition | MixedRetrievalCursorPosition;
  resultSetId?: string;
};

export function encodeRetrievalCursor(input: {
  queryFingerprint: string;
  position: RetrievalReadCursorPosition | MixedRetrievalCursorPosition;
  resultSetId?: string;
}): string {
  const payload = {
    version: 2,
    queryFingerprint: input.queryFingerprint,
    position: input.position,
    ...(input.resultSetId === undefined ? {} : { resultSetId: input.resultSetId }),
  } satisfies RetrievalCursorPayload;

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeRetrievalCursor(input: {
  cursor: string;
  expectedQueryFingerprint: string;
}): DecodedRetrievalCursor {
  const payload = decodePayload(input.cursor);

  if (payload.queryFingerprint !== input.expectedQueryFingerprint) {
    throw new MusicIntelligenceError({
      code: "music_intelligence.retrieval_cursor_invalid",
      message: "Retrieval cursor does not belong to the effective query.",
    });
  }

  return {
    position: payload.position,
    ...(payload.resultSetId === undefined ? {} : { resultSetId: payload.resultSetId }),
  };
}

function decodePayload(cursor: string): RetrievalCursorPayload {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch (error) {
    throw invalidCursor("Retrieval cursor is not valid base64url.", error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    throw invalidCursor("Retrieval cursor is not valid JSON.", error);
  }

  if (!isRecord(parsed)) {
    throw invalidCursor("Retrieval cursor payload must be an object.");
  }

  if (parsed.version !== 2) {
    throw invalidCursor("Retrieval cursor version is not supported.");
  }

  if (typeof parsed.queryFingerprint !== "string" || parsed.queryFingerprint.length === 0) {
    throw invalidCursor("Retrieval cursor query fingerprint is invalid.");
  }

  if (!isRetrievalCursorPosition(parsed.position)) {
    throw invalidCursor("Retrieval cursor position is invalid.");
  }

  if (
    parsed.resultSetId !== undefined &&
    (typeof parsed.resultSetId !== "string" || parsed.resultSetId.length === 0)
  ) {
    throw invalidCursor("Retrieval cursor result set id is invalid.");
  }

  return {
    version: 2,
    queryFingerprint: parsed.queryFingerprint,
    position: parsed.position,
    ...(parsed.resultSetId === undefined ? {} : { resultSetId: parsed.resultSetId }),
  };
}

function isRetrievalCursorPosition(
  value: unknown,
): value is RetrievalReadCursorPosition | MixedRetrievalCursorPosition {
  if (!isRecord(value) || typeof value.order !== "string") {
    return false;
  }

  if (value.order === "stable") {
    return typeof value.materialRefKey === "string";
  }

  if (value.order === "recently_added") {
    return typeof value.recentlyAddedAt === "string" &&
      typeof value.materialRefKey === "string";
  }

  if (value.order === "text_relevance") {
    const hasTextRankFields = typeof value.matchedTokenCount === "number" &&
      typeof value.bestFieldPriority === "number" &&
      typeof value.rankSortValue === "number";

    if (!hasTextRankFields) {
      return false;
    }

    if (typeof value.materialRefKey === "string") {
      return true;
    }

    return (value.rowKind === "material" || value.rowKind === "material_candidate") &&
      typeof value.stableRefKey === "string";
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidCursor(message: string, cause?: unknown): MusicIntelligenceError {
  return new MusicIntelligenceError({
    code: "music_intelligence.retrieval_cursor_invalid",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
