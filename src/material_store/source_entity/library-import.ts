import { randomUUID } from "node:crypto";

import type {
  LibraryImportAreaSnapshot,
  LibraryImportBatch,
  LibraryImportBatchKind,
  LibraryImportContinuationState,
  LibraryImportContinueInput,
  LibraryImportCounts,
  LibraryImportItemsListInput,
  LibraryImportItemsListOutput,
  LibraryImportPreview,
  LibraryImportPreviewArea,
  LibraryImportPreviewInput,
  LibraryImportProgress,
  LibraryImportReport,
  LibraryImportReportArea,
  LibraryImportItemReport,
  LibraryImportScope,
  LibraryImportStartInput,
  LibraryImportStatus,
  LibraryImportSourceLibraryEstimateCounts,
  LibraryImportUpdateEstimateCounts,
  LibraryUpdateMode,
  LibraryUpdatePreviewInput,
  LibraryUpdateStartInput,
  PlatformLibraryArea,
  PlatformLibraryAbsence,
  PlatformLibraryAbsenceSummary,
  PlatformLibraryCount,
  PlatformLibraryItem,
  PlatformLibraryPreviewArea,
  PlatformLibraryProvider,
  PlatformLibraryReadAreaResult,
  Ref,
  Result,
  SourceArtist,
  SourceEntity,
  SourceLibraryItem,
  SourceRelease,
  SourceTrack,
  StageError,
} from "../../contracts/index.js";
import type {
  EventPort,
  LibraryImportPort,
  LibraryImportRepository,
  MaterialStorePort,
  PluginRegistryPort,
} from "../../ports/index.js";

type LibraryImportServiceOptions = {
  pluginRegistry: PluginRegistryPort;
  materialStore: MaterialStorePort;
  events: EventPort;
  repository: LibraryImportRepository;
  idFactory?: () => string;
  clock?: () => string;
};

const defaultOwnerScope = "local_profile:default";

function resolvedUpdateMode(
  input: LibraryUpdatePreviewInput | LibraryUpdateStartInput,
): LibraryUpdateMode {
  return input.mode ?? "full";
}

function isLatestUntilSeenMode(mode: LibraryUpdateMode | undefined): boolean {
  return mode === "latest_until_seen";
}

export function createLibraryImportService({
  pluginRegistry,
  materialStore,
  events,
  repository,
  idFactory = createDefaultIdFactory("library-import-batch"),
  clock = () => new Date().toISOString(),
}: LibraryImportServiceOptions): LibraryImportPort {
  const completedReports = new Map<string, LibraryImportReport>();

  return {
    previewImport(input) {
      return previewLibraryImport({
        pluginRegistry,
        materialStore,
        repository,
        input,
        includeUpdateEstimates: false,
      });
    },

    startImport(input) {
      return startLibraryImport({
        pluginRegistry,
        materialStore,
        events,
        repository,
        completedReports,
        input,
        batchKind: "initial_import",
        idFactory,
        clock,
      });
    },

    async continueImport(input) {
      return continueLibraryImport({
        pluginRegistry,
        materialStore,
        events,
        repository,
        completedReports,
        input,
        clock,
      });
    },

    previewUpdate(input) {
      return previewLibraryImport({
        pluginRegistry,
        materialStore,
        repository,
        input,
        includeUpdateEstimates: true,
      });
    },

    async continueUpdate(input) {
      return continueLibraryImport({
        pluginRegistry,
        materialStore,
        events,
        repository,
        completedReports,
        input,
        clock,
      });
    },

    startUpdate(input) {
      return startLibraryImport({
        pluginRegistry,
        materialStore,
        events,
        repository,
        completedReports,
        input,
        batchKind: "library_update",
        idFactory,
        clock,
      });
    },

    async getStatus({ batchId }) {
      const storedReport = await repository.getReport({ batchId });

      if (!storedReport.ok) {
        return storedReport;
      }

      if (storedReport.value !== null) {
        return ok(reportToStatus(storedReport.value));
      }

      const batch = await repository.getBatch({ batchId });

      if (!batch.ok) {
        return batch;
      }

      if (batch.value === null) {
        return batchNotFound(batchId);
      }

      return ok(batchToStatus(batch.value));
    },

    async getSummary({ batchId }) {
      return loadLibraryImportReport({
        repository,
        completedReports,
        batchId,
      });
    },

    async listItems(input) {
      const report = await loadLibraryImportReport({
        repository,
        completedReports,
        batchId: input.batchId,
      });

      if (!report.ok) {
        return report;
      }

      return ok(listReportItems(report.value, input));
    },
  };
}

async function loadLibraryImportReport({
  repository,
  completedReports,
  batchId,
}: {
  repository: LibraryImportRepository;
  completedReports: Map<string, LibraryImportReport>;
  batchId: string;
}): Promise<Result<LibraryImportReport>> {
  const storedReport = await repository.getReport({ batchId });

  if (!storedReport.ok) {
    return storedReport;
  }

  if (storedReport.value !== null) {
    return ok(storedReport.value);
  }

  const completedReport = completedReports.get(batchId);

  if (completedReport !== undefined) {
    return ok(structuredClone(completedReport));
  }

  const batch = await repository.getBatch({ batchId });

  if (!batch.ok) {
    return batch;
  }

  if (batch.value === null) {
    return batchNotFound(batchId);
  }

  return ok(batchToReport(batch.value));
}

function listReportItems(
  report: LibraryImportReport,
  input: LibraryImportItemsListInput,
): LibraryImportItemsListOutput {
  const totalItems = report.items.length;
  const start = normalizeItemCursor(input.cursor, totalItems);
  const limit = normalizeItemLimit(input.limit);
  const items = report.items.slice(start, start + limit);
  const nextOffset = start + items.length;

  return {
    batchId: report.batchId,
    items,
    totalItems,
    ...(nextOffset < totalItems ? { nextCursor: String(nextOffset) } : {}),
  };
}

async function previewLibraryImport({
  pluginRegistry,
  materialStore,
  repository,
  input,
  includeUpdateEstimates,
}: {
  pluginRegistry: PluginRegistryPort;
  materialStore: MaterialStorePort;
  repository: LibraryImportRepository;
  input: LibraryImportPreviewInput | LibraryUpdatePreviewInput;
  includeUpdateEstimates: boolean;
}): Promise<Result<LibraryImportPreview>> {
  const provider = await resolvePlatformLibraryProvider(pluginRegistry, input.providerId);

  if (!provider.ok) {
    return provider;
  }

  const updateMode =
    includeUpdateEstimates && "mode" in input
      ? resolvedUpdateMode(input as LibraryUpdatePreviewInput)
      : undefined;

  const scopes = normalizeScopes(input.scopes);
  const areas = scopesToProviderAreas(scopes);
  const latestModeSupport = ensureLibraryUpdateModeSupported({
    provider: provider.value,
    scopes,
    mode: updateMode,
  });

  if (!latestModeSupport.ok) {
    return latestModeSupport;
  }
  const ownerScope = input.ownerScope ?? defaultOwnerScope;
  const preview = await provider.value.preview({
    ...(input.providerAccountId === undefined ? {} : { providerAccountId: input.providerAccountId }),
    ...(areas.length === 0 ? {} : { areas }),
    ...(scopes.includes("discovery") ? { discovery: true } : {}),
    ...(input.sampleLimitPerArea === undefined ? {} : { sampleLimitPerArea: input.sampleLimitPerArea }),
  });

  if (!preview.ok) {
    return providerReadFailed(input.providerId, preview.error);
  }

  const providerAccountId = preview.value.account?.providerAccountId ?? input.providerAccountId;
  const providerAccountStable = preview.value.account?.stable;
  const estimates = await estimateReadablePreviewAreas({
    provider: provider.value,
    materialStore,
    repository,
    ownerScope,
    providerAccountId,
    providerAccountStable,
    requestedAreas: areas,
    previewAreas: preview.value.areas,
    sampleLimitPerArea: input.sampleLimitPerArea,
    includeUpdateEstimates,
  });

  if (!estimates.ok) {
    return estimates;
  }

  const result: LibraryImportPreview = {
    providerId: preview.value.providerId,
    ownerScope,
    scopes,
    areas: preview.value.areas.map((area) =>
      providerPreviewAreaToLibraryImportArea(
        area,
        includeUpdateEstimates,
        estimates.value.get(area.area),
      ),
    ),
  };

  if (preview.value.account !== undefined) {
    result.account = preview.value.account;
  }

  if (preview.value.issues !== undefined) {
    result.issues = preview.value.issues;
  }

  return ok(result);
}

function ensureLibraryUpdateModeSupported({
  provider,
  scopes,
  mode,
}: {
  provider: PlatformLibraryProvider;
  scopes: LibraryImportScope[];
  mode: LibraryUpdateMode | undefined;
}): Result<void> {
  if (!isLatestUntilSeenMode(mode)) {
    return ok(undefined);
  }

  for (const scope of scopes) {
    const area = scopeToProviderArea(scope);

    if (area === null) {
      continue;
    }

    const descriptor = provider.descriptor?.areas?.find((candidate) => candidate.id === area);

    if (descriptor?.ordering !== "newest_first") {
      return fail({
        code: "library_import.update_mode_unsupported",
        message: `Library Update mode 'latest_until_seen' is not supported for area '${area}' by provider '${provider.id}'.`,
        module: "library_import",
        retryable: false,
      });
    }
  }

  return ok(undefined);
}

type PreviewAreaEstimates = {
  sourceLibraryEstimates: LibraryImportSourceLibraryEstimateCounts;
  updateEstimates?: LibraryImportUpdateEstimateCounts;
  absences?: PlatformLibraryAbsenceSummary[];
};

async function estimateReadablePreviewAreas({
  provider,
  materialStore,
  repository,
  ownerScope,
  providerAccountId,
  providerAccountStable,
  requestedAreas,
  previewAreas,
  sampleLimitPerArea,
  includeUpdateEstimates,
}: {
  provider: PlatformLibraryProvider;
  materialStore: MaterialStorePort;
  repository: LibraryImportRepository;
  ownerScope: string;
  providerAccountId: string | undefined;
  providerAccountStable: boolean | undefined;
  requestedAreas: PlatformLibraryArea[];
  previewAreas: PlatformLibraryPreviewArea[];
  sampleLimitPerArea: number | undefined;
  includeUpdateEstimates: boolean;
}): Promise<Result<Map<PlatformLibraryArea, PreviewAreaEstimates>>> {
  const readableAreas = previewAreas
    .filter(
      (area) =>
        area.availability === "readable" &&
        requestedAreas.includes(area.area) &&
        isFirstSliceArea(area.area),
    )
    .map((area) => area.area);

  if (readableAreas.length === 0) {
    return ok(new Map());
  }

  const read = await provider.readItems({
    ...(providerAccountId === undefined ? {} : { providerAccountId }),
    areas: readableAreas,
    ...(sampleLimitPerArea === undefined ? {} : { sampleLimitPerArea }),
  });

  if (!read.ok) {
    return providerReadFailed(provider.id, read.error);
  }

  const estimates = new Map<PlatformLibraryArea, PreviewAreaEstimates>();
  const readProviderAccountId = read.value.account?.providerAccountId ?? providerAccountId;
  const readProviderAccountStable = read.value.account?.stable ?? providerAccountStable;

  for (const area of read.value.areas) {
    const areaEstimates = emptyPreviewAreaEstimates();
    const updateEstimates = includeUpdateEstimates ? emptyUpdateEstimates() : undefined;
    let baselineSnapshot: LibraryImportAreaSnapshot | null = null;

    if (updateEstimates !== undefined) {
      const baseline = await getLatestCompleteAreaSnapshotForRead({
        repository,
        ownerScope,
        providerId: provider.id,
        providerAccountId: readProviderAccountId,
        providerAccountStable: readProviderAccountStable,
        scope: providerAreaToScope(area.area),
        area: area.area,
      });

      if (!baseline.ok) {
        return baseline;
      }

      baselineSnapshot = baseline.value;
    }
    const baselineSourceRefKeys =
      baselineSnapshot === null
        ? null
        : new Set(baselineSnapshot.sourceRefs.map((sourceRef) => refKey(sourceRef)));

    for (const item of area.items) {
      const itemEstimate = await estimatePreviewItem({
        materialStore,
        ownerScope,
        providerId: provider.id,
        providerAccountId: readProviderAccountId,
        item,
      });

      if (!itemEstimate.ok) {
        return itemEstimate;
      }

      incrementPreviewAreaEstimates(areaEstimates, itemEstimate.value);
      if (updateEstimates !== undefined) {
        incrementUpdateEstimates(updateEstimates, {
          itemEstimate: itemEstimate.value,
          sourceRef: item.sourceRef,
          baselineSourceRefKeys,
        });
      }
    }

    if (updateEstimates !== undefined && area.status === "complete") {
      const absenceSummaries = await previewAbsencesForArea({
        repository,
        ownerScope,
        providerId: provider.id,
        providerAccountId: readProviderAccountId,
        providerAccountStable: readProviderAccountStable,
        scope: providerAreaToScope(area.area),
        area: area.area,
        currentItems: area.items,
        currentBatchId: undefined,
        baseline: baselineSnapshot,
      });

      if (!absenceSummaries.ok) {
        return absenceSummaries;
      }

      updateEstimates.noLongerReturned += absenceSummaries.value.length;
      areaEstimates.updateEstimates = updateEstimates;

      if (absenceSummaries.value.length > 0) {
        areaEstimates.absences = absenceSummaries.value;
      }
    }

    estimates.set(area.area, areaEstimates);
  }

  return ok(estimates);
}

type PreviewItemEstimate =
  | "already_present"
  | "would_import";

async function estimatePreviewItem({
  materialStore,
  ownerScope,
  providerId,
  providerAccountId,
  item,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  providerId: string;
  providerAccountId: string | undefined;
  item: PlatformLibraryItem;
}): Promise<Result<PreviewItemEstimate>> {
  if (providerAccountId === undefined) {
    return ok("would_import");
  }

  const sourceLibraryItem = await materialStore.getSourceLibraryItem({
    ownerScope,
    providerId,
    providerAccountId,
    libraryKind: item.itemKind,
    sourceRef: item.sourceRef,
  });

  if (!sourceLibraryItem.ok) {
    return sourceLibraryItem;
  }

  return ok(
    sourceLibraryItem.value?.status === "present" ? "already_present" : "would_import",
  );
}

function incrementPreviewAreaEstimates(
  estimates: PreviewAreaEstimates,
  itemEstimate: PreviewItemEstimate,
): void {
  switch (itemEstimate) {
    case "already_present":
      estimates.sourceLibraryEstimates.alreadyPresent += 1;
      return;
    case "would_import":
      estimates.sourceLibraryEstimates.wouldImport += 1;
      return;
  }
}

function incrementUpdateEstimates(
  estimates: LibraryImportUpdateEstimateCounts,
  {
    itemEstimate,
    sourceRef,
    baselineSourceRefKeys,
  }: {
    itemEstimate: PreviewItemEstimate;
    sourceRef: Ref;
    baselineSourceRefKeys: Set<string> | null;
  },
): void {
  if (baselineSourceRefKeys !== null) {
    if (baselineSourceRefKeys.has(refKey(sourceRef))) {
      estimates.alreadyPresent += 1;
    } else {
      estimates.newlyObserved += 1;
    }

    return;
  }

  switch (itemEstimate) {
    case "already_present":
      estimates.alreadyPresent += 1;
      return;
    case "would_import":
      estimates.newlyObserved += 1;
      return;
  }
}

async function getLatestCompleteAreaSnapshotForRead({
  repository,
  ownerScope,
  providerId,
  providerAccountId,
  providerAccountStable,
  scope,
  area,
}: {
  repository: LibraryImportRepository;
  ownerScope: string;
  providerId: string;
  providerAccountId: string | undefined;
  providerAccountStable: boolean | undefined;
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
}): Promise<Result<LibraryImportAreaSnapshot | null>> {
  if (providerAccountId === undefined) {
    return ok(null);
  }

  return repository.getLatestCompleteAreaSnapshot({
    ownerScope,
    providerId,
    providerAccountId,
    ...(providerAccountStable === undefined ? {} : { providerAccountStable }),
    scope,
    area,
  });
}

async function previewAbsencesForArea({
  repository,
  ownerScope,
  providerId,
  providerAccountId,
  providerAccountStable,
  scope,
  area,
  currentItems,
  currentBatchId,
  baseline,
}: {
  repository: LibraryImportRepository;
  ownerScope: string;
  providerId: string;
  providerAccountId: string | undefined;
  providerAccountStable: boolean | undefined;
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  currentItems: PlatformLibraryItem[];
  currentBatchId: string | undefined;
  baseline?: LibraryImportAreaSnapshot | null;
}): Promise<Result<PlatformLibraryAbsenceSummary[]>> {
  const latestBaseline =
    baseline === undefined
      ? await getLatestCompleteAreaSnapshotForRead({
          repository,
          ownerScope,
          providerId,
          providerAccountId,
          providerAccountStable,
          scope,
          area,
        })
      : ok(baseline);

  if (!latestBaseline.ok) {
    return latestBaseline;
  }

  if (latestBaseline.value === null) {
    return ok([]);
  }

  if (providerAccountId === undefined) {
    return ok([]);
  }

  const baselineSnapshot = latestBaseline.value;
  const missingSourceRefs = baselineSnapshot.sourceRefs.filter(
    (sourceRef) => !currentItems.some((item) => sameRef(item.sourceRef, sourceRef)),
  );
  const absences: PlatformLibraryAbsenceSummary[] = [];

  for (const sourceRef of missingSourceRefs) {
    const provenance = await repository.getItemProvenance({
      ownerScope,
      providerId,
      providerAccountId,
      scope,
      area,
      sourceRef,
    });

    if (!provenance.ok) {
      return provenance;
    }

    const absence: PlatformLibraryAbsenceSummary = {
      providerId,
      providerAccountId,
      ownerScope,
      scope,
      area,
      sourceRef,
      label: provenance.value?.label ?? sourceRef.label ?? sourceRef.id,
      baselineBatchId: baselineSnapshot.batchId,
      reason: "platform_not_returned",
    };

    if (currentBatchId !== undefined) {
      absence.currentBatchId = currentBatchId;
    }

    absences.push(absence);
  }

  return ok(absences);
}

async function previewAbsencesForSourceRefs({
  repository,
  ownerScope,
  providerId,
  providerAccountId,
  providerAccountStable,
  scope,
  area,
  currentSourceRefs,
  currentBatchId,
}: {
  repository: LibraryImportRepository;
  ownerScope: string;
  providerId: string;
  providerAccountId: string | undefined;
  providerAccountStable: boolean | undefined;
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  currentSourceRefs: Ref[];
  currentBatchId: string | undefined;
}): Promise<Result<PlatformLibraryAbsenceSummary[]>> {
  return previewAbsencesForArea({
    repository,
    ownerScope,
    providerId,
    providerAccountId,
    providerAccountStable,
    scope,
    area,
    currentItems: currentSourceRefs
      .map((sourceRef) => ({
        sourceRef,
      }) as PlatformLibraryItem),
    currentBatchId,
  });
}

async function deriveSourceLibraryAbsences({
  materialStore,
  ownerScope,
  providerId,
  providerAccountId,
  area,
  currentSourceRefs,
  currentBatchId,
}: {
  materialStore: MaterialStorePort;
  ownerScope: string;
  providerId: string;
  providerAccountId: string | undefined;
  area: PlatformLibraryArea;
  currentSourceRefs: Ref[];
  currentBatchId: string;
}): Promise<Result<Array<{ absence: PlatformLibraryAbsenceSummary; item: SourceLibraryItem }>>> {
  if (providerAccountId === undefined) {
    return ok([]);
  }

  const libraryKind = libraryKindForArea(area);

  if (libraryKind === null) {
    return ok([]);
  }

  const presentItems = await materialStore.listSourceLibraryItems({
    ownerScope,
    providerId,
    providerAccountId,
    libraryKind,
    status: "present",
  });

  if (!presentItems.ok) {
    return presentItems;
  }

  const currentRefKeys = new Set(currentSourceRefs.map((sourceRef) => refKey(sourceRef)));

  return ok(
    presentItems.value
      .filter((item) => !currentRefKeys.has(refKey(item.sourceRef)))
      .map((item) => ({
        item,
        absence: {
          providerId,
          providerAccountId,
          ownerScope,
          scope: providerAreaToScope(area),
          area,
          sourceRef: item.sourceRef,
          label: item.label,
          baselineBatchId:
            item.lastSeenBatchId ??
            item.firstImportedBatchId ??
            item.id,
          currentBatchId,
          reason: "platform_not_returned",
        },
      })),
  );
}

function libraryKindForArea(area: PlatformLibraryArea): PlatformLibraryItem["itemKind"] | null {
  switch (area) {
    case "saved_source_tracks":
      return "saved_source_track";
    case "saved_source_releases":
      return "saved_source_release";
    case "saved_source_artists":
      return "saved_source_artist";
    case "playlists":
    case "listening_history":
      return null;
  }
}

function emptyPreviewAreaEstimates(): PreviewAreaEstimates {
  return {
    sourceLibraryEstimates: emptySourceLibraryEstimates(),
  };
}

async function startLibraryImport({
  pluginRegistry,
  materialStore,
  events,
  repository,
  completedReports,
  input,
  batchKind,
  idFactory,
  clock,
}: {
  pluginRegistry: PluginRegistryPort;
  materialStore: MaterialStorePort;
  events: EventPort;
  repository: LibraryImportRepository;
  completedReports: Map<string, LibraryImportReport>;
  input: LibraryImportStartInput | LibraryUpdateStartInput;
  batchKind: LibraryImportBatchKind;
  idFactory: () => string;
  clock: () => string;
}): Promise<Result<LibraryImportReport>> {
  const scopes = normalizeScopes(input.scopes);

  if (scopes.includes("discovery")) {
    return scopeUnsupported("discovery", batchKind);
  }

  const provider = await resolvePlatformLibraryProvider(pluginRegistry, input.providerId);

  if (!provider.ok) {
    return provider;
  }

  const updateMode = batchKind === "library_update" ? resolvedUpdateMode(input) : undefined;
  const supportedMode = ensureLibraryUpdateModeSupported({
    provider: provider.value,
    scopes,
    mode: updateMode,
  });

  if (!supportedMode.ok) {
    return supportedMode;
  }

  if (
    shouldUsePagedImport({
      input,
      provider: provider.value,
      repository,
    }) &&
    isPagedPlatformLibraryProvider(provider.value)
  ) {
    return startPagedLibraryImport({
      materialStore,
      events,
      repository,
      completedReports,
      provider: provider.value,
      input,
      batchKind,
      idFactory,
      clock,
    });
  }

  const batchId = idFactory();
  const startedAt = clock();
  const ownerScope = input.ownerScope ?? defaultOwnerScope;
  const counts = emptyCounts();
  const runningBatch: LibraryImportBatch = {
    id: batchId,
    batchKind,
    ...(updateMode === undefined ? {} : { mode: updateMode }),
    status: "running",
    providerId: input.providerId,
    ownerScope,
    scopes,
    startedAt,
    counts,
  };

  if (input.providerAccountId !== undefined) {
    runningBatch.providerAccountId = input.providerAccountId;
  }

  const storedRunningBatch = await repository.putBatch({ batch: runningBatch });

  if (!storedRunningBatch.ok) {
    return storedRunningBatch;
  }

  let currentBatch = storedRunningBatch.value;

  const startedEvent = await recordLibraryImportEvent(events, {
    batch: currentBatch,
    type: "library_import.batch.started",
    payload: {},
  });

  if (!startedEvent.ok) {
    return markStartedBatchFailed({
      repository,
      batch: currentBatch,
      completedAt: clock(),
      result: startedEvent,
    });
  }

  const read = await provider.value.readItems({
    ...(input.providerAccountId === undefined ? {} : { providerAccountId: input.providerAccountId }),
    areas: scopesToProviderAreas(scopes),
    ...(input.sampleLimitPerArea === undefined ? {} : { sampleLimitPerArea: input.sampleLimitPerArea }),
  });

  if (!read.ok) {
    return markStartedBatchFailed({
      repository,
      batch: currentBatch,
      completedAt: clock(),
      result: {
        ok: false,
        error: providerReadFailedError(input.providerId, read.error),
      },
    });
  }

  const completedAt = clock();
  const providerAccountId =
    read.value.account?.providerAccountId ?? input.providerAccountId ?? "unknown";
  const providerAccountStable = read.value.account?.stable;
  currentBatch = {
    ...currentBatch,
    providerId: read.value.providerId,
    providerAccountId,
    counts,
  };

  if (providerAccountStable !== undefined) {
    currentBatch.providerAccountStable = providerAccountStable;
  }

  if (read.value.issues !== undefined) {
    currentBatch.issues = read.value.issues;
  }

  const reportAreas = read.value.areas.map(providerReadAreaToReportArea);
  const itemReports: LibraryImportItemReport[] = [];
  const absences: PlatformLibraryAbsenceSummary[] = [];
  const processedAreaItems = new Map<PlatformLibraryArea, number>();
  let completedWithWarnings = readHasWarnings(read.value.areas, read.value.issues);
  const latestUntilSeen = isLatestUntilSeenMode(updateMode);

  for (const area of read.value.areas) {
    const scope = providerAreaToScope(area.area);
    let processedItemsForArea = 0;
    let stoppedAtExistingSourceRef = false;

    for (const item of area.items) {
      const itemReport = await importProviderItem({
        materialStore,
        events,
        repository,
        batchId,
        batchKind,
        ownerScope,
        providerId: read.value.providerId,
        providerAccountId,
        scope,
        area: area.area,
        item,
        seenAt: completedAt,
        suppressAlreadyPresentReport: batchKind === "library_update",
      });

      if (!itemReport.ok) {
        return markStartedBatchFailed({
          repository,
          batch: currentBatch,
          completedAt: clock(),
          result: itemReport,
        });
      }

      processedItemsForArea += 1;

      if (itemReport.value.report !== null) {
        itemReports.push(itemReport.value.report);
        applyItemReportToCounts(counts, itemReport.value.report);

        if (itemReport.value.report.status === "failed") {
          completedWithWarnings = true;
        }
      }

      if (latestUntilSeen && itemReport.value.alreadyPresent) {
        stoppedAtExistingSourceRef = true;
        break;
      }
    }

    processedAreaItems.set(area.area, processedItemsForArea);

    if (batchKind === "library_update" && area.status === "complete" && !latestUntilSeen) {
      const areaAbsences = await deriveSourceLibraryAbsences({
        materialStore,
        ownerScope,
        providerId: read.value.providerId,
        providerAccountId,
        area: area.area,
        currentSourceRefs: area.items.map((item) => item.sourceRef),
        currentBatchId: batchId,
      });

      if (!areaAbsences.ok) {
        return markStartedBatchFailed({
          repository,
          batch: currentBatch,
          completedAt: clock(),
          result: areaAbsences,
        });
      }

      for (const { absence, item } of areaAbsences.value) {
        const storedAbsence = await storePlatformLibraryAbsence({
          materialStore,
          repository,
          events,
          batchId,
          batchKind,
          ownerScope,
          providerId: read.value.providerId,
          providerAccountId,
          item,
          absence,
          recordedAt: completedAt,
        });

        if (!storedAbsence.ok) {
          return markStartedBatchFailed({
            repository,
            batch: currentBatch,
            completedAt: clock(),
            result: storedAbsence,
          });
        }

        absences.push(absence);
        counts.absentItems += 1;
      }
    }

    if (area.status === "complete" && !latestUntilSeen) {
      const storedSnapshot = await repository.putAreaSnapshot({
        snapshot: {
          batchId,
          ownerScope,
          providerId: read.value.providerId,
          providerAccountId,
          ...(providerAccountStable === undefined ? {} : { providerAccountStable }),
          scope,
          area: area.area,
          status: area.status,
          complete: true,
          sourceRefs: area.items.map((item) => item.sourceRef),
          itemCount: area.items.length,
          recordedAt: completedAt,
        },
      });

      if (!storedSnapshot.ok) {
        return markStartedBatchFailed({
          repository,
          batch: currentBatch,
          completedAt: clock(),
          result: storedSnapshot,
        });
      }
    }

    if (stoppedAtExistingSourceRef) {
      const reportArea = reportAreas.find(
        (candidate) => candidate.scope === scope && candidate.area === area.area,
      );

      if (reportArea !== undefined) {
        reportArea.readStatus = "complete";
      }
    }
  }

  const batch: LibraryImportBatch = {
    id: batchId,
    batchKind,
    ...(updateMode === undefined ? {} : { mode: updateMode }),
    status: completedWithWarnings ? "completed_with_warnings" : "completed",
    providerId: read.value.providerId,
    ownerScope,
    scopes,
    startedAt,
    completedAt,
    counts,
  };

  batch.providerAccountId = providerAccountId;

  if (providerAccountStable !== undefined) {
    batch.providerAccountStable = providerAccountStable;
  }

  if (read.value.issues !== undefined) {
    batch.issues = read.value.issues;
  }

  const stored = await repository.putBatch({ batch });

  if (!stored.ok) {
    return markStartedBatchFailed({
      repository,
      batch: currentBatch,
      completedAt: clock(),
      result: stored,
    });
  }

  const report = batchToReport(stored.value);
  report.areas = reportAreas;
  report.items = itemReports;
  report.progress = {
    processedItems: [...processedAreaItems.values()].reduce((sum, value) => sum + value, 0),
    areas: reportAreas.map((area) => ({
      scope: area.scope,
      area: area.area,
      processedItems: processedAreaItems.get(area.area) ?? 0,
      ...(area.count === undefined ? {} : { count: area.count }),
    })),
    hasMore: false,
    nextAction: "summary",
  };

  if (absences.length > 0) {
    report.absences = absences;
  }

  if (read.value.account !== undefined) {
    report.account = read.value.account;
  }

  const storedReport = await repository.putReport({ report });

  if (!storedReport.ok) {
    return markStartedBatchFailed({
      repository,
      batch: currentBatch,
      completedAt: clock(),
      result: storedReport,
    });
  }

  const completedEvent = await recordLibraryImportEvent(events, {
    batch: stored.value,
    type: "library_import.batch.completed",
    payload: {
      status: stored.value.status,
      counts: stored.value.counts,
    },
  });

  if (!completedEvent.ok) {
    return completedEvent;
  }

  completedReports.set(storedReport.value.batchId, structuredClone(storedReport.value));

  return ok(storedReport.value);
}

async function markStartedBatchFailed<T>({
  repository,
  batch,
  completedAt,
  result,
}: {
  repository: LibraryImportRepository;
  batch: LibraryImportBatch;
  completedAt: string;
  result: { ok: false; error: StageError };
}): Promise<Result<T>> {
  const failedBatch: LibraryImportBatch = {
    ...batch,
    status: "failed",
    completedAt,
    counts: structuredClone(batch.counts),
  };
  const stored = await repository.putBatch({ batch: failedBatch });

  if (!stored.ok) {
    return stored;
  }

  return result;
}

async function importProviderItem({
  materialStore,
  events,
  repository,
  batchId,
  batchKind,
  ownerScope,
  providerId,
  providerAccountId,
  scope,
  area,
  item,
  seenAt,
  suppressAlreadyPresentReport,
}: {
  materialStore: MaterialStorePort;
  events: EventPort;
  repository: LibraryImportRepository;
  batchId: string;
  batchKind: LibraryImportBatchKind;
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  item: PlatformLibraryItem;
  seenAt: string;
  suppressAlreadyPresentReport: boolean;
}): Promise<Result<{ report: LibraryImportItemReport | null; alreadyPresent: boolean }>> {
  const baseReport = itemReportBase({ scope, area, item });
  const storedSourceState = await storeSourceEntityAndLibraryItem({
    materialStore,
    batchId,
    ownerScope,
    providerId,
    providerAccountId,
    item,
    seenAt,
  });

  if (!storedSourceState.ok) {
    return storedSourceState;
  }

  const imported: LibraryImportItemReport = {
    ...baseReport,
    status: storedSourceState.value.alreadyPresent ? "already_present" : "imported",
  };
  const recorded = await recordItemResult({
    events,
    repository,
    batchId,
    batchKind,
    ownerScope,
    providerId,
    providerAccountId,
    report: imported,
    item,
    seenAt,
  });

  if (!recorded.ok) {
    return recorded;
  }

  return ok({
    report:
      storedSourceState.value.alreadyPresent && suppressAlreadyPresentReport
        ? null
        : imported,
    alreadyPresent: storedSourceState.value.alreadyPresent,
  });
}

function itemReportBase({
  scope,
  area,
  item,
}: {
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  item: PlatformLibraryItem;
}): Omit<LibraryImportItemReport, "status"> {
  return {
    scope,
    area,
    sourceRef: item.sourceRef,
    itemKind: item.itemKind,
    sourceEntityKind: sourceEntityKindForPlatformItemKind(item.itemKind),
    label: item.label,
  };
}

async function storeSourceEntityAndLibraryItem({
  materialStore,
  batchId,
  ownerScope,
  providerId,
  providerAccountId,
  item,
  seenAt,
}: {
  materialStore: MaterialStorePort;
  batchId: string;
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  item: PlatformLibraryItem;
  seenAt: string;
}): Promise<Result<{ alreadyPresent: boolean }>> {
  const existingSourceEntity = await materialStore.getSourceEntity({
    sourceRef: item.sourceRef,
  });

  if (!existingSourceEntity.ok) {
    return existingSourceEntity;
  }

  const sourceEntity = sourceEntityForPlatformItem({
    item,
    providerId,
    createdAt: existingSourceEntity.value?.createdAt ?? seenAt,
    observedAt: seenAt,
  });
  const storedEntity = await materialStore.upsertSourceEntity({ entity: sourceEntity });

  if (!storedEntity.ok) {
    return storedEntity;
  }

  const key = {
    ownerScope,
    providerId,
    providerAccountId,
    libraryKind: item.itemKind,
    sourceRef: item.sourceRef,
  };
  const existingLibraryItem = await materialStore.getSourceLibraryItem(key);

  if (!existingLibraryItem.ok) {
    return existingLibraryItem;
  }

  const sourceLibraryItem: SourceLibraryItem = {
    id: sourceLibraryItemId(key),
    ownerScope,
    providerId,
    providerAccountId,
    sourceRef: item.sourceRef,
    sourceKind: sourceEntity.kind,
    libraryKind: item.itemKind,
    label: item.label,
    addedAt: existingLibraryItem.value?.addedAt ?? seenAt,
    firstImportedBatchId: existingLibraryItem.value?.firstImportedBatchId ?? batchId,
    lastSeenBatchId: batchId,
    lastSeenAt: seenAt,
    status: "present",
  };
  const storedLibraryItem = await materialStore.putSourceLibraryItem({
    item: sourceLibraryItem,
  });

  if (!storedLibraryItem.ok) {
    return storedLibraryItem;
  }

  return ok({
    alreadyPresent: existingLibraryItem.value?.status === "present",
  });
}

function sourceEntityForPlatformItem({
  item,
  providerId,
  createdAt,
  observedAt,
}: {
  item: PlatformLibraryItem;
  providerId: string;
  createdAt: string;
  observedAt: string;
}): SourceEntity {
  switch (item.itemKind) {
    case "saved_source_track":
      return sourceTrackForPlatformItem({ item, providerId, createdAt, observedAt });
    case "saved_source_release":
      return sourceReleaseForPlatformItem({ item, providerId, createdAt, observedAt });
    case "saved_source_artist":
      return sourceArtistForPlatformItem({ item, providerId, createdAt, observedAt });
  }
}

function sourceEntityKindForPlatformItemKind(
  itemKind: PlatformLibraryItem["itemKind"],
): LibraryImportItemReport["sourceEntityKind"] {
  switch (itemKind) {
    case "saved_source_track":
      return "track";
    case "saved_source_release":
      return "release";
    case "saved_source_artist":
      return "artist";
  }
}

function sourceTrackForPlatformItem({
  item,
  providerId,
  createdAt,
  observedAt,
}: {
  item: PlatformLibraryItem;
  providerId: string;
  createdAt: string;
  observedAt: string;
}): SourceTrack {
  const hints = item.canonicalHints;

  return {
    kind: "track",
    sourceRef: item.sourceRef,
    providerId,
    label: item.label,
    title: nonEmptyValue(hints?.label) ?? item.label,
    ...(hints?.artistLabels === undefined ? {} : { artistLabels: hints.artistLabels }),
    ...(hints?.artistSourceRefs === undefined ? {} : { artistSourceRefs: hints.artistSourceRefs }),
    ...(hints?.releaseLabel === undefined ? {} : { releaseLabel: hints.releaseLabel }),
    ...(hints?.releaseSourceRef === undefined ? {} : { releaseSourceRef: hints.releaseSourceRef }),
    ...(hints?.durationMs === undefined ? {} : { durationMs: hints.durationMs }),
    ...(hints?.trackPosition === undefined ? {} : { trackPosition: hints.trackPosition }),
    ...(item.sourceRef.url === undefined ? {} : { providerUrl: item.sourceRef.url }),
    ...(hints === undefined ? {} : { providerFacts: { canonicalHints: hints } }),
    createdAt,
    updatedAt: observedAt,
  };
}

function sourceReleaseForPlatformItem({
  item,
  providerId,
  createdAt,
  observedAt,
}: {
  item: PlatformLibraryItem;
  providerId: string;
  createdAt: string;
  observedAt: string;
}): SourceRelease {
  const hints = item.canonicalHints;

  return {
    kind: "release",
    sourceRef: item.sourceRef,
    providerId,
    label: item.label,
    title: nonEmptyValue(hints?.label) ?? item.label,
    ...(hints?.artistLabels === undefined ? {} : { artistLabels: hints.artistLabels }),
    ...(hints?.artistSourceRefs === undefined ? {} : { artistSourceRefs: hints.artistSourceRefs }),
    ...(hints?.releaseDate === undefined ? {} : { releaseDate: hints.releaseDate }),
    ...(hints?.tracklist === undefined ? {} : { tracklist: hints.tracklist }),
    ...(item.sourceRef.url === undefined ? {} : { providerUrl: item.sourceRef.url }),
    ...(hints === undefined ? {} : { providerFacts: { canonicalHints: hints } }),
    createdAt,
    updatedAt: observedAt,
  };
}

function sourceArtistForPlatformItem({
  item,
  providerId,
  createdAt,
  observedAt,
}: {
  item: PlatformLibraryItem;
  providerId: string;
  createdAt: string;
  observedAt: string;
}): SourceArtist {
  const hints = item.canonicalHints;

  return {
    kind: "artist",
    sourceRef: item.sourceRef,
    providerId,
    label: item.label,
    name: nonEmptyValue(hints?.label) ?? item.label,
    ...(item.sourceRef.url === undefined ? {} : { providerUrl: item.sourceRef.url }),
    ...(hints === undefined ? {} : { providerFacts: { canonicalHints: hints } }),
    createdAt,
    updatedAt: observedAt,
  };
}

function sourceLibraryItemId({
  ownerScope,
  providerId,
  providerAccountId,
  libraryKind,
  sourceRef,
}: {
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  libraryKind: PlatformLibraryItem["itemKind"];
  sourceRef: Ref;
}): string {
  return [
    ownerScope,
    providerId,
    providerAccountId,
    libraryKind,
    sourceRef.namespace,
    sourceRef.kind,
    sourceRef.id,
  ].join(":");
}

function nonEmptyValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

async function recordItemResult({
  events,
  repository,
  batchId,
  batchKind,
  ownerScope,
  providerId,
  providerAccountId,
  report,
  item,
  seenAt,
}: {
  events: EventPort;
  repository: LibraryImportRepository;
  batchId: string;
  batchKind: LibraryImportBatchKind;
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  report: LibraryImportItemReport;
  item: PlatformLibraryItem;
  seenAt: string;
}): Promise<Result<void>> {
  const existingProvenance = await repository.getItemProvenance({
    ownerScope,
    providerId,
    providerAccountId,
    scope: report.scope,
    area: report.area,
    sourceRef: report.sourceRef,
  });

  if (!existingProvenance.ok) {
    return existingProvenance;
  }

  const storedProvenance = await repository.upsertItemProvenance({
    provenance: {
      ownerScope,
      providerId,
      providerAccountId,
      scope: report.scope,
      area: report.area,
      sourceRef: report.sourceRef,
      itemKind: report.itemKind,
      sourceEntityKind: report.sourceEntityKind,
      label: report.label,
      ...(item.providerAddedAt === undefined
        ? {}
        : { providerAddedAt: item.providerAddedAt }),
      ...(item.canonicalHints === undefined ? {} : { canonicalHints: item.canonicalHints }),
      firstImportedBatchId: existingProvenance.value?.firstImportedBatchId ?? batchId,
      lastSeenBatchId: batchId,
      lastSeenAt: seenAt,
      status: report.status,
      ...(report.failureCode === undefined ? {} : { failureCode: report.failureCode }),
      ...(report.retryable === undefined ? {} : { retryable: report.retryable }),
    },
  });

  if (!storedProvenance.ok) {
    return storedProvenance;
  }

  const eventType =
    report.status === "failed"
        ? "library_import.item.failed"
        : "library_import.item.imported";
  const recordedEvent = await recordLibraryImportEvent(events, {
    batch: {
      id: batchId,
      batchKind,
      status: "running",
      providerId,
      providerAccountId,
      ownerScope,
      scopes: [report.scope],
      startedAt: seenAt,
      counts: emptyCounts(),
    },
    type: eventType,
    payload: {
      importScope: report.scope,
      libraryArea: report.area,
      sourceRef: report.sourceRef,
      itemKind: report.itemKind,
      sourceEntityKind: report.sourceEntityKind,
      status: report.status,
      failureCode: report.failureCode,
      retryable: report.retryable,
    },
  });

  if (!recordedEvent.ok) {
    return recordedEvent;
  }

  return ok(undefined);
}

function applyItemReportToCounts(
  counts: LibraryImportCounts,
  report: LibraryImportItemReport,
): void {
  switch (report.status) {
    case "imported":
      counts.importedItems += 1;
      break;
    case "already_present":
      counts.alreadyPresentItems += 1;
      break;
    case "failed":
      counts.failedItems += 1;
      break;
    case "absent":
      counts.absentItems += 1;
      break;
  }
}

async function storePlatformLibraryAbsence({
  materialStore,
  repository,
  events,
  batchId,
  batchKind,
  ownerScope,
  providerId,
  providerAccountId,
  item,
  absence,
  recordedAt,
}: {
  materialStore: MaterialStorePort;
  repository: LibraryImportRepository;
  events: EventPort;
  batchId: string;
  batchKind: LibraryImportBatchKind;
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  item: SourceLibraryItem;
  absence: PlatformLibraryAbsenceSummary;
  recordedAt: string;
}): Promise<Result<void>> {
  if (absence.currentBatchId === undefined) {
    return ok(undefined);
  }

  const updatedLibraryItem = await materialStore.putSourceLibraryItem({
    item: {
      ...item,
      status: "absent",
    },
  });

  if (!updatedLibraryItem.ok) {
    return updatedLibraryItem;
  }

  const record: PlatformLibraryAbsence = {
    id: libraryImportAbsenceId(batchId, absence.sourceRef),
    ownerScope,
    providerId,
    providerAccountId,
    scope: absence.scope,
    area: absence.area,
    sourceRef: absence.sourceRef,
    label: absence.label,
    baselineBatchId: absence.baselineBatchId,
    currentBatchId: absence.currentBatchId,
    reason: absence.reason,
    recordedAt,
  };

  const stored = await repository.putAbsence({ absence: record });

  if (!stored.ok) {
    return stored;
  }

  const event = await recordLibraryImportEvent(events, {
    batch: {
      id: batchId,
      batchKind,
      status: "running",
      providerId,
      providerAccountId,
      ownerScope,
      scopes: [absence.scope],
      startedAt: record.recordedAt,
      counts: emptyCounts(),
    },
    type: "library_import.item.not_returned",
    payload: {
      importScope: absence.scope,
      libraryArea: absence.area,
      sourceRef: absence.sourceRef,
      baselineBatchId: absence.baselineBatchId,
      absenceReason: absence.reason,
    },
  });

  if (!event.ok) {
    return event;
  }

  return ok(undefined);
}

function libraryImportAbsenceId(batchId: string, sourceRef: Ref): string {
  return `${batchId}:${sourceRef.namespace}:${sourceRef.kind}:${sourceRef.id}`;
}

async function recordLibraryImportEvent(
  events: EventPort,
  input: {
    batch: LibraryImportBatch;
    type: string;
    payload: Record<string, unknown>;
  },
): Promise<Result<void>> {
  const recorded = await events.record({
    event: {
      sessionId: libraryImportSessionId(input.batch.id),
      actor: "stage",
      type: input.type,
      payload: {
        batchId: input.batch.id,
        batchKind: input.batch.batchKind,
        ownerScope: input.batch.ownerScope,
        providerId: input.batch.providerId,
        providerAccountId: input.batch.providerAccountId,
        ...input.payload,
      },
    },
  });

  if (!recorded.ok) {
    return recorded;
  }

  return ok(undefined);
}

function libraryImportSessionId(batchId: string): string {
  return `library_import:${batchId}`;
}

function providerPreviewAreaToLibraryImportArea(
  area: PlatformLibraryPreviewArea,
  includeUpdateEstimates: boolean,
  estimates: PreviewAreaEstimates | undefined,
): LibraryImportPreviewArea {
  const previewArea: LibraryImportPreviewArea = {
    scope: providerAreaToScope(area.area),
    area: area.area,
    availability: area.availability,
    sourceLibraryEstimates: estimates?.sourceLibraryEstimates ?? emptySourceLibraryEstimates(),
  };

  if (area.count !== undefined) {
    previewArea.count = area.count;
  }

  if (area.samples !== undefined) {
    previewArea.samples = area.samples;
  }

  if (area.issues !== undefined) {
    previewArea.issues = area.issues;
  }

  if (includeUpdateEstimates) {
    previewArea.updateEstimates = estimates?.updateEstimates ?? emptyUpdateEstimates();
  }

  if (estimates?.absences !== undefined) {
    previewArea.absences = estimates.absences;
  }

  return previewArea;
}

function providerReadAreaToReportArea(area: PlatformLibraryReadAreaResult): LibraryImportReportArea {
  const reportArea: LibraryImportReportArea = {
    scope: providerAreaToScope(area.area),
    area: area.area,
    readStatus: area.status,
    count: {
      certainty: "exact",
      value: area.items.length,
    },
  };

  if (area.issues !== undefined) {
    reportArea.issues = area.issues;
  }

  return reportArea;
}

async function resolvePlatformLibraryProvider(
  pluginRegistry: PluginRegistryPort,
  providerId: string,
): Promise<Result<PlatformLibraryProvider>> {
  const provider = await pluginRegistry.getProvider({
    slot: "platform_library",
    providerId,
  });

  if (!provider.ok) {
    return providerNotFound(providerId, provider.error);
  }

  if (!isPlatformLibraryProvider(provider.value)) {
    return providerNotFound(providerId);
  }

  return ok(provider.value);
}

function isPlatformLibraryProvider(provider: unknown): provider is PlatformLibraryProvider {
  return (
    typeof provider === "object" &&
    provider !== null &&
    "id" in provider &&
    typeof provider.id === "string" &&
    "preview" in provider &&
    typeof provider.preview === "function" &&
    "readItems" in provider &&
    typeof provider.readItems === "function"
  );
}

function normalizeScopes(scopes: LibraryImportScope[]): LibraryImportScope[] {
  return [...new Set(scopes)];
}

function scopesToProviderAreas(scopes: LibraryImportScope[]): PlatformLibraryArea[] {
  return scopes.flatMap((scope) => {
    const area = scopeToProviderArea(scope);

    return area === null ? [] : [area];
  });
}

function scopeToProviderArea(scope: LibraryImportScope): PlatformLibraryArea | null {
  switch (scope) {
    case "saved_source_tracks":
      return "saved_source_tracks";
    case "saved_source_releases":
      return "saved_source_releases";
    case "saved_source_artists":
      return "saved_source_artists";
    case "discovery":
      return null;
  }
}

function providerAreaToScope(area: PlatformLibraryArea): LibraryImportScope {
  switch (area) {
    case "saved_source_tracks":
      return "saved_source_tracks";
    case "saved_source_releases":
      return "saved_source_releases";
    case "saved_source_artists":
      return "saved_source_artists";
    case "playlists":
    case "listening_history":
      return "discovery";
  }
}

function isFirstSliceArea(area: PlatformLibraryArea): boolean {
  switch (area) {
    case "saved_source_tracks":
    case "saved_source_releases":
    case "saved_source_artists":
      return true;
    case "playlists":
    case "listening_history":
      return false;
  }
}

function sameRef(
  left: { namespace: string; kind: string; id: string },
  right: { namespace: string; kind: string; id: string },
): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

function refKey(ref: Pick<Ref, "namespace" | "kind" | "id">): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function readHasWarnings(
  areas: PlatformLibraryReadAreaResult[],
  issues: PlatformLibraryReadAreaResult["issues"],
): boolean {
  return (
    issues !== undefined ||
    areas.some((area) => area.status !== "complete" || area.issues !== undefined)
  );
}

function batchToStatus(batch: LibraryImportBatch): LibraryImportStatus {
  const status: LibraryImportStatus = {
    batchId: batch.id,
    batchKind: batch.batchKind,
    ...(batch.mode === undefined ? {} : { mode: batch.mode }),
    status: batch.status,
    providerId: batch.providerId,
    ownerScope: batch.ownerScope,
    scopes: batch.scopes,
    startedAt: batch.startedAt,
    counts: batch.counts,
    progress: defaultProgressForBatch(batch),
  };

  if (batch.completedAt !== undefined) {
    status.completedAt = batch.completedAt;
  }

  if (batch.issues !== undefined) {
    status.issues = batch.issues;
  }

  return status;
}

function reportToStatus(report: LibraryImportReport): LibraryImportStatus {
  const status: LibraryImportStatus = {
    batchId: report.batchId,
    batchKind: report.batchKind,
    ...(report.mode === undefined ? {} : { mode: report.mode }),
    status: report.status,
    providerId: report.providerId,
    ownerScope: report.ownerScope,
    scopes: report.scopes,
    startedAt: report.startedAt,
    counts: report.counts,
    progress: report.progress,
  };

  if (report.completedAt !== undefined) {
    status.completedAt = report.completedAt;
  }

  if (report.issues !== undefined) {
    status.issues = report.issues;
  }

  return status;
}

function batchToReport(batch: LibraryImportBatch): LibraryImportReport {
  const report: LibraryImportReport = {
    batchId: batch.id,
    batchKind: batch.batchKind,
    ...(batch.mode === undefined ? {} : { mode: batch.mode }),
    status: batch.status,
    providerId: batch.providerId,
    ownerScope: batch.ownerScope,
    scopes: batch.scopes,
    startedAt: batch.startedAt,
    counts: batch.counts,
    areas: [],
    items: [],
    progress: defaultProgressForBatch(batch),
  };

  if (batch.completedAt !== undefined) {
    report.completedAt = batch.completedAt;
  }

  if (batch.issues !== undefined) {
    report.issues = batch.issues;
  }

  return report;
}

const defaultPagedImportPageSize = 50;
const maxPagedImportPageSize = 100;

async function continueLibraryImport({
  pluginRegistry,
  materialStore,
  events,
  repository,
  completedReports,
  input,
  clock,
}: {
  pluginRegistry: PluginRegistryPort;
  materialStore: MaterialStorePort;
  events: EventPort;
  repository: LibraryImportRepository;
  completedReports: Map<string, LibraryImportReport>;
  input: LibraryImportContinueInput;
  clock: () => string;
}): Promise<Result<LibraryImportStatus>> {
  const batch = await repository.getBatch({ batchId: input.batchId });

  if (!batch.ok) {
    return batch;
  }

  if (batch.value === null) {
    return batchNotFound(input.batchId);
  }

  if (batch.value.status === "running" && repository.listContinuationStates !== undefined) {
    const provider = await resolvePlatformLibraryProvider(pluginRegistry, batch.value.providerId);

    if (!provider.ok) {
      return provider;
    }

    if (isPagedPlatformLibraryProvider(provider.value)) {
      const processed = await processPagedImportSegment({
        materialStore,
        events,
        repository,
        completedReports,
        provider: provider.value,
        batch: batch.value,
        pageSize: normalizePagedImportPageSize(input.pageSize),
        clock,
      });

      if (!processed.ok) {
        return processed;
      }

      return ok(reportToStatus(processed.value.report));
    }
  }

  return ok(batchToStatus(batch.value));
}

function shouldUsePagedImport({
  input,
  provider,
  repository,
}: {
  input: LibraryImportStartInput | LibraryUpdateStartInput;
  provider: PlatformLibraryProvider;
  repository: LibraryImportRepository;
}): boolean {
  return (
    isPagedPlatformLibraryProvider(provider) &&
    repository.getContinuationState !== undefined &&
    repository.putContinuationState !== undefined &&
    repository.listContinuationStates !== undefined
  );
}

function isPagedPlatformLibraryProvider(
  provider: PlatformLibraryProvider,
): provider is PlatformLibraryProvider & {
  readPage: NonNullable<PlatformLibraryProvider["readPage"]>;
} {
  return typeof provider.readPage === "function";
}

async function startPagedLibraryImport({
  materialStore,
  events,
  repository,
  completedReports,
  provider,
  input,
  batchKind,
  idFactory,
  clock,
}: {
  materialStore: MaterialStorePort;
  events: EventPort;
  repository: LibraryImportRepository;
  completedReports: Map<string, LibraryImportReport>;
  provider: PlatformLibraryProvider & {
    readPage: NonNullable<PlatformLibraryProvider["readPage"]>;
  };
  input: LibraryImportStartInput | LibraryUpdateStartInput;
  batchKind: LibraryImportBatchKind;
  idFactory: () => string;
  clock: () => string;
}): Promise<Result<LibraryImportReport>> {
  const scopes = normalizeScopes(input.scopes);
  const batchId = idFactory();
  const startedAt = clock();
  const ownerScope = input.ownerScope ?? defaultOwnerScope;
  const counts = emptyCounts();
  const updateMode = batchKind === "library_update" ? resolvedUpdateMode(input) : undefined;
  const runningBatch: LibraryImportBatch = {
    id: batchId,
    batchKind,
    ...(updateMode === undefined ? {} : { mode: updateMode }),
    status: "running",
    providerId: input.providerId,
    ownerScope,
    scopes,
    startedAt,
    counts,
  };

  if (input.providerAccountId !== undefined) {
    runningBatch.providerAccountId = input.providerAccountId;
  }

  const storedRunningBatch = await repository.putBatch({ batch: runningBatch });

  if (!storedRunningBatch.ok) {
    return storedRunningBatch;
  }

  const startedEvent = await recordLibraryImportEvent(events, {
    batch: storedRunningBatch.value,
    type: "library_import.batch.started",
    payload: {},
  });

  if (!startedEvent.ok) {
    return markStartedBatchFailed({
      repository,
      batch: storedRunningBatch.value,
      completedAt: clock(),
      result: startedEvent,
    });
  }

  const initializedStates = await initializeContinuationStates({
    repository,
    batch: storedRunningBatch.value,
    scopes,
    sampleLimitPerArea: input.sampleLimitPerArea,
    recordedAt: startedAt,
  });

  if (!initializedStates.ok) {
    return markStartedBatchFailed({
      repository,
      batch: storedRunningBatch.value,
      completedAt: clock(),
      result: initializedStates,
    });
  }

  const processed = await processPagedImportSegment({
    materialStore,
    events,
    repository,
    completedReports,
    provider,
    batch: storedRunningBatch.value,
    pageSize: normalizePagedImportPageSize(input.pageSize),
    clock,
  });

  if (!processed.ok) {
    return processed;
  }

  return ok(processed.value.report);
}

async function initializeContinuationStates({
  repository,
  batch,
  scopes,
  sampleLimitPerArea,
  recordedAt,
}: {
  repository: LibraryImportRepository;
  batch: LibraryImportBatch;
  scopes: LibraryImportScope[];
  sampleLimitPerArea: number | undefined;
  recordedAt: string;
}): Promise<Result<void>> {
  if (repository.putContinuationState === undefined) {
    return ok(undefined);
  }

  for (const scope of scopes) {
    const area = scopeToProviderArea(scope);

    if (area === null) {
      continue;
    }

    const stored = await repository.putContinuationState({
      state: {
        batchId: batch.id,
        batchKind: batch.batchKind,
        ownerScope: batch.ownerScope,
        providerId: batch.providerId,
        providerAccountId: batch.providerAccountId ?? "unknown",
        ...(batch.providerAccountStable === undefined
          ? {}
          : { providerAccountStable: batch.providerAccountStable }),
        scope,
        area,
        status: "pending",
        processedItems: 0,
        ...(sampleLimitPerArea === undefined
          ? {}
          : { sampleLimitRemaining: sampleLimitPerArea }),
        sourceRefsSeen: [],
        createdAt: recordedAt,
        updatedAt: recordedAt,
      },
    });

    if (!stored.ok) {
      return stored;
    }
  }

  return ok(undefined);
}

async function processPagedImportSegment({
  materialStore,
  events,
  repository,
  completedReports,
  provider,
  batch,
  pageSize,
  clock,
}: {
  materialStore: MaterialStorePort;
  events: EventPort;
  repository: LibraryImportRepository;
  completedReports: Map<string, LibraryImportReport>;
  provider: PlatformLibraryProvider & {
    readPage: NonNullable<PlatformLibraryProvider["readPage"]>;
  };
  batch: LibraryImportBatch;
  pageSize: number;
  clock: () => string;
}): Promise<Result<{ batch: LibraryImportBatch; report: LibraryImportReport }>> {
  if (repository.listContinuationStates === undefined || repository.putContinuationState === undefined) {
    return ok({ batch, report: batchToReport(batch) });
  }

  const listedStates = await repository.listContinuationStates({ batchId: batch.id });

  if (!listedStates.ok) {
    return listedStates;
  }

  const nextState = selectNextContinuationState(listedStates.value, batch.scopes);

  if (nextState === null) {
    return ok({ batch, report: batchToReport(batch) });
  }

  const page = await provider.readPage({
    ...(batch.providerAccountId === undefined || batch.providerAccountId === "unknown"
      ? {}
      : { providerAccountId: batch.providerAccountId }),
    area: nextState.area,
    pageSize,
    ...(nextState.sampleLimitRemaining === undefined
      ? {}
      : { sampleLimitRemaining: nextState.sampleLimitRemaining }),
    ...(nextState.providerState === undefined ? {} : { providerState: nextState.providerState }),
  });

  if (!page.ok) {
    return markStartedBatchFailed({
      repository,
      batch,
      completedAt: clock(),
      result: {
        ok: false,
        error: providerReadFailedError(batch.providerId, page.error),
      },
    });
  }

  const seenAt = clock();
  const counts = structuredClone(batch.counts);
  const existingReport = await repository.getReport({ batchId: batch.id });

  if (!existingReport.ok) {
    return existingReport;
  }

  const report = existingReport.value ?? batchToReport(batch);
  const providerAccountId =
    page.value.account?.providerAccountId ?? batch.providerAccountId ?? "unknown";
  const providerAccountStable = page.value.account?.stable ?? batch.providerAccountStable;
  const itemReports: LibraryImportItemReport[] = [];
  const latestUntilSeen = isLatestUntilSeenMode(batch.mode);
  let processedItemsInSegment = 0;
  let stoppedAtExistingSourceRef = false;

  for (const item of page.value.items) {
    const itemReport = await importProviderItem({
      materialStore,
      events,
      repository,
      batchId: batch.id,
      batchKind: batch.batchKind,
      ownerScope: batch.ownerScope,
      providerId: page.value.providerId,
      providerAccountId,
      scope: nextState.scope,
      area: nextState.area,
      item,
      seenAt,
      suppressAlreadyPresentReport: batch.batchKind === "library_update",
    });

    if (!itemReport.ok) {
      return markStartedBatchFailed({
        repository,
        batch,
        completedAt: clock(),
        result: itemReport,
      });
    }

    processedItemsInSegment += 1;

    if (itemReport.value.report !== null) {
      itemReports.push(itemReport.value.report);
      applyItemReportToCounts(counts, itemReport.value.report);
    }

    if (latestUntilSeen && itemReport.value.alreadyPresent) {
      stoppedAtExistingSourceRef = true;
      break;
    }
  }

  const processedPageItems = page.value.items.slice(0, processedItemsInSegment);
  const mergedSourceRefs = mergeSourceRefs(nextState.sourceRefsSeen, processedPageItems);
  const remainingSampleLimit =
    nextState.sampleLimitRemaining === undefined
      ? undefined
      : Math.max(nextState.sampleLimitRemaining - processedItemsInSegment, 0);
  const areaHasMore =
    !stoppedAtExistingSourceRef &&
    page.value.hasMore &&
    (remainingSampleLimit === undefined || remainingSampleLimit > 0);
  const updatedState: LibraryImportContinuationState = {
    batchId: nextState.batchId,
    batchKind: nextState.batchKind,
    ownerScope: nextState.ownerScope,
    providerId: page.value.providerId,
    providerAccountId,
    ...(providerAccountStable === undefined ? {} : { providerAccountStable }),
    scope: nextState.scope,
    area: nextState.area,
    status: areaHasMore ? "running" : "complete",
    processedItems: nextState.processedItems + processedItemsInSegment,
    sourceRefsSeen: mergedSourceRefs,
    createdAt: nextState.createdAt,
    updatedAt: seenAt,
  };

  if (page.value.count !== undefined && page.value.count.certainty !== "unknown") {
    updatedState.expectedItems = page.value.count.value;
  } else if (nextState.expectedItems !== undefined) {
    updatedState.expectedItems = nextState.expectedItems;
  }

  if (remainingSampleLimit !== undefined) {
    updatedState.sampleLimitRemaining = remainingSampleLimit;
  }

  if (areaHasMore && page.value.providerState !== undefined) {
    updatedState.providerState = page.value.providerState;
  }

  if (page.value.issues !== undefined) {
    updatedState.issues = page.value.issues;
  } else if (nextState.issues !== undefined) {
    updatedState.issues = nextState.issues;
  }
  const storedState = await repository.putContinuationState({ state: updatedState });

  if (!storedState.ok) {
    return storedState;
  }

  const updatedStates = listedStates.value.map((state) =>
    state.batchId === updatedState.batchId &&
      state.scope === updatedState.scope &&
      state.area === updatedState.area
      ? updatedState
      : state,
  );
  const segmentAbsences: PlatformLibraryAbsenceSummary[] = [];
  if (!areaHasMore && page.value.status === "complete" && !latestUntilSeen) {
    const storedSnapshot = await repository.putAreaSnapshot({
      snapshot: {
        batchId: batch.id,
        ownerScope: batch.ownerScope,
        providerId: page.value.providerId,
        providerAccountId,
        ...(providerAccountStable === undefined ? {} : { providerAccountStable }),
        scope: nextState.scope,
        area: nextState.area,
        status: "complete",
        complete: true,
        sourceRefs: mergedSourceRefs,
        itemCount: mergedSourceRefs.length,
        recordedAt: seenAt,
      },
    });

    if (!storedSnapshot.ok) {
      return storedSnapshot;
    }

    if (batch.batchKind === "library_update") {
      const areaAbsences = await deriveSourceLibraryAbsences({
        materialStore,
        ownerScope: batch.ownerScope,
        providerId: page.value.providerId,
        providerAccountId,
        area: nextState.area,
        currentSourceRefs: mergedSourceRefs,
        currentBatchId: batch.id,
      });

      if (!areaAbsences.ok) {
        return areaAbsences;
      }

      for (const { absence, item } of areaAbsences.value) {
        const storedAbsence = await storePlatformLibraryAbsence({
          materialStore,
          repository,
          events,
          batchId: batch.id,
          batchKind: batch.batchKind,
          ownerScope: batch.ownerScope,
          providerId: page.value.providerId,
          providerAccountId,
          item,
          absence,
          recordedAt: seenAt,
        });

        if (!storedAbsence.ok) {
          return storedAbsence;
        }

        segmentAbsences.push(absence);
        counts.absentItems += 1;
      }
    }
  }

  const terminal = updatedStates.every(
    (state) => state.status !== "pending" && state.status !== "running",
  );
  const nextBatch: LibraryImportBatch = {
    ...batch,
    providerId: page.value.providerId,
    providerAccountId,
    counts,
    ...(providerAccountStable === undefined ? {} : { providerAccountStable }),
    status: terminal
      ? hasContinuationWarnings(updatedStates, counts, page.value.issues, report.issues)
        ? "completed_with_warnings"
        : "completed"
      : "running",
    ...(terminal ? { completedAt: seenAt } : {}),
  };

  const storedBatch = await repository.putBatch({ batch: nextBatch });

  if (!storedBatch.ok) {
    return storedBatch;
  }

  report.batchId = storedBatch.value.id;
  report.batchKind = storedBatch.value.batchKind;
  report.status = storedBatch.value.status;
  report.providerId = page.value.providerId;
  report.ownerScope = storedBatch.value.ownerScope;
  report.scopes = storedBatch.value.scopes;
  report.startedAt = storedBatch.value.startedAt;
  report.counts = counts;
  report.items = report.items.concat(itemReports);
  const nextReportArea: LibraryImportReportArea = {
    scope: nextState.scope,
    area: nextState.area,
    readStatus: areaHasMore ? "partial" : "complete",
    count: reportCountForContinuationState(updatedState),
  };

  if (page.value.issues !== undefined) {
    nextReportArea.issues = page.value.issues;
  }

  report.areas = upsertReportArea(report.areas, nextReportArea);
  report.progress = progressFromContinuationStates(updatedStates, storedBatch.value.status);

  if (segmentAbsences.length > 0) {
    report.absences = (report.absences ?? []).concat(segmentAbsences);
  }

  if (page.value.account !== undefined) {
    report.account = page.value.account;
  }

  if (storedBatch.value.completedAt !== undefined) {
    report.completedAt = storedBatch.value.completedAt;
  }

  const storedReport = await repository.putReport({ report });

  if (!storedReport.ok) {
    return storedReport;
  }

  if (terminal) {
    const completedEvent = await recordLibraryImportEvent(events, {
      batch: storedBatch.value,
      type: "library_import.batch.completed",
      payload: {
        status: storedBatch.value.status,
        counts: storedBatch.value.counts,
      },
    });

    if (!completedEvent.ok) {
      return completedEvent;
    }

    completedReports.set(storedReport.value.batchId, structuredClone(storedReport.value));
  }

  return ok({
    batch: storedBatch.value,
    report: storedReport.value,
  });
}

function selectNextContinuationState(
  states: LibraryImportContinuationState[],
  scopes: LibraryImportScope[],
): LibraryImportContinuationState | null {
  const ranked = [...states]
    .filter((state) => state.status === "running" || state.status === "pending")
    .sort((left, right) => {
      const leftRank = left.status === "running" ? 0 : 1;
      const rightRank = right.status === "running" ? 0 : 1;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return scopes.indexOf(left.scope) - scopes.indexOf(right.scope);
    });

  return ranked[0] ?? null;
}

function mergeSourceRefs(
  existing: Ref[],
  items: PlatformLibraryItem[],
): Ref[] {
  const merged = new Map(existing.map((ref) => [refKey(ref), ref]));

  for (const item of items) {
    merged.set(refKey(item.sourceRef), item.sourceRef);
  }

  return [...merged.values()];
}

function upsertReportArea(
  areas: LibraryImportReportArea[],
  nextArea: LibraryImportReportArea,
): LibraryImportReportArea[] {
  const filtered = areas.filter(
    (area) => !(area.scope === nextArea.scope && area.area === nextArea.area),
  );

  filtered.push(nextArea);

  return filtered;
}

function reportCountForContinuationState(
  state: LibraryImportContinuationState,
): PlatformLibraryCount {
  if (state.expectedItems !== undefined) {
    return {
      certainty: "exact",
      value: state.expectedItems,
    };
  }

  return {
    certainty: "at_least",
    value: state.processedItems,
  };
}

const defaultListItemsLimit = 20;
const maxListItemsLimit = 200;

function normalizeItemLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) {
    return defaultListItemsLimit;
  }

  return Math.min(Math.floor(limit), maxListItemsLimit);
}

function normalizeItemCursor(cursor: string | undefined, totalItems: number): number {
  if (cursor === undefined) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.min(parsed, totalItems);
}

function progressFromContinuationStates(
  states: LibraryImportContinuationState[],
  batchStatus: LibraryImportBatch["status"],
): LibraryImportProgress {
  const hasMore = states.some((state) => state.status === "pending" || state.status === "running");

  return {
    processedItems: states.reduce((sum, state) => sum + state.processedItems, 0),
    areas: states.map((state) => ({
      scope: state.scope,
      area: state.area,
      processedItems: state.processedItems,
      ...(state.expectedItems === undefined
        ? {}
        : {
            count: {
              certainty: "exact" as const,
              value: state.expectedItems,
            },
          }),
    })),
    hasMore,
    nextAction: hasMore
      ? "continue"
      : batchStatus === "completed" || batchStatus === "completed_with_warnings"
        ? "summary"
        : "none",
  };
}

function hasContinuationWarnings(
  states: LibraryImportContinuationState[],
  counts: LibraryImportCounts,
  pageIssues: PlatformLibraryReadAreaResult["issues"] | undefined,
  reportIssues: PlatformLibraryReadAreaResult["issues"] | undefined,
): boolean {
  return (
    counts.failedItems > 0 ||
    counts.absentItems > 0 ||
    pageIssues !== undefined ||
    reportIssues !== undefined ||
    states.some((state) => state.status !== "complete" || state.issues !== undefined)
  );
}

function defaultProgressForBatch(batch: LibraryImportBatch): LibraryImportProgress {
  return {
    processedItems: countProcessedItems(batch.counts),
    areas: [],
    hasMore: batch.status === "running" || batch.status === "pending",
    nextAction:
      batch.status === "running" || batch.status === "pending"
        ? "continue"
        : batch.status === "completed" || batch.status === "completed_with_warnings"
          ? "summary"
          : "none",
  };
}

function countProcessedItems(counts: LibraryImportCounts): number {
  return (
    counts.importedItems +
    counts.alreadyPresentItems +
    counts.failedItems +
    counts.absentItems
  );
}

function emptySourceLibraryEstimates(): LibraryImportSourceLibraryEstimateCounts {
  return {
    alreadyPresent: 0,
    wouldImport: 0,
  };
}

function emptyUpdateEstimates(): LibraryImportUpdateEstimateCounts {
  return {
    newlyObserved: 0,
    alreadyPresent: 0,
    noLongerReturned: 0,
  };
}

function emptyCounts(): LibraryImportCounts {
  return {
    importedItems: 0,
    alreadyPresentItems: 0,
    failedItems: 0,
    absentItems: 0,
  };
}

function scopeUnsupported(
  scope: LibraryImportScope,
  batchKind: LibraryImportBatchKind,
): Result<never> {
  return fail({
    code: "library_import.scope_unsupported",
    message: `Library Import ${batchKind} cannot start with scope '${scope}'.`,
    module: "library_import",
    retryable: false,
  });
}

function providerNotFound(providerId: string, cause?: unknown): Result<never> {
  return fail({
    code: "library_import.provider_not_found",
    message: `No platform library provider registered with id '${providerId}'.`,
    module: "library_import",
    retryable: false,
    ...(cause === undefined ? {} : { cause }),
  });
}

function providerReadFailed(providerId: string, cause: unknown): Result<never> {
  return fail(providerReadFailedError(providerId, cause));
}

function providerReadFailedError(providerId: string, cause: unknown): StageError {
  return {
    code: "library_import.provider_read_failed",
    message: `Platform library provider '${providerId}' failed to read library facts.`,
    module: "library_import",
    retryable: true,
    cause,
  };
}

function batchNotFound(batchId: string): Result<never> {
  return fail({
    code: "library_import.batch_not_found",
    message: `Library Import batch '${batchId}' was not found.`,
    module: "library_import",
    retryable: false,
  });
}

function createDefaultIdFactory(prefix: string): () => string {
  return () => `${prefix}-${Date.now().toString(36)}-${randomUUID()}`;
}

function normalizePagedImportPageSize(pageSize: number | undefined): number {
  if (pageSize === undefined) {
    return defaultPagedImportPageSize;
  }

  return Math.min(pageSize, maxPagedImportPageSize);
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
