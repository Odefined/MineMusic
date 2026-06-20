import type { SourceEntityKind } from "../contracts/music_data_platform.js";
import type { MusicDatabaseContext, MusicDatabaseParameter } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import type { MaterialCandidateKind } from "./material_candidate_ref.js";
import { assertMusicDataPlatformPublicRefKey } from "./ref_validation.js";
import { assertComparableTimestamp } from "./timestamp_validation.js";

export const DEFAULT_RETRIEVAL_RESULT_SET_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_RETRIEVAL_RESULT_SET_CLEANUP_LIMIT = 500;

export type RetrievalResultRowKind =
  | "material"
  | "material_candidate";

export type RetrievalResultSetRecord = {
  resultSetId: string;
  queryFingerprint: string;
  localResultWindowLimit: number;
  localRowsInResultSet: number;
  localResultWindowHasMore: boolean;
  expiresAt: string;
  createdAt: string;
};

export type RetrievalResultTextFields = {
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
  aliasText: string;
};

export type RetrievalResultRowRecord = RetrievalResultTextFields & {
  resultSetId: string;
  rowKind: RetrievalResultRowKind;
  stableRefKey: string;
  materialRefKey?: string;
  materialCandidateRefKey?: string;
  rowKindSort: number;
  matchedTokenCount: number;
  bestFieldPriority: number;
  rankSortValue: number;
};

export type RetrievalResultTextFtsRecord = RetrievalResultTextFields & {
  resultSetId: string;
  rowKind: RetrievalResultRowKind;
  stableRefKey: string;
};

export type MaterialCandidateCacheRecord = {
  materialCandidateRefKey: string;
  providerId: string;
  sourceRefKey: string;
  providerEntityId: string;
  sourceKind: SourceEntityKind;
  materialCandidateKind: MaterialCandidateKind;
  validatedProviderCandidateJson: string;
  searchableFieldsJson: string;
  providerScore?: number;
  expiresAt: string;
  createdAt: string;
};

export type RetrievalResultSetCleanupResult = {
  resultSetCount: number;
  resultRowCount: number;
  textFtsRowCount: number;
};

export type MaterialCandidateCacheCleanupResult = {
  deletedCount: number;
};

export type CreateRetrievalResultSetRecordsInput = {
  db: MusicDatabaseContext;
};

export type RetrievalResultSetRecords = {
  resultSets: RetrievalResultSetRepository;
  resultRows: RetrievalResultRowRepository;
  resultTextFts: RetrievalResultTextFtsRepository;
  materialCandidates: MaterialCandidateCacheRepository;
  cleanupExpiredRetrievalResultSets(input: {
    now: string;
    limit?: number;
  }): Promise<RetrievalResultSetCleanupResult>;
  cleanupExpiredMaterialCandidates(input: {
    now: string;
    limit?: number;
  }): Promise<MaterialCandidateCacheCleanupResult>;
};

export type RetrievalResultSetRepository = {
  get(input: { resultSetId: string }): Promise<RetrievalResultSetRecord | undefined>;
  insert(record: RetrievalResultSetRecord): Promise<RetrievalResultSetRecord>;
};

export type RetrievalResultRowRepository = {
  insertMany(records: readonly RetrievalResultRowRecord[]): Promise<void>;
  listForResultSet(input: { resultSetId: string }): Promise<readonly RetrievalResultRowRecord[]>;
};

export type RetrievalResultTextFtsRepository = {
  insertMany(records: readonly RetrievalResultTextFtsRecord[]): Promise<void>;
};

export type MaterialCandidateCacheRepository = {
  getByRefKey(input: {
    materialCandidateRefKey: string;
  }): Promise<MaterialCandidateCacheRecord | undefined>;
  upsert(record: MaterialCandidateCacheRecord): Promise<MaterialCandidateCacheRecord>;
};

type RetrievalResultSetRow = {
  result_set_id: string;
  query_fingerprint: string;
  local_result_window_limit: number;
  local_rows_in_result_set: number;
  local_result_window_has_more: number;
  expires_at: string;
  created_at: string;
};

type RetrievalResultRow = {
  result_set_id: string;
  row_kind: RetrievalResultRowKind;
  stable_ref_key: string;
  material_ref_key: string | null;
  material_candidate_ref_key: string | null;
  row_kind_sort: number;
  matched_token_count: number;
  best_field_priority: number;
  rank_sort_value: number;
  title_text: string;
  artist_text: string;
  album_text: string;
  version_text: string;
  alias_text: string;
};

type MaterialCandidateCacheRow = {
  material_candidate_ref_key: string;
  provider_id: string;
  source_ref_key: string;
  provider_entity_id: string;
  source_kind: SourceEntityKind;
  material_candidate_kind: MaterialCandidateKind;
  validated_provider_candidate_json: string;
  searchable_fields_json: string;
  provider_score: number | null;
  expires_at: string;
  created_at: string;
};

export function createRetrievalResultSetRecords(
  input: CreateRetrievalResultSetRecordsInput,
): RetrievalResultSetRecords {
  const { db } = input;

  const resultSets: RetrievalResultSetRepository = {
    async get(readInput) {
      assertNonEmptyString(readInput.resultSetId, "resultSetId");

      const row = await db.get<RetrievalResultSetRow>(
        `
          SELECT *
          FROM retrieval_result_sets
          WHERE result_set_id = ?
        `,
        [readInput.resultSetId],
      );

      return row === undefined ? undefined : retrievalResultSetFromRow(row);
    },
    async insert(record) {
      assertRetrievalResultSetRecord(record);

      await db.run(
        `
          INSERT INTO retrieval_result_sets (
            result_set_id,
            query_fingerprint,
            local_result_window_limit,
            local_rows_in_result_set,
            local_result_window_has_more,
            expires_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          record.resultSetId,
          record.queryFingerprint,
          record.localResultWindowLimit,
          record.localRowsInResultSet,
          record.localResultWindowHasMore ? 1 : 0,
          record.expiresAt,
          record.createdAt,
        ],
      );

      return requireRecord(
        await resultSets.get({ resultSetId: record.resultSetId }),
        "retrieval result set insert did not return a stored record",
      );
    },
  };

  const resultRows: RetrievalResultRowRepository = {
    async insertMany(records) {
      for (const record of records) {
        assertRetrievalResultRowRecord(record);
      }

      await multiRowInsert({
        db,
        table: "retrieval_result_rows",
        columns: [
          "result_set_id",
          "row_kind",
          "stable_ref_key",
          "material_ref_key",
          "material_candidate_ref_key",
          "row_kind_sort",
          "matched_token_count",
          "best_field_priority",
          "rank_sort_value",
          "title_text",
          "artist_text",
          "album_text",
          "version_text",
          "alias_text",
        ],
        records,
        paramsFor: (record) => [
          record.resultSetId,
          record.rowKind,
          record.stableRefKey,
          record.materialRefKey ?? null,
          record.materialCandidateRefKey ?? null,
          record.rowKindSort,
          record.matchedTokenCount,
          record.bestFieldPriority,
          record.rankSortValue,
          record.titleText,
          record.artistText,
          record.albumText,
          record.versionText,
          record.aliasText,
        ],
      });
    },
    async listForResultSet(readInput) {
      assertNonEmptyString(readInput.resultSetId, "resultSetId");

      return (await db.all<RetrievalResultRow>(
        `
          SELECT *
          FROM retrieval_result_rows
          WHERE result_set_id = ?
          ORDER BY matched_token_count DESC, best_field_priority ASC, rank_sort_value ASC, row_kind_sort ASC, stable_ref_key ASC
        `,
        [readInput.resultSetId],
      )).map(retrievalResultRowFromRow);
    },
  };

  const resultTextFts: RetrievalResultTextFtsRepository = {
    async insertMany(records) {
      for (const record of records) {
        assertRetrievalResultTextFtsRecord(record);
      }

      await multiRowInsert({
        db,
        table: "retrieval_result_text_fts",
        columns: [
          "result_set_id",
          "row_kind",
          "stable_ref_key",
          "title_text",
          "artist_text",
          "album_text",
          "version_text",
          "alias_text",
        ],
        records,
        paramsFor: (record) => [
          record.resultSetId,
          record.rowKind,
          record.stableRefKey,
          record.titleText,
          record.artistText,
          record.albumText,
          record.versionText,
          record.aliasText,
        ],
      });

      const resultSetIds = unique(records.map((record) => record.resultSetId));
      for (const resultSetId of resultSetIds) {
        await db.run(
          `
            UPDATE retrieval_result_text_fts
            SET search_vector = to_tsvector(
              'simple',
              concat_ws(' ', title_text, artist_text, album_text, version_text, alias_text)
            )
            WHERE result_set_id = ?
          `,
          [resultSetId],
        );
      }
    },
  };

  const materialCandidates: MaterialCandidateCacheRepository = {
    async getByRefKey(readInput) {
      assertMaterialCandidateRefKey(readInput.materialCandidateRefKey);

      const row = await db.get<MaterialCandidateCacheRow>(
        `
          SELECT *
          FROM material_candidate_cache
          WHERE material_candidate_ref_key = ?
        `,
        [readInput.materialCandidateRefKey],
      );

      return row === undefined ? undefined : materialCandidateCacheFromRow(row);
    },
    async upsert(record) {
      assertMaterialCandidateCacheRecord(record);

      await db.run(
        `
          INSERT INTO material_candidate_cache (
            material_candidate_ref_key,
            provider_id,
            source_ref_key,
            provider_entity_id,
            source_kind,
            material_candidate_kind,
            validated_provider_candidate_json,
            searchable_fields_json,
            provider_score,
            expires_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(material_candidate_ref_key) DO UPDATE SET
            provider_id = excluded.provider_id,
            source_ref_key = excluded.source_ref_key,
            provider_entity_id = excluded.provider_entity_id,
            source_kind = excluded.source_kind,
            material_candidate_kind = excluded.material_candidate_kind,
            validated_provider_candidate_json = excluded.validated_provider_candidate_json,
            searchable_fields_json = excluded.searchable_fields_json,
            provider_score = excluded.provider_score,
            expires_at = CASE
              WHEN excluded.expires_at > material_candidate_cache.expires_at
              THEN excluded.expires_at
              ELSE material_candidate_cache.expires_at
            END
        `,
        [
          record.materialCandidateRefKey,
          record.providerId,
          record.sourceRefKey,
          record.providerEntityId,
          record.sourceKind,
          record.materialCandidateKind,
          record.validatedProviderCandidateJson,
          record.searchableFieldsJson,
          record.providerScore ?? null,
          record.expiresAt,
          record.createdAt,
        ],
      );

      return requireRecord(
        await materialCandidates.getByRefKey({
          materialCandidateRefKey: record.materialCandidateRefKey,
        }),
        "material candidate cache upsert did not return a stored record",
      );
    },
  };

  return {
    resultSets,
    resultRows,
    resultTextFts,
    materialCandidates,
    async cleanupExpiredRetrievalResultSets(cleanupInput) {
      assertComparableTimestamp(
        cleanupInput.now,
        "now",
        "music_data.retrieval_result_set_invalid",
      );
      const limit = validatedCleanupLimit(cleanupInput.limit);
      const expiredIds = (await db.all<{ result_set_id: string }>(
        `
          SELECT result_set_id
          FROM retrieval_result_sets
          WHERE expires_at <= ?
          ORDER BY expires_at ASC, result_set_id ASC
          LIMIT ?
        `,
        [cleanupInput.now, limit],
      )).map((row) => row.result_set_id);

      if (expiredIds.length === 0) {
        return {
          resultSetCount: 0,
          resultRowCount: 0,
          textFtsRowCount: 0,
        };
      }

      const placeholders = placeholdersFor(expiredIds);
      const textFtsRowCount = Number((await db.get<{ count: number | string }>(
        `
          SELECT COUNT(*) AS count
          FROM retrieval_result_text_fts
          WHERE result_set_id IN (${placeholders})
        `,
        expiredIds,
      ))?.count ?? 0);
      const resultRowCount = Number((await db.get<{ count: number | string }>(
        `
          SELECT COUNT(*) AS count
          FROM retrieval_result_rows
          WHERE result_set_id IN (${placeholders})
        `,
        expiredIds,
      ))?.count ?? 0);

      for (const table of [
        "retrieval_result_text_fts",
        "retrieval_result_rows",
        "retrieval_result_sets",
      ] as const) {
        await db.run(
          `
            DELETE FROM ${table}
            WHERE result_set_id IN (${placeholders})
          `,
          expiredIds,
        );
      }

      return {
        resultSetCount: expiredIds.length,
        resultRowCount,
        textFtsRowCount,
      };
    },
    async cleanupExpiredMaterialCandidates(cleanupInput) {
      assertComparableTimestamp(
        cleanupInput.now,
        "now",
        "music_data.retrieval_result_set_invalid",
      );
      const limit = validatedCleanupLimit(cleanupInput.limit);
      // Candidate cache expiry is authoritative: the upsert keeps the MAX
      // expires_at across every referencing result set, so an expired cache row
      // is no longer pinned by any live result set and can be deleted. Read
      // paths already surface "material_candidate_expired" for expired rows, so
      // deleting the row changes nothing user-visible.
      const expiredKeys = (await db.all<{ material_candidate_ref_key: string }>(
        `
          SELECT material_candidate_ref_key
          FROM material_candidate_cache
          WHERE expires_at <= ?
          ORDER BY expires_at ASC, material_candidate_ref_key ASC
          LIMIT ?
        `,
        [cleanupInput.now, limit],
      )).map((row) => row.material_candidate_ref_key);

      if (expiredKeys.length === 0) {
        return { deletedCount: 0 };
      }

      await db.run(
        `
          DELETE FROM material_candidate_cache
          WHERE material_candidate_ref_key IN (${placeholdersFor(expiredKeys)})
        `,
        expiredKeys,
      );

      return { deletedCount: expiredKeys.length };
    },
  };
}

export function expiresAtFromResultSetCreatedAt(input: {
  createdAt: string;
  ttlMs?: number;
}): string {
  const ttlMs = input.ttlMs ?? DEFAULT_RETRIEVAL_RESULT_SET_TTL_MS;
  assertPositiveInteger(ttlMs, "ttlMs");
  assertComparableTimestamp(
    input.createdAt,
    "createdAt",
    "music_data.retrieval_result_set_invalid",
  );

  return new Date(Date.parse(input.createdAt) + ttlMs).toISOString();
}

function retrievalResultSetFromRow(row: RetrievalResultSetRow): RetrievalResultSetRecord {
  return {
    resultSetId: row.result_set_id,
    queryFingerprint: row.query_fingerprint,
    localResultWindowLimit: row.local_result_window_limit,
    localRowsInResultSet: row.local_rows_in_result_set,
    localResultWindowHasMore: row.local_result_window_has_more === 1,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function retrievalResultRowFromRow(row: RetrievalResultRow): RetrievalResultRowRecord {
  return {
    resultSetId: row.result_set_id,
    rowKind: row.row_kind,
    stableRefKey: row.stable_ref_key,
    ...(row.material_ref_key === null ? {} : { materialRefKey: row.material_ref_key }),
    ...(row.material_candidate_ref_key === null
      ? {}
      : { materialCandidateRefKey: row.material_candidate_ref_key }),
    rowKindSort: row.row_kind_sort,
    matchedTokenCount: row.matched_token_count,
    bestFieldPriority: row.best_field_priority,
    rankSortValue: row.rank_sort_value,
    titleText: row.title_text,
    artistText: row.artist_text,
    albumText: row.album_text,
    versionText: row.version_text,
    aliasText: row.alias_text,
  };
}

function materialCandidateCacheFromRow(
  row: MaterialCandidateCacheRow,
): MaterialCandidateCacheRecord {
  return {
    materialCandidateRefKey: row.material_candidate_ref_key,
    providerId: row.provider_id,
    sourceRefKey: row.source_ref_key,
    providerEntityId: row.provider_entity_id,
    sourceKind: row.source_kind,
    materialCandidateKind: row.material_candidate_kind,
    validatedProviderCandidateJson: row.validated_provider_candidate_json,
    searchableFieldsJson: row.searchable_fields_json,
    ...(row.provider_score === null ? {} : { providerScore: row.provider_score }),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function assertRetrievalResultSetRecord(record: RetrievalResultSetRecord): void {
  assertNonEmptyString(record.resultSetId, "resultSetId");
  assertNonEmptyString(record.queryFingerprint, "queryFingerprint");
  assertPositiveInteger(record.localResultWindowLimit, "localResultWindowLimit");
  assertNonNegativeInteger(record.localRowsInResultSet, "localRowsInResultSet");
  assertComparableTimestamp(record.expiresAt, "expiresAt", "music_data.retrieval_result_set_invalid");
  assertComparableTimestamp(record.createdAt, "createdAt", "music_data.retrieval_result_set_invalid");
  assertExpiresAfterCreated(record.expiresAt, record.createdAt);
}

function assertRetrievalResultRowRecord(record: RetrievalResultRowRecord): void {
  assertRetrievalResultTextFtsRecord(record);
  assertNonNegativeInteger(record.matchedTokenCount, "matchedTokenCount");
  assertNonNegativeInteger(record.bestFieldPriority, "bestFieldPriority");

  if (!Number.isFinite(record.rankSortValue)) {
    throw invalidRetrievalResultSetRecord("rankSortValue must be finite.");
  }

  if (record.rowKind === "material") {
    assertMaterialRowInvariants(record);
    return;
  }

  if (record.rowKind === "material_candidate") {
    assertMaterialCandidateRowInvariants(record);
    return;
  }

  assertNeverRowKind(record.rowKind);
}

function assertMaterialRowInvariants(record: RetrievalResultRowRecord): void {
  if (record.rowKindSort !== 0) {
    throw invalidRetrievalResultSetRecord("material row rowKindSort must be 0.");
  }

  assertAbsent(record.materialCandidateRefKey, "materialCandidateRefKey");

  const materialRefKey = record.materialRefKey;
  if (materialRefKey === undefined) {
    throw invalidRetrievalResultSetRecord("materialRefKey is required.");
  }

  assertPublicRefKey(materialRefKey, "materialRefKey");

  if (record.stableRefKey !== materialRefKey) {
    throw invalidRetrievalResultSetRecord(
      "material row stableRefKey must equal materialRefKey.",
    );
  }
}

function assertMaterialCandidateRowInvariants(record: RetrievalResultRowRecord): void {
  if (record.rowKindSort !== 1) {
    throw invalidRetrievalResultSetRecord("material_candidate row rowKindSort must be 1.");
  }

  assertAbsent(record.materialRefKey, "materialRefKey");

  const materialCandidateRefKey = record.materialCandidateRefKey;
  if (materialCandidateRefKey === undefined) {
    throw invalidRetrievalResultSetRecord("materialCandidateRefKey is required.");
  }

  assertMaterialCandidateRefKey(materialCandidateRefKey);

  if (record.stableRefKey !== materialCandidateRefKey) {
    throw invalidRetrievalResultSetRecord(
      "material_candidate row stableRefKey must equal materialCandidateRefKey.",
    );
  }
}

function assertRetrievalResultTextFtsRecord(record: RetrievalResultTextFtsRecord): void {
  assertNonEmptyString(record.resultSetId, "resultSetId");
  assertRetrievalResultRowKind(record.rowKind);
  assertNonEmptyString(record.stableRefKey, "stableRefKey");
  assertString(record.titleText, "titleText");
  assertString(record.artistText, "artistText");
  assertString(record.albumText, "albumText");
  assertString(record.versionText, "versionText");
  assertString(record.aliasText, "aliasText");
}

function assertMaterialCandidateCacheRecord(record: MaterialCandidateCacheRecord): void {
  assertMaterialCandidateRefKey(record.materialCandidateRefKey);
  assertNonEmptyString(record.providerId, "providerId");
  assertPublicRefKey(record.sourceRefKey, "sourceRefKey");
  assertNonEmptyString(record.providerEntityId, "providerEntityId");
  assertSourceKind(record.sourceKind);

  if (record.materialCandidateKind !== "provider_candidate") {
    throw invalidRetrievalResultSetRecord(
      "materialCandidateKind must be provider_candidate.",
    );
  }

  assertNonEmptyJsonString(
    record.validatedProviderCandidateJson,
    "validatedProviderCandidateJson",
  );
  assertNonEmptyJsonString(record.searchableFieldsJson, "searchableFieldsJson");

  if (record.providerScore !== undefined && !Number.isFinite(record.providerScore)) {
    throw invalidRetrievalResultSetRecord("providerScore must be finite when present.");
  }

  assertComparableTimestamp(record.expiresAt, "expiresAt", "music_data.retrieval_result_set_invalid");
  assertComparableTimestamp(record.createdAt, "createdAt", "music_data.retrieval_result_set_invalid");
  assertExpiresAfterCreated(record.expiresAt, record.createdAt);
}

function assertRetrievalResultRowKind(
  value: string,
): asserts value is RetrievalResultRowKind {
  if (value !== "material" && value !== "material_candidate") {
    throw invalidRetrievalResultSetRecord(
      "Retrieval result row kind must be material or material_candidate.",
    );
  }
}

function assertSourceKind(value: string): asserts value is SourceEntityKind {
  if (value !== "track" && value !== "album" && value !== "artist") {
    throw invalidRetrievalResultSetRecord(
      "Material candidate source kind must be track, album, or artist.",
    );
  }
}

const MATERIAL_CANDIDATE_REF_KEY_PREFIX = "material_candidate:provider_candidate:mc_";

function assertMaterialCandidateRefKey(value: string): void {
  assertMusicDataPlatformPublicRefKey({
    refKey: value,
    fieldName: "materialCandidateRefKey",
    code: "music_data.retrieval_result_set_invalid",
  });

  if (!value.startsWith(MATERIAL_CANDIDATE_REF_KEY_PREFIX)) {
    throw invalidRetrievalResultSetRecord(
      "materialCandidateRefKey must be a provider candidate ref key (material_candidate:provider_candidate:mc_).",
    );
  }
}

function assertPublicRefKey(value: string | undefined, fieldName: string): void {
  if (value === undefined) {
    throw invalidRetrievalResultSetRecord(`${fieldName} is required.`);
  }

  assertMusicDataPlatformPublicRefKey({
    refKey: value,
    fieldName,
    code: "music_data.retrieval_result_set_invalid",
  });
}

function assertAbsent(value: string | undefined, fieldName: string): void {
  if (value !== undefined) {
    throw invalidRetrievalResultSetRecord(`${fieldName} must be absent.`);
  }
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw invalidRetrievalResultSetRecord(`${fieldName} must be a non-empty string.`);
  }
}

function assertString(value: string, fieldName: string): void {
  if (typeof value !== "string") {
    throw invalidRetrievalResultSetRecord(`${fieldName} must be a string.`);
  }
}

function assertNonEmptyJsonString(value: string, fieldName: string): void {
  assertNonEmptyString(value, fieldName);
  try {
    JSON.parse(value) as unknown;
  } catch (cause) {
    throw new MusicDataPlatformError({
      code: "music_data.retrieval_result_set_invalid",
      message: `${fieldName} must contain JSON.`,
      cause,
    });
  }
}

function assertExpiresAfterCreated(expiresAt: string, createdAt: string): void {
  if (expiresAt <= createdAt) {
    throw invalidRetrievalResultSetRecord("expiresAt must be later than createdAt.");
  }
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw invalidRetrievalResultSetRecord(`${fieldName} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw invalidRetrievalResultSetRecord(`${fieldName} must be a non-negative integer.`);
  }
}

function validatedCleanupLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_RETRIEVAL_RESULT_SET_CLEANUP_LIMIT;
  assertPositiveInteger(value, "cleanup limit");
  return value;
}

const POSTGRES_MAX_PARAMETER_NUMBER = 65535;

async function multiRowInsert<TRecord>(args: {
  db: MusicDatabaseContext;
  table: string;
  columns: readonly string[];
  records: readonly TRecord[];
  paramsFor: (record: TRecord) => readonly MusicDatabaseParameter[];
}): Promise<void> {
  const { db, table, columns, records, paramsFor } = args;

  if (records.length === 0) {
    return;
  }

  const columnList = columns.join(", ");
  const group = `(${columns.map(() => "?").join(", ")})`;
  const chunkSize = Math.max(1, Math.floor(POSTGRES_MAX_PARAMETER_NUMBER / columns.length));

  for (let offset = 0; offset < records.length; offset += chunkSize) {
    const chunk = records.slice(offset, offset + chunkSize);
    await db.run(
      `INSERT INTO ${table} (${columnList}) VALUES ${chunk.map(() => group).join(", ")}`,
      chunk.flatMap(paramsFor),
    );
  }
}

function placeholdersFor(values: readonly unknown[]): string {
  if (values.length === 0) {
    throw invalidRetrievalResultSetRecord("SQL placeholder list cannot be empty.");
  }

  return values.map(() => "?").join(", ");
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function requireRecord<Record>(record: Record | undefined, message: string): Record {
  if (record === undefined) {
    throw invalidRetrievalResultSetRecord(message);
  }

  return record;
}

function assertNeverRowKind(value: never): never {
  throw invalidRetrievalResultSetRecord(`Unsupported retrieval result row kind '${value}'.`);
}

function invalidRetrievalResultSetRecord(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.retrieval_result_set_invalid",
    message,
  });
}
