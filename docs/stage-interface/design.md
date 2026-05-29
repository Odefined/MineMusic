# Stage Interface Tool Contract Design

## Purpose

Stage Interface is the stable callable surface for Host Clients, MCP adapters,
and LLM-facing flows. Its Tool Definitions are the contract unit for MineMusic
tools.

The current refactor deepens that boundary:

```text
Tool Definition
  -> stable tool name
  -> descriptor metadata
  -> host input schema
  -> availability rule
  -> dispatch handler
  -> agent-facing presentation rule
  -> runtime payload validation
```

`ToolDispatchPort.call({ sessionId, toolName, payload })` remains the public
Interface. The change is behind that Interface: dispatch must use the
registered Tool Definition to validate payloads before invoking a handler.

## Current Friction

The Tool Definition registry already co-locates tool metadata, schemas,
availability, handlers, dependency contexts, and compact presentation rules
under `src/stage_interface/tool_definitions/**`.

The remaining contract gap is that dispatch currently treats input schemas as
metadata. Payloads enter handlers as `unknown`, and handlers often merge
defaults before casting to the expected payload type. That means malformed tool
inputs can reach module ports before Stage Interface rejects them.

Tool facts also still have multiple aggregate surfaces:

- `src/stage_interface/tools.ts` exports stable tool names and descriptors.
- `src/stage_interface/schemas.ts` exports host input schemas.
- `src/stage_interface/tool_definitions/index.ts` creates the bound registry.
- `src/surfaces/mcp/server.ts` exposes MCP tools from descriptors and schemas.

The target direction is:

```text
Tool Definitions
  -> stable tool names
  -> descriptors
  -> input schemas
  -> dispatch registry
  -> MCP registration
  -> Handbook / instrument catalog
```

## Tool Definition Boundary

A Tool Definition owns one callable MineMusic tool:

```ts
type StageInterfaceToolDefinition<TName, TContext> = {
  name: TName;
  description: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  effectKind?: string;
  inputSchema: StageInterfaceToolInputSchema;
  availability: StageInterfaceToolAvailability;
  handler(input: StageInterfaceToolHandlerInput<TContext>): Promise<Result<unknown>> | Result<unknown>;
  validatePayload?: (payload: unknown) => Result<unknown>;
  present?: (value: unknown) => unknown;
};
```

The public call shape stays unchanged. The dispatch flow for every stable tool
should be:

```text
ToolDispatchPort.call(input)
  -> look up Tool Definition by input.toolName
  -> apply the Tool Definition availability rule
  -> parse input.payload with the Tool Definition input schema
  -> apply optional Tool Definition payload validation
  -> call the Tool Definition handler with parsed payload
  -> apply the Tool Definition presentation rule
  -> return Result<unknown>
```

## Runtime Payload Validation

Dispatch validates payloads with the definition's `inputSchema` before handler
invocation.

Initial validation is intentionally permissive:

```ts
z.object(definition.inputSchema).passthrough()
```

This enforces required fields and field types while preserving compatibility
with callers that include harmless extra keys. Undefined payloads are
normalized to `{}`. Strict rejection of unknown keys is a later per-tool
decision, not the default behavior of this refactor.

Some tool contracts need cross-field validation that cannot be represented by
the public raw shape without changing host schema compatibility. Those tools may
provide `validatePayload`. Dispatch runs it after the raw schema parse and
before handler invocation. For example, `music.material.resolve` requires
`candidate` when `kind` is `single` and `candidates` when `kind` is
`candidate_set`.

Validation failures return a normalized `StageError`:

```ts
{
  code: "stage_interface.invalid_payload",
  module: "stage_interface",
  retryable: false,
}
```

Stage Interface must not throw raw Zod errors or expose full schema internals to
agent-facing callers. Error messages should name the tool and summarize only the
first few invalid fields.

Availability checks remain before payload validation so existing
unavailable-tool behavior is preserved.

## Aggregate Surfaces

Stable tool names, descriptors, and input schemas should be derived from the
ordered Tool Definition list, with compatibility exports preserved:

```text
src/stage_interface/tool_definitions/index.ts
  -> stageInterfaceToolDefinitions
  -> stableToolNames
  -> agentToolDescriptors
  -> stageInterfaceToolInputSchemas

src/stage_interface/tools.ts
  -> compatibility re-exports

src/stage_interface/schemas.ts
  -> compatibility re-exports
```

Ordering matters because the instrument catalog, Handbook, MCP surface, and
tests treat the stable tool list as a published surface. The derivation must
preserve the existing order exactly.

MCP remains an adapter. It consumes Stage Interface descriptors and schemas and
must not become a separate source of tool truth.

## Handler Cleanup

After dispatch owns basic payload validation, handler cleanup can be gradual.
The first cleanup target is low-risk Stage tools, followed by Memory and
Knowledge tools. Complex Library, Music, and Canonical Review handlers should
only be simplified when tests cover the behavior being protected.

Handlers may still merge semantic defaults such as `sessionId` or
`ownerScope`. The refactor only removes broad unchecked shape assumptions where
dispatch has already validated the payload.

## Non-Goals

This refactor does not:

- rename tools;
- change MCP `minemusic.*` names;
- change `ToolDispatchPort.call(...)`;
- redesign Stage Core, Material Resolve, provider adapters, or Plugin Slots;
- make validation strict by default;
- rewrite every handler in one pass;
- introduce decorators, classes, or a command framework.

## Test Strategy

Required coverage:

- stable tool order is explicitly protected;
- every stable tool has one descriptor and one input schema;
- definitions, descriptors, schemas, and MCP exposure stay in parity;
- unknown tool names still return `stage_interface.tool_not_found`;
- invalid payloads fail with `stage_interface.invalid_payload`;
- invalid payloads do not call handler dependencies;
- valid payloads still reach handlers;
- extra payload keys remain accepted in the first pass;
- presentation rules still produce compact agent-facing output.

The execution plan for this design is
`docs/stage-interface/minemusic_stage_interface_tool_contract_execution_plan.md`.
