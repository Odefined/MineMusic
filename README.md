# MineMusic MVP Documentation Pack

MineMusic is a music stage for an LLM music partner, secretary, and agent.

This repository is currently in an MVP implementation-foundation stage. The
product source remains `proposal.md`, and the implementation contracts follow
the MVP documentation pack.

The MVP goal is to prove one user-facing chain:

```text
natural music request
  -> LLM musical interpretation
  -> MineMusic context and memory read
  -> grounded music material
  -> source-backed playable links when available
  -> honest material state
  -> LLM recommendation
  -> event record and memory proposal when appropriate
```

MineMusic does not replace the LLM's musical judgment. It provides grounding,
identity anchors, source-backed links, event records, memory proposals, and
effect boundaries.

## Source Of Truth

- Product proposal: `proposal.md`
- Project vocabulary: `CONTEXT.md`
- MVP architecture: `ARCHITECTURE.md`
- Document index: `INDEX.md`
- Current project state: `CURRENT_STATE.md`
- Progress log: `PROGRESS.md`
- MVP phase plan: `plan/mvp_phase_plan.md`

## MVP Docs

- `docs/mvp/interface-contracts.md`: shared data contracts.
- `docs/mvp/module-interfaces.md`: public ports for every MVP module.
- `docs/mvp/communication-protocols.md`: how modules call, notify, propose, and
  request interface changes.
- `docs/mvp/module-boundaries.md`: ownership and encapsulation rules.
- `docs/mvp/workstreams.md`: ownership areas for assigning parallel work.
- `docs/mvp/agent-collaboration.md`: communication protocol for multiple agents.
- `docs/mvp/verification-report.md`: fixture end-to-end MVP verification
  report.
- `docs/mvp/final-review.md`: final spec/code-quality review for the fixture
  MVP implementation.
- `plan/subagent_mvp_master_plan.md`: coordinator plan for completing the MVP
  with subagents.

## Development

Waves 1 through 8 have established the TypeScript contract, public-port
harness, in-memory repository foundation, plugin registry foundation, core
domain module skeletons, Stage Core runtime composition, the Session Context
Stage Module, Stage Interface catalog and dispatch,
fixture end-to-end MVP slice, final review documentation, and a read-only
NetEase source provider adapter with opt-in live smoke validation. Wave 8 adds
a Codex skill surface for using MineMusic MCP tools. The runtime boundary now
includes a MineMusic server entrypoint that owns Stage Core and exposes MCP
directly over streamable HTTP.

The architecture vocabulary is now:

```text
MineMusic Server
  -> MCP / future host transports
  -> Stage Core -> Stage Interface / Stage Modules
     -> Core Capabilities -> Plugin Slots -> Storage
```

`Stage Core` means runtime composition and lifecycle. Current code maps that to
`src/stage_core/index.ts`. The current `src/stage/index.ts` module is not Stage
Core; it exports the Session Context Stage Module.

```bash
npm test
npm run server:minemusic
npm run mcp:minemusic:dev
npm run smoke:netease
```

The test command runs TypeScript contract/type checks, compiles tests into
`.tmp-test/`, and executes storage, plugin registry, core domain, stage,
instrument, provider, Stage Interface, and integration runtime tests.

`npm run smoke:netease` skips by default. Set `MINEMUSIC_LIVE_NETEASE=1` to
validate against a local NetEase Cloud Music API service. The default endpoint
is `http://127.0.0.1:3000`, and it can be changed with
`MINEMUSIC_NETEASE_BASE_URL`.

`npm run server:minemusic` loads `.env` from the repository root when the file
exists. Use `.env.example` as the template for local server runtime settings.
On this machine the MineMusic server is installed as a user `launchd` agent and
is expected to stay running outside Codex sessions. See
`docs/operations/minemusic-server-launchd.md` before changing startup or MCP
client config.

The MineMusic server startup path keeps Material Store, Collection, and
Library Import state in memory unless database paths are configured. Set
`MINEMUSIC_MATERIAL_STORE_DB_PATH` to persist canonical identity state; set
`MINEMUSIC_COLLECTION_DB_PATH` to persist Collections and
CollectionItems; and set `MINEMUSIC_LIBRARY_IMPORT_DB_PATH` to persist Library
Import batches, reports, snapshots, provenance, and absence records. The local
default groups these SQLite files under `/tmp/minemusic/`. These
provider, database, cache, and session settings are MineMusic server runtime
concerns, not Codex skill configuration. Codex/OpenClaw should connect to the
server MCP URL, by default `http://127.0.0.1:37373/mcp`.
Set `MINEMUSIC_HANDBOOK_PATH` for one server-written Handbook file, or
`MINEMUSIC_HANDBOOK_PATHS` for multiple files separated by the platform path
delimiter. This is server-owned output configuration; the paths may point at a
Codex skill, OpenClaw docs, or any other consumer-owned snapshot location.

The Codex workflow skill lives at `skills/minemusic/SKILL.md`, with its
skill-local Handbook snapshot at `skills/minemusic/HANDBOOK.md`. Codex MCP
client registration is global host-app state configured with `codex mcp`, not
repo-local plugin packaging.

For local reset-and-restart, run:

```bash
./scripts/reset-minemusic-launchd-runtime.sh
```

It stops the user LaunchAgent, preserves `/tmp/minemusic` by default,
bootstraps the LaunchAgent again, and waits for the health endpoint to come
back.

To clear runtime state as part of the restart:

```bash
./scripts/reset-minemusic-launchd-runtime.sh --clear-runtime
```

## Non-Goals

The MVP does not implement autoplay, queue mutation, source writeback, a full
player runtime, autonomous DJ sessions, bulk playlist import, heavy recommender
scoring, or a full music intelligence pipeline.
