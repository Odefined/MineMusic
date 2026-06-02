import { z } from "zod/v4";

import type {
  LibraryImportContinueInput,
  LibraryImportItemsListInput,
  LibraryImportItemsListOutput,
  LibraryImportReport,
  LibraryImportStartInput,
  LibraryImportStatusInput,
  LibraryImportSummaryInput,
  LibraryUpdateStartInput,
  Result,
  StageError,
  ToolDescriptor,
} from "../../contracts/index.js";
import type {
  LibraryImportPort,
} from "../../ports/index.js";
import {
  compactLibraryImportItemsPage,
  compactLibraryImportStart,
  compactLibraryImportSummary,
} from "../outputs.js";
import type {
  StageInterfaceToolDefinition,
  StageInterfaceToolInputSchema,
} from "./types.js";
import { descriptorForToolDefinition } from "./types.js";

export const libraryToolNames = [
  "library.import.start",
  "library.import.continue",
  "library.update.start",
  "library.update.continue",
  "library.import.status",
  "library.import.summary",
  "library.import.items.list",
] as const;

export type LibraryToolName = (typeof libraryToolNames)[number];

export type LibraryToolGroupContext = {
  libraryImport?: LibraryImportPort;
};

const defaultOwnerScope = "local_profile:default";

const libraryImportScopeSchema = z.enum([
  "discovery",
  "saved_source_tracks",
  "saved_source_releases",
  "saved_source_artists",
]);

export const libraryToolDefinitions = [
  {
    name: "library.import.start",
    description: "Start importing saved platform library facts into MineMusic state.",
    inputSchemaRef: "LibraryImportStartInput",
    outputSchemaRef: "LibraryImportStatus",
    availability: "requires_active_instrument",
    inputSchema: {
      providerId: z.string(),
      providerAccountId: z.string().optional(),
      ownerScope: z.string().optional(),
      scopes: z.array(libraryImportScopeSchema).min(1),
      sampleLimitPerArea: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
    },
    async handler({ context, payload }) {
      const availableLibraryImport = readLibraryImport(context.libraryImport);

      if (!availableLibraryImport.ok) {
        return availableLibraryImport;
      }

      return availableLibraryImport.value.startImport(
        readPayload<LibraryImportStartInput>(payload, { ownerScope: defaultOwnerScope }),
      );
    },
    present: (value) => compactLibraryImportStart(value as LibraryImportReport),
  },
  {
    name: "library.import.continue",
    description: "Continue an existing saved platform library import batch.",
    inputSchemaRef: "LibraryImportContinueInput",
    outputSchemaRef: "LibraryImportStatus",
    availability: "requires_active_instrument",
    inputSchema: {
      batchId: z.string(),
      pageSize: z.number().int().positive().max(100).optional(),
    },
    handler({ context, payload }) {
      const availableLibraryImport = readLibraryImport(context.libraryImport);

      if (!availableLibraryImport.ok) {
        return availableLibraryImport;
      }

      return availableLibraryImport.value.continueImport(
        readPayload<LibraryImportContinueInput>(payload),
      );
    },
  },
  {
    name: "library.update.start",
    description: "Start a platform library update against MineMusic's latest complete baseline.",
    inputSchemaRef: "LibraryUpdateStartInput",
    outputSchemaRef: "LibraryImportStatus",
    availability: "requires_active_instrument",
    inputSchema: {
      providerId: z.string(),
      providerAccountId: z.string().optional(),
      ownerScope: z.string().optional(),
      scopes: z.array(libraryImportScopeSchema).min(1),
      sampleLimitPerArea: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
      mode: z.enum(["full", "latest_until_seen"]).optional(),
    },
    async handler({ context, payload }) {
      const availableLibraryImport = readLibraryImport(context.libraryImport);

      if (!availableLibraryImport.ok) {
        return availableLibraryImport;
      }

      return availableLibraryImport.value.startUpdate(
        readPayload<LibraryUpdateStartInput>(payload, { ownerScope: defaultOwnerScope }),
      );
    },
    present: (value) => compactLibraryImportStart(value as LibraryImportReport),
  },
  {
    name: "library.update.continue",
    description: "Continue an existing platform library update batch against MineMusic's latest complete baseline.",
    inputSchemaRef: "LibraryImportContinueInput",
    outputSchemaRef: "LibraryImportStatus",
    availability: "requires_active_instrument",
    inputSchema: {
      batchId: z.string(),
      pageSize: z.number().int().positive().max(100).optional(),
    },
    handler({ context, payload }) {
      const availableLibraryImport = readLibraryImport(context.libraryImport);

      if (!availableLibraryImport.ok) {
        return availableLibraryImport;
      }

      return availableLibraryImport.value.continueUpdate(
        readPayload<LibraryImportContinueInput>(payload),
      );
    },
  },
  {
    name: "library.import.status",
    description: "Read current status for a Library Import batch.",
    inputSchemaRef: "LibraryImportStatusInput",
    outputSchemaRef: "LibraryImportStatus",
    availability: "requires_active_instrument",
    inputSchema: {
      batchId: z.string(),
    },
    handler({ context, payload }) {
      const availableLibraryImport = readLibraryImport(context.libraryImport);

      if (!availableLibraryImport.ok) {
        return availableLibraryImport;
      }

      return availableLibraryImport.value.getStatus(
        readPayload<LibraryImportStatusInput>(payload),
      );
    },
  },
  {
    name: "library.import.summary",
    description: "Read the compact completed summary for a Library Import batch.",
    inputSchemaRef: "LibraryImportSummaryInput",
    outputSchemaRef: "LibraryImportSummaryView",
    availability: "requires_active_instrument",
    inputSchema: {
      batchId: z.string(),
    },
    async handler({ context, payload }) {
      const availableLibraryImport = readLibraryImport(context.libraryImport);

      if (!availableLibraryImport.ok) {
        return availableLibraryImport;
      }

      return availableLibraryImport.value.getSummary(
        readPayload<LibraryImportSummaryInput>(payload),
      );
    },
    present: (value) => compactLibraryImportSummary(value as LibraryImportReport),
  },
  {
    name: "library.import.items.list",
    description: "List item-level import facts for a Library Import batch in bounded pages.",
    inputSchemaRef: "LibraryImportItemsListInput",
    outputSchemaRef: "LibraryImportItemsListOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      batchId: z.string(),
      limit: z.number().int().positive().optional(),
      cursor: z.string().optional(),
    },
    async handler({ context, payload }) {
      const availableLibraryImport = readLibraryImport(context.libraryImport);

      if (!availableLibraryImport.ok) {
        return availableLibraryImport;
      }

      return availableLibraryImport.value.listItems(
        readPayload<LibraryImportItemsListInput>(payload),
      );
    },
    present: (value) => compactLibraryImportItemsPage(value as LibraryImportItemsListOutput),
  },
] satisfies readonly StageInterfaceToolDefinition<LibraryToolName, LibraryToolGroupContext>[];

export const libraryToolDescriptors = libraryToolDefinitions.map(
  descriptorForToolDefinition,
) as Array<ToolDescriptor & { name: LibraryToolName }>;

export const libraryToolInputSchemas = Object.fromEntries(
  libraryToolDefinitions.map((definition) => [definition.name, definition.inputSchema]),
) as unknown as Record<LibraryToolName, StageInterfaceToolInputSchema>;

function readLibraryImport(libraryImport: LibraryImportPort | undefined): Result<LibraryImportPort> {
  if (libraryImport === undefined) {
    return libraryImportUnavailable();
  }

  return ok(libraryImport);
}

function libraryImportUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Library Import tools are not available.",
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
