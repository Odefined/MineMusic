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
- The Task 2 `preview` and `readItems` methods intentionally return empty area
  lists. Account identity, readable-area mapping, preview/read semantics, and
  provider issue mapping remain future tasks.

## Next Slice

1. Implement Task 3 from the NetEase plan: resolve provider account identity
   when the local NetEase API can expose it.
2. Continue with readable-area mapping, preview/read behavior,
   issue mapping, deterministic tests, and docs/runner wiring in the documented
   task order.

## Verification

- `npm run build:test`
- `node .tmp-test/test/providers/netease-source-provider.test.js`
- `node .tmp-test/test/providers/netease-platform-library-provider.test.js`
- `npm test`
- `git diff --check`
- `rg -n "CanonicalStore|Collection|LibraryImport" src/providers/netease`
- `rg -n "raw|sampleItems" src test docs/platform-library-provider docs/library-import`
