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
};

type MatchedPoolEntryRow = {
  material_ref_key: string;
  entry_ref_key: string;
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

export function createMusicDataPlatformRetrievalReadPort(
  input: CreateMusicDataPlatformRetrievalReadPortInput,
): MusicDataPlatformRetrievalReadPort {
  const { db } = input;

  return {
    searchOwnerCatalogMaterials(readInput) {
      const ownerScope = validatedOwnerScope(readInput.ownerScope);
      const order = validatedOrder(readInput.order);
      const limit = validatedLimit(readInput.limit);

      if (readInput.text !== undefined) {
        throw invalidRetrievalRead(
          "Phase 12A retrieval read port does not support text queries before PR12B.",
        );
      }

      if (order === "text_relevance") {
        throw invalidRetrievalRead(
          "Phase 12A retrieval read port does not support text_relevance ordering before PR12B.",
        );
      }

      const materialKind = validatedMaterialKind(readInput.materialKind);
      const cursorPosition = validatedCursorPosition(readInput.cursorPosition, order);
      const poolFilter = normalizePoolFilter(readInput.poolFilter);
      validatePoolRefs(db, ownerScope, poolFilter);

      const selectedRows = db.all<SearchCatalogRow>(
        searchSqlForOrder(order, poolFilter, materialKind, cursorPosition),
        searchParamsForOrder({
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

      return {
        rows: visibleRows.map((row) => searchResultRowFromCatalogRow(
          row,
          matchedPoolRefsByMaterial.get(row.material_ref_key) ?? [],
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

function validatedCursorPosition(
  cursorPosition: RetrievalReadCursorPosition | undefined,
  order: Exclude<RetrievalOrder, "text_relevance">,
): RetrievalReadCursorPosition | undefined {
  if (cursorPosition === undefined) {
    return undefined;
  }

  if (cursorPosition.order === "text_relevance") {
    throw invalidRetrievalRead(
      "Phase 12A retrieval read port does not support text_relevance cursors before PR12B.",
    );
  }

  if (cursorPosition.order !== order) {
    throw invalidRetrievalRead("Retrieval read cursor order must match the query order.");
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
  order: Exclude<RetrievalOrder, "text_relevance">,
  poolFilter: NormalizedRetrievalReadPoolFilter,
  materialKind: MaterialEntityKind | undefined,
  cursorPosition: RetrievalReadCursorPosition | undefined,
): string {
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
  const params: MusicDatabaseParameter[] = [input.ownerScope];

  if (input.materialKind !== undefined) {
    params.push(input.materialKind);
  }

  if (input.poolFilter.allOfRefKeys.length > 0) {
    params.push(...input.poolFilter.allOfRefKeys, input.poolFilter.allOfRefKeys.length);
  }

  if (input.poolFilter.anyOfRefKeys.length > 0) {
    params.push(...input.poolFilter.anyOfRefKeys);
  }

  if (input.poolFilter.noneOfRefKeys.length > 0) {
    params.push(...input.poolFilter.noneOfRefKeys);
  }

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
          "Phase 12A retrieval read port does not support text_relevance cursors before PR12B.",
        );
    }
  }

  params.push(input.limit);
  return params;
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

function searchResultRowFromCatalogRow(
  row: SearchCatalogRow,
  matchedPoolRefs: readonly Ref[],
): MusicDataPlatformRetrievalMaterialRow {
  const materialRef = materialRefFromEntityJson(
    row.material_entity_json,
    row.material_ref_key,
    row.material_kind,
  );

  assertComparableTimestamp(row.recently_added_at, "recently_added_at");

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

function cursorPositionFromCatalogRow(
  order: Exclude<RetrievalOrder, "text_relevance">,
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
  }
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
  if (typeof value !== "string" || value.length === 0 || Number.isNaN(Date.parse(value))) {
    throw invalidRetrievalRead(`${fieldName} must be a valid comparable timestamp string.`);
  }
}

function sqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
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
