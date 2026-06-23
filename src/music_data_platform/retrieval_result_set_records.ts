import type { SourceEntityKind } from "../contracts/music_data_platform.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import type { MaterialCandidateKind } from "./material_candidate_ref.js";
import { assertMusicDataPlatformPublicRefKey } from "./ref_validation.js";
import { assertComparableTimestamp } from "./timestamp_validation.js";

export const DEFAULT_RETRIEVAL_RESULT_SET_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_RETRIEVAL_RESULT_SET_CLEANUP_LIMIT = 500;

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

export type MaterialCandidateCacheCleanupResult = {
  deletedCount: number;
};

export type CreateRetrievalResultSetRecordsInput = {
  db: MusicDatabaseContext;
};

export type RetrievalResultSetRecords = {
  materialCandidates: MaterialCandidateCacheRepository;
  cleanupExpiredMaterialCandidates(input: {
    now: string;
    limit?: number;
  }): Promise<MaterialCandidateCacheCleanupResult>;
};

export type MaterialCandidateCacheRepository = {
  getByRefKey(input: {
    materialCandidateRefKey: string;
  }): Promise<MaterialCandidateCacheRecord | undefined>;
  upsert(record: MaterialCandidateCacheRecord): Promise<MaterialCandidateCacheRecord>;
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
    materialCandidates,
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
      const row = await db.get<{ deleted_count: number | string }>(
        `
          WITH expired AS (
            SELECT material_candidate_ref_key
            FROM material_candidate_cache
            WHERE expires_at <= ?
            ORDER BY expires_at ASC, material_candidate_ref_key ASC
            LIMIT ?
          ),
          deleted AS (
            DELETE FROM material_candidate_cache c
            USING expired e
            WHERE c.material_candidate_ref_key = e.material_candidate_ref_key
            RETURNING 1
          )
          SELECT COUNT(*) AS deleted_count
          FROM deleted
        `,
        [cleanupInput.now, limit],
      );

      return { deletedCount: Number(row?.deleted_count ?? 0) };
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

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw invalidRetrievalResultSetRecord(`${fieldName} must be a non-empty string.`);
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

function validatedCleanupLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_RETRIEVAL_RESULT_SET_CLEANUP_LIMIT;
  assertPositiveInteger(value, "cleanup limit");
  return value;
}

function requireRecord<Record>(record: Record | undefined, message: string): Record {
  if (record === undefined) {
    throw invalidRetrievalResultSetRecord(message);
  }

  return record;
}

function invalidRetrievalResultSetRecord(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.retrieval_result_set_invalid",
    message,
  });
}
