# Phase 12 Retrieval Query Foundation Implementation Plan

> Status: Implemented through PR12C
> Spec: `phase-12-retrieval-query-foundation.md`
> Owning bounded contexts: Music Data Platform / Retrieval Read Model,
> Music Intelligence / Retrieval

## Goal

Implement Phase 12 as three separate PRs:

```text
PR 12A: Music Data Platform Retrieval Read Port, no text
PR 12B: Music Data Platform Text Query Integration
PR 12C: Music Intelligence Retrieval Service
```

Phase 12 creates the first internal local-pool retrieval foundation:

```text
Retrieval query input
-> Music Intelligence normalizes input and validates opaque cursor
-> Music Data Platform executes owner-catalog/pool/text SQL
-> Music Intelligence shapes query hits and opaque next cursor
```

The result is internal query evidence for the next agent decision. It is not a
Stage Interface tool, not a `MaterialCard`, and not a recommendation or taste
score.

## Non-Goals

- Do not implement public Stage Interface query tools.
- Do not implement provider search, NCM/Spotify search, provider candidate
  materialization, playable links, `MaterialCard`, or query-to-present.
- Do not implement typo fuzzy search, semantic expansion, LLM reranking,
  recommendation scoring, taste scoring, Memory scoring, Music Experience
  scoring, or signals.
- Do not implement Collection pools.
- Do not implement query caches, search caches, new projection tables, or
  background projection rebuild.
- Do not run projection maintenance from a query path.
- Do not add writes to retrieval query execution.
- Do not edit `CONTEXT.md`.

## Global Boundary

Music Data Platform owns:

- executable semantics of owner-visible base set selection;
- SQL pool algebra;
- SQL text FTS matching;
- material-kind filtering;
- ordering and keyset pagination;
- row-level matched pool/text evidence;
- coarse projection freshness reads;
- reconstruction and validation of full `Ref` values returned to Retrieval;
- hiding raw projection records, SQL rows, and repository shapes.

Music Intelligence / Retrieval owns:

- retrieval query input contracts;
- effective query normalization;
- pool-filter normalization before calling the read port;
- opaque cursor encode/decode and query fingerprint validation;
- query result and hit shaping;
- explaining retrieval evidence without computing SQL rank or database
  membership.

Stage Interface owns no Phase 12 behavior.

## Allowed Reads

PR 12A/12B may read, through Music Data Platform-owned SQL/repository
internals:

- `owner_material_catalog_view`;
- owner catalog entry records needed for pool membership;
- owner material relation pool refs;
- source library refs and source library existence;
- material text documents and FTS tables in PR12B only;
- projection maintenance targets for coarse freshness;
- shared contract helpers such as `Ref`, `refKey(...)`, `MaterialEntityKind`,
  owner scope validation, source-library ref helpers, material ref validators,
  and owner-relation pool-ref helpers.

PR 12C may read only through:

- `MusicDataPlatformRetrievalReadPort`;
- shared contract types;
- Retrieval-owned cursor/query helpers.

## Allowed Writes

Retrieval query execution has no durable writes.

Implementation may update schema contribution code only for narrow read
indexes required by PR12A/PR12B SQL. Tests may write fixtures through existing
owning commands or fixture helpers. Production query paths must not call source
fact commands, projection commands, dirty marking commands, repository write
methods, import commands, provider adapters, or Stage Interface output code.

## Forbidden Imports

- Music Data Platform retrieval read model must not import Stage Interface,
  Music Intelligence, Extension provider/plugin implementations, or concrete
  SQLite adapter modules.
- Music Intelligence must not import Music Data Platform commands,
  repositories, projection record modules, projection maintenance commands,
  Stage Interface, Extension provider/plugin implementations, or concrete
  SQLite adapter modules.
- Retrieval must not import Music Data Platform material text normalization
  helpers. Retrieval owns only minimal cursor fingerprint normalization.
- No Phase 12 code may import provider search or platform-library provider
  implementations.

## Shared Read Port Contract

PR12A defines the contract and no-text implementation. PR12B fills the text
branch.

PR12A exports the final input shape, but rejects text features until PR12B:

```text
text present
  reject

order = text_relevance
  reject

cursorPosition.order = text_relevance
  reject
```

PR12B replaces those unsupported errors with text behavior.

The public Music Data Platform read port shape is:

```ts
type MusicDataPlatformRetrievalReadPort = {
  searchOwnerCatalogMaterials(
    input: MusicDataPlatformRetrievalSearchInput,
  ): MusicDataPlatformRetrievalSearchPage;
  getRetrievalFreshness(input: {
    ownerScope: string;
  }): RetrievalFreshness;
};
```

The input contract is:

```ts
type MusicDataPlatformRetrievalSearchInput = {
  ownerScope: string;
  text?: string;
  materialKind?: MaterialEntityKind;
  poolFilter?: {
    allOf?: readonly Ref[];
    anyOf?: readonly Ref[];
    noneOf?: readonly Ref[];
  };
  order: "text_relevance" | "recently_added" | "stable";
  limit: number;
  cursorPosition?: RetrievalReadCursorPosition;
};
```

`text` is the effective normalized text from Retrieval. Music Data Platform
still normalizes/tokenizes defensively for SQL-facing FTS construction.

`recentlyAddedAt` is owner catalog recency, not provider-added time. It is a
non-null catalog timestamp from `owner_material_catalog_view`.

## PR 12A: MDP Retrieval Read Port, No Text

### Goal

Add a narrow Music Data Platform read port for no-text owner catalog queries.
This PR proves local pool search, owner-visible scoping, ordering, pagination,
and freshness without adding FTS complexity.

### Expected Files

- `src/music_data_platform/retrieval_read_model.ts`
- `src/music_data_platform/index.ts`
- existing Music Data Platform schema files only if narrow read indexes are
  required
- `test/formal/music-data-platform-retrieval-read-model.test.ts`
- `test/formal/active-tree.test.ts`
- `test/run-stage-core-tests.ts` only if test registration changes
- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `INDEX.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`

### Tasks

1. Define retrieval read contracts:
   - `MusicDataPlatformRetrievalReadPort`;
   - `MusicDataPlatformRetrievalSearchInput`;
   - `MusicDataPlatformRetrievalSearchPage`;
   - `MusicDataPlatformRetrievalMaterialRow`;
   - `RetrievalReadCursorPosition`;
   - `RetrievalFreshness`;
   - supported orders and text field names, even if text fields are populated
     only after PR12B.

2. Implement owner-scope and no-text input validation:
   - support only `DEFAULT_OWNER_SCOPE`;
   - reject non-default owner scopes;
   - validate `limit` as integer `1..100`;
   - validate `materialKind`;
   - reject text present before PR12B;
   - reject `text_relevance` before PR12B;
   - validate no-text cursor positions for `stable` and `recently_added`;
   - reject `cursorPosition.order = text_relevance` before PR12B;
   - reject unsupported pool ref kinds.

3. Implement pool validation:
   - accept only `source_library` and `owner_material_relation_pool` refs;
   - require `source_library` pools to exist and belong to the owner scope;
   - validate owner relation pool refs against expected
     `ownerScope + relationKind`;
   - reject owner relation pool refs for unsupported relation kinds such as
     `blocked`;
   - reject valid-shaped pool refs that belong to another owner scope;
   - allow supported saved/favorite relation pools to be empty;
   - dedupe refs inside `allOf`, `anyOf`, and `noneOf`;
   - reject positive-vs-`noneOf` conflicts.

4. Implement no-text SQL pool algebra:
   - base set is `owner_material_catalog_view` for the owner scope;
   - `allOf` requires every listed pool;
   - `anyOf` requires at least one listed pool when present;
   - `noneOf` excludes listed pools;
   - no pool filter returns owner-visible catalog rows;
   - return `matchedPoolRefs` only from positive `allOf` / `anyOf` matches;
   - sort `matchedPoolRefs` by `refKey(...)` ascending.

5. Implement no-text ordering and keyset pagination:
   - `recently_added`: `recentlyAddedAt DESC, materialRefKey ASC`;
   - `stable`: `materialRefKey ASC`;
   - build keyset cursor conditions that respect mixed sort directions;
   - apply filters, cursor condition, order, and `LIMIT limit + 1` in SQL;
   - return `nextCursorPosition` from the extra row;
   - do not fetch all candidates and sort/slice in TypeScript.

6. Implement no-text display and text-evidence defaults:
   - left-join material text documents for display text only;
   - tolerate missing `material_text_documents` rows as projection staleness;
   - return empty display fields when text documents are missing;
   - return `matchedTextFields = []`;
   - return `matchedTextTokensByField = undefined`;
   - return `matchedTokenCount = undefined`;
   - return `rankScore = undefined`.

7. Implement coarse freshness:
   - count dirty/failed `owner_catalog_source_library`,
     `owner_catalog_source_library_material`, and
     `owner_catalog_relation_material` targets for the requested owner scope;
   - count dirty/failed `material_text` targets globally;
   - parse normalized target payloads by kind; do not use raw JSON `LIKE`;
   - keep freshness independent of pool filter, text, and material kind;
   - return `current` or `possibly_stale` without running maintenance.

8. Update public exports and Music Data Platform docs:
   - export only the narrow read port factory and contract types;
   - do not export SQL builders, mappers, or cursor SQL snippets;
   - document read-port ownership, consumed tables/views, forbidden
     dependencies, and implementation state.

### PR 12A Guards

- Active-tree guard prevents Music Data Platform retrieval read model from
  importing Stage Interface, Music Intelligence, Extension provider/plugin
  implementations, or concrete SQLite adapter modules.
- Guard or focused test verifies no retrieval read path calls write commands,
  projection commands, dirty marking, or repository write methods.
- Test coverage pins SQL-level no-text pagination and avoids TypeScript
  whole-result sorting/slicing.

### PR 12A Tests

- no-text default owner catalog query, default `recently_added`, and blocked
  material exclusion;
- non-default owner scope rejection;
- source-library `allOf`, `anyOf`, and `noneOf`, including missing
  source-library pool errors;
- owner-relation saved/favorite pools, including empty pools returning empty
  pages without error;
- wrong-owner pool refs rejected for source-library and owner-relation pools;
- `owner_material_relation_pool` kind `blocked` rejected;
- `matchedPoolRefs` allOf/anyOf/noneOf behavior and ref-key ordering;
- no pool filter returns owner-visible base set with empty matched pool refs;
- text present, explicit `text_relevance`, and text-relevance cursor positions
  rejected before PR12B;
- missing material text documents tolerated in no-text rows;
- no-text row text evidence is empty/undefined as specified;
- `materialKind` filtering for recordings, albums, and artists;
- keyset pagination for `stable` and `recently_added`;
- coarse freshness for current-owner catalog targets, global material-text
  targets, and ignored other-owner catalog targets;
- unsupported pool refs, invalid material kinds, invalid limits, and invalid
  no-text cursor positions.

### PR 12A Acceptance

PR12A is complete when no-text local pool queries work through the narrow MDP
read port, all no-text filters/order/pagination are SQL-owned, raw projection
records are hidden, guards pass, deterministic tests pass, and root/area docs
are synchronized.

## PR 12B: MDP Text Query Integration

### Goal

Extend the PR12A read port with material text FTS matching, explicit
field-aware ranking, text-relevance keyset pagination, and matched text
evidence.

### Expected Files

- `src/music_data_platform/retrieval_read_model.ts`
- `src/music_data_platform/index.ts` only if new exported contract types are
  needed
- internal Music Data Platform text helper files only if the existing file
  would become too broad
- `test/formal/music-data-platform-retrieval-read-model.test.ts`
- `test/formal/active-tree.test.ts`
- `test/run-stage-core-tests.ts` only if test registration changes
- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `INDEX.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`

### Tasks

1. Implement `prefix_or_v1` token construction:
   - normalize with `NFKC`, trim, lowercase, whitespace collapse;
   - tokenize with Music Data Platform material-text tokenizer rules;
   - dedupe tokens in first occurrence order;
   - cap at 12 tokens;
   - escape every token as a literal FTS prefix term;
   - construct `token1* OR token2* OR ...`;
   - treat all-dropped token results as absent text.

2. Implement text SQL:
   - join FTS matches with owner catalog visibility and pool filters;
   - keep pool algebra, kind filtering, ordering, and `LIMIT limit + 1` in SQL;
   - require material text FTS/documents for text recall;
   - tolerate missing material text projections as projection staleness rather
     than read-model consistency errors;
   - avoid TypeScript candidate pipelines.

3. Implement explicit field-aware ranking:
   - define `matchedTokenCount` as distinct normalized query tokens matched in
     at least one indexed field;
   - define `bestFieldPriority` as the best / lowest numeric matched field
     priority;
   - order by `matched_token_count DESC`;
   - then `best_field_priority ASC`
     (`title=1`, `artist/album=2`, `version=3`, `alias=4`);
   - then internal `rank_sort_value ASC` for SQLite FTS5 lower-is-better raw
     rank/BM25 values;
   - then `material_ref_key ASC`;
   - return normalized `rankScore.value` as higher-is-better evidence only.
   - do not use `rankScore.value` as the SQL order key.

4. Implement text cursor positions:
   - include `matchedTokenCount`, `bestFieldPriority`, `rankSortValue`, and
     `materialRefKey`;
   - validate numeric sort keys are finite;
   - apply keyset comparisons in SQL using the same order as the query.

5. Implement matched text evidence:
   - return `matchedTextFields` in stable field order;
   - return matched token evidence by field in stable field/token order;
   - return `matchedTokenCount` for text queries only;
   - do not return SQLite `highlight(...)`, `snippet(...)`, raw document JSON,
     or English summaries from MDP.

6. Update guards, docs, and tests:
   - document text branch ownership and field-aware ranking;
   - guard against moving FTS/ranking semantics into Retrieval or Stage
     Interface.

### PR 12B Guards

- Text FTS query construction, field-aware ranking, matched text evidence, and
  text cursor positions live in Music Data Platform retrieval read model only.
- Music Data Platform text retrieval helpers must not import Music
  Intelligence, Stage Interface, Extension provider/plugin implementations, or
  concrete SQLite adapter modules.
- PR12B must not introduce query caches, new projection tables, Stage
  Interface tools, or Music Intelligence services.

### PR 12B Tests

- prefix OR text recall, with more matched query tokens ranking above fewer
  matched tokens;
- FTS literal escaping and operator-safety;
- token dedupe, token cap, and all-dropped text behavior;
- field-aware ranking where `title_text` evidence outranks `alias_text`
  evidence;
- `matchedTokenCount` counts distinct query tokens, not field occurrences;
- `bestFieldPriority` uses the best matched field priority;
- missing material text projections cannot be recalled by text and do not
  crash the query;
- `text_relevance` keyset pagination and cursor position validation;
- matched text fields and token evidence stability;
- `rankScore.kind = "fts_bm25"` and higher-is-better normalized value;
- result order does not rely on normalized `rankScore.value`;
- explicit `text_relevance` without effective text rejected by the read port.

### PR 12B Acceptance

PR12B is complete when text queries work through the same narrow MDP read port,
text matching/ranking/pagination are SQL-owned, text evidence is structured,
guards pass, deterministic tests pass, and root/area docs are synchronized.

## PR 12C: Music Intelligence Retrieval Service

### Goal

Add the first Music Intelligence boundary: an internal Retrieval query service
that validates query input, owns opaque cursors, calls the narrow Music Data
Platform read port, and returns query evidence hits.

The service shape is:

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

### Expected Files

- `src/music_intelligence/index.ts`
- `src/music_intelligence/retrieval/index.ts`
- `src/music_intelligence/retrieval/query_service.ts`
- `src/music_intelligence/retrieval/contracts.ts`
- `src/music_intelligence/retrieval/cursor.ts`
- `src/music_intelligence/retrieval/query_normalization.ts`
- `src/music_intelligence/errors.ts`
- `src/index.ts`
- `test/formal/music-intelligence-retrieval.test.ts`
- `test/formal/active-tree.test.ts`
- `test/run-stage-core-tests.ts` only if test registration changes
- `docs/music-intelligence/README.md`
- `docs/music-intelligence/design.md`
- `docs/music-intelligence/ports.md`
- `docs/music-intelligence/progress.md`
- `INDEX.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`

### Tasks

1. Create Music Intelligence area skeleton:
   - add area exports;
   - add `MusicIntelligenceError`;
   - update root exports only for the new public internal area boundary.

2. Define Retrieval contracts:
   - `RetrievalQueryInput`;
   - `RetrievalPoolFilter`;
   - `RetrievalQueryResult`;
   - `RetrievalQueryHit`;
   - `RetrievalOrder`;
   - matched text evidence and rank score result types.

3. Implement query normalization:
   - default `ownerScope` to `DEFAULT_OWNER_SCOPE`;
   - reject non-default owner scope;
   - normalize text with `NFKC`, trim, lowercase, and whitespace collapse;
   - omit normalized-empty text;
   - default order to `text_relevance` when text exists and `recently_added`
     when text is absent;
   - reject explicit `text_relevance` without effective text;
   - normalize empty pool arrays to absent groups;
   - dedupe pool refs and reject positive-vs-`noneOf` conflicts;
   - validate `limit` as integer `1..100`.

4. Implement opaque cursor handling:
   - encode versioned base64url JSON payload;
   - include query fingerprint and typed read cursor position;
   - fingerprint owner scope, normalized text, material kind, normalized pool
     filter refs sorted by `refKey(...)`, effective order, and
     `prefix_or_v1`;
   - exclude `limit` and cursor from the fingerprint;
   - validate opaque cursor decode, JSON shape, version, and fingerprint;
   - leave typed cursor position validation to Music Data Platform.

5. Implement query service:
   - call `readPort.searchOwnerCatalogMaterials(...)`;
   - pass decoded cursor position to the read port;
   - call `readPort.getRetrievalFreshness(...)`;
   - wrap `nextCursorPosition` into an opaque cursor;
   - never call write commands or projection maintenance.

6. Shape query hits:
   - use projected text columns for display fields only;
   - return `rankScore` only for effective `text_relevance`;
   - never sort or reorder hits by `rankScore.value`;
   - build `matchedText.summary` from matched token evidence;
   - keep summary generation intentionally small and deterministic;
   - keep matched text fields and tokens stable;
   - set `pools.matched` from positive matched pool refs only;
   - set `basis.textMatched`, `basis.poolFilterApplied`, and
     `basis.positivePoolMatched`;
   - make `noneOf`-only filters produce `poolFilterApplied=true`,
     `positivePoolMatched=false`, and empty `pools.matched`;
   - do not expose raw projection records, source facts, provider payloads,
     playable links, or presentation card data.

7. Add Music Intelligence docs:
   - `README.md` area entrypoint;
   - `design.md` retrieval boundary and non-goals;
   - `ports.md` consumed MDP read port and forbidden imports;
   - `progress.md` implementation state and verification.

### PR 12C Guards

- Active-tree guard allows `src/music_intelligence/**` as a formal area and
  forbids imports from Music Data Platform commands, repositories, projection
  records, projection maintenance commands, Stage Interface, Extension
  provider/plugin implementations, and concrete SQLite adapter modules.
- Guard or focused test ensures Retrieval depends on
  `MusicDataPlatformRetrievalReadPort`, not aggregate stores or repositories.
- Guard or test ensures Retrieval does not implement pool algebra, SQL joins,
  broad row sorting, or pagination over raw rows in TypeScript.

### PR 12C Tests

- default order selection with and without text;
- text normalization and normalized-empty behavior;
- explicit `text_relevance` without text rejection;
- limit validation;
- pool filter normalization, dedupe, empty arrays, and conflicts;
- opaque cursor encode/decode and fingerprint mismatch rejection;
- cursor fingerprint excludes `limit` but includes text, material kind, pools,
  owner scope, order, and text strategy;
- query service passes decoded cursor positions to the read port;
- hit shaping from query-ready rows;
- `rankScore` only for text relevance;
- Retrieval does not reorder by `rankScore.value`;
- matched text summary stability;
- no pool filter produces empty `pools.matched`,
  `poolFilterApplied=false`, and `positivePoolMatched=false`;
- noneOf-only filter produces `poolFilterApplied=true`,
  `positivePoolMatched=false`, and empty `pools.matched`;
- freshness passthrough as read-only evidence using effective owner scope and
  independent of pool/text/material kind.

### PR 12C Acceptance

PR12C is complete when `createRetrievalQueryService({ readPort })` is the only
Retrieval service factory, Retrieval returns compact query results and opaque
cursor pagination, Retrieval does not own SQL/pool algebra/projection-row
scanning, Music Intelligence docs exist, guards pass, deterministic tests pass,
and root docs are synchronized.

## Verification

Run the narrow PR-specific tests first, then the formal stage-core test runner.

Expected commands:

```bash
npm test -- test/formal/music-data-platform-retrieval-read-model.test.ts
npm test -- test/formal/music-intelligence-retrieval.test.ts
npm test -- test/formal/active-tree.test.ts
npm test -- test/run-stage-core-tests.ts
git diff --check
git diff --name-only
```

If the repository's test runner does not support file arguments, use the
nearest existing project-native command that runs the same test files.

## State Sync Gate

Each PR must report:

- `INDEX.md`: updated with new docs and source entrypoints, or not needed with
  a concrete reason.
- `CURRENT_STATE.md`: updated after implementation state changes, or not
  needed with a concrete reason.
- `ARCHITECTURE.md`: updated only if the phase establishes root architecture
  authority not already covered by area docs.
- `PROGRESS.md`: updated after implementation progress changes, or not needed
  with a concrete reason.

## Stopping Condition

Stop after each PR is implemented, reviewed, and merged before starting the
next one unless the user explicitly asks to batch work. After PR12C, stop
before any Stage Interface query tool, provider search, presentation,
recommendation, or Collection work.
