# Phase 23 Library Catalog Tools Implementation Plan

> Status: Implemented
> Owner: Music Data Platform stage adapter, with Stage Interface public
> contract/schema ownership and Server Host composition.

## Goal

Give agents read-only access to the owner's MineMusic catalog through
`library.catalog.*` tools:

- `library.catalog.list_scopes`;
- `library.catalog.browse`;
- `library.catalog.sample`;
- `library.catalog.summary`.

These tools let an agent inspect existing library membership, sample catalog
items, and gather compact taste evidence without using provider search,
recommendation judgement, Memory, raw rows, or storage refs.

## Public Contract

`library.catalog.list_scopes` lists only catalog-usable scopes:

- `{ kind: "library" }`;
- `{ kind: "source_library", id }`;
- `{ kind: "relation", id }`;
- future `{ kind: "collection", id }`.

It excludes provider scopes and the aggregate `all` scope. Scope ids are opaque
pass-back ids. Agents must read `description` to understand whether a scope is
an imported source-library membership such as NetEase saved recordings or a
MineMusic relation such as favorite recordings.

`library.catalog.browse` returns compact `{ item, description }` entries and an
optional opaque cursor. `limit` is capped at 100. Default sort is newest-first
time order; `sort: "dictionary"` orders by public description label.

`library.catalog.sample` requires caller-provided `seed` and `count`, with
`count` capped at 100. The same owner library state, scope, count, and seed
produce the same selected materials. Changing the seed asks for a different
sample. This tool does not implement the summary timeline sampling rule.

`library.catalog.summary` requires `sampleCount`, capped at 100. It returns:

- four time-band sample groups from the selected population sorted by owner
  catalog `recentlyAddedAt` from earliest to latest:
  `earliest_25`, `25_50`, `50_75`, `latest_25`;
- samples distributed as evenly as possible across those four bands;
- within-band sampling that tries to avoid repeated artist text when enough
  distinct artists exist;
- concentration signals computed only inside material-kind boundaries:
  recording artist, recording album, album artist, and artist item;
- at most 10 signals per signal kind, each with `count` and up to five public
  item examples;
- for `scope: { kind: "library" }` only, `membershipSignals` grouped by the
  same selectable source-library and relation scopes returned by
  `library.catalog.list_scopes`, each with distinct-material `count` and up to
  five public examples.

`scope: { kind: "library" }` means the owner-visible MineMusic library baseline:
deduped active catalog materials, active positive catalog membership included,
active blocked materials excluded, provider candidates excluded. Provider
membership is not split unless it appears as an imported source-library
membership signal.

## Ownership And Boundaries

Music Data Platform owns catalog truth and the `library.catalog` stage adapter.
Stage Interface owns the public TypeScript contract, generated JSON schemas,
validation, public handles, and cursor veil port. Server Host only composes the
runtime modules.

Allowed reads:

- `owner_material_catalog_view`;
- `owner_material_entries`;
- `search_metadata_documents`;
- existing source-library and owner-relation scope availability metadata.

Allowed writes:

- none. These tools are read-only. Browse cursor registration uses the existing
  Stage Interface `LookupCursorStore` runtime-state veil.

Forbidden:

- provider search or provider account reads;
- direct repository writes;
- exposing material refs, source-library refs, owner-relation pool refs,
  provider account ids, raw rows, or raw provider payloads;
- mixing recording/album/artist populations in one concentration count;
- genre/style/mood/Memory/recommendation inference inside the tool output.

## Implementation

- `src/contracts/stage_interface.ts` defines the
  `LibraryCatalog*` public input/output types.
- `scripts/generate-stage-interface-schemas.mjs` generates schemas and overlays
  structural bounds for `limit`, `count`, `sampleCount`, `cursor`, and `seed`.
- `src/music_data_platform/library_catalog_read.ts` provides the narrow read
  port from owner catalog projection plus search metadata.
- `src/music_data_platform/stage_adapter/catalog.ts` owns descriptors,
  handlers, public item shaping, scope resolution, browse cursor replay,
  deterministic seed sampling, summary time bands, concentration signals, and
  membership signals.
- `src/server/library_catalog_runtime_module.ts` adapts the initialized Music
  Data Platform runtime ports into the catalog RuntimeModule.

## Guards And Verification

Implemented guards:

- generated Stage Interface schemas for all catalog inputs and outputs;
- handler tests for scope listing, browse ordering/cursors, deterministic
  sample behavior, summary bands, kind-separated concentration signals, and
  library-only membership signals;
- server module wiring test that provider scopes are not part of the catalog
  module contribution.

Verification commands:

```bash
npm run typecheck
npm run build:test
node ./.tmp-test/test/formal/library-catalog-tools.test.js
npm run test:stage-core
git diff --check
git diff --name-only
```

## Acceptance

The phase is complete when the default Server Host exposes the four
`library.catalog.*` tools, every output uses public library handles plus public
descriptions only, and the summary output gives enough compact evidence for an
agent to understand source-library versus saved/favorite membership without
provider/raw storage leakage.
