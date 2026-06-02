> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/stage-interface/design.md`, `docs/stage-interface/tool-contracts.md`, `docs/stage-interface/ports.md`
> Use only for: Historical tool-contract refactor rationale before implementation completed.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# MineMusic Stage Interface Tool Contract Refactor Design

## 1. Executive Summary

The next high-leverage architecture slice after the Stage Core Runtime Kit refactor is to make **Stage Interface tool definitions the single source of truth and runtime enforcement boundary**.

The repository already has a promising tool-definition layer: each tool definition carries a stable name, description, input schema, output schema reference, availability rule, handler, and optional presenter. However, the runtime dispatch path still treats those schemas mostly as metadata. Tool payloads enter handlers as `unknown`, and handlers commonly cast them into expected shapes. This means the most important agent-facing boundary is documented but not fully enforced.

Recommended direction:

> Make Stage Interface Tool Definitions the authoritative runtime contract for tool name, descriptor, input schema, availability, handler routing, and output presentation. Dispatch must validate payloads through each tool definition before invoking handlers. MCP, Handbook, schema exports, and dispatch should all derive from the same definitions.

This design intentionally does **not** propose a large framework, class hierarchy, or broad rewrite. It is a small internal boundary hardening step.

---

## 2. Current Code Evidence

### 2.1 Tool definitions already contain the right ingredients

`src/stage_interface/tool_definitions/types.ts` defines:

- `name`
- `description`
- `inputSchemaRef`
- `outputSchemaRef`
- `effectKind`
- `inputSchema`
- `availability`
- `handler`
- `present`

This is a good foundation. The problem is not absence of structure; the problem is that dispatch does not yet treat this structure as the runtime contract.

### 2.2 Dispatch checks availability but does not parse payloads

`src/stage_interface/dispatch.ts` currently does:

1. check tool name against `stableToolNames`
2. find the bound tool definition
3. check availability when required
4. call `definition.handler({ sessionId, payload })`
5. optionally run `definition.present(...)`

The payload remains `unknown` all the way into the handler. Therefore the advertised schema does not yet act as an input boundary.

### 2.3 Tool facts are still aggregated from multiple surfaces

Current related surfaces include:

- `src/stage_interface/tools.ts`
  - builds `stableToolNames`
  - builds `agentToolDescriptors`
- `src/stage_interface/schemas.ts`
  - builds `stageInterfaceToolInputSchemas`
- `src/stage_interface/tool_definitions/index.ts`
  - builds bound definition registry
- `src/surfaces/mcp/server.ts`
  - reads descriptors and schemas to expose MCP tools

The current structure is better than a single switch, but the same tool facts are still consumed through several aggregate modules. The desired end state is:

```text
tool definitions
  -> stable tool names
  -> descriptors
  -> schemas
  -> dispatch registry
  -> MCP surface
  -> Handbook / instrument catalog
```

not:

```text
tool names + descriptors + schemas + dispatch registry
  -> partially overlapping representations
```

### 2.4 Handlers still cast raw payloads

Several tool definition files use local `readPayload<TPayload>(payload, defaults)` helpers. These helpers typically perform object/default merging and then cast the result to a TypeScript type. They do not validate runtime shape.

This is acceptable as an interim adapter pattern, but after dispatch validation exists, handlers should rely less on unchecked payload shape assumptions.

---

## 3. Problem Statement

Stage Interface is the main boundary between agent/host calls and MineMusic domain services. A boundary should do two things:

1. expose a stable contract;
2. enforce that contract at runtime.

Current Stage Interface mostly does the first and only partially does the second.

The result is a drift risk:

- MCP sees schemas;
- Handbook/instrument catalog sees descriptors;
- dispatch routes handlers;
- handlers interpret `unknown` payloads;
- tests may pass through happy-path payloads while malformed inputs fail deeper in domain services.

This makes tool evolution more expensive. Adding or changing one tool can require keeping several surfaces aligned manually.

---

## 4. Design Goals

### 4.1 Primary goals

1. **Make tool definitions the runtime source of truth.**  
   A tool definition should own the schema that dispatch uses before handler invocation.

2. **Reduce drift between names, descriptors, schemas, MCP, and dispatch.**  
   Derived surfaces should come from the same ordered list of definitions.

3. **Preserve current tool names and behavior.**  
   This is a boundary hardening refactor, not a tool API redesign.

4. **Keep the implementation small.**  
   Use existing Zod schemas and existing definition objects. Do not introduce a command framework.

5. **Enable incremental handler cleanup.**  
   Dispatch validation should come first. Handler `readPayload` cleanup can be gradual.

### 4.2 Non-goals

This refactor should not:

- rename tools;
- redesign MCP tool naming;
- rewrite all handlers;
- replace all local payload helpers in one PR;
- introduce strict validation everywhere immediately;
- introduce decorators/classes/frameworks;
- redesign Stage Core or provider registry;
- change domain service ports.

---

## 5. Proposed Architecture

## 5.1 Stage Interface Tool Definition as contract unit

A tool definition should be treated as the authoritative record for a tool:

```ts
type StageInterfaceToolDefinition<TName extends ToolName, TContext> = {
  name: TName;
  description: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  effectKind?: string;
  inputSchema: StageInterfaceToolInputSchema;
  availability: StageInterfaceToolAvailability;
  handler(input: StageInterfaceToolHandlerInput<TContext>): Promise<Result<unknown>> | Result<unknown>;
  present?: (value: unknown) => unknown;
};
```

This shape is already close to correct.

The design change is behavioral:

> Dispatch must validate `payload` against `definition.inputSchema` before calling `definition.handler`.

---

## 5.2 Runtime payload validation in dispatch

### Current flow

```text
dispatch.call
  -> isStableToolName
  -> registry.get(toolName)
  -> ensure availability
  -> handler({ payload: unknown })
  -> present
```

### Target flow

```text
dispatch.call
  -> registry.get(toolName)
  -> ensure availability
  -> parse payload using definition.inputSchema
  -> handler({ payload: parsedPayload })
  -> present
```

Suggested behavior:

- `undefined` payload is normalized to `{}`.
- Validation uses `z.object(definition.inputSchema).passthrough()` initially.
- Validation failure returns a `Result<never>` with:
  - code: `stage_interface.invalid_payload`
  - module: `stage_interface`
  - retryable: false
  - message with tool name and concise error summary.

Initial use of `.passthrough()` is intentional. It avoids breaking tool calls that currently include extra fields, while still enforcing required fields and field types.

Strict mode can be a later opt-in.

---

## 5.3 Error model

Add a Stage Interface error code:

```ts
"stage_interface.invalid_payload"
```

This belongs near existing Stage Interface error codes.

Recommended error shape:

```ts
{
  code: "stage_interface.invalid_payload",
  message: `Payload for tool '${definition.name}' is invalid: ${summary}`,
  module: "stage_interface",
  retryable: false,
}
```

Do not throw Zod errors. Normalize them into StageError.

---

## 5.4 Derived surfaces from definitions

A later phase should derive the following from the ordered tool definition list:

- stable tool names
- descriptors
- input schemas
- dispatch registry
- MCP tool definitions
- Handbook/instrument descriptors

### Current state

Current aggregation is split across:

```text
src/stage_interface/tools.ts
src/stage_interface/schemas.ts
src/stage_interface/tool_definitions/index.ts
```

### Target state

Introduce a canonical ordered list:

```ts
export const allStageInterfaceToolDefinitions = [
  stage.context.read,
  handbook.*,
  stage.* except context.read,
  music.material.resolve,
  knowledge.*,
  music.* except material.resolve,
  library.*,
  canonical_review.*,
  memory.*,
] as const;
```

Then derive:

```ts
export const stableToolNames = allStageInterfaceToolDefinitions.map((definition) => definition.name);

export const agentToolDescriptors = allStageInterfaceToolDefinitions.map(descriptorForToolDefinition);

export const stageInterfaceToolInputSchemas = Object.fromEntries(
  allStageInterfaceToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
);
```

Important: preserve existing order. Stable order matters for agent-facing catalog / Handbook / MCP surfaces.

---

## 5.5 Compatibility re-exports

During migration, `tools.ts` and `schemas.ts` can remain compatibility modules:

```ts
// tools.ts
export {
  stableToolNames,
  agentToolDescriptors,
  ...
} from "./tool_definitions/index.js";

// schemas.ts
export {
  stageInterfaceToolInputSchemas,
  ...
} from "./tool_definitions/index.js";
```

This prevents churn in MCP and other callers.

---

## 5.6 Handler cleanup after dispatch validation

Once dispatch validates inputs, handlers can gradually stop using broad `readPayload<T>` helpers.

Do this incrementally:

1. Stage tools
2. Memory tools
3. Knowledge tools
4. Library tools
5. Music collection tools
6. Canonical review tools

Do not attempt to rewrite all handlers in the same PR. The first PR should focus on dispatch-level validation.

---

# 6. Phased Design

## Phase 1 — Runtime payload validation

### Objective

Make `inputSchema` enforce runtime input boundary.

### Changes

- Add `stage_interface.invalid_payload`.
- Add `parseToolPayload` to dispatch.
- Validate payload before handler call.
- Add tests for invalid payload.

### Acceptance

- Invalid payloads fail at Stage Interface boundary.
- Valid existing payloads behave unchanged.
- MCP schema output unchanged.
- Tool names unchanged.

---

## Phase 2 — Definition-derived aggregate surfaces

### Objective

Make definitions the source for names, descriptors, schemas, and registry.

### Changes

- Add `allStageInterfaceToolDefinitions`.
- Derive `stableToolNames`.
- Derive `agentToolDescriptors`.
- Derive `stageInterfaceToolInputSchemas`.
- Keep compatibility exports.

### Acceptance

- Existing stable tool order unchanged.
- Every tool name has exactly one definition.
- Every definition has descriptor and schema.
- MCP surface still exposes same tool set.

---

## Phase 3 — Handler payload cleanup

### Objective

Reduce unchecked payload casts inside handlers.

### Changes

- Start with Stage tool group.
- Replace local `readPayload<T>` usage where dispatch already guarantees shape.
- Keep defaults where semantically needed, especially `sessionId`.

### Acceptance

- Handler tests still pass.
- No broad behavior change.
- Invalid payload tests remain at dispatch boundary.

---

## Phase 4 — Optional strictness controls

### Objective

Allow certain tools to reject unknown fields.

### Possible design

Add optional validation mode:

```ts
validation?: "passthrough" | "strict";
```

Default to `"passthrough"`.

Use `"strict"` only when the tool is mature and external call shape is stable.

### Acceptance

- No existing tools become strict accidentally.
- Strict mode has explicit tests.

---

# 7. Testing Strategy

## 7.1 Dispatch validation tests

Add tests in:

```text
test/stage_interface/stage-interface-dispatch.test.ts
```

Suggested tests:

1. invalid tool name still returns `stage_interface.tool_not_found`;
2. invalid payload for a known tool returns `stage_interface.invalid_payload`;
3. invalid payload does not call underlying fake port;
4. valid payload still calls underlying fake port;
5. `present` still runs after successful handler result;
6. `requires_active_instrument` availability still runs before handler.

Ordering question: availability before validation or validation before availability?

Recommended initial order:

```text
tool exists -> availability -> payload validation -> handler
```

This preserves current behavior as closely as possible. A tool unavailable for a session should still return tool unavailable before validating payload.

## 7.2 Aggregate parity tests

Add tests that assert:

- `stableToolNames` has no duplicates.
- every `stableToolName` has a definition.
- every definition name is in `stableToolNames`.
- every descriptor name is in `stableToolNames`.
- every schema key is in `stableToolNames`.
- current stable tool order remains unchanged.

## 7.3 MCP smoke tests

Existing MCP server tests should continue to pass.

The MCP layer should remain an adapter that consumes descriptors and schemas, not a second source of tool truth.

---

# 8. Risks and Mitigations

| Risk | Cause | Mitigation |
|---|---|---|
| Existing callers send extra fields | Strict schema validation | Start with `.passthrough()` |
| Handlers rely on defaults | Validation does not apply defaults | Keep handler-level default merge initially |
| Zod errors leak raw details | Direct error propagation | Convert to `StageError` |
| Tool order changes | Derived definitions reorder incorrectly | Add stable order characterization test |
| PR becomes too large | Validation + derived surfaces + handler cleanup combined | Split into phases |
| False sense of type safety | Parsed payload still typed as unknown | Runtime boundary still improves safety; handler cleanup follows later |

---

# 9. Acceptance Criteria for First PR

The first PR should be accepted when:

1. `inputSchema` is used by dispatch at runtime.
2. Invalid payloads fail with `stage_interface.invalid_payload`.
3. Valid existing tool calls behave unchanged.
4. Tool names/descriptors/MCP schemas are not changed.
5. Tests cover invalid payload and non-invocation of underlying handler.
6. Full test suite passes.

---

# 10. What Not to Change in First PR

Do not:

- derive all tool aggregates yet;
- rewrite all handler payload casts;
- change tool names;
- change MCP prefix;
- change Handbook rendering;
- change MaterialResolve;
- change PluginRegistry;
- change Stage Core.

---

# 11. Recommended First PR Scope

Recommended title:

```text
Make Stage Interface tool schemas enforce runtime payloads
```

Recommended files:

```text
src/contracts/index.ts
src/stage_interface/dispatch.ts
src/stage_interface/tool_definitions/types.ts
test/stage_interface/stage-interface-dispatch.test.ts
```

Potentially no change is needed in `tool_definitions/types.ts` unless adding validation mode or comments.

---

# 12. Later Follow-up PRs

## Follow-up PR 2

Title:

```text
Derive Stage Interface tool aggregates from definitions
```

Scope:

```text
src/stage_interface/tool_definitions/index.ts
src/stage_interface/tools.ts
src/stage_interface/schemas.ts
test/stage_interface/stage-interface.test.ts
```

## Follow-up PR 3

Title:

```text
Reduce unchecked payload casts in Stage Interface handlers
```

Scope:

```text
src/stage_interface/tool_definitions/stage.ts
src/stage_interface/tool_definitions/memory.ts
src/stage_interface/tool_definitions/knowledge.ts
tests
```

---

# 13. Final Recommendation

Start with **runtime payload validation**. It is the smallest change that makes the existing tool definition architecture materially stronger.

Do not start by reorganizing all tool files. First make the existing schema field meaningful at runtime. Then derive aggregate surfaces from definitions in a follow-up PR.
