# MineMusic Index

This index points to current authority documents. Archived evidence lives under
`docs/archive/` and is not current authority.

## Root

- `README.md`: project entrypoint.
- `CONTEXT.md`: vocabulary and bounded-context language.
- `ARCHITECTURE.md`: global architecture authority.
- `CURRENT_STATE.md`: current implementation summary.
- `PROGRESS.md`: project-level milestone index.
- `AGENTS.md`: repository operating rules for agents.

## Maintenance

- `docs/maintenance/documentation-architecture.md`: documentation structure
  rules for root docs, area docs, ports, archive notices, and docs guard scope.
- `docs/maintenance/documentation-alignment-plan.md`: phase plan for the
  documentation/code alignment sweep.
- `docs/maintenance/documentation-alignment-audit.md`: document-disposition
  ledger for the sweep.
- `docs/maintenance/architecture-inconsistency-log.md`: architecture
  inconsistency ledger.
- `docs/maintenance/clean-up-report.md`: current audit of remaining cleanup
  and legacy-risk items.
- `docs/maintenance/dead-code-compatibility-cleanup-plan.md`: cleanup plan
  outside this docs alignment sweep, including completed PR 4 Collection Item
  boundary cleanup.

## Decisions

- `docs/adr/0001-stage-core-runtime-composition.md`: accepted Stage Core /
  Stage Interface / Stage Modules naming decision.
- `docs/adr/0002-material-store-boundary.md`: accepted Material Store boundary
  decision.
- `docs/adr/0003-materialref-backed-collections.md`: accepted decision that
  Collection Service is materialRef-backed, superseding ADR-0002's
  canonical-only Collection consequence.

## Current Area Authority

| Area | Current docs |
| --- | --- |
| Stage Core | `docs/stage-core/design.md`, `docs/stage-core/ports.md`, `docs/stage-core/progress.md` |
| Stage Interface | `docs/stage-interface/design.md`, `docs/stage-interface/ports.md`, `docs/stage-interface/tool-contracts.md`, `docs/stage-interface/progress.md` |
| Material Flow | `docs/material/design.md`, `docs/material/ports.md`, `docs/material/projection-materialization.md`, `docs/material/progress.md` |
| Material Search | `docs/material-search/design.md`, `docs/material-search/progress.md` |
| Material Store | `docs/material-store/design.md`, `docs/material-store/ports.md`, `docs/material-store/progress.md` |
| Canonical Store | `docs/canonical-store/design.md`, `docs/canonical-store/ports.md`, `docs/canonical-store/provisional-review.md`, `docs/canonical-store/storage-model.md`, `docs/canonical-store/progress.md` |
| Collection Service | `docs/collection-service/design.md`, `docs/collection-service/ports.md`, `docs/collection-service/progress.md` |
| Library Import | `docs/library-import/design.md`, `docs/library-import/ports.md`, `docs/library-import/progress.md` |
| Platform Library Provider | `docs/platform-library-provider/design.md`, `docs/platform-library-provider/progress.md` |
| Source Providers | `docs/source-providers/netease.md` |
| Knowledge Slot | `docs/knowledge-slot/design.md`, `docs/knowledge-slot/musicbrainz-provider.md`, `docs/knowledge-slot/progress.md` |
| Host Adapters | `docs/host-adapters/codex-skill.md` |
| Operations | `docs/operations/minemusic-server-launchd.md` |

## Source Entrypoints

- `src/contracts/index.ts`: shared TypeScript contracts.
- `src/ports/index.ts`: public module ports and repository interfaces.
- `src/server/runtime.ts`, `src/server/index.ts`: MineMusic server runtime and
  HTTP MCP entrypoint.
- `src/stage_core/**`: runtime composition and lifecycle.
- `src/stage_interface/**`, `src/handbook/index.ts`: Stage Interface tools,
  descriptors, dispatch, compact output projection, and Handbook rendering.
- `src/material/**`: Material Store, Material Flow, Library Import, policy,
  selection, and recommendation presentation.
- `src/collection/index.ts`: Collection Service.
- `src/source/index.ts`: Source Grounding.
- `src/knowledge/index.ts`: Music Knowledge service.
- `src/providers/netease/index.ts`: NetEase source and platform-library
  providers.
- `src/providers/musicbrainz/index.ts`: MusicBrainz Knowledge provider.
- `src/storage/**`: in-memory and SQLite repository implementations.
- `skills/minemusic/SKILL.md`: Codex workflow skill.
- `skills/minemusic/HANDBOOK.md`: skill-local generated/snapshot Handbook, not
  Stage Interface authority.

## Archive

- `docs/archive/README.md`: archive policy and area index.
- `docs/archive/root/README.md`: archived root proposal and plans.
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
