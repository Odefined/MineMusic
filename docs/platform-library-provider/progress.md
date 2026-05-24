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
- The concrete NetEase `platform_library` provider factory is not implemented
  yet.

## Next Slice

1. Implement Task 2 from the NetEase plan: export
   `createNetEasePlatformLibraryProvider(...)` with `preview` and `readItems`
   methods using the shared NetEase requester options.
2. Continue with account identity, readable-area mapping, preview/read behavior,
   issue mapping, deterministic tests, and docs/runner wiring in the documented
   task order.

## Verification

- `npm run build:test`
- `node .tmp-test/test/providers/netease-source-provider.test.js`
- `npm test`
- `git diff --check`
- `rg -n "CanonicalStore|Collection|LibraryImport" src/providers/netease`
- `rg -n "raw|sampleItems" src test docs/platform-library-provider docs/library-import`
