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

Current authority documents may keep stable design rationale and durable
trade-offs, but they must not preserve execution history. For example,
`design.md` may explain why a boundary exists, and `ports.md` may explain why a
consumer receives a narrow port. PR sequencing, phase tasks, review backstory,
and migration play-by-play belong in archive or `PROGRESS.md` milestone
summaries, not in current design or ports documents.

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

| Document | Archived on | Superseded by | Use only for | Related inconsistencies |
| --- | --- | --- | --- | --- |
```

Each archived document must begin with this archive notice format:

```markdown
> Status: Archived
> Archived on: YYYY-MM-DD
> Superseded by: ...
> Use only for: ...
> Related audit: `docs/maintenance/documentation-alignment-audit.md`
> Related inconsistencies: `AI-001`, `AI-004`
```

`Related inconsistencies` is optional when the archived document is unrelated to
any architecture inconsistency. Every other archive-notice field is required.

Before archiving, extract still-current terminology, accepted boundary
decisions, acceptance criteria, and verification lessons into current authority
documents or ADRs.

If old documentation contains useful content but no current authority document
clearly owns it, resolve the owner as part of extraction. Do not archive or mark
the item blocked merely because ownership is unclear. Use the responsibility
rules in this document to choose or create the right current authority:

- glossary term -> `CONTEXT.md`;
- global ownership, layer, import-direction, or public-surface principle ->
  `ARCHITECTURE.md`;
- accepted durable trade-off -> ADR;
- stable area design or flow -> `docs/<area>/design.md`;
- provided/consumed ports or read/write capabilities -> `docs/<area>/ports.md`;
- current implementation state or verification status ->
  `docs/<area>/progress.md`;
- public Stage Interface tool contract -> `docs/stage-interface/tool-contracts.md`;
- operation or runtime procedure -> `docs/operations/**`;
- stable topic too large for `design.md` -> `docs/<area>/<specific-topic>.md`.

If the content points to a missing area or missing current-authority document,
create that document before archiving the old source. If choosing an owner
reveals a real conflict among current architecture, old evidence, and code,
record the conflict in
`docs/maintenance/architecture-inconsistency-log.md`.

Old architecture documents and architecture-review notes must not be deleted in
the first alignment pass. Preserve them as archived evidence with clear
`Status: Archived` and `Superseded by` notices. Their remaining disagreements
with current code and current authority documents should be resolved through
the final manual inconsistency audit, not by deleting the evidence.

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
2. Maintain `docs/maintenance/architecture-inconsistency-log.md` for
   architecture inconsistencies discovered during the sweep.
3. Create `docs/archive/README.md` and archive area templates as needed.
4. Pick one area.
5. Check code facts for that area.
6. Update current authority documents for that area.
7. Extract useful content from old plans and drafts.
8. Archive old documents with `Status: Archived` and `Superseded by`.
9. Update `INDEX.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`, and `PROGRESS.md`
   only as their responsibilities require.
10. Run the docs guard and relevant project-native tests.
11. Move to the next area.
12. After all areas have been aligned, perform a manual inconsistency audit
    across current authority documents, archived architecture evidence, code
    imports/call paths, ports, and architecture guards before final root-doc
    consolidation. Record the audit in
    `docs/maintenance/architecture-inconsistency-log.md`.

Do not mechanically move files before code facts and current authority are
known for the area.

Default area order:

1. Foundation: maintenance ledgers, archive entrypoint, and docs guard spec.
2. Stage Interface public surface: Stage Interface, MCP, and Codex skill-facing
   facts.
3. Material flow: Material Resolve, Query, Related, Policy, Sort, Select,
   Projection, Materialization, and Recommendation Presentation.
4. Material Store and Canonical Store: identity, source-library state,
   relations, activity, canonical maintenance, and provisional review.
5. Collection Service and Library Import: user-owned collections and external
   library import/update flows.
6. Providers, Knowledge, Host Adapters, and Operations.
7. Root consolidation: `README.md`, `INDEX.md`, `CURRENT_STATE.md`,
   `ARCHITECTURE.md`, `PROGRESS.md`, and archive of `docs/mvp/**`, `plan/**`,
   and `proposal.md`.

This order is the default. Adjust it when the audit finds a concrete dependency
that makes another area a prerequisite.

Each area sweep is complete only when:

- the area's current authority documents are updated as needed;
- the area's rows in `docs/maintenance/documentation-alignment-audit.md` are
  updated;
- discovered inconsistencies are recorded in
  `docs/maintenance/architecture-inconsistency-log.md`, or the area progress
  notes say none were found;
- old documents are archived with required notices or explicitly left pending;
- root documents are synchronized only as their responsibilities require;
- docs guard or relevant docs-only checks are recorded.

Track this in the `Area Progress` table in
`docs/maintenance/documentation-alignment-audit.md`.

This documentation alignment sweep is docs-only. Do not modify source code,
tests, schemas, generated runtime artifacts, or implementation guards while
performing the sweep. If the sweep discovers code that appears to violate the
accepted architecture, record it in
`docs/maintenance/architecture-inconsistency-log.md` and the relevant audit
ledger. Code fixes may be planned or performed only in a later explicit
code-fix slice.

When documentation and code disagree during this sweep, update the current
documentation to describe observed code behavior as the current implementation
fact. If that code behavior conflicts with accepted architecture, also record
the conflict in `docs/maintenance/architecture-inconsistency-log.md`. Do not
hide current code behavior, and do not present architecture-violating behavior
as an accepted design just because it exists in code.
If a current authority document states a current code fact that is also an open
architecture inconsistency, add a short note linking back to that log entry by
ID, such as `AI-001`.

`docs/maintenance/architecture-inconsistency-log.md` is a live ledger, not only
a final-audit artifact. Record inconsistencies as soon as they are discovered
during an area sweep. Open inconsistencies do not block continuing that area's
documentation cleanup, but they do block any final claim that project
documentation is fully aligned with architecture and code.

Keep the two maintenance ledgers separate:

- `docs/maintenance/documentation-alignment-audit.md` records document
  disposition: keep, update, merge, archive, delete, extraction targets,
  superseding documents, archive notices, and required root-doc updates.
- `docs/maintenance/architecture-inconsistency-log.md` records architecture
  disagreement: conflicts among current authority documents, archived
  architecture evidence, code, ports, tests, and guards.

The ledgers should cross-reference each other with `AI-*` IDs when a document
disposition is related to an architecture inconsistency. A document can be
archived without any architecture inconsistency, and an architecture
inconsistency can exist without requiring document archival.

Use these document-disposition statuses in
`docs/maintenance/documentation-alignment-audit.md`:

- `pending-review`
- `keep-current`
- `update-current`
- `merge-into-current`
- `archive-after-extract`
- `archive-no-extract`
- `delete-empty-or-duplicate`
- `done`
- `blocked`

Avoid ad hoc status labels.

## Code/Architecture Drift Adjudication

When code and `ARCHITECTURE.md` disagree, update documentation to state the
observed code fact, then classify any remaining architecture drift.

Code is the evidence source for current implementation behavior. If current
code violates an accepted architecture boundary, document the current behavior
as a current fact where the owning document needs it, but mark the violation in
`docs/maintenance/architecture-inconsistency-log.md`. For example, a domain
module importing Stage Interface output DTOs, or an ordinary query path
receiving broad writer capabilities from `MaterialStorePort`, is still an
architecture inconsistency even if tests pass. During this documentation-only
sweep, record the violation and follow-up explicitly; do not fix the code in
the sweep, and do not rewrite `ARCHITECTURE.md` merely to bless the violation.

`ARCHITECTURE.md` is wrong when current code reflects a merged, tested, and
progress-recorded behavior that the architecture document has not caught up
with. In that case, update `ARCHITECTURE.md` and the relevant area documents.

If both sides contain useful evidence, separate levels before deciding:

- `ARCHITECTURE.md` owns global ownership, layer, import-direction, and
  public-surface principles.
- `docs/<area>/design.md` owns stable area design and flows.
- `docs/<area>/ports.md` owns provided/consumed ports and read/write
  capabilities.
- `docs/<area>/progress.md` owns current implementation and verification
  status.

Temporary compatibility layers, fixtures, harnesses, tests, or migration
residue do not redefine architecture by themselves. Document them as exceptions
or follow-up cleanup unless they are accepted as a long-lived design choice.

If the drift represents a durable new decision that is hard to reverse,
surprising without context, and the result of a real trade-off, create or update
an ADR. Otherwise, update the current authority document that owns the topic.

Recommended adjudication order:

1. `AGENTS.md` and accepted ADRs.
2. `ARCHITECTURE.md`.
3. `docs/<area>/design.md`.
4. `docs/<area>/ports.md`.
5. `src/ports/index.ts`.
6. Implementation imports and call paths.
7. Tests and architecture guards.
8. `CURRENT_STATE.md` and `docs/<area>/progress.md`.

## Evidence And Verification Claims

Current implementation facts must be traceable to current evidence. Do not use
memory, archived plans, old PR plans, or historical summaries as the only basis
for a current implementation claim.

When a current document states current implementation behavior, include or
nearby-link at least one relevant evidence source when practical:

- source path;
- port or contract path;
- Stage Interface or MCP schema path;
- test path;
- command output or verification record;
- accepted ADR;
- current area `progress.md` entry.

Do not write `verified` unless the verification target, method, result, and
scope are clear. A verification claim should identify:

- command or check;
- date;
- result;
- scope;
- remaining uncertainty, if any.

Example:

```markdown
Evidence:
- Code: `src/stage_interface/tool_definitions/music.ts`
- Port: `src/ports/index.ts`
- Test: `test/stage_interface/stage-interface-dispatch.test.ts`

Verified:
- Command: `npm run build:test && node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js`
- Date: 2026-06-02
- Result: passed
- Scope: deterministic Stage Interface dispatch behavior
- Not covered: live provider behavior
```

## Docs Guard

The first docs guard should check objective facts only:

- intended command: `npm run check:docs`;
- intended script path: `scripts/check-docs.mjs`;
- local Markdown links or referenced repository paths exist;
- `INDEX.md` current authority links exist;
- `INDEX.md` maintenance-doc links exist;
- archived documents under `docs/archive/**` carry `Status: Archived`;
- archive README files identify current authority and superseded relationships;
- archived documents use the required archive notice fields;
- `docs/maintenance/architecture-inconsistency-log.md` uses stable `AI-*`
  IDs;
- `docs/maintenance/documentation-alignment-audit.md` uses only allowed
  document-disposition statuses;
- root State Sync Gate files exist.

The docs guard should not attempt to infer whether prose is semantically aligned
with code. Semantic alignment remains an area-by-area review against the
relevant source paths and tests.

The final manual inconsistency audit is mandatory because docs guards only check
objective structure. The audit must list each remaining inconsistency, classify
it using the code/architecture drift adjudication rules above, and record the
chosen resolution or follow-up in
`docs/maintenance/architecture-inconsistency-log.md`.

## Completion Gate

The documentation/code alignment sweep is complete only when:

- every row in `docs/maintenance/documentation-alignment-audit.md` is `done` or
  `blocked`;
- every `blocked` audit row has a concrete blocker and next step;
- every open entry in `docs/maintenance/architecture-inconsistency-log.md` has
  classification, docs action, and later code action or explicit no-code-action;
- `INDEX.md` points to current authority documents and archive entrypoints
  rather than acting as an old-document inventory;
- `CURRENT_STATE.md` summarizes current implementation state without
  PR-by-PR history;
- `ARCHITECTURE.md` is the single global architecture authority, with all known
  code/architecture drift represented by `AI-*` entries;
- `PROGRESS.md` is a project-level milestone index, not a fine-grained
  implementation ledger;
- archived documents carry the required archive notice;
- the docs guard passes.

If `docs/maintenance/architecture-inconsistency-log.md` still has open entries,
do not claim that code and architecture are fully consistent. The acceptable
completion claim is: documentation is aligned to observed current code facts,
and remaining architecture inconsistencies are recorded for later resolution.
