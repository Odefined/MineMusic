# Platform Library Provider Progress

This file tracks implementation progress for the `platform_library` capability
slot and concrete platform-library providers.

## Current State

- The shared `PlatformLibraryProvider` contract is defined in
  `src/contracts/index.ts`.
- The generic slot design lives in `docs/platform-library-provider/design.md`.
- The NetEase implementation plan lives in
  `docs/platform-library-provider/netease-implementation-plan.md`.
- NetEase provider Task 1 is complete: `src/providers/netease/index.ts` now
  exposes a shared NetEase requester/options shape that preserves
  `defaultNetEaseBaseUrl` and injectable `requestJson` for deterministic tests.
- NetEase provider Task 2 is complete: `src/providers/netease/index.ts` now
  exports `createNetEasePlatformLibraryProvider(...)`, returning a
  `PlatformLibraryProvider` with `id: "netease"` and callable `preview` /
  `readItems` methods.
- NetEase provider Task 3 is complete: `preview` and `readItems` resolve the
  current local NetEase API session through `/login/status`, return stable
  account identity when a user id can be proven, and return structured
  `login_required` issues when no usable account or requested account match can
  be proven.
- The provider currently uses the local API's default session account. Explicit
  reads for multiple simultaneously available NetEase accounts are not exposed
  by the current adapter; account-selection behavior remains a future concern if
  the runtime later supports multiple configured sessions.
- NetEase provider Task 4 is complete: `readItems` maps `saved_recordings`,
  `saved_releases`, and `saved_artists` responses into generic
  `PlatformLibraryItem` records with stable NetEase `sourceRef` values,
  generic item/target kinds, labels, and canonical hints.
- NetEase provider Task 5 is complete: `preview` defaults to the first-slice
  readable areas, reports readable availability and honest counts, supports
  bounded lightweight samples, and reports `playlists` / `listening_history` as
  unsupported during discovery.
- NetEase provider Task 6 is complete: `readItems` returns requested readable
  area results with `complete`, `failed`, and `partial` per-area statuses;
  unsupported read areas return `unavailable` with `scope_unsupported`, and one
  area failure no longer prevents other requested areas from returning data.
- NetEase provider Task 7 is complete: account, preview, and item-read failures
  from requester errors and local API payloads now map into standard
  `PlatformLibraryIssueCode` values including `provider_unavailable`,
  `timeout`, `login_required`, `scope_unsupported`, `rate_limited`,
  `partial_read`, and `malformed_response`.
- NetEase provider Task 8 is complete: deterministic provider coverage now
  includes readable previews, generic item reads, stable source refs, sample
  shape constraints, unsupported areas, login/provider/malformed/partial issue
  paths, artist/release source-ref canonical hints for saved recordings, and
  NetEase provider registration through the `platform_library` slot.
- NetEase provider Task 9 is complete: the platform-library provider test
  module is wired into `test/run-stage-core-tests.ts`, and
  `docs/source-providers/netease.md` now documents that the NetEase adapter
  exposes both `source` and `platform_library` slot providers.
- NetEase saved-recording reads now best-effort fetch `/album` once per album
  id during `readItems` to enrich generic `canonicalHints.trackPosition` from
  source album tracklist context. Album enrichment failures do not fail the
  saved-recording read, and preview samples remain lightweight.
- `PlatformLibraryReadInput.sampleLimitPerArea` is now part of the shared
  provider read contract. NetEase saved-recording reads preserve full-read
  behavior by default and bound the liked-track detail read when a caller passes
  an explicit sample limit.
- Real validation against the updated local Docker API found and fixed two read
  completeness gaps: `song/detail` requests are now batched below the API's
  1000-song limit, and saved album / followed artist reads now paginate
  `album/sublist` and `artist/sublist` with stable `limit` / `offset` requests.
- Live validation against `http://127.0.0.1:3000` now uses the Docker-side
  NetEase API setting in `/Users/jiajuzang/Documents/Codex/NetEaseCloudMusicAPI/.env`.
  The local API proves the current account identity and returns exact preview
  counts of 1372 saved recordings, 466 saved releases, and 179 saved artists;
  `readItems` returns matching item counts for all three readable areas.

## Next Slice

1. Start Library Import orchestration work that consumes
   `PlatformLibraryProvider` preview/read results.
2. Keep playlist and listening-history support out of scope until a later
   provider slice defines their data model and user-facing import behavior.

## Verification

- `npm run build:test`
- `node .tmp-test/test/providers/netease-source-provider.test.js`
- `node .tmp-test/test/providers/netease-platform-library-provider.test.js`
- `npm run build:test && node .tmp-test/test/providers/netease-platform-library-provider.test.js`
  passes after adding NetEase saved-recording album track-position enrichment.
- `npm test`
- Live `preview({ discovery: true, sampleLimitPerArea: 3 })` and
  `readItems({ areas: ["saved_recordings", "saved_releases", "saved_artists", "playlists"] })`
  against `http://127.0.0.1:3000`; both prove the current account, return
  matching readable-area counts of 1372 saved recordings, 466 saved releases,
  and 179 saved artists, and report `playlists` as unsupported for item reads.
- `git diff --check`
- `rg -n "CanonicalStore|Collection|LibraryImport" src/providers/netease`
- `rg -n "raw|sampleItems" src test docs/platform-library-provider docs/library-import`
