# MineMusic MVP Phase Plan

## Goal

Build the smallest MineMusic runtime that proves a grounded recommendation flow
with source-backed playable links when available, factual event recording, and
evidence-backed memory proposals.

## Phase 0: Contract Freeze

Goal: turn the MVP docs into implementation-ready contracts.

Tasks:

- Review `docs/mvp/interface-contracts.md`.
- Review `docs/mvp/module-interfaces.md`.
- Review `docs/mvp/communication-protocols.md`.
- Confirm public module APIs.
- Confirm module ownership in `docs/mvp/module-boundaries.md`.
- Confirm workstream assignments in `docs/mvp/workstreams.md`.

Exit criteria:

- No unresolved contract names.
- Every module has a public port, consumed ports, published event names, and
  forbidden private dependencies.
- Every cross-module communication path uses port call, domain event, proposal,
  provider slot, or interface change request.
- Every module has a public API and explicit non-ownership list.
- Every workstream has input contracts, output contracts, and verification
  expectations.

## Phase 1: Shared Contracts And Storage Abstractions

Goal: create shared domain contracts and repository interfaces.

Expected owners:

- Contracts Agent.
- Storage Agent.

Deliverables:

- `src/contracts/*`
- `src/ports/*`
- `InstrumentCatalogPort` and `ToolDispatchPort` as separate public ports.
- repository interfaces for canonical records, events, memory entries, sessions,
  and effect proposals.
- type-level tests or schema validation for shared contracts.

Exit criteria:

- All downstream modules can import shared contracts without importing module
  internals.

## Phase 2: Events, Memory, And Effects Skeleton

Goal: establish the consequence-control path before recommendation logic grows.

Expected owners:

- Events Agent.
- Memory Agent.
- Effects Agent.

Deliverables:

- Event recording service.
- Memory proposal service.
- Effect proposal and approval boundary.
- source-only event targeting rules that do not imply canonical identity.

Exit criteria:

- A recommendation transcript can produce factual events.
- A memory update remains a proposal until approved by the effect boundary.
- External actions are represented as effect proposals, not direct calls.

## Phase 3: Canonical Store MVP

Goal: provide stable identity anchors for recommended material and feedback.

Expected owner:

- Canonical Store Agent.

Deliverables:

- canonical record repository.
- source and knowledge ref attachment.
- provisional canonical targets for unresolved identity.

Exit criteria:

- A source item can be attached to a canonical or provisional canonical ref.
- Wrong-version feedback has a stable target when possible.

## Phase 4: Source Resolution MVP

Goal: return source-backed playable links and honest material states.

Expected owners:

- Source Resolution Agent.
- Plugin Slots Agent.

Deliverables:

- source provider interface.
- one minimal provider or fixture provider.
- material state assignment for playable, unresolved, exploration, and blocked
  cases.
- explicit source-only event targeting behavior for source-backed links without
  settled canonical identity.

Exit criteria:

- `confirmed_playable` and `source_only_playable` are distinguishable.
- Exploration material cannot be presented as confirmed playable.

## Phase 5: Stage Core, Stage Modules, And Stage Interface

Goal: assemble the runtime and expose a governed LLM-facing stage.

Expected owners:

- Stage Core Agent.
- Stage Modules Agent.
- Stage Interface Agent.

Deliverables:

- runtime composition.
- provider registration during startup.
- generated Handbook initialization.
- dynamic session context.
- StageSession service.
- StageVibe carried as soft session guidance.
- Material Gate behavior for presentation safety.
- instrument registry.
- LLM-facing tool surface for context read, Handbook lookup, candidate
  grounding, event record, memory proposal, effect proposal, and session
  update.

Exit criteria:

- The LLM can use instruments without knowing provider internals.
- Stage Core assembles the runtime without absorbing module-owned business
  logic.
- Material Gate gates material state before presentation.
- Stage Interface owns instruments, tools, Handbook lookup, and governed
  dispatch while tool dispatch calls Stage Modules and core ports through
  Stage Core injection.

## Phase 6: End-To-End MVP Slice

Goal: prove the full MVP chain with a realistic transcript.

Expected owner:

- Integration Agent.

Deliverables:

- end-to-end test or smoke script.
- example transcript.
- verification report covering material state, playable link handling, event
  recording, memory proposal, and effect boundary behavior.

Exit criteria:

- A natural music request produces a grounded recommendation response.
- The response includes playable links only when source-backed.
- Events and memory proposals are inspectable.

## Phase 7: Documentation Sync

Goal: bring docs back in sync with the implemented MVP.

Expected owner:

- Documentation Agent.

Deliverables:

- updated `CURRENT_STATE.md`.
- updated `PROGRESS.md`.
- updated `ARCHITECTURE.md` only if implementation changes the architecture.
- updated interface docs if contracts changed.

Exit criteria:

- Docs distinguish implemented behavior, thin stubs, and future work.
