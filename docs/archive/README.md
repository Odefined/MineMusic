# Documentation Archive

This directory preserves historical MineMusic documentation after current
content has been extracted into the active authority documents.

Archived documents are evidence. They are not current design, progress,
workflow, or implementation authority.

## Current Authority Lookup

- Current global architecture: `ARCHITECTURE.md`
- Current authority map: `INDEX.md`
- Current project state: `CURRENT_STATE.md`
- Project milestone index: `PROGRESS.md`
- Documentation operating rules:
  `docs/maintenance/documentation-architecture.md`
- Document disposition ledger:
  `docs/maintenance/documentation-alignment-audit.md`
- Architecture inconsistency ledger:
  `docs/maintenance/architecture-inconsistency-log.md`

## Archive Rules

Each archived document must begin with the required notice from
`docs/maintenance/documentation-architecture.md`:

```markdown
> Status: Archived
> Archived on: YYYY-MM-DD
> Superseded by: ...
> Use only for: ...
> Related audit: `docs/maintenance/documentation-alignment-audit.md`
> Related inconsistencies: `AI-001`
```

`Related inconsistencies` may be omitted when the archived document is not tied
to an open architecture inconsistency. The other fields are required.

Archive area README files should point back to current formal authority and
list archived documents with their superseding targets. After the Phase 1
active-tree reset, pre-formal area docs are not active authority; use root
formal architecture, formal vocabulary, phase docs, and source contracts
instead.

## Archived Areas

| Area | Current authority | Archive README | Notes |
| --- | --- | --- | --- |
| Root Proposal And Plans | `README.md`, `ARCHITECTURE.md`, `CURRENT_STATE.md`, `INDEX.md`, `PROGRESS.md`, `docs/maintenance/documentation-alignment-plan.md` | `docs/archive/root/README.md` | Phase 6 archived historical root proposal and planning evidence. |
| MVP Baseline | `README.md`, `ARCHITECTURE.md`, `CURRENT_STATE.md`, `INDEX.md`, `docs/formal-project-glossary.md` | `docs/archive/mvp/README.md` | Phase 6 archived original MVP documentation baseline. |
| Architecture Reviews | `ARCHITECTURE.md`, formal ADRs, `docs/formal-rebuild/`, `src/contracts/index.ts` | `docs/archive/architecture-reviews/README.md` | Phase 6 archived historical architecture-review evidence. |
| Stage Core | `ARCHITECTURE.md`, `CURRENT_STATE.md`, `src/stage_core/index.ts`, `test/formal/stage-runtime.test.ts` | `docs/archive/stage-core/README.md` | Historical Stage Core Runtime Kit planning evidence. |
| Stage Interface | `ARCHITECTURE.md`, `CURRENT_STATE.md`, `src/stage_interface/index.ts`, `test/formal/stage-runtime.test.ts` | `docs/archive/stage-interface/README.md` | Historical tool-contract and language-normalization planning evidence. |
| Material Flow | `ARCHITECTURE.md`, `docs/formal-project-glossary.md`, `src/contracts/index.ts` | `docs/archive/material/README.md` | Historical material design, review, and PR-plan evidence. |
| Recommendation | `ARCHITECTURE.md`, `docs/formal-project-glossary.md`, `src/contracts/index.ts` | `docs/archive/recommendation/README.md` | Historical recommendation posture planning evidence. |
| Material Store | `ARCHITECTURE.md`, `docs/formal-project-glossary.md`, `src/contracts/index.ts` | `docs/archive/material-store/README.md` | Historical Material Store implementation planning evidence. |
| Canonical Store | `ARCHITECTURE.md`, `docs/formal-project-glossary.md`, `src/contracts/index.ts` | `docs/archive/canonical-store/README.md` | Historical Canonical Store implementation and provisional review evidence. |
| Collection Service | `ARCHITECTURE.md`, `docs/formal-project-glossary.md`, `src/contracts/index.ts` | `docs/archive/collection-service/README.md` | Historical Collection Service implementation planning evidence. |
| Library Import | `ARCHITECTURE.md`, `docs/formal-project-glossary.md`, `src/contracts/index.ts` | `docs/archive/library-import/README.md` | Historical Library Import implementation planning evidence. |
| Platform Library Provider | `ARCHITECTURE.md`, `docs/formal-project-glossary.md`, `src/contracts/index.ts` | `docs/archive/platform-library-provider/README.md` | Historical provider implementation planning evidence. |
| Knowledge Slot | `ARCHITECTURE.md`, `docs/formal-project-glossary.md`, `src/contracts/index.ts` | `docs/archive/knowledge-slot/README.md` | Historical Knowledge Slot implementation planning evidence. |
| Host Adapters | `ARCHITECTURE.md`, `CURRENT_STATE.md`, `src/server/index.ts` | `docs/archive/host-adapters/README.md` | Historical server/MCP host-boundary planning evidence. |

## Docs Guard Status

The intended docs guard is documented but not implemented in this repository:

- Intended command: `npm run check:docs`
- Intended script: `scripts/check-docs.mjs`
- Current status: not present in `package.json`; not present on disk

During the documentation alignment sweep, each phase uses the manual equivalent
recorded in the audit ledger: Markdown inventory checks, archive-notice checks,
`git diff --check`, `git diff --name-only`, and full git status.
