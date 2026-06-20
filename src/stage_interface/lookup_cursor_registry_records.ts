import type { MusicDatabaseContext } from "../storage/database.js";

export type StageInterfaceLookupCursorBindingRecord = {
  cursorId: string;
  ownerScope: string;
  internalCursor: string;
  queryInputJson: string;
  issuedAt: string;
  expiresAt: string;
};

export type CreateStageInterfaceLookupCursorRegistryRecordsInput = {
  db: MusicDatabaseContext;
};

export type StageInterfaceLookupCursorRegistryRecords = {
  bindings: StageInterfaceLookupCursorBindingRepository;
};

export type StageInterfaceLookupCursorBindingRepository = {
  getByOwnerCursor(input: {
    cursorId: string;
    ownerScope: string;
  }): Promise<StageInterfaceLookupCursorBindingRecord | undefined>;
  createBinding(record: StageInterfaceLookupCursorBindingRecord): Promise<StageInterfaceLookupCursorBindingRecord>;
};

type StageInterfaceLookupCursorBindingRow = {
  cursor_id: string;
  owner_scope: string;
  internal_cursor_json: string;
  query_input_json: string;
  issued_at: string;
  expires_at: string;
};

export function createStageInterfaceLookupCursorRegistryRecords(
  input: CreateStageInterfaceLookupCursorRegistryRecordsInput,
): StageInterfaceLookupCursorRegistryRecords {
  const { db } = input;

  const bindings: StageInterfaceLookupCursorBindingRepository = {
    async getByOwnerCursor(readInput) {
      assertNonEmptyString(readInput.cursorId, "cursorId");
      assertNonEmptyString(readInput.ownerScope, "ownerScope");

      const row = await db.get<StageInterfaceLookupCursorBindingRow>(
        `
          SELECT *
          FROM stage_interface_lookup_cursor_registry
          WHERE cursor_id = ?
            AND owner_scope = ?
        `,
        [readInput.cursorId, readInput.ownerScope],
      );

      return row === undefined ? undefined : bindingFromRow(row);
    },
    async createBinding(record) {
      assertBindingRecord(record);

      await db.run(
        `
          INSERT INTO stage_interface_lookup_cursor_registry (
            cursor_id,
            owner_scope,
            internal_cursor_json,
            query_input_json,
            issued_at,
            expires_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          record.cursorId,
          record.ownerScope,
          record.internalCursor,
          record.queryInputJson,
          record.issuedAt,
          record.expiresAt,
        ],
      );

      return record;
    },
  };

  return { bindings };
}

// The DB column is named internal_cursor_json for historical reasons (this
// registry has no migration story — schemas are append-only CREATE TABLE IF
// NOT EXISTS), but it holds the opaque retrieval cursor verbatim as TEXT, not
// JSON. The TS field is named to reflect what the value actually is.
function bindingFromRow(row: StageInterfaceLookupCursorBindingRow): StageInterfaceLookupCursorBindingRecord {
  return {
    cursorId: row.cursor_id,
    ownerScope: row.owner_scope,
    internalCursor: row.internal_cursor_json,
    queryInputJson: row.query_input_json,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
  };
}

function assertBindingRecord(record: StageInterfaceLookupCursorBindingRecord): void {
  assertNonEmptyString(record.cursorId, "cursorId");
  assertNonEmptyString(record.ownerScope, "ownerScope");
  assertNonEmptyString(record.internalCursor, "internalCursor");
  assertJsonString(record.queryInputJson, "queryInputJson");
  assertComparableTimestamp(record.issuedAt, "issuedAt");
  assertComparableTimestamp(record.expiresAt, "expiresAt");

  if (record.expiresAt <= record.issuedAt) {
    throw new Error("expiresAt must be after issuedAt.");
  }
}

const COMPARABLE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function assertComparableTimestamp(value: string, fieldName: string): void {
  assertNonEmptyString(value, fieldName);

  if (!COMPARABLE_TIMESTAMP_PATTERN.test(value)) {
    throw new Error(
      `${fieldName} must be a fixed-width UTC ISO-8601 timestamp (YYYY-MM-DDTHH:mm:ss.sssZ) so expiry is lexicographically comparable.`,
    );
  }
}

function assertJsonString(value: string, fieldName: string): void {
  assertNonEmptyString(value, fieldName);

  try {
    JSON.parse(value) as unknown;
  } catch (cause) {
    throw new Error(
      `${fieldName} must be valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}
