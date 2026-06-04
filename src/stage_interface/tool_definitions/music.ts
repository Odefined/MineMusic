import { z } from "zod/v4";

import type {
  Collection,
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
  MaterialResolveQuery,
  MaterialResolveRequest,
  MaterialResolveResult,
  MusicLinksRefreshOutput,
  PublicMaterialResolveInput,
  PublicMaterialResolveQueryKind,
  MaterialSelectOutput,
  MaterialSelectInput,
  Ref,
  Result,
  StageError,
  ToolDescriptor,
} from "../../contracts/index.js";
import type {
  CollectionPort,
  MaterialContextBriefPort,
  MaterialPoolsPort,
  MaterialQueryPort,
  MaterialResolvePort,
  MaterialRelatedPort,
  MaterialSelectorPort,
  MaterialProjectionStorePort,
  SourceGroundingPort,
  SystemCollectionRelationKind,
} from "../../ports/index.js";
import type {
  StageInterfaceToolDefinition,
  StageInterfaceToolInputSchema,
} from "./types.js";
import { materialForMaterialId, materialIdToRef } from "../../material/projection/index.js";
import {
  compactCollectionItemOutput,
  compactCollectionListOutput,
  compactCollectionOutput,
  compactMaterialQueryOutput,
  compactMaterialRelatedOutput,
  compactPublicMaterialResolveOutput,
  compactMaterialSelectOutput,
} from "../outputs/index.js";
import { publicDisplayLinksForMaterial } from "../outputs/links.js";
import { defineStageInterfaceTool, descriptorForToolDefinition } from "./types.js";

export const musicToolNames = [
  "music.material.resolve",
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
  materialQuery?: MaterialQueryPort & MaterialRelatedPort & MaterialContextBriefPort & MaterialPoolsPort;
  materialSelector?: MaterialSelectorPort;
  materialStore?: MaterialProjectionStorePort;
  source: SourceGroundingPort;
  collection?: CollectionPort;
};

type CollectionSystemAddPayload = {
  ownerScope: string;
  materialId?: string;
  collectionKind?: CollectionKind;
  description?: string;
};

type CollectionSystemRemovePayload = {
  ownerScope: string;
  materialId?: string;
  collectionKind?: CollectionKind;
};

type CollectionItemAddPayload = {
  collectionId: string;
  materialId?: string;
  description?: string;
};

type CollectionItemRemovePayload = {
  collectionId: string;
  materialId?: string;
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

const collectionKindSchema = z.enum(["recording", "work", "release_group", "release", "artist"]);
const collectionRelationKindSchema = z.enum(["saved", "favorite", "blocked", "custom"]);
const materialIdSchema = z.string();
const platformLibraryItemKindSchema = z.enum([
  "saved_source_track",
  "saved_source_release",
  "saved_source_artist",
]);
const publicMaterialResolveQueryKindSchema = z.enum([
  "recording",
  "release_group",
  "release",
  "artist",
  "work",
]);
const publicMaterialResolveQuerySchema = z.object({
  id: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1),
  targetKind: publicMaterialResolveQueryKindSchema.optional(),
  reason: z.string().trim().min(1).optional(),
}).strict();
const sourceLibraryPoolSchema = z.object({
  kind: z.literal("source_library"),
  libraryKinds: z.array(platformLibraryItemKindSchema).min(1).optional(),
  providerId: z.string().optional(),
  providerAccountId: z.string().optional(),
  target: z.enum(["library_item", "release_tracks"]).optional(),
}).refine(
  (pool) =>
    pool.target !== "release_tracks" ||
    (pool.libraryKinds?.length === 1 && pool.libraryKinds[0] === "saved_source_release"),
  {
    message: "release_tracks target requires libraryKinds: ['saved_source_release']",
    path: ["target"],
  },
);
const materialPoolSchema = z.union([
  z.object({ kind: z.literal("all") }),
  sourceLibraryPoolSchema,
  z.object({
    kind: z.literal("collection"),
    ref: z.string().optional(),
    label: z.string().optional(),
    relation: z.enum(["saved", "favorite", "custom", "blocked"]).optional(),
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
type PublicMaterialResolvePayload = PublicMaterialResolveInput & {
  sessionId?: string;
};
const publicMaterialResolveInputSchema = {
  queries: z.array(publicMaterialResolveQuerySchema).min(1),
  ownerScope: z.string().optional(),
  limit: z.number().int().positive().optional(),
  sessionId: z.string().optional(),
} satisfies StageInterfaceToolInputSchema;
const publicMaterialResolveInputParser =
  z.object(publicMaterialResolveInputSchema).passthrough() as z.ZodType<PublicMaterialResolvePayload>;

export const musicToolDefinitions = [
  defineStageInterfaceTool<
    "music.material.resolve",
    MusicToolGroupContext,
    PublicMaterialResolvePayload
  >({
    name: "music.material.resolve",
    description: "Resolve text music queries into compact material items through local material search and source grounding.",
    inputSchemaRef: "PublicMaterialResolveInput",
    outputSchemaRef: "PublicMaterialResolveOutput",
    availability: "requires_active_instrument",
    inputSchema: publicMaterialResolveInputSchema,
    inputParser: publicMaterialResolveInputParser,
    validatePayload(payload) {
      const input = readPayload<Record<string, unknown>>(payload);

      if (Object.prototype.hasOwnProperty.call(input, "purpose")) {
        return invalidPayload("music.material.resolve does not accept purpose.");
      }

      if (Object.prototype.hasOwnProperty.call(input, "sourceLibraryScope")) {
        return invalidPayload("music.material.resolve does not accept source-library scoped resolve input.");
      }

      if (Object.prototype.hasOwnProperty.call(input, "candidate")
        || Object.prototype.hasOwnProperty.call(input, "candidates")
        || Object.prototype.hasOwnProperty.call(input, "kind")) {
        return invalidPayload("music.material.resolve uses query arrays, not candidate-shaped resolve input.");
      }

      const queries = Array.isArray(input.queries) ? input.queries : [];

      for (const query of queries) {
        if (!isRecord(query)) {
          continue;
        }

        if (Object.prototype.hasOwnProperty.call(query, "kind")) {
          return invalidPayload("music.material.resolve uses targetKind; kind is not a supported alias.");
        }

        if (Object.prototype.hasOwnProperty.call(query, "sourceRef")) {
          return invalidPayload("music.material.resolve does not accept sourceRef input.");
        }

        if (Object.prototype.hasOwnProperty.call(query, "canonicalRef")) {
          return invalidPayload("music.material.resolve does not accept canonicalRef input.");
        }

        if (Object.prototype.hasOwnProperty.call(query, "materialRef")) {
          return invalidPayload("music.material.resolve does not accept materialRef input.");
        }
      }

      return ok(payload);
    },
    handler({ context, sessionId, payload }) {
      return context.materialResolve.resolve(
        publicMaterialResolveRequest({ ...payload, sessionId: payload.sessionId ?? sessionId }),
      );
    },
    present: (value) => compactPublicMaterialResolveOutput(value as MaterialResolveResult),
  }),
  {
    name: "music.material.query",
    description: "Retrieve compact material cards from pools, collections, source library, related pools, or all available material.",
    inputSchemaRef: "MaterialQueryInput",
    outputSchemaRef: "CompactMaterialQueryOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      text: z.string().optional(),
      targetKind: z.enum(["recording", "artist", "album", "release", "release_group"]).optional(),
      pool: materialPoolSchema.optional(),
      constraints: materialConstraintsSchema.optional(),
      exclude: materialExcludeSchema.optional(),
      order: z.enum(["relevance", "recently_added", "least_recently_recommended", "random"]).optional(),
      ownerScope: z.string().optional(),
      sessionId: z.string().optional(),
      limit: z.number().int().positive().optional(),
      cursor: z.string().optional(),
    },
    validatePayload(payload) {
      const input = readPayload<Record<string, unknown>>(payload);

      if (Object.prototype.hasOwnProperty.call(input, "q")) {
        return invalidPayload("music.material.query uses text; q is not a supported alias.");
      }

      if (Object.prototype.hasOwnProperty.call(input, "returnKind")) {
        return invalidPayload("music.material.query uses targetKind; returnKind is not a supported alias.");
      }

      return ok(payload);
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
      kinds: z.array(z.enum(["all", "source_library", "collection"])).optional(),
      ownerScope: z.string().optional(),
      includeEmpty: z.boolean().optional(),
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
    outputSchemaRef: "MusicLinksRefreshOutput",
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
        purpose: "link.refresh",
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

      const refreshed = await context.source.refreshPlayableLinks({
        material: material.value,
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      });

      if (!refreshed.ok) {
        if (refreshed.error.code === "source.no_playable_link") {
          return ok({
            materialId: input.materialId,
            status: "not_available",
            message: refreshed.error.message,
          } satisfies MusicLinksRefreshOutput);
        }

        return refreshed;
      }

      const links = publicDisplayLinksForMaterial(refreshed.value);

      return ok({
        materialId: input.materialId,
        status: links.length === 0 ? "not_available" : "refreshed",
        ...(links.length === 0 ? {} : { links }),
      } satisfies MusicLinksRefreshOutput);
    },
  },
  {
    name: "music.collection.save",
    description: "Save a material to the owner's saved system collection.",
    inputSchemaRef: "CollectionSystemItemInput",
    outputSchemaRef: "CompactCollectionItemOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema,
      collectionKind: collectionKindSchema.optional(),
      description: z.string().optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionAdd(context, payload, "saved");
    },
    present: (value) => compactCollectionItemOutput(value as CollectionItem),
  },
  {
    name: "music.collection.unsave",
    description: "Remove a material from the owner's saved system collection.",
    inputSchemaRef: "CollectionSystemRemoveInput",
    outputSchemaRef: "CompactCollectionItemOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema,
      collectionKind: collectionKindSchema.optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionRemove(context.collection, payload, "saved");
    },
    present: (value) => compactCollectionItemOutput(value as CollectionItem),
  },
  {
    name: "music.collection.favorite",
    description: "Favorite a material in the owner's favorite system collection.",
    inputSchemaRef: "CollectionSystemItemInput",
    outputSchemaRef: "CompactCollectionItemOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema,
      collectionKind: collectionKindSchema.optional(),
      description: z.string().optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionAdd(context, payload, "favorite");
    },
    present: (value) => compactCollectionItemOutput(value as CollectionItem),
  },
  {
    name: "music.collection.unfavorite",
    description: "Remove a material from the owner's favorite system collection.",
    inputSchemaRef: "CollectionSystemRemoveInput",
    outputSchemaRef: "CompactCollectionItemOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema,
      collectionKind: collectionKindSchema.optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionRemove(context.collection, payload, "favorite");
    },
    present: (value) => compactCollectionItemOutput(value as CollectionItem),
  },
  {
    name: "music.collection.block",
    description: "Block a material from future recommendations for the owner.",
    inputSchemaRef: "CollectionSystemItemInput",
    outputSchemaRef: "CompactCollectionItemOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema,
      collectionKind: collectionKindSchema.optional(),
      description: z.string().optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionAdd(context, payload, "blocked");
    },
    present: (value) => compactCollectionItemOutput(value as CollectionItem),
  },
  {
    name: "music.collection.unblock",
    description: "Remove a material from the owner's blocked system collection.",
    inputSchemaRef: "CollectionSystemRemoveInput",
    outputSchemaRef: "CompactCollectionItemOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      materialId: materialIdSchema,
      collectionKind: collectionKindSchema.optional(),
    },
    handler({ context, payload }) {
      return dispatchSystemCollectionRemove(context.collection, payload, "blocked");
    },
    present: (value) => compactCollectionItemOutput(value as CollectionItem),
  },
  {
    name: "music.collection.item.add",
    description: "Add a material to a custom collection by collection id.",
    inputSchemaRef: "CollectionItemAddInput",
    outputSchemaRef: "CompactCollectionItemOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      collectionId: z.string(),
      materialId: materialIdSchema,
      description: z.string().optional(),
    },
    async handler({ context, payload }) {
      const availableCollection = readCollection(context.collection);

      if (!availableCollection.ok) {
        return availableCollection;
      }

      const input = readPayload<CollectionItemAddPayload>(payload);
      const materialRef = materialRefFromCollectionPayload(input);

      if (materialRef === undefined) {
        return invalidPayload("music.collection.item.add requires materialId.");
      }

      const label = await labelForMaterialCollectionAction(context.materialStore, input);

      if (!label.ok) {
        return label;
      }

      return availableCollection.value.addMaterialToCollection({
        collectionId: input.collectionId,
        materialRef,
        label: label.value,
        ...(input.description === undefined ? {} : { description: input.description }),
      });
    },
    present: (value) => compactCollectionItemOutput(value as CollectionItem),
  },
  {
    name: "music.collection.item.remove",
    description: "Remove a material from a custom collection by collection id.",
    inputSchemaRef: "CollectionItemRemoveInput",
    outputSchemaRef: "CompactCollectionItemOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      collectionId: z.string(),
      materialId: materialIdSchema,
    },
    handler({ context, payload }) {
      const availableCollection = readCollection(context.collection);

      if (!availableCollection.ok) {
        return availableCollection;
      }

      const input = readPayload<CollectionItemRemovePayload>(payload);
      const materialRef = materialRefFromCollectionPayload(input);

      if (materialRef === undefined) {
        return invalidPayload("music.collection.item.remove requires materialId.");
      }

      return availableCollection.value.removeMaterialFromCollection({
        collectionId: input.collectionId,
        materialRef,
      });
    },
    present: (value) => compactCollectionItemOutput(value as CollectionItem),
  },
  {
    name: "music.collection.create",
    description: "Create a user-owned custom collection for one collection kind.",
    inputSchemaRef: "CollectionCreateInput",
    outputSchemaRef: "CompactCollectionOutput",
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
    present: (value) => compactCollectionOutput(value as Collection),
  },
  {
    name: "music.collection.update",
    description: "Update a user-created custom collection label or description.",
    inputSchemaRef: "CollectionUpdateInput",
    outputSchemaRef: "CompactCollectionOutput",
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
    present: (value) => compactCollectionOutput(value as Collection),
  },
  {
    name: "music.collection.delete",
    description: "Soft-remove a user-created custom collection.",
    inputSchemaRef: "CollectionDeleteInput",
    outputSchemaRef: "CompactCollectionOutput",
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
    present: (value) => compactCollectionOutput(value as Collection),
  },
  {
    name: "music.collection.list",
    description: "List owner collections and matching collection items.",
    inputSchemaRef: "CollectionListInput",
    outputSchemaRef: "CompactCollectionListOutput",
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
    present: (value) => compactCollectionListOutput(value as { collections: Collection[]; items: CollectionItem[] }),
  },
] satisfies readonly StageInterfaceToolDefinition<MusicToolName, MusicToolGroupContext>[];

export const musicToolDescriptors = musicToolDefinitions.map(
  descriptorForToolDefinition,
) as Array<ToolDescriptor & { name: MusicToolName }>;

export const musicToolInputSchemas = Object.fromEntries(
  musicToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
) as unknown as Record<MusicToolName, StageInterfaceToolInputSchema>;

function publicMaterialResolveRequest(input: PublicMaterialResolvePayload): MaterialResolveRequest {
  return {
    queries: input.queries.map(publicQueryToResolveQuery),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    ...(input.ownerScope === undefined ? {} : { ownerScope: input.ownerScope }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  };
}

function publicQueryToResolveQuery(
  query: PublicMaterialResolveInput["queries"][number],
): MaterialResolveQuery {
  return {
    ...(query.id === undefined ? {} : { id: query.id }),
    text: query.text,
    ...(query.targetKind === undefined ? {} : { targetKind: expectedKindForPublicResolve(query.targetKind) }),
    ...(query.reason === undefined ? {} : { reason: query.reason }),
  };
}

function expectedKindForPublicResolve(
  kind: PublicMaterialResolveQueryKind,
): NonNullable<MaterialResolveQuery["targetKind"]> {
  return kind;
}

async function dispatchSystemCollectionAdd(
  context: MusicToolGroupContext,
  payload: unknown,
  relationKind: SystemCollectionRelationKind,
):
  Promise<Awaited<ReturnType<CollectionPort["addMaterialToSystemCollection"]>> | Result<never>> {
  const availableCollection = readCollection(context.collection);

  if (!availableCollection.ok) {
    return availableCollection;
  }

  const input = readPayload<CollectionSystemAddPayload>(payload, { ownerScope: defaultOwnerScope });
  const materialRef = materialRefFromCollectionPayload(input);

  if (materialRef === undefined) {
    return invalidPayload("music.collection system add requires materialId.");
  }

  const label = await labelForMaterialCollectionAction(context.materialStore, input);

  if (!label.ok) {
    return label;
  }

  return availableCollection.value.addMaterialToSystemCollection({
    ownerScope: input.ownerScope,
    relationKind,
    materialRef,
    label: label.value,
    ...(input.collectionKind === undefined ? {} : { collectionKind: input.collectionKind }),
    ...(input.description === undefined ? {} : { description: input.description }),
  });
}

function dispatchSystemCollectionRemove(
  collection: CollectionPort | undefined,
  payload: unknown,
  relationKind: SystemCollectionRelationKind,
):
  | ReturnType<CollectionPort["removeMaterialFromSystemCollection"]>
  | Result<never> {
  const availableCollection = readCollection(collection);

  if (!availableCollection.ok) {
    return availableCollection;
  }

  const input = readPayload<CollectionSystemRemovePayload>(payload, { ownerScope: defaultOwnerScope });
  const materialRef = materialRefFromCollectionPayload(input);

  if (materialRef === undefined) {
    return invalidPayload("music.collection system remove requires materialId.");
  }

  return availableCollection.value.removeMaterialFromSystemCollection({
    ownerScope: input.ownerScope,
    relationKind,
    materialRef,
    ...(input.collectionKind === undefined ? {} : { collectionKind: input.collectionKind }),
  });
}

function materialRefFromCollectionPayload(input: { materialId?: string }): Ref | undefined {
  if (input.materialId !== undefined) {
    return materialIdToRef(input.materialId);
  }

  return undefined;
}

async function labelForMaterialCollectionAction(
  materialStore: MaterialProjectionStorePort | undefined,
  input: { materialId?: string; ownerScope?: string },
): Promise<Result<string>> {
  const materialId = input.materialId;

  if (materialId === undefined) {
    return invalidPayload("music.collection material action requires materialId.");
  }

  const availableMaterialStore = readMaterialStore(materialStore);

  if (!availableMaterialStore.ok) {
    return availableMaterialStore;
  }

  const material = await materialForMaterialId({
    materialStore: availableMaterialStore.value,
    materialId,
    ownerScope: input.ownerScope ?? defaultOwnerScope,
    purpose: "collection.snapshot",
  });

  if (!material.ok) {
    return material;
  }

  if (material.value === null) {
    return fail({
      code: "material_registry.not_found",
      message: `Material '${materialId}' was not found.`,
      module: "material_store",
      retryable: false,
    });
  }

  return ok(material.value.label);
}

function readCollection(collection: CollectionPort | undefined): Result<CollectionPort> {
  if (collection === undefined) {
    return collectionUnavailable();
  }

  return ok(collection);
}

function readMaterialQuery(
  materialQuery: (MaterialQueryPort & MaterialRelatedPort & MaterialContextBriefPort & MaterialPoolsPort) | undefined,
): Result<MaterialQueryPort & MaterialRelatedPort & MaterialContextBriefPort & MaterialPoolsPort> {
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

function readMaterialStore(materialStore: MaterialProjectionStorePort | undefined): Result<MaterialProjectionStorePort> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
