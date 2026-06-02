> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/host-adapters/codex-skill.md`, `docs/operations/minemusic-server-launchd.md`, `ARCHITECTURE.md`, `CURRENT_STATE.md`
> Use only for: historical evidence of the server/MCP host-boundary correction.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# MineMusic Server MCP Refactor Plan

## Correction

The intended boundary is not "Codex starts MineMusic runtime". The intended
boundary is:

```text
MineMusic server
-> starts independently and stays running
-> creates and holds Stage Core
-> exposes MCP directly over a local endpoint

Codex / OpenClaw
-> MCP clients
-> connect to the MineMusic server endpoint
```

MCP is the common protocol. A Codex-specific adapter is not part of the main
architecture. A stdio bridge would only be a compatibility workaround for an
MCP client that cannot connect to streamable HTTP.

## Retained Work

- Keep the runtime composition factory that creates Stage Core with provider,
  database, cache, and session configuration.
- Keep MCP tool registration as a lightweight surface over an injected Stage
  Interface runtime.
- Keep existing Stage Core, Stage Interface, Knowledge, MusicBrainz, NetEase,
  Collection, and Library Import behavior.

## Reverted Direction

- Do not point Codex at `service:minemusic`.
- Do not make Codex start the MineMusic runtime.
- Do not put provider, database, cache, or session runtime env in Codex
  config.
- Do not describe MCP as a Codex-only adapter.

## Target Tasks

1. Rename the runtime boundary to MineMusic server.
2. Add a server entrypoint that starts once, holds Stage Core, and exposes
   `minemusic.*` MCP tools over streamable HTTP.
3. Point host MCP client config at the default server URL
   `http://127.0.0.1:37373/mcp`.
4. Keep `mcp:minemusic:dev` only as an embedded stdio dev/test path.
5. Update tests so packaging proves the plugin connects by URL and server tests
   prove MCP calls route through the server-held Stage Interface.
6. Update architecture and state docs to say MineMusic server, not a
   service-owned Codex adapter.

## Verification

- `npm test`
- `codex mcp get minemusic` should show a URL transport for
  `http://127.0.0.1:37373/mcp`.
- With `npm run server:minemusic` running, Codex/OpenClaw should connect as MCP
  clients without starting MineMusic runtime composition themselves.
