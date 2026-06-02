# Documentation Alignment Plan

This plan turns the documentation architecture rules into an executable
docs-only sweep.

Source of rules:

- `docs/maintenance/documentation-architecture.md`
- `docs/maintenance/documentation-alignment-audit.md`
- `docs/maintenance/architecture-inconsistency-log.md`

## Scope

Goal:

- Align current MineMusic documentation to observed current code facts.
- Extract still-useful content from old plans, drafts, reviews, and handoffs.
- Archive historical documents with clear notices and replacement links.
- Record architecture inconsistencies without fixing code in this sweep.
- Make root docs readable as current entrypoints instead of historical ledgers.

Non-goals:

- No source-code edits.
- No test edits.
- No schema, generated runtime artifact, package, or implementation-guard edits.
- No deletion of old architecture evidence in the first pass.
- No claim that code and architecture are fully consistent while `AI-*` entries
  remain open.

The sweep may inspect source code, tests, contracts, schemas, and command
outputs as evidence. It must not change them.

## Phase 0 - Foundation

Goal:

- Prepare the maintenance ledgers and archive entrypoints used by the rest of
  the sweep.

Inputs:

- `docs/maintenance/documentation-architecture.md`
- `docs/maintenance/documentation-alignment-audit.md`
- `docs/maintenance/architecture-inconsistency-log.md`
- `AGENTS.md`
- `INDEX.md`
- current Markdown inventory from `rg --files -g '*.md'`

Expected edits:

- Fill `docs/maintenance/documentation-alignment-audit.md` with initial document
  inventory rows.
- Create `docs/archive/README.md`.
- Create archive area README templates only as areas are processed.
- Record docs guard command/spec status. Implementation of
  `scripts/check-docs.mjs` is out of scope for this docs-only sweep unless a
  later explicit tooling slice is approved.

Acceptance criteria:

- Every tracked Markdown document is represented in the audit or intentionally
  excluded with a reason.
- `docs/archive/README.md` explains archive policy and current authority lookup.
- No source, test, schema, generated artifact, package, or guard files change.

Verification:

- `rg --files -g '*.md'`
- `git diff --check`
- `git diff --name-only`
- `git status --short --branch --untracked-files=all`

## Phase 1 - Stage Interface Public Surface

Goal:

- Make Stage Interface the current authority for agent-facing, MCP-facing, and
  Codex-skill-facing tool behavior.

Evidence to inspect:

- `src/stage_interface/**`
- `src/surfaces/mcp/**`
- `src/handbook/index.ts`
- `skills/minemusic/**`
- `src/ports/index.ts`
- Stage Interface and MCP tests under `test/**`

Expected current authority:

- `docs/stage-interface/design.md`
- `docs/stage-interface/ports.md`
- `docs/stage-interface/tool-contracts.md`
- `docs/stage-interface/progress.md`

Archive candidates:

- completed Stage Interface execution plans;
- language-normalization plans and follow-up plans after extraction;
- old tool-contract plans after current behavior is captured.

Acceptance criteria:

- Public tool names, schema policy, compact output policy, MCP parity, Codex
  Handbook relationship, and forbidden public leaks are documented from current
  code facts.
- Provided and consumed Stage Interface ports are documented in both
  directions.
- Any public-surface mismatch is recorded as `AI-*`.
- Audit rows and area progress are updated.

Verification:

- Evidence paths above inspected.
- Relevant existing Stage Interface/MCP test references recorded.
- `git diff --check`.

## Phase 2 - Material Flow

Goal:

- Consolidate current documentation for material resolve/query/related/policy/
  selection/projection/materialization/presentation flows.

Evidence to inspect:

- `src/material/**`
- `src/ports/index.ts`
- `src/stage_interface/outputs/**`
- material, Stage Interface, and architecture tests under `test/**`
- current Material progress docs

Expected current authority:

- `docs/material/design.md`
- `docs/material/ports.md`
- `docs/material/projection-materialization.md`
- `docs/material/progress.md`

Archive candidates:

- completed material PR plans;
- old MusicMaterial design/plan documents after extraction;
- post-merge review notes after useful findings are captured;
- B2/B3/B4 boundary plans after current boundaries are documented.

Acceptance criteria:

- Material flow docs describe observed code behavior.
- Material flow docs keep Stage Interface output DTO ownership out of domain
  service boundaries.
- Projection/materialization ownership is clear.
- Provided/consumed ports and read/write capabilities are documented.
- Any architecture drift is recorded as `AI-*`.

Verification:

- Evidence paths above inspected.
- Existing architecture guards and test references recorded.
- `git diff --check`.

## Phase 3 - Material Store And Canonical Store

Goal:

- Align identity, source-library state, canonical maintenance, relations,
  activity, and durable-state documentation.

Evidence to inspect:

- Material Store implementation paths under `src/**`
- Canonical Store implementation paths under `src/**`
- `src/ports/index.ts`
- storage adapters and persistence tests under `test/**`
- `docs/adr/0002-material-store-boundary.md`

Expected current authority:

- `docs/material-store/design.md`
- `docs/material-store/ports.md`
- `docs/material-store/progress.md`
- `docs/canonical-store/design.md`
- `docs/canonical-store/ports.md`
- `docs/canonical-store/provisional-review.md`
- `docs/canonical-store/progress.md`

Archive candidates:

- old Material Store implementation plans after extraction;
- canonical provisional-review v1/v2/v3 drafts and implementation plans after
  current canonical maintenance behavior is captured;
- source-entity handoff notes after ownership facts are captured.

Acceptance criteria:

- Material Store top-level ownership and Canonical Store subdomain ownership are
  both clear.
- Canonical ports are not documented as ordinary broad dependencies for all
  flows.
- Current implementation facts and unresolved drift are separated.
- Audit rows, area progress, and `AI-*` entries are updated.

Verification:

- Evidence paths above inspected.
- Relevant storage/persistence test references recorded.
- `git diff --check`.

## Phase 4 - Collection Service And Library Import

Goal:

- Align user-owned collection and external platform-library import/update
  documentation.

Evidence to inspect:

- `src/collection/**`
- library import implementation paths under `src/**`
- `src/ports/index.ts`
- Stage Interface collection and library tool definitions
- collection, library import, integration, and MCP tests under `test/**`

Expected current authority:

- `docs/collection-service/design.md`
- `docs/collection-service/ports.md`
- `docs/collection-service/progress.md`
- `docs/library-import/design.md`
- `docs/library-import/ports.md`
- `docs/library-import/progress.md`

Archive candidates:

- completed Collection Service implementation plans after extraction;
- completed Library Import implementation plans after extraction;
- old compatibility-layer notes that are no longer current authority.

Acceptance criteria:

- Collection target behavior is documented from current code facts.
- Library Import/Update output and reporting behavior is documented from current
  code facts.
- Agent-facing update output rules do not expose internal unchanged rows unless
  current code does so and an `AI-*` entry records the conflict.
- Audit rows and area progress are updated.

Verification:

- Evidence paths above inspected.
- Relevant test references recorded.
- `git diff --check`.

## Phase 5 - Providers, Knowledge, Host Adapters, And Operations

Goal:

- Align provider, knowledge, host adapter, skill, server, and operation docs.

Evidence to inspect:

- provider implementation paths under `src/providers/**`
- knowledge implementation paths under `src/knowledge/**`
- `skills/minemusic/**`
- `docs/source-providers/**`
- `docs/platform-library-provider/**`
- `docs/knowledge-slot/**`
- `docs/host-adapters/**`
- `docs/operations/**`
- relevant tests and smoke-command records

Expected current authority:

- existing provider, knowledge, host-adapter, and operations docs that remain
  current;
- new `ports.md` only for areas with important provided/consumed ports;
- progress docs where implementation state is active.

Archive candidates:

- old provider implementation plans after extraction;
- stale host-adapter or skill notes after current skill surface is captured;
- old operation notes superseded by current runtime procedure docs.

Acceptance criteria:

- Live-only or environment-specific claims include date, command, scope, and
  uncertainty.
- Codex skill docs do not become source of truth for Stage Interface behavior.
- Audit rows and area progress are updated.

Verification:

- Evidence paths above inspected.
- Smoke claims are either backed by current verification records or marked
  stale/uncertain.
- `git diff --check`.

## Phase 6 - Root Consolidation And Final Manual Audit

Goal:

- Turn root docs into current entrypoints after area facts are aligned.

Expected edits:

- `README.md`
- `INDEX.md`
- `CURRENT_STATE.md`
- `ARCHITECTURE.md`
- `PROGRESS.md`
- archive `docs/mvp/**`
- archive root `plan/**`
- archive root `proposal.md` after extracting useful product framing

Acceptance criteria:

- `INDEX.md` points to current authority documents and archive entrypoints, not
  every historical document.
- `CURRENT_STATE.md` summarizes current implementation state without PR-by-PR
  history.
- `ARCHITECTURE.md` is the single global architecture authority and reflects
  observed current code facts.
- Any known code/architecture drift is linked to `AI-*` entries.
- `PROGRESS.md` is a project-level milestone index.
- Archived root/MVP/plan documents carry required archive notices.
- `docs/maintenance/architecture-inconsistency-log.md` has final manual audit
  results.
- `docs/maintenance/documentation-alignment-audit.md` area progress and
  document rows are complete or blocked with concrete next steps.

Verification:

- `rg --files -g '*.md'`
- docs guard if implemented, otherwise manual equivalent recorded as blocked or
  pending tooling;
- `git diff --check`
- `git diff --name-only`
- `git status --short --branch --untracked-files=all`

## Completion Statement Rules

Allowed completion statement when `AI-*` entries remain open:

```text
Documentation is aligned to observed current code facts. Remaining architecture
inconsistencies are recorded for later resolution.
```

Forbidden completion statement when `AI-*` entries remain open:

```text
Code and architecture are fully consistent.
```
