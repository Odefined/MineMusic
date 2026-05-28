# MineMusic Server Launchd

## Purpose

MineMusic server is intended to run independently from Codex sessions. On this
machine it is installed as a user `launchd` agent, so Codex, OpenClaw, and other
MCP clients connect to an already-running MineMusic server instead of starting
the MineMusic runtime themselves.

```text
launchd
-> MineMusic server
   -> owns Stage Core and runtime env
   -> exposes MCP at http://127.0.0.1:37373/mcp

Codex / OpenClaw / other MCP clients
-> connect to http://127.0.0.1:37373/mcp
```

This is a runtime boundary, not just a startup convenience:

- Stage Core, provider registration, repositories, cache, and session runtime
  dependencies belong to the MineMusic server process.
- Codex and OpenClaw are MCP clients. Their config should contain the server
  URL only.
- Provider, database, cache, and session env must not be moved into Codex MCP
  client config.
- `mcp:minemusic:dev` is only an embedded stdio path for local development and
  tests; it is not the normal Codex/OpenClaw integration path.

## Local Install

Current local `launchd` install:

| Concern | Value |
| --- | --- |
| LaunchAgent label | `com.minemusic.server` |
| LaunchAgent plist | `/Users/jiajuzang/Library/LaunchAgents/com.minemusic.server.plist` |
| Working directory | `/Users/jiajuzang/Documents/Codex/MineMusic` |
| Command | `/opt/homebrew/bin/zsh -lc 'exec /opt/homebrew/bin/npm run server:minemusic'` |
| MCP endpoint | `http://127.0.0.1:37373/mcp` |
| Health endpoint | `http://127.0.0.1:37373/health` |
| Handbook snapshots | `MINEMUSIC_HANDBOOK_PATH` / `MINEMUSIC_HANDBOOK_PATHS` in repo `.env` |
| stdout log | `/Users/jiajuzang/Library/Logs/MineMusic/server.out.log` |
| stderr log | `/Users/jiajuzang/Library/Logs/MineMusic/server.err.log` |

`npm run server:minemusic` loads repo-root `.env` when present. The local `.env`
is ignored by git; `.env.example` is the template for server runtime settings.
`MINEMUSIC_HANDBOOK_PATH` writes one Handbook snapshot. `MINEMUSIC_HANDBOOK_PATHS`
writes multiple snapshots using the platform path delimiter, `:` on macOS.

## Operations

Check server health:

```bash
curl -fsS http://127.0.0.1:37373/health
```

Check the user LaunchAgent:

```bash
launchctl print gui/$(id -u)/com.minemusic.server
```

Restart the server through `launchd`:

```bash
launchctl kickstart -k gui/$(id -u)/com.minemusic.server
```

Reset runtime SQLite state under `/tmp/minemusic` and restart the server:

```bash
./scripts/reset-minemusic-launchd-runtime.sh
```

This wrapper stops the LaunchAgent, removes `/tmp/minemusic`, bootstraps the
agent again, and waits for `http://127.0.0.1:37373/health`.

Stop the server:

```bash
launchctl bootout gui/$(id -u)/com.minemusic.server
```

Start the server after it has been stopped:

```bash
launchctl bootstrap gui/$(id -u) /Users/jiajuzang/Library/LaunchAgents/com.minemusic.server.plist
```

Tail logs:

```bash
tail -f /Users/jiajuzang/Library/Logs/MineMusic/server.out.log
tail -f /Users/jiajuzang/Library/Logs/MineMusic/server.err.log
```

## Codex MCP Client

Codex should be configured as a streamable HTTP MCP client:

```bash
codex mcp get minemusic
```

Expected shape:

```text
minemusic
  enabled: true
  transport: streamable_http
  url: http://127.0.0.1:37373/mcp
```

The global Codex MCP client config mirrors that boundary:

```json
{
  "mcpServers": {
    "minemusic": {
      "url": "http://127.0.0.1:37373/mcp"
    }
  }
}
```

The MineMusic streamable HTTP endpoint is intentionally stateless at the MCP
transport layer. It does not require clients to preserve a server-issued
`mcp-session-id`, and stale client session headers should not block calls after
the launchd-managed server restarts.

Do not replace the global MCP config with a Codex-started `command` entry for
`npm run server:minemusic`. Doing so makes Codex own the MineMusic server
lifecycle again and breaks the intended architecture.

## Troubleshooting

If a new Codex session does not show `minemusic.*` tools:

1. Check the server health endpoint.
2. Check `launchctl print gui/$(id -u)/com.minemusic.server`.
3. Check `codex mcp get minemusic`.
4. Read the server logs under `/Users/jiajuzang/Library/Logs/MineMusic`.

The first start may take several seconds because `npm run server:minemusic`
builds the test output before running `src/server/index.ts`.
