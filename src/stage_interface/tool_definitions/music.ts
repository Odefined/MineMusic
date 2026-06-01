import { z } from "zod/v4";

import type {
  CollectionItem,
  CollectionKind,
  CollectionRelationKind,
  MaterialContextBriefInput,
  MaterialPolicyInput,
  MaterialPoolsListInput,
  MaterialQueryOutput,
  MaterialQueryInput,
  MaterialRelatedOutput,
  MaterialRelatedInput,
  MaterialResolveCardsOutput,
  MaterialResolveResult,
  MaterialResolveRequest,
  MaterialResolveCardsInput,
  MaterialSelectOutput,
  MaterialSelectInput,
  Ref,
  Result,
  StageError,
  ToolDescriptor,
} from "../../contracts/index.js";
import type {
  CollectionPort,
  MaterialQueryPort,
  MaterialQuerySupportPort,
  MaterialResolvePort,
  MaterialRelatedPort,
  MaterialSelectorPort,
  MaterialStorePort,
  SourceGroundingPort,
  SystemCollectionRelationKind,
} from "../../ports/index.js";
import type {
  StageInterfaceToolDefinition,
  StageInterfaceToolInputSchema,
} from "./types.js";
import { materialForMaterialId, materialIdToRef } from "../../material_query/index.js";
import {
  compactMaterialQueryOutput,
  compactMaterialRelatedOutput,
  compactMaterialResolveCardsOutput,
  compactMaterialResolveOutput,
  compactMaterialSelectOutput,
} from "../outputs/material.js";
import { defineStageInterfaceTool, descriptorForToolDefinition } from "./types.js";

export const musicToolNames = [
  "music.material.resolve",
  "music.material.resolve.cards",
  "music.material.query",
  "music.material.related",
  "music.material.select",
  "music.material.context.brief",
  "music.pools.list",
  "music.links.refresh",
  "music.collection.save",
  "music.collection.unsave",
  "music.collection.favorite",
  "music.collection.unfavorite",
  "music.collection.block",
  "music.collection.unblock",
  "music.collection.item.add",
  "music.collection.item.remove",
  "music.collection.create",
  "music.collection.update",
  "music.collection.delete",
  "music.collection.list",
] as const;

export type MusicToolName = (typeof musicToolNames)[number];

export type MusicToolGroupContext = {
  materialResolve: MaterialResolvePort;
  materialQuery?: MaterialQueryPort & MaterialRelatedPort & MaterialQuerySupportPort;
  materialSelector?: MaterialSelectorPort;
  materialStore?: MaterialStorePort;
  source: SourceGroundingPort;
  collection?: CollectionPort;
};

type CollectionSystemAddPayload = {
  ownerScope: string;
  materialId?: string;
  canonicalRef?: Ref;
  materialRef?: Ref;
  collectionKind?: CollectionKind;
  label: string;
  materialSnapshot?: CollectionItem["materialSnapshot"];
  relationScope?: CollectionItem["relationScope"];
  identityRequirement?: CollectionItem["identityRequirement"];
  description?: string;
};

type CollectionSystemRemovePayload = {
  ownerScope: string;
  materialId?: string;
  canonicalRef?: Ref;
  materialRef?: Ref;
  collectionKind?: CollectionKind;
};

type CollectionItemAddPayload = {
  collectionId: string;
  materialId?: string;
  canonicalRef?: Ref;
  materialRef?: Ref;
  label: string;
  materialSnapshot?: CollectionItem["materialSnapshot"];
  relationScope?: CollectionItem["relationScope"];
  identityRequirement?: CollectionItem["identityRequirement"];
  description?: string;
};

type CollectionItemRemovePayload = {
  collectionId: string;
  materialId?: string;
  canonicalRef?: Ref;
  materialRef?: Ref;
};

type CollectionCreatePayload = {
  ownerScope: string;
  collectionKind: CollectionKind;
  label: string;
  description?: string;
};

type CollectionUpdatePayload = {
  collectionId: string;
  label?: string;
  description?: string;
};

type CollectionListPayload = {
  ownerScope: string;
  collectionId?: string;
  collectionKind?: CollectionKind;
  relationKind?: CollectionRelationKind;
  includeRemoved?: boolean;
  limit?: number;
  cursor?: string;
};

type MusicLinksRefreshPayload = {
  ownerScope?: string;
  materialId: string;
  sessionId?: string;
};

const defaultOwnerScope = "local_profile:default";

const refSchema = z.object({
  namespace: z.string(),
  kind: z.string(),
  id: z.string(),
  label: z.string().optional(),
  url: z.string().optional(),
});

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
  sourceLibraryScope: z.object({
    providerId: z.string().optional(),
    providerAccountId: z.string().optional(),
    libraryKind: z.enum(["saved_source_track", "saved_source_release", "saved_source_artist"]).optional(),
    status: z.enum(["present", "absent"]).optional(),
  }).optional(),
  reason: z.string().optional(),
  context: z.string().optional(),
});

const collectionKindSchema = z.enum(["recording", "work", "release_group", "release", "artist"]);
const collectionRelationKindSchema = z.enum(["saved", "favorite", "blocked", "custom"]);
const materialIdSchema = z.string();
const resolveSeedSchema = z.object({
  materialId: materialIdSchema.optional(),
  text: z.string().optional(),
  kind: z.string().optional(),
  sourceRef: refSchema.optional(),
  canonicalRef: refSchema.optional(),
  reason: z.string().optional(),
});
const materialPoolSchema = z.union([
  z.object({ kind: z.literal("all") }),
  z.object({
    kind: z.literal("source_library"),
    areas: z.array(z.enum(["saved_tracks", "saved_albums", "followed_artists"])).optional(),
    providerId: z.string().optional(),
    expand: z.enum(["none", "tracks"]).optional(),
  }),
  z.object({
    kind: z.literal("collection"),
    ref: z.string().optional(),
    label: z.string().optional(),
    relation: z.enum(["saved", "favorite", "custom", "blocked"]).optional(),
    expand: z.enum(["none", "tracks"]).optional(),
  }),
  z.object({
    kind: z.literal("related"),
    materialId: materialIdSchema,
    relation: z.enum(["same_artist", "same_album", "similar"]),
  }),
]);
const materialConstraintsSchema = z.object({
  availability: z.enum(["playable", "any"]).optional(),
  identity: z.enum(["confirmed_only", "allow_source_backed"]).optional(),
});
const materialExcludeSchema = z.object({
  materialIds: z.array(materialIdSchema).optional(),
  relations: z.array(z.enum(["blocked", "wrong_version", "not_playable", "bad_match"])).optional(),
  recent: z.object({
    recommended: z.enum(["session", "1h", "24h", "7d"]).optional(),
    played: z.enum(["session", "1h", "24h", "7d"]).optional(),
    opened: z.enum(["session", "1h", "24h", "7d"]).optional(),
    mode: z.enum(["hard", "soft"]).optional(),
  }).optional(),
});
const materialFreshnessPolicySchema = z.object({
  recommended: z.enum(["session", "1h", "24h", "7d"]).optional(),
  played: z.enum(["session", "1h", "24h", "7d"]).optional(),
  opened: z.enum(["session", "1h", "24h", "7d"]).optional(),
  mode: z.enum(["hard", "soft", "off"]).optional(),
});
const materialPolicySchema = z.object({
  purpose: z.literal("candidate_selection").optional(),
  availability: z.enum(["playable", "any"]).optional(),
  identity: z.enum(["confirmed_only", "allow_source_backed"]).optional(),
  excludeRelations: z.array(z.enum(["blocked", "wrong_version", "not_playable", "bad_match"])).optional(),
  freshness: materialFreshnessPolicySchema.optional(),
});
const materialSortSchema = z.object({
  order: z.enum(["preserve", "score", "least_recently_recommended", "recently_added", "random"]),
});
const materialSelectCandidateSchema = z.object({
  materialId: materialIdSchema,
  score: z.number().optional(),
  reason: z.string().optional(),
});
const materialSelectDiversitySchema = z.object({
  maxPerArtist: z.number().int().positive().optional(),
  maxPerAlbum: z.number().int().positive().optional(),
});
const materialSelectInputSchema = {
  candidates: z.array(materialSelectCandidateSchema),
  policy: materialPolicySchema.optional(),
  sort: materialSortSchema.optional(),
  limit: z.number().int().positive().optional(),
  diversity: materialSelectDiversitySchema.optional(),
  ownerScope: z.string().optional(),
  sessionId: z.string().optional(),
} satisfies StageInterfaceToolInputSchema;
const materialSelectInputParser =
  z.object(materialSelectInputSchema).passthrough() as z.ZodType<PublicMaterialSelectInput>;

export const musicToolDefinitions = [
  {
    name: "music.material.resolve",
    description: "Resolve music candidates into material through canonical-first material resolution.",
    inputSchemaRef: "MaterialResolveRequest",
    outputSchemaRef: "CompactMaterialResolveOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      kind: z.enum(["single", "candidate_set"]),
      candidate: musicCandidateSchema.optional(),
      candidates: z.array(musicCandidateSchema).optional(),
      sessionId: z.string().optional(),
      ownerScope: z.string().optional(),
      sourceLibraryScope: z.object({
        providerId: z.string().optional(),
        providerAccountId: z.string().optional(),
        libraryKind: z.enum(["saved_source_track", "saved_source_release", "saved_source_artist"]).optional(),
        status: z.enum(["present", "absent"]).optional(),
      }).optional(),
      limitPerCandidate: z.number().int().positive().optional(),
    },
    validatePayload: validateMaterialResolvePayload,
    handler({ context, sessionId, payload }) {
      return context.materialResolve.resolve(
        readPayload<MaterialResolveRequest>(payload, { sessionId }),
      );
    },
    present: (value) => compactMaterialResolveOutput(value as MaterialResolveResult),
  },
  {
    name: "music.material.resolve.cards",
    description: "Resolve material seeds and return compact agent-safe material cards.",
    inputSchemaRef: "MaterialResolveCardsInput",
    outputSchemaRef: "CompactMaterialResolveCardsOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      seeds: z.array(resolveSeedSchema),
      purpose: z.enum(["recommend", "lookup", "play"]).optional(),
      ownerScope: z.string().optional(),
      limit: z.number().int().positive().optional(),
    },
    handler({ context, payload }) {
      const materialQuery = readMaterialQuery(context.materialQuery);

      if (!materialQuery.ok) {
        return materialQuery;
      }

      return materialQuery.value.resolveCards(
        readPayload<MaterialResolveCardsInput>(payload),
      );
    },
    present: (value) => compactMaterialResolveCardsOutput(value as MaterialResolveCardsOutput),
  },
  {
    name: "music.material.query",
    description: "Retrieve compact material cards from pools, collections, source library, related pools, or all available material.",
    inputSchemaRef: "MaterialQueryInput",
    outputSchemaRef: "CompactMaterialQueryOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      q: z.string().optional(),
      returnKind: z.enum(["recording", "artist", "album", "release", "release_group"]).optional(),
      pool: materialPoolSchema.optional(),
      constraints: materialConstraintsSchema.optional(),
      exclude: materialExcludeSchema.optional(),
      order: z.enum(["relevance", "recently_added", "least_recently_recommended", "random"]).optional(),
      ownerScope: z.string().optional(),
      sessionId: z.string().optional(),
      limit: z.number().int().positive().optional(),
      cursor: z.string().optional(),
    },
    handler({ context, sessionId, payload }) {
      const materialQuery = readMaterialQuery(context.materialQuery);

      if (!materialQuery.ok) {
        return materialQuery;
      }

      return materialQuery.value.query(
        stripPublicMaterialPreferenceHints(
          readPayload<MaterialQueryInput>(payload, { sessionId }),
        ),
      );
    },
    present: (value) => compactMaterialQueryOutput(value as MaterialQueryOutput),
  },
  {
    name: "music.material.related",
    description: "Find compact material cards related to one material id.",
    inputSchemaRef: "MaterialRelatedInput",
    outputSchemaRef: "CompactMaterialRelatedOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      materialId: materialIdSchema,
      relation: z.enum(["same_artist", "same_album", "similar"]),
      exclude: materialExcludeSchema.optional(),
      constraints: materialConstraintsSchema.optional(),
      ownerScope: z.string().optional(),
      sessionId: z.string().optional(),
      limit: z.number().int().positive().optional(),
    },
    handler({ context, sessionId, payload }) {
      const materialQuery = readMaterialQuery(context.materialQuery);

      if (!materialQuery.ok) {
        return materialQuery;
      }

      return materialQuery.value.related(
        stripPublicMaterialPreferenceHints(
          readPayload<MaterialRelatedInput>(payload, { sessionId }),
        ),
      );
    },
    present: (value) => compactMaterialRelatedOutput(value as MaterialRelatedOutput),
  },
  defineStageInterfaceTool<
    "music.material.select",
    MusicToolGroupContext,
    PublicMaterialSelectInput
  >({
    name: "music.material.select",
    description: "Apply reusable material policy, sorting, diversity, and limit after material ids have already been retrieved; use music.material.query to retrieve from pools or collections.",
    inputSchemaRef: "MaterialSelectInput",
    outputSchemaRef: "CompactMaterialSelectOutput",
    availability: "requires_active_instrument",
    inputSchema: materialSelectInputSchema,
    inputParser: materialSelectInputParser,
    handler({ context, sessionId, payload }) {
      const materialSelector = readMaterialSelector(context.materialSelector);

      if (!materialSelector.ok) {
        return materialSelector;
      }

      return materialSelector.value.select(
        normalizePublicMaterialSelectInput({ ...payload, sessionId: payload.sessionId ?? sessionId }),
      );
    },
    present: (value) => compactMaterialSelectOutput(value as MaterialSelectOutput),
  }),
  {
    name: "music.material.context.brief",
    description: "Read a compact context brief for one material id; do not request version during ordinary recommendations.",
    inputSchemaRef: "MaterialContextBriefInput",
    outputSchemaRef: "MaterialContextBriefOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      materialId: materialIdSchema,
      fields: z.array(z.enum(["artist", "album", "version", "status"])),
    },
    handler({ context, payload }) {
      const materialQuery = readMaterialQuery(context.materialQuery);

      if (!materialQuery.ok) {
        return materialQuery;
      }

      if (materialQuery.value.contextBrief === undefined) {
        return materialQueryUnavailable("Material context brief is not available.");
      }

      return materialQuery.value.contextBrief(readPayload<MaterialContextBriefInput>(payload));
    },
  },
  {
    name: "music.pools.list",
    description: "List compact material pools available to query.",
    inputSchemaRef: "MaterialPoolsListInput",
    outputSchemaRef: "MaterialPoolsListOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      kinds: z.array(z.enum(["source_library", "collection", "dynamic"])).optional(),
      ownerScope: z.string().optional(),
    },
    handler({ context, payload }) {
      const materialQuery = readMaterialQuery(context.materialQuery);

      if (!materialQuery.ok) {
        return materialQuery;
      }

      if (materialQuery.value.listPools === undefined) {
        return materialQueryUnavailable("Material pool listing is not available.");
      }

      return materialQuery.value.listPools(readPayload<MaterialPoolsListInput>(payload));
    },
  },
  {
    name: "music.links.refresh",
    description: "Refresh source-backed playable links by material id after the user reports a link problem.",
    inputSchemaRef: "MusicLinksRefreshInput",
    outputSchemaRef: "MusicMaterial",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema,
      sessionId: z.string().optional(),
    },
    async handler({ context, sessionId, payload }) {
      const input = readPayload<MusicLinksRefreshPayload>(payload, { sessionId });
      const availableMaterialStore = readMaterialStore(context.materialStore);

      if (!availableMaterialStore.ok) {
        return availableMaterialStore;
      }

      const material = await materialForMaterialId({
        materialStore: availableMaterialStore.value,
        materialId: input.materialId,
        ownerScope: input.ownerScope ?? defaultOwnerScope,
        purpose: "resolve.cards",
      });

      if (!material.ok) {
        return material;
      }

      if (material.value === null) {
        return fail({
          code: "material_registry.not_found",
          message: `Material '${input.materialId}' was not found.`,
          module: "material_store",
          retryable: false,
        });
      }

      return context.source.refreshPlayableLinks({
        material: material.value,
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      });
    },
  },
  {
    name: "music.collection.save",
    description: "Save a canonical or material music object to the owner's saved system collection.",
    inputSchemaRef: "CollectionSystemItemInput",
    outputSchemaRef: "CollectionItem",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema.optional(),
      canonicalRef: refSchema.optional(),
      collectionKind: collectionKindSchema.optional(),
      label: z.string(),
      description: z.string().optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionAdd(context.collection, payload, "saved");
    },
  },
  {
    name: "music.collection.unsave",
    description: "Remove a canonical or material music object from the owner's saved system collection.",
    inputSchemaRef: "CollectionSystemRemoveInput",
    outputSchemaRef: "CollectionItem",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema.optional(),
      canonicalRef: refSchema.optional(),
      collectionKind: collectionKindSchema.optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionRemove(context.collection, payload, "saved");
    },
  },
  {
    name: "music.collection.favorite",
    description: "Favorite a canonical or material music object in the owner's favorite system collection.",
    inputSchemaRef: "CollectionSystemItemInput",
    outputSchemaRef: "CollectionItem",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema.optional(),
      canonicalRef: refSchema.optional(),
      collectionKind: collectionKindSchema.optional(),
      label: z.string(),
      description: z.string().optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionAdd(context.collection, payload, "favorite");
    },
  },
  {
    name: "music.collection.unfavorite",
    description: "Remove a canonical or material music object from the owner's favorite system collection.",
    inputSchemaRef: "CollectionSystemRemoveInput",
    outputSchemaRef: "CollectionItem",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema.optional(),
      canonicalRef: refSchema.optional(),
      collectionKind: collectionKindSchema.optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionRemove(context.collection, payload, "favorite");
    },
  },
  {
    name: "music.collection.block",
    description: "Block a canonical or material music object from future recommendations for the owner.",
    inputSchemaRef: "CollectionSystemItemInput",
    outputSchemaRef: "CollectionItem",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema.optional(),
      canonicalRef: refSchema.optional(),
      collectionKind: collectionKindSchema.optional(),
      label: z.string(),
      description: z.string().optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionAdd(context.collection, payload, "blocked");
    },
  },
  {
    name: "music.collection.unblock",
    description: "Remove a canonical or material music object from the owner's blocked system collection.",
    inputSchemaRef: "CollectionSystemRemoveInput",
    outputSchemaRef: "CollectionItem",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema.optional(),
      canonicalRef: refSchema.optional(),
      collectionKind: collectionKindSchema.optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionRemove(context.collection, payload, "blocked");
    },
  },
  {
    name: "music.collection.item.add",
    description: "Add a canonical or material music object to a custom collection by collection id.",
    inputSchemaRef: "CollectionItemAddInput",
    outputSchemaRef: "CollectionItem",
    availability: "requires_active_instrument",
    inputSchema: {
      collectionId: z.string(),
      materialId: materialIdSchema.optional(),
      canonicalRef: refSchema.optional(),
      label: z.string(),
      description: z.string().optional(),
    },
    handler({ context, payload }) {
      const availableCollection = readCollection(context.collection);

      if (!availableCollection.ok) {
        return availableCollection;
      }

      const input = readPayload<CollectionItemAddPayload>(payload);
      const materialRef = materialRefFromCollectionPayload(input);

      if (materialRef !== undefined) {
        return availableCollection.value.addMaterialToCollection({
          ...input,
          materialRef,
        });
      }

      if (input.canonicalRef === undefined) {
        return invalidPayload("music.collection.item.add requires canonicalRef, materialRef, or materialId.");
      }

      return availableCollection.value.addItemToCollection({
        ...input,
        canonicalRef: input.canonicalRef,
      });
    },
  },
  {
    name: "music.collection.item.remove",
    description: "Remove a canonical or material music object from a custom collection by collection id.",
    inputSchemaRef: "CollectionItemRemoveInput",
    outputSchemaRef: "CollectionItem",
    availability: "requires_active_instrument",
    inputSchema: {
      collectionId: z.string(),
      materialId: materialIdSchema.optional(),
      canonicalRef: refSchema.optional(),
    },
    handler({ context, payload }) {
      const availableCollection = readCollection(context.collection);

      if (!availableCollection.ok) {
        return availableCollection;
      }

      const input = readPayload<CollectionItemRemovePayload>(payload);
      const materialRef = materialRefFromCollectionPayload(input);

      if (materialRef !== undefined) {
        return availableCollection.value.removeMaterialFromCollection({
          collectionId: input.collectionId,
          materialRef,
        });
      }

      if (input.canonicalRef === undefined) {
        return invalidPayload("music.collection.item.remove requires canonicalRef, materialRef, or materialId.");
      }

      return availableCollection.value.removeItemFromCollection({
        collectionId: input.collectionId,
        canonicalRef: input.canonicalRef,
      });
    },
  },
  {
    name: "music.collection.create",
    description: "Create a user-owned custom collection for one collection kind.",
    inputSchemaRef: "CollectionCreateInput",
    outputSchemaRef: "Collection",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      collectionKind: collectionKindSchema,
      label: z.string(),
      description: z.string().optional(),
    },
    handler({ context, payload }) {
      const availableCollection = readCollection(context.collection);

      if (!availableCollection.ok) {
        return availableCollection;
      }

      return availableCollection.value.createCollection({
        ...readPayload<CollectionCreatePayload>(payload, { ownerScope: defaultOwnerScope }),
        relationKind: "custom",
      });
    },
  },
  {
    name: "music.collection.update",
    description: "Update a user-created custom collection label or description.",
    inputSchemaRef: "CollectionUpdateInput",
    outputSchemaRef: "Collection",
    availability: "requires_active_instrument",
    inputSchema: {
      collectionId: z.string(),
      label: z.string().optional(),
      description: z.string().optional(),
    },
    handler({ context, payload }) {
      const availableCollection = readCollection(context.collection);

      if (!availableCollection.ok) {
        return availableCollection;
      }

      return availableCollection.value.updateCollection(
        readPayload<CollectionUpdatePayload>(payload),
      );
    },
  },
  {
    name: "music.collection.delete",
    description: "Soft-remove a user-created custom collection.",
    inputSchemaRef: "CollectionDeleteInput",
    outputSchemaRef: "Collection",
    availability: "requires_active_instrument",
    inputSchema: {
      collectionId: z.string(),
    },
    handler({ context, payload }) {
      const availableCollection = readCollection(context.collection);

      if (!availableCollection.ok) {
        return availableCollection;
      }

      return availableCollection.value.removeCollection(
        readPayload<{ collectionId: string }>(payload),
      );
    },
  },
  {
    name: "music.collection.list",
    description: "List owner collections and matching collection items.",
    inputSchemaRef: "CollectionListInput",
    outputSchemaRef: "CollectionListOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      collectionId: z.string().optional(),
      collectionKind: collectionKindSchema.optional(),
      relationKind: collectionRelationKindSchema.optional(),
      includeRemoved: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
      cursor: z.string().optional(),
    },
    async handler({ context, payload }) {
      const availableCollection = readCollection(context.collection);

      if (!availableCollection.ok) {
        return availableCollection;
      }

      const input = readPayload<CollectionListPayload>(payload, { ownerScope: defaultOwnerScope });
      const collections = await availableCollection.value.listCollections(input);

      if (!collections.ok) {
        return collections;
      }

      const items = await availableCollection.value.listItems(input);

      if (!items.ok) {
        return items;
      }

      return ok({
        collections: collections.value,
        items: items.value,
      });
    },
  },
] satisfies readonly StageInterfaceToolDefinition<MusicToolName, MusicToolGroupContext>[];

export const musicToolDescriptors = musicToolDefinitions.map(
  descriptorForToolDefinition,
) as Array<ToolDescriptor & { name: MusicToolName }>;

export const musicToolInputSchemas = Object.fromEntries(
  musicToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
) as unknown as Record<MusicToolName, StageInterfaceToolInputSchema>;

function validateMaterialResolvePayload(payload: unknown): Result<unknown> {
  const input = readPayload<Partial<MaterialResolveRequest>>(payload);

  if (input.kind === "single" && input.candidate === undefined) {
    return invalidPayload("music.material.resolve requires candidate when kind is single.");
  }

  if (input.kind === "candidate_set" && input.candidates === undefined) {
    return invalidPayload("music.material.resolve requires candidates when kind is candidate_set.");
  }

  return ok(payload);
}

function dispatchSystemCollectionAdd(
  collection: CollectionPort | undefined,
  payload: unknown,
  relationKind: SystemCollectionRelationKind,
):
  | ReturnType<CollectionPort["addItemToSystemCollection"]>
  | ReturnType<CollectionPort["addMaterialToSystemCollection"]>
  | Result<never> {
  const availableCollection = readCollection(collection);

  if (!availableCollection.ok) {
    return availableCollection;
  }

  const input = readPayload<CollectionSystemAddPayload>(payload, { ownerScope: defaultOwnerScope });
  const materialRef = materialRefFromCollectionPayload(input);

  if (materialRef !== undefined) {
    return availableCollection.value.addMaterialToSystemCollection({
      ...input,
      relationKind,
      materialRef,
    });
  }

  if (input.canonicalRef === undefined) {
    return invalidPayload("music.collection system add requires canonicalRef, materialRef, or materialId.");
  }

  return availableCollection.value.addItemToSystemCollection({
    ...input,
    relationKind,
    canonicalRef: input.canonicalRef,
  });
}

function dispatchSystemCollectionRemove(
  collection: CollectionPort | undefined,
  payload: unknown,
  relationKind: SystemCollectionRelationKind,
):
  | ReturnType<CollectionPort["removeItemFromSystemCollection"]>
  | ReturnType<CollectionPort["removeMaterialFromSystemCollection"]>
  | Result<never> {
  const availableCollection = readCollection(collection);

  if (!availableCollection.ok) {
    return availableCollection;
  }

  const input = readPayload<CollectionSystemRemovePayload>(payload, { ownerScope: defaultOwnerScope });
  const materialRef = materialRefFromCollectionPayload(input);

  if (materialRef !== undefined) {
    return availableCollection.value.removeMaterialFromSystemCollection({
      ...input,
      relationKind,
      materialRef,
    });
  }

  if (input.canonicalRef === undefined) {
    return invalidPayload("music.collection system remove requires canonicalRef, materialRef, or materialId.");
  }

  return availableCollection.value.removeItemFromSystemCollection({
    ...input,
    relationKind,
    canonicalRef: input.canonicalRef,
  });
}

function materialRefFromCollectionPayload(input: { materialId?: string; materialRef?: Ref }): Ref | undefined {
  if (input.materialId !== undefined) {
    return materialIdToRef(input.materialId);
  }

  return input.materialRef;
}

function readCollection(collection: CollectionPort | undefined): Result<CollectionPort> {
  if (collection === undefined) {
    return collectionUnavailable();
  }

  return ok(collection);
}

function readMaterialQuery(
  materialQuery: (MaterialQueryPort & MaterialRelatedPort & MaterialQuerySupportPort) | undefined,
): Result<MaterialQueryPort & MaterialRelatedPort & MaterialQuerySupportPort> {
  if (materialQuery === undefined) {
    return materialQueryUnavailable("Material query tools are not available.");
  }

  return ok(materialQuery);
}

function stripPublicMaterialPreferenceHints<TInput extends object>(input: TInput): Omit<TInput, "preferenceHints"> {
  const {
    preferenceHints: _ignoredPreferenceHints,
    ...publicInput
  } = input as TInput & { preferenceHints?: unknown };

  return publicInput;
}

function readMaterialSelector(materialSelector: MaterialSelectorPort | undefined): Result<MaterialSelectorPort> {
  if (materialSelector === undefined) {
    return materialQueryUnavailable("Material selector tools are not available.");
  }

  return ok(materialSelector);
}

function readMaterialStore(materialStore: MaterialStorePort | undefined): Result<MaterialStorePort> {
  if (materialStore === undefined) {
    return materialQueryUnavailable("Material Store is not available.");
  }

  return ok(materialStore);
}

type PublicMaterialSelectInput = Omit<MaterialSelectInput, "policy"> & {
  policy?: Omit<MaterialPolicyInput, "purpose"> & {
    purpose?: "candidate_selection";
  };
};

function normalizePublicMaterialSelectInput(input: PublicMaterialSelectInput): MaterialSelectInput {
  const { policy, ...rest } = input;

  if (policy === undefined) {
    return rest;
  }

  return {
    ...rest,
    policy: {
      ...policy,
      purpose: "candidate_selection",
    },
  };
}

function collectionUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Collection tools are not available.",
    module: "stage_interface",
    retryable: false,
  });
}

function materialQueryUnavailable(message: string): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message,
    module: "stage_interface",
    retryable: false,
  });
}

function invalidPayload(message: string): Result<never> {
  return fail({
    code: "stage_interface.invalid_payload",
    message,
    module: "stage_interface",
    retryable: false,
  });
}

function readPayload<TPayload extends object>(
  payload: unknown,
  defaults?: Partial<TPayload>,
): TPayload {
  const payloadObject =
    typeof payload === "object" && payload !== null ? (payload as Partial<TPayload>) : {};

  return {
    ...(defaults ?? {}),
    ...payloadObject,
  } as TPayload;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
