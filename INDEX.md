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
- `docs/storage/README.md`: Storage area documentation entrypoint.
- `docs/storage/design.md`: generic MusicDatabase and SQLite adapter design
  authority for the implemented Phase 4 boundary.
- `docs/storage/ports.md`: Storage provided/consumed ports, forbidden
  dependencies, composition, and guard plan.
- `docs/storage/progress.md`: Storage implementation state, verification
  evidence, remaining gaps, and next candidate slices.
- `docs/music-data-platform/README.md`: Music Data Platform area
  documentation entrypoint.
- `docs/music-data-platform/design.md`: Phase 5 identity write model design
  authority.
- `docs/music-data-platform/ports.md`: Music Data Platform identity write
  ports, forbidden dependencies, composition, and guards.
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
- `src/stage_core/index.ts`: Stage Core public exports.
- `src/stage_core/runtime.ts`: Stage Runtime lifecycle baseline.
- `src/stage_core/runtime_module.ts`: Stage Core runtime module contribution
  boundary.
- `src/stage_core/runtime_status.ts`: internal `stage.runtime.status` module.
- `src/server/host.ts`: thin Server Host lifecycle owner.
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
