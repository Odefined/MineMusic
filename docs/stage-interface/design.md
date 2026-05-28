# Stage Interface Tool Definition Registry Design

## Purpose

Stage Interface is the stable callable surface for Host Clients and
LLM-facing flows. The Tool Definition registry deepens Stage Interface by
keeping each callable tool's metadata, host input schema, availability rule,
dispatch route, and agent-facing presentation rule together.

This design preserves the public dispatch Interface:

```ts
ToolDispatchPort.call({ sessionId, toolName, payload })
```

The change is behind that Interface. Host Clients, MCP tool names, and the
Stage Interface facade should not need to learn a new call shape.

## Current Friction

Tool truth is currently split across several places:

- tool names and descriptors in `src/stage_interface/tools.ts`.
- host input schemas in `src/stage_interface/schemas.ts`.
- execution routing in `src/stage_interface/dispatch.ts`.
- compact agent-facing output helpers in `src/stage_interface/outputs.ts`.
- MCP exposure in `src/surfaces/mcp/server.ts`.

This makes the Stage Interface shallow for tool maintenance: adding or changing
one tool requires a maintainer to synchronize several files manually.

## Target Concepts

### Tool Definition

A Stage Interface-owned record for one callable MineMusic tool.

It should own:

- tool name.
- descriptor metadata.
- host input schema.
- availability rule.
- dispatch route.
- optional agent-facing presentation rule.

### Tool Group

A Stage Interface-owned group of Tool Definitions matching one instrument or
agent-facing work area.

Tool Groups keep execution dependencies local. A Library Tool Group should
receive Material Store and Library Import dependencies. It should not receive
Session Context, Memory, Effects, or unrelated ports unless a Library tool
actually needs them.

## Dispatch Flow

Target flow for migrated tools:

```text
ToolDispatchPort.call(input)
  -> find Tool Definition by input.toolName
  -> apply the Tool Definition availability rule
  -> merge supported defaults, such as sessionId or ownerScope
  -> call the Tool Definition handler
  -> apply the Tool Definition presentation rule
  -> return Result<unknown>
```

Unmigrated tools may use the existing fallback switch until their Tool Group
moves into the registry.

## Availability Rules

Availability should remain a shared dispatch concern. Tool Definitions declare
which rule applies; they should not each reimplement availability checks.

Initial rule set:

- `requires_active_instrument`: default for ordinary agent-facing tools.
- `always_available`: discovery or recovery tools that must be callable before
  normal instrument availability checks.

## Presentation Rules

Agent-facing output presentation is part of a tool's Interface.

Tool Definitions should bind compact output behavior so a handler does not
accidentally expose internal storage shape, raw provider payloads, unchanged
rows, or full records. Existing helpers in `src/stage_interface/outputs.ts` can
remain the implementation of those presentation rules.

## File Layout

Target first-slice layout:

```text
src/stage_interface/tool_definitions/
  types.ts
  library.ts
  index.ts
```

Future Tool Groups can add:

```text
handbook.ts
stage.ts
music.ts
canonical_review.ts
memory.ts
```

Compatibility exports should remain during migration:

- `tools.ts` continues exporting stable names and descriptors.
- `schemas.ts` continues exporting host input schemas.
- `dispatch.ts` continues exporting `createToolDispatch`.

Where a Tool Group has moved to the registry, those compatibility exports
should derive from Tool Definitions rather than duplicate facts.

## Migration Boundary

The tracer bullet migrates only the Library Tool Group.

The migration must not change:

- `ToolDispatchPort.call(...)`.
- `MineMusicStageInterface.tools`.
- stable tool names.
- MCP `minemusic.*` names.
- current host input shapes.
- current agent-facing output shapes.
- Core Capability ports.

The migration may change:

- internal Stage Interface file layout.
- how descriptors and schemas are derived.
- how Library tool handlers are routed.
- how compact Library output rules are attached to handlers.

## Test Strategy

Required coverage for the tracer bullet:

- Library tool descriptors and schemas remain visible through existing exports.
- MCP definitions expose the same Library schemas.
- At least one Library tool dispatches through the registry path.
- At least one unmigrated tool still dispatches through the fallback path.
- Compact Library outputs remain compact.
- `npm test` passes before implementation is marked complete.
