# Phase 6: Source Provider Slot

> Status: Implemented Phase 6 spec
> Phase owner: Extension / Source Provider Slot
> Output type: Source-provider slot contract refinement, input validation,
> output integrity validation, tests, and docs updates

Phase 6 extends the implemented Phase 3 `source-provider` slot from
registration-only proof to a usable source-provider slot boundary.

This phase does not create a generic Provider Platform. It does not move
provider calls into Music Data Platform, query, Stage Interface, or Server
Host. It also does not introduce a separate layer named provider execution,
provider invocation, or provider runtime.

The purpose is to define which existing `SourceProvider` contract operations
are allowed at the `source-provider` slot boundary, and what boundary checks
keep plugin/provider code from owning MineMusic identity, persistence, query
ranking, or final presentation.

## Confirmed Decisions

### Owning Boundary

Phase 6 is owned by the existing Source Provider Slot line under Extension.

Canonical naming:

```text
Source Provider Slot
```

Implementation naming may continue to use `source_provider_slot` for files and
`source-provider` for the slot id.

This means:

- Extension still owns source-provider registration and slot-level validation;
- Source Provider Slot may grow narrow helpers around existing `SourceProvider`
  operations, but it must not become a new provider platform or runtime layer;
- Music Data Platform remains the owner of durable source/material/canonical
  identity writes;
- Stage Interface remains the owner of agent-facing tools and output
  projection;
- query and final presentation remain later phases.

### Operation Scope

Phase 6 only brings the `SourceProvider.search(...)` operation into active
Source Provider Slot scope.

This is the narrowest operation needed before later query and presentation
work, because provider search is the entry point that can produce
`ProviderMaterialCandidate[]` from external or replaceable source-provider
implementations.

Out of scope for Phase 6:

- `SourceProvider.getPlayableLinks(...)`, because playable-link refresh is an
  explicit refresh, repair, or account re-check capability rather than the
  normal provider search path;
- `lookup`, because `SourceProviderCapability` declares the literal
  `"lookup"`, but the current `SourceProvider` contract has no `lookup`
  method shape yet;
- library/account reads, because those belong to a separate provider slot or a
  later capability-specific phase.

Phase 6 must not reopen the Phase 1 `SourceProvider` contract just to invent a
new `lookup` shape.

### Write Boundary

Phase 6 Source Provider Slot does not write Music Data Platform records,
repositories, commands, database contexts, request-scoped candidate stores,
query hits, or presentation output.

The slot may call `SourceProvider.search(...)`, validate the returned provider
search results, and return those validated results to its caller. The caller
may use the result as input to a later owner, but durable source/material/
canonical writes must stay in Music Data Platform or a later explicitly named
ingestion/import/materialization boundary.

This keeps provider/plugin code replaceable and prevents Source Provider Slot
from becoming a hidden writer for MineMusic identity.

### Search Result Shape

Phase 6 should not return a bare `ProviderMaterialCandidate[]` from the Source
Provider Slot boundary.

Use a slot-level search result wrapper:

```ts
type SourceProviderSearchResult = {
  providerId: string;
  query: SourceQuery;
  candidates: readonly ProviderMaterialCandidate[];
};
```

The wrapper records which provider answered which query without changing the
candidate contract and without creating `QueryHit`, `MaterialCard`,
`MaterialRecord`, or presentation output.

`ProviderMaterialCandidate` remains the provider-owned candidate shape:

```ts
type ProviderMaterialCandidate = {
  sourceEntity: SourceEntity;
  providerScore?: number;
};
```

`sourceEntity` already carries provider/source facts such as `sourceRef`,
`providerId`, `providerEntityId`, `kind`, `label`, playable `links`, and
optional `versionInfo`. Phase 6 should run output integrity checks on these
facts at the slot boundary rather than adding duplicate provider scope fields
to each candidate.

### Search Input Shape

Phase 6 keeps provider search input centered on `SourceQuery` and adds
pagination through `offset`.

```ts
type SourceQuery = {
  text: string;
  targetKinds?: readonly SourceEntityKind[];
  limit?: number;
  offset?: number;
};
```

`offset` belongs on `SourceQuery`, not on `SourceProviderSearchInput`, because
it describes the provider search result sequence together with `text`,
`targetKinds`, and `limit`.

Input validation:

- `query.text.trim()` must be non-empty;
- `query.limit`, when present, must be a positive integer no greater than `50`;
- `query.offset`, when present, must be a non-negative integer;
- `query.targetKinds`, when present, must be non-empty and contain only valid
  `SourceEntityKind` values.

Default semantics:

- omitted `offset` means `0`;
- omitted `limit` leaves result count to the caller/provider boundary;
- Phase 6 does not introduce `cursor`, `pageToken`, or provider-specific
  continuation state.

Provider adapters map `limit` and `offset` to their own APIs internally. Source
Provider Slot validates the shared input shape but does not store or interpret
provider pagination state.

### Search Output Integrity Validation

Phase 6 Source Provider Slot performs output integrity validation only.

Required validation:

- `candidate.sourceEntity.providerId === result.providerId`;
- `candidate.sourceEntity.sourceRef.namespace === source_${result.providerId}`;
- `candidate.sourceEntity.sourceRef.kind === candidate.sourceEntity.kind`;
- `candidate.sourceEntity.sourceRef` ref components are safe;
- `candidate.sourceEntity.providerEntityId` is safe as a ref component;
- when `providerScore` is present, it is a finite number between `0` and `1`;
- when `query.targetKinds` is present, every candidate kind matches one of the
  requested target kinds.

Validation must not mutate provider output. Invalid provider output should
return an Extension-owned error rather than silently repairing fields.

Not in scope for Source Provider Slot output integrity validation:

- title/query similarity;
- deduplication;
- ranking or sorting;
- canonical matching;
- material identity decisions;
- `versionInfo` interpretation;
- playable-link freshness checks;
- presentation formatting.

### Caller Boundary

Phase 6 should expose source-provider search through the Extension Runtime
public seam:

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
Result<SourceProviderSearchResult>
```

`src/extension/source_provider_slot.ts` may keep an internal helper that accepts
the capability registry, but callers outside Extension internals should not use
or receive the raw registry.

The Extension Runtime search seam is allowed to:

- find a registered source provider by `providerId`;
- check that the provider supports `search`;
- call `SourceProvider.search(...)`;
- validate returned candidates;
- return `SourceProviderSearchResult`.

The Extension Runtime search seam is not allowed to:

- write Music Data Platform records;
- create request-scoped query hits;
- call `getPlayableLinks(...)`;
- call Stage Interface tools;
- build `MaterialCard` or other presentation output;
- rank, deduplicate, canonicalize, or materialize candidates.

Phase 6 does not decide the later consumer of this seam. Query,
materialization/import, Stage Interface, and presentation wiring remain later
phase decisions.

### NCM Plugin Scope

Phase 6 may include a NetEase Cloud Music plugin as the first real source
provider plugin exercising the Source Provider Slot seam.

The plugin and provider ids are distinct:

```text
pluginId: minemusic.ncm
providerId: netease
```

`pluginId` identifies the plugin implementation and activation lifecycle.
`providerId` identifies the provider search boundary and participates in the
formal source namespace rule `source_${providerId}`. NCM source refs should
therefore use the `source_netease` namespace:

```text
source_netease:track:<providerEntityId>
source_netease:album:<providerEntityId>
source_netease:artist:<providerEntityId>
```

The NCM plugin must register its source provider through
`ctx.registerSourceProvider(...)`. It must not bypass Source Provider Slot, and
it must not write Music Data Platform records directly.

Phase 6 NCM plugin is a real HTTP-backed, search-only plugin. It should call
NetEase Cloud Music search for source search results and map those results into
`ProviderMaterialCandidate[]`.

Phase 6 should keep the NCM HTTP target configurable. The old MVP's proven
configuration used an NCM API-compatible local service:

```text
baseUrl: http://127.0.0.1:3000
path: /search
```

NCM search request mapping:

```text
keywords = query.text.trim()
limit    = normalized query.limit
offset   = normalized query.offset
type     = 1 for track, 10 for album, 100 for artist
```

Expected response arrays:

```text
track  -> result.songs
album  -> result.albums
artist -> result.artists
```

The NCM plugin owns this local-service client internally. The Source Provider
Slot must not know NetEase endpoint paths, query parameter names, raw response
fields, headers, cookies, or provider HTTP details.

The default `baseUrl` may follow the old MVP default, but it is plugin
configuration, not a Source Provider Slot rule and not an architecture-level
requirement that MineMusic must always use a local service.

NCM plugin configuration enters through the plugin factory:

```ts
type NcmPluginConfig = {
  baseUrl?: string;
  fetch?: typeof fetch;
};

createNcmPlugin(config?: NcmPluginConfig): MineMusicPlugin;
```

Reading environment variables or user config belongs to a composition root,
not `src/extension/source_provider_slot.ts`, `src/extension/plugin_runtime.ts`,
or the Source Provider Slot contract. The NCM plugin may define a default
`baseUrl`, but the default is plugin configuration, not a slot rule.

Overall runtime/composition config and plugin-specific config should remain
separate. Do not add top-level NCM-specific fields such as
`createServerHost({ ncm: ... })`.

Use plugin-id keyed configuration:

```ts
type MineMusicRuntimeConfig = {
  plugins?: {
    "minemusic.ncm"?: NcmPluginConfig;
  };
};
```

Composition roots may read env/user config into `MineMusicRuntimeConfig`, then
pass only `config.plugins?.["minemusic.ncm"]` into `createNcmPlugin(...)`.

`MineMusicRuntimeConfig` belongs to Server Host / composition code, not
Extension and not Source Provider Slot. Phase 6 may introduce:

```text
src/server/config.ts
```

to export:

```ts
type MineMusicRuntimeConfig = {
  plugins?: {
    "minemusic.ncm"?: NcmPluginConfig;
  };
};
```

`src/server/host.ts` may accept `config?: MineMusicRuntimeConfig` and pass only
the NCM plugin-specific config to `createNcmPlugin(...)`.

Phase 6 should connect the NCM plugin to default composition. The default Server
Host / Stage Core composition should create the Extension Runtime with
`createNcmPlugin(config)` in its plugin list, instead of leaving the default
Extension Runtime empty.

This composition decision does not make Source Provider Slot depend on NCM. NCM
remains a plugin registered into the slot through `ctx.registerSourceProvider`.

Default composition must not probe the NCM HTTP service during runtime
initialization. Startup should only register the plugin/provider. If the
configured NCM HTTP target is unavailable, the Stage Runtime may still become
ready; `searchSourceProvider({ providerId: "netease", ... })` returns the
provider error when search is actually called.

The active implementation should live under Extension-owned plugin code, not
the old pre-formal top-level roots:

```text
src/extension/plugins/ncm.ts
```

Do not restore active `src/plugins/**` or `src/providers/**`.

The NCM plugin owns its provider-client details internally. MineMusic core,
Stage Core, Stage Interface, Music Data Platform, and Source Provider Slot
should only see `MineMusicPlugin` and `SourceProvider` contracts. A small
test-only transport/fetch seam is acceptable, but a separate `NcmSearchClient`
must not become a MineMusic architecture boundary in Phase 6.

The NCM plugin remains limited to Source Provider search:

- it registers exactly the `source-provider` capability;
- it implements `SourceProvider.search(...)`;
- it maps NCM tracks, albums, and artists into `SourceEntity` facts;
- it respects `SourceQuery.text`, `targetKinds`, `limit`, and `offset`;
- it returns provider errors through the Source Provider Slot boundary.

NCM search kind behavior (single-kind only):

- when `targetKinds` is omitted, the NCM plugin defaults to track search;
- when `targetKinds` contains exactly one of `"track"` | `"album"` |
  `"artist"`, the NCM plugin searches that one kind;
- when `targetKinds` contains more than one kind, the plugin rejects with
  `extension.ncm_multi_kind_unsupported` instead of silently narrowing.

Multi-kind search is not supported. The retrieval layer always requests one
target kind per provider-search pool, so multi-kind coordination would be dead
weight; a declared rejection fails loud if a future Query Kind requests
multiple kinds, rather than hiding that gap behind dormant code. The Source
Provider Slot itself does not choose a default target kind; the track default
is specific to the NCM plugin.

NCM source-artist references must only be generated from stable provider
artist ids.

For track mapping, read artist facts from NCM `song.artists[]` or `song.ar[]`.
For album mapping, read artist facts from NCM `album.artists[]` or
`album.artist`.

For album mapping, prefer `album.artists[]` because it can preserve multiple
album artists. Use `album.artist` only as a fallback when `album.artists[]`
does not contain usable artist facts. Deduplicate refs by provider artist id.

Mapping rules:

- when an artist object has a usable provider artist id and name, include the
  name in `artistLabels` and include a `source_netease:artist:<id>` ref in
  `artistSourceRefs`;
- when an artist object has a usable name but no usable id, include only the
  name in `artistLabels`;
- do not create `artistSourceRefs` from artist names;
- ignore empty, zero, unsafe, or otherwise unusable artist ids;
- `artistLabels` and `artistSourceRefs` are not required to have the same
  length.

Example:

```ts
{ id: 6452, name: "周杰伦" }
```

maps to:

```ts
{
  label: "周杰伦",
  sourceRef: {
    namespace: "source_netease",
    kind: "artist",
    id: "6452",
    label: "周杰伦",
  },
}
```

NCM search mapping must preserve source-side version information separately
from display labels.

Current contract shape:

```ts
type VersionInfo = {
  label?: string;
  tags?: readonly VersionTag[];
};
```

`versionInfo` already lives on `SourceEntityBase`, so NCM `SourceTrack` and
`SourceAlbum` candidates may carry it without adding provider-specific fields.

For NCM Phase 6:

- track search should derive `versionInfo` from visible track-name/version
  text when present;
- album search should derive `versionInfo` from visible album-name/version text
  when present;
- `label` should keep the provider-visible display label;
- `versionInfo.label` should carry the extracted version phrase when one is
  identifiable;
- `versionInfo.tags` should use known tags such as `remaster`, `remix`,
  `live`, `acoustic`, `unplugged`, `demo`, `deluxe`, `explicit`,
  `instrumental`, `edit`, `radio_edit`, and `extended` when detectable.

Do not hide version facts only inside `label`. Do not invent version tags when
the provider text does not expose them. Do not interpret `versionInfo` as
canonical identity proof in Phase 6.

Version extraction should be conservative and token/phrase based. It is not an
LLM classifier and must not infer hidden version identity from vague text.

Inputs:

- for tracks: `song.name`, `song.alias[]`, `song.transNames[]`, and album name
  when present;
- for albums: `album.name`, `album.alias[]`, and `album.transNames[]` when
  present.

Extraction rules:

- extract from explicit version positions such as parenthesized phrases,
  bracketed phrases, or common version suffixes;
- preserve the original extracted phrase as `versionInfo.label`;
- map only recognized words or phrases to controlled `VersionTag` values;
- do not remove version text from `title` or display `label`;
- do not treat a whole title such as `Live` as a version tag unless it appears
  in an explicit version position such as `Song (Live)`;
- do not use fuzzy similarity or broad natural-language inference.

Initial recognized phrases include:

```text
remaster, remastered, remastering
remix, mix
live, live version, concert
unplugged, 不插电
acoustic, 原声
edit
radio edit
extended, extended mix
demo
deluxe
explicit
instrumental, 伴奏
现场
混音
```

Examples:

```text
Seven (Remastered) -> { label: "Remastered", tags: ["remaster"] }
Song (Live Version) -> { label: "Live Version", tags: ["live"] }
Song (Remastered and Expanded Edition)
  -> { label: "Remastered and Expanded Edition", tags: ["remaster", "extended"] }
Live -> no versionInfo unless another explicit version marker exists
```

NCM artist search mapping should produce `SourceArtist` facts from stable
provider artist ids:

```ts
{
  kind: "artist",
  providerId: "netease",
  providerEntityId: String(artist.id),
  sourceRef: {
    namespace: "source_netease",
    kind: "artist",
    id: String(artist.id),
    label: artist.name,
  },
  label: artist.name,
  name: artist.name,
  aliases,
  providerUrl: `https://music.163.com/#/artist?id=${id}`,
  availabilityHint: "unknown",
}
```

`aliases` may be collected from visible NCM artist fields such as
`artist.alias[]`, `artist.alia[]`, `artist.trans`, and `artist.transNames[]`.
Drop empty aliases, deduplicate aliases, and do not repeat the primary
`artist.name` inside `aliases`. Omit `aliases` when no usable aliases remain.

NCM Phase 6 does not extract artist `versionInfo` by default. Artist versioning
is not part of the ordinary NCM source search path unless the provider exposes
an explicit future artist-version fact.

NCM search mapping must drop raw search items that do not have a usable stable
provider entity id. Phase 6 must not create unresolved provider candidates
without a valid `sourceRef`, because `ProviderMaterialCandidate` carries
normalized `SourceEntity` facts, not provisional display-only results. If every
raw item is dropped, return an empty candidate list.

NCM provider errors should be mapped to safe provider/search errors:

- invalid plugin config: invalid config error, not retryable;
- HTTP/network failure: provider unavailable, retryable;
- non-2xx HTTP response: provider unavailable, retryable;
- JSON parse failure: malformed provider response, not retryable;
- NCM payload `code` present and not `200`: provider response error, not
  retryable by default in Phase 6;
- missing expected result array such as `result.songs`, `result.albums`, or
  `result.artists`: malformed provider response, not retryable.

Do not expose raw NCM payloads through `Result` errors. Error output may include
safe summaries such as provider id, status code, error code, and message.

NCM Phase 6 should not synthesize `providerScore`. NCM search payloads may
include provider-local ordering or algorithm fields, but Phase 6 must not
pretend those fields are a normalized `0..1` score. Preserve the provider's
returned candidate order and leave cross-provider ranking to a later query
owner.

NCM track search may include source-side NetEase web song links on
`SourceTrack.links`:

```ts
links: [{
  url: `https://music.163.com/#/song?id=${id}`,
  label: "NetEase Cloud Music",
  requiresAccount,
}]
```

These links are provider/source facts. They are not `MaterialCard` output, not
final presentation, and not a `getPlayableLinks(...)` refresh result.

If NCM marks a track as unavailable, for example through `noCopyrightRcmd`,
`availabilityHint` should be `"unavailable"` and search mapping should omit
links. If NCM marks a track as account/VIP/paid through fields such as `fee`,
`availabilityHint` should be `"restricted"` and the link may carry
`requiresAccount: true`.

NCM album and artist search should set `providerUrl` to the corresponding
NetEase web page, but should not put those navigation URLs in `links`.
`SourceEntity.links` is reserved here for track playable/source link facts;
album and artist navigation hints belong in `providerUrl`.

Phase 6 should reintroduce source-side track position as an explicit optional
track fact:

```ts
type SourceTrackPosition = {
  discNumber?: string;
  trackNumber?: number;
  trackCount?: number;
};
```

`SourceTrack` may carry:

```ts
trackPosition?: SourceTrackPosition;
```

`trackPosition` describes the provider/source-side position of a track within
its `albumSourceRef` / source release context. It is not a canonical relation,
not material identity proof, and not a Music Data Platform binding fact by
itself.

For NCM Phase 6 search, map `trackPosition` only when the search payload
already contains usable position facts. Do not add an extra `/album` enrichment
call during source search solely to fill track position. Album/detail
enrichment can be a later provider or materialization phase.

For multi-kind NCM search, `query.limit` is the total result limit, not a
per-kind limit. The NCM plugin may divide the limit across requested kinds and
combine the mapped candidates, but the final candidate count must not exceed
`query.limit` when a limit is supplied.

For NCM search pagination, `offset` is supported for single-kind search. If a
multi-kind NCM search receives `offset > 0`, the NCM plugin should return an
error instead of attempting merged pagination across kinds. Stable merged
pagination belongs to a later query/orchestration owner.

The NCM plugin must not implement in Phase 6:

- account library import/update;
- playlist or saved-track reads;
- playable-link refresh;
- login, cookie refresh, or account repair;
- durable Music Data Platform writes;
- query ranking, materialization, or presentation.

### Architecture Guards

Phase 6 must add behavior tests for Source Provider Slot search:

- malformed plugin manifests, source-provider registrations, and provider
  descriptors fail through Extension-owned `Result` errors instead of runtime
  throws;
- unknown `providerId` returns an Extension-owned error;
- registered provider without `search` returns an Extension-owned error;
- successful provider search returns `{ providerId, query, candidates }`;
- provider output with mismatched `sourceEntity.providerId` fails;
- provider output with mismatched `sourceRef.namespace` fails;
- provider output with mismatched `sourceRef.kind` fails;
- provider output with unsafe source ref or `providerEntityId` fails;
- provider output with out-of-range or non-finite `providerScore` fails;
- provider output whose kind is outside `query.targetKinds` fails.
- NCM track and album mapping preserves detectable source-side version
  information in `versionInfo` instead of burying it only in `label`.

Phase 6 must also add boundary guards proving `src/extension/source_provider_slot.ts`
does not become a hidden writer or presentation builder:

- it must not import Music Data Platform modules;
- it must not import Stage Interface modules;
- it must not import Stage Core modules;
- it must not import Server Host modules;
- its source-provider search helper must not return `MaterialRecord`,
  `MaterialEntity`, `CanonicalRecord`, query-hit DTOs, `MaterialCard`, or other
  presentation output.

Phase 6 should add an opt-in NCM live smoke command. The smoke must skip
successfully unless explicitly enabled, following the old MVP pattern:

```bash
MINEMUSIC_LIVE_NCM=1 npm run smoke:ncm
```

The live smoke should verify:

- default composition registers `minemusic.ncm`;
- the `netease` source provider is available through Extension Runtime;
- `searchSourceProvider({ providerId: "netease", query: { text, limit: 1 } })`
  can return at least one source candidate when the configured NCM HTTP target
  is reachable;
- the first returned source candidate uses `source_netease` namespace.

The live smoke must not become a required `npm test` dependency.

### Documentation Scope

Phase 6 documentation must keep general Extension design separate from
NCM-specific plugin details.

General Extension docs may describe only generic Source Provider Slot behavior,
such as registration, source-provider search seam, allowed dependencies, and
forbidden imports. They must not carry NCM endpoint details, raw response
fields, mapping tables, live-smoke setup, or provider-specific config.

NCM-specific details belong in:

```text
docs/extension/plugins/ncm.md
```

That document may describe NCM plugin config, search mapping, local-service
reference behavior, version extraction, source refs, error mapping, and live
smoke usage.

## Open Questions

No Phase 6 scope questions remain open in this implemented spec.

## Non-Goals

- Do not add active top-level `src/providers/**` or `src/plugins/**` roots.
- Do not implement account library import/update.
- Do not implement playlist, saved-track, or account-library reads.
- Do not implement login, cookie refresh, reauth, secrets, provider health,
  rate limits, or cache.
- Do not implement `lookup`, playable-link refresh, or library/account reads.
- Do not implement query ranking, query hit output, or query-to-present.
- Do not implement `MaterialCard`.
- Do not expose NCM search as a Stage Interface tool.
- Do not expose source-provider operation calls through Stage Interface tools.
- Do not let provider/plugin code write Music Data Platform repositories or
  database contexts directly.
- Do not edit `CONTEXT.md`.
