# Music Data Platform Ports

> Status: Current boundary authority for implemented Phase 5
> Scope: Identity write model ports and dependencies

Music Data Platform provides identity repositories, identity write commands,
schema contribution, and error types. It consumes the generic Storage database
context but does not know SQLite primitives.

## Provides

| Port | Provided to | Capabilities | Code |
| --- | --- | --- | --- |
| `musicDataPlatformIdentitySchema` | Storage initialization callers | Creates Phase 5 identity tables and source-material binding table. | `src/music_data_platform/identity_schema.ts` |
| `createIdentityRepositories` | Internal commands/tests | Low-level source/material/canonical/binding persistence. | `src/music_data_platform/identity_records.ts` |
| `createIdentityWriteCommands` | Internal Music Data Platform callers/tests | Invariant-preserving identity writes. | `src/music_data_platform/identity_write_model.ts` |
| `MusicDataPlatformError` | Internal callers/tests | Music Data Platform-owned invariant errors. | `src/music_data_platform/errors.ts` |

## Consumes

| Consumed capability | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| `MusicDatabaseContext` | Storage | SQL execution for repositories and schema contribution. | `get`, `all`. | `run`. |
| `MusicDatabaseTransactionContext` | Storage | Transaction-scoped SQL execution for identity write commands. | `get`, `all`. | `run`. |
| `Ref` / `refKey(ref)` | Contracts | Identity key validation and persisted `ref_key` derivation. | Ref fields. | None. |
| Source/material/canonical contracts | Contracts | Record and command shapes. | Entity/record fields. | None. |

## Repository Ports

Repositories are created with `db: MusicDatabaseContext`.

| Repository | Methods | Notes |
| --- | --- | --- |
| `SourceRecordRepository` | `upsert`, `get`, `findByProviderIdentity` | Lookup miss returns `undefined`. |
| `MaterialRecordRepository` | `upsert`, `get`, `findActiveByCanonicalRef` | Does not coordinate bindings. |
| `CanonicalRecordRepository` | `upsert`, `get` | Can round-trip canonical record status. |
| `SourceToMaterialBindingRepository` | `upsertCurrentBinding`, `findMaterialForSource`, `listSourcesForMaterial`, `deleteBindingForSource` | Low-level current binding persistence only; no `bind` business method. |

Repositories do not start transactions, generate timestamps, return
`Result<T>`, call providers, or update Stage Interface outputs.

## Command Ports

Commands are created with `db: MusicDatabaseTransactionContext` and
`now: string`.

| Command | Input | Output | Writes |
| --- | --- | --- | --- |
| `upsertSourceRecord` | full `SourceEntity` | `SourceRecord` | `source_records` |
| `upsertMaterialRecord` | patch-style material input without `sourceRefs`, `identityStatus`, `lifecycleStatus`, or `canonicalRef` | `MaterialRecord` | `material_records` |
| `upsertCanonicalRecord` | full `CanonicalEntity` plus record status/facts | `CanonicalRecord` | `canonical_records` |
| `bindSourceToMaterial` | `sourceRef`, `materialRef`, optional `makePrimary` | after-state binding/material records | `source_material_bindings`, `material_records` |
| `bindMaterialToCanonical` | `materialRef`, `canonicalRef` | after-state material record | `material_records` |
| `mergeMaterialRecord` | loser/winner material refs, optional primary override | after-state loser/winner records and moved bindings | `source_material_bindings`, `material_records` |

Command outputs are internal records. They are not agent-facing DTOs.

## Forbidden Dependencies

| Forbidden dependency | Reason |
| --- | --- |
| Music Data Platform -> `src/storage/sqlite/**` / `node:sqlite` / `DatabaseSync` | Music Data Platform must depend on generic database contexts, not concrete SQLite. |
| Music Data Platform -> Stage Interface | Stage Interface owns public tools/output projection. |
| Music Data Platform -> Extension/provider implementations | Providers produce source facts; they do not persist identity directly. |
| Music Data Platform -> query/retrieval/presentation roots | Query and presentation are later boundaries. |
| Stage Interface -> Music Data Platform storage row shapes | Agent-facing tools must not leak internal records. |
| Repository methods -> transactions | Phase 4 root-only transaction boundary must remain outside repositories. |
| Commands/repositories -> `Result<T>` | Stage Interface error protocol must not leak into internal write model. |

## Guards

Current guards:

- active-tree test allows only the Phase 5 Music Data Platform source files;
- active-tree test rejects Music Data Platform imports of SQLite primitives and
  unrelated formal roots;
- contract test rejects `recordId` returning to source/material/canonical
  records;
- identity test covers source provider identity stability, source-material
  binding replacement, material-canonical binding, primary-source invariants,
  source namespace/provider validation, ref/kind validation, material lifecycle
  write guards, material merge behavior, canonical conflict rejection,
  foreign-key rejection, and transaction rollback.

## Out Of Scope

- owner facts;
- source-canonical binding tables;
- command audit;
- provider/import/query/presentation execution;
- canonical review/merge/split workflow;
- runtime database wiring.
