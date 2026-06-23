# ADR-0040: Item-Handle Currency Is A Single `material` Kind; The `library` Item-Handle Kind Is Retired

## Status

Accepted (decision); code refactor tracked in GitHub issue #113.

## Context

`music.experience.present` mints a `handleKind: "library"` item handle for any
candidate it commits, and its descriptor prose claims candidate inputs are
"admitted to the library before presentation"
(`src/music_experience/stage_adapter/present.ts`). But `presentCandidate` only
does `commitCandidate()` → `projectMusicMaterial()` → `mint({handleKind:
"library"})` — it writes **no** saved/favorite relation, **no** source-library
import, and **no** owner-catalog visibility fact.

This contradicts Phase B PB4, which verified against `owner_catalog_projection.ts`
that the owner catalog is built only from `source_library` imports and
`saved`/`favorite` relations, and locked the three-layer model:

```text
candidate (transient, expires)
  -> durable material identity (NOT in the library/catalog)
  -> explicit library admission (saved relation or source-library import)
```

So a bare committed material is, by design, *not* in the owner library. Yet the
**item-handle** kind `"library"` is being used to mean "any durable material,"
while the **scope** kind `"library"` (`MusicScope`,
`stage_interface.ts` `MusicAbstractScopeHandle`) means the owner-visible library
baseline. One word, two meanings — and `present` tells the agent it admitted to
the library when it did not. This mislabel would propagate into every tool that
takes an item handle: queue, save, favorite, feedback, playback.

A grilling pass over a second external review (PR #112 finding 2) resolved this.

## Decision

Item-handle currency unifies to a single `kind: "material"` — a durable material
reference. The `"library"` **item-handle** kind is retired.

- `present` no longer claims library admission; it durable-materializes and
  returns a `material` handle.
- The `MusicScope` `kind: "library"` baseline is **unchanged** — it is a *scope*,
  not an item. Retiring the item-kind is exactly what resolves the name
  collision: "library" survives only as a scope (the owner-visible baseline),
  never as an item-handle kind.
- Downstream item tools (`library.relation.*`, `library.collection.*`,
  `library.catalog` browse output) accept `material` handles. "Is this item in
  the library" is answered by each tool's own semantics/validation, **not**
  presupposed by the handle kind. Reading the relation state of a
  never-admitted material is legal and returns `saved:false, favorite:false`.

This is the precise form of PB4's existing statement that "a library handle is
just a material that also has a library relation": there is one durable item
currency (material); a library relation is a *fact about* a material, not a
*kind of* handle.

## Rejected Alternatives

- **`present` performs real owner-library admission** (writes a
  saved/presented relation so the `library` handle is honest). Rejected — "being
  presented" is not "in my music library"; it would make every present a user
  source-of-truth write and contradict PB4's explicit-admission layer.
- **Keep two item-handle kinds, `material` (durable, unadmitted) and `library`
  (admitted), and require admission before relation/collection tools.** Rejected
  — adds an admission ceremony PB4 deliberately avoided ("no special
  identity-only path is needed"); reading "do I have this saved" must work for
  any material, including one never admitted (answer: no).
- **Leave the `library` item-kind and only fix `present`'s prose.** Rejected —
  the prose is a symptom; the kind name itself is the wrong domain language and
  collides with the scope baseline.

## Consequences

- The decision is recorded this cycle (docs branch). The code refactor is
  boundary-affecting (public `MusicItemHandle` contract + handle registry
  persisted `handle_kind` + all downstream tools + a DB migration) and lands as
  its own PR, tracked in issue #113:
  - `src/contracts/stage_interface.ts`: retire the `library` variant of
    `MusicItemHandle`; update `MusicExperiencePresentOutput`,
    `LibraryRelationItemInput`, `LibraryCollectionItemInput`/`Move`/`StateItem`,
    `LibraryCatalogItem`.
  - `src/stage_interface/handle_registry_records.ts`: `StageInterfaceHandleKind`
    `"library"` → `"material"`; `assertHandleKind`; the persisted `handle_kind`
    rows migrate `library` → `material` (anchor JSON `{materialRef}` unchanged).
  - `src/stage_interface/handle_minting.ts`: kind assertions.
  - `src/music_experience/stage_adapter/present.ts`: descriptor prose +
    `resultSummary` ("library item" → "material"); output kind.
  - Generated schemas regeneration.
- `ResolveDurableMusicItem` (the "candidate-or-material handle → idempotent
  `commitCandidate` → current material ref" capability) is extracted from
  `presentCandidate` when `queue.append` becomes its second real caller (PB6),
  not earlier — same "define once at the second real user" discipline as the
  roadmap's `ConcernRevision`. Also tracked in issue #113.
- `present`'s current `sideEffect.durableUserStateWrite: true` flag is too coarse
  — it conflates "writes durable material identity" with "changes the user's
  library curation." It is re-examined alongside this refactor (issue #113) and
  relates to ADR-0038's `ownerCurationWrite` marker (present writes material
  identity, not owner curation, so it must not carry the curation marker).
- Guards to add with the refactor: exact handle-kind set assertion
  (`{material, candidate}`) on the registry; output-leak test that present
  output carries no `library` kind and no raw material ref; a contract test that
  a non-admitted material handle is accepted by `library.relation` read and
  reports `saved:false`.
