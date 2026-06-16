# ADR-0011: Candidate Commit Boundary in Music Data Platform

## Status

Accepted

## Context

A read-only music discovery query can return unconfirmed provider candidates
(Music Discovery Handle kind `candidate`) backed by TTL runtime cache, not by
durable records. Before such a candidate can be saved, played, favorited, or
otherwise acted on durably, it must become a durable material.

The deleted Material Resolve concept once stated that "only the final
recommendation presentation boundary may consume a selected `ephemeral_material`
and turn it into a durable material record." The formal rebuild needs an
equivalent, ownership-clean materialization boundary, but it must not live in
Stage Interface (presentation) or Music Intelligence (query/recall).

## Decision

Candidate materialization is a Candidate Commit boundary owned by Music Data
Platform as an owning command/materializer. It turns a `material_candidate` into
a durable material through the existing source/material/binding write commands
and triggers projection invalidation. It is the only place an unconfirmed
candidate becomes durable identity.

Stage Interface tools never materialize; they only surface candidates. The
boundary is a future-phase artifact: until it exists, no tool advertises
save/play/favorite on candidate handles, and candidate handles are explicitly
read-only.

The commit command's input is a Music Discovery Handle (kind `candidate`) from
the Public Agent Protocol, never an internal ref. At commit time the handle-veil
resolves the handle back to the internal `materialCandidateRef`/runtime cache
(Phase 15) inside MineMusic; the agent never sees the internal ref. This closes
the loop between the public seam (ADR-0012) and the commit boundary.

## Rejected Alternatives

- Materialize at the Stage Interface presentation boundary, reviving the deleted
  Material Resolve rule: rejected; presentation must not own durable identity
  writes, and Material Resolve is a Deleted Formal v1 Surface.
- Materialize inside Music Intelligence Retrieval: rejected; Retrieval owns
  query and recall, not durable identity writes.
- Let each action tool (save/play/favorite) materialize inline: rejected; it
  duplicates materialization logic and bypasses a single owning command, weakening
  the command-owned write boundary (ADR-0008).
- Keep candidates forever ephemeral: rejected; users must be able to durably
  keep discovered items.

## Consequences

- A future Music Data Platform command owns candidate-to-durable materialization
  and the resulting projection invalidation.
- Read-only discovery tools advertise no save/play until the commit boundary and
  the action tools exist.
- `CONTEXT.md` records Candidate Commit as the formal successor to the deleted
  ephemeral-material presentation rule.
- The boundary keeps durable identity writes inside Music Data Platform, aligned
  with ADR-0008.
