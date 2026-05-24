# Agent Collaboration Protocol

This protocol lets independent agents build MineMusic modules without breaking
module boundaries.

## Shared Ground Rules

1. Read `proposal.md`, `ARCHITECTURE.md`, `docs/mvp/interface-contracts.md`,
   `docs/mvp/module-interfaces.md`, `docs/mvp/communication-protocols.md`, and
   the relevant ownership note before editing.
2. Claim a workstream before editing.
3. Edit only owned paths unless an interface change requires coordination.
4. Communicate through public contracts, not private module internals.
5. Do not widen MVP scope without recording a proposal.
6. Keep thin stubs honest. A stub must not pretend behavior is implemented.

## Work Claim

Each agent starts with a short claim in its task thread or a coordination note:

```text
Agent:
Workstream:
Owned paths:
Public contracts consumed:
Public contracts produced:
Expected tests:
Known blockers:
```

If file-based coordination is available, use:

```text
docs/mvp/coordination/<workstream>-claim.md
```

## Interface Change Request

Any change to shared contracts, tool names, module public ports, material states,
communication forms, error semantics, or effect semantics requires a written
request before implementation.

Use this shape:

```text
Title:
Requester:
Affected contracts:
Affect public ports:
Affected workstreams:
Current problem:
Proposed change:
Backward compatibility:
Migration needed:
Tests to update:
Decision:
```

If file-based coordination is available, use:

```text
docs/mvp/coordination/interface-change-<slug>.md
```

## Handoff Packet

Every agent finishes with a handoff packet:

```text
Workstream:
Status: complete | partial | blocked
Files changed:
Public APIs added or changed:
Contracts consumed:
Tests run:
Known gaps:
Impact on other workstreams:
Next recommended step:
```

The handoff must distinguish:

- implemented behavior.
- thin stubs.
- unimplemented future work.
- tests that passed.
- tests not run.

## Conflict Rules

If two agents need the same file:

1. Prefer moving shared definitions into `src/contracts`.
2. Prefer a public interface over direct imports.
3. Let the owning workstream edit the file.
4. If ownership is unclear, stop and write an interface change request.

## Review Rules

Reviewers should check:

- module stayed inside owned paths.
- public API matches `docs/mvp/interface-contracts.md`.
- no provider internals leaked into core modules.
- no source ref became canonical authority by accident.
- no weak LLM inference became durable memory.
- no external action bypassed the effect boundary.
- tests or verification match the risk of the change.

## Minimum Verification Per Workstream

Contracts:

- type or schema validation.

Stage Core:

- runtime composition tests.
- provider registration startup tests.
- generated Handbook initialization tests.

Stage Modules:

- session context and material-state gating tests.

Stage Interface:

- tool descriptor and dispatch tests.

Canonical Store:

- external ref attachment and provisional identity tests.

Material Resolve and Source Grounding:

- candidate resolve, playable, source-only, exploration, unresolved, and blocked
  state tests.

Events, Memory, Effects:

- separation tests for event, memory proposal, and effect proposal behavior.

Plugin Slots and Storage:

- provider registration and repository isolation tests.

Host Adapters:

- host protocol translation and Stage Interface delegation tests.

Integration:

- end-to-end transcript or smoke test for the MVP recommendation chain.
