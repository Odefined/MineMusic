# Codex MCP Plugin Surface

## Purpose

The Codex MCP plugin lets Codex discover and connect to the MineMusic MCP
server. MCP is the shared protocol surface for Codex, OpenClaw, and other MCP
clients; Codex does not need a MineMusic-specific runtime adapter.

```text
Codex / OpenClaw MCP clients
-> MineMusic server process
   -> MCP streamable HTTP surface
   -> MineMusic Stage Interface
   -> Stage Interface dispatch
   -> Session Context / Material Gate / Source / Events / Memory / Effects
```

Codex sees MineMusic tools. It does not call provider internals, repositories,
or runtime composition internals directly. The Codex plugin should not own
provider, database, cache, or session runtime configuration; those belong to the
long-lived MineMusic server process that creates and holds Stage Core.

## Current Implementation

The current repository implementation has a MineMusic server startup path that
creates and holds Stage Core, then exposes MCP over local streamable HTTP:

```text
MineMusic server entrypoint
-> creates and holds Stage Core
-> exposes minemusic.* MCP tools at /mcp
```

The Codex MCP plugin points at the server URL. It does not start the server
process and does not carry provider, database, cache, or session runtime
configuration. On this machine the server process is kept alive by the user
LaunchAgent `com.minemusic.server`; the operational details live in
`docs/operations/minemusic-server-launchd.md`. The embedded stdio MCP startup
path still exists only as an explicitly named dev/test command.

| Concern | Location |
| --- | --- |
| MCP surface | `src/surfaces/mcp/server.ts` |
| Server runtime | `src/server/runtime.ts` |
| Server entrypoint | `src/server/index.ts` |
| Stage Interface tools | `src/stage_interface/tools.ts` |
| Stage Interface dispatch | `src/stage_interface/dispatch.ts` |
| Instrument catalog | `src/stage_interface/instruments.ts` |
| Host schemas | `src/stage_interface/schemas.ts` |
| Handbook renderer | `src/handbook/index.ts` |
| Plugin manifest | `plugins/minemusic/.codex-plugin/plugin.json` |
| MCP client config | `plugins/minemusic/.mcp.json` |
| Workflow skill | `plugins/minemusic/skills/minemusic/SKILL.md` |
| Generated skill handbook | `plugins/minemusic/skills/minemusic/HANDBOOK.md` |
| Local marketplace entry | `.agents/plugins/marketplace.json` |

The server package script is:

```bash
npm run server:minemusic
```

Normal Codex/OpenClaw use should not run that script from MCP client config.
The server is expected to be already running through `launchd` and reachable at
`http://127.0.0.1:37373/mcp`.

The embedded MCP startup path is retained for local dev/test use:

```bash
npm run mcp:minemusic:dev
```

## Instrument Surface

Codex-visible tools are derived from MineMusic instrument descriptors.

Current instruments:

```text
minemusic.handbook
minemusic.stage
minemusic.knowledge
minemusic.music
minemusic.library
minemusic.memory
```

Current internal tool names:

```text
handbook.overview.read
handbook.instrument.read
handbook.tool.read
stage.context.read
stage.materials.prepare
stage.session.update
stage.events.record
stage.effects.propose
knowledge.query
music.material.resolve
music.links.refresh
music.collection.save
music.collection.unsave
music.collection.favorite
music.collection.unfavorite
music.collection.block
music.collection.unblock
music.collection.item.add
music.collection.item.remove
music.collection.create
music.collection.update
music.collection.delete
music.collection.list
library.import.preview
library.import.start
library.update.preview
library.update.start
library.import.status
library.import.summary
memory.propose
```

The MCP surface prefixes these with `minemusic.` for MCP clients:

```text
minemusic.stage.context.read
minemusic.handbook.tool.read
minemusic.stage.materials.prepare
minemusic.stage.session.update
minemusic.stage.events.record
minemusic.stage.effects.propose
minemusic.knowledge.query
minemusic.music.material.resolve
minemusic.music.links.refresh
minemusic.music.collection.save
minemusic.music.collection.list
minemusic.library.import.preview
minemusic.library.update.start
minemusic.library.import.status
minemusic.library.import.summary
minemusic.memory.propose
```

## Runtime Shape

The MineMusic server runtime:

- seeds a Stage session with `activeInstruments: []`, which means all current
  MineMusic instruments.
- registers NetEase `source` and `platform_library` providers by default.
- registers the bundled MusicBrainz Knowledge provider by default when no
  explicit Knowledge providers or factories are supplied.
- registers agent-facing provider descriptors for NetEase and MusicBrainz, so
  `minemusic.music` shows NetEase source search/link capability and
  `minemusic.library` shows NetEase library import/update areas, while
  `minemusic.knowledge` shows MusicBrainz Knowledge capability.
- uses `MINEMUSIC_NETEASE_BASE_URL` for both NetEase provider factories when
  provided.
- uses `MINEMUSIC_CANONICAL_DB_PATH` as an optional SQLite database path for
  durable Canonical Store storage when provided.
- uses `MINEMUSIC_COLLECTION_DB_PATH` as an optional SQLite database path for
  durable Collection storage when provided.
- uses `MINEMUSIC_LIBRARY_IMPORT_DB_PATH` as an optional SQLite database path
  for durable Library Import storage when provided.

The MCP surface:

- registers MCP tool names and schemas derived from Stage Interface metadata.
- delegates tool calls through `MineMusicStageInterface`.
- returns MineMusic `Result<T>` payloads as MCP text JSON.

The Codex plugin config points at `http://127.0.0.1:37373/mcp` by default. It
does not start a MineMusic process and does not carry provider, database,
cache, or session runtime ownership.
For this local installation, that URL is served by the user `launchd` job
`com.minemusic.server`; see `docs/operations/minemusic-server-launchd.md` for
status, restart, logs, and troubleshooting commands.

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

Provider capability notes are rendered from `InstrumentDescriptor.providers`.
They describe installed platform/source capabilities, operations, authentication
requirements, and readable/unsupported areas. Handbook generation does not call
provider preview/read APIs; live counts and samples still come from
`library.import.preview`.

## Instrument Enforcement

Tool Dispatch checks active instrument availability through
`InstrumentCatalogPort`.

Discovery and recovery tools remain available:

- `stage.context.read`
- `handbook.overview.read`
- `handbook.instrument.read`
- `handbook.tool.read`
- `stage.session.update`

Other tools require the current session to expose an instrument containing that
tool.

## Verification

Deterministic tests cover:

- Stage, music, library, and memory tools are exposed through separate
  instrument descriptors.
- Stage Interface dispatch can call `stage.materials.prepare`.
- normal instrument tools are rejected when unavailable for the session.
- MCP tool descriptors are derived from MineMusic descriptors and prefixed with
  `minemusic.`.
- MCP handlers delegate through `MineMusicStageInterface`.
- argument-bearing tools expose explicit input schemas.
- the server runtime registers NetEase through separate
  `source` and `platform_library` slots.
- repo-local plugin packaging points at the MineMusic MCP server URL and does
  not define a stdio startup command.
- the embedded MCP startup path is named `mcp:minemusic:dev`.

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
- moving Stage Core ownership or provider/database/cache/session runtime
  configuration into the Codex plugin.
