import assert from "node:assert/strict";

import {
  metadataLookupTextSql,
  metadataRecallClause,
  metadataScoreClause,
  type MetadataLookupScoreSource,
} from "../../src/music_data_platform/metadata_lookup_normalization.js";

const sources: readonly MetadataLookupScoreSource[] = ["indexed", "row_text"];
const query = { normalizedText: "radiohead karma police", prefixQuery: "radiohead" };

function placeholderCount(sql: string): number {
  return (sql.match(/\?/g) ?? []).length;
}

// The invariant this module exists to guarantee: every bound clause's parameter
// list length matches its `?` placeholder count. Before extraction this was an
// unenforced convention across three call sites (7 placeholders for score,
// 2 for recall) with nothing checking it — a silent wrong-results bug if it
// drifted, because Postgres does not error on a count mismatch, it just binds
// parameters to the wrong columns. The dev-mode assert inside each builder
// already enforces this at runtime; these tests pin it as a contract per source.
for (const source of sources) {
  const score = metadataScoreClause("d", source, query);
  assert.equal(placeholderCount(score.sql), score.params.length, `score clause (${source})`);
  assert.equal(score.params.length, 7, `score clause carries 7 params (${source})`);

  const recall = metadataRecallClause("d", source, query);
  assert.equal(placeholderCount(recall.sql), recall.params.length, `recall clause (${source})`);
  assert.equal(recall.params.length, 2, `recall clause carries 2 params (${source})`);
}

// Parameter order is part of the contract: score binds the ts_rank_cd query
// token first, then the similarity text and per-field values (all the
// normalized query text); recall binds the to_tsquery token then the
// similarity text.
const scoreIndexed = metadataScoreClause("d", "indexed", query);
assert.equal(scoreIndexed.params[0], query.prefixQuery);
for (let index = 1; index < scoreIndexed.params.length; index += 1) {
  assert.equal(scoreIndexed.params[index], query.normalizedText);
}

const recallIndexed = metadataRecallClause("d", "indexed", query);
assert.equal(recallIndexed.params[0], query.prefixQuery);
assert.equal(recallIndexed.params[1], query.normalizedText);

// The score SQL grammar is stable and reviewed: weighted trigram relevance.
// Substring asserts (house style, cf. the metadata-lookup-search harness) catch
// weight/grammar drift loudly.
assert.equal(scoreIndexed.sql.includes("ts_rank_cd"), true);
assert.equal(scoreIndexed.sql.includes("similarity"), true);
assert.equal(scoreIndexed.sql.includes("0.20"), true);
assert.equal(scoreIndexed.sql.includes("0.04"), true);
assert.equal(scoreIndexed.sql.includes("to_tsquery('simple', ?)"), true);

// Recall predicate shape.
assert.equal(recallIndexed.sql.includes("@@ to_tsquery('simple', ?)"), true);
assert.equal(recallIndexed.sql.includes("% ?"), true);

// source="row_text" recomputes the vector/text from row columns instead of
// using the precomputed indexed columns.
const scoreRowText = metadataScoreClause("r", "row_text", query);
assert.equal(scoreRowText.sql.includes("setweight"), true);
assert.equal(scoreRowText.sql.includes("concat_ws"), true);
assert.equal(scoreRowText.sql.includes(".search_vector"), false);

// The text expression carries no parameters and is exposed as a bare fragment.
for (const source of sources) {
  const textSql = metadataLookupTextSql("d", source);
  assert.equal(placeholderCount(textSql), 0, `text expression has no placeholders (${source})`);
}
assert.equal(metadataLookupTextSql("d", "indexed"), "d.search_text");
assert.equal(metadataLookupTextSql("d", "row_text").includes("concat_ws"), true);
