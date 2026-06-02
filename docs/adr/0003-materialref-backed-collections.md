# ADR-0003: Collections Are MaterialRef-Backed

## Status

Accepted

## Context

ADR-0002 moved provider-origin source state and product-level material identity
under Material Store, but it kept one conservative consequence: Collection
would remain canonical-only unless a future decision changed that boundary.

The current Collection Service implementation, Stage Interface public surface,
and Material Store architecture have since moved to stable material identity:

- Stage Interface collection tools accept public `materialId` handles.
- Stage Interface resolves `materialId` to internal `materialRef`.
- Collection Service stores materialRef-backed CollectionItems.
- Collection Service uses narrow Material Store reads for material kind
  inference and redirect-aware membership.
- `canonicalRef` may remain optional metadata, but it is not the required
  Collection write handle.

Keeping Collection canonical-only would force source-backed material,
wrong-version feedback, not-playable feedback, and library-derived material
actions through canonical identity before they can become explicit user
relationships. That would undo the Material Store boundary this project now
uses for material identity and source-backed material state.

## Decision

Collection Service owns owner-scoped collections and collection items keyed by
Material Store `materialRef`.

Public collection writes use Stage Interface `materialId` handles. Stage
Interface translates those public handles into internal `materialRef` values
before calling Collection Service. Raw `materialRef`, raw source refs,
repository rows, material snapshots, and relation-scope internals are not
ordinary public collection write fields.

Collection Service may read Material Store through a narrow capability for
material record lookup and redirect resolution. It must not receive broad
Material Store writer capability and must not depend on Canonical Store as its
ordinary collection membership boundary.

This decision supersedes only the ADR-0002 consequence that said Collection
remains canonical-only unless a future decision changes that boundary.
ADR-0002 remains accepted for the Material Store boundary, Source Entity Store,
Canonical Store subdomain, and confirmed binding direction.

## Consequences

- `AI-001` is resolved by this decision.
- Existing materialRef-backed Collection code is the accepted architecture
  rather than a temporary drift from ADR-0002.
- Collection membership can target source-backed material before canonical
  identity is confirmed.
- Collection Service keeps user-scoped relationship ownership; Material Store
  still owns material identity, source entities, canonical identity subdomain,
  and confirmed source-to-canonical bindings.
- Future Collection changes should preserve the narrow Material Store read
  dependency used for material kind inference and redirect-aware membership.
- If a future workflow needs external library writeback or playlist mutation,
  it should go through Effect Boundary and explicit provider capabilities, not
  by expanding Collection Service into provider transport ownership.
