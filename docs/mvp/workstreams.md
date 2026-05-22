# MVP Workstreams

Each workstream is an ownership area for a person or agent. It is not a task
packet by itself. Before implementation, the owner must follow the public ports
in `docs/mvp/module-interfaces.md` and the communication forms in
`docs/mvp/communication-protocols.md`.

## Workstream A: Contracts

Owner role: Contracts Agent.

Purpose:

- Convert `docs/mvp/interface-contracts.md` into implementation contracts.

Owns:

- `src/contracts/**`
- schema or type validation tests for contracts.

Inputs:

- `docs/mvp/interface-contracts.md`
- `docs/mvp/module-interfaces.md`

Outputs:

- exported shared types.
- public port definitions in `src/ports/**`.
- stable public interface names.
- contract tests.

Must coordinate with:

- every module agent before changing public contract names.

## Workstream B: Stage Core

Owner role: Stage Core Agent.

Purpose:

- Assemble and initialize the MineMusic runtime.

Owns:

- `src/runtime/**`

Inputs:

- module factories from all implementation workstreams.
- provider adapters.
- repository factories.
- startup configuration.

Outputs:

- runtime factory.
- provider registration during startup.
- generated Handbook initialization.
- `runtime.ready`.
- runtime composition tests.

Rule:

- Stage Core may import module factories for construction, but it must not move
  module-owned business behavior into composition.

## Workstream C: Stage Modules

Owner role: Stage Modules Agent.

Purpose:

- Build Session Context and Material Gate behavior.

Owns:

- `src/stage/**`
- StageSession handling.
- dynamic session context.
- material preparation and gating.

Inputs:

- contracts from Workstream A.
- `StageKernelPort` from `src/ports`.
- Memory and Event public APIs.

Outputs:

- Session Context behavior.
- Material Gate behavior.
- tests for dynamic context, session update, and material-state gating.

Rule:

- `StageKernelPort` is the current legacy port name. Future work may split it
  into `SessionContextPort` and `MaterialGatePort` after Stage Interface owns
  external call flow.

## Workstream D: Stage Interface

Owner role: Stage Interface Agent.

Purpose:

- Expose stable LLM-visible instruments and governed tools.
- Keep tool metadata, host schemas, Handbook entries, and dispatch behavior
  local to one interface.

Owns:

- `src/instruments/**`
- `src/tool_api/**`
- `src/handbook/**`

Inputs:

- shared contracts.
- `InstrumentCatalogPort` and `ToolDispatchPort` from `src/ports`.
- public APIs from core services.
- Session Context and Material Gate public APIs.

Outputs:

- instrument registry.
- tool descriptors.
- tool dispatch tests.
- host-facing callable surface.
- Handbook lookup tests.

Rule:

- Tool names are public API. Rename only through an interface change request.

## Workstream E: Canonical Store

Owner role: Identity Agent.

Purpose:

- Provide MineMusic-owned identity anchors.

Owns:

- `src/canonical/**`
- canonical repository interface and default implementation.

Inputs:

- `Ref`, `CanonicalRecord`.
- `CanonicalStorePort` from `src/ports`.
- source refs and knowledge refs as evidence.

Outputs:

- canonical lookup.
- external ref resolution.
- provisional canonical creation.
- tests for source ref attachment and provisional targets.

## Workstream F: Source Resolution And Provider Slot

Owner role: Source Agent.

Purpose:

- Return grounded material and source-backed playable links.

Owns:

- `src/source/**`
- Source Slot provider interface.
- fixture or minimal source provider.

Inputs:

- `SourceQuery`, `MusicMaterial`, `PlayableLink`.
- `SourceResolutionPort` from `src/ports`.
- Canonical Store public API for identity attachment.

Outputs:

- source grounding service.
- playable link refresh.
- tests for `confirmed_playable`, `source_only_playable`, `exploration`,
  `unresolved`, and `blocked` behavior.

## Workstream G: Events, Memory, And Effects

Owner role: Consequence Agent.

Purpose:

- Keep factual history, derived memory, and action boundaries separate.

Owns:

- `src/events/**`
- `src/memory/**`
- `src/effects/**`

Inputs:

- `StageEvent`, `MemoryEntry`, `MemoryProposal`, `EffectProposal`.
- `EventPort`, `MemoryPort`, and `EffectBoundaryPort` from `src/ports`.

Outputs:

- event service.
- memory proposal service.
- effect boundary.
- tests proving events do not automatically become memory and normal link
  display is not playback.

## Workstream H: Plugin Slots And Storage

Owner role: Platform Agent.

Purpose:

- Provide provider registration and persistence behind interfaces.

Owns:

- `src/plugins/**`
- `src/storage/**`

Inputs:

- slot interfaces from Source, Knowledge, Effect, Playback, Context, Identity
  Signal, and Storage.
- `PluginRegistryPort` and repository ports from `src/ports`.

Outputs:

- provider registry.
- storage repositories.
- tests for provider registration and repository isolation.

## Workstream I: Host Adapters

Owner role: Host Adapter Agent.

Purpose:

- Translate host protocols into Stage Interface calls.

Owns:

- `src/surfaces/**`
- `plugins/**`

Inputs:

- Stage Interface callable surface.
- host startup configuration.

Outputs:

- Codex MCP adapter.
- plugin packaging.
- host adapter tests.

Rule:

- Host Adapters must not call Core Capability private implementation or
  provider adapters directly.

## Workstream J: Integration And Verification

Owner role: Integration Agent.

Purpose:

- Prove the MVP chain end to end.

Owns:

- `test/**` or `tests/**`
- `fixtures/**`
- `docs/mvp/verification-report.md`

Inputs:

- all public module APIs.

Outputs:

- realistic recommendation transcript.
- end-to-end smoke or integration test.
- verification report.

Must not:

- fix module internals directly unless assigned by the module owner.
