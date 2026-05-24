import type { ToolDescriptor, ToolName } from "../contracts/index.js";

export const stableToolNames = [
  "stage.context.read",
  "handbook.overview.read",
  "handbook.instrument.read",
  "handbook.tool.read",
  "stage.materials.prepare",
  "music.material.resolve",
  "music.links.refresh",
  "events.record",
  "memory.propose",
  "effects.propose",
  "session.update",
] as const satisfies readonly ToolName[];

export const handbookToolDescriptors: ToolDescriptor[] = [
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

export const mvpToolDescriptors: ToolDescriptor[] = [
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
    name: "events.record",
    description: "Record a factual session event.",
    inputSchemaRef: "StageEventDraft",
    outputSchemaRef: "StageEvent",
  },
  {
    name: "memory.propose",
    description: "Create an evidence-backed memory proposal.",
    inputSchemaRef: "MemoryProposalDraft",
    outputSchemaRef: "MemoryProposal",
  },
  {
    name: "effects.propose",
    description: "Create a proposal for a durable write or external action.",
    inputSchemaRef: "EffectProposalDraft",
    outputSchemaRef: "EffectProposal",
    effectKind: "proposal",
  },
  {
    name: "session.update",
    description: "Update soft session state through Session Context.",
    inputSchemaRef: "StageSessionPatch",
    outputSchemaRef: "StageSession",
  },
];

export const agentToolDescriptors: ToolDescriptor[] = [
  ...handbookToolDescriptors,
  ...mvpToolDescriptors,
];
