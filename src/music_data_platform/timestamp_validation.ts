import {
  MusicDataPlatformError,
  type MusicDataPlatformErrorCode,
} from "./errors.js";

/**
 * Fixed-width ISO-8601 UTC timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`, the shape
 * produced by `Date.prototype.toISOString`). Equal-width strings compare
 * chronologically under lexicographic ordering, which the runtime cleanup
 * queries rely on (`WHERE expires_at <= ?`).
 */
export const comparableTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function assertComparableTimestamp(
  value: string,
  fieldName: string,
  code: MusicDataPlatformErrorCode,
): void {
  if (
    typeof value !== "string" ||
    !comparableTimestampPattern.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new MusicDataPlatformError({
      code,
      message: `${fieldName} must be a valid comparable timestamp string.`,
    });
  }
}
