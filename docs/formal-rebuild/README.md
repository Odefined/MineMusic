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
| `phase-11-projection-maintenance-foundation.md` | Implemented Phase 11 spec for command-owned dirty projection maintenance, explicit rebuild runner boundaries, and source-of-truth invalidation wiring; PR11A, PR11B, and PR11C are complete. |
| `phase-11-projection-maintenance-foundation-implementation-plan.md` | Implemented Phase 11 execution plan split into PR 11A owner catalog projection scope repair, PR 11B Projection Maintenance Core, and PR 11C source-of-truth invalidation wiring. |
| `phase-12-retrieval-query-foundation.md` | Implemented Phase 12 spec for internal Music Intelligence Retrieval over local owner catalog and material text projections. |
| `phase-12-retrieval-query-foundation-implementation-plan.md` | Implemented Phase 12 execution plan split into PR 12A no-text Music Data Platform Retrieval Read Port, PR 12B Music Data Platform Text Query Integration, and PR 12C Music Intelligence Retrieval Service. |
| `phase-13-projection-maintenance-runtime-orchestration.md` | Implemented Phase 13 spec for Server Host background Projection Maintenance runner scheduling, batch policy, lifecycle, runtime-module ownership, and diagnostics boundaries. |
| `phase-13-projection-maintenance-runtime-orchestration-implementation-plan.md` | Implemented Phase 13 execution plan split into PR 13A scheduler helper, PR 13B runtime module integration, and PR 13C freshness closure integration. |
| `phase-14-source-library-update-reconciliation.md` | Implemented Phase 14 spec for reconciling source-library current membership after complete provider scans. |
| `phase-14-source-library-update-reconciliation-implementation-plan.md` | Implemented Phase 14 execution plan for command-owned source-library update reconciliation, guards, docs, and verification. |
| `phase-15-provider-search-pool-retrieval.md` | Phase 15 spec for internal provider-search pool retrieval, mixed result sets, material candidate cache, SQL ranking, and Source Provider Slot wiring; PR15A typed pool migration and PR15B runtime result-set foundation are implemented. |
| `phase-15-provider-search-pool-retrieval-implementation-plan.md` | Phase 15 execution plan split into PR 15A typed pools, PR 15B runtime result-set foundation, PR 15C fixture mixed query, and PR 15D provider slot wiring; PR15A and PR15B are implemented. |
| `phase-16-stage-interface-tool-frame-implementation-plan.md` | Phase 16 execution plan for the agent-facing Tool Framework, split into PR 16A contract layer, PR 16B Public Handle Veil + execution gate stub + timeout, PR 16C `list_scopes`, and PR 16D `lookup`; implemented. |
| `stage-interface-tool-frame.md` | Phase 16 design authority for the agent-facing Tool Framework skeleton (mandatory core plus owned extensible dimensions); pairs with ADR-0009 through ADR-0012, ADR-0014 through ADR-0017, ADR-0019, ADR-0020, and ADR-0024. |
| `phase-17-candidate-commit-and-present-implementation-plan.md` | Phase 17 execution plan for the first durable-write phase: Candidate Commit command (ADR-0011), Material Projection first landing, Effect Boundary auto-pass widening (ADR-0021), and the `music.experience.present` consumption tool; split into PR 17A/17B/17D/17C; implemented. |
| `phase-18-library-import-tools-implementation-plan.md` | Phase 18 execution plan for agent-facing library intake: the `library.import.*` tools (`list_sources` / `start` / `continue` / `status`) over the existing internal source-library import service, the `library.` top-level Public Agent Protocol namespace (not a new formal area), and the Effect Boundary intake auto-pass widening (ADR-0022); split into PR 18A/18B/18C/18D/18E; implemented. |
| `phase-19-library-relation-tools-implementation-plan.md` | Implemented Phase 19 execution plan for `library.relation.*` tools (`get` / `save` / `unsave` / `favorite` / `unfavorite` / `block` / `unblock`) over existing Music Data Platform owner-relation facts, including current relation-state output and the Effect Boundary owner-relation auto-pass qualifier for edits. |
| `phase-20-server-host-mcp-stdio-transport-implementation-plan.md` | Implemented Phase 20 execution plan for the MCP-over-stdio Server Host transport, production `StageToolContext` factory composition, MCP rendering/translation, cancellation, entrypoint wiring, guards, and smoke verification. |
| `phase-21-postgres-background-work-localize-implementation-plan.md` | Active Phase 21 execution plan for destructive Postgres storage migration, Background Work v1 over `pg-boss`, and `localizeProviderSource` runtime wiring. |
| `phase-22-search-core-metadata-lookup-refactor-implementation-plan.md` | Active Phase 22 plan for replacing lookup-time metadata/provider retrieval with Postgres-native Search Core metadata lookup. |
| `phase-23-library-catalog-tools-implementation-plan.md` | Implemented Phase 23 execution plan for `library.catalog.*` list-scope, browse, seed-sample, and summary tools over the Music Data Platform owner catalog projection. |
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
