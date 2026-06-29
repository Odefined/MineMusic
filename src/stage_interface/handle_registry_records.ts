import type { MusicDatabaseContext } from "../storage/database.js";

export type StageInterfaceHandleKind = "material" | "candidate";

export type StageInterfaceHandleBindingRecord = {
  publicId: string;
  ownerScope: string;
  handleKind: StageInterfaceHandleKind;
  internalAnchorJson: string;
  issuedAt: string;
  expiresAt?: string;
};

export type CreateStageInterfaceHandleRegistryRecordsInput = {
  db: MusicDatabaseContext;
};

export type StageInterfaceHandleRegistryRecords = {
  bindings: StageInterfaceHandleBindingRepository;
};

export type StageInterfaceHandleBindingRepository = {
  getByPublicId(input: {
    publicId: string;
  }): Promise<StageInterfaceHandleBindingRecord | undefined>;
  getByOwnerPublicId(input: {
    publicId: string;
    ownerScope: string;
    handleKind: StageInterfaceHandleKind;
  }): Promise<StageInterfaceHandleBindingRecord | undefined>;
  getByOwnerAnchor(input: {
    ownerScope: string;
    handleKind: StageInterfaceHandleKind;
    internalAnchorJson: string;
  }): Promise<StageInterfaceHandleBindingRecord | undefined>;
  listByOwnerAnchors(input: {
    ownerScope: string;
    handleKind: StageInterfaceHandleKind;
    internalAnchorJsons: readonly string[];
  }): Promise<readonly StageInterfaceHandleBindingRecord[]>;
  createBinding(record: StageInterfaceHandleBindingRecord): Promise<StageInterfaceHandleBindingRecord>;
  createBindings(records: readonly StageInterfaceHandleBindingRecord[]): Promise<readonly StageInterfaceHandleBindingRecord[]>;
};

type StageInterfaceHandleBindingRow = {
  public_id: string;
  owner_scope: string;
  handle_kind: StageInterfaceHandleKind;
  internal_anchor_json: string;
  issued_at: string;
  expires_at: string | null;
};

export function createStageInterfaceHandleRegistryRecords(
  input: CreateStageInterfaceHandleRegistryRecordsInput,
): StageInterfaceHandleRegistryRecords {
  const { db } = input;

  const bindings: StageInterfaceHandleBindingRepository = {
    async getByPublicId(readInput) {
      assertNonEmptyString(readInput.publicId, "publicId");

      const row = await db.get<StageInterfaceHandleBindingRow>(
        `
          SELECT *
          FROM stage_interface_handle_registry
          WHERE public_id = ?
        `,
        [readInput.publicId],
      );

      return row === undefined ? undefined : bindingFromRow(row);
    },
    async getByOwnerPublicId(readInput) {
      assertNonEmptyString(readInput.publicId, "publicId");
      assertNonEmptyString(readInput.ownerScope, "ownerScope");
      assertHandleKind(readInput.handleKind);

      const row = await db.get<StageInterfaceHandleBindingRow>(
        `
          SELECT *
          FROM stage_interface_handle_registry
          WHERE public_id = ?
            AND owner_scope = ?
            AND handle_kind = ?
        `,
        [readInput.publicId, readInput.ownerScope, readInput.handleKind],
      );

      return row === undefined ? undefined : bindingFromRow(row);
    },
    async getByOwnerAnchor(readInput) {
      assertNonEmptyString(readInput.ownerScope, "ownerScope");
      assertHandleKind(readInput.handleKind);
      assertJsonString(readInput.internalAnchorJson);

      const row = await db.get<StageInterfaceHandleBindingRow>(
        `
          SELECT *
          FROM stage_interface_handle_registry
          WHERE owner_scope = ?
            AND handle_kind = ?
            AND internal_anchor_json = ?
        `,
        [readInput.ownerScope, readInput.handleKind, readInput.internalAnchorJson],
      );

      return row === undefined ? undefined : bindingFromRow(row);
    },
    async listByOwnerAnchors(readInput) {
      assertNonEmptyString(readInput.ownerScope, "ownerScope");
      assertHandleKind(readInput.handleKind);
      for (const internalAnchorJson of readInput.internalAnchorJsons) {
        assertJsonString(internalAnchorJson);
      }
      if (readInput.internalAnchorJsons.length === 0) {
        return [];
      }

      const rows = await db.all<StageInterfaceHandleBindingRow>(
        `
          SELECT *
          FROM stage_interface_handle_registry
          WHERE owner_scope = ?
            AND handle_kind = ?
            AND internal_anchor_json IN (${placeholders(readInput.internalAnchorJsons.length)})
        `,
        [readInput.ownerScope, readInput.handleKind, ...readInput.internalAnchorJsons],
      );

      return rows.map(bindingFromRow);
    },
    async createBinding(record) {
      assertBindingRecord(record);

      await db.run(
        `
          INSERT INTO stage_interface_handle_registry (
            public_id,
            owner_scope,
            handle_kind,
            internal_anchor_json,
            issued_at,
            expires_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(owner_scope, handle_kind, internal_anchor_json) DO UPDATE SET
            public_id = excluded.public_id,
            issued_at = excluded.issued_at,
            expires_at = excluded.expires_at
        `,
        [
          record.publicId,
          record.ownerScope,
          record.handleKind,
          record.internalAnchorJson,
          record.issuedAt,
          record.expiresAt ?? null,
        ],
      );

      return record;
    },
    async createBindings(records) {
      for (const record of records) {
        assertBindingRecord(record);
      }
      if (records.length === 0) {
        return [];
      }

      await db.run(
        `
          INSERT INTO stage_interface_handle_registry (
            public_id,
            owner_scope,
            handle_kind,
            internal_anchor_json,
            issued_at,
            expires_at
          )
          VALUES ${records.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}
          ON CONFLICT(owner_scope, handle_kind, internal_anchor_json) DO UPDATE SET
            public_id = excluded.public_id,
            issued_at = excluded.issued_at,
            expires_at = excluded.expires_at
        `,
        records.flatMap((record) => [
          record.publicId,
          record.ownerScope,
          record.handleKind,
          record.internalAnchorJson,
          record.issuedAt,
          record.expiresAt ?? null,
        ]),
      );

      return records;
    },
  };

  return { bindings };
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function bindingFromRow(row: StageInterfaceHandleBindingRow): StageInterfaceHandleBindingRecord {
  return {
    publicId: row.public_id,
    ownerScope: row.owner_scope,
    handleKind: row.handle_kind,
    internalAnchorJson: row.internal_anchor_json,
    issuedAt: row.issued_at,
    ...(row.expires_at === null ? {} : { expiresAt: row.expires_at }),
  };
}

function assertBindingRecord(record: StageInterfaceHandleBindingRecord): void {
  assertNonEmptyString(record.publicId, "publicId");
  assertNonEmptyString(record.ownerScope, "ownerScope");
  assertHandleKind(record.handleKind);
  assertJsonString(record.internalAnchorJson);
  assertComparableTimestamp(record.issuedAt, "issuedAt");

  if (record.expiresAt !== undefined) {
    assertComparableTimestamp(record.expiresAt, "expiresAt");

    if (record.expiresAt <= record.issuedAt) {
      throw new Error("expiresAt must be after issuedAt.");
    }
  }
}

function assertHandleKind(handleKind: StageInterfaceHandleKind): void {
  if (handleKind !== "material" && handleKind !== "candidate") {
    throw new Error("handleKind must be 'material' or 'candidate'.");
  }
}

function assertJsonString(value: string): void {
  assertNonEmptyString(value, "internalAnchorJson");

  try {
    JSON.parse(value) as unknown;
  } catch (cause) {
    throw new Error(
      `internalAnchorJson must be valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
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

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}
