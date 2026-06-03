# Material Search Implementation Plan

This is an implementation plan, not current design authority. Current design
authority lives in `docs/material-search/design.md`.

Implementation state now lives in `docs/material-search/progress.md`. Keep this
plan as execution history rather than a live status ledger.

## Goal

Implement Material Search v1 as an internal Material Flow capability backed by
SQLite FTS. It should replace `music.material.query` retrieval for `all`,
ordinary `source_library`, and `collection` pools while preserving existing
`related` and `source_library target: "release_tracks"` paths.

## Non-Goals

- No public `music.material.search` tool.
- No in-memory or Map-based SearchIndex fallback.
- No provider/source search.
- No query-time materialization writes.
- No semantic mood, vibe, genre, tag, or recommendation-intent search.
- No public exposure of Search evidence, provenance, or Search cursor.
- No `related` or `release_tracks` migration in v1.

## Ownership And Boundaries

- Owned bounded context: Material Flow / Material Search.
- Storage owner: Storage layer owns SQLite FTS schema and adapter.
- Stage Interface owner: Stage Interface owns public schema rename
  `q -> text` and `returnKind -> targetKind`.
- Composition owner: Stage Core wires Material Search, dirty invalidation, and
  transient SQLite SearchIndex setup.

Allowed Material Search reads:

- `resolveMaterialRedirect`
- `getMaterialRecord`
- `getSourceEntity`
- `getCanonical`
- `findMaterialBySourceRef`
- `listSourceLibraryItems`
- `listMaterialRelations`
- `listCollections`
- `listItems`
- `filterBlockedMaterials`

Allowed Material Search writes:

- SearchIndex writes only: `markDirty`, `refreshDirty`, `rebuildAll`, document
  upsert/delete inside the SearchIndex adapter.

Forbidden inside `src/material/search/**`:

- broad `MaterialStorePort`;
- broad `CollectionPort`;
- registry materialization writers such as `getOrCreateBySourceRef`;
- Stage Interface DTOs or compact output modules;
- provider/source grounding modules;
- direct storage imports from service code.

## Slice 1: Contracts, Ports, And Guards

Objective: introduce Material Search contracts and narrow ports without wiring
runtime behavior yet.

Expected files:

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `src/material/search/index.ts`
- `src/material/index.ts`
- `test/architecture/material-boundary.test.ts`
- `docs/material-search/design.md`
- `docs/material-search/implementation-plan.md`

Tasks:

- Add `MaterialSearchInput`, `MaterialSearchOutput`, hit, evidence, provenance,
  warning, cursor, scope, and `targetKind` contract types.
- Add `MaterialSearchPort`.
- Add `MaterialSearchStorePort` with the exact narrow store capabilities from
  the design.
- Add `MaterialSearchCollectionPort` with `listCollections`, `listItems`, and
  `filterBlockedMaterials`.
- Add architecture/type guards for exact port key sets and forbidden imports.

Acceptance criteria:

- Material Search types compile without Stage Interface DTO imports.
- Architecture guard fails if Material Search imports broad store/collection
  ports or registry writers.
- No runtime behavior changes yet.

Verification:

- `npm run typecheck`
- architecture test target used by `npm run build:test` or
  `node dist/test/architecture/material-boundary.test.js` after build.

## Slice 2: SQLite FTS SearchIndex

Objective: add the single SearchIndex implementation for v1.

Expected files:

- `src/storage/sqlite/material-search-schema.ts`
- `src/storage/sqlite/material-search-index.ts`
- `src/storage/sqlite/index.ts`
- `src/storage/index.ts`
- `test/storage/sqlite-material-search-index.test.ts`

Tasks:

- Create SQLite FTS5 schema with field-specific columns:
  `canonical_label`, `canonical_aliases`, `source_title`,
  `source_artist_labels`, `source_release_label`, and
  `source_artist_aliases`.
- Add dirty-row storage keyed by serialized `materialRef`.
- Implement `markDirty(materialRef)`, `refreshDirty(materialRefs)`,
  `rebuildAll()`, bootstrap empty-index rebuild, and `search()`.
- Ensure `search()` accepts only explicit `candidateMaterialRefs`; do not expose
  an unscoped global FTS search path.
- Implement field-level evidence using FTS `snippet()` / `highlight()` where
  practical.
- Implement SQLite-backed CJK or normalized substring matching with field-level
  evidence.
- Use transient SQLite for tests/harnesses when no persisted Search DB is
  configured.

Acceptance criteria:

- No in-memory SearchIndex implementation exists.
- Empty/uninitialized index bootstraps through owner-neutral `rebuildAll()`.
- `rebuildAll()` indexes only active current records.
- FTS and substring evidence are internal and field-level.

Verification:

- `npm run typecheck`
- `npm run build:test`
- `node dist/test/storage/sqlite-material-search-index.test.js`

## Slice 3: SearchDocument Builder

Objective: build owner-neutral SearchDocuments from durable material records.

Expected files:

- `src/material/search/index.ts`
- `test/material_search/material-search-document.test.ts`

Tasks:

- Build SearchDocuments keyed by `materialRef: Ref`.
- Project canonical label and aliases.
- Aggregate all attached source refs, not only `primarySourceRef`.
- Populate source-derived fields by material kind:
  - recording: source title, source artist labels, source release label;
  - release: source title, source artist labels;
  - artist: source title/name and source artist aliases.
- Deduplicate values per field.
- Exclude Source Library text, Collection labels, inferred mood/vibe/genre/tag
  labels, and owner-specific text.
- Mark material-level dirty on material registry/source/canonical text changes
  through composition-level wiring, not ordinary business callers.

Acceptance criteria:

- `source_text` and `context_text` are not concrete field names.
- `source_artist_aliases` applies to artist materials, not recording/release
  artist context.
- Canonical label and source title both remain searchable when they differ.

Verification:

- `npm run typecheck`
- `npm run build:test`
- `node dist/test/material_search/material-search-document.test.js`

## Slice 4: Owner-Visible Pool And Eligibility

Objective: implement Material Search service visibility and eligibility before
text matching.

Expected files:

- `src/material/search/index.ts`
- `test/material_search/material-search-visibility.test.ts`
- `test/material_search/material-search-eligibility.test.ts`

Tasks:

- Implement Local Material Catalog union:
  present Source Library items plus active `favorite`, `saved`, and `custom`
  Collection membership.
- Implement `source_library` scope with optional `libraryKinds`,
  provider/account filters, and `targetKind` narrowing.
- Implement collection scope by ref/id, label, relation, and bare collection.
- Resolve redirects, dedupe by current `materialRef`, and skip missing durable
  records with warnings.
- Enforce blocked material relation and Collection blocked membership for
  ordinary search.
- Preserve explicit blocked collection scope as audit/view exception.
- Do not hard-exclude `wrong_version`, `not_playable`, or `bad_match`.
- Do not call `MaterialPolicyEvaluator`.

Acceptance criteria:

- `all` does not mean global MaterialRecord listing.
- Search never materializes Source Library items during retrieval.
- Positive Collection visibility plus blocked Collection membership resolves
  to blocked override for ordinary search.

Verification:

- `npm run typecheck`
- `npm run build:test`
- `node dist/test/material_search/material-search-visibility.test.js`
- `node dist/test/material_search/material-search-eligibility.test.js`

## Slice 5: Search Execution, Sorting, Evidence, And Cursor

Objective: make Material Search return stable internal hits.

Expected files:

- `src/material/search/index.ts`
- `test/material_search/material-search-query.test.ts`
- `test/material_search/material-search-cursor.test.ts`

Tasks:

- Normalize `text`; missing/empty/all-whitespace means browse.
- For non-empty `text`, use SQLite FTS/substr matching over candidate refs.
- For browse, do not run empty SQLite FTS `MATCH`; sort by provenance priority.
- Apply text ranking by Search/FTS score; identity state and provenance do not
  boost text ranking.
- Keep provenance facts internally for sorting, diagnostics, and audit.
- Return material handles plus `score`, `evidence`, `provenance`, warnings, and
  opaque Search cursor.
- Implement cursor fingerprint over query shape: owner scope, scopes,
  `targetKind`, `text`, order, filters, and page size.
- Return non-retryable invalid-cursor error on cursor fingerprint mismatch.
- Treat `limit` as final returned hits; internally overfetch when needed.

Acceptance criteria:

- Text search ordering is score-first with stable `materialRef` tie-breaks.
- Browse ordering uses `favorite > saved > custom > source_library`.
- Dirty refresh can happen before matching without invalidating cursor solely
  because index freshness changed.

Verification:

- `npm run typecheck`
- `npm run build:test`
- `node dist/test/material_search/material-search-query.test.js`
- `node dist/test/material_search/material-search-cursor.test.js`

## Slice 6: Stage Core Wiring And Dirty Invalidation

Objective: wire Material Search into runtime composition without spreading dirty
calls through business modules.

Expected files:

- `src/stage_core/repositories.ts`
- `src/stage_core/runtime_kit.ts`
- `src/stage_core/compose.ts`
- `src/stage_core/types.ts`
- `test/stage_core/stage-core-factory.test.ts`
- `test/architecture/material-boundary.test.ts`

Tasks:

- Add SearchIndex repository/adapter setup.
- Use the SQLite FTS adapter for persisted and transient setups.
- Wire MaterialSearch service into Stage Core.
- Wrap or compose registry/source/canonical text-changing writes so
  material-level dirty invalidation is centralized.
- Expose MaterialSearch only where needed by Material Query, not to Stage
  Interface as a new public tool.

Acceptance criteria:

- Stage Core default harness can run Material Search using transient SQLite.
- Persisted runtime can use SQLite SearchIndex storage.
- Dirty invalidation wiring is centralized in composition/owning wrapper.

Verification:

- `npm run typecheck`
- `npm run build:test`
- `npm run test:stage-core`

## Slice 7: Query Integration And Public Schema Rename

Objective: make `music.material.query` consume Material Search for v1 pools.

Expected files:

- `src/contracts/index.ts`
- `src/material/query/index.ts`
- `src/stage_interface/tool_definitions/music.ts`
- `src/stage_interface/outputs.ts` if compact output needs adjustment
- `test/material_query/material-query.test.ts`
- `test/stage_interface/stage-interface.test.ts`
- `test/surfaces/mcp-server.test.ts`

Tasks:

- Rename public Query input `q -> text`.
- Rename `returnKind -> targetKind`.
- Do not keep compatibility aliases.
- Route `all`, ordinary `source_library`, and `collection` retrieval through
  Material Search.
- Keep `related` and `source_library target: "release_tracks"` on existing
  paths.
- Project Search hits into `MusicMaterial` candidates through Material
  Projection / Query-side projection.
- Do not expose Search evidence, provenance, or Search cursor in ordinary Query
  output.
- Keep Query selector-level cursor. Query may overfetch Search pages up to
  `max(100, queryLimit * 10)` and hard cap `500`.
- For explicit selector-level orders such as `least_recently_recommended` or
  `random`, let Material Selector/Sorter handle ordering after retrieval.

Acceptance criteria:

- Public schema advertises `text` and `targetKind`, not `q` or `returnKind`.
- Query no longer does read-time Source Library materialization for v1 Search
  pools.
- Existing related and release-track behavior remains intact.

Verification:

- `npm run typecheck`
- `npm run build:test`
- `node dist/test/material_query/material-query.test.js`
- `node dist/test/stage_interface/stage-interface.test.js`
- `node dist/test/surfaces/mcp-server.test.js`

## Slice 8: Docs, Progress, And Final Guards

Objective: sync current docs and close implementation status.

Expected files:

- `docs/material-search/design.md`
- `docs/material-search/implementation-plan.md`
- `docs/material-search/progress.md` if the area needs a status ledger after
  implementation starts
- `docs/material/design.md`
- `docs/material/ports.md`
- `docs/stage-interface/tool-contracts.md`
- `docs/stage-core/ports.md`
- `INDEX.md`
- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`

Tasks:

- Update area docs for implemented boundaries and public schema changes.
- Add or update progress/status docs only after implementation changes land.
- Record architecture guard coverage.
- Archive or mark this plan as superseded after the implementation is complete.

Acceptance criteria:

- Current authority docs match code.
- Archive remains historical evidence only.
- State Sync Gate is complete.

Verification:

- `git diff --name-only`
- `npm run typecheck`
- `npm run build:test`
- `npm run test:stage-core`

## Recommended Execution Order

1. Slice 1: contracts, ports, guards.
2. Slice 2: SQLite FTS SearchIndex.
3. Slice 3: SearchDocument builder.
4. Slice 4: visibility and eligibility.
5. Slice 5: search execution, evidence, cursor.
6. Slice 6: Stage Core wiring and dirty invalidation.
7. Slice 7: Query integration and schema rename.
8. Slice 8: docs/progress/state sync.

Each slice should keep tests focused and avoid unrelated cleanup. If a slice
discovers a separate boundary problem, record it as a follow-up unless it blocks
Material Search v1.
