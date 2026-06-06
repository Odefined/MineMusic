# ADR-0005: Formal Top-Level Architecture Areas

## Status

Accepted

## Context

The MVP architecture used terms such as Stage Modules, Core Capabilities,
Plugin Slots, Material Store, Canonical Store, Material Flow, and Knowledge
Slot. Those names became a mix of product metaphor, runtime wiring,
implementation module, provider abstraction, and business responsibility.

Formal v1 needs a smaller set of top-level areas that match MineMusic's product
position: an agent workspace for music experience, grounded data, provider
replaceability, long-term memory, and governed effects.

## Decision

Formal top-level architecture areas are:

1. Server Host
2. Stage Interface
3. Stage Core
4. Extension
5. Music Data Platform
6. Music Intelligence
7. Music Experience
8. Memory
9. Effect Boundary

`Stage` remains a product metaphor and naming root for MineMusic as an agent
workspace/workbench. It is not a separate top-level architecture area.

Server Host owns process/transport hosting and keeps one composed Stage Runtime
alive. Stage Core owns Stage Runtime graph composition, capability wiring,
initialization, and readiness. Extension owns Plugin System, Capability Slots,
manifests, lifecycle metadata, and replaceability semantics.

Stage Interface owns agent-facing instruments, tools, schemas, Handbook,
validation, dispatch, compact public output, and session-aware availability.
Instrument and Tool are workspace/interface structure, not bounded contexts and
not capability slots.

Music Data Platform owns source/material/canonical identity, owner-scoped fact
families, Collection, Library Import / Update persistence, projections, and
Canonical Maintenance.

Music Intelligence contains Retrieval and Knowledge only. Music Experience owns
radio/listening interaction state and behavior. Memory is independent
long-term user/music relationship state. Effect Boundary owns permission,
approval, audit, and side-effect execution policy.

## Rejected Alternatives

- Top-level `Stage`: rejected because it would become a catch-all bounded
  context.
- `Runtime & Extension`: rejected because runtime composition and plugin
  semantics have different ownership.
- `Source Provider Platform`: rejected because providers are Extension
  capability implementations, not the product's top-level architecture.
- `Provider Slot`: rejected in favor of typed Capability Slots under Plugin
  System.
- Top-level `Events`, `Storage`, or `Owner Context`: rejected because those are
  infrastructure/substrate or fact families inside owning areas.
- Generic `Workflow Layer`: rejected because it would mix services with
  different read/write capabilities and owners.

## Consequences

- Root architecture and future area docs use the nine-area taxonomy.
- Existing MVP area names remain evidence until rewritten by their owning
  formal phase.
- Stage Interface tool/instrument grouping does not define internal bounded
  contexts.
- Provider adapters declare supported capability slots and operations through
  Extension manifests.
- Music Experience, Memory, and Effect Boundary remain separate areas even when
  a user-facing flow touches all three.
