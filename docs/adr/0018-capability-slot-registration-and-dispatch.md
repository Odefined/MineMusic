# ADR-0018: Capability Slot Registration and Dispatch Architecture

## Status

Accepted

## Context

The Extension area has two capability slots (`source-provider`,
`platform-library-provider`) that are near-mirror images. Each slot file
re-implements three layers of per-slot boilerplate around an under-used
`CapabilityRegistry`:

- `register`/`list`/`get` wrappers that map the slot-specific registration shape
  (`{ providerId, provider }`) to the generic registry shape (`{ key, value }`)
  and run slot-specific descriptor validation;
- a dispatch function (`searchSourceProvider` / `readPlatformLibraryProvider`)
  that re-implements the same 8-step skeleton (find registration → capability
  check → invoke → result-shape check → error passthrough → output validation);
- type guards (`isRecord`, `isStageErrorLike`, `isSourceEntityKind`) duplicated
  across files.

Adding a new slot touches ~6 sites. `CapabilityRegistry` already owns
registration mechanics (cardinality, core-only, key safety) but dispatch lives
duplicated in each slot. The architecture review (deepening candidate #3)
surfaced this.

A separate, smaller issue: `SourceProviderCapability` declares `"lookup"` but no
`SourceProvider.lookup` method, runtime seam, or output validation exists for it
— a declared-but-dead capability that makes the contract untrustworthy.

## Decision

**Dispatch is a separate concern from registration.**
`capability_registry.ts` stays registration-only (`register`/`list`/`get` +
registration validation). The shared 8-step dispatch skeleton moves to a new
`capability_dispatch.ts` exposing a generic
`invokeCapability(registry, slot, providerId, descriptor)`. Each slot's
search/read becomes a thin caller that supplies a descriptor
`{ capabilityCheck, invoke, validateOutput, shapeResult, errorCodes }`.

Rejected: having the registry own dispatch (the review report's original vision).
Registration (write-side: validate + store) and dispatch (read-side: find +
invoke + validate output) are different concerns with different callers
(activation vs query/import) and different dependencies (dispatch is async,
calls provider methods, validates domain output shapes). Putting both in the
registry grows it toward a god-module and doubles its test surface.

**Registration is generic and open/closed.** `PluginActivationContext` exposes a
single typed `ctx.register(slot, { key, value })` instead of per-slot
`registerSourceProvider` / `registerPlatformLibraryProvider` methods.
`CapabilitySlot` gains a `validateRegistration` callback so slot-specific
descriptor validation runs through the generic path. This collapses the per-slot
`register`/`list`/`get` wrappers, the activation-context per-slot methods, and
the `createExtensionRuntime` ctx closures. Adding a slot no longer edits the
activation context or runtime wiring (~6 sites → ~2: define the slot with its
validator + write its dispatch descriptor).

**Shared type guards.** `isRecord`, `isResultLike`, `isSourceEntityKind`, and
`isStageErrorLike` move to a shared extension module. `isStageErrorLike`
reconciles to the strict shape `{ code, message, area, retryable }` (matching the
`StageError` contract, where `area` is mandatory and load-bearing); the looser
slot copies that omitted `area` are removed. Slot-specific result-shape checkers
(`isProviderSearchResult`, `isProviderReadResult`) stay in their slots.

**`"lookup"` removed.** `SourceProviderCapability` drops the `"lookup"` literal
(and the corresponding `isSourceProviderCapability` branch). Its semantics are
unresolved (lookup by sourceRef? single-entity resolve? cache? canonical
resolution?) and it has no method, seam, or validation. It will be re-added only
when its semantics are designed and connected to SourceEntity persistence /
canonical resolution.

## Consequences

- A new capability slot declares itself in one place (slot definition + dispatch
  descriptor) without editing the activation context or runtime wiring.
- `CapabilityRegistry` keeps a single, well-tested responsibility; dispatch logic
  has one home, so a skeleton bug (error passthrough, retryable handling) is
  fixed once.
- Provider errors without `area` are now rejected as malformed (previously
  silently passed through by the slot guards) — a behavior tightening that
  matches the mandatory-`area` `StageError` contract.
- The dispatch descriptor carries 5–6 hooks; it is the most hook-heavy part of
  this design and the part most worth scrutinising if a future slot finds it
  awkward.
- `ExtensionRuntime`'s public surface (`list`/`get`/`search`/`read` methods) is
  unchanged; only its internals move to the registry + dispatch module.

## References

- AGENTS.md — bounded-context ownership; one owner per concern.
- ADR-0013 — the same "avoid speculative abstractions" principle, applied here to
  the removed `lookup` and to the deliberately-deferred slot metadata.
- ADR-0016 — tool descriptor/handler registration separation (a parallel but
  separate registration system in Stage Interface). This ADR is the
  Extension/provider-slot analogue and deliberately does not unify the two
  layers (tools are agent-facing; provider slots are internal evidence sources).
