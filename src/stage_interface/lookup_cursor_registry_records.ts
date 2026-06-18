import type { MusicDatabaseContext } from "../storage/database.js";

export type StageInterfaceLookupCursorBindingRecord = {
  cursorId: string;
  ownerScope: string;
  internalCursorJson: string;
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
  }): StageInterfaceLookupCursorBindingRecord | undefined;
  createBinding(record: StageInterfaceLookupCursorBindingRecord): StageInterfaceLookupCursorBindingRecord;
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
    getByOwnerCursor(readInput) {
      assertNonEmptyString(readInput.cursorId, "cursorId");
      assertNonEmptyString(readInput.ownerScope, "ownerScope");

      const row = db.get<StageInterfaceLookupCursorBindingRow>(
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
    createBinding(record) {
      assertBindingRecord(record);

      db.run(
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
          record.internalCursorJson,
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

function bindingFromRow(row: StageInterfaceLookupCursorBindingRow): StageInterfaceLookupCursorBindingRecord {
  return {
    cursorId: row.cursor_id,
    ownerScope: row.owner_scope,
    internalCursorJson: row.internal_cursor_json,
    queryInputJson: row.query_input_json,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
  };
}

function assertBindingRecord(record: StageInterfaceLookupCursorBindingRecord): void {
  assertNonEmptyString(record.cursorId, "cursorId");
  assertNonEmptyString(record.ownerScope, "ownerScope");
  assertJsonString(record.internalCursorJson, "internalCursorJson");
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
