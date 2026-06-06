# Documentation Architecture

> Status: Formal rebuild documentation rule
> Scope: Active documentation structure after the Phase 1 active-tree reset

This document records how MineMusic documentation should be organized during
the formal rebuild. It is an operating rule for project documentation. It is
not a replacement for `ARCHITECTURE.md`, formal ADRs, source contracts, or
implementation progress ledgers.

The Phase 1 reset removed pre-formal active area docs and old runtime code from
the active tree. That reset changes which documents are current authority, but
it does not remove the durable documentation rules: separate stable design,
current state, port boundaries, archived evidence, and execution history.

## Goals

- Keep current authority easy to find.
- Keep historical plans searchable without letting them act as current truth.
- Separate stable design, current implementation state, port boundaries, and
  execution history.
- Make future formal phases reviewable area by area.
- Prevent old MVP runtime concepts from re-entering active docs as
  compatibility language.

## Authority Layers

Use documentation in this order:

1. `ARCHITECTURE.md` for global ownership, area taxonomy, import direction, and
   public-surface principles.
2. Formal ADRs, currently `docs/adr/0004-*` and later, for accepted durable
   decisions.
3. `docs/formal-project-glossary.md` for formal vocabulary.
4. Implemented source contracts, currently `src/contracts/index.ts`, for
   executable contract truth.
5. Area docs created by a later formal phase for that phase's owned scope.
6. `docs/archive/**`, older ADRs, and maintenance ledgers as evidence only.

Old documents must be translated through the current formal vocabulary before
they can influence new design. Do not copy old terms such as deleted public
tools, deleted material handles, or old runtime module names into current
authority.

## Root Documents

Root documents are project entrypoints and global authority. They should remain
short enough to route readers to the right current document.

| Document | Responsibility |
| --- | --- |
| `README.md` | Human entrypoint, concise product orientation, and current runnable skeleton summary. |
| `INDEX.md` | Current authority map, not a complete file inventory. |
| `AGENTS.md` | Repository operating rules for agents. |
| `CONTEXT.md` | Pre-formal vocabulary file; not formal rebuild authority unless explicitly refreshed later. |
| `ARCHITECTURE.md` | Single global architecture authority: area model, ownership, import direction, and public-surface principles. |
| `CURRENT_STATE.md` | Project-level current implementation summary and major active gaps. |
| `PROGRESS.md` | Project-level milestone index explaining how the current state changed; no fine-grained implementation ledger. |

`ARCHITECTURE.md` remains the single global architecture authority. Do not split
global architecture truth across competing `docs/architecture/*.md` documents.
If the file becomes long, improve its table of contents and section anchors
before creating another global authority.

`INDEX.md` should answer:

- where a new reader starts;
- where current formal authority lives;
- where accepted decisions live;
- where historical material lives;
- which active source entrypoints exist after the formal reset.

It should not list every archived document or every deleted source file.

## Formal Rebuild Documents

`docs/formal-rebuild/` stores phase specs and implemented phase status. A phase
spec may contain planning detail, but a completed phase is not current
architecture by itself until the accepted decisions are also reflected in root
authority, ADRs, source contracts, or new area docs.

Each phase document should state:

- goal;
- non-goals;
- owning context or formal area;
- allowed reads;
- allowed writes;
- forbidden writes/imports;
- expected source/docs/tests;
- guards;
- verification;
- acceptance criteria;
- implemented status once complete.

Phase specs must not become a hidden substitute for `CURRENT_STATE.md` or
`PROGRESS.md`.

## Area Documents

Pre-formal area docs were removed from active `docs/` during Phase 1:

- `docs/stage-core/`
- `docs/stage-interface/`
- `docs/material/`
- `docs/material-search/`
- `docs/material-store/`
- `docs/canonical-store/`
- `docs/collection-service/`
- `docs/library-import/`
- `docs/platform-library-provider/`
- `docs/source-providers/`
- `docs/knowledge-slot/`
- `docs/host-adapters/`
- `docs/operations/`

Future area docs may be introduced only when the owning formal phase starts.
Do not restore old area docs as compatibility documentation. Use old area docs
only as evidence and extract still-valid ideas into the new formal area's
language.

Standard current-authority document types for future formal areas:

| Document | Responsibility |
| --- | --- |
| `design.md` | Stable area design, responsibility boundaries, and key flows. Must not carry mutable implementation status. |
| `ports.md` | Provided and consumed ports, read/write capabilities, forbidden broad dependencies, composition points, and guards. |
| `progress.md` | Current implementation state, verified behavior, remaining gaps, next slice, and recent verification evidence. |
| `contracts.md` | Optional. Public data contracts, tool schemas, or payload shapes when they are too large for `design.md`. |
| `<specific-topic>.md` | Optional. A stable topic that is too large or important to fit cleanly in `design.md`. |

Implementation plans, PR plans, execution plans, handoff notes, review notes,
draft version documents, and `*_final.md` files are not current authority. They
should be extracted into current documents when useful and then archived or
left as evidence.

Current authority documents may keep stable design rationale and durable
trade-offs, but they must not preserve execution history. For example,
`design.md` may explain why a boundary exists, and `ports.md` may explain why a
consumer receives a narrow port. PR sequencing, phase tasks, review backstory,
and migration play-by-play belong in archive, phase implementation notes, or
`PROGRESS.md` milestone summaries, not in current design or ports documents.

## Ports Documents

`ports.md` is a first-class boundary document. It must make dependencies
explicit in both directions.

Each `ports.md` should include:

- ports or interfaces this area provides;
- which areas consume each provided port;
- ports or interfaces this area consumes;
- which area provides each consumed port;
- read capabilities used by each consumed port;
- write capabilities used by each consumed port;
- forbidden broad ports, writer ports, modules, and import directions;
- source code anchors, usually in `src/contracts/index.ts`, future area source,
  or a future `src/ports/**` module;
- composition points, usually in `src/stage_core/**`, `src/server/**`, or a
  test harness;
- architecture/type/import guards that prevent boundary regression.

Store, repository, and narrow capability ports should list capabilities at
method level. Service ports may list behavior-level capabilities. Writer
capabilities must be explicit and must not hide behind vague query, read,
support, or helper names.

Recommended shape:

```markdown
## Provides

| Port | Provided to | Capabilities | Code |
| --- | --- | --- | --- |

## Consumes

| Consumed port | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |

## Method-Level Capabilities

| Capability | Method(s) | Read/Write | Allowed consumer | Notes |
| --- | --- | --- | --- | --- |

## Forbidden Dependencies

| Forbidden port or module | Reason |
| --- | --- |

## Composition

## Guards
```

A new boundary is incomplete until there is a guard when feasible: forbidden
import tests, exact key-set type assertions, public-output leak tests, or a
test proving writer capability appears only behind the intended port.

## Stage Interface Docs

Stage Interface owns agent-facing instruments, tools, schemas, Handbook,
validation, compact public outputs, dispatch, and session-aware availability.

During Phase 1, active Stage Interface code is only the minimal skeleton in
`src/stage_interface/index.ts`. There is no active formal tool-catalog doc yet.
When a later Stage Interface phase starts, its docs should rebuild:

- instrument catalog;
- tool registry;
- public input/output schema policy;
- compact output policy;
- host transport parity rules;
- Handbook relationship;
- public handle policy;
- forbidden public leaks such as internal records, raw provider payloads, and
  storage rows.

Do not restore old tool names or old host/MCP docs just because archived docs
mention them.

## Music Data Docs

Music Data Platform owns source/material/canonical identity, storage records,
bindings, owner-scoped fact families, library import/update persistence,
projections, and canonical maintenance.

During Phase 1, active music-data truth is limited to the contracts in
`src/contracts/index.ts`. Future Music Data Platform docs should be rebuilt
around the formal vocabulary:

- `SourceEntity` / `SourceRecord`;
- `MaterialEntity` / `MaterialRecord`;
- `CanonicalEntity` / `CanonicalRecord`;
- provider candidates as source facts, not material identity;
- owner fact families and Collection boundaries;
- canonical maintenance as an owned capability, not a public formal v1 tool
  surface.

Do not restore deleted public/domain surfaces as current docs.

## Archive

Archive is not a file dump. It preserves historical evidence while clearly
marking that archived documents are not current authority.

```text
docs/archive/
  README.md
  <area>/
    README.md
    <date-or-topic>/
      old-document.md
```

Each archive area `README.md` should include:

```markdown
## Current Authority

- Root architecture: ...
- Current state: ...
- Formal contracts or phase docs: ...

## Archived Documents

| Document | Archived on | Superseded by | Use only for | Related inconsistencies |
| --- | --- | --- | --- | --- |
```

Each archived document should begin with this archive notice format when
practical:

```markdown
> Status: Archived
> Archived on: YYYY-MM-DD
> Superseded by: ...
> Use only for: ...
> Related audit: `docs/maintenance/documentation-alignment-audit.md`
> Related inconsistencies: `AI-001`, `AI-004`
```

`Related inconsistencies` is optional when the archived document is unrelated
to any architecture inconsistency. Every other archive-notice field should be
present for moved archive documents.

Before archiving or deleting active docs, extract still-current terminology,
accepted boundary decisions, acceptance criteria, and verification lessons into
current authority documents, formal ADRs, or phase specs.

If old documentation contains useful content but no current authority document
clearly owns it, resolve the owner as part of extraction. Use these ownership
rules:

- formal glossary term -> `docs/formal-project-glossary.md`;
- global ownership, area, import-direction, or public-surface principle ->
  `ARCHITECTURE.md`;
- accepted durable trade-off -> formal ADR;
- stable area design or flow -> future `docs/<area>/design.md`;
- provided/consumed ports or read/write capabilities -> future
  `docs/<area>/ports.md`;
- current implementation state or verification status -> `CURRENT_STATE.md`,
  `PROGRESS.md`, phase status, or future `docs/<area>/progress.md`;
- public Stage Interface tool contract -> future Stage Interface contract doc;
- operation or runtime procedure -> future operations doc only when the runtime
  feature exists again.

Do not mark evidence blocked merely because old ownership is unclear. Choose
the formal owner or record the uncertainty in the phase plan.

## Maintenance Evidence

Most `docs/maintenance/**` files were produced by a pre-formal alignment pass.
They remain useful evidence for what was found, why older docs moved, and which
architecture problems were observed. They are not formal target authority
unless `INDEX.md` explicitly lists them as current rules.

`docs/maintenance/documentation-architecture.md` is the exception: this file is
current because it defines active documentation rules after Phase 1.

## Formal Phase Workflow

Use this sequence when a future formal phase introduces or rewrites an area:

1. Confirm the phase goal, non-goals, owning formal area, and accepted
   vocabulary.
2. Read only the root authority, formal ADRs, relevant source contracts, and
   directly relevant archive evidence.
3. Define allowed reads, allowed writes, forbidden imports, and required
   guards.
4. Create or update area docs only for the phase's accepted scope.
5. Implement source changes inside the formal module boundary.
6. Add type, behavior, architecture, and docs guards.
7. Run verification and state-sync.
8. Update `INDEX.md`, `CURRENT_STATE.md`, `PROGRESS.md`, and phase docs only as
   their responsibilities require.

Do not mechanically move old docs into new locations before current ownership
and source contracts are known.

## Guards

Formal reset guards live in `test/formal/active-tree.test.ts`. They verify that
deleted runtime roots, deleted active docs, old skill/runtime scripts, and
deleted vocabulary do not return to active source.

When documentation rules change, update a guard when feasible. Examples:

- forbidden active docs directories;
- forbidden old vocabulary in active source;
- required root authority documents;
- required phase docs for completed phases;
- exact source entrypoints after a reset.
