import { z } from "zod/v4";

import type {
  KnowledgeQuery,
  Result,
  StageError,
  ToolDescriptor,
} from "../../contracts/index.js";
import type {
  MusicKnowledgePort,
} from "../../ports/index.js";
import type {
  StageInterfaceToolDefinition,
  StageInterfaceToolInputSchema,
} from "./types.js";
import { descriptorForToolDefinition } from "./types.js";

export const knowledgeToolNames = [
  "knowledge.query",
] as const;

export type KnowledgeToolName = (typeof knowledgeToolNames)[number];

export type KnowledgeToolGroupContext = {
  knowledge?: MusicKnowledgePort;
};

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

export const knowledgeToolDefinitions = [
  {
    name: "knowledge.query",
    description: "Query provider-attributed structured or text knowledge.",
    inputSchemaRef: "KnowledgeQuery",
    outputSchemaRef: "KnowledgeResult",
    availability: "requires_active_instrument",
    inputSchema: knowledgeQuerySchema,
    handler({ context, sessionId, payload }) {
      const availableKnowledge = readKnowledge(context.knowledge);

      if (!availableKnowledge.ok) {
        return availableKnowledge;
      }

      return availableKnowledge.value.query({
        query: readPayload<KnowledgeQuery>(payload),
        sessionId,
      });
    },
  },
] satisfies readonly StageInterfaceToolDefinition<KnowledgeToolName, KnowledgeToolGroupContext>[];

export const knowledgeToolDescriptors = knowledgeToolDefinitions.map(
  descriptorForToolDefinition,
) as Array<ToolDescriptor & { name: KnowledgeToolName }>;

export const knowledgeToolInputSchemas = Object.fromEntries(
  knowledgeToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
) as unknown as Record<KnowledgeToolName, StageInterfaceToolInputSchema>;

function readKnowledge(knowledge: MusicKnowledgePort | undefined): Result<MusicKnowledgePort> {
  if (knowledge === undefined) {
    return knowledgeUnavailable();
  }

  return ok(knowledge);
}

function knowledgeUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Music Knowledge tools are not available.",
    module: "stage_interface",
    retryable: false,
  });
}

function readPayload<TPayload extends object>(payload: unknown): TPayload {
  return typeof payload === "object" && payload !== null ? (payload as TPayload) : ({} as TPayload);
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
