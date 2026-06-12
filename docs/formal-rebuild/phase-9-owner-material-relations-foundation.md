# Phase 9 Owner Material Relations Foundation

> Status: Implemented Phase 9 spec
> Phase owner: Music Data Platform / Owner Relations
> Output type: Owner-material relation source-of-truth table, relation write/read
> commands, and owner-relation projection producer for the existing owner
> catalog view

Phase 9 establishes `owner_material_relations` as the current-state source of
truth for material-scope owner relation facts.

Phase 9 follows Phase 8 owner catalog projection. Phase 8 created generic
`owner_material_entries` and `owner_material_catalog_view`, with source-library
as the first projection producer. Phase 9 adds the owner-relation fact family as
the second producer and lets material-scope `blocked` affect ordinary catalog
visibility.

Phase 9 is not a query, presentation, ranking, feedback parsing, Memory,
Collection, source-library, or behavior-signal phase.

## Established Inputs

Before Phase 9, current formal state provides:

- `MusicDatabase` and schema contribution foundation;
- Music Data Platform identity records and write commands;
- `source_records`, `material_records`, `source_material_bindings`, and
  material merge behavior;
- source-library import persistence;
- `owner_material_entries` and `owner_material_catalog_view`;
- source-library projection commands;
- no `owner_material_relations` table;
- no owner-relation write commands;
- no Collection facts;
- no `owner_material_signals`;
- no MaterialCatalogQueryEngine;
- no query-to-present policy layer.

Formal architecture already requires:

- owner-scoped facts belong inside Music Data Platform;
- `MaterialEntity` remains owner-neutral;
- Collection is a user-named organizing container, not the source of truth for
  saved/favorite/blocked facts;
- owner catalog entries/views are projections/read models, not fact source of
  truth;
- durable facts and projection writes go through Music Data Platform database
  commands, not Stage Interface, provider code, query code, or row-by-row
  caller logic.

## Goal

Phase 9 must implement:

- `owner_material_relations` as a current-state fact table;
- deterministic owner relation fact refs, owner relation pool refs, and storage
  keys;
- narrow owner relation write/read commands;
- owner-relation positive entry projection for material-scope
  `saved/favorite`;
- ordinary catalog exclusion for active material-scope `blocked`;
- architecture and behavior tests that keep relation facts, catalog entries,
  signals, query, and presentation separate.

## Non-Goals

Phase 9 does not implement:

- `owner_material_signals`;
- reactions/signals such as `liked`, `disliked`, `skip_count`,
  `last_recommended_at`, `last_played_at`, freshness penalty, or policy summary;
- query planning, text search, ranking, any/all/none pool algebra, or local pool
  query tools;
- query output/hit shape or `MaterialCard`;
- query-to-present handoff, link replacement, playable-link policy, or final
  presentation filtering;
- natural-language feedback parsing;
- Music Experience presented-card events or feedback event binding;
- Memory adoption, Memory proposals, or `memory_preference`;
- wrong-version, not-playable, bad-match, feedback, or correction fact tables;
- Collection tables, commands, or collection projection producers;
- material merge maintenance for existing owner relation facts;
- event scope relation targets;
- version scope relation targets;
- link scope relation targets;
- source-scope relation targets;
- formal `VersionRef` or version identity graph;
- source-library item scope changes;
- dirty-projection scheduling, background workers, or automatic rebuild
  orchestration;
- public Stage Interface owner-relation tools.

## Confirmed Decisions

### Relation Facts Live In `owner_material_relations`

All Phase 9 owner relation facts are stored in:

```text
owner_material_relations
```

Do not create a feedback, correction, or source-problem fact table in Phase 9.

Do not store owner-relation facts in:

- `owner_material_entries`;
- `owner_material_catalog_view`;
- `source_library_items`;
- `source_material_bindings`;
- `MaterialEntity`;
- `SourceEntity`;
- `owner_material_signals`;
- Stage Interface DTOs.

`owner_material_entries` may contain rows derived from active positive
material-scope relations, but those rows remain projection rows. They are not
the relation fact source of truth.

### Current-State Table, Not Event Log

`owner_material_relations` is a current-state table.

It records whether a specific owner relation target is currently active,
removed, or archived. It is not an append-only event log and does not store
event evidence ids in Phase 9.

### Relation Status

Owner relation status values are:

```text
active
removed
archived
```

`archived` replaces the old `rejected` vocabulary for owner relations. Relation
status is relation lifecycle/adoption state only. It is not material lifecycle,
canonical status, identity confidence, availability, or presentation readiness.

### Relation Kinds

Phase 9 supports this relation vocabulary:

```text
saved
favorite
blocked
```

Phase 9 does not implement `memory_preference`.

Use explicit type names that preserve the material-scope boundary:

```ts
type OwnerMaterialRelationKind = "saved" | "favorite" | "blocked";
type OwnerRelationEntryKind = "saved" | "favorite";
```

Do not shorten the full fact vocabulary to `OwnerRelationKind`; that would hide
the Phase 9 material-scope constraint and invite future source/version/problem
facts into the same type.

### Scope Levels

Phase 9 supports only material-scope owner relations.

Phase 9 does not support source, event, version, or link scope.

Allowed material-scope relation kinds:

```text
material:
  saved
  favorite
  blocked
```

No other owner relation target scope or relation kind is valid in Phase 9.

### Material Scope Semantics

Material-scope relations target the whole material for one owner.

Examples:

```text
saved(material)    -> this material is saved by this owner
favorite(material) -> this material is a favorite of this owner
blocked(material)  -> this material must not appear in ordinary owner catalog
```

`favorite` does not imply `saved` at the write-model level. They are separate
owner relation facts. A product workflow that wants favorite to also save a
material must explicitly call the required commands or introduce a separate
workflow command; `recordOwnerMaterialRelation(favorite)` must not hide a
second saved write.

Only material-scope `blocked` is a hard ordinary-catalog exclusion in Phase 9.

`blocked` does not remove or archive `saved` or `favorite`. These are separate
facts. A blocked material can still have active saved/favorite relation rows,
but ordinary catalog visibility is suppressed while active material-scope
blocked exists. Removing blocked can reveal the material again if another
positive entry still exists or is rebuilt.

`liked` and `disliked` are not owner relations in Phase 9. They belong to a
future reactions/signals design.

### No Version Scope

Phase 9 does not introduce version-scope relation targets, `scopeVersionNote`,
formal `VersionRef`, version identity tables, or recording/work relation.

Wrong-version facts are not owner relations in Phase 9. They need a separate
problem/correction fact design later.

### No Link Scope

Phase 9 does not introduce link-scope relation targets.

Not-playable facts are not owner relations in Phase 9. If a later
playable-link policy needs link-level identity, that phase must introduce a
real link target instead of overloading relation scope.

### Material Validation

Material-scope relation writes must validate that `materialRef` points to an
active material record.

The material foreign key is not enough for this invariant because it cannot
check `material_records.lifecycle_status`. Relation write commands must read the
material record and verify `lifecycle_status = active`.

If `materialRef` points to a merged, archived, missing, or otherwise non-active
material record, the relation write command must fail. It must not automatically
follow `mergedIntoMaterialRef` or rewrite the target to a winner material. The
caller must resolve and pass the intended active material before writing the
relation fact.

Phase 9 does not migrate or merge existing owner relation facts when a material
merge occurs. That later maintenance path needs its own conflict policy for
cases such as loser/winner saved, favorite, or blocked facts. Phase 9 only
prevents new relation writes to non-active material targets.

### Relation Origin

The relation fact provenance field is named:

```text
origin
```

Do not name this field `source`.

`source` is already a provider/source-layer term in MineMusic. A relation field
named `source` is ambiguous with `SourceEntity`, `sourceRef`, and
source-library facts.

Allowed Phase 9 origin values:

```text
user_explicit
imported
system
```

`origin` means how the relation fact was produced, not which source entity it
targets.

`imported` is allowed as an origin value even though Phase 9 does not implement
relation import producers.

`recordOwnerMaterialRelation` must accept all Phase 9 origin values:
`user_explicit`, `imported`, and `system`. Allowing `imported` does not imply
that Phase 9 implements a source-library-to-relation import producer.

`system` is reserved for Music Data Platform-owned maintenance or system
decisions. It must not be used as an unknown/default fallback for provider
imports, user actions, or caller mistakes.

Owner relation write commands must require `origin` explicitly. Do not provide
an implicit default and do not add `unknown`.

### Relation Note

`note` is optional human/debug explanation for a relation fact.

It must not become:

- relation identity;
- version note;
- problem/correction reason;
- feedback text;
- query policy input;
- presentation copy.

`note` is stored only on `owner_material_relations`. It does not participate in
projection identity and must not be copied into
`owner_material_entries.provenance_json`.

`recordOwnerMaterialRelation` may replace `note` for the same deterministic
target. `removeOwnerMaterialRelation` must not replace `note`.

When record input omits `note`, the stored `note` must be set to `NULL`.
Omission means the current relation fact has no note; it does not preserve the
previous note.

When record input provides `note`, it must be a non-empty string. Empty notes
must be rejected instead of stored.

### Relation Identity

Phase 9 must not introduce random `recordId` fields.

Relation fact identity is deterministic over:

```text
ownerScope
refKey(materialRef)
relationKind
```

Phase 9 owner material relation fact refs use this namespace:

```text
owner_material_relation
```

The stored relation fact ref uses the project `Ref` shape, with a deterministic
id:

```ts
relationRef = {
  namespace: "owner_material_relation",
  kind: relationKind,
  id: `r_${sha256Hex24(ownerScope, refKey(materialRef), relationKind)}`,
}
```

The storage key is always `refKey(relationRef)`.

Do not parse semantics out of `relationRef.id`. The semantic columns remain
the source of truth for owner scope, material ref, and relation kind.

The validator must enforce:

- `namespace === "owner_material_relation"`;
- `kind` is one of `saved | favorite | blocked`;
- `id` is ref-safe and starts with `r_`.

`relationRef` identifies one current-state fact row. It must not be used as
`owner_material_entries.entry_ref_key`.

### Owner Relation Pool Identity

Owner-relation entries need an owner-facing projection source analogous to Phase
8 `libraryRef`.

For Phase 9 positive owner-relation entries, that source is an
`ownerRelationPoolRef`: one owner relation pool for one owner and one positive
relation kind.

Phase 9 supports owner relation pool refs for:

```text
saved
favorite
```

`blocked` is not projected as a positive owner-relation entry in Phase 9, so it
does not need an entry-producing pool ref in this phase.

Phase 9 must not create `owner_material_entries` rows for `blocked` relations at
all. This includes `visibility_role = blocked_audit`. Blocked is represented
only by `owner_material_relations` and affects ordinary catalog visibility only
through `owner_material_catalog_view` `NOT EXISTS` logic.

The owner relation pool ref uses the project `Ref` shape, with deterministic
identity over:

```text
ownerScope
relationKind
```

The helper input relation kind is the positive-entry relation kind, not the full
owner material relation kind:

```ts
type OwnerRelationEntryKind = "saved" | "favorite";
```

Phase 9 owner relation pool refs use this namespace:

```text
owner_material_relation_pool
```

Helper shape:

```ts
ownerRelationPoolRef = {
  namespace: "owner_material_relation_pool",
  kind: relationKind,
  id: `rp_${sha256Hex24(ownerScope, relationKind)}`,
}
```

Use the same hash length and style as Phase 8 `sourceLibraryRef` generation:
SHA-256 hex truncated to 24 characters, with a ref-specific prefix. Do not
introduce a second hash length or encoding in Phase 9.

Phase 9 must introduce or reuse an internal deterministic ref digest helper
shared by source-library refs, owner material relation refs, and owner relation
pool refs. The helper must preserve the existing Phase 8 behavior: join parts
with `\u0000`, SHA-256 hash the joined string, use hex digest, and truncate to
24 characters. Keep this helper inside Music Data Platform; do not expose
internal ref id generation through public contracts.

The storage key used by owner catalog entries is always:

```text
refKey(ownerRelationPoolRef)
```

Do not hand-roll raw strings such as `saved`, `favorite`, or
`owner_relation:saved` as `entry_ref_key`. Code must create and validate owner
relation pool refs through a Music Data Platform helper, the same way Phase 8
creates and validates `libraryRef`.

Phase 9 does not need a separate owner-relation-pool table. Unlike source
libraries, owner relation pools have no provider/account/library metadata; their
semantic dimensions are the existing `owner_scope` and relation kind.

Owner relation pool refs are derived helper identities, not persisted fact rows.
The implementation must add a Music Data Platform helper/validator analogous
to Phase 8 source-library ref helpers:

```text
createOwnerRelationPoolRef(ownerScope, relationKind)
assertOwnerRelationPoolRef(ref)
```

The validator must enforce:

- `namespace === "owner_material_relation_pool"`;
- `kind` is one of `saved | favorite`;
- `id` is ref-safe and starts with `rp_`.

Do not create `owner_relation_pools` or similar empty registry tables in Phase
9. If a later phase adds pool metadata or lifecycle, that phase can introduce a
real table with a concrete owner.

### Owner Catalog Entries Remain Material-Facing

Phase 9 does not add material-internal scope fields to
`owner_material_entries`.

`owner_material_entries` remains the material-facing catalog projection shape
from Phase 8:

```text
owner_scope
entry_kind
entry_ref_key
material_ref_key
visibility_role
active
provenance_json
```

For source-library entries, source refs remain in source-library facts and
source-material bindings.

Phase 9 owner-relation entries do not carry source, version, event, link, or
feedback target fields.

## Schema

Phase 9 must add a Music Data Platform schema contribution for owner relations
and insert it into the Music Data Platform schema contribution order.

Contribution id:

```text
music_data_platform.owner_relations_v1
```

Schema contribution order:

```text
musicDataPlatformIdentitySchema
  -> musicDataPlatformSourceLibrarySchema
  -> musicDataPlatformOwnerCatalogEntriesSchema
  -> musicDataPlatformOwnerRelationSchema
  -> musicDataPlatformOwnerCatalogViewSchema
```

Phase 9 implementation must split the existing owner catalog schema
contribution if it still creates both `owner_material_entries` and
`owner_material_catalog_view`. Do not leave this as technical debt.

The entries table and catalog view must have separate schema contributions.
Tables are created first; the final read view is created last after all tables
it reads exist.

Do not keep `musicDataPlatformOwnerCatalogSchema` as a compatibility aggregate
alias that hides the split. Phase 9 must update the composition root and tests
to use the explicit schema contributions directly:

```text
musicDataPlatformOwnerCatalogEntriesSchema
musicDataPlatformOwnerRelationSchema
musicDataPlatformOwnerCatalogViewSchema
```

Phase 9 must remove the old `musicDataPlatformOwnerCatalogSchema` export. All
runtime and test schema arrays that previously used that aggregate contribution
must list the explicit schema contributions in order:

```text
musicDataPlatformIdentitySchema
musicDataPlatformSourceLibrarySchema
musicDataPlatformOwnerCatalogEntriesSchema
musicDataPlatformOwnerRelationSchema
musicDataPlatformOwnerCatalogViewSchema
```

This schema split does not require renaming the projection command factory.
`createOwnerCatalogProjectionCommands(...)` may remain the command group for all
owner catalog entry producers.

`owner_material_catalog_view` remains owned by Owner Catalog Projection, not
Owner Relations. Owner Relations owns `owner_material_relations`; Owner Catalog
Projection owns the final SQL view that reads entries, material records, and
active material-scope blocked relation facts.

Do not implement Phase 9 by having the owner relation schema drop and recreate
a view owned by another schema contribution. That would make schema ownership
and initialization order implicit and fragile.

Do not rewrite the Phase 8 spec's historical view SQL merely to make it look
like Phase 9. Phase 8 records the view shape delivered in that phase. Phase 9
implementation must update current Music Data Platform design and port docs to
describe the final relation-aware catalog view.

### Owner Material Relations Table

Table shape:

```sql
CREATE TABLE IF NOT EXISTS owner_material_relations (
  relation_ref_key TEXT PRIMARY KEY,
  relation_ref_json TEXT NOT NULL,

  owner_scope TEXT NOT NULL,
  material_ref_key TEXT NOT NULL,
  material_ref_json TEXT NOT NULL,

  relation_kind TEXT NOT NULL,

  origin TEXT NOT NULL,
  status TEXT NOT NULL,

  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  CHECK (relation_kind IN (
    'saved',
    'favorite',
    'blocked'
  )),
  CHECK (origin IN ('user_explicit', 'imported', 'system')),
  CHECK (status IN ('active', 'removed', 'archived')),
  FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
);
```

`relation_ref_json` and `material_ref_json` store the complete project `Ref`
values for round-trip reads. They are not separate identity axes.

Write commands must assert:

```text
relation_ref_key == refKey(relationRef)
material_ref_key == refKey(materialRef)
```

Read commands must parse the JSON fields to return `Ref` values and assert that
`refKey(parsedRef)` matches the stored key. Code must not parse
`relation_ref_key` or `material_ref_key` strings to reconstruct refs.

Do not add SQLite `json_valid(...)` checks in Phase 9. Existing Music Data
Platform JSON columns use `TEXT` plus command-side serialization and read-side
parsing. Owner relation ref JSON must follow that project pattern.

Do not add foreign keys between `owner_material_relations` and
`owner_material_entries`. Relations are source-of-truth facts; entries are
derived projections. Owner-relation entries use `entry_ref_key =
refKey(ownerRelationPoolRef)`, not `relation_ref_key`, so a relation-to-entry FK
would encode the wrong identity.

Indexes:

```sql
CREATE INDEX IF NOT EXISTS owner_material_relations_owner_material_kind_status_idx
ON owner_material_relations(owner_scope, material_ref_key, relation_kind, status);

CREATE INDEX IF NOT EXISTS owner_material_relations_kind_status_material_idx
ON owner_material_relations(owner_scope, relation_kind, status, material_ref_key);

CREATE UNIQUE INDEX IF NOT EXISTS owner_material_relations_target_unique_idx
ON owner_material_relations(
  owner_scope,
  material_ref_key,
  relation_kind
);
```

The unique target index is defensive. The deterministic `relation_ref_key`
must already be derived from the same identity.
This index is a semantic invariant guard, not a second identity axis. It catches
bugs where code would otherwise create two different ref keys for the same
owner/material/relation kind target.

Do not add repair or recovery logic for inconsistent relation keys in Phase 9.
If persisted `relation_ref_key` and semantic target uniqueness ever disagree,
let the command or database constraint fail so the invariant break is visible.

### Catalog View Update

Phase 9 must update `owner_material_catalog_view` so ordinary catalog rows
exclude active material-scope blocked relations.

The view schema contribution must follow the existing drop-and-recreate view
pattern:

```sql
DROP VIEW IF EXISTS owner_material_catalog_view;

CREATE VIEW owner_material_catalog_view AS
SELECT
  e.owner_scope,
  e.material_ref_key,
  COUNT(*) AS positive_entry_count,
  MAX(e.updated_at) AS updated_at,
  COALESCE(
    MAX(
      CASE
        WHEN json_extract(e.provenance_json, '$.lastProviderAddedAt') IS NOT NULL
        THEN json_extract(e.provenance_json, '$.lastProviderAddedAt')
      END
    ),
    MAX(
      CASE
        WHEN json_extract(e.provenance_json, '$.lastAddedAt') IS NOT NULL
        THEN json_extract(e.provenance_json, '$.lastAddedAt')
      END
    ),
    MAX(
      CASE
        WHEN json_extract(e.provenance_json, '$.lastRelationUpdatedAt') IS NOT NULL
        THEN json_extract(e.provenance_json, '$.lastRelationUpdatedAt')
      END
    ),
    MAX(e.created_at)
  ) AS recently_added_at,
  json_group_array(json(e.provenance_json)) AS provenance_json
FROM owner_material_entries e
JOIN material_records m
  ON m.ref_key = e.material_ref_key
WHERE e.active = 1
  AND e.visibility_role = 'positive'
  AND m.lifecycle_status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM owner_material_relations r
    WHERE r.owner_scope = e.owner_scope
      AND r.material_ref_key = e.material_ref_key
      AND r.relation_kind = 'blocked'
      AND r.status = 'active'
  )
GROUP BY e.owner_scope, e.material_ref_key;
```

The view must not exclude:

- archived or removed relations.

`recently_added_at` preserves Phase 8 source-library ordering first. Owner
relation entries must contribute `lastRelationUpdatedAt`; the view uses that
value only when source-library provenance does not provide provider/library
added time.

`provenance_json` continues to aggregate all active positive entry provenance
rows for the visible material. If a material is visible through both a
source-library entry and an owner-relation entry, the view must retain both
provenance objects instead of choosing one primary reason.

### No Owner Material Signals

Phase 9 must not add `owner_material_signals`.

Signals are future policy/behavior summaries such as:

```text
is_disliked
skip_count
last_recommended_at
last_played_at
freshness_penalty
policy_summary
```

Signals are not the source of truth for owner relation facts. They are not
required for Phase 9 blocked catalog exclusion because the catalog view can read
active material-scope blocked relations directly.

## Commands And Ports

Phase 9 must add owner-relation commands inside Music Data Platform.

Write factory:

```ts
createOwnerMaterialRelationCommands({
  db: MusicDatabaseTransactionContext;
  now: string;
})
```

Command names:

```ts
recordOwnerMaterialRelation(input): OwnerMaterialRelationRecord
removeOwnerMaterialRelation(input): OwnerMaterialRelationRecord
```

Read and write factories must stay separate:

```ts
createOwnerMaterialRelationRecords({
  db: MusicDatabaseContext;
})
```

The write factory needs transaction context and `now`. The read factory must
not receive write capability.

Phase 9 does not expose a public `archiveOwnerMaterialRelation` command.
`archived` remains a valid relation status for future imported, inferred,
system, or review/adoption workflows, but Phase 9 only needs explicit record
and remove behavior.

Phase 9 command layer must not create archived rows. Archived rows may only be
observed, reactivated, or removed if they already exist through fixtures, future
migrations, or future commands.

Phase 9 still defines how existing archived rows behave:

- `listOwnerMaterialRelations` may return archived rows only when `status: "archived"` is
  requested explicitly;
- `recordOwnerMaterialRelation` reactivates an archived row;
- `removeOwnerMaterialRelation` may mark an archived row removed.

The implementation may factor status changes through a shared internal helper,
but public command names must stay explicit about write intent.

Internal relation command/read records must include both full refs and storage
keys:

```ts
type OwnerMaterialRelationRecord = {
  relationRef: Ref;
  relationRefKey: string;
  ownerScope: string;
  materialRef: Ref;
  materialRefKey: string;
  relationKind: OwnerMaterialRelationKind;
  origin: OwnerMaterialRelationOrigin;
  status: OwnerMaterialRelationStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};
```

This is an internal Music Data Platform record shape. It is not a Stage
Interface DTO and must not be returned directly to agents.

When `note` is stored as `NULL`, record mapping must omit the optional `note`
field instead of returning `note: null` or `note: undefined`.

### Record Command

`recordOwnerMaterialRelation` writes or reactivates the deterministic current
relation target.

If the target row already exists with `status = removed` or `status = archived`,
`recordOwnerMaterialRelation` reactivates that same row. It must not create a
second relation row or preserve the inactive row as history.

Input:

```ts
type RecordOwnerMaterialRelationInput = {
  ownerScope: string;
  materialRef: Ref;
  relationKind: OwnerMaterialRelationKind;
  origin: OwnerMaterialRelationOrigin;
  note?: string;
};
```

Record input must not include `status`. `recordOwnerMaterialRelation` always
writes the deterministic target to `status = active`.

The command must:

- validate owner scope;
- validate material ref;
- validate material record exists and is active;
- validate relation kind;
- validate explicit `origin`;
- derive `relationRef`;
- upsert the relation row by deterministic `relation_ref_key`;
- set `status = active`;
- preserve `created_at` for an existing row and update `updated_at`;
- replace current-state fields such as `origin` and `note` with the new input
  when reactivating or rewriting the same deterministic target;
- keep JSON fields compact and internal.

The normal upsert conflict target is `relation_ref_key`. Do not handle
`UNIQUE(owner_scope, material_ref_key, relation_kind)` as a recovery/update path;
that semantic unique constraint is an invariant guard and must fail loudly if
it ever disagrees with the deterministic ref key.

### Remove Command

`removeOwnerMaterialRelation` marks the deterministic relation target removed.

This command accepts the same deterministic target input used by
`recordOwnerMaterialRelation`:

```ts
type RemoveOwnerMaterialRelationInput = {
  ownerScope: string;
  materialRef: Ref;
  relationKind: OwnerMaterialRelationKind;
};
```

Remove input must not include `origin`, `note`, `relationRef`, or `status`.

They do not accept `relationRef` as public command input. `relationRef` is a
derived row identity, not the business meaning of the relation command. The
command computes the deterministic relation ref key internally and updates that
row.

Remove commands must not delete rows. Phase 9 is current-state, not
history-free, but the row remains useful for provenance and idempotence.

`removeOwnerMaterialRelation` is not a silent upsert. If the deterministic
target row does not exist, the command must fail with a Music Data Platform
command error. A missing row usually means the caller supplied the wrong owner,
material, or relation kind.

This is an internal command invariant. Future user-facing Stage Interface tools
may translate missing relation removal into a user-friendly no-op, but they must
not change the Music Data Platform command semantics.

Remove only sets `status = removed` and updates `updated_at` when an existing
target row is active or archived. It does not replace `origin` or `note`; those
fields describe the current or last active relation fact, not a removal event.

If the target row already has `status = removed`, remove is idempotent and
returns the existing row without changing `updated_at`, `origin`, or `note`.

### Relation Projection Command

Phase 9 must extend owner catalog projection commands with an owner-relation
producer.

`rebuildOwnerRelationEntries` belongs to the Owner Catalog Projection command
group, not to the Owner Relations fact command factory. It writes
`owner_material_entries`, so it must be exposed from
`createOwnerCatalogProjectionCommands(...)` alongside
`rebuildSourceLibraryEntries(...)`.

Owner relation fact commands do not automatically rebuild owner catalog
entries. Phase 9 keeps fact writes and projection maintenance as separate
database commands:

```text
record/remove owner relation
  -> writes owner_material_relations

rebuildOwnerRelationEntries
  -> writes owner_material_entries for positive material-scope relations
```

This preserves the Phase 8 projection-maintenance boundary and leaves dirty
projection scheduling, background refresh, and batch orchestration to later
phases.

Material-scope `blocked` catalog exclusion does not require positive-entry
rebuild because `owner_material_catalog_view` directly excludes active blocked
relations. `saved/favorite` visibility through owner-relation entries requires
an explicit owner-relation projection rebuild.

Removing `saved` or `favorite` only marks the relation row removed. It does not
directly delete `owner_material_entries`; obsolete positive owner-relation
entries are cleaned up by `rebuildOwnerRelationEntries`.

Projection staleness is acceptable between a positive relation fact write and a
projection rebuild. For example, a material may already be visible through a
source-library entry while a newly recorded `saved` relation exists only in
`owner_material_relations`; its `saved` owner-relation entry and related
provenance appear only after `rebuildOwnerRelationEntries`.

Command:

```ts
rebuildOwnerRelationEntries(input: {
  ownerScope: string;
  relationKind?: "saved" | "favorite";
  materialRef?: Ref;
}): OwnerRelationEntryProjectionSummary
```

`ownerScope` is required. `relationKind` narrows the relation pool; when absent,
the command rebuilds both positive owner relation pools for that owner.
`materialRef` narrows the material target:

```text
relationKind present -> rebuild one owner relation pool
relationKind absent  -> rebuild saved and favorite pools
materialRef present  -> rebuild owner-relation entries for one owner/material
materialRef absent   -> rebuild owner-relation entries for the selected owner scope
```

`rebuildOwnerRelationEntries` must not apply the write-command active-material
precondition to its rebuild scope. Projection rebuild computes the current
projectable entry set from active positive relation facts joined to active
material records. If a selected relation fact points at a merged, archived,
missing, or otherwise non-active material, it produces no entry and any obsolete
owner-relation entry in that rebuild scope is cleaned up.

This does not repair or remap the relation fact. Material-merge maintenance for
existing owner relation facts remains out of scope for Phase 9.

`relationKind` input is a positive-entry relation kind, not the full
`OwnerMaterialRelationKind`. The TypeScript type and runtime validation must
reject `blocked`; returning an empty projection summary for `blocked` would hide
a caller error.

All modes remain database-owned set operations. Callers must not read relation
rows and construct projection rows themselves.

The command derives owner relation pool refs from `ownerScope` and selected
positive relation kind values. Callers must not pass `entry_ref_key` directly.
Callers also must not pass `relationRef`; relation refs identify fact rows, not
projection scopes.

This command writes `owner_material_entries` only for active material-scope
positive relations:

```text
saved
favorite
```

Projection shape:

```text
entry_key = "ome_" + lower(hex(owner_scope || "|" || entry_kind || "|" || entry_ref_key || "|" || material_ref_key))
entry_kind = owner_relation
entry_ref_key = refKey(ownerRelationPoolRef)
material_ref_key = material_ref_key
visibility_role = positive
active = 1
```

Owner-relation entries must use the Phase 8 owner-material entry identity:

```text
owner_scope + entry_kind + entry_ref_key + material_ref_key
```

Upserts must target the existing owner-material entry unique constraint:

```text
ON CONFLICT(owner_scope, entry_kind, entry_ref_key, material_ref_key)
```

Projection upsert must preserve `created_at` for an existing entry and update
`updated_at`, matching the existing source-library entry projection behavior.

Do not introduce entry kinds such as `owner_relation_saved` or
`owner_relation_favorite`. `entry_kind` remains the producer family and
`entry_ref_key` selects the specific pool, matching the Phase 8 source-library
entry model.

Owner-relation entry provenance must stay compact and projection-oriented.
Provenance shape:

```json
{
  "kind": "owner_relation",
  "relationKind": "saved",
  "ownerRelationPoolRefKey": "owner_material_relation_pool:saved:rp_...",
  "relationFactCount": 1,
  "lastRelationUpdatedAt": "2026-06-12T00:00:00.000Z"
}
```

Do not copy full relation facts into entry provenance. In particular,
`provenance_json` must not contain:

- `relation_ref_json`;
- `material_ref_json`;
- `note`;
- `origin`;
- full relation rows;
- problem, feedback, version, source, event, or link target fields.

The command must remove obsolete `owner_relation` positive entries that are no
longer produced by active positive relation facts in the selected owner, pool,
and optional material rebuild scope.

When `materialRef` is present, cleanup must be limited to the selected owner,
selected positive relation pool(s), and that material. It must not delete or
rewrite other owner-relation entries for the same owner. When `materialRef` is
absent, cleanup covers the selected owner and selected positive relation pool(s).

The command must derive `selectedPoolRefKeys` before cleanup:

```text
relationKind present -> [refKey(createOwnerRelationPoolRef(ownerScope, relationKind))]
relationKind absent  -> saved and favorite pool ref keys for ownerScope
```

Cleanup SQL must constrain deletes to the selected owner-relation projection
scope:

```sql
entry_kind = 'owner_relation'
AND owner_scope = ?
AND entry_ref_key IN (...)
AND (:material_ref_key IS NULL OR material_ref_key = :material_ref_key)
```

Cleanup must not touch:

```text
entry_kind = source_library
entry_kind = collection
```

Do not project these relation kinds into positive entries:

```text
blocked
```

Do not create `historical` owner-relation entries for removed or archived
`saved/favorite` relation facts in Phase 9. Removed or archived positive
relations must produce no owner-relation entry after rebuild.

Phase 9 must rename the existing source-library projection summary type before
adding owner-relation projection:

```ts
rebuildSourceLibraryEntries(...): SourceLibraryEntryProjectionSummary

type SourceLibraryEntryProjectionSummary = {
  sourceLibraryItemCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};
```

`OwnerCatalogProjectionCommands` may remain the command group name because it
owns all owner catalog entry producers. Producer summaries must be specific.

Owner-relation projection must use its own internal summary:

```ts
type OwnerRelationEntryProjectionSummary = {
  relationFactCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};
```

`relationFactCount` is the number of active positive relation facts in the
selected rebuild scope before active-material filtering. `projectedEntryCount`
is the final active `owner_relation` positive entry count in that scope after
replacement. `obsoleteEntryDeleteCount` counts stale owner-relation projection
rows removed from that scope.

All summary counts are scoped to the actual rebuild selection: owner scope,
selected positive relation pool or pools, and optional material. When
`relationKind` is absent and `materialRef` is present, saved and favorite are
both in scope for that one material.

Do not rewrite the Phase 8 historical spec solely to rename
`OwnerCatalogProjectionSummary`. Phase 9 implementation must update current
code, tests, and current design/port docs to use producer-specific summary
names.

### Read Port

Phase 9 must add an internal read port for tests and later policy/query phases.

Read port:

```ts
getOwnerMaterialRelation(input: {
  ownerScope: string;
  materialRef: Ref;
  relationKind: OwnerMaterialRelationKind;
}): OwnerMaterialRelationRecord | undefined

listOwnerMaterialRelations(input: {
  ownerScope: string;
  materialRef?: Ref;
  relationKinds?: readonly OwnerMaterialRelationKind[];
  status?: OwnerMaterialRelationStatus;
}): readonly OwnerMaterialRelationRecord[]
```

Do not add `hasOwnerMaterialRelation` in Phase 9. A `has` shortcut would hide
status handling and can easily turn into policy logic. Callers that need a
single target must use `getOwnerMaterialRelation` and inspect the returned
record.

`getOwnerMaterialRelation` returns the deterministic target row regardless of
status when it exists. It may return `active`, `removed`, or `archived` records,
or `undefined` when no row exists.

These records are internal Music Data Platform records. They are not
agent-facing DTOs and not Stage Interface output shapes.

When `status` is omitted, the read command returns active relation facts only.
Removed or archived relation facts require an explicit `status` filter.
Phase 9 does not add `statuses[]`; the status filter is a single status value.

When `relationKinds` is omitted, the read command does not filter by relation
kind. When provided, it must be non-empty. Empty `relationKinds` arrays are
command errors.

Phase 9 does not add `materialRefs[]` batch reads. The internal read port may
read one material or one owner scope. Batch policy checks and query-time material
sets belong to later policy/query read models, not this foundation fact port.

Phase 9 read ports must not implement:

- query planning;
- source candidate filtering;
- origin-based pool filtering;
- playable-link replacement;
- ranking;
- feedback text interpretation;
- Memory summarization;
- presentation shaping.

## Consumed Capabilities

Owned bounded contexts:

```text
Music Data Platform / Owner Relations
Music Data Platform / Owner Catalog Projection
```

Owner Relations owns the fact table, relation fact refs, relation pool refs, and
relation write/read commands. Owner Catalog Projection owns
`owner_material_entries`, owner-relation entry rebuild, and the final
relation-aware `owner_material_catalog_view`.

Allowed reads:

- `material_records`;
- `owner_material_relations`;
- `owner_material_entries` for projection cleanup and tests;
- `owner_material_catalog_view` for catalog visibility tests;
- `refKey(...)` and shared `Ref` contracts.

Allowed writes:

- `owner_material_relations` through owner-relation commands only;
- `owner_material_entries` through owner catalog projection commands only;
- SQL view recreation for `owner_material_catalog_view`.

Forbidden writes:

- `source_records`;
- `source_library_items`;
- `source_libraries`;
- `material_records`;
- `canonical_records`;
- identity binding facts;
- Collection facts;
- `owner_material_signals`;
- text documents or FTS tables;
- query result rows;
- Stage Interface DTOs or `MaterialCard` output.

Forbidden imports:

- Music Data Platform -> Stage Interface;
- Music Data Platform -> Extension/provider implementations;
- Music Data Platform -> query/retrieval/presentation roots;
- Music Data Platform -> Memory;
- Music Data Platform -> Music Experience;
- Music Data Platform -> Effect Boundary;
- Stage Interface -> owner relation record shapes;
- provider/plugin code -> owner relation commands.
- Extension/provider/plugin modules -> owner material relation command modules.

## Guards And Tests

Phase 9 must add or update guards for:

- active-tree allowance of owner relation files only in the intended Music Data
  Platform area;
- Music Data Platform still not importing SQLite primitives directly;
- Music Data Platform still not importing Stage Interface, Extension,
  Retrieval, presentation, Memory, Music Experience, or Effect Boundary roots;
- Stage Interface not importing owner relation record shapes;
- Stage Interface not importing the owner material relation records module or
  `OwnerMaterialRelationRecord`;
- Extension/provider/plugin modules not importing owner material relation command
  modules;
- owner relation writes are available only through the intended command
  boundary;
- `owner_material_relations` schema has no `scope_level`, source-scope,
  event-scope, version-scope, or link-scope target columns;
- owner relation write commands accept `materialRef` only and expose no generic
  scope selector;
- `owner_material_relations` schema rejects `memory_preference`;
- `owner_material_relations.status` rejects `rejected`;
- no `owner_material_signals` table is introduced in Phase 9;
- `owner_material_entries` still cannot carry source, version, event, link, or
  feedback target fields.

Behavior tests must cover:

- material-scope `saved` and `favorite` can be recorded;
- recording `favorite` does not implicitly record `saved`;
- recording requires explicit `origin` and does not accept `status`;
- `origin = imported` succeeds, omitted origin fails, unknown origin fails, and
  `system` succeeds only when explicitly passed;
- recording a removed or archived relation reactivates the same deterministic
  row and preserves `created_at`;
- recording `saved` or `favorite` writes relation facts but does not
  implicitly create owner-relation entries before projection rebuild;
- material-scope `saved` and `favorite` project to positive
  `owner_relation` entries;
- positive owner-relation entries use `refKey(ownerRelationPoolRef)` as
  `entry_ref_key`, not the per-material `relation_ref_key`;
- multiple saved materials for the same owner share the same saved
  owner-relation pool `entry_ref_key`;
- owner catalog entry reads can filter saved/favorite relation pools through the
  owner relation pool ref;
- removing a positive relation removes its positive owner entry after rebuild;
- remove fails when the deterministic relation target row does not exist;
- remove is idempotent when the deterministic row already has `status =
  removed` and does not change `updated_at`, `origin`, or `note`;
- removed or archived `saved/favorite` relation facts do not create
  `historical` owner-relation entries in Phase 9;
- owner-relation rebuild skips relation facts whose target material is no longer
  active, cleans obsolete entries in scope, and does not remap or repair the
  relation fact;
- material-scope `blocked` can be recorded;
- recording material-scope `blocked` does not remove or archive existing
  `saved` or `favorite` relation rows;
- active material-scope `blocked` excludes the material from
  `owner_material_catalog_view` without owner-relation entry rebuild;
- removed or archived material-scope `blocked` does not exclude the material;
- removing material-scope `blocked` restores catalog visibility without
  owner-relation entry rebuild when another active positive entry exists;
- unsupported relation kinds fail and command inputs expose no generic scope
  selector;
- `getOwnerMaterialRelation` returns existing active, removed, or archived rows,
  while `listOwnerMaterialRelations` defaults to active rows only;
- after removing a saved relation, `getOwnerMaterialRelation` returns the
  removed row, `listOwnerMaterialRelations` without `status` excludes it, and
  `listOwnerMaterialRelations` with `status = removed` returns it;
- relation key derivation is deterministic and idempotent;
- commands preserve `created_at` and update `updated_at` on repeated writes;
- relation record mapping omits `note` when the stored value is `NULL`;
- relation entry provenance exact shape stays compact and does not copy full
  relation facts, including `origin`, `note`, relation refs, or material refs;
- catalog view `recently_added_at` can use `lastRelationUpdatedAt` when
  source-library added-time provenance is absent;
- when the same material has source-library and owner-relation positive entries,
  catalog view `provenance_json` retains both provenance objects and
  `recently_added_at` prefers source-library provider/library added time over
  owner-relation `lastRelationUpdatedAt`;
- owner-relation projection cleanup only deletes selected `owner_relation`
  entries and does not touch `source_library` or `collection` entries;
- command SQL is set-based for projection rebuild and not caller-owned
  row-by-row merge logic.

## Implementation Groups

Phase 9 may be implemented in one PR, but the PR description and review plan
must keep two logical groups separate.

Group 9A: Owner relation facts.

```text
owner relation ref digest/helper
owner_material_relations schema
owner relation records read port
record/remove owner relation commands
tests for deterministic refs, status, origin, note, and active-material validation
```

Group 9B: Owner relation projection and blocked catalog exclusion.

```text
split owner catalog schema into entries and view contributions
owner relation pool ref helper
rebuildOwnerRelationEntries
owner_material_catalog_view NOT EXISTS active blocked relation
projection cleanup tests
mixed source-library + owner-relation catalog view tests
current docs and state/progress updates
```

## Documentation Updates

Phase 9 specification work must update:

- `docs/formal-rebuild/phase-9-owner-material-relations-foundation.md`;
- `docs/formal-rebuild/README.md`;
- `INDEX.md`;
- `docs/formal-project-glossary.md` for stable status vocabulary.

Phase 9 implementation must update:

- `docs/music-data-platform/design.md`;
- `docs/music-data-platform/ports.md`;
- `docs/music-data-platform/progress.md`;
- documented schema contribution names and order, including
  `musicDataPlatformOwnerCatalogEntriesSchema`,
  `musicDataPlatformOwnerRelationSchema`, and
  `musicDataPlatformOwnerCatalogViewSchema`;
- `CURRENT_STATE.md`;
- `PROGRESS.md`;
- `ARCHITECTURE.md` only if the current owner relation boundary is not already
  explicit enough.

Do not edit `CONTEXT.md` for Phase 9 unless the user explicitly requests a
stable glossary refresh.

## Acceptance

Phase 9 is acceptable when:

- `owner_material_relations` exists as a Music Data Platform fact table;
- relation refs are deterministic and use `refKey(ref)`;
- `owner_material_relations.status` uses `active | removed | archived`;
- relation writes support the Phase 9 material-scope relation vocabulary;
- material-scope relation writes validate active material records;
- source scope, event scope, version scope, link scope, `VersionRef`,
  `memory_preference`, wrong-version, not-playable, bad-match, feedback, and
  correction fact tables are not introduced;
- material-scope `saved/favorite` project to positive owner entries;
- material-scope `blocked` excludes ordinary catalog visibility;
- `owner_material_signals` is not introduced;
- no Stage Interface, provider, query, presentation, Memory, Music Experience,
  or Effect Boundary dependency is introduced;
- tests and docs prove relation facts, catalog projection, and future policy
  behavior remain separate.

## Stopping Condition

Stop Phase 9 after owner relation schema, deterministic refs, write/read
commands, owner-relation positive entry projection, material-scope blocked
catalog exclusion, guards, tests, and docs are implemented and verified.

Do not continue into query, presentation, correction/problem facts, behavior
signals, Memory, Collection, text projection, playable-link policy, feedback
event binding, or Stage Interface tools in the same phase.
