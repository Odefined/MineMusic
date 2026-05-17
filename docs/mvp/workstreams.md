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

## Workstream B: Stage Kernel

Owner role: Stage Kernel Agent.

Purpose:

- Build the LLM-facing governance layer.

Owns:

- `src/stage/**`
- StageSession handling.
- Handbook compiler.
- material preparation and gating.

Inputs:

- contracts from Workstream A.
- `StageKernelPort` from `src/ports`.
- Instrument Registry public API.
- Memory, Event, Effect, Source, and Canonical public APIs.

Outputs:

- stage service public API.
- tests for Handbook compilation, session update, and material-state gating.

## Workstream C: Instrument Registry And Tool Surface

Owner role: Instrument Agent.

Purpose:

- Expose stable LLM-visible instruments and governed tools.

Owns:

- `src/instruments/**`
- `src/tool_api/**`

Inputs:

- shared contracts.
- `InstrumentRegistryPort` from `src/ports`.
- public APIs from core services.

Outputs:

- instrument registry.
- tool descriptors.
- tool dispatch tests.

Rule:

- Tool names are public API. Rename only through an interface change request.

## Workstream D: Canonical Store

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

## Workstream E: Source Resolution And Provider Slot

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

## Workstream F: Events, Memory, And Effects

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

## Workstream G: Plugin Edge And Storage

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

## Workstream H: Integration And Verification

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
