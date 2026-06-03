# Material Search Design

This document is the current design authority for Material Search.

Material Search is local durable material retrieval. It is not provider search,
material resolve, recommendation selection, public output projection, or a new
Stage Interface tool.

## Responsibility

Material Search owns:

- owner-visible Local Material Catalog retrieval;
- scope collection for `all`, ordinary `source_library`, and `collection`;
- strict owner visibility before text index search;
- owner-neutral SearchDocument construction;
- SQLite FTS-backed text matching;
- Search-owned score, evidence, provenance, warnings, and cursor handling.

Material Search does not own:

- provider/source search;
- source grounding or material resolve;
- registry materialization writes;
- public compact card projection;
- policy evaluation, final selection, or recommendation presentation;
- semantic mood, vibe, genre, tag, or recommendation-intent interpretation.

`music.material.query` is the first consumer. It uses Material Search for
`all`, ordinary `source_library`, and `collection` retrieval. `related` and
`source_library` with `target: "release_tracks"` remain on their existing paths.

## Public Language

Material Search itself is an internal Material Flow capability. It does not add
a public Search tool.

`music.material.query` uses normalized public language:

- `q` becomes `text`;
- `returnKind` becomes `targetKind`;
- compatibility aliases are not kept.

`targetKind` is a hard material-kind filter, not a ranking boost. Public Query
accepts `recording`, `artist`, `album`, `release`, and `release_group`; `album`
normalizes to internal Search target `release`. It does not keep `track` or
`song` aliases. If no `targetKind` is provided, text search is cross-kind.

`text` is trimmed. Missing, empty, or all-whitespace `text` means browse the
selected scope rather than invalid input.

## Local Material Catalog

`all` means the owner-visible Local Material Catalog, not a global
`MaterialRecord` list.

The Local Material Catalog is the union of positive owner-visible sources:

- present Source Library items;
- active `favorite`, `saved`, and `custom` Collection membership.

Active material-level `saved` or `favorite` relations do not grant catalog
membership. Source Library and Collection are membership authorities; material
relations affect eligibility, policy, or evidence.

An absent Source Library item alone does not grant visibility, but it does not
revoke visibility granted by positive Collection membership.

All active `custom` Collection membership grants v1 `all` visibility. Hidden or
workspace-only Collections require a future explicit Collection property, not
label-based inference.

## Scopes

Multiple scopes are a union, followed by redirect resolution, dedupe,
eligibility, text matching, and sorting.

`source_library` without `libraryKinds` searches all present Source Library
kinds for the owner/provider/account filters. `targetKind` narrows after that.
A bare `source_library` without provider/account filters means all present
Source Library items for the owner across providers and accounts.

Collection scope by label resolves as:

- zero matches returns an empty result;
- one match selects that Collection;
- multiple matches fail with an ambiguous collection-scope error.

Collection scope with both `ref`/`collectionId` and `label` treats the label as
a consistency check. A mismatch is an invalid collection-scope error.

A bare `collection` scope without `ref`, `label`, or `relation` means all
positive owner Collections: `favorite`, `saved`, and `custom`. It excludes
Source Library and blocked Collections.

Explicit `collection` search with `relation: "blocked"` is an audit/view path
and must not be filtered out by the ordinary blocked eligibility rule.

## Eligibility

Material Search hard eligibility checks are:

- current active `MaterialRecord`;
- `targetKind` match;
- not blocked by active material-level blocked relation;
- not blocked by Collection Service blocked membership.

`blocked` does not grant ordinary visibility and is excluded from ordinary
`all`, `source_library`, and default `collection` search. If positive
Collection visibility and blocked Collection membership both exist for the same
owner/material, blocked membership overrides ordinary visibility.

Material Search does not hard-exclude `wrong_version`, `not_playable`, or
`bad_match`. Those remain Policy/Selector or repair/detail concerns. Material
Search does not call `MaterialPolicyEvaluator`.

Present Source Library items without durable `MaterialRecord`s are skipped with
a warning. Material Search does not materialize them and does not fail the
whole search. Import/Update/Resolve remain the paths that create durable
material records.

SearchDocument indexing and `rebuildAll()` include only active current
`MaterialRecord`s. Merged losers and rejected records are not indexed; merged
refs resolve to survivors during pool/candidate handling.

## Search Documents

SearchDocument is owner-neutral and keyed by `materialRef: Ref`. Storage may
serialize the Ref, but Search internal identity remains `materialRef`, not
`materialId` or a separate material-key concept.

Strict owner visibility is enforced by Material Search constructing an
owner-visible candidate pool before calling the index. The index must search
only within `candidateMaterialRefs`; it must not expose a global unscoped FTS
search path.

Source Library and Collection facts affect pool membership and provenance, not
owner-neutral SearchDocument text. Source Library item changes and Collection
changes do not mark SearchDocument dirty.

## Indexed Text

Indexed text is concrete owner-neutral material text only. Material Search does
not add inferred mood, vibe, genre, tag, or recommendation labels as searchable
text.

`sourceText` may be used only as a loose umbrella term for source-derived
indexed fields. It must not be a concrete FTS column name or evidence field.
It means owner-neutral Source Entity natural-language text, not Source Library
text.

v1 FTS columns are field-specific:

- `canonical_label`;
- `canonical_aliases`;
- `source_title`;
- `source_artist_labels`;
- `source_release_label`;
- `source_artist_aliases`.

Do not collapse source-derived text into a coarse `source_text` or
`context_text` bucket.

When `canonical_label` and `source_title` both exist and differ, index both.
`canonical_label` may carry higher weight, but source title remains searchable
for provider/user-memory matches.

When one material has multiple attached source refs, aggregate owner-neutral
source-derived fields from all attached sources into the same SearchDocument,
deduped per field. `primarySourceRef` may affect projection/display but does
not limit search recall.

Recording context fields such as `source_artist_labels` and
`source_release_label` may recall recordings, but they carry lower ranking
weight than `canonical_label`, `canonical_aliases`, or `source_title`.

For release materials, the release title belongs in `source_title`.
`source_release_label` is reserved for recording release/album context.

`source_artist_aliases` is for artist materials themselves. v1 recording and
release artist context indexes artist labels only, not artist aliases.

## SQLite FTS

v1 ships only the SQLite FTS-backed SearchIndex. Do not build a Map-based or
custom in-memory SearchIndex fallback.

Test and default harnesses may use the same SQLite FTS-backed SearchIndex
against a transient SQLite database. That is not an in-memory SearchIndex
fallback; it keeps one SearchIndex behavior while preserving lightweight
harness setup.

Text matching belongs inside `MaterialSearchIndex.search()`, including
SQLite-backed CJK or normalized substring matching. Scope collectors and
SearchService do not perform text filtering.

Because there is no in-memory fallback, tests should validate the SQLite
adapter behavior directly instead of maintaining cross-adapter parity.

## Dirty Refresh

Dirty synchronization is simple material-level invalidation:

- `markDirty(materialRef)`;
- `refreshDirty(materialRefs)`.

Refresh rebuilds the one owner-neutral document and clears the dirty row.
`rebuildAll()` has no `ownerScope` parameter.

Dirty refresh is a Material Search/SearchIndex freshness concern, not a
`music.material.query` concern. Any consumer of Material Search should observe
the same freshness behavior.

Before searching, Material Search may perform bounded lazy refresh for dirty
candidate material refs after owner-visible pool construction and before SQLite
FTS matching.

If the SQLite SearchIndex is empty or uninitialized, Material Search/SearchIndex
bootstrap should run an owner-neutral `rebuildAll()` before serving searches.
This bootstrap is not tied to `music.material.query`.

## Sorting And Pagination

Missing or empty `text` uses browse semantics. It still goes through Material
Search visibility, provenance, eligibility, and cursor handling, but it does
not run an empty SQLite FTS `MATCH`.

Empty-text browse uses provenance priority:

```text
favorite > saved > custom > source_library
```

Within provenance:

- system `favorite` / `saved`: `CollectionItem.createdAt` descending;
- `custom`: collection label ascending, then `position` ascending, then
  `CollectionItem.createdAt` ascending;
- `source_library`: `addedAt ?? lastSeenAt` descending.

When one material has multiple provenances, empty-text sorting uses the
highest-priority provenance while preserving all provenance facts internally.

Text search sorts by Search/FTS score. Provenance and identity state do not
boost text-search ranking. Exact score ties fall back to stable `materialRef`
ordering.

Material Search supports relevance/text ordering and empty-text browse
provenance ordering. It does not become a general MaterialSorter;
`least_recently_recommended`, explicit random, and other selector-level orders
remain Material Selector/Sorter concerns.

`limit` means final returned hits, not raw SQLite/FTS candidate count.
Material Search may overfetch internally to account for redirect resolution,
dedupe, eligibility, and provenance handling.

Material Search has its own opaque, fingerprinted cursor. Cursor fingerprints
include query shape, such as owner scope, scopes, `targetKind`, `text`, order,
filters, and page size. They do not include per-refresh index freshness/version,
so lazy dirty refresh does not unnecessarily invalidate pagination.

Cursor fingerprint mismatch returns a non-retryable invalid-cursor error rather
than silently restarting from the first page.

`music.material.query` does not expose or directly reuse the Search cursor.
Query keeps its own selector-level cursor and may internally overfetch through
Search pages to fill the current Query page, bounded by
`max(100, queryLimit * 10)` and a hard cap of `500` Search candidates.

## Output And Evidence

Material Search does not directly return `MusicMaterial` projections. It
returns material handles plus Search-owned facts such as score, evidence,
provenance, cursor, and warnings. Consumers project `MusicMaterial` through
Material Projection or Query-side projection.

Search hits preserve all provenance facts internally for sorting, diagnostics,
and audit, but ordinary Query output does not expose them.

SQLite FTS5 supports v1 internal evidence through `snippet()` / `highlight()`
and column-aware matching. Evidence is field-level plus optional short snippet,
not a complex public explanation layer.

CJK or normalized substring matches may also produce internal evidence. FTS
matches can use snippets; substring matches only need field-level evidence,
with snippet optional.

`source_library_label` is not a v1 text evidence kind. Source Library
membership is provenance, not text-match evidence.

Ordinary `music.material.query` public output does not expose Search evidence,
provenance, or Search cursor.

## Ports And Boundaries

Material Search belongs to Material Flow. Search service and ports live under
Material Flow. SQLite FTS schema and adapter live under Storage.

Material Search consumes a narrow store port:

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

Material Search consumes a narrow Collection port:

```ts
export type MaterialSearchCollectionPort = Pick<
  CollectionPort,
  | "listCollections"
  | "listItems"
  | "filterBlockedMaterials"
>;
```

Architecture guards prevent `src/material/search/**` from importing:

- broad `MaterialStorePort`;
- broad `CollectionPort`;
- Stage Interface DTOs or compact output modules;
- provider/source grounding modules;
- storage modules directly from service code;
- registry writer capabilities.

Dirty invalidation should be wired through Stage Core composition or an owning
composition wrapper, not by spreading `markDirty` calls through ordinary
business callers.
