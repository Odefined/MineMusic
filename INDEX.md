# MineMusic Index

This index points to current formal authority documents. Archived evidence
lives under `docs/archive/` or git history. Evidence is not current authority.

## Root Authority

- `README.md`: human entrypoint.
- `ARCHITECTURE.md`: formal global architecture authority.
- `CURRENT_STATE.md`: formal rebuild current state.
- `PROGRESS.md`: formal rebuild milestone index.
- `AGENTS.md`: repository operating rules for agents.
- `CONTEXT.md`: pre-formal vocabulary file; not formal rebuild authority unless
  explicitly refreshed later.

## Formal Rebuild

- `docs/formal-project-glossary.md`: formal target vocabulary and
  MVP-to-formal term mapping.
- `docs/formal-rebuild/README.md`: formal rebuild planning index.
- `docs/formal-rebuild/phase-0-source-of-truth-reset.md`: Phase 0 spec and
  plan.
- `docs/formal-rebuild/phase-1-contract-vocabulary-reset.md`: Phase 1 spec and
  plan.
- `docs/formal-rebuild/phase-2-stage-core-runtime-baseline.md`: implemented
  Phase 2 spec for Stage Core runtime lifecycle, module contributions, Stage
  Interface attachment, and thin Server Host ownership.
- `docs/formal-rebuild/phase-3-extension-capability-slot-baseline.md`:
  implemented Phase 3 spec for Extension-owned capability slots, plugin
  manifests, registry semantics, source-provider slot registration, write
  policy, and Stage Core mounting.
- `docs/formal-rebuild/phase-4-music-database-foundation.md`: implemented
  Phase 4 spec for generic `MusicDatabase`, SQLite adapter confinement, root-only
  transactions, and centralized schema initialization.
- `docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md`:
  implemented Phase 5 spec for Music Data Platform identity records,
  source-material binding facts, repositories, commands, and the `refKey(ref)`
  storage-key policy.
- `docs/formal-rebuild/phase-6-source-provider-slot.md`: implemented Phase 6
  spec for Source Provider Slot search, NCM plugin, default composition,
  guards, docs, and smoke verification.
- `docs/formal-rebuild/phase-6-source-provider-slot-implementation-plan.md`:
  implemented Phase 6 execution plan.
- `docs/formal-rebuild/phase-7-source-library-import-foundation.md`:
  implemented Phase 7 spec for Platform Library Provider Slot, NCM source
  library reads, Music Data Platform source-library import persistence,
  material ref factory, runtime wiring, guards, docs, and smoke verification.
- `docs/formal-rebuild/phase-7-source-library-import-foundation-implementation-plan.md`:
  implemented Phase 7 execution plan.
- `docs/formal-rebuild/phase-8-owner-catalog-projection-foundation.md`:
  implemented Phase 8 spec for source-library fact rewrite, owner catalog
  projection schema, rebuild command, SQL view, and read port foundation.
- `docs/formal-rebuild/phase-8-owner-catalog-projection-foundation-implementation-plan.md`:
  implemented Phase 8 execution plan.
- `docs/formal-rebuild/phase-9-owner-material-relations-foundation.md`:
  draft Phase 9 spec for owner-material relation source-of-truth, scoped
  relation writes, relation projection, and material-scope blocked catalog
  exclusion.
- `docs/formal-rebuild/phase-9-owner-material-relations-foundation-implementation-plan.md`:
  draft Phase 9 execution plan for owner relation facts, scoped relation
  commands, owner-relation projection, blocked catalog exclusion, guards, and
  docs.
- `MineMusic_Formal_Project_Architecture_Audit_v3.md`: audit evidence and
  decision trace only.

## Current Area Docs

- `docs/extension/README.md`: Extension area documentation entrypoint.
- `docs/extension/design.md`: Extension Plugin System and Capability Slot
  design authority.
- `docs/extension/ports.md`: Extension provided/consumed ports, forbidden
  dependencies, composition, and guards.
- `docs/extension/progress.md`: Extension implementation state, verification
  evidence, remaining gaps, and next candidate slices.
- `docs/extension/plugins/ncm.md`: NCM plugin-specific config, source search
  mapping, platform library mapping, source refs, errors, and smoke usage.
- `docs/storage/README.md`: Storage area documentation entrypoint.
- `docs/storage/design.md`: generic MusicDatabase and SQLite adapter design
  authority for the implemented Phase 4 boundary.
- `docs/storage/ports.md`: Storage provided/consumed ports, forbidden
  dependencies, composition, and guard plan.
- `docs/storage/progress.md`: Storage implementation state, verification
  evidence, remaining gaps, and next candidate slices.
- `docs/music-data-platform/README.md`: Music Data Platform area
  documentation entrypoint.
- `docs/music-data-platform/design.md`: Music Data Platform identity and
  source-library/owner-catalog design authority.
- `docs/music-data-platform/ports.md`: Music Data Platform identity,
  source-library, and owner-catalog ports, forbidden dependencies,
  composition, and guards.
- `docs/music-data-platform/progress.md`: Music Data Platform implementation
  state, verification evidence, and remaining gaps.

## Formal ADRs

- `docs/adr/0004-same-repo-formal-rebuild.md`: same-repo formal rebuild and
  no default MVP compatibility layers.
- `docs/adr/0005-formal-top-level-architecture-areas.md`: formal top-level
  architecture areas.
- `docs/adr/0006-formal-identity-candidate-and-handle-boundaries.md`: formal
  entity/record, candidate, materialization, and handle boundary direction.
- `docs/adr/0007-collection-owner-relation-boundary.md`: Collection and owner
  relation source-of-truth split.

## Pre-Formal ADR Evidence

These ADRs record earlier MVP decisions. They are useful evidence, but the
formal target is controlled by the formal ADRs above.

- `docs/adr/0001-stage-core-runtime-composition.md`
- `docs/adr/0002-material-store-boundary.md`
- `docs/adr/0003-materialref-backed-collections.md`

## Maintenance Evidence

- `docs/maintenance/documentation-architecture.md`: documentation structure
  rules from the pre-formal documentation sweep.
- `docs/maintenance/documentation-alignment-audit.md`: pre-formal
  document-disposition ledger.
- `docs/maintenance/architecture-inconsistency-log.md`: pre-formal
  architecture inconsistency ledger.
- `docs/maintenance/documentation-alignment-plan.md`: pre-formal documentation
  alignment phase plan.
- `docs/maintenance/clean-up-report.md`: pre-formal cleanup report.
- `docs/maintenance/dead-code-compatibility-cleanup-plan.md`: pre-formal
  cleanup plan.

## Removed Active Area Docs

Pre-formal area docs were removed from active `docs/` during Phase 1. Their
old content remains available only through `docs/archive/` or git history.
Future area docs should be rebuilt directly from the formal architecture and
contracts when their owning phase starts.

## Source Entrypoints

The active source tree is the formal rebuild skeleton, not the old MVP runtime.

- `src/contracts/index.ts`: formal contracts, including Phase 1 entity/source
  vocabulary and Phase 2 runtime snapshot vocabulary.
- `src/stage_interface/index.ts`: minimal Stage Interface skeleton.
- `src/extension/source_provider_slot.ts`: Source Provider Slot registration
  and search validation seam.
- `src/extension/platform_library_provider_slot.ts`: Platform Library
  Provider Slot registration and read validation seam.
- `src/extension/plugins/ncm.ts`: NCM source-provider and
  platform-library-provider plugin.
- `src/extension/plugins/index.ts`: Extension plugin exports.
- `src/stage_core/index.ts`: Stage Core public exports.
- `src/stage_core/runtime.ts`: Stage Runtime lifecycle baseline.
- `src/stage_core/runtime_module.ts`: Stage Core runtime module contribution
  boundary.
- `src/stage_core/runtime_status.ts`: internal `stage.runtime.status` module.
- `src/server/host.ts`: thin Server Host lifecycle owner and internal source
  library import seam accessor.
- `src/server/config.ts`: Server Host default runtime composition config.
- `src/server/music_data_platform_runtime_module.ts`: Server Host composition
  module for Storage, Music Data Platform schemas, and internal Library Import
  service wiring.
- `src/server/index.ts`: minimal Server Host entrypoint and snapshot command.
- `src/index.ts`: formal skeleton package exports.
- `src/storage/database.ts`: generic `MusicDatabase` boundary.
- `src/storage/sqlite/database.ts`: concrete `SqliteMusicDatabase` adapter.
- `src/storage/sqlite/schema.ts`: SQLite pragma and schema contribution
  initialization.
- `src/storage/index.ts`: Storage public exports.
- `src/music_data_platform/errors.ts`: Music Data Platform invariant error
  type.
- `src/music_data_platform/identity_schema.ts`: Phase 5 identity schema
  contribution.
- `src/music_data_platform/identity_records.ts`: identity repositories and
  source-to-material binding records.
- `src/music_data_platform/identity_write_model.ts`: narrow identity write
  command factory.
- `src/music_data_platform/owner_scope.ts`: default owner-scope constant and
  owner-scope validation.
- `src/music_data_platform/source_library_ref.ts`: source-library ref helpers.
- `src/music_data_platform/source_library_schema.ts`: source-library fact and
  import-batch schema contribution.
- `src/music_data_platform/source_library_records.ts`: source-library,
  source-library item, import batch, and item outcome repositories.
- `src/music_data_platform/material_ref_factory.ts`: opaque material ref
  factory.
- `src/music_data_platform/owner_catalog_schema.ts`: owner catalog projection
  table and SQL view contribution.
- `src/music_data_platform/owner_catalog_records.ts`: internal owner catalog
  read port.
- `src/music_data_platform/owner_catalog_projection.ts`: owner catalog rebuild
  command.
- `src/music_data_platform/source_library_import.ts`: internal Library Import
  application service.
- `src/music_data_platform/index.ts`: Music Data Platform public exports.

The previous MVP runtime source and tests were removed from active tree and are
available only through git history.

## Archive

- `docs/archive/README.md`: archive policy and area index.
- `docs/archive/root/README.md`: archived root proposal, plans, and
  pre-formal root snapshots.
- `docs/archive/root/formal-rebuild-2026-06-06/`: archived pre-formal root
  `ARCHITECTURE.md`, `CURRENT_STATE.md`, and `PROGRESS.md`.
- `docs/archive/mvp/README.md`: archived original MVP baseline.
- `docs/archive/architecture-reviews/README.md`: archived architecture review
  evidence.
- `docs/archive/stage-core/README.md`: archived Stage Core refactor evidence.
- `docs/archive/stage-interface/README.md`: archived Stage Interface evidence.
- `docs/archive/material/README.md`: archived Material Flow evidence.
- `docs/archive/recommendation/README.md`: archived Recommendation posture
  evidence.
- `docs/archive/material-store/README.md`: archived Material Store evidence.
- `docs/archive/canonical-store/README.md`: archived Canonical Store evidence.
- `docs/archive/collection-service/README.md`: archived Collection Service
  evidence.
- `docs/archive/library-import/README.md`: archived Library Import evidence.
- `docs/archive/platform-library-provider/README.md`: archived Platform Library
  Provider evidence.
- `docs/archive/knowledge-slot/README.md`: archived Knowledge Slot evidence.
- `docs/archive/host-adapters/README.md`: archived host-adapter evidence.
