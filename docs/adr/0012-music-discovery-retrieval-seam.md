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
Item Handle, Music Scope, and Music Library Scope Handle) and public result
semantics. It distinguishes a known MineMusic library item from an unconfirmed
provider candidate through public result semantics, never through internal refs.
Music Item Handle carries an opaque kind-scoped public `id`; library handles do
not expose `materialRef`, and candidate handles do not expose
`materialCandidateRef`, provider entity ids, provider item ids, or raw provider
keys. Candidate handles are bound to the candidate cache lifetime, not to the
lookup cursor or result window that first exposed them.

Today Music Discovery maps 1:1 to Retrieval local plus provider candidate
recall. It is a subset / intentional seam, not a forward abstraction over
unbuilt backends.

Music Discovery is exposed as the Stage Interface instrument `music.discovery`
with tools `music.discovery.lookup` and `music.discovery.list_scopes`.
`lookup` is the public tool action because the first concrete tool is driven by
music lookup text such as title, artist, album, or known alias; it is not a
semantic mood search, recommendation prompt, or scope-browsing tool.
Music-domain agent tools use the `music.` namespace; runtime and system tools use
`stage.`. Material Resolve stays deleted.

`music.discovery.lookup` uses public `MusicScope` values, not internal Retrieval
`pools`. Scopes are the reusable agent-facing retrieval-source vocabulary:
abstract scope handles (`all`, `library`), concrete Music Library Scope Handle
values (`source_library` | `relation` in v1, extensible to future library scope
kinds such as Collection), and Music Provider Scope Handles for connected
searchable providers. Provider search is therefore a public provider scope, but
it is not an abstract scope and not a Music Library Scope Handle; it does not
expose provider entity ids, raw provider keys, or Retrieval pool algebra. Future
scoped tools must reuse these scope handles instead of minting tool-specific
aliases for the same underlying library/provider scope.
Music Library Scope Handle ids are opaque public ids privately mapped by
MineMusic; they are not source library refs, owner relation pool refs,
Collection row ids, or parseable internal ref keys.
`MusicProviderScopeHandle.providerId` is the public provider registry id reused
across agent-facing provider-aware tools; it is not a tool-local id, provider
entity id, provider account id, raw provider key, or generic scope `id`.
`music.discovery.list_scopes` lists explicit selectable scopes, including
provider scopes, and excludes the aggregate `all` shortcut. The v1 listing tool
lives under `music.discovery`, but its output type is reusable Music Scope
metadata, not a discovery-specific handle family.

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

- `CONTEXT.md` adds Music Discovery, Music Item Handle, Music Abstract Scope
  Handle, Music Library Scope Handle, Music Provider Scope Handle, and Music
  Scope under the Public Agent Protocol family.
- Public outputs never carry internal refs; handle-veil guards enforce this over
  each tool's `outputSchema` property names and sample output fixture
  keys/values. Handle factory and signed opaque cursor guards are required when
  those implementations ship.
- The seam lets Retrieval internals change without breaking the public contract.
- Music Discovery is the first instance of the Tool Framework (ADR-0009); future
  agent-facing capabilities follow the same public-seam discipline.
- `music.discovery.lookup.scopes` maps to internal Retrieval pools inside the
  handler; agents and users see only public Music Scopes.
