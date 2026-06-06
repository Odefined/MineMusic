# MineMusic Index

This index points to current formal authority documents. Archived and
superseded evidence lives under `docs/archive/` or in explicitly marked
pre-formal area documents. Evidence is not current authority.

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
- `MineMusic_Formal_Project_Architecture_Audit_v3.md`: audit evidence and
  decision trace only.

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

## Maintenance

- `docs/maintenance/documentation-architecture.md`: documentation structure
  rules for root docs, area docs, ports, archive notices, and docs guard scope.
- `docs/maintenance/documentation-alignment-audit.md`: pre-formal
  document-disposition ledger.
- `docs/maintenance/architecture-inconsistency-log.md`: pre-formal
  architecture inconsistency ledger.
- `docs/maintenance/documentation-alignment-plan.md`: pre-formal documentation
  alignment phase plan.
- `docs/maintenance/clean-up-report.md`: pre-formal cleanup report.
- `docs/maintenance/dead-code-compatibility-cleanup-plan.md`: pre-formal
  cleanup plan.

## Pre-Formal Area Evidence

Existing area docs under these folders describe MVP-era implementation and are
not formal target authority until their owning formal phase rewrites them:

- `docs/stage-core/`
- `docs/stage-interface/`
- `docs/material/`
- `docs/material-search/`
- `docs/material-store/`
- `docs/canonical-store/`
- `docs/collection-service/`
- `docs/library-import/`
- `docs/platform-library-provider/`
- `docs/source-providers/`
- `docs/knowledge-slot/`
- `docs/host-adapters/`
- `docs/operations/`

## Source Entrypoints

The current source tree remains implementation inventory for later formal
phases. It is not formal target authority.

- `src/contracts/index.ts`: current shared TypeScript contracts.
- `src/ports/index.ts`: current ports and repository interfaces.
- `src/server/**`: current server runtime.
- `src/stage_core/**`: current runtime composition.
- `src/stage_interface/**`, `src/handbook/index.ts`: current Stage Interface
  implementation.
- `src/material/**`: current MVP material/source/canonical/query/presentation
  implementation.
- `src/collection/**`: current Collection implementation.
- `src/source/**`: current Source Grounding implementation.
- `src/knowledge/**`: current Knowledge implementation.
- `src/providers/**`: current provider adapters.
- `src/storage/**`: current storage adapters.
- `skills/minemusic/**`: current Codex integration package and Handbook
  snapshot.

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
