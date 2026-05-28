import type { StableToolName } from "./tools.js";
import {
  canonicalReviewToolInputSchemas,
  handbookToolInputSchemas,
  knowledgeToolInputSchemas,
  libraryToolInputSchemas,
  memoryToolInputSchemas,
  musicToolInputSchemas,
  stageToolInputSchemas,
  type StageInterfaceToolInputSchema,
} from "./tool_definitions/index.js";

export type { StageInterfaceToolInputSchema };

export const stageInterfaceToolInputSchemas = {
  ...stageToolInputSchemas,
  ...handbookToolInputSchemas,
  ...musicToolInputSchemas,
  ...knowledgeToolInputSchemas,
  ...libraryToolInputSchemas,
  ...canonicalReviewToolInputSchemas,
  ...memoryToolInputSchemas,
} satisfies Record<StableToolName, StageInterfaceToolInputSchema>;
