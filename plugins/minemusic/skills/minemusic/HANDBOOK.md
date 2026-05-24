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
### MineMusic MVP (`minemusic.mvp`)

#### `stage.context.read`

Description: Read dynamic session context.
Input: `StageContextReadInput`
Output: `StageContextReadOutput`
#### `stage.materials.prepare`

Description: Prepare grounded materials through the Material Gate before presentation.
Input: `StageMaterialsPrepareInput`
Output: `MusicMaterial[]`
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
#### `events.record`

Description: Record a factual session event.
Input: `StageEventDraft`
Output: `StageEvent`
#### `memory.propose`

Description: Create an evidence-backed memory proposal.
Input: `MemoryProposalDraft`
Output: `MemoryProposal`
#### `effects.propose`

Description: Create a proposal for a durable write or external action.
Input: `EffectProposalDraft`
Output: `EffectProposal`
Effect kind: `proposal`
#### `session.update`

Description: Update soft session state through Session Context.
Input: `StageSessionPatch`
Output: `StageSession`

