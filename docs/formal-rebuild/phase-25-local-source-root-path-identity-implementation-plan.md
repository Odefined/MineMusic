# Phase 25 Local Source Root-Path Identity Implementation Plan

> Status: Implemented
> Owning bounded contexts: Music Data Platform, Server Host / Runtime
> Orchestration, Storage
> Authority inputs: ADR-0042, ADR-0028 deprecated by ADR-0042, `CONTEXT.md`
> Local Source glossary

## Goal

Replace local-file md5 identity with Local Source Root plus normalized
root-relative path identity.

The implementation must remove the current `source_local:<kind>:<md5>` model,
stop using local-file `providerEntityId` as md5 identity, keep `contentMd5` as a
non-unique source fact, and update localize so MineMusic-managed downloads land
under the Main Local Source Root's `downloads/` subtree using non-content-derived
paths.

## Current Problem

The current local-source code collapses several concepts into md5:

- `LocalFileOriginSourceEntity` identifies local files by md5 through
  `providerEntityId` in `src/contracts/music_data_platform.ts`.
- `createLocalSourceRef(...)` creates `source_local:<kind>:<md5>` in
  `src/music_data_platform/local_source_ref.ts`.
- `source_records_local_md5_uidx` enforces md5 uniqueness for local files in
  `src/music_data_platform/identity_schema.ts`.
- `createLocalSource(...)` deduplicates by md5 and treats same-md5/different
  material as a conflict in `src/music_data_platform/local_source_commands.ts`.
- `localize_provider_source_job.ts` finalizes downloads to
  `<root>/tracks/<md5-prefix>/<md5>.<ext>` and treats matching content as
  idempotent success.

ADR-0042 reverses that direction: Local Source identity is
`rootId + normalized relativePath`; content hashes are facts, not identity.

## Non-Goals

- Do not implement local library scan in this phase.
- Do not implement content-drift maintenance or reconciliation.
- Do not add a public Stage Interface localize tool surface.
- Do not preserve compatibility for old local-file shapes or test-era data.
- Do not introduce generic root capabilities. There is one Main Local Source
  Root with reserved `rootId = "main"`; future scan roots are read-only intake
  roots by product convention.

## Architecture Scope

### Owned Writes

- Music Data Platform local-source command writes source records, material
  records, and source-material bindings through the existing source-of-truth
  write boundary.
- Music Data Platform localize handler writes files through its file-store port,
  then registers the Local Source through the local-source command.
- Storage schema changes are owned by Music Data Platform identity schema.

### Allowed Reads

- Existing provider source and source-material binding reads for localize.
- Root runtime config reads from Server Host config.
- Source record lookups by local root/path identity.

### Forbidden Moves

- Do not infer Local Source identity from md5 or any content hash.
- Do not store platform-native absolute paths as SourceEntity identity.
- Do not silently migrate old `providerEntityId = md5` / `filePath` /
  `source_local:<kind>:<md5>` shapes.
- Do not automatically choose `(2)`-style download paths on collision.
- Do not silently update `contentMd5` when an existing path's bytes drift.

## Implementation Slices

### PR 25A: Contracts And Local Path Identity Helpers

**Goal:** Make the executable contract express root/path identity.

Expected files:

- `src/contracts/music_data_platform.ts`
- `src/contracts/storage.ts`
- `src/music_data_platform/local_source_ref.ts`
- New helper if useful:
  `src/music_data_platform/local_source_path.ts`
- `test/formal/formal-contracts.test.ts`
- `test/formal/music-data-platform-local-source.test.ts`

Tasks:

1. Change `LocalFileOriginSourceEntity` to carry `rootId`,
   `relativePath`, and `contentMd5`.
2. Remove local-file `providerEntityId`, `providerId`, and platform-native
   `filePath` from the local-file contract.
3. Add constants/helpers for the reserved main root id `main`,
   MineMusic-normalized relative paths, and opaque local-source ref ids.
   The local-source ref id is fixed as
   `ls_${createDeterministicRefDigest([rootId, normalizedRelativePath])}`,
   reusing `src/music_data_platform/ref_digest.ts` in the same pattern as
   `createSourceLibraryRef(...)`.
4. Reject absolute paths, drive paths, empty paths, and `..` paths that escape
   the root; preserve case, symlink shape, and Unicode as supplied by the
   boundary.
5. Keep md5 validation only for `contentMd5`, not for source identity.
6. If a new helper file such as `local_source_path.ts` is introduced, add it to
   `test/formal/active-tree.test.ts`'s exact Music Data Platform file list.

Required guards/tests:

- Contract type test rejects local `providerEntityId`.
- Same `contentMd5` with different relative paths can produce different local
  refs.
- Path normalizer accepts `Albums/./A.flac` as `Albums/A.flac`.
- Path normalizer rejects `/Albums/A.flac`, `C:\Music\A.flac`, `../A.flac`,
  and paths escaping root after normalization.
- `source_local:<kind>:<md5>` is no longer a valid local-source construction
  path.
- Any new formal test file is registered in `test/run-stage-core-tests.ts`; note
  that `test/formal/formal-contracts.test.ts` already exists and is already
  registered.

### PR 25B: Identity Schema, Records, And Write-Model Guards

**Goal:** Persist and enforce local identity by root/path, not md5.

Expected files:

- `src/music_data_platform/identity_schema.ts`
- `src/music_data_platform/identity_records.ts`
- `src/music_data_platform/identity_write_model.ts`
- `src/music_data_platform/errors.ts`
- `src/contracts/storage.ts`
- `test/formal/music-data-platform-identity.test.ts`
- `test/formal/music-data-platform-local-source.test.ts`

Tasks:

1. Add local lookup columns to `source_records`: `local_root_id`,
   `local_relative_path`, and `local_content_md5`. These columns are nullable at
   table level because provider rows do not use them; local-row write/read
   guards require all three.
2. Preserve provider lookup columns for provider rows.
3. Replace `source_records_local_md5_uidx` with a partial unique index on
   `(local_root_id, local_relative_path, kind)` where `origin = 'local_file'`.
4. Update `SourceRecord.lookup` shape so provider rows expose provider identity
   and local rows expose root/path/content facts.
5. Change `findByLocalIdentity(...)` to accept `rootId`, `relativePath`, and
   `kind`.
6. Update row/entity integrity checks so local rows must agree on
   root/path/content hash and must not carry provider columns.
7. Update `upsertSourceRecord(...)` conflict detection:
   provider rows use `(providerId, providerEntityId, kind)`;
   local rows use `(rootId, relativePath, kind)`.
8. Make schema application idempotent for already-created formal databases:
   use `ALTER TABLE source_records ADD COLUMN IF NOT EXISTS ...` for new local
   columns, `DROP INDEX IF EXISTS source_records_local_md5_uidx`, and
   `CREATE UNIQUE INDEX IF NOT EXISTS source_records_local_root_path_uidx ...`.
   Do not rely on `CREATE TABLE IF NOT EXISTS source_records` to add columns to
   an existing table.
9. Keep error-code semantics explicit:
   - `music_data.local_source_identity_conflict`: root/path/kind local identity
     already points to a different source ref.
   - `music_data.local_source_material_conflict`: the same local source ref is
     already bound to a different material.

Required guards/tests:

- Two local rows with same `contentMd5` and different paths are allowed.
- Two local rows with same root/path/kind and different refs are rejected.
- Provider rows still reject duplicate provider identity.
- Old local entity shape with `providerEntityId` or `filePath` crashes at the
  write boundary.
- Row corruption guard catches local row/entity disagreement.
- Row corruption guard checks `rootId`, `relativePath`, and `contentMd5`
  agreement for local rows, requires local lookup columns to be non-null for
  local rows, and requires provider lookup columns to be null for local rows.

Schema note:

This is a destructive formal-rebuild change. Do not add compatibility shims for
old local-source rows. If active local test databases need cleanup, reset them
outside application code.

### PR 25C: Local Source Command Contract

**Goal:** Make `createLocalSource(...)` register root/path local files and stop
owning md5 dedupe.

Expected files:

- `src/music_data_platform/local_source_commands.ts`
- `src/music_data_platform/local_source_ref.ts`
- `src/music_data_platform/errors.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-local-source.test.ts`
- `test/formal/server-music-data-platform-runtime-module.test.ts`

New command input:

```ts
createLocalSource({
  rootId,
  relativePath,
  contentMd5,
  kind: "track",
  materialRef?,
  descriptiveMetadata?
})
```

Tasks:

1. Remove `md5` and `filePath` from command input.
2. Normalize and validate `relativePath` at the command boundary.
3. Build `sourceRef` with
   `source_local:<kind>:ls_<createDeterministicRefDigest([rootId, normalizedRelativePath])>`.
4. Build local `SourceTrack` with `rootId`, normalized `relativePath`, and
   `contentMd5`.
5. Preserve scenario A: no `materialRef` creates a recording material and binds
   the local source.
6. Preserve scenario B: `materialRef` binds the local source to the existing
   material without stealing provider primary-source semantics.
7. Idempotency is by same local source ref:
   same root/path replay returns the existing material when no conflicting
   material is requested; same root/path with a different requested material is a
   source/material conflict; same `contentMd5` at a different path is not a
   conflict.
8. Placeholder metadata should no longer say `Local file <md5 prefix>`; use a
   path-derived fallback such as the filename stem or source key.
9. Return declared errors with stable meanings:
   `music_data.local_source_material_conflict` for same source ref / different
   requested material, and let root/path identity conflicts from the write model
   surface as `music_data.local_source_identity_conflict`.

Required guards/tests:

- Same root/path replay is idempotent.
- Same root/path with different material is conflict.
- The conflict above uses `music_data.local_source_material_conflict`.
- Same `contentMd5` at different paths can bind to the same material or to
  different materials.
- `contentMd5` mismatch for an existing path is not silently updated in this
  command; future maintenance owns content drift.

### PR 25D: Localize Path Policy And File Finalization

**Goal:** Localize writes non-content-derived paths under `main/downloads/`,
then registers the resulting root/path Local Source.

Expected files:

- `src/music_data_platform/localize_provider_source_job.ts`
- `src/music_data_platform/localize_provider_source_commands.ts`
- `src/music_data_platform/errors.ts`
- `src/server/config.ts`
- `src/server/music_data_platform_runtime_module.ts`
- `test/formal/music-data-platform-localize-provider-source.test.ts`
- `test/formal/server-music-data-platform-runtime-module.test.ts`

Tasks:

1. Treat `localSources.rootDir` / `MINEMUSIC_LOCAL_SOURCES_ROOT` as the machine
   path for the Main Local Source Root (`rootId = "main"`).
2. Generate download relative paths under
   `downloads/<artist>/<album>/<track> - <title> [<source-key>].<ext>`.
   `<source-key>` is the filename-safe short form of the provider source ref:
   start from `refKey(providerSourceRef)` and replace `:` with `-`, then pass it
   through the same filename-component sanitizer as the rest of the path.
3. Sanitize path components without using content hash:
   replace separators/control characters, cap component length if needed, use
   `Unknown Artist` / `Unknown Album`, and use source key as the filename stem
   when title is missing.
4. Keep staged writes and content hash calculation for integrity and
   `contentMd5`.
5. Change finalization semantics:
   if final path is free, move staging file there and register
   `rootId = "main"`, normalized relative path, and `contentMd5`;
   if final path exists and matching Local Source registration already exists,
   remove staging file and return idempotent success;
   if final path exists without matching Local Source registration, fail path
   conflict;
   do not compare content hashes to decide identity or reuse.
6. Do not auto-create `(2)` sibling paths.
7. Keep registration-failure cleanup only for files this handler just moved.
8. Use `music_data.localize_final_path_collision` for the unregistered existing
   path conflict unless this slice deliberately renames the error. Its meaning
   after ADR-0042 is path collision, not content collision.

Required guards/tests:

- Localize path no longer contains md5 prefix/hash.
- Missing artist/album/title uses explicit fallback path components.
- Existing registered same path is idempotent success.
- Existing unregistered file is path conflict, regardless of content hash.
- Same content from two different target paths registers two Local Sources.
- Registration failure removes only newly moved files.
- Missing main root config remains a declared config error.

### PR 25E: Projection, Search, And Presentation Fixture Repair

**Goal:** Update tests and fixtures that construct local sources directly.

Expected files:

- `test/formal/music-data-platform-material-projection.test.ts`
- `test/formal/music-data-platform-search-metadata-projection.test.ts`
- `test/formal/music-experience-present.test.ts`
- Any helper that creates `origin: "local_file"` fixtures.
- Projection source files only if they explicitly read local `providerEntityId`
  or `filePath`.

Tasks:

1. Replace local fixture fields with `rootId`, `relativePath`, and
   `contentMd5`.
2. Ensure source preference policy `{ origin: "local_file" }` still means
   "prefer local origin", not a particular root.
3. Keep projected public outputs compact; do not expose raw root/path unless an
   existing output contract explicitly needs local file navigation.
4. Ensure metadata projection uses descriptive metadata, not path-derived
   identity, for music facts.

Required guards/tests:

- Existing material projection tests pass with root/path local sources.
- No public Stage Interface output leaks machine paths.
- Veil guard still rejects internal provider/source identity fields where
  public output should hide them.

### PR 25F: Documentation And State Sync

**Goal:** Make current authority match implementation after code lands.

Expected files:

- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`
- `docs/formal-rebuild/README.md`
- This plan document

Tasks:

1. Update `ARCHITECTURE.md` SourceEntity local-file language from md5 identity
   to root/path identity.
2. Update `CURRENT_STATE.md` and `PROGRESS.md` after each implemented slice, not
   before.
3. Keep ADR-0028 deprecated and ADR-0042 as the durable decision.
4. Mark this plan's status implemented only after verification passes.

State-sync checklist at completion:

- `INDEX.md`: updated with plan/ADR pointers.
- `CURRENT_STATE.md`: updated to implementation truth.
- `ARCHITECTURE.md`: updated if SourceEntity identity wording changes.
- `PROGRESS.md`: updated with completed phase/slice summary.

## Verification

Narrow checks first:

```bash
npm run build:test
```

Then broaden when local-source/localize slices land:

```bash
npm run typecheck
npm run test:stage-core
git diff --check
```

If Postgres integration tests require environment setup, run them only with a
configured `MINEMUSIC_TEST_DATABASE_URL`; do not add hidden Docker/test-database
ownership to the test harness.

## Acceptance Criteria

- Local `SourceEntity` contract has no provider identity and no platform-native
  path identity.
- Local source refs are derived from root/path, not content hash.
- DB local uniqueness is by `kind + rootId + relativePath`.
- Same `contentMd5` at different paths is allowed.
- Localize writes under `main/downloads/` using non-content-derived paths.
- Existing registered same path is idempotent success; existing unregistered
  path is conflict.
- Old md5 local-source shape fails at the boundary.
- Current authority docs no longer describe content-addressed localize paths as
  active behavior.

## Stopping Condition

Stop when ADR-0042 is implemented end to end, the local-source/localize formal
tests cover the new identity contract, and the state-sync checklist reports all
root state documents updated or not needed.
