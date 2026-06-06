> Status: Pre-formal ADR evidence
> Formal target supersedes this file through
> `docs/adr/0005-formal-top-level-architecture-areas.md` and
> `docs/adr/0006-formal-identity-candidate-and-handle-boundaries.md`.
> Use only for: historical context on the MVP Material Store boundary.

# ADR-0002: Material Store Owns Canonical And Source Material State

## Status

Accepted

ADR-0003 supersedes this ADR's original Collection canonical-only
consequence. The Material Store, Source Entity Store, Canonical Store
subdomain, and confirmed binding decisions here remain accepted.

## Context

Library import testing showed that treating imported provider tracks as
provisional Canonical Records makes ordinary import, collection, and playable
material flows depend on identity-review work. The project needs a broader
module boundary for music objects that can enter material flows before canonical
identity is confirmed.

## Decision

`Material Store` is the top-level Core Capability and documentation/module
boundary for MineMusic-owned material identity, provider-origin Source Entities,
Source Library state, and confirmed bindings between source entities and
canonical records.

`Canonical Store` remains the canonical identity authority inside Material
Store. Canonical concepts keep their names where they are precise:

- Canonical Record.
- Canonical Maintenance.
- `canonical.review.*` tools.
- canonical SQLite tables that store canonical identity and maintenance state.

`Source Entity Store` is the Material Store sub-area for Source Track, Source
Release, Source Artist, Source Library, Library Import, Library Update, import
history, and confirmed source-to-canonical bindings. Source Entities are not
Canonical Records, and imported platform library items enter Source Library by
default rather than creating provisional canonical identity.

Provider source refs belong to Source Entity Store in the new architecture.
Confirmed source-to-canonical identity is represented as a Source Entity to
Canonical Record binding, not as a `canonical_source_refs` evidence path.

Other Core Capabilities should depend on a `MaterialStorePort` public boundary
for canonical lookup, source entity lookup/upsert, Source Library state, and
confirmed binding lookup. `CanonicalStorePort` is an internal Material Store
canonical-subdomain interface except for explicit Canonical Maintenance
workflows.

## Consequences

- Code and docs should move toward a Material Store module/doc structure while
  preserving `canonical` as the name of the canonical identity subdomain.
- Library Import is a Source Entity Store flow, not a separate top-level Core
  Capability. It writes Source Entity Store / Source Library state first, not
  provisional canonical records by default.
- Existing `library.import.*` and `library.update.*` tool names may remain as
  user-action names even though the owning implementation moves under Source
  Entity Store.
- The `minemusic.library` instrument grouping may also remain as a user-facing
  music-library work surface; instrument grouping does not need to mirror the
  internal Source Entity Store ownership boundary.
- `canonical_source_refs` should be retired as the provider-source binding path
  instead of extended for the new Source Entity flow.
- Ordinary business modules should stop using `resolveSourceRef` or
  `attachSourceRef` on `CanonicalStorePort`; source refs are resolved through
  Source Entity Store and confirmed bindings through `MaterialStorePort`.
- Material Resolve may read Source Library when a request explicitly scopes
  resolution to an owner source library, but it must not become the final
  recommender, write Collection state, or create canonical identity.
- Superseded by ADR-0003: Collection is now materialRef-backed rather than
  canonical-only.
