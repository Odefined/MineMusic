# Wave 8 Codex Instruments Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose MineMusic to Codex as a repo-local MCP plugin whose public surface is `minemusic.handbook`, `minemusic.mvp`, and their Stage-governed tools.

**Architecture:** Codex talks to an MCP server under `src/surfaces/mcp/server.ts`. The MCP server registers tools derived from MineMusic instrument descriptors, prefixes them with `minemusic.`, and delegates to `MineMusicToolApi` / `ToolDispatchPort`. Stage Kernel remains first-class through `stage.context.read` and the new `stage.materials.prepare` tool. Handbook overview and exact tool docs are generated from the instrument catalog into the MineMusic skill's `HANDBOOK.md` and exposed through `handbook.overview.read`, `handbook.instrument.read`, and `handbook.tool.read`.

**Tech Stack:** TypeScript ES modules, `@modelcontextprotocol/sdk`, `zod`, existing MineMusic contracts/ports/runtime, repo-local Codex plugin manifest files.

---

## File Structure

- Modify `src/contracts/index.ts` to add `stage.materials.prepare`.
- Modify `src/instruments/index.ts` to list, dispatch, and enforce instrument tools.
- Modify `src/app/index.ts` to use tool-visible `stage.materials.prepare`.
- Modify `src/runtime/index.ts` to support an explicit source provider runtime for Codex.
- Create `src/surfaces/mcp/server.ts` for the MCP server and tool registration helpers.
- Create `test/instruments/instrument-registry.test.ts` additions for `stage.materials.prepare` and enforcement.
- Create `test/surfaces/mcp-server.test.ts` for MCP tool descriptor and call behavior.
- Create `test/plugins/plugin-packaging.test.ts` for repo-local plugin config.
- Create `plugins/minemusic/.codex-plugin/plugin.json`.
- Create `plugins/minemusic/.mcp.json`.
- Create or update `.agents/plugins/marketplace.json`.
- Modify `package.json` to add MCP dependencies and `mcp:minemusic`.
- Modify `test/run-runtime-tests.ts` to include MCP surface tests.
- Update `CURRENT_STATE.md`, `PROGRESS.md`, `INDEX.md`, `README.md`, and `docs/mvp/verification-report.md`.

## Task 1: Stage Materials Tool And Instrument Enforcement

**Files:**
- Modify: `src/contracts/index.ts`
- Modify: `src/instruments/index.ts`
- Modify: `src/app/index.ts`
- Test: `test/instruments/instrument-registry.test.ts`

- [x] **Step 1: Write failing tests**

Add tests that assert:

```typescript
stableToolNames.includes("stage.materials.prepare")
```

and that `createToolDispatch(...).call({ toolName: "stage.materials.prepare", ... })` returns materials prepared by Stage Kernel. Add a second test where the session has `activeInstruments: ["other.instrument"]` and calling `music.material.ground` returns `instrument.tool_not_found`.

- [x] **Step 2: Run RED**

Run:

```bash
npm run build:test
```

Expected: failure because `stage.materials.prepare` is not yet a `ToolName`.

- [x] **Step 3: Implement minimal code**

Add `stage.materials.prepare` to `ToolName`, `stableToolNames`, `toolDescriptors`, and `createToolDispatch(...)`. For non-discovery tools, check `InstrumentCatalogPort` availability before dispatch. Allow `stage.context.read`, `handbook.*` lookup tools, and `session.update` without instrument enforcement.

- [x] **Step 4: Run GREEN**

Run:

```bash
npm test
```

Expected: all deterministic tests pass.

## Task 2: Runtime Factory For Codex MCP

**Files:**
- Modify: `src/runtime/index.ts`
- Test: `test/surfaces/mcp-server.test.ts`

- [x] **Step 1: Write failing runtime test**

Add a test helper expectation that a Codex runtime can be created with the NetEase source provider without requiring fixture source materials.

- [x] **Step 2: Run RED**

Run:

```bash
npm run build:test
```

Expected: failure because the helper does not exist.

- [x] **Step 3: Implement runtime helper**

Add `createMineMusicRuntimeWithSourceProvider(...)` or equivalent. It should share the existing composition path, seed optional canonical records, and register the supplied source provider.

- [x] **Step 4: Run GREEN**

Run:

```bash
npm test
```

Expected: all deterministic tests pass.

## Task 3: MCP Server Tool Registration

**Files:**
- Create: `src/surfaces/mcp/server.ts`
- Modify: `package.json`
- Test: `test/surfaces/mcp-server.test.ts`
- Modify: `test/run-runtime-tests.ts`

- [x] **Step 1: Add explicit dependencies**

Add:

```json
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.29.0",
  "zod": "^3.25.76"
}
```

and add:

```json
"mcp:minemusic": "npm run build:test && node .tmp-test/src/surfaces/mcp/server.js"
```

- [x] **Step 2: Write failing MCP tests**

Tests should assert:

- `createMineMusicMcpToolDefinitions(...)` returns names prefixed with `minemusic.`.
- `minemusic.stage.context.read` returns JSON text containing dynamic session context without Handbook content or file references.
- `minemusic.handbook.tool.read` returns JSON text containing the requested generated tool entry.
- `minemusic.stage.materials.prepare` delegates through Tool API and returns gated material.

- [x] **Step 3: Run RED**

Run:

```bash
npm run build:test
```

Expected: failure because `src/surfaces/mcp/server.ts` does not exist.

- [x] **Step 4: Implement MCP server**

Use `McpServer`, `StdioServerTransport`, and `zod`. Export pure helper functions for tests:

```typescript
createMineMusicMcpToolDefinitions(runtime)
createMineMusicMcpServer(runtime)
runMineMusicMcpServer()
```

MCP handlers return:

```typescript
{
  content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
}
```

- [x] **Step 5: Run GREEN**

Run:

```bash
npm test
```

Expected: all deterministic tests pass.

## Task 4: Repo-Local Codex Plugin Packaging

**Files:**
- Create: `plugins/minemusic/.codex-plugin/plugin.json`
- Create: `plugins/minemusic/.mcp.json`
- Create or modify: `.agents/plugins/marketplace.json`
- Test: `test/plugins/plugin-packaging.test.ts`

- [x] **Step 1: Write failing packaging test**

Add a test that reads the plugin manifest, MCP config, and marketplace file and asserts:

- manifest name is `minemusic`.
- manifest points `mcpServers` to `./.mcp.json`.
- MCP config contains a `minemusic` server with command `npm` and args including `run` and `mcp:minemusic`.
- marketplace contains a local `./plugins/minemusic` entry.

- [x] **Step 2: Run RED**

Run:

```bash
npm run build:test
```

Expected: failure because the marketplace file does not exist and scaffold
manifest placeholders are not acceptable.

- [x] **Step 3: Create plugin files**

Create the repo-local plugin files with concrete metadata. The plugin is local and requires no external authentication.

- [x] **Step 4: Run GREEN**

Run:

```bash
npm test
```

Expected: all deterministic tests pass.

## Task 5: Documentation, State Sync, And Final Verification

**Files:**
- Modify: `CURRENT_STATE.md`
- Modify: `PROGRESS.md`
- Modify: `INDEX.md`
- Modify: `README.md`
- Modify: `docs/mvp/verification-report.md`

- [x] **Step 1: Update docs**

Record Wave 8 as a Codex MCP plugin surface. State that Codex sees MineMusic instruments, not runtime internals. Also record that live Codex session visibility is not claimed unless tested in a fresh Codex plugin session.

- [x] **Step 2: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run smoke:netease
MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease
git diff --check
git diff --name-only
```

Expected: deterministic checks pass, default smoke skips, live smoke passes if local NetEase remains reachable on port 3000, and diff includes only Wave 8 files.

- [x] **Step 3: Commit implementation**

Commit the implementation:

```bash
git add package.json src/contracts/index.ts src/instruments/index.ts src/app/index.ts src/runtime/index.ts src/surfaces/mcp/server.ts test/instruments/instrument-registry.test.ts test/surfaces/mcp-server.test.ts test/run-runtime-tests.ts plugins/minemusic/.codex-plugin/plugin.json plugins/minemusic/.mcp.json .agents/plugins/marketplace.json CURRENT_STATE.md PROGRESS.md INDEX.md README.md docs/mvp/verification-report.md
git commit -m "Add Codex MCP instrument plugin"
```

## Self-Review

- Spec coverage: covers Stage Kernel, Handbook, instruments, MCP plugin packaging, and verification.
- Placeholder scan: no undefined target remains.
- Type consistency: uses existing `ToolName`, `ToolDescriptor`, `MineMusicRuntime`, and `MineMusicToolApi`.
- Scope check: no OpenClaw, playback execution, queue mutation, or durable storage.
