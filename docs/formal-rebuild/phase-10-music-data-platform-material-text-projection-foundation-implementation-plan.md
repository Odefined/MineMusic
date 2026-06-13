# Phase 10 Music Data Platform Material Text Projection Foundation Implementation Plan

> Status: Implemented execution plan
> Spec: `phase-10-music-data-platform-material-text-projection-foundation.md`
> Owning bounded context: Music Data Platform / Material Text Projection

## Goal

Implement Phase 10 as the material-centered text projection foundation.

Phase 10 adds owner-neutral, durable material text read models:

```text
material_records + source_material_bindings + source_records + confirmed active canonical_records
-> material_text_documents
-> material_text_fts
```

The result is an internal Music Data Platform projection and FTS probe. It is
not a query engine, owner catalog search, Stage Interface tool, provider mixed
search, ranking policy, or MaterialCard output.

## Non-Goals

- Do not implement public Stage Interface search/query/import tools.
- Do not implement Music Intelligence query engine behavior, pool algebra,
  owner-visible search, ranking, broad OR recall, semantic expansion, fuzzy
  match, CJK segmentation, transliteration, pinyin/kana/romaji aliases, typo
  tolerance, query hits, query-to-present handoff, or `MaterialCard`.
- Do not implement provider search temp candidates, provider candidate cache,
  or materialization of provider candidates.
- Do not implement dirty-projection marking, triggers, background workers,
  automatic rebuild orchestration, runtime startup rebuild, or import-path
  synchronous refresh.
- Do not write `source_records`, `material_records`, `canonical_records`,
  `source_material_bindings`, source-library facts, owner catalog rows, owner
  relation rows, collection facts, signals, feedback, correction, or
  presentation state.
- Do not export normalization/dedupe helpers from the Music Data Platform
  barrel.
- Do not edit `CONTEXT.md`.

## Ownership And Boundaries

Owned by Music Data Platform / Material Text Projection:

- `material_text_documents` schema contribution;
- `material_text_fts` schema contribution;
- material text normalization and field-level dedupe;
- material text document construction;
- material text read port;
- explicit material ref rebuild commands;
- FTS match probe for internal tests and later Music Intelligence consumption.

Explicitly not owned by Phase 10:

- Stage Interface schemas, handlers, tools, compact outputs, or public DTOs;
- Extension provider/plugin contracts or implementations;
- owner catalog query semantics and owner-visible search;
- Music Intelligence retrieval/ranking/query planning;
- presentation/card shaping;
- dirty projection scheduler/worker policy.

Allowed reads:

- `material_records` for active material rows, kind, identity status,
  `primarySourceRef`, `canonicalRef`, and `versionInfo`;
- `source_material_bindings` as the current source-to-material binding truth;
- `source_records` joined from current source bindings;
- `canonical_records` only for confirmed active canonical text;
- `material_text_documents` and `material_text_fts` through the material text
  read port and rebuild commands;
- shared `Ref`, `refKey(...)`, `MaterialEntityKind`, and `VersionInfo`
  contracts.

Allowed writes:

- `material_text_documents` through material text rebuild commands only;
- `material_text_fts` through material text rebuild commands only;
- schema creation for the material text document and FTS tables.

Forbidden writes:

- `source_records`;
- `material_records`;
- `canonical_records`;
- `source_material_bindings`;
- source-library rows;
- owner catalog rows or views;
- owner relation rows;
- collection, signal, feedback, correction, event, memory, effect, query, or
  presentation rows.

Forbidden imports:

- Music Data Platform -> Stage Interface;
- Music Data Platform -> Extension/provider implementations;
- Music Data Platform -> Music Intelligence/query/retrieval/presentation roots;
- Music Data Platform -> concrete SQLite adapter modules or `node:sqlite`;
- Stage Interface -> material text projection record shapes;
- provider/plugin code -> material text projection commands.

## Expected Files

Expected new files:

- `src/music_data_platform/material_text_projection_schema.ts`
- `src/music_data_platform/material_text_normalization.ts`
- `src/music_data_platform/material_text_projection_records.ts`
- `src/music_data_platform/material_text_projection_commands.ts`
- `test/formal/music-data-platform-material-text-projection.test.ts`

Expected existing files to edit:

- `src/music_data_platform/index.ts`
- `src/server/music_data_platform_runtime_module.ts`
- `test/formal/active-tree.test.ts`
- `test/run-stage-core-tests.ts`
- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `docs/formal-rebuild/phase-10-music-data-platform-material-text-projection-foundation.md`
- `docs/formal-rebuild/README.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`

`ARCHITECTURE.md` is expected to change only if the current top-level Music
Data Platform boundary does not already cover internal projections and read
models clearly enough after the area docs are updated.

## Slice 1: Schema, Barrel Exports, And Guards

Files:

- `src/music_data_platform/material_text_projection_schema.ts`
- `src/music_data_platform/index.ts`
- `src/server/music_data_platform_runtime_module.ts`
- `test/formal/music-data-platform-material-text-projection.test.ts`
- `test/formal/active-tree.test.ts`
- `test/run-stage-core-tests.ts`

Tasks:

- Add `musicDataPlatformMaterialTextProjectionSchema` with contribution id:

```text
music_data_platform.material_text_projection_v1
```

- Create `material_text_documents`:

```sql
CREATE TABLE IF NOT EXISTS material_text_documents (
  material_ref_key TEXT PRIMARY KEY,
  material_kind TEXT NOT NULL,
  title_text TEXT NOT NULL DEFAULT '',
  artist_text TEXT NOT NULL DEFAULT '',
  album_text TEXT NOT NULL DEFAULT '',
  version_text TEXT NOT NULL DEFAULT '',
  alias_text TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  document_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (material_kind IN ('recording', 'album', 'artist', 'work', 'release')),
  FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
);
```

- Create `material_text_fts` with FTS5 `unicode61`:

```sql
CREATE VIRTUAL TABLE material_text_fts USING fts5(
  material_ref_key UNINDEXED,
  title_text,
  artist_text,
  album_text,
  version_text,
  alias_text,
  tokenize = 'unicode61'
);
```

- Do not index `search_text`.
- Export the schema contribution and Phase 10 public type/factory surfaces from
  `src/music_data_platform/index.ts`.
- Append schema wiring after:

```text
musicDataPlatformOwnerCatalogViewSchema
```

- Update the active-tree guard allowlist for the four new Music Data Platform
  files.
- Add the new formal test module to `test/run-stage-core-tests.ts`.

Acceptance:

- Schema contribution creates exactly `material_text_documents` and
  `material_text_fts`.
- `material_text_documents.material_ref_key` has the FK to
  `material_records(ref_key)`.
- `material_text_documents.material_kind` rejects unsupported values.
- FTS column inspection proves `search_text` is not indexed.
- Schema order is explicit and includes material text projection after existing
  Music Data Platform schemas.
- Active-tree guard allows only intended new files.

## Slice 2: Normalization And Read Port

Files:

- `src/music_data_platform/material_text_normalization.ts`
- `src/music_data_platform/material_text_projection_records.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-material-text-projection.test.ts`

Tasks:

- Implement area-internal normalization:
  - trim;
  - collapse whitespace;
  - Unicode `NFKC`;
  - JavaScript `String.prototype.toLowerCase()`;
  - field-level dedupe by normalized value.
- Do not use `toLocaleLowerCase()`.
- Implement strict plain-text FTS query construction:
  - normalize input;
  - split on whitespace;
  - quote each token as a phrase token;
  - escape embedded double quotes by doubling them;
  - join tokens with `AND`.
- Keep normalization/query helpers area-internal. Do not barrel-export them.
- Add `MaterialTextDocumentRecord`, `MaterialTextMatchRecord`,
  `MaterialTextProjectionReadPort`, `CreateMaterialTextProjectionRecordsInput`,
  `GetMaterialTextDocumentInput`, and `MatchMaterialTextDocumentsInput`.
- Implement:

```ts
createMaterialTextProjectionRecords({ db })
```

with:

```ts
getMaterialTextDocument({ materialRef })
matchMaterialTextDocuments({ text, limit? })
```

- `getMaterialTextDocument` reads `material_text_documents`.
- `matchMaterialTextDocuments` uses `material_text_fts` for `MATCH`, joins
  `material_text_documents` by `material_ref_key`, returns no `searchText`, and
  orders by `material_ref_key ASC`.
- `limit` defaults to 20 and must be a positive integer no greater than 100.
- Empty normalized match input is invalid and uses
  `music_data.material_text_projection_invalid`.

Acceptance:

- Record key-set tests pin `MaterialTextDocumentRecord` and
  `MaterialTextMatchRecord`.
- Read-port key-set tests pin `MaterialTextProjectionReadPort`.
- Factory/input key-set tests pin read-port inputs.
- Match rejects empty normalized text and invalid limits.
- Match treats `foo OR bar`, `foo AND bar`, `foo NOT bar`, `NEAR(foo bar)`,
  `abc*`, `-title`, `"quoted"`, and `a:b` as ordinary text tokens.
- Multi-token match is strict conjunctive matching.
- Match is owner-neutral and does not read owner catalog rows.

## Slice 3: Rebuild Commands And Document Builder

Files:

- `src/music_data_platform/material_text_projection_commands.ts`
- `src/music_data_platform/material_text_projection_records.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-material-text-projection.test.ts`

Tasks:

- Add `MaterialTextProjectionCommands`,
  `CreateMaterialTextProjectionCommandsInput`,
  `RebuildMaterialTextDocumentInput`,
  `RebuildMaterialTextDocumentsInput`,
  `RebuildMaterialTextDocumentSummary`, and
  `RebuildMaterialTextDocumentsSummary`.
- Implement:

```ts
createMaterialTextProjectionCommands({ db, now })
```

with:

```ts
rebuildMaterialTextDocument({ materialRef })
rebuildMaterialTextDocuments({ materialRefs })
```

- Treat `now` as an ISO timestamp string. Commands must not read global time.
- Rebuild a missing, merged, archived, or otherwise non-active material by
  deleting both document and FTS rows and returning `outcome: "deleted"`.
- Rebuild an active material by writing a document row and exactly one FTS row,
  even when all projected text fields are empty.
- Batch rebuilds process only caller-supplied refs, dedupe by `materialRefKey`,
  sort by `materialRefKey ASC`, allow empty input, and return per-ref
  `outcomes`.
- Current bound sources must come from
  `source_material_bindings JOIN source_records`, not from
  `material.entity.sourceRefs` alone.
- Use `material.entity.primarySourceRef` only to label a currently bound source
  as `primary_source`.
- Confirmed active canonical text contributes only when all are true:
  - `material.entity.identityStatus === "canonical_confirmed"`;
  - `material.entity.canonicalRef` exists;
  - canonical record exists;
  - `canonicalRecord.status === "active"`.
- Map text by material kind:
  - recording: source track title and canonical label to `title_text`; artists
    to `artist_text`; album label to `album_text`; canonical aliases to
    `alias_text`;
  - album: source album title and canonical album label to `title_text`;
    artists to `artist_text`; canonical aliases to `alias_text`;
  - artist: source artist name and canonical label to `artist_text`;
    source/canonical aliases to `alias_text`; `title_text` empty;
  - work/release: schema support and fallback only.
- Project `MaterialEntity.versionInfo`, `SourceEntity.versionInfo`, and
  `CanonicalEntity.versionInfo` into `version_text`.
- Build `document_json` as `TEXT` with fixed key order:

```text
fields.title
fields.artist
fields.album
fields.version
fields.alias
```

- Contribution object key order is:

```text
source
basis
value
```

- Do not include refs, snapshots, canonical ref keys, source ref keys, or
  material kind in `document_json`.
- Rebuild FTS with delete-then-insert by `material_ref_key`. Do not assume FTS
  uniqueness.

Acceptance:

- Recording, album, and artist projections populate the expected text fields.
- `MaterialEntity.versionInfo`, `SourceEntity.versionInfo`, and confirmed
  active `CanonicalEntity.versionInfo` contribute to `version_text`.
- Non-confirmed canonical rows do not contribute.
- Source binding truth test proves stale `material.entity.sourceRefs` does not
  create independent text.
- Primary source ordering uses only current bindings.
- `documentJson` key order is deterministic and excludes material kind and
  refs.
- Active empty material returns `rebuilt`, writes an empty document row, and
  writes one replacement empty FTS row.
- Rebuilding the same material twice returns exactly one FTS match.
- Rebuilding a non-active or missing material deletes document and FTS rows.

## Slice 4: Documentation, State Sync, And Final Verification

Files:

- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `docs/formal-rebuild/phase-10-music-data-platform-material-text-projection-foundation.md`
- `docs/formal-rebuild/phase-10-music-data-platform-material-text-projection-foundation-implementation-plan.md`
- `docs/formal-rebuild/README.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`
- `ARCHITECTURE.md`, only if needed

Tasks:

- Update Music Data Platform area docs with the implemented material text
  projection schema, read port, command port, and boundary rules.
- Update progress/state docs after code is implemented and verified.
- Keep the Phase 10 spec as design authority for this phase and this plan as
  execution sequencing only.
- Mark the plan implemented only after code, docs, and verification pass.
- Do not add public Stage Interface docs or query docs in Phase 10.
- Do not edit `CONTEXT.md`.

Acceptance:

- `docs/formal-rebuild/README.md` links both Phase 10 spec and implementation
  plan.
- `docs/music-data-platform/ports.md` lists the new schema, read port, and
  command port.
- `docs/music-data-platform/progress.md` records implemented Phase 10 state and
  verification.
- Root state-sync gate is answered:
  - `INDEX.md`: updated or explicitly not needed;
  - `CURRENT_STATE.md`: updated or explicitly not needed;
  - `ARCHITECTURE.md`: updated or explicitly not needed;
  - `PROGRESS.md`: updated or explicitly not needed.

## Verification

Run at minimum:

```text
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```

If a narrower command is useful during development, run it first, but final
verification must include the full project-native test path above.

## Execution Workflow

- Create a fresh branch such as:

```text
codex/phase-10-material-text-projection
```

- Preserve unrelated user changes.
- Commit once per accepted slice when practical.
- Do not merge without explicit review/approval.
- If opening a PR, keep it draft until review is complete.

## Stopping Condition

Phase 10 is complete when:

- schema, records, commands, barrel exports, runtime schema wiring, tests, and
  docs are implemented;
- no forbidden boundary/import/write behavior is introduced;
- all acceptance tests and architecture guards pass;
- state-sync gate is answered in the final report;
- the branch is ready for review or PR according to the user's current request.
