# Phase 15 Provider Search Pool Retrieval

> Status: Design discussion draft, organized for implementation planning
> Phase owner: Music Intelligence / Retrieval, Music Data Platform Retrieval,
> and Extension Source Provider Slot
> Output type: internal provider-search pool retrieval foundation with
> session-scoped material candidate cache and query-scoped ranking workspace

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
  sessionId: "session-1",
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
- No durable materialization of ordinary provider search hits.
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
- request/session material candidate cache schema and semantics;
- provider candidate set schema and semantics;
- queryRunId-scoped temp ranking/text workspace;
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

Phase 15 replaces the Phase 12 `Ref[]` pool filter shape with typed pool
objects.

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
  sessionId: "session-1",
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
  sessionId: "session-1",
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

### Provider Search Pool Constraints

Phase 15 allows `provider_search` only inside `pools.anyOf`.

`pools.allOf` and `pools.noneOf` accept only durable pools in Phase 15. Provider
search intersection and exclusion require stronger source/material identity
matching semantics, especially when a provider candidate has not resolved to a
durable material.

`provider_search.providerId` is required. Missing provider id would imply
automatic fan-out across providers, which Phase 15 does not support.

Multiple providers can be expressed by multiple provider-search pools:

```ts
anyOf: [
  { kind: "provider_search", providerId: "netease", limit: 20 },
  { kind: "provider_search", providerId: "spotify", limit: 20 },
]
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

### Session Id

Queries that include `provider_search` require `sessionId`.

Local-only queries do not need a session id. Provider-search queries need one
because `materialCandidateRef` resolves through the session-scoped material
candidate cache. Without a session id, provider candidates could accidentally
become a process-global pool.

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

### Failure Policy

Provider search pool failures fail the whole query.

If a query explicitly includes a provider-search pool, that pool is part of the
query condition. Returning local-only results with a warning would incorrectly
imply that the provider was searched successfully and found nothing relevant.

When one query contains multiple provider-search pools, Retrieval executes
those provider searches in parallel and stores one combined candidate set
snapshot for the query. Any provider-search failure fails the whole query.
Provider call order must not affect candidate set identity, cursor behavior, or
ranking semantics.

## Candidate State Model

Phase 15 uses three state scopes:

```text
material_candidate_cache
  session-scoped runtime cache with TTL; resolves materialCandidateRef back to
  cached provider candidate facts.

provider_candidate_set
  session-scoped runtime cache with TTL; records the provider-search candidate
  snapshot for one normalized mixed query, including resolved durable material
  refs and unresolved material candidate refs.

temp_query_candidates / temp candidate text rows
  queryRunId-scoped ranking workspace; isolates the SQL candidate set for one
  query execution and is cleared after the query lifecycle.
```

The session cache keeps candidate facts available briefly after query. The
provider candidate set lets cursor pagination reuse the same provider recall
set without re-running provider search. The queryRunId workspace prevents
ranking rows from leaking across queries.

### Runtime Cache Ownership

The session-scoped material candidate cache and provider candidate set should
be database-backed runtime cache tables in Phase 15, not pure in-memory maps.
The mixed retrieval workspace needs to reload and join these rows for cursor
pages, and database-backed rows are easier to exercise with project-native
tests.

These runtime cache tables are not source-of-truth tables. Projection commands,
source-library import/update, owner relation commands, material text projection
commands, and identity commands must not treat them as durable facts.

Runtime cache schema belongs to Music Data Platform retrieval/query ownership.
It must not be owned by Storage, Extension, Source Provider Slot, or Server
Host. Storage may execute the schema contribution mechanically, but it does not
own the semantics.

Phase 15B should provide opportunistic cleanup through the retrieval-query
workspace or command boundary:

```text
cleanupExpiredMaterialCandidates(now)
cleanupExpiredProviderCandidateSets(now)
```

The workspace may call cleanup before starting a provider-search query. Phase
15 must not introduce a Server Host background scheduler solely for material
candidate cache cleanup.

### Material Candidate Cache Entry

The cache entry wraps provider-owned source facts. It does not create a durable
`SourceRecord`, `MaterialRecord`, canonical record, owner relation,
source-library item, or projection row.

The cache needs enough data to later reload and rank provider candidates:

```text
sessionId
materialCandidateRef
providerId
providerCandidateJson
providerScore
material candidate kind
searchable text fields derived from SourceEntity
expiresAt or equivalent cache lifetime metadata
```

`materialCandidateRef` is an internal material-facing cache ref. It is not a
durable `MaterialEntity.materialRef`, not a `sourceRef`, and not durable
identity.

`materialCandidateRef` is deterministic for the provider entity within the
candidate cache:

```text
providerId + sourceEntity.kind + sourceEntity.providerEntityId
-> material_candidate ref
```

The ref id is a deterministic digest of that tuple rather than the raw
`providerEntityId`:

```ts
{
  namespace: "material_candidate",
  kind: "provider_candidate",
  id: digest(providerId, sourceEntity.kind, sourceEntity.providerEntityId),
}
```

The ref must not include query text, rank, row position, or cursor position.
The cache entry keeps raw `providerId`, `sourceEntity.kind`, and
`providerEntityId` for debugging and later explicit materialization. The public
cache ref does not expose the provider entity id as its ref id.

The provider candidate's `sourceEntity.sourceRef` remains inside the cached
provider candidate facts for later explicit materialization or commit commands.
It is not used as the query-level material candidate selector.

Cached material candidates expire. Any later internal flow that receives a
`materialCandidateRef` must find a live cache entry before it can use it. If the
cache entry is missing or expired, that flow must fail with an explicit
material-candidate-expired error. It must not automatically re-run provider
search or silently pick a fresh provider result, because that could change the
selected candidate.

### Provider Candidate Set And Cursor Pagination

Phase 15 supports Retrieval cursor pagination for mixed provider-search
queries.

First page:

```text
cursor absent
  execute provider search
  write material_candidate_cache entries
  create a fresh provider_candidate_set snapshot
```

Cursor page:

```text
cursor present
  do not execute provider search
  require candidateSetId in the cursor
  reload provider candidates from that candidate set
```

Provider candidate sets are bound to the normalized query fingerprint. The
fingerprint includes at least:

```text
sessionId
ownerScope
normalized top-level text
materialKind
order
normalized typed pools
provider_search providerId
provider_search effective limit
```

Retrieval cursors for mixed provider-search queries carry an opaque candidate
set id and the query fingerprint. Cursor pages must compare the cursor
fingerprint with the current normalized query fingerprint. A mismatch fails as
an invalid cursor instead of reusing the wrong provider candidate set.

`candidateSetId` is an opaque snapshot id, not the fingerprint itself.

```text
candidateSetId = random/opaque id
candidateSet.queryFingerprint = deterministic fingerprint
```

The same normalized query may be searched again later and produce a different
provider result set. A fresh provider recall must create a fresh candidate set
instead of overwriting a previous cursor snapshot.

If the provider candidate set is missing or expired, the cursor page fails with
an explicit provider-candidate-set-expired error. It must not silently re-run
provider search.

## Mixed Retrieval Semantics

### Searchable Text

Unknown material candidates participate in MineMusic text matching and ranking.

The retrieval-query workspace derives request-scoped text fields from
`ProviderMaterialCandidate.sourceEntity` and inserts them into request-scoped
candidate text columns or temp FTS rows. It does not write durable
`material_text_documents` or `material_text_fts` rows for unknown provider
candidates.

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

These fields exist for request-scoped text matching and ranking. Phase 15 does
not define public output shape.

Provider URLs, playable links, provider entity ids, and raw provider payloads
must not be added to searchable text fields.

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

`refKey(sourceRef)` is not a semantic duplicate detector. It only proves that
the candidate is the same provider source identity that was already bound
before. It does not dedupe:

```text
same track across different providers
same recording represented by multiple provider ids
different versions with similar titles
same title/artist text collisions
```

Those cases belong to later explicit materialization, canonical maintenance, or
identity resolution work.

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

Internal mixed query rows should retain matched pool source membership. For
example, a durable material may enter the result set through both
`local_catalog` and `provider_search(netease)`. The retrieval-query boundary
may keep this as internal row evidence for dedupe, diagnostics, and later
output shaping. External output is outside Phase 15.

### Internal Query Hit Shape

Phase 15 query results can contain durable material hits and request-scoped
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

Writing request-scoped material candidate rows is still a write.

Phase 15 must not hide candidate-row mutation inside the Phase 12
`MusicDataPlatformRetrievalReadPort` as if it were a pure read operation.

The existing Phase 12 `MusicDataPlatformRetrievalReadPort` stays a pure local
read port. Phase 15 adds a separate Music Data Platform retrieval-query
workspace/port that owns request-scoped material candidate writes and mixed SQL
query execution.

The retrieval-query workspace/port:

1. accepts validated provider candidates for a specific query;
2. creates request-scoped material candidate cache rows and provider candidate
   set rows;
3. writes queryRunId-scoped temp ranking/text rows;
4. executes SQL ranking/filtering/pagination over durable and request-scoped
   candidates;
5. clears queryRunId-scoped rows after the query lifecycle;
6. exposes no durable material/source/canonical write capability.

## Execution Sketch

```text
1. Retrieval normalizes input and validates typed pools.
2. Retrieval identifies provider_search pools.
3. If cursor is absent, Retrieval calls the provider-search port for each
   provider_search pool in parallel.
4. If cursor is present, Retrieval reloads the provider candidate set and does
   not call providers.
5. Source Provider Slot validates provider output and returns
   ProviderMaterialCandidate[].
6. Retrieval passes validated candidates or a candidate set reference plus the
   normalized durable pools into the Music Data Platform retrieval-query
   workspace.
7. Music Data Platform creates/loads material candidate cache rows and
   queryRunId-scoped temp candidate text rows.
8. Music Data Platform resolves known provider source refs to durable material
   rows when source/material binding already exists.
9. Music Data Platform keeps unknown provider candidates as material candidate
   rows.
10. Music Data Platform applies anyOf/allOf/noneOf, owner catalog visibility,
   text matching, dedupe, sorting, and keyset pagination in SQL.
11. Retrieval shapes returned rows into internal query hits.
```

## PR Split

Phase 15 should be implemented as three PRs:

```text
PR 15A: typed pool input migration
PR 15B: material candidate cache and mixed retrieval-query workspace
PR 15C: Source Provider Slot wiring into Retrieval
```

### PR 15A: Typed Pool Input Migration

Goal:

```text
Replace Phase 12 bare Ref[] pool filters with typed pool objects while
preserving local-only retrieval behavior.
```

Scope:

- update Retrieval input contracts and normalization to use typed pools;
- keep the existing Music Data Platform local retrieval read port focused on
  durable pool refs;
- normalize typed durable pools into the durable-pool input the local read port
  needs;
- support local catalog, source-library, and owner-relation typed pools;
- keep provider-search pools rejected until PR 15C wiring exists;
- update local retrieval tests and guards;
- reject the old bare-ref `allOf` / `anyOf` / `noneOf` shape.

PR 15A must not make the Phase 12 local read port accept the full
provider-aware typed pool union. The provider-aware mixed query plan belongs to
the new retrieval-query workspace introduced in PR 15B.

### PR 15B: Material Candidate Cache And Mixed Retrieval Workspace

Goal:

```text
Add the Music Data Platform-owned runtime candidate state and mixed SQL
workspace needed to rank durable materials with fixture material candidates.
```

Scope:

- add material candidate cache records and provider candidate set records;
- add queryRunId-scoped temp ranking rows/text rows;
- add the retrieval-query workspace/port that owns request-scoped writes and
  mixed SQL query execution;
- support known candidate resolution through exact source-material binding;
- support unresolved `material_candidate` rows through fixture provider
  candidates;
- support cursor pagination through provider candidate set reload;
- add guards that prevent Music Intelligence from writing candidate SQL
  directly.

### PR 15C: Source Provider Slot Wiring Into Retrieval

Goal:

```text
Connect provider_search typed pools to Extension Source Provider Slot search
and feed validated provider candidates into the mixed retrieval workspace.
```

Scope:

- add a narrow provider-search capability consumed by Retrieval;
- make `RetrievalQueryService.query(...)` async so local-only and
  provider-search queries share one API;
- enforce `sessionId`, top-level text, provider id, target kind, limit, order,
  and any-only validation;
- fail the whole query on provider-search failure;
- add NCM-backed smoke coverage for local + provider mixed retrieval.

Retrieval consumes a narrow provider-search port rather than importing the
Extension runtime:

```ts
type RetrievalProviderSearchPort = {
  search(input: {
    providerId: string;
    query: SourceQuery;
    sessionId: string;
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
  provider_search typed pools are rejected until PR 15C wiring exists.

PR 15B
  Music Intelligence Retrieval cannot call db.run or low-level repository
  writes for material candidate cache or provider candidate set state.
  The Phase 12 Music Data Platform local read port remains pure local read.
  Candidate cache writes exist only in the Music Data Platform retrieval-query
  workspace/command boundary.

PR 15C
  Retrieval does not import Extension plugin runtime, capability registry
  internals, or concrete provider plugins.
  Providers still cannot import MaterialEntity, MaterialRecord, or Material
  Data Platform write modules.
  Query service must not implement a TypeScript candidate pool sort/merge path
  for mixed provider retrieval.
```
