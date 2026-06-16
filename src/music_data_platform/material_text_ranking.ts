// Material Text Ranking — the shared FTS5 text-ranking SQL engine for
// retrieval (architecture deepening candidate #2). Parameterised by the FTS
// table name so the local retrieval read model (material_text_fts) and the
// mixed retrieval workspace (retrieval_result_text_fts) share ONE ranking
// implementation instead of the two byte-identical copies that previously lived
// in retrieval_read_model.ts and retrieval_mixed_workspace.ts.
//
// Scope: only the ranking expressions and the field set they rank over. The
// text cursor clause and the matched-text evidence SQL are NOT shared — they
// diverge materially between the two callers (order switch vs single
// text-relevance tie-break; material_ref_key vs result-row keying) and stay in
// their owning files.

export type RetrievalTextField =
  | "title"
  | "artist"
  | "album"
  | "version"
  | "alias";

export type RetrievalFtsTableName = "material_text_fts" | "retrieval_result_text_fts";

export function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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
    EXISTS (
      SELECT 1
      FROM ${ftsTableName} f
      WHERE f.rowid = ${ftsTableName}.rowid
        AND ${ftsTableName} MATCH ${sqlStringLiteral(fieldScopedPrefixQuery(fieldColumn, token))}
    )
  `.trim();
}

export function fieldScopedPrefixQuery(fieldColumn: string, token: string): string {
  return `${fieldColumn} : ${quotedPrefixQueryToken(token)}`;
}

export function quotedPrefixQueryToken(token: string): string {
  return `"${token.replaceAll('"', '""')}"*`;
}
