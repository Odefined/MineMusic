# MineMusic — Claude Project Notes

This file holds project-specific guidance for Claude Code. It is a thin index:
the detailed agent operating rules, domain language, and architectural decisions
live in the files below — read those first when starting substantive work.

- [AGENTS.md](AGENTS.md) — agent operating principles, scope control, code-change
  and verification rules. This is the source of truth for how to work in the repo.
- [CONTEXT.md](CONTEXT.md) — the project's domain glossary.
- [docs/adr/](docs/adr/) — past architectural decisions.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues in `Odefined/MineMusic` (via the
`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five canonical triage-role labels with default names. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See
`docs/agents/domain.md`.
