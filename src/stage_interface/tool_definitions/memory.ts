import { z } from "zod/v4";

import type {
  MemoryFeedbackRecordInput,
  MemoryProposal,
  ToolDescriptor,
} from "../../contracts/index.js";
import type {
  MemoryPort,
} from "../../ports/index.js";
import type {
  StageInterfaceToolDefinition,
  StageInterfaceToolInputSchema,
} from "./types.js";
import { defineStageInterfaceTool, descriptorForToolDefinition } from "./types.js";

export const memoryToolNames = [
  "memory.feedback.record",
  "memory.propose",
] as const;

export type MemoryToolName = (typeof memoryToolNames)[number];

export type MemoryToolGroupContext = {
  memory: MemoryPort;
};

type MemoryFeedbackRecordPayload = MemoryFeedbackRecordInput & {
  sessionId?: string;
};

const memoryFeedbackRecordInputSchema = {
  ownerScope: z.string().optional(),
  feedbackText: z.string(),
  target: z.union([
    z.object({ recentCardIndex: z.number().int().positive() }),
    z.object({ eventId: z.string(), position: z.number().int().positive() }),
    z.object({ materialId: z.string() }),
  ]),
  interpretation: z.union([
    z.object({ kind: z.literal("wrong_version"), scope: z.enum(["source", "version"]).optional() }),
    z.object({ kind: z.literal("not_playable"), scope: z.enum(["source"]).optional() }),
    z.object({ kind: z.literal("block"), scope: z.enum(["material", "source"]).optional() }),
    z.object({ kind: z.literal("like"), scope: z.enum(["material"]).optional() }),
    z.object({ kind: z.literal("dislike"), scope: z.enum(["material"]).optional() }),
    z.object({ kind: z.literal("remember_preference"), text: z.string(), scope: z.enum(["session", "long_term"]).optional() }),
  ]),
  note: z.string().optional(),
} satisfies StageInterfaceToolInputSchema;

const memoryFeedbackRecordInputParser =
  z.object(memoryFeedbackRecordInputSchema).passthrough() as z.ZodType<MemoryFeedbackRecordPayload>;

export const memoryToolDefinitions = [
  defineStageInterfaceTool<
    "memory.feedback.record",
    MemoryToolGroupContext,
    MemoryFeedbackRecordPayload
  >({
    name: "memory.feedback.record",
    description: "Record interpreted user feedback against recent presented recommendation cards.",
    inputSchemaRef: "MemoryFeedbackRecordInput",
    outputSchemaRef: "MemoryFeedbackRecordOutput",
    availability: "requires_active_instrument",
    inputSchema: memoryFeedbackRecordInputSchema,
    inputParser: memoryFeedbackRecordInputParser,
    handler({ context, sessionId, payload }) {
      return context.memory.recordFeedback(
        { ...payload, sessionId: payload.sessionId ?? sessionId },
      );
    },
  }),
  {
    name: "memory.propose",
    description: "Advanced memory proposal tool; for user feedback on shown recommendations, use memory.feedback.record with remember_preference.",
    inputSchemaRef: "MemoryProposalDraft",
    outputSchemaRef: "MemoryProposal",
    availability: "requires_active_instrument",
    inputSchema: {
      proposal: z.object({}).passthrough(),
    },
    handler({ context, payload }) {
      return context.memory.propose(
        readPayload<{ proposal: Omit<MemoryProposal, "id"> }>(payload),
      );
    },
  },
] satisfies readonly StageInterfaceToolDefinition<MemoryToolName, MemoryToolGroupContext>[];

export const memoryToolDescriptors = memoryToolDefinitions.map(
  descriptorForToolDefinition,
) as Array<ToolDescriptor & { name: MemoryToolName }>;

export const memoryToolInputSchemas = Object.fromEntries(
  memoryToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
) as unknown as Record<MemoryToolName, StageInterfaceToolInputSchema>;

function readPayload<TPayload extends object>(
  payload: unknown,
  defaults?: Partial<TPayload>,
): TPayload {
  const input = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};

  return {
    ...(defaults ?? {}),
    ...input,
  } as TPayload;
}
