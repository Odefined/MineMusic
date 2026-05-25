import type {
  CollectionKind,
  CollectionRelationKind,
  EffectProposal,
  InstrumentDescriptor,
  LibraryImportPreviewInput,
  LibraryImportStartInput,
  LibraryImportStatusInput,
  LibraryImportSummaryInput,
  KnowledgeQuery,
  MaterialResolveRequest,
  MemoryProposal,
  MusicMaterial,
  Ref,
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
  LibraryImportPort,
  MaterialResolvePort,
  MaterialGatePort,
  MemoryPort,
  MusicKnowledgePort,
  SessionContextPort,
  SourceGroundingPort,
  SystemCollectionRelationKind,
  ToolDispatchPort,
} from "../ports/index.js";
import { stableToolNames } from "./tools.js";

const defaultOwnerScope = "local_profile:default";

type CollectionSystemAddPayload = {
  ownerScope: string;
  canonicalRef: Ref;
  label: string;
  description?: string;
};

type CollectionSystemRemovePayload = {
  ownerScope: string;
  canonicalRef: Ref;
};

type CollectionItemAddPayload = {
  collectionId: string;
  canonicalRef: Ref;
  label: string;
  description?: string;
};

type CollectionItemRemovePayload = {
  collectionId: string;
  canonicalRef: Ref;
};

type CollectionCreatePayload = {
  ownerScope: string;
  collectionKind: CollectionKind;
  label: string;
  description?: string;
};

type CollectionUpdatePayload = {
  collectionId: string;
  label?: string;
  description?: string;
};

type CollectionListPayload = {
  ownerScope: string;
  collectionId?: string;
  collectionKind?: CollectionKind;
  relationKind?: CollectionRelationKind;
  includeRemoved?: boolean;
  limit?: number;
  cursor?: string;
};

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
  collection?: CollectionPort;
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
  collection,
  libraryImport,
}: ToolDispatchOptions): ToolDispatchPort {
  const discoveryToolNames = new Set<ToolName>([
    "stage.context.read",
    "handbook.overview.read",
    "handbook.instrument.read",
    "handbook.tool.read",
    "stage.session.update",
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

        case "music.knowledge.query": {
          const availableKnowledge = readKnowledge(knowledge);

          if (!availableKnowledge.ok) {
            return availableKnowledge;
          }

          return availableKnowledge.value.query({
            query: readPayload<KnowledgeQuery>(payload),
            sessionId,
          });
        }

        case "music.links.refresh":
          return source.refreshPlayableLinks(
            readPayload<{
              material: MusicMaterial;
              sessionId?: string;
            }>(payload, { sessionId }),
          );

        case "music.collection.save":
          return dispatchSystemCollectionAdd(collection, payload, "saved");

        case "music.collection.unsave":
          return dispatchSystemCollectionRemove(collection, payload, "saved");

        case "music.collection.favorite":
          return dispatchSystemCollectionAdd(collection, payload, "favorite");

        case "music.collection.unfavorite":
          return dispatchSystemCollectionRemove(collection, payload, "favorite");

        case "music.collection.block":
          return dispatchSystemCollectionAdd(collection, payload, "blocked");

        case "music.collection.unblock":
          return dispatchSystemCollectionRemove(collection, payload, "blocked");

        case "music.collection.item.add": {
          const availableCollection = readCollection(collection);

          if (!availableCollection.ok) {
            return availableCollection;
          }

          return availableCollection.value.addItemToCollection(
            readPayload<CollectionItemAddPayload>(payload),
          );
        }

        case "music.collection.item.remove": {
          const availableCollection = readCollection(collection);

          if (!availableCollection.ok) {
            return availableCollection;
          }

          return availableCollection.value.removeItemFromCollection(
            readPayload<CollectionItemRemovePayload>(payload),
          );
        }

        case "music.collection.create": {
          const availableCollection = readCollection(collection);

          if (!availableCollection.ok) {
            return availableCollection;
          }

          return availableCollection.value.createCollection({
            ...readPayload<CollectionCreatePayload>(payload, { ownerScope: defaultOwnerScope }),
            relationKind: "custom",
          });
        }

        case "music.collection.update": {
          const availableCollection = readCollection(collection);

          if (!availableCollection.ok) {
            return availableCollection;
          }

          return availableCollection.value.updateCollection(
            readPayload<CollectionUpdatePayload>(payload),
          );
        }

        case "music.collection.delete": {
          const availableCollection = readCollection(collection);

          if (!availableCollection.ok) {
            return availableCollection;
          }

          return availableCollection.value.removeCollection(
            readPayload<{ collectionId: string }>(payload),
          );
        }

        case "music.collection.list": {
          const availableCollection = readCollection(collection);

          if (!availableCollection.ok) {
            return availableCollection;
          }

          const input = readPayload<CollectionListPayload>(payload, { ownerScope: defaultOwnerScope });
          const collections = await availableCollection.value.listCollections(input);

          if (!collections.ok) {
            return collections;
          }

          const items = await availableCollection.value.listItems(input);

          if (!items.ok) {
            return items;
          }

          return ok({
            collections: collections.value,
            items: items.value,
          });
        }

        case "library.import.preview": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          return availableLibraryImport.value.previewImport(
            readPayload<LibraryImportPreviewInput>(payload, { ownerScope: defaultOwnerScope }),
          );
        }

        case "library.import.start": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          return availableLibraryImport.value.startImport(
            readPayload<LibraryImportStartInput>(payload, { ownerScope: defaultOwnerScope }),
          );
        }

        case "library.update.preview": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          return availableLibraryImport.value.previewUpdate(
            readPayload<LibraryImportPreviewInput>(payload, { ownerScope: defaultOwnerScope }),
          );
        }

        case "library.update.start": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          return availableLibraryImport.value.startUpdate(
            readPayload<LibraryImportStartInput>(payload, { ownerScope: defaultOwnerScope }),
          );
        }

        case "library.import.status": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          return availableLibraryImport.value.getStatus(
            readPayload<LibraryImportStatusInput>(payload),
          );
        }

        case "library.import.summary": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          return availableLibraryImport.value.getSummary(
            readPayload<LibraryImportSummaryInput>(payload),
          );
        }

        case "stage.events.record":
          return events.record(readPayload<{ event: Omit<StageEvent, "id" | "time"> }>(payload));

        case "memory.propose":
          return memory.propose(readPayload<{ proposal: Omit<MemoryProposal, "id"> }>(payload));

        case "stage.effects.propose":
          return effects.propose(readPayload<{ proposal: Omit<EffectProposal, "id"> }>(payload));

        case "stage.session.update":
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

function dispatchSystemCollectionAdd(
  collection: CollectionPort | undefined,
  payload: unknown,
  relationKind: SystemCollectionRelationKind,
): ReturnType<CollectionPort["addItemToSystemCollection"]> | Result<never> {
  const availableCollection = readCollection(collection);

  if (!availableCollection.ok) {
    return availableCollection;
  }

  return availableCollection.value.addItemToSystemCollection({
    ...readPayload<CollectionSystemAddPayload>(payload, { ownerScope: defaultOwnerScope }),
    relationKind,
  });
}

function dispatchSystemCollectionRemove(
  collection: CollectionPort | undefined,
  payload: unknown,
  relationKind: SystemCollectionRelationKind,
): ReturnType<CollectionPort["removeItemFromSystemCollection"]> | Result<never> {
  const availableCollection = readCollection(collection);

  if (!availableCollection.ok) {
    return availableCollection;
  }

  return availableCollection.value.removeItemFromSystemCollection({
    ...readPayload<CollectionSystemRemovePayload>(payload, { ownerScope: defaultOwnerScope }),
    relationKind,
  });
}

function readCollection(collection: CollectionPort | undefined): Result<CollectionPort> {
  if (collection === undefined) {
    return collectionUnavailable();
  }

  return ok(collection);
}

function readLibraryImport(libraryImport: LibraryImportPort | undefined): Result<LibraryImportPort> {
  if (libraryImport === undefined) {
    return libraryImportUnavailable();
  }

  return ok(libraryImport);
}

function readKnowledge(knowledge: MusicKnowledgePort | undefined): Result<MusicKnowledgePort> {
  if (knowledge === undefined) {
    return knowledgeUnavailable();
  }

  return ok(knowledge);
}

function collectionUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Collection tools are not available.",
    module: "stage_interface",
    retryable: false,
  });
}

function knowledgeUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Music Knowledge tools are not available.",
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
