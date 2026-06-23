import { randomUUID } from "node:crypto";

import { parseRefKey, refKey, type Ref } from "../contracts/kernel.js";
import type {
  MaterialEntityKind,
  PlatformLibraryKind,
  ProviderMaterialCandidate,
  SourceEntity,
} from "../contracts/music_data_platform.js";
import type {
  MusicDatabase,
  MusicDatabaseContext,
  MusicDatabaseParameter,
} from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef, materialKindForSourceKind } from "./material_ref.js";
import {
  createProviderMaterialCandidateRef,
  providerMaterialCandidateRefKey,
} from "./material_candidate_ref.js";
import {
  assertOwnerRelationPoolRef,
  createOwnerRelationPoolRef,
  type OwnerRelationEntryKind,
} from "./owner_material_relation_ref.js";
import { assertOwnerScope, DEFAULT_OWNER_SCOPE } from "./owner_scope.js";
import {
  createRetrievalResultSetRecords,
  expiresAtFromResultSetCreatedAt,
  type MaterialCandidateCacheRepository,
} from "./retrieval_result_set_records.js";
import {
  sqlPlaceholders,
  type RetrievalReadPoolFilter,
} from "./retrieval_shared.js";
import {
  buildRuntimeProviderCandidateSearchMetadata,
  type SearchMetadataTextFields,
} from "./search_metadata_document_builder.js";
import {
  buildSearchMetadataPrefixOrQuery,
  buildSearchMetadataPrefixQueryTokens,
  normalizeSearchMetadataValue,
} from "./search_metadata_normalization.js";
import { assertSourceLibraryRef, createSourceLibraryRef } from "./source_library_ref.js";
import {
  assertComparableTimestamp,
  comparableTimestampSql,
} from "./timestamp_validation.js";

export type MetadataLookupSearchCursorPosition = {
  order: "text_relevance";
  matchedTokenCount: 1;
  bestFieldPriority: 1;
  rankSortValue: number;
  rowKind: "material" | "material_candidate";
  stableRefKey: string;
};

export type MusicDataPlatformMetadataLookupSearchInput = {
  ownerScope: string;
  text: string;
  materialKind?: MaterialEntityKind;
  durablePoolFilter?: RetrievalReadPoolFilter;
  includeLocalCatalog: boolean;
  limit: number;
  queryFingerprint: string;
  providerCandidates?: readonly ProviderMaterialCandidate[];
  cursor?: {
    resultSetId: string;
    position: MetadataLookupSearchCursorPosition;
  };
  now?: string;
  ttlMs?: number;
};

export type MusicDataPlatformMetadataLookupSearchPage =
  | {
      status: "ok";
      resultSetId: string;
      rows: readonly MusicDataPlatformMetadataLookupSearchRow[];
      nextCursorPosition?: MetadataLookupSearchCursorPosition;
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

export type MusicDataPlatformMetadataLookupSearchRow =
  | MusicDataPlatformMetadataLookupMaterialRow
  | MusicDataPlatformMetadataLookupMaterialCandidateRow;

export type MusicDataPlatformMetadataLookupMaterialRow =
  MusicDataPlatformMetadataLookupRowBase & {
    kind: "material";
    materialRef: Ref;
    materialKind: MaterialEntityKind;
  };

export type MusicDataPlatformMetadataLookupMaterialCandidateRow =
  MusicDataPlatformMetadataLookupRowBase & {
    kind: "material_candidate";
    materialCandidateRef: Ref;
  };

export type MusicDataPlatformMetadataLookupRowBase = SearchMetadataTextFields & {
  matchedPoolRefs: readonly Ref[];
  rankScore: {
    kind: "postgres_text_rank";
    value: number;
  };
};

export type CreateMusicDataPlatformMetadataLookupSearchWorkspaceInput = {
  database: MusicDatabase;
};

export type MusicDataPlatformMetadataLookupSearchWorkspace = {
  searchMetadataLookupResultSet(
    input: MusicDataPlatformMetadataLookupSearchInput,
  ): Promise<MusicDataPlatformMetadataLookupSearchPage>;
};

type EffectiveTextQuery = {
  normalizedText: string;
  prefixQuery: string;
  tokens: readonly string[];
};

type NormalizedDurablePoolFilter = {
  allOf: readonly Ref[];
  anyOf: readonly Ref[];
  noneOf: readonly Ref[];
  allOfRefKeys: readonly string[];
  anyOfRefKeys: readonly string[];
  noneOfRefKeys: readonly string[];
};

type SearchDescriptor = SearchMetadataTextFields & {
  rowKind: "material" | "material_candidate";
  stableRefKey: string;
  materialRefKey?: string;
  materialCandidateRefKey?: string;
  materialKind?: MaterialEntityKind;
  rowKindSort: 0 | 1;
  evidenceJson: string;
};

type LocalSearchRow = SearchMetadataTextFields & {
  material_ref_key: string;
  material_kind: MaterialEntityKind;
  score_value: number;
  score_sort_value: number;
  evidence_json: unknown;
};

type SearchResultRow = SearchMetadataTextFields & {
  row_kind: "material" | "material_candidate";
  stable_ref_key: string;
  material_ref_key: string | null;
  material_candidate_ref_key: string | null;
  material_kind: MaterialEntityKind | null;
  row_kind_sort: number;
  score_value: number;
  score_sort_value: number;
  evidence_json: unknown;
  candidate_cache_ref_key: string | null;
  candidate_expires_at: string | null;
};

type ProviderCandidateDescriptorInput = {
  candidate: ProviderMaterialCandidate;
  sourceEntity: SourceEntity;
  sourceRefKey: string;
};

type ProviderResolvedMaterialLookup = {
  materialKind: MaterialEntityKind;
  blocked: boolean;
  descriptor?: SearchDescriptor;
};

type ProviderResolvedMaterialLookupRow = {
  source_ref_key: string;
  material_ref_key: string;
  material_kind: MaterialEntityKind;
  blocked: number | string;
  fields_json: unknown | null;
  title_text: string | null;
  artist_text: string | null;
  album_text: string | null;
  version_text: string | null;
  alias_text: string | null;
  search_text: string | null;
};

type MaterialEntityPayload = {
  materialRef?: unknown;
  kind?: unknown;
};

type SourceLibraryRow = {
  library_ref_key: string;
  owner_scope: string;
  provider_id: string;
  provider_account_id: string;
  library_kind: PlatformLibraryKind;
};

const LOCAL_RESULT_WINDOW_MULTIPLIER = 10;
const SEARCH_RESULT_ROW_INSERT_PARAMETER_COUNT = 13;
const SEARCH_RESULT_ROW_INSERT_CHUNK_SIZE = 500;

export function createMusicDataPlatformMetadataLookupSearchWorkspace(
  input: CreateMusicDataPlatformMetadataLookupSearchWorkspaceInput,
): MusicDataPlatformMetadataLookupSearchWorkspace {
  const { database } = input;

  return {
    async searchMetadataLookupResultSet(searchInput) {
      const now = validatedNow(searchInput.now);
      const ownerScope = validatedOwnerScope(searchInput.ownerScope);
      const limit = validatedLimit(searchInput.limit);
      const localResultWindowLimit = limit * LOCAL_RESULT_WINDOW_MULTIPLIER;
      const materialKind = validatedMaterialKind(searchInput.materialKind);
      const textQuery = effectiveTextQuery(searchInput.text);
      const queryFingerprint = validatedQueryFingerprint(searchInput.queryFingerprint);
      const providerCandidates = searchInput.providerCandidates ?? [];

      return database.transaction(async (db) => {
        if (searchInput.cursor !== undefined) {
          return readExistingSearchResultSetPage({
            db,
            resultSetId: searchInput.cursor.resultSetId,
            queryFingerprint,
            limit,
            now,
            cursorPosition: searchInput.cursor.position,
          });
        }

        const retrievalRecords = createRetrievalResultSetRecords({ db });
        await cleanupExpiredSearchResultSets({ db, now });
        await retrievalRecords.cleanupExpiredMaterialCandidates({ now });

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
        const localRows = await selectLocalMetadataWindow({
          db,
          ownerScope,
          materialKind,
          poolFilter,
          includeLocalCatalog: searchInput.includeLocalCatalog,
          textQuery,
          localResultWindowLimit,
        });
        const descriptors = new Map<string, SearchDescriptor>();

        for (const localRow of localRows) {
          const descriptor = materialDescriptorFromLocalSearchRow(localRow);
          descriptors.set(descriptorKey(descriptor), descriptor);
        }

        const providerCandidateInputs = providerCandidateDescriptorInputs({
          candidates: providerCandidates,
          materialKind,
        });
        const resolvedMaterials = await providerResolvedMaterialsBySourceRefKey({
          db,
          ownerScope,
          sourceRefKeys: providerCandidateInputs.map((candidateInput) => candidateInput.sourceRefKey),
        });

        for (const candidateInput of providerCandidateInputs) {
          await addProviderCandidateDescriptor({
            descriptors,
            materialCandidates: retrievalRecords.materialCandidates,
            candidateInput,
            resolved: resolvedMaterials.get(candidateInput.sourceRefKey),
            materialKind,
            expiresAt,
            now,
          });
        }

        await insertSearchResultSet({
          db,
          resultSetId,
          queryFingerprint,
          rowCount: 0,
          expiresAt,
          createdAt: now,
        });
        await insertSearchResultRows({
          db,
          resultSetId,
          descriptors: [...descriptors.values()],
        });
        await rerankSearchResultRows({
          db,
          resultSetId,
          textQuery,
        });
        await pruneUnmatchedSearchResultRows({
          db,
          resultSetId,
          textQuery,
        });
        await refreshSearchResultSetRowCount({
          db,
          resultSetId,
        });

        return readExistingSearchResultSetPage({
          db,
          resultSetId,
          queryFingerprint,
          limit,
          now,
        });
      });
    },
  };
}

async function readExistingSearchResultSetPage(input: {
  db: MusicDatabaseContext;
  resultSetId: string;
  queryFingerprint: string;
  limit: number;
  now: string;
  cursorPosition?: MetadataLookupSearchCursorPosition;
}): Promise<MusicDataPlatformMetadataLookupSearchPage> {
  const resultSetId = validatedResultSetId(input.resultSetId);
  const resultSet = await input.db.get<{
    query_fingerprint: string;
    expired: boolean;
  }>(
    `
      SELECT
        query_fingerprint,
        expires_at <= ?::timestamptz AS expired
      FROM search_result_sets
      WHERE result_set_id = ?
    `,
    [input.now, resultSetId],
  );

  if (resultSet === undefined || resultSet.expired) {
    return { status: "result_set_expired" };
  }

  if (resultSet.query_fingerprint !== input.queryFingerprint) {
    return { status: "query_fingerprint_mismatch" };
  }

  const selectedRows = await input.db.all<SearchResultRow>(
    searchResultPageSql(input.cursorPosition),
    searchResultPageParams({
      resultSetId,
      limit: input.limit + 1,
      cursorPosition: input.cursorPosition,
    }),
  );
  const visibleRows = selectedRows.slice(0, input.limit);

  if (visibleRows.some((row) => candidateCacheExpired(row, input.now))) {
    return { status: "material_candidate_expired" };
  }

  const rows = visibleRows.map(searchRowFromSqlRow);
  const lastSqlRow = visibleRows[visibleRows.length - 1];

  return {
    status: "ok",
    resultSetId,
    rows,
    ...(selectedRows.length > input.limit && lastSqlRow !== undefined
      ? { nextCursorPosition: cursorPositionFromSqlRow(lastSqlRow) }
      : {}),
  };
}

async function selectLocalMetadataWindow(input: {
  db: MusicDatabaseContext;
  ownerScope: string;
  materialKind: MaterialEntityKind | undefined;
  poolFilter: NormalizedDurablePoolFilter;
  includeLocalCatalog: boolean;
  textQuery: EffectiveTextQuery;
  localResultWindowLimit: number;
}): Promise<readonly LocalSearchRow[]> {
  if (!hasLocalRecallSource(input.includeLocalCatalog, input.poolFilter)) {
    return [];
  }

  return input.db.all<LocalSearchRow>(
    localMetadataWindowSql(input.poolFilter, input.materialKind),
    [
      ...metadataScoreParams(input.textQuery),
      ...metadataRecallParams(input.textQuery),
      ...catalogBaseParams(input.ownerScope, input.materialKind, input.poolFilter),
      input.localResultWindowLimit,
    ],
  );
}

async function addProviderCandidateDescriptor(input: {
  descriptors: Map<string, SearchDescriptor>;
  materialCandidates: MaterialCandidateCacheRepository;
  candidateInput: ProviderCandidateDescriptorInput;
  resolved: ProviderResolvedMaterialLookup | undefined;
  materialKind: MaterialEntityKind | undefined;
  expiresAt: string;
  now: string;
}): Promise<void> {
  const { candidate, sourceEntity, sourceRefKey } = input.candidateInput;

  if (input.resolved !== undefined) {
    if (input.materialKind !== undefined && input.materialKind !== input.resolved.materialKind) {
      return;
    }

    if (input.resolved.blocked) {
      return;
    }

    if (input.resolved.descriptor !== undefined) {
      descriptorsSetIfAbsent(input.descriptors, input.resolved.descriptor);
    }
    return;
  }

  const materialCandidateRef = createProviderMaterialCandidateRef({
    sourceRef: sourceEntity.sourceRef,
  });
  const materialCandidateRefKey = providerMaterialCandidateRefKey({
    materialCandidateRef,
  });
  const metadata = buildRuntimeProviderCandidateSearchMetadata({ sourceEntity });
  const descriptor: SearchDescriptor = {
    rowKind: "material_candidate",
    stableRefKey: materialCandidateRefKey,
    materialCandidateRefKey,
    rowKindSort: 1,
    titleText: metadata.titleText,
    artistText: metadata.artistText,
    albumText: metadata.albumText,
    versionText: metadata.versionText,
    aliasText: metadata.aliasText,
    searchText: metadata.searchText,
    evidenceJson: JSON.stringify({
      document: {
        fields: metadata.fields,
      },
    }),
  };

  const descriptorKeyValue = descriptorKey(descriptor);
  if (input.descriptors.has(descriptorKeyValue)) {
    return;
  }

  await input.materialCandidates.upsert({
    materialCandidateRefKey,
    providerId: sourceEntity.providerId!,
    sourceRefKey,
    providerEntityId: sourceEntity.providerEntityId!,
    sourceKind: sourceEntity.kind,
    materialCandidateKind: "provider_candidate",
    validatedProviderCandidateJson: JSON.stringify(candidate),
    searchableFieldsJson: JSON.stringify({
      titleText: descriptor.titleText,
      artistText: descriptor.artistText,
      albumText: descriptor.albumText,
      versionText: descriptor.versionText,
      aliasText: descriptor.aliasText,
    }),
    ...(candidate.providerScore === undefined
      ? {}
      : { providerScore: candidate.providerScore }),
    expiresAt: input.expiresAt,
    createdAt: input.now,
  });
  input.descriptors.set(descriptorKeyValue, descriptor);
}

function providerCandidateDescriptorInputs(input: {
  candidates: readonly ProviderMaterialCandidate[];
  materialKind: MaterialEntityKind | undefined;
}): readonly ProviderCandidateDescriptorInput[] {
  const candidateInputs: ProviderCandidateDescriptorInput[] = [];

  for (const candidate of input.candidates) {
    const sourceEntity = validatedProviderCandidate(candidate);
    const candidateMaterialKind = materialKindForSourceKind(sourceEntity.kind);

    if (input.materialKind !== undefined && input.materialKind !== candidateMaterialKind) {
      continue;
    }

    candidateInputs.push({
      candidate,
      sourceEntity,
      sourceRefKey: refKey(sourceEntity.sourceRef),
    });
  }

  return candidateInputs;
}

function descriptorsSetIfAbsent(
  descriptors: Map<string, SearchDescriptor>,
  descriptor: SearchDescriptor,
): void {
  const key = descriptorKey(descriptor);
  if (!descriptors.has(key)) {
    descriptors.set(key, descriptor);
  }
}

async function providerResolvedMaterialsBySourceRefKey(input: {
  db: MusicDatabaseContext;
  ownerScope: string;
  sourceRefKeys: readonly string[];
}): Promise<ReadonlyMap<string, ProviderResolvedMaterialLookup>> {
  const sourceRefKeys = [...new Set(input.sourceRefKeys)].sort();
  if (sourceRefKeys.length === 0) {
    return new Map();
  }

  const rows = await input.db.all<ProviderResolvedMaterialLookupRow>(
    `
      SELECT
        b.source_ref_key,
        b.material_ref_key,
        m.kind AS material_kind,
        CASE WHEN EXISTS (
          SELECT 1
          FROM owner_material_relations r
          WHERE r.owner_scope = ?
            AND r.material_ref_key = b.material_ref_key
            AND r.relation_kind = 'blocked'
            AND r.status = 'active'
        ) THEN 1 ELSE 0 END AS blocked,
        d.fields_json,
        d.title_text,
        d.artist_text,
        d.album_text,
        d.version_text,
        d.alias_text,
        d.search_text
      FROM source_material_bindings b
      JOIN material_records m
        ON m.ref_key = b.material_ref_key
      LEFT JOIN search_metadata_documents d
        ON d.material_ref_key = b.material_ref_key
      WHERE b.source_ref_key IN (${sqlPlaceholders(sourceRefKeys.length)})
        AND m.lifecycle_status = 'active'
      ORDER BY b.source_ref_key ASC
    `,
    [input.ownerScope, ...sourceRefKeys],
  );

  const resolvedMaterials = new Map<string, ProviderResolvedMaterialLookup>();
  for (const row of rows) {
    const descriptor = providerResolvedMaterialDescriptorFromRow(row);
    resolvedMaterials.set(row.source_ref_key, {
      materialKind: row.material_kind,
      blocked: Number(row.blocked) === 1,
      ...(descriptor === undefined ? {} : { descriptor }),
    });
  }

  return resolvedMaterials;
}

function providerResolvedMaterialDescriptorFromRow(
  row: ProviderResolvedMaterialLookupRow,
): SearchDescriptor | undefined {
  if (
    row.fields_json === null ||
    row.title_text === null ||
    row.artist_text === null ||
    row.album_text === null ||
    row.version_text === null ||
    row.alias_text === null ||
    row.search_text === null
  ) {
    return undefined;
  }

  return materialDescriptorFromMetadataRow({
    material_ref_key: row.material_ref_key,
    material_kind: row.material_kind,
    fields_json: row.fields_json,
    title_text: row.title_text,
    artist_text: row.artist_text,
    album_text: row.album_text,
    version_text: row.version_text,
    alias_text: row.alias_text,
    search_text: row.search_text,
  });
}

function localMetadataWindowSql(
  poolFilter: NormalizedDurablePoolFilter,
  materialKind: MaterialEntityKind | undefined,
): string {
  const whereClauses = catalogBaseWhereClauses(poolFilter, materialKind);

  return `
    SELECT
      c.material_ref_key,
      d.material_kind,
      d.title_text AS "titleText",
      d.artist_text AS "artistText",
      d.album_text AS "albumText",
      d.version_text AS "versionText",
      d.alias_text AS "aliasText",
      d.search_text AS "searchText",
      ${metadataScoreSql("d", "indexed")} AS score_value,
      -(${metadataScoreSql("d", "indexed")}) AS score_sort_value,
      jsonb_build_object('document', jsonb_build_object('fields', d.fields_json->'fields')) AS evidence_json
    FROM owner_material_catalog_view c
    JOIN material_records m
      ON m.ref_key = c.material_ref_key
    JOIN search_metadata_documents d
      ON d.material_ref_key = c.material_ref_key
    WHERE (${metadataRecallSql("d", "indexed")})
      AND ${whereClauses.map((clause) => `(${clause.trim()})`).join("\n      AND ")}
    ORDER BY score_sort_value ASC, c.material_ref_key ASC
    LIMIT ?
  `;
}

function metadataRecallSql(alias: string, source: MetadataScoreSource): string {
  return `${metadataVectorSql(alias, source)} @@ to_tsquery('simple', ?) OR ${metadataTextSql(alias, source)} % ?`;
}

type MetadataScoreSource = "indexed" | "row_text";

function metadataScoreSql(alias: string, source: MetadataScoreSource): string {
  return `
    (
      ts_rank_cd(${metadataVectorSql(alias, source)}, to_tsquery('simple', ?), 32) +
      similarity(${metadataTextSql(alias, source)}, ?) +
      (0.20 * similarity(${alias}.title_text, ?)) +
      (0.12 * similarity(${alias}.artist_text, ?)) +
      (0.10 * similarity(${alias}.album_text, ?)) +
      (0.05 * similarity(${alias}.version_text, ?)) +
      (0.04 * similarity(${alias}.alias_text, ?))
    )
  `;
}

function metadataVectorSql(alias: string, source: MetadataScoreSource): string {
  if (source === "indexed") {
    return `${alias}.search_vector`;
  }

  return `
    (
      setweight(to_tsvector('simple', COALESCE(${alias}.title_text, '')), 'A') ||
      setweight(to_tsvector('simple', COALESCE(${alias}.artist_text, '')), 'B') ||
      setweight(to_tsvector('simple', COALESCE(${alias}.album_text, '')), 'B') ||
      setweight(to_tsvector('simple', COALESCE(${alias}.version_text, '')), 'C') ||
      setweight(to_tsvector('simple', COALESCE(${alias}.alias_text, '')), 'D')
    )
  `;
}

function metadataTextSql(alias: string, source: MetadataScoreSource): string {
  if (source === "indexed") {
    return `${alias}.search_text`;
  }

  return `
    concat_ws(
      E'\\n',
      NULLIF(${alias}.title_text, ''),
      NULLIF(${alias}.artist_text, ''),
      NULLIF(${alias}.album_text, ''),
      NULLIF(${alias}.version_text, ''),
      NULLIF(${alias}.alias_text, '')
    )
  `;
}

function metadataScoreParams(textQuery: EffectiveTextQuery): readonly MusicDatabaseParameter[] {
  const singleExpression = metadataScoreParamsForSingleExpression(textQuery);
  return [...singleExpression, ...singleExpression];
}

function metadataRecallParams(textQuery: EffectiveTextQuery): readonly MusicDatabaseParameter[] {
  return [
    textQuery.prefixQuery,
    textQuery.normalizedText,
  ];
}

function materialDescriptorFromLocalSearchRow(row: LocalSearchRow): SearchDescriptor {
  return {
    rowKind: "material",
    stableRefKey: row.material_ref_key,
    materialRefKey: row.material_ref_key,
    materialKind: row.material_kind,
    rowKindSort: 0,
    titleText: row.titleText,
    artistText: row.artistText,
    albumText: row.albumText,
    versionText: row.versionText,
    aliasText: row.aliasText,
    searchText: row.searchText,
    evidenceJson: JSON.stringify(row.evidence_json),
  };
}

function materialDescriptorFromMetadataRow(row: {
  material_ref_key: string;
  material_kind: MaterialEntityKind;
  fields_json: unknown;
  title_text: string;
  artist_text: string;
  album_text: string;
  version_text: string;
  alias_text: string;
  search_text: string;
}): SearchDescriptor {
  return {
    rowKind: "material",
    stableRefKey: row.material_ref_key,
    materialRefKey: row.material_ref_key,
    materialKind: row.material_kind,
    rowKindSort: 0,
    titleText: row.title_text,
    artistText: row.artist_text,
    albumText: row.album_text,
    versionText: row.version_text,
    aliasText: row.alias_text,
    searchText: row.search_text,
    evidenceJson: JSON.stringify({
      document: {
        fields: (row.fields_json as { fields?: unknown }).fields,
      },
    }),
  };
}

async function insertSearchResultSet(input: {
  db: MusicDatabaseContext;
  resultSetId: string;
  queryFingerprint: string;
  rowCount: number;
  expiresAt: string;
  createdAt: string;
}): Promise<void> {
  await input.db.run(
    `
      INSERT INTO search_result_sets (
        result_set_id,
        query_fingerprint,
        row_count,
        expires_at,
        created_at
      )
      VALUES (?, ?, ?, ?::timestamptz, ?)
    `,
    [
      input.resultSetId,
      input.queryFingerprint,
      input.rowCount,
      input.expiresAt,
      input.createdAt,
    ],
  );
}

async function insertSearchResultRows(input: {
  db: MusicDatabaseContext;
  resultSetId: string;
  descriptors: readonly SearchDescriptor[];
}): Promise<void> {
  for (let offset = 0; offset < input.descriptors.length; offset += SEARCH_RESULT_ROW_INSERT_CHUNK_SIZE) {
    const chunk = input.descriptors.slice(offset, offset + SEARCH_RESULT_ROW_INSERT_CHUNK_SIZE);
    const valuesSql = chunk.map(() =>
      "(?, ?, ?, ?, ?, ?, ?, 0, 0, ?::jsonb, ?, ?, ?, ?, ?)"
    ).join(",\n          ");
    const params = searchResultRowInsertParams({
      resultSetId: input.resultSetId,
      descriptors: chunk,
    });

    await input.db.run(
      `
        INSERT INTO search_result_rows (
          result_set_id,
          row_kind,
          stable_ref_key,
          material_ref_key,
          material_candidate_ref_key,
          material_kind,
          row_kind_sort,
          score_value,
          score_sort_value,
          evidence_json,
          title_text,
          artist_text,
          album_text,
          version_text,
          alias_text
        )
        VALUES ${valuesSql}
      `,
      params,
    );
  }
}

function searchResultRowInsertParams(input: {
  resultSetId: string;
  descriptors: readonly SearchDescriptor[];
}): readonly MusicDatabaseParameter[] {
  const params: MusicDatabaseParameter[] = [];

  for (const descriptor of input.descriptors) {
    params.push(
      input.resultSetId,
      descriptor.rowKind,
      descriptor.stableRefKey,
      descriptor.materialRefKey ?? null,
      descriptor.materialCandidateRefKey ?? null,
      descriptor.materialKind ?? null,
      descriptor.rowKindSort,
      descriptor.evidenceJson,
      descriptor.titleText,
      descriptor.artistText,
      descriptor.albumText,
      descriptor.versionText,
      descriptor.aliasText,
    );
  }

  if (params.length !== input.descriptors.length * SEARCH_RESULT_ROW_INSERT_PARAMETER_COUNT) {
    throw invalidMetadataLookupSearch("Search result row insert parameter count is inconsistent.");
  }

  return params;
}

async function rerankSearchResultRows(input: {
  db: MusicDatabaseContext;
  resultSetId: string;
  textQuery: EffectiveTextQuery;
}): Promise<void> {
  await input.db.run(
    `
      WITH ranked AS (
        SELECT
          result_set_id,
          row_kind,
          stable_ref_key,
          ${metadataScoreSql("r", "row_text")} AS score_value
        FROM search_result_rows r
        WHERE r.result_set_id = ?
          AND (${metadataRecallSql("r", "row_text")})
      )
      UPDATE search_result_rows r
      SET score_value = ranked.score_value,
          score_sort_value = -ranked.score_value
      FROM ranked
      WHERE r.result_set_id = ranked.result_set_id
        AND r.row_kind = ranked.row_kind
        AND r.stable_ref_key = ranked.stable_ref_key
    `,
    [
      ...metadataScoreParamsForSingleExpression(input.textQuery),
      input.resultSetId,
      ...metadataRecallParams(input.textQuery),
    ],
  );
}

function metadataScoreParamsForSingleExpression(
  textQuery: EffectiveTextQuery,
): readonly MusicDatabaseParameter[] {
  return [
    textQuery.prefixQuery,
    textQuery.normalizedText,
    textQuery.normalizedText,
    textQuery.normalizedText,
    textQuery.normalizedText,
    textQuery.normalizedText,
    textQuery.normalizedText,
  ];
}

async function pruneUnmatchedSearchResultRows(input: {
  db: MusicDatabaseContext;
  resultSetId: string;
  textQuery: EffectiveTextQuery;
}): Promise<void> {
  await input.db.run(
    `
      DELETE FROM search_result_rows r
      WHERE r.result_set_id = ?
        AND NOT (${metadataRecallSql("r", "row_text")})
    `,
    [
      input.resultSetId,
      ...metadataRecallParams(input.textQuery),
    ],
  );
}

async function refreshSearchResultSetRowCount(input: {
  db: MusicDatabaseContext;
  resultSetId: string;
}): Promise<void> {
  await input.db.run(
    `
      UPDATE search_result_sets
      SET row_count = (
        SELECT COUNT(*)
        FROM search_result_rows
        WHERE result_set_id = ?
      )
      WHERE result_set_id = ?
    `,
    [
      input.resultSetId,
      input.resultSetId,
    ],
  );
}

async function cleanupExpiredSearchResultSets(input: {
  db: MusicDatabaseContext;
  now: string;
}): Promise<void> {
  await input.db.run(
    `
      WITH expired AS (
        SELECT result_set_id
        FROM search_result_sets
        WHERE expires_at <= ?::timestamptz
        ORDER BY expires_at ASC, result_set_id ASC
        LIMIT 500
      )
      DELETE FROM search_result_rows r
      USING expired e
      WHERE r.result_set_id = e.result_set_id
    `,
    [input.now],
  );
  await input.db.run(
    `
      WITH expired AS (
        SELECT result_set_id
        FROM search_result_sets
        WHERE expires_at <= ?::timestamptz
        ORDER BY expires_at ASC, result_set_id ASC
        LIMIT 500
      )
      DELETE FROM search_result_sets s
      USING expired e
      WHERE s.result_set_id = e.result_set_id
    `,
    [input.now],
  );
}

function searchResultPageSql(
  cursorPosition: MetadataLookupSearchCursorPosition | undefined,
): string {
  const cursorClause = searchCursorClause(cursorPosition);

  return `
    SELECT
      r.row_kind,
      r.stable_ref_key,
      r.material_ref_key,
      r.material_candidate_ref_key,
      r.material_kind,
      r.row_kind_sort,
      r.score_value,
      r.score_sort_value,
      r.evidence_json,
      r.title_text AS "titleText",
      r.artist_text AS "artistText",
      r.album_text AS "albumText",
      r.version_text AS "versionText",
      r.alias_text AS "aliasText",
      ${metadataTextSql("r", "row_text")} AS "searchText",
      c.material_candidate_ref_key AS candidate_cache_ref_key,
      ${comparableTimestampSql("c.expires_at")} AS candidate_expires_at
    FROM search_result_rows r
    LEFT JOIN material_candidate_cache c
      ON c.material_candidate_ref_key = r.material_candidate_ref_key
    WHERE r.result_set_id = ?
      ${cursorClause === undefined ? "" : `AND (${cursorClause})`}
    ORDER BY
      r.score_sort_value ASC,
      r.row_kind_sort ASC,
      r.stable_ref_key ASC
    LIMIT ?
  `;
}

function searchResultPageParams(input: {
  resultSetId: string;
  limit: number;
  cursorPosition: MetadataLookupSearchCursorPosition | undefined;
}): readonly MusicDatabaseParameter[] {
  const params: MusicDatabaseParameter[] = [input.resultSetId];

  if (input.cursorPosition !== undefined) {
    params.push(
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

function searchCursorClause(
  cursorPosition: MetadataLookupSearchCursorPosition | undefined,
): string | undefined {
  if (cursorPosition === undefined) {
    return undefined;
  }

  validatedSearchCursorPosition(cursorPosition);

  return `
    r.score_sort_value > ?
    OR (
      r.score_sort_value = ?
      AND (
        r.row_kind_sort > ?
        OR (
          r.row_kind_sort = ?
          AND r.stable_ref_key > ?
        )
      )
    )
  `;
}

function searchRowFromSqlRow(row: SearchResultRow): MusicDataPlatformMetadataLookupSearchRow {
  const base = {
    titleText: row.titleText,
    artistText: row.artistText,
    albumText: row.albumText,
    versionText: row.versionText,
    aliasText: row.aliasText,
    searchText: row.searchText,
    matchedPoolRefs: [],
    rankScore: {
      kind: "postgres_text_rank" as const,
      value: row.score_value,
    },
  };

  if (row.row_kind === "material") {
    if (row.material_ref_key === null || row.material_kind === null) {
      throw invalidMetadataLookupSearch("Search material row is missing durable material fields.");
    }

    return {
      kind: "material",
      materialRef: materialRefFromKey(row.material_ref_key, row.material_kind),
      materialKind: row.material_kind,
      ...base,
    };
  }

  if (row.row_kind === "material_candidate") {
    if (row.material_candidate_ref_key === null) {
      throw invalidMetadataLookupSearch("Search material candidate row is missing materialCandidateRefKey.");
    }

    return {
      kind: "material_candidate",
      materialCandidateRef: materialCandidateRefFromKey(row.material_candidate_ref_key),
      ...base,
    };
  }

  throw invalidMetadataLookupSearch(`Unsupported search row kind '${row.row_kind}'.`);
}

function cursorPositionFromSqlRow(row: SearchResultRow): MetadataLookupSearchCursorPosition {
  return {
    order: "text_relevance",
    matchedTokenCount: 1,
    bestFieldPriority: 1,
    rankSortValue: row.score_sort_value,
    rowKind: row.row_kind,
    stableRefKey: row.stable_ref_key,
  };
}

function candidateCacheExpired(row: SearchResultRow, now: string): boolean {
  if (row.row_kind !== "material_candidate") {
    return false;
  }

  return row.candidate_cache_ref_key === null ||
    row.candidate_expires_at === null ||
    row.candidate_expires_at <= now;
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
      throw invalidMetadataLookupSearch(
        "Metadata lookup durable pools cannot place the same ref in positive and noneOf groups.",
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
        throw invalidMetadataLookupSearch(
          "Metadata lookup durable pools support only source_library and owner_material_relation_pool refs.",
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
    deduped.set(refKey(ref), {
      namespace: ref.namespace,
      kind: ref.kind,
      id: ref.id,
    });
  }

  return [...deduped.values()];
}

function refsToKeys(refs: readonly Ref[]): readonly string[] {
  return refs.map((ref) => refKey(ref));
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
      message: "Metadata lookup source library pool does not exist.",
    });
  }

  if (row.owner_scope !== ownerScope) {
    throw new MusicDataPlatformError({
      code: "music_data.source_library_owner_scope_mismatch",
      message: "Metadata lookup source library pool belongs to a different owner scope.",
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
      message: "Metadata lookup owner relation pool belongs to a different owner scope.",
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

function validatedProviderCandidate(candidate: ProviderMaterialCandidate): SourceEntity {
  if (typeof candidate !== "object" || candidate === null) {
    throw invalidMetadataLookupSearch("Provider material candidate must be an object.");
  }

  if (candidate.providerScore !== undefined && !Number.isFinite(candidate.providerScore)) {
    throw invalidMetadataLookupSearch("Provider material candidate providerScore must be finite.");
  }

  const sourceEntity = candidate.sourceEntity;

  if (typeof sourceEntity !== "object" || sourceEntity === null) {
    throw invalidMetadataLookupSearch("Provider material candidate must include a sourceEntity.");
  }

  if (
    sourceEntity.kind !== "track" &&
    sourceEntity.kind !== "album" &&
    sourceEntity.kind !== "artist"
  ) {
    throw invalidMetadataLookupSearch("Provider material candidate source kind is unsupported.");
  }

  refKey(sourceEntity.sourceRef);

  if (
    typeof sourceEntity.providerId !== "string" ||
    sourceEntity.providerId.length === 0 ||
    typeof sourceEntity.providerEntityId !== "string" ||
    sourceEntity.providerEntityId.length === 0
  ) {
    throw invalidMetadataLookupSearch("Provider material candidate source identity is invalid.");
  }

  if (typeof sourceEntity.label !== "string" || sourceEntity.label.length === 0) {
    throw invalidMetadataLookupSearch("Provider material candidate source label is invalid.");
  }

  return sourceEntity;
}

function effectiveTextQuery(text: string): EffectiveTextQuery {
  const normalizedText = normalizeSearchMetadataValue(text);

  if (normalizedText.length === 0) {
    throw invalidMetadataLookupSearch("Metadata lookup requires effective query text.");
  }

  const tokens = buildSearchMetadataPrefixQueryTokens(normalizedText);
  if (tokens.length === 0) {
    throw invalidMetadataLookupSearch("Metadata lookup requires tokenizable query text.");
  }

  return {
    normalizedText,
    tokens,
    prefixQuery: buildSearchMetadataPrefixOrQuery(normalizedText),
  };
}

function materialRefFromKey(materialRefKey: string, materialKind: MaterialEntityKind): Ref {
  const parsed = parseRefKey(materialRefKey);

  if (parsed === undefined) {
    throw invalidMetadataLookupSearch("Material ref key must be a namespace:kind:id ref key.");
  }

  assertMaterialRef(parsed);

  if (parsed.kind !== materialKind) {
    throw new MusicDataPlatformError({
      code: "music_data.record_kind_mismatch",
      message: "Search result material ref kind does not match stored material kind.",
    });
  }

  return parsed;
}

function materialCandidateRefFromKey(materialCandidateRefKey: string): Ref {
  const ref = parseRefKey(materialCandidateRefKey);
  if (ref === undefined) {
    throw invalidMetadataLookupSearch("Material candidate ref key must be a namespace:kind:id ref key.");
  }
  return ref;
}

function createResultSetId(): string {
  return `srs_${randomUUID()}`;
}

function validatedOwnerScope(ownerScope: string): string {
  assertOwnerScope(ownerScope);

  if (ownerScope !== DEFAULT_OWNER_SCOPE) {
    throw new MusicDataPlatformError({
      code: "music_data.owner_scope_unsupported",
      message: "Metadata lookup currently supports only the default owner scope.",
    });
  }

  return ownerScope;
}

function validatedLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw invalidMetadataLookupSearch("Metadata lookup limit must be an integer from 1 through 100.");
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
    throw invalidMetadataLookupSearch("Metadata lookup materialKind is unsupported.");
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
    throw invalidMetadataLookupSearch("Metadata lookup query fingerprint must be non-empty.");
  }

  return queryFingerprint;
}

function validatedResultSetId(resultSetId: string): string {
  if (typeof resultSetId !== "string" || resultSetId.length === 0) {
    throw invalidMetadataLookupSearch("Metadata lookup resultSetId must be non-empty.");
  }

  return resultSetId;
}

function validatedSearchCursorPosition(position: MetadataLookupSearchCursorPosition): void {
  if (
    position.order !== "text_relevance" ||
    position.matchedTokenCount !== 1 ||
    position.bestFieldPriority !== 1 ||
    !Number.isFinite(position.rankSortValue) ||
    (position.rowKind !== "material" && position.rowKind !== "material_candidate") ||
    typeof position.stableRefKey !== "string" ||
    position.stableRefKey.length === 0
  ) {
    throw invalidMetadataLookupSearch("Metadata lookup cursor position is invalid.");
  }
}

function descriptorKey(descriptor: SearchDescriptor): string {
  return `${descriptor.rowKind}\u0000${descriptor.stableRefKey}`;
}

function rowKindSort(rowKind: "material" | "material_candidate"): 0 | 1 {
  return rowKind === "material" ? 0 : 1;
}

function invalidMetadataLookupSearch(message: string, cause?: unknown): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.retrieval_result_set_invalid",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
