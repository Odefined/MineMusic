// Material Text Ranking — the Postgres text-ranking SQL engine used by the
// material_text projection (material_text_fts). Parameterised by the FTS table
// name; only material_text_fts remains after the old retrieval query path
// (retrieval_result_text_fts) was deleted.
//
// Scope: only the ranking expressions and the field set they rank over.

export type RetrievalTextField =
  | "title"
  | "artist"
  | "album"
  | "version"
  | "alias";

export type RetrievalFtsTableName = "material_text_fts";

export function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function prefixTsQueryForTokens(tokens: readonly string[]): string {
  return tokens.map(prefixTsQueryForToken).join(" | ");
}

export function prefixTsQueryForToken(token: string): string {
  return `'${token.replaceAll("'", "''")}':*`;
}

export function ftsSearchConditionSql(
  ftsTableName: RetrievalFtsTableName,
  matchQuery: string,
): string {
  return `${ftsTableName}.search_vector @@ to_tsquery('simple', ${sqlStringLiteral(matchQuery)})`;
}

export function ftsRankSortValueSqlExpression(
  ftsTableName: RetrievalFtsTableName,
  matchQuery: string,
): string {
  return `-ts_rank(${ftsTableName}.search_vector, to_tsquery('simple', ${sqlStringLiteral(matchQuery)}))`;
}

export const retrievalTextFieldConfigs = [
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

export function matchedTokenCountSqlExpression(
  tokens: readonly string[],
  ftsTableName: RetrievalFtsTableName,
): string {
  return tokens.map((token) => `
      CASE
        WHEN ${anyFieldMatchSqlExpression(token, ftsTableName)}
        THEN 1
        ELSE 0
      END
    `).join(" + ");
}

export function bestFieldPrioritySqlExpression(
  tokens: readonly string[],
  ftsTableName: RetrievalFtsTableName,
): string {
  return `
    CASE
      WHEN ${fieldMatchesAnyTokenSqlExpression("title_text", tokens, ftsTableName)}
      THEN 1
      WHEN ${fieldMatchesAnyTokenSqlExpression("artist_text", tokens, ftsTableName)}
        OR ${fieldMatchesAnyTokenSqlExpression("album_text", tokens, ftsTableName)}
      THEN 2
      WHEN ${fieldMatchesAnyTokenSqlExpression("version_text", tokens, ftsTableName)}
      THEN 3
      WHEN ${fieldMatchesAnyTokenSqlExpression("alias_text", tokens, ftsTableName)}
      THEN 4
      ELSE 5
    END
  `;
}

export function anyFieldMatchSqlExpression(
  token: string,
  ftsTableName: RetrievalFtsTableName,
): string {
  return `(${retrievalTextFieldConfigs
    .map((field) => fieldMatchSqlExpression(field.column, token, ftsTableName))
    .join(" OR ")})`;
}

export function fieldMatchesAnyTokenSqlExpression(
  fieldColumn: string,
  tokens: readonly string[],
  ftsTableName: RetrievalFtsTableName,
): string {
  return `(${tokens
    .map((token) => fieldMatchSqlExpression(fieldColumn, token, ftsTableName))
    .join(" OR ")})`;
}

export function fieldMatchSqlExpression(
  fieldColumn: string,
  token: string,
  ftsTableName: RetrievalFtsTableName,
): string {
  return `
    to_tsvector('simple', COALESCE(${ftsTableName}.${fieldColumn}, ''))
      @@ to_tsquery('simple', ${sqlStringLiteral(prefixTsQueryForToken(token))})
  `.trim();
}

export function fieldScopedPrefixQuery(fieldColumn: string, token: string): string {
  return `${fieldColumn} : ${quotedPrefixQueryToken(token)}`;
}

export function quotedPrefixQueryToken(token: string): string {
  return `"${token.replaceAll('"', '""')}"*`;
}
