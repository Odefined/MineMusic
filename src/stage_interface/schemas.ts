import { z } from "zod/v4";
import type { StableToolName } from "./tools.js";
import {
  handbookToolInputSchemas,
  knowledgeToolInputSchemas,
  libraryToolInputSchemas,
  musicToolInputSchemas,
  stageToolInputSchemas,
  type StageInterfaceToolInputSchema,
} from "./tool_definitions/index.js";

export type { StageInterfaceToolInputSchema };

const reviewSupportReasonKindSchema = z.enum([
  "artist_credit",
  "duration",
  "isrc",
  "release_appearance",
  "source_ref_context",
  "direct_relation_context",
  "tracklist_context",
  "active_neighbor_anchor",
]);
const reviewRefTokenSchema = z.object({
  kind: z.enum(["recording", "release"]),
  id: z.string(),
});

export const stageInterfaceToolInputSchemas = {
  ...stageToolInputSchemas,
  ...handbookToolInputSchemas,
  ...musicToolInputSchemas,
  ...knowledgeToolInputSchemas,
  ...libraryToolInputSchemas,
  "canonical.review.list": {
    limit: z.number().int().positive().optional(),
    cursor: z.string().optional(),
    includeCannotConfirm: z.boolean().optional(),
  },
  "canonical.review.inspect": {
    subjectId: z.string(),
    view: z.enum(["summary", "detail"]).optional(),
    inspectionId: z.string().optional(),
    recordingRefToken: reviewRefTokenSchema.optional(),
    include: z.array(z.enum(["releaseAppearances", "releaseTrackPositions"])).optional(),
    releaseRefTokens: z.array(reviewRefTokenSchema).optional(),
    knowledgeFactLimit: z.number().int().positive().optional(),
  },
  "canonical.review.apply": {
    inspectionId: z.string(),
    subjectId: z.string(),
    action: z.enum(["update", "cannot_confirm"]),
    selectedProviderRefToken: reviewRefTokenSchema.optional(),
    reason: z.string(),
  },
  "canonical.review.auto_update": {
    subjectId: z.string().optional(),
    limit: z.number().int().positive().optional(),
    runId: z.string().optional(),
    includeCannotConfirm: z.boolean().optional(),
  },
  "memory.propose": {
    proposal: z.object({}).passthrough(),
  },
} satisfies Record<StableToolName, StageInterfaceToolInputSchema>;
