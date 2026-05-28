# Stage Interface Progress

## Current State

Stage Interface owns the host-facing and LLM-facing callable MineMusic surface:
instruments, tools, Handbook lookup, governed dispatch, and common MineMusic
flow ordering.

The Tool Definition / Tool Group direction is documented. The Stage, Handbook,
Music, Knowledge, Library, Canonical Review, and Memory Tool Groups are
implemented in the registry. Their tool names, descriptors, host input schemas,
dispatch routes, and output presentation rules now live under
`src/stage_interface/tool_definitions/`.

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
- `src/stage_interface/tool_definitions/canonical_review.ts`.
- `src/stage_interface/tool_definitions/handbook.ts`.
- `src/stage_interface/tool_definitions/knowledge.ts`.
- `src/stage_interface/tool_definitions/library.ts`.
- `src/stage_interface/tool_definitions/memory.ts`.
- `src/stage_interface/tool_definitions/music.ts`.
- `src/stage_interface/tool_definitions/stage.ts`.
- `src/stage_interface/tool_definitions/index.ts`.
- Stage Tool Group registry definitions.
- Handbook Tool Group registry definitions.
- Knowledge Tool Group registry definitions.
- Music Tool Group registry definitions.
- Library Tool Group registry definitions.
- Canonical Review Tool Group registry definitions.
- Memory Tool Group registry definitions.
- Registry-first dispatch for Stage tools.
- Registry-first dispatch for Handbook tools.
- Registry-first dispatch for Knowledge tools.
- Registry-first dispatch for Music tools.
- Registry-first dispatch for Library tools.
- Registry-first dispatch for Canonical Review tools.
- Registry-first dispatch for Memory tools.
- Compatibility exports for Stage, Handbook, Knowledge, Music, Library, and
  Canonical Review, and Memory descriptors and schemas derived from the
  registry.
- Co-located compact Canonical Review output presentation rules.
- Focused registry/fallback dispatch test coverage.

## Not Yet Implemented

- Runtime payload validation for all tools.
- Removal of fallback dispatch.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.

## Next Slice

Remove the fallback dispatch path now that every stable tool resolves through
the Tool Definition registry.
