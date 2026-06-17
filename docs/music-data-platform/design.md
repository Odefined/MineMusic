# Music Data Platform Design

> Status: Current design authority through implemented Phase 18A
> Scope: Identity write model, source-library import, owner material relation foundation, owner catalog projection, material text projection, projection maintenance core, retrieval read port, mixed retrieval result-set/cache workspace, and the Library Import stage-adapter skeleton
> Not status ledger: Current implementation state lives in `progress.md`.

Music Data Platform owns source/material/canonical identity records, current
source-to-material binding facts, and the source-library import persistence
foundation that lets later phases move from provider account-library
observations to MineMusic source-backed material anchors. It also owns
material-scope owner relation facts, the internal owner catalog
projection/read-model foundation, the owner-neutral material text
projection/FTS foundation built from those durable facts, and the
projection-maintenance target table/runner that tracks explicit rebuild work
for current projections. Phases 12A and 12B add the first query-ready
Music Data Platform retrieval read port for owner-visible catalog search, SQL
pool algebra, text-aware ranking, keyset pagination, and coarse freshness
reads. Phase 15B adds the runtime retrieval result-set and material-candidate
cache foundation. Phase 15C/15D use that foundation through a Music Data
Platform mixed retrieval workspace that owns SQL ranking, pagination, resolved
source candidate collapse, runtime result-set rows, and material-candidate
cache writes. Phase 18A adds the Music Data Platform `stage_adapter` home for
agent-facing Library Import runtime contributions; it contributes no
`library.import.*` tools until the later Phase 18 slices.

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
| `owner_material_relations` | Current-state material-scope owner relation facts. | One row per `ownerScope + materialRef + relationKind`; Phase 9 supports `saved`, `favorite`, and `blocked` only. |
| Owner material relation ref | Deterministic current relation fact identity. | `owner_material_relation:<kind>:r_<opaque>` derived from owner scope, material ref key, and relation kind. |
| Owner relation pool ref | Deterministic positive owner-relation projection scope. | `owner_material_relation_pool:<kind>:rp_<opaque>` derived from owner scope and positive relation kind. |
| `owner_material_entries` | Owner catalog projection row. | One row per `owner_scope + entry_kind + entry_ref_key + material_ref_key`; not source-of-truth. |
| `owner_material_catalog_view` | Owner catalog SQL read model. | Aggregates active positive entries by owner/material and excludes active material-scope blocked facts. |
| `material_text_documents` | Current material-centered text document projection. | One row per active material ref; built only from current material/bound-source/confirmed-canonical facts. |
| `material_text_fts` | SQLite FTS read model for projected material text. | Indexes `title/artist/album/version/alias` only; `search_text` remains a non-FTS stored projection column. |
| Retrieval read port | Query-ready read boundary over owner catalog/material text/projection freshness. | Phase 12A/12B support owner-visible pool filtering, kind filtering, `stable` / `recently_added` / `text_relevance` ordering, SQL keyset pagination, matched pool/text evidence, and coarse freshness. |
| `materialCandidateRef` | Runtime material-facing handle for an unresolved provider candidate. | `material_candidate:provider_candidate:<opaque>` derived from `digest(refKey(sourceEntity.sourceRef))`; not durable material identity and not a source ref. |
| `retrieval_result_sets` | Runtime mixed retrieval result-set header. | Stores query fingerprint, local result window metadata, and TTL; it does not store Stage Interface output. |
| `retrieval_result_rows` | Runtime mixed retrieval row table. | Stores durable material rows and unresolved material-candidate rows for SQL ranking/pagination. |
| `retrieval_result_text_fts` | Result-set-scoped FTS corpus. | Uses durable `material_text_documents` fields for material rows and provider candidate text only for unresolved material-candidate rows. |
| `material_candidate_cache` | Runtime cache for validated provider material candidates. | Keyed by `material_candidate_ref_key`; cleanup never deletes a candidate still referenced by a non-expired result set. |
| Mixed retrieval workspace | Music Data Platform boundary for mixed local/provider retrieval. | Builds first-page result sets from local result windows plus provider candidates, reuses result sets on cursor pages, and owns runtime result-set/cache writes. |
| Library Import stage adapter | MDP-owned Stage Adapter boundary for the future `library.import.*` public tool surface. | Phase 18A contributes an empty `library-import` RuntimeModule only; tool descriptors and handlers land in later Phase 18 slices. |
| `projection_maintenance_targets` | Current projection maintenance worklist. | One row per `projection_kind + target_key`; `status` is `dirty` or `failed` and `dirty_generation` is monotonic. |
| Material ref factory | Shared factory for new MineMusic material refs. | Produces opaque `material:<kind>:m_<opaque>` refs; import code must not derive ids from source/provider/canonical text. |
| Material-canonical binding | Current material-to-canonical confirmation. | Stored on `MaterialEntity.canonicalRef`; written only by `bindMaterialToCanonical` or unambiguous material merge inheritance. |
| Identity write command | Internal write boundary for invariant-preserving mutations. | Created with transaction-scoped `db` and caller-supplied `now`. |
| Identity repository | Low-level persistence port. | Created with `db`; does not start transactions or enforce multi-table workflows. |
| Projection maintenance runner | Internal rebuild dispatcher for explicit pending targets. | Reads one pending batch, rebuilds each target in its own transaction, then marks clean or failed by generation. |

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
const commands = createIdentityWriteCommands({
  db,
  now,
  projectionInvalidationCommands,
});
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
  first_imported_at
)
```

`libraryRef` is derived from owner/provider/account/library identity and is the
formal identity of the source library itself. Item rows no longer duplicate
provider id, provider account id, or library kind.

`added_at` is MineMusic's local source-library membership time: it is set when
the membership is first written locally and preserved on later imports.
`provider_added_at` is the provider-side add, collect, or follow timestamp when
the provider exposes one. It is separate from `added_at` because provider
membership time and MineMusic import time can differ. `first_imported_at`
remains import bookkeeping time. Phase 11 no longer stores a repeated
observation timestamp such as `last_seen_at`.

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
resume, retry, or update baseline tables.

`limit` is a per-call processing limit and must stay within the provider-read
contract range of 1 through 100. `maxNewItems` is an optional batch-level stop
condition that counts only newly created source-library memberships with
outcome `imported`. `already_present` and `failed` outcomes do not count toward
`maxNewItems`.

For each candidate, Library Import coordinates an item-scoped transaction
through owning commands:

1. create the top-level write facade through
   `createMusicDataPlatformSourceOfTruthWriteCommands({ db, now })`;
2. upsert the candidate `SourceRecord` through `writes.identity`;
3. look up existing source-material binding;
4. create a source-backed `MaterialRecord` through the material ref factory
   and `writes.identity` only when no binding exists;
5. bind the source ref to the material ref through
   `writes.identity.bindSourceToMaterial`;
6. upsert the source library item through `writes.sourceLibrary`;
7. record the item outcome through `writes.sourceLibrary`.

The Library Import service is workflow orchestration, not the write boundary.
It may use narrow read ports and command factories, but it must not construct
source-library or identity repositories directly.

Per-item write failure rolls back only that candidate transaction, records a
compact failed outcome, increments the failed count, and continues. Provider,
page, account, cursor, or batch-scope failures mark the batch failed.

Import batches persist `ownerScope` from the beginning and store
`providerAccountId + libraryRef` once the provider account is resolved. Import
creates or upserts the `SourceLibrary` before item writes and then uses
`(libraryRef, sourceRefKey)` as the source-library item identity.

`recordImportItem(...)` validates that the provided `materialRef` still matches
the current `source_material_bindings` row for the same `sourceRef`. The
command must not persist source-library bookkeeping against a material ref that
has already drifted from the current binding.

Before item writes, the service validates that the provider page belongs to the
batch provider id, batch library kind, resolved provider account, and expected
`source_<providerId>` source namespace. A direct `PlatformLibraryReadPort`
implementation is not trusted as storage-ready merely because it has the right
TypeScript shape.

Real provider-account library persistence requires a resolved non-empty,
ref-safe `providerAccountId`. `startImport` may omit it only when the
provider/API can resolve the current logged-in account in the first provider
read. Later reads for the same batch must return the same account id.

Library Import reuses the existing top-level source-of-truth write facade:

1. upsert `SourceRecord`;
2. reuse current `source_material_bindings` when present;
3. create `MaterialRecord` only when no binding exists;
4. bind source to material through `bindSourceToMaterial`;
5. upsert `SourceLibrary` / `SourceLibraryItem`;
6. record import outcome.

The workflow-facing facade currently accepts only `DEFAULT_OWNER_SCOPE` on
owner-scoped write methods. For source-library methods that take a batch
record, the facade re-reads the persisted batch by `batchId` and delegates
with that persisted row instead of trusting caller-supplied batch fields.
Lower-level source-library and owner-relation commands still keep explicit
`ownerScope` because the formal storage and projection model are owner-scoped,
but Phase 11 does not support arbitrary workflow-facing owner fanout yet.

When `completeImportBatch(...)` finishes a batch with
`completionReason = provider_exhausted`, a resolved `libraryRef`, and
`failedCount = 0`, source-library commands reconcile current membership for
that library by deleting `source_library_items` rows whose `source_ref_key`
was not successfully observed in the completed batch. Successful observation
means an item outcome of `imported` or `already_present`. The command then
invalidates `owner_catalog_source_library(ownerScope, libraryRef)` through the
typed projection invalidation seam. Failed batches, partial scans, and
`max_new_items_reached` batches never delete current memberships.

Phase 8 does not introduce a second material creation policy, direct material
row construction inside import callers, or synchronous owner catalog projection
refresh on the import path.

## Owner Material Relations

Phase 9 adds material-scope owner relation facts as a current-state write/read
foundation.

Fact storage is:

```text
owner_material_relations
```

Phase 9 supports only:

```text
saved
favorite
blocked
```

Each fact row stores deterministic relation identity, owner scope, material
ref, relation kind, explicit origin, current status, optional note, and
timestamps. Relation status is `active | removed | archived`.

`recordOwnerMaterialRelation(...)` and `removeOwnerMaterialRelation(...)` are
Music Data Platform write commands over `MusicDatabaseTransactionContext`.
They validate explicit owner scope, deterministic relation target, and active
material target. They do not write `material_records`, source-library facts,
Collection facts, query rows, or Stage Interface DTOs.

`favorite` does not implicitly create `saved`. `blocked` does not archive or
remove `saved` or `favorite`. These are separate current-state facts.

Phase 9 read records are internal only:

```text
getOwnerMaterialRelation(...)
listOwnerMaterialRelations(...)
```

`getOwnerMaterialRelation` returns the deterministic row regardless of status.
`listOwnerMaterialRelations` defaults to active rows only; removed or archived
facts require an explicit single-status filter.

## Owner Catalog Projection Foundation

Phase 8 introduced the first internal owner catalog projection/read-model
foundation. Phase 9 extends that foundation with owner-relation projection and
blocked catalog exclusion.

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

Current producers are:

```text
source_library
owner_relation
```

Source-library entries collapse multiple items in the same library/material
scope into one owner-material entry with compact provenance. Owner-relation
entries collapse one positive relation pool and one material into one
projection row. `blocked` is not projected to `owner_material_entries`.

`owner_material_catalog_view` is a SQL read model over active positive entries.
It groups by `owner_scope + material_ref_key`, tracks `positive_entry_count`,
prefers source-library provider/library timestamps over owner-relation
timestamps when deriving `recently_added_at`, excludes active material-scope
blocked facts through `NOT EXISTS`, and keeps aggregated provenance for
internal query/debug follow-up.

Projection rebuild is command-owned.
`rebuildSourceLibraryEntriesForLibrary` validates `ownerScope`, validates
`libraryRef`, fails on missing source-library scope or owner mismatch, fails
when source-library items somehow exist without current bindings, and rebuilds
one source-library scope through SQL set operations.
`rebuildSourceLibraryEntriesForMaterial` replaces only the source-library rows
for one owner/material scope, which is the repair path after source rebind or
material merge.

`rebuildOwnerRelationEntries` replaces positive `saved` and `favorite`
owner-relation rows for one owner/material scope through SQL set operations,
stores compact owner-relation provenance, and never deletes `source_library`
rows.

Callers do not construct projection rows themselves. Projection maintenance is
not public Stage Interface behavior, and ordinary owner relation writes do not
implicitly rebuild the projection.

## Material Text Projection

Phase 10 adds an owner-neutral material-centered text projection/read-model
foundation for later Music Intelligence retrieval.

Projection source-of-truth is:

```text
material_records
source_material_bindings
source_records
canonical_records (confirmed active canonical only)
```

Projection output is:

```text
material_text_documents
material_text_fts
```

`material_text_documents` keeps one current document per active material:

```text
material_ref_key
material_kind
title_text
artist_text
album_text
version_text
alias_text
search_text
document_json
updated_at
```

`material_text_fts` indexes only:

```text
material_ref_key
title_text
artist_text
album_text
version_text
alias_text
```

`search_text` is stored on the document row for internal inspection and later
consumption, but Phase 10 does not index it in FTS.

Text projection derives only from current durable facts:

- `MaterialEntity.versionInfo`;
- current `source_material_bindings -> source_records`;
- current `MaterialEntity.primarySourceRef` only as a label for an already
  bound source contribution;
- current `CanonicalRecord` only when the material is
  `identityStatus = canonical_confirmed`, has `canonicalRef`, and that
  canonical record is `status = active`.

`MaterialEntity.sourceRefs` is not authoritative input for projection rebuild.
Current bound source truth comes from `source_material_bindings`.

`document_json` is current projection debug structure only. It stores compact
field contribution arrays in fixed key order:

```text
title
artist
album
version
alias
```

Contribution objects are normalized searchable values only:

```text
source
basis
value
```

Phase 10 rebuild is command-owned:

```text
createMaterialTextProjectionCommands({ db, now })
  -> rebuildMaterialTextDocument({ materialRef })
  -> rebuildMaterialTextDocuments({ materialRefs })
```

Missing or non-active materials delete current projection rows. Active
materials always rebuild one current document row, even when every text field
is empty; the command also replaces the single FTS row for that material.

Phase 10 reads are internal only:

```text
createMaterialTextProjectionRecords({ db })
  -> getMaterialTextDocument({ materialRef })
  -> matchMaterialTextDocuments({ text, limit? })
```

`matchMaterialTextDocuments` is an owner-neutral strict conjunctive plain-text
FTS probe over projected material text. It does not implement owner catalog
pool logic, provider candidate search, query-hit shaping, ranking, or
presentation output.

## Retrieval Read Port

Phases 12A and 12B add the first query-ready internal Music Data Platform
retrieval read port for later Music Intelligence Retrieval:

```text
createMusicDataPlatformRetrievalReadPort({ db })
  -> searchOwnerCatalogMaterials(...)
  -> getRetrievalFreshness(...)
```

`searchOwnerCatalogMaterials(...)` is read-only. It does not rebuild
projections, mark dirty targets, materialize provider candidates, or write any
durable state.

The retrieval base set is `owner_material_catalog_view` for one owner scope.
The port applies SQL-owned:

- owner-visible blocked exclusion through the catalog view;
- `materialKind` filtering;
- pool algebra over `source_library` and `owner_material_relation_pool` refs;
- prefix-OR FTS matching when effective text exists;
- `stable`, `recently_added`, and `text_relevance` ordering;
- SQL keyset pagination;
- matched positive pool evidence per row;
- matched text field/token evidence and distinct matched-token counting per row.

Pool filters are validated against current Music Data Platform truth before the
query runs. `source_library` pool refs must exist and belong to the requested
owner scope. `owner_material_relation_pool` refs must match the requested
owner scope and only support positive relation kinds currently projected into
the owner catalog.

The read port currently supports only `DEFAULT_OWNER_SCOPE` and rejects:

- non-default owner scopes;
- `text_relevance` without effective query text;
- `cursorPosition.order = text_relevance` when effective query text is absent;
- malformed `text_relevance` cursor sort keys.

When effective text is absent, the read port left-joins
`material_text_documents` only to surface normalized projection text for
display/debug follow-up. Missing text documents are tolerated and return empty
strings. Returned text fields are the current normalized projection text, not
raw provider casing.

When effective text is present, query membership comes from
`material_text_documents` plus `material_text_fts`. Missing material text
projections do not crash the query; they simply cannot be recalled by text.
`matchedTextFields` and `matchedTextTokensByField` expose field-aware token
evidence, `matchedTokenCount` counts distinct matched query tokens, and
`rankScore` is exposed only for `order = text_relevance`.

`getRetrievalFreshness({ ownerScope })` is a coarse read over
`projection_maintenance_targets`. It counts:

- current-owner `owner_catalog_*` dirty/failed targets;
- global `material_text` dirty/failed targets.

It does not rebuild anything and does not compute per-material freshness.

## Projection Maintenance Core

Phase 11C implements a typed internal projection-maintenance worklist plus
source-of-truth invalidation wiring:

```text
projection_maintenance_targets(
  projection_kind,
  target_key,
  target_payload_json,
  status,
  dirty_generation,
  failure_code?,
  failure_message?,
  created_at,
  updated_at
)
```

The implemented projection kinds are:

```text
owner_catalog_source_library
owner_catalog_source_library_material
owner_catalog_relation_material
material_text
```

`target_key` is an opaque deterministic digest:

```text
pmt_<digest(projectionKind, normalizedTargetPayloadJson)>
```

`target_payload_json` is stable JSON with fixed key order so the same logical
target always produces the same `target_key`. Ref payloads keep
`namespace/kind/id` only; labels never participate in projection maintenance
identity.

`markProjectionTargetDirty(...)` upserts one target row, clears prior failure
state, and increments `dirty_generation` on repeated marks instead of creating
duplicates. `markProjectionClean(...)` and `markProjectionFailed(...)` are
generation-aware: they mutate only when the caller still holds the current
generation, so stale rebuild attempts cannot delete or overwrite a newer dirty
mark.

`createProjectionMaintenanceRunner({ database, now })` is an internal runner,
not a public tool. It selects `dirty` and `failed` rows through
`createProjectionMaintenanceRecords({ db })`, rebuilds each target in its own
database transaction by dispatching to the owning projection command, and then:

- deletes the target row on successful same-generation rebuild;
- writes `status = failed` plus compact failure fields when rebuild throws;
- leaves a newer generation pending when rebuild output becomes stale during
  the same run.

Direct projection rebuild command calls do not clear
`projection_maintenance_targets` on their own. Cleaning a dirty target is part
of the runner flow through `markProjectionClean(...)`, not part of the rebuild
command surface.

Malformed target payloads are treated as failed targets for that row only; the
runner continues with later targets.

Phase 11C also wires durable writes into this worklist through
`markProjectionInvalidated({ writes })`. Source-of-truth write commands report
typed write scopes such as `source_record_written`,
`material_record_written`, `canonical_record_written`,
`source_material_binding_written`, `source_library_item_written`, and
`owner_relation_written`. Projection Maintenance plans the affected
`material_text`, `owner_catalog_source_library_material`, and
`owner_catalog_relation_material` targets inside the same transaction as the
write. Workflow-facing callers use
`createMusicDataPlatformSourceOfTruthWriteCommands({ db, now })`; ordinary
workflow code must not call lower-level identity/source-library/relation write
factories directly, and workflow-facing owner-scoped writes currently reject
non-default owner scopes.

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

- Collection membership;
- concrete public Stage Interface import tool registrations;
- update baseline tables;
- public owner-scoped query surfaces and query result shaping beyond the
  internal retrieval read port;
- Collection source-of-truth writes and additional owner catalog producers
  beyond source-library and owner-relation;
- Music Intelligence Retrieval service and ranking;
- provider execution or provider config;
- Stage Interface tools or public DTOs;
- background scheduling or automatic rebuild orchestration;
- canonical review/merge/split workflow;
- direct source-canonical evidence model;
- wrong-version, not-playable, bad-match, feedback, correction, or signals;
- command audit;
- provider login, OAuth, cookie refresh, or reauth.
