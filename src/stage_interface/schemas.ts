import { z } from "zod/v4";
import type { StableToolName } from "./tools.js";
import {
  handbookToolInputSchemas,
  libraryToolInputSchemas,
  musicToolInputSchemas,
  stageToolInputSchemas,
  type StageInterfaceToolInputSchema,
} from "./tool_definitions/index.js";

export type { StageInterfaceToolInputSchema };

const refSchema = z.object({
  namespace: z.string(),
  kind: z.string(),
  id: z.string(),
  label: z.string().optional(),
  url: z.string().optional(),
});
const knowledgeQuerySchema = {
  text: z.string().optional(),
  canonicalRef: refSchema.optional(),
  providerRef: refSchema.optional(),
  tagQuery: z.array(z.string()).optional(),
  fieldQuery: z.object({
    title: z.string().optional(),
    artist: z.string().optional(),
    release: z.string().optional(),
    label: z.string().optional(),
    date: z.string().optional(),
    country: z.string().optional(),
    barcode: z.string().optional(),
    catalogNumber: z.string().optional(),
    type: z.string().optional(),
  }).optional(),
  filters: z.object({
    tags: z.object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    }).optional(),
  }).optional(),
  purpose: z.enum(["lookup", "explain", "review", "discover"]).optional(),
  formats: z.array(z.enum(["structured", "text"])).optional(),
  entityKinds: z.array(z.string()).optional(),
  expand: z.array(z.string()).optional(),
  relationFocus: z.array(z.enum(["members"])).optional(),
  limit: z.number().int().positive().max(50).optional(),
  cursor: z.string().optional(),
};
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
  "knowledge.query": knowledgeQuerySchema,
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
