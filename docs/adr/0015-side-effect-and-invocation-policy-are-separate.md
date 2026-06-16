# ADR-0015: Side-Effect and Invocation Policy Are Separate

## Status

Accepted

## Context

ADR-0010 established a three-axis side-effect declaration so provider-backed
Music Discovery can honestly declare both runtime state writes and external
provider calls while writing no durable user state. That remains correct, but
the Stage Interface Tool Frame review found that side-effect truth alone is too
coarse for agent invocation: the model and Effect Boundary also need the default
call posture, data-egress posture, and rate/cost hints.

If these concerns stay inside `sideEffect`, the side-effect object becomes a
mixed truth-and-policy bag. If they are omitted, provider-account reads can look
as safe as local reads even though query text may leave MineMusic through a
connected provider account.

## Decision

Keep ADR-0010's three-axis `sideEffect` as static capability truth:

```text
{ durableUserStateWrite, runtimeStateWrite, externalCall }
```

Add a separate mandatory `invocationPolicy` for Public Agent Protocol tools:

```text
{
  defaultDecision: "auto" | "ask" | "deny",
  dataEgress: "none" | "provider_account" | "open_world",
  readOnlyHint: boolean,
  destructiveHint: boolean,
  maxCallsPerTurn?: number
}
```

Effect Boundary owns interpretation and enforcement of invocation policy. Stage
Interface declares and carries it but must not enforce it at dispatch time.

Auto-invocation now depends on both objects: durable user-state writes are a hard
safety stop, and `invocationPolicy.defaultDecision` supplies the default
invocation posture for tools that pass that hard stop.

## Rejected Alternatives

- Replace ADR-0010's three-axis `sideEffect` with a larger policy object:
  rejected; it would blur capability truth with approval/egress policy.
- Keep auto-invocation derived only from `durableUserStateWrite`: rejected; it
  loses the explicit model-facing default decision and egress posture.
- Let Stage Interface enforce `invocationPolicy`: rejected; Effect Boundary owns
  permission, approval, audit, and execution policy.

## Consequences

- Tool Declaration gains mandatory `invocationPolicy` for public tools.
- ADR-0010 is amended: `durableUserStateWrite: false` remains required for
  auto-invocation but is no longer the whole default-invocation rule.
- Provider-backed Music Discovery search declares provider-account egress while
  remaining auto-eligible because it writes no durable user state.
- Architecture guards must require `invocationPolicy` and must keep Stage
  Interface from importing or implementing side-effect/invocation-policy
  enforcement.
