import type {
  EffectProposal,
  InstrumentDescriptor,
  MaterialResolveRequest,
  MemoryProposal,
  MusicMaterial,
  Result,
  StageError,
  StageEvent,
  ToolDescriptor,
  ToolName,
} from "../contracts/index.js";
import {
  buildInstrumentHandbook,
  readHandbookInstrument,
  readHandbookTool,
} from "../handbook/index.js";
import type {
  EffectBoundaryPort,
  EventPort,
  InstrumentCatalogPort,
  MaterialGatePort,
  MemoryPort,
  SessionContextPort,
  SourceResolutionPort,
  StageModulesPort,
  ToolDispatchPort,
} from "../ports/index.js";

export const stableToolNames = [
  "stage.context.read",
  "handbook.overview.read",
  "handbook.instrument.read",
  "handbook.tool.read",
  "stage.materials.prepare",
  "music.material.resolve",
  "music.links.refresh",
  "events.record",
  "memory.propose",
  "effects.propose",
  "session.update",
] as const satisfies readonly ToolName[];

type ToolDispatchOptions = {
  stageModules: StageModulesPort;
  instruments: InstrumentCatalogPort;
  source: SourceResolutionPort;
  events: EventPort;
  memory: MemoryPort;
  effects: EffectBoundaryPort;
};

export function createInstrumentCatalog(): InstrumentCatalogPort {
  return {
    async list({ session }) {
      const instruments = [
        {
          id: "minemusic.handbook",
          label: "MineMusic Handbook",
          tools: handbookToolDescriptors,
        },
      ];

      if (
        session.activeInstruments.length === 0 ||
        session.activeInstruments.includes("minemusic.mvp")
      ) {
        instruments.push({
          id: "minemusic.mvp",
          label: "MineMusic MVP",
          tools: mvpToolDescriptors,
        });
      }

      return ok(instruments);
    },
  };
}

export function createToolDispatch({
  stageModules,
  instruments,
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
          code: "instrument.tool_not_found",
          message: `Tool '${String(toolName)}' is not registered.`,
          module: "instruments",
          retryable: false,
        });
      }

      if (!discoveryToolNames.has(toolName)) {
        const availability = await ensureToolAvailableForSession(
          stageModules,
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
          return stageModules.readContext({ sessionId });
        }

        case "handbook.overview.read": {
          const instrumentsResult = await listInstrumentsForSession(stageModules, instruments, sessionId);

          if (!instrumentsResult.ok) {
            return instrumentsResult;
          }

          return ok(buildInstrumentHandbook(instrumentsResult.value));
        }

        case "handbook.instrument.read": {
          const instrumentsResult = await listInstrumentsForSession(stageModules, instruments, sessionId);

          if (!instrumentsResult.ok) {
            return instrumentsResult;
          }

          return readHandbookInstrument({
            instruments: instrumentsResult.value,
            instrumentId: readPayload<{ instrumentId: string }>(payload).instrumentId,
          });
        }

        case "handbook.tool.read": {
          const instrumentsResult = await listInstrumentsForSession(stageModules, instruments, sessionId);

          if (!instrumentsResult.ok) {
            return instrumentsResult;
          }

          return readHandbookTool({
            instruments: instrumentsResult.value,
            toolName: readPayload<{ toolName: ToolName | string }>(payload).toolName,
          });
        }

        case "stage.materials.prepare":
          return stageModules.prepareMaterials(
            readPayload<{
              sessionId: string;
              materials: MusicMaterial[];
              purpose: Parameters<MaterialGatePort["prepareMaterials"]>[0]["purpose"];
            }>(payload, { sessionId }),
          );

        case "music.material.resolve":
          return source.resolve(readPayload<MaterialResolveRequest>(payload, { sessionId }));

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
          return stageModules.updateSession(
            readPayload<{
              sessionId: string;
              patch: Parameters<SessionContextPort["updateSession"]>[0]["patch"];
            }>(payload, { sessionId }),
          );

        default:
          return fail({
            code: "instrument.tool_not_found",
            message: `Tool '${String(toolName)}' is not registered.`,
            module: "instruments",
            retryable: false,
          });
      }
    },
  };
}

export const handbookToolDescriptors: ToolDescriptor[] = [
  {
    name: "handbook.overview.read",
    description: "Read the generated overview of current MineMusic instruments and tools.",
    inputSchemaRef: "HandbookOverviewReadInput",
    outputSchemaRef: "Handbook",
  },
  {
    name: "handbook.instrument.read",
    description: "Read the handbook entry for one available MineMusic instrument.",
    inputSchemaRef: "HandbookInstrumentReadInput",
    outputSchemaRef: "HandbookInstrumentEntry",
  },
  {
    name: "handbook.tool.read",
    description: "Read input, output, effect, and description metadata for one available MineMusic tool.",
    inputSchemaRef: "HandbookToolReadInput",
    outputSchemaRef: "HandbookToolEntry",
  },
];

export const mvpToolDescriptors: ToolDescriptor[] = [
  {
    name: "stage.context.read",
    description: "Read dynamic session context.",
    inputSchemaRef: "StageContextReadInput",
    outputSchemaRef: "StageContextReadOutput",
  },
  {
    name: "stage.materials.prepare",
    description: "Prepare grounded materials through the Material Gate before presentation.",
    inputSchemaRef: "StageMaterialsPrepareInput",
    outputSchemaRef: "MusicMaterial[]",
  },
  {
    name: "music.material.resolve",
    description: "Resolve music candidates through canonical-first source resolution.",
    inputSchemaRef: "MaterialResolveRequest",
    outputSchemaRef: "MaterialResolveResult",
  },
  {
    name: "music.links.refresh",
    description: "Refresh source-backed playable links for a material item.",
    inputSchemaRef: "MusicMaterial",
    outputSchemaRef: "MusicMaterial",
  },
  {
    name: "events.record",
    description: "Record a factual session event.",
    inputSchemaRef: "StageEventDraft",
    outputSchemaRef: "StageEvent",
  },
  {
    name: "memory.propose",
    description: "Create an evidence-backed memory proposal.",
    inputSchemaRef: "MemoryProposalDraft",
    outputSchemaRef: "MemoryProposal",
  },
  {
    name: "effects.propose",
    description: "Create a proposal for a durable write or external action.",
    inputSchemaRef: "EffectProposalDraft",
    outputSchemaRef: "EffectProposal",
    effectKind: "proposal",
  },
  {
    name: "session.update",
    description: "Update soft session state through Session Context.",
    inputSchemaRef: "StageSessionPatch",
    outputSchemaRef: "StageSession",
  },
];

export const agentToolDescriptors: ToolDescriptor[] = [
  ...handbookToolDescriptors,
  ...mvpToolDescriptors,
];

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
      code: "instrument.tool_not_found",
      message: `Tool '${toolName}' is not available for session '${sessionId}'.`,
      module: "instruments",
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
