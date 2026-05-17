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

- Handbook compilation.
- StageSession continuity.
- active instrument selection.
- material-state gating before LLM use.
- routing event, memory, and effect requests to core services.

Public API:

- `compileHandbook(sessionId)`
- `getSession(sessionId)`
- `updateSession(sessionId, patch)`
- `prepareMaterials(sessionId, materials)`

Must not own:

- canonical persistence internals.
- source provider implementation.
- durable memory writes.
- effect execution.
- final recommendation choice.

## Instrument Registry

Owns:

- LLM-visible instrument descriptors.
- governed tool dispatch.
- schema references for tool input and output.

Public API:

- `list(session)`
- `call(toolName, input)`

Must not own:

- provider-specific behavior.
- music business policy outside tool governance.
- storage details.

## Canonical Store

Owns:

- MineMusic canonical refs.
- canonical records.
- external ref attachment.
- provisional identity records.

Public API:

- `get(ref)`
- `resolveExternalRef(ref)`
- `createProvisional(input)`
- `attachExternalRef(input)`

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

- `ground(query)`
- `refreshPlayableLinks(material)`

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

- `query(query)`

Must not own:

- playable link claims.
- canonical writes.
- durable memory.

## Event Service

Owns:

- factual event records.
- session event listing.

Public API:

- `record(event)`
- `listBySession(sessionId)`

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

- `summarizeForSession(sessionId)`
- `propose(input)`
- `accept(proposalId)`

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

- `propose(input)`
- `decide(decision)`

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

- `registerProvider(slot, provider)`
- `listProviders(slot)`
- `getProvider(slot, id)`

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
