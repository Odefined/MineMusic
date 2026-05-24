# NetEase Source Provider

## Purpose

The NetEase source provider is MineMusic's first read-only live source adapter.
It proves that the MVP can ground music material through a real source without
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

The provider does not execute playback, mutate queues, import playlists, write
back to NetEase, or create canonical identity directly.

## Current Implementation

| Concern | Location |
| --- | --- |
| Provider adapter | `src/providers/netease/index.ts` |
| Provider tests | `test/providers/netease-source-provider.test.ts` |
| Live smoke script | `test/live/netease-source-smoke.ts` |
| Stage Core provider registration path | `src/stage_core/index.ts` |
| Source Grounding integration | `src/source/index.ts` |

The provider implements the shared `SourceProvider` contract from
`src/contracts/index.ts`.

## Runtime Configuration

The default local endpoint is:

```text
http://127.0.0.1:3000
```

The endpoint can be changed with:

```text
MINEMUSIC_NETEASE_BASE_URL
```

Live smoke validation is opt-in:

```bash
MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease
```

Without `MINEMUSIC_LIVE_NETEASE=1`, `npm run smoke:netease` exits successfully
through a skip path.

## Data Mapping

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

## Boundary Rules

- NetEase track ids are source refs, not MineMusic canonical refs.
- The provider never writes canonical records directly.
- Source Grounding owns state normalization into `confirmed_playable` or
  `source_only_playable`.
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
