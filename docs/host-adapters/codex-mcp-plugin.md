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

The MCP server prefixes these with `minemusic.` for Codex:

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

The Codex MCP runtime:

- seeds a Stage session with `activeInstruments: []`, which means all current
  MineMusic instruments.
- registers NetEase `source` and `platform_library` providers by default.
- registers agent-facing provider descriptors for NetEase, so
  `minemusic.music` shows NetEase source search/link capability and
  `minemusic.library` shows NetEase library import/update areas. Knowledge
  providers register under `minemusic.knowledge`.
- uses `MINEMUSIC_NETEASE_BASE_URL` for both NetEase provider factories when
  provided.
- uses `MINEMUSIC_CANONICAL_DB_PATH` as an optional SQLite database path for
  durable Canonical Store storage when provided.
- uses `MINEMUSIC_COLLECTION_DB_PATH` as an optional SQLite database path for
  durable Collection storage when provided.
- uses `MINEMUSIC_LIBRARY_IMPORT_DB_PATH` as an optional SQLite database path
  for durable Library Import storage when provided.
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
- the default MCP runtime registers NetEase through separate `source` and
  `platform_library` slots.
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
