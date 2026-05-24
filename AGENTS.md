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
2. Inspect the relevant code paths and current behavior.
3. State a short working plan:
   - goal
   - files to inspect
   - expected edits
   - verification method
   - stopping condition
4. Implement the smallest change that satisfies the task.
5. Verify with tests, lint, typecheck, or other project-native checks.
6. Run the state-sync gate described below.
7. Report what changed, what was verified, and what remains uncertain.

For risky or architecture-affecting changes, use an explicit approval gate before large edits.

## Scope Control

- Do not rewrite working systems just to improve style.
- Do not rename, move, or reformat unrelated files.
- Do not replace local patterns with personal preferences unless requested.
- Do not modify generated files unless the repo treats them as source of truth.
- If you discover a separate bug, note it separately unless it must be fixed to complete the task.

## Code Change Rules

- Follow existing code style before introducing new style choices.
- Match local naming and module boundaries.
- Prefer extending existing modules over creating parallel implementations.
- Add comments only where the logic is not self-evident.
- Avoid speculative abstractions.
- Keep public API changes explicit and documented.

## File and Architecture Rules

- Confirm the owning module before editing shared utilities or cross-cutting code.
- Check importers, tests, docs, and configuration when changing a public interface.
- When adding a file, justify why an existing file cannot own the change.
- When moving code, preserve behavior first and refactor second.

## Search and Inspection

- Prefer `rg` and `rg --files` for search.
- Read representative files first, not every file in a directory.
- Trace the happy path before exploring edge integrations.
- Stop exploring once inputs, outputs, and component boundaries are clear.

## Testing and Verification

- Use project-native verification commands whenever possible.
- For code changes, run the narrowest meaningful check first, then broader checks if needed.
- When changing behavior, add or update tests unless the repo has a clear reason not to.
- If verification could not be completed, say exactly what was not run and why.
- Do not mark work as verified unless the verification target, method, and outcome are clear.

## Git and Safety

- Never use destructive commands such as `git reset --hard` or `git checkout --` unless explicitly requested.
- Do not overwrite user changes you did not author.
- Avoid force-push unless the user explicitly asks for it.
- Use feature branches for non-trivial work when the repo workflow expects them.

## Review and PR Work

When implementing review feedback:

1. Group comments by theme or file.
2. Distinguish required fixes from optional suggestions.
3. Apply behavior-preserving fixes first.
4. Re-run relevant verification after each logical group of changes.
5. Summarize which comments were addressed and which remain open.

## Documentation Updates

Update documentation when code changes affect:

- setup steps
- developer workflow
- public APIs
- configuration
- architecture decisions
- deployment behavior

Prefer updating existing docs over creating new top-level docs unless a new document is clearly warranted.

Design documents are sources of truth for intended behavior and constraints.
They must not carry mutable implementation status such as "not implemented",
"partially implemented", or task completion state.

Implementation plans describe task breakdown and sequencing. They should not be
used as the live implementation-status ledger.

Each module with implementation progress must keep its current implementation
state in a module-local progress/status document, such as
`docs/<module>/progress.md`. Global files such as `CURRENT_STATE.md` and
`PROGRESS.md` may summarize and link to module progress, but must not duplicate
fine-grained module task status.

## State Sync Gate

For non-trivial changes, run:

```bash
git diff --name-only
```


Do not mark the task complete until the answer is recorded in the final report:

- `INDEX.md`: updated, or not needed with a concrete reason.
- `CURRENT_STATE.md`: updated, or not needed with a concrete reason.
- `ARCHITECTURE.md`: updated, or not needed with a concrete reason.
- `PROGRESS.md`: updated, or not needed with a concrete reason.

For contract/workflow/runtime changes, lack of this state-sync check is an
incomplete task even when tests pass.

## Communication

- Be concise and specific.
- Separate facts, repository evidence, and inference.
- Use exact file paths, commands, and verification results.
- If blocked, state the blocker and the next required decision.

## Completion Format

For non-trivial tasks, report:

1. what was established
2. what changed
3. what remains unclear
4. what verification was performed
5. what still needs verification

## Optional Project Overrides

Projects may add sections such as:

- stack-specific commands
- directory ownership
- release workflow
- migration rules
- security constraints
- generated code policy
- test matrix

Keep overrides concrete. Prefer exact commands and file paths over generic advice.
