import { z } from "zod/v4";

import type {
  EffectProposal,
  MusicMaterial,
  StageEvent,
  ToolDescriptor,
} from "../../contracts/index.js";
import type {
  EffectBoundaryPort,
  EventPort,
  MaterialGatePort,
  SessionContextPort,
} from "../../ports/index.js";
import type {
  StageInterfaceToolDefinition,
  StageInterfaceToolInputSchema,
} from "./types.js";
import { descriptorForToolDefinition } from "./types.js";

export const stageToolNames = [
  "stage.context.read",
  "stage.materials.prepare",
  "stage.session.update",
  "stage.events.record",
  "stage.effects.propose",
] as const;

export type StageToolName = (typeof stageToolNames)[number];

export type StageToolGroupContext = {
  sessionContext: SessionContextPort;
  materialGate: MaterialGatePort;
  events: EventPort;
  effects: EffectBoundaryPort;
};

const musicMaterialSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  state: z.string(),
}).passthrough();

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
    description: "Prepare grounded materials through the Material Gate before presentation.",
    inputSchemaRef: "StageMaterialsPrepareInput",
    outputSchemaRef: "MusicMaterial[]",
    availability: "requires_active_instrument",
    inputSchema: {
      materials: z.array(musicMaterialSchema),
      purpose: z.enum(["recommendation", "memory", "effect", "conversation"]),
    },
    handler({ context, sessionId, payload }) {
      return context.materialGate.prepareMaterials(
        readPayload<{
          sessionId: string;
          materials: MusicMaterial[];
          purpose: Parameters<MaterialGatePort["prepareMaterials"]>[0]["purpose"];
        }>(payload, { sessionId }),
      );
    },
  },
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
      return context.sessionContext.updateSession(
        readPayload<{
          sessionId: string;
          patch: Parameters<SessionContextPort["updateSession"]>[0]["patch"];
        }>(payload, { sessionId }),
      );
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
      return context.events.record(
        readPayload<{ event: Omit<StageEvent, "id" | "time"> }>(payload),
      );
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
      return context.effects.propose(
        readPayload<{ proposal: Omit<EffectProposal, "id"> }>(payload),
      );
    },
  },
] satisfies readonly StageInterfaceToolDefinition<StageToolName, StageToolGroupContext>[];

export const stageToolDescriptors = stageToolDefinitions.map(
  descriptorForToolDefinition,
) as Array<ToolDescriptor & { name: StageToolName }>;

export const stageToolInputSchemas = Object.fromEntries(
  stageToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
) as unknown as Record<StageToolName, StageInterfaceToolInputSchema>;

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
