import type {
  CollectionKind,
  CollectionRelationKind,
  EffectProposal,
  LibraryImportContinueInput,
  LibraryImportItemsListInput,
  InstrumentDescriptor,
  LibraryImportStartInput,
  LibraryImportStatusInput,
  LibraryImportSummaryInput,
  LibraryUpdateStartInput,
  KnowledgeQuery,
  MaterialResolveRequest,
  MemoryProposal,
  MusicMaterial,
  ProvisionalReviewApplyInput,
  ProvisionalReviewAutoUpdateInput,
  ProvisionalReviewInspectInput,
  ProvisionalReviewListInput,
  Ref,
  Result,
  StageError,
  StageEvent,
  SourceEntity,
  SourceLibraryEntry,
  SourceLibraryItem,
  SourceLibraryListInput,
  ToolName,
} from "../contracts/index.js";
import {
  buildInstrumentHandbook,
  readHandbookInstrument,
  readHandbookTool,
} from "../handbook/index.js";
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
  SystemCollectionRelationKind,
  ToolDispatchPort,
} from "../ports/index.js";
import {
  compactSourceLibraryList,
  compactLibraryImportItemsPage,
  compactLibraryImportStart,
  compactLibraryImportSummary,
  compactReviewAutoUpdate,
  compactReviewApply,
  compactReviewInspect,
  compactReviewList,
  reviewSubjectRef,
} from "./outputs.js";
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
  materialStore?: MaterialStorePort;
  collection?: CollectionPort;
  canonicalMaintenance?: CanonicalMaintenancePort;
  libraryImport?: LibraryImportPort;
};

type SourceLibraryListPage = {
  items: SourceLibraryEntry[];
  totalItems: number;
  nextCursor?: string;
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

        case "knowledge.query": {
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

        case "library.source.list": {
          const availableMaterialStore = readMaterialStore(materialStore);

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

          return page.ok ? ok(compactSourceLibraryList(page.value)) : page;
        }

        case "library.import.start": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          const result = await availableLibraryImport.value.startImport(
            readPayload<LibraryImportStartInput>(payload, { ownerScope: defaultOwnerScope }),
          );

          return result.ok ? ok(compactLibraryImportStart(result.value)) : result;
        }

        case "library.import.continue": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          return availableLibraryImport.value.continueImport(
            readPayload<LibraryImportContinueInput>(payload),
          );
        }

        case "library.update.start": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          const result = await availableLibraryImport.value.startUpdate(
            readPayload<LibraryUpdateStartInput>(payload, { ownerScope: defaultOwnerScope }),
          );

          return result.ok ? ok(compactLibraryImportStart(result.value)) : result;
        }

        case "library.update.continue": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          return availableLibraryImport.value.continueUpdate(
            readPayload<LibraryImportContinueInput>(payload),
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

          const result = await availableLibraryImport.value.getSummary(
            readPayload<LibraryImportSummaryInput>(payload),
          );

          return result.ok ? ok(compactLibraryImportSummary(result.value)) : result;
        }

        case "library.import.items.list": {
          const availableLibraryImport = readLibraryImport(libraryImport);

          if (!availableLibraryImport.ok) {
            return availableLibraryImport;
          }

          const result = await availableLibraryImport.value.listItems(
            readPayload<LibraryImportItemsListInput>(payload),
          );

          return result.ok ? ok(compactLibraryImportItemsPage(result.value)) : result;
        }

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

function readKnowledge(knowledge: MusicKnowledgePort | undefined): Result<MusicKnowledgePort> {
  if (knowledge === undefined) {
    return knowledgeUnavailable();
  }

  return ok(knowledge);
}

function readCanonicalMaintenance(
  canonicalMaintenance: CanonicalMaintenancePort | undefined,
): Result<CanonicalMaintenancePort> {
  if (canonicalMaintenance === undefined) {
    return canonicalMaintenanceUnavailable();
  }

  return ok(canonicalMaintenance);
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

function canonicalMaintenanceUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Canonical Maintenance tools are not available.",
    module: "stage_interface",
    retryable: false,
  });
}

function materialStoreUnavailable(): Result<never> {
  return fail({
    code: "stage_interface.tool_not_found",
    message: "Source Library tools are not available.",
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
