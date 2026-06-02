# Documentation Architecture

This document records the agreed documentation structure for MineMusic before
the documentation/code alignment sweep.

It is an operating rule for project documentation. It is not a replacement for
`ARCHITECTURE.md`, module design documents, ADRs, or implementation progress
ledgers.

## Goals

- Keep current authority easy to find.
- Keep historical plans searchable without letting them act as current truth.
- Separate stable design, current implementation state, port boundaries, and
  execution history.
- Make documentation/code alignment reviewable area by area.

## Root Documents

Root documents are project entrypoints and global authority. They should remain
short enough to route readers to the right current document.

| Document | Responsibility |
| --- | --- |
| `README.md` | Human entrypoint and concise product orientation. |
| `INDEX.md` | Current authority map, not a complete file inventory. |
| `AGENTS.md` | Repository operating rules for agents. |
| `CONTEXT.md` | Project glossary only; no implementation details or status. |
| `ARCHITECTURE.md` | Single global architecture authority: layer model, ownership, import direction, and public-surface principles. |
| `CURRENT_STATE.md` | Project-level current implementation summary and major open risks; links to area progress files for detail. |
| `PROGRESS.md` | Project-level milestone index explaining how the current state changed; no fine-grained implementation ledger. |

`ARCHITECTURE.md` remains the single global architecture authority. Do not
split global architecture truth across competing `docs/architecture/*.md`
documents. If the file becomes long, improve its table of contents and section
anchors before creating another global authority.

`INDEX.md` should answer:

- where a new reader starts;
- where each area current authority lives;
- where accepted decisions live;
- where historical material lives.

It should not list every archived document or every source file.

## Area Documents

Current authority for bounded contexts and long-lived areas lives under
`docs/<area>/`.

Standard current-authority document types:

| Document | Responsibility |
| --- | --- |
| `design.md` | Stable area design, responsibility boundaries, and key flows. Must not carry mutable implementation status. |
| `ports.md` | Provided and consumed ports, read/write capabilities, forbidden broad dependencies, composition points, and guards. |
| `progress.md` | Current implementation state, verified behavior, remaining gaps, next slice, and recent verification evidence. |
| `contracts.md` | Optional. Public data contracts, tool schemas, or payload shapes when they are too large for `design.md`. |
| `<specific-topic>.md` | Optional. A stable topic that is too large or important to fit cleanly in `design.md`. |

Implementation plans, PR plans, execution plans, handoff notes, review notes,
draft version documents, and `*_final.md` files are not current authority. They
should be extracted into current documents when useful and then archived.

## Ports Documents

`ports.md` is a first-class boundary document. It must make dependencies
explicit in both directions.

Each `ports.md` should include:

- ports this area provides;
- which areas consume each provided port;
- ports this area consumes;
- which area provides each consumed port;
- read capabilities used by each consumed port;
- write capabilities used by each consumed port;
- forbidden broad ports, writer ports, modules, and import directions;
- source code anchors, usually in `src/ports/index.ts`;
- composition points, usually in `src/stage_core/**` or a harness;
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

Areas that should have `ports.md` in the first alignment pass:

- `docs/stage-core/ports.md`
- `docs/stage-interface/ports.md`
- `docs/material/ports.md`
- `docs/material-store/ports.md`
- `docs/canonical-store/ports.md`
- `docs/collection-service/ports.md`
- `docs/library-import/ports.md`

## Stage Interface Public Surface

The current authority for agent-facing, MCP-facing, and Codex-skill-facing
tool behavior belongs under Stage Interface:

```text
docs/stage-interface/
  design.md
  ports.md
  tool-contracts.md
  progress.md
```

`docs/stage-interface/tool-contracts.md` owns:

- Stage Interface tool groups;
- public tool names;
- public input/output schema policy;
- compact output policy;
- MCP schema parity rules;
- Codex skill Handbook/tool-surface relationship;
- agent-facing `materialId` handle rules;
- forbidden public leaks such as internal `materialRef`, raw provider payloads,
  and internal storage rows.

`ARCHITECTURE.md` keeps only the global principles: Stage Interface is the
stable callable surface, MCP and Codex consume Stage Interface definitions, and
domain modules must not own agent-facing DTOs.

## Material Documentation Split

Material flow and material state remain separate documentation areas.

```text
docs/material/
  design.md
  ports.md
  projection-materialization.md
  progress.md

docs/material-store/
  design.md
  ports.md
  progress.md
```

`docs/material/` owns Material Resolve, Query, Related, Policy, Sort, Select,
Projection, Materialization, and Recommendation Presentation flow boundaries.

`docs/material-store/` owns Material Registry, Source Entity Store, Source
Library, canonical-store integration, material relations, material activity,
and durable material state.

`docs/canonical-store/` remains an independent documentation area because
canonical identity maintenance and provisional review are complex enough to
need their own current authority:

```text
docs/canonical-store/
  design.md
  ports.md
  provisional-review.md
  progress.md
```

Canonical Store must still be documented as the canonical identity subdomain
inside Material Store. Its ports are not ordinary broad dependencies for all
flows; explicit Canonical Maintenance workflows are the exception.

## Archive

Archive is not a file dump. It must preserve historical evidence while clearly
marking that the archived documents are not current authority.

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

- Current design: ...
- Current progress: ...
- Global architecture: ...

## Archived Documents

| Document | Status | Superseded by | Still useful for |
| --- | --- | --- | --- |
```

Each archived document should begin with an archive notice:

```markdown
> Status: Archived
> Superseded by: ...
> Use only for: ...
```

Before archiving, extract still-current terminology, accepted boundary
decisions, acceptance criteria, and verification lessons into current authority
documents or ADRs.

## Initial Archive Targets

The first alignment pass should archive, after extraction where needed:

- `docs/mvp/**`
- root `plan/**`
- root `proposal.md`, if its current product framing has been extracted
- completed `*_pr_plan.md` files
- completed `*_execution_plan.md` files
- completed `*_implementation-plan.md` files
- superseded `v1` / `v2` / `v3` design drafts
- old handoff and review notes that no longer act as current authority
- `*_final.md` documents that only became final for a completed slice

The current module directories should keep current authority documents only.

## Alignment Workflow

Use this sequence for the documentation/code alignment sweep:

1. Create `docs/maintenance/documentation-alignment-audit.md`.
2. Create `docs/archive/README.md` and archive area templates as needed.
3. Pick one area.
4. Check code facts for that area.
5. Update current authority documents for that area.
6. Extract useful content from old plans and drafts.
7. Archive old documents with `Status: Archived` and `Superseded by`.
8. Update `INDEX.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`, and `PROGRESS.md`
   only as their responsibilities require.
9. Run the docs guard and relevant project-native tests.
10. Move to the next area.

Do not mechanically move files before code facts and current authority are
known for the area.

## Docs Guard

The first docs guard should check objective facts only:

- local Markdown links or referenced repository paths exist;
- `INDEX.md` current authority links exist;
- archived documents under `docs/archive/**` carry `Status: Archived`;
- archive README files identify current authority and superseded relationships;
- root State Sync Gate files exist.

The docs guard should not attempt to infer whether prose is semantically aligned
with code. Semantic alignment remains an area-by-area review against the
relevant source paths and tests.
