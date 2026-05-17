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

Description: Prepare grounded materials through Stage Kernel gating before presentation.
Input: `StageMaterialsPrepareInput`
Output: `MusicMaterial[]`
#### `music.material.ground`

Description: Ground a source-searchable candidate through source resolution.
Input: `SourceQuery`
Output: `MusicMaterial[]`
#### `music.links.refresh`

Description: Refresh source-backed playable links for a material item.
Input: `MusicMaterial`
Output: `MusicMaterial`
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

Description: Update soft session state through the Stage Kernel.
Input: `StageSessionPatch`
Output: `StageSession`

