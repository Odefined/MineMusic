# Stage Core Ports

This document records the current Stage Core composition surface.

Stage Core is a composition root. It is allowed to wire broad concrete
implementations into narrow runtime consumers, but ordinary domain modules must
not treat Stage Core's harness shape as an importable capability boundary.

## Provided Surface

| Surface | Location | Purpose | Consumer |
| --- | --- | --- | --- |
| `createMineMusicStageCore(...)` | `src/stage_core/index.ts` | Compatibility fixture factory using fixture source materials | tests, historical callers |
| `createMineMusicStageCoreWithSourceProvider(...)` | `src/stage_core/index.ts` | Compatibility harness factory with explicit source provider | tests, diagnostics, integration harnesses |
| `createFixtureMineMusicStageRuntime(...)` | `src/stage_core/index.ts` | Narrow runtime factory for fixture source materials | production-like callers that need only ready + Stage Interface |
| `createMineMusicStageRuntimeWithSourceProvider(...)` | `src/stage_core/index.ts` | Narrow runtime factory with explicit source provider | MineMusic server runtime |
| `createMineMusicStageCoreHarness(...)` | `src/stage_core/index.ts` | Explicit full harness alias | tests and diagnostics |
| `createFixtureMineMusicStageCoreHarness(...)` | `src/stage_core/index.ts` | Explicit fixture full harness alias | tests and diagnostics |
| `MineMusicStageRuntime` | `src/stage_core/types.ts` | Production-facing runtime shape | server runtime |
| `MineMusicStageCoreHarness` | `src/stage_core/types.ts` | Full internal-service harness shape | tests and diagnostics |

## Runtime Shape

`MineMusicStageRuntime` exposes:

- `ready: Promise<void>`
- `stageInterface: MineMusicStageInterface`

The MineMusic server should depend on this narrow runtime shape.

`MineMusicStageCoreHarness` additionally exposes internal services such as
dispatch, Session Context, Material Store, Collection, Material Resolve,
Material Search, Material Query, Source Grounding, Knowledge, Library Import,
Events, Memory, Effects, Plugin Registry, and Provider HTTP Cache. This is not
the normal production surface.

## Consumed Capabilities

Stage Core consumes module factories and repository factories as a composition
root:

| Capability | Consumed from | Notes |
| --- | --- | --- |
| Material Store, materialization, search, policy, sort, select, query, resolve, recommendation presentation, canonical maintenance | `src/material/index.ts` | Domain behavior stays in Material modules. |
| Collection Service | `src/collection/index.ts` | Stage Core wires repository/events/material store dependencies. |
| Source Grounding | `src/source/index.ts` | Stage Core injects Plugin Registry and source evidence writer. |
| Music Knowledge | `src/knowledge/index.ts` | Stage Core injects Plugin Registry and Canonical Store context reader. |
| Event Service | `src/events/index.ts` | Stage Core injects event repository and material activity projections. |
| Memory Service | `src/memory/index.ts` | Stage Core injects repositories, events, effects, and material store. |
| Effect Boundary | `src/effects/index.ts` | Stage Core injects effect proposal repository. |
| Plugin Registry | `src/plugins/index.ts` | Stage Core registers configured providers during seed. |
| Stage Modules / Stage Interface | `src/stage/index.ts`, `src/stage_interface/index.ts` | Stage Interface remains the callable surface. |
| Storage repositories | `src/storage/index.ts` | Selection happens in `src/stage_core/repositories.ts`. |

## Repository Selection

`src/stage_core/repositories.ts` applies this rule:

```text
explicit injected repository > database path > in-memory repository
```

The rule applies to:

- canonical repository;
- Material Registry;
- material relations;
- material activity;
- material session activity;
- Material Search SQLite FTS index;
- Source Entity Store repository;
- Collection repository;
- Library Import repository;
- Provider HTTP Cache repository.

Events, Memory, and Effects still use in-memory repositories in the current
Stage Core repository factory.

## Provider Registration

`src/stage_core/seed.ts` registers:

- one source provider under slot `source`;
- each configured Knowledge provider under slot `knowledge`;
- one optional Platform Library provider under slot `platform_library`.

Knowledge provider factories receive the Stage Core Provider HTTP Cache through
`KnowledgeProviderFactoryContext`.

Provider activation is runtime composition input. The MineMusic server supplies
default NetEase and MusicBrainz providers; host clients do not register
providers.

## Write Capabilities

Stage Core has startup write responsibilities only:

- seed configured canonical records into the canonical repository;
- register providers in Plugin Registry;
- initialize owner system Collections;
- write explicit Handbook snapshot paths.

Stage Core should not perform ordinary user/domain writes after startup. Runtime
domain writes flow through Stage Interface and the owning capability ports.

## Guards And Evidence

Current guards are test-based rather than a dedicated Stage Core architecture
test:

- `test/stage_core/stage-core-factory.test.ts`
- `test/server/server-runtime.test.ts`
- `test/server/server-http-mcp.test.ts`
- `test/surfaces/mcp-server.test.ts`
- `test/integration/canonical-persistence.test.ts`
- `test/integration/collection-runtime.test.ts`
- `test/integration/library-import-runtime.test.ts`

The documentation alignment sweep did not add code or architecture guards.
Future code slices that narrow Stage Core further should add project-native
guards with the code change.
