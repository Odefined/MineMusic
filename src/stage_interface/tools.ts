import type { ToolDescriptor, ToolName } from "../contracts/index.js";
import {
  canonicalReviewToolDescriptors,
  canonicalReviewToolNames,
  handbookToolDescriptors,
  handbookToolNames,
  knowledgeToolDescriptors,
  knowledgeToolNames,
  libraryToolDescriptors,
  libraryToolNames,
  musicToolDescriptors,
  musicToolNames,
  stageToolDescriptors,
  stageToolNames,
} from "./tool_definitions/index.js";

export const stableToolNames = [
  stageToolNames[0],
  ...handbookToolNames,
  ...stageToolNames.slice(1),
  musicToolNames[0],
  ...knowledgeToolNames,
  ...musicToolNames.slice(1),
  ...libraryToolNames,
  ...canonicalReviewToolNames,
  "memory.propose",
] as const satisfies readonly ToolName[];

export type StableToolName = (typeof stableToolNames)[number];

export type StableToolDescriptor = Omit<ToolDescriptor, "name"> & {
  name: StableToolName;
};

export { handbookToolDescriptors, stageToolDescriptors };

export { musicToolDescriptors };

export { knowledgeToolDescriptors };

export { libraryToolDescriptors };

export { canonicalReviewToolDescriptors };

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
