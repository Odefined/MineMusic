# MineMusic Subagent MVP Master Plan

## Purpose

This master plan defines how the MVP may be implemented with subagents while
preserving module encapsulation.

`plan/mvp_phase_plan.md` defines the product build phases. This file defines the
execution orchestration: when the coordinator may dispatch subagents, which
paths each subagent may own, which contracts they must obey, and how parallel
work is reviewed and integrated.

## Authority

The implementation source of truth is:

1. `proposal.md`
2. `docs/mvp/interface-contracts.md`
3. `docs/mvp/module-interfaces.md`
4. `docs/mvp/communication-protocols.md`
5. `docs/mvp/module-boundaries.md`

Old archives, previous implementations, generated snapshots, and unrelated
directories are not implementation authority for this MVP.

## Coordinator Role

The coordinator may dispatch subagents because this plan explicitly allows
subagent execution.

The coordinator owns:

- phase sequencing.
- subagent prompt construction.
- write-scope isolation.
- interface change decisions.
- review gates.
- integration.
- final verification.
- documentation sync.

The coordinator must not dispatch a subagent with broad ownership such as
`src/**`. Each subagent gets a narrow write set and a clear public contract.

## Repository Gate

Before implementation subagents edit code, the coordinator must establish a
real repository boundary.

Required checks:

```bash
pwd
git rev-parse --show-toplevel
git status --short
```

If `git rev-parse --show-toplevel` fails, the coordinator must resolve the Git
root with the user before dispatching code-writing subagents. Parallel
implementation without a repository boundary is not allowed.

## Subagent Ground Rules

Every implementation subagent receives:

- exact owned paths.
- exact forbidden paths.
- public contracts to read.
- public ports it may consume.
- tests it must add or run.
- required handoff packet.

Subagents may read shared docs and public contracts. They may not read old
archives as implementation authority. They may not import private files from
another module.

Public communication between modules is limited to:

```text
public port calls
domain events
memory or effect proposals
provider slots
interface change requests
```

## Dispatch Packet Template

Each implementation subagent gets a prompt with this shape:

```text
Role:
MVP phase:
Owned write paths:
Forbidden write paths:
Required docs to read:
Public ports consumed:
Public ports produced:
Required behavior:
Required tests:
Verification command:
Interface change rule:
Handoff format:
```

Handoff format:

```text
Status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
Owned paths changed:
Public APIs implemented:
Contracts consumed:
Tests added:
Tests run:
Known gaps:
Interface changes requested:
Next integration concern:
```

## Review Gates

Every implementation subagent is followed by two review passes.

Spec compliance review:

- confirms the implementation matches `docs/mvp/module-interfaces.md`.
- checks it communicates only through allowed forms.
- checks the owned path rule.
- checks it did not widen MVP scope.

Code quality review:

- checks type safety, test quality, clarity, and maintainability.
- checks no module-private imports crossed boundaries.
- checks error results use `Result<T>` and stable error codes.

The coordinator may use reviewer subagents for these reviews. Work is not
accepted until both reviews pass or the coordinator records a justified
exception.

## Interface Change Rule

Subagents may discover that a public contract is incomplete. They must not
silently change it.

They must return an interface change request:

```text
Title:
Requester:
Affected public port:
Affected shared type:
Current limitation:
Proposed contract change:
Backward compatibility:
Required module updates:
Required tests:
Decision: pending
```

The coordinator decides whether to accept the change. If accepted, the
coordinator updates the contract docs before implementation continues.

## Execution Waves

### Wave 0: Repository And Contract Gate

Purpose:

- establish the working repository boundary.
- confirm the current docs are sufficient for implementation.
- avoid dispatching parallel writers before contracts are stable.

Coordinator tasks:

- run repository gate commands.
- confirm TypeScript remains the implementation language unless the user changes
  it.
- run a contract consistency scan over `docs/mvp/**` and `plan/**`.

Optional subagents:

- Contract Review Subagent, read-only.

Read-only ownership:

- `proposal.md`
- `docs/mvp/**`
- `plan/**`

Exit criteria:

- repository boundary established.
- no blocking contradictions in module ports.
- accepted interface changes are reflected in docs.

### Wave 1: Build Harness, Shared Contracts, And Public Ports

Purpose:

- create the implementation skeleton that every other module imports.

Subagent: Foundation Subagent.

Owned write paths:

- `package.json`
- `tsconfig.json`
- `src/contracts/**`
- `src/ports/**`
- `test/contracts/**`

Forbidden write paths:

- `src/stage/**`
- `src/instruments/**`
- `src/canonical/**`
- `src/source/**`
- `src/knowledge/**`
- `src/events/**`
- `src/memory/**`
- `src/effects/**`
- `src/plugins/**`
- `src/storage/**`

Required docs:

- `docs/mvp/interface-contracts.md`
- `docs/mvp/module-interfaces.md`
- `docs/mvp/communication-protocols.md`

Deliverables:

- shared data contracts.
- public port definitions.
- `Result<T>`, `StageError`, `StageWarning`, `DomainEvent`, and error code
  definitions.
- `InstrumentCatalogPort` and `ToolDispatchPort` as separate ports, so Stage
  Kernel never depends on tool dispatch.
- contract tests or type tests.

Exit criteria:

- downstream modules can import contracts and ports without importing module
  internals.
- verification command is documented in the handoff.

### Wave 2: Storage And Plugin Registry Foundations

Purpose:

- provide infrastructure behind public ports without adding domain policy.

Parallel subagents are allowed because write paths are disjoint.

Subagent: Storage Subagent.

Owned write paths:

- `src/storage/**`
- `test/storage/**`

Consumes:

- repository ports from `src/ports/**`.

Deliverables:

- in-memory repositories for sessions, canonical records, events, memory
  entries, and effect proposals.
- repository isolation tests.

Subagent: Plugin Registry Subagent.

Owned write paths:

- `src/plugins/**`
- `test/plugins/**`

Consumes:

- `PluginRegistryPort`
- `CapabilitySlot`

Deliverables:

- provider registration.
- provider lookup.
- provider-not-found behavior.

Wave exit criteria:

- Storage and Plugin Registry tests pass independently.
- neither module imports domain service internals.

### Wave 3: Core Domain Modules

Purpose:

- implement core domain behavior behind public ports.

Parallel subagents are allowed if each subagent owns only its module path and
uses mocks or public ports for dependencies.

Subagent: Canonical Store Subagent.

Owned write paths:

- `src/canonical/**`
- `test/canonical/**`

Consumes:

- `CanonicalRecordRepository`

Required behavior:

- get canonical record.
- resolve external refs.
- create provisional records.
- attach external refs without treating source refs as authority.

Subagent: Source Resolution Subagent.

Owned write paths:

- `src/source/**`
- `test/source/**`
- `fixtures/source/**`

Consumes:

- `CanonicalStorePort`
- Source Slot providers through `PluginRegistryPort`

Required behavior:

- search source providers.
- refresh playable links.
- produce honest material states.
- distinguish `confirmed_playable` from `source_only_playable`.

Subagent: Music Knowledge Thin Stub Subagent.

Owned write paths:

- `src/knowledge/**`
- `test/knowledge/**`
- `fixtures/knowledge/**`

Consumes:

- Knowledge Slot providers through `PluginRegistryPort`

Required behavior:

- query knowledge providers.
- return material and evidence without claiming playability.
- remain outside the MVP critical path unless the coordinator accepts an
  interface change.

Subagent: Event Service Subagent.

Owned write paths:

- `src/events/**`
- `test/events/**`

Consumes:

- `EventRepository`

Required behavior:

- record factual events.
- list events by session.
- never derive memory directly.

Subagent: Effect Boundary Subagent.

Owned write paths:

- `src/effects/**`
- `test/effects/**`

Consumes:

- `EffectProposalRepository`
- Effect Slot providers through `PluginRegistryPort`

Required behavior:

- propose effects.
- approve or reject effects.
- represent external actions as proposals before execution.

Subagent: Memory Service Subagent.

Owned write paths:

- `src/memory/**`
- `test/memory/**`

Consumes:

- `MemoryRepository`
- `EventPort`
- `EffectBoundaryPort`

Required behavior:

- summarize session memory.
- create memory proposals.
- accept proposals only through the configured durable-write boundary.
- reject insufficient evidence.

Wave exit criteria:

- each module passes its own tests.
- no module imports another module's private implementation.
- interface changes, if any, are reviewed and reflected in docs.

### Wave 4: Stage Core, Stage Modules, And Stage Interface

Purpose:

- assemble the runtime and expose the governed LLM-facing stage.

These subagents may work in parallel only if they depend on public ports and
do not edit each other's owned paths.

Subagent: Stage Core Subagent.

Owned write paths:

- `src/runtime/**`
- `test/runtime/**`

Consumes:

- module factories from previous waves.
- provider adapters.
- repository factories.

Required behavior:

- construct the runtime graph.
- register providers during startup.
- initialize generated Handbook output.
- expose `runtime.ready`.
- avoid moving module-owned business behavior into runtime composition.

Subagent: Stage Modules Subagent.

Owned write paths:

- `src/stage/**`
- `test/stage/**`

Consumes:

- `StageKernelPort`
- `MemoryPort`
- `EventPort`

Required behavior:

- get and update sessions.
- carry `StageVibe` through Session Context.
- prepare materials for LLM use.
- gate material states according to purpose.

Subagent: Stage Interface Subagent.

Owned write paths:

- `src/instruments/**`
- `src/tool_api/**`
- `src/handbook/**`
- `test/instruments/**`
- `test/tool_api/**`

Consumes:

- `InstrumentCatalogPort`
- core module public ports.

Required behavior:

- list LLM-visible instruments.
- expose Handbook lookup.
- dispatch stable tool names.
- hide provider internals.
- route `stage.context.read`, `stage.materials.prepare`,
  `music.material.resolve`, `music.links.refresh`, `events.record`,
  `memory.propose`, `effects.propose`, and `session.update`.
- keep `InstrumentCatalogPort` independent from Session Context private
  implementation; only `ToolDispatchPort` may call Stage Modules and core ports
  through injected public dependencies.

Wave exit criteria:

- Stage Core, Stage Modules, and Stage Interface tests pass.
- any Stage Interface / Stage Module cycle is handled by dependency injection or a
  composition root, not private cross-imports.

### Wave 5: Composition And End-To-End MVP Slice

Purpose:

- prove the MVP chain through Stage Core and public ports.

Subagent: Integration Subagent.

Owned write paths:

- `src/app/**`
- `test/integration/**`
- `fixtures/integration/**`
- `docs/mvp/verification-report.md`

Forbidden write paths:

- module private directories from previous waves unless the coordinator assigns
  a specific fix after review.

Required behavior:

- construct a runtime with in-memory storage and fixture providers.
- run one realistic recommendation transcript.
- prove playable links appear only when source-backed.
- prove events are recorded.
- prove memory updates remain proposals until accepted.
- prove external actions remain effect proposals.

Wave exit criteria:

- end-to-end test or smoke script passes.
- verification report distinguishes implemented behavior, thin stubs, and
  future work.

### Wave 6: Final Review And Documentation Sync

Purpose:

- make the implementation and docs consistent.

Optional subagents:

- Final Spec Review Subagent, read-only.
- Final Code Quality Review Subagent, read-only.
- Documentation Sync Subagent.

Documentation Sync owned write paths:

- `README.md`
- `INDEX.md`
- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `docs/mvp/**`
- `plan/**`

Required behavior:

- update status docs to reflect actual implementation.
- preserve distinction between implemented behavior, stubs, and future work.
- record verification commands and outcomes.

Wave exit criteria:

- full verification command passes or the blocker is documented.
- state docs are synchronized.

## Parallel Dispatch Matrix

| Wave | Parallel Writers Allowed | Reason |
| --- | --- | --- |
| Wave 0 | No code writers | repository and contracts still gating |
| Wave 1 | No | shared contracts and ports are blocking |
| Wave 2 | Yes | storage and plugin registry own disjoint paths |
| Wave 3 | Yes | core modules own disjoint paths and consume public ports |
| Wave 4 | Conditional | Stage and Instruments can parallel only through ports |
| Wave 5 | No | integration touches wiring and verifies combined behavior |
| Wave 6 | Conditional | read-only reviews can parallel; docs sync writes alone |

## Stop Conditions

The coordinator stops dispatching new implementation subagents if:

- repository boundary is unresolved.
- public ports contradict each other.
- two subagents need the same write path.
- a subagent requests a breaking interface change.
- tests reveal a cross-module contract mismatch.
- implementation requires product scope beyond `proposal.md`.

## Completion Definition

The subagent-executed MVP is complete only when:

- contracts and ports exist in source.
- all MVP modules have implementation behind their public ports.
- modules communicate only through approved communication forms.
- end-to-end recommendation slice passes.
- event, memory proposal, material state, and effect boundary behavior are
  verified.
- docs are synced with actual implementation state.
