# Phase 12 Retrieval Query Foundation

> Status: Implemented through PR12C
> Phase owner: Music Intelligence / Retrieval, with Music Data Platform read
> support
> Output type: internal retrieval query service and query-ready Music Data
> Platform read port

Phase 12 introduces the first internal local-pool retrieval query foundation.
It turns the read models created in Phases 8 through 11 into query results for
agent decision-making without exposing a Stage Interface tool, returning
`MaterialCard`, calling providers, or writing source-of-truth facts.

This phase exists because MineMusic now has the necessary local read-model
ingredients:

- owner catalog entries and `owner_material_catalog_view`;
- owner-relation pools for positive owner material relations;
- material text documents and FTS;
- projection maintenance dirty/failed tracking and explicit rebuild runner.

Phase 12 defines who reads those models, how pool algebra works, what a query
hit contains, and which work remains outside the read path.

## Established Constraints

- Retrieval belongs to Music Intelligence, not Music Data Platform and not
  Stage Interface.
- Music Data Platform owns projection storage, SQL details, and the query-ready
  read port that reads owner catalog, material text, and projection
  maintenance state.
- Retrieval must not depend on raw Music Data Platform repository,
  projection-record, or command modules.
- Query paths are read paths. They must not mark projection dirty, rebuild
  projections, call `ProjectionMaintenanceRunner`, materialize provider
  candidates, or write durable facts.
- Complex database set operations must be expressed in SQL owned by the Music
  Data Platform read port. Retrieval must not pull full owner catalog,
  entry, or text-projection rows into TypeScript and then implement
  intersection, union, exclusion, ordering, or pagination as caller-owned
  pipelines.
- The read port may use CTEs and internal SQL builders, but pool/text/ranking
  and keyset pagination must remain a database query, not a multi-stage
  TypeScript pipeline.
- Phase 12 must not introduce public Stage Interface tools, query-to-present,
  final `MaterialCard`, playable links, provider search, provider candidate
  materialization, source writeback, Collection writes, signals, Memory,
  Music Experience scoring, or final recommendation judgement.

## Ownership

Music Intelligence / Retrieval owns:

- internal retrieval query vocabulary and supported expression surface;
- effective query input normalization before calling the read port;
- opaque cursor encode/decode and query-fingerprint validation;
- conversion from Music Data Platform query-ready rows to
  `RetrievalQueryResult` / `RetrievalQueryHit`;
- explaining retrieval evidence without computing SQL rank or database
  membership.

Music Data Platform owns:

- query-ready read port over owner catalog and material text projections;
- executable semantics of pool algebra, text FTS matching, kind filtering,
  ordering, row-level matched pool/text evidence, and cursor pagination;
- compact projection freshness reads;
- complete `Ref` reconstruction and read-model consistency validation;
- hiding projection row shapes from Retrieval.

Retrieval defines what callers can ask for and how query evidence is shaped.
Music Data Platform defines how the local read models decide row membership,
ranking, ordering, and keyset continuation.

Stage Interface owns no Phase 12 behavior.

## Error Boundaries

PR 12A uses `MusicDataPlatformError` for Music Data Platform read-port
invariants, including invalid pool refs, missing source-library pools,
invalid read cursor positions, and read-model consistency failures.

PR 12C introduces `MusicIntelligenceError` for Retrieval-owned invariants,
including invalid retrieval query input, unsupported options, and opaque cursor
fingerprint mismatch.

Cursor validation is split by boundary:

```text
Retrieval validates opaque cursor payloads:
  base64url decode
  JSON shape
  version
  query fingerprint mismatch

Music Data Platform validates typed cursor positions:
  position order matches input order
  numeric sort keys are finite
  timestamp sort keys are valid comparable catalog timestamps
  materialRefKey is ref-key safe
  the position shape is allowed for the requested order
```

Phase 12 internal services throw internal area errors. They do not return Stage
Interface `Result<T>` and do not introduce agent-facing error protocols. A
later Stage Interface tool phase can translate internal errors into public
tool results.

## PR Split

Phase 12 should be implemented as three PRs:

```text
PR 12A: Music Data Platform Retrieval Read Port, no text
PR 12B: Music Data Platform Text Query Integration
PR 12C: Music Intelligence Retrieval Service
```

PR 12A creates the no-text query-ready database read port:

- SQL pool algebra over owner catalog entries;
- owner catalog visible-material scoping;
- `materialKind` filtering;
- `stable` and `recently_added` ordering;
- SQL keyset pagination for no-text orders;
- matched positive pool evidence;
- complete `Ref` reconstruction/validation;
- coarse freshness reads.

PR 12A must not create Music Intelligence services, Stage Interface tools, or
text-search behavior.
PR 12A exports the final retrieval read-port input shape, but it must reject
text features until PR12B:

```text
text present
  reject

order = text_relevance
  reject

cursorPosition.order = text_relevance
  reject
```

PR 12B replaces those unsupported errors with real text behavior.

It may export the narrow retrieval read port factory and types from
`src/music_data_platform/index.ts`, but it must not export SQL builders, raw
row mappers, cursor SQL snippets, or other implementation helpers.
PR 12A must not add a new query cache, search cache, or projection table. It
may add narrow indexes to existing Music Data Platform schema contributions
only when the PR's SQL requires them.

Expected PR 12A files:

- `src/music_data_platform/retrieval_read_model.ts`;
- `src/music_data_platform/index.ts`;
- `test/formal/music-data-platform-retrieval-read-model.test.ts`;
- `test/formal/active-tree.test.ts`;
- `test/run-stage-core-tests.ts`;
- Music Data Platform area docs listed below.

PR 12A tests must cover:

- no-text default query over owner catalog visible materials, default
  `recently_added` order, and blocked material exclusion;
- non-default owner scopes rejected by the Music Data Platform retrieval read
  port;
- `source_library` pool filters for `allOf`, `anyOf`, and `noneOf`, including
  missing source-library pool errors;
- `owner_material_relation_pool` filters for supported saved/favorite pools,
  including empty pools returning empty result pages without errors;
- wrong-owner pool refs, including valid-shaped source-library refs belonging
  to another owner scope and valid-shaped owner-relation pool refs for another
  owner scope;
- `owner_material_relation_pool` refs with unsupported relation kinds such as
  `blocked`;
- single `materialKind` filtering for recordings, albums, and artists;
- missing material text documents tolerated for no-text rows with empty display
  text and empty/undefined text evidence;
- SQL-level keyset pagination for `stable` and `recently_added`;
- coarse freshness reads, including current-owner catalog dirty/failed targets,
  global material-text dirty/failed targets, and other-owner catalog dirty
  targets not affecting the current owner scope;
- validation errors for unsupported pool refs, invalid limits, invalid material
  kinds, text present before PR12B, `text_relevance` before PR12B, and invalid
  no-text cursor positions.

PR 12A verification is deterministic database testing. It does not require
live NCM/provider smoke because the retrieval read port consumes already
persisted facts and projections.

PR 12A updates Music Data Platform area docs:

- `docs/music-data-platform/design.md`;
- `docs/music-data-platform/ports.md`;
- `docs/music-data-platform/progress.md`.

PR 12B adds text-query execution to the same Music Data Platform retrieval
read port:

- prefix OR FTS query construction;
- FTS join with owner catalog visibility and pool filters;
- explicit field-aware ranking;
- `text_relevance` ordering and keyset cursor positions;
- matched text field and token evidence;
- text-query validation.

PR 12B must not create Music Intelligence services, Stage Interface tools, or
Retrieval hit contracts. It extends the MDP query-ready row contract created
in PR12A.

PR 12B expected files are the same Music Data Platform read-port, tests,
guards, and area docs touched by PR12A unless narrow text helpers are needed
inside Music Data Platform.

PR 12B tests must cover:

- prefix OR text recall, where rows matching more query tokens rank above rows
  matching fewer tokens;
- FTS literal escaping and operator-safety;
- stable token dedupe and query-token limit behavior;
- all-dropped tokens treated as absent text;
- field-aware ranking where `title_text` evidence outranks `alias_text`
  evidence and aliases can help recall without acting as primary title
  evidence;
- `matchedTokenCount` counts distinct matched query tokens, not field
  occurrences;
- missing material text projections cannot be recalled by text and do not crash
  the query;
- `text_relevance` cursor positions and SQL keyset pagination;
- matched text fields and token evidence;
- result order does not rely on normalized `rankScore.value`;
- explicit `text_relevance` without effective text rejected by the read port.

PR 12C owns the Retrieval service:

- `src/music_intelligence/retrieval/**`;
- retrieval input/result/hit contracts;
- cursor encode/decode and query fingerprinting;
- validation of query-level options;
- conversion from MDP query-ready rows to `RetrievalQueryHit`;
- architecture guards for the new Music Intelligence boundary.

PR 12C exposes a factory/service shape:

```ts
type CreateRetrievalQueryServiceInput = {
  readPort: MusicDataPlatformRetrievalReadPort;
};

type RetrievalQueryService = {
  query(input: RetrievalQueryInput): RetrievalQueryResult;
};

function createRetrievalQueryService(
  input: CreateRetrievalQueryServiceInput,
): RetrievalQueryService;
```

Retrieval service receives the narrow Music Data Platform read port. It must
not construct Music Data Platform repositories, projection records, commands,
or concrete database adapters.

`query(...)` is synchronous in Phase 12 because it reads synchronous local
database ports only. Phase 12 does not call providers, network services, LLMs,
or remote Knowledge.

PR 12C must not implement pool algebra, sorting, pagination, or projection row
joins in TypeScript.

PR 12C creates the Music Intelligence area docs alongside the new code
boundary:

- `docs/music-intelligence/README.md`;
- `docs/music-intelligence/design.md`;
- `docs/music-intelligence/ports.md`;
- `docs/music-intelligence/progress.md`.

Do not create empty Music Intelligence area docs before the PR that introduces
the actual Music Intelligence code boundary.

## Confirmed Decisions

### Boundary

Phase 12 is `Music Intelligence / Retrieval Query Foundation`.

Do not place query orchestration in Music Data Platform. Music Data Platform
already owns facts, projections, read models, and executable database query
semantics. Retrieval owns query vocabulary, query normalization, opaque cursor
handling, and result evidence shaping over the narrow read port.

Do not place retrieval SQL or pool algebra in Stage Interface. Stage Interface
may later expose compact agent-facing tools, but it must not own query
semantics.

### Query Source

Phase 12 queries only the local material pool already represented in formal
storage.

It does not call Source Provider search, NCM search, Spotify search, or any
provider-native lookup. It does not create source, material, canonical, owner
relation, source-library, projection, or maintenance rows.

### Pool Sources

Phase 12 supports the pool identities that can already be represented by owner
catalog projection:

```text
source_library:<libraryKind>:<id>
owner_material_relation_pool:<relationKind>:<id>
```

`source_library` pools represent imported provider account-library scopes such
as saved tracks, saved albums, or followed artists.

`owner_material_relation_pool` pools represent positive local owner relation
scopes such as saved or favorite.

Supported `source_library.kind` values are:

```text
saved_source_track
saved_source_album
followed_source_artist
```

Supported `owner_material_relation_pool.kind` values are:

```text
saved
favorite
```

Collection pools are out of Phase 12 because Collection source-of-truth writes
and Collection owner catalog producers do not exist yet.

Unsupported pool refs must be rejected, not ignored. Phase 12 accepts only
`source_library` refs and `owner_material_relation_pool` refs in pool filters.
Collection refs, material refs, source refs, per-material owner relation refs,
or unknown refs are invalid retrieval input until the corresponding source
facts and catalog producers exist.

Retrieval service validates supported pool ref shapes before calling Music
Data Platform. The Music Data Platform read port validates again and verifies
that refs can be resolved against the requested owner scope/read model.
`source_library` pool refs must exist and belong to the requested owner scope.
`owner_material_relation_pool` refs must match the requested owner scope by
comparing them with the expected deterministic pool ref for that
`ownerScope + relationKind`.

Supported but unresolved pools are handled by pool type:

```text
source_library
  Must resolve to an existing source library for the requested owner scope.
  Missing source-library pools are errors.

owner_material_relation_pool
  Supported positive relation-kind pools are valid even when they currently
  have no entries. An empty saved/favorite pool returns no matching rows rather
  than an error.
```

### Material Kind Filter

Phase 12 supports one optional material kind filter:

```ts
materialKind?: MaterialEntityKind;
```

`undefined` means all material kinds visible in the owner catalog. Phase 12
does not support multiple material kinds in one query input. If that becomes
necessary later, the input can be extended to a `materialKinds` collection.

### Pool Algebra

Phase 12 uses a shallow pool filter instead of an arbitrary expression tree:

```ts
type RetrievalPoolFilter = {
  allOf?: Ref[];
  anyOf?: Ref[];
  noneOf?: Ref[];
};
```

Semantics:

```text
allOf
  A material must belong to every listed pool.

anyOf
  When present, a material must belong to at least one listed pool.

noneOf
  A material must not belong to any listed pool.
```

No `poolFilter` means the selected base set is
`owner_material_catalog_view` for the requested owner scope. The view already
contains active positive owner catalog membership and excludes active
material-scope blocked facts. When `poolFilter` is present, the base owner
catalog visibility still applies first; `allOf`, `anyOf`, and `noneOf` are
additional constraints over positive pool membership.

The filter can express intersection, union, and exclusion without introducing
arbitrary nested boolean expressions in Phase 12.

Pool algebra must be executed by the Music Data Platform retrieval read port
using SQL. Retrieval must not scan full owner catalog rows and compute pool
membership in TypeScript.

Matched pool evidence is deterministic:

```text
allOf
  Every positive allOf ref that the material belongs to is returned.

anyOf
  Only the anyOf refs that the material actually belongs to are returned.

noneOf
  Refs are never returned because they are exclusion constraints.
```

When `allOf` and `anyOf` are both present, `matchedPoolRefs` is the deduped
positive match union, sorted by `refKey(...)` ascending. With no pool filter,
`matchedPoolRefs` is empty.

### Text Query

`text` is optional.

`undefined`, empty, blank, or normalized-empty text is treated as absent text.

When `text` is present, the Music Data Platform retrieval read port uses the
material text FTS projection and intersects text matches with owner catalog
visibility and pool filters. The input is free text. Callers do not supply
tokens.

The read port owns normalization, tokenization, and FTS query construction.
The default text search behavior should favor recall first:

```text
free text
-> normalize/tokenize
-> prefix OR recall over indexed material text fields
-> order using field-aware FTS ranking and stable tie-breaks
```

Retrieval passes the effective normalized text used in query echo and cursor
fingerprinting. Music Data Platform still runs SQL-facing normalization and
tokenization defensively before building the FTS query, and equivalent
normalized text must produce equivalent token sets.

`prefix_or_v1` query construction rules:

```text
normalize text
  NFKC, trim, lowercase, collapse whitespace

tokenize
  use the Music Data Platform material-text tokenizer rules

dedupe
  keep first occurrence order, then cap at 12 tokens

escape
  every token is escaped as a literal FTS prefix term

expression
  token1* OR token2* OR ...

empty result
  if no usable tokens remain, treat text as absent
```

Phase 12 does not drop valid tokens solely because they are short. The token
count cap is the Phase 12 guard against unbounded recall. Operator characters,
quotes, punctuation, and other FTS syntax must not be allowed to become query
operators.

Do not use all-terms hard filtering as the default Phase 12 behavior. A query
such as `plainsong live` should rank rows matching both tokens above rows that
match only one token, but one-token matches may still be returned when they are
inside the requested pool and page.

Phase 12 does not implement typo fuzzy search, semantic synonym expansion, LLM
reranking, or language-specific Chinese/Japanese word segmentation beyond the
configured FTS tokenizer and the normalization/query-construction code owned
by Music Data Platform.

Phase 12 does not expose a text-match mode option. The internal text matching
strategy is fixed as `prefix_or_v1`: free text is normalized/tokenized,
prefix-based OR recall is used for candidate retrieval, and field-aware
ranking orders the candidates. The strategy/version participates in cursor
fingerprints so future matching changes invalidate old cursors.

Retrieval must not import Music Data Platform's material text normalization
helper. The Music Data Platform read port owns SQL-facing text normalization
and tokenization. Retrieval may perform its own minimal query normalization for
fingerprinting, using the same intended rules (`NFKC`, trim, lowercase, and
whitespace collapse), and tests should pin that cursor fingerprints remain
stable for equivalent query text.

When `text` is absent, retrieval still supports pool/list queries, such as
recently added items in a source library or saved/favorite candidates.

The default owner-scoped query range is owner catalog visible materials, not
owner-neutral all active materials. Owner catalog visibility naturally excludes
active blocked material facts through `owner_material_catalog_view`.
Phase 12 does not support an `includeBlocked` or blocked-audit retrieval mode.
Blocked/audit reads belong to separate owner-relation or catalog-audit APIs if
needed later.

Phase 12 supports only `DEFAULT_OWNER_SCOPE`. Retrieval may default
`ownerScope` to `DEFAULT_OWNER_SCOPE`, but non-default owner scopes are invalid
until the project introduces multi-owner write fanout and projection
maintenance semantics.
`ownerScope` is optional on `RetrievalQueryInput` and defaults to
`DEFAULT_OWNER_SCOPE`. Music Data Platform read-port inputs receive the
resolved effective owner scope as a required value.

### Ordering

Phase 12 supports only:

```text
text_relevance
recently_added
stable
```

Rules:

```text
text_relevance
  Available only when text is present. Uses FTS ranking evidence plus a stable
  material ref tie-break.

recently_added
  Uses the aggregated `recently_added_at` from the owner catalog read model plus
  a stable material ref tie-break.

stable
  Uses material ref key ordering for deterministic paging and tests.
```

Sort directions are fixed:

```text
stable
  material_ref_key ASC

recently_added
  recently_added_at DESC
  material_ref_key ASC

text_relevance
  matched_token_count DESC
  best_field_priority ASC
  rank_sort_value ASC
  material_ref_key ASC
```

Defaults:

```text
text present
  text_relevance

text absent
  recently_added
```

Explicit `text_relevance` without effective text is invalid. Retrieval must not
silently downgrade it to `recently_added`.

Phase 12 does not support random order, provider order, alphabetical order,
last-played order, recommendation score, taste score, Memory score, or Music
Experience scoring.

`text_relevance` must preserve field-role weighting. The indexed text fields
are role-separated:

```text
title_text
artist_text
album_text
version_text
alias_text
```

Search recall may use aliases and alternate segmentation, but ranking must not
treat alias evidence as primary title evidence. The read port may use SQLite
FTS5 `rank` / `bm25(...)`, but column weights alone are not enough to define
the ordering contract. The text relevance order must include explicit
field-role evidence.

The intended field priority is:

```text
title_text > artist_text / album_text > version_text > alias_text
```

The internal `text_relevance` order is:

```text
matched_token_count DESC
best_field_priority ASC    -- title=1, artist/album=2, version=3, alias=4
rank_sort_value ASC        -- SQLite FTS5 bm25/rank raw value is lower-is-better
material_ref_key ASC
```

`rank_sort_value` is an internal SQL sort key. The returned
`rankScore.value` remains normalized so higher values are more relevant inside
the same query.

`matchedTokenCount` is the number of distinct normalized query tokens matched
in at least one indexed field. It is not the number of field occurrences. If a
single token appears in title, artist, and alias, it still contributes one
matched token.

`bestFieldPriority` is the lowest numeric field priority among all matched
fields for the row:

```text
title = 1
artist = 2
album = 2
version = 3
alias = 4
```

The `rankScore` value returned to Retrieval is explanatory retrieval evidence.
It is not the ordering contract and must not be reused as a recommendation
score.

Phase 12 does not change the Phase 10 material text projection schema. If
alternate segmentation or alias evidence appears in `title_text`, that is a
projection contribution classification problem to fix in Music Data Platform,
not something Retrieval should compensate for by parsing text blobs. Phase 12
tests should pin that `alias_text` can help recall without outranking primary
`title_text` evidence as if it were the title field.

### Query Result Shape

Phase 12 returns query result/hit evidence for the next agent decision. It
does not return `MaterialCard`.

Draft shape:

```ts
type RetrievalQueryResult = {
  query: {
    ownerScope: string;
    text?: string;
    materialKind?: MaterialEntityKind;
    order: "text_relevance" | "recently_added" | "stable";
    poolFilter?: RetrievalPoolFilter;
  };
  basis: {
    ownerCatalogVisibilityApplied: true;
    blockedMaterialsExcluded: true;
  };
  hits: RetrievalQueryHit[];
  page: {
    limit: number;
    nextCursor?: string;
  };
  freshness?: RetrievalFreshness;
};

type RetrievalQueryHit = {
  materialRef: Ref;
  materialKind: MaterialEntityKind;
  display: {
    title?: string;
    artistsText?: string;
    album?: string;
    versionText?: string;
  };
  rankScore?: {
    kind: "fts_bm25";
    value: number;
  };
  matchedText?: {
    fields: ("title" | "artist" | "album" | "version" | "alias")[];
    tokensByField: {
      field: "title" | "artist" | "album" | "version" | "alias";
      tokens: string[];
    }[];
    summary: string;
  };
  pools: {
    matched: Ref[];
  };
  basis: {
    textMatched: boolean;
    poolFilterApplied: boolean;
    positivePoolMatched: boolean;
  };
};
```

`RetrievalQueryResult.query` reflects the effective normalized query, not raw
caller input. Text is normalized before echoing, and normalized-empty text is
omitted.

`rankScore` is retrieval ranking evidence. It is present only for text queries
and only comparable inside the same query execution. It is not a recommendation
score, not a user-taste score, not a Music Experience score, and not a
`MaterialCard` field.

When backed by SQLite FTS5, `rankScore.kind` should be `"fts_bm25"` and
`rankScore.value` should be normalized so higher values are more relevant
within the same query. SQLite FTS5 rank/BM25 raw values are an implementation
detail of the Music Data Platform read port and must not become public
Retrieval semantics. Retrieval must not sort by `rankScore.value`. The SQL
result order is already final; `rankScore.value` is explanatory evidence only.

`rankScore` appears only when the effective order is `text_relevance`.
`recently_added` and `stable` queries must not invent score values.

The hit must not expose raw owner catalog rows, raw material text document
JSON, raw projection maintenance rows, provider payloads, playable links, or
presentation card data.

Hit display fields come from projected material text columns only. Phase 12
does not re-read structured `MaterialEntity` or `SourceEntity` JSON to build
presentation data, and it does not attempt to reconstruct structured
`VersionInfo` from `versionText`. Full presentation belongs to later present
or Stage Interface output work.

No-text / pool queries use owner catalog membership as the base set and
left-join material text documents only for display fields. If
`material_text_documents` has no row for a visible material, the hit may return
empty display text fields and freshness may report `possibly_stale`. This is
projection staleness, not a read-model consistency error.

Text queries require `material_text_fts` / `material_text_documents` to recall
a material by text. If the text projection is missing, that material cannot be
returned by text matching until projection maintenance rebuilds it. This is
tolerated as projection staleness, not a query-path repair trigger.

`pools.matched` explains only pool refs that participated in the current
`poolFilter`. When no pool filter is provided, `pools.matched` is empty and
`basis.poolFilterApplied` and `basis.positivePoolMatched` are false. For a
`noneOf`-only filter, `poolFilterApplied` is true,
`positivePoolMatched` is false, and `pools.matched` is empty. Retrieval must
not dump every pool membership for the material as part of a query hit;
detailed membership/audit views belong to separate read APIs if needed later.

`matchedPoolRefs` / `pools.matched` include only positive matches from `allOf`
and `anyOf`. `noneOf` refs are exclusion constraints and must not be returned
as matched evidence.

For `allOf`, every listed positive ref that the material belongs to is returned.
For `anyOf`, only refs that the material actually belongs to are returned. When
both groups exist, the returned list is the deduped union sorted by
`refKey(...)` ascending.

Pool filter normalization dedupes refs inside each group. If the same ref
appears in a positive group (`allOf` or `anyOf`) and in `noneOf`, the query is
invalid and must fail instead of silently returning an empty page.

Empty pool arrays normalize to absent groups:

```text
allOf: [] -> absent
anyOf: [] -> absent
noneOf: [] -> absent
all groups empty -> no pool filter
```

### Pagination

Phase 12 uses opaque cursor pagination, not offset.

Input:

```ts
type RetrievalQueryInput = {
  ownerScope?: string;
  text?: string;
  materialKind?: MaterialEntityKind;
  poolFilter?: RetrievalPoolFilter;
  order?: "text_relevance" | "recently_added" | "stable";
  limit?: number;
  cursor?: string;
};
```

Cursor rules:

- `limit` defaults to 20 and must be an integer from 1 through 100.
- Cursor payload is internal and opaque to callers.
- Cursor must include enough ordering state for stable continuation.
- Cursor must carry a query fingerprint and be rejected when reused with a
  different query.
- Stable tie-break uses material ref key.
- Phase 12 does not guarantee consistent pagination across projection changes
  between page reads.
- Phase 12 does not return total counts. Query callers receive only the current
  page and an optional `nextCursor`.

Pagination must be SQL-level keyset pagination. The Music Data Platform read
port must apply pool/text/kind filters, cursor conditions, ordering, and
`LIMIT limit + 1` in SQL. It must not fetch all candidates and then sort or
slice in TypeScript.

Cursor sort keys depend on the effective order:

```text
stable
  material_ref_key ASC

recently_added
  recently_added_at DESC, material_ref_key ASC

text_relevance
  matched_token_count DESC, best_field_priority ASC, internal text rank sort key
  ASC, material_ref_key ASC
```

The internal text rank sort key may use SQLite FTS5 raw rank/BM25 semantics,
but the returned `rankScore.value` remains normalized so higher values are
more relevant.

Keyset cursor conditions must respect mixed sort directions. For example,
`recently_added` continuation is:

```sql
recently_added_at < :cursorRecentlyAddedAt
OR (
  recently_added_at = :cursorRecentlyAddedAt
  AND material_ref_key > :cursorMaterialRefKey
)
```

`text_relevance` continuation uses the same lexicographic pattern over
`matched_token_count DESC`, `best_field_priority ASC`, `rank_sort_value ASC`,
and `material_ref_key ASC`.

Opaque cursor encoding belongs to Retrieval, not Music Data Platform. The
Retrieval service owns query fingerprinting, cursor encode/decode, and cursor
mismatch errors. The Music Data Platform read port receives only decoded typed
keyset positions, such as:

```ts
type RetrievalReadCursorPosition =
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
```

The read port uses that typed position to build SQL keyset conditions. It does
not own opaque cursor string format.

The Music Data Platform read port returns the next typed cursor position
because it owns the SQL ordering truth, including internal text relevance sort
keys. Retrieval must not re-derive SQL sort keys from display fields or
normalized `rankScore`; it only wraps the typed cursor position into an opaque
cursor.

Phase 12 cursor encoding is internal, versioned, base64url JSON:

```ts
type RetrievalCursorPayload = {
  version: 1;
  queryFingerprint: string;
  position: RetrievalReadCursorPosition;
};
```

Phase 12 does not encrypt or sign cursors because it does not expose a public
Stage Interface tool. Decode failure, unsupported version, invalid position,
or query fingerprint mismatch are `MusicIntelligenceError` cases.

The query fingerprint includes every normalized field that changes result
membership or order:

- owner scope;
- normalized text;
- material kind;
- normalized `poolFilter`, with refs ordered by `refKey(...)` inside `allOf`,
  `anyOf`, and `noneOf`;
- effective order;
- text matching strategy/version.

The fingerprint does not include `limit` or cursor value. A caller may request
a different page size when continuing the same logical query, but changing
text, pools, owner scope, material kind, ordering, or matching strategy must
invalidate the cursor.

### Projection Freshness

Retrieval query must not synchronously run projection maintenance.

The query may return compact freshness evidence:

```ts
type RetrievalFreshness = {
  status: "current" | "possibly_stale";
  dirtyTargetCount?: number;
  failedTargetCount?: number;
};
```

This freshness value is a read-only hint. It must not mark dirty, clean dirty
targets, fail targets, rebuild projections, or call the runner.

Phase 12 freshness is coarse. It does not attempt exact per-query dirty-impact
analysis. The Music Data Platform read port should count:

```text
owner catalog dirty/failed targets for the requested ownerScope:
  owner_catalog_source_library
  owner_catalog_source_library_material
  owner_catalog_relation_material

material text dirty/failed targets globally:
  material_text
```

`dirtyTargetCount` counts targets with `status = 'dirty'`.
`failedTargetCount` counts targets with `status = 'failed'`.
`status` is `possibly_stale` when either count is greater than zero; otherwise
it is `current`.

The implementation must parse normalized target payloads by projection kind.
It must not detect owner scope with string `LIKE` over raw JSON.

Retrieval calls `getRetrievalFreshness(...)` with the effective owner scope of
the query. Freshness is independent of `poolFilter`, `text`, and
`materialKind`; Phase 12 deliberately does not compute exact per-query dirty
impact.

If any relevant dirty or failed targets exist, retrieval may report
`possibly_stale`. This is a warning, not a correctness gate.

### Stage Interface

Phase 12 does not expose a Stage Interface tool.

The first public agent-facing query tool belongs to a later phase, after the
internal retrieval result shape is implemented and verified. That later Stage
Interface work should compact/project Retrieval results; it should not own
retrieval SQL, pool algebra, or ranking evidence assembly.

### Music Data Platform Retrieval Read Port

Phase 12 introduces a Music Data Platform-owned narrow retrieval read port.

It returns query-ready rows instead of raw projection records:

```ts
type RetrievalOrder =
  | "text_relevance"
  | "recently_added"
  | "stable";

type RetrievalTextField =
  | "title"
  | "artist"
  | "album"
  | "version"
  | "alias";

type RetrievalReadPoolFilter = {
  allOf?: readonly Ref[];
  anyOf?: readonly Ref[];
  noneOf?: readonly Ref[];
};

type RetrievalMatchedTextTokenEvidence = {
  field: RetrievalTextField;
  tokens: readonly string[];
};

type MusicDataPlatformRetrievalReadPort = {
  searchOwnerCatalogMaterials(
    input: MusicDataPlatformRetrievalSearchInput,
  ): MusicDataPlatformRetrievalSearchPage;
  getRetrievalFreshness(input: {
    ownerScope: string;
  }): RetrievalFreshness;
};

type MusicDataPlatformRetrievalSearchInput = {
  ownerScope: string;
  text?: string;
  materialKind?: MaterialEntityKind;
  poolFilter?: RetrievalReadPoolFilter;
  order: RetrievalOrder;
  limit: number;
  cursorPosition?: RetrievalReadCursorPosition;
};

type MusicDataPlatformRetrievalSearchPage = {
  rows: readonly MusicDataPlatformRetrievalMaterialRow[];
  nextCursorPosition?: RetrievalReadCursorPosition;
};

type MusicDataPlatformRetrievalMaterialRow = {
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
```

`searchOwnerCatalogMaterials(...)` handles both text and no-text owner catalog
queries. The implementation may use internal helpers for text/no-text SQL
branches, but the read port should not expose separate public methods for
text search and catalog listing because pool algebra, kind filtering,
ordering, cursor handling, and freshness context are shared query concerns.

`MusicDataPlatformRetrievalSearchInput.text` is the effective normalized text
from Retrieval. Direct MDP callers must pass the same effective normalized
form. The read port still normalizes/tokenizes defensively for SQL-facing FTS
construction and must treat equivalent normalized text consistently.

`recentlyAddedAt` is the owner catalog recency timestamp derived by
`owner_material_catalog_view`. It is not a provider-added timestamp. The view
coalesces source-library provider/library timestamps, owner-relation update
timestamps, and entry creation timestamps, so a visible catalog row must have a
non-null comparable value. A null/invalid value is a read-model consistency
error.

Text evidence empty-value semantics:

```text
No-text queries
  matchedTextFields = []
  matchedTextTokensByField = undefined
  matchedTokenCount = undefined
  rankScore = undefined

Text queries
  matchedTextFields is non-empty
  matchedTextTokensByField is present
  matchedTokenCount is positive
  rankScore is present only when order = text_relevance
```

The port must hide:

- `OwnerMaterialEntryRecord`;
- `OwnerCatalogMaterialRecord`;
- `MaterialTextDocumentRecord`;
- raw `document_json`;
- raw `provenance_json`;
- raw `projection_maintenance_targets`;
- raw SQL table/view shapes.

The read port must return complete `Ref` values for material refs and matched
pool refs. Retrieval must not reconstruct refs by splitting `refKey(...)`
strings. If Music Data Platform cannot reconstruct or validate a ref from its
own records/helpers, that is a read-model consistency error, not a Retrieval
shaping concern.

Matched text evidence is structured field evidence. Phase 12 must not expose
SQLite `highlight(...)` or `snippet(...)` output as the query-hit contract.
The Music Data Platform read port should return matched field names and matched
token evidence. It must not generate English summaries.
Matched fields use stable order: `title`, `artist`, `album`, `version`,
`alias`.
Matched token evidence uses the same field order; tokens inside each field use
the normalized query-token order after dedupe and cap.
`matchedTokenCount` is text-query evidence and may be used for ordering
support or tests. It is absent for no-text queries and is not a standalone
recommendation or relevance score.
Retrieval may derive `matchedText.summary` from `matchedTextTokensByField` as a
stable machine-generated English phrase such as
`title matched plainsong; version matched live`. It is not localized and is
not ranking or policy input. The summary reports matched fields and query
tokens only. It must not dump raw projection contribution values or alias
lines from material text documents.

## Required Guards

PR 12A guards:

- Music Data Platform retrieval read port must not import Stage Interface,
  Music Intelligence, Extension provider/plugin implementations, or concrete
  SQLite adapter modules.
- No-text pool algebra, owner-visible scoping, ordering, and keyset pagination
  must live in the Music Data Platform retrieval read model, not in
  caller-owned pipelines.
- No workflow, Stage Interface, provider, or Retrieval code may call
  projection or source-of-truth write commands to satisfy a query.

PR 12B guards:

- Text FTS query construction, field-aware ranking, matched text evidence, and
  text-relevance cursor positions must live in the Music Data Platform
  retrieval read model, not in Retrieval or Stage Interface.
- Music Data Platform text retrieval helpers must not import Music
  Intelligence, Stage Interface, Extension provider/plugin implementations, or
  concrete SQLite adapter modules.
- PR12B must not introduce a query cache, search cache, new projection table,
  Stage Interface tool, or Music Intelligence service.

PR 12C guards:

- `src/music_intelligence/**` may depend only on narrow Music Data Platform
  retrieval read-port contracts, shared contracts, and its own modules.
- `src/music_intelligence/**` must not import Music Data Platform commands,
  repositories, projection record modules, projection maintenance commands,
  Stage Interface, Extension provider/plugin implementations, or concrete
  SQLite adapter modules.
- `src/music_intelligence/**` must not implement pool algebra, SQL joins,
  sorting, or pagination over raw Music Data Platform rows in TypeScript.

The active-tree root-shape guard should be updated when PR 12C introduces
`src/music_intelligence/**`.

## Implementation Plan

Implementation should follow
`phase-12-retrieval-query-foundation-implementation-plan.md`.
