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

Archive area README files should point back to the current authority documents
and list archived documents with their superseding targets.

## Archived Areas

| Area | Current authority | Archive README | Notes |
| --- | --- | --- | --- |
| Stage Interface | `docs/stage-interface/design.md`, `docs/stage-interface/ports.md`, `docs/stage-interface/tool-contracts.md`, `docs/stage-interface/progress.md` | `docs/archive/stage-interface/README.md` | Phase 1 archived completed tool-contract and language-normalization planning evidence. |
| Material Flow | `docs/material/design.md`, `docs/material/ports.md`, `docs/material/projection-materialization.md`, `docs/material/progress.md` | `docs/archive/material/README.md` | Phase 2 archived historical material design, review, and PR-plan evidence. |
| Recommendation | `docs/material/design.md`, `docs/material/ports.md`, `docs/stage-interface/tool-contracts.md`, `docs/stage-interface/progress.md` | `docs/archive/recommendation/README.md` | Phase 2 archived historical recommendation posture planning evidence. |
| Material Store | `docs/material-store/design.md`, `docs/material-store/ports.md`, `docs/material-store/progress.md` | `docs/archive/material-store/README.md` | Phase 3 archived historical Material Store implementation planning evidence. |
| Canonical Store | `docs/canonical-store/design.md`, `docs/canonical-store/ports.md`, `docs/canonical-store/provisional-review.md`, `docs/canonical-store/storage-model.md`, `docs/canonical-store/progress.md` | `docs/archive/canonical-store/README.md` | Phase 3 archived historical Canonical Store implementation and provisional review evidence. |
| Collection Service | `docs/collection-service/design.md`, `docs/collection-service/ports.md`, `docs/collection-service/progress.md` | `docs/archive/collection-service/README.md` | Phase 4 archived historical Collection Service implementation planning evidence. |
| Library Import | `docs/library-import/design.md`, `docs/library-import/ports.md`, `docs/library-import/progress.md` | `docs/archive/library-import/README.md` | Phase 4 archived historical Library Import implementation planning evidence. |
| Platform Library Provider | `docs/platform-library-provider/design.md`, `docs/platform-library-provider/progress.md`, `docs/source-providers/netease.md`, `docs/library-import/design.md` | `docs/archive/platform-library-provider/README.md` | Phase 5 archived historical NetEase platform-library provider implementation planning evidence. |
| Knowledge Slot | `docs/knowledge-slot/design.md`, `docs/knowledge-slot/musicbrainz-provider.md`, `docs/knowledge-slot/progress.md` | `docs/archive/knowledge-slot/README.md` | Phase 5 archived historical Knowledge Slot implementation planning evidence. |
| Host Adapters | `docs/host-adapters/codex-skill.md`, `docs/operations/minemusic-server-launchd.md`, `ARCHITECTURE.md`, `CURRENT_STATE.md` | `docs/archive/host-adapters/README.md` | Phase 5 archived historical server/MCP host-boundary planning evidence. |
| Pending | See `INDEX.md` | Pending area README creation | Remaining area archive directories are created during the phase that processes that area. |

## Docs Guard Status

The intended docs guard is documented but not implemented in this repository:

- Intended command: `npm run check:docs`
- Intended script: `scripts/check-docs.mjs`
- Current status: not present in `package.json`; not present on disk

During the documentation alignment sweep, each phase uses the manual equivalent
recorded in the audit ledger: Markdown inventory checks, archive-notice checks,
`git diff --check`, `git diff --name-only`, and full git status.
