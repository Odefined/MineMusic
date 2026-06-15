# Phase 15 Provider Search Pool Retrieval

> Status: Implementation authority, paired with
> `phase-15-provider-search-pool-retrieval-implementation-plan.md`
> Phase owner: Music Intelligence / Retrieval, Music Data Platform Retrieval,
> and Extension Source Provider Slot
> Output type: internal provider-search pool retrieval foundation with
> mixed retrieval result-set snapshots and SQL keyset pagination

Phase 15 extends the internal Retrieval foundation from Phase 12 so a query can
mix local owner-catalog rows with provider search candidates in one ranked
result set.

This phase is still an internal query foundation phase. It does not expose a
public Stage Interface tool and does not turn provider candidates into final
`MaterialCard` output.

## Current Problem

Phase 12 Retrieval can query the local owner catalog, source-library pools,
owner-relation pools, and material text FTS. It cannot ask an installed source
provider for additional candidates during query execution.

The Extension Source Provider Slot can already call provider search and return
validated `ProviderMaterialCandidate[]`, but those results are not connected to
Retrieval.

The missing seam is:

```text
query text
-> local owner catalog candidates
-> source-provider candidates
-> one mixed ranking/filter/pagination path
```

The seam must not become a TypeScript candidate pool that manually merges,
dedupes, sorts, and paginates rows outside the Music Data Platform SQL query
path.

## Goal

Add provider-search pools to internal Retrieval so callers can express mixed
local + provider retrieval:

```ts
query({
  text: "plainsong",
  order: "text_relevance",
  pools: {
    anyOf: [
      { kind: "local_catalog" },
      { kind: "provider_search", providerId: "netease", limit: 20 },
    ],
  },
});
```

The query returns one mixed page ranked through the Music Data Platform
retrieval SQL path.

Unknown provider candidates are cached material-facing query candidates. Query
does not write durable `SourceRecord`, `MaterialRecord`, canonical records,
owner relations, source-library items, or projection facts.

## Non-Goals

- No public Stage Interface tool.
- No final `MaterialCard` output.
- No public tool output contract or compact output design.
- No `present`, playable-link refresh, save, favorite, block, collection add,
  feedback, or provider-candidate commit command.
- No durable source/material writes for ordinary provider search hits.
- No provider auto fan-out.
- No provider lookup by source ref as part of normal query.
- No provider deep pagination.
- No raw provider payload persistence.
- No new Collection source-of-truth or collection pools.
- No signals, freshness penalties, Memory, Music Experience ranking, radio
  mode, or final recommendation judgement.

## Audit Alignment

The architecture audit calls for provider search to participate in the same
query path as local catalog retrieval:

```text
provider_search pool contributes TEMP provider_candidate rows and resolved
durable rows.
```

It also rejects the old TypeScript runtime candidate pool:

```text
DB should own visibility/filter/dedupe/sort/pagination.
```

Phase 15 follows that direction, with one correction to the earlier audit
sketch: provider-search pool objects do not carry their own `text`. Phase 12
already established top-level query `text`, so provider search uses the same
effective query text as local material text retrieval.

## Ownership And Boundaries

Music Intelligence / Retrieval owns:

- typed retrieval pool input vocabulary;
- query normalization and fingerprinting;
- orchestration of provider-search calls through a narrow provider-search port;
- async `RetrievalQueryService.query(...)`;
- shaping Music Data Platform mixed rows into internal retrieval hits.

Music Data Platform Retrieval owns:

- local owner catalog and material text SQL;
- runtime material candidate cache schema and semantics;
- TTL-backed mixed retrieval result-set schema and semantics;
- mixed SQL ranking, filtering, dedupe, evidence, and cursor pagination;
- exact known-candidate resolution through source-material bindings.

Extension Source Provider Slot owns:

- provider registration;
- provider search invocation;
- source-provider input/output validation.

Composition roots own:

- adapting Extension Source Provider Slot runtime to Retrieval's narrow
  provider-search port.

Retrieval must not import plugin runtime, capability registry internals, or
concrete provider plugins. Music Intelligence must not construct repositories,
issue candidate SQL writes directly, or implement mixed ranking as a TypeScript
pipeline.

## Typed Pool Input

Phase 15 replaces the Phase 12 `poolFilter?: Ref[]` shape with
`pools?: RetrievalPoolFilter`.

```ts
type RetrievalPool =
  | { kind: "local_catalog" }
  | { kind: "source_library"; ref: Ref }
  | { kind: "owner_relation"; ref: Ref }
  | { kind: "provider_search"; providerId: string; limit?: number };

type RetrievalPoolFilter = {
  allOf?: readonly RetrievalPool[];
  anyOf?: readonly RetrievalPool[];
  noneOf?: readonly RetrievalPool[];
};
```

`source_library` and `owner_relation` keep refs because those pools already have
stable owner-scoped identities. `provider_search` is not represented as a
`Ref`; it is a query-time pool source.

Bare refs in `allOf`, `anyOf`, or `noneOf` are no longer valid input. Internal
callers must use typed pool objects.

`poolFilter` is removed from `RetrievalQueryInput` in Phase 15. It is not kept
as an alias for `pools`, and inputs that still use `poolFilter` are invalid.

### Local Catalog Pool Semantics

No pool filter means the Phase 12 default local owner catalog query:

```ts
query({ text: "plainsong" });
```

When `pools` is present, Retrieval follows the supplied pool expression exactly.
It does not automatically add `local_catalog` just because a provider-search
pool exists.

Mixed local + provider retrieval must be explicit:

```ts
query({
  text: "plainsong",
  order: "text_relevance",
  pools: {
    anyOf: [
      { kind: "local_catalog" },
      { kind: "provider_search", providerId: "netease", limit: 20 },
    ],
  },
});
```

Provider-only retrieval is also explicit:

```ts
query({
  text: "plainsong",
  order: "text_relevance",
  pools: {
    anyOf: [
      { kind: "provider_search", providerId: "netease", limit: 20 },
    ],
  },
});
```

`local_catalog` represents the owner-visible local catalog base set.

```text
anyOf [local_catalog]
  equivalent to local owner catalog base

anyOf [local_catalog, source_library(...)]
  still returns the local owner catalog base, because source_library is a
  subset-like durable pool inside that base

allOf [local_catalog]
  no-op, because owner catalog visibility is already the durable retrieval base

noneOf [local_catalog]
  invalid in Phase 15
```

### Durable Local Recall Sources

Durable local rows are included in a mixed retrieval result set only when the
typed pool expression contains a durable local recall source.

```text
provider_search only
  include provider-resolved durable material rows
  include provider unresolved material_candidate rows
  include no local catalog rows merely because they match text

local_catalog + provider_search
  include local catalog rows plus provider rows

source_library + provider_search
owner_relation + provider_search
  include durable rows selected by the same Phase 12 durable pool semantics plus
  provider rows
```

`source_library` and `owner_relation` are durable local recall sources.
`provider_search` is an external recall source. `anyOf` combines recall sources
before dedupe.

### Provider Search Pool Constraints

Phase 15 allows `provider_search` only inside `pools.anyOf`.

If any `provider_search` pool is present, `pools.allOf` and `pools.noneOf` must
be absent or empty.

Provider search intersection and exclusion require stronger source/material
identity matching semantics, especially when a provider candidate has not
resolved to a durable material. Phase 15 does not define those semantics.

`provider_search.providerId` is required. Missing provider id would imply
automatic fan-out across providers, which Phase 15 does not support.

Multiple providers can be expressed by multiple provider-search pools:

```ts
anyOf: [
  { kind: "provider_search", providerId: "netease", limit: 20 },
  { kind: "provider_search", providerId: "spotify", limit: 20 },
]
```

Provider-search pools in one query must have unique `providerId` values.
Duplicate provider-search pools for the same provider are invalid rather than
merged:

```text
duplicate providerId in provider_search pools
  -> music_intelligence.provider_search_pool_invalid
```

## Provider Search Query Rules

### Top-Level Text

`provider_search` does not contain a `text` field.

Provider search uses the same top-level query `text` as the local text query.
If a query contains any `provider_search` pool, top-level text after Retrieval
normalization must be non-empty.

This prevents divergent inputs such as:

```ts
{
  text: "plainsong",
  pools: {
    anyOf: [
      { kind: "provider_search", providerId: "netease", text: "plain song live" },
    ],
  },
}
```

Future natural-language search, vector search, or query rewrite behavior
belongs to query planning. It should decide the effective provider search text
before provider execution rather than storing a second text field inside the
provider pool.

### Order

Queries that include `provider_search` must use `order: "text_relevance"`.

`recently_added` is a durable owner-catalog ordering and provider candidates do
not have owner-catalog `recently_added_at`. `stable` mixed ordering is not a
Phase 15 product behavior.

### Limit

`provider_search.limit` is optional.

Default:

```text
min(query.limit * 2, 50)
```

Validation:

```text
positive integer
max 50
```

The hard cap follows the existing Source Provider Slot `SourceQuery.limit`
validation.

### Target Kinds

Provider search uses Retrieval `materialKind` to derive Source Provider Slot
`SourceQuery.targetKinds`.

```text
materialKind undefined -> targetKinds omitted
materialKind recording -> targetKinds ["track"]
materialKind album -> targetKinds ["album"]
materialKind artist -> targetKinds ["artist"]
```

`materialKind work` and `materialKind release` are unsupported when a query
contains `provider_search`, because the current Source Provider contract has no
matching source entity kind for work or release.

Provider candidates map to material-facing candidate kinds as follows:

```text
SourceEntity.kind track -> material candidate kind recording
SourceEntity.kind album -> material candidate kind album
SourceEntity.kind artist -> material candidate kind artist
```

Phase 15 does not infer `work` or `release` material candidates from provider
search results.

### Provider Deep Pagination

Phase 15 provider search is one-shot recall.

For each provider-search pool, Retrieval calls Source Provider Slot with:

```text
SourceQuery.offset = 0
SourceQuery.limit = provider_search.limit effective value
```

`provider_search` does not expose offset, cursor, page token, or provider
continuation state. Retrieval cursor pagination applies to the mixed MineMusic
result set; it does not fetch the next provider page.

### Provider Execution Context

Retrieval may pass `sessionId` through the provider-search port when the caller
has provider execution context available.

`sessionId` is provider execution context only. It does not participate in
`resultSetId`, `materialCandidateRef`, query fingerprinting, material candidate
cache identity, or retrieval result-set identity.

### Failure Policy

Provider search pool failures fail the whole query.

If a query explicitly includes a provider-search pool, that pool is part of the
query condition. Returning local-only results with a warning would incorrectly
imply that the provider was searched successfully and found nothing relevant.

When one query contains multiple provider-search pools, Retrieval executes
those provider searches in parallel. After all provider searches succeed, Music
Data Platform builds one mixed retrieval result set containing local rows and
provider rows. Any provider-search failure fails the whole query. Provider call
order must not affect result-set identity, cursor behavior, or ranking
semantics.

### Freshness

Local-only queries keep the Phase 12/13 retrieval freshness behavior.

Mixed queries that include `local_catalog` and `provider_search` return local
projection freshness, because the local side still depends on owner catalog and
material text projections.

Provider-only queries omit local projection freshness. Provider-only retrieval
does not depend on owner catalog projection freshness, and Phase 15 does not
extend `RetrievalFreshness` with a new provider-only status.

## Candidate State Model

Phase 15 stores provider-search pages as mixed retrieval result sets.
The cursor reads this mixed result set directly. It does not reload only
provider candidates, does not re-run provider search, and does not re-read local
catalog rows for later pages.

The mixed result set has a dynamic result window. The local durable side selects
up to a per-query local window limit derived from `query.limit`; provider rows
are bounded by each `provider_search.limit`. Provider-only queries do not add
local catalog rows merely because they match text.

Default local result window limit:

```text
query.limit * 10
```

The window limit is not a failure condition. Rows beyond the local result window
are not part of that `resultSetId`; cursor pages paginate only the mixed result
set rows that were selected into the window.

Phase 15 mixed result sets are bounded result windows, not exhaustive snapshots
of every local match. If the durable local side has more matches beyond
`local_result_window_limit`, Phase 15 does not expose those rows through that
`resultSetId`.

The result set records internal window metadata:

```text
localResultWindowLimit
localRowsInResultSet
localResultWindowHasMore
```

These fields describe the runtime result-set basis. They are not Stage
Interface output.

Phase 15 uses these runtime tables:

```text
retrieval_result_sets
  TTL-backed mixed retrieval result-set header. One result set represents one
  provider-search query execution.

retrieval_result_rows
  TTL-backed mixed result rows for that result set. Rows include local durable
  material hits selected into the result window, provider-resolved durable
  material hits, and provider unresolved material_candidate hits.

retrieval_result_text_fts
  FTS corpus for the same result set. It lets SQL compute text relevance over
  the mixed rows without rebuilding durable material_text_fts.

material_candidate_cache
  runtime cache for unresolved provider candidate facts, keyed by the
  material candidate ref key.
```

The result set is the pagination unit. First page creation writes the bounded
mixed rows once. Cursor pages run SQL keyset pagination against the same
`resultSetId`.

Default TTL:

```text
retrieval_result_set TTL = 30 minutes
```

The runtime result-set rows survive query completion so cursor pages can read
the same mixed result set:

```text
retrieval_result_sets
retrieval_result_rows
retrieval_result_text_fts
material_candidate_cache
  TTL-backed runtime rows used by mixed retrieval
```

### Runtime Cache Ownership

The mixed retrieval result set should be database-backed runtime state in Phase
15, not a pure in-memory map. Cursor pages need to read the same local +
provider mixed rows, and database-backed rows are easier to exercise with
project-native tests.

These runtime tables are not source-of-truth tables. Projection commands,
source-library import/update, owner relation commands, material text projection
commands, and identity commands must not treat them as durable facts.

Runtime cache schema belongs to Music Data Platform retrieval/query ownership.
It must not be owned by Storage, Extension, Source Provider Slot, or Server
Host. Storage may execute the schema contribution mechanically, but it does not
own the semantics.

The result set should use ordinary runtime tables keyed by `result_set_id`, not
SQLite `TEMP TABLE` semantics. SQLite TEMP tables are connection-scoped; a
TTL-backed result set is easier to test and is the state cursor pages need to
read.

Minimum result-set schema shape:

```sql
retrieval_result_sets (
  result_set_id TEXT PRIMARY KEY,
  query_fingerprint TEXT NOT NULL,
  local_result_window_limit INTEGER NOT NULL,
  local_rows_in_result_set INTEGER NOT NULL,
  local_result_window_has_more INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

`local_result_window_has_more` uses boolean integer semantics: `0` means the
local durable side did not observe more rows than it selected, and `1` means
additional local durable matches existed beyond `local_result_window_limit`.

```sql
retrieval_result_rows (
  result_set_id TEXT NOT NULL,
  row_kind TEXT NOT NULL,
  stable_ref_key TEXT NOT NULL,
  material_ref_key TEXT,
  material_candidate_ref_key TEXT,
  row_kind_sort INTEGER NOT NULL,
  matched_token_count INTEGER NOT NULL,
  best_field_priority INTEGER NOT NULL,
  rank_sort_value REAL NOT NULL,
  title_text TEXT NOT NULL,
  artist_text TEXT NOT NULL,
  album_text TEXT NOT NULL,
  version_text TEXT NOT NULL,
  alias_text TEXT NOT NULL,
  PRIMARY KEY(result_set_id, row_kind, stable_ref_key)
)
```

For `row_kind = "material"`, `material_ref_key` is required and
`material_candidate_ref_key` is absent. For
`row_kind = "material_candidate"`, `material_candidate_ref_key` is required and
`material_ref_key` is absent.

Mixed provider retrieval must also build a result-set-level FTS corpus for the
current mixed rows. Ordinary text columns are not enough for mixed text
relevance, because Phase 12 local relevance uses SQLite FTS5 `MATCH` and
`bm25(...)`.

Minimum FTS result-set shape:

```sql
CREATE VIRTUAL TABLE retrieval_result_text_fts USING fts5(
  result_set_id UNINDEXED,
  row_kind UNINDEXED,
  stable_ref_key UNINDEXED,
  title_text,
  artist_text,
  album_text,
  version_text,
  alias_text,
  tokenize = 'unicode61'
)
```

For mixed provider-search queries, the workspace inserts only the current
query's candidate rows into the result-set rows and FTS corpus: durable material
rows selected from the query's durable local recall sources up to the dynamic
local result window limit plus provider-search `material_candidate` rows
returned by the one-shot provider search. Phase 15 must not rebuild or rewrite
durable `material_text_fts` for mixed ranking.

Local durable rows are preselected before insertion using the Phase 12 local
text-relevance ordering:

```sql
ORDER BY
  matched_token_count DESC,
  best_field_priority ASC,
  rank_sort_value ASC,
  material_ref_key ASC
LIMIT local_result_window_limit
```

This preselection order is part of the Phase 15 contract. Implementation must
not let rowid order, SQL planner order, provider order, or material_ref_key-only
order choose which local rows enter the bounded result set.

`rank_sort_value` is computed from `retrieval_result_text_fts` with the same
field weights as Phase 12 local text relevance:

```sql
bm25(retrieval_result_text_fts, 1.0, 1.0, 1.0, 1.0, 1.0)
```

The mixed query must not compare Phase 12 `material_text_fts` BM25 values with
hand-built provider candidate scores. Mixed ranking uses the result-set-level
FTS corpus for every row in that mixed result set.

Mixed result-set page SQL must select visible rows through
`retrieval_result_text_fts MATCH` using the same normalized prefix-or text
matching strategy as Phase 12 local retrieval. Rows that do not match the
normalized query text in the result-set FTS corpus must not appear in the mixed
result page, even if they were returned by provider search.

Cursor pages must use SQL keyset pagination over `retrieval_result_rows` for
the cursor's `resultSetId`:

```text
WHERE result_set_id = ?
  AND row_sort_tuple is strictly after cursor.position
ORDER BY matched_token_count DESC,
         best_field_priority ASC,
         rank_sort_value ASC,
         row_kind_sort ASC,
         stable_ref_key ASC
LIMIT ?
```

This is the mixed version of the existing local retrieval pagination pattern:
SQL owns the cursor clause, ordering, and limit. Retrieval must not implement a
TypeScript sort/merge/slice pagination path.

Result-set construction may reuse Phase 12 local retrieval SQL helpers for
owner visibility, durable pool membership, material kind filtering, text match,
and text evidence. It must not use the Phase 12 paged read-port output as the
durable local candidate source.

During result-set construction, the local durable side must not apply the
caller's page cursor or page limit. It may apply the distinct
`local_result_window_limit` used to bound the runtime result window.
Cursor and page `LIMIT` apply only when reading from `retrieval_result_rows`
after the mixed result set has been created.

Phase 15B should provide opportunistic cleanup through the retrieval-query
workspace or command boundary:

```text
cleanupExpiredRetrievalResultSets(now, limit?)
cleanupExpiredMaterialCandidates(now, limit?)
```

The workspace may call cleanup before starting a provider-search query. Phase
15 must not introduce a Server Host background scheduler solely for retrieval
result-set cleanup.

Cleanup deletes only expired rows:

```text
expires_at <= now
```

It must not delete live result-set rows. Default cleanup limit is 500 rows per
cleanup call so a query does not spend unbounded time deleting old runtime
cache data.

`retrieval_result_rows` and `retrieval_result_text_fts` do not own independent
expiry timestamps. Result-set cleanup must select expired `result_set_id` values
from `retrieval_result_sets.expires_at` and delete rows by those ids.

Result-set cleanup order:

```text
1. delete expired retrieval_result_text_fts rows
2. delete expired retrieval_result_rows
3. delete expired retrieval_result_sets
```

FTS and row cleanup must select expired result sets through
`retrieval_result_sets.expires_at`, for example:

```sql
DELETE FROM retrieval_result_text_fts
WHERE result_set_id IN (
  SELECT result_set_id
  FROM retrieval_result_sets
  WHERE expires_at <= ?
)
```

Material candidate cleanup deletes expired `material_candidate_cache` rows by
their own `expires_at`.

```text
material_candidate_cache.expires_at <= now
```

Material candidate cleanup must not delete a candidate cache row referenced by
any non-expired `retrieval_result_rows` row. When a mixed result set contains
unresolved material candidate rows, the backing `material_candidate_cache` rows
must live at least until that result set expires.

Implementation must express that guard as a database condition against
`retrieval_result_rows` and non-expired `retrieval_result_sets`; orchestration
code must not load rows and decide candidate liveness manually.

Cursor reload behavior:

```text
result set missing or expired
  -> music_intelligence.retrieval_result_set_expired

unresolved result row needs provider candidate facts but material candidate
cache is missing or expired
  -> music_intelligence.material_candidate_expired
```

Result-set writes for one provider-search first page must be atomic.

Rules:

```text
provider search calls
  -> happen outside MusicDatabase.transaction(...)

all provider searches succeed
  -> enter one synchronous Music Data Platform transaction
  -> write retrieval_result_sets, retrieval_result_rows,
     retrieval_result_text_fts, and material_candidate_cache rows

any provider search fails
  -> write no result set and no cache entries for that query

database write fails
  -> rollback the result-set transaction and fail the query
```

No `await`, Promise, or thenable work is allowed inside
`MusicDatabase.transaction(...)` callbacks. This follows the Storage contract
that transactions are synchronous-only.

### Material Candidate Cache Entry

The cache entry wraps provider-owned source facts. It does not create a durable
`SourceRecord`, `MaterialRecord`, canonical record, owner relation,
source-library item, or projection row.

The cache needs enough data to later reload and rank provider candidates:

```text
materialCandidateRef
providerId
validatedProviderCandidateJson
providerScore
material candidate kind
searchable text fields derived from SourceEntity
expiresAt or equivalent cache lifetime metadata
```

`materialCandidateRef` is an internal material-facing cache ref. It is not a
durable `MaterialEntity.materialRef`, not a `sourceRef`, and not durable
identity.

`materialCandidateRef` is deterministic for the provider source identity:

```text
refKey(sourceEntity.sourceRef)
-> material_candidate ref
```

The ref id is a deterministic digest of that source ref key:

```ts
{
  namespace: "material_candidate",
  kind: "provider_candidate",
  id: digest(refKey(sourceEntity.sourceRef)),
}
```

The ref must not include query text, rank, row position, or cursor position.
The cache entry keeps raw `providerId`, `sourceEntity.kind`, and
`providerEntityId` for debugging and later durable write commands. The public
cache ref does not expose the provider entity id as its ref id.

`materialCandidateRef` is the live runtime candidate handle. While the cache row
is live, it can be resolved by `materialCandidateRef` alone. `resultSetId`
belongs to retrieval pagination and does not participate in material candidate
identity.

```text
materialCandidateRef -> materialCandidateRefKey -> material_candidate_cache
```

The provider candidate's `sourceEntity.sourceRef` remains inside the cached
provider candidate facts for later durable resolve/save commands.
It is not used as the query-level material candidate selector.

Only validated `ProviderMaterialCandidate` values may be cached. Raw provider
API payloads must not be stored in Phase 15 runtime candidate tables.

Minimum schema shape:

```sql
material_candidate_cache (
  material_candidate_ref_key TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  source_ref_key TEXT NOT NULL,
  provider_entity_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  material_candidate_kind TEXT NOT NULL,
  validated_provider_candidate_json TEXT NOT NULL,
  searchable_fields_json TEXT NOT NULL,
  provider_score REAL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(material_candidate_ref_key)
)
```

`source_ref_key` is stored for exact known-source resolution and later durable
source/material writes. It does not imply a durable `SourceRecord` exists.

If the same `materialCandidateRef` appears again in another provider-search
result set, the cache write upserts the row. The upsert refreshes `expires_at`
to at least the new result set's expiry and replaces runtime provider facts
such as `validated_provider_candidate_json`, `searchable_fields_json`, and
`provider_score`. The cache is runtime state, not an audit log.

`retrieval_result_rows` and `retrieval_result_text_fts` own result-set ranking,
text evidence, and cursor ordering. Updating `material_candidate_cache` must
not mutate existing result-set rows, FTS rows, or cursor ordering for existing
result sets.

Cached material candidates expire by their own `expires_at`. Cursor pagination
reads `retrieval_result_rows`; it does not need to resolve full provider
candidate facts unless it is shaping an unresolved material candidate hit. If an
unresolved row's `materialCandidateRef` no longer has a live cache entry,
Retrieval must fail explicitly rather than silently re-run provider search or
pick a fresh provider result.

### Mixed Result Set And Cursor Pagination

Phase 15 supports Retrieval cursor pagination for mixed provider-search
queries.

First page:

```text
cursor absent
  execute provider search
  create resultSetId
  write the bounded mixed result set:
    durable material rows selected from the query's durable local recall sources
      up to local_result_window_limit
    provider-resolved durable material rows
    provider unresolved material_candidate rows
  run SQL ORDER BY / LIMIT over that result set
```

Cursor page:

```text
cursor present
  do not execute provider search
  require resultSetId in the cursor
  read the same mixed result rows
  run SQL cursor clause / ORDER BY / LIMIT over that result set
```

Retrieval result sets are bound to the normalized query fingerprint. The
fingerprint includes query semantics, not pagination or execution-context
inputs:

```text
ownerScope
normalized top-level text
materialKind
order
normalized typed pools
provider_search providerId
```

The fingerprint excludes caller page `limit`, `local_result_window_limit`,
cursor value, `sessionId`, and provider-search effective/default limits derived
from the caller page limit. A cursor page may change page size while reading the
same `resultSetId`.

Retrieval cursors for mixed provider-search queries carry an opaque result set
id and the query fingerprint. Cursor pages must compare the cursor fingerprint
with the current normalized query fingerprint. A mismatch fails as an invalid
cursor instead of reusing the wrong mixed result set.

`resultSetId` is an opaque snapshot id, not the fingerprint itself. It
identifies the bounded mixed retrieval result set used for Retrieval cursor
pagination. It is not a session id, not a permission boundary, not a durable
identity, and not a Stage Interface or present/save/favorite contract.

`resultSetId` is an internal opaque bearer handle. Possession of it allows code
inside the internal retrieval boundary to read that result set until expiry. It
must not be exposed as a stable public id; a future Stage Interface must wrap or
mediate it.

```text
resultSetId = random/opaque id
retrievalResultSet.queryFingerprint = deterministic fingerprint
```

The same normalized query may be searched again later and produce a different
mixed result set. A fresh provider recall must create a fresh result set
instead of overwriting a previous cursor snapshot.

If the retrieval result set is missing or expired, the cursor page fails with
an explicit retrieval-result-set-expired error. It must not silently re-run
provider search or rebuild local rows.

Resolved durable material rows do not retain provider evidence in
`retrieval_result_rows`. Once a provider candidate resolves to a durable
material, Phase 15 treats it as a durable material row. Unresolved provider
facts remain available through `material_candidate_cache`.

This is an intentional Phase 15 narrowing. A provider-only query that returns a
resolved durable material hit does not expose which `provider_search` pool found
it. Pool/evidence output for resolved durable provider hits is out of scope.

### Cursor Contract

Phase 15 replaces the active Retrieval cursor payload contract together with
typed pool fingerprinting. The active cursor codec only supports the Phase 15
payload shape. Phase 12 cursor payloads are not compatibility-supported.

Reasons:

```text
PR 15A changes pool input from bare Ref[] to typed pools, so query fingerprint
semantics change.

PR 15B introduces mixed row positions that can point to durable material rows
or material candidate rows.

PR 15C provider-search cursor pages need resultSetId to read the same bounded
mixed retrieval result set.
```

Shape:

```ts
type RetrievalCursorPayload = {
  version: 2;
  queryFingerprint: string;
  position: LocalRetrievalCursorPosition | MixedRetrievalCursorPosition;
  resultSetId?: string;
};
```

Local-only queries omit `resultSetId`. Provider-search mixed queries require
`resultSetId` on cursor pages.

## Mixed Retrieval Semantics

### Searchable Text

Unknown material candidates participate in MineMusic text matching and ranking.

The retrieval-query workspace derives result-set-scoped text fields from
`ProviderMaterialCandidate.sourceEntity` and inserts them into
`retrieval_result_rows` and the result-set-level FTS corpus. It does not write
durable `material_text_documents` or `material_text_fts` rows for unknown
provider candidates.

When a provider search hit resolves to an existing durable material, the
result-set row uses that material's existing `material_text_documents` text for
FTS matching and ranking.

Provider `SourceEntity` text is used only for unresolved `material_candidate`
rows, because those rows do not yet have durable material text.

Provider candidate searchable text fields are derived from `SourceEntity` using
the Phase 10 material text field semantics:

```text
track:
  title_text = title + label
  artist_text = artistLabels
  album_text = albumLabel
  version_text = versionInfo

album:
  title_text = title + label
  artist_text = artistLabels
  version_text = versionInfo

artist:
  title_text = name + label
  alias_text = aliases
```

These fields exist for result-set-scoped text matching and ranking. Phase 15 does
not define public output shape.

Provider URLs, playable links, provider entity ids, and raw provider payloads
must not be added to searchable text fields.

Provider output validation is split by boundary:

```text
Extension Source Provider Slot
  validates ProviderMaterialCandidate contract shape, sourceRef/providerId/kind
  integrity, target kind matching, and providerScore range.

Retrieval / Music Data Platform workspace
  validates that the candidate can be converted into a material candidate row:
  source kind maps to a supported material candidate kind, ref keys are safe,
  materialCandidateRef can be constructed, and searchable fields can be
  generated.
```

If a validated provider candidate cannot be converted into a mixed retrieval
row, Retrieval fails with
`music_intelligence.provider_search_result_invalid`.

`providerScore` does not participate in Phase 15 mixed ranking. The cache may
retain `providerScore` as provider-returned candidate metadata, but Music Data
Platform retrieval ranking must not use it in Phase 15. Mixed ranking is based
on MineMusic-owned text evidence and stable tie-breaks, not on
provider-specific score semantics.

### Known Candidate Resolution

Phase 15 uses exact source identity only to resolve a provider candidate to an
existing durable material:

```text
ProviderMaterialCandidate.sourceEntity.sourceRef
-> refKey(sourceRef)
-> source_material_bindings.source_ref_key
-> material_ref_key
```

If a current binding exists, the provider candidate resolves to that durable
material and the query returns a `material` hit. Dedupe against durable rows is
then by `materialRef`.

If no current binding exists, the provider candidate remains a
`material_candidate` hit. It must not be title-matched, artist-matched,
canonical-guessed, or merged with a durable material during query.

### Owner Visibility And Blocked Materials

Local catalog rows still come from owner catalog visibility.

Provider-search resolved durable materials may be returned even when they are
not currently in `owner_material_catalog_view`. Provider search is an external
recall source and may find a known material outside the local visible catalog.

However, provider search must not bypass active owner blocking. If a resolved
durable material has an active material-scope `blocked` owner relation for the
query owner scope, it must be excluded.

This blocked check must not read `owner_material_catalog_view`. The catalog view
is the positive visible catalog, not the negative relation source. Provider
resolved durable materials may be outside that view.

Phase 15 blocked filtering for provider-resolved durable materials must read
`owner_material_relations` source-of-truth:

```sql
owner_scope = ?
material_ref_key = ?
relation_kind = 'blocked'
status = 'active'
```

Unresolved `material_candidate` rows have no durable material identity, so
Phase 15 cannot apply material-scope blocked checks to them. Source-scope or
candidate-scope policy is outside this phase.

Because mixed provider retrieval can return rows outside owner catalog, result
basis must not keep a single global `ownerCatalogVisibilityApplied: true`
meaning for the whole page. Visibility/blocking facts need to be represented at
the mixed row/query boundary without claiming that every row came through owner
catalog visibility.

`refKey(sourceRef)` is not a semantic duplicate detector. It only proves that
the candidate is the same provider source identity that was already bound
before. It does not dedupe:

```text
same track across different providers
same recording represented by multiple provider ids
different versions with similar titles
same title/artist text collisions
```

Those cases belong to later durable source/material write commands, canonical
maintenance, or identity resolution work.

### Dedupe And Internal Row Evidence

Provider-search duplicates must not amplify ranking.

Deduplication keys:

```text
resolved provider candidate -> materialRef
unresolved provider candidate -> materialCandidateRef
```

If one provider response repeats the same candidate, or multiple provider-search
pools produce the same material candidate ref, the mixed query keeps one row for
ranking.

Provider-search candidates that resolve to an existing source-material binding
participate in mixed ranking as provider-recalled durable materials, but the
query output returns only the durable `material` hit. Only unresolved provider
candidates return `material_candidate` hits with `materialCandidateRef`.

An internal provider candidate row may therefore carry:

```text
resolvedMaterialRefKey, when the provider source already has a current binding
materialCandidateRef, when the provider source is unresolved
```

### Mixed Ranking And Cursor Position

Phase 15 mixed provider-search queries use only `order: "text_relevance"`.

The mixed text-relevance order is:

```sql
ORDER BY
  matched_token_count DESC,
  best_field_priority ASC,
  rank_sort_value ASC,
  row_kind_sort ASC,
  stable_ref_key ASC
```

Sort fields:

```text
matched_token_count
  Number of query tokens matched by the row's searchable text fields.

best_field_priority
  Best matched text field priority using the Phase 12 field priority semantics.

rank_sort_value
  MineMusic-owned FTS/text rank sort value. Lower is better, matching Phase 12
  text relevance ordering.

row_kind_sort
  material = 0
  material_candidate = 1

stable_ref_key
  material -> refKey(materialRef)
  material_candidate -> refKey(materialCandidateRef)
```

`providerScore` does not participate in this order.

Mixed cursor position uses the same ordering fields:

```ts
type MixedRetrievalCursorPosition = {
  order: "text_relevance";
  matchedTokenCount: number;
  bestFieldPriority: number;
  rankSortValue: number;
  rowKind: "material" | "material_candidate";
  stableRefKey: string;
};
```

The cursor comparison must continue strictly after the last visible row using
the complete tuple above. This avoids duplicate or skipped rows when durable
materials and material candidates have identical text-rank fields.

### Internal Query Hit Shape

Phase 15 query results can contain durable material hits and result-set-scoped
material candidate hits:

```ts
type RetrievalQueryHit =
  | {
      kind: "material";
      materialRef: Ref;
      // ranking, text evidence, and pool evidence
    }
  | {
      kind: "material_candidate";
      materialCandidateRef: Ref;
      // ranking, text evidence, and provider-search evidence
    };
```

Material candidate query rows do not inline the full
`ProviderMaterialCandidate`. The full provider candidate facts live in
`material_candidate_cache`. Mixed retrieval rows carry only the material
candidate ref plus query-owned ranking/evidence fields needed by the retrieval
path.

Phase 15 does not decide how a future Stage Interface tool should expose, hide,
compact, or translate `materialCandidateRef`.

## Write Boundary Constraint

Writing result-set rows and material candidate cache rows is still a write.

Phase 15 must not hide candidate-row mutation inside the Phase 12
`MusicDataPlatformRetrievalReadPort` as if it were a pure read operation.

The existing Phase 12 `MusicDataPlatformRetrievalReadPort` stays a pure local
read port. Phase 15 adds a separate Music Data Platform retrieval-query
workspace/port that owns result-set writes and mixed SQL
query execution.

The mixed provider retrieval boundary must not be named `*ReadPort`.
Acceptable naming should expose that it owns runtime/query workspace writes,
for example `MusicDataPlatformRetrievalWorkspace` or
`MusicDataPlatformMixedRetrievalWorkspace`.

The retrieval-query workspace/port:

1. accepts validated provider candidates for a specific query;
2. creates a TTL-backed mixed retrieval result set;
3. writes result-set rows, result-set FTS rows, and material candidate cache
   rows;
4. executes SQL ranking/filtering/pagination over durable and result-set-scoped
   candidates;
5. expires result-set rows through the cleanup command;
6. exposes no durable material/source/canonical write capability.

Allowed writes:

```text
material_candidate_cache
retrieval_result_sets
retrieval_result_rows
retrieval_result_text_fts
```

Forbidden writes:

```text
source_records
material_records
canonical_records
source_material_bindings
source_library_items
owner_material_relations
projection_maintenance_targets
material_text_documents
material_text_fts
owner_material_entries
```

The mixed workspace may read `owner_material_catalog_view` for local catalog
visibility, but it must not treat the view as a runtime candidate cache or
source-of-truth write target.

## Error Model

Provider-search retrieval errors are owned by Music Intelligence at the
Retrieval boundary. Extension Source Provider Slot errors may be attached as
`cause`, but Retrieval should expose Retrieval-owned error codes to its caller.

Minimum error codes:

```text
music_intelligence.provider_search_pool_invalid
music_intelligence.provider_search_unavailable
music_intelligence.provider_search_failed
music_intelligence.provider_search_result_invalid
music_intelligence.retrieval_result_set_expired
music_intelligence.material_candidate_expired
music_intelligence.retrieval_cursor_invalid
```

Examples:

```text
provider not registered / search unsupported
  -> music_intelligence.provider_search_unavailable

provider search returned failure or threw
  -> music_intelligence.provider_search_failed

provider output passed Extension as invalid or cannot be converted to material
candidate rows
  -> music_intelligence.provider_search_result_invalid

provider_search used in allOf/noneOf, unsupported materialKind, wrong order,
invalid limit
  -> music_intelligence.provider_search_pool_invalid
```

## Execution Sketch

```text
1. Retrieval normalizes input and validates typed pools.
2. Retrieval identifies provider_search pools.
3. If cursor is absent, Retrieval calls the provider-search port for each
   provider_search pool in parallel.
4. If cursor is present, Retrieval loads the mixed retrieval result set and does
   not call providers or re-read local catalog rows.
5. Source Provider Slot validates provider output and returns
   ProviderMaterialCandidate[].
6. Retrieval passes validated candidates plus the normalized durable pools into
   the Music Data Platform retrieval-query workspace.
7. Music Data Platform creates/loads the mixed retrieval result set.
8. Music Data Platform resolves known provider source refs to durable material
   rows when source/material binding already exists.
9. Music Data Platform keeps unknown provider candidates as material candidate
   rows.
10. Music Data Platform applies anyOf/allOf/noneOf, owner catalog visibility,
   text matching, dedupe, sorting, and SQL keyset pagination in SQL.
11. Retrieval shapes returned rows into internal query hits.
```

## PR Split

Phase 15 should be implemented as four PRs:

```text
PR 15A: typed pool input migration
PR 15B: runtime mixed result-set foundation
PR 15C: mixed retrieval result-set query with fixture candidates
PR 15D: Source Provider Slot wiring into Retrieval
```

### PR 15A: Typed Pool Input Migration

Goal:

```text
Replace Phase 12 bare Ref[] pool filters with typed pool objects while
preserving local-only retrieval behavior.
```

Scope:

- update Retrieval input contracts and normalization to use typed pools;
- rename `RetrievalQueryInput.poolFilter` to `pools` and reject `poolFilter`;
- keep the existing Music Data Platform local retrieval read port focused on
  durable pool refs;
- normalize typed durable pools into the durable-pool input the local read port
  needs;
- support local catalog, source-library, and owner-relation typed pools;
- keep provider-search pools rejected until PR 15D wiring exists;
- replace the active cursor payload contract and query fingerprinting for typed
  pools;
- update local retrieval tests and guards;
- reject the old bare-ref `allOf` / `anyOf` / `noneOf` shape.

PR 15A must not make the Phase 12 local read port accept the full
provider-aware typed pool union. The provider-aware mixed query plan belongs to
the new retrieval-query workspace introduced in PR 15C.

PR 15A keeps `RetrievalQueryService.query(...)` synchronous. Typed pool input
migration does not require provider calls or async control flow.

### PR 15B: Runtime Mixed Result-Set Foundation

Goal:

```text
Add the Music Data Platform-owned runtime mixed result-set foundation without
mixed SQL retrieval.
```

Scope:

- add runtime schema for `retrieval_result_sets`, `retrieval_result_rows`,
  `retrieval_result_text_fts`, and `material_candidate_cache`;
- add records/repositories or workspace-owned persistence helpers for those
  runtime result-set tables;
- add deterministic `materialCandidateRef` creation from
  `digest(refKey(sourceEntity.sourceRef))`;
- enforce `materialCandidateRef` cache resolution by `material_candidate_ref_key`;
- add result-set fingerprint storage and expiry behavior;
- add opportunistic cleanup for expired retrieval result sets and expired
  material candidates;
- keep mixed retrieval query execution out of this PR;
- add guards that prevent Music Intelligence from writing runtime candidate
  cache/result-set SQL directly.

PR 15B keeps Retrieval query execution synchronous.

### PR 15C: Mixed Retrieval Result-Set Query With Fixture Candidates

Goal:

```text
Add the Music Data Platform-owned mixed retrieval result-set query using fixture
provider candidates, without calling real providers.
```

Scope:

- build bounded TTL-backed mixed result sets containing local material rows
  selected into the result window, provider-resolved durable material rows, and
  provider unresolved material_candidate rows;
- add result-set-level FTS corpus rows for mixed text relevance ranking;
- add the retrieval-query workspace/port that owns result-set writes and
  mixed SQL query execution;
- load fixture provider candidates through the runtime candidate cache and
  mixed result set;
- support known candidate resolution through exact source-material binding;
- support unresolved `material_candidate` rows;
- apply owner blocked exclusion for resolved durable materials;
- support mixed text relevance ordering and `MixedRetrievalCursorPosition`;
- support cursor pagination through `resultSetId` and SQL keyset pagination
  over `retrieval_result_rows`;
- add guards that prevent a TypeScript candidate pool sort/merge path.

PR 15C uses fixture provider candidates and keeps Retrieval query execution
synchronous.

### PR 15D: Source Provider Slot Wiring Into Retrieval

Goal:

```text
Connect provider_search typed pools to Extension Source Provider Slot search
and feed validated provider candidates into the mixed retrieval workspace.
```

Scope:

- add a narrow provider-search capability consumed by Retrieval;
- make `RetrievalQueryService.query(...)` async so local-only and
  provider-search queries share one API;
- enforce top-level text, provider id, target kind, limit, order, and any-only
  validation;
- fail the whole query on provider-search failure;
- add NCM-backed smoke coverage for local + provider mixed retrieval.

Retrieval consumes a narrow provider-search port rather than importing the
Extension runtime:

```ts
type RetrievalProviderSearchPort = {
  search(input: {
    providerId: string;
    query: SourceQuery;
    sessionId?: string;
  }): Promise<SourceProviderSearchResult>;
};
```

Server Host or another composition root adapts the Extension Source Provider
Slot runtime to this port. Retrieval must not import plugin runtime,
capability registry internals, or concrete provider plugins.

## Architecture Guards

Minimum guard coverage:

```text
PR 15A
  Retrieval pool filters no longer accept bare Ref[] allOf/anyOf/noneOf shape.
  provider_search typed pools are rejected until PR 15D wiring exists.

PR 15B
  Music Intelligence Retrieval cannot call db.run or low-level repository
  writes for material candidate cache or retrieval result-set state.
  Runtime result-set writes exist only in the Music Data Platform retrieval
  result-set boundary.

PR 15C
  The Phase 12 Music Data Platform local read port remains pure local read.
  Mixed result-set writes exist only in the Music Data Platform
  retrieval-query workspace/command boundary.
  Query service must not implement a TypeScript candidate pool sort/merge path
  for mixed provider retrieval.

PR 15D
  Retrieval does not import Extension plugin runtime, capability registry
  internals, or concrete provider plugins.
  Providers still cannot import MaterialEntity, MaterialRecord, or Material
  Data Platform write modules.
```
