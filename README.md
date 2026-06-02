# MineMusic

MineMusic is a music stage for an LLM music partner, secretary, and agent.

The LLM owns musical interpretation, conversation, and the final recommendation.
MineMusic owns grounding, identity anchors, source-backed links, material
states, event records, memory proposals, effect boundaries, callable
instruments, provider slots, and runtime lifecycle.

## Start Here

- `INDEX.md`: current documentation map.
- `ARCHITECTURE.md`: global architecture authority.
- `CURRENT_STATE.md`: current implementation summary.
- `CONTEXT.md`: project vocabulary.
- `PROGRESS.md`: project-level milestone index.
- `docs/maintenance/documentation-alignment-audit.md`: documentation sweep
  disposition ledger.
- `docs/maintenance/architecture-inconsistency-log.md`: open architecture
  inconsistency ledger.

Historical MVP proposal, MVP baseline docs, root plans, Stage Core refactor
plans, and architecture review evidence are archived under `docs/archive/`.

## Current Runtime

MineMusic runs as a long-lived server process that creates and holds Stage Core,
then exposes Stage Interface tools over MCP.

```text
Host clients
  -> MineMusic server
  -> Stage Core
  -> Stage Interface
  -> Core Capabilities
  -> Plugin Slots / Storage
```

On this machine the server is installed as user `launchd` agent
`com.minemusic.server` and exposes MCP at:

```text
http://127.0.0.1:37373/mcp
```

Codex and OpenClaw should connect as MCP clients. Provider/database/cache/session
runtime settings belong to the MineMusic server, not to host-client config.
Operational details live in `docs/operations/minemusic-server-launchd.md`.

## Development Commands

```bash
npm test
npm run typecheck
npm run server:minemusic
npm run mcp:minemusic:dev
npm run smoke:netease
```

`npm run smoke:netease` skips unless `MINEMUSIC_LIVE_NETEASE=1` is set.

`npm run server:minemusic` loads repo-root `.env` when present. Use
`.env.example` for local runtime settings. Common settings include:

- `MINEMUSIC_NETEASE_BASE_URL`
- `MINEMUSIC_MATERIAL_STORE_DB_PATH`
- `MINEMUSIC_COLLECTION_DB_PATH`
- `MINEMUSIC_LIBRARY_IMPORT_DB_PATH`
- `MINEMUSIC_HANDBOOK_PATH`
- `MINEMUSIC_HANDBOOK_PATHS`

For local launchd restart:

```bash
./scripts/reset-minemusic-launchd-runtime.sh
```

Use `--clear-runtime` to clear `/tmp/minemusic` state during restart.

## Non-Goals

MineMusic does not implement autoplay, queue mutation, source writeback,
playlist mutation, autonomous DJ sessions, or final musical judgment.
