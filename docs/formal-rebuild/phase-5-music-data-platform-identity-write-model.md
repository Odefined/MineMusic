# Phase 5 Music Data Platform Identity Write Model

> Status: Implemented Phase 5 spec
> Scope: Music Data Platform source/material/canonical identity write model
> Audit mapping: durable identity records and binding facts after the Phase 4
> `MusicDatabase` foundation

Phase 5 starts the Music Data Platform write model. It should establish the
durable source/material/canonical identity records and source-to-material
binding facts needed by later provider import, query, presentation, owner
facts, projections, and canonical maintenance phases.

This phase must not become a provider rewrite, query engine rewrite, Library
Import implementation, owner-fact model, or Stage Interface feature slice.

## Goal

Create the first Music Data Platform persistence boundary where:

- `SourceRecord`, `MaterialRecord`, and `CanonicalRecord` can be stored and
  read through Music Data Platform-owned ports;
- source-to-material binding facts are represented by explicit tables or
  repository records, not hidden inside query, provider code, or
  `MaterialEntity.sourceRefs` alone;
- Music Data Platform contributes its schema through the generic Phase 4
  `MusicDatabase` schema contribution mechanism;
- multi-table identity writes happen through an explicit command/write
  boundary using one caller-provided transaction context;
- formal contracts stop exposing `recordId` and use `Ref` plus `refKey(ref)`
  as the only identity key policy.

## Non-Goals

Do not implement:

- owner facts such as saved, favorite, blocked, wrong-version, not-playable,
  bad-match, liked, or disliked;
- Collection membership or collection-local notes;
- Library Import / Update orchestration;
- provider execution, provider config, provider accounts, provider HTTP, or
  NetEase/MusicBrainz rewrites;
- query engine behavior, query hits, ranking, retrieval, or provider candidate
  TEMP tables;
- projections and owner catalog read models;
- canonical review tools, merge/split workflow, or evidence UI;
- Stage Interface tools, instruments, `MaterialCard`, present, or public output
  shaping;
- Memory, Music Experience, radio mode, play/open/skip events, or feedback
  binding;
- command audit;
- migration ledger, default database path, runtime database wiring, or storage
  provider replaceability.

Those belong to later phases once this identity write model is stable.

## Owning Context

Music Data Platform owns:

- source/material/canonical record semantics;
- source-to-material binding facts;
- Music Data Platform schema contributions;
- Music Data Platform repository ports and command boundaries;
- serialization of entity JSON and storage-only lookup columns.

Storage owns only the generic database substrate:

- `MusicDatabase`;
- `MusicDatabaseContext`;
- root transaction execution;
- schema contribution execution;
- the concrete SQLite adapter.

Storage must not know what a material, source, canonical identity, or binding
fact means. Music Data Platform must not import `node:sqlite`, `DatabaseSync`,
or the concrete SQLite adapter.

## Accepted Implementation Decisions

### Phase Scope

Phase 5 is the Music Data Platform identity write model only.

Include:

- `SourceRecord`;
- `MaterialRecord`;
- `CanonicalRecord`;
- source-to-material binding facts;
- minimal repository ports;
- Music Data Platform schema contribution;
- explicit transactional write command boundary.

Exclude:

- owner facts;
- Library Import / Update;
- query;
- provider execution;
- presentation;
- `MaterialCard`;
- canonical review/apply/reject/split commands;
- direct source-to-canonical binding tables;
- projections;
- Stage Interface tools.

### Record Storage Shape

Use core lookup/index columns plus `entity_json` for the formal entities.

Phase 5 should not fully normalize titles, artists, version tags, links,
aliases, or display fields before real access patterns require that split.

Allowed:

- scalar lookup/index columns needed for identity writes and direct lookup;
- `entity_json` as the canonical serialized `SourceEntity`,
  `MaterialEntity`, or `CanonicalEntity` snapshot;
- a separate binding table for source-to-material facts;
- storage-only timestamp/status columns where the record owns them.

Not allowed:

- ad hoc raw provider payload storage;
- presentation DTOs;
- `MaterialCard` fields;
- owner-scoped facts;
- command audit as a hidden history/evidence channel;
- speculative fully normalized music-fact tables.

### Record Key Policy

Do not use `recordId`.

The active Phase 1 contracts currently contain `recordId` fields on
`SourceRecord`, `MaterialRecord`, and `CanonicalRecord`. That field is a
docs/code drift from Phase 1 and must be removed in Phase 5 rather than
explained or expanded.

Formal key policy:

- `SourceRecord` key is `refKey(entity.sourceRef)`;
- `MaterialRecord` key is `refKey(entity.materialRef)`;
- `CanonicalRecord` key is `refKey(entity.canonicalRef)`;
- public/domain/storage-facing contracts use `Ref` and `refKey(ref)`;
- if a database table needs a scalar primary-key column, name it `ref_key`;
- `ref_key` is only persisted `refKey(...)`, not a new identity axis.

This prevents the write model from creating two competing identities:

```text
entity.sourceRef/materialRef/canonicalRef
recordId
```

There should be only one identity path:

```text
entity ref -> refKey(ref) -> storage ref_key
```

## Implemented Storage Model

Phase 5 implements this storage shape through
`musicDataPlatformIdentitySchema`.

### `source_records`

Purpose: durable provider/source facts.

Expected columns:

- `ref_key` primary key, equal to `refKey(entity.sourceRef)`;
- `provider_id`;
- `provider_entity_id`;
- `kind`;
- `entity_json`;
- `created_at`;
- `updated_at`.

Expected lookup:

- unique lookup on `provider_id`, `provider_entity_id`, and `kind`.

`SourceEntity` owns source-side links and source-side version information.
Those facts stay in `entity_json` until a real query/write path needs
separate indexed columns.

`upsertSourceRecord` must keep provider identity stable. If an existing record
with the same `provider_id`, `provider_entity_id`, and `kind` already points to
a different `sourceRef`, ordinary upsert must reject the write. Source ref
migration or repair requires an explicit later repair/migration command.

Phase 5 repositories and commands do not generate `sourceRef`. The
`upsertSourceRecord` input must already contain `entity.sourceRef`. The write
boundary validates consistency between the entity and storage lookup:

```text
refKey(entity.sourceRef) == source_records.ref_key
entity.providerId == provider_id
entity.providerEntityId == provider_entity_id
entity.kind == kind
```

Provider normalization, import, or materialization commands decide how a
source identity is constructed before Phase 5 persistence receives it.

### `material_records`

Purpose: MineMusic-owned material identity anchors.

Expected columns:

- `ref_key` primary key, equal to `refKey(entity.materialRef)`;
- `kind`;
- `lifecycle_status`;
- `identity_status`;
- `canonical_ref_key`, when the material is canonical-linked;
- `primary_source_ref_key`, when a primary source is known;
- `merged_into_material_ref_key`, when the material record is merged;
- `entity_json`;
- `created_at`;
- `updated_at`.

`MaterialEntity.sourceRefs` may remain serialized in `entity_json`, but
source-to-material truth must also be represented by explicit binding facts.
`MaterialEntity.sourceRefs` is a material identity snapshot or denormalized
view, not the only binding source of truth.

Phase 5 repositories and commands do not generate `materialRef`.
`upsertMaterialRecord` input must already contain `entity.materialRef`, and the
write boundary validates:

```text
refKey(entity.materialRef) == material_records.ref_key
entity.kind == kind
entity.lifecycleStatus == lifecycle_status
entity.identityStatus == identity_status
```

In Phase 5, `MaterialEntity.sourceRefs` is still persisted in `entity_json`.
The same explicit identity write command that writes
`source_material_bindings` must keep `MaterialEntity.sourceRefs` in sync. Do
not let external callers update the binding table and material entity snapshot
through separate write paths.

### `canonical_records`

Purpose: cross-source identity authority.

Expected columns:

- `ref_key` primary key, equal to `refKey(entity.canonicalRef)`;
- `kind`;
- `status`;
- `merged_into_canonical_ref_key`, when the canonical record is merged;
- `entity_json`;
- `facts_json`, only for canonical maintenance evidence already accepted by
  the record contract;
- `created_at`;
- `updated_at`.

Canonical evidence should not become provider raw-payload storage or a public
review surface in Phase 5.

Phase 5 repositories and commands do not generate `canonicalRef`.
`upsertCanonicalRecord` input must already contain `entity.canonicalRef`, and
the write boundary validates:

```text
refKey(entity.canonicalRef) == canonical_records.ref_key
entity.kind == kind
```

Phase 5 may persist `CanonicalRecord.status` and `mergedIntoCanonicalRef`
fields, but it does not implement a canonical merge command. Canonical
merge/split workflow belongs to canonical maintenance.

`upsertCanonicalRecord` may persist `active`, `provisional`, and `archived`
canonical statuses. It may read or round-trip `merged` records, but Phase 5
does not provide the canonical merge command that creates `merged` status.
Review/apply/reject/split workflows are also out of scope.

### Binding Facts

Phase 5 includes source-to-material binding facts. Direct source-to-canonical
binding is deferred to canonical maintenance/evidence work.

Minimum expected tables:

- `source_material_bindings`.

Minimum expected rule:

- binding rows use `source_ref_key` and `material_ref_key` values derived from
  `refKey(ref)`;
- one source should have at most one current active material binding;
- Phase 5 binding rows do not carry `status`, history, evidence, confidence,
  reason, audit fields, or binding kind;
- `MaterialEntity.primarySourceRef` remains the primary-source signal in Phase
  5; the binding table does not duplicate it;
- binding facts are not hidden inside query results, provider candidates, or
  presentation output;
- binding writes happen through the explicit Music Data Platform write
  boundary, not directly through provider or Stage Interface code.

Direct source-to-canonical relation should be derived through:

```text
source_material_bindings -> material_records.entity.canonicalRef
```

Do not add `source_canonical_bindings` in Phase 5. A direct source-canonical
fact can be introduced later when canonical maintenance needs source-specific
evidence or review state.

The binding table is intentionally narrow:

```text
source_ref_key
material_ref_key
created_at
updated_at
```

`created_at` and `updated_at` are current-row maintenance timestamps, not a
history model. Replacing a source binding updates the current row and
`updated_at`; it does not create an audit trail or archived binding row.

Candidate, weak, alternate, duplicate, evidence-backed, or primary-source
binding distinctions belong to later evidence/candidate/canonical maintenance
slices if real workflows require them.

### Identity Command Boundary

Use several narrow write commands instead of one broad `writeIdentity(...)`
union.

Phase 5 command boundary should expose only the operations whose reads and
writes are understood in this phase:

```text
upsertSourceRecord
upsertMaterialRecord
upsertCanonicalRecord
bindSourceToMaterial
bindMaterialToCanonical
mergeMaterialRecord
```

`bindSourceToMaterial` owns the synchronized write of:

```text
source_material_bindings
material_records.entity.sourceRefs
material_records.entity.primarySourceRef?
```

`primarySourceRef` is updated only when the command input explicitly requests
that primary-source change.

Do not introduce one broad `writeIdentity(command)` entrypoint in Phase 5.
Source upsert, material upsert, canonical upsert, binding, and merge commands
have different read/write needs. Hiding them behind one command union would
make the boundary look uniform while mixing unrelated workflows.

`upsertMaterialRecord` must not directly replace `MaterialEntity.sourceRefs`.
`sourceRefs` changes only through `bindSourceToMaterial` or
`mergeMaterialRecord`, because those commands also maintain
`source_material_bindings`.

`upsertMaterialRecord` must not directly write `MaterialEntity.canonicalRef`.
Material-to-canonical confirmation happens through `bindMaterialToCanonical`,
which checks that both records exist and rejects attempts to bind an already
confirmed material to a different canonical ref.

`bindMaterialToCanonical` does not create a separate material-canonical table
in Phase 5. The current binding is stored on `MaterialEntity.canonicalRef`
inside `material_records`, while source-to-canonical relation remains derived
from `source_material_bindings -> material_records.entity.canonicalRef`.

`primarySourceRef` may be set or cleared by `upsertMaterialRecord`,
`bindSourceToMaterial`, or `mergeMaterialRecord`, but any non-empty
`primarySourceRef` must already be bound to that material. Do not allow a
material to point at an unbound source as primary.

Do not add standalone `setMaterialStatus`, `setCanonicalStatus`, or
`setSourceStatus` commands in Phase 5. Status changes must happen through the
existing narrow commands that also enforce related invariants. For example,
`mergeMaterialRecord` sets loser `lifecycleStatus = "merged"` together with
`mergedIntoMaterialRef` and source-binding movement.

Internal Music Data Platform write commands may return the resulting
`SourceRecord`, `MaterialRecord`, or `CanonicalRecord` to other internal code
and tests. Agent-facing tools must not return storage records directly. If a
later Stage Interface tool invokes these commands, Stage Interface must project
the result into compact public output through its own output boundary.

Commands should use a factory shape so infrastructure dependencies do not
appear in every business method input:

```ts
type CreateIdentityWriteCommandsInput = {
  db: MusicDatabaseContext;
  now: string;
};

type IdentityWriteCommands = {
  upsertSourceRecord(input: UpsertSourceRecordInput): SourceRecord;
  upsertMaterialRecord(input: UpsertMaterialRecordInput): MaterialRecord;
  upsertCanonicalRecord(input: UpsertCanonicalRecordInput): CanonicalRecord;
  bindSourceToMaterial(input: BindSourceToMaterialInput): BindSourceToMaterialResult;
  bindMaterialToCanonical(input: BindMaterialToCanonicalInput): MaterialRecord;
  mergeMaterialRecord(input: MergeMaterialRecordInput): MergeMaterialRecordResult;
};
```

`db` is the transaction-scoped `MusicDatabaseContext` supplied by the Phase 4
root transaction. `now` is a caller-supplied ISO timestamp. Phase 5 does not
introduce a clock/effect dependency.

Commands own timestamp assignment:

- new records use `createdAt = now` and `updatedAt = now`;
- updated records keep existing `createdAt` and set `updatedAt = now`;
- new bindings use `created_at = now` and `updated_at = now`;
- replaced bindings keep existing `created_at` and set `updated_at = now`.

Repositories persist timestamps supplied by commands. Repositories do not read
the clock and do not synthesize timestamps.

Example:

```ts
database.transaction((db) => {
  const commands = createIdentityWriteCommands({ db, now });

  commands.bindSourceToMaterial({
    sourceRef,
    materialRef,
    makePrimary: true,
  });
});
```

### Repository And Command Split

Keep repositories and commands separate.

Repositories are low-level persistence ports:

- they are created with `db: MusicDatabaseContext`;
- they do not start transactions;
- they do not know provider execution, Stage Interface, query, or owner
  workflows;
- they expose exact record/binding reads and writes.

Commands express Music Data Platform write intent:

- they coordinate one or more repositories;
- they run inside a caller-provided root transaction context;
- they own multi-table consistency rules;
- they remain internal Music Data Platform boundaries, not agent-facing tool
  schemas.

Expected repository shape:

```ts
type IdentityRepositories = {
  sourceRecords: SourceRecordRepository;
  materialRecords: MaterialRecordRepository;
  canonicalRecords: CanonicalRecordRepository;
  sourceMaterialBindings: SourceToMaterialBindingRepository;
};

type SourceRecordRepository = {
  upsert(record: SourceRecord): SourceRecord;
  get(input: { sourceRef: Ref }): SourceRecord | undefined;
  findByProviderIdentity(input: {
    providerId: string;
    providerEntityId: string;
    kind: SourceEntityKind;
  }): SourceRecord | undefined;
};

type MaterialRecordRepository = {
  upsert(record: MaterialRecord): MaterialRecord;
  get(input: { materialRef: Ref }): MaterialRecord | undefined;
};

type CanonicalRecordRepository = {
  upsert(record: CanonicalRecord): CanonicalRecord;
  get(input: { canonicalRef: Ref }): CanonicalRecord | undefined;
};

type SourceToMaterialBindingRepository = {
  upsertCurrentBinding(record: SourceToMaterialBindingRecord): SourceToMaterialBindingRecord;
  findMaterialForSource(input: { sourceRef: Ref }): SourceToMaterialBindingRecord | undefined;
  listSourcesForMaterial(input: { materialRef: Ref }): readonly SourceToMaterialBindingRecord[];
  deleteBindingForSource(input: { sourceRef: Ref }): SourceToMaterialBindingRecord | undefined;
};
```

Expected command shape:

```text
IdentityWriteCommands.upsertSourceRecord
IdentityWriteCommands.upsertMaterialRecord
IdentityWriteCommands.upsertCanonicalRecord
IdentityWriteCommands.bindSourceToMaterial
IdentityWriteCommands.bindMaterialToCanonical
IdentityWriteCommands.mergeMaterialRecord
```

`bindSourceToMaterial` is a command, not a plain repository method, because it
must coordinate `source_material_bindings` and
`MaterialEntity.sourceRefs`/`primarySourceRef` consistency.

Do not name the low-level repository write method `bind`. `bindSourceToMaterial`
is the business command. The repository method should be mechanical, such as
`upsertCurrentBinding`, so callers do not confuse a table write with the full
consistency command.

`deleteBindingForSource` is a low-level repository capability for replacement,
merge cleanup, and repair paths. Phase 5 does not expose a separate
`unbindSourceFromMaterial` business command unless a real workflow needs it.

### Command Inputs And Outputs

Implemented command method shapes:

```ts
type UpsertSourceRecordInput = {
  entity: SourceEntity;
};

type UpsertMaterialRecordInput = {
  materialRef: Ref;
  kind: MaterialEntityKind;
  identityStatus: MaterialIdentityStatus;
  lifecycleStatus?: "active" | "archived";
  primarySourceRef?: Ref | null;
  versionInfo?: VersionInfo | null;
};

// Patch-style input by design: do not accept full MaterialEntity here.
type UpsertCanonicalRecordInput = {
  entity: CanonicalEntity;
  status: "active" | "provisional" | "archived";
  factsJson?: Record<string, unknown> | null;
};

type BindSourceToMaterialInput = {
  sourceRef: Ref;
  materialRef: Ref;
  makePrimary?: boolean;
};

type BindSourceToMaterialResult = {
  binding: SourceToMaterialBindingRecord;
  materialRecord: MaterialRecord;
  previousMaterialRecord?: MaterialRecord;
};

type BindMaterialToCanonicalInput = {
  materialRef: Ref;
  canonicalRef: Ref;
};

type MergeMaterialRecordInput = {
  loserMaterialRef: Ref;
  winnerMaterialRef: Ref;
  primarySourceRef?: Ref | null;
};

type MergeMaterialRecordResult = {
  loserRecord: MaterialRecord;
  winnerRecord: MaterialRecord;
  movedBindings: readonly SourceToMaterialBindingRecord[];
};
```

`upsertSourceRecord` accepts a full `SourceEntity` because `SourceEntity` is
the provider/source facts snapshot owned by the source record. It still must
validate provider identity stability and must not generate `sourceRef`.

`upsertMaterialRecord` uses patch-style input and must not accept a full
`MaterialEntity`. Full `MaterialEntity` contains `sourceRefs`, but `sourceRefs`
changes are reserved for `bindSourceToMaterial` and `mergeMaterialRecord`.
It also does not accept `canonicalRef`; canonical confirmation is reserved for
`bindMaterialToCanonical`.

`bindMaterialToCanonical` sets `MaterialEntity.canonicalRef` and
`identityStatus = "canonical_confirmed"`. It is idempotent for the same
canonical ref and rejects a different canonical ref for an already confirmed
material.

`upsertCanonicalRecord` accepts a full `CanonicalEntity` because the current
canonical entity shape contains only canonical identity authority fields.
Record-only fields such as `status` and `factsJson` stay separate in the
command input.

Internal commands and repositories throw `MusicDataPlatformError` for Music
Data Platform-owned invariant violations. They do not return `Result<T>`.
Stage Interface or runtime boundaries translate errors later if a command
becomes agent-facing.

Repository `get`/lookup methods return `undefined` when no row exists.
Commands throw `MusicDataPlatformError` when a required record is missing.
This keeps repositories as low-level persistence/query ports while commands
own business preconditions.

Expected error codes include:

```text
music_data.record_ref_key_mismatch
music_data.source_provider_identity_conflict
music_data.material_primary_source_not_bound
music_data.material_canonical_conflict
music_data.material_merge_canonical_conflict
music_data.material_merge_invalid_target
music_data.material_not_found
music_data.source_not_found
music_data.canonical_not_found
```

`BindSourceToMaterialResult` contains after-state records:

- `binding` is the current source-to-material binding after the command;
- `materialRecord` is the target material after `sourceRefs` and optional
  primary-source updates;
- `previousMaterialRecord`, when present, is the previous material after the
  source was removed from its current `sourceRefs` and primary source was
  cleared if needed.

Phase 5 does not return before-state binding/material history from
`bindSourceToMaterial`.

`MergeMaterialRecordResult.movedBindings` contains the after-state current
bindings, where each moved source now points to the winner material. Phase 5
does not return before-state binding history from merge.

`mergeMaterialRecord` keeps loser entity fields as a merged-record snapshot.
It does not clear loser `sourceRefs`, `primarySourceRef`, or `canonicalRef`.
Current source ownership is determined by `source_material_bindings`, not by
the merged loser snapshot.

### Material Merge Rules

`mergeMaterialRecord(loser, winner)` is an identity-level merge only.

It should:

- set loser `lifecycleStatus = "merged"`;
- set loser `mergedIntoMaterialRef = winner.materialRef`;
- move loser source-material bindings to winner;
- keep loser `entity.sourceRefs`, `primarySourceRef`, and `canonicalRef` as the
  merge-time snapshot;
- merge and de-duplicate winner `MaterialEntity.sourceRefs`;
- keep winner `primarySourceRef` unchanged unless the command input explicitly
  requests a primary-source change;
- not inherit loser `primarySourceRef` automatically, even when winner has no
  `primarySourceRef`.

Canonical pointer handling:

- if winner has `canonicalRef` and loser has none, keep winner `canonicalRef`;
- if winner and loser have the same `canonicalRef`, keep winner
  `canonicalRef`;
- if winner has no `canonicalRef` and loser has one, winner inherits loser
  `canonicalRef` and winner `identityStatus` becomes `canonical_confirmed`;
- if winner has `canonicalRef = A` and loser has `canonicalRef = B`, reject the
  merge in Phase 5.

Phase 5 material merge must not automatically merge canonical records or update
the canonical graph. Conflicting material canonical refs require a later
canonical maintenance workflow.

The loser record keeps its original entity fields as a merged-record snapshot.
The durable redirect is `mergedIntoMaterialRef`, not a canonical merge or
current source ownership signal.

## Boundary Rules

Allowed dependencies:

- Music Data Platform repositories may depend on `MusicDatabaseContext`;
- Music Data Platform schema modules may provide
  `MusicDatabaseSchemaContribution`;
- Music Data Platform contracts may depend on formal contracts from
  `src/contracts`;
- command factories may receive a transaction-scoped `MusicDatabaseContext`.

Forbidden dependencies:

- Music Data Platform -> `node:sqlite`;
- Music Data Platform -> `src/storage/sqlite/**`;
- provider implementations -> Music Data Platform repositories directly;
- Stage Interface -> Music Data Platform storage row shapes;
- Stage Interface returning `SourceRecord`, `MaterialRecord`, or
  `CanonicalRecord` directly to agents;
- Music Data Platform repositories or commands returning Stage Interface
  `Result<T>`;
- query/retrieval modules -> write repositories unless the operation is an
  explicitly named materialization/write command;
- Storage -> Music Data Platform entity semantics.

## Expected Files

Implemented files:

```text
src/music_data_platform/index.ts
src/music_data_platform/errors.ts
src/music_data_platform/identity_schema.ts
src/music_data_platform/identity_records.ts
src/music_data_platform/identity_write_model.ts
```

Expected tests and guards:

```text
test/formal/music-data-platform-identity.test.ts
test/formal/active-tree.test.ts
```

Expected documentation files:

```text
docs/music-data-platform/README.md
docs/music-data-platform/design.md
docs/music-data-platform/ports.md
docs/music-data-platform/progress.md
docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md
docs/formal-project-glossary.md
```

Phase 5 should introduce area-local Music Data Platform docs because it is the
first phase that creates Music Data Platform active source and ports. Those
docs must cover only the current identity write model authority: records,
source-material binding, repositories, commands, forbidden dependencies, and
guards. Do not use them to pre-document future owner facts, Library Import,
query, projections, canonical maintenance workflow, Music Experience, or
Memory behavior.

No new ADR is required for Phase 5 as currently scoped. ADR-0006 already
covers the formal entity/record, candidate, materialization, and handle
boundaries. Add an ADR only if implementation changes those boundaries or makes
a new hard-to-reverse trade-off such as mutation audit, source-canonical
evidence modeling, or canonical maintenance workflow semantics.

## Implementation Plan

1. Clean up the active contracts.
   - Remove `recordId` from `SourceRecord`, `MaterialRecord`, and
     `CanonicalRecord`.
   - Keep entity refs as the semantic identity.
   - Use `refKey(ref)` for scalar key derivation.

2. Add the Music Data Platform source root.
   - Add only the identity write model files needed by this phase.
   - Do not restore old MVP material/source/canonical modules.
   - Do not add compatibility aliases for old `mat:` / `emat:` / material id
     paths.

3. Add the identity schema contribution.
   - Create source/material/canonical record tables.
   - Create a source-material binding table.
   - Keep schema SQL idempotent.
   - Use `ref_key` columns derived from `refKey(ref)`.
   - Do not introduce owner facts, projections, query indexes, or provider
     raw payload tables.

4. Add minimal repositories.
   - Repositories should be created with `db: MusicDatabaseContext`.
   - Repositories should not start transactions.
   - Repositories should expose only the exact reads/writes needed for Phase 5.
   - Repository row shapes should remain internal to Music Data Platform.
   - Keep multi-table consistency out of repositories.

5. Add an explicit write command boundary.
   - Use the Phase 4 root transaction boundary.
   - Coordinate multi-table writes through one transaction-scoped context.
   - Use a factory shape such as `createIdentityWriteCommands({ db, now })`.
   - Expose narrow commands such as `upsertSourceRecord`,
     `upsertMaterialRecord`, `upsertCanonicalRecord`,
     `bindSourceToMaterial`, `bindMaterialToCanonical`, and
     `mergeMaterialRecord`.
   - Do not introduce one broad `writeIdentity(...)` command union.
   - Do not introduce standalone status-toggle commands.
   - Prevent `upsertMaterialRecord` from replacing `MaterialEntity.sourceRefs`
     directly.
   - Validate that any non-empty `primarySourceRef` points at a source already
     bound to the material.
   - Keep `source_material_bindings` and `MaterialEntity.sourceRefs` in sync
     through `bindSourceToMaterial`.
   - Prevent `upsertMaterialRecord` from writing `MaterialEntity.canonicalRef`
     directly; canonical confirmation must use `bindMaterialToCanonical`.
   - Keep provider execution, import orchestration, and Stage Interface
     translation out of this phase.

6. Add guards and verification.
   - Guard that `recordId` does not return to active contracts.
   - Guard that Music Data Platform does not import SQLite primitives.
   - Guard that Stage Interface does not import Music Data Platform storage
     row shapes.
   - Test insert/read/update behavior for records and binding facts.
   - Test transaction rollback across multi-table identity writes.

7. Add Music Data Platform area docs.
   - Create `docs/music-data-platform/README.md`.
   - Create `docs/music-data-platform/design.md`.
   - Create `docs/music-data-platform/ports.md`.
   - Create `docs/music-data-platform/progress.md`.
   - Keep the area docs limited to implemented Phase 5 identity records,
     source-material binding, repositories, commands, forbidden dependencies,
     guards, and verification state.

## Verification

Minimum verification for implementation:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```

Targeted tests should cover:

- schema contribution idempotence;
- source record upsert/read by source ref key;
- source record lookup by provider id/entity id/kind;
- rejection when a source upsert tries to remap one provider identity to a
  different `sourceRef`;
- validation that source record lookup columns match `entity.sourceRef`,
  `providerId`, `providerEntityId`, and `kind`;
- validation that material and canonical record ref keys match their entity
  refs and indexed columns;
- material record upsert/read by material ref key;
- canonical record upsert/read by canonical ref key;
- source-to-material binding write/read;
- source-to-material binding replacement without binding
  status/history/evidence/kind fields;
- source-to-material binding `created_at` / `updated_at` as current-row
  maintenance timestamps, not audit history;
- command-owned timestamp assignment using the factory `now`;
- synchronized update of `source_material_bindings` and
  `MaterialEntity.sourceRefs`;
- narrow command behavior for source upsert, material upsert, canonical
  upsert, source-material binding, material-canonical binding, and material
  merge;
- material-canonical binding requires existing material and canonical records;
- material-canonical binding is idempotent for the same canonical ref and
  rejects binding the material to a different canonical ref;
- `upsertMaterialRecord` cannot mark a material as canonical-confirmed without
  `bindMaterialToCanonical`;
- material merge canonical pointer behavior, including rejection of conflicting
  canonical refs;
- material merge `movedBindings` are after-state current bindings, not
  before-state history;
- canonical record status persistence without canonical review/apply/merge
  workflow;
- status changes occur through invariant-preserving commands, not standalone
  status toggles;
- `upsertMaterialRecord` cannot bypass binding consistency by replacing
  `MaterialEntity.sourceRefs` directly;
- `upsertMaterialRecord` cannot bypass canonical confirmation by writing
  `MaterialEntity.canonicalRef` directly;
- `upsertMaterialRecord` uses patch-style input and does not accept a full
  `MaterialEntity`;
- `primarySourceRef` cannot point to an unbound source;
- repository methods stay low-level and transaction-free;
- repository lookup misses return `undefined`, while commands throw
  `MusicDataPlatformError` when required records are missing;
- commands coordinate multi-repository consistency;
- internal command return values may be full records, while agent-facing
  surfaces must not expose storage records;
- Music Data Platform invariant violations throw `MusicDataPlatformError` and
  do not return Stage Interface `Result<T>`;
- rollback of a command that writes multiple identity tables;
- absence of `recordId` in active formal contracts.

## Acceptance

Phase 5 is complete when:

- formal contracts no longer expose `recordId`;
- source/material/canonical records use entity refs plus `refKey(ref)` as the
  only identity key policy;
- Music Data Platform owns its schema contribution;
- source/material/canonical record persistence exists behind Music Data
  Platform-owned ports;
- source provider identity lookup is stable and ordinary source upsert cannot
  remap one provider identity to another `sourceRef`;
- Phase 5 does not generate source refs; it validates and persists source
  identities supplied by upstream provider/import/materialization code;
- Phase 5 does not generate material refs or canonical refs; it validates and
  persists identities supplied by upstream materialization/canonical code;
- source-to-material binding facts exist behind Music Data Platform-owned
  ports;
- source-to-material binding rows represent the current binding only and do
  not carry status/history/evidence/audit/kind fields in Phase 5;
- source-to-material binding timestamps are current-row maintenance fields, not
  history/audit records;
- commands assign `createdAt` / `updatedAt`; repositories do not generate
  timestamps;
- `MaterialEntity.primarySourceRef` remains the only Phase 5 primary-source
  signal;
- any non-empty `MaterialEntity.primarySourceRef` must be included in the
  material's current source-material bindings;
- `MaterialEntity.sourceRefs` remains persisted in `entity_json` and is kept
  consistent with `source_material_bindings` by the identity write command;
- `MaterialEntity.sourceRefs` changes only through `bindSourceToMaterial` or
  `mergeMaterialRecord`;
- `upsertMaterialRecord` uses patch-style input and does not accept a full
  `MaterialEntity`;
- `MaterialEntity.canonicalRef` changes only through
  `bindMaterialToCanonical` or an unambiguous `mergeMaterialRecord`
  inheritance;
- `upsertMaterialRecord` does not accept `canonicalRef` and cannot mark a
  material as canonical-confirmed without an existing canonical binding;
- Phase 5 uses narrow identity write commands instead of one broad
  `writeIdentity(...)` union;
- repositories and commands are separate: repositories persist exact records or
  bindings, while commands coordinate multi-table Music Data Platform writes;
- internal Music Data Platform commands may return full records, but
  Stage Interface must project command results before returning anything to
  agents;
- internal Music Data Platform repositories and commands throw
  `MusicDataPlatformError` for invariant violations and do not return
  `Result<T>`;
- repository lookup misses return `undefined`; command-level required-record
  misses throw `MusicDataPlatformError`;
- direct source-to-canonical binding tables remain out of Phase 5;
- identity writes can be coordinated through one root transaction;
- material merge is in Phase 5 because it must move source-material bindings
  and set `mergedIntoMaterialRef`;
- material merge may inherit an unambiguous loser `canonicalRef`, but must
  reject conflicting winner/loser canonical refs;
- material merge does not automatically inherit loser `primarySourceRef`;
- material merge returns moved bindings as after-state current rows only;
- canonical merge command is deferred to canonical maintenance, even though
  `CanonicalRecord` may contain `mergedIntoCanonicalRef`;
- `upsertCanonicalRecord` may persist `active`, `provisional`, and `archived`
  records, and may round-trip `merged` records, but does not implement the
  command that creates canonical merges;
- Phase 5 does not introduce standalone status update commands;
- command audit remains out of Phase 5 and should be designed later with real
  repair, migration, canonical review, or feedback traceability needs;
- repositories do not start transactions;
- Music Data Platform does not import SQLite primitives;
- Storage does not know Music Data Platform semantics;
- provider, query, Stage Interface, owner facts, projections, Memory, and
  Music Experience remain out of scope;
- docs and guards record the boundary so later phases cannot accidentally
  widen it;
- Music Data Platform area docs exist and describe only the Phase 5 identity
  write model authority.

## Stopping Condition

Stop after the identity write model and binding facts are implemented and
tested. Do not continue into provider import, query, presentation, owner facts,
canonical review, projections, or runtime database wiring in the same phase.

## Deferred Questions

The following questions remain outside Phase 5:

- whether a future workflow needs an `unbindSourceFromMaterial` business
  command;
- exact mutation-audit requirements for a later repair, migration, canonical
  review, or feedback traceability slice.
