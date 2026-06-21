# Music Intelligence Progress

> Status: Implemented through Phase 22 metadata lookup search
> Scope: Implementation state and verification for Music Intelligence

## Implemented

- `src/music_intelligence/errors.ts` defines `MusicIntelligenceError` with
  retrieval query, provider-search pool validation, provider-search
  unavailable/failed/invalid-result, retrieval cursor, legacy cursor, and
  retrieval result invariant codes.
- `src/music_intelligence/core/retrieval/contracts.ts` defines internal Retrieval
  query input/result/hit contracts, typed pools, defaults, async service shape,
  and the narrow `RetrievalProviderSearchPort`.
- `src/music_intelligence/core/retrieval/query_normalization.ts` defaults the
  local owner scope, normalizes query text for echo, validates order and
  limit, normalizes typed pools, dedupes durable pools, rejects unsupported
  pool refs, rejects old `poolFilter` input, rejects bare `Ref[]` pool groups,
  rejects positive-vs-`noneOf` pool conflicts, validates provider-search pool
  placement/limits/provider uniqueness/material-kind mapping, and uses the
  shared Contracts `prefix_or_v1` token helper so tokenless punctuation-only
  text is treated as absent text before defaulting order.
- `src/music_intelligence/core/retrieval/cursor.ts` owns version 2 opaque cursor
  encode/decode and query-fingerprint mismatch detection.
- `src/music_intelligence/core/search/metadata_lookup_retrieval_adapter.ts`
  creates
  `createMetadataLookupRetrievalQueryService({ searchWorkspace, providerSearch? })`,
  calls provider search outside Music Data Platform transactions for mixed
  queries, invokes the Music Data Platform metadata lookup search workspace for
  result-set construction/cursor pages, wraps typed next cursor positions into
  opaque cursors, validates provider results, maps provider-search errors,
  builds metadata-lookup `mlqf_` fingerprints, and shapes query hits.
- `RetrievalQueryInput.sessionId` is passed through to provider search calls
  and intentionally excluded from metadata lookup fingerprints/result-set
  identity.
- Retrieval hit shaping preserves Music Data Platform row order, uses projected
  metadata lookup text fields for display, and exposes Postgres text rank
  evidence without reranking inside Music Intelligence.
- `src/music_intelligence/index.ts` and
  `src/music_intelligence/core/retrieval/index.ts`
  export the new internal area boundary.

## Verification

Verification commands for this implementation:

```text
npm run typecheck
npm run build:test
node ./.tmp-test/test/formal/music-intelligence-metadata-lookup-search.test.js
node ./.tmp-test/test/formal/server-host.test.js
node ./.tmp-test/test/formal/active-tree.test.js
npm run smoke:ncm:retrieval
npm test
git diff --check
git diff --name-only
```

Formal tests cover:

- default order selection with and without text;
- text normalization and normalized-empty behavior;
- tokenless punctuation text falling back to no-text behavior and rejecting
  explicit `text_relevance` before Music Data Platform is called;
- explicit `text_relevance` without effective text rejection;
- limit, owner scope, material kind, and pool ref validation;
- typed durable pool dedupe, empty arrays, sorted ref-key normalization,
  `local_catalog` local-read semantics, old `poolFilter` rejection, bare ref
  rejection, provider-search pool validation, and positive-vs-`noneOf`
  conflict rejection;
- provider-search query construction, default/capped provider limits,
  material-kind to source-target-kind mapping, `sessionId` pass-through without
  fingerprint impact, parallel multi-provider execution, provider failure
  mapping, invalid provider result rejection, and no provider calls on metadata
  lookup cursor pages;
- opaque cursor encode/decode, query fingerprint mismatch, and `limit`
  exclusion from fingerprints;
- query service decoded-cursor pass-through to Music Data Platform;
- real Metadata Lookup Retrieval adapter + Music Data Platform integration for
  durable local rows, unresolved provider candidates, `mlqf_` result-set
  fingerprints, provider call avoidance on cursor pages, and mixed result kinds;
- hit display, matched pool, basis, and rankScore shaping;
- preserving Music Data Platform row order instead of sorting by rank score.

## Remaining Gaps

Out of the current Music Intelligence implementation:

- public Stage Interface query tools;
- query-to-present and `MaterialCard` output;
- provider candidate commit commands;
- Knowledge capabilities;
- semantic expansion, LLM reranking, typo fuzzy search, taste scoring, Memory
  scoring, and Music Experience scoring;
- Collection pools and additional owner catalog producers;
- query caches or background query orchestration.
