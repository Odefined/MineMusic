# ADR-0008: Command-Owned Write Boundaries

## Status

Accepted

## Context

Formal v1 separates repositories from commands. Repositories are low-level
persistence accessors. Commands express owned write intent, enforce invariants,
and coordinate related tables or state.

That split is not limited to source-of-truth fact writes. Import batches, item
outcomes, projections, dirty targets, caches, events, snapshots, and other
mutable runtime or durable state can also corrupt ownership if workflow code
writes them directly.

Architecture drift can happen when an orchestration module calls a repository
factory such as `create*Repositories(...)` and then calls `insert`, `upsert`,
`delete`, or SQL `run(...)` itself. The code may compile and tests may pass, but
the owning command boundary has been bypassed.

## Decision

All MineMusic writes are command-owned.

A production write must happen through one of these owning boundaries:

- a repository implementation that owns mechanical persistence details;
- an owning command/materializer/projection command that expresses business or
  maintenance write intent;
- schema/migration/storage infrastructure that owns DDL or adapter internals.

Tests and fixtures may write through repositories directly when they are
intentionally testing low-level persistence, constructing fixtures, or asserting
storage behavior.

Workflow/orchestration modules must not call repository write methods directly.
This includes import services, query services, Stage Interface handlers,
provider/plugin adapters, presentation code, and ordinary domain services.

Repository factories such as `create*Repositories(...)` construct low-level
persistence accessors. They are not workflow APIs. A workflow that needs a write
must call the owning command or introduce a new command boundary first.

Every PR that adds or moves a write must name:

- the owning bounded context;
- the owning command/materializer/projection-maintenance boundary;
- the exact writes it performs;
- the architecture guard that prevents the same write from moving into an
  orchestration layer.

## Rejected Alternatives

- Restrict the rule only to source-of-truth fact writes: rejected because
  projections, import state, cache state, events, dirty markers, and runtime
  state also need owned write boundaries.
- Allow Music Data Platform workflows to write repositories directly because
  they are in the same bounded context: rejected because workflows and commands
  have different responsibilities.
- Rely on review discipline without executable guards: rejected because this
  failure mode is easy to miss in code that otherwise compiles and passes
  behavior tests.
- Treat `create*Repositories(...)` as a convenience API for workflow code:
  rejected because it hides low-level persistence behind a misleading factory
  name and bypasses command invariants.

## Consequences

- Existing direct repository writes in production workflow code are
  architecture violations to repair, not patterns to copy.
- New write paths must introduce or reuse an explicit command boundary before
  workflow code can call them.
- Architecture guards should fail when orchestration modules import repository
  factories or call repository write methods directly.
- PR plans and reviews must inspect write ownership before style or local
  behavior.
