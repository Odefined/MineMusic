# Phase 7 Source Library Import Foundation Implementation Plan

> Status: Draft execution plan
> Spec: `phase-7-source-library-import-foundation.md`
> Owning bounded contexts: Music Data Platform / Library Import, Extension /
> Platform Library Provider Slot, Stage Core composition

## Goal

Implement Phase 7 as the first source-library import foundation.

Phase 7 should prove this path:

```text
NCM plugin
-> platform-library-provider slot
-> Library Import application service
-> Music Data Platform source records
-> source library item records
-> source-backed material records
-> source-material bindings
```

The result is a real local source pool for saved tracks, saved albums, and
followed artists. It is not query output, projection tables, recommendation,
or final presentation.

## Non-Goals

- Do not implement local pool query, query hits, ranking, retrieval, or search
  projections.
- Do not implement source library track/album/artist projection tables.
- Do not expose public Stage Interface import tools, Handbook entries, public
  DTOs, or `MaterialCard` output.
- Do not implement canonical review, canonical merge/split, source-to-
  canonical direct binding, or cross-provider identity matching.
- Do not implement owner facts, Collection membership, wrong-version,
  not-playable, favorite, blocked, liked, or disliked facts.
- Do not implement update baselines, removed-from-library reconciliation,
  stale item handling, or incremental update policy.
- Do not implement provider login, OAuth, cookie refresh, secrets, reauth,
  dynamic plugin loading, or compatibility layers for old MVP import behavior.
- Do not persist or return raw provider payloads in default import results.
- Do not edit `CONTEXT.md`.

## Ownership And Boundaries

Owned by Music Data Platform:

- source library item persistence;
- import batch persistence;
- import item outcome persistence;
- Library Import application service;
- source-backed material creation through the shared material ref factory;
- source upsert, material upsert, and source-material binding orchestration.

Owned by Extension:

- `platform-library-provider` capability slot;
- slot registration and validation;
- provider library read seam;
- NCM platform library provider mapping from provider responses to normalized
  `PlatformLibraryCandidate` values.

Owned by Stage Core / Server Host composition:

- default runtime wiring for Storage, schema initialization, Extension, and the
  internal Library Import service seam.

Explicitly not owned by Phase 7:

- Stage Interface public tool design;
- compact agent-facing output projection;
- query/retrieval/projection;
- Memory, Music Experience, and Effect Boundary behavior.

## Allowed Capabilities

Allowed reads:

- Platform Library Provider reads through the Extension runtime seam;
- `MusicDatabaseContext` reads through Music Data Platform repositories;
- existing source-material binding lookup;
- source/material records needed to reuse existing bindings and material
  anchors;
- batch state and stored cursor state.

Allowed writes:

- `source_records`;
- `material_records` through existing identity write commands;
- `source_material_bindings` through existing identity write commands;
- Phase 7 source library item table;
- Phase 7 import batch table;
- Phase 7 import item outcome table;
- Extension in-memory capability registration during runtime initialization.

Forbidden imports:

- provider/plugin implementations must not import Music Data Platform or
  storage modules;
- Music Data Platform import code must not import Extension plugin
  implementations such as the NCM plugin;
- Extension source must not import Stage Interface, Stage Core, Server Host, or
  Music Data Platform implementation roots;
- Music Data Platform source must not import concrete SQLite adapter modules;
- no active top-level `src/providers/**`, `src/plugins/**`, `legacy`, or MVP
  compatibility roots.

## Slice 1: Contract Additions

Files:

- `src/contracts/index.ts`
- `test/formal/formal-contracts.test.ts`

Tasks:

- Add `PlatformLibraryKind`:

```ts
type PlatformLibraryKind =
  | "saved_source_track"
  | "saved_source_album"
  | "followed_source_artist";
```

- Add `PlatformLibraryCandidate` with full normalized `SourceEntity`.
- Add `PlatformLibraryReadInput` and `PlatformLibraryReadResult` with cursor
  pagination and optional `totalCountHint`.
- Add source-library import status and outcome types:
  `running | completed | failed` and
  `imported | already_present | failed`.
- Add or expose a shared material ref factory contract for opaque MineMusic
  material refs.
- Add contract tests that prevent `MaterialRef` from encoding source/provider/
  canonical text through the factory.

Acceptance:

- Library provider candidates carry `SourceEntity`, not raw provider payloads.
- Library pagination uses `cursor`, not search `offset`.
- Material ref creation uses an opaque factory path and ordinary callers do
  not supply material ids directly.

## Slice 2: Platform Library Provider Slot

Files:

- `src/extension/platform_library_provider_slot.ts`
- `src/extension/capability_registry.ts`
- `src/extension/plugin_runtime.ts`
- `src/extension/index.ts`
- `test/formal/extension-capability-slot.test.ts`

Tasks:

- Define `platform-library-provider` as a new Extension capability slot.
- Add registration type keyed by `providerId`.
- Validate provider id safety, descriptor shape, supported library kinds, and
  read method availability.
- Add `ExtensionRuntime.readPlatformLibraryProvider(...)`.
- Validate read input:
  - provider id is safe and registered;
  - `libraryKind` is one of the three Phase 7 kinds;
  - `limit`, when present, is positive and bounded;
  - `cursor`, when present, is a non-empty string;
  - `providerAccountId`, when present, is non-empty.
- Validate output:
  - result provider id matches registration;
  - result kind matches requested kind;
  - candidate kind matches `libraryKind`;
  - candidate provider id/source namespace are consistent;
  - candidate carries a valid `SourceEntity`;
  - `nextCursor`, when present, is non-empty.
  - `totalCountHint`, when present, is a non-negative integer.

Acceptance:

- The slot returns validated `PlatformLibraryReadResult`.
- `totalCountHint` is optional and never used as the import completion
  condition.
- The slot does not write Music Data Platform records.
- The slot does not create query hits, projections, material records, or
  presentation output.

## Slice 3: NCM Platform Library Provider

Files:

- `src/extension/plugins/ncm.ts`
- `src/extension/plugins/index.ts`
- `docs/extension/plugins/ncm.md`
- `test/formal/ncm-plugin.test.ts`

Tasks:

- Extend NCM plugin manifest to declare both `source-provider` and
  `platform-library-provider`.
- Register NCM platform library provider with `providerId = netease`.
- Implement reads for:
  - `saved_source_track`;
  - `saved_source_album`;
  - `followed_source_artist`.
- Map NCM source endpoints:
  - `saved_source_track` reads liked-music playlist detail, using `trackIds`
    order and `trackIds[].at` when available; do not use `/likelist` as the
    import fact source;
  - `saved_source_album` reads `/album/sublist` and maps `subTime` to
    `addedAt` when available;
  - `followed_source_artist` reads `/artist/sublist` and does not invent
    `addedAt` when no per-artist timestamp exists.
- Reuse provider-normalized source mapping patterns from NCM search where
  possible.
- Preserve source links, availability hints, version info, artist source refs,
  album source refs, and track position when provider data supplies them.
- Map provider pagination to shared cursor internally.
- Keep provider account and page-size details plugin/config-owned.

Acceptance:

- NCM library reads return `PlatformLibraryCandidate[]` for tracks, albums,
  and artists.
- Active Phase 7 contracts use `saved_source_album`, not old MVP
  `saved_source_release` wording.
- No raw NCM payloads leak into default results.
- NCM plugin still registers source search exactly as Phase 6 required.

## Slice 4: Music Data Platform Import Schema And Repositories

Files:

- `src/music_data_platform/source_library_schema.ts`
- `src/music_data_platform/source_library_records.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-source-library.test.ts`

Tasks:

- Add schema contribution for source library import tables.
- Add `source_library_items` keyed by:

```text
provider_id
provider_account_id
library_kind
source_ref_key
```

- Store source library item timestamps:
  `added_at`, `first_imported_at`, `last_seen_at`.
- Do not store material ref, canonical ref, query fields, projection fields,
  rank fields, or card seed fields on source library items.
- Add import batch table with status, provider id, provider account id,
  library kind, stored cursor, optional max new items, processed count, outcome
  counts, optional completion reason, and timestamps.
- Add import item outcome table for imported, already-present, and failed
  outcomes.
- Store compact failed item error code/message plus source or provider
  identity when available.
- Do not add update baseline tables.

Acceptance:

- Repositories round-trip source library items, batches, and item outcomes.
- Repeated item upsert updates `last_seen_at`.
- Schema tests prove source library item fields do not carry material,
  canonical, projection, query, rank, or card fields.

## Slice 5: Library Import Application Service

Files:

- `src/music_data_platform/source_library_import.ts`
- `src/music_data_platform/material_ref_factory.ts`
- `src/music_data_platform/index.ts`
- `test/formal/source-library-import-service.test.ts`

Tasks:

- Implement `startImport(input)`:
  - require explicit `providerId` and one `PlatformLibraryKind`;
  - accept optional `providerAccountId` when the provider/API can resolve the
    current logged-in account;
  - accept optional per-call `limit`;
  - accept optional batch-level `maxNewItems`;
  - create a batch before the first provider read, allowing unresolved account
    id only until the first read completes;
  - process the first provider page;
  - persist the resolved account id on the batch before writing source library
    item records;
  - respect both the per-call `limit` and remaining `maxNewItems` allowance;
  - return complete internal batch/page/item result.
- Implement `continueImport(input)`:
  - accept optional per-call `limit`;
  - process next provider page when batch is running;
  - return current result without writes when batch is completed;
  - return error when batch is failed or unknown.
- For each candidate:
  - upsert `SourceRecord`;
  - look up existing source-material binding;
  - create source-backed `MaterialRecord` through the shared material ref
    factory only when no binding exists;
  - bind source to material;
  - upsert `SourceLibraryItem`;
  - record item outcome.
- Treat `already_present` as membership semantics. Source facts may refresh
  even when membership already exists.
- Treat `maxNewItems` as a batch-level stop condition that counts only
  `imported` outcomes. It does not count `already_present` or `failed`
  outcomes.
- Mark the batch completed with completion reason `max_new_items_reached` when
  the imported count reaches `maxNewItems`.
- Mark the batch completed with completion reason `provider_exhausted` when a
  provider read returns no `nextCursor`.
- Resolve the persisted account scope from caller input or provider result:
  - when caller input includes `providerAccountId`, provider read results must
    match it;
  - when caller input omits `providerAccountId`, provider read results must
    include a non-empty resolved current account id;
  - after the batch has a resolved account id, every later provider read result
    must include the same account id;
  - missing account, login-required, or account-ambiguity failures are provider
    or API failures surfaced through the import result, not account-selection
    behavior owned by Library Import.
- Keep service output complete internally: batch state, provider page metadata,
  item outcomes, source refs, material refs from binding results, source
  library item records, and provider-normalized candidates.
- Do not include raw provider payloads in default output.

Acceptance:

- Import is transactional per processed page.
- Failed page processing marks the batch failed and records compact failures.
- Repeated import is idempotent by source-library membership and existing
  source-material binding lookup.
- Material refs are opaque and created only through the factory.
- `startImport` rejects persistence when neither caller input nor provider
  result supplies a resolved non-empty `providerAccountId`.
- A batch created without caller account id is marked failed when the first
  provider read cannot resolve an account id.
- A running batch is marked failed if a later provider page omits or changes the
  resolved account id.
- Reaching the per-call `limit` ends the current call but leaves the batch
  running when a `nextCursor` remains.
- Reaching batch-level `maxNewItems` completes the batch.

## Slice 6: Runtime Wiring And Smoke

Files:

- `src/server/config.ts`
- `src/server/host.ts`
- `src/stage_core/**` if a runtime contribution seam is needed
- `package.json`
- `test/formal/server-host.test.ts`
- `test/formal/stage-runtime.test.ts`

Tasks:

- Wire explicit database config into default Server Host composition.
- Initialize Storage with Music Data Platform identity schema and Phase 7 source
  library schema.
- Wire Extension runtime with NCM plugin.
- Wire Library Import service behind an internal runtime seam.
- Do not contribute Stage Interface import tools.
- Add opt-in live smoke command for NCM library import with per-call `limit`.
- Smoke tracks, albums, and artists separately.

Acceptance:

- Default runtime can compose database, schemas, Extension, and Library Import
  service without exposing public import tools.
- Runtime status remains compact and does not expose provider registry internals
  or import internals.
- Live smoke skips unless explicitly enabled.

## Slice 7: Documentation And State Sync

Files:

- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `docs/extension/design.md`
- `docs/extension/ports.md`
- `docs/extension/progress.md`
- `docs/extension/plugins/ncm.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`

Tasks:

- Update Music Data Platform design/ports with Source Library Import,
  `SourceLibraryItem`, import batch, item outcome, material ref factory, and
  import service boundary.
- Update Extension design/ports with `platform-library-provider`.
- Update NCM plugin docs with library import mapping/config/smoke behavior.
- Update progress/state docs after implementation.
- Keep area design docs stable and free of mutable task ledger status.

Acceptance:

- `INDEX.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`, and `PROGRESS.md` are each
  updated or explicitly judged not needed in the final state-sync report.

## Verification

Targeted checks:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/formal/formal-contracts.test.js
node .tmp-test/test/formal/extension-capability-slot.test.js
node .tmp-test/test/formal/ncm-plugin.test.js
node .tmp-test/test/formal/music-data-platform-source-library.test.js
node .tmp-test/test/formal/source-library-import-service.test.js
node .tmp-test/test/formal/server-host.test.js
node .tmp-test/test/formal/stage-runtime.test.js
```

Broad checks:

```bash
npm test
git diff --check
git diff --name-only
```

Opt-in live smoke:

```bash
MINEMUSIC_LIVE_NCM=1 npm run smoke:ncm-library-import
```
