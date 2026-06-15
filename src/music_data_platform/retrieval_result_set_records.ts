import type { SourceEntityKind } from "../contracts/index.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import type { MaterialCandidateKind } from "./material_candidate_ref.js";
import { assertMusicDataPlatformPublicRefKey } from "./ref_validation.js";

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
  }): RetrievalResultSetCleanupResult;
  cleanupExpiredMaterialCandidates(input: {
    now: string;
    limit?: number;
  }): MaterialCandidateCacheCleanupResult;
};

export type RetrievalResultSetRepository = {
  get(input: { resultSetId: string }): RetrievalResultSetRecord | undefined;
  insert(record: RetrievalResultSetRecord): RetrievalResultSetRecord;
};

export type RetrievalResultRowRepository = {
  insertMany(records: readonly RetrievalResultRowRecord[]): void;
  listForResultSet(input: { resultSetId: string }): readonly RetrievalResultRowRecord[];
};

export type RetrievalResultTextFtsRepository = {
  insertMany(records: readonly RetrievalResultTextFtsRecord[]): void;
};

export type MaterialCandidateCacheRepository = {
  getByRefKey(input: {
    materialCandidateRefKey: string;
  }): MaterialCandidateCacheRecord | undefined;
  upsert(record: MaterialCandidateCacheRecord): MaterialCandidateCacheRecord;
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
    get(readInput) {
      assertNonEmptyString(readInput.resultSetId, "resultSetId");

      const row = db.get<RetrievalResultSetRow>(
        `
          SELECT *
          FROM retrieval_result_sets
          WHERE result_set_id = ?
        `,
        [readInput.resultSetId],
      );

      return row === undefined ? undefined : retrievalResultSetFromRow(row);
    },
    insert(record) {
      assertRetrievalResultSetRecord(record);

      db.run(
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
        resultSets.get({ resultSetId: record.resultSetId }),
        "retrieval result set insert did not return a stored record",
      );
    },
  };

  const resultRows: RetrievalResultRowRepository = {
    // Single multi-row INSERT binds cols × rows params. The storage driver's bind-variable
    // ceiling is 32766, so this stays safe while each result-set window stays below ~2300 rows
    // (14-col rows table) or ~4000 rows (8-col fts table). Chunk if windows grow past that.
    insertMany(records) {
      if (records.length === 0) {
        return;
      }

      for (const record of records) {
        assertRetrievalResultRowRecord(record);
      }

      const valuesClause = records
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");

      db.run(
        `
          INSERT INTO retrieval_result_rows (
            result_set_id,
            row_kind,
            stable_ref_key,
            material_ref_key,
            material_candidate_ref_key,
            row_kind_sort,
            matched_token_count,
            best_field_priority,
            rank_sort_value,
            title_text,
            artist_text,
            album_text,
            version_text,
            alias_text
          )
          VALUES ${valuesClause}
        `,
        records.flatMap((record) => [
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
        ]),
      );
    },
    listForResultSet(readInput) {
      assertNonEmptyString(readInput.resultSetId, "resultSetId");

      return db.all<RetrievalResultRow>(
        `
          SELECT *
          FROM retrieval_result_rows
          WHERE result_set_id = ?
          ORDER BY row_kind_sort ASC, rank_sort_value ASC, stable_ref_key ASC
        `,
        [readInput.resultSetId],
      ).map(retrievalResultRowFromRow);
    },
  };

  const resultTextFts: RetrievalResultTextFtsRepository = {
    insertMany(records) {
      if (records.length === 0) {
        return;
      }

      for (const record of records) {
        assertRetrievalResultTextFtsRecord(record);
      }

      const valuesClause = records
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");

      db.run(
        `
          INSERT INTO retrieval_result_text_fts (
            result_set_id,
            row_kind,
            stable_ref_key,
            title_text,
            artist_text,
            album_text,
            version_text,
            alias_text
          )
          VALUES ${valuesClause}
        `,
        records.flatMap((record) => [
          record.resultSetId,
          record.rowKind,
          record.stableRefKey,
          record.titleText,
          record.artistText,
          record.albumText,
          record.versionText,
          record.aliasText,
        ]),
      );
    },
  };

  const materialCandidates: MaterialCandidateCacheRepository = {
    getByRefKey(readInput) {
      assertMaterialCandidateRefKey(readInput.materialCandidateRefKey);

      const row = db.get<MaterialCandidateCacheRow>(
        `
          SELECT *
          FROM material_candidate_cache
          WHERE material_candidate_ref_key = ?
        `,
        [readInput.materialCandidateRefKey],
      );

      return row === undefined ? undefined : materialCandidateCacheFromRow(row);
    },
    upsert(record) {
      assertMaterialCandidateCacheRecord(record);

      db.run(
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
            expires_at = excluded.expires_at
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
        materialCandidates.getByRefKey({
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
    cleanupExpiredRetrievalResultSets(cleanupInput) {
      const limit = validatedCleanupLimit(cleanupInput.limit);
      const expiredIds = db.all<{ result_set_id: string }>(
        `
          SELECT result_set_id
          FROM retrieval_result_sets
          WHERE expires_at <= ?
          ORDER BY expires_at ASC, result_set_id ASC
          LIMIT ?
        `,
        [cleanupInput.now, limit],
      ).map((row) => row.result_set_id);

      if (expiredIds.length === 0) {
        return {
          resultSetCount: 0,
          resultRowCount: 0,
          textFtsRowCount: 0,
        };
      }

      const placeholders = placeholdersFor(expiredIds);
      const textFtsRowCount = db.get<{ count: number }>(
        `
          SELECT COUNT(*) AS count
          FROM retrieval_result_text_fts
          WHERE result_set_id IN (${placeholders})
        `,
        expiredIds,
      )?.count ?? 0;
      const resultRowCount = db.get<{ count: number }>(
        `
          SELECT COUNT(*) AS count
          FROM retrieval_result_rows
          WHERE result_set_id IN (${placeholders})
        `,
        expiredIds,
      )?.count ?? 0;

      for (const table of [
        "retrieval_result_text_fts",
        "retrieval_result_rows",
        "retrieval_result_sets",
      ] as const) {
        db.run(
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
    cleanupExpiredMaterialCandidates(cleanupInput) {
      const limit = validatedCleanupLimit(cleanupInput.limit);
      const expiredKeys = db.all<{ material_candidate_ref_key: string }>(
        `
          SELECT c.material_candidate_ref_key
          FROM material_candidate_cache c
          WHERE c.expires_at <= ?
            AND NOT EXISTS (
              SELECT 1
              FROM retrieval_result_rows r
              JOIN retrieval_result_sets s
                ON s.result_set_id = r.result_set_id
              WHERE r.material_candidate_ref_key = c.material_candidate_ref_key
                AND s.expires_at > ?
            )
          ORDER BY c.expires_at ASC, c.material_candidate_ref_key ASC
          LIMIT ?
        `,
        [cleanupInput.now, cleanupInput.now, limit],
      ).map((row) => row.material_candidate_ref_key);

      if (expiredKeys.length === 0) {
        return { deletedCount: 0 };
      }

      db.run(
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

  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw invalidRetrievalResultSetRecord(
      "Retrieval result-set ttlMs must be a positive integer.",
    );
  }

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
  assertNonEmptyString(record.expiresAt, "expiresAt");
  assertNonEmptyString(record.createdAt, "createdAt");
}

function assertRetrievalResultRowRecord(record: RetrievalResultRowRecord): void {
  assertRetrievalResultTextFtsRecord(record);
  assertNonNegativeInteger(record.rowKindSort, "rowKindSort");
  assertNonNegativeInteger(record.matchedTokenCount, "matchedTokenCount");
  assertNonNegativeInteger(record.bestFieldPriority, "bestFieldPriority");

  if (!Number.isFinite(record.rankSortValue)) {
    throw invalidRetrievalResultSetRecord("rankSortValue must be finite.");
  }

  if (record.rowKind === "material") {
    assertPublicRefKey(record.materialRefKey, "materialRefKey");
    assertAbsent(record.materialCandidateRefKey, "materialCandidateRefKey");
    return;
  }

  if (record.rowKind === "material_candidate") {
    assertPublicRefKey(record.materialCandidateRefKey, "materialCandidateRefKey");
    assertAbsent(record.materialRefKey, "materialRefKey");
    return;
  }

  assertNeverRowKind(record.rowKind);
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

  assertNonEmptyString(record.expiresAt, "expiresAt");
  assertNonEmptyString(record.createdAt, "createdAt");
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

function assertMaterialCandidateRefKey(value: string): void {
  assertMusicDataPlatformPublicRefKey({
    refKey: value,
    fieldName: "materialCandidateRefKey",
    code: "music_data.retrieval_result_set_invalid",
  });
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

function placeholdersFor(values: readonly unknown[]): string {
  if (values.length === 0) {
    throw invalidRetrievalResultSetRecord("SQL placeholder list cannot be empty.");
  }

  return values.map(() => "?").join(", ");
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
