# MVP Module Boundaries

This document defines strict module ownership for independent implementation
agents.

Project vocabulary lives in `CONTEXT.md`.

## Global Encapsulation Rules

1. Shared contracts live in `src/contracts`.
2. Public ports live in `src/ports`.
3. Modules may import shared contracts and public ports.
4. Modules must not import another module's private files.
5. Cross-module calls go through public interfaces.
6. Plugin packages register adapters through Plugin Slots.
7. Storage implementations sit behind repository interfaces.
8. Interface changes require a written change request before implementation.

Stage Core is the construction exception: it may import module factories because
its job is to assemble a runtime. It must not move module-owned domain logic
into the composition layer.

## Host Adapters

Own:

- host protocol translation.
- host startup environment.
- host-facing tool-name prefixing.
- host result formatting.

Public API:

- host-specific server entrypoints, such as the Codex MCP server.

Must not own:

- MineMusic tool truth.
- recommendation policy.
- provider implementation.
- repositories.
- Core Capability private implementation.

## Stage Core

Own:

- runtime composition.
- module factory wiring.
- provider registration during runtime startup.
- initialization of generated runtime artifacts such as the Handbook.
- `runtime.ready`.
- runtime lifecycle and the returned runtime object.

Current implementation:

- `src/stage_core/index.ts`

Public API:

- `createMineMusicStageCore(input)`
- `createMineMusicStageCoreWithSourceProvider(input)`
- the returned `MineMusicStageCore`

Must not own:

- source matching logic.
- canonical identity decisions.
- memory derivation.
- effect execution policy.
- host protocol details.
- final recommendation choice.

## Stage Interface

Own:

- LLM-visible instruments.
- tool catalog and tool metadata.
- Handbook lookup surface.
- governed tool dispatch.
- stable host-facing callable surface.
- MineMusic-owned ordering for common flows.

Current implementation:

- `src/stage_interface/**`
- `src/handbook/index.ts`

Public API:

- `MineMusicStageInterface.tools`
- `InstrumentCatalogPort.list(input)`
- `ToolDispatchPort.call(input)`

Must not own:

- provider-specific behavior.
- storage details.
- final recommendation judgment.
- Host Adapter transport code.
- Core Capability private implementation.

## Session Context

Own:

- session lookup.
- session update.
- `StageVibe` propagation through session state.
- active instrument state.
- dynamic context returned to the LLM.
- memory summaries included in dynamic context.

Current implementation:

- `src/stage/index.ts`

Public API:

- `SessionContextPort.getSession(input)`
- `SessionContextPort.readContext(input)`
- `SessionContextPort.updateSession(input)`

Must not own:

- source provider behavior.
- canonical persistence internals.
- durable memory writes.
- effect execution.
- final recommendation choice.

## Material Gate

Own:

- presentation safety for `MusicMaterial`.
- stripping playable links when material state or purpose does not allow
  presentation.
- material-prepared event emission.

Current implementation:

- `src/stage/index.ts`

Public API:

- `MaterialGatePort.prepareMaterials(input)`

Must not own:

- source search.
- playable-link retrieval.
- canonical identity.
- memory writes.
- final recommendation choice.

## Instrument Catalog

Own:

- LLM-visible instrument descriptors.
- available tool lists per session.
- schema references for tool input and output.

Current implementation:

- `src/stage_interface/instruments.ts`

Public API:

- `InstrumentCatalogPort.list(input)`

Must not own:

- tool execution.
- provider-specific behavior.
- storage details.
- Session Context private implementation.

## Tool Dispatch

Own:

- tool availability checks against Instrument Catalog.
- routing tool calls to public module ports.
- stable tool-not-found errors.

Current implementation:

- `src/stage_interface/dispatch.ts`

Public API:

- `ToolDispatchPort.call(input)`

Must not own:

- host protocol formatting.
- provider implementation.
- final recommendation judgment.
- private implementation of routed modules.

## Canonical Store

Own:

- MineMusic canonical refs.
- canonical records.
- source ref attachment.
- provisional identity records.

Public API:

- `CanonicalStorePort.get(input)`
- `CanonicalStorePort.findByLabel(input)`
- `CanonicalStorePort.resolveSourceRef(input)`
- `CanonicalStorePort.createProvisional(input)`
- `CanonicalStorePort.attachSourceRef(input)`

Must not own:

- playability.
- source account state.
- user preference.
- recommendation scoring.

## Material Resolve

Own:

- canonical-first candidate-to-material resolution.
- `MaterialResolveResult` status.
- source evidence attachment to known canonical records.

Public API:

- `MaterialResolvePort.resolve(input)`

Must not own:

- source provider internals.
- playable link refresh.
- durable memory.
- final recommendation selection.

## Source Grounding

Own:

- source search.
- source refs.
- playable link retrieval.
- source-backed material states.

Public API:

- `SourceGroundingPort.ground(input)`
- `SourceGroundingPort.refreshPlayableLinks(input)`

Must not own:

- canonical authority.
- candidate-level material resolution.
- durable memory.
- final recommendation selection.

## Music Knowledge

Own:

- metadata lookup.
- relationship lookup.
- related material hints.
- identity evidence from knowledge providers.

Public API:

- `MusicKnowledgePort.query(input)`

Must not own:

- playable link claims.
- canonical writes.
- durable memory.
- MVP critical-path ownership.

## Event Service

Own:

- factual event records.
- session event listing.

Public API:

- `EventPort.record(input)`
- `EventPort.listBySession(input)`

Must not own:

- memory derivation.
- external action execution.

## Memory Service

Own:

- memory summaries.
- memory proposals.
- accepted memory entries.
- evidence linkage from events.

Public API:

- `MemoryPort.summarizeForSession(input)`
- `MemoryPort.propose(input)`
- `MemoryPort.accept(input)`

Must not own:

- raw event recording.
- direct external actions.
- unsupported LLM guesses as durable fact.

## Effect Boundary

Own:

- effect proposals.
- confirmation policy.
- approval or rejection decisions.
- dispatch to effect providers after approval.

Public API:

- `EffectBoundaryPort.propose(input)`
- `EffectBoundaryPort.decide(input)`

Must not own:

- ordinary recommendation text.
- normal playable link display.
- source provider internals.

## Plugin Slots

Own:

- capability slot registration.
- provider lookup.
- provider listing.
- adapter-specific registration records.

Current implementation:

- `src/plugins/index.ts`

Public API:

- `PluginRegistryPort.registerProvider(input)`
- `PluginRegistryPort.listProviders(input)`
- `PluginRegistryPort.listProviderDescriptors(input)`
- `PluginRegistryPort.getProvider(input)`

Must not own:

- MineMusic business policy.
- canonical identity decisions.
- final recommendation judgment.

## Storage Layer

Own:

- repository implementations.
- persistence configuration.
- migrations when a durable backend exists.

Public API:

- repository interfaces defined by core modules.

Must not own:

- domain decisions.
- effect policy.
- LLM-facing behavior.
