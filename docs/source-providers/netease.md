# NetEase Providers

## Purpose

The NetEase adapter is MineMusic's first read-only live source adapter and first
platform-library provider adapter. It proves that the MVP can ground music
material through a real source and expose account-scoped library facts without
changing the product boundary:

```text
Stage Interface
-> Material Resolve
-> Source Grounding
-> Plugin Registry source slot
-> NetEase SourceProvider
-> MusicMaterial[] with source refs, playable links, and evidence
-> Material Gate before presentation
```

The same adapter module also exposes a `PlatformLibraryProvider` for
account-scoped saved tracks, saved releases, and followed artists:

```text
Library Import boundary
-> Plugin Registry platform_library slot
-> NetEase PlatformLibraryProvider
-> preview/readItems generic provider facts
-> later Library Import orchestration
```

The providers do not execute playback, mutate queues, import playlists, write
back to NetEase, or create canonical identity directly.

## Current Implementation

| Concern | Location |
| --- | --- |
| Provider adapter | `src/providers/netease/index.ts` |
| Source provider tests | `test/providers/netease-source-provider.test.ts` |
| Platform-library provider tests | `test/providers/netease-platform-library-provider.test.ts` |
| Source live smoke script | `test/live/netease-source-smoke.ts` |
| Stage Core provider registration path | `src/stage_core/index.ts` |
| Source Grounding integration | `src/source/index.ts` |
| Platform-library progress | `docs/platform-library-provider/progress.md` |

The adapter exports both `createNetEaseSourceProvider(...)` and
`createNetEasePlatformLibraryProvider(...)`. They implement the shared
`SourceProvider` and `PlatformLibraryProvider` contracts from
`src/contracts/index.ts`, and are registered through separate Plugin Registry
slots: `source` and `platform_library`.

## Runtime Configuration

The default local endpoint is:

```text
http://127.0.0.1:3000
```

The endpoint can be changed with:

```text
MINEMUSIC_NETEASE_BASE_URL
```

The default Codex MCP runtime uses this same setting for both
`createNetEaseSourceProvider(...)` and
`createNetEasePlatformLibraryProvider(...)`; MineMusic does not add credential
storage around either provider.

Live smoke validation is opt-in:

```bash
MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease
```

Without `MINEMUSIC_LIVE_NETEASE=1`, `npm run smoke:netease` exits successfully
through a skip path.

There is currently no separate platform-library live smoke script. Platform
library behavior is covered by deterministic tests and may be manually checked
against the configured local NetEase API service when needed.

## Source Data Mapping

The adapter calls NetEase Cloud Music API-compatible `/search` with:

```text
keywords=<query text>
limit=<query limit>
```

For each usable song result, it returns a `MusicMaterial` with:

- `id`: `netease:track:<song id>`
- `kind`: `recording`
- `label`: song title plus artist names when available
- `state`: `grounded` unless blocked or unresolved at provider mapping time
- `sourceRefs`: a `source:netease` track ref
- `playableLinks`: a NetEase web song URL when source evidence permits it
- `evidence`: provider search-result evidence, including album note when present

NetEase web song links use:

```text
https://music.163.com/#/song?id=<song id>
```

Paid or VIP-like material is represented by `requiresAccount: true` on the
playable link. `noCopyrightRcmd` material becomes `blocked` and does not expose
playable links.

## Platform Library Data Mapping

Saved tracks read `/likelist` for saved song ids, then `/song/detail` for
required song facts. Each saved-source-track item keeps generic canonical hints
for title, artists, NetEase album source ref/label, and duration when present.

When `/song/detail` exposes a usable album id, saved-source-track reads also fetch
`/album?id=<albumId>` best-effort once per distinct album id in the read call.
The album payload can populate platform-neutral `canonicalHints.releaseDate`
from album `publishTime`, normalized as an Asia/Shanghai calendar date so it
matches MusicBrainz date-only release facts. The album tracklist can populate
`canonicalHints.trackPosition` from source-side `cd`, `no`, and tracklist
ordering/count. If the album request fails, is malformed, or does not include
the song, the saved-source-track item is still returned without album-enriched
facts. Preview samples do not perform this album enrichment.

Saved releases also fetch `/album?id=<albumId>` best-effort after
`/album/sublist`. The album payload can populate
`canonicalHints.releaseDate` and a structured release `tracklist`, including
track source refs when NetEase exposes stable song ids, source-side disc/track
order, duration, and visible artist labels. If the album request fails or is
malformed, the saved-release item is still returned without those extra facts.

## Boundary Rules

- NetEase track ids are source refs, not MineMusic canonical refs.
- The providers never write canonical records directly.
- NetEase album track position is source release context for later review, not
  a canonical relation and not recording identity proof by itself.
- Source Grounding owns state normalization into `confirmed_playable` or
  `source_only_playable`.
- Future Library Import orchestration owns any canonical or collection writes
  derived from platform-library facts.
- Material Gate owns final presentation safety before the LLM or user sees
  playable links.
- Normal link display is not playback.

## Verification

Deterministic tests cover:

- NetEase fixture payload mapping into `MusicMaterial`.
- NetEase web song URL generation.
- account-required link metadata.
- blocked material handling.
- provider registration through `PluginRegistryPort`.
- Source Grounding consumption through the source slot.
- link refresh from a NetEase source ref.
- platform-library preview/read behavior for saved tracks, saved releases, and
  followed artists.
- best-effort saved-source-track album enrichment for source track position,
  including album failures and one fetch per album id.
- platform-library unsupported areas, standard issue paths, pagination,
  batching, sample-shape constraints, and registration through the
  `platform_library` slot.

Project-native commands:

```bash
npm test
npm run typecheck
npm run smoke:netease
git diff --check
```

Optional live smoke:

```bash
MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease
```

Live smoke success depends on a compatible local NetEase service being reachable
from the command environment. Shell access can differ from host-app MCP access
when sandboxing or proxy configuration changes loopback behavior.

## Non-Goals

- autoplay.
- provider writeback.
- playlist import or mutation.
- playback queue control.
- autonomous DJ behavior.
- durable storage replacement.
- host-specific policy.
