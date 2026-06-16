# ADR-0010: Multi-Axis Side-Effect Declaration with Effect Boundary Enforcement

## Status

Accepted

## Context

External guidance often models tool side-effect as a single-axis enum
(`none | request_scoped | writes_user_state | external_action | admin_core`).
For a read-only music discovery query that includes provider candidates this is
insufficient: such a query writes TTL-backed runtime result-set and candidate
cache state (request-scoped) AND makes external provider calls (open-world),
while writing NO durable user state. No single enum value captures this, and
classifying it as `none` or `readOnly` (as the research doc initially suggested)
is wrong.

The safety-critical axis for auto-invocation is whether a tool writes durable
user state, not whether it calls an external service or writes runtime cache.
Provider search is an external READ: it does not change the user's external
account or any MineMusic durable fact.

## Decision

A Tool Declaration's side-effect is a three-axis declaration:

```text
{ durableUserStateWrite, runtimeStateWrite, externalCall }
```

Each axis is a registration-time CAPABILITY — a static boolean, not a per-call
actual. `externalCall: true` means the tool CAN make external calls (for example
when a provider scope is requested); whether a given invocation actually does
depends on input, but the declared axis is static because a registration guard
cannot evaluate input.

Stage Interface DECLARES these axes as tool metadata. Effect Boundary OWNS
enforcement (auto-invocation gating, approval, audit). Auto-invocation gates
only on `durableUserStateWrite: false`.

Declaration is mandatory at registration in the first version. Enforcement is
deferred until the Effect Boundary is implemented, and the gap is documented; the
registration guard only verifies that a declaration is present.

A read-only provider-candidate search declares
`durableUserStateWrite: false`, `runtimeStateWrite: true`, `externalCall: true`
and remains auto-invocable because no durable user state changes and no
irreversible external effect occurs.

## Rejected Alternatives

- A single-axis side-effect enum: rejected; it cannot represent simultaneous
  runtime-write and external-call, and it loses the durable-write safety axis
  that actually gates auto-invocation.
- Classify provider-candidate search as `sideEffect: none` / `readOnly`:
  rejected; it writes runtime state and calls providers.
- Stage Interface stub-enforces side-effect itself: rejected; enforcement
  belongs to Effect Boundary, not Stage Interface.
- Defer the whole dimension until Effect Boundary exists: rejected; tools could
  not declare side-effect and auto-invocation gating would have no carrier.

## Consequences

- `ToolDescriptor` gains a mandatory `sideEffect` object.
- Effect Boundary, when implemented, reads the declaration to gate
  auto-invocation and approval; Stage Interface carries metadata only.
- An architecture guard requires every Tool Declaration to declare `sideEffect`.
- Provider-candidate tools stay auto-invocable because their
  `durableUserStateWrite` is `false`.
- Data egress consent for provider calls is obtained at provider-connection
  time, not per search.
