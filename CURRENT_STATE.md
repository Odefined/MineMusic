# Formal Rebuild Current State

> Status: Formal rebuild state authority
> Scope: Project-level state during the same-repo formal rebuild
> Not target design: Global target architecture lives in `ARCHITECTURE.md`.

MineMusic is in Phase 0 of a same-repo formal rebuild. The formal architecture
and vocabulary are now separated from the old MVP implementation. Current code
still contains MVP-era surfaces and should be treated as migration/deletion
inventory until the owning formal phase rewrites it.

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

## Deleted Formal v1 Surfaces

Formal v1 deletes these MVP concepts and does not preserve them with
compatibility aliases:

- Material Resolve as a public/domain surface;
- Ephemeral Material and `emat` material identity;
- public `canonical.review.*` tools;
- public `mat:` / `emat:` material id codecs;
- active `MusicMaterial` and `SourceMaterial` contracts.

## Current Code Migration State

The TypeScript runtime remains the pre-formal MVP implementation. It may still
compile and run, but it is not the formal architecture authority.

Known pre-formal code inventory includes:

- public/domain Material Resolve paths;
- process-local ephemeral material handles;
- public `mat:` / `emat:` handle codecs;
- public canonical review tools;
- MVP `MusicMaterial` / `SourceMaterial` vocabulary;
- old area boundaries such as Material Flow, Material Store, Canonical Store,
  Material Search, Collection Service, Library Import, Knowledge Slot, and
  Plugin Slots.

These are migration/deletion inventory for later formal phases. Their presence
in code does not re-accept them as formal architecture.

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
- Existing area docs that still describe MVP resolve, ephemeral material,
  public canonical review, or old query paths are superseded for formal target
  authority until their owning formal phase rewrites them.

`CONTEXT.md` was not edited in Phase 0. If it is updated later by explicit user
request, it should be stable glossary only, not migration status or temporary
implementation explanation.

## Not Yet Migrated

Phase 0 does not change:

- `src/**`;
- TypeScript contracts;
- provider implementations;
- Stage Interface tool definitions;
- runtime composition;
- database schemas;
- generated runtime artifacts;
- area design/ports/progress docs beyond superseded notices.

Phase 1 owns formal contract vocabulary reset. Later phases own code and area
documentation rewrites.

## Verification Pointers

Phase 0 is docs-only. Verification for this state should include:

```bash
git diff --check
git diff --name-only
```

No source-code tests are required for Phase 0 unless a later edit leaves the
docs-only boundary.
