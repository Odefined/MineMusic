# Music Data Platform Design

> Status: Current design authority for implemented Phase 8
> Scope: Identity write model, source-library import, and owner catalog projection foundation
> Not status ledger: Current implementation state lives in `progress.md`.

Music Data Platform owns source/material/canonical identity records, current
source-to-material binding facts, and the source-library import persistence
foundation that lets later phases move from provider account-library
observations to MineMusic source-backed material anchors. It also owns the
first owner catalog projection/read-model foundation built from those durable
facts.

## Core Concepts

| Concept | Meaning | Current Rule |
| --- | --- | --- |
| `SourceRecord` | Storage record for normalized provider/source facts. | Keyed by `refKey(entity.sourceRef)`; provider identity lookup is stable. |
| `MaterialRecord` | Storage record for MineMusic material identity. | Keyed by `refKey(entity.materialRef)`; `sourceRefs` are maintained by binding/merge commands only. |
| `CanonicalRecord` | Storage record for canonical identity authority. | Keyed by `refKey(entity.canonicalRef)`; canonical merge workflow is out of scope. |
| `source_material_bindings` | Current source-to-material truth/index. | One current binding per source; no status/history/evidence/kind fields. |
| `SourceLibrary` | Current known provider-account library scope. | Keyed by `refKey(libraryRef)` with owner/provider/account/library uniqueness. |
| `SourceLibraryItem` | Current known membership inside one source library. | Keyed by `libraryRef + sourceRefKey`; no material/canonical/query/card fields. |
| Source-library import batch | Durable run boundary for account-library paging and counts. | One provider/library kind per batch; start and continue only. |
| Source-library item outcome | Per-candidate outcome within an import batch. | `imported`, `already_present`, or `failed`; compact error only for failed items. |
| Source-library ref | Formal identity of one source library. | `source_library:<kind>:l_<opaque>` derived from owner/provider/account/library identity. |
| `owner_material_entries` | Owner catalog projection row. | One row per `owner_scope + entry_kind + entry_ref_key + material_ref_key`; not source-of-truth. |
| `owner_material_catalog_view` | Owner catalog SQL read model. | Aggregates active positive entries by owner/material for later query phases. |
| Material ref factory | Shared factory for new MineMusic material refs. | Produces opaque `material:<kind>:m_<opaque>` refs; import code must not derive ids from source/provider/canonical text. |
| Material-canonical binding | Current material-to-canonical confirmation. | Stored on `MaterialEntity.canonicalRef`; written only by `bindMaterialToCanonical` or unambiguous material merge inheritance. |
| Identity write command | Internal write boundary for invariant-preserving mutations. | Created with transaction-scoped `db` and caller-supplied `now`. |
| Identity repository | Low-level persistence port. | Created with `db`; does not start transactions or enforce multi-table workflows. |

## Identity Keys

Phase 5 does not use `recordId`.

Record keys are derived from entity refs:

```text
SourceRecord    -> refKey(entity.sourceRef)
MaterialRecord  -> refKey(entity.materialRef)
CanonicalRecord -> refKey(entity.canonicalRef)
```

Database tables use `ref_key` columns for persisted `refKey(...)` values. A
`ref_key` is not a second identity axis.

Phase 5 repositories and commands do not generate source/material/canonical
refs. Upstream provider normalization, materialization, or canonical
maintenance code supplies refs; Phase 5 validates and persists them.

Phase 7/8 Library Import creates new source-backed material refs only through the
shared material ref factory. The generated id is opaque and does not encode
provider id, account id, source ref, provider entity id, canonical identity, or
human-readable source text. Import idempotency comes from existing
`source_material_bindings`, not from deriving a material id from the source.

## Source Records

`SourceRecord` stores full `SourceEntity` snapshots as `entity_json` plus
lookup columns:

```text
ref_key
provider_id
provider_entity_id
kind
entity_json
created_at
updated_at
```

`provider_id + provider_entity_id + kind` is unique and stable. Ordinary source
upsert rejects attempts to remap one provider identity to a different
`sourceRef`, or one existing `sourceRef` to a different provider identity.
The source ref namespace must be exactly `source_${providerId}`, and
`providerId` must be ref-safe because it participates in that namespace.

## Material Records And Bindings

`MaterialRecord` stores full `MaterialEntity` snapshots as `entity_json` plus
indexed identity columns:

```text
ref_key
kind
lifecycle_status
identity_status
canonical_ref_key
primary_source_ref_key
merged_into_material_ref_key
entity_json
created_at
updated_at
```

`MaterialEntity.sourceRefs` is persisted, but it is not the only source
binding truth. The current source-to-material truth is:

```text
source_material_bindings(source_ref_key, material_ref_key, created_at, updated_at)
```

Binding rows contain current state only. They do not contain status, history,
evidence, confidence, reason, audit fields, or binding kind. `created_at` and
`updated_at` are current-row maintenance timestamps, not an audit model.

`bindSourceToMaterial` is the only Phase 5 command that changes an ordinary
source binding. It keeps `source_material_bindings` and
`MaterialEntity.sourceRefs` synchronized. `upsertMaterialRecord` does not
accept a full `MaterialEntity` and cannot directly replace `sourceRefs`.
It also cannot write `identityStatus`, `lifecycleStatus`, or `canonicalRef`.
`identityStatus` is derived from current canonical/source anchors.
Material-to-canonical confirmation uses `bindMaterialToCanonical`.

`primarySourceRef` may be set or cleared by material upsert, bind, or merge
commands, but any non-empty primary source must already be bound to that
material.

## Canonical Records

`CanonicalRecord` stores full `CanonicalEntity` snapshots as `entity_json` plus
record-only status/evidence columns:

```text
ref_key
kind
status
merged_into_canonical_ref_key
entity_json
facts_json
created_at
updated_at
```

`upsertCanonicalRecord` may persist `active`, `provisional`, and `archived`
records. It cannot create a `merged` canonical record or convert a merged
canonical record back to a non-merged status. Repositories may round-trip
`merged` records for canonical maintenance, but Phase 5 does not implement a
canonical merge command, canonical review/apply workflow, or canonical split
workflow. Ordinary canonical upsert cannot make a canonical record non-active
while an active material owns that canonical ref, and non-merged canonical
records cannot carry `mergedIntoCanonicalRef`.

Direct source-to-canonical binding tables are out of Phase 5. Source-to-
canonical relation, when needed, is derived from:

```text
source_material_bindings -> material_records.entity.canonicalRef
```

Phase 5 does not add a separate material-canonical binding table. The current
material-to-canonical confirmation is `MaterialEntity.canonicalRef` on
`material_records`, and only `bindMaterialToCanonical` or an unambiguous
material merge may write it. Binding requires an active canonical record and
one active material per canonical ref.

## Commands

Commands are created with a transaction-scoped database context and a
caller-supplied timestamp:

```ts
const commands = createIdentityWriteCommands({ db, now });
```

Implemented commands:

```text
upsertSourceRecord
upsertMaterialRecord
upsertCanonicalRecord
bindSourceToMaterial
bindMaterialToCanonical
mergeMaterialRecord
```

Commands may return full internal records. Agent-facing tools must not return
storage records directly; Stage Interface must project command results through
its own output boundary if these commands become tool-backed later.

Commands throw `MusicDataPlatformError` for Music Data Platform-owned
invariant violations. They do not return Stage Interface `Result<T>`.

Commands reject ordinary identity writes to merged or archived material
records. Merged material records are redirect snapshots, not active write
targets.

## Source Library Import

Source library import turns normalized provider account-library observations
into durable local source pool facts.

The provider-facing input is `PlatformLibraryCandidate`, which carries a full
normalized `SourceEntity`, a `PlatformLibraryKind`, optional
`providerAccountId`, and optional provider add timestamp. Music Data Platform
does not parse raw provider payloads.

Persisted source library items represent current known membership only:

```text
library_ref_key
source_ref_key
added_at
provider_added_at?
first_imported_at
last_seen_at
```

Phase 8 splits current source-library facts into:

```text
source_libraries(
  library_ref_key,
  owner_scope,
  provider_id,
  provider_account_id,
  library_kind,
  created_at,
  updated_at
)

source_library_items(
  library_ref_key,
  source_ref_key,
  added_at,
  provider_added_at?,
  first_imported_at,
  last_seen_at
)
```

`libraryRef` is derived from owner/provider/account/library identity and is the
formal identity of the source library itself. Item rows no longer duplicate
provider id, provider account id, or library kind.

`added_at` is MineMusic's local source-library membership time: it is set when
the membership is first written locally and preserved on later imports.
`provider_added_at` is the provider-side add, collect, or follow timestamp when
the provider exposes one. It is separate from `added_at` because provider
membership time and MineMusic import time can differ. `first_imported_at` and
`last_seen_at` remain import bookkeeping timestamps.

`SourceLibraryItem` does not store `material_ref_key`, `canonical_ref_key`,
display fields, query text, rank, projection data, or card seed data. Material
refs are obtained through `source_material_bindings` or later projections.

One import batch handles exactly one `PlatformLibraryKind`:

```text
saved_source_track
saved_source_album
followed_source_artist
```

Batch statuses are `running`, `completed`, and `failed`. Completion reasons
are `provider_exhausted` and `max_new_items_reached`. Phase 8 supports
`startImport` and `continueImport` only; it does not support cancel, pause,
resume, retry, update baseline, or removed-from-library reconciliation.

`limit` is a per-call processing limit and must stay within the provider-read
contract range of 1 through 100. `maxNewItems` is an optional batch-level stop
condition that counts only newly created source-library memberships with
outcome `imported`. `already_present` and `failed` outcomes do not count toward
`maxNewItems`.

For each candidate, Library Import writes in an item-scoped transaction:

1. upsert the candidate `SourceRecord`;
2. look up existing source-material binding;
3. create a source-backed `MaterialRecord` through the material ref factory
   only when no binding exists;
4. bind the source ref to the material ref through `bindSourceToMaterial`;
5. upsert the source library item;
6. record the item outcome.

Per-item write failure rolls back only that candidate transaction, records a
compact failed outcome, increments the failed count, and continues. Provider,
page, account, cursor, or batch-scope failures mark the batch failed.

Import batches persist `ownerScope` from the beginning and store
`providerAccountId + libraryRef` once the provider account is resolved. Import
creates or upserts the `SourceLibrary` before item writes and then uses
`(libraryRef, sourceRefKey)` as the source-library item identity.

Before item writes, the service validates that the provider page belongs to the
batch provider id, batch library kind, resolved provider account, and expected
`source_<providerId>` source namespace. A direct `PlatformLibraryReadPort`
implementation is not trusted as storage-ready merely because it has the right
TypeScript shape.

Real provider-account library persistence requires a resolved non-empty,
ref-safe `providerAccountId`. `startImport` may omit it only when the
provider/API can resolve the current logged-in account in the first provider
read. Later reads for the same batch must return the same account id.

Library Import reuses the existing identity write path:

1. upsert `SourceRecord`;
2. reuse current `source_material_bindings` when present;
3. create `MaterialRecord` only when no binding exists;
4. bind source to material through `bindSourceToMaterial`;
5. upsert `SourceLibrary` / `SourceLibraryItem`;
6. record import outcome.

Phase 8 does not introduce a second material creation policy, direct material
row construction inside import callers, or synchronous owner catalog projection
refresh on the import path.

## Owner Catalog Projection Foundation

Phase 8 introduces the first internal owner catalog projection/read-model
foundation.

Projection source-of-truth remains:

```text
source_libraries
source_library_items
source_material_bindings
material_records
```

Projection output is:

```text
owner_material_entries
owner_material_catalog_view
```

`owner_material_entries` stores one row per owner-facing source and material:

```text
owner_scope
entry_kind
entry_ref_key
material_ref_key
visibility_role
active
provenance_json
```

For Phase 8, only `entry_kind = source_library` is produced. If multiple
source-library items in the same source library bind to the same material, they
collapse into one owner-material entry with compact provenance.

`owner_material_catalog_view` is a SQL read model over active positive entries.
It groups by `owner_scope + material_ref_key`, tracks `positive_entry_count`,
prefers provider-added timestamps when deriving `recently_added_at`, and keeps
aggregated provenance for internal query/debug follow-up.

Projection rebuild is command-owned. `rebuildSourceLibraryEntries` validates
`ownerScope`, validates `libraryRef`, fails on missing source-library scope or
owner mismatch, fails when source-library items somehow exist without current
bindings, rebuilds one source-library scope through SQL set operations, and
deletes obsolete owner-entry rows after source rebind or material merge.

Callers do not construct projection rows themselves. Projection maintenance is
not public Stage Interface behavior in Phase 8, and import does not
synchronously rebuild the projection.

## Material Merge

`mergeMaterialRecord(loser, winner)` is identity-level only.

It:

- marks loser `lifecycleStatus = "merged"`;
- sets loser `mergedIntoMaterialRef = winner.materialRef`;
- keeps loser entity fields as a merge-time snapshot;
- moves current source-material bindings to winner;
- merges/de-duplicates winner `sourceRefs`;
- does not automatically inherit loser `primarySourceRef`;
- may inherit an unambiguous loser `canonicalRef`;
- rejects conflicting winner/loser canonical refs.

Merge requires active material records with the same material kind. If merge
inherits a canonical ref, that canonical record must be active and must not be
owned by a non-participant active material.

Material merge does not merge canonical records, update owner facts, update
collections, rewrite projections, or touch presentation history.

## Out Of Scope

- owner facts;
- Collection membership;
- public Stage Interface import tools;
- update baselines and removed-from-library reconciliation;
- local pool query, text/FTS query, and query result shaping;
- Collection / owner-relation source-of-truth writes and additional owner
  catalog producers;
- query/retrieval/ranking;
- provider execution or provider config;
- Stage Interface tools or public DTOs;
- dirty-projection marking, scheduling, or automatic rebuild orchestration;
- canonical review/merge/split workflow;
- direct source-canonical evidence model;
- command audit;
- provider login, OAuth, cookie refresh, or reauth.
