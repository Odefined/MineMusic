# Phase 8 Owner Catalog Projection Foundation

> Status: Implemented Phase 8 spec
> Phase owner: Music Data Platform / Owner Catalog Projection
> Output type: Command-maintained owner catalog projection foundation with
> source-library as the first implemented producer

Phase 8 establishes the generic owner catalog projection foundation that later
local pool query, text search, relation policy, collection browse, and
query-to-present flows will consume.

Phase 8 implementation must include both the source-library fact rewrite and
the owner catalog projection schema/commands in one phase. Do not implement
owner catalog projection on top of the old provider/account/library/source item
identity.

Completing only the source-library fact rewrite is not an acceptable Phase 8
stop point. The phase must also deliver owner catalog projection commands and
the owner catalog SQL view.

Phase 8 is not a query phase. It does not create public Stage Interface query
tools, query hits, ranking, text FTS, provider-search TEMP candidate tables,
`MaterialCard` output, recommendation behavior, or present flow.

Phase 8 is also not the collection or owner-relation write phase. It creates
the generic projection shape that future collection and owner-relation facts
will use, but the only implemented producer in this phase is source-library
membership.

## Established Inputs

Before Phase 8, current formal state provides:

- Phase 4 generic `MusicDatabase` foundation;
- Phase 5 Music Data Platform identity write commands for source, material,
  canonical, source-material binding, material-canonical binding, and material
  merge;
- Phase 7 source-library import persistence;
- `source_library_items` currently keyed by provider id, provider account id,
  library kind, and source ref key;
- source records and source-backed material records created by Library Import;
- source-material binding facts for imported source refs;
- no owner catalog projection tables;
- no collection facts;
- no owner relation facts;
- no owner registry;
- no local pool query engine.

Formal architecture requires:

- Music Data Platform owns source/material/canonical identity, library import,
  owner-scoped fact families, projections, and catalog read models;
- source-library items, collection items, and owner-material relations are
  source-of-truth fact families;
- owner catalog projections are read models, not source-of-truth;
- Query and presentation are later boundaries and must not construct durable or
  projection records directly;
- Stage Interface remains the only agent-facing callable boundary and must not
  leak internal storage or projection records.

## Confirmed Decisions

### Generic Projection, Source-Library First Producer

Phase 8 builds the generic owner catalog projection foundation, not a
source-library-only reporting table.

The existing Library Import identity write path remains responsible for source
records, material records, and source-material bindings. Phase 8 does not
redesign or broaden material creation/binding behavior.

Phase 8 attaches source-library facts only after that existing identity path has
produced a current source-material binding:

```text
Existing Library Import identity write path
  -> SourceRecord
  -> MaterialRecord when needed by current identity policy
  -> source_material_bindings

Phase 8 source-library fact write
  -> source_libraries
  -> source_library_items
```

Only after source/material records and the source-material binding exist can the
source-library item fact be written.

The owner catalog projection read path is:

```text
source_libraries
  + source_library_items
  + source_material_bindings
  + active material_records
  -> owner_material_entries
  -> owner_material_catalog_view
```

`owner_material_entries` and `owner_material_catalog_view` are generic owner
catalog projection names. They are not renamed to provider-account or
source-library-specific names.

In Phase 8, only source-library items produce entries. Collection and
owner-relation columns, producers, commands, and behavior remain out of scope
until their fact families exist.

### Owner Scope

`owner_scope` is the MineMusic owner/workspace scope for owner-facing catalog
state.

`owner_scope` is not a provider account id and must not be derived from provider
account identity. Provider account identity belongs to source-library facts and
source-library provenance.

Phase 8 supports only one local default owner/workspace scope. It does not
introduce:

- owner registry tables;
- user login;
- account selection;
- family/shared-library ownership;
- provider-account-to-owner mapping;
- public owner management tools.

The exact stored default owner-scope value is an internal implementation
detail, but it must be stable, ref-safe, and not encode provider account
identity.

Phase 8 should define one internal default owner/workspace scope constant, for
example:

```ts
DEFAULT_OWNER_SCOPE = "local"
```

The value must be stable and ref-safe. It is not a public owner registry and
does not introduce owner management behavior.

The default owner-scope helper belongs in Music Data Platform, not in global
contracts. Suggested module:

```text
src/music_data_platform/owner_scope.ts
```

Suggested exports:

```ts
export const DEFAULT_OWNER_SCOPE = "local";
export function assertOwnerScope(value: string): void;
```

### Source Library, Source Library Item, And Library Ref

`source_library_items` stores source-library item or membership facts. It does
not store a source library itself.

A source library is the provider/account/library-kind scope, for example:

```text
NCM account 130950618 saved_source_track library
```

A source-library item is a source item inside that library, for example:

```text
NCM account 130950618 saved_source_track contains source_netease:track:1001
```

Phase 8 introduces `libraryRef` as the formal identity of a source library.
It refers to the source library itself, not to an item inside the library.
`libraryRef` alone cannot identify a source-library item because a library
contains many source refs.

`libraryRef` uses the project-wide `Ref` / `refKey(ref)` contract:

```ts
libraryRef = {
  namespace: "source_library",
  kind: PlatformLibraryKind,
  id: `l_${sha256Hex24(ownerScope, providerId, providerAccountId, libraryKind)}`,
}
```

Examples:

```text
source_library:saved_source_track:l_<opaque>
source_library:saved_source_album:l_<opaque>
source_library:followed_source_artist:l_<opaque>
```

`library_ref_key` is always `refKey(libraryRef)`. Code must not hand-roll the
key string and must not parse provider id, provider account id, owner scope, or
library kind out of `libraryRef.id`. Those are source-library fact columns.

Phase 8 should add Music Data Platform helpers for source-library refs while
keeping the project-wide `Ref` shape:

```ts
createSourceLibraryRef(input: {
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  libraryKind: PlatformLibraryKind;
}): Ref

assertSourceLibraryRef(ref: Ref): void
```

Do not introduce a separate structural `SourceLibraryRef` type. The helper and
validator should enforce `namespace === "source_library"`, `kind` is a
`PlatformLibraryKind`, `id` starts with `l_`, and all ref components are safe.

These helpers belong in Music Data Platform, not provider/extension code and
not Stage Interface. Suggested module:

```text
src/music_data_platform/source_library_ref.ts
```

Providers return platform library candidates and source entities; they do not
generate MineMusic `libraryRef` values.

`createSourceLibraryRef` must be stable and deterministic across process runs.
It must not use randomness, counters, timestamps, or database row state. The
hash input is the canonical ordered tuple:

```text
ownerScope
providerId
providerAccountId
libraryKind
```

The generated id must be ref-safe and must not contain raw provider/account
text. Tests should assert same input produces the same ref and changes to owner
scope, provider id, provider account id, or library kind produce different
refs.

Phase 8 should split current source-library persistence into:

```text
source_libraries
  library_ref_key
  owner_scope
  provider_id
  provider_account_id
  library_kind
  created_at
  updated_at

source_library_items
  library_ref_key
  source_ref_key
```

The source library is identified by `libraryRef`.
The source-library item is identified by `libraryRef + sourceRef`.
That item identity stays in source-library facts. It is not copied into
owner-catalog entry identity.

Source libraries are owner-scoped provider libraries:

```text
libraryRef.id = deterministic opaque hash(ownerScope, providerId, providerAccountId, libraryKind)
```

`owner_scope`, provider, account, and library kind remain facts of the source
library itself, not nullable fields scattered through owner catalog entries.
`source_library_items` does not repeat `owner_scope`; it inherits owner scope
through `library_ref_key`.

`provider_account_id` is required for persisted source libraries. A library
import request may omit provider account when the provider can resolve it from
login/session state, but the provider read result must resolve a stable safe
account id before Music Data Platform writes `source_libraries` or
`source_library_items`. Phase 8 must not introduce nullable, `default`, or
`unknown` provider-account placeholders.

### Entries Are Projection Facts

`owner_material_entries` is a projection table. It records why a material is
visible to an owner/workspace catalog.

It is not:

- a source-of-truth fact table;
- a text index;
- a query result table;
- a MaterialCard seed table;
- a place to store raw provider payloads;
- a place to duplicate full source, material, collection, or relation records.

In Phase 8, source-library entries are projected from current
`source_library_items` and current `source_material_bindings`.

`sourceRef` belongs to the source fact and source-to-material binding layers.
`owner_material_entries` is already material-facing: its identity is the owner,
the entry source, and the material.

For source-library entries:

```text
entry_kind = source_library
visibility_role = positive
active = 1
```

Phase 8 does not implement absent, removed, stale, historical, blocked audit,
or update-baseline entry behavior.

The `active` column is included for the generic projection model, but Phase 8
source-library projection does not create inactive source-library history rows
and does not infer absence from a partial provider import. Source-library
absence and reconciliation require a later complete import-baseline phase.

### Catalog View Is DB-Owned Aggregation

`owner_material_catalog_view` is the owner-visible material catalog read model
derived from entries and active material records.

It answers:

```text
Which active materials are currently visible in this owner/workspace catalog?
```

It is not a source-library report and not a presentation card surface.

The catalog view may expose catalog-level provenance summaries needed by later
query output basis, such as positive entry count and aggregated provenance JSON.
It must not expose source-library rows as if they were catalog source of truth.
It is the final visible catalog material summary, not the source for
pool-specific set algebra.

`owner_material_catalog_view.provenance_json` is retained as aggregated entry
provenance for later query basis and internal debugging. It is not a pool
filter, source-of-truth record, provider/account/library lookup surface, raw
provider payload container, or item-level source-ref list.

Phase 8 catalog rows stay generic. The SQL view should not introduce
kind-specific summary booleans such as `is_in_source_library`,
`is_in_collection`, `is_saved`, or `is_favorite`. Collection, relation, and
policy summaries belong to later phases when those fact families and policies
exist.

Phase 8 uses a SQL view for `owner_material_catalog_view`, not a materialized
catalog table. Entries are command-maintained; catalog aggregation belongs to
the database view.

### Entries Enable Pool Membership, Not Text Search

Entries support pool candidate construction:

```text
pool -> candidate material refs
```

They do not support text matching or ranking by themselves.

Examples:

- local catalog pool reads active rows from `owner_material_catalog_view`;
- source-library pool reads source-library entries and joins their source facts
  when filtering by provider account or library kind;
- future collection pool reads collection entries;
- future owner-relation pool reads relation entries.

`owner_material_entries` is the source for pool membership and future set
algebra. Source-library, collection, and owner-relation pools should produce
candidate material sets from entries first, including union, intersection,
difference, any/all/none, and anti-join style operations. Query then joins the
candidate material set to `owner_material_catalog_view` for final active
visible catalog material summaries.

`owner_material_catalog_view` must not become the place for pool-specific
filter dimensions such as provider account, source-library kind, collection
identity, or relation kind. Those dimensions belong to entry sources and their
fact tables.

Without entries, the query engine would need to understand every source fact
table directly. Phase 8 prevents that coupling by normalizing source-library
membership into the common owner catalog projection shape.

Text search, text documents, FTS tables, relevance scoring, and any/all/none
query planning remain later phases.

### Project-Wide Database Command Constraint

This constraint is project-wide, not Phase 8-specific:

All durable facts, projection writes, projection rebuilds, merge cleanup,
catalog maintenance, and complex database-owned read semantics must go through
the owning bounded context's database command or query-command boundary.

Allowed:

- SQL set-based database commands owned by the bounded context;
- transaction-scoped command objects;
- repository primitives called by commands;
- SQL views and read-model query commands for complex reads.

Forbidden:

- Stage Interface, provider/plugin code, query code, or services directly
  constructing durable or projection rows;
- row-by-row TypeScript projection construction loops;
- TypeScript `for` loops and `if` branches that implement database-owned set
  semantics;
- query code reading broad tables into memory to filter, sort, dedupe, merge,
  or page when the operation belongs in SQL;
- merge cleanup implemented by ad hoc downstream table patching outside the
  owning merge/projection command.

Phase 8 must promote this constraint into current authority docs before
implementation is considered complete.

## Projection Schema

### Owner Material Entries Table

Phase 8 should introduce a Music Data Platform schema contribution for owner
catalog projections:

The owner catalog projection schema should be a separate contribution named
`musicDataPlatformOwnerCatalogSchema`. Do not place `owner_material_entries` or
`owner_material_catalog_view` inside `musicDataPlatformSourceLibrarySchema`.
Source library is only the first producer; owner catalog projection is the
generic read model later shared by source-library, collection, and owner-relation
facts.

```sql
CREATE TABLE owner_material_entries (
  entry_key TEXT PRIMARY KEY,
  owner_scope TEXT NOT NULL,

  entry_kind TEXT NOT NULL,
  entry_ref_key TEXT NOT NULL,

  material_ref_key TEXT NOT NULL,

  visibility_role TEXT NOT NULL,
  active INTEGER NOT NULL,

  provenance_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  CHECK (entry_kind IN ('source_library', 'collection', 'owner_relation')),
  CHECK (visibility_role IN ('positive', 'blocked_audit', 'historical')),
  CHECK (active IN (0, 1)),

  UNIQUE(owner_scope, entry_kind, entry_ref_key, material_ref_key),
  FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
);
```

`entry_ref_key` identifies the owner-facing source of the projected entry:

```text
source_library -> source library ref key
collection     -> future collection ref key
owner_relation -> future owner-relation ref key
```

`entry_key` is a deterministic derived row key, not a second business identity:

```text
entry_key = "ome_" + stableDerivedKey(owner_scope, entry_kind, entry_ref_key, material_ref_key)
```

The canonical entry identity remains
`owner_scope + entry_kind + entry_ref_key + material_ref_key`, enforced by the
unique constraint. Projection commands must use the same deterministic key
derivation for idempotent rebuild/upsert behavior. The derivation does not have
to be a cryptographic hash as long as callers never treat `entry_key` as a
business identity or parse it for semantics.

For Phase 8, only `entry_kind = source_library` is produced. A source-library
entry uses:

```text
entry_ref_key = refKey(libraryRef)
material_ref_key = refKey(materialRef)
```

`entry_ref_key` selects the source library. `material_ref_key` selects the
material visible through that library. If multiple source-library items in the
same library bind to the same material, they project to one owner-material
entry.

`provenance_json` is compact projection provenance for later query basis and
debugging. It must not store raw provider payloads, full duplicated source
records, source-item identity as owner-entry identity, or source-library fact
columns such as provider id, provider account id, or library kind.

Suggested indexes:

```sql
CREATE INDEX owner_material_entries_owner_material_idx
ON owner_material_entries(owner_scope, material_ref_key, active, visibility_role);

CREATE INDEX owner_material_entries_kind_ref_idx
ON owner_material_entries(owner_scope, entry_kind, entry_ref_key, active);
```

Phase 8 may add source-library-specific indexes only when they are required by
the implemented source-library read command. Such indexes must not change the
core entry identity.

### Schema Contribution Order

Phase 8 relies on real foreign-key enforcement. SQLite initialization enables
foreign keys with `PRAGMA foreign_keys = ON`, so schema contributions must be
applied in dependency order:

```text
musicDataPlatformIdentitySchema
  -> musicDataPlatformSourceLibrarySchema
  -> musicDataPlatformOwnerCatalogSchema
```

Identity schema owns `source_records`, `material_records`, and
`source_material_bindings`. Source-library schema depends on those tables.
Owner catalog schema depends on source-library facts and `material_records`.
Tests should cover the default Music Data Platform schema ordering.

### Owner Material Catalog View

Phase 8 should introduce a SQL view:

```sql
CREATE VIEW owner_material_catalog_view AS
SELECT
  e.owner_scope,
  e.material_ref_key,
  COUNT(*) AS positive_entry_count,
  MAX(e.updated_at) AS updated_at,
  MAX(
    COALESCE(
      json_extract(e.provenance_json, '$.lastProviderAddedAt'),
      json_extract(e.provenance_json, '$.lastAddedAt'),
      e.created_at
    )
  ) AS recently_added_at,
  json_group_array(json(e.provenance_json)) AS provenance_json
FROM owner_material_entries e
JOIN material_records m
  ON m.ref_key = e.material_ref_key
WHERE e.active = 1
  AND e.visibility_role = 'positive'
  AND m.lifecycle_status = 'active'
GROUP BY e.owner_scope, e.material_ref_key;
```

The exact SQL can evolve during implementation, but the view must remain:

- grouped by `owner_scope` and material;
- derived from entries, not from source-library facts directly;
- filtered to active material records;
- read-only from caller perspective;
- free of source-library-item rows as catalog source-of-truth.
- free of kind-specific summary booleans such as `is_in_source_library`,
  `is_in_collection`, `is_saved`, or `is_favorite` in Phase 8.
- free of pool filtering semantics in `provenance_json`; query may use
  aggregated provenance to explain why a material is visible, not to decide
  whether a material belongs to a requested pool.

Phase 8 does not introduce `owner_material_signals`. Blocked, favorite, saved,
wrong-version, not-playable, bad-match, and memory-preference policy remain
future owner-relation/signal phases.

## Projection Commands

Phase 8 should introduce Music Data Platform-owned projection commands.

Suggested factory shape:

```ts
createOwnerCatalogProjectionCommands({
  db: MusicDatabaseTransactionContext;
  now: string;
})
```

`ownerScope` is command input, not factory environment. The factory should not
carry a default owner scope because projection commands may later operate on
explicit or multiple owner/library scopes.

Suggested command:

```ts
rebuildSourceLibraryEntries(input: {
  ownerScope: string;
  libraryRef: Ref;
}): OwnerCatalogProjectionSummary
```

`libraryRef` is the primary source-library identity for projection rebuild.
Provider id, provider account id, and library kind are source-library fact
fields and lookup/filter dimensions; they are not the primary rebuild command
identity. A caller that starts from provider/account/kind should first resolve
the matching `source_libraries.library_ref_key`, then call the rebuild command
with `libraryRef`.

The rebuild command must validate `ownerScope` against the `source_libraries`
row for `libraryRef`. Because `libraryRef.id` is opaque and must not be parsed,
the command should load the source-library row by `library_ref_key`, fail if it
does not exist, and fail if `source_libraries.owner_scope` differs from
`input.ownerScope`.

A missing `source_libraries` row for the requested `libraryRef` is a command
error, not an empty projection result. Returning an empty summary would hide a
bad caller identity or a missing source-library fact write.

An existing source library with zero `source_library_items` is valid. Rebuilding
that `libraryRef` scope succeeds, deletes obsolete source-library projection
rows for that scope, and returns a summary with zero source items, zero
projected entries, and the obsolete delete count.

Suggested internal summary shape:

```ts
type OwnerCatalogProjectionSummary = {
  sourceLibraryItemCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};
```

This summary is for Music Data Platform tests and internal diagnostics. It is
not a Stage Interface output shape.

`projectedEntryCount` means the final active owner-material entry count in the
rebuilt scope after replacement, not the number of rows inserted or updated by
SQL conflict handling. `obsoleteEntryDeleteCount` counts stale source-library
projection rows removed from that scope.

The command owns SQL set semantics. It should use SQL such as
`INSERT ... SELECT`, CTEs, `ON CONFLICT DO UPDATE`, and set-based cleanup where
cleanup is in scope.

The command must not:

- load all source-library rows into TypeScript and loop over them;
- branch per row in TypeScript to decide whether to insert an entry;
- construct projection rows in callers;
- write query, text, card, or presentation records.

In Phase 8, the source-library projection command should:

1. select current source-library item rows;
2. join their owning source libraries by `library_ref_key`;
3. verify that every selected source-library item has a current
   source-material binding;
4. join source-material bindings by `source_ref_key`;
5. join active material records by `material_ref_key`;
6. group or select distinct rows by owner scope, source library, and material;
7. produce one active positive entry per owner scope, source library, and
   material;
8. store compact provenance JSON sufficient to identify the source-library
   basis without making `sourceRef` part of the entry;
9. leave inactive source-library history/reconciliation out of scope;
10. leave collection and relation entry kinds untouched.

`rebuildSourceLibraryEntries(...)` replaces the selected source-library
projection scope from current facts. It must not merely append or upsert current
rows while leaving obsolete source-library projection rows behind. Within the
selected owner/libraryRef scope, the command should compute the current
distinct `(library_ref_key, material_ref_key)` set, upsert those active entries,
and delete obsolete source-library projection rows for that `libraryRef` that
no longer belong to the computed set.

This replacement behavior is projection refresh, not provider absence
reconciliation. It does not remove or mark absent `source_library_items`; it
only prevents stale material-level projection rows after source-material
bindings or material lifecycle state change.

Source-library items without a current source-material binding are invariant
violations. The projection command must fail rather than create entries with
null material refs, silently skip them, or expose item-level violation lists as
agent-facing output.

Library Import must not construct entries directly and must not synchronously
refresh owner catalog projections on the user-facing import path. Direct
synchronous rebuild would couple import latency to projection maintenance.
Tests and later background maintenance/orchestration code may call the
projection command explicitly and silently, but dirty-projection marking,
scheduling, and automatic rebuild policy require a separate discussion and
spec.

## Source-Library Producer Semantics

Source-library item facts remain source-of-truth.

Phase 8 treats current source-library facts as the positive input set for
catalog projection. It does not decide that an item is absent merely because a
provider page or batch did not return it.

A source-library item may be written only after its source has a material
binding or in the same transaction that creates that binding. `source_library_items`
does not represent raw provider observations, unmaterialized candidates, or
failed imports. Those remain in import bookkeeping or error handling, not
source-library facts.

Phase 8 source-library facts should be split into source libraries and items:

```text
source_libraries:
  library_ref_key
  owner_scope
  provider_id
  provider_account_id (required)
  library_kind
  created_at
  updated_at

source_library_items:
  library_ref_key
  source_ref_key
  added_at (required)
  provider_added_at (nullable)
  first_imported_at
  last_seen_at
```

`source_libraries.library_ref_key` is the primary row key, and
`(owner_scope, provider_id, provider_account_id, library_kind)` is the source
library fact identity. The schema must enforce both:

```sql
PRIMARY KEY(library_ref_key)
UNIQUE(owner_scope, provider_id, provider_account_id, library_kind)
```

`source_libraries.created_at` and `source_libraries.updated_at` record local
fact-row lifecycle. Import cursor, paging state, counters, completion reason,
and failure data remain in `source_library_import_batches`; they must not be
stored on `source_libraries`.

`source_library_items` is keyed by the library and source item identity:

```sql
PRIMARY KEY(library_ref_key, source_ref_key)
FOREIGN KEY(library_ref_key) REFERENCES source_libraries(library_ref_key)
FOREIGN KEY(source_ref_key) REFERENCES source_material_bindings(source_ref_key)
```

The item depends on a current source-material binding, not merely on a source
record. `source_material_bindings.source_ref_key` already points to
`source_records(ref_key)`, and the stronger foreign key prevents source-library
items from existing without material identity.

The `library_ref_key` and `source_ref_key` foreign keys should use the database
default restrict/no-action delete behavior. Do not add `ON DELETE CASCADE`:
deleting a source-material binding or source library must not silently delete
source-library facts. Future unbind or delete-library commands must explicitly
handle source-library facts and projection refresh.

The schema should also keep an index for source-oriented maintenance/debug
queries:

```sql
CREATE INDEX source_library_items_source_ref_key_idx
ON source_library_items(source_ref_key)
```

The existing Phase 7 source-library item business identity:

```text
owner_scope
provider_id
provider_account_id
library_kind
source_ref_key
```

is represented in Phase 8 by:

```text
source_libraries(owner_scope, provider_id, provider_account_id, library_kind)
source_library_items(library_ref_key, source_ref_key)
```

with `owner_scope` stored on `source_libraries`, not repeated on
`source_library_items`.

This split is a required Phase 8 schema rewrite, not a compatibility layer.
Current Phase 7 item identity
`(provider_id, provider_account_id, library_kind, source_ref_key)` must be
replaced by `source_libraries.library_ref_key` plus
`source_library_items(library_ref_key, source_ref_key)`. Do not keep the old
provider/account/library/item primary key as the canonical item identity.
Do not add migration or compatibility code for old local test data unless the
task explicitly asks for it.

Phase 8 does not move owner/provider/account/library fields into entries as
source-of-truth or duplicated projection JSON. Source-library detail commands
can read those fields by joining `owner_material_entries.entry_ref_key` to
`source_libraries.library_ref_key`.

`source_libraries` and `source_library_items` should have separate repository
surfaces because they represent different fact grains:

- `SourceLibraryRepository` owns source-library records keyed by
  `library_ref_key`;
- `SourceLibraryItemRepository` owns source-library membership records keyed by
  `library_ref_key + source_ref_key`;
- source-library commands coordinate writes across both repositories;
- projection commands read both repositories through database-owned queries and
  must not construct source-library rows.

Source-library import writes must occur in one database transaction and in this
dependency order:

1. run the existing Library Import identity write path for `SourceRecord`,
   `MaterialRecord` when needed by current identity policy, and
   `source_material_bindings`;
2. upsert `SourceLibrary`;
3. upsert `SourceLibraryItem`.

Phase 8 must not add a second material creation policy, direct material writes
outside identity commands, or a new get/create material command.

`SourceLibraryItem` cannot be written before the source-material binding exists
because its `source_ref_key` foreign key depends on
`source_material_bindings(source_ref_key)`.

Source-library import must use library-ref-based item repository operations.
Provider id, provider account id, and library kind are used to resolve or
upsert the `SourceLibrary`; after that, item lookup and upsert use
`(libraryRef, sourceRef)`. Do not keep provider/account/library/source as the
source-library item repository identity.

Source-library import batches should also align with owner/library identity.
`source_library_import_batches` should store:

```text
owner_scope TEXT NOT NULL
provider_id TEXT NOT NULL
provider_account_id TEXT NULL until resolved
library_kind TEXT NOT NULL
library_ref_key TEXT NULL until resolved
```

Batch start records `owner_scope`, usually `DEFAULT_OWNER_SCOPE`. When provider
read resolves `provider_account_id`, import creates or upserts the
`SourceLibrary`, stores `library_ref_key` on the batch, and uses that
`libraryRef` for subsequent item writes. `library_ref_key` may be null only
before provider account resolution; it must be present before any
`SourceLibraryItem` write.

For source-library provenance, entries may include compact JSON such as:

```json
{
  "kind": "source_library",
  "libraryRefKey": "source_library:saved_source_track:l_opaque",
  "sourceItemCount": 1,
  "firstAddedAt": "2026-06-08T06:02:00.000Z",
  "lastAddedAt": "2026-06-08T06:02:00.000Z",
  "firstProviderAddedAt": "2026-06-07T01:00:00.000Z",
  "lastProviderAddedAt": "2026-06-07T01:00:00.000Z",
  "lastSeenAt": "2026-06-08T06:05:00.000Z"
}
```

This provenance is projection/debug/query-basis data. It is not raw provider
payload, not the canonical source-library item record, not a duplicate
`source_libraries` record, and not a replacement for source-library item facts.
Item-level source refs remain in `source_library_items` and source-material
bindings.

`addedAt` and `providerAddedAt` keep the Phase 7 split:

- `addedAt` is MineMusic local membership creation time and must be present;
- `providerAddedAt` is the provider-side add/collect/follow timestamp when
  available and may be null.

Repeated imports of the same source-library item must preserve first-write
timestamps:

- insert sets `added_at = now` and `first_imported_at = now`;
- conflict update preserves existing `added_at`;
- conflict update preserves existing `first_imported_at`;
- `provider_added_at` may be inserted, filled in, or updated when the provider
  supplies a value;
- `last_seen_at` updates on every successful observation.

Because source-library entries are material-level projections, entry provenance
uses aggregate time names:

- `firstAddedAt` and `lastAddedAt` are `MIN(added_at)` and `MAX(added_at)` for
  source-library items in that library that bind to the entry material;
- `firstProviderAddedAt` and `lastProviderAddedAt` are
  `MIN(provider_added_at)` and `MAX(provider_added_at)` when provider-side
  timestamps are available;
- `lastSeenAt` is `MAX(last_seen_at)`.

The catalog view's `recently_added_at` should prefer `lastProviderAddedAt`,
then `lastAddedAt`, then the entry creation time.

`first_imported_at` is source-library import bookkeeping. It must not be used
for owner catalog provenance, query basis, or `recently_added_at`.

## Merge And Projection Maintenance

`owner_material_entries` stores `material_ref_key` as the catalog candidate
material key. Therefore material merge and binding moves must not leave entries
pointing at stale loser materials.

Phase 8 follows the audit requirement that material merge cannot corrupt the
owner catalog: after a loser material is merged into a winner, owner catalog
projection maintenance must ensure the loser does not remain as the durable
catalog candidate and the winner can inherit the loser source-library
visibility.

Phase 8 does not prescribe the exact merge orchestration API. The implementation
may use command-owned projection maintenance from the merge flow or a
projection-maintenance command called by later orchestration, as long as the
operation is SQL set-based and covered by tests.

No query or read path may lazily repair stale owner entries.

## Provided Ports

Phase 8 should provide:

- source-library repository support split by library facts and item facts;
- source-library import writes that upsert the source library before writing
  source-library items;
- `musicDataPlatformOwnerCatalogSchema`;
- `createOwnerCatalogProjectionCommands`;
- a narrow owner catalog read port for tests and later query phases.

The read port may expose:

```ts
listOwnerMaterialEntries(input: {
  ownerScope: string;
  entryKind?: "source_library" | "collection" | "owner_relation";
  entryRef?: Ref;
})

listOwnerCatalogMaterials(input: {
  ownerScope: string;
})
```

These outputs are internal Music Data Platform records. They are not
agent-facing DTOs and not Stage Interface output shapes.

The Phase 8 read port is for tests and later query implementation support. It
must not implement pool set algebra, source-library query planning, any/all/none
semantics, keyset pagination, text matching, or ranking. Those belong to the
MaterialCatalogQueryEngine phase.

Filtering `listOwnerMaterialEntries` by `entryRef` is allowed for testing and
internal inspection of a projection scope. For source-library entries,
`entryRef` is `libraryRef`. The read port should not accept provider id,
provider account id, or library kind filters; callers that need those dimensions
must resolve them through `source_libraries` first.

## Consumed Capabilities

Allowed reads:

- `source_libraries`;
- `source_library_items`;
- `source_material_bindings`;
- active `material_records`;
- current `source_records` only when provenance/debug output requires source
  labels;
- `refKey(...)` and shared contracts.

Allowed writes:

- `source_libraries` through source-library commands only;
- `source_library_items` through source-library commands only;
- `owner_material_entries` through projection commands only.

Allowed schema operations:

- create owner catalog projection table(s);
- create owner catalog SQL view(s);
- create indexes needed by Phase 8 read commands.

Forbidden writes:

- source records;
- source library items;
- material records;
- canonical records;
- collection facts;
- owner relation facts;
- owner signals;
- text documents or FTS tables;
- Stage Interface output rows;
- query result rows;
- MaterialCard or presentation data.

Forbidden imports:

- Music Data Platform -> Stage Interface;
- Music Data Platform -> Extension/provider implementations;
- Music Data Platform -> query/retrieval/presentation roots;
- Projection commands -> raw SQLite primitives;
- Stage Interface -> Music Data Platform projection row shapes.

## Guards And Tests

Phase 8 must add or update guards for:

- active-tree allowance of the owner catalog projection files;
- Music Data Platform still not importing SQLite primitives;
- Music Data Platform still not importing Stage Interface, Extension, query,
  retrieval, presentation, Memory, Music Experience, or Effect Boundary roots;
- `source_library_items` schema shape no longer contains `provider_id`,
  `provider_account_id`, or `library_kind`; those columns belong only to
  `source_libraries`;
- `source_libraries` enforces
  `UNIQUE(owner_scope, provider_id, provider_account_id, library_kind)`;
- Stage Interface not importing owner catalog projection row shapes;
- Stage Interface not exposing owner catalog projection rebuild tools or
  projection summaries;
- `owner_material_entries` cannot carry query score, rank, card seed,
  display links, raw provider payload, or Stage Interface output fields;
- projection writes are available only through the intended command boundary;
- `owner_material_catalog_view` is a SQL view, not an independently written
  source-of-truth table.

Behavior tests should cover:

- source-library import or fixture rows project into owner material entries;
- source-library items bound to the same material in the same library project
  to one active positive owner entry;
- source-library commands do not persist source-library items without
  source-material bindings;
- schema constraints prevent source-library items from referencing sources that
  have no current source-material binding;
- projection rebuild fails on fixture-level invariant violations where a
  source-library item lacks a current source-material binding;
- rebuilding a source-library scope removes obsolete material-level
  source-library entries that are no longer produced by current facts;
- source-library pool membership can be read by `libraryRef` through
  `owner_material_entries.entry_ref_key`;
- catalog view groups visible active entries by owner scope and material;
- inactive or merged material records do not appear in the catalog view;
- projection command is idempotent;
- repeated source-library imports keep catalog entries stable;
- material merge maintenance prevents merged loser materials from appearing in
  the catalog;
- material merge maintenance lets the winner inherit source-library visibility
  previously projected for the loser;
- item-level source refs remain in source-library item facts and
  source-material bindings, not owner-material entry identity.

## Documentation Updates

Phase 8 implementation should update:

- `docs/formal-rebuild/phase-8-owner-catalog-projection-foundation.md`;
- `docs/formal-rebuild/README.md`;
- `docs/music-data-platform/design.md`;
- `docs/music-data-platform/ports.md`;
- `docs/music-data-platform/progress.md`;
- `ARCHITECTURE.md`, if the project-wide database command constraint is not
  already explicit enough;
- `AGENTS.md`, if the project-wide command/query-command constraint needs to
  be made enforceable for future agents;
- `CURRENT_STATE.md`, `PROGRESS.md`, and `INDEX.md` through the state-sync
  gate after implementation.

Do not edit `CONTEXT.md` for Phase 8 unless the user explicitly requests a
stable glossary update.

The formal Phase 8 spec is not sufficient current authority after
implementation. `docs/music-data-platform/design.md` and
`docs/music-data-platform/ports.md` must be updated to reflect the implemented
source-library fact identity, owner catalog projection schema, commands, read
ports, and schema contribution ordering.

## Non-Goals

Phase 8 does not implement:

- compatibility migrations for old Phase 7 local source-library rows;
- dirty-projection marking, scheduling, automatic rebuild orchestration, or
  import-triggered projection refresh policy;
- user-facing synchronous projection refresh on the import path;
- background projection maintenance worker, scheduler, retry policy, or failure
  recovery loop;
- source-library delete commands, source unbind commands, or their lifecycle
  projection policies;
- public Stage Interface import, provider, query, or presentation tools;
- Stage Interface or agent-facing manual projection rebuild tools;
- CLI/manual projection rebuild scripts or maintenance entrypoints;
- source-library update baselines or absent-item reconciliation;
- collection tables, collection commands, or collection projection producers;
- owner-material relation tables, relation commands, or relation projection
  producers;
- owner registry, user accounts, provider-account mapping, or shared-library
  ownership;
- owner material signals;
- material text documents or FTS;
- MaterialCatalogQueryEngine;
- provider-search TEMP candidate relations;
- any/all/none pool query planning;
- query hit public output shape;
- query-to-present handoff;
- MaterialCard shape or presentation output;
- recommendation, radio, Memory, or Effect Boundary behavior.

## Acceptance

Phase 8 is acceptable when:

- source-library fact storage has been rewritten to `source_libraries` plus
  `source_library_items(library_ref_key, source_ref_key)`;
- `owner_material_entries` exists as a Music Data Platform projection table;
- `owner_material_catalog_view` exists as a SQL view;
- source-library items can be projected into entries through a Music Data
  Platform command;
- source-library items cannot be written or projected without current
  source-material bindings;
- the projection command is SQL set-based and not row-by-row TypeScript
  orchestration;
- catalog view rows appear for active source-backed materials imported through
  source library;
- catalog view rows are grouped by owner scope and material;
- source-library provider/account/kind details remain source-library
  provenance, and item-level source refs remain source-library facts/bindings;
- material merge cannot leave stale loser material entries in the catalog and
  must preserve source-library visibility on the winner;
- no Stage Interface, query, presentation, provider, Memory, Music Experience,
  or Effect Boundary dependency is introduced;
- tests and docs record that Phase 8 builds projection/read-model foundation
  only.

## Stopping Condition

Stop Phase 8 after owner catalog projection schema, commands, view, guards,
tests, and docs are implemented and verified.

Do not continue into text projection, local pool query, Stage Interface query
tools, collection/owner-relation facts, provider-search TEMP candidates,
presentation, or recommendation behavior in the same phase.
