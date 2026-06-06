# Extension Progress

> Status: Current implementation state
> Scope: Extension area progress and verification

## Current State

Phase 3 Extension capability-registration baseline is implemented.

Implemented source:

- `src/extension/capability_slot.ts`
- `src/extension/capability_registry.ts`
- `src/extension/plugin_manifest.ts`
- `src/extension/plugin_runtime.ts`
- `src/extension/source_provider_slot.ts`
- `src/extension/errors.ts`
- `src/extension/index.ts`
- `src/stage_core/extension_runtime_module.ts`

Implemented behavior:

- formal `src/extension/**` root exists;
- `CapabilitySlot` is a plain object created by `defineCapabilitySlot`;
- `CapabilityRegistry` supports typed-slot register/list/get behavior;
- plugin manifests are light static declarations;
- plugin activation is serial and fail-fast;
- activation context exposes `registerSourceProvider` only;
- `source-provider` is the only implemented concrete slot;
- source-provider registrations use `providerId`;
- `source-provider.writePolicy` is `none`;
- provider ids are ref-component safe and must match provider descriptors;
- empty Extension runtime is valid;
- Server Host mounts empty Extension runtime by default;
- Stage Core mounts Extension as required runtime module `extension`;
- Extension module contributes no Stage Interface instruments, tools, or
  handlers;
- runtime status exposes Extension module lifecycle only.

## Verified Behavior

Recent verification:

```bash
npm run test:stage-core
npm test
npm run server:minemusic
git diff --check
```

`npm run server:minemusic` reports:

```json
{
  "status": "ready",
  "modules": [
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

## Guards

Current tests cover:

- active-tree root and import boundaries;
- plugin id validation;
- manifest validation;
- unknown capability failure;
- missing declared capability registration failure;
- duplicate plugin id failure;
- duplicate provider id failure;
- unsafe provider id failure;
- provider id mismatch failure;
- plugin activation throw/failure wrapping;
- registration after activation context closes is rejected;
- failed activation does not leave partial source-provider registrations active;
- core-only slot registration rejection;
- deterministic source-provider registration order;
- empty Extension runtime;
- default Server Host composition;
- compact runtime status output.

## Remaining Gaps

Current Extension intentionally does not implement:

- real provider implementations;
- provider execution context;
- provider config flow;
- provider accounts, secrets, OAuth/cookie handling, reauth, migration, health,
  cache, or rate limits;
- dynamic plugin loading;
- plugin dependency graph;
- plugin trust/origin policy;
- provider conformance tests against external APIs;
- query integration;
- request-scoped candidate relation;
- Music Data Platform writes;
- Stage Interface capability discovery;
- `MaterialCard` or final presentation.

## Next Candidate Slices

Possible next slices, in order of architectural dependency:

1. Provider execution/config runtime design, if the next phase wants real
   provider adapters.
2. Music Data Platform source/material/canonical persistence boundaries, if the
   next phase wants durable provider facts.
3. Query/result boundary, if the next phase wants provider candidates to enter
   agent decision output.
4. Stage Interface capability discovery, if agents need a public view of
   available provider/capability state.

Do not start any of these from Extension alone. Each needs its owning formal
area and ports defined first.
