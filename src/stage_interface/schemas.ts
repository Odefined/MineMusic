import { z } from "zod/v4";
import type { StableToolName } from "./tools.js";
import {
  canonicalReviewToolInputSchemas,
  handbookToolInputSchemas,
  knowledgeToolInputSchemas,
  libraryToolInputSchemas,
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
  "memory.propose": {
    proposal: z.object({}).passthrough(),
  },
} satisfies Record<StableToolName, StageInterfaceToolInputSchema>;
