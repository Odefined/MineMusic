import type {
  EffectProposal,
  InstrumentDescriptor,
  MaterialResolveRequest,
  MemoryProposal,
  MusicMaterial,
  Result,
  StageError,
  StageEvent,
  ToolName,
} from "../contracts/index.js";
import {
  buildInstrumentHandbook,
  readHandbookInstrument,
  readHandbookTool,
} from "../handbook/index.js";
import type {
  CollectionPort,
  EffectBoundaryPort,
  EventPort,
  InstrumentCatalogPort,
  MaterialResolvePort,
  MaterialGatePort,
  MemoryPort,
  SessionContextPort,
  SourceGroundingPort,
  ToolDispatchPort,
} from "../ports/index.js";
import { stableToolNames } from "./tools.js";

type ToolDispatchOptions = {
  sessionContext: SessionContextPort;
  materialGate: MaterialGatePort;
  instruments: InstrumentCatalogPort;
  materialResolve: MaterialResolvePort;
  source: SourceGroundingPort;
  events: EventPort;
  memory: MemoryPort;
  effects: EffectBoundaryPort;
  collection?: CollectionPort;
};

export function createToolDispatch({
  sessionContext,
  materialGate,
  instruments,
  materialResolve,
  source,
  events,
  memory,
  effects,
}: ToolDispatchOptions): ToolDispatchPort {
  const discoveryToolNames = new Set<ToolName>([
    "stage.context.read",
    "handbook.overview.read",
    "handbook.instrument.read",
    "handbook.tool.read",
    "session.update",
  ]);

  return {
    async call({ sessionId, toolName, payload }) {
      if (!isStableToolName(toolName)) {
        return fail({
          code: "stage_interface.tool_not_found",
          message: `Tool '${String(toolName)}' is not registered.`,
          module: "stage_interface",
          retryable: false,
        });
      }

      if (!discoveryToolNames.has(toolName)) {
        const availability = await ensureToolAvailableForSession(
          sessionContext,
          instruments,
          sessionId,
          toolName,
        );

        if (!availability.ok) {
          return availability;
        }
      }

      switch (toolName) {
        case "stage.context.read": {
          return sessionContext.readContext({ sessionId });
        }

        case "handbook.overview.read": {
          const instrumentsResult = await listInstrumentsForSession(sessionContext, instruments, sessionId);

          if (!instrumentsResult.ok) {
            return instrumentsResult;
          }

          return ok(buildInstrumentHandbook(instrumentsResult.value));
        }

        case "handbook.instrument.read": {
          const instrumentsResult = await listInstrumentsForSession(sessionContext, instruments, sessionId);

          if (!instrumentsResult.ok) {
            return instrumentsResult;
          }

          return readHandbookInstrument({
            instruments: instrumentsResult.value,
            instrumentId: readPayload<{ instrumentId: string }>(payload).instrumentId,
          });
        }

        case "handbook.tool.read": {
          const instrumentsResult = await listInstrumentsForSession(sessionContext, instruments, sessionId);

          if (!instrumentsResult.ok) {
            return instrumentsResult;
          }

          return readHandbookTool({
            instruments: instrumentsResult.value,
            toolName: readPayload<{ toolName: ToolName | string }>(payload).toolName,
          });
        }

        case "stage.materials.prepare":
          return materialGate.prepareMaterials(
            readPayload<{
              sessionId: string;
              materials: MusicMaterial[];
              purpose: Parameters<MaterialGatePort["prepareMaterials"]>[0]["purpose"];
            }>(payload, { sessionId }),
          );

        case "music.material.resolve":
          return materialResolve.resolve(readPayload<MaterialResolveRequest>(payload, { sessionId }));

        case "music.links.refresh":
          return source.refreshPlayableLinks(
            readPayload<{
              material: MusicMaterial;
              sessionId?: string;
            }>(payload, { sessionId }),
          );

        case "events.record":
          return events.record(readPayload<{ event: Omit<StageEvent, "id" | "time"> }>(payload));

        case "memory.propose":
          return memory.propose(readPayload<{ proposal: Omit<MemoryProposal, "id"> }>(payload));

        case "effects.propose":
          return effects.propose(readPayload<{ proposal: Omit<EffectProposal, "id"> }>(payload));

        case "session.update":
          return sessionContext.updateSession(
            readPayload<{
              sessionId: string;
              patch: Parameters<SessionContextPort["updateSession"]>[0]["patch"];
            }>(payload, { sessionId }),
          );

        default:
          return fail({
            code: "stage_interface.tool_not_found",
            message: `Tool '${String(toolName)}' is not registered.`,
            module: "stage_interface",
            retryable: false,
          });
      }
    },
  };
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

function isStableToolName(toolName: ToolName | string): toolName is ToolName {
  return (stableToolNames as readonly string[]).includes(String(toolName));
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
