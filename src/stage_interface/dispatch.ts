import type {
  InstrumentDescriptor,
  Result,
  StageError,
  ToolName,
} from "../contracts/index.js";
import { z } from "zod/v4";
import type {
  CollectionPort,
  CanonicalMaintenancePort,
  EffectBoundaryPort,
  EventPort,
  InstrumentCatalogPort,
  LibraryImportPort,
  MaterialCardsPort,
  MaterialStorePort,
  MaterialQueryPort,
  MaterialResolvePort,
  MaterialRelatedPort,
  MaterialSelectorPort,
  MaterialGatePort,
  MemoryPort,
  MusicKnowledgePort,
  SessionContextPort,
  SourceGroundingPort,
  ToolDispatchPort,
} from "../ports/index.js";
import {
  createStageInterfaceToolDefinitionRegistry,
  type BoundStageInterfaceToolDefinition,
} from "./tool_definitions/index.js";

type ToolDispatchOptions = {
  sessionContext: SessionContextPort;
  materialGate: MaterialGatePort;
  instruments: InstrumentCatalogPort;
  materialResolve: MaterialResolvePort;
  materialQuery?: MaterialQueryPort & MaterialRelatedPort & MaterialCardsPort;
  materialSelector?: MaterialSelectorPort;
  source: SourceGroundingPort;
  knowledge?: MusicKnowledgePort;
  events: EventPort;
  memory: MemoryPort;
  effects: EffectBoundaryPort;
  materialStore?: MaterialStorePort;
  collection?: CollectionPort;
  canonicalMaintenance?: CanonicalMaintenancePort;
  libraryImport?: LibraryImportPort;
};

export function createToolDispatch({
  sessionContext,
  materialGate,
  instruments,
  materialResolve,
  materialQuery,
  materialSelector,
  source,
  knowledge,
  events,
  memory,
  effects,
  materialStore,
  collection,
  canonicalMaintenance,
  libraryImport,
}: ToolDispatchOptions): ToolDispatchPort {
  const toolDefinitionRegistry = createStageInterfaceToolDefinitionRegistry({
    stage: {
      sessionContext,
      materialGate,
      ...(materialStore === undefined ? {} : { materialStore }),
      events,
      effects,
    },
    handbook: {
      sessionContext,
      instruments,
    },
    music: {
      materialResolve,
      ...(materialQuery === undefined ? {} : { materialQuery }),
      ...(materialSelector === undefined ? {} : { materialSelector }),
      source,
      ...(collection === undefined ? {} : { collection }),
    },
    knowledge: {
      ...(knowledge === undefined ? {} : { knowledge }),
    },
    library: {
      ...(materialStore === undefined ? {} : { materialStore }),
      ...(libraryImport === undefined ? {} : { libraryImport }),
    },
    canonicalReview: {
      ...(canonicalMaintenance === undefined ? {} : { canonicalMaintenance }),
    },
    memory: {
      memory,
    },
  });

  return {
    async call({ sessionId, toolName, payload }) {
      const registryDefinition = lookupToolDefinition(toolDefinitionRegistry, toolName);

      if (registryDefinition !== undefined) {
        return callToolDefinition({
          definition: registryDefinition,
          sessionContext,
          instruments,
          sessionId,
          payload,
        });
      }

      return fail({
        code: "stage_interface.tool_not_found",
        message: `Tool '${String(toolName)}' is not registered.`,
        module: "stage_interface",
        retryable: false,
      });
    },
  };
}

async function callToolDefinition({
  definition,
  sessionContext,
  instruments,
  sessionId,
  payload,
}: {
  definition: BoundStageInterfaceToolDefinition;
  sessionContext: SessionContextPort;
  instruments: InstrumentCatalogPort;
  sessionId: string;
  payload: unknown;
}): Promise<Result<unknown>> {
  if (definition.availability === "requires_active_instrument") {
    const availability = await ensureToolAvailableForSession(
      sessionContext,
      instruments,
      sessionId,
      definition.name,
    );

    if (!availability.ok) {
      return availability;
    }
  }

  const parsedPayload = parseToolPayload({ definition, payload });

  if (!parsedPayload.ok) {
    return parsedPayload;
  }

  const result = await definition.handler({ sessionId, payload: parsedPayload.value });

  if (!result.ok || definition.present === undefined) {
    return result;
  }

  return ok(definition.present(result.value));
}

function parseToolPayload({
  definition,
  payload,
}: {
  definition: BoundStageInterfaceToolDefinition;
  payload: unknown;
}): Result<unknown> {
  const payloadObject = payload === undefined ? {} : payload;
  const parsed = z.object(definition.inputSchema).passthrough().safeParse(payloadObject);

  if (!parsed.success) {
    return fail(invalidPayloadError(definition.name, summarizeZodError(parsed.error)));
  }

  if (definition.validatePayload !== undefined) {
    return definition.validatePayload(parsed.data);
  }

  return ok(parsed.data);
}

function invalidPayloadError(toolName: ToolName, message: string): StageError {
  return {
    code: "stage_interface.invalid_payload",
    message: `Invalid payload for tool '${toolName}': ${message}`,
    module: "stage_interface",
    retryable: false,
  };
}

function summarizeZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length === 0 ? "payload" : issue.path.join(".");
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function lookupToolDefinition(
  registry: Map<ToolName, BoundStageInterfaceToolDefinition>,
  toolName: ToolName | string,
): BoundStageInterfaceToolDefinition | undefined {
  return registry.get(String(toolName) as ToolName);
}

async function ensureToolAvailableForSession(
  sessionContext: SessionContextPort,
  instruments: InstrumentCatalogPort,
  sessionId: string,
  toolName: ToolName,
): Promise<Result<void>> {
  const catalog = await listInstrumentsForSession(sessionContext, instruments, sessionId);

  if (!catalog.ok) {
    return catalog;
  }

  const isAvailable = catalog.value.some((instrument) =>
    instrument.tools.some((tool) => tool.name === toolName),
  );

  if (!isAvailable) {
    return fail({
      code: "stage_interface.tool_not_found",
      message: `Tool '${toolName}' is not available for session '${sessionId}'.`,
      module: "stage_interface",
      retryable: false,
    });
  }

  return ok(undefined);
}

async function listInstrumentsForSession(
  sessionContext: SessionContextPort,
  instruments: InstrumentCatalogPort,
  sessionId: string,
): Promise<Result<InstrumentDescriptor[]>> {
  const session = await sessionContext.getSession({ sessionId });

  if (!session.ok) {
    return session;
  }

  return instruments.list({ session: session.value });
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
