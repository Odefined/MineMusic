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
  SourceEntity,
  SourceLibraryEntry,
  SourceLibraryItem,
  SourceLibraryListInput,
  StageError,
  ToolDescriptor,
} from "../../contracts/index.js";
import type {
  LibraryImportPort,
  MaterialStorePort,
} from "../../ports/index.js";
import {
  compactLibraryImportItemsPage,
  compactLibraryImportStart,
  compactLibraryImportSummary,
  compactSourceLibraryList,
} from "../outputs.js";
import type {
  StageInterfaceToolDefinition,
  StageInterfaceToolInputSchema,
} from "./types.js";
import { descriptorForToolDefinition } from "./types.js";

export const libraryToolNames = [
  "library.source.list",
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
  materialStore?: MaterialStorePort;
  libraryImport?: LibraryImportPort;
};

const defaultOwnerScope = "local_profile:default";

const refSchema = z.object({
  namespace: z.string(),
  kind: z.string(),
  id: z.string(),
  label: z.string().optional(),
  url: z.string().optional(),
});

const platformLibraryItemKindSchema = z.enum([
  "saved_source_track",
  "saved_source_release",
  "saved_source_artist",
]);

const libraryImportScopeSchema = z.enum([
  "discovery",
  "saved_source_tracks",
  "saved_source_releases",
  "saved_source_artists",
]);

export const libraryToolDefinitions = [
  {
    name: "library.source.list",
    description: "List Source Library items in bounded pages as short cards.",
    inputSchemaRef: "SourceLibraryListInput",
    outputSchemaRef: "SourceLibraryListOutput",
    availability: "requires_active_instrument",
    inputSchema: {
      ownerScope: z.string().optional(),
      providerId: z.string().optional(),
      providerAccountId: z.string().optional(),
      libraryKind: platformLibraryItemKindSchema.optional(),
      limit: z.number().int().positive().optional(),
      cursor: z.string().optional(),
    },
    async handler({ context, payload }) {
      const availableMaterialStore = readMaterialStore(context.materialStore);

      if (!availableMaterialStore.ok) {
        return availableMaterialStore;
      }

      const input = readPayload<SourceLibraryListInput>(payload, {
        ownerScope: defaultOwnerScope,
      });
      const listed = await availableMaterialStore.value.listSourceLibraryItems({
        ...input,
        status: "present",
      });

      if (!listed.ok) {
        return listed;
      }

      const page = await pageSourceLibraryEntries(availableMaterialStore.value, listed.value, input);

      return page.ok ? ok(page.value) : page;
    },
    present: (value) => compactSourceLibraryList(value as SourceLibraryListPage),
  },
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

type SourceLibraryListPage = {
  items: SourceLibraryEntry[];
  totalItems: number;
  nextCursor?: string;
};

function readMaterialStore(materialStore: MaterialStorePort | undefined): Result<MaterialStorePort> {
  if (materialStore === undefined) {
    return materialStoreUnavailable();
  }

  return ok(materialStore);
}

function readLibraryImport(libraryImport: LibraryImportPort | undefined): Result<LibraryImportPort> {
  if (libraryImport === undefined) {
    return libraryImportUnavailable();
  }

  return ok(libraryImport);
}

function materialStoreUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Source Library tools are not available.",
    module: "stage_interface",
    retryable: false,
  });
}

function libraryImportUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Library Import tools are not available.",
    module: "stage_interface",
    retryable: false,
  });
}

const defaultSourceLibraryPageSize = 20;
const maxSourceLibraryPageSize = 200;

async function pageSourceLibraryEntries(
  materialStore: MaterialStorePort,
  items: SourceLibraryItem[],
  input: SourceLibraryListInput,
): Promise<Result<SourceLibraryListPage>> {
  const totalItems = items.length;
  const start = normalizePagedCursor(input.cursor, totalItems);
  const limit = normalizePagedLimit(input.limit);
  const pageItems = items.slice(start, start + limit);
  const entriesResult = await Promise.all(
    pageItems.map((item) => buildSourceLibraryEntry(materialStore, item)),
  );
  const failedEntry = entriesResult.find((entry) => !entry.ok);

  if (failedEntry !== undefined && !failedEntry.ok) {
    return failedEntry;
  }

  const entries = entriesResult
    .filter((entry): entry is { ok: true; value: SourceLibraryEntry } => entry.ok)
    .map((entry) => entry.value);
  const nextOffset = start + entries.length;

  return ok({
    items: entries,
    totalItems,
    ...(nextOffset < totalItems ? { nextCursor: String(nextOffset) } : {}),
  });
}

async function buildSourceLibraryEntry(
  materialStore: MaterialStorePort,
  item: SourceLibraryItem,
): Promise<Result<SourceLibraryEntry>> {
  const sourceEntity = await materialStore.getSourceEntity({ sourceRef: item.sourceRef });

  if (!sourceEntity.ok) {
    return sourceEntity;
  }

  return ok({
    item,
    ...(sourceEntity.value === null ? {} : { sourceEntity: sourceEntity.value as SourceEntity }),
  });
}

function normalizePagedLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) {
    return defaultSourceLibraryPageSize;
  }

  return Math.min(Math.floor(limit), maxSourceLibraryPageSize);
}

function normalizePagedCursor(cursor: string | undefined, totalItems: number): number {
  if (cursor === undefined) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.min(parsed, totalItems);
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
