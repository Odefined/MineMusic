# ADR-0009: Tool Framework — Mandatory Core with Owned Dimensions

## Status

Accepted

## Context

MineMusic's agent-facing surface is Stage Interface, which already carries a
minimal `StageInterfaceContract` (`src/contracts/index.ts`): instruments, tools,
`outputPolicy: "compact_public"`, module contribution, registration validation
(uniqueness, every tool belongs to an instrument), and dispatch. The formal
rebuild will add many tools across domains (music discovery, library, playback,
memory, admin).

External research
(`docs/minemusic_stage_interface_tool_frame_external_research.md`) identifies
roughly twelve design dimensions a mature agent tool frame carries (identity,
input/output schema, side-effect, permission, runtime policy, error model,
handbook, versioning, and so on). A flat, single-owner tool descriptor would
either bloat Stage Interface into a god-context — absorbing side-effect,
permission, and runtime policy that `AGENTS.md` and `CURRENT_STATE.md` assign to
Effect Boundary and Stage Core — or leave tools to evolve ad hoc with no shared
guarantees.

The framework must be extensible (new tools, instruments, and dimensions added
without breaking existing tools) and maintainable (each dimension has a clear
owning bounded context plus an architecture guard).

## Decision

The Tool Framework is a coordinating assembly over a MANDATORY CORE plus
EXTENSIBLE OWNED DIMENSIONS, extending the existing `StageInterfaceContract`
rather than replacing it.

Every Tool Declaration carries a mandatory core:

```text
name, instrumentId, label, ownerArea,
outputPolicy: "compact_public",
sideEffect: { durableUserStateWrite, runtimeStateWrite, externalCall },
inputSchema, outputSchema, handler
```

plus optional extensible dimensions:

```text
description, examples, allowedActions, requiresProvider,
runtimePolicy, contractVersion
```

Each dimension is OWNED by its bounded context:

- Stage Interface owns identity, input/output schema, dispatch, compact output,
  and public error mapping.
- Effect Boundary owns side-effect enforcement (gating, approval, audit).
- Stage Core owns runtime policy (timeout, retry, partial results).
- Extension owns provider availability that affects visibility.
- Owning commands own durable writes.

The framework assembles a Tool Declaration from each owner's contribution.
Extensibility is achieved by adding optional dimensions with defaults so
existing tools are unaffected. Maintainability is achieved by per-dimension
ownership plus architecture guards.

## Rejected Alternatives

- A single flat, wide `ToolDescriptor` owned entirely by Stage Interface:
  rejected; Stage Interface becomes a god-context, absorbing side-effect,
  permission, and runtime policy that belong to Effect Boundary and Stage Core.
- A minimal core with dimensions added ad hoc per tool: rejected; tools diverge,
  there are no shared guarantees, and there is no framework.
- A separate "Tool Frame" module that owns every dimension: rejected; it
  violates bounded-context ownership (side-effect enforcement is Effect
  Boundary's responsibility).

## Consequences

- `StageInterfaceContract` / `ToolDescriptor` gains mandatory `sideEffect`,
  `inputSchema`, and `outputSchema` fields plus optional extensible fields.
- New architecture tests enforce namespace, schema-required, the public-handle
  veil, and handler-import discipline at registration.
- The framework can grow new dimensions without breaking existing tools (optional
  fields plus `contractVersion`).
- The one contract type the framework evolves is `StageError`, which gains an
  optional `suggestedFix?: string` (a model-actionable next step) for the public
  error mapping; the rest of the `Result<T>` / `StageError` / `StageWarning` /
  `ToolCallOutput` skeleton is used unchanged — there is no second tool-result
  envelope.
- Music Discovery is the first instance; future domains instantiate the same
  skeleton.
- See ADR-0010 (side-effect), ADR-0011 (candidate commit), and ADR-0012 (Music
  Discovery seam).
