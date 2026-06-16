# ADR-0012: Music Discovery as a Public Agent Protocol Seam over Retrieval

## Status

Accepted

## Context

MineMusic needs a public agent-facing term for read-only music candidate
retrieval. The formal rebuild has an internal Music Intelligence Retrieval
capability (Phase 12 and Phase 15) and a deleted Material Resolve surface.

Exposing internal Retrieval directly (`materialRef`, `materialCandidateRef`,
`sourceRef`, `canonicalRef`, pool algebra, `resultSetId`) would leak internal
anchors to agents and violate the Public Agent Protocol. Reviving Material
Resolve would reverse a formal deletion. A separate, deliberately abstracted
public term is wanted, but it must not become a speculative unified "discovery"
abstraction over Memory, recommendation, or Knowledge, because no owning
contexts for those backends exist yet.

## Decision

Music Discovery is a Public Agent Protocol term and a deliberate seam over Music
Intelligence Retrieval. It hides durable material, material candidate, source,
canonical, pool-algebra, and result-set internals behind public handles (Music
Discovery Handle, Music Scope Handle) and public result semantics. It
distinguishes a known catalog item from an unconfirmed provider candidate
through public result semantics, never through internal refs.

Today Music Discovery maps 1:1 to Retrieval local plus provider candidate
recall. It is a subset / intentional seam, not a forward abstraction over
unbuilt backends.

Music Discovery is exposed as the Stage Interface instrument `music.discovery`
with tools `music.discovery.search` and `music.discovery.list_scopes`.
Music-domain agent tools use the `music.` namespace; runtime and system tools use
`stage.`. Material Resolve stays deleted.

## Rejected Alternatives

- Expose Retrieval directly as the agent tool: rejected; it leaks internal
  anchors and violates the Public Agent Protocol.
- Revive Material Resolve as the public surface: rejected; it reverses a formal
  deletion (Deleted Formal v1 Surface).
- Define Music Discovery as a forward unified abstraction over
  Memory/recommendation/Knowledge: rejected; it is speculative, no owning
  contexts exist for those backends, and it violates "avoid speculative
  abstractions".
- A 1:1 rename alias of Retrieval: rejected; it provides no seam value and still
  implies exposing the internal shape.

## Consequences

- `CONTEXT.md` adds Music Discovery, Music Discovery Handle, and Music Scope
  Handle under the Public Agent Protocol family.
- Public outputs never carry internal refs; a handle-veil architecture guard
  enforces this over each tool's `outputSchema`.
- The seam lets Retrieval internals change without breaking the public contract.
- Music Discovery is the first instance of the Tool Framework (ADR-0009); future
  agent-facing capabilities follow the same public-seam discipline.
