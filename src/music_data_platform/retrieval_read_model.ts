import {
  refKey,
  type MaterialEntityKind,
  type PlatformLibraryKind,
  type Ref,
} from "../contracts/index.js";
import type {
  MusicDatabaseContext,
  MusicDatabaseParameter,
} from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import {
  buildMaterialTextPrefixOrQuery,
  buildMaterialTextPrefixQueryTokens,
  normalizeMaterialTextValue,
} from "./material_text_normalization.js";
import {
  assertOwnerRelationPoolRef,
  createOwnerRelationPoolRef,
  type OwnerRelationEntryKind,
} from "./owner_material_relation_ref.js";
import { DEFAULT_OWNER_SCOPE, assertOwnerScope } from "./owner_scope.js";
import {
  assertMusicDataPlatformPublicRefKey,
  musicDataPlatformRefKey,
} from "./ref_validation.js";
import { assertSourceLibraryRef, createSourceLibraryRef } from "./source_library_ref.js";

export type RetrievalOrder =
  | "text_relevance"
  | "recently_added"
  | "stable";

export type RetrievalTextField =
  | "title"
  | "artist"
  | "album"
  | "version"
  | "alias";

export type RetrievalReadPoolFilter = {
  allOf?: readonly Ref[];
  anyOf?: readonly Ref[];
  noneOf?: readonly Ref[];
};

export type RetrievalMatchedTextTokenEvidence = {
  field: RetrievalTextField;
  tokens: readonly string[];
};

export type RetrievalReadCursorPosition =
  | {
      order: "text_relevance";
      matchedTokenCount: number;
      bestFieldPriority: number;
      rankSortValue: number;
      materialRefKey: string;
    }
  | {
      order: "recently_added";
      recentlyAddedAt: string;
      materialRefKey: string;
    }
  | {
      order: "stable";
      materialRefKey: string;
    };

export type RetrievalFreshness = {
  status: "current" | "possibly_stale";
  dirtyTargetCount?: number;
  failedTargetCount?: number;
};

export type MusicDataPlatformRetrievalSearchInput = {
  ownerScope: string;
  text?: string;
  materialKind?: MaterialEntityKind;
  poolFilter?: RetrievalReadPoolFilter;
  order: RetrievalOrder;
  limit: number;
  cursorPosition?: RetrievalReadCursorPosition;
};

export type MusicDataPlatformRetrievalMaterialRow = {
  materialRef: Ref;
  materialKind: MaterialEntityKind;
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
  aliasText: string;
  recentlyAddedAt: string;
  matchedPoolRefs: readonly Ref[];
  matchedTextFields: readonly RetrievalTextField[];
  matchedTextTokensByField?: readonly RetrievalMatchedTextTokenEvidence[];
  matchedTokenCount?: number;
  rankScore?: {
    kind: "fts_bm25";
    value: number;
  };
};

export type MusicDataPlatformRetrievalSearchPage = {
  rows: readonly MusicDataPlatformRetrievalMaterialRow[];
  nextCursorPosition?: RetrievalReadCursorPosition;
};

export type CreateMusicDataPlatformRetrievalReadPortInput = {
  db: MusicDatabaseContext;
};

export type MusicDataPlatformRetrievalReadPort = {
  searchOwnerCatalogMaterials(
    input: MusicDataPlatformRetrievalSearchInput,
  ): MusicDataPlatformRetrievalSearchPage;
  getRetrievalFreshness(input: {
    ownerScope: string;
  }): RetrievalFreshness;
};

type SearchCatalogRow = {
  material_ref_key: string;
  material_kind: MaterialEntityKind;
  material_entity_json: string;
  recently_added_at: string;
  title_text: string;
  artist_text: string;
  album_text: string;
  version_text: string;
  alias_text: string;
  matched_token_count?: number;
  best_field_priority?: number;
  rank_sort_value?: number;
};

type MatchedPoolEntryRow = {
  material_ref_key: string;
  entry_ref_key: string;
};

type MatchedTextEvidenceRow = {
  material_ref_key: string;
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
  library_kind: string;
};

type CountRow = {
  count: number;
};

type MaterialEntityPayload = {
  materialRef?: unknown;
  kind?: unknown;
};

type NormalizedRetrievalReadPoolFilter = {
  allOf: readonly Ref[];
  anyOf: readonly Ref[];
  noneOf: readonly Ref[];
  allOfRefKeys: readonly string[];
  anyOfRefKeys: readonly string[];
  noneOfRefKeys: readonly string[];
  positiveRefKeys: readonly string[];
  positiveRefByKey: ReadonlyMap<string, Ref>;
  hasFilter: boolean;
};

type RetrievalEffectiveTextQuery = {
  normalizedText: string;
  tokens: readonly string[];
  matchQuery: string;
};

type RetrievalRowTextEvidence = {
  matchedTextFields: readonly RetrievalTextField[];
  matchedTextTokensByField: readonly RetrievalMatchedTextTokenEvidence[];
  matchedTokenCount: number;
  bestFieldPriority: number;
};

const retrievalTextFieldConfigs = [
  { field: "title", column: "title_text", priority: 1 },
  { field: "artist", column: "artist_text", priority: 2 },
  { field: "album", column: "album_text", priority: 2 },
  { field: "version", column: "version_text", priority: 3 },
  { field: "alias", column: "alias_text", priority: 4 },
] as const satisfies readonly {
  field: RetrievalTextField;
  column: string;
  priority: number;
}[];
const comparableTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function createMusicDataPlatformRetrievalReadPort(
  input: CreateMusicDataPlatformRetrievalReadPortInput,
): MusicDataPlatformRetrievalReadPort {
  const { db } = input;

  return {
    searchOwnerCatalogMaterials(readInput) {
      const ownerScope = validatedOwnerScope(readInput.ownerScope);
      const order = validatedOrder(readInput.order);
      const limit = validatedLimit(readInput.limit);
      const materialKind = validatedMaterialKind(readInput.materialKind);
      const poolFilter = normalizePoolFilter(readInput.poolFilter);
      const effectiveTextQuery = normalizeEffectiveTextQuery(readInput.text);
      const cursorPosition = validatedCursorPosition(
        readInput.cursorPosition,
        order,
        effectiveTextQuery !== undefined,
      );
      validatePoolRefs(db, ownerScope, poolFilter);

      const selectedRows = effectiveTextQuery === undefined
        ? db.all<SearchCatalogRow>(
          searchSqlForOrder(order, poolFilter, materialKind, cursorPosition),
          searchParamsForOrder({
            ownerScope,
            materialKind,
            poolFilter,
            cursorPosition,
            limit: limit + 1,
          }),
        )
        : db.all<SearchCatalogRow>(
          searchSqlForText(order, poolFilter, materialKind, cursorPosition, effectiveTextQuery),
          searchParamsForText({
            ownerScope,
            materialKind,
            poolFilter,
            cursorPosition,
            limit: limit + 1,
          }),
        );

      const visibleRows = selectedRows.slice(0, limit);
      const matchedPoolRefsByMaterial = matchedPoolRefsByMaterialRefKey(
        db,
        ownerScope,
        visibleRows.map((row) => row.material_ref_key),
        poolFilter,
      );
      const matchedTextEvidenceByMaterial = effectiveTextQuery === undefined
        ? undefined
        : matchedTextEvidenceByMaterialRefKey(
          db,
          visibleRows.map((row) => row.material_ref_key),
          effectiveTextQuery.tokens,
        );

      return {
        rows: visibleRows.map((row) => searchResultRowFromCatalogRow(
          row,
          matchedPoolRefsByMaterial.get(row.material_ref_key) ?? [],
          matchedTextEvidenceByMaterial?.get(row.material_ref_key),
          order,
          effectiveTextQuery !== undefined,
        )),
        ...(selectedRows.length > limit && visibleRows.length > 0
          ? { nextCursorPosition: cursorPositionFromCatalogRow(order, visibleRows[visibleRows.length - 1]!) }
          : {}),
      };
    },
    getRetrievalFreshness(readInput) {
      const ownerScope = validatedOwnerScope(readInput.ownerScope);
      const dirtyTargetCount = countDirtyTargets(db, ownerScope, "dirty");
      const failedTargetCount = countDirtyTargets(db, ownerScope, "failed");

      if (dirtyTargetCount === 0 && failedTargetCount === 0) {
        return { status: "current" };
      }

      return {
        status: "possibly_stale",
        ...(dirtyTargetCount === 0 ? {} : { dirtyTargetCount }),
        ...(failedTargetCount === 0 ? {} : { failedTargetCount }),
      };
    },
  };
}

function validatedOwnerScope(ownerScope: string): string {
  assertOwnerScope(ownerScope);

  if (ownerScope !== DEFAULT_OWNER_SCOPE) {
    throw new MusicDataPlatformError({
      code: "music_data.owner_scope_unsupported",
      message: "Phase 12 retrieval currently supports only the default owner scope.",
    });
  }

  return ownerScope;
}

function validatedOrder(value: string): RetrievalOrder {
  if (value !== "text_relevance" && value !== "recently_added" && value !== "stable") {
    throw invalidRetrievalRead(
      "Retrieval read order must be text_relevance, recently_added, or stable.",
    );
  }

  return value;
}

function validatedLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw invalidRetrievalRead(
      "Retrieval read limit must be a positive integer no greater than 100.",
    );
  }

  return value;
}

function validatedMaterialKind(
  value: MaterialEntityKind | undefined,
): MaterialEntityKind | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value !== "recording" &&
    value !== "album" &&
    value !== "artist" &&
    value !== "work" &&
    value !== "release"
  ) {
    throw invalidRetrievalRead(
      "Retrieval read materialKind must be a supported MineMusic material kind.",
    );
  }

  return value;
}

function normalizeEffectiveTextQuery(
  text: string | undefined,
): RetrievalEffectiveTextQuery | undefined {
  if (text === undefined) {
    return undefined;
  }

  const normalizedText = normalizeMaterialTextValue(text);

  if (normalizedText.length === 0) {
    return undefined;
  }

  const tokens = buildMaterialTextPrefixQueryTokens(normalizedText);

  if (tokens.length === 0) {
    return undefined;
  }

  return {
    normalizedText,
    tokens,
    matchQuery: buildMaterialTextPrefixOrQuery(normalizedText),
  };
}

function validatedCursorPosition(
  cursorPosition: RetrievalReadCursorPosition | undefined,
  order: RetrievalOrder,
  hasEffectiveText: boolean,
): RetrievalReadCursorPosition | undefined {
  if (cursorPosition === undefined) {
    return undefined;
  }

  if (cursorPosition.order !== order) {
    throw invalidRetrievalRead(
      "Retrieval read cursor order must match the query order.",
    );
  }

  switch (cursorPosition.order) {
    case "stable":
      assertMusicDataPlatformPublicRefKey({
        refKey: cursorPosition.materialRefKey,
        fieldName: "cursorPosition.materialRefKey",
        code: "music_data.retrieval_read_invalid",
      });
      return cursorPosition;
    case "recently_added":
      assertComparableTimestamp(cursorPosition.recentlyAddedAt, "cursorPosition.recentlyAddedAt");
      assertMusicDataPlatformPublicRefKey({
        refKey: cursorPosition.materialRefKey,
        fieldName: "cursorPosition.materialRefKey",
        code: "music_data.retrieval_read_invalid",
      });
      return cursorPosition;
    case "text_relevance":
      if (!hasEffectiveText) {
        throw invalidRetrievalRead(
          "Retrieval read text_relevance cursors require effective query text.",
        );
      }

      if (
        !Number.isInteger(cursorPosition.matchedTokenCount) ||
        cursorPosition.matchedTokenCount < 1
      ) {
        throw invalidRetrievalRead(
          "cursorPosition.matchedTokenCount must be a positive integer.",
        );
      }

      if (
        !Number.isInteger(cursorPosition.bestFieldPriority) ||
        cursorPosition.bestFieldPriority < 1 ||
        cursorPosition.bestFieldPriority > 4
      ) {
        throw invalidRetrievalRead(
          "cursorPosition.bestFieldPriority must be an integer from 1 through 4.",
        );
      }

      if (!Number.isFinite(cursorPosition.rankSortValue)) {
        throw invalidRetrievalRead(
          "cursorPosition.rankSortValue must be a finite number.",
        );
      }

      assertMusicDataPlatformPublicRefKey({
        refKey: cursorPosition.materialRefKey,
        fieldName: "cursorPosition.materialRefKey",
        code: "music_data.retrieval_read_invalid",
      });
      return cursorPosition;
  }
}

function normalizePoolFilter(
  poolFilter: RetrievalReadPoolFilter | undefined,
): NormalizedRetrievalReadPoolFilter {
  const allOf = normalizePoolRefs(poolFilter?.allOf);
  const anyOf = normalizePoolRefs(poolFilter?.anyOf);
  const noneOf = normalizePoolRefs(poolFilter?.noneOf);

  const allOfRefKeys = allOf.map((ref) => refKey(ref));
  const anyOfRefKeys = anyOf.map((ref) => refKey(ref));
  const noneOfRefKeys = noneOf.map((ref) => refKey(ref));
  const positiveRefByKey = new Map<string, Ref>();

  for (const ref of allOf) {
    positiveRefByKey.set(refKey(ref), ref);
  }
  for (const ref of anyOf) {
    positiveRefByKey.set(refKey(ref), ref);
  }

  for (const positiveRefKey of positiveRefByKey.keys()) {
    if (noneOfRefKeys.includes(positiveRefKey)) {
      throw invalidRetrievalRead(
        "Retrieval read pool filters cannot place the same ref in positive and noneOf groups.",
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
    positiveRefKeys: [...positiveRefByKey.keys()].sort(),
    positiveRefByKey,
    hasFilter: allOf.length > 0 || anyOf.length > 0 || noneOf.length > 0,
  };
}

function normalizePoolRefs(refs: readonly Ref[] | undefined): readonly Ref[] {
  if (refs === undefined || refs.length === 0) {
    return [];
  }

  const deduped = new Map<string, Ref>();
  for (const ref of refs) {
    const key = musicDataPlatformRefKey({
      ref,
      fieldName: "poolFilter ref",
      code: "music_data.retrieval_read_invalid",
    });
    deduped.set(key, ref);
  }

  return [...deduped.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([, ref]) => ref);
}

function validatePoolRefs(
  db: MusicDatabaseContext,
  ownerScope: string,
  poolFilter: NormalizedRetrievalReadPoolFilter,
): void {
  for (const ref of [...poolFilter.allOf, ...poolFilter.anyOf, ...poolFilter.noneOf]) {
    switch (ref.namespace) {
      case "source_library":
        validateSourceLibraryPoolRef(db, ownerScope, ref);
        break;
      case "owner_material_relation_pool":
        validateOwnerRelationPoolRef(ownerScope, ref);
        break;
      default:
        throw invalidRetrievalRead(
          "Retrieval read pool filters support only source_library and owner_material_relation_pool refs.",
        );
    }
  }
}

function validateSourceLibraryPoolRef(
  db: MusicDatabaseContext,
  ownerScope: string,
  libraryRef: Ref,
): void {
  assertSourceLibraryRef(libraryRef);
  const storedRefKey = refKey(libraryRef);
  const row = db.get<SourceLibraryRow>(
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
      message: "Retrieval read source library pool does not exist.",
    });
  }

  if (row.owner_scope !== ownerScope) {
    throw new MusicDataPlatformError({
      code: "music_data.source_library_owner_scope_mismatch",
      message: "Retrieval read source library pool belongs to a different owner scope.",
    });
  }

  const reconstructedRef = createSourceLibraryRef({
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    providerAccountId: row.provider_account_id,
    libraryKind: row.library_kind as PlatformLibraryKind,
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
      message: "Retrieval read owner relation pool ref belongs to a different owner scope.",
    });
  }
}

function searchSqlForOrder(
  order: RetrievalOrder,
  poolFilter: NormalizedRetrievalReadPoolFilter,
  materialKind: MaterialEntityKind | undefined,
  cursorPosition: RetrievalReadCursorPosition | undefined,
): string {
  if (order === "text_relevance") {
    throw invalidRetrievalRead(
      "Retrieval read text_relevance order requires effective query text.",
    );
  }

  const whereClauses = catalogBaseWhereClauses(poolFilter, materialKind);

  if (cursorPosition !== undefined) {
    switch (order) {
      case "stable":
        whereClauses.push("c.material_ref_key > ?");
        break;
      case "recently_added":
        whereClauses.push(`
          (
            c.recently_added_at < ?
            OR (
              c.recently_added_at = ?
              AND c.material_ref_key > ?
            )
          )
        `);
        break;
    }
  }

  return `
    SELECT
      c.material_ref_key,
      m.kind AS material_kind,
      m.entity_json AS material_entity_json,
      c.recently_added_at,
      COALESCE(t.title_text, '') AS title_text,
      COALESCE(t.artist_text, '') AS artist_text,
      COALESCE(t.album_text, '') AS album_text,
      COALESCE(t.version_text, '') AS version_text,
      COALESCE(t.alias_text, '') AS alias_text
    FROM owner_material_catalog_view c
    JOIN material_records m
      ON m.ref_key = c.material_ref_key
    LEFT JOIN material_text_documents t
      ON t.material_ref_key = c.material_ref_key
    WHERE ${whereClauses.map((clause) => `(${clause.trim()})`).join("\n      AND ")}
    ORDER BY ${order === "stable"
      ? "c.material_ref_key ASC"
      : "c.recently_added_at DESC, c.material_ref_key ASC"}
    LIMIT ?
  `;
}

function searchParamsForOrder(input: {
  ownerScope: string;
  materialKind: MaterialEntityKind | undefined;
  poolFilter: NormalizedRetrievalReadPoolFilter;
  cursorPosition: RetrievalReadCursorPosition | undefined;
  limit: number;
}): readonly MusicDatabaseParameter[] {
  const params: MusicDatabaseParameter[] = catalogBaseParams(
    input.ownerScope,
    input.materialKind,
    input.poolFilter,
  );

  if (input.cursorPosition !== undefined) {
    switch (input.cursorPosition.order) {
      case "stable":
        params.push(input.cursorPosition.materialRefKey);
        break;
      case "recently_added":
        params.push(
          input.cursorPosition.recentlyAddedAt,
          input.cursorPosition.recentlyAddedAt,
          input.cursorPosition.materialRefKey,
        );
        break;
      case "text_relevance":
        throw invalidRetrievalRead(
          "Retrieval read text_relevance cursors require effective query text.",
        );
    }
  }

  params.push(input.limit);
  return params;
}

function catalogBaseWhereClauses(
  poolFilter: NormalizedRetrievalReadPoolFilter,
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
  poolFilter: NormalizedRetrievalReadPoolFilter,
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

function searchSqlForText(
  order: RetrievalOrder,
  poolFilter: NormalizedRetrievalReadPoolFilter,
  materialKind: MaterialEntityKind | undefined,
  cursorPosition: RetrievalReadCursorPosition | undefined,
  textQuery: RetrievalEffectiveTextQuery,
): string {
  const whereClauses = catalogBaseWhereClauses(poolFilter, materialKind);
  const matchedTokenCountSql = matchedTokenCountSqlExpression(textQuery.tokens);
  const bestFieldPrioritySql = bestFieldPrioritySqlExpression(textQuery.tokens);
  const cursorClause = textCursorClause(order, cursorPosition);

  return `
    WITH matched_catalog AS (
      SELECT
        c.material_ref_key,
        m.kind AS material_kind,
        m.entity_json AS material_entity_json,
        c.recently_added_at,
        t.title_text,
        t.artist_text,
        t.album_text,
        t.version_text,
        t.alias_text,
        ${matchedTokenCountSql} AS matched_token_count,
        ${bestFieldPrioritySql} AS best_field_priority,
        bm25(material_text_fts, 1.0, 1.0, 1.0, 1.0, 1.0) AS rank_sort_value
      FROM owner_material_catalog_view c
      JOIN material_records m
        ON m.ref_key = c.material_ref_key
      JOIN material_text_documents t
        ON t.material_ref_key = c.material_ref_key
      JOIN material_text_fts
        ON material_text_fts.material_ref_key = c.material_ref_key
      WHERE material_text_fts MATCH ${sqlStringLiteral(textQuery.matchQuery)}
        AND ${whereClauses.map((clause) => `(${clause.trim()})`).join("\n        AND ")}
    )
    SELECT
      material_ref_key,
      material_kind,
      material_entity_json,
      recently_added_at,
      title_text,
      artist_text,
      album_text,
      version_text,
      alias_text,
      matched_token_count,
      best_field_priority,
      rank_sort_value
    FROM matched_catalog
    ${cursorClause === undefined ? "" : `WHERE ${cursorClause}`}
    ORDER BY ${textOrderBySql(order)}
    LIMIT ?
  `;
}

function searchParamsForText(input: {
  ownerScope: string;
  materialKind: MaterialEntityKind | undefined;
  poolFilter: NormalizedRetrievalReadPoolFilter;
  cursorPosition: RetrievalReadCursorPosition | undefined;
  limit: number;
}): readonly MusicDatabaseParameter[] {
  const params: MusicDatabaseParameter[] = catalogBaseParams(
    input.ownerScope,
    input.materialKind,
    input.poolFilter,
  );

  if (input.cursorPosition !== undefined) {
    switch (input.cursorPosition.order) {
      case "stable":
        params.push(input.cursorPosition.materialRefKey);
        break;
      case "recently_added":
        params.push(
          input.cursorPosition.recentlyAddedAt,
          input.cursorPosition.recentlyAddedAt,
          input.cursorPosition.materialRefKey,
        );
        break;
      case "text_relevance":
        params.push(
          input.cursorPosition.matchedTokenCount,
          input.cursorPosition.matchedTokenCount,
          input.cursorPosition.bestFieldPriority,
          input.cursorPosition.bestFieldPriority,
          input.cursorPosition.rankSortValue,
          input.cursorPosition.rankSortValue,
          input.cursorPosition.materialRefKey,
        );
        break;
    }
  }

  params.push(input.limit);
  return params;
}

function matchedTokenCountSqlExpression(tokens: readonly string[]): string {
  return tokens.map((token) => `
      CASE
        WHEN ${anyFieldMatchSqlExpression(token)}
        THEN 1
        ELSE 0
      END
    `).join(" + ");
}

function bestFieldPrioritySqlExpression(tokens: readonly string[]): string {
  return `
    CASE
      WHEN ${fieldMatchesAnyTokenSqlExpression("title_text", tokens)}
      THEN 1
      WHEN ${fieldMatchesAnyTokenSqlExpression("artist_text", tokens)}
        OR ${fieldMatchesAnyTokenSqlExpression("album_text", tokens)}
      THEN 2
      WHEN ${fieldMatchesAnyTokenSqlExpression("version_text", tokens)}
      THEN 3
      WHEN ${fieldMatchesAnyTokenSqlExpression("alias_text", tokens)}
      THEN 4
      ELSE 5
    END
  `;
}

function anyFieldMatchSqlExpression(token: string): string {
  return `(${retrievalTextFieldConfigs
    .map((field) => fieldMatchSqlExpression(field.column, token))
    .join(" OR ")})`;
}

function fieldMatchesAnyTokenSqlExpression(
  fieldColumn: string,
  tokens: readonly string[],
): string {
  return `(${tokens
    .map((token) => fieldMatchSqlExpression(fieldColumn, token))
    .join(" OR ")})`;
}

function fieldMatchSqlExpression(fieldColumn: string, token: string): string {
  return `
    EXISTS (
      SELECT 1
      FROM material_text_fts mf
      WHERE mf.rowid = material_text_fts.rowid
        AND material_text_fts MATCH ${sqlStringLiteral(fieldScopedPrefixQuery(fieldColumn, token))}
    )
  `.trim();
}

function fieldScopedPrefixQuery(fieldColumn: string, token: string): string {
  return `${fieldColumn} : ${quotedPrefixQueryToken(token)}`;
}

function quotedPrefixQueryToken(token: string): string {
  return `"${token.replaceAll('"', '""')}"*`;
}

function textCursorClause(
  order: RetrievalOrder,
  cursorPosition: RetrievalReadCursorPosition | undefined,
): string | undefined {
  if (cursorPosition === undefined) {
    return undefined;
  }

  switch (order) {
    case "stable":
      return "material_ref_key > ?";
    case "recently_added":
      return `
        (
          recently_added_at < ?
          OR (
            recently_added_at = ?
            AND material_ref_key > ?
          )
        )
      `;
    case "text_relevance":
      return `
        (
          matched_token_count < ?
          OR (
            matched_token_count = ?
            AND (
              best_field_priority > ?
              OR (
                best_field_priority = ?
                AND (
                  rank_sort_value > ?
                  OR (
                    rank_sort_value = ?
                    AND material_ref_key > ?
                  )
                )
              )
            )
          )
        )
      `;
  }
}

function textOrderBySql(order: RetrievalOrder): string {
  switch (order) {
    case "stable":
      return "material_ref_key ASC";
    case "recently_added":
      return "recently_added_at DESC, material_ref_key ASC";
    case "text_relevance":
      return "matched_token_count DESC, best_field_priority ASC, rank_sort_value ASC, material_ref_key ASC";
  }
}

function matchedPoolRefsByMaterialRefKey(
  db: MusicDatabaseContext,
  ownerScope: string,
  materialRefKeys: readonly string[],
  poolFilter: NormalizedRetrievalReadPoolFilter,
): ReadonlyMap<string, readonly Ref[]> {
  if (materialRefKeys.length === 0 || poolFilter.positiveRefKeys.length === 0) {
    return new Map();
  }

  const rows = db.all<MatchedPoolEntryRow>(
    `
      SELECT
        material_ref_key,
        entry_ref_key
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND active = 1
        AND visibility_role = 'positive'
        AND material_ref_key IN (${sqlPlaceholders(materialRefKeys.length)})
        AND entry_ref_key IN (${sqlPlaceholders(poolFilter.positiveRefKeys.length)})
      ORDER BY material_ref_key ASC, entry_ref_key ASC
    `,
    [
      ownerScope,
      ...materialRefKeys,
      ...poolFilter.positiveRefKeys,
    ],
  );

  const grouped = new Map<string, Ref[]>();
  for (const row of rows) {
    const matchedRef = poolFilter.positiveRefByKey.get(row.entry_ref_key);
    if (matchedRef === undefined) {
      throw new MusicDataPlatformError({
        code: "music_data.record_ref_key_mismatch",
        message: "Matched pool ref key did not resolve to the requested positive pool refs.",
      });
    }

    const existing = grouped.get(row.material_ref_key);
    if (existing === undefined) {
      grouped.set(row.material_ref_key, [matchedRef]);
      continue;
    }

    existing.push(matchedRef);
  }

  return grouped;
}

function matchedTextEvidenceByMaterialRefKey(
  db: MusicDatabaseContext,
  materialRefKeys: readonly string[],
  queryTokens: readonly string[],
): ReadonlyMap<string, RetrievalRowTextEvidence> {
  if (materialRefKeys.length === 0 || queryTokens.length === 0) {
    return new Map();
  }

  const rows = db.all<MatchedTextEvidenceRow>(
    matchedTextEvidenceSql(materialRefKeys.length, queryTokens),
    [...materialRefKeys],
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
    const existing = grouped.get(row.material_ref_key);

    if (existing === undefined) {
      grouped.set(row.material_ref_key, {
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

    if (lastFieldEvidence?.field === row.field) {
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
    [...grouped.entries()].map(([materialRefKey, evidence]) => [
      materialRefKey,
      {
        matchedTextFields: evidence.matchedTextFields,
        matchedTextTokensByField: evidence.matchedTextTokensByField,
        matchedTokenCount: evidence.matchedTokenKeys.size,
        bestFieldPriority: evidence.bestFieldPriority,
      } satisfies RetrievalRowTextEvidence,
    ]),
  );
}

function matchedTextEvidenceSql(
  materialRefKeyCount: number,
  queryTokens: readonly string[],
): string {
  const unions: string[] = [];

  for (const [tokenOrder, token] of queryTokens.entries()) {
    for (const [fieldOrder, field] of retrievalTextFieldConfigs.entries()) {
      unions.push(`
        SELECT
          material_text_fts.material_ref_key,
          ${sqlStringLiteral(field.field)} AS field,
          ${sqlStringLiteral(token)} AS token,
          ${field.priority} AS field_priority,
          ${fieldOrder} AS field_order,
          ${tokenOrder} AS token_order
        FROM material_text_fts
        JOIN target_materials
          ON target_materials.material_ref_key = material_text_fts.material_ref_key
        WHERE material_text_fts MATCH ${sqlStringLiteral(fieldScopedPrefixQuery(field.column, token))}
      `);
    }
  }

  return `
    WITH target_materials(material_ref_key) AS (
      VALUES ${sqlValueTuples(materialRefKeyCount)}
    )
    SELECT
      material_ref_key,
      field,
      token,
      field_priority,
      field_order,
      token_order
    FROM (
      ${unions.join("\nUNION ALL\n")}
    )
    ORDER BY material_ref_key ASC, field_priority ASC, field_order ASC, token_order ASC
  `;
}

function searchResultRowFromCatalogRow(
  row: SearchCatalogRow,
  matchedPoolRefs: readonly Ref[],
  textEvidence: RetrievalRowTextEvidence | undefined,
  order: RetrievalOrder,
  hasEffectiveText: boolean,
): MusicDataPlatformRetrievalMaterialRow {
  const materialRef = materialRefFromEntityJson(
    row.material_entity_json,
    row.material_ref_key,
    row.material_kind,
  );

  assertComparableTimestamp(row.recently_added_at, "recently_added_at");

  if (!hasEffectiveText) {
    return {
      materialRef,
      materialKind: row.material_kind,
      titleText: row.title_text,
      artistText: row.artist_text,
      albumText: row.album_text,
      versionText: row.version_text,
      aliasText: row.alias_text,
      recentlyAddedAt: row.recently_added_at,
      matchedPoolRefs,
      matchedTextFields: [],
    };
  }
  const matchedTokenCount = requiredPositiveInteger(
    row.matched_token_count,
    "matched_token_count",
  );
  const bestFieldPriority = requiredFieldPriority(
    row.best_field_priority,
    "best_field_priority",
  );

  if (textEvidence === undefined) {
    throw invalidRetrievalRead(
      "Text query row did not produce any matched text evidence.",
    );
  }

  if (matchedTokenCount !== textEvidence.matchedTokenCount) {
    throw invalidRetrievalRead(
      "Text query matched_token_count did not match projected field evidence.",
    );
  }

  if (bestFieldPriority !== textEvidence.bestFieldPriority) {
    throw invalidRetrievalRead(
      "Text query best_field_priority did not match projected field evidence.",
    );
  }

  return {
    materialRef,
    materialKind: row.material_kind,
    titleText: row.title_text,
    artistText: row.artist_text,
    albumText: row.album_text,
    versionText: row.version_text,
    aliasText: row.alias_text,
    recentlyAddedAt: row.recently_added_at,
    matchedPoolRefs,
    matchedTextFields: textEvidence.matchedTextFields,
    matchedTextTokensByField: textEvidence.matchedTextTokensByField,
    matchedTokenCount,
    ...(order === "text_relevance"
      ? {
          rankScore: {
            kind: "fts_bm25" as const,
            value: normalizedFtsRankScore(requiredFiniteNumber(
              row.rank_sort_value,
              "rank_sort_value",
            )),
          },
        }
      : {}),
  };
}

function cursorPositionFromCatalogRow(
  order: RetrievalOrder,
  row: SearchCatalogRow,
): RetrievalReadCursorPosition {
  switch (order) {
    case "stable":
      return {
        order,
        materialRefKey: row.material_ref_key,
      };
    case "recently_added":
      return {
        order,
        recentlyAddedAt: row.recently_added_at,
        materialRefKey: row.material_ref_key,
      };
    case "text_relevance":
      return {
        order,
        matchedTokenCount: requiredPositiveInteger(row.matched_token_count, "matched_token_count"),
        bestFieldPriority: requiredFieldPriority(row.best_field_priority, "best_field_priority"),
        rankSortValue: requiredFiniteNumber(row.rank_sort_value, "rank_sort_value"),
        materialRefKey: row.material_ref_key,
      };
  }
}

function requiredPositiveInteger(value: number | undefined, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw invalidRetrievalRead(`${fieldName} must be a positive integer.`);
  }

  return value;
}

function requiredFieldPriority(value: number | undefined, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 4) {
    throw invalidRetrievalRead(`${fieldName} must be an integer from 1 through 4.`);
  }

  return value;
}

function requiredFiniteNumber(value: number | undefined, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidRetrievalRead(`${fieldName} must be a finite number.`);
  }

  return value;
}

function normalizedFtsRankScore(rankSortValue: number): number {
  return -rankSortValue;
}

function countDirtyTargets(
  db: MusicDatabaseContext,
  ownerScope: string,
  status: "dirty" | "failed",
): number {
  const ownerCatalogKinds = [
    "owner_catalog_source_library",
    "owner_catalog_source_library_material",
    "owner_catalog_relation_material",
  ];

  const row = db.get<CountRow>(
    `
      SELECT COUNT(*) AS count
      FROM projection_maintenance_targets
      WHERE status = ?
        AND (
          projection_kind = 'material_text'
          OR (
            projection_kind IN (${sqlPlaceholders(ownerCatalogKinds.length)})
            AND json_extract(target_payload_json, '$.ownerScope') = ?
          )
        )
    `,
    [
      status,
      ...ownerCatalogKinds,
      ownerScope,
    ],
  );

  return row?.count ?? 0;
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
    throw invalidRetrievalRead("Stored material entity JSON is not valid JSON.", cause);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw invalidRetrievalRead("Stored material entity JSON must be an object.");
  }

  const materialRef = (parsed as MaterialEntityPayload).materialRef;

  if (typeof materialRef !== "object" || materialRef === null) {
    throw invalidRetrievalRead("Stored material entity JSON must include a materialRef object.");
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

function assertComparableTimestamp(value: string, fieldName: string): void {
  if (
    typeof value !== "string" ||
    !comparableTimestampPattern.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw invalidRetrievalRead(`${fieldName} must be a valid comparable timestamp string.`);
  }
}

function sqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function sqlValueTuples(count: number): string {
  return Array.from({ length: count }, () => "(?)").join(", ");
}

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function invalidRetrievalRead(message: string, cause?: unknown): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.retrieval_read_invalid",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
