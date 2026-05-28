# Stage Interface Progress

## Current State

Stage Interface owns the host-facing and LLM-facing callable MineMusic surface:
instruments, tools, Handbook lookup, governed dispatch, and common MineMusic
flow ordering.

The Tool Definition / Tool Group direction is documented, and the Library Tool
Group tracer bullet is implemented. Library tool names, descriptors, host input
schemas, dispatch routes, and output presentation rules now live in
`src/stage_interface/tool_definitions/library.ts`.

Stage Interface dispatch now tries the Tool Definition registry before falling
back to the existing switch path for unmigrated tools.

## Established Decisions

- Keep `ToolDispatchPort.call({ sessionId, toolName, payload })` as the public
  dispatch Interface.
- Move tool truth behind that Interface into Tool Definitions.
- Group Tool Definitions by instrument or agent-facing work area.
- Give each Tool Group only the ports it needs.
- Keep availability checks in shared dispatch flow, with each Tool Definition
  declaring its availability rule.
- Treat compact agent-facing output presentation as part of each tool's
  Interface.
- Migrate with registry plus fallback dispatch rather than a single large
  rewrite.
- Use the Library Tool Group as the first tracer bullet.

## Implemented

- `src/stage_interface/tool_definitions/types.ts`.
- `src/stage_interface/tool_definitions/library.ts`.
- `src/stage_interface/tool_definitions/index.ts`.
- Library Tool Group registry definitions.
- Registry-first dispatch for Library tools.
- Compatibility exports for Library descriptors and schemas derived from the
  registry.
- Focused registry/fallback dispatch test coverage.

## Not Yet Implemented

- Handbook Tool Group registry definitions.
- Stage Tool Group registry definitions.
- Music Tool Group registry definitions.
- Canonical Review Tool Group registry definitions.
- Memory Tool Group registry definitions.
- Runtime payload validation for all tools.
- Removal of fallback dispatch.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.

## Next Slice

Migrate the Handbook Tool Group next. It is the lowest-risk follow-up because
it covers discovery tools and Handbook lookup without changing Core Capability
behavior.
