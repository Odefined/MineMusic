# AGENTS.md

This is the repository operating entrypoint for coding agents. Keep it short:
hard rules live here; detailed authority lives in the linked documents.

## Authority Map

- Task class and execution intensity: `docs/agents/task-classes.md`.
- Global architecture, ownership, import direction, and public-surface
  principles: `ARCHITECTURE.md`.
- Formal vocabulary: `docs/formal-project-glossary.md`.
- Documentation structure and current-authority placement:
  `docs/maintenance/documentation-architecture.md`.
- Domain-document consumption: `docs/agents/domain.md`.
- Issue tracker and triage labels: `docs/agents/issue-tracker.md` and
  `docs/agents/triage-labels.md`.

Do not create parallel architecture, glossary, documentation-structure, issue,
or triage rules. Update or cite the owning document instead.

## Task Classification

Classify the task first with `docs/agents/task-classes.md`.

`trivial` and ordinary `small behavior fix` tasks should stay light. The full
non-trivial workflow applies to `boundary-affecting`,
`contract/workflow/runtime`, `architecture migration`, and
`documentation authority change` tasks.

## Hard Rules

- Prefer correct, complete, verifiable diffs. Do not silently broaden scope.
- Prefer the right system change over a shorter code diff. When live code,
  product semantics, or authority docs imply a larger refactor, facade, or
  workflow object, implement that shape instead of a conservative workaround.
- Do not land patch-code fixes: no local symptom plugs, wrapper hacks,
  compatibility shims, or one-off conditionals when the live design calls for
  the correct repair. Fix at the owning boundary, and when the correct repair is
  a refactor, facade, migration, or rewrite, implement that complete shape.
- Preserve user changes. Do not revert unrelated work.
- Back claims with repository evidence: files, diffs, commands, or tests.
- Reuse existing modules, ports, helpers, and docs before creating new ones.
- Treat existing broad dependencies as evidence, not precedent. If live code
  already violates a boundary, do not expand the violation; keep the change
  local, introduce a narrow boundary, or record a follow-up migration finding.
- Do not preserve old import, provisional-canonical, or compatibility behavior
  just to support current local test-era data unless the task asks for it.
- For Pi / Agent Runtime / harness-loop work, inspect the installed pi
  implementation before designing the MineMusic wrapper. Reuse pi's existing
  agent state, prompt snapshot, lifecycle, queueing, tool execution, abort, and
  wait/idle capabilities wherever they match the required system shape. Do not
  reimplement or bypass pi behavior with a local loop, per-turn shell, or
  conservative workaround unless live pi code proves the capability is absent or
  incompatible and the deviation is recorded in the owning spec or ADR.

## Architecture Boundaries

For non-trivial work, identify the owning bounded context, required read and
write capabilities, public port/interface, allowed imports, forbidden imports,
and guard strategy before editing.

- Ordinary domain modules receive narrow capability ports, not full aggregate
  stores.
- Domain modules must not import Stage Interface, presentation, runtime
  assembly, tool-definition, or agent-output modules.
- Stage Interface owns agent-facing tool schemas, validation, compact public
  outputs, dispatch glue, and session-aware availability. It does not own music
  facts, provider internals, storage semantics, or final music judgement.
- Composition roots may wire broad concrete implementations into narrow
  consumers; ordinary services must not rely on broad concrete dependencies.
- A new or clarified boundary needs a project-native guard when feasible:
  forbidden-import test, exact port key-set assertion, output leak test, or
  writer-capability guard.
- Do not use broad forbidden-string, substring, or keyword-list checks as a
  guard for architectural quality, actor identity, instruction quality, or
  model-facing prose. Guard contracts structurally instead: ownership, source,
  field shape, allowed capabilities, selected sections, import direction,
  dispatch path, output schema, or explicit public surface.

## Write Boundaries

All durable or runtime state mutation goes through the owning
command/materializer/projection-maintenance boundary.

Direct writes are allowed only in repository implementations, owning
command/materializer/projection command modules, schema/migration/storage
infrastructure, and tests or fixtures that intentionally exercise persistence.

Orchestration, query services, Stage Interface handlers, provider/plugin
adapters, presentation code, and ordinary domain services must not construct
repositories or call repository write methods directly. Any PR that adds or
moves a write must name the owning command boundary and add/update a guard when
feasible.

## Agent-Facing Output

Agent-facing tools and instruments should return only what the caller needs for
the next decision or user-visible answer. Prefer compact summaries, counts,
progress, opaque ids, and explicit detail tools.

Do not expose raw provider payloads, internal storage shape, canonical or
collection internals, unchanged rows, or redundant debug fields just because
they are available.

## Errors And Fallbacks

Good code does not defend everywhere; it defends at the right boundary and
trusts contracts inside that boundary. Do not add defensive fallback logic by
default.

- Expected failures should be represented as `Result<T>`.
- Throws are for programmer errors, broken invariants, or unadapted external
  boundary failures.
- A function should have one failure channel: `Result<T>` for expected failure,
  `throw` for broken invariants or unadapted boundary failures, or plain `T`
  when satisfied preconditions mean success.
- For internal typed inputs and operations after their owning boundary contract
  has been satisfied, let broken contracts fail loudly with a throw/assertion.
  Do not convert internal misuse into fallback values or public expected-failure
  `Result`s.
- Catch exceptions only at explicit boundaries: transport, Tool Call Router,
  runtime lifecycle, external provider adapters, database/filesystem/network
  adapters.
- Stage Interface handlers and the Tool Call Router may normalize declared
  `Result` failures into public agent-facing errors at their owned boundary.
  They must not catch programmer errors or system failures to fabricate empty
  success.
- Every catch, fallback, default empty result, or system-error-to-success
  conversion must name its boundary owner. If no owner can be named, it is
  forbidden.
- Do not return empty arrays, default objects, or fallback values for system
  failures.
- Do not duplicate validation already guaranteed by TypeScript types, JSON
  Schema, database constraints, or upstream routers. Add only semantic
  validation owned by the current layer.
- Prefer discriminated unions and `assertNever` over impossible-state fallback
  branches.
- When reviewing code, do not ask whether there is "enough fallback"; ask
  whether each catch or fallback belongs to the current boundary owner. Boundary
  translation, explicit recovery, and audit are allowed. Broad handler/domain
  catch-all logic, schema/type/DB duplicate validation, unknown-case ignore, and
  empty-result recovery for system failure are findings.
- Empty arrays or defaults are product semantics only when they mean "truly no
  domain result"; they must not stand in for provider, DB, permission, schema,
  or runtime failure.

## Working Sequence

1. Read only the nearest relevant `AGENTS.md` and the authority docs needed for
   the classified task.
2. For non-trivial work, state a compact plan: goal, owner, files, allowed
   reads/writes, guard or test plan, verification method, and stopping
   condition.
3. Implement the correct system change that satisfies the request without
   weakening boundaries.
4. Verify with the narrowest meaningful project-native check first; broaden
   only when risk justifies it.
5. Run state sync only for task classes that require it.
6. Report what changed, what was checked, and what remains uncertain.

Use `rg` / `rg --files` for search. Read representative files first and stop
exploring once inputs, outputs, and boundaries are clear.

## State Sync

For task classes that require state sync, run:

```bash
git diff --name-only
```

Then report whether each root state document was updated or not needed:

- `INDEX.md`
- `CURRENT_STATE.md`
- `ARCHITECTURE.md`
- `PROGRESS.md`

Trivial edits, pure tests, and isolated small behavior fixes do not require the
root-document checklist unless `docs/agents/task-classes.md` escalates them.

## Git And Safety

- Never use destructive commands such as `git reset --hard` or
  `git checkout --` unless explicitly requested.
- Avoid force-push unless explicitly requested.
- Use feature branches for non-trivial work when the repo workflow expects
  them.

## Agent Skill References

- Task classes: `docs/agents/task-classes.md`.
- Issue tracker: GitHub issues via `gh`; see `docs/agents/issue-tracker.md`.
- Triage labels: see `docs/agents/triage-labels.md`.
- Domain docs: single-context repo with root `CONTEXT.md` plus `docs/adr/`;
  see `docs/agents/domain.md`.
