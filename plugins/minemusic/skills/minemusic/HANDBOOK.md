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

Description: Prepare grounded materials through the Material Gate before presentation.
Input: `StageMaterialsPrepareInput`
Output: `MusicMaterial[]`
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
#### `music.links.refresh`

Description: Refresh source-backed playable links for a material item.
Input: `MusicMaterial`
Output: `MusicMaterial`
#### `music.collection.save`

Description: Save a canonical music object to the owner's saved system collection.
Input: `CollectionSystemItemInput`
Output: `CollectionItem`
#### `music.collection.unsave`

Description: Remove a canonical music object from the owner's saved system collection.
Input: `CollectionSystemRemoveInput`
Output: `CollectionItem`
#### `music.collection.favorite`

Description: Favorite a canonical music object in the owner's favorite system collection.
Input: `CollectionSystemItemInput`
Output: `CollectionItem`
#### `music.collection.unfavorite`

Description: Remove a canonical music object from the owner's favorite system collection.
Input: `CollectionSystemRemoveInput`
Output: `CollectionItem`
#### `music.collection.block`

Description: Block a canonical music object from future recommendations for the owner.
Input: `CollectionSystemItemInput`
Output: `CollectionItem`
#### `music.collection.unblock`

Description: Remove a canonical music object from the owner's blocked system collection.
Input: `CollectionSystemRemoveInput`
Output: `CollectionItem`
#### `music.collection.item.add`

Description: Add a canonical music object to a custom collection by collection id.
Input: `CollectionItemAddInput`
Output: `CollectionItem`
#### `music.collection.item.remove`

Description: Remove a canonical music object from a custom collection by collection id.
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
  - Saved songs (`saved_recordings`): `readable`
  - Saved albums (`saved_releases`): `readable`
  - Followed artists (`saved_artists`): `readable`
  - Playlists (`playlists`): `unsupported`
  - Listening history (`listening_history`): `unsupported`

#### `library.import.preview`

Description: Preview importing saved platform library facts into MineMusic state.
Input: `LibraryImportPreviewInput`
Output: `LibraryImportPreview`
#### `library.import.start`

Description: Start importing saved platform library facts into MineMusic state.
Input: `LibraryImportStartInput`
Output: `LibraryImportReport`
#### `library.update.preview`

Description: Preview a platform library update against MineMusic's latest complete baseline.
Input: `LibraryImportPreviewInput`
Output: `LibraryImportPreview`
#### `library.update.start`

Description: Start a platform library update against MineMusic's latest complete baseline.
Input: `LibraryImportStartInput`
Output: `LibraryImportReport`
#### `library.import.status`

Description: Read current status for a Library Import batch.
Input: `LibraryImportStatusInput`
Output: `LibraryImportStatus`
#### `library.import.summary`

Description: Read the completed report for a Library Import batch.
Input: `LibraryImportSummaryInput`
Output: `LibraryImportSummary`
### MineMusic Memory (`minemusic.memory`)

#### `memory.propose`

Description: Create an evidence-backed memory proposal.
Input: `MemoryProposalDraft`
Output: `MemoryProposal`

