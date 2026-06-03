# Material Search Grill Decisions

This document records the decisions from the 2026-06-04 grill session for
`minemusic_material_search_proposal_v3.md`.

It is discussion evidence, not current implementation authority. Stable design
and port decisions should be copied into `docs/material-search/design.md` and
related current authority documents when the implementation slice starts.

## Product Semantics

- `MaterialSearch` is local durable material retrieval, not provider search,
  resolve, recommendation selection, or public output projection.
- `all` means the owner-visible Local Material Catalog, not global
  `MaterialRecord` listing.
- The Local Material Catalog is the union of positive owner-visible sources:
  present Source Library items plus `favorite`, `saved`, and `custom`
  Collection membership.
- All active `custom` Collection membership grants v1 `all` visibility. Hidden
  or workspace-only Collections require a future explicit Collection property,
  not label-based inference.
- Active material-level `saved` or `favorite` relations do not grant Local
  Material Catalog membership. Source Library and Collection are the membership
  authorities; material relations affect eligibility, policy, or evidence.
- An absent Source Library item alone does not grant visibility, but it does not
  revoke visibility granted by `favorite`, `saved`, or `custom` Collection
  membership.
- `blocked` does not grant ordinary visibility and is excluded from ordinary
  `all`, `source_library`, and default `collection` search.
- If a material has both positive Collection visibility and blocked Collection
  membership for the same owner, blocked membership overrides ordinary
  visibility. Explicit blocked collection search remains the audit/view
  exception.
- Explicit `collection` search with `relation: "blocked"` is an audit/view
  path and must not be filtered out by the ordinary blocked eligibility rule.
- Multiple scopes are a union, followed by redirect resolution, dedupe,
  eligibility, text search, and sorting.
- Collection scope by label resolves as: zero matches returns an empty result,
  one match selects that Collection, multiple matches fail with an ambiguous
  collection-scope error.
- Collection scope with both `ref`/`collectionId` and `label` treats the label
  as a consistency check. If they identify different Collections, Search fails
  with an invalid collection-scope error.
- A bare `collection` scope without `ref`, `label`, or `relation` means all
  positive owner Collections: `favorite`, `saved`, and `custom`. It excludes
  Source Library and blocked Collections.
- `targetKind` is the canonical term for the requested material kind. It is a
  hard filter, not a ranking boost. Avoid `returnKind`.
- `music.material.query` should use `targetKind`; `returnKind` should be
  removed rather than kept as a compatibility alias.
- MaterialSearch v1 changes the `music.material.query` public schema for
  language normalization: remove `q` in favor of `text`, remove `returnKind` in
  favor of `targetKind`, and do not keep compatibility aliases. It does not add
  a new public Search tool or expose Search evidence, provenance, or Search
  cursor.
- `track` and `song` normalize to `recording`; `album` normalizes to `release`.
- If no `targetKind` is provided, text search is cross-kind.
- `text` is trimmed. Missing, empty, or all-whitespace `text` means browse the
  selected scope rather than invalid input.
- `source_library` without `libraryKinds` searches all present Source Library
  kinds for the owner/provider/account filters, then `targetKind` narrows the
  result.
- A bare `source_library` scope without provider/account filters means all
  present Source Library items for the owner, across providers and accounts.
  Provider/account/library-kind fields only narrow that source pool.
- Free-text MaterialSearch v1 is local text retrieval over indexed material
  text. It does not interpret mood, vibe, recommendation intent, or semantic
  descriptions such as "sleep", "relax", or "work background music"; those
  belong to Query/Selector or a future semantic index.
- Code inspection confirms `music.material.query` is an explicit pool retrieval
  tool, not an intent classifier. MaterialSearch replaces the existing pool
  `q` matching path; it does not decide whether a natural-language request is a
  recommendation request.

## Sorting And Pagination

- Empty-text browse uses provenance priority:
  `favorite > saved > custom > source_library`.
- Within provenance:
  - system `favorite` / `saved`: `CollectionItem.createdAt` descending;
  - `custom`: collection label ascending, then `position` ascending, then
    `CollectionItem.createdAt` ascending;
  - `source_library`: `addedAt ?? lastSeenAt` descending.
- When one material has multiple provenances, empty-text sorting uses the
  highest-priority provenance while preserving all provenance facts internally.
- Search hits preserve all provenance facts internally for sorting, diagnostics,
  and audit, but ordinary Query output does not expose them.
- Text search sorts by Search/FTS score. Provenance and identity state do not
  boost text-search ranking. Exact score ties fall back to stable material key
  ordering.
- MaterialSearch itself supports relevance/text ordering and empty-text browse
  provenance ordering. It does not become a general MaterialSorter;
  `least_recently_recommended`, explicit random, and other selector-level
  orders remain Material Selector/Sorter concerns.
- Missing or empty `text` uses browse semantics. It still goes through
  MaterialSearchService visibility, provenance, eligibility, and cursor
  handling, but it does not run an empty SQLite FTS `MATCH`.
- `MaterialSearch` has its own opaque, fingerprinted cursor.
- Search cursor fingerprints include query shape, such as owner scope, scopes,
  `targetKind`, `text`, order, filters, and page size. They do not include
  per-refresh index freshness/version, so lazy dirty refresh does not
  unnecessarily invalidate pagination.
- Cursor fingerprint mismatch returns a non-retryable invalid-cursor error
  rather than silently restarting from the first page.
- `limit` on the MaterialSearch port means final returned hits, not raw
  SQLite/FTS candidate count. SearchService may overfetch internally to account
  for redirect resolution, dedupe, eligibility, and provenance handling.
- MaterialSearch input uses `text`, not the existing Query implementation's
  legacy `q` name. `music.material.query` should be normalized to `text` as part
  of v1 integration.
- `music.material.query` does not expose or directly reuse the Search cursor.
  Query keeps its own selector-level cursor.
- Query may internally overfetch through Search pages to fill the current Query
  page, bounded by `max(100, queryLimit * 10)` and a hard cap of `500`
  Search candidates.

## Search Documents And Indexing

- SearchDocument is owner-neutral and keyed by `materialRef` (`Ref`). Storage
  may serialize the Ref, but Search internal identity remains `materialRef`,
  not `materialId` or a separate material key concept.
- Strict owner visibility is enforced by SearchService constructing an
  owner-visible candidate pool before calling the index.
- SearchIndex must search only within `candidateMaterialRefs`; it must not
  expose a global unscoped FTS search path.
- v1 ships only the SQLite FTS-backed SearchIndex. Do not build an in-memory
  SearchIndex fallback.
- Test and default harnesses may use the same SQLite FTS-backed SearchIndex
  against a transient SQLite database. That is not an in-memory SearchIndex
  fallback; it keeps one SearchIndex behavior while preserving lightweight
  harness setup.
- `sourceLibraryText` is removed from v1 indexed fields.
- Collection labels are not indexed in v1.
- Source Library and Collection facts affect pool/provenance, not owner-neutral
  SearchDocument text.
- Source Library item changes and Collection changes do not mark SearchDocument
  dirty.
- Dirty synchronization is simple material-level invalidation:
  `markDirty(materialRef)` and `refreshDirty(materialRefs)` rebuild the one
  owner-neutral document and then clear the dirty row.
- Dirty refresh is a MaterialSearch/SearchIndex freshness concern, not a
  `music.material.query` concern. Any consumer of MaterialSearch should observe
  the same freshness behavior.
- Before searching, MaterialSearch may perform bounded lazy refresh for dirty
  candidate material refs after owner-visible pool construction and before
  SQLite FTS matching.
- `rebuildAll()` has no `ownerScope` parameter.
- If the SQLite SearchIndex is empty or uninitialized, MaterialSearch/SearchIndex
  bootstrap should run an owner-neutral `rebuildAll()` before serving searches.
  This bootstrap is not tied to `music.material.query`.
- Text matching belongs inside `MaterialSearchIndex.search()`, including
  SQLite-backed CJK or normalized substring matching. Scope collectors and
  SearchService do not perform text filtering.
- Because there is no in-memory fallback, tests should validate the SQLite
  adapter behavior directly instead of maintaining cross-adapter parity.

## Indexed Text

- `sourceText` may be used only as a loose umbrella term for source-derived
  indexed fields. It must not be a concrete FTS column name or evidence field.
  It means owner-neutral Source Entity natural-language text, not Source Library
  text.
- Do not collapse source-derived text into a coarse `source_text` or
  `context_text` bucket. v1 FTS columns should stay field-specific:
  `canonical_label`, `canonical_aliases`, `source_title`,
  `source_artist_labels`, `source_release_label`, and `source_artist_aliases`.
- Recording `sourceText` includes track title, artist labels, and release/album
  label.
- Release `sourceText` includes release title and artist labels, not tracklist
  titles.
- Artist `sourceText` includes artist label/aliases, not track or release
  titles.
- `canonical_label` may have a higher text-field weight than source primary
  text, but `identityState` itself does not add ranking boost.
- v1 indexed text includes concrete owner-neutral material text only; it does
  not add inferred mood, vibe, genre, or recommendation labels as Search text.
- When `canonical_label` and `source_title` both exist and differ, index both.
  `canonical_label` may carry higher weight, but source title remains searchable
  for provider/user-memory matches.
- When one material has multiple attached source refs, aggregate owner-neutral
  source-derived fields from all attached sources into the same SearchDocument,
  deduped per field. `primarySourceRef` may affect projection/display but does
  not limit search recall.
- Recording context fields such as `source_artist_labels` and
  `source_release_label` may recall recordings, but they should carry lower
  ranking weight than `canonical_label`, `canonical_aliases`, or `source_title`
  matches.
- For release materials, the release title belongs in `source_title`.
  `source_release_label` is reserved for recording release/album context.
- `source_artist_aliases` is for artist materials themselves. v1 recording and
  release artist context indexes artist labels only, not artist aliases, to
  avoid broad alias-driven recall noise.

## Eligibility And Policy

- Search hard eligibility checks:
  - current active MaterialRecord;
  - `targetKind` match;
  - not blocked by active material-level blocked relation;
  - not blocked by Collection Service blocked membership.
- SearchDocument indexing and `rebuildAll()` include only active current
  MaterialRecords. Merged losers and rejected records are not indexed; merged
  refs resolve to survivors during pool/candidate handling.
- Search does not hard-exclude `wrong_version`, `not_playable`, or `bad_match`.
  Those remain Policy/Selector or repair/detail concerns.
- Search does not call `MaterialPolicyEvaluator`.
- Present Source Library items without durable MaterialRecords are skipped with
  a warning, not materialized or treated as whole-search failure.
- Code inspection found that the current Source Library query path performs
  query-time materialization via `getOrCreateBySourceRef`. MaterialSearch v1
  deliberately stops that behavior for `all`, ordinary `source_library`, and
  `collection` retrieval: Search is read-only durable retrieval and returns
  only existing active MaterialRecords. Import/Update/Resolve remain the paths
  that create durable material records.

## Output And Evidence

- MaterialSearch does not directly return `MusicMaterial` projections. It
  returns material handles plus Search-owned facts such as `score`, `evidence`,
  `provenance`, cursor, and warnings; consumers project `MusicMaterial` through
  Material Projection / Query-side projection.
- Search internal output includes `score`, `evidence`, and `provenance`.
- SQLite FTS5 supports v1 internal evidence through `snippet()` / `highlight()`
  and column-aware matching. Evidence should be field-level plus optional short
  snippet, not a complex public explanation layer.
- CJK or normalized substring matches may also produce internal evidence. FTS
  matches can use snippets; substring matches only need field-level evidence,
  with snippet optional.
- Ordinary `music.material.query` public output does not expose Search evidence
  or provenance.
- `source_library_label` is not a v1 text evidence kind. Source Library
  membership is provenance, not text-match evidence.

## Boundary And Implementation Shape

- `MaterialSearch` v1 is an internal Material Flow port. It does not introduce a
  new public Stage Interface tool.
- `music.material.query` is the first consumer.
- MaterialSearch v1 should directly replace `music.material.query`
  `all`, ordinary `source_library`, and `collection` retrieval rather than ship
  as a detached side-channel capability.
- `related` remains on the existing path and does not enter MaterialSearch v1.
- `source_library target: "release_tracks"` remains on the existing path and
  does not enter MaterialSearch v1.
- `listMaterialRecords` is not required for v1 `all` semantics and should not
  be the first implementation slice.
- New implementation slicing:
  1. owner-visible pool semantics and architecture guards;
  2. owner-neutral SearchIndex and SQLite FTS storage adapter;
  3. Query integration and overfetch;
  4. docs/state sync and optional diagnostics.
- `MaterialSearchStorePort` exact shape:

```ts
export type MaterialSearchStorePort =
  MaterialProjectionStorePort &
  Pick<
    MaterialStorePort,
    | "findMaterialBySourceRef"
    | "listSourceLibraryItems"
    | "listMaterialRelations"
  >;
```

- `MaterialSearchCollectionPort` exact shape:

```ts
export type MaterialSearchCollectionPort = Pick<
  CollectionPort,
  | "listCollections"
  | "listItems"
  | "filterBlockedMaterials"
>;
```

- Search service and ports belong to Material Flow. SQLite FTS schema and
  adapter belong to Storage.
- Dirty invalidation should be wired through Stage Core composition, not by
  spreading `markDirty` calls through business callers.
- Architecture guards should prevent `src/material/search/**` from importing
  broad `MaterialStorePort`, broad `CollectionPort`, Stage Interface DTOs,
  provider/source grounding modules, storage modules, or registry writers.

## Reversed Or Withdrawn During Discussion

- Owner-scoped SearchDocument was considered, then withdrawn.
- `sourceLibraryText` in owner-scoped docs was considered, then rejected.
- Long-lived global dirty rows for per-owner docs were considered, then
  withdrawn after returning to owner-neutral SearchDocument.
- Identity-state ranking boost was considered, then withdrawn. Search ranking
  follows search score only.
