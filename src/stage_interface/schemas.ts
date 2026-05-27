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
  "stage.session.update": {
    patch: z.object({}).passthrough(),
    sessionId: z.string().optional(),
  },
  "stage.events.record": {
    event: z.object({}).passthrough(),
  },
  "stage.effects.propose": {
    proposal: z.object({}).passthrough(),
  },
  "music.material.resolve": {
    kind: z.enum(["single", "candidate_set"]),
    candidate: musicCandidateSchema.optional(),
    candidates: z.array(musicCandidateSchema).optional(),
    sessionId: z.string().optional(),
    ownerScope: z.string().optional(),
    limitPerCandidate: z.number().int().positive().optional(),
  },
  "knowledge.query": knowledgeQuerySchema,
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
  "library.import.preview": {
    providerId: z.string(),
    providerAccountId: z.string().optional(),
    ownerScope: z.string().optional(),
    scopes: z.array(libraryImportScopeSchema).min(1),
    sampleLimitPerArea: z.number().int().positive().optional(),
  },
  "library.import.start": {
    providerId: z.string(),
    providerAccountId: z.string().optional(),
    ownerScope: z.string().optional(),
    scopes: z.array(libraryImportScopeSchema).min(1),
    sampleLimitPerArea: z.number().int().positive().optional(),
  },
  "library.update.preview": {
    providerId: z.string(),
    providerAccountId: z.string().optional(),
    ownerScope: z.string().optional(),
    scopes: z.array(libraryImportScopeSchema).min(1),
    sampleLimitPerArea: z.number().int().positive().optional(),
  },
  "library.update.start": {
    providerId: z.string(),
    providerAccountId: z.string().optional(),
    ownerScope: z.string().optional(),
    scopes: z.array(libraryImportScopeSchema).min(1),
    sampleLimitPerArea: z.number().int().positive().optional(),
  },
  "library.import.status": {
    batchId: z.string(),
  },
  "library.import.summary": {
    batchId: z.string(),
  },
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
