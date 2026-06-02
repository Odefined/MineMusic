# Platform Library Provider Progress

This file records current implementation state for the `platform_library`
capability slot and the bundled NetEase platform-library provider. Current slot
design authority lives in `docs/platform-library-provider/design.md`; NetEase
provider behavior is documented in `docs/source-providers/netease.md`.

## Current Implementation

- Shared contracts in `src/contracts/index.ts` define
  `PlatformLibraryProvider`, `preview`, `readItems`, optional `readPage`,
  account identity, area availability, read status, count certainty, provider
  items, preview samples, standard issue codes, and provider area capability
  descriptors.
- Providers register through the shared Plugin Registry under slot
  `platform_library`; provider ids are scoped by slot.
- Library Import consumes `PlatformLibraryProvider` results and owns all
  import/update batching, Source Entity Store writes, Source Library state,
  update baselines, absence records, and public `library.*` tools.
- The NetEase adapter in `src/providers/netease/index.ts` exports both
  `createNetEaseSourceProvider(...)` and
  `createNetEasePlatformLibraryProvider(...)` over a shared requester/options
  shape.
- The NetEase platform-library provider resolves the current local API session
  account through `/login/status`, rejects mismatched explicit
  `providerAccountId` values, and returns structured `login_required` issues
  when no usable account can be proven.
- NetEase readable areas are `saved_source_tracks`, `saved_source_releases`,
  and `saved_source_artists`. `playlists` and `listening_history` are reported
  as unsupported.
- NetEase area descriptors mark all three readable areas as
  `ordering: "newest_first"`, allowing Library Import's
  `latest_until_seen` update mode when other update preconditions hold.
- Saved-source-track reads use the liked playlist detail `trackIds` order and
  `trackIds[].at` timestamps, not `/likelist`, as the provider item fact
  source. `/song/detail` supplies the song facts after stable track ids are
  known.
- Saved-source-track reads best-effort fetch album details once per distinct
  album id to populate release date and source track-position hints.
- Saved-source-release reads use `/album/sublist` plus best-effort album detail
  fetches to populate release dates and structured source tracklists.
- Saved-source-artist reads use `/artist/sublist`.
- NetEase `preview`, `readItems`, and `readPage` map requester errors and
  provider payload issues into standard platform-library issue codes.
- The default MineMusic server/runtime registers the NetEase source provider
  and NetEase platform-library provider from the same NetEase base-url setting.

## Remaining Work

- Playlist import and listening-history import remain future provider/import
  slices.
- Multi-account NetEase session selection remains future work if the local API
  runtime later supports multiple configured sessions.
- Provider writeback, playlist mutation, and playback control remain out of
  scope for the platform-library slot.

## Verification Evidence

- `test/providers/netease-platform-library-provider.test.ts`
- `test/providers/netease-source-provider.test.ts`
- `test/plugins/plugin-registry.test.ts`
- `test/stage_core/stage-core-factory.test.ts`
- `test/surfaces/mcp-server.test.ts`
- `npm test`
- Live validation against the configured local NetEase API service has proven
  matching preview/read counts for saved tracks, saved releases, and followed
  artists; live availability still depends on that external service and login
  state.

## Archive

Historical NetEase platform-library provider implementation sequencing is
archived under `docs/archive/platform-library-provider/`.
