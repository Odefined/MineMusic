# Extension Progress

> Status: Current implementation state
> Scope: Extension area progress and verification

## Current State

Phase 7 Extension Source Provider Slot and Platform Library Provider Slot
foundation is implemented.

Implemented source:

- `src/extension/capability_slot.ts`
- `src/extension/capability_registry.ts`
- `src/extension/plugin_manifest.ts`
- `src/extension/plugin_runtime.ts`
- `src/extension/source_provider_slot.ts`
- `src/extension/platform_library_provider_slot.ts`
- `src/extension/plugins/ncm.ts`
- `src/extension/plugins/index.ts`
- `src/extension/errors.ts`
- `src/extension/index.ts`
- `src/server/config.ts`
- `src/stage_core/extension_runtime_module.ts`

Implemented behavior:

- formal `src/extension/**` root exists;
- `CapabilitySlot` is a plain object created by `defineCapabilitySlot`;
- `CapabilityRegistry` supports typed-slot register/list/get behavior;
- plugin manifests are light static declarations;
- plugin activation is serial and fail-fast;
- activation context exposes `registerSourceProvider` and
  `registerPlatformLibraryProvider`;
- `source-provider` and `platform-library-provider` are the implemented
  concrete slots;
- source-provider registrations use `providerId`;
- `source-provider.writePolicy` is `none`;
- platform-library-provider registrations use `providerId`;
- `platform-library-provider.writePolicy` is `none`;
- provider ids are ref-component safe, provider descriptors are validated, and
  registrations must match provider descriptors;
- Extension Runtime exposes `searchSourceProvider(...)`;
- Extension Runtime exposes `readPlatformLibraryProvider(...)`;
- source-provider search input is validated;
- source-provider output integrity is validated;
- platform-library-provider read input is validated;
- platform-library-provider output integrity is validated, including candidate
  count against requested limit and candidate source namespace/kind;
- source-provider search returns `SourceProviderSearchResult`, not raw provider
  arrays;
- NCM plugin is implemented under Extension-owned plugin code;
- NCM plugin registers `pluginId = minemusic.ncm` and
  `providerId = netease`;
- NCM plugin registers both `source-provider` and
  `platform-library-provider`;
- NCM plugin maps search-only source candidates for tracks, albums, and
  artists;
- NCM plugin maps platform library candidates for saved tracks, saved albums,
  and followed artists;
- NCM plugin owns HTTP/client/mapping details internally;
- NCM plugin supports plugin-specific `baseUrl` config and an optional
  transport seam through Server Host / composition config;
- empty Extension runtime is valid;
- Server Host mounts configured Extension runtime by default;
- default composition registers NCM without probing provider HTTP during
  startup;
- Stage Core mounts Extension as required runtime module `extension`;
- Extension module contributes no Stage Interface instruments, tools, or
  handlers;
- runtime status exposes Extension module lifecycle only.

## Verified Behavior

Recent verification:

```bash
npm run test:stage-core
npm run typecheck
npm test
npm run smoke:ncm
npm run smoke:ncm:library
npm run server:minemusic
git diff --check
```

`npm run server:minemusic` reports:

```json
{
  "status": "ready",
  "modules": [
    {
      "id": "music-data-platform",
      "ownerArea": "music_data_platform",
      "status": "initialized"
    },
    {
      "id": "extension",
      "ownerArea": "extension",
      "status": "initialized"
    },
    {
      "id": "runtime-status",
      "ownerArea": "stage_core",
      "status": "initialized"
    }
  ]
}
```

The server output omits plugin ids, provider ids, slot ids, registry counts,
and fixture provider data.

`npm run smoke:ncm` skips successfully unless `MINEMUSIC_LIVE_NCM=1` is set.

`npm run smoke:ncm:library` skips successfully unless
`MINEMUSIC_LIVE_NCM_LIBRARY=1` is set.

## Guards

Current tests cover:

- active-tree root and import boundaries;
- plugin id validation;
- manifest validation;
- malformed manifest rejection without runtime throws;
- unknown capability failure;
- missing declared capability registration failure;
- duplicate plugin id failure;
- duplicate provider id failure;
- unsafe provider id failure;
- provider id mismatch failure;
- malformed source-provider registration and descriptor rejection;
- plugin activation throw/failure wrapping;
- registration after activation context closes is rejected;
- failed activation does not leave partial source-provider registrations active;
- core-only slot registration rejection;
- deterministic source-provider registration order;
- source-provider search success/failure behavior;
- source-provider search input validation;
- source-provider search output integrity validation;
- platform-library-provider registration validation;
- platform-library-provider read input/output integrity validation;
- NCM track, album, and artist mapping;
- NCM saved-track, saved-album, and followed-artist library mapping;
- NCM version info extraction;
- NCM source artist refs only from stable provider artist ids;
- NCM unavailable/restricted track link behavior;
- NCM malformed/provider-error behavior;
- NCM multi-kind limit splitting and offset rejection;
- NCM account resolution and invalid library cursor behavior;
- empty Extension runtime;
- default Server Host composition;
- no NCM HTTP probe during runtime startup;
- compact runtime status output.

## Remaining Gaps

Current Extension intentionally does not implement:

- generic provider platform/runtime;
- provider accounts, secrets, OAuth/cookie handling, reauth, migration, health,
  cache, or rate limits;
- dynamic plugin loading;
- plugin dependency graph;
- plugin trust/origin policy;
- required provider conformance tests against external APIs;
- query integration;
- request-scoped candidate relation;
- direct Music Data Platform writes from plugins;
- Stage Interface capability discovery;
- `MaterialCard` or final presentation.

## Next Candidate Slices

Possible next slices, in order of architectural dependency:

1. Source-library projections, if the next phase wants local pool query.
2. Query/result boundary, if the next phase wants provider/source records to enter
   agent decision output.
3. Stage Interface capability discovery, if agents need a public view of
   available provider/capability state.

Do not start any of these from Extension alone. Each needs its owning formal
area and ports defined first.
