# Wave 8 Codex Instruments Plugin Design

## Goal

Wave 8 connects MineMusic to Codex as a repo-local Codex plugin through an MCP
server while preserving the MineMusic boundary:

```text
Codex plugin
-> MineMusic instrument
-> Tool Dispatch
-> Stage Kernel / Source / Events / Memory / Effects
```

Codex must see `minemusic.mvp` as an instrument, not as a loose list of
runtime internals. The plugin surface is a host adapter only; it does not own
recommendation policy, provider logic, playback, or durable storage.

## Current Repository Evidence

- `src/instruments/index.ts` defines `minemusic.mvp` and `ToolDescriptor`
  entries.
- `src/stage/index.ts` compiles a dynamic `Handbook` with available instruments,
  rules, permission boundaries, memory summaries, and provider guidance.
- `src/tool_api/index.ts` exposes `MineMusicToolApi` as a stable wrapper around
  `ToolDispatchPort`.
- `src/runtime/index.ts` composes Stage Kernel, Instrument Catalog, Tool
  Dispatch, Tool API, Source Resolution, repositories, and provider slots.
- `src/app/index.ts` currently calls `runtime.stage.prepareMaterials(...)`
  directly after grounding, which means material preparation is not yet a
  Codex-visible instrument tool.
- `src/providers/netease/index.ts` already validates live source access through
  the provider slot.

## Design Decision

Codex-visible capabilities should be derived from MineMusic instruments.

In human terms:

- an instrument is a toolbox for a mode of work.
- a tool is one button inside that toolbox.
- the Handbook is the current session's instruction sheet for using the toolbox.

For Wave 8, the only instrument is:

```text
minemusic.mvp
```

It contains the current MVP tools plus a new Stage Kernel tool:

```text
stage.context.read
stage.materials.prepare
music.material.ground
music.links.refresh
events.record
memory.propose
effects.propose
session.update
```

`stage.context.read` must remain the first recommended call because it returns
the dynamic Handbook and available instruments. `stage.materials.prepare` must
be tool-visible so Codex does not present raw source results without Stage
Kernel gating.

## Codex Plugin Shape

The repo-local plugin lives under:

```text
plugins/minemusic/
```

It contains:

- `.codex-plugin/plugin.json` for Codex plugin metadata.
- `.mcp.json` for MCP server startup.

The MCP server lives at:

```text
src/surfaces/mcp/server.ts
```

The package scripts expose:

```text
npm run mcp:minemusic
```

The MCP server should use the official TypeScript MCP SDK declared in
`package.json`, not an undeclared dependency from `node_modules`.

## Runtime Shape

The MCP server creates an explicit MineMusic runtime for Codex use. It should:

- seed one Stage session with `activeInstruments: ["minemusic.mvp"]`.
- register the NetEase source provider by default.
- use the current NetEase default endpoint `http://127.0.0.1:3000`, with
  override through `MINEMUSIC_NETEASE_BASE_URL`.
- keep fixture runtime paths available for existing tests.
- avoid autoplay, queue mutation, source writeback, and host-specific policy.

If the NetEase service is unavailable, grounding tools return normal
MineMusic `Result<T>` errors. The MCP wrapper should surface those errors as
structured JSON text without inventing fallback recommendations.

## Instrument Enforcement

The current Instrument Catalog reports available tools, but Tool Dispatch does
not enforce that the session has the instrument enabled.

Wave 8 should add a small enforcement boundary:

- `stage.context.read` remains available so Codex can discover Handbook and
  instruments.
- `session.update` remains available so session state can recover.
- other instrument tools require the current session to expose an instrument
  containing that tool.

This keeps Handbook and instruments meaningful as runtime boundaries, not only
documentation.

## MCP Tool Naming

MCP tool names should stay close to the existing MineMusic tool names while
making the MineMusic namespace explicit:

```text
minemusic.stage.context.read
minemusic.stage.materials.prepare
minemusic.music.material.ground
minemusic.music.links.refresh
minemusic.events.record
minemusic.memory.propose
minemusic.effects.propose
minemusic.session.update
```

Internally, the wrapper strips the `minemusic.` prefix and calls the existing
`ToolDispatchPort` through `MineMusicToolApi`.

## Testing Strategy

Wave 8 needs deterministic tests for:

1. `stage.materials.prepare` is listed in `minemusic.mvp`.
2. `stage.materials.prepare` can be called through Tool Dispatch and Tool API.
3. Tool Dispatch rejects non-discovery instrument tools when no current
   instrument exposes them.
4. MCP tool descriptors are derived from the instrument descriptors and include
   the `minemusic.` prefix.
5. MCP tool calls return text JSON that includes MineMusic `Result<T>` payloads.
6. Plugin packaging files point at the repo-local MCP command.

Live NetEase smoke remains opt-in:

```bash
MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease
```

MCP tests should not require a live Codex app session.

## Non-Goals

- OpenClaw integration.
- playback execution.
- queue mutation.
- playlist writes.
- source writeback.
- durable storage.
- autonomous DJ mode.
- moving recommendation policy into the Codex plugin.

## Acceptance Criteria

- Codex plugin packaging exists under `plugins/minemusic`.
- The MCP server registers tools from MineMusic instrument descriptors.
- `stage.context.read` returns Handbook and available instruments.
- `stage.materials.prepare` is Codex-visible and applies Stage Kernel gating.
- Tool Dispatch enforces active instrument availability for normal tool calls.
- MCP wrappers call Tool API / Tool Dispatch, not provider or runtime internals.
- Normal tests pass.
- Default and explicit NetEase smoke results are documented.
- State docs no longer claim Wave 7 is the current branch after merge.

## Spec Self-Review

- Placeholder scan: no undefined implementation target remains.
- Scope check: one host-surface slice only; no OpenClaw, playback, or storage.
- Boundary check: Codex sees instruments and MCP tools, not runtime internals.
- Verification check: deterministic MCP/instrument tests are separated from
  live NetEase smoke.
