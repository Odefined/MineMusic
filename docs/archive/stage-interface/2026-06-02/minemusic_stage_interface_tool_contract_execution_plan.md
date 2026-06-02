> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/stage-interface/progress.md`, `docs/stage-interface/tool-contracts.md`
> Use only for: Historical execution sequence and test plan for the completed tool-contract migration.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# MineMusic Stage Interface Tool Contract Refactor Execution Plan

## 1. Purpose

This execution plan implements the next refactoring slice after the Stage Core Runtime Kit merge:

> Make Stage Interface tool definitions the authoritative runtime contract for tool names, descriptors, input schemas, availability, handler routing, and MCP exposure.

The plan does **not** require splitting work into multiple PRs. It is organized into implementation phases so the work can be executed and verified incrementally in one branch.

## 2. Current Problems to Address

### 2.1 Input schemas are not a runtime boundary

`StageInterfaceToolDefinition` already carries `inputSchema`, `availability`, `handler`, and optional `present`, but `dispatch.ts` currently checks availability and then passes `payload: unknown` directly to the handler.

Current flow:

```text
ToolDispatchPort.call
  -> isStableToolName
  -> toolDefinitionRegistry.get(toolName)
  -> ensureToolAvailableForSession
  -> definition.handler({ sessionId, payload })
  -> optional definition.present
```

The missing boundary is:

```text
payload -> schema parse -> parsed payload -> handler
```

### 2.2 Tool facts still have multiple aggregation points

Tool facts are currently spread across:

- `src/stage_interface/tools.ts`
  - stable tool-name ordering
  - agent tool descriptor aggregation
- `src/stage_interface/schemas.ts`
  - input schema aggregation
- `src/stage_interface/tool_definitions/**`
  - tool definitions, handlers, group schemas, descriptors
- `src/surfaces/mcp/server.ts`
  - MCP tool registration from descriptors and schemas

The desired direction is:

```text
tool definitions
  -> tool names
  -> descriptors
  -> input schemas
  -> dispatch registry
  -> MCP registration
```

### 2.3 Tool handlers still rely on unchecked casts

Many handlers use `readPayload<TPayload>(payload, defaults)`, which merges defaults into `unknown` and casts it to a typed payload. Runtime validation should happen before handler code, so handlers do not need to defend against basic shape errors.

## 3. Scope

### In scope

- Add runtime payload validation using each tool definition's `inputSchema`.
- Add Stage Interface invalid-payload error handling.
- Add tests proving invalid payloads fail at the Stage Interface boundary.
- Add parity tests proving tool names, descriptors, schemas, and registry entries do not drift.
- Optionally derive `stableToolNames`, `agentToolDescriptors`, and `stageInterfaceToolInputSchemas` from ordered tool definitions.
- Preserve current tool names, ordering, descriptors, schema shapes, availability behavior, and handler output behavior.

### Out of scope

- No MaterialResolve refactor.
- No PluginRegistry typed-provider refactor.
- No MCP transport redesign.
- No tool renaming.
- No strict payload mode in the first implementation.
- No mass rewrite of all tool handlers.
- No class-based command framework.
- No large-scale contract file split.

## 4. Execution Phases

---

## Phase 0 — Baseline and Invariant Inventory

### Goal

Establish the current behavior before adding runtime validation or changing aggregation logic.

### Code areas

- `src/stage_interface/dispatch.ts`
- `src/stage_interface/tools.ts`
- `src/stage_interface/schemas.ts`
- `src/stage_interface/tool_definitions/index.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/stage_interface/stage-interface.test.ts`
- `test/surfaces/mcp-server.test.ts`

### Implementation steps

1. Run the current test baseline:

   ```bash
   npm run typecheck
   npm run build:test
   node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
   node .tmp-test/test/stage_interface/stage-interface.test.js
   node .tmp-test/test/surfaces/mcp-server.test.js
   npm test
   ```

2. Record the current `stableToolNames` order in a test fixture or snapshot-style assertion. Do not introduce a snapshot dependency; prefer a simple explicit array assertion in an existing Stage Interface test.

3. Add parity tests that should pass before any implementation changes:

   - every `stableToolName` has an input schema entry;
   - every `stableToolName` has an agent descriptor;
   - every agent descriptor name appears in `stableToolNames`;
   - every schema key appears in `stableToolNames`;
   - there are no duplicate stable tool names;
   - stable tool order remains unchanged.

### Tests to add

Suggested file:

```text
test/stage_interface/stage-interface.test.ts
```

Suggested test functions:

```ts
async function stableToolNamesHaveMatchingSchemasAndDescriptors(): Promise<void>
async function stableToolNamesRemainInPublishedOrder(): Promise<void>
```

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface.test.js
npm test
```

### Acceptance criteria

- Baseline tests pass before implementation changes.
- New parity tests pass without changing production code.
- The current stable tool order is explicitly protected.
- No runtime behavior changes in this phase.

### Do not change

- Do not modify dispatch behavior.
- Do not add runtime validation yet.
- Do not reorder tools.

---

## Phase 1 — Add `stage_interface.invalid_payload` Error Code

### Goal

Introduce a dedicated Stage Interface error code for schema validation failures.

### Code areas

- `src/contracts/index.ts`
- `src/stage_interface/dispatch.ts`
- Stage Interface tests

### Implementation steps

1. Add the error code to `stageErrorCodes`:

   ```ts
   "stage_interface.invalid_payload"
   ```

2. Add a small helper in `dispatch.ts`:

   ```ts
   function invalidPayloadError(toolName: ToolName, message: string): StageError {
     return {
       code: "stage_interface.invalid_payload",
       message: `Invalid payload for tool '${toolName}': ${message}`,
       module: "stage_interface",
       retryable: false,
     };
   }
   ```

3. Do not wire the helper into dispatch yet if this phase is kept narrow. It is acceptable to add and use it in Phase 2 instead.

### Tests to add

No test is strictly required if the helper is not wired yet. If you wire it immediately, tests belong in Phase 2.

### Validation commands

```bash
npm run typecheck
npm test
```

### Acceptance criteria

- `StageErrorCode` includes `stage_interface.invalid_payload`.
- Typecheck passes.
- No existing error code behavior changes.

### Do not change

- Do not reuse `stage_interface.tool_not_found` for validation errors.
- Do not make validation retryable.

---

## Phase 2 — Enforce Runtime Payload Validation in Dispatch

### Goal

Make each `StageInterfaceToolDefinition.inputSchema` an actual runtime boundary before handler invocation.

### Code areas

- `src/stage_interface/dispatch.ts`
- `src/stage_interface/tool_definitions/types.ts`
- `src/contracts/index.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`

### Design decision

Use permissive object validation first:

```ts
z.object(definition.inputSchema).passthrough()
```

Do **not** use `.strict()` in the first pass. Many tool payloads currently tolerate extra fields and several schemas intentionally use `.passthrough()` internally. The first objective is to validate required structure, not to reject all unknown keys.

### Implementation steps

1. Import Zod in `dispatch.ts`:

   ```ts
   import { z } from "zod/v4";
   ```

2. Add a parser helper:

   ```ts
   function parseToolPayload({
     definition,
     payload,
   }: {
     definition: BoundStageInterfaceToolDefinition;
     payload: unknown;
   }): Result<unknown> {
     const payloadObject = payload === undefined ? {} : payload;
     const parsed = z.object(definition.inputSchema).passthrough().safeParse(payloadObject);

     if (!parsed.success) {
       return fail(invalidPayloadError(definition.name, summarizeZodError(parsed.error)));
     }

     return ok(parsed.data);
   }
   ```

3. Add a compact Zod error summarizer. Keep it short; do not return giant schema output to the agent.

   Example:

   ```ts
   function summarizeZodError(error: z.ZodError): string {
     return error.issues
       .slice(0, 3)
       .map((issue) => {
         const path = issue.path.length === 0 ? "payload" : issue.path.join(".");
         return `${path}: ${issue.message}`;
       })
       .join("; ");
   }
   ```

4. In `callToolDefinition`, parse after availability succeeds and before handler runs:

   ```ts
   const parsedPayload = parseToolPayload({ definition, payload });

   if (!parsedPayload.ok) {
     return parsedPayload;
   }

   const result = await definition.handler({
     sessionId,
     payload: parsedPayload.value,
   });
   ```

5. Preserve `present` behavior exactly after handler returns:

   ```ts
   if (!result.ok || definition.present === undefined) {
     return result;
   }

   return ok(definition.present(result.value));
   ```

6. Preserve availability behavior: `requires_active_instrument` should still be checked before payload validation unless there is a deliberate product reason to validate first. The current code checks availability first; keep that order to avoid changing externally visible errors for unavailable tools.

### Tests to add

Suggested file:

```text
test/stage_interface/stage-interface-dispatch.test.ts
```

Add tests for:

#### 2.1 Invalid payload fails at Stage Interface boundary

Tool: `stage.materials.prepare`

Payload missing `materials`:

```ts
{
  purpose: "recommendation"
}
```

Expected:

```ts
result.ok === false
result.error.code === "stage_interface.invalid_payload"
result.error.module === "stage_interface"
```

#### 2.2 Invalid payload does not call the handler dependency

Use a fake `MaterialGatePort` whose `prepareMaterials` increments a counter or throws if called.

Expected:

```ts
prepareMaterialsCalls === 0
```

#### 2.3 Valid payload still reaches handler

Payload:

```ts
{
  materials: [],
  purpose: "recommendation"
}
```

Expected:

```ts
prepareMaterialsCalls === 1
```

#### 2.4 Unknown extra keys are accepted in first pass

Payload:

```ts
{
  materials: [],
  purpose: "recommendation",
  extra: "ignored-or-passed-through"
}
```

Expected:

```ts
result.ok === true
```

This locks in the non-strict first-pass behavior.

#### 2.5 Invalid tool names still return `tool_not_found`

Existing behavior must not change.

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
npm test
```

### Acceptance criteria

- Invalid payloads fail before handler invocation.
- Error code is `stage_interface.invalid_payload`.
- Availability checks still run in the previous order.
- Extra keys are still tolerated in this first implementation.
- Existing valid tool calls behave unchanged.
- Full test suite passes.

### Do not change

- Do not convert to strict validation.
- Do not change tool names.
- Do not change MCP registration.
- Do not rewrite tool handlers.

---

## Phase 3 — Add Tool Definition Parity Tests Around the Registry

### Goal

Prove that the tool-definition registry, published names, descriptors, and schemas are coherent.

### Code areas

- `src/stage_interface/tool_definitions/index.ts`
- `src/stage_interface/tools.ts`
- `src/stage_interface/schemas.ts`
- `test/stage_interface/stage-interface.test.ts`

### Implementation steps

1. Add a helper in tests to collect all tool names from exported group name arrays:

   ```ts
   const groupedToolNames = [
     ...stageToolNames,
     ...handbookToolNames,
     ...musicToolNames,
     ...knowledgeToolNames,
     ...libraryToolNames,
     ...canonicalReviewToolNames,
     ...memoryToolNames,
   ];
   ```

2. Assert no duplicates.

3. Assert `stableToolNames` contains the same set as grouped tool names.

4. Assert every `stableToolName` has:

   - descriptor in `agentToolDescriptors`;
   - schema in `stageInterfaceToolInputSchemas`;
   - registry definition from `createStageInterfaceToolDefinitionRegistry(...)` when provided with minimal fake contexts.

5. If creating a fully bound registry is too heavy because contexts require many ports, keep this phase focused on exported names/descriptors/schemas. Registry coverage can be added after Phase 4.

### Tests to add

Suggested names:

```ts
async function toolDefinitionsHaveNoDuplicateNames(): Promise<void>
async function stableToolNamesMatchPublishedDescriptorsAndSchemas(): Promise<void>
```

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface.test.js
npm test
```

### Acceptance criteria

- Duplicate tool names are impossible to introduce silently.
- Missing schema entries fail tests.
- Missing descriptors fail tests.
- Stable order remains explicitly protected.
- No runtime behavior changes.

### Do not change

- Do not move aggregation code yet if tests alone can expose drift.
- Do not reorder stable tools.

---

## Phase 4 — Derive Published Tool Facts from Tool Definitions

### Goal

Make tool definitions the single source for names, descriptors, and schemas, while preserving public exports and ordering.

### Code areas

- `src/stage_interface/tool_definitions/index.ts`
- `src/stage_interface/tools.ts`
- `src/stage_interface/schemas.ts`
- Stage Interface tests
- MCP surface tests

### Implementation steps

1. In `tool_definitions/index.ts`, define an ordered list of tool definition groups that preserves current `stableToolNames` order.

   The current order is not simple group order; it intentionally puts:

   - first stage tool first;
   - handbook tools early;
   - remaining stage tools;
   - material resolve before knowledge;
   - knowledge before remaining music tools.

   Preserve that shape:

   ```ts
   const orderedStageInterfaceToolDefinitionGroups = [
     stageToolDefinitions.slice(0, 1),
     handbookToolDefinitions,
     stageToolDefinitions.slice(1),
     musicToolDefinitions.slice(0, 1),
     knowledgeToolDefinitions,
     musicToolDefinitions.slice(1),
     libraryToolDefinitions,
     canonicalReviewToolDefinitions,
     memoryToolDefinitions,
   ] as const;
   ```

2. Export:

   ```ts
   export const stageInterfaceToolDefinitions = orderedStageInterfaceToolDefinitionGroups.flat();
   ```

3. Derive stable names:

   ```ts
   export const stableToolNames = stageInterfaceToolDefinitions.map(
     (definition) => definition.name,
   ) as ...;
   ```

   TypeScript may need a narrower cast. Keep it local and tested.

4. Derive agent descriptors:

   ```ts
   export const agentToolDescriptors = stageInterfaceToolDefinitions.map(
     descriptorForToolDefinition,
   ) as StableToolDescriptor[];
   ```

5. Derive schemas:

   ```ts
   export const stageInterfaceToolInputSchemas = Object.fromEntries(
     stageInterfaceToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
   ) as Record<StableToolName, StageInterfaceToolInputSchema>;
   ```

6. Keep `tools.ts` and `schemas.ts` as compatibility re-export modules if existing imports depend on them.

7. Update imports carefully to avoid circular dependencies:

   - Do not import `stableToolNames` from `tools.ts` into `tool_definitions/index.ts` if `tools.ts` imports from `tool_definitions/index.ts`.
   - Prefer placing derived exports in `tool_definitions/index.ts` and re-exporting from `tools.ts` / `schemas.ts`.

8. Update tests from Phase 0 and Phase 3. They should continue to pass and prove order did not change.

### Tests to add or update

#### 4.1 Order preservation test

Assert the exact sequence of `stableToolNames` before and after derivation.

#### 4.2 Descriptor derivation test

Assert:

```ts
agentToolDescriptors.map((descriptor) => descriptor.name)
```

is exactly equal to `stableToolNames` filtered or ordered as currently expected.

If all stable tools are expected in agent descriptors, assert full equality.

#### 4.3 Schema derivation test

Assert:

```ts
Object.keys(stageInterfaceToolInputSchemas)
```

has the same set as `stableToolNames`.

#### 4.4 MCP tool list remains unchanged

In MCP server tests, assert MCP definitions still use the same prefixed tool names and schemas.

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
npm test
```

### Acceptance criteria

- Published stable names are derived from ordered tool definitions.
- Published descriptors are derived from ordered tool definitions.
- Published schemas are derived from ordered tool definitions.
- Compatibility imports still work.
- Stable order unchanged.
- MCP exposed tools unchanged.
- Full test suite passes.

### Do not change

- Do not rename tools.
- Do not change MCP prefix behavior.
- Do not remove compatibility re-export modules yet.

---

## Phase 5 — Make Dispatch Use the Definition Registry as Primary Truth

### Goal

Remove redundant truth checks where possible so dispatch trusts the tool-definition registry rather than first consulting independently maintained stable names.

### Code areas

- `src/stage_interface/dispatch.ts`
- `src/stage_interface/tool_definitions/index.ts`
- tests

### Current issue

Dispatch currently checks `isStableToolName(toolName)` before registry lookup. That check depends on `stableToolNames` as a separate list.

After Phase 4, this is less dangerous because `stableToolNames` is derived from definitions. Still, registry lookup should be enough for known tools.

### Implementation steps

1. In `dispatch.ts`, replace this flow:

   ```text
   isStableToolName -> registry.get -> call
   ```

   with:

   ```text
   registry.get(String(toolName) as ToolName) -> call if found -> tool_not_found if missing
   ```

2. If TypeScript requires a safe cast, isolate it in a helper:

   ```ts
   function lookupToolDefinition(
     registry: Map<ToolName, BoundStageInterfaceToolDefinition>,
     toolName: ToolName | string,
   ): BoundStageInterfaceToolDefinition | undefined {
     return registry.get(String(toolName) as ToolName);
   }
   ```

3. Remove `isStableToolName` only if no longer used.

4. Preserve error message for missing tools as much as possible:

   ```ts
   Tool '${String(toolName)}' is not registered.
   ```

### Tests to add or update

- invalid unknown string still returns `stage_interface.tool_not_found`;
- registered tool still dispatches;
- payload validation still applies after lookup;
- active-instrument availability still applies.

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
npm test
```

### Acceptance criteria

- Dispatch no longer has an independent stable-name gate if registry lookup is sufficient.
- Unknown tool behavior unchanged.
- Valid registered tool behavior unchanged.
- Full tests pass.

### Do not change

- Do not remove `stableToolNames` export; external code and MCP still use it.
- Do not change availability semantics.

---

## Phase 6 — Reduce Handler Cast Risk Gradually

### Goal

After dispatch-level validation exists, reduce reliance on unchecked `readPayload<T>` casts in low-risk tool groups.

### Code areas

- `src/stage_interface/tool_definitions/stage.ts`
- `src/stage_interface/tool_definitions/memory.ts`
- `src/stage_interface/tool_definitions/knowledge.ts`
- tests

### Implementation approach

Do **not** attempt a full rewrite of all tool handlers in one pass. Start with low-risk groups.

Recommended order:

1. stage tools
2. memory tools
3. knowledge tools
4. handbook tools
5. library tools
6. music tools
7. canonical review tools

### Implementation steps

1. For each selected low-risk tool group, identify handlers that only use `readPayload<T>` to merge defaults.

2. Replace with narrower local helper where appropriate:

   ```ts
   function payloadObject(payload: unknown): Record<string, unknown> {
     return typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
   }
   ```

   Or keep `readPayload<T>` if removing it would create noisy changes.

3. Do not remove defaults that are intentionally injected, especially `sessionId`.

4. Add tests only for behavior likely to regress.

### Tests to add or update

For each modified tool group:

- one valid payload dispatch test;
- one invalid payload boundary test if not already covered;
- one default injection test where applicable, e.g. sessionId defaulting.

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/stage_interface/stage-interface.test.js
npm test
```

### Acceptance criteria

- Basic shape validation is owned by dispatch.
- Modified handlers are simpler and do not perform broad unchecked casts for required fields.
- No output behavior changes.
- Full tests pass.

### Do not change

- Do not rewrite complex library/music/canonical-review handlers unless tests are strong enough.
- Do not remove handler defaults that are part of public behavior.
- Do not make payload validation strict yet.

---

## Phase 7 — Decide Whether to Introduce Strict Payload Mode

### Goal

Make an explicit product/architecture decision about unknown keys.

### Current recommendation

Do **not** enable strict mode by default in this refactor wave. First-pass validation should be permissive.

### Decision options

#### Option A — Stay permissive

Keep:

```ts
z.object(definition.inputSchema).passthrough()
```

Benefits:

- fewer breaking changes;
- more tolerant to LLM-generated extra fields;
- easier MCP client compatibility.

Costs:

- unknown keys may continue to hide spelling mistakes.

#### Option B — Per-tool strictness

Extend tool definition:

```ts
payloadMode?: "passthrough" | "strict";
```

Default:

```ts
"passthrough"
```

Enable strict mode only for selected tools.

#### Option C — Global strictness

Not recommended now.

### Tests if Option B is chosen

- a strict test tool or selected real tool rejects extra keys;
- default tools still accept extra keys;
- error code remains `stage_interface.invalid_payload`.

### Validation commands

```bash
npm run typecheck
npm test
```

### Acceptance criteria

- Unknown-key policy is documented.
- Tests lock the chosen policy.
- No accidental global strictness.

### Do not change

- Do not silently switch all tools to strict mode.

---

## Phase 8 — Documentation Update

### Goal

Update architecture docs to reflect that Stage Interface tool definitions now own runtime payload validation and derived tool facts.

### Code/document areas

- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `INDEX.md`
- `PROGRESS.md`
- optional `docs/stage-interface/` plan/progress docs

### Implementation steps

1. Add a short note that Stage Interface tool definitions now own:

   - stable tool names;
   - descriptors;
   - input schemas;
   - availability;
   - dispatch routing;
   - runtime payload validation.

2. Document that MCP remains an adapter consuming Stage Interface definitions.

3. Document that first-pass payload validation is passthrough, not strict.

4. Document that handler simplification is incremental.

### Validation commands

```bash
npm run typecheck
npm test
```

Documentation alone should not affect runtime, but full tests are recommended before finishing the branch.

### Acceptance criteria

- Docs describe the new Stage Interface boundary accurately.
- No docs claim strict validation if implementation is passthrough.
- No docs imply MCP owns tool contracts.

---

## Final Branch Acceptance Checklist

The branch is complete when all of the following are true.

### Runtime behavior

- Invalid payloads fail before handler invocation.
- Invalid payloads use `stage_interface.invalid_payload`.
- Unknown tool names still use `stage_interface.tool_not_found`.
- Availability checks still behave as before.
- Valid payloads still reach handlers.
- `present` transformation behavior is unchanged.
- MCP-exposed tool names remain unchanged.

### Structural behavior

- Tool definitions are the source for runtime validation.
- Stable tool names, descriptors, and schemas are either derived from tool definitions or protected by parity tests.
- Tool fact drift is test-detectable.
- Dispatch does not rely on an independent switch/fallback path.
- Compatibility exports still work.

### Tests

Must pass:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
npm test
```

### Documentation

- Architecture/current-state/progress docs reflect the new boundary.
- Strictness policy is documented.

## Suggested Implementation Order Summary

```text
Phase 0: Baseline and parity tests
Phase 1: Add invalid-payload error code
Phase 2: Dispatch runtime payload validation
Phase 3: Registry/name/schema/descriptor parity tests
Phase 4: Derive names/descriptors/schemas from ordered tool definitions
Phase 5: Make dispatch registry lookup primary
Phase 6: Gradually reduce handler cast risk
Phase 7: Decide strictness policy
Phase 8: Documentation update
```

## Stop Conditions

Stop and reassess if any of these happen:

- MCP tool names change unexpectedly.
- Stable tool order changes unexpectedly.
- A large number of current tests fail due to strict validation.
- Handler behavior changes beyond validation errors.
- Tool definitions require circular imports that are hard to resolve.
- MaterialResolve, PluginRegistry, or provider adapter changes become necessary.

Those indicate the slice is expanding beyond Stage Interface tool contract refactoring and should be narrowed before continuing.
