# ADR-0022: Effect Boundary Auto-Pass For User-Requested Library Intake

## Status

Accepted

## Context

ADR-0010 declared tool side effects on durable state, runtime state, and
external calls, and ADR-0021 widened the conservative Effect Boundary gate for
presentation-driven admission writes only. Phase 18 adds `library.import.start`
and `library.import.continue`, which read an external account library and write
owner-scoped Source Library, source, material, binding, import batch, and
projection facts through Music Data Platform commands.

If these tools used the default conservative durable-write behavior, they would
route to `ask`, but the current product has no real ask/approval loop. Requiring
Import Preview first would also block Phase 18 because no preview service exists
yet and the import path is already page-bounded, idempotent, and scoped to the
owner's local library.

## Decision

The Effect Boundary auto-pass path is widened for owner-scoped,
user-requested library intake. A tool with `defaultDecision="auto"`,
`durableUserStateWrite=true`, and `intakeDrivenByUserRequest=true` may pass with
metadata audit when the durable write is bounded to Library Import persistence
for the owner's MineMusic library.

The same durable-write tool without `intakeDrivenByUserRequest=true` still
routes to `ask`; `deny` still denies; read-only auto behavior and the
presentation-driven admission qualifier remain unchanged. `externalCall`
remains declared side-effect truth, but the current gate is still
durable-write-centric and does not yet enforce external-call approval.

## Rejected Alternatives

- **Route intake tools to `ask`**: rejected because Phase 18 has no
  user-facing ask/approval loop, so the import tools would be exposed but
  unusable through dispatch.
- **Require Import Preview before import**: rejected for Phase 18 because no
  preview service exists yet; intake safety comes from explicit user request,
  page-bounded execution, idempotency, compact summaries, and reconciliation.
- **Build a minimal real ask loop first**: rejected because it is a broader
  Effect Boundary product workflow and would delay the library-intake closure.

## Consequences

- `library.import.start` and `library.import.continue` can run end to end after
  an explicit user request to import or update the owner library.
- The qualifier is narrow: other durable writes cannot inherit this exception
  unless they are explicitly owner-scoped, user-requested Library Import
  intake.
- Every auto-passed intake write records metadata audit so later approval work
  can distinguish consented library intake from ordinary durable mutation.
