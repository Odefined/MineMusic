# Formal Rebuild Phase Specs

> Status: Formal rebuild phase-spec area
> Scope: Phase-level specs and execution plans for the same-repo formal rebuild
> Authority: These documents are not global architecture authority. Accepted
> decisions must land in root documents, ADRs, area current-authority documents,
> or source contracts before a phase is considered complete.

This directory keeps the formal rebuild phase specs separate from the migration
audit. It is a planning area, not a replacement for `ARCHITECTURE.md`,
`INDEX.md`, `CURRENT_STATE.md`, `PROGRESS.md`, ADRs, or area `design.md` /
`ports.md` documents.

## Documents

| Document | Purpose |
| --- | --- |
| `phase-0-source-of-truth-reset.md` | Docs-only reset for the formal source-of-truth set. |
| `phase-1-contract-vocabulary-reset.md` | Contract vocabulary reset for refs, entities, records, source facts, version info, links, and provider candidates. |
| `phase-2-stage-core-runtime-baseline.md` | Implemented Stage Core runtime baseline spec for lifecycle, module contributions, Stage Interface attachment, and thin Server Host ownership. |
| `phase-3-extension-capability-slot-baseline.md` | Implemented Extension capability-slot baseline for typed plugin manifests, registry semantics, source-provider slot registration, write policy, and Stage Core mounting. |
| `phase-4-music-database-foundation.md` | Implemented Phase 4 spec for generic `MusicDatabase`, SQLite adapter confinement, root-only transactions, and centralized schema initialization. |
| `phase-5-music-data-platform-identity-write-model.md` | Implemented Phase 5 spec for Music Data Platform identity records, source-material binding facts, repositories, commands, and ref-key write boundary. |
| `phase-6-source-provider-slot.md` | Implemented Phase 6 spec for Source Provider Slot search, NCM plugin, default composition, guards, docs, and smoke verification. |
| `phase-6-source-provider-slot-implementation-plan.md` | Implemented execution plan for Source Provider Slot search, NCM plugin, default composition, guards, docs, and smoke verification. |
| `phase-7-source-library-import-foundation.md` | Implemented Phase 7 spec for Platform Library Provider Slot, NCM source-library reads, source-backed material anchoring, runtime wiring, guards, docs, and smoke verification. |
| `phase-7-source-library-import-foundation-implementation-plan.md` | Implemented execution plan for Phase 7 Platform Library Provider Slot, NCM library import, source-backed material anchoring, runtime wiring, guards, and smoke verification. |
| `phase-8-owner-catalog-projection-foundation.md` | Implemented Phase 8 spec for source-library fact rewrite, owner catalog projection schema, rebuild commands, SQL catalog view, and read-port foundation. |
| `phase-8-owner-catalog-projection-foundation-implementation-plan.md` | Implemented execution plan for Phase 8 source-library fact rewrite, owner catalog projection schema, rebuild commands, read port, guards, and docs. |
| `phase-9-owner-material-relations-foundation.md` | Implemented Phase 9 spec for owner-material relation source-of-truth, scoped relation writes, owner-relation projection, and material-scope blocked catalog exclusion. |
| `phase-9-owner-material-relations-foundation-implementation-plan.md` | Implemented Phase 9 execution plan for owner relation facts, scoped relation commands, owner-relation projection, blocked catalog exclusion, guards, and docs. |
| `phase-10-music-data-platform-material-text-projection-foundation.md` | Implemented Phase 10 spec for material-centered text documents, owner-neutral FTS, explicit material ref rebuild commands, and internal match probes. |
| `phase-10-music-data-platform-material-text-projection-foundation-implementation-plan.md` | Implemented Phase 10 execution plan for schema, normalization, read port, rebuild commands, guards, runtime schema wiring, docs, and verification. |
| `phase-11-projection-maintenance-foundation.md` | Draft Phase 11 spec for command-owned dirty projection maintenance, explicit rebuild runner boundaries, and source-of-truth invalidation wiring. |
| `phase-11-projection-maintenance-foundation-implementation-plan.md` | Draft Phase 11 execution plan split into PR 11A owner catalog projection scope repair, PR 11B Projection Maintenance Core, and PR 11C source-of-truth invalidation wiring. |
| `../formal-project-glossary.md` | Formal target vocabulary and MVP-to-formal term mapping. |

The root audit
`MineMusic_Formal_Project_Architecture_Audit_v3.md` is companion planning
evidence. It is not a current authority document and should not be used as a
replacement for ADRs, root authority docs, area docs, or source contracts.

## Working Rules

- Do not edit `CONTEXT.md` as part of formal rebuild phase work unless the user
  explicitly asks for it.
- Phase specs may mention future `CONTEXT.md` glossary work only as a stable
  glossary follow-up, not as a place to record migration status or temporary
  implementation detail.
- A phase plan must state goal, non-goals, owning context, allowed reads,
  allowed writes, forbidden writes/imports, expected files, guards,
  verification, acceptance, and stopping condition.
- Completed phase plans should be converted into current authority, ADRs, and
  progress summaries, then archived if they no longer guide active work.
