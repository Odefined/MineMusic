# ADR-0023: Effect Boundary Auto-Pass For Owner Relation Edits

## Status

Accepted

## Context

ADR-0010 declared tool side effects, ADR-0021 allowed presentation-driven
candidate admission writes, and ADR-0022 allowed user-requested library intake
writes. Phase 19 adds explicit `library.relation.*` tools for owner-scoped
saved/favorite/blocked facts over already durable MineMusic library items.

These edits are durable user-state writes, but they are local-only, bounded to
one resolved library item, and driven by explicit user intent such as save,
favorite, block, or remove that relation. Routing them to `ask` would expose the
tools but make them unusable until the broader approval loop exists.

## Decision

Add a dedicated invocation-policy qualifier:
`ownerRelationDrivenByUserRequest?: boolean`.

The conservative Effect Boundary gate may auto-pass a tool when:

- `invocationPolicy.defaultDecision = "auto"`;
- `sideEffect.durableUserStateWrite = true`;
- `invocationPolicy.ownerRelationDrivenByUserRequest = true`.

The gate records metadata audit with internal reason
`auto owner-scoped relation edit`.

This qualifier applies to explicit owner relation edit tools only. It is not
used by read-only `library.relation.get`, Library Import, candidate admission,
Collection membership, provider-side save/like/block APIs, or generic durable
mutation tools.

## Rejected Alternatives

- **Reuse `intakeDrivenByUserRequest`**: rejected because library intake reads
  provider pages and writes source-library/import facts, while relation edits
  mutate existing owner relation facts for one durable item.
- **Expose one generic `library.relation.set`**: rejected because explicit tools
  give the agent clearer selection boundaries and keep save/favorite/block
  semantics inspectable.
- **Route relation edits to `ask`**: rejected for Phase 19 because the product
  still lacks a user-facing approval loop.

## Consequences

- `library.relation.save`, `.unsave`, `.favorite`, `.unfavorite`, `.block`, and
  `.unblock` can dispatch through the current conservative gate after explicit
  user intent.
- Unqualified durable-write tools still route to `ask`; `deny` still denies;
  read-only durable-state behavior remains unchanged.
- Relation edit auto-pass is distinguishable in audit from presentation
  admission and library intake.
