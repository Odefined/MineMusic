import { z } from "zod/v4";

import type {
  EffectProposal,
  MusicMaterial,
  RecommendationPresentInput,
  RecommendationPresentOutput,
  Result,
  StageError,
  StageEvent,
  ToolDescriptor,
} from "../../contracts/index.js";
import type {
  EffectBoundaryPort,
  EventPort,
  MaterialGatePort,
  MaterialStorePort,
  RecommendationPresentationPort,
  SessionContextPort,
} from "../../ports/index.js";
import type {
  StageInterfaceToolDefinition,
  StageInterfaceToolInputSchema,
} from "./types.js";
import { defineStageInterfaceTool, descriptorForToolDefinition } from "./types.js";
import { materialForMaterialId } from "../../material/query/index.js";
import { compactRecommendationPresentOutput } from "../outputs/recommendation.js";

export const stageToolNames = [
  "stage.context.read",
  "stage.materials.prepare",
  "stage.recommendation.present",
  "stage.session.update",
  "stage.events.record",
  "stage.effects.propose",
] as const;

export type StageToolName = (typeof stageToolNames)[number];

export type StageToolGroupContext = {
  sessionContext: SessionContextPort;
  materialGate: MaterialGatePort;
  recommendationPresentation?: RecommendationPresentationPort;
  materialStore?: MaterialStorePort;
  events: EventPort;
  effects: EffectBoundaryPort;
};

const musicMaterialSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  state: z.string(),
}).passthrough();
const recommendationPresentBasisSchema = z.object({
  kind: z.enum(["query", "related", "collection", "recent_context", "direct_resolve", "manual_selection", "mixed"]),
  note: z.string().optional(),
});
const recommendationPresentItemSchema = z.object({
  materialId: z.string(),
  reason: z.string().optional(),
  basis: recommendationPresentBasisSchema.optional(),
});
const recommendationFreshnessPolicySchema = z.object({
  recommended: z.enum(["session", "1h", "24h", "7d"]).optional(),
  played: z.enum(["session", "1h", "24h", "7d"]).optional(),
  opened: z.enum(["session", "1h", "24h", "7d"]).optional(),
  mode: z.enum(["hard", "soft", "off"]).optional(),
});
type RecommendationPresentPayload = RecommendationPresentInput & {
  sessionId?: string;
};
const recommendationPresentInputSchema = {
  ownerScope: z.string().optional(),
  request: z.string().optional(),
  items: z.array(recommendationPresentItemSchema),
  minCards: z.number().int().positive().optional(),
  maxCards: z.number().int().positive().optional(),
  policy: z.object({
    freshness: recommendationFreshnessPolicySchema.optional(),
  }).optional(),
} satisfies StageInterfaceToolInputSchema;
const recommendationPresentInputParser =
  z.object(recommendationPresentInputSchema).passthrough() as z.ZodType<RecommendationPresentPayload>;

export const stageToolDefinitions = [
  {
    name: "stage.context.read",
    description: "Read dynamic session context.",
    inputSchemaRef: "StageContextReadInput",
    outputSchemaRef: "StageContextReadOutput",
    availability: "always_available",
    inputSchema: {},
    handler({ context, sessionId }) {
      return context.sessionContext.readContext({ sessionId });
    },
  },
  {
    name: "stage.materials.prepare",
    description: "Legacy material sanitizer for non-final material use; use stage.recommendation.present for user-visible recommendations.",
    inputSchemaRef: "StageMaterialsPrepareInput",
    outputSchemaRef: "MusicMaterial[]",
    availability: "requires_active_instrument",
    inputSchema: {
      materials: z.array(musicMaterialSchema).optional(),
      materialIds: z.array(z.string()).optional(),
      purpose: z.enum(["recommendation", "memory", "effect", "conversation"]),
    },
    async handler({ context, sessionId, payload }) {
      const input = await materialsPrepareInput(context, payload, sessionId);

      if (!input.ok) {
        return input;
      }

      return context.materialGate.prepareMaterials(input.value);
    },
  },
  defineStageInterfaceTool<
    "stage.recommendation.present",
    StageToolGroupContext,
    RecommendationPresentPayload
  >({
    name: "stage.recommendation.present",
    description: "Final presentation boundary for user-visible recommendations.",
    inputSchemaRef: "RecommendationPresentInput",
    outputSchemaRef: "CompactRecommendationPresentOutput",
    availability: "requires_active_instrument",
    inputSchema: recommendationPresentInputSchema,
    inputParser: recommendationPresentInputParser,
    handler({ context, sessionId, payload }) {
      const presenter = readRecommendationPresentation(context.recommendationPresentation);

      if (!presenter.ok) {
        return presenter;
      }

      return presenter.value.present({ ...payload, sessionId: payload.sessionId ?? sessionId });
    },
    present: (value) => compactRecommendationPresentOutput(value as RecommendationPresentOutput),
  }),
  {
    name: "stage.session.update",
    description: "Update soft session state through Session Context.",
    inputSchemaRef: "StageSessionPatch",
    outputSchemaRef: "StageSession",
    availability: "always_available",
    inputSchema: {
      patch: z.object({}).passthrough(),
      sessionId: z.string().optional(),
    },
    handler({ context, sessionId, payload }) {
      return context.sessionContext.updateSession(sessionUpdateInput(payload, sessionId));
    },
  },
  {
    name: "stage.events.record",
    description: "Record a factual session event.",
    inputSchemaRef: "StageEventDraft",
    outputSchemaRef: "StageEvent",
    availability: "requires_active_instrument",
    inputSchema: {
      event: z.object({}).passthrough(),
    },
    handler({ context, payload }) {
      const input = eventRecordInput(payload);

      if (!input.ok) {
        return input;
      }

      return context.events.record(input.value);
    },
  },
  {
    name: "stage.effects.propose",
    description: "Create a proposal for a durable write or external action.",
    inputSchemaRef: "EffectProposalDraft",
    outputSchemaRef: "EffectProposal",
    effectKind: "proposal",
    availability: "requires_active_instrument",
    inputSchema: {
      proposal: z.object({}).passthrough(),
    },
    handler({ context, payload }) {
      return context.effects.propose(effectProposalInput(payload));
    },
  },
] satisfies readonly StageInterfaceToolDefinition<StageToolName, StageToolGroupContext>[];

export const stageToolDescriptors = stageToolDefinitions.map(
  descriptorForToolDefinition,
) as Array<ToolDescriptor & { name: StageToolName }>;

export const stageToolInputSchemas = Object.fromEntries(
  stageToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
) as unknown as Record<StageToolName, StageInterfaceToolInputSchema>;

async function materialsPrepareInput(
  context: StageToolGroupContext,
  payload: unknown,
  sessionId: string,
): Promise<Result<Parameters<MaterialGatePort["prepareMaterials"]>[0]>> {
  const input = payloadObject(payload);
  const materials = Array.isArray(input.materials) ? input.materials as MusicMaterial[] : [];
  const materialIds = Array.isArray(input.materialIds)
    ? input.materialIds.filter((materialId): materialId is string => typeof materialId === "string")
    : [];

  if (materials.length === 0 && materialIds.length === 0) {
    return fail({
      code: "stage_interface.invalid_payload",
      message: "stage.materials.prepare requires materials or materialIds.",
      module: "stage_interface",
      retryable: false,
    });
  }

  const resolvedMaterials = await materialsForIds(context, materialIds);

  if (!resolvedMaterials.ok) {
    return resolvedMaterials;
  }

  return ok({
    sessionId,
    materials: [...materials, ...resolvedMaterials.value],
    purpose: input.purpose as Parameters<MaterialGatePort["prepareMaterials"]>[0]["purpose"],
  });
}

async function materialsForIds(
  context: StageToolGroupContext,
  materialIds: string[],
): Promise<Result<MusicMaterial[]>> {
  if (materialIds.length === 0) {
    return ok([]);
  }

  if (context.materialStore === undefined) {
    return fail({
      code: "stage_interface.tool_not_found",
      message: "Material id preparation is not available without Material Store.",
      module: "stage_interface",
      retryable: false,
    });
  }

  const materials: MusicMaterial[] = [];

  for (const materialId of materialIds) {
    const material = await materialForMaterialId({
      materialStore: context.materialStore,
      materialId,
      ownerScope: "local_profile:default",
      purpose: "resolve.cards",
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

    materials.push(material.value);
  }

  return ok(materials);
}

function sessionUpdateInput(
  payload: unknown,
  sessionId: string,
): Parameters<SessionContextPort["updateSession"]>[0] {
  const input = payloadObject(payload);

  return {
    sessionId: typeof input.sessionId === "string" ? input.sessionId : sessionId,
    patch: input.patch as Parameters<SessionContextPort["updateSession"]>[0]["patch"],
  };
}

function eventRecordInput(payload: unknown): Result<Parameters<EventPort["record"]>[0]> {
  const input = payloadObject(payload);
  const event = input.event as Omit<StageEvent, "id" | "time"> | undefined;

  if (event?.type === "recommendation.presented" || event?.type === "recommendation_presented") {
    return fail({
      code: "stage_interface.invalid_payload",
      message: "Use stage.recommendation.present for recommendation presentation events.",
      module: "stage_interface",
      retryable: false,
    });
  }

  return ok({ event: event as Omit<StageEvent, "id" | "time"> });
}

function effectProposalInput(payload: unknown): Parameters<EffectBoundaryPort["propose"]>[0] {
  const input = payloadObject(payload);

  return {
    proposal: input.proposal as Omit<EffectProposal, "id">,
  };
}

function readRecommendationPresentation(
  recommendationPresentation: RecommendationPresentationPort | undefined,
): Result<RecommendationPresentationPort> {
  if (recommendationPresentation === undefined) {
    return fail({
      code: "stage_interface.tool_not_found",
      message: "Recommendation presentation is not available.",
      module: "stage_interface",
      retryable: false,
    });
  }

  return ok(recommendationPresentation);
}

function readPayload<TPayload extends object>(
  payload: unknown,
  defaults?: Partial<TPayload>,
): TPayload {
  const input = payloadObject(payload);

  return {
    ...(defaults ?? {}),
    ...input,
  } as TPayload;
}

function payloadObject(payload: unknown): Record<string, unknown> {
  const payloadObject =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};

  return payloadObject;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
