import { z } from "zod/v4";

import type {
  InstrumentDescriptor,
  Result,
  ToolDescriptor,
  ToolName,
} from "../../contracts/index.js";
import {
  buildInstrumentHandbook,
  readHandbookInstrument,
  readHandbookTool,
} from "../../handbook/index.js";
import type {
  InstrumentCatalogPort,
  SessionContextPort,
} from "../../ports/index.js";
import type {
  StageInterfaceToolDefinition,
  StageInterfaceToolInputSchema,
} from "./types.js";
import { descriptorForToolDefinition } from "./types.js";

export const handbookToolNames = [
  "handbook.overview.read",
  "handbook.instrument.read",
  "handbook.tool.read",
] as const;

export type HandbookToolName = (typeof handbookToolNames)[number];

export type HandbookToolGroupContext = {
  sessionContext: SessionContextPort;
  instruments: InstrumentCatalogPort;
};

export const handbookToolDefinitions = [
  {
    name: "handbook.overview.read",
    description: "Read the generated overview of current MineMusic instruments and tools.",
    inputSchemaRef: "HandbookOverviewReadInput",
    outputSchemaRef: "Handbook",
    availability: "always_available",
    inputSchema: {},
    async handler({ context, sessionId }) {
      const instrumentsResult = await listInstrumentsForSession(context, sessionId);

      if (!instrumentsResult.ok) {
        return instrumentsResult;
      }

      return ok(buildInstrumentHandbook(instrumentsResult.value));
    },
  },
  {
    name: "handbook.instrument.read",
    description: "Read the handbook entry for one available MineMusic instrument.",
    inputSchemaRef: "HandbookInstrumentReadInput",
    outputSchemaRef: "HandbookInstrumentEntry",
    availability: "always_available",
    inputSchema: {
      instrumentId: z.string(),
    },
    async handler({ context, sessionId, payload }) {
      const instrumentsResult = await listInstrumentsForSession(context, sessionId);

      if (!instrumentsResult.ok) {
        return instrumentsResult;
      }

      return readHandbookInstrument({
        instruments: instrumentsResult.value,
        instrumentId: readPayload<{ instrumentId: string }>(payload).instrumentId,
      });
    },
  },
  {
    name: "handbook.tool.read",
    description: "Read input, output, effect, and description metadata for one available MineMusic tool.",
    inputSchemaRef: "HandbookToolReadInput",
    outputSchemaRef: "HandbookToolEntry",
    availability: "always_available",
    inputSchema: {
      toolName: z.string(),
    },
    async handler({ context, sessionId, payload }) {
      const instrumentsResult = await listInstrumentsForSession(context, sessionId);

      if (!instrumentsResult.ok) {
        return instrumentsResult;
      }

      return readHandbookTool({
        instruments: instrumentsResult.value,
        toolName: readPayload<{ toolName: ToolName | string }>(payload).toolName,
      });
    },
  },
] satisfies readonly StageInterfaceToolDefinition<HandbookToolName, HandbookToolGroupContext>[];

export const handbookToolDescriptors = handbookToolDefinitions.map(
  descriptorForToolDefinition,
) as Array<ToolDescriptor & { name: HandbookToolName }>;

export const handbookToolInputSchemas = Object.fromEntries(
  handbookToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
) as unknown as Record<HandbookToolName, StageInterfaceToolInputSchema>;

async function listInstrumentsForSession(
  context: HandbookToolGroupContext,
  sessionId: string,
): Promise<Result<InstrumentDescriptor[]>> {
  const session = await context.sessionContext.getSession({ sessionId });

  if (!session.ok) {
    return session;
  }

  return context.instruments.list({ session: session.value });
}

function readPayload<TPayload extends object>(payload: unknown): TPayload {
  return typeof payload === "object" && payload !== null ? (payload as TPayload) : ({} as TPayload);
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
