import { randomUUID } from "node:crypto";

import { parseRefKey, refKey, type Ref } from "../contracts/kernel.js";
import type { MaterialEntityKind, PlatformLibraryKind, ProviderMaterialCandidate, SourceEntity, VersionInfo } from "../contracts/music_data_platform.js";
import type {
  MusicDatabase,
  MusicDatabaseContext,
  MusicDatabaseParameter,
} from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef, materialKindForSourceKind } from "./material_ref.js";
import {
  buildMaterialTextFieldState,
  buildMaterialTextPrefixQueryTokens,
  normalizeMaterialTextValue,
  type MaterialTextContribution,
} from "./material_text_normalization.js";
import {
  createProviderMaterialCandidateRef,
  providerMaterialCandidateRefKey,
} from "./material_candidate_ref.js";
import {
  assertOwnerRelationPoolRef,
  createOwnerRelationPoolRef,
  type OwnerRelationEntryKind,
} from "./owner_material_relation_ref.js";
import {
  assertOwnerScope,
  DEFAULT_OWNER_SCOPE,
} from "./owner_scope.js";
import { assertMusicDataPlatformPublicRefKey } from "./ref_validation.js";
import {
  requiredFieldPriority,
  requiredFiniteNumber,
  requiredPositiveInteger,
  sqlPlaceholders,
  type RetrievalMatchedTextTokenEvidence,
  type RetrievalReadPoolFilter,
} from "./retrieval_shared.js";
import {
  type RetrievalTextField,
  sqlStringLiteral,
  retrievalTextFieldConfigs,
  matchedTokenCountSqlExpression,
  bestFieldPrioritySqlExpression,
  ftsRankSortValueSqlExpression,
  ftsSearchConditionSql,
  prefixTsQueryForTokens,
} from "./material_text_ranking.js";
import {
  createRetrievalResultSetRecords,
  expiresAtFromResultSetCreatedAt,
  type RetrievalResultRowKind,
  type RetrievalResultRowRecord,
  type RetrievalResultTextFields,
  type RetrievalResultTextFtsRecord,
} from "./retrieval_result_set_records.js";
import {
  assertSourceLibraryRef,
  createSourceLibraryRef,
} from "./source_library_ref.js";
import { assertComparableTimestamp } from "./timestamp_validation.js";

export type MixedRetrievalCursorPosition = {
  order: "text_relevance";
  matchedTokenCount: number;
  bestFieldPriority: number;
  rankSortValue: number;
  rowKind: "material" | "material_candidate";
  stableRefKey: string;
};

export type MusicDataPlatformMixedRetrievalSearchInput = {
  ownerScope: string;
  text: string;
  materialKind?: MaterialEntityKind;
  durablePoolFilter?: RetrievalReadPoolFilter;
  includeLocalCatalog: boolean;
  order: "text_relevance";
  limit: number;
  queryFingerprint: string;
  providerCandidates?: readonly ProviderMaterialCandidate[];
  cursor?: {
    resultSetId: string;
    position: MixedRetrievalCursorPosition;
  };
  now?: string;
  ttlMs?: number;
};

export type MusicDataPlatformMixedRetrievalPage =
  | {
      status: "ok";
      resultSetId: string;
      rows: readonly MusicDataPlatformMixedRetrievalRow[];
      nextCursorPosition?: MixedRetrievalCursorPosition;
    }
  | {
      status: "result_set_expired";
    }
  | {
      status: "material_candidate_expired";
    }
  | {
      status: "query_fingerprint_mismatch";
    };

export type MusicDataPlatformMixedRetrievalRow =
  | MusicDataPlatformMixedRetrievalMaterialRow
  | MusicDataPlatformMixedRetrievalMaterialCandidateRow;

export type MusicDataPlatformMixedRetrievalMaterialRow =
  MusicDataPlatformMixedRetrievalRowBase & {
    kind: "material";
    materialRef: Ref;
    materialKind: MaterialEntityKind;
  };

export type MusicDataPlatformMixedRetrievalMaterialCandidateRow =
  MusicDataPlatformMixedRetrievalRowBase & {
    kind: "material_candidate";
    materialCandidateRef: Ref;
  };

export type MusicDataPlatformMixedRetrievalRowBase = RetrievalResultTextFields & {
  matchedPoolRefs: readonly Ref[];
  matchedTextFields: readonly RetrievalTextField[];
  matchedTextTokensByField: readonly RetrievalMatchedTextTokenEvidence[];
  matchedTokenCount: number;
  rankScore: {
    kind: "fts_bm25";
    value: number;
  };
};

export type CreateMusicDataPlatformRetrievalWorkspaceInput = {
  database: MusicDatabase;
};

export type MusicDataPlatformRetrievalWorkspace = {
  searchMixedResultSet(
    input: MusicDataPlatformMixedRetrievalSearchInput,
  ): Promise<MusicDataPlatformMixedRetrievalPage>;
};

type EffectiveTextQuery = {
  normalizedText: string;
  tokens: readonly string[];
  matchQuery: string;
};

type NormalizedDurablePoolFilter = {
  allOf: readonly Ref[];
  anyOf: readonly Ref[];
  noneOf: readonly Ref[];
  allOfRefKeys: readonly string[];
  anyOfRefKeys: readonly string[];
  noneOfRefKeys: readonly string[];
};

type LocalResultWindowRow = RetrievalResultTextFields & {
  material_ref_key: string;
};

type ProviderResolvedMaterialIdentityRow = {
  material_ref_key: string;
  materialKind: MaterialEntityKind;
};

type ResultSetDescriptor = RetrievalResultTextFields & {
  rowKind: RetrievalResultRowKind;
  stableRefKey: string;
  materialRefKey?: string;
  materialCandidateRefKey?: string;
  rowKindSort: number;
};

type RankedResultSetFtsRow = {
  row_kind: RetrievalResultRowKind;
  stable_ref_key: string;
  matched_token_count: number;
  best_field_priority: number;
  rank_sort_value: number;
};

type MixedPageSqlRow = RetrievalResultTextFields & {
  row_kind: RetrievalResultRowKind;
  stable_ref_key: string;
  material_ref_key: string | null;
  material_candidate_ref_key: string | null;
  matched_token_count: number;
  best_field_priority: number;
  rank_sort_value: number;
  row_kind_sort: number;
  material_kind: MaterialEntityKind | null;
  material_entity_json: string | null;
  candidate_cache_ref_key: string | null;
  candidate_expires_at: string | null;
};

type MaterialEntityPayload = {
  materialRef?: unknown;
  kind?: unknown;
};

type MatchedTextEvidenceRow = {
  row_kind: RetrievalResultRowKind;
  stable_ref_key: string;
  field: RetrievalTextField;
  token: string;
  field_priority: number;
  field_order: number;
  token_order: number;
};

type SourceLibraryRow = {
  library_ref_key: string;
  owner_scope: string;
  provider_id: string;
  provider_account_id: string;
  library_kind: PlatformLibraryKind;
};

const LOCAL_RESULT_WINDOW_MULTIPLIER = 10;


export function createMusicDataPlatformRetrievalWorkspace(
  input: CreateMusicDataPlatformRetrievalWorkspaceInput,
): MusicDataPlatformRetrievalWorkspace {
  const { database } = input;

  return {
    async searchMixedResultSet(searchInput) {
      const now = validatedNow(searchInput.now);
      const ownerScope = validatedOwnerScope(searchInput.ownerScope);
      const order = validatedOrder(searchInput.order);
      const limit = validatedLimit(searchInput.limit);
      const localResultWindowLimit = limit * LOCAL_RESULT_WINDOW_MULTIPLIER;
      const materialKind = validatedMaterialKind(searchInput.materialKind);
      const textQuery = effectiveTextQuery(searchInput.text);
      const queryFingerprint = validatedQueryFingerprint(searchInput.queryFingerprint);
      const providerCandidates = searchInput.providerCandidates ?? [];
      const includeLocalCatalog = searchInput.includeLocalCatalog === true;

      return database.transaction(async (db) => {
        if (searchInput.cursor !== undefined) {
          return await readExistingMixedResultSetPage({
            db,
            resultSetId: searchInput.cursor.resultSetId,
            queryFingerprint,
            textQuery,
            limit,
            now,
            cursorPosition: searchInput.cursor.position,
          });
        }

        const records = createRetrievalResultSetRecords({ db });
        await records.cleanupExpiredRetrievalResultSets({ now });
        await records.cleanupExpiredMaterialCandidates({ now });

        const poolFilter = await normalizeDurablePoolFilter(
          db,
          ownerScope,
          searchInput.durablePoolFilter,
        );
        const resultSetId = createResultSetId();
        const expiresAt = expiresAtFromResultSetCreatedAt({
          createdAt: now,
          ...(searchInput.ttlMs === undefined ? {} : { ttlMs: searchInput.ttlMs }),
        });
        const localWindow = await selectLocalResultWindow({
          db,
          ownerScope,
          materialKind,
          poolFilter,
          includeLocalCatalog,
          textQuery,
          localResultWindowLimit,
        });
        const descriptors = new Map<string, ResultSetDescriptor>();
        let localRowsInResultSet = 0;

        for (const localRow of localWindow.rows) {
          const descriptor = materialDescriptorFromTextRow(localRow);
          descriptors.set(descriptorKey(descriptor), descriptor);
          localRowsInResultSet += 1;
        }

        for (const candidate of providerCandidates) {
          await addProviderCandidateDescriptor({
            db,
            descriptors,
            records,
            candidate,
            ownerScope,
            materialKind,
            resultSetId,
            expiresAt,
            now,
          });
        }

        await records.resultSets.insert({
          resultSetId,
          queryFingerprint,
          localResultWindowLimit,
          localRowsInResultSet,
          localResultWindowHasMore: localWindow.hasMore,
          expiresAt,
          createdAt: now,
        });

        const ftsRecords = ftsRecordsFromDescriptors(resultSetId, descriptors);
        await records.resultTextFts.insertMany(ftsRecords);

        const rankedRows = await rankedRowsByResultRowKey({
          db,
          resultSetId,
          textQuery,
        });
        const resultRows = resultRowsFromDescriptors(resultSetId, descriptors, rankedRows);
        await records.resultRows.insertMany(resultRows);
        await pruneUnmatchedResultSetFtsRows(db, resultSetId);

        return await readExistingMixedResultSetPage({
          db,
          resultSetId,
          queryFingerprint,
          textQuery,
          limit,
          now,
        });
      });
    },
  };
}

async function readExistingMixedResultSetPage(input: {
  db: MusicDatabaseContext;
  resultSetId: string;
  queryFingerprint: string;
  textQuery: EffectiveTextQuery;
  limit: number;
  now: string;
  cursorPosition?: MixedRetrievalCursorPosition;
}): Promise<MusicDataPlatformMixedRetrievalPage> {
  const resultSetId = validatedResultSetId(input.resultSetId);
  const resultSet = await createRetrievalResultSetRecords({ db: input.db }).resultSets.get({
    resultSetId,
  });

  if (resultSet === undefined || resultSet.expiresAt <= input.now) {
    return { status: "result_set_expired" };
  }

  if (resultSet.queryFingerprint !== input.queryFingerprint) {
    return { status: "query_fingerprint_mismatch" };
  }

  const selectedRows = await input.db.all<MixedPageSqlRow>(
    mixedPageSql(input.cursorPosition, input.textQuery),
    mixedPageParams({
      resultSetId,
      limit: input.limit + 1,
      cursorPosition: input.cursorPosition,
    }),
  );
  const visibleRows = selectedRows.slice(0, input.limit);

  if (visibleRows.some((row) => candidateCacheExpired(row, input.now))) {
    return { status: "material_candidate_expired" };
  }

  const textEvidence = await matchedTextEvidenceByResultRowKey({
    db: input.db,
    resultSetId,
    rows: visibleRows,
    queryTokens: input.textQuery.tokens,
  });
  const rows = visibleRows.map((row) => mixedRetrievalRowFromSqlRow(row, textEvidence));
  const lastRow = rows[rows.length - 1];

  return {
    status: "ok",
    resultSetId,
    rows,
    ...(selectedRows.length > input.limit && lastRow !== undefined
      ? { nextCursorPosition: cursorPositionFromSqlRow(visibleRows[visibleRows.length - 1]!) }
      : {}),
  };
}

async function selectLocalResultWindow(input: {
  db: MusicDatabaseContext;
  ownerScope: string;
  materialKind: MaterialEntityKind | undefined;
  poolFilter: NormalizedDurablePoolFilter;
  includeLocalCatalog: boolean;
  textQuery: EffectiveTextQuery;
  localResultWindowLimit: number;
}): Promise<{
  rows: readonly LocalResultWindowRow[];
  hasMore: boolean;
}> {
  if (!hasLocalRecallSource(input.includeLocalCatalog, input.poolFilter)) {
    return {
      rows: [],
      hasMore: false,
    };
  }

  const selectedRows = await input.db.all<LocalResultWindowRow>(
    localResultWindowSql(input.poolFilter, input.materialKind, input.textQuery),
    localResultWindowParams({
      ownerScope: input.ownerScope,
      materialKind: input.materialKind,
      poolFilter: input.poolFilter,
      limit: input.localResultWindowLimit + 1,
    }),
  );
  return {
    rows: selectedRows.slice(0, input.localResultWindowLimit),
    hasMore: selectedRows.length > input.localResultWindowLimit,
  };
}

async function addProviderCandidateDescriptor(input: {
  db: MusicDatabaseContext;
  descriptors: Map<string, ResultSetDescriptor>;
  records: ReturnType<typeof createRetrievalResultSetRecords>;
  candidate: ProviderMaterialCandidate;
  ownerScope: string;
  materialKind: MaterialEntityKind | undefined;
  resultSetId: string;
  expiresAt: string;
  now: string;
}): Promise<void> {
  const sourceEntity = validatedProviderCandidate(input.candidate);
  const candidateMaterialKind = materialKindForSourceKind(sourceEntity.kind);

  if (input.materialKind !== undefined && input.materialKind !== candidateMaterialKind) {
    return;
  }

  const sourceRefKey = refKey(sourceEntity.sourceRef);
  const resolved = await providerResolvedMaterialIdentity(input.db, sourceRefKey);

  if (resolved !== undefined) {
    if (input.materialKind !== undefined && input.materialKind !== resolved.materialKind) {
      return;
    }

    if (await providerResolvedMaterialBlocked(input.db, input.ownerScope, resolved.material_ref_key)) {
      return;
    }

    const resolvedText = await providerResolvedMaterialTextRow(input.db, resolved.material_ref_key);
    if (resolvedText === undefined) {
      return;
    }

    const descriptor = materialDescriptorFromTextRow({
      material_ref_key: resolved.material_ref_key,
      ...resolvedText,
    });
    if (!input.descriptors.has(descriptorKey(descriptor))) {
      input.descriptors.set(descriptorKey(descriptor), descriptor);
    }
    return;
  }

  const materialCandidateRef = createProviderMaterialCandidateRef({
    sourceRef: sourceEntity.sourceRef,
  });
  const materialCandidateRefKey = providerMaterialCandidateRefKey({
    materialCandidateRef,
  });
  const descriptor: ResultSetDescriptor = {
    ...searchableFieldsFromSourceEntity(sourceEntity),
    rowKind: "material_candidate",
    stableRefKey: materialCandidateRefKey,
    materialCandidateRefKey,
    rowKindSort: 1,
  };

  if (input.descriptors.has(descriptorKey(descriptor))) {
    return;
  }

  await input.records.materialCandidates.upsert({
    materialCandidateRefKey,
    providerId: sourceEntity.providerId!,
    sourceRefKey,
    providerEntityId: sourceEntity.providerEntityId!,
    sourceKind: sourceEntity.kind,
    materialCandidateKind: "provider_candidate",
    validatedProviderCandidateJson: JSON.stringify(input.candidate),
    searchableFieldsJson: JSON.stringify({
      titleText: descriptor.titleText,
      artistText: descriptor.artistText,
      albumText: descriptor.albumText,
      versionText: descriptor.versionText,
      aliasText: descriptor.aliasText,
    }),
    ...(input.candidate.providerScore === undefined
      ? {}
      : { providerScore: input.candidate.providerScore }),
    expiresAt: input.expiresAt,
    createdAt: input.now,
  });
  input.descriptors.set(descriptorKey(descriptor), descriptor);
}

async function providerResolvedMaterialIdentity(
  db: MusicDatabaseContext,
  sourceRefKey: string,
): Promise<ProviderResolvedMaterialIdentityRow | undefined> {
  const row = await db.get<{
    material_ref_key: string;
    material_kind: MaterialEntityKind;
  }>(
    `
      SELECT
        b.material_ref_key,
        m.kind AS material_kind
      FROM source_material_bindings b
      JOIN material_records m
        ON m.ref_key = b.material_ref_key
      WHERE b.source_ref_key = ?
        AND m.lifecycle_status = 'active'
    `,
    [sourceRefKey],
  );

  if (row === undefined) {
    return undefined;
  }

  return {
    material_ref_key: row.material_ref_key,
    materialKind: row.material_kind,
  };
}

async function providerResolvedMaterialTextRow(
  db: MusicDatabaseContext,
  materialRefKey: string,
): Promise<RetrievalResultTextFields | undefined> {
  const row = await db.get<{
    title_text: string;
    artist_text: string;
    album_text: string;
    version_text: string;
    alias_text: string;
  }>(
    `
      SELECT
        title_text,
        artist_text,
        album_text,
        version_text,
        alias_text
      FROM material_text_documents
      WHERE material_ref_key = ?
    `,
    [materialRefKey],
  );

  if (row === undefined) {
    return undefined;
  }

  return {
    titleText: row.title_text,
    artistText: row.artist_text,
    albumText: row.album_text,
    versionText: row.version_text,
    aliasText: row.alias_text,
  };
}

async function providerResolvedMaterialBlocked(
  db: MusicDatabaseContext,
  ownerScope: string,
  materialRefKey: string,
): Promise<boolean> {
  return (await db.get<{ one: number }>(
    `
      SELECT 1 AS one
      FROM owner_material_relations
      WHERE owner_scope = ?
        AND material_ref_key = ?
        AND relation_kind = 'blocked'
        AND status = 'active'
      LIMIT 1
    `,
    [ownerScope, materialRefKey],
  )) !== undefined;
}

function materialDescriptorFromTextRow(
  row: RetrievalResultTextFields & {
    material_ref_key: string;
  },
): ResultSetDescriptor {
  return {
    rowKind: "material",
    stableRefKey: row.material_ref_key,
    materialRefKey: row.material_ref_key,
    rowKindSort: 0,
    titleText: row.titleText,
    artistText: row.artistText,
    albumText: row.albumText,
    versionText: row.versionText,
    aliasText: row.aliasText,
  };
}

function ftsRecordsFromDescriptors(
  resultSetId: string,
  descriptors: ReadonlyMap<string, ResultSetDescriptor>,
): readonly RetrievalResultTextFtsRecord[] {
  return [...descriptors.values()].map((descriptor) => ({
    resultSetId,
    rowKind: descriptor.rowKind,
    stableRefKey: descriptor.stableRefKey,
    titleText: descriptor.titleText,
    artistText: descriptor.artistText,
    albumText: descriptor.albumText,
    versionText: descriptor.versionText,
    aliasText: descriptor.aliasText,
  }));
}

async function rankedRowsByResultRowKey(input: {
  db: MusicDatabaseContext;
  resultSetId: string;
  textQuery: EffectiveTextQuery;
}): Promise<ReadonlyMap<string, RankedResultSetFtsRow>> {
  const rows = await input.db.all<RankedResultSetFtsRow>(
    `
      SELECT
        row_kind,
        stable_ref_key,
        ${matchedTokenCountSqlExpression(input.textQuery.tokens, "retrieval_result_text_fts")}
          AS matched_token_count,
        ${bestFieldPrioritySqlExpression(input.textQuery.tokens, "retrieval_result_text_fts")}
          AS best_field_priority,
        ${ftsRankSortValueSqlExpression("retrieval_result_text_fts", input.textQuery.matchQuery)}
          AS rank_sort_value
      FROM retrieval_result_text_fts
      WHERE result_set_id = ?
        AND ${ftsSearchConditionSql("retrieval_result_text_fts", input.textQuery.matchQuery)}
    `,
    [input.resultSetId],
  );
  const byKey = new Map<string, RankedResultSetFtsRow>();

  for (const row of rows) {
    byKey.set(resultRowKey(row.row_kind, row.stable_ref_key), row);
  }

  return byKey;
}

function resultRowsFromDescriptors(
  resultSetId: string,
  descriptors: ReadonlyMap<string, ResultSetDescriptor>,
  rankedRows: ReadonlyMap<string, RankedResultSetFtsRow>,
): readonly RetrievalResultRowRecord[] {
  const rows: RetrievalResultRowRecord[] = [];

  for (const descriptor of descriptors.values()) {
    const rankedRow = rankedRows.get(descriptorKey(descriptor));

    if (rankedRow === undefined) {
      continue;
    }

    rows.push({
      resultSetId,
      rowKind: descriptor.rowKind,
      stableRefKey: descriptor.stableRefKey,
      ...(descriptor.materialRefKey === undefined ? {} : { materialRefKey: descriptor.materialRefKey }),
      ...(descriptor.materialCandidateRefKey === undefined
        ? {}
        : { materialCandidateRefKey: descriptor.materialCandidateRefKey }),
      rowKindSort: descriptor.rowKindSort,
      matchedTokenCount: rankedRow.matched_token_count,
      bestFieldPriority: rankedRow.best_field_priority,
      rankSortValue: rankedRow.rank_sort_value,
      titleText: descriptor.titleText,
      artistText: descriptor.artistText,
      albumText: descriptor.albumText,
      versionText: descriptor.versionText,
      aliasText: descriptor.aliasText,
    });
  }

  return rows;
}

async function pruneUnmatchedResultSetFtsRows(
  db: MusicDatabaseContext,
  resultSetId: string,
): Promise<void> {
  await db.run(
    `
      DELETE FROM retrieval_result_text_fts
      WHERE result_set_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM retrieval_result_rows r
          WHERE r.result_set_id = retrieval_result_text_fts.result_set_id
            AND r.row_kind = retrieval_result_text_fts.row_kind
            AND r.stable_ref_key = retrieval_result_text_fts.stable_ref_key
        )
    `,
    [resultSetId],
  );
}

function localResultWindowSql(
  poolFilter: NormalizedDurablePoolFilter,
  materialKind: MaterialEntityKind | undefined,
  textQuery: EffectiveTextQuery,
): string {
  const whereClauses = catalogBaseWhereClauses(poolFilter, materialKind);

  return `
    SELECT
      c.material_ref_key,
      t.title_text AS "titleText",
      t.artist_text AS "artistText",
      t.album_text AS "albumText",
      t.version_text AS "versionText",
      t.alias_text AS "aliasText",
      ${matchedTokenCountSqlExpression(textQuery.tokens, "material_text_fts")}
        AS matched_token_count,
      ${bestFieldPrioritySqlExpression(textQuery.tokens, "material_text_fts")}
        AS best_field_priority,
      ${ftsRankSortValueSqlExpression("material_text_fts", textQuery.matchQuery)}
        AS rank_sort_value
    FROM owner_material_catalog_view c
    JOIN material_records m
      ON m.ref_key = c.material_ref_key
    JOIN material_text_documents t
      ON t.material_ref_key = c.material_ref_key
    JOIN material_text_fts
      ON material_text_fts.material_ref_key = c.material_ref_key
    WHERE ${ftsSearchConditionSql("material_text_fts", textQuery.matchQuery)}
      AND ${whereClauses.map((clause) => `(${clause.trim()})`).join("\n      AND ")}
    ORDER BY
      matched_token_count DESC,
      best_field_priority ASC,
      rank_sort_value ASC,
      c.material_ref_key ASC
    LIMIT ?
  `;
}

function localResultWindowParams(input: {
  ownerScope: string;
  materialKind: MaterialEntityKind | undefined;
  poolFilter: NormalizedDurablePoolFilter;
  limit: number;
}): readonly MusicDatabaseParameter[] {
  const params = catalogBaseParams(
    input.ownerScope,
    input.materialKind,
    input.poolFilter,
  );
  params.push(input.limit);
  return params;
}

function mixedPageSql(
  cursorPosition: MixedRetrievalCursorPosition | undefined,
  textQuery: EffectiveTextQuery,
): string {
  const cursorClause = mixedCursorClause(cursorPosition);

  return `
    SELECT
      r.row_kind,
      r.stable_ref_key,
      r.material_ref_key,
      r.material_candidate_ref_key,
      r.matched_token_count,
      r.best_field_priority,
      r.rank_sort_value,
      r.row_kind_sort,
      r.title_text AS "titleText",
      r.artist_text AS "artistText",
      r.album_text AS "albumText",
      r.version_text AS "versionText",
      r.alias_text AS "aliasText",
      m.kind AS material_kind,
      m.entity_json AS material_entity_json,
      c.material_candidate_ref_key AS candidate_cache_ref_key,
      c.expires_at AS candidate_expires_at
    FROM retrieval_result_rows r
    JOIN retrieval_result_text_fts
      ON retrieval_result_text_fts.result_set_id = r.result_set_id
      AND retrieval_result_text_fts.row_kind = r.row_kind
      AND retrieval_result_text_fts.stable_ref_key = r.stable_ref_key
    LEFT JOIN material_records m
      ON m.ref_key = r.material_ref_key
    LEFT JOIN material_candidate_cache c
      ON c.material_candidate_ref_key = r.material_candidate_ref_key
    WHERE r.result_set_id = ?
      AND ${ftsSearchConditionSql("retrieval_result_text_fts", textQuery.matchQuery)}
      ${cursorClause === undefined ? "" : `AND (${cursorClause})`}
    ORDER BY
      r.matched_token_count DESC,
      r.best_field_priority ASC,
      r.rank_sort_value ASC,
      r.row_kind_sort ASC,
      r.stable_ref_key ASC
    LIMIT ?
  `;
}

function mixedPageParams(input: {
  resultSetId: string;
  limit: number;
  cursorPosition: MixedRetrievalCursorPosition | undefined;
}): readonly MusicDatabaseParameter[] {
  const params: MusicDatabaseParameter[] = [input.resultSetId];

  if (input.cursorPosition !== undefined) {
    params.push(
      input.cursorPosition.matchedTokenCount,
      input.cursorPosition.matchedTokenCount,
      input.cursorPosition.bestFieldPriority,
      input.cursorPosition.bestFieldPriority,
      input.cursorPosition.rankSortValue,
      input.cursorPosition.rankSortValue,
      rowKindSort(input.cursorPosition.rowKind),
      rowKindSort(input.cursorPosition.rowKind),
      input.cursorPosition.stableRefKey,
    );
  }

  params.push(input.limit);
  return params;
}

function mixedCursorClause(
  cursorPosition: MixedRetrievalCursorPosition | undefined,
): string | undefined {
  if (cursorPosition === undefined) {
    return undefined;
  }

  validatedMixedCursorPosition(cursorPosition);

  return `
    r.matched_token_count < ?
    OR (
      r.matched_token_count = ?
      AND (
        r.best_field_priority > ?
        OR (
          r.best_field_priority = ?
          AND (
            r.rank_sort_value > ?
            OR (
              r.rank_sort_value = ?
              AND (
                r.row_kind_sort > ?
                OR (
                  r.row_kind_sort = ?
                  AND r.stable_ref_key > ?
                )
              )
            )
          )
        )
      )
    )
  `;
}

async function matchedTextEvidenceByResultRowKey(input: {
  db: MusicDatabaseContext;
  resultSetId: string;
  rows: readonly MixedPageSqlRow[];
  queryTokens: readonly string[];
}): Promise<ReadonlyMap<string, {
  matchedTextFields: readonly RetrievalTextField[];
  matchedTextTokensByField: readonly RetrievalMatchedTextTokenEvidence[];
  matchedTokenCount: number;
  bestFieldPriority: number;
}>> {
  if (input.rows.length === 0 || input.queryTokens.length === 0) {
    return new Map();
  }

  const params: MusicDatabaseParameter[] = [];
  for (const row of input.rows) {
    params.push(row.row_kind, row.stable_ref_key);
  }

  const rows = await input.db.all<MatchedTextEvidenceRow>(
    matchedTextEvidenceSql(input.resultSetId, input.rows.length, input.queryTokens),
    params,
  );
  const grouped = new Map<string, {
    matchedTextFields: RetrievalTextField[];
    matchedTextTokensByField: {
      field: RetrievalTextField;
      tokens: string[];
    }[];
    matchedTokenKeys: Set<string>;
    bestFieldPriority: number;
  }>();

  for (const row of rows) {
    const key = resultRowKey(row.row_kind, row.stable_ref_key);
    const existing = grouped.get(key);

    if (existing === undefined) {
      grouped.set(key, {
        matchedTextFields: [row.field],
        matchedTextTokensByField: [{
          field: row.field,
          tokens: [row.token],
        }],
        matchedTokenKeys: new Set([row.token]),
        bestFieldPriority: row.field_priority,
      });
      continue;
    }

    const lastFieldEvidence =
      existing.matchedTextTokensByField[existing.matchedTextTokensByField.length - 1];

    if (lastFieldEvidence !== undefined && lastFieldEvidence.field === row.field) {
      lastFieldEvidence.tokens.push(row.token);
    } else {
      existing.matchedTextFields.push(row.field);
      existing.matchedTextTokensByField.push({
        field: row.field,
        tokens: [row.token],
      });
    }

    existing.matchedTokenKeys.add(row.token);
  }

  return new Map(
    [...grouped.entries()].map(([key, evidence]) => [
      key,
      {
        matchedTextFields: evidence.matchedTextFields,
        matchedTextTokensByField: evidence.matchedTextTokensByField,
        matchedTokenCount: evidence.matchedTokenKeys.size,
        bestFieldPriority: evidence.bestFieldPriority,
      },
    ]),
  );
}

function matchedTextEvidenceSql(
  resultSetId: string,
  rowCount: number,
  queryTokens: readonly string[],
): string {
  const unions: string[] = [];

  for (const [tokenOrder, token] of queryTokens.entries()) {
    for (const [fieldOrder, field] of retrievalTextFieldConfigs.entries()) {
      unions.push(`
        SELECT
          retrieval_result_text_fts.row_kind,
          retrieval_result_text_fts.stable_ref_key,
          ${sqlStringLiteral(field.field)} AS field,
          ${sqlStringLiteral(token)} AS token,
          ${field.priority} AS field_priority,
          ${fieldOrder} AS field_order,
          ${tokenOrder} AS token_order
        FROM retrieval_result_text_fts
        JOIN target_rows
          ON target_rows.row_kind = retrieval_result_text_fts.row_kind
          AND target_rows.stable_ref_key = retrieval_result_text_fts.stable_ref_key
        WHERE retrieval_result_text_fts.result_set_id = ${sqlStringLiteral(resultSetId)}
          AND ${ftsSearchConditionSql(
            "retrieval_result_text_fts",
            prefixTsQueryForTokens([token]),
          )}
          AND to_tsvector('simple', COALESCE(retrieval_result_text_fts.${field.column}, ''))
            @@ to_tsquery('simple', ${sqlStringLiteral(prefixTsQueryForTokens([token]))})
      `);
    }
  }

  return `
    WITH target_rows(row_kind, stable_ref_key) AS (
      VALUES ${sqlValueTuples(rowCount, 2)}
    )
    SELECT
      row_kind,
      stable_ref_key,
      field,
      token,
      field_priority,
      field_order,
      token_order
    FROM (
      ${unions.join("\nUNION ALL\n")}
    )
    ORDER BY row_kind ASC, stable_ref_key ASC, field_priority ASC, field_order ASC, token_order ASC
  `;
}

function mixedRetrievalRowFromSqlRow(
  row: MixedPageSqlRow,
  textEvidence: ReadonlyMap<string, {
    matchedTextFields: readonly RetrievalTextField[];
    matchedTextTokensByField: readonly RetrievalMatchedTextTokenEvidence[];
    matchedTokenCount: number;
    bestFieldPriority: number;
  }>,
): MusicDataPlatformMixedRetrievalRow {
  const evidence = textEvidence.get(resultRowKey(row.row_kind, row.stable_ref_key));

  if (evidence === undefined) {
    throw invalidMixedWorkspace("Mixed retrieval result row has no matched text evidence.");
  }

  if (evidence.matchedTokenCount !== row.matched_token_count) {
    throw invalidMixedWorkspace("Mixed retrieval row matched_token_count does not match text evidence.");
  }

  if (evidence.bestFieldPriority !== row.best_field_priority) {
    throw invalidMixedWorkspace("Mixed retrieval row best_field_priority does not match text evidence.");
  }

  const base = {
    titleText: row.titleText,
    artistText: row.artistText,
    albumText: row.albumText,
    versionText: row.versionText,
    aliasText: row.aliasText,
    matchedPoolRefs: [],
    matchedTextFields: evidence.matchedTextFields,
    matchedTextTokensByField: evidence.matchedTextTokensByField,
    matchedTokenCount: evidence.matchedTokenCount,
    rankScore: {
      kind: "fts_bm25" as const,
      value: -requiredFiniteNumber(row.rank_sort_value, "rank_sort_value", invalidMixedWorkspace),
    },
  };

  if (row.row_kind === "material") {
    if (
      row.material_ref_key === null ||
      row.material_kind === null ||
      row.material_entity_json === null
    ) {
      throw invalidMixedWorkspace("Mixed material row is missing durable material fields.");
    }

    return {
      kind: "material",
      materialRef: materialRefFromEntityJson(
        row.material_entity_json,
        row.material_ref_key,
        row.material_kind,
      ),
      materialKind: row.material_kind,
      ...base,
    };
  }

  if (row.row_kind === "material_candidate") {
    if (row.material_candidate_ref_key === null) {
      throw invalidMixedWorkspace("Mixed material candidate row is missing materialCandidateRefKey.");
    }

    return {
      kind: "material_candidate",
      materialCandidateRef: materialCandidateRefFromKey(row.material_candidate_ref_key),
      ...base,
    };
  }

  throw invalidMixedWorkspace(`Unsupported mixed row kind '${row.row_kind}'.`);
}

function candidateCacheExpired(row: MixedPageSqlRow, now: string): boolean {
  if (row.row_kind !== "material_candidate") {
    return false;
  }

  return row.candidate_cache_ref_key === null ||
    row.candidate_expires_at === null ||
    row.candidate_expires_at <= now;
}

function cursorPositionFromSqlRow(row: MixedPageSqlRow): MixedRetrievalCursorPosition {
  return {
    order: "text_relevance",
    matchedTokenCount: requiredPositiveInteger(row.matched_token_count, "matched_token_count", invalidMixedWorkspace),
    bestFieldPriority: requiredFieldPriority(row.best_field_priority, "best_field_priority", invalidMixedWorkspace),
    rankSortValue: requiredFiniteNumber(row.rank_sort_value, "rank_sort_value", invalidMixedWorkspace),
    rowKind: row.row_kind,
    stableRefKey: row.stable_ref_key,
  };
}

function catalogBaseWhereClauses(
  poolFilter: NormalizedDurablePoolFilter,
  materialKind: MaterialEntityKind | undefined,
): string[] {
  const whereClauses = [
    "c.owner_scope = ?",
    "m.lifecycle_status = 'active'",
  ];

  if (materialKind !== undefined) {
    whereClauses.push("m.kind = ?");
  }

  if (poolFilter.allOfRefKeys.length > 0) {
    whereClauses.push(`
      (
        SELECT COUNT(DISTINCT e.entry_ref_key)
        FROM owner_material_entries e
        WHERE e.owner_scope = c.owner_scope
          AND e.material_ref_key = c.material_ref_key
          AND e.active = 1
          AND e.visibility_role = 'positive'
          AND e.entry_ref_key IN (${sqlPlaceholders(poolFilter.allOfRefKeys.length)})
      ) = ?
    `);
  }

  if (poolFilter.anyOfRefKeys.length > 0) {
    whereClauses.push(`
      EXISTS (
        SELECT 1
        FROM owner_material_entries e
        WHERE e.owner_scope = c.owner_scope
          AND e.material_ref_key = c.material_ref_key
          AND e.active = 1
          AND e.visibility_role = 'positive'
          AND e.entry_ref_key IN (${sqlPlaceholders(poolFilter.anyOfRefKeys.length)})
      )
    `);
  }

  if (poolFilter.noneOfRefKeys.length > 0) {
    whereClauses.push(`
      NOT EXISTS (
        SELECT 1
        FROM owner_material_entries e
        WHERE e.owner_scope = c.owner_scope
          AND e.material_ref_key = c.material_ref_key
          AND e.active = 1
          AND e.visibility_role = 'positive'
          AND e.entry_ref_key IN (${sqlPlaceholders(poolFilter.noneOfRefKeys.length)})
      )
    `);
  }

  return whereClauses;
}

function catalogBaseParams(
  ownerScope: string,
  materialKind: MaterialEntityKind | undefined,
  poolFilter: NormalizedDurablePoolFilter,
): MusicDatabaseParameter[] {
  const params: MusicDatabaseParameter[] = [ownerScope];

  if (materialKind !== undefined) {
    params.push(materialKind);
  }

  if (poolFilter.allOfRefKeys.length > 0) {
    params.push(...poolFilter.allOfRefKeys, poolFilter.allOfRefKeys.length);
  }

  if (poolFilter.anyOfRefKeys.length > 0) {
    params.push(...poolFilter.anyOfRefKeys);
  }

  if (poolFilter.noneOfRefKeys.length > 0) {
    params.push(...poolFilter.noneOfRefKeys);
  }

  return params;
}

async function normalizeDurablePoolFilter(
  db: MusicDatabaseContext,
  ownerScope: string,
  poolFilter: RetrievalReadPoolFilter | undefined,
): Promise<NormalizedDurablePoolFilter> {
  const allOf = normalizePoolRefs(poolFilter?.allOf);
  const anyOf = normalizePoolRefs(poolFilter?.anyOf);
  const noneOf = normalizePoolRefs(poolFilter?.noneOf);
  const allOfRefKeys = refsToKeys(allOf);
  const anyOfRefKeys = refsToKeys(anyOf);
  const noneOfRefKeys = refsToKeys(noneOf);
  const positiveRefKeys = new Set([...allOfRefKeys, ...anyOfRefKeys]);

  for (const noneOfRefKey of noneOfRefKeys) {
    if (positiveRefKeys.has(noneOfRefKey)) {
      throw invalidMixedWorkspace(
        "Mixed retrieval durable pools cannot place the same ref in positive and noneOf groups.",
      );
    }
  }

  for (const ref of [...allOf, ...anyOf, ...noneOf]) {
    switch (ref.namespace) {
      case "source_library":
        await validateSourceLibraryPoolRef(db, ownerScope, ref);
        break;
      case "owner_material_relation_pool":
        validateOwnerRelationPoolRef(ownerScope, ref);
        break;
      default:
        throw invalidMixedWorkspace(
          "Mixed retrieval durable pools support only source_library and owner_material_relation_pool refs.",
        );
    }
  }

  return {
    allOf,
    anyOf,
    noneOf,
    allOfRefKeys,
    anyOfRefKeys,
    noneOfRefKeys,
  };
}

function normalizePoolRefs(refs: readonly Ref[] | undefined): readonly Ref[] {
  if (refs === undefined || refs.length === 0) {
    return [];
  }

  const deduped = new Map<string, Ref>();
  for (const ref of refs) {
    const key = refKey(ref);
    deduped.set(key, {
      namespace: ref.namespace,
      kind: ref.kind,
      id: ref.id,
    });
  }

  return [...deduped.values()];
}

function refsToKeys(refs: readonly Ref[]): readonly string[] {
  const keys: string[] = [];
  for (const ref of refs) {
    keys.push(refKey(ref));
  }
  return keys;
}

async function validateSourceLibraryPoolRef(
  db: MusicDatabaseContext,
  ownerScope: string,
  libraryRef: Ref,
): Promise<void> {
  assertSourceLibraryRef(libraryRef);
  const storedRefKey = refKey(libraryRef);
  const row = await db.get<SourceLibraryRow>(
    `
      SELECT
        library_ref_key,
        owner_scope,
        provider_id,
        provider_account_id,
        library_kind
      FROM source_libraries
      WHERE library_ref_key = ?
    `,
    [storedRefKey],
  );

  if (row === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.source_library_not_found",
      message: "Mixed retrieval source library pool does not exist.",
    });
  }

  if (row.owner_scope !== ownerScope) {
    throw new MusicDataPlatformError({
      code: "music_data.source_library_owner_scope_mismatch",
      message: "Mixed retrieval source library pool belongs to a different owner scope.",
    });
  }

  const reconstructedRef = createSourceLibraryRef({
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    providerAccountId: row.provider_account_id,
    libraryKind: row.library_kind,
  });

  if (refKey(reconstructedRef) !== row.library_ref_key) {
    throw new MusicDataPlatformError({
      code: "music_data.record_ref_key_mismatch",
      message: "Stored source library row does not reconstruct to its primary ref key.",
    });
  }
}

function validateOwnerRelationPoolRef(ownerScope: string, poolRef: Ref): void {
  assertOwnerRelationPoolRef(poolRef);
  const expectedPoolRef = createOwnerRelationPoolRef({
    ownerScope,
    relationKind: poolRef.kind as OwnerRelationEntryKind,
  });

  if (refKey(expectedPoolRef) !== refKey(poolRef)) {
    throw new MusicDataPlatformError({
      code: "music_data.owner_relation_pool_ref_invalid",
      message: "Mixed retrieval owner relation pool belongs to a different owner scope.",
    });
  }
}

function hasLocalRecallSource(
  includeLocalCatalog: boolean,
  poolFilter: NormalizedDurablePoolFilter,
): boolean {
  return includeLocalCatalog ||
    poolFilter.allOfRefKeys.length > 0 ||
    poolFilter.anyOfRefKeys.length > 0;
}

function searchableFieldsFromSourceEntity(sourceEntity: SourceEntity): RetrievalResultTextFields {
  const titleContributions: MaterialTextContribution[] = [];
  const artistContributions: MaterialTextContribution[] = [];
  const albumContributions: MaterialTextContribution[] = [];
  const versionContributions: MaterialTextContribution[] = [];
  const aliasContributions: MaterialTextContribution[] = [];

  appendVersionContributions(versionContributions, sourceEntity.versionInfo);

  switch (sourceEntity.kind) {
    case "track":
      pushContribution(titleContributions, "title", sourceEntity.title);
      for (const artistLabel of sourceEntity.artistLabels ?? []) {
        pushContribution(artistContributions, "artist", artistLabel);
      }
      if (sourceEntity.albumLabel !== undefined) {
        pushContribution(albumContributions, "album", sourceEntity.albumLabel);
      }
      break;
    case "album":
      pushContribution(titleContributions, "title", sourceEntity.title);
      for (const artistLabel of sourceEntity.artistLabels ?? []) {
        pushContribution(artistContributions, "artist", artistLabel);
      }
      break;
    case "artist":
      pushContribution(artistContributions, "artist", sourceEntity.name);
      for (const alias of sourceEntity.aliases ?? []) {
        pushContribution(aliasContributions, "alias", alias);
      }
      break;
  }

  return {
    titleText: buildMaterialTextFieldState(titleContributions).text,
    artistText: buildMaterialTextFieldState(artistContributions).text,
    albumText: buildMaterialTextFieldState(albumContributions).text,
    versionText: buildMaterialTextFieldState(versionContributions).text,
    aliasText: buildMaterialTextFieldState(aliasContributions).text,
  };
}

function appendVersionContributions(
  target: MaterialTextContribution[],
  versionInfo: VersionInfo | undefined,
): void {
  if (versionInfo?.label !== undefined) {
    pushContribution(target, "version_label", versionInfo.label);
  }

  for (const tag of versionInfo?.tags ?? []) {
    pushContribution(target, "version_tag", tag);
  }
}

function pushContribution(
  target: MaterialTextContribution[],
  basis: MaterialTextContribution["basis"],
  value: string,
): void {
  target.push({
    source: "source",
    basis,
    value,
  });
}

function validatedProviderCandidate(candidate: ProviderMaterialCandidate): SourceEntity {
  if (typeof candidate !== "object" || candidate === null) {
    throw invalidMixedWorkspace("Provider material candidate must be an object.");
  }

  if (candidate.providerScore !== undefined && !Number.isFinite(candidate.providerScore)) {
    throw invalidMixedWorkspace("Provider material candidate providerScore must be finite.");
  }

  const sourceEntity = candidate.sourceEntity;

  if (typeof sourceEntity !== "object" || sourceEntity === null) {
    throw invalidMixedWorkspace("Provider material candidate must include a sourceEntity.");
  }

  if (
    sourceEntity.kind !== "track" &&
    sourceEntity.kind !== "album" &&
    sourceEntity.kind !== "artist"
  ) {
    throw invalidMixedWorkspace("Provider material candidate source kind is unsupported.");
  }

  refKey(sourceEntity.sourceRef);

  if (
    typeof sourceEntity.providerId !== "string" ||
    sourceEntity.providerId.length === 0 ||
    typeof sourceEntity.providerEntityId !== "string" ||
    sourceEntity.providerEntityId.length === 0
  ) {
    throw invalidMixedWorkspace("Provider material candidate source identity is invalid.");
  }

  if (typeof sourceEntity.label !== "string" || sourceEntity.label.length === 0) {
    throw invalidMixedWorkspace("Provider material candidate source label is invalid.");
  }

  return sourceEntity;
}

function effectiveTextQuery(text: string): EffectiveTextQuery {
  const normalizedText = normalizeMaterialTextValue(text);

  if (normalizedText.length === 0) {
    throw invalidMixedWorkspace("Mixed retrieval requires effective query text.");
  }

  const tokens = buildMaterialTextPrefixQueryTokens(normalizedText);

  if (tokens.length === 0) {
    throw invalidMixedWorkspace("Mixed retrieval requires tokenizable query text.");
  }

  return {
    normalizedText,
    tokens,
    matchQuery: prefixTsQueryForTokens(tokens),
  };
}

function materialRefFromEntityJson(
  entityJson: string,
  storedMaterialRefKey: string,
  storedMaterialKind: MaterialEntityKind,
): Ref {
  let parsed: unknown;

  try {
    parsed = JSON.parse(entityJson);
  } catch (cause) {
    throw invalidMixedWorkspace("Stored material entity JSON is not valid JSON.", cause);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw invalidMixedWorkspace("Stored material entity JSON must be an object.");
  }

  const materialRef = (parsed as MaterialEntityPayload).materialRef;

  if (typeof materialRef !== "object" || materialRef === null) {
    throw invalidMixedWorkspace("Stored material entity JSON must include a materialRef object.");
  }

  const parsedRef = materialRef as Ref;
  assertMaterialRef(parsedRef);

  if (refKey(parsedRef) !== storedMaterialRefKey) {
    throw new MusicDataPlatformError({
      code: "music_data.record_ref_key_mismatch",
      message: "Stored material ref key does not match the parsed material entity ref.",
    });
  }

  if ((parsed as MaterialEntityPayload).kind !== storedMaterialKind) {
    throw new MusicDataPlatformError({
      code: "music_data.record_kind_mismatch",
      message: "Stored material entity kind does not match the stored material record kind.",
    });
  }

  return parsedRef;
}

function materialCandidateRefFromKey(materialCandidateRefKey: string): Ref {
  assertMusicDataPlatformPublicRefKey({
    refKey: materialCandidateRefKey,
    fieldName: "materialCandidateRefKey",
    code: "music_data.retrieval_result_set_invalid",
  });
  const ref = parseRefKey(materialCandidateRefKey);
  if (ref === undefined) {
    throw invalidMixedWorkspace("Material candidate ref key must be a namespace:kind:id ref key.");
  }
  return ref;
}

function createResultSetId(): string {
  return `rs_${randomUUID()}`;
}

function validatedOwnerScope(ownerScope: string): string {
  assertOwnerScope(ownerScope);

  if (ownerScope !== DEFAULT_OWNER_SCOPE) {
    throw new MusicDataPlatformError({
      code: "music_data.owner_scope_unsupported",
      message: "Mixed retrieval currently supports only the default owner scope.",
    });
  }

  return ownerScope;
}

function validatedOrder(order: string): "text_relevance" {
  if (order !== "text_relevance") {
    throw invalidMixedWorkspace("Mixed retrieval supports only text_relevance order.");
  }

  return order;
}

function validatedLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw invalidMixedWorkspace("Mixed retrieval limit must be an integer from 1 through 100.");
  }

  return limit;
}

function validatedMaterialKind(
  materialKind: MaterialEntityKind | undefined,
): MaterialEntityKind | undefined {
  if (materialKind === undefined) {
    return undefined;
  }

  if (
    materialKind !== "recording" &&
    materialKind !== "album" &&
    materialKind !== "artist" &&
    materialKind !== "work" &&
    materialKind !== "release"
  ) {
    throw invalidMixedWorkspace("Mixed retrieval materialKind is unsupported.");
  }

  return materialKind;
}

function validatedNow(now: string | undefined): string {
  const value = now ?? new Date().toISOString();
  assertComparableTimestamp(value, "now", "music_data.retrieval_result_set_invalid");
  return value;
}

function validatedQueryFingerprint(queryFingerprint: string): string {
  if (typeof queryFingerprint !== "string" || queryFingerprint.length === 0) {
    throw invalidMixedWorkspace("Mixed retrieval query fingerprint must be non-empty.");
  }

  return queryFingerprint;
}

function validatedResultSetId(resultSetId: string): string {
  if (typeof resultSetId !== "string" || resultSetId.length === 0) {
    throw invalidMixedWorkspace("Mixed retrieval resultSetId must be non-empty.");
  }

  return resultSetId;
}

function validatedMixedCursorPosition(position: MixedRetrievalCursorPosition): void {
  if (position.order !== "text_relevance") {
    throw invalidMixedWorkspace("Mixed retrieval cursor order must be text_relevance.");
  }

  requiredPositiveInteger(position.matchedTokenCount, "cursorPosition.matchedTokenCount", invalidMixedWorkspace);
  requiredFieldPriority(position.bestFieldPriority, "cursorPosition.bestFieldPriority", invalidMixedWorkspace);
  requiredFiniteNumber(position.rankSortValue, "cursorPosition.rankSortValue", invalidMixedWorkspace);

  if (position.rowKind !== "material" && position.rowKind !== "material_candidate") {
    throw invalidMixedWorkspace("Mixed retrieval cursor rowKind is invalid.");
  }

  if (typeof position.stableRefKey !== "string" || position.stableRefKey.length === 0) {
    throw invalidMixedWorkspace("Mixed retrieval cursor stableRefKey must be non-empty.");
  }
}

function descriptorKey(descriptor: ResultSetDescriptor): string {
  return resultRowKey(descriptor.rowKind, descriptor.stableRefKey);
}

function resultRowKey(rowKind: RetrievalResultRowKind, stableRefKey: string): string {
  return `${rowKind}\u0000${stableRefKey}`;
}

function rowKindSort(rowKind: RetrievalResultRowKind): number {
  return rowKind === "material" ? 0 : 1;
}

function sqlValueTuples(rowCount: number, columnCount: number): string {
  return Array.from(
    { length: rowCount },
    () => `(${Array.from({ length: columnCount }, () => "?").join(", ")})`,
  ).join(", ");
}


function invalidMixedWorkspace(message: string, cause?: unknown): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.retrieval_result_set_invalid",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
