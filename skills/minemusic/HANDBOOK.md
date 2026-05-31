# MineMusic Instrument Handbook

Generated from the current agent-visible Instrument Catalog.

## Instruments

### MineMusic Handbook (`minemusic.handbook`)

#### `handbook.overview.read`

Description: Read the generated overview of current MineMusic instruments and tools.
Input: `HandbookOverviewReadInput`
Output: `Handbook`
#### `handbook.instrument.read`

Description: Read the handbook entry for one available MineMusic instrument.
Input: `HandbookInstrumentReadInput`
Output: `HandbookInstrumentEntry`
#### `handbook.tool.read`

Description: Read input, output, effect, and description metadata for one available MineMusic tool.
Input: `HandbookToolReadInput`
Output: `HandbookToolEntry`
### MineMusic Stage (`minemusic.stage`)

#### `stage.context.read`

Description: Read dynamic session context.
Input: `StageContextReadInput`
Output: `StageContextReadOutput`
#### `stage.materials.prepare`

Description: Legacy material sanitizer for non-final material use; use stage.recommendation.present for user-visible recommendations.
Input: `StageMaterialsPrepareInput`
Output: `MusicMaterial[]`
#### `stage.recommendation.present`

Description: Final presentation boundary for user-visible recommendations.
Input: `RecommendationPresentInput`
Output: `RecommendationPresentOutput`
#### `stage.session.update`

Description: Update soft session state through Session Context.
Input: `StageSessionPatch`
Output: `StageSession`
#### `stage.events.record`

Description: Record a factual session event.
Input: `StageEventDraft`
Output: `StageEvent`
#### `stage.effects.propose`

Description: Create a proposal for a durable write or external action.
Input: `EffectProposalDraft`
Output: `EffectProposal`
Effect kind: `proposal`
### MineMusic Knowledge (`minemusic.knowledge`)

#### Providers

- MusicBrainz (`musicbrainz`, slot `knowledge`)
  Status: `available`
  Authentication: `none`
  Operations: `query`
  Formats: `structured`
  Entity kinds: `artist`, `label`, `recording`, `release`, `release_group`, `work`
  Expansions: `credits`, `relations`, `releases`, `release_groups`, `works`, `release_labels`, `tracklist`, `identifiers`, `urls`, `genres`, `tags`, `ratings`, `annotation`
  Relation focus: `members`
  Query entries: `text`, `canonicalRef`, `providerRef`, `tagQuery`, `fieldQuery`
  Tag filters: `filters.tags.include`, `filters.tags.exclude`
  Continuation: pass `cursor` from `KnowledgeResult.nextCursor`
  Boundaries: No playable links. No identity confirmation. No Canonical Store writes.

#### `knowledge.query`

Description: Query provider-attributed structured or text knowledge.
Input: `KnowledgeQuery`
Output: `KnowledgeResult`
### MineMusic Music (`minemusic.music`)

#### Providers

- NetEase Cloud Music (`netease`, slot `source`)
  Status: `available`
  Authentication: `none`
  Operations: `search`, `refresh_playable_links`

#### `music.material.resolve`

Description: Resolve music candidates into material through canonical-first material resolution.
Input: `MaterialResolveRequest`
Output: `MaterialResolveResult`
#### `music.material.resolve.cards`

Description: Resolve material seeds and return compact agent-safe material cards.
Input: `MaterialResolveCardsInput`
Output: `MaterialResolveCardsOutput`
#### `music.material.query`

Description: Query compact material cards from an explicit material pool.
Input: `MaterialQueryInput`
Output: `MaterialQueryOutput`
#### `music.material.related`

Description: Find compact material cards related to one material id.
Input: `MaterialRelatedInput`
Output: `MaterialRelatedOutput`
#### `music.material.select`

Description: Optionally apply reusable material policy, sorting, diversity, and limit to compact material ids.
Input: `MaterialSelectInput`
Output: `MaterialSelectOutput`
#### `music.material.context.brief`

Description: Read a compact context brief for one material id.
Input: `MaterialContextBriefInput`
Output: `MaterialContextBriefOutput`
#### `music.pools.list`

Description: List compact material pools available to query.
Input: `MaterialPoolsListInput`
Output: `MaterialPoolsListOutput`
#### `music.links.refresh`

Description: Refresh source-backed playable links for a material item.
Input: `MusicMaterial`
Output: `MusicMaterial`
#### `music.collection.save`

Description: Save a canonical or material music object to the owner's saved system collection.
Input: `CollectionSystemItemInput`
Output: `CollectionItem`
#### `music.collection.unsave`

Description: Remove a canonical or material music object from the owner's saved system collection.
Input: `CollectionSystemRemoveInput`
Output: `CollectionItem`
#### `music.collection.favorite`

Description: Favorite a canonical or material music object in the owner's favorite system collection.
Input: `CollectionSystemItemInput`
Output: `CollectionItem`
#### `music.collection.unfavorite`

Description: Remove a canonical or material music object from the owner's favorite system collection.
Input: `CollectionSystemRemoveInput`
Output: `CollectionItem`
#### `music.collection.block`

Description: Block a canonical or material music object from future recommendations for the owner.
Input: `CollectionSystemItemInput`
Output: `CollectionItem`
#### `music.collection.unblock`

Description: Remove a canonical or material music object from the owner's blocked system collection.
Input: `CollectionSystemRemoveInput`
Output: `CollectionItem`
#### `music.collection.item.add`

Description: Add a canonical or material music object to a custom collection by collection id.
Input: `CollectionItemAddInput`
Output: `CollectionItem`
#### `music.collection.item.remove`

Description: Remove a canonical or material music object from a custom collection by collection id.
Input: `CollectionItemRemoveInput`
Output: `CollectionItem`
#### `music.collection.create`

Description: Create a user-owned custom collection for one collection kind.
Input: `CollectionCreateInput`
Output: `Collection`
#### `music.collection.update`

Description: Update a user-created custom collection label or description.
Input: `CollectionUpdateInput`
Output: `Collection`
#### `music.collection.delete`

Description: Soft-remove a user-created custom collection.
Input: `CollectionDeleteInput`
Output: `Collection`
#### `music.collection.list`

Description: List owner collections and matching collection items.
Input: `CollectionListInput`
Output: `CollectionListOutput`
### MineMusic Library (`minemusic.library`)

#### Providers

- NetEase Cloud Music (`netease`, slot `platform_library`)
  Status: `available`
  Authentication: `required`
  Operations: `preview`, `import`, `update`
  Areas:
  - Saved songs (`saved_source_tracks`): `readable`
  - Saved albums (`saved_source_releases`): `readable`
  - Followed artists (`saved_source_artists`): `readable`
  - Playlists (`playlists`): `unsupported`
  - Listening history (`listening_history`): `unsupported`

#### `library.source.list`

Description: List Source Library items in bounded pages as short cards.
Input: `SourceLibraryListInput`
Output: `SourceLibraryListOutput`
#### `library.import.start`

Description: Start importing saved platform library facts into MineMusic state.
Input: `LibraryImportStartInput`
Output: `LibraryImportStatus`
#### `library.import.continue`

Description: Continue an existing saved platform library import batch.
Input: `LibraryImportContinueInput`
Output: `LibraryImportStatus`
#### `library.update.start`

Description: Start a platform library update against MineMusic's latest complete baseline.
Input: `LibraryUpdateStartInput`
Output: `LibraryImportStatus`
#### `library.update.continue`

Description: Continue an existing platform library update batch against MineMusic's latest complete baseline.
Input: `LibraryImportContinueInput`
Output: `LibraryImportStatus`
#### `library.import.status`

Description: Read current status for a Library Import batch.
Input: `LibraryImportStatusInput`
Output: `LibraryImportStatus`
#### `library.import.summary`

Description: Read the compact completed summary for a Library Import batch.
Input: `LibraryImportSummaryInput`
Output: `LibraryImportSummaryView`
#### `library.import.items.list`

Description: List item-level import facts for a Library Import batch in bounded pages.
Input: `LibraryImportItemsListInput`
Output: `LibraryImportItemsListOutput`
### MineMusic Memory (`minemusic.memory`)

#### `memory.propose`

Description: Create an evidence-backed memory proposal.
Input: `MemoryProposalDraft`
Output: `MemoryProposal`
