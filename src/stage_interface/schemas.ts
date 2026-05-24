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
const collectionKindSchema = z.enum(["recording", "work", "release_group", "release", "artist"]);
const collectionRelationKindSchema = z.enum(["saved", "favorite", "blocked", "custom"]);
const libraryImportScopeSchema = z.enum([
  "discovery",
  "saved_recordings",
  "saved_releases",
  "saved_artists",
]);

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
    ownerScope: z.string().optional(),
    limitPerCandidate: z.number().int().positive().optional(),
  },
  "music.links.refresh": {
    material: musicMaterialSchema,
  },
  "music.collection.save": {
    ownerScope: z.string().optional(),
    canonicalRef: refSchema,
    label: z.string(),
    description: z.string().optional(),
  },
  "music.collection.unsave": {
    ownerScope: z.string().optional(),
    canonicalRef: refSchema,
  },
  "music.collection.favorite": {
    ownerScope: z.string().optional(),
    canonicalRef: refSchema,
    label: z.string(),
    description: z.string().optional(),
  },
  "music.collection.unfavorite": {
    ownerScope: z.string().optional(),
    canonicalRef: refSchema,
  },
  "music.collection.block": {
    ownerScope: z.string().optional(),
    canonicalRef: refSchema,
    label: z.string(),
    description: z.string().optional(),
  },
  "music.collection.unblock": {
    ownerScope: z.string().optional(),
    canonicalRef: refSchema,
  },
  "music.collection.item.add": {
    collectionId: z.string(),
    canonicalRef: refSchema,
    label: z.string(),
    description: z.string().optional(),
  },
  "music.collection.item.remove": {
    collectionId: z.string(),
    canonicalRef: refSchema,
  },
  "music.collection.create": {
    ownerScope: z.string().optional(),
    collectionKind: collectionKindSchema,
    label: z.string(),
    description: z.string().optional(),
  },
  "music.collection.update": {
    collectionId: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
  },
  "music.collection.delete": {
    collectionId: z.string(),
  },
  "music.collection.list": {
    ownerScope: z.string().optional(),
    collectionId: z.string().optional(),
    collectionKind: collectionKindSchema.optional(),
    relationKind: collectionRelationKindSchema.optional(),
    includeRemoved: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
    cursor: z.string().optional(),
  },
  "music.library.import.preview": {
    providerId: z.string(),
    providerAccountId: z.string().optional(),
    ownerScope: z.string().optional(),
    scopes: z.array(libraryImportScopeSchema).min(1),
    sampleLimitPerArea: z.number().int().positive().optional(),
  },
  "music.library.import.start": {
    providerId: z.string(),
    providerAccountId: z.string().optional(),
    ownerScope: z.string().optional(),
    scopes: z.array(libraryImportScopeSchema).min(1),
    sampleLimitPerArea: z.number().int().positive().optional(),
  },
  "music.library.update.preview": {
    providerId: z.string(),
    providerAccountId: z.string().optional(),
    ownerScope: z.string().optional(),
    scopes: z.array(libraryImportScopeSchema).min(1),
    sampleLimitPerArea: z.number().int().positive().optional(),
  },
  "music.library.update.start": {
    providerId: z.string(),
    providerAccountId: z.string().optional(),
    ownerScope: z.string().optional(),
    scopes: z.array(libraryImportScopeSchema).min(1),
    sampleLimitPerArea: z.number().int().positive().optional(),
  },
  "music.library.import.status": {
    batchId: z.string(),
  },
  "music.library.import.summary": {
    batchId: z.string(),
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
