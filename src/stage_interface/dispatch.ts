import type {
  InstrumentDescriptor,
  MemoryProposal,
  ProvisionalReviewApplyInput,
  ProvisionalReviewAutoUpdateInput,
  ProvisionalReviewInspectInput,
  ProvisionalReviewListInput,
  Ref,
  Result,
  StageError,
  ToolName,
} from "../contracts/index.js";
import type {
  CollectionPort,
  CanonicalMaintenancePort,
  EffectBoundaryPort,
  EventPort,
  InstrumentCatalogPort,
  LibraryImportPort,
  MaterialStorePort,
  MaterialResolvePort,
  MaterialGatePort,
  MemoryPort,
  MusicKnowledgePort,
  SessionContextPort,
  SourceGroundingPort,
  ToolDispatchPort,
} from "../ports/index.js";
import {
  compactReviewAutoUpdate,
  compactReviewApply,
  compactReviewInspect,
  compactReviewList,
  reviewSubjectRef,
} from "./outputs.js";
import { stableToolNames } from "./tools.js";
import {
  createStageInterfaceToolDefinitionRegistry,
  type BoundStageInterfaceToolDefinition,
} from "./tool_definitions/index.js";

type ToolDispatchOptions = {
  sessionContext: SessionContextPort;
  materialGate: MaterialGatePort;
  instruments: InstrumentCatalogPort;
  materialResolve: MaterialResolvePort;
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
      events,
      effects,
    },
    handbook: {
      sessionContext,
      instruments,
    },
    music: {
      materialResolve,
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
  });

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

      const registryDefinition = toolDefinitionRegistry.get(toolName);

      if (registryDefinition !== undefined) {
        return callToolDefinition({
          definition: registryDefinition,
          sessionContext,
          instruments,
          sessionId,
          payload,
        });
      }

      const availability = await ensureToolAvailableForSession(
        sessionContext,
        instruments,
        sessionId,
        toolName,
      );

      if (!availability.ok) {
        return availability;
      }

      switch (toolName) {
        case "canonical.review.list": {
          const availableMaintenance = readCanonicalMaintenance(canonicalMaintenance);

          if (!availableMaintenance.ok) {
            return availableMaintenance;
          }

          const result = await availableMaintenance.value.reviewList({
            ...readPayload<Omit<ProvisionalReviewListInput, "sessionId">>(payload),
            sessionId,
          });

          return result.ok ? ok(compactReviewList(result.value)) : result;
        }

        case "canonical.review.inspect": {
          const availableMaintenance = readCanonicalMaintenance(canonicalMaintenance);

          if (!availableMaintenance.ok) {
            return availableMaintenance;
          }

          const input = readPayload<
            Omit<ProvisionalReviewInspectInput, "sessionId" | "subjectRef"> & {
              subjectId?: string;
              subjectRef?: Ref;
            }
          >(payload);
          const { subjectId, subjectRef: inputSubjectRef, ...inspectInput } = input;
          const subjectRef = subjectId === undefined
            ? inputSubjectRef
            : reviewSubjectRef(subjectId);

          if (subjectRef === undefined) {
            return fail({
              code: "stage_interface.invalid_payload",
              message: "canonical.review.inspect requires subjectId.",
              module: "stage_interface",
              retryable: false,
            });
          }

          const result = await availableMaintenance.value.reviewInspect({
            ...inspectInput,
            subjectRef,
            sessionId,
          });

          return result.ok
            ? ok(compactReviewInspect(result.value, { knowledgeFactLimit: input.knowledgeFactLimit }))
            : result;
        }

        case "canonical.review.apply": {
          const availableMaintenance = readCanonicalMaintenance(canonicalMaintenance);

          if (!availableMaintenance.ok) {
            return availableMaintenance;
          }

          const input = readPayload<
            Omit<ProvisionalReviewApplyInput, "sessionId" | "subjectRef"> & {
              subjectId?: string;
              subjectRef?: Ref;
            }
          >(payload);
          const { subjectId, subjectRef: inputSubjectRef, ...applyInput } = input;
          const subjectRef = subjectId === undefined
            ? inputSubjectRef
            : reviewSubjectRef(subjectId);

          if (subjectRef === undefined) {
            return fail({
              code: "stage_interface.invalid_payload",
              message: "canonical.review.apply requires subjectId.",
              module: "stage_interface",
              retryable: false,
            });
          }

          const result = await availableMaintenance.value.reviewApply({
            ...applyInput,
            subjectRef,
            sessionId,
          } as ProvisionalReviewApplyInput);

          return result.ok ? ok(compactReviewApply(result.value)) : result;
        }

        case "canonical.review.auto_update": {
          const availableMaintenance = readCanonicalMaintenance(canonicalMaintenance);

          if (!availableMaintenance.ok) {
            return availableMaintenance;
          }

          const input = readPayload<
            Omit<ProvisionalReviewAutoUpdateInput, "sessionId" | "subjectRef"> & {
              subjectId?: string;
              subjectRef?: Ref;
            }
          >(payload);
          const { subjectId, subjectRef: inputSubjectRef, ...autoUpdateInput } = input;
          const subjectRef = subjectId === undefined
            ? inputSubjectRef
            : reviewSubjectRef(subjectId);
          const result = await availableMaintenance.value.reviewAutoUpdate({
            ...autoUpdateInput,
            ...(subjectRef === undefined ? {} : { subjectRef }),
            sessionId,
          } as ProvisionalReviewAutoUpdateInput);

          return result.ok ? ok(compactReviewAutoUpdate(result.value)) : result;
        }

        case "memory.propose":
          return memory.propose(readPayload<{ proposal: Omit<MemoryProposal, "id"> }>(payload));

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

  const result = await definition.handler({ sessionId, payload });

  if (!result.ok || definition.present === undefined) {
    return result;
  }

  return ok(definition.present(result.value));
}

function readCanonicalMaintenance(
  canonicalMaintenance: CanonicalMaintenancePort | undefined,
): Result<CanonicalMaintenancePort> {
  if (canonicalMaintenance === undefined) {
    return canonicalMaintenanceUnavailable();
  }

  return ok(canonicalMaintenance);
}

function canonicalMaintenanceUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Canonical Maintenance tools are not available.",
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
