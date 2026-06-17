# NCM Plugin

> Status: Current plugin documentation
> Scope: NetEase Cloud Music source-provider and platform-library-provider plugin

## Purpose

The NCM plugin is the first real provider plugin in the formal rebuild. It
proves that a concrete plugin can register into Extension slots without moving
provider-specific HTTP, mapping, config, or raw payload details into the
generic slot code, Stage Interface, Query, or Music Data Platform.

## Identity

```text
pluginId: minemusic.ncm
providerId: netease
slots:
  - source-provider
  - platform-library-provider
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

## Platform Library Request Mapping

NCM platform library reads return normalized `PlatformLibraryCandidate[]`.
They do not persist Music Data Platform records directly.

Supported library kinds:

```text
saved_source_track
saved_source_album
followed_source_artist
```

For account-library reads, the plugin resolves the current logged-in account
through `/user/account`. If the caller supplies `providerAccountId`, that id
must match the current logged-in account before any library endpoint is read.

Mapping:

- `saved_source_track` resolves the liked-music playlist, reads
  `/playlist/detail`, uses `playlist.trackIds` order, maps `trackIds[].at` to
  `providerAddedAt` when available, and reads selected track facts through
  `/song/detail`;
- `saved_source_album` reads `/album/sublist`, maps album facts through the
  same source album mapper, and maps `subTime` to `providerAddedAt` when
  available;
- `followed_source_artist` reads `/artist/sublist`, maps artist facts through
  the same source artist mapper, and does not invent `providerAddedAt` when the
  provider response has no per-artist timestamp.

`/likelist` is not used for saved-track import facts because it exposes ids and
playlist-level state rather than the ordered playlist detail and provider add
timestamps needed by Phase 7.

Library pagination uses the shared cursor contract. The plugin maps that
cursor to NCM offset-like reads internally. The cursor is plugin/config detail,
not Source Provider Slot search `offset`.

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

Search raw items without usable stable provider ids are dropped. Search rows
that are not objects, or that have a usable stable provider id but lack required
track title, album title, or artist name facts, fail as malformed provider
responses. Account-library reads are stricter: malformed saved/followed library
items, non-object page items, missing selected song detail, or `hasMore` pages
with no mapped items fail the provider read instead of silently shrinking the
imported library. The plugin does not create unresolved candidates without
source refs and does not synthesize `providerScore`.

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
- invalid or mismatched provider account id for account-library reads;
- provider unavailable for network/HTTP failures;
- malformed provider response for JSON parse failures, missing expected arrays,
  non-object search rows, search rows with stable ids but missing required
  display facts, or missing selected `/song/detail` facts;
- provider response error for NCM payload codes other than `200`.

Network and HTTP-unavailable errors are retryable. Invalid config, malformed
responses, provider payload errors, unsupported multi-kind pagination, and
mapping validation failures are not marked retryable by default.

When called through `ExtensionRuntime.searchSourceProvider(...)`, provider
failures are returned through the Source Provider Slot search error boundary.
When called through `ExtensionRuntime.readPlatformLibraryProvider(...)`,
provider failures are returned through the Platform Library Provider read
boundary.

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

Source-library live smoke skips unless explicitly enabled:

```bash
npm run smoke:ncm:library
```

Live source-library smoke:

```bash
MINEMUSIC_LIVE_NCM_LIBRARY=1 npm run smoke:ncm:library
```

Optional config:

```bash
MINEMUSIC_NCM_BASE_URL=http://127.0.0.1:3000
MINEMUSIC_NCM_LIBRARY_KIND=saved_source_track
MINEMUSIC_NCM_LIBRARY_LIMIT=1
```

The source-library smoke starts the default Server Host, uses the internal
Library Import service seam, and does not expose a Stage Interface import tool.
