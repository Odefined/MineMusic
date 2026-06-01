# AGENTS.md

This file defines how coding agents should work in this repository.

## Purpose

This project expects coding agents to make minimal, verifiable, architecture-aligned changes.
Agents should optimize for correctness, traceability, and preserving existing project patterns.

## Operating Principles

1. Reuse before creating new abstractions, files, or layers.
2. Prefer small diffs over broad rewrites.
3. Preserve existing architecture, naming, and directory conventions unless the task explicitly requires change.
4. Do not silently broaden scope. Record adjacent issues as findings unless they block the requested work.
5. Back claims with repository evidence. Cite concrete files, commands, tests, or diffs when relevant.
6. Treat architecture boundaries as first-class deliverables, not optional cleanup after implementation.
7. Prefer fewer features with clean ownership over more features with mixed responsibilities.

## Project-Wide Architecture Discipline

These constraints apply to all future non-trivial MineMusic work, not only to the module currently being edited.
Do not bypass them for convenience, MVP speed, or because an existing broad dependency already happens to work.
If a task appears to require violating one of these constraints, explicitly call out the conflict and either narrow the design or record the violation as a deliberate architectural exception.

Before proposing, planning, or implementing a non-trivial change, identify:

1. the bounded context that owns the behavior;
2. the exact read capabilities required;
3. the exact write capabilities required;
4. the public port or interface that should expose those capabilities;
5. the modules this change is allowed to import;
6. the modules this change must not import;
7. the architecture test or type-level guard that prevents boundary regression.

A design or PR plan is incomplete until these items are answered.

### Ownership and module boundaries

- A module should own one coherent responsibility. Do not place projection, query orchestration, materialization, persistence writes, presentation shaping, and provider integration in one module merely because they are related to the same entity.
- Do not import a module just to reuse a helper when that helper belongs to a different responsibility. Extract the helper to the owning bounded context first.
- Stage Interface code owns agent-facing tool schemas, validation, compact presentation, and dispatch glue. Domain modules must not depend on Stage Interface output DTOs or presentation helpers.
- Domain modules must not import presentation-layer, tool-definition, or agent-output modules.
- Composition roots may wire broad concrete implementations into narrow consumers, but ordinary domain services must receive narrow capability ports.

### Port and capability rules

- Full aggregate ports are high-risk dependencies. A module may receive a full aggregate port only when it is a composition root, a store implementation, an explicit writer-heavy service boundary, or a test/harness that intentionally exercises the aggregate.
- Ordinary domain modules must depend on narrow ports that expose only the methods they actually use.
- Read-like services must not directly receive write capabilities unless the write is explicitly part of the service responsibility and the port name says so.
- Methods with side effects or persistence semantics, including `getOrCreate*`, `put*`, `upsert*`, `merge*`, `attach*`, `promote*`, `record*`, and `delete*`, must not hide behind vague query/read/support ports.
- If a query path needs materialization, persistence, or mutation, introduce an explicitly named writer/materializer boundary rather than passing a broad store into the query module.
- When introducing a new narrow port, prefer exact capability names and add a type-level or architecture test guard when practical.

### Import direction rules

- Dependencies should point from orchestration to owned capabilities, not from lower-level domain modules back into Stage Interface, presentation, or runtime assembly.
- A boundary module may depend on a lower-level capability port, but the lower-level capability must not depend on the boundary module that calls it.
- Avoid circular conceptual dependencies even if TypeScript permits the import graph.
- If two modules need each other's helpers, the helpers probably belong in a third, narrower module.

### Architecture tests are required for new boundaries

A boundary rule is not considered complete if it exists only in prose.
Whenever a change introduces or clarifies an architectural boundary, add or update a project-native guard when feasible, such as:

- a forbidden-import architecture test;
- an exact port key-set assertion;
- a test that verifies a tool/output boundary does not leak internal records;
- a test that verifies a writer capability is available only through the intended port.

If an architecture test is not feasible in the same PR, the PR must state why and list the missing guard as follow-up work.

### Scope and PR planning rules

Every non-trivial PR plan must include:

- goal;
- non-goals;
- owned bounded context;
- allowed read capabilities;
- allowed write capabilities;
- files expected to change;
- files or subsystems explicitly out of scope;
- architecture tests or guards to add/update;
- behavior tests to run;
- acceptance criteria for each phase.

Do not merge unrelated cleanup into a feature PR. If an adjacent boundary problem is discovered, either include it as a clearly separated phase with its own tests or record it as follow-up.

### Review rules

When reviewing a PR, check architecture before style:

1. Does the change preserve bounded-context ownership?
2. Does any module receive a broader port than it needs?
3. Are writer capabilities hidden behind read/query/support names?
4. Did any domain module import Stage Interface, presentation, runtime assembly, or unrelated bounded contexts?
5. Are helpers placed in the module that owns their responsibility?
6. Are architecture guards present for new or clarified boundaries?
7. Is the PR scope limited to its stated goal and non-goals?
8. Are behavior, schemas, event payloads, and storage formats unchanged unless explicitly in scope?

A PR that compiles but violates these rules is not architecturally complete.

## Session Startup

Before making non-trivial changes, inspect only the context needed to work safely:

- `AGENTS.md`
- `INDEX.md`
- `README.md`
- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- relevant package manifests, build scripts, and test config

If a more local `AGENTS.md` exists in a subdirectory, it overrides the root file for that subtree.

## Working Mode

Use this default sequence for non-trivial work:

1. Understand the request and define scope.
2. Identify the owning bounded context and architecture boundary.
3. Inspect the relevant code paths and current behavior.
4. Identify allowed reads, allowed writes, required ports, and forbidden imports.
5. State a short working plan:
   - goal
   - owned bounded context
   - files to inspect
   - expected edits
   - allowed read/write capabilities
   - architecture guard or test plan
   - verification method
   - stopping condition
6. Implement the smallest change that satisfies the task without weakening boundaries.
7. Verify with tests, lint, typecheck, architecture guards, or other project-native checks.
8. Run the state-sync gate described below.
9. Report what changed, what was verified, and what remains uncertain.

For risky or architecture-affecting changes, use an explicit approval gate before large edits.

## Scope Control

- Do not rewrite working systems just to improve style.
- Do not rename, move, or reformat unrelated files.
- Do not replace local patterns with personal preferences unless requested.
- Do not modify generated files unless the repo treats them as source of truth.
- If you discover a separate bug, note it separately unless it must be fixed to complete the task.

## Project State Constraints

- Treat existing local imported library, canonical, collection, and provider
  runtime data as development/test data unless the user explicitly says
  otherwise.
- Do not preserve old import or provisional-canonical behavior solely for
  backward compatibility with current local test data.
- Do not add migrations, repair tools, or compatibility layers for test-era
  MineMusic state unless the task explicitly asks for them.

## Code Change Rules

- Follow existing code style before introducing new style choices.
- Match local naming and module boundaries.
- Prefer extending existing modules over creating parallel implementations.
- Add comments only where the logic is not self-evident.
- Avoid speculative abstractions.
- Keep public API changes explicit and documented.
- Do not treat broad existing dependencies as precedent for new broad dependencies.
- When a helper does not belong to the module that currently contains it, extract it to the owning bounded context before expanding its usage.

## Agent-Facing Output Rules

- Every output returned to an agent-facing tool or instrument must include only
  information needed for the caller's next decision or user-visible answer.
- Prefer compact summaries, aggregate counts, progress, opaque ids, and
  explicit follow-up/detail tools over dumping full records, raw provider
  payloads, unchanged rows, repeated metadata, or debug-only fields.
- Do not expose internal storage shape, provider implementation details,
  canonical/collection internals, or redundant fields just because they are
  available in the owning module.
- For import/update/list flows, unchanged existing items are internal state and
  must not be returned as per-item agent output unless the caller explicitly
  requested a detail/audit view.

## File and Architecture Rules

- Confirm the owning module before editing shared utilities or cross-cutting code.
- Check importers, tests, docs, and configuration when changing a public interface.
- When adding a file, justify why an existing file cannot own the change.
- When moving code, preserve behavior first and refactor second.
- Do not consider a boundary migration complete until both type-level dependencies and module import direction are clean.
- Architecture documentation and architecture tests must be updated when a PR establishes, narrows, or moves a boundary.

## Search and Inspection

- Prefer `rg` and `rg --files` for search.
- Read representative files first, not every file in a directory.
- Trace the happy path before exploring edge integrations.
- Stop exploring once inputs, outputs, and component boundaries are clear.

## Testing and Verification

- Use project-native verification commands whenever possible.
- For code changes, run the narrowest meaningful check first, then broader checks if needed.
- When changing behavior, add or update tests unless the repo has a clear reason not to.
- When changing architecture boundaries, add or update architecture tests unless infeasible and documented.
- If verification could not be completed, say exactly what was not run and why.
- Do not mark work as verified unless the verification target, method, and outcome are clear.

## Git and Safety

- Never use destructive commands such as `git reset --hard` or `git checkout --` unless explicitly requested.
- Do not overwrite user changes you did not author.
- Avoid force-push unless the user explicitly asks for it.
- Use feature branches for non-trivial work when the repo workflow expects them.
