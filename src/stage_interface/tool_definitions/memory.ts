import { z } from "zod/v4";

import type {
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
import { descriptorForToolDefinition } from "./types.js";

export const memoryToolNames = [
  "memory.propose",
] as const;

export type MemoryToolName = (typeof memoryToolNames)[number];

export type MemoryToolGroupContext = {
  memory: MemoryPort;
};

export const memoryToolDefinitions = [
  {
    name: "memory.propose",
    description: "Create an evidence-backed memory proposal.",
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

function readPayload<TPayload extends object>(payload: unknown): TPayload {
  return typeof payload === "object" && payload !== null ? (payload as TPayload) : ({} as TPayload);
}
