# Collection Service Design

## Purpose

Collection Service owns the user's explicit long-lived relationships to music
objects.

It answers:

```text
Which music objects belong to this user's saved, favorite, or blocked
collections?
```

It does not answer:

```text
What does the user generally like?
Which music object is this?
Is this playable right now?
Should this be recommended?
Was an external app write approved?
```

Those questions belong to Memory Service, Canonical Store, Material Resolve,
Source Grounding, the LLM, and Effect Boundary.

## User Model

Users should never need to think about canonical records or source refs.

User-facing actions are ordinary music actions:

- save this song.
- favorite this artist.
- block this song from future recommendations.
- collect this album.
- remove this item from my collection.
- show my saved albums.

Internally, Collection Service preserves explicit collections and their items so
those actions are listable, removable, sortable, and syncable later.

Collection Service does not own the music object itself. Material Store owns
the product-level material target and Canonical Store owns accepted canonical
identity; Collection owns user-scoped collections and their members. New
Collection writes require `materialRef`; `canonicalRef` is optional stored
metadata, not a public write handle.

This current behavior conflicts with the canonical-only Collection consequence
in ADR-0002; see `AI-001` in
`docs/maintenance/architecture-inconsistency-log.md`.

## Collection Kinds

Collection Service must support more than songs.

Initial collection kinds:

| User wording | Collection kind | Notes |
| --- | --- | --- |
| song / track / this version | `recording` | Concrete listened item. |
| composition / song as a work | `work` | More abstract than a recording. |
| album | `release_group` | Best default for ordinary album collection. |
| specific edition / remaster / region / format | `release` | Concrete issued version. |
| artist | `artist` | Saved performer, composer, or project. |

Platform library import can target `release` for saved albums when the platform
returns a concrete album id. The `release_group` default applies to ordinary
user-facing album collection when no concrete edition is known.

Canonical Store supports `artist`, `work`, `recording`, `release_group`, and
`release` so users can save both album-level groupings and concrete editions,
remasters, regions, formats, or deluxe versions.

`collectionKind` is the type of music object in the collection. For known
material-backed items it is the collection view kind chosen by the caller or
inferred from the current `MaterialRecord`; optional canonical or snapshot kind
metadata must agree with that view. Collection Service does not maintain an
independent object taxonomy.

## Layer Placement

Collection Service belongs in the Core Capability Layer:

```text
Stage Interface
  -> Collection Service
       -> CollectionRepository / Storage
       -> CanonicalStorePort
       -> EventPort
       -> MemoryPort?          optional proposal after explicit feedback
       -> EffectBoundaryPort?  only for external app/library writes
```

It is separate from:

- Canonical Store, which owns identity anchors.
- Memory Service, which owns taste and preference memory.
- Event Service, which owns factual action records.
- Effect Boundary, which owns approval for external side effects.

## Ownership Scope

Collections and collection items are long-lived user library assets. They should
not be owned by `sessionId`.

Collection Service should use an explicit `ownerScope` to answer:

```text
Whose music library does this collection belong to?
```

MVP can use a local default:

```text
ownerScope = local_profile:default
```

Collection Service ports require `ownerScope`. Stage Interface tools may default
missing owner scope to `local_profile:default` for local MVP use.

Material Resolve requests should carry `ownerScope` so blocked filtering can use
the correct owner's Collection data. Stage Interface may default missing owner
scope to `local_profile:default`.

Later, `ownerScope` can point to a real MineMusic user account, local profile,
or imported library namespace.

Session id and import batch id are provenance for Event Service and Library
Import Service. They do not belong to the Collection item identity.

Collection ports do not require chat `sessionId`. The current Event Service
contract requires `sessionId`, so Collection Service should record Collection
events with an owner-derived system session id such as
`collection:local_profile:default`. This preserves Event Service compatibility
without making Collection ownership session-scoped.

## Ownership

Collection Service owns:

- collections for long-lived owner-to-music-object relationships.
- collection items as members of those collections, preferably keyed by
  `materialRef` and optionally carrying a material snapshot.
- list/remove semantics for collection items.
- collection and collection item lifecycle state.
- local durable collection repository.

Collection Service does not own:

- canonical identity decisions.
- source provider search.
- playable link freshness.
- user taste summaries.
- external library sync execution.
- sharing or visibility policy.
- final recommendation choice.

## Core Data

Collection:

```text
id
ownerScope
collectionKind: recording | work | release_group | release | artist
relationKind: saved | favorite | blocked | custom
label
description?
createdAt
removedAt?
```

Collection item:

```text
id
collectionId
materialRef
materialSnapshot?
relationScope?
identityRequirement?
status?
canonicalRef?
label
description?
position?
createdAt
removedAt?
```

Rules:

- Collection ids are Collection-owned, not provider ids.
- New Collection item writes require `materialRef`. `canonicalRef` can remain
  on stored items as optional identity metadata for material-backed or
  historical rows, but it is not the public write handle.
- A known item's material kind, canonical kind, snapshot kind, or explicit
  `collectionKind` must agree with the Collection's `collectionKind`.
- `relationKind` describes the user's long-lived relationship to the material
  objects in a Collection.
- System Collections use `saved`, `favorite`, or `blocked`.
- User-created Collections use `custom`.
- `blocked` is mutually exclusive with `saved` and `favorite` for the same owner
  and material object in system Collections. This mutual exclusion does not
  remove items from user-created custom Collections.
- Adding `saved` or `favorite` removes the same material object from the
  owner's system `blocked` Collection. Adding `blocked` removes it from the
  owner's system `saved` and `favorite` Collections.
- Blocked membership is actionable: Material Resolve must query Collection
  Service and filter blocked material refs before returning resolved material.
  Source Providers do not own blocked filtering.
- Blocked candidates should not disappear silently. Material Resolve should
  return a blocked status/material state so the caller can explain why the
  candidate was not recommended.
- Blocked checks use material refs and should follow Material Registry redirects
  so source-only items remain blocked after later material merges.
- `CollectionItem.label` is stored on the item for display or user adjustment.
  It is not identity authority.
- `CollectionItem.description` belongs to that item in that Collection. It is not
  a shared canonical-object description.
- Source refs belong to Canonical Store source refs and Library Import/Event
  provenance, not Collection item identity.
- `removedAt` marks removal without physical deletion.
- Collection item ids are Collection-owned, not provider ids.
- Item membership is idempotent by `collectionId + materialRef` after following
  Material Registry redirects. Re-adding the same material object updates the
  existing item; if it was removed, re-adding clears `removedAt`.
- List operations hide removed items by default. `includeRemoved` returns them
  for audit, sync, or recovery flows.
- Public item update and manual ordering APIs are outside the current
  CollectionPort. Re-adding an active material item can refresh label or
  description.
- `listItems` default ordering is `createdAt` descending for system Collections,
  and `position` ascending then `createdAt` ascending for user-created custom
  Collections.

## Collections

MVP includes system-created Collections and user-created Collections.

For each owner scope, Collection Service initializes one system Collection for
each pair:

```text
relationKind: saved | favorite | blocked
collectionKind: recording | work | release_group | release | artist
```

This produces system collections such as:

```text
saved recordings
favorite artists
blocked releases
```

For the MVP kind set, this means exactly 15 system Collections per owner:

```text
3 relation kinds x 5 collection kinds = 15 Collections
```

System Collection labels are generated by MineMusic and are not user-editable in
the first implementation. User-created Collection labels and descriptions are
editable.

Users may also create additional Collections. User-created Collections are
explicit records with their own label and description; they are not generated as
a side effect of `addMaterialToCollection`. User-created Collections use
`relationKind = custom`. MVP user-created Collections are single-kind
Collections; mixed-kind Collections can be added later with an explicit `mixed`
collection kind if needed.

The first implementation has no public/private/share visibility model.

Collection labels must be unique by exact text within the same owner scope among
active Collections, including both system and user-created Collections.
Collection id remains the identity; label uniqueness is a user-facing guardrail.
Labels that differ by case, whitespace, or punctuation are different labels.
Removed Collections do not reserve labels; a new active Collection may reuse the
same label. Reusing a removed Collection's label creates a new Collection rather
than restoring the removed one. Explicit restore behavior is outside the first
implementation.

Item writes should use an existing Collection. Missing system Collections
indicate initialization failure; missing user-created Collections should be
reported as not found.

System Collections cannot be removed. User-created Collections are removed by
setting `Collection.removedAt`; their items do not need individual removal marks
because collection visibility controls item visibility. Restoring the Collection
can make its existing items visible again.

System Collections cannot be updated. User-created Collections can update label
and description. Label updates must still satisfy exact active-label uniqueness
within the owner scope.

## Public Port Shape

Proposed public port:

```text
CollectionPort.addMaterialToSystemCollection(input)
CollectionPort.removeMaterialFromSystemCollection(input)
CollectionPort.addMaterialToCollection(input)
CollectionPort.removeMaterialFromCollection(input)
CollectionPort.listItems(input)
CollectionPort.listCollections(input)
CollectionPort.createCollection(input)
CollectionPort.updateCollection(input)
CollectionPort.removeCollection(input)
CollectionPort.filterBlockedMaterials(input)
```

`addMaterialToSystemCollection` input:

```text
ownerScope
relationKind: saved | favorite | blocked
materialRef
label
collectionKind?
canonicalRef?
materialSnapshot?
relationScope?
identityRequirement?
description?
```

`removeMaterialFromSystemCollection` input:

```text
ownerScope
relationKind: saved | favorite | blocked
materialRef
collectionKind?
```

`addMaterialToCollection` input:

```text
collectionId
materialRef
label
canonicalRef?
materialSnapshot?
relationScope?
identityRequirement?
description?
```

`removeMaterialFromCollection` input:

```text
collectionId
materialRef
```

`listItems` input:

```text
ownerScope
collectionId?
collectionKind?
relationKind?
includeRemoved?
limit?
cursor?
```

`listCollections` input:

```text
ownerScope
collectionKind?
relationKind?
includeRemoved?
```

`createCollection` input:

```text
ownerScope
collectionKind
relationKind: custom
label
description?
```

`removeCollection` input:

```text
collectionId
```

`updateCollection` input:

```text
collectionId
label?
description?
```

`filterBlockedMaterials` input:

```text
ownerScope
materialRefs
```

Returns the material refs that are blocked for that owner.

## Stage Interface Tools

Do not expose database-shaped tools such as `collection.item.insert`.

Expose user-semantic tools:

```text
music.collection.save
music.collection.unsave
music.collection.favorite
music.collection.unfavorite
music.collection.block
music.collection.unblock
music.collection.item.add
music.collection.item.remove
music.collection.delete
music.collection.update
music.collection.list
music.collection.create
```

The first Collection Service implementation should start with:

```text
music.collection.save
music.collection.unsave
music.collection.favorite
music.collection.unfavorite
music.collection.block
music.collection.unblock
music.collection.item.add
music.collection.item.remove
music.collection.delete
music.collection.update
music.collection.list
music.collection.create
```

The first implementation includes custom Collection create/update/remove, not
only system Collection item operations.

Feedback/version tools can come later, because they touch Memory Service and
Canonical Store policy rather than Collection item identity.

The first Collection port is single-item only. Bulk work such as platform
library import should orchestrate repeated item calls and own progress, partial
failure handling, and import summaries. Dedicated bulk collection APIs can be
added later if needed.

## Save Flow

When a user says "save this" or "keep this artist":

```text
Stage Interface
-> resolves public materialId to materialRef
-> Collection Service addMaterialToSystemCollection
-> Collection Repository adds item to the initialized system Collection
-> Collection Service records collection.item.added
```

Important:

- Stage Interface receives `materialId` as the public write handle and converts
  it to an opaque `materialRef` before calling Collection Service.
- Collection Service does not create canonical records from labels or source
  refs. Canonical identity remains Material Store / Canonical Store
  responsibility.
- Source refs do not become Collection item identity.

## Remove Flow

When a user removes an item:

```text
Stage Interface
-> resolves public materialId to materialRef
-> Collection Service removeMaterialFromSystemCollection or removeMaterialFromCollection
-> Collection Repository marks removedAt
-> Collection Service records collection.item.removed
-> optional Memory Service proposal if removal clearly changes taste
```

Removal should not delete material or canonical records. A material or canonical
record may still be used by events, memory, Material Resolve, Source Grounding,
or other collection items.

## Collection vs Feedback

These concepts should stay distinct:

| User action | Primary owner | Meaning |
| --- | --- | --- |
| like | Memory/Event | Taste signal. May not be listable. |
| save | Collection/Event | Long-lived `saved` system Collection membership. |
| favorite | Collection/Event | Long-lived `favorite` system Collection membership. |
| block | Collection/Event | Long-lived `blocked` system Collection membership. |
| add to custom collection | Collection/Event | User-created Collection membership. |
| confirm version | Canonical Store/Event | Identity feedback. |

Collection actions may generate Memory proposals, but Memory is not the
collection database.

## Events

Initial factual events:

```text
collection.created
collection.updated
collection.removed
collection.item.added
collection.item.removed
collection.item.updated
```

Collection Service records these events after successful Collection-owned state
changes. Callers should not duplicate the same factual event.

`collection.item.updated` is used when re-adding an existing active material
item refreshes Collection-owned item fields such as label or description. It
does not imply a standalone public `updateItem` API on `CollectionPort`.

Event payloads should include collection id, collection item id, collection
kind, relation kind, label, and material ref. They may include canonical ref
metadata when stored on the item, but should not embed provider credentials or
long-lived playable links.

## Effect Boundary

Local Collection Service writes are MineMusic state changes. If the user
explicitly says "save this", the local write can happen through Collection
Service.

External side effects require Effect Boundary:

- save to NetEase.
- save to Spotify.
- add to a provider playlist.
- modify a local music library outside MineMusic.

Collection Service may create an effect proposal after the local collection
write, but it should not execute external writes directly.

## Repository Boundary

Collection Repository should sit behind Collection Service.

Repository responsibilities:

- get Collection by id.
- soft-remove user-created Collections.
- list initialized Collections by owner scope, collection kind, and relation
  kind.
- add/update item in an initialized Collection.
- list active items by Collection, owner scope, collection kind, and relation
  kind.
- preserve removed items when `includeRemoved` is requested.
- enforce Collection id and Collection item id uniqueness.

No other module should import Collection Repository directly.

## Current Authority

Implementation state belongs in `docs/collection-service/progress.md`.
Provided and consumed ports belong in `docs/collection-service/ports.md`.
Historical implementation planning is archived under
`docs/archive/collection-service/`.

## Open Decisions

- Whether playlist behavior belongs in a later Playlist Service or a
  Collection submodel.
- Whether the MVP keeps only `ownerScope = local_profile:default` or adds named
  local profiles before real account support.
- Whether additional relation kinds such as `later` or `owned` are needed.
