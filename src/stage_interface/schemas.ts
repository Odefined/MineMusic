import { z } from "zod/v4";
import type { StableToolName } from "./tools.js";

const refSchema = z.object({
  namespace: z.string(),
  kind: z.string(),
  id: z.string(),
  label: z.string().optional(),
  url: z.string().optional(),
});
const musicMaterialSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  state: z.string(),
}).passthrough();
const sourceQuerySchema = z.object({
  text: z.string().optional(),
  canonicalRef: refSchema.optional(),
  sourceRef: refSchema.optional(),
  limit: z.number().int().positive().optional(),
});
const musicCandidateSchema = z.object({
  id: z.string(),
  label: z.string(),
  expectedKind: z.string().optional(),
  query: sourceQuerySchema.optional(),
  canonicalRef: refSchema.optional(),
  sourceRef: refSchema.optional(),
  reason: z.string().optional(),
  context: z.string().optional(),
});

export type StageInterfaceToolInputSchema = z.ZodRawShape;

export const stageInterfaceToolInputSchemas = {
  "stage.context.read": {},
  "handbook.overview.read": {},
  "handbook.instrument.read": {
    instrumentId: z.string(),
  },
  "handbook.tool.read": {
    toolName: z.string(),
  },
  "stage.materials.prepare": {
    materials: z.array(musicMaterialSchema),
    purpose: z.enum(["recommendation", "memory", "effect", "conversation"]),
  },
  "music.material.resolve": {
    kind: z.enum(["single", "candidate_set"]),
    candidate: musicCandidateSchema.optional(),
    candidates: z.array(musicCandidateSchema).optional(),
    sessionId: z.string().optional(),
    limitPerCandidate: z.number().int().positive().optional(),
  },
  "music.links.refresh": {
    material: musicMaterialSchema,
  },
  "events.record": {
    event: z.object({}).passthrough(),
  },
  "memory.propose": {
    proposal: z.object({}).passthrough(),
  },
  "effects.propose": {
    proposal: z.object({}).passthrough(),
  },
  "session.update": {
    patch: z.object({}).passthrough(),
    sessionId: z.string().optional(),
  },
} satisfies Record<StableToolName, StageInterfaceToolInputSchema>;
