export type MusicIntelligenceErrorCode =
  | "music_intelligence.cursor_invalid"
  | "music_intelligence.cursor_mismatch"
  | "music_intelligence.retrieval_query_invalid"
  | "music_intelligence.retrieval_result_invalid";

export type CreateMusicIntelligenceErrorInput = {
  code: MusicIntelligenceErrorCode;
  message: string;
  cause?: unknown;
};

export class MusicIntelligenceError extends Error {
  readonly code: MusicIntelligenceErrorCode;
  override readonly cause?: unknown;

  constructor(input: CreateMusicIntelligenceErrorInput) {
    super(input.message);
    this.name = "MusicIntelligenceError";
    this.code = input.code;

    if (input.cause !== undefined) {
      this.cause = input.cause;
    }
  }
}

export function isMusicIntelligenceError(
  error: unknown,
): error is MusicIntelligenceError {
  return error instanceof MusicIntelligenceError;
}
