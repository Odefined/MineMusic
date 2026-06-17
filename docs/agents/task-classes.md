# Task Classes

> Status: Agent execution rule
> Scope: Decide how much planning, guarding, verification, and state sync a
> MineMusic task needs before implementation.
> Not authority: This document does not define architecture ownership,
> formal vocabulary, documentation structure, issue workflow, or triage labels.

Use this file to avoid treating every edit as an architecture migration while
still keeping boundary-changing work strict.

## Authority Boundaries

- Architecture facts come from `ARCHITECTURE.md`, formal ADRs, source
  contracts, and active area docs.
- Formal vocabulary comes from `docs/formal-project-glossary.md`.
- Documentation placement and current-authority rules come from
  `docs/maintenance/documentation-architecture.md`.
- Issue tracker and label rules come from `docs/agents/issue-tracker.md` and
  `docs/agents/triage-labels.md`.
- This file only classifies execution intensity.

## Classification Table

When `AGENTS.md` says `non-trivial`, treat it as the classes
`boundary-affecting`, `contract/workflow/runtime`, `architecture migration`, or
`documentation authority change`. A `small behavior fix` is still real work,
but it uses the lighter note-and-verify path unless an escalation rule applies.

| Task class | Examples | Plan required | Guard required | State sync required |
| --- | --- | --- | --- | --- |
| `trivial` | Typo, comment, markdown wording, local test name, non-semantic formatting. | No. | No. | No. |
| `small behavior fix` | Isolated pure-function bug, narrow Result handling fix, one local test update, internal wording that does not change a public contract. | Short note naming goal, files, verification, and stopping condition. | Usually no, unless the fix exposes a missing boundary guard. | Usually no. |
| `boundary-affecting` | New or changed port, broader dependency, helper moved across bounded contexts, import-direction change, write path moved or newly introduced, new catch/fallback/error-normalization path. | Yes, with bounded context, allowed reads/writes, forbidden imports, expected files, and acceptance criteria. | Yes when feasible; otherwise record why and the follow-up. | Yes. |
| `contract/workflow/runtime` | Stage Interface schema/output/error/cursor/handle change, provider flow, runtime lifecycle, storage format, event payload, projection behavior, command semantics. | Yes, with behavior and architecture scope. | Yes when the contract or boundary can regress. | Yes. |
| `architecture migration` | Split or merge bounded contexts, repository/command/projection restructuring, replacing an architectural direction, broad import cleanup. | Yes, plus explicit approval gate before large edits. | Yes. | Yes. |
| `documentation authority change` | Root authority docs, formal ADRs, area `design.md` / `ports.md` / `progress.md`, documentation-architecture rules, agent operating rules. | Yes, scoped to the owning document and non-duplicating authority. | Docs guard when project-native and feasible. | Yes. |

## Escalation Rules

Escalate to at least `boundary-affecting` if the task changes any of these:

- ownership of behavior or state;
- read or write capabilities exposed through a port;
- import direction between architecture areas;
- repository, command, materializer, projection, or persistence write paths;
- public agent-facing output, schema, handle, cursor, or declared error shape;
- provider/plugin capability boundaries;
- catch/fallback/default-empty/error-normalization behavior, unless it is
  entirely inside an already-owned boundary and preserves explicit failure
  semantics;
- runtime lifecycle, scheduling, cancellation, timeout, or readiness behavior;
- storage schema, event payloads, projection semantics, or durable state;
- current-authority documentation.

Existing broad dependencies are not precedent. If the live code already
violates a boundary, do not expand the violation. Either keep the change local,
introduce the narrow boundary the task needs, or record a follow-up migration
finding.

Any new catch, broad fallback, default object, empty-result recovery, or
system-error-to-success conversion must name the boundary owner. If no owner can
be named, the change is forbidden rather than merely higher ceremony.

## Applying State Sync

For state-sync-required classes, run:

```bash
git diff --name-only
```

Then report whether each root state document was updated or not needed:

- `INDEX.md`
- `CURRENT_STATE.md`
- `ARCHITECTURE.md`
- `PROGRESS.md`

For `trivial` and ordinary `small behavior fix` tasks, state sync is optional
unless the task touches a contract, workflow, runtime behavior, boundary, or
current-authority document.
