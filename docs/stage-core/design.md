# Stage Core Design

## Role

Stage Core is MineMusic's runtime composition and lifecycle boundary.

It answers:

```text
How is one MineMusic runtime assembled, seeded, kept ready, and exposed to the
MineMusic server or explicit test harnesses?
```

It does not answer:

```text
How should Material Resolve rank candidates?
How should providers map payloads?
What should Stage Interface expose publicly?
How should host clients start the MineMusic server?
```

Those decisions belong to the owning domain module, provider adapter, Stage
Interface, or MineMusic server process.

## Current Implementation

| Concern | Location |
| --- | --- |
| Public facade and factory exports | `src/stage_core/index.ts` |
| Public/runtime/harness types | `src/stage_core/types.ts` |
| Internal Runtime Kit input normalization | `src/stage_core/runtime_kit.ts` |
| Repository selection | `src/stage_core/repositories.ts` |
| Service graph assembly | `src/stage_core/compose.ts` |
| Startup seeding and provider registration | `src/stage_core/seed.ts` |
| Handbook path normalization | `src/stage_core/handbook_paths.ts` |
| Server runtime owner | `src/server/runtime.ts` |

The public facade still exports compatibility factory entrypoints:

- `createMineMusicStageCore(...)`
- `createMineMusicStageCoreWithSourceProvider(...)`

These return the full `MineMusicStageCoreHarness` shape for tests, diagnostics,
and compatibility callers that intentionally need internals.

Production-facing server code uses the narrower runtime shape:

- `createFixtureMineMusicStageRuntime(...)`
- `createMineMusicStageRuntimeWithSourceProvider(...)`
- `MineMusicStageRuntime`

`MineMusicStageRuntime` exposes only:

- `ready`
- `stageInterface`

## Runtime Kit Split

Stage Core keeps construction concerns separated:

- `runtime_kit.ts` normalizes high-level factory options into one internal
  `StageCoreRuntimeKit`.
- `repositories.ts` chooses injected repository, SQLite path, transient SQLite
  path, or in-memory repository for each storage capability.
- `compose.ts` assembles domain services and Stage Interface from the kit.
- `seed.ts` registers providers, seeds initial canonical records, initializes
  owner system Collections, and writes explicit Handbook snapshot paths.

This split keeps `src/stage_core/index.ts` as a facade rather than a large
composition implementation.

## Ownership

Stage Core owns:

- runtime graph assembly;
- repository selection from injected repositories, database paths, or in-memory
  defaults;
- provider registration through Plugin Registry;
- startup seeding;
- generated Handbook file output when explicit paths are supplied;
- runtime readiness;
- explicit full-harness entrypoints for tests and diagnostics.

Stage Core does not own:

- MineMusic server process lifecycle or environment parsing;
- MCP transport;
- Stage Interface tool truth;
- provider implementation details;
- domain behavior inside Material Store, Material Search, Material Resolve,
  Collection Service, Library Import, Knowledge, Memory, Events, or Effects;
- final recommendation judgment.

## Server Boundary

The MineMusic server process owns environment parsing and long-lived runtime
lifecycle. `src/server/runtime.ts` creates a `MineMusicStageRuntime` through
Stage Core, registers default NetEase and MusicBrainz providers through runtime
options, and keeps provider/database/cache/session settings in server runtime
configuration.

Host clients such as Codex and OpenClaw connect to the server's MCP endpoint.
They do not instantiate Stage Core directly for normal use.

## Handbook Boundary

Stage Core can write generated Handbook snapshots only when a caller supplies
`handbookPath` or `handbookPaths`. It must not default to a Codex skill path.

The live Handbook truth comes from Stage Interface instrument/tool descriptors
and provider descriptors. Skill-local `skills/minemusic/HANDBOOK.md` is a
snapshot, not Stage Core runtime authority.

## Archive

Historical Stage Core Runtime Kit refactor design and execution plans are
archived under `docs/archive/stage-core/`.
