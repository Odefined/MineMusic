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
| Pending | See `INDEX.md` | Pending area README creation | Area archive directories are created during the phase that processes that area. |

## Docs Guard Status

The intended docs guard is documented but not implemented in this repository:

- Intended command: `npm run check:docs`
- Intended script: `scripts/check-docs.mjs`
- Current status: not present in `package.json`; not present on disk

During the documentation alignment sweep, each phase uses the manual equivalent
recorded in the audit ledger: Markdown inventory checks, archive-notice checks,
`git diff --check`, `git diff --name-only`, and full git status.
