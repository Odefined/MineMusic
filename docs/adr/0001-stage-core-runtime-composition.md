# ADR-0001: Stage Core Means Runtime Composition

## Status

Accepted

## Context

The earlier documentation used `Stage Modules` as the central stage concept. As
the implementation grew, that name started covering unrelated responsibilities:

- runtime construction.
- provider registration.
- generated Handbook initialization.
- session context.
- material presentation safety.
- instrument and tool exposure.

That made the layer model blurry. It also made `Stage Core` sound like a
session/material module, even though the project needs a name for the runtime
composition and lifecycle module.

## Decision

`Stage Core` means runtime composition and lifecycle.

Stage Core owns:

- creating the runtime graph.
- wiring repositories, Core Capabilities, Stage Modules, and Stage Interface.
- registering plugin providers.
- initializing generated runtime artifacts such as the Handbook.
- exposing `runtime.ready`.
- maintaining one MineMusic runtime instance.

`Stage Core` does not mean "put every business implementation in one module."
Source Resolution, Canonical Store, Event Service, Memory Service, Effect
Boundary, Music Knowledge, Plugin Slots, and Storage keep their own module
ownership.

The current Stage Modules are exposed through explicit ports:

- Session Context.
- Material Gate.

## Consequences

- `src/stage_core/index.ts` is the current Stage Core implementation.
- `src/stage/index.ts` is not Stage Core. It implements Session Context and
  Material Gate through separate `SessionContextPort` and `MaterialGatePort`
  factories.
- Host Adapters should call Stage Interface rather than Core Capability modules
  directly.
- Stage Interface owns the host-facing callable surface through
  `MineMusicStageInterface`.
- Future architecture reviews should not re-suggest making Stage Core a
  session/material gate module.
