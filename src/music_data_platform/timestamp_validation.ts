import {
  MusicDataPlatformError,
  type MusicDataPlatformErrorCode,
} from "./errors.js";

/**
 * Fixed-width ISO-8601 UTC timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`, the shape
 * produced by `Date.prototype.toISOString`). This is the application boundary
 * shape even when Postgres stores runtime expiry columns as TIMESTAMPTZ.
 */
export const comparableTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function comparableTimestampSql(columnExpression: string): string {
  return `to_char(${columnExpression} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

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
