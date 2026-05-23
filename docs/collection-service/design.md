# Collection Service Design

## Status

Design document. Collection Service is not implemented yet.

## Purpose

Collection Service owns the user's explicit saved music objects.

It answers:

```text
What did the user intentionally save, favorite, or place in a collection?
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
- collect this album.
- add this recording to a playlist.
- remove this item from my collection.
- show my saved albums.

Internally, Collection Service preserves enough structure to make those actions
listable, removable, sortable, and syncable later.

## Target Kinds

Collection Service must support more than songs.

Initial target kinds:

| User wording | Preferred target kind | Notes |
| --- | --- | --- |
| song / track / this version | `recording` | Concrete listened item. |
| composition / song as a work | `work` | More abstract than a recording. |
| album | `release_group` | Best default for ordinary album collection. |
| specific record / edition / release | `release` | Needed for deluxe/remaster/region/version-specific saves. |
| artist | `artist` | Saved performer, composer, or project. |
| playlist | `playlist` | Collection may later become playlist-aware. |
| unknown source object | `source_item` | Fallback when only a provider id is known. |

Canonical Store currently documents `artist`, `work`, `recording`, and
`release_group`. Collection design introduces the need to decide whether
`release` should be added as a MineMusic canonical kind before concrete
edition-level collection behavior ships.

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

## Ownership

Collection Service owns:

- saved/favorited collection items.
- list/remove semantics for collection items.
- collection item target shape.
- collection item lifecycle state.
- local durable collection repository.

Collection Service does not own:

- canonical identity decisions.
- source provider search.
- playable link freshness.
- user taste summaries.
- external library sync execution.
- final recommendation choice.

## Core Data

Collection item:

```text
id
sessionId or user scope
collectionId
collectionKind: favorite | saved | playlist_item | later | ...
targetKind: recording | work | release | release_group | artist | playlist | source_item
label
canonicalRef?
sourceRef?
sourceRefs?
materialSnapshot?
createdAt
removedAt?
metadata?
```

Rules:

- Prefer `canonicalRef` when a stable MineMusic identity exists.
- Keep `sourceRef` or `sourceRefs` as evidence and fallback lookup keys.
- `materialSnapshot` is a display/debug snapshot, not identity authority.
- `removedAt` marks removal without requiring immediate physical deletion.
- Collection item ids are Collection-owned, not provider ids.

## Public Port Shape

Proposed public port:

```text
CollectionPort.save(input)
CollectionPort.remove(input)
CollectionPort.list(input)
CollectionPort.get(input)
```

`save` input:

```text
sessionId
collectionKind
target:
  kind
  label
  canonicalRef?
  sourceRef?
  sourceRefs?
  material?
collectionId?
reason?
```

`remove` input:

```text
sessionId
itemId
reason?
```

`list` input:

```text
sessionId
collectionId?
collectionKind?
targetKind?
includeRemoved?
limit?
cursor?
```

## Stage Interface Tools

Do not expose database-shaped tools such as `collection.item.insert`.

Expose user-semantic tools:

```text
music.collection.save
music.collection.remove
music.collection.list
music.feedback.like
music.feedback.dislike
music.version.confirm
music.version.correct
```

The first Collection Service implementation should start with:

```text
music.collection.save
music.collection.remove
music.collection.list
```

Feedback/version tools can come later, because they also touch Memory Service
and Canonical Store policy.

## Save Flow

When a user says "save this" or "favorite this artist":

```text
Stage Interface
-> Collection Service save
-> Canonical Store get/resolveExternalRef/findByLabel
-> Canonical Store createProvisional if user action is explicit and no
   canonical identity exists
-> Collection Repository put
-> Event Service record collection.item.saved
-> optional Memory Service proposal for taste signal
```

Important:

- Source refs do not become canonical authority by themselves.
- Explicit user save/favorite can justify creating a provisional canonical
  identity.
- Like/favorite may create a memory proposal, but the collection item remains in
  Collection Service.

## Remove Flow

When a user removes or unfavorites an item:

```text
Stage Interface
-> Collection Service remove
-> Collection Repository marks removedAt
-> Event Service record collection.item.removed
-> optional Memory Service proposal if removal clearly changes taste
```

Removal should not delete canonical records. A canonical record may still be
used by events, memory, source resolution, or other collection items.

## Like vs Save vs Favorite

These concepts should stay distinct:

| User action | Primary owner | Meaning |
| --- | --- | --- |
| like | Memory/Event | Taste signal. May not be listable. |
| save | Collection/Event | Explicitly kept item. Must be listable/removable. |
| favorite | Collection/Event plus optional Memory | Strong saved item and taste signal. |
| add to playlist | Collection or future Playlist Service | Ordered or grouped collection membership. |
| confirm version | Canonical Store/Event | Identity feedback. |

Collection actions may generate Memory proposals, but Memory is not the
collection database.

## Events

Initial factual events:

```text
collection.item.saved
collection.item.removed
collection.item.updated
```

Potential later events:

```text
collection.playlist.created
collection.playlist.renamed
collection.playlist.item.added
collection.playlist.item.moved
```

Event payloads should include collection item id, target kind, label, and
available refs. They should not embed provider credentials or long-lived
playable links.

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

- get item by id.
- save/update item.
- list active items by session/user, collection id, kind, and target kind.
- preserve removed items when `includeRemoved` is requested.
- enforce collection item id uniqueness.

No other module should import Collection Repository directly.

## Initial Implementation Plan

Recommended sequence:

1. Add shared `CollectionItem` contract and `CollectionPort`.
2. Add in-memory `CollectionRepository`.
3. Add `createCollectionService`.
4. Add Stage Core wiring with default in-memory collection repository.
5. Add Stage Interface tools for save/remove/list.
6. Add deterministic tests for song, album, release, artist, and source-only
   saves.
7. Add events for save/remove.
8. Only after that, decide whether favorites produce Memory proposals by
   default.

## Open Decisions

- Whether `release` becomes a Canonical Store kind now or remains
  collection-only until release metadata is implemented.
- Whether playlist behavior belongs in Collection Service or a later Playlist
  Service.
- Whether Collection scope is session-local for MVP or user-global.
- Whether `favorite` and `saved` are separate collection kinds or separate
  boolean facets on the same item.
- Whether saving a source-only item always creates a provisional canonical
  record or only does so for explicit "this is the one" user actions.
