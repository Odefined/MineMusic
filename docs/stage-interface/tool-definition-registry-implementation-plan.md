# Stage Interface Tool Definition Registry Implementation Plan

## Related Documents

- `docs/stage-interface/design.md`
- `docs/stage-interface/todo.md`
- `docs/stage-interface/progress.md`

## Goal

Deepen Stage Interface by moving tool metadata, host input schemas, dispatch
routes, availability rules, and agent-facing presentation rules into
Stage Interface Tool Definitions grouped by instrument or agent-facing work
area.

The first implementation slice is a tracer bullet for the Library Tool Group.
It must preserve the public Stage Interface and MCP tool surface.

## Implementation Status

The Library Tool Group tracer bullet is implemented. The Handbook, Stage,
Music, Knowledge, Canonical Review, and Memory Tool Groups are also migrated to
the registry. Fallback dispatch has been removed after full migration.

## Scope

In scope:

- Add a `src/stage_interface/tool_definitions/` module.
- Define a Tool Definition type that can carry descriptor metadata, host input
  schema, availability rule, handler, and optional presentation rule.
- Define Tool Groups so each group receives only the ports it needs.
- Migrate the Library Tool Group first.
- Keep `ToolDispatchPort.call({ sessionId, toolName, payload })` unchanged.
- Keep existing MCP tool names and `minemusic.*` prefixes unchanged.
- Keep `tools.ts` and `schemas.ts` as compatibility exports during migration.
- Keep unmigrated tools on the existing fallback dispatch path.

Out of scope for the tracer bullet:

- Full migration of every Stage Interface tool.
- Runtime validation for every tool payload.
- Changing host-visible tool names, input shapes, or output shapes.
- Changing Core Capability ports.
- Reworking Instrument Catalog beyond deriving already-migrated tool facts from
  Tool Definitions.

## Target Shape

```text
ToolDispatchPort.call(...)
  -> find Tool Definition by toolName
  -> apply shared availability rule
  -> call definition handler with the Tool Group's narrow dependencies
  -> apply definition presentation rule
  -> return Result<unknown>
```

```text
src/stage_interface/tool_definitions/
  types.ts
  library.ts
  index.ts
```

Future Tool Groups can add files such as `handbook.ts`, `stage.ts`, `music.ts`,
`canonical_review.ts`, and `memory.ts`.

## Phase 1: Registry Skeleton

Tasks:

1. Add Tool Definition and Tool Group types.
2. Add a registry builder that returns definitions by tool name.
3. Add availability values such as `always_available` and
   `requires_active_instrument`.
4. Keep tool descriptors and input schemas export-compatible with current
   imports.

Verification:

- Existing Stage Interface and MCP tests still see every stable tool.
- No host-visible tool name changes.

## Phase 2: Library Tool Group Tracer Bullet

Tasks:

1. Move Library tool descriptor metadata and input schemas into
   `tool_definitions/library.ts`.
2. Move Library dispatch routes for:
   - `library.source.list`
   - `library.import.start`
   - `library.import.continue`
   - `library.update.start`
   - `library.update.continue`
   - `library.import.status`
   - `library.import.summary`
   - `library.import.items.list`
3. Bind Library output presentation rules to those definitions.
4. Inject only the Library Tool Group dependencies needed by those handlers:
   Material Store and Library Import.
5. Keep owner-scope defaults and paging behavior unchanged.

Verification:

- Library Import / Source Library tests pass.
- MCP schema tests still see the same Library tool schemas.
- Agent-facing Library outputs remain compact.

## Phase 3: Dispatch Registry Plus Fallback

Tasks:

1. Update dispatch to try the Tool Definition registry first.
2. Keep the existing switch path for unmigrated tools.
3. Apply availability checks from the Tool Definition for migrated tools.
4. Keep the existing discovery/recovery exceptions for unmigrated tools.

Verification:

- A focused dispatch test proves at least one Library tool uses the registry
  path.
- A focused dispatch test proves an unmigrated tool still uses the fallback
  path.
- `npm test` passes.

## Phase 4: State Sync

Tasks:

1. Update `CURRENT_STATE.md` after the tracer bullet is implemented.
2. Update `PROGRESS.md` with the implementation result and verification.
3. Update this plan only if the migration boundary changes.

Do not mark the implementation complete until `git diff --name-only` is checked
and the state-sync gate is reported.

## Remaining Migration Order

Completed after the Library tracer bullet:

1. Handbook Tool Group, because it is low-risk and validates discovery tools.
2. Stage Tool Group, because it owns common session/material/event/effect flows.
3. Music Tool Group, because it has collection and material resolve behavior.
4. Knowledge Tool Group, because it is a small dedicated query surface.
5. Canonical Review Tool Group, because review output presentation is strict.
6. Memory Tool Group, because it is small and can finish the migration.

Recommended remaining follow-up:

1. Reassess runtime payload validation for all Tool Definitions.
