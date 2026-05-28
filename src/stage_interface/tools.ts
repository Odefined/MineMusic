import type { ToolDescriptor, ToolName } from "../contracts/index.js";
import {
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

export { handbookToolDescriptors, stageToolDescriptors };

export { musicToolDescriptors };

export { knowledgeToolDescriptors };

export { libraryToolDescriptors };

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
