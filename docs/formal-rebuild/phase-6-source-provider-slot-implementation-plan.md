# Phase 6 Source Provider Slot Implementation Plan

> Status: Implemented execution plan
> Spec: `phase-6-source-provider-slot.md`
> Owning bounded context: Extension / Source Provider Slot

## Goal

Implement Phase 6 as a narrow Source Provider Slot search foundation with a
search-only, HTTP-backed NCM plugin connected through default composition.

Phase 6 should prove this path:

```text
NCM plugin
-> ctx.registerSourceProvider(...)
-> source-provider slot
-> ExtensionRuntime.searchSourceProvider(...)
-> SourceProviderSearchResult
```

The result is validated source-provider search output, not query output,
materialization, durable Music Data Platform writes, or presentation.

## Non-Goals

- Do not restore active top-level `src/providers/**` or `src/plugins/**`.
- Do not implement Source Provider `lookup`.
- Do not implement `SourceProvider.getPlayableLinks(...)` refresh.
- Do not implement account library import/update, playlist reads, saved-track
  reads, or account-library reads.
- Do not implement NCM login, cookie refresh, reauth, secrets, provider
  health, rate limits, or cache.
- Do not expose source-provider search as a Stage Interface tool.
- Do not create QueryHit, MaterialCard, materialization, query ranking, or
  presentation output.
- Do not let provider/plugin code import or write Music Data Platform
  repositories, commands, database contexts, or storage contexts.
- Do not edit `CONTEXT.md`.

## Ownership And Boundaries

Owned context:

```text
Extension / Source Provider Slot
```

Allowed read capabilities:

- registered source-provider entries in Extension's capability registry;
- `SourceProvider` descriptor, capabilities, and `search` method;
- NCM HTTP search response inside the NCM plugin implementation only;
- plugin-id keyed runtime config from Server Host composition.

Allowed write capabilities:

- source-provider registration during plugin activation;
- Extension-owned in-memory capability registry writes during runtime
  initialization;
- no durable writes.

Public seam:

```ts
extensionRuntime.searchSourceProvider(input)
```

Input:

```ts
type SourceProviderSearchInput = {
  providerId: string;
  query: SourceQuery;
  sessionId?: string;
};
```

Output:

```ts
type SourceProviderSearchResult = {
  providerId: string;
  query: SourceQuery;
  candidates: readonly ProviderMaterialCandidate[];
};
```

Forbidden imports for `src/extension/source_provider_slot.ts`:

- Music Data Platform modules;
- Stage Interface modules;
- Stage Core modules;
- Server Host modules;
- storage/database modules;
- NCM plugin implementation.

Forbidden imports for `src/extension/plugins/ncm.ts`:

- Music Data Platform modules;
- Stage Interface modules;
- query/materialization/presentation modules;
- storage/database modules.

The NCM plugin may import Extension plugin contracts and formal contracts, but
Source Provider Slot must not import the NCM plugin.

## Implementation Slices

### Slice 1: Contract Additions

Files:

- `src/contracts/index.ts`
- `test/formal/formal-contracts.test.ts`

Tasks:

- Add `offset?: number` to `SourceQuery`.
- Add source-side track position:

```ts
type SourceTrackPosition = {
  discNumber?: string;
  trackNumber?: number;
  trackCount?: number;
};
```

- Add `trackPosition?: SourceTrackPosition` to `SourceTrack`.
- Export the new type through the existing contracts barrel.
- Add contract tests for `SourceQuery` keys and `SourceTrack` keys.

Acceptance:

- `SourceQuery` supports `text`, `targetKinds`, `limit`, and `offset`.
- `SourceTrack` can carry source-side track position without adding generic
  provider payload fields.

### Slice 2: Source Provider Slot Search Seam

Files:

- `src/extension/source_provider_slot.ts`
- `src/extension/plugin_runtime.ts`
- `src/extension/index.ts`
- `test/formal/extension-capability-slot.test.ts`

Tasks:

- Add `SourceProviderSearchInput` and `SourceProviderSearchResult`.
- Harden registration validation so malformed registrations, provider
  descriptors, unsupported descriptor capabilities, and missing declared methods
  fail before the runtime becomes ready.
- Add input validation:
  - `query.text.trim()` must be non-empty;
  - `limit`, when present, must be an integer from `1` through `50`;
  - `offset`, when present, must be a non-negative integer;
  - `targetKinds`, when present, must be non-empty.
- Add output integrity validation:
  - `candidate.sourceEntity.providerId === providerId`;
  - `candidate.sourceEntity.sourceRef.namespace === source_${providerId}`;
  - `candidate.sourceEntity.sourceRef.kind === candidate.sourceEntity.kind`;
  - `sourceRef` components are safe;
  - `providerEntityId` is ref-component safe;
  - `providerScore`, when present, is finite and between `0` and `1`;
  - returned candidate kinds respect `query.targetKinds`.
- Add internal slot helper for source-provider search.
- Add `ExtensionRuntime.searchSourceProvider(input)` and route through the
  helper.
- Map unknown provider, missing capability, missing method, provider failure,
  input validation failure, and output integrity failure to Extension-owned
  `Result` errors.

Acceptance:

- Extension Runtime exposes source-provider search without exposing the raw
  registry.
- Search returns `SourceProviderSearchResult`, not a bare candidate array.
- Source Provider Slot does not mutate provider output.
- Source Provider Slot does not call `getPlayableLinks`.

### Slice 3: NCM Plugin

Files:

- `src/extension/plugins/ncm.ts`
- `src/extension/plugins/index.ts`
- `test/formal/ncm-plugin.test.ts`

Tasks:

- Add `NcmPluginConfig`:

```ts
type NcmPluginConfig = {
  baseUrl?: string;
  fetch?: typeof fetch;
};
```

`fetch` is a plugin-owned transport/test seam. It must not become a generic
Extension activation context dependency.

- Add `createNcmPlugin(config?: NcmPluginConfig): MineMusicPlugin`.
- Use:

```text
pluginId: minemusic.ncm
providerId: netease
```

- Register exactly the `source-provider` capability.
- Implement `SourceProvider.search(...)` only.
- Keep NCM HTTP details inside the plugin.
- Support configurable HTTP target; the old local service default can remain a
  plugin default, not a slot rule.
- Map search request:
  - `keywords = query.text.trim()`;
  - `limit = normalized query.limit`;
  - `offset = normalized query.offset`;
  - `type = 1` for track, `10` for album, `100` for artist.
- Read response arrays:
  - track: `result.songs`;
  - album: `result.albums`;
  - artist: `result.artists`.
- For omitted `targetKinds`, default to NCM track search.
- For multiple target kinds, split `limit` as a total result cap and combine
  candidates without exceeding the cap.
- Reject multi-kind search with `offset > 0`.
- Drop raw items without usable stable provider entity ids.
- Do not synthesize `providerScore`.
- Preserve provider result order.
- Map source refs with `source_netease` namespace.
- Map NCM track fields:
  - `title`;
  - `artistLabels`;
  - `artistSourceRefs` only from stable artist ids;
  - `albumLabel`;
  - `albumSourceRef`;
  - `durationMs`;
  - optional `trackPosition` only when search payload already carries usable
    position facts;
  - `versionInfo`;
  - `providerUrl`;
  - track `links` when not unavailable.
- Map NCM album fields:
  - `title`;
  - `artistLabels`;
  - `artistSourceRefs` from `album.artists[]` first, with `album.artist`
    fallback;
  - `releaseDate` when available;
  - `versionInfo`;
  - `providerUrl`;
  - no album `links`.
- Map NCM artist fields:
  - `name`;
  - `aliases` from visible alias/translation fields;
  - `providerUrl`;
  - no default artist `versionInfo`;
  - no artist `links`.
- Implement conservative version extraction from explicit version phrases only.
- Map invalid config and provider errors to safe errors without exposing raw
  payloads.

Acceptance:

- NCM plugin is a real plugin, not a test fixture.
- NCM plugin owns HTTP/client/mapping details.
- MineMusic core sees only `MineMusicPlugin` and `SourceProvider`.
- NCM plugin does not import Music Data Platform, Stage Interface, query,
  materialization, presentation, storage, or database modules.

### Slice 4: Default Composition And Config

Files:

- `src/server/config.ts`
- `src/server/host.ts`
- `src/server/index.ts`
- `src/stage_core/extension_runtime_module.ts`
- `test/formal/server-host.test.ts`
- `test/formal/stage-runtime.test.ts`

Tasks:

- Add `MineMusicRuntimeConfig` in Server Host / composition code:

```ts
type MineMusicRuntimeConfig = {
  plugins?: {
    "minemusic.ncm"?: NcmPluginConfig;
  };
};
```

- Keep NCM config plugin-id keyed; do not add top-level `ncm` config.
- Let `createServerHost` accept `config?: MineMusicRuntimeConfig`.
- Wire default Server Host composition to create Extension Runtime with:

```ts
createNcmPlugin(config.plugins?.["minemusic.ncm"])
```

- Do not probe NCM HTTP during runtime initialization.
- Preserve testability through explicit `runtime` or `modules` injection.

Acceptance:

- Default composition registers `minemusic.ncm` and provider id `netease`.
- Stage Runtime can become ready when NCM HTTP target is unavailable.
- Source Provider Slot remains independent of NCM.

### Slice 5: Documentation And Smoke

Files:

- `docs/formal-rebuild/phase-6-source-provider-slot.md`
- `docs/formal-rebuild/phase-6-source-provider-slot-implementation-plan.md`
- `docs/formal-rebuild/README.md`
- `docs/extension/ports.md`
- `docs/extension/progress.md`
- `docs/extension/plugins/ncm.md`
- `package.json`
- `test/live/ncm-source-smoke.ts`

Tasks:

- Keep generic Extension docs generic:
  - source-provider registration;
  - Extension Runtime source-provider search seam;
  - forbidden imports and write boundaries.
- Put NCM-specific config, endpoint reference, mapping, error handling,
  version extraction, source refs, and live-smoke instructions in
  `docs/extension/plugins/ncm.md`.
- Add opt-in live smoke:

```bash
MINEMUSIC_LIVE_NCM=1 npm run smoke:ncm
```

- Smoke should skip successfully by default.
- Smoke should verify default composition registers NCM and can search through
  `ExtensionRuntime.searchSourceProvider(...)` when enabled.
- Do not make live smoke part of required `npm test`.

Acceptance:

- General Extension design is not polluted with NCM-specific endpoint or
  payload details.
- NCM plugin details have a dedicated current doc.
- Live smoke exists but is opt-in.

## Test Plan

Targeted tests:

```bash
npm run build:test
node .tmp-test/test/formal/formal-contracts.test.js
node .tmp-test/test/formal/extension-capability-slot.test.js
node .tmp-test/test/formal/ncm-plugin.test.js
node .tmp-test/test/formal/server-host.test.js
```

Broad checks:

```bash
npm run typecheck
npm test
git diff --check
```

Optional smoke:

```bash
npm run smoke:ncm
MINEMUSIC_LIVE_NCM=1 npm run smoke:ncm
```

`npm run smoke:ncm` must pass through the skip path unless
`MINEMUSIC_LIVE_NCM=1` is set.

## Architecture Guards

Add or extend architecture-style tests to prove:

- `src/extension/source_provider_slot.ts` does not import Music Data Platform,
  Stage Interface, Stage Core, Server Host, storage, database, or NCM plugin
  modules.
- `src/extension/plugins/ncm.ts` does not import Music Data Platform, Stage
  Interface, query, materialization, presentation, storage, or database modules.
- active top-level `src/providers/**` and `src/plugins/**` remain absent.
- Source Provider Slot search result types do not expose `MaterialRecord`,
  `MaterialEntity`, `CanonicalRecord`, QueryHit DTOs, `MaterialCard`, or
  presentation output.
- default composition registers NCM without probing HTTP.

## State Sync

Before marking Phase 6 complete, run the state-sync gate and update or justify:

- `INDEX.md`;
- `CURRENT_STATE.md`;
- `ARCHITECTURE.md`;
- `PROGRESS.md`.

Expected direction:

- `PROGRESS.md` should record Phase 6 implementation status and verification.
- `CURRENT_STATE.md` should mention that default composition includes the NCM
  source-provider plugin once implemented.
- `ARCHITECTURE.md` should only need a generic statement if the Extension
  Runtime search seam changes current architecture authority.
- `INDEX.md` should link new NCM plugin docs if they become current authority.

## Stopping Condition

Stop Phase 6 when:

- contract additions compile and are tested;
- Extension Runtime source-provider search seam exists and is tested;
- search output integrity validation is enforced;
- NCM plugin is implemented under `src/extension/plugins/ncm.ts`;
- default composition registers NCM without startup probe;
- NCM plugin mapping tests cover track, album, artist, version info, artist
  refs, unavailable/restricted tracks, malformed responses, and dropped invalid
  ids;
- docs and state-sync files are updated or explicitly justified;
- targeted tests, broad checks, and default-skip smoke pass.
