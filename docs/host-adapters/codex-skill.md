# Codex Skill Surface

## Purpose

Codex uses MineMusic through two separate surfaces:

- a normal Codex skill at `skills/minemusic`, which gives agents the MineMusic
  workflow.
- a global Codex MCP client entry named `minemusic`, which connects to the
  long-lived MineMusic server at `http://127.0.0.1:37373/mcp`.

Codex no longer needs a repo-local MineMusic plugin package. The old
`plugins/minemusic/.codex-plugin/plugin.json`, plugin-local `.mcp.json`, and
local marketplace entry have been removed.

```text
Codex skill
-> tells the agent how to use MineMusic
-> calls globally configured minemusic.* MCP tools

Codex global MCP client
-> connects to http://127.0.0.1:37373/mcp

MineMusic server
-> owns Stage Core and runtime env
-> exposes minemusic.* MCP tools
```

## Ownership

The Codex skill owns:

- workflow instructions for music requests.
- when to read dynamic session context.
- when to call Handbook lookup tools.
- how to choose agent-side music candidates before material resolution.
- when to call Material Gate before presenting links.

The Codex skill does not own:

- MineMusic server startup.
- MCP server registration.
- provider, database, cache, or session runtime env.
- Stage Core composition.
- provider internals, repositories, or core capability calls.

## Current Files

| Concern | Location |
| --- | --- |
| Codex workflow skill | `skills/minemusic/SKILL.md` |
| Skill-local Handbook snapshot | `skills/minemusic/HANDBOOK.md` |
| MCP surface | `src/surfaces/mcp/server.ts` |
| Server runtime | `src/server/runtime.ts` |
| Server entrypoint | `src/server/index.ts` |
| Stage Core | `src/stage_core/index.ts` |
| Stage Interface tools | `src/stage_interface/index.ts` |
| Stage Interface dispatch | `src/stage_interface/dispatch.ts` |
| Instrument catalog | `src/stage_interface/instruments.ts` |
| Handbook renderer | `src/handbook/index.ts` |

## Runtime Boundary

The MineMusic server runtime:

- creates and holds Stage Core.
- registers NetEase `source` and `platform_library` providers by default.
- registers the bundled MusicBrainz Knowledge provider by default when no
  explicit Knowledge providers or factories are supplied.
- applies provider/database/cache/session settings from server runtime env.
- exposes MCP over streamable HTTP at `http://127.0.0.1:37373/mcp` by default.

The Codex MCP client config is global host-app state, not repo-local plugin
packaging. Expected local shape:

```text
minemusic
  enabled: true
  transport: streamable_http
  url: http://127.0.0.1:37373/mcp
```

Normal Codex/OpenClaw use should not run `npm run server:minemusic` from MCP
client config. The server is expected to be already running through `launchd`;
see `docs/operations/minemusic-server-launchd.md`.

The embedded MCP startup path is retained only for local development and tests:

```bash
npm run mcp:minemusic:dev
```

## Handbook

The live Handbook is exposed through MCP:

- `minemusic.handbook.overview.read`
- `minemusic.handbook.instrument.read({ instrumentId })`
- `minemusic.handbook.tool.read({ toolName })`

Lookup keys are not interchangeable:

- `instrumentId` must be an instrument id such as `minemusic.library` or
  `minemusic.music`.
- `toolName` must be an exact tool name such as `music.material.query` or
  `music.material.resolve`.

If a caller needs the current input/output contract for one operation, prefer
`handbook.tool.read({ toolName })` instead of trying to look up a tool through
`instrument.read`.

The file `skills/minemusic/HANDBOOK.md` is a skill-local snapshot used for
progressive disclosure when the skill loads. Stage Core must not default to
writing into the Codex skill path. Stage Core accepts an optional `handbookPath`
or `handbookPaths` when a caller explicitly wants generated Handbook files for
tests, exports, or packaging.

The MineMusic server may be configured to write snapshots by setting
`MINEMUSIC_HANDBOOK_PATH` or `MINEMUSIC_HANDBOOK_PATHS` in server env. Those env
paths are server-owned output configuration and can point at a Codex skill,
OpenClaw docs, or any other consumer snapshot. They are not Codex skill runtime
configuration.

## Verification

Deterministic tests cover:

- the repo ships `skills/minemusic/SKILL.md` and
  `skills/minemusic/HANDBOOK.md`.
- the repo no longer ships Codex plugin packaging for MineMusic.
- Stage Core does not depend on `skills/minemusic` or `plugins/minemusic`.
- MCP tool descriptors are derived from MineMusic descriptors and prefixed with
  `minemusic.`.
- MCP handlers delegate through `MineMusicStageInterface`.
- argument-bearing tools expose explicit input schemas.
- the server runtime registers NetEase through separate `source` and
  `platform_library` slots.
- the server runtime can write Handbook snapshots to multiple env-configured
  paths.
- the embedded MCP startup path is named `mcp:minemusic:dev`.

Project-native commands:

```bash
npm test
npm run typecheck
git diff --check
```

## Non-Goals

- playback execution.
- queue mutation.
- playlist writes.
- source writeback.
- autonomous DJ mode.
- moving recommendation policy into the Codex skill.
- moving Stage Core ownership or provider/database/cache/session runtime
  configuration into the Codex skill.
