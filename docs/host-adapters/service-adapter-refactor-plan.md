# MineMusic Service And Adapter Refactor Plan

## Status

Implementation plan.

## Goal

Move MineMusic runtime ownership out of the repo-local Codex MCP plugin startup
path and into a long-lived MineMusic service process.

Target shape:

```text
MineMusic service / daemon
-> creates and holds one Stage Core runtime
-> owns provider, repository, cache, and session runtime configuration
-> exposes adapter surfaces:
   -> MCP adapter for Codex, OpenClaw, and other MCP clients
   -> CLI adapter
   -> Web UI adapter
   -> future adapters
```

MCP is an adapter surface over the service-held Stage Core. It is not the whole
service boundary and should not own Stage Core composition.

## Pre-Refactor Problem

Before this refactor, the repo-local MCP startup path combined three
responsibilities:

```text
Codex plugin .mcp.json
-> starts src/surfaces/mcp/server.ts
-> server creates the default Stage Core
-> server reads provider/database/cache/session runtime settings
-> MCP handlers call MineMusicStageInterface tools
```

That made the first Codex integration easy to verify, but it gives the Codex
plugin runtime ownership that should belong to the MineMusic service.

## Scope

In scope:

- introduce a long-lived MineMusic service runtime boundary.
- move default provider, database, cache, and session configuration out of the
  Codex MCP adapter path.
- keep Stage Core as the only runtime composition owner.
- keep Stage Interface as the shared callable surface for adapters.
- keep MCP tool names, schemas, and Handbook behavior stable.
- make MCP one service adapter surface usable by Codex, OpenClaw, and other MCP
  clients.
- keep room for CLI and Web UI as peer adapters.
- update plugin packaging so it points at an MCP adapter or thin bridge without
  implying runtime ownership.

Out of scope:

- replacing Stage Core, Stage Interface, Knowledge, MusicBrainz, NetEase,
  Collection, or Library Import behavior.
- introducing a private `callTool` HTTP API that duplicates MCP.
- implementing CLI or Web UI feature depth beyond the service boundary needed
  to keep them as peer adapters.
- changing `minemusic.*` tool names.
- moving recommendation judgment into MineMusic.

## Architecture Decisions

- MineMusic service owns process lifecycle and creates one Stage Core runtime.
- Stage Core continues to own module composition, provider registration,
  repository/cache/session dependencies, Stage Interface, and ports.
- MCP adapter registers MCP tools and delegates to the service-held Stage
  Interface.
- CLI and Web UI adapters should call the same service-held Stage Interface,
  not route through MCP unless a specific deployment chooses that transport.
- Codex plugin configuration should contain host connection details only, such
  as an MCP endpoint or bridge command.
- Provider, database, cache, and default-session configuration belongs to
  service startup.
- A temporary embedded MCP runtime is acceptable only as a clearly named
  dev/test compatibility path and must not be the default plugin path.

## Proposed Code Boundaries

| Concern | Proposed owner |
| --- | --- |
| service runtime config parsing | `src/service/config.ts` or equivalent |
| service runtime creation | `src/service/index.ts` or `src/service/runtime.ts` |
| service process entrypoint | `src/service/server.ts` or `src/minemusicd/**` |
| MCP adapter registration | `src/surfaces/mcp/server.ts` |
| optional stdio bridge | `src/surfaces/mcp/stdio-bridge.ts` |
| future CLI adapter | `src/surfaces/cli/**` |
| future Web UI adapter | `src/surfaces/web/**` |
| Codex plugin packaging | `plugins/minemusic/**` |

Exact names may change during implementation, but the ownership boundaries
should not.

## Migration Phases

### Phase 1: Extract Service Runtime Boundary

Goal: make the MineMusic runtime constructible outside MCP without changing
tool behavior.

Tasks:

- Add a `MineMusicServiceRuntime` type that contains:
  - `ready`.
  - the composed `MineMusicStageCore`.
  - the service-held `MineMusicStageInterface`.
  - adapter startup hooks or adapter dependencies.
- Move default runtime configuration currently in the MCP surface into service
  startup code:
  - session defaults.
  - NetEase source and platform-library provider factories.
  - MusicBrainz Knowledge provider factory.
  - Canonical Store database path.
  - Collection database path.
  - Library Import database path.
  - Provider HTTP Cache database path.
- Keep Stage Core factory options unchanged unless a small adapter-neutral
  option is required.

Files likely touched:

- `src/service/**`
- `src/stage_core/index.ts`
- `src/surfaces/mcp/server.ts`
- `test/integration/**`
- `test/surfaces/mcp-server.test.ts`

Verification:

- service runtime test proves one Stage Core is created and `ready` resolves.
- service runtime test proves Knowledge/MusicBrainz registration still happens
  in the service-held Stage Core.
- existing Stage Interface and integration tests still pass.

Exit criteria:

- MCP code no longer needs to parse provider/database/cache/session env to
  construct the default MineMusic runtime.

### Phase 2: Make MCP A Service Adapter

Goal: make MCP registration depend on a service-held Stage Interface, not on MCP
creating Stage Core.

Tasks:

- Refactor MCP creation into an adapter factory that receives the service-held
  runtime or Stage Interface dependencies.
- Keep tool names prefixed as `minemusic.*`.
- Keep schemas derived from `stageInterfaceToolInputSchemas`.
- Keep handlers delegating through `MineMusicStageInterface`.
- Ensure Handbook tools still read generated/runtime Handbook content through
  Stage Interface behavior.
- Rename default MCP runtime helpers so any embedded behavior is visibly
  transitional.

Files likely touched:

- `src/surfaces/mcp/server.ts`
- `src/stage_interface/**`
- `src/handbook/index.ts`
- `test/surfaces/mcp-server.test.ts`

Verification:

- MCP definitions expose every stable tool.
- argument-bearing schemas remain unchanged.
- handler tests prove calls route to the injected service-held Stage Interface.
- no MCP unit test needs provider/db/cache env to prove adapter registration.

Exit criteria:

- `src/surfaces/mcp/server.ts` can be read as an MCP adapter surface, not as the
  MineMusic runtime composition entrypoint.

### Phase 3: Add Long-Lived Service Entrypoint

Goal: provide the process that starts once, holds Stage Core, and starts
adapter surfaces.

Tasks:

- Add a service entrypoint script for the MineMusic service / daemon.
- Start Stage Core once during service startup.
- Start the MCP adapter from the service-held runtime.
- Leave room for CLI and Web UI adapter startup without requiring them in this
  slice.
- Add package scripts for service startup and, if needed, adapter bridge
  startup.
- Decide the default local MCP transport for the daemon:
  - local MCP HTTP/SSE/streamable transport if supported by target clients.
  - stdio bridge only as compatibility for hosts that require command-based
    stdio MCP startup.

Files likely touched:

- `package.json`
- `src/service/**`
- `src/surfaces/mcp/**`
- `test/service/**`

Verification:

- service entrypoint smoke test or integration test proves startup creates one
  Stage Core and exposes MCP tools.
- service dispatch test proves `minemusic.knowledge.query` reaches the
  service-held Knowledge provider path.
- startup failure surfaces a structured or explicit process error rather than
  silently creating a partial runtime.

Exit criteria:

- there is a first-class MineMusic service command distinct from the Codex
  plugin adapter path.

### Phase 4: Shrink Codex Plugin To Connection Config

Goal: stop Codex plugin packaging from implying provider/runtime ownership.

Tasks:

- Update `plugins/minemusic/.mcp.json` so it starts only an adapter bridge or
  points at the service MCP endpoint, depending on host support.
- Remove provider/database/cache/session env from plugin config.
- If a bridge is needed, keep it thin:
  - bridge speaks stdio MCP to Codex.
  - bridge connects to the MineMusic service MCP adapter.
  - bridge does not create Stage Core.
  - bridge does not parse provider/database/cache/session env.
- Update plugin packaging tests to assert the plugin config contains only host
  connection configuration.

Files likely touched:

- `plugins/minemusic/.mcp.json`
- `plugins/minemusic/.codex-plugin/plugin.json`
- `test/plugins/plugin-packaging.test.ts`
- optional `src/surfaces/mcp/stdio-bridge.ts`

Verification:

- plugin packaging test fails if provider/database/cache/session env appears in
  `.mcp.json`.
- plugin packaging test points at bridge or endpoint config only.
- existing skill and Handbook packaging checks remain unchanged.

Exit criteria:

- the Codex plugin is visibly an MCP client/bridge configuration, not a
  MineMusic runtime owner.

### Phase 5: Preserve Developer And Test Ergonomics

Goal: keep local testing easy without reintroducing runtime ownership into
adapter code.

Tasks:

- Provide one explicit dev/test command if embedded startup is still useful.
- Name embedded startup as dev/test only.
- Keep deterministic tests able to inject fixture providers or service runtime
  options directly.
- Avoid using the Codex plugin path for provider/runtime integration tests.

Files likely touched:

- `package.json`
- `test/run-stage-core-tests.ts`
- `test/surfaces/mcp-server.test.ts`
- `test/integration/**`

Verification:

- `npm test` covers service runtime, MCP adapter registration, packaging, and
  existing Stage Core behavior.
- smoke commands remain explicit about whether they target service startup,
  provider APIs, or adapter surfaces.

Exit criteria:

- tests distinguish service composition from adapter behavior.

### Phase 6: Documentation And State Sync

Goal: align source-of-truth docs after the code moves.

Tasks:

- Update `ARCHITECTURE.md` from target wording to implemented wording.
- Update `CURRENT_STATE.md` with the new service runtime status.
- Update `PROGRESS.md` with the migration result.
- Update `README.md` commands.
- Update `docs/host-adapters/codex-mcp-plugin.md` with final plugin behavior.
- Update `INDEX.md` for new service and adapter files.

Verification:

- `git diff --check`.
- `git diff --name-only` state-sync gate.
- README commands match package scripts.

Exit criteria:

- docs no longer describe the service boundary as future-only once it is
  implemented.

## Test Matrix

Required deterministic tests:

- service creates Stage Core once and resolves `ready`.
- service registers NetEase source and platform-library providers when
  configured.
- service registers bundled MusicBrainz Knowledge provider by default.
- service accepts durable database/cache paths through service config.
- MCP adapter exposes the stable `minemusic.*` tool set.
- MCP adapter exposes unchanged input schemas.
- MCP adapter dispatches calls through injected service-held Stage Interface.
- Codex plugin packaging does not include provider/database/cache/session env.
- optional stdio bridge does not import or create Stage Core.

Useful smoke checks:

- service startup plus MCP tool list.
- `minemusic.knowledge.query` through MCP.
- `minemusic.music.material.resolve` through MCP with NetEase unavailable and
  with live NetEase when explicitly enabled.
- full Library Import live smoke through the service-held runtime when durable
  paths are explicitly configured.

## Risks And Guards

- Risk: MCP adapter still imports service config helpers and quietly owns
  runtime startup.
  Guard: adapter tests should use injected runtime/interface only.
- Risk: Codex plugin config keeps provider/db/cache env.
  Guard: packaging test should reject those env keys.
- Risk: a private service `callTool` API duplicates MCP semantics.
  Guard: service should expose MCP for MCP clients; CLI/Web UI can call service
  internals or their own transport boundary without inventing a second generic
  tool protocol.
- Risk: Handbook provider metadata drifts between service and adapter.
  Guard: Stage Interface remains the source for descriptors and Handbook tools.
- Risk: dev/test embedded startup becomes production default again.
  Guard: name it explicitly as dev/test and keep plugin config pointed at the
  service adapter or bridge.

## Final Stopping Condition

The refactor is complete when:

- MineMusic service startup is the only default path that creates Stage Core.
- MCP, CLI, and Web UI are documented as peer adapter surfaces over that
  service-held runtime.
- Codex plugin config no longer includes provider/database/cache/session runtime
  settings.
- MCP tool names, schemas, Handbook tools, Knowledge/MusicBrainz behavior, and
  Library Import behavior remain compatible.
- deterministic tests prove service composition, MCP adapter behavior, and
  plugin packaging boundaries separately.
