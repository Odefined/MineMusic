# Phase 15 Provider Search Pool Retrieval Implementation Plan

> Status: PR15A and PR15B implemented; PR15C and PR15D planned
> Spec: `phase-15-provider-search-pool-retrieval.md`
> Owning bounded contexts: Music Intelligence / Retrieval, Music Data Platform
> Mixed Retrieval Workspace, Extension / Source Provider Slot, and Server Host
> Runtime Composition

## Goal

Implement Phase 15 as four PRs:

```text
PR 15A: typed pool input migration
PR 15B: runtime mixed result-set foundation
PR 15C: mixed retrieval result-set query with fixture candidates
PR 15D: Source Provider Slot wiring into Retrieval
```

Phase 15 connects provider search to internal Retrieval without exposing a
Stage Interface tool:

```text
Retrieval query input
-> Music Intelligence normalizes typed pools and provider-search requests
-> Extension Source Provider Slot supplies validated provider candidates
-> Music Data Platform builds one TTL-backed mixed result set
-> SQL owns text matching, dedupe, ranking, and keyset pagination
-> Music Intelligence shapes internal retrieval hits
```

The result is an internal mixed retrieval foundation. It is not final
presentation and it does not write durable source/material facts for ordinary
provider search hits.

## Non-Goals

- Do not implement a public Stage Interface query tool.
- Do not implement `MaterialCard`, `present`, playable-link refresh, save,
  favorite, block, collection add, feedback, or provider-candidate commit
  commands.
- Do not implement provider auto fan-out or provider deep pagination.
- Do not implement provider lookup by source ref as part of normal query.
- Do not add raw provider payload persistence.
- Do not implement Collection pools.
- Do not add signals, freshness penalties, Memory, Music Experience ranking,
  radio mode, or recommendation judgement.
- Do not rebuild durable `material_text_fts` for mixed provider ranking.
- Do not implement a TypeScript candidate-pool merge/sort/pagination path.
- Do not edit `CONTEXT.md`.

## Ownership And Boundaries

Music Intelligence / Retrieval owns:

- `RetrievalQueryInput` typed pool vocabulary;
- input normalization, validation, and query fingerprinting;
- cursor payload encode/decode and cursor fingerprint validation;
- orchestration of provider-search calls through a narrow provider-search
  port in PR15D;
- internal hit shaping for durable `material` and unresolved
  `material_candidate` hits.

Music Data Platform / Mixed Retrieval Workspace owns:

- runtime result-set and material-candidate-cache schema;
- creation and cleanup of TTL-backed mixed result sets;
- exact known-source resolution through current source-material bindings;
- owner visibility and blocked checks;
- result-set-level FTS corpus;
- SQL text matching, dedupe, ranking, and keyset pagination;
- result-set and candidate-cache writes.

Extension / Source Provider Slot owns:

- provider registration and provider search invocation;
- provider search input/output validation;
- source-provider error normalization before the Retrieval boundary maps errors
  into Retrieval-owned codes.

Server Host / Runtime Composition owns:

- adapting the Extension runtime source-provider search capability into
  Retrieval's narrow provider-search port.

Stage Interface owns no Phase 15 behavior.

## Allowed Reads

Music Intelligence / Retrieval may read only through:

- existing Music Data Platform local retrieval read port for local-only queries;
- the new Music Data Platform mixed retrieval workspace for provider-search
  mixed queries;
- the narrow `RetrievalProviderSearchPort` in PR15D;
- shared contract types and Retrieval-owned helpers.

Music Data Platform mixed retrieval workspace may read:

- `owner_material_catalog_view` for durable local recall and visibility;
- source-library and owner-relation pool membership data through existing
  Music Data Platform retrieval SQL helpers;
- `material_text_documents` and material text FTS helpers for durable material
  text evidence;
- `source_material_bindings` for exact provider-candidate resolution;
- `owner_material_relations` source-of-truth for active material-scope
  `blocked` exclusion;
- runtime `retrieval_result_sets`, `retrieval_result_rows`,
  `retrieval_result_text_fts`, and `material_candidate_cache` rows.

Extension Source Provider Slot may read its registered provider capability
state through existing Extension runtime boundaries.

## Allowed Writes

Only the Music Data Platform mixed retrieval workspace may write Phase 15
runtime query state:

```text
retrieval_result_sets
retrieval_result_rows
retrieval_result_text_fts
material_candidate_cache
```

Allowed runtime writes include:

- creating one result set for a provider-search first page;
- inserting durable material and unresolved material-candidate result rows;
- inserting result-set-level FTS rows;
- upserting material candidate cache rows by `material_candidate_ref_key`;
- deleting expired result-set rows and expired unreferenced candidate cache
  rows through cleanup commands.

Result-set writes for one provider-search first page must be atomic inside one
synchronous `MusicDatabase.transaction(...)` callback. Provider calls must
happen before that transaction.

## Forbidden Writes And Imports

Forbidden durable writes:

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

Forbidden imports:

- Music Intelligence must not import Music Data Platform repositories,
  projection commands, source-library commands, identity commands, Storage
  concrete adapters, Stage Interface, Extension plugin runtime internals, or
  concrete provider plugins.
- Music Data Platform retrieval workspace must not import Stage Interface,
  Music Intelligence, Extension plugin runtime internals, concrete provider
  plugins, Server Host, or concrete SQLite adapter modules.
- Extension providers must not import Music Data Platform write modules,
  `MaterialRecord`, or durable material/source persistence internals.
- Server Host composition may wire broad concrete implementations into narrow
  ports, but ordinary Retrieval services must consume only the narrow
  provider-search port.

Production query services must not call `db.run(...)`, construct repositories,
or write runtime result-set/cache rows directly. Runtime result-set/cache writes
belong to the Music Data Platform mixed retrieval workspace boundary.

## Expected Files

Expected new files:

- `src/music_data_platform/retrieval_result_set_schema.ts`
- `src/music_data_platform/retrieval_result_set_records.ts`
- `src/music_data_platform/retrieval_mixed_workspace.ts`
- `test/formal/music-data-platform-retrieval-result-set.test.ts`
- `test/formal/music-data-platform-mixed-retrieval.test.ts`

Expected existing files to edit:

- `src/music_intelligence/retrieval/contracts.ts`
- `src/music_intelligence/retrieval/query_normalization.ts`
- `src/music_intelligence/retrieval/cursor.ts`
- `src/music_intelligence/retrieval/query_service.ts`
- `src/music_intelligence/retrieval/index.ts`
- `src/music_intelligence/errors.ts`
- `src/music_data_platform/retrieval_read_model.ts`
- `src/music_data_platform/index.ts`
- `src/server/music_data_platform_runtime_module.ts`
- `src/server/host.ts` or the current composition root only if provider-search
  port wiring needs runtime access
- `test/formal/music-intelligence-retrieval.test.ts`
- `test/formal/music-data-platform-retrieval-read-model.test.ts`
- `test/formal/active-tree.test.ts`
- `test/run-stage-core-tests.ts`
- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `docs/music-intelligence/design.md`
- `docs/music-intelligence/ports.md`
- `docs/music-intelligence/progress.md`
- `docs/extension/ports.md`
- `docs/extension/progress.md`
- `docs/formal-rebuild/README.md`
- `INDEX.md`
- `CURRENT_STATE.md` after implementation PRs
- `PROGRESS.md` after implementation PRs

Expected files not to edit:

- `src/stage_interface/**`
- `docs/stage-interface/**`
- `CONTEXT.md`
- provider plugin implementation files before PR15D

If implementation discovers that an existing filename already clearly owns one
of the expected responsibilities, extend that file instead of creating a
parallel module.

## PR 15A: Typed Pool Input Migration

### Goal

Replace Phase 12 `poolFilter?: Ref[]` style input with typed
`pools?: RetrievalPoolFilter` while preserving local-only retrieval behavior.

### Tasks

1. Update Retrieval contracts:
   - add `RetrievalPool`;
   - add `RetrievalPoolFilter`;
   - replace `poolFilter` with `pools`;
   - reject inputs that still contain `poolFilter`;
   - support `local_catalog`, `source_library`, and `owner_relation` typed
     pools.

2. Normalize typed durable pools:
   - no `pools` means Phase 12 default local owner catalog query;
   - `local_catalog` means owner-visible catalog base;
   - `source_library` and `owner_relation` keep refs;
   - bare refs in `allOf`, `anyOf`, or `noneOf` are invalid.

3. Validate provider-search pools without enabling them:
   - recognize `provider_search` typed pool shape;
   - reject provider-search execution until PR15D;
   - reject duplicate provider ids;
   - reject `provider_search` in `allOf` or `noneOf`;
   - reject pool-level text.

4. Update cursor and fingerprint contracts:
   - replace the active cursor payload with version 2;
   - include normalized typed pools in query fingerprinting;
   - keep local-only cursors without `resultSetId`;
   - do not compatibility-support old Phase 12 cursor payloads.

5. Keep local read-port boundary narrow:
   - do not pass the provider-aware typed pool union into
     `MusicDataPlatformRetrievalReadPort`;
   - map only supported durable pool refs into the existing local read-port
     input.

### Tests And Guards

- Type-level contract tests for `RetrievalPool`, `RetrievalPoolFilter`, and
  `RetrievalQueryInput`.
- Input validation tests for old `poolFilter`, bare refs, `local_catalog`,
  `source_library`, `owner_relation`, duplicate provider ids, provider-search
  wrong placement, and pool-level text.
- Cursor fingerprint tests proving typed pools affect fingerprinting.
- Architecture guard proving the Music Data Platform local read port does not
  accept provider-aware pool objects.

### Acceptance

- Existing local-only Retrieval behavior still passes.
- `poolFilter` is no longer accepted.
- Durable typed pools work through the existing local read path.
- Provider-search pools are recognized but not executed before PR15D.
- No Stage Interface code changes.

## PR 15B: Runtime Mixed Result-Set Foundation

### Goal

Add Music Data Platform-owned runtime result-set and material-candidate cache
foundation without enabling mixed Retrieval query execution.

### Tasks

1. Add runtime schema contribution:
   - `retrieval_result_sets`;
   - `retrieval_result_rows`;
   - `retrieval_result_text_fts`;
   - `material_candidate_cache`.

2. Add low-level records/helpers owned by Music Data Platform:
   - insert result-set header;
   - insert result-set rows;
   - insert result-set FTS rows;
   - upsert material candidate cache rows;
   - read cache rows by `material_candidate_ref_key`;
   - cleanup expired result sets;
   - cleanup expired unreferenced material candidate cache rows.

3. Add deterministic material candidate refs:
   - derive `materialCandidateRef` from
     `digest(refKey(sourceEntity.sourceRef))`;
   - store `material_candidate_ref_key` as the primary cache key;
   - do not include query text, rank, row position, cursor position,
     `resultSetId`, or `sessionId` in candidate identity.

4. Add TTL and cleanup behavior:
   - default result-set TTL is 30 minutes;
   - cleanup result-set FTS rows, rows, then headers;
   - cleanup candidate cache rows only when expired and not referenced by any
     non-expired result-set row;
   - express liveness checks in SQL, not orchestration loops.

5. Enforce synchronous transaction discipline:
   - result-set/cache writes happen inside one synchronous transaction when
     used by later PRs;
   - no `await`, Promise, or thenable work inside transaction callbacks.

### Tests And Guards

- Schema initialization test for runtime tables and FTS table.
- Candidate-ref determinism tests.
- Candidate cache upsert tests.
- Result-set TTL cleanup tests.
- Candidate cleanup live-reference guard tests.
- Architecture guard proving Music Intelligence cannot write result-set/cache
  rows directly.
- Active-tree guard for no low-level runtime result-set writes outside the
  Music Data Platform boundary and tests.

### Acceptance

- Runtime tables initialize through existing schema contribution flow.
- Cache identity is stable by `materialCandidateRef`, not by result set.
- Expired cleanup never deletes live candidate cache rows referenced by live
  result sets.
- No mixed query execution or provider call wiring is enabled yet.

## PR 15C: Mixed Retrieval Result-Set Query With Fixture Candidates

### Goal

Implement Music Data Platform-owned mixed result-set SQL query execution using
fixture provider candidates, without calling real providers.

PR15C must stay one PR. Do not split it into smaller PRs unless the Phase 15
spec is changed first.

### Tasks

1. Add the mixed retrieval workspace boundary:
   - name it as a workspace or command-capable boundary, not a pure read port;
   - accept normalized query basis, durable pool basis, and validated provider
     candidates;
   - own all result-set/cache writes and mixed SQL reads.

2. Build first-page result sets:
   - opportunistically cleanup expired runtime rows;
   - preselect local durable rows from durable recall sources using Phase 12
     text-relevance ordering;
   - apply `local_result_window_limit = query.limit * 10`;
   - set `local_result_window_has_more` when SQL observes extra local rows;
   - add provider-resolved durable material rows through exact
     `source_material_bindings`;
   - add unresolved `material_candidate` rows through material candidate cache;
   - dedupe by `materialRef` for resolved rows and `materialCandidateRef` for
     unresolved rows.

3. Build result-set-level text corpus:
   - use existing `material_text_documents` for resolved durable material rows;
   - use provider `SourceEntity` text only for unresolved material candidates;
   - insert result-set FTS rows;
   - do not write durable `material_text_documents` or `material_text_fts`.

4. Execute mixed SQL page reads:
   - use result-set-level FTS `MATCH`;
   - use Phase 12 normalized prefix-or text matching strategy;
   - rank with `bm25(retrieval_result_text_fts, ...)`;
   - order by matched token count, best field priority, rank sort value,
     row kind sort, and stable ref key;
   - use SQL keyset pagination over `retrieval_result_rows`;
   - never implement TypeScript sort/merge/slice pagination.

5. Add cursor behavior:
   - first page creates a fresh opaque `resultSetId`;
   - cursor pages require `resultSetId`;
   - cursor pages compare query fingerprint with the current normalized query;
   - cursor pages do not call providers;
   - cursor pages do not re-read local catalog rows;
   - expired or missing result sets fail with
     `music_intelligence.retrieval_result_set_expired`.

6. Add owner relation handling:
   - local rows use existing owner catalog visibility semantics;
   - provider-resolved durable rows may be outside `owner_material_catalog_view`;
   - provider-resolved durable rows must be excluded when an active
     material-scope `blocked` relation exists for the owner scope;
   - unresolved candidates do not receive material-scope blocked filtering.

7. Add fixture-backed Retrieval integration:
   - keep real provider calls out of PR15C;
   - use fixture validated provider candidates to exercise the mixed workspace;
   - keep public provider-search pools rejected until PR15D if the production
     Retrieval query service has no provider-search port configured.

### Tests And Guards

- Mixed workspace tests for local + provider rows.
- Provider-only tests proving local text matches are not automatically added.
- Known source binding resolution tests.
- Unresolved material candidate tests.
- Dedupe tests for repeated provider candidates and resolved material rows.
- Text matching tests proving provider-returned rows that do not match the
  normalized text are excluded.
- Ranking tests proving SQL result-set FTS owns mixed ordering.
- Cursor page tests proving no provider/local re-read and stable keyset
  pagination.
- Expired result-set and expired material-candidate-cache error tests.
- Blocked relation exclusion tests for provider-resolved durable rows.
- Active-tree guard preventing `.sort(` in mixed query service/workspace paths
  where it would implement candidate ordering.
- Architecture guard preventing the Phase 12 local read port from gaining
  runtime result-set write capability.

### Acceptance

- Mixed result sets page through SQL using `resultSetId`.
- Result windows are bounded and not failure conditions.
- Resolved durable rows use durable material text; unresolved candidates use
  provider text.
- Provider fixture candidates can produce durable `material` hits or
  unresolved `material_candidate` hits.
- Query execution does not write durable source/material/projection facts.
- No real provider runtime is required.

## PR 15D: Source Provider Slot Wiring Into Retrieval

### Goal

Connect typed `provider_search` pools to Extension Source Provider Slot search
through a narrow Retrieval provider-search port.

### Tasks

1. Add Retrieval provider-search port:

```ts
type RetrievalProviderSearchPort = {
  search(input: {
    providerId: string;
    query: SourceQuery;
    sessionId?: string;
  }): Promise<SourceProviderSearchResult>;
};
```

2. Make `RetrievalQueryService.query(...)` async:
   - local-only queries use the same async API;
   - provider-search queries call provider-search pools in parallel;
   - provider calls happen outside `MusicDatabase.transaction(...)`.

3. Enforce provider-search input rules:
   - top-level normalized text is required;
   - order must be `text_relevance`;
   - `provider_search` only appears in `anyOf`;
   - `allOf` and `noneOf` are absent or empty when provider-search is present;
   - provider ids are unique;
   - provider limit defaults to `min(query.limit * 2, 50)` and maxes at 50;
   - `materialKind` maps to supported source target kinds only.

4. Wire Source Provider Slot:
   - Server Host or another composition root adapts Extension runtime search
     into `RetrievalProviderSearchPort`;
   - Retrieval must not import Extension runtime internals or provider plugins;
   - `sessionId` may pass through as provider execution context only and must
     not affect `resultSetId`, candidate identity, fingerprint, or cache
     identity.

5. Map provider errors:
   - missing provider or unsupported search ->
     `music_intelligence.provider_search_unavailable`;
   - provider failure ->
     `music_intelligence.provider_search_failed`;
   - invalid provider result ->
     `music_intelligence.provider_search_result_invalid`;
   - invalid provider-search pool/input ->
     `music_intelligence.provider_search_pool_invalid`.

6. Add NCM-backed smoke coverage:
   - run at least one provider-search mixed retrieval smoke when credentials
     and live flags are available;
   - keep live smoke opt-in.

### Tests And Guards

- Retrieval query service tests for async local-only behavior.
- Provider-search input validation tests.
- Provider error mapping tests.
- Parallel multi-provider success/failure tests using fake ports.
- Test proving cursor pages do not call providers.
- Composition guard proving Retrieval imports no Extension runtime internals or
  concrete provider plugins.
- Provider boundary guard proving providers do not import Music Data Platform
  material/source write modules.
- Optional live NCM smoke for provider-search mixed retrieval.

### Acceptance

- `provider_search` pools execute through the narrow provider-search port.
- Local-only Retrieval remains supported through the same async API.
- Provider-search failures fail the whole query.
- Mixed result-set paging reuses the first-page result set.
- No Stage Interface tool exists.
- Retrieval and Extension boundaries remain separated.

## Verification

Run narrow checks first, then broader checks:

```bash
npm run typecheck
npm run build:test
node ./.tmp-test/test/run-stage-core-tests.js
npm test
git diff --check
git diff --name-only
```

When available, run focused tests by the nearest existing harness pattern after
`npm run build:test`, for example:

```bash
node ./.tmp-test/test/formal/music-intelligence-retrieval.test.js
node ./.tmp-test/test/formal/music-data-platform-retrieval-read-model.test.js
node ./.tmp-test/test/formal/music-data-platform-retrieval-result-set.test.js
node ./.tmp-test/test/formal/music-data-platform-mixed-retrieval.test.js
node ./.tmp-test/test/formal/active-tree.test.js
```

Live provider smoke is opt-in and must report the required environment flags
if skipped.

## Documentation And State Sync

Each PR must update area docs when it changes current architecture:

- Music Data Platform `design.md`, `ports.md`, and `progress.md` for runtime
  result-set/cache schema, mixed workspace, writes, and retrieval SQL.
- Music Intelligence `design.md`, `ports.md`, and `progress.md` for typed
  pools, async query service, cursor shape, provider-search port, and hit
  shape.
- Extension `ports.md` and `progress.md` only when PR15D wires Source Provider
  Slot into Retrieval.
- `docs/formal-rebuild/README.md` and `INDEX.md` when adding or completing
  Phase 15 authority docs.
- `CURRENT_STATE.md` and `PROGRESS.md` after implementation PRs change the
  actual project state.

`ARCHITECTURE.md` changes only if existing root architecture wording does not
already cover the Retrieval / Music Data Platform / Extension boundary that the
PR establishes.

## Final Acceptance Criteria

- Typed pools replace old `poolFilter` input.
- Provider-search pools use top-level text and only participate through
  `anyOf`.
- Provider search is one-shot recall with no provider deep pagination.
- Provider candidates and local durable rows are ranked through one SQL-owned
  mixed result-set path.
- Mixed cursor pages read the same `resultSetId` and do not re-run providers.
- `materialCandidateRef` survives query completion through runtime cache until
  expiry.
- Result windows are bounded dynamically and are not failure conditions.
- Resolved durable material rows use durable material text.
- Unresolved material candidates use provider `SourceEntity` text.
- Result-set/cache writes are owned by Music Data Platform mixed retrieval
  workspace, not Music Intelligence or Extension.
- No durable source/material/canonical/relation/projection facts are written by
  provider-search query execution.
- Architecture guards prevent boundary regressions.
- Docs and state-sync files reflect the implemented state.

## Stopping Condition

Stop after PR15D is implemented, verified, documented, reviewed, and merged.
Do not begin Stage Interface query tool work, present/save flows, provider
candidate commit commands, or recommendation/radio behavior in Phase 15.
