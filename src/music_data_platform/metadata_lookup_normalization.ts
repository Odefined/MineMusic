// Metadata Lookup Normalization — the Postgres-owned comparison of Metadata
// Lookup Query text against Metadata Search Corpus fields, and the Corpus-Local
// Score it produces. In the metadata-lookup corpus these are one SQL expression:
// the same `to_tsquery` / `similarity` terms both recall rows and score them, so
// the normalization and its score share one owning realization here (CONTEXT.md,
// "Metadata Lookup Normalization" and "Corpus-Local Score").
//
// The depth this module buys is the placeholder-binding invariant: a score or
// recall SQL fragment and its parameter list are born together as a bound clause,
// so a caller never counts `?` by hand. Today that count (7 for score, 2 for
// recall) was a convention shared across three call sites with nothing checking
// it — a silent wrong-results bug if it drifted. Each builder asserts its own
// invariant before returning.

import type { MusicDatabaseParameter } from "../storage/database.js";

/**
 * A normalized Metadata Lookup Query: the text-relevance inputs the scoring
 * grammar consumes. The raw input string is normalized and validated by the
 * owning workspace (public-input validation); this type is the scoring module's
 * own input shape.
 */
export type MetadataLookupQuery = {
  normalizedText: string;
  prefixQuery: string;
};

/**
 * Which column set the scoring expression runs against:
 * - "indexed" — the precomputed `search_vector` / `search_text` columns on
 *   `search_metadata_documents` (the local recall window).
 * - "row_text" — recomputed from the stored row text columns on
 *   `search_result_rows` (the rerank/prune pass over the materialized set).
 */
export type MetadataLookupScoreSource = "indexed" | "row_text";

/**
 * A SQL fragment paired with the exact parameters that satisfy its `?`
 * placeholders, in order. Composers concatenate `sql` and spread `params` as a
 * unit so the placeholder/parameter count never has to be tracked by hand.
 */
export type MetadataLookupScoreClause = {
  sql: string;
  params: readonly MusicDatabaseParameter[];
};

/**
 * The Corpus-Local Score expression for one alias/source: a weighted blend of
 * trigram-rank text relevance (`ts_rank_cd`) and per-field `similarity`. Lands
 * in SELECT / ORDER BY of the consuming query.
 */
export function metadataScoreClause(
  alias: string,
  source: MetadataLookupScoreSource,
  query: MetadataLookupQuery,
): MetadataLookupScoreClause {
  const sql = metadataScoreSql(alias, source);
  const params: readonly MusicDatabaseParameter[] = [
    query.prefixQuery,
    query.normalizedText,
    query.normalizedText,
    query.normalizedText,
    query.normalizedText,
    query.normalizedText,
    query.normalizedText,
  ];
  return assertBoundClause({ kind: "score", source, sql, params });
}

/**
 * The recall predicate for one alias/source: a row matches when its search
 * vector trigram-matches the query OR its row text is similar to it. Lands in
 * the WHERE clause of the consuming query.
 */
export function metadataRecallClause(
  alias: string,
  source: MetadataLookupScoreSource,
  query: MetadataLookupQuery,
): MetadataLookupScoreClause {
  const sql = metadataRecallSql(alias, source);
  const params: readonly MusicDatabaseParameter[] = [
    query.prefixQuery,
    query.normalizedText,
  ];
  return assertBoundClause({ kind: "recall", source, sql, params });
}

function metadataScoreSql(alias: string, source: MetadataLookupScoreSource): string {
  return `
    (
      ts_rank_cd(${metadataVectorSql(alias, source)}, to_tsquery('simple', ?), 32) +
      similarity(${metadataLookupTextSql(alias, source)}, ?) +
      (0.20 * similarity(${alias}.title_text, ?)) +
      (0.12 * similarity(${alias}.artist_text, ?)) +
      (0.10 * similarity(${alias}.album_text, ?)) +
      (0.05 * similarity(${alias}.version_text, ?)) +
      (0.04 * similarity(${alias}.alias_text, ?))
    )
  `;
}

function metadataRecallSql(alias: string, source: MetadataLookupScoreSource): string {
  return `${metadataVectorSql(alias, source)} @@ to_tsquery('simple', ?) OR ${metadataLookupTextSql(alias, source)} % ?`;
}

function metadataVectorSql(alias: string, source: MetadataLookupScoreSource): string {
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

/**
 * The searchable-text expression for one alias/source: the `search_text` column
 * when indexed, or a row-text `concat_ws` reconstruction otherwise. Carries no
 * parameters, so it is exposed as a bare SQL fragment rather than a bound clause.
 * The page-read query uses the `row_text` form to reconstruct `searchText` from
 * stored row columns.
 */
export function metadataLookupTextSql(
  alias: string,
  source: MetadataLookupScoreSource,
): string {
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

// Broken-invariant guard, not an expected failure: if a future edit to a scoring
// SQL fragment changes its `?` count without matching the parameter list, the
// clause would silently bind parameters to the wrong columns (Postgres does not
// error — it returns skewed results). Fail loud at the seam that owns the
// invariant rather than letting silent wrong results escape.
function assertBoundClause(input: {
  kind: "score" | "recall";
  source: MetadataLookupScoreSource;
  sql: string;
  params: readonly MusicDatabaseParameter[];
}): MetadataLookupScoreClause {
  const placeholderCount = (input.sql.match(/\?/g) ?? []).length;
  if (placeholderCount !== input.params.length) {
    throw new Error(
      `metadata_lookup_normalization ${input.kind} clause (${input.source}) ` +
        `placeholder/parameter mismatch: ${placeholderCount} placeholders, ` +
        `${input.params.length} parameters.`,
    );
  }
  return { sql: input.sql, params: input.params };
}
