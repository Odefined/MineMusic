# MVP Module Boundaries

This document defines strict module ownership for independent implementation
agents.

## Global Encapsulation Rules

1. Shared contracts live in `src/contracts`.
2. Modules may import shared contracts.
3. Modules must not import another module's private files.
4. Cross-module calls go through public interfaces.
5. Plugin packages register providers through capability slots.
6. Storage implementations sit behind repository interfaces.
7. Interface changes require a written change request before implementation.

## Stage Kernel

Owns:

- dynamic session context.
- StageSession continuity.
- StageVibe propagation through session state.
- active instrument selection.
- material-state gating before LLM use.
- routing event, memory, and effect requests to core services.

Public API:

- `StageKernelPort.getSession(input)`
- `StageKernelPort.readContext(input)`
- `StageKernelPort.updateSession(input)`
- `StageKernelPort.prepareMaterials(input)`

Must not own:

- canonical persistence internals.
- source provider implementation.
- durable memory writes.
- effect execution.
- final recommendation choice.
- tool dispatch.

## Instrument Registry

Owns:

- LLM-visible instrument descriptors.
- LLM-visible instrument catalog.
- governed tool dispatch through a separate dispatch port.
- schema references for tool input and output.

Public API:

- `InstrumentCatalogPort.list(input)`
- `ToolDispatchPort.call(input)`

Must not own:

- provider-specific behavior.
- music business policy outside tool governance.
- storage details.
- Stage Kernel private implementation.

## Canonical Store

Owns:

- MineMusic canonical refs.
- canonical records.
- external ref attachment.
- provisional identity records.

Public API:

- `CanonicalStorePort.get(input)`
- `CanonicalStorePort.resolveExternalRef(input)`
- `CanonicalStorePort.createProvisional(input)`
- `CanonicalStorePort.attachExternalRef(input)`

Must not own:

- playability.
- source account state.
- user preference.
- recommendation scoring.

## Source Resolution

Owns:

- source search.
- source refs.
- playable link retrieval.
- source-backed material states.

Public API:

- `SourceResolutionPort.ground(input)`
- `SourceResolutionPort.refreshPlayableLinks(input)`

Must not own:

- canonical authority.
- durable memory.
- final recommendation selection.

## Music Knowledge

Owns:

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

Owns:

- factual event records.
- session event listing.

Public API:

- `EventPort.record(input)`
- `EventPort.listBySession(input)`

Must not own:

- memory derivation.
- external action execution.

## Memory Service

Owns:

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

Owns:

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

## Plugin Edge

Owns:

- capability slot provider registration.
- provider lifecycle.
- adapter-specific translation.

Public API:

- `PluginRegistryPort.registerProvider(input)`
- `PluginRegistryPort.listProviders(input)`
- `PluginRegistryPort.getProvider(input)`

Must not own:

- MineMusic business policy.
- canonical identity decisions.
- final recommendation judgment.

## Storage Layer

Owns:

- repository implementations.
- persistence configuration.
- migrations when a durable backend exists.

Public API:

- repository interfaces defined by core modules.

Must not own:

- domain decisions.
- effect policy.
- LLM-facing behavior.
