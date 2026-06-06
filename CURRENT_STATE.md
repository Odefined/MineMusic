# Formal Rebuild Current State

> Status: Formal rebuild state authority
> Scope: Project-level state during the same-repo formal rebuild
> Not target design: Global target architecture lives in `ARCHITECTURE.md`.

MineMusic has completed Phase 2 of a same-repo formal rebuild. The active
TypeScript tree is a formal runtime skeleton with Phase 1 contract vocabulary
and a Phase 2 Stage Core runtime lifecycle baseline. Old MVP implementation
code and tests are no longer active-tree migration inventory; they are
preserved by git history and archive docs only.

## Established Formal Decisions

- The project remains in this repository.
- The formal project is a rebuild, not a new blank project and not an MVP
  patching pass.
- Old MVP docs and old MVP code are evidence, donor material, deletion
  inventory, and migration input only.
- No compatibility layers, aliases, adapters, or bridges should be added just
  to preserve old MVP flows.
- Old code is preserved by git history and optional snapshot tag or branch, not
  by copying old modules into active-tree archive folders.
- Formal top-level architecture areas are Server Host, Stage Interface, Stage
  Core, Extension, Music Data Platform, Music Intelligence, Music Experience,
  Memory, and Effect Boundary.
- Stage is a product metaphor and naming root, not a top-level bounded context.
- Stage Interface owns agent-facing instruments, tools, schemas, Handbook,
  validation, compact public outputs, dispatch, and session-aware availability.
- Instrument and Tool are agent-facing workbench structure. They are not
  bounded contexts, domain services, or capability slots.
- Extension owns Plugin System, Capability Slots, provider/plugin manifests,
  and adapter replaceability semantics.
- Source Provider is a Capability Slot under Plugin System, not a top-level
  provider platform.
- Music Data Platform owns source/material/canonical identity, owner-scoped
  fact families, Collection, Library Import / Update persistence, projections,
  and Canonical Maintenance.
- Music Intelligence contains Retrieval and Knowledge only.
- Music Experience owns radio/listening interaction behavior and durable music
  experience state.
- Memory is an independent long-term user/music relationship area.
- Effect Boundary owns side-effect permission, approval, audit, and execution
  policy.

## Formal Vocabulary State

Formal target vocabulary lives in `docs/formal-project-glossary.md`.
The implemented Phase 1 and Phase 2 TypeScript vocabulary lives in
`src/contracts/index.ts`.

Accepted vocabulary includes:

- `Ref = { namespace, kind, id, label? }`;
- `refKey(ref)` as the one public string helper, with `:` banned in ref
  components;
- `SourceEntity` / `SourceRecord`;
- `MaterialEntity` / `MaterialRecord`;
- `CanonicalEntity` / `CanonicalRecord`;
- `SourceEntity.kind = track | album | artist`;
- material/canonical kinds `recording | album | artist | work | release`;
- first-class `VersionInfo`;
- source-owned `PlayableLink = { url, label?, requiresAccount? }`;
- `ProviderMaterialCandidate = { sourceEntity, providerScore? }`;
- `Collection` as a user-named organizing container;
- `owner_material_relations` as owner-scoped factual relation source-of-truth;
- query hits/results as agent decision evidence;
- `MaterialCard` as final Stage Interface presentation output only.

Phase 2 runtime vocabulary includes:

- `StageRuntimeStatus = created | initializing | ready | failed | stopping |
  stopped`;
- `RuntimeModuleStatus = created | initializing | initialized | stopping |
  stopped | failed`;
- `RuntimeModuleOwnerArea`, excluding `server_host` and `stage_interface`;
- compact `RuntimeErrorSummary`;
- `RuntimeModuleSnapshot`;
- expanded `StageRuntimeSnapshot` with module snapshots, compact failure
  summary, optional cleanup errors, and `interfaceContract`.

## Deleted Formal v1 Surfaces

Formal v1 deletes these MVP concepts and does not preserve them with
compatibility aliases:

- Material Resolve as a public/domain surface;
- Ephemeral Material and `emat` material identity;
- public `canonical.review.*` tools;
- public `mat:` / `emat:` material id codecs;
- active `MusicMaterial` and `SourceMaterial` contracts.

## Current Code Migration State

The active TypeScript tree is now a formal skeleton:

- `src/contracts/index.ts` owns Phase 1 contracts and Phase 2 runtime snapshot
  contracts;
- `src/stage_interface/index.ts` owns the minimal Stage Interface skeleton;
- `src/stage_core/runtime_module.ts` owns the Stage Core-only
  `RuntimeModule` contribution boundary;
- `src/stage_core/runtime.ts` owns the Stage Runtime lifecycle baseline;
- `src/stage_core/runtime_status.ts` owns the internal
  `stage.runtime.status` module;
- `src/stage_core/index.ts` owns Stage Core public exports;
- `src/server/host.ts` owns the thin Server Host lifecycle wrapper;
- `src/server/index.ts` owns the minimal Server Host entrypoint.

The current runtime starts in `created`, initializes required runtime modules
through Server Host, builds Stage Interface from module contributions, exposes
`stage.runtime.status`, and supports compact lifecycle snapshots. All runtime
modules are required. Phase 2 does not support optional modules, dependency
resolution, capability lookup, retry, reload, or restart.

The old MVP runtime roots, provider integrations, storage adapters, material
flow, source grounding, collection service, library import runtime, Codex skill
snapshot, launchd reset script, and old tests were removed from active source.
They remain available through git history for reference only. They must not be
restored as compatibility layers.

## Documentation State

- `ARCHITECTURE.md` is the formal global architecture authority.
- `docs/formal-project-glossary.md` owns formal target vocabulary and
  MVP-to-formal term mapping.
- `docs/adr/0004-same-repo-formal-rebuild.md` records the same-repo rebuild
  posture and no-compatibility decision.
- `docs/adr/0005-formal-top-level-architecture-areas.md` records the nine
  formal top-level areas.
- `docs/adr/0006-formal-identity-candidate-and-handle-boundaries.md` records
  the formal identity/candidate/handle boundary direction.
- `docs/adr/0007-collection-owner-relation-boundary.md` records the Collection
  and owner relation source-of-truth split.
- Old root architecture/state/progress snapshots are archived under
  `docs/archive/root/formal-rebuild-2026-06-06/`.
- Pre-formal active area docs, host-adapter docs, provider docs, and operations
  docs were removed from active `docs/`. Evidence remains in `docs/archive/`
  and git history only.

`CONTEXT.md` was not edited in Phase 0. If it is updated later by explicit user
request, it should be stable glossary only, not migration status or temporary
implementation explanation.

## Not Yet Migrated

Phase 2 does not implement:

- provider integrations;
- Extension Plugin System or capability slot semantics;
- storage adapters or database schemas;
- MCP/HTTP transport;
- query engine behavior;
- query hit public output shape;
- query-to-present flow;
- final `MaterialCard` key set;
- source-library, collection, owner relation, wrong-version, or
  recording-to-work relation workflows;
- recommendation, radio, memory, or effect runtime behavior;
- handbook tools or music-domain tools beyond the internal runtime status
  tool.

Later phases rebuild those areas directly from formal architecture and
contracts.

## Verification Pointers

Phase 2 verification for this state should include:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```
