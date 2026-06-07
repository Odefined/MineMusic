# Music Data Platform Design

> Status: Current design authority for implemented Phase 5
> Scope: Source/material/canonical identity write model
> Not status ledger: Current implementation state lives in `progress.md`.

Music Data Platform owns source/material/canonical identity records and the
current source-to-material binding facts that let later phases move from
provider/source facts to MineMusic material identity.

## Core Concepts

| Concept | Meaning | Current Phase 5 Rule |
| --- | --- | --- |
| `SourceRecord` | Storage record for normalized provider/source facts. | Keyed by `refKey(entity.sourceRef)`; provider identity lookup is stable. |
| `MaterialRecord` | Storage record for MineMusic material identity. | Keyed by `refKey(entity.materialRef)`; `sourceRefs` are maintained by binding/merge commands only. |
| `CanonicalRecord` | Storage record for canonical identity authority. | Keyed by `refKey(entity.canonicalRef)`; canonical merge workflow is out of scope. |
| `source_material_bindings` | Current source-to-material truth/index. | One current binding per source; no status/history/evidence/kind fields. |
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
- Library Import / Update;
- query/retrieval/ranking;
- provider execution or provider config;
- Stage Interface tools or public DTOs;
- canonical review/merge/split workflow;
- direct source-canonical evidence model;
- command audit;
- runtime database wiring.
