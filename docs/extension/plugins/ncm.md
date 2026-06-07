# NCM Plugin

> Status: Current plugin documentation
> Scope: NetEase Cloud Music source-provider plugin

## Purpose

The NCM plugin is the first real source-provider plugin in the formal rebuild.
It proves that a concrete plugin can register into the generic
`source-provider` slot without moving provider-specific HTTP, mapping, config,
or raw payload details into Source Provider Slot, Stage Interface, Query, or
Music Data Platform.

## Identity

```text
pluginId: minemusic.ncm
providerId: netease
slot: source-provider
```

Source refs use the formal source namespace rule:

```text
source_netease:track:<providerEntityId>
source_netease:album:<providerEntityId>
source_netease:artist:<providerEntityId>
```

## Config

NCM plugin-specific config:

```ts
type NcmPluginConfig = {
  baseUrl?: string;
  fetch?: typeof fetch;
};
```

`fetch` is an optional transport/test seam owned by the NCM plugin. It is not a
generic Extension dependency and is not exposed through Source Provider Slot.

Overall runtime config is plugin-id keyed:

```ts
type MineMusicRuntimeConfig = {
  plugins?: {
    "minemusic.ncm"?: NcmPluginConfig;
  };
};
```

The old MVP-proven local service default is:

```text
http://127.0.0.1:3000
```

This is a plugin default/config value, not a Source Provider Slot rule.

## Search Request Mapping

NCM search is HTTP-backed and search-only in Phase 6.

The plugin calls an NCM API-compatible `/search` endpoint with:

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

When `targetKinds` is omitted, NCM defaults to track search. Multi-kind search
uses `query.limit` as a total cap. Multi-kind search with `offset > 0` fails
instead of pretending to support merged pagination.

## Mapping Rules

NCM search returns normalized `SourceEntity` facts inside
`ProviderMaterialCandidate[]`.

Track mapping includes:

- `SourceTrack.title`;
- `artistLabels`;
- `artistSourceRefs` only when NCM provides stable artist ids;
- `albumLabel`;
- `albumSourceRef`;
- `durationMs`;
- optional `trackPosition` when the search payload already carries usable
  position facts;
- `versionInfo` when a conservative explicit version phrase is detectable;
- `providerUrl`;
- track `links` when the track is not unavailable.

Album mapping includes:

- `SourceAlbum.title`;
- `artistLabels`;
- `artistSourceRefs` from `album.artists[]`, with `album.artist` fallback;
- `releaseDate` from NCM publish time when present;
- `versionInfo` when detectable;
- `providerUrl`;
- no album `links`.

Artist mapping includes:

- `SourceArtist.name`;
- `aliases` from visible alias/translation fields;
- `providerUrl`;
- no default artist `versionInfo`;
- no artist `links`.

Raw items without usable stable provider ids are dropped. The plugin does not
create unresolved candidates without source refs and does not synthesize
`providerScore`.

## Version Extraction

Version extraction is conservative and token/phrase based. It extracts only
explicit version positions such as parenthesized phrases, bracketed phrases,
or common version suffixes.

Recognized examples include:

```text
remaster, remastered, remastering
remix, mix, 混音
live, live version, concert, 现场
unplugged, 不插电
acoustic, 原声
edit
radio edit
extended, extended mix
demo
deluxe
explicit
instrumental, 伴奏
```

The plugin preserves the provider-visible `title` and display `label`.
Detected version facts are added as `versionInfo`; they are not canonical
identity proof.

## Availability And Links

Track links use NetEase web song URLs:

```text
https://music.163.com/#/song?id=<id>
```

Rules:

- `noCopyrightRcmd` -> `availabilityHint = unavailable`, omit links;
- paid/VIP-like `fee` -> `availabilityHint = restricted`,
  `requiresAccount = true`;
- otherwise -> `availabilityHint = playable`.

Album and artist navigation URLs use `providerUrl`, not `links`.

## Errors

NCM provider errors return safe summaries only. Raw payloads are not exposed.

Error classes:

- invalid plugin config for non-object config, malformed `baseUrl`, or invalid
  transport seam;
- provider unavailable for network/HTTP failures;
- malformed provider response for JSON parse failures or missing expected
  arrays;
- provider response error for NCM payload codes other than `200`.

Network and HTTP-unavailable errors are retryable. Invalid config, malformed
responses, provider payload errors, unsupported multi-kind pagination, and
mapping validation failures are not marked retryable by default.

When called through `ExtensionRuntime.searchSourceProvider(...)`, provider
failures are returned through the Source Provider Slot search error boundary.

## Smoke

Default smoke skips unless explicitly enabled:

```bash
npm run smoke:ncm
```

Live smoke:

```bash
MINEMUSIC_LIVE_NCM=1 npm run smoke:ncm
```

Optional config:

```bash
MINEMUSIC_NCM_BASE_URL=http://127.0.0.1:3000
MINEMUSIC_NCM_QUERY=coding
```

Live smoke verifies that the default configured Extension Runtime registers the
NCM provider and can return at least one `source_netease` source candidate when
the configured NCM HTTP target is reachable.
