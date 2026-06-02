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

## Area Progress

| Area | Status | Current authority updated | Audit rows updated | Inconsistencies recorded | Archive complete | Checks | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |

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
