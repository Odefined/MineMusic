# Codex MCP Plugin Surface

## Purpose

The Codex MCP plugin exposes MineMusic to Codex as repo-local instruments while
preserving the MineMusic boundary:

```text
Codex app/plugin host
-> MCP server
-> MineMusic Stage Interface
-> Stage Interface dispatch
-> Session Context / Material Gate / Source / Events / Memory / Effects
```

Codex sees MineMusic tools. It does not call provider internals, repositories,
or runtime composition internals directly.

## Current Implementation

| Concern | Location |
| --- | --- |
| MCP server | `src/surfaces/mcp/server.ts` |
| Stage Interface tools | `src/stage_interface/tools.ts` |
| Stage Interface dispatch | `src/stage_interface/dispatch.ts` |
| Instrument catalog | `src/stage_interface/instruments.ts` |
| Host schemas | `src/stage_interface/schemas.ts` |
| Handbook renderer | `src/handbook/index.ts` |
| Plugin manifest | `plugins/minemusic/.codex-plugin/plugin.json` |
| MCP startup config | `plugins/minemusic/.mcp.json` |
| Workflow skill | `plugins/minemusic/skills/minemusic/SKILL.md` |
| Generated skill handbook | `plugins/minemusic/skills/minemusic/HANDBOOK.md` |
| Local marketplace entry | `.agents/plugins/marketplace.json` |

The package script for the MCP server is:

```bash
npm run mcp:minemusic
```

## Instrument Surface

Codex-visible tools are derived from MineMusic instrument descriptors.

Current instruments:

```text
minemusic.handbook
minemusic.mvp
```

Current internal tool names:

```text
handbook.overview.read
handbook.instrument.read
handbook.tool.read
stage.context.read
stage.materials.prepare
music.material.resolve
music.links.refresh
events.record
memory.propose
effects.propose
session.update
```

The MCP server prefixes these with `minemusic.` for Codex:

```text
minemusic.stage.context.read
minemusic.handbook.tool.read
minemusic.stage.materials.prepare
minemusic.music.material.resolve
minemusic.music.links.refresh
minemusic.events.record
minemusic.memory.propose
minemusic.effects.propose
minemusic.session.update
```

## Runtime Shape

The Codex MCP runtime:

- seeds a Stage session with `activeInstruments: ["minemusic.mvp"]`.
- registers the NetEase source provider by default.
- uses `MINEMUSIC_NETEASE_BASE_URL` when provided.
- delegates tool calls through `MineMusicStageInterface`.
- returns MineMusic `Result<T>` payloads as MCP text JSON.

If NetEase is unavailable, material-resolution tools surface structured
MineMusic errors. The MCP wrapper does not invent fallback recommendations.

## Handbook Behavior

`stage.context.read` returns dynamic session context only:

- session state.
- session vibe.
- memory summaries.

Handbook content lives in the `minemusic.handbook` instrument:

- `handbook.overview.read`
- `handbook.instrument.read`
- `handbook.tool.read`

The skill-local `HANDBOOK.md` is generated from the current agent-visible
instrument catalog at runtime startup.

## Instrument Enforcement

Tool Dispatch checks active instrument availability through
`InstrumentCatalogPort`.

Discovery and recovery tools remain available:

- `stage.context.read`
- `handbook.overview.read`
- `handbook.instrument.read`
- `handbook.tool.read`
- `session.update`

Other tools require the current session to expose an instrument containing that
tool.

## Verification

Deterministic tests cover:

- `stage.materials.prepare` is exposed through `minemusic.mvp`.
- Stage Interface dispatch can call `stage.materials.prepare`.
- normal instrument tools are rejected when unavailable for the session.
- MCP tool descriptors are derived from MineMusic descriptors and prefixed with
  `minemusic.`.
- MCP handlers delegate through `MineMusicStageInterface`.
- argument-bearing tools expose explicit input schemas.
- repo-local plugin packaging points at `npm --prefix ... run mcp:minemusic`.

Project-native commands:

```bash
npm test
npm run typecheck
npm run smoke:netease
git diff --check
```

The current Codex app/plugin visibility is user-confirmed host-app state. The
repository evidence remains deterministic packaging/runtime tests plus
active-session MCP tool calls.

## Non-Goals

- playback execution.
- queue mutation.
- playlist writes.
- source writeback.
- durable storage.
- autonomous DJ mode.
- moving recommendation policy into the Codex plugin.

