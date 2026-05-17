import type {
  EffectProposal,
  MemoryProposal,
  MusicMaterial,
  Result,
  SourceQuery,
  StageError,
  StageEvent,
  ToolDescriptor,
  ToolName,
} from "../contracts/index.js";
import type {
  EffectBoundaryPort,
  EventPort,
  InstrumentCatalogPort,
  MemoryPort,
  SourceResolutionPort,
  StageKernelPort,
  ToolDispatchPort,
} from "../ports/index.js";

export const stableToolNames = [
  "stage.context.read",
  "stage.materials.prepare",
  "music.material.ground",
  "music.links.refresh",
  "events.record",
  "memory.propose",
  "effects.propose",
  "session.update",
] as const satisfies readonly ToolName[];

type ToolDispatchOptions = {
  stage: StageKernelPort;
  source: SourceResolutionPort;
  events: EventPort;
  memory: MemoryPort;
  effects: EffectBoundaryPort;
};

export function createInstrumentCatalog(): InstrumentCatalogPort {
  return {
    async list({ session }) {
      if (
        session.activeInstruments.length > 0 &&
        !session.activeInstruments.includes("minemusic.mvp")
      ) {
        return ok([]);
      }

      return ok([
        {
          id: "minemusic.mvp",
          label: "MineMusic MVP",
          tools: instrumentToolDescriptors,
        },
      ]);
    },
  };
}

export function createToolDispatch({
  stage,
  source,
  events,
  memory,
  effects,
}: ToolDispatchOptions): ToolDispatchPort {
  const discoveryToolNames = new Set<ToolName>(["stage.context.read", "session.update"]);

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
        const availability = await ensureToolAvailableForSession(stage, sessionId, toolName);

        if (!availability.ok) {
          return availability;
        }
      }

      switch (toolName) {
        case "stage.context.read": {
          const session = await stage.getSession({ sessionId });

          if (!session.ok) {
            return session;
          }

          const handbook = await stage.compileHandbook({ sessionId });

          if (!handbook.ok) {
            return handbook;
          }

          return ok({
            session: session.value,
            handbook: handbook.value,
          });
        }

        case "stage.materials.prepare":
          return stage.prepareMaterials(
            readPayload<{
              sessionId: string;
              materials: MusicMaterial[];
              purpose: Parameters<StageKernelPort["prepareMaterials"]>[0]["purpose"];
            }>(payload, { sessionId }),
          );

        case "music.material.ground":
          return source.ground(readPayload<{
            query: SourceQuery;
            sessionId?: string;
          }>(payload, { sessionId }));

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
          return stage.updateSession(
            readPayload<{
              sessionId: string;
              patch: Parameters<StageKernelPort["updateSession"]>[0]["patch"];
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

export const instrumentToolDescriptors: ToolDescriptor[] = [
  {
    name: "stage.context.read",
    description: "Read governed session context and the compiled handbook.",
    inputSchemaRef: "StageContextReadInput",
    outputSchemaRef: "StageContextReadOutput",
  },
  {
    name: "stage.materials.prepare",
    description: "Prepare grounded materials through Stage Kernel gating before presentation.",
    inputSchemaRef: "StageMaterialsPrepareInput",
    outputSchemaRef: "MusicMaterial[]",
  },
  {
    name: "music.material.ground",
    description: "Ground a source-searchable candidate through source resolution.",
    inputSchemaRef: "SourceQuery",
    outputSchemaRef: "MusicMaterial[]",
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
    description: "Update soft session state through the Stage Kernel.",
    inputSchemaRef: "StageSessionPatch",
    outputSchemaRef: "StageSession",
  },
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
  stage: StageKernelPort,
  sessionId: string,
  toolName: ToolName,
): Promise<Result<void>> {
  const handbook = await stage.compileHandbook({ sessionId });

  if (!handbook.ok) {
    return handbook;
  }

  const isAvailable = handbook.value.availableInstruments.some((instrument) =>
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

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
