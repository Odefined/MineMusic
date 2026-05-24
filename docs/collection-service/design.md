# Collection Service Design

## Status

Design document. Collection Service is not implemented yet.

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

Those questions belong to Memory Service, Canonical Store, Source Resolution,
the LLM, and Effect Boundary.

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

Collection Service does not own the music object itself. Canonical Store owns
the identity of the music object; Collection owns user-scoped collections and
their members.

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

Canonical Store currently documents `artist`, `work`, `recording`, and
`release_group`; Collection Service needs `release` as well so users can save a
specific edition, remaster, region, format, or deluxe version. Supporting
`release` in Collection therefore requires adding `release` as a Canonical Store
kind before implementation.

`collectionKind` is the type of music object in the collection. It matches
`canonicalRef.kind`; Collection Service does not maintain an independent object
taxonomy.

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
- collection items as members of those collections.
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
canonicalRef
label
description?
position?
createdAt
removedAt?
```

Rules:

- Collection ids are Collection-owned, not provider ids.
- `canonicalRef` is required. Collection does not store source-only items.
- An item's `canonicalRef.kind` must match its Collection's `collectionKind`.
- `relationKind` describes the user's long-lived relationship to the canonical
  objects in a Collection.
- System Collections use `saved`, `favorite`, or `blocked`.
- User-created Collections use `custom`.
- `blocked` is mutually exclusive with `saved` and `favorite` for the same owner
  and canonical object in system Collections. This mutual exclusion does not
  remove items from user-created custom Collections.
- Blocked membership is actionable: Material Resolve must query Collection
  Service and filter blocked canonical objects before returning resolved
  material. Source Providers do not own blocked filtering.
- `CollectionItem.label` is stored on the item for display or user adjustment.
  It is not identity authority.
- `CollectionItem.description` belongs to that item in that Collection. It is not
  a shared canonical-object description.
- Source refs belong to Canonical Store external refs and Library Import/Event
  provenance, not Collection item identity.
- `removedAt` marks removal without physical deletion.
- Collection item ids are Collection-owned, not provider ids.
- Item membership is idempotent by `collectionId + canonicalRef`. Re-adding the
  same canonical object updates the existing item; if it was removed, re-adding
  clears `removedAt`.
- List operations hide removed items by default. `includeRemoved` returns them
  for audit, sync, or recovery flows.
- Active Collection items can update `label` and `description`. Updating removed
  items is outside the first implementation.
- `position` is optional. System Collections can default to `createdAt` order;
  user-created custom Collections can use `position` for manual ordering. Complex
  reorder operations are outside the first implementation.
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
a side effect of `addItem`. User-created Collections use `relationKind =
custom`. MVP user-created Collections are single-kind Collections; mixed-kind
Collections can be added later with an explicit `mixed` collection kind if
needed.

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
CollectionPort.addItemToSystemCollection(input)
CollectionPort.removeItemFromSystemCollection(input)
CollectionPort.addItemToCollection(input)
CollectionPort.removeItemFromCollection(input)
CollectionPort.updateItem(input)
CollectionPort.listItems(input)
CollectionPort.listCollections(input)
CollectionPort.createCollection(input)
CollectionPort.updateCollection(input)
CollectionPort.removeCollection(input)
```

`addItemToSystemCollection` input:

```text
ownerScope
relationKind: saved | favorite | blocked
canonicalRef
label
description?
```

`removeItemFromSystemCollection` input:

```text
ownerScope
relationKind: saved | favorite | blocked
canonicalRef
```

`addItemToCollection` input:

```text
collectionId
canonicalRef
label
description?
```

`removeItemFromCollection` input:

```text
collectionId
canonicalRef
```

`updateItem` input:

```text
collectionId
canonicalRef
label?
description?
position?
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
-> Collection Service addItem
-> Collection Repository adds item to the initialized system Collection
-> Collection Service records collection.item.added
```

Important:

- Collection Service receives a canonical ref. It does not create canonical
  records from labels or source refs.
- Library Import or another upstream flow must resolve or create the canonical
  record before writing Collection.
- Source refs do not become Collection identity.

## Remove Flow

When a user removes an item:

```text
Stage Interface
-> Collection Service removeItem
-> Collection Repository marks removedAt
-> Collection Service records collection.item.removed
-> optional Memory Service proposal if removal clearly changes taste
```

Removal should not delete canonical records. A canonical record may still be
used by events, memory, source resolution, or other collection items.

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

Event payloads should include collection id, collection item id, collection
kind, relation kind, label, and canonical ref. They should not embed provider
credentials or long-lived playable links.

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

## Initial Implementation Plan

Recommended sequence:

1. Add shared `Collection`, `CollectionItem`, and `CollectionPort` contracts.
2. Add in-memory `CollectionRepository`.
3. Add `createCollectionService`.
4. Add Stage Core wiring with default in-memory collection repository.
5. Add Stage Interface tools for save/remove/list.
6. Add deterministic tests for song, album, release, and artist saves.
7. Add events for save/remove.
8. Only after that, decide whether collection actions produce Memory proposals
   by default.

## Open Decisions

- Whether playlist behavior belongs in a later Playlist Service or a
  Collection submodel.
- Whether the MVP keeps only `ownerScope = local_profile:default` or adds named
  local profiles before real account support.
- Whether additional relation kinds such as `later` or `owned` are needed.
