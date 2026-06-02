# Documentation Alignment Audit

This document is the document-disposition ledger for the MineMusic
documentation/code alignment sweep.

The sweep is docs-only. Do not modify source code, tests, schemas, generated
runtime artifacts, or implementation guards while executing this audit.

Use `docs/maintenance/architecture-inconsistency-log.md` for architecture
disagreements. This audit records what happens to documents.

## Disposition Statuses

- `pending-review`
- `keep-current`
- `update-current`
- `merge-into-current`
- `archive-after-extract`
- `archive-no-extract`
- `delete-empty-or-duplicate`
- `done`
- `blocked`

## Documents

| Path | Area | Current role | Status | Target | Extract before action | Evidence checked | Related inconsistencies | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `AGENTS.md` | Root | Repository operating rules | keep-current | Root authority | No | Phase 0: read directly | None | Existing rules route documentation-structure work through `docs/maintenance/documentation-architecture.md`. |
| `ARCHITECTURE.md` | Root | Global architecture authority | pending-review | Root authority | N/A | Phase 0: read for scope | Pending | Consolidate in Phase 6 after area facts are checked. |
| `CONTEXT.md` | Root | Project glossary | pending-review | Root glossary | N/A | Phase 0: inventory only | Pending | Check for status/detail drift in Phase 6. |
| `CURRENT_STATE.md` | Root | Project implementation summary | pending-review | Root state summary | N/A | Phase 0: read for scope | Pending | Consolidate in Phase 6 and link area progress for detail. |
| `INDEX.md` | Root | Current authority map | update-current | Root authority map | No | Phase 0: read and updated | None | Added archive entrypoint during foundation. |
| `PROGRESS.md` | Root | Project milestone index | update-current | Root milestone index | No | Phase 0: read and updated | None | Added documentation-alignment foundation milestone. |
| `README.md` | Root | Human entrypoint | pending-review | Root entrypoint | N/A | Phase 0: read for scope | Pending | Consolidate in Phase 6 after root archive moves. |
| `docs/archive/README.md` | Archive | Archive entrypoint | keep-current | Archive policy index | No | Phase 0: created | None | Explains archive lookup and records docs guard status. |
| `docs/adr/0001-stage-core-runtime-composition.md` | ADR | Accepted decision | keep-current | ADR authority | No | Phase 0: inventory only | Pending | Re-check against root architecture in Phase 6. |
| `docs/adr/0002-material-store-boundary.md` | ADR | Accepted decision | keep-current | ADR authority | No | Phase 0: inventory only | Pending | Use as evidence in Phase 3. |
| `docs/canonical-store/design.md` | Canonical Store | Current area design | pending-review | `docs/canonical-store/design.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/implementation-plan.md` | Canonical Store | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/interfaces.md` | Canonical Store | Interface design/current-adjacent | pending-review | `docs/canonical-store/ports.md` candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/progress.md` | Canonical Store | Current area progress | pending-review | `docs/canonical-store/progress.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/provisional-hints-implementation-plan.md` | Canonical Store | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/provisional-review-cases.md` | Canonical Store | Topic/reference cases | pending-review | Canonical current topic or archive | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/provisional-review-v1-implementation-plan.md` | Canonical Store | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/provisional-review-v1.md` | Canonical Store | Superseded design draft | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/provisional-review-v2-implementation-plan.md` | Canonical Store | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/provisional-review-v2.1-implementation-plan.md` | Canonical Store | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/provisional-review-v2.md` | Canonical Store | Superseded design draft | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/provisional-review-v3-implementation-plan.md` | Canonical Store | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/provisional-review-v3.md` | Canonical Store | Superseded design draft | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/provisional-review.md` | Canonical Store | Current topic design candidate | pending-review | `docs/canonical-store/provisional-review.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/source-entity-layer-handoff.md` | Canonical Store | Historical handoff | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/canonical-store/storage-model.md` | Canonical Store | Storage topic | pending-review | Canonical current topic or archive | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/collection-service/design.md` | Collection Service | Current area design | pending-review | `docs/collection-service/design.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 4. |
| `docs/collection-service/implementation-plan.md` | Collection Service | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 4. |
| `docs/collection-service/progress.md` | Collection Service | Current area progress | pending-review | `docs/collection-service/progress.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 4. |
| `docs/host-adapters/codex-skill.md` | Host Adapters | Current host-adapter topic | pending-review | `docs/host-adapters/codex-skill.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/host-adapters/service-adapter-refactor-plan.md` | Host Adapters | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/knowledge-slot/design.md` | Knowledge | Current area design | pending-review | `docs/knowledge-slot/design.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/knowledge-slot/implementation-plan.md` | Knowledge | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/knowledge-slot/musicbrainz-provider.md` | Knowledge | Current provider topic | pending-review | `docs/knowledge-slot/musicbrainz-provider.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/knowledge-slot/progress.md` | Knowledge | Current area progress | pending-review | `docs/knowledge-slot/progress.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/library-import/design.md` | Library Import | Current area design | pending-review | `docs/library-import/design.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 4. |
| `docs/library-import/implementation-plan.md` | Library Import | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 4. |
| `docs/library-import/progress.md` | Library Import | Current area progress | pending-review | `docs/library-import/progress.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 4. |
| `docs/maintenance/architecture-inconsistency-log.md` | Maintenance | Inconsistency ledger | keep-current | Maintenance authority | No | Phase 0: read | None | No open entries at foundation start. |
| `docs/maintenance/dead-code-compatibility-cleanup-plan.md` | Maintenance | Active cleanup plan | pending-review | Maintenance plan | N/A | Phase 0: inventory only | Pending | Not part of area authority sweep unless root audit finds drift. |
| `docs/maintenance/documentation-alignment-audit.md` | Maintenance | Document disposition ledger | update-current | Maintenance authority | No | Phase 0: updated | None | Inventory established. |
| `docs/maintenance/documentation-alignment-plan.md` | Maintenance | Sweep phase plan | keep-current | Maintenance authority | No | Phase 0: read | None | Execution source for this branch. |
| `docs/maintenance/documentation-architecture.md` | Maintenance | Documentation structure rules | keep-current | Maintenance authority | No | Phase 0: read | None | Rule source for this branch. |
| `docs/material-store/implementation-plan.md` | Material Store | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/material-store/progress.md` | Material Store | Current area progress | pending-review | `docs/material-store/progress.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 3. |
| `docs/material/design.md` | Material Flow | Current area design | done | `docs/material/design.md` | Completed | Phase 2: `src/material/**`, `src/stage_core/compose.ts`, material architecture guard | None | Added as current Material Flow authority. |
| `docs/material/ports.md` | Material Flow | Current ports document | done | `docs/material/ports.md` | Completed | Phase 2: `src/ports/index.ts`, `src/material/**`, exact port key guards | None | Added per documentation architecture rules. |
| `docs/material/projection-materialization.md` | Material Flow | Current projection/materialization topic | done | `docs/material/projection-materialization.md` | Completed | Phase 2: projection/materialization modules and boundary guards | None | Added current split between read projection and writer materialization. |
| `docs/material/progress.md` | Material Flow | Current area progress | done | `docs/material/progress.md` | N/A | Phase 2: `src/material/**`, Stage Core wiring, material tests | None | Rewritten as current status summary; historical PR ledger retained through root milestones and archives. |
| `docs/archive/material/README.md` | Material Flow Archive | Archive area README | done | `docs/archive/material/README.md` | N/A | Phase 2: archive rules and moved material documents | None | Created archive index for historical material evidence. |
| `docs/archive/material/2026-06-02/minemusic-musicmaterial-design.md` | Material Flow Archive | Historical design | done | `docs/material/design.md`, `docs/material/ports.md`, `docs/material/projection-materialization.md` | Yes | Phase 2: extracted current Material Flow facts | None | Archived with required notice. |
| `docs/archive/material/2026-06-02/minemusic-musicmaterial-post-merge-review.md` | Material Flow Archive | Historical review notes | done | `docs/material/progress.md` | Yes | Phase 2: extracted current completed boundary facts | None | Archived with required notice. |
| `docs/archive/material/2026-06-02/minemusic_b2_narrow_material_query_design.md` | Material Flow Archive | Historical boundary design slice | done | `docs/material/design.md`, `docs/material/ports.md` | Yes | Phase 2: checked current query/projection ports | None | Archived with required notice. |
| `docs/archive/material/2026-06-02/minemusic_b2_narrow_material_query_pr_plan.md` | Material Flow Archive | Historical PR plan | done | `docs/material/ports.md`, `docs/material/progress.md` | Yes | Phase 2: checked query/projection guard status | None | Archived with required notice. |
| `docs/archive/material/2026-06-02/minemusic_b3_b4_projection_materialization_pr_plan.md` | Material Flow Archive | Historical PR plan | done | `docs/material/projection-materialization.md`, `docs/material/progress.md` | Yes | Phase 2: checked projection/materialization modules and guards | None | Archived with required notice. |
| `docs/archive/material/2026-06-02/minemusic_extract_material_selector_composition_pr_plan.md` | Material Flow Archive | Historical PR plan | done | `docs/material/design.md`, `docs/material/ports.md`, `docs/material/progress.md` | Yes | Phase 2: checked Stage Core selector wiring | None | Archived with required notice. |
| `docs/archive/material/2026-06-02/minemusic_musicmaterial_pr_plan.md` | Material Flow Archive | Historical PR plan | done | `docs/material/design.md`, `docs/material/progress.md` | Yes | Phase 2: extracted current materialId/materialRef facts | None | Archived with required notice. |
| `docs/archive/material/2026-06-02/minemusic_narrow_material_policy_selection_ports_pr_plan.md` | Material Flow Archive | Historical PR plan | done | `docs/material/ports.md`, `docs/material/progress.md` | Yes | Phase 2: checked policy/selection narrow ports | None | Archived with required notice. |
| `docs/archive/material/2026-06-02/minemusic_stage_interface_output_ownership_design.md` | Material Flow Archive | Historical boundary design slice | done | `docs/material/design.md`, `docs/stage-interface/design.md`, `docs/stage-interface/tool-contracts.md` | Yes | Phase 2: checked Material/Stage Interface output ownership | None | Archived with required notice. |
| `docs/archive/material/2026-06-02/minemusic_stage_interface_output_ownership_pr_plan.md` | Material Flow Archive | Historical PR plan | done | `docs/material/progress.md`, `docs/stage-interface/progress.md` | Yes | Phase 2: checked output ownership guard status | None | Archived with required notice. |
| `docs/mvp/agent-collaboration.md` | MVP Archive | Historical MVP baseline | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6. |
| `docs/mvp/communication-protocols.md` | MVP Archive | Historical MVP baseline | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6. |
| `docs/mvp/final-review.md` | MVP Archive | Historical review evidence | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6. |
| `docs/mvp/interface-contracts.md` | MVP Archive | Historical MVP baseline | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6. |
| `docs/mvp/module-boundaries.md` | MVP Archive | Historical MVP baseline | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6. |
| `docs/mvp/module-interfaces.md` | MVP Archive | Historical MVP baseline | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6. |
| `docs/mvp/verification-report.md` | MVP Archive | Historical verification evidence | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6. |
| `docs/mvp/workstreams.md` | MVP Archive | Historical MVP baseline | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6. |
| `docs/operations/minemusic-server-launchd.md` | Operations | Current operations procedure | pending-review | `docs/operations/minemusic-server-launchd.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/platform-library-provider/design.md` | Platform Library Provider | Current provider-slot design | pending-review | `docs/platform-library-provider/design.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/platform-library-provider/netease-implementation-plan.md` | Platform Library Provider | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/platform-library-provider/progress.md` | Platform Library Provider | Current area progress | pending-review | `docs/platform-library-provider/progress.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/archive/recommendation/README.md` | Recommendation Archive | Archive area README | done | `docs/archive/recommendation/README.md` | N/A | Phase 2: archive rules and moved recommendation documents | None | Created archive index for recommendation posture evidence. |
| `docs/archive/recommendation/2026-06-02/minemusic_recommendation_posture_design_final.md` | Recommendation Archive | Historical boundary design slice | done | `docs/material/design.md`, `docs/material/ports.md`, `docs/stage-interface/tool-contracts.md` | Yes | Phase 2: extracted current selection/presentation/output facts | None | Archived with required notice. |
| `docs/archive/recommendation/2026-06-02/minemusic_recommendation_posture_pr_plan_final.md` | Recommendation Archive | Historical PR plan | done | `docs/material/progress.md`, `docs/stage-interface/progress.md` | Yes | Phase 2: checked current recommendation presentation and public output facts | None | Archived with required notice. |
| `docs/source-providers/netease.md` | Source Providers | Current provider topic | pending-review | `docs/source-providers/netease.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 5. |
| `docs/stage-core/minemusic_stage_core_refactoring_design.md` | Stage Core | Historical/current design content | pending-review | Stage Core current docs or archive | Yes | Phase 0: inventory only | Pending | Process in Phase 6 root/manual audit. |
| `docs/stage-core/minemusic_stage_core_refactoring_execution_plan.md` | Stage Core | Historical execution plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6 root/manual audit. |
| `docs/stage-core/minemusic_stage_runtime_interface_narrowing_plan.md` | Stage Core | Historical implementation plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6 root/manual audit. |
| `docs/stage-core/progress.md` | Stage Core | Current area progress | pending-review | `docs/stage-core/progress.md` | N/A | Phase 0: inventory only | Pending | Process in Phase 6 root/manual audit. |
| `docs/stage-interface/design.md` | Stage Interface | Current area design | done | `docs/stage-interface/design.md` | Completed | Phase 1: `src/stage_interface/**`, `src/surfaces/mcp/server.ts`, `src/contracts/index.ts`, `src/ports/index.ts`, Stage Interface/MCP tests | None | Rewritten as current boundary design. |
| `docs/stage-interface/ports.md` | Stage Interface | Current ports document | done | `docs/stage-interface/ports.md` | N/A | Phase 1: `src/ports/index.ts`, `src/stage_interface/dispatch.ts`, tests | None | Added per documentation architecture rules. |
| `docs/stage-interface/tool-contracts.md` | Stage Interface | Current public tool contracts | done | `docs/stage-interface/tool-contracts.md` | Completed | Phase 1: tool definitions, stable-order tests, MCP parity tests | None | Added as public Stage Interface surface authority. |
| `docs/stage-interface/progress.md` | Stage Interface | Current area progress | done | `docs/stage-interface/progress.md` | Completed | Phase 1: evidence paths listed in file | None | Updated with authority split and docs-alignment evidence. |
| `docs/archive/stage-interface/README.md` | Stage Interface Archive | Archive area README | done | `docs/archive/stage-interface/README.md` | N/A | Phase 1: archive rule source and moved documents | None | Created archive index for Stage Interface historical evidence. |
| `docs/archive/stage-interface/2026-06-02/minemusic_stage_interface_tool_contract_design.md` | Stage Interface Archive | Historical boundary design slice | done | `docs/stage-interface/design.md`, `docs/stage-interface/tool-contracts.md`, `docs/stage-interface/ports.md` | Yes | Phase 1: extracted current contract behavior | None | Archived with required notice. |
| `docs/archive/stage-interface/2026-06-02/minemusic_stage_interface_tool_contract_execution_plan.md` | Stage Interface Archive | Historical execution plan | done | `docs/stage-interface/progress.md`, `docs/stage-interface/tool-contracts.md` | Yes | Phase 1: extracted completed status and tests | None | Archived with required notice. |
| `docs/archive/stage-interface/2026-06-02/stage_interface_agent_facing_language_normalization_plan.md` | Stage Interface Archive | Historical implementation plan | done | `docs/stage-interface/tool-contracts.md`, `docs/stage-interface/progress.md` | Yes | Phase 1: extracted public-handle and removed-tool facts | None | Archived with required notice. |
| `docs/archive/stage-interface/2026-06-02/stage_interface_language_normalization_consensus.md` | Stage Interface Archive | Historical decision notes | done | `docs/stage-interface/tool-contracts.md` | Yes | Phase 1: extracted materialId/source-library/resolve/display-link policy | None | Archived with required notice. |
| `docs/archive/stage-interface/2026-06-02/stage_interface_language_normalization_followup_plan.md` | Stage Interface Archive | Historical implementation plan | done | `docs/stage-interface/progress.md`, `docs/stage-interface/tool-contracts.md` | Yes | Phase 1: extracted completed public-surface facts | None | Archived with required notice. |
| `docs/archive/stage-interface/2026-06-02/todo.md` | Stage Interface Archive | Historical TODO | done | `docs/stage-interface/progress.md` | Yes | Phase 1: future cleanup retained in progress | None | Archived with required notice. |
| `plan/mvp_phase_plan.md` | Root Archive | Historical MVP plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6. |
| `plan/subagent_mvp_master_plan.md` | Root Archive | Historical coordination plan | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6. |
| `proposal.md` | Root Archive | Historical product proposal | pending-review | Archive candidate | Yes | Phase 0: inventory only | Pending | Process in Phase 6 after product framing is retained in root docs. |
| `skills/minemusic/HANDBOOK.md` | Codex Skill | Generated/snapshot handbook | pending-review | Skill snapshot | N/A | Phase 0: inventory only | Pending | Process in Phase 5; do not treat as Stage Interface authority. |
| `skills/minemusic/SKILL.md` | Codex Skill | Current host workflow skill | pending-review | Skill workflow | N/A | Phase 0: inventory only | Pending | Process in Phase 5. |

## Area Progress

| Area | Status | Current authority updated | Audit rows updated | Inconsistencies recorded | Archive complete | Checks | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 0 Foundation | done | `docs/archive/README.md`, `INDEX.md`, `PROGRESS.md` | Yes | None found in foundation setup | Root archive entrypoint only | `rg --files -g '*.md'`; `git diff --check`; `git diff --name-only`; full git status | `npm run check:docs` / `scripts/check-docs.mjs` is specified but not implemented; this docs-only sweep records manual equivalent checks instead. |
| Stage Interface | done | `docs/stage-interface/design.md`, `docs/stage-interface/ports.md`, `docs/stage-interface/tool-contracts.md`, `docs/stage-interface/progress.md`, `INDEX.md`, `ARCHITECTURE.md`, `PROGRESS.md` | Yes | None found | Completed for processed Stage Interface files | `git diff --check`; `git diff --name-only`; full git status; old Stage Interface path search; archive notice check | Source facts checked from Tool Definitions, dispatch, MCP, contracts, ports, outputs, and Stage Interface/MCP tests. |
| Material Flow | done | `docs/material/design.md`, `docs/material/ports.md`, `docs/material/projection-materialization.md`, `docs/material/progress.md`, `INDEX.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`, `PROGRESS.md` | Yes | None found | Completed for processed Material Flow and Recommendation files | `git diff --check`; `git diff --name-only`; full git status; old material/recommendation path search; archive notice check | Source facts checked from `src/material/**`, Stage Core wiring, material architecture guards, and material query/resolve/presentation tests. |
| Material Store + Canonical Store | pending-review | Pending Phase 3 | Initial rows only | Pending | Pending | Pending | Phase 3. |
| Collection Service + Library Import | pending-review | Pending Phase 4 | Initial rows only | Pending | Pending | Pending | Phase 4. |
| Providers + Knowledge + Host Adapters + Operations | pending-review | Pending Phase 5 | Initial rows only | Pending | Pending | Pending | Phase 5. |
| Root Consolidation + Final Manual Audit | pending-review | Pending Phase 6 | Initial rows only | Pending | Pending | Pending | Phase 6. |

## Area Checklist

For each area:

- Identify current authority documents.
- Check current code facts for the area.
- Update current documents to describe observed code behavior.
- Record architecture conflicts in
  `docs/maintenance/architecture-inconsistency-log.md`.
- Extract useful content from old plans or drafts before archive, resolving or
  creating the current authority owner when needed.
- Add required archive notices to archived documents.
- Update root documents only as their responsibilities require.
- Run docs guard and relevant docs-only checks.
