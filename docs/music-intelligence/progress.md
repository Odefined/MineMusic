# Music Intelligence Progress

> Status: Implemented through Phase 15A Retrieval typed pool input migration
> Scope: Implementation state and verification for Music Intelligence

## Implemented

- `src/music_intelligence/errors.ts` defines `MusicIntelligenceError` with
  retrieval query, provider-search pool validation, retrieval cursor, legacy
  cursor, and retrieval result invariant codes.
- `src/music_intelligence/retrieval/contracts.ts` defines internal Retrieval
  query input/result/hit contracts, typed pools, defaults, and service shape.
- `src/music_intelligence/retrieval/query_normalization.ts` defaults the local
  owner scope, normalizes query text for echo/fingerprints, validates order and
  limit, normalizes typed pools, dedupes durable pools, rejects unsupported
  pool refs, rejects old `poolFilter` input, rejects bare `Ref[]` pool groups,
  rejects positive-vs-`noneOf` pool conflicts, recognizes provider-search pool
  vocabulary while rejecting execution until Phase 15D, and uses the shared
  Contracts `prefix_or_v1` token helper so tokenless punctuation-only text is
  treated as absent text before defaulting order.
- `src/music_intelligence/retrieval/cursor.ts` owns version 2 opaque cursor
  encode/decode and query-fingerprint mismatch detection.
- `src/music_intelligence/retrieval/query_service.ts` creates
  `createRetrievalQueryService({ readPort })`, calls only
  `MusicDataPlatformRetrievalReadPort`, maps typed durable pools to the local
  read port's durable `poolFilter` refs, wraps typed next cursor positions into
  opaque cursors, reads coarse freshness, and shapes query hits.
- Retrieval hit shaping preserves Music Data Platform row order, uses projected
  text fields for display, exposes rank evidence only for effective
  `text_relevance`, and derives deterministic matched-text summaries from
  matched token evidence.
- `src/music_intelligence/index.ts` and `src/music_intelligence/retrieval/index.ts`
  export the new internal area boundary.

## Verification

Verification commands for this implementation:

```text
npm run typecheck
npm run build:test
node ./.tmp-test/test/formal/music-intelligence-retrieval.test.js
node ./.tmp-test/test/formal/active-tree.test.js
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
- opaque cursor encode/decode, query fingerprint mismatch, and `limit`
  exclusion from fingerprints;
- query service decoded-cursor pass-through to Music Data Platform;
- real Retrieval + Music Data Platform integration for accent-insensitive text
  recall, text cursor pagination, and dropped-text fallback;
- hit display, matched text, matched pool, basis, rankScore, and freshness
  shaping;
- preserving Music Data Platform row order instead of sorting by rank score.

## Remaining Gaps

Out of the current Music Intelligence implementation:

- public Stage Interface query tools;
- query-to-present and `MaterialCard` output;
- provider search execution and provider candidate commit commands;
- Knowledge capabilities;
- semantic expansion, LLM reranking, typo fuzzy search, taste scoring, Memory
  scoring, and Music Experience scoring;
- Collection pools and additional owner catalog producers;
- query caches or background query orchestration.
