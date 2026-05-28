import type { ToolDescriptor, ToolName } from "../contracts/index.js";

export const stableToolNames = [
  "stage.context.read",
  "handbook.overview.read",
  "handbook.instrument.read",
  "handbook.tool.read",
  "stage.materials.prepare",
  "stage.session.update",
  "stage.events.record",
  "stage.effects.propose",
  "music.material.resolve",
  "knowledge.query",
  "music.links.refresh",
  "music.collection.save",
  "music.collection.unsave",
  "music.collection.favorite",
  "music.collection.unfavorite",
  "music.collection.block",
  "music.collection.unblock",
  "music.collection.item.add",
  "music.collection.item.remove",
  "music.collection.create",
  "music.collection.update",
  "music.collection.delete",
  "music.collection.list",
  "library.source.list",
  "library.import.preview",
  "library.import.start",
  "library.import.continue",
  "library.update.preview",
  "library.update.start",
  "library.update.continue",
  "library.import.status",
  "library.import.summary",
  "library.import.items.list",
  "canonical.review.list",
  "canonical.review.inspect",
  "canonical.review.apply",
  "canonical.review.auto_update",
  "memory.propose",
] as const satisfies readonly ToolName[];

export type StableToolName = (typeof stableToolNames)[number];

export type StableToolDescriptor = Omit<ToolDescriptor, "name"> & {
  name: StableToolName;
};

export const handbookToolDescriptors: StableToolDescriptor[] = [
  {
    name: "handbook.overview.read",
    description: "Read the generated overview of current MineMusic instruments and tools.",
    inputSchemaRef: "HandbookOverviewReadInput",
    outputSchemaRef: "Handbook",
  },
  {
    name: "handbook.instrument.read",
    description: "Read the handbook entry for one available MineMusic instrument.",
    inputSchemaRef: "HandbookInstrumentReadInput",
    outputSchemaRef: "HandbookInstrumentEntry",
  },
  {
    name: "handbook.tool.read",
    description: "Read input, output, effect, and description metadata for one available MineMusic tool.",
    inputSchemaRef: "HandbookToolReadInput",
    outputSchemaRef: "HandbookToolEntry",
  },
];

export const stageToolDescriptors: StableToolDescriptor[] = [
  {
    name: "stage.context.read",
    description: "Read dynamic session context.",
    inputSchemaRef: "StageContextReadInput",
    outputSchemaRef: "StageContextReadOutput",
  },
  {
    name: "stage.materials.prepare",
    description: "Prepare grounded materials through the Material Gate before presentation.",
    inputSchemaRef: "StageMaterialsPrepareInput",
    outputSchemaRef: "MusicMaterial[]",
  },
  {
    name: "stage.session.update",
    description: "Update soft session state through Session Context.",
    inputSchemaRef: "StageSessionPatch",
    outputSchemaRef: "StageSession",
  },
  {
    name: "stage.events.record",
    description: "Record a factual session event.",
    inputSchemaRef: "StageEventDraft",
    outputSchemaRef: "StageEvent",
  },
  {
    name: "stage.effects.propose",
    description: "Create a proposal for a durable write or external action.",
    inputSchemaRef: "EffectProposalDraft",
    outputSchemaRef: "EffectProposal",
    effectKind: "proposal",
  },
];

export const musicToolDescriptors: StableToolDescriptor[] = [
  {
    name: "music.material.resolve",
    description: "Resolve music candidates into material through canonical-first material resolution.",
    inputSchemaRef: "MaterialResolveRequest",
    outputSchemaRef: "MaterialResolveResult",
  },
  {
    name: "music.links.refresh",
    description: "Refresh source-backed playable links for a material item.",
    inputSchemaRef: "MusicMaterial",
    outputSchemaRef: "MusicMaterial",
  },
  {
    name: "music.collection.save",
    description: "Save a canonical music object to the owner's saved system collection.",
    inputSchemaRef: "CollectionSystemItemInput",
    outputSchemaRef: "CollectionItem",
  },
  {
    name: "music.collection.unsave",
    description: "Remove a canonical music object from the owner's saved system collection.",
    inputSchemaRef: "CollectionSystemRemoveInput",
    outputSchemaRef: "CollectionItem",
  },
  {
    name: "music.collection.favorite",
    description: "Favorite a canonical music object in the owner's favorite system collection.",
    inputSchemaRef: "CollectionSystemItemInput",
    outputSchemaRef: "CollectionItem",
  },
  {
    name: "music.collection.unfavorite",
    description: "Remove a canonical music object from the owner's favorite system collection.",
    inputSchemaRef: "CollectionSystemRemoveInput",
    outputSchemaRef: "CollectionItem",
  },
  {
    name: "music.collection.block",
    description: "Block a canonical music object from future recommendations for the owner.",
    inputSchemaRef: "CollectionSystemItemInput",
    outputSchemaRef: "CollectionItem",
  },
  {
    name: "music.collection.unblock",
    description: "Remove a canonical music object from the owner's blocked system collection.",
    inputSchemaRef: "CollectionSystemRemoveInput",
    outputSchemaRef: "CollectionItem",
  },
  {
    name: "music.collection.item.add",
    description: "Add a canonical music object to a custom collection by collection id.",
    inputSchemaRef: "CollectionItemAddInput",
    outputSchemaRef: "CollectionItem",
  },
  {
    name: "music.collection.item.remove",
    description: "Remove a canonical music object from a custom collection by collection id.",
    inputSchemaRef: "CollectionItemRemoveInput",
    outputSchemaRef: "CollectionItem",
  },
  {
    name: "music.collection.create",
    description: "Create a user-owned custom collection for one collection kind.",
    inputSchemaRef: "CollectionCreateInput",
    outputSchemaRef: "Collection",
  },
  {
    name: "music.collection.update",
    description: "Update a user-created custom collection label or description.",
    inputSchemaRef: "CollectionUpdateInput",
    outputSchemaRef: "Collection",
  },
  {
    name: "music.collection.delete",
    description: "Soft-remove a user-created custom collection.",
    inputSchemaRef: "CollectionDeleteInput",
    outputSchemaRef: "Collection",
  },
  {
    name: "music.collection.list",
    description: "List owner collections and matching collection items.",
    inputSchemaRef: "CollectionListInput",
    outputSchemaRef: "CollectionListOutput",
  },
];

export const knowledgeToolDescriptors: StableToolDescriptor[] = [
  {
    name: "knowledge.query",
    description: "Query provider-attributed structured or text knowledge.",
    inputSchemaRef: "KnowledgeQuery",
    outputSchemaRef: "KnowledgeResult",
  },
];

export const libraryToolDescriptors: StableToolDescriptor[] = [
  {
    name: "library.source.list",
    description: "List Source Library items in bounded pages as short cards.",
    inputSchemaRef: "SourceLibraryListInput",
    outputSchemaRef: "SourceLibraryListOutput",
  },
  {
    name: "library.import.preview",
    description: "Preview importing saved platform library facts into MineMusic state.",
    inputSchemaRef: "LibraryImportPreviewInput",
    outputSchemaRef: "LibraryImportPreview",
  },
  {
    name: "library.import.start",
    description: "Start importing saved platform library facts into MineMusic state.",
    inputSchemaRef: "LibraryImportStartInput",
    outputSchemaRef: "LibraryImportStatus",
  },
  {
    name: "library.import.continue",
    description: "Continue an existing saved platform library import batch.",
    inputSchemaRef: "LibraryImportContinueInput",
    outputSchemaRef: "LibraryImportStatus",
  },
  {
    name: "library.update.preview",
    description: "Preview a platform library update against MineMusic's latest complete baseline.",
    inputSchemaRef: "LibraryUpdatePreviewInput",
    outputSchemaRef: "LibraryImportPreview",
  },
  {
    name: "library.update.start",
    description: "Start a platform library update against MineMusic's latest complete baseline.",
    inputSchemaRef: "LibraryUpdateStartInput",
    outputSchemaRef: "LibraryImportStatus",
  },
  {
    name: "library.update.continue",
    description: "Continue an existing platform library update batch against MineMusic's latest complete baseline.",
    inputSchemaRef: "LibraryImportContinueInput",
    outputSchemaRef: "LibraryImportStatus",
  },
  {
    name: "library.import.status",
    description: "Read current status for a Library Import batch.",
    inputSchemaRef: "LibraryImportStatusInput",
    outputSchemaRef: "LibraryImportStatus",
  },
  {
    name: "library.import.summary",
    description: "Read the compact completed summary for a Library Import batch.",
    inputSchemaRef: "LibraryImportSummaryInput",
    outputSchemaRef: "LibraryImportSummaryView",
  },
  {
    name: "library.import.items.list",
    description: "List item-level import facts for a Library Import batch in bounded pages.",
    inputSchemaRef: "LibraryImportItemsListInput",
    outputSchemaRef: "LibraryImportItemsListOutput",
  },
];

export const canonicalReviewToolDescriptors: StableToolDescriptor[] = [
  {
    name: "canonical.review.list",
    description: "List current provisional recordings for Canonical Maintenance review; default batch use hides cannot-confirm review-state subjects, and includeCannotConfirm true opts in.",
    inputSchemaRef: "ProvisionalReviewListInput",
    outputSchemaRef: "ProvisionalReviewListOutput",
  },
  {
    name: "canonical.review.inspect",
    description: "Inspect one provisional recording: summary is default; detail requires the latest inspectionId plus recordingRefToken, and releaseTrackPositions also requires releaseRefTokens.",
    inputSchemaRef: "ProvisionalReviewInspectInput",
    outputSchemaRef: "ProvisionalReviewInspection",
  },
  {
    name: "canonical.review.apply",
    description: "Apply an inspected manual decision: update only when inspected facts establish the recording identity and version, or use cannot_confirm as a normal safe outcome with a short reason; do not pass v1 refs or citation fields.",
    inputSchemaRef: "ProvisionalReviewApplyInput",
    outputSchemaRef: "ProvisionalReviewApplyOutput",
    effectKind: "canonical_maintenance",
  },
  {
    name: "canonical.review.auto_update",
    description: "Automatically update only when Canonical Maintenance can strictly qualify exactly one inspected MusicBrainz recording identity.",
    inputSchemaRef: "ProvisionalReviewAutoUpdateInput",
    outputSchemaRef: "ProvisionalReviewAutoUpdateOutput",
    effectKind: "canonical_maintenance",
  },
];

export const memoryToolDescriptors: StableToolDescriptor[] = [
  {
    name: "memory.propose",
    description: "Create an evidence-backed memory proposal.",
    inputSchemaRef: "MemoryProposalDraft",
    outputSchemaRef: "MemoryProposal",
  },
];

export const agentToolDescriptors: StableToolDescriptor[] = [
  ...handbookToolDescriptors,
  ...stageToolDescriptors,
  ...knowledgeToolDescriptors,
  ...musicToolDescriptors,
  ...libraryToolDescriptors,
  ...canonicalReviewToolDescriptors,
  ...memoryToolDescriptors,
];
