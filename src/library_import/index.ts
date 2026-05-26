import type {
  CanonicalKind,
  CanonicalRecord,
  CanonicalProvisionalHintDraft,
  CanonicalRelationDraft,
  CollectionItem,
  LibraryImportAreaSnapshot,
  LibraryImportBatch,
  LibraryImportBatchKind,
  LibraryImportCollectionEstimateCounts,
  LibraryImportCounts,
  LibraryImportCanonicalEstimateCounts,
  LibraryImportPreview,
  LibraryImportPreviewArea,
  LibraryImportPreviewInput,
  LibraryImportReport,
  LibraryImportReportArea,
  LibraryImportItemReport,
  LibraryImportScope,
  LibraryImportStatus,
  LibraryImportUpdateEstimateCounts,
  PlatformLibraryArea,
  PlatformLibraryAbsence,
  PlatformLibraryAbsenceSummary,
  PlatformLibraryItem,
  PlatformLibraryPreviewArea,
  PlatformLibraryProvider,
  PlatformLibraryReadAreaResult,
  Ref,
  Result,
  StageError,
} from "../contracts/index.js";
import type {
  CanonicalStorePort,
  CollectionPort,
  EventPort,
  LibraryImportPort,
  LibraryImportRepository,
  PluginRegistryPort,
} from "../ports/index.js";

type LibraryImportServiceOptions = {
  pluginRegistry: PluginRegistryPort;
  canonicalStore: CanonicalStorePort;
  collection: CollectionPort;
  events: EventPort;
  repository: LibraryImportRepository;
  idFactory?: () => string;
  clock?: () => string;
};

const defaultOwnerScope = "local_profile:default";

export function createLibraryImportService({
  pluginRegistry,
  canonicalStore,
  collection,
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
        canonicalStore,
        collection,
        repository,
        input,
        includeUpdateEstimates: false,
      });
    },

    startImport(input) {
      return startLibraryImport({
        pluginRegistry,
        canonicalStore,
        collection,
        events,
        repository,
        completedReports,
        input,
        batchKind: "initial_import",
        idFactory,
        clock,
      });
    },

    previewUpdate(input) {
      return previewLibraryImport({
        pluginRegistry,
        canonicalStore,
        collection,
        repository,
        input,
        includeUpdateEstimates: true,
      });
    },

    startUpdate(input) {
      return startLibraryImport({
        pluginRegistry,
        canonicalStore,
        collection,
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
    },
  };
}

async function previewLibraryImport({
  pluginRegistry,
  canonicalStore,
  collection,
  repository,
  input,
  includeUpdateEstimates,
}: {
  pluginRegistry: PluginRegistryPort;
  canonicalStore: CanonicalStorePort;
  collection: CollectionPort;
  repository: LibraryImportRepository;
  input: LibraryImportPreviewInput;
  includeUpdateEstimates: boolean;
}): Promise<Result<LibraryImportPreview>> {
  const provider = await resolvePlatformLibraryProvider(pluginRegistry, input.providerId);

  if (!provider.ok) {
    return provider;
  }

  const scopes = normalizeScopes(input.scopes);
  const areas = scopesToProviderAreas(scopes);
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
    canonicalStore,
    collection,
    repository,
    ownerScope,
    providerAccountId,
    providerAccountStable,
    requestedAreas: areas,
    previewAreas: preview.value.areas,
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

type PreviewAreaEstimates = {
  canonicalEstimates: LibraryImportCanonicalEstimateCounts;
  collectionEstimates: LibraryImportCollectionEstimateCounts;
  updateEstimates?: LibraryImportUpdateEstimateCounts;
  absences?: PlatformLibraryAbsenceSummary[];
};

type SavedMembershipCache = Map<PlatformLibraryItem["targetKind"], Set<string>>;

async function estimateReadablePreviewAreas({
  provider,
  canonicalStore,
  collection,
  repository,
  ownerScope,
  providerAccountId,
  providerAccountStable,
  requestedAreas,
  previewAreas,
  includeUpdateEstimates,
}: {
  provider: PlatformLibraryProvider;
  canonicalStore: CanonicalStorePort;
  collection: CollectionPort;
  repository: LibraryImportRepository;
  ownerScope: string;
  providerAccountId: string | undefined;
  providerAccountStable: boolean | undefined;
  requestedAreas: PlatformLibraryArea[];
  previewAreas: PlatformLibraryPreviewArea[];
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
  });

  if (!read.ok) {
    return providerReadFailed(provider.id, read.error);
  }

  const estimates = new Map<PlatformLibraryArea, PreviewAreaEstimates>();
  const savedItemsByKind = new Map<PlatformLibraryItem["targetKind"], CollectionItem[]>();
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
        canonicalStore,
        collection,
        ownerScope,
        savedItemsByKind,
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
  | "would_add"
  | "would_add_after_provisional"
  | "unresolved";

async function estimatePreviewItem({
  canonicalStore,
  collection,
  ownerScope,
  savedItemsByKind,
  item,
}: {
  canonicalStore: CanonicalStorePort;
  collection: CollectionPort;
  ownerScope: string;
  savedItemsByKind: Map<PlatformLibraryItem["targetKind"], CollectionItem[]>;
  item: PlatformLibraryItem;
}): Promise<Result<PreviewItemEstimate>> {
  if (!canUseProviderItemForCanonicalBinding(item)) {
    return ok("unresolved");
  }

  const canonical = await canonicalStore.resolveSourceRef({ ref: item.sourceRef });

  if (!canonical.ok) {
    return canonical;
  }

  if (canonical.value === null) {
    return ok("would_add_after_provisional");
  }

  const canonicalRecord = canonical.value;
  const savedItems = await getSavedItemsForTargetKind({
    collection,
    ownerScope,
    savedItemsByKind,
    targetKind: item.targetKind,
  });

  if (!savedItems.ok) {
    return savedItems;
  }

  return ok(
    savedItems.value.some((savedItem) => sameRef(savedItem.canonicalRef, canonicalRecord.ref))
      ? "already_present"
      : "would_add",
  );
}

async function getSavedItemsForTargetKind({
  collection,
  ownerScope,
  savedItemsByKind,
  targetKind,
}: {
  collection: CollectionPort;
  ownerScope: string;
  savedItemsByKind: Map<PlatformLibraryItem["targetKind"], CollectionItem[]>;
  targetKind: PlatformLibraryItem["targetKind"];
}): Promise<Result<CollectionItem[]>> {
  const cached = savedItemsByKind.get(targetKind);

  if (cached !== undefined) {
    return ok(cached);
  }

  const items = await collection.listItems({
    ownerScope,
    collectionKind: targetKind,
    relationKind: "saved",
  });

  if (!items.ok) {
    return items;
  }

  savedItemsByKind.set(targetKind, items.value);

  return ok(items.value);
}

function incrementPreviewAreaEstimates(
  estimates: PreviewAreaEstimates,
  itemEstimate: PreviewItemEstimate,
): void {
  switch (itemEstimate) {
    case "already_present":
      estimates.canonicalEstimates.alreadyBound += 1;
      estimates.collectionEstimates.alreadyPresent += 1;
      return;
    case "would_add":
      estimates.canonicalEstimates.alreadyBound += 1;
      estimates.collectionEstimates.wouldAdd += 1;
      return;
    case "would_add_after_provisional":
      estimates.canonicalEstimates.wouldCreateProvisional += 1;
      estimates.collectionEstimates.wouldAddAfterProvisional += 1;
      return;
    case "unresolved":
      estimates.canonicalEstimates.unresolved += 1;
      estimates.collectionEstimates.skipped += 1;
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
  if (itemEstimate === "unresolved") {
    estimates.failedOrSkipped += 1;

    return;
  }

  if (baselineSourceRefKeys !== null) {
    if (baselineSourceRefKeys.has(refKey(sourceRef))) {
      estimates.alreadyPresent += 1;
    } else {
      estimates.wouldAdd += 1;
    }

    return;
  }

  switch (itemEstimate) {
    case "already_present":
      estimates.alreadyPresent += 1;
      return;
    case "would_add":
    case "would_add_after_provisional":
      estimates.wouldAdd += 1;
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

    if (provenance.value?.canonicalRef !== undefined) {
      absence.canonicalRef = provenance.value.canonicalRef;
    }

    if (currentBatchId !== undefined) {
      absence.currentBatchId = currentBatchId;
    }

    absences.push(absence);
  }

  return ok(absences);
}

function emptyPreviewAreaEstimates(): PreviewAreaEstimates {
  return {
    canonicalEstimates: emptyCanonicalEstimates(),
    collectionEstimates: emptyCollectionEstimates(),
  };
}

async function startLibraryImport({
  pluginRegistry,
  canonicalStore,
  collection,
  events,
  repository,
  completedReports,
  input,
  batchKind,
  idFactory,
  clock,
}: {
  pluginRegistry: PluginRegistryPort;
  canonicalStore: CanonicalStorePort;
  collection: CollectionPort;
  events: EventPort;
  repository: LibraryImportRepository;
  completedReports: Map<string, LibraryImportReport>;
  input: LibraryImportPreviewInput;
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

  const batchId = idFactory();
  const startedAt = clock();
  const ownerScope = input.ownerScope ?? defaultOwnerScope;
  const counts = emptyCounts();
  const runningBatch: LibraryImportBatch = {
    id: batchId,
    batchKind,
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
  const savedMembershipsByKind: SavedMembershipCache = new Map();
  let completedWithWarnings = readHasWarnings(read.value.areas, read.value.issues);

  const initializedCollections = await collection.initializeOwnerCollections({ ownerScope });

  if (!initializedCollections.ok) {
    return markStartedBatchFailed({
      repository,
      batch: currentBatch,
      completedAt: clock(),
      result: initializedCollections,
    });
  }

  for (const area of read.value.areas) {
    const scope = providerAreaToScope(area.area);

    for (const item of area.items) {
      const itemReport = await importProviderItem({
        canonicalStore,
        collection,
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
        savedMembershipsByKind,
      });

      if (!itemReport.ok) {
        return markStartedBatchFailed({
          repository,
          batch: currentBatch,
          completedAt: clock(),
          result: itemReport,
        });
      }

      itemReports.push(itemReport.value);
      applyItemReportToCounts(counts, itemReport.value);

      if (itemReport.value.status === "skipped" || itemReport.value.status === "failed") {
        completedWithWarnings = true;
      }
    }

    if (batchKind === "library_update" && area.status === "complete") {
      const areaAbsences = await previewAbsencesForArea({
        repository,
        ownerScope,
        providerId: read.value.providerId,
        providerAccountId,
        providerAccountStable,
        scope,
        area: area.area,
        currentItems: area.items,
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

      for (const absence of areaAbsences.value) {
        const storedAbsence = await storePlatformLibraryAbsence({
          repository,
          events,
          batchId,
          batchKind,
          ownerScope,
          providerId: read.value.providerId,
          providerAccountId,
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

    if (area.status === "complete") {
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
  }

  const batch: LibraryImportBatch = {
    id: batchId,
    batchKind,
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
  canonicalStore,
  collection,
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
  savedMembershipsByKind,
}: {
  canonicalStore: CanonicalStorePort;
  collection: CollectionPort;
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
  savedMembershipsByKind: SavedMembershipCache;
}): Promise<Result<LibraryImportItemReport>> {
  const baseReport = itemReportBase({ scope, area, item });

  if (!canUseProviderItemForCanonicalBinding(item)) {
    const skipped: LibraryImportItemReport = {
      ...baseReport,
      status: "skipped",
      canonicalOutcome: "unresolved",
      collectionOutcome: "skipped",
      skipReason: "insufficient_metadata",
    };
    const recorded = await recordItemResult({
      events,
      repository,
      batchId,
      batchKind,
      ownerScope,
      providerId,
      providerAccountId,
      report: skipped,
      item,
      seenAt,
    });

    if (!recorded.ok) {
      return recorded;
    }

    return ok(skipped);
  }

  const resolved = await canonicalStore.resolveSourceRef({ ref: item.sourceRef });

  if (!resolved.ok) {
    return resolved;
  }

  const canonicalResult =
    resolved.value === null
      ? await createAndBindCanonicalRecord(canonicalStore, item)
      : ok({
          record: resolved.value,
          outcome: "reused" as const,
        });

  if (!canonicalResult.ok) {
    return canonicalResult;
  }

  const relationDrafts = await provisionalRelationDraftsForItem({
    canonicalStore,
    item,
  });

  if (!relationDrafts.ok) {
    return fail(relationDrafts.error);
  }

  if (relationDrafts.value.length > 0) {
    const relationResult = await canonicalStore.recordProvisionalRelations({
      subjectRef: canonicalResult.value.record.ref,
      sourceRef: item.sourceRef,
      providerId,
      batchId,
      relations: relationDrafts.value,
    });

    if (!relationResult.ok) {
      return relationResult;
    }
  }

  const provisionalHints = provisionalHintsForItem(item);

  if (
    canonicalResult.value.record.status === "provisional" &&
    provisionalHints.length > 0
  ) {
    const hintResult = await canonicalStore.recordProvisionalHints({
      subjectRef: canonicalResult.value.record.ref,
      sourceRef: item.sourceRef,
      providerId,
      batchId,
      hints: provisionalHints,
    });

    if (!hintResult.ok) {
      return hintResult;
    }
  }

  const alreadyPresent = await isSavedCollectionItemPresent({
    collection,
    ownerScope,
    targetKind: item.targetKind,
    canonicalRef: canonicalResult.value.record.ref,
    savedMembershipsByKind,
  });

  if (!alreadyPresent.ok) {
    return alreadyPresent;
  }

  const collectionItem = await collection.addItemToSystemCollection({
    ownerScope,
    relationKind: "saved",
    canonicalRef: canonicalResult.value.record.ref,
    label: item.label,
  });

  if (!collectionItem.ok) {
    return collectionItem;
  }

  rememberSavedMembership({
    savedMembershipsByKind,
    targetKind: item.targetKind,
    canonicalRef: collectionItem.value.canonicalRef,
  });

  const imported: LibraryImportItemReport = {
    ...baseReport,
    status: alreadyPresent.value ? "already_present" : "imported",
    canonicalRef: canonicalResult.value.record.ref,
    canonicalOutcome: canonicalResult.value.outcome,
    collectionItemId: collectionItem.value.id,
    collectionOutcome: alreadyPresent.value ? "already_present" : "added",
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

  return ok(imported);
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
    targetKind: item.targetKind,
    label: item.label,
  };
}

async function createAndBindCanonicalRecord(
  canonicalStore: CanonicalStorePort,
  item: PlatformLibraryItem,
): Promise<Result<{ record: CanonicalRecord; outcome: "created_provisional" }>> {
  const created = await canonicalStore.createProvisional({
    kind: item.targetKind,
    label: item.label,
    evidence: [item.sourceRef],
  });

  if (!created.ok) {
    return created;
  }

  const attached = await canonicalStore.attachSourceRef({
    canonicalRef: created.value.ref,
    sourceRef: item.sourceRef,
  });

  if (!attached.ok) {
    return attached;
  }

  return ok({
    record: attached.value,
    outcome: "created_provisional",
  });
}

async function provisionalRelationDraftsForItem({
  canonicalStore,
  item,
}: {
  canonicalStore: CanonicalStorePort;
  item: PlatformLibraryItem;
}): Promise<Result<CanonicalRelationDraft[]>> {
  const hints = item.canonicalHints;

  if (hints === undefined) {
    return ok([]);
  }

  const relations: CanonicalRelationDraft[] = [];

  for (const artist of artistHintsForItem(item)) {
    const linkedArtist =
      artist.sourceRef === undefined
        ? ok(null)
        : await resolveOrCreateLinkedCanonicalRecord({
            canonicalStore,
            kind: "artist",
            label: artist.label,
            sourceRef: artist.sourceRef,
    });

    if (!linkedArtist.ok) {
      return fail(linkedArtist.error);
    }

    relations.push({
      predicate: "performed_by",
      objectKind: "artist",
      ...(linkedArtist.value === null ? {} : { objectRef: linkedArtist.value.ref }),
      objectLabel: artist.label,
    });
  }

  const release = releaseHintForItem(item);

  if (release !== undefined) {
    const linkedRelease =
      release.sourceRef === undefined
        ? ok(null)
        : await resolveOrCreateLinkedCanonicalRecord({
            canonicalStore,
            kind: "release",
            label: release.label,
            sourceRef: release.sourceRef,
          });

    if (!linkedRelease.ok) {
      return fail(linkedRelease.error);
    }

    relations.push({
      predicate: "appears_on_release",
      objectKind: "release",
      ...(linkedRelease.value === null ? {} : { objectRef: linkedRelease.value.ref }),
      objectLabel: release.label,
    });
  }

  if (hints.durationMs !== undefined) {
    relations.push({
      predicate: "has_duration_ms",
      objectKind: "duration_ms",
      objectValue: hints.durationMs,
    });
  }

  return ok(relations);
}

function provisionalHintsForItem(item: PlatformLibraryItem): CanonicalProvisionalHintDraft[] {
  const hints = item.canonicalHints;

  if (item.targetKind !== "recording" || hints === undefined) {
    return [];
  }

  const title = nonEmptyValue(hints.label);
  const facts: CanonicalProvisionalHintDraft["facts"] = {
    ...(title === undefined ? {} : { title }),
    ...(hints.artistLabels === undefined || hints.artistLabels.length === 0
      ? {}
      : { artistLabels: hints.artistLabels }),
    ...(hints.releaseLabel === undefined ? {} : { releaseLabel: hints.releaseLabel }),
    ...(hints.releaseSourceRef === undefined ? {} : { releaseSourceRef: hints.releaseSourceRef }),
    ...(hints.durationMs === undefined ? {} : { durationMs: hints.durationMs }),
    ...(hints.trackPosition === undefined ? {} : { trackPosition: hints.trackPosition }),
  };

  if (Object.keys(facts).length === 0) {
    return [];
  }

  return [
    {
      kind: "source_recording_context",
      facts,
    },
  ];
}

type LinkedCanonicalHint = {
  label: string;
  sourceRef?: Ref;
};

function artistHintsForItem(item: PlatformLibraryItem): LinkedCanonicalHint[] {
  const hints = item.canonicalHints;

  if (hints === undefined) {
    return [];
  }

  const labels = hints.artistLabels ?? [];
  const sourceRefs = hints.artistSourceRefs ?? [];
  const artists: LinkedCanonicalHint[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < Math.max(labels.length, sourceRefs.length); index += 1) {
    const sourceRef = sourceRefs[index];
    const label = linkedHintLabel(labels[index], sourceRef);

    if (label === undefined) {
      continue;
    }

    const key = sourceRef === undefined ? `label:${label}` : `ref:${sourceRef.namespace}:${sourceRef.kind}:${sourceRef.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    artists.push({
      label,
      ...(sourceRef === undefined ? {} : { sourceRef }),
    });
  }

  return artists;
}

function releaseHintForItem(item: PlatformLibraryItem): LinkedCanonicalHint | undefined {
  const hints = item.canonicalHints;

  if (hints === undefined) {
    return undefined;
  }

  const label = linkedHintLabel(hints.releaseLabel, hints.releaseSourceRef);

  return label === undefined
    ? undefined
    : {
        label,
        ...(hints.releaseSourceRef === undefined ? {} : { sourceRef: hints.releaseSourceRef }),
      };
}

async function resolveOrCreateLinkedCanonicalRecord({
  canonicalStore,
  kind,
  label,
  sourceRef,
}: {
  canonicalStore: CanonicalStorePort;
  kind: CanonicalKind;
  label: string;
  sourceRef: Ref;
}): Promise<Result<CanonicalRecord>> {
  const resolved = await canonicalStore.resolveSourceRef({ ref: sourceRef });

  if (!resolved.ok) {
    return resolved;
  }

  if (resolved.value !== null) {
    return ok(resolved.value);
  }

  const created = await canonicalStore.createProvisional({
    kind,
    label,
    evidence: [sourceRef],
  });

  if (!created.ok) {
    return created;
  }

  return created;
}

function linkedHintLabel(label: string | undefined, sourceRef: Ref | undefined): string | undefined {
  return nonEmptyValue(label) ?? nonEmptyValue(sourceRef?.label) ?? nonEmptyValue(sourceRef?.id);
}

function nonEmptyValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

async function isSavedCollectionItemPresent({
  collection,
  ownerScope,
  targetKind,
  canonicalRef,
  savedMembershipsByKind,
}: {
  collection: CollectionPort;
  ownerScope: string;
  targetKind: PlatformLibraryItem["targetKind"];
  canonicalRef: Ref;
  savedMembershipsByKind: SavedMembershipCache;
}): Promise<Result<boolean>> {
  const savedRefKeys = await savedMembershipKeysForKind({
    collection,
    ownerScope,
    targetKind,
    savedMembershipsByKind,
  });

  if (!savedRefKeys.ok) {
    return savedRefKeys;
  }

  return ok(savedRefKeys.value.has(refKey(canonicalRef)));
}

async function savedMembershipKeysForKind({
  collection,
  ownerScope,
  targetKind,
  savedMembershipsByKind,
}: {
  collection: CollectionPort;
  ownerScope: string;
  targetKind: PlatformLibraryItem["targetKind"];
  savedMembershipsByKind: SavedMembershipCache;
}): Promise<Result<Set<string>>> {
  const cached = savedMembershipsByKind.get(targetKind);

  if (cached !== undefined) {
    return ok(cached);
  }

  const savedItems = await collection.listItems({
    ownerScope,
    collectionKind: targetKind,
    relationKind: "saved",
  });

  if (!savedItems.ok) {
    return savedItems;
  }

  const savedRefKeys = new Set(savedItems.value.map((item) => refKey(item.canonicalRef)));
  savedMembershipsByKind.set(targetKind, savedRefKeys);

  return ok(savedRefKeys);
}

function rememberSavedMembership({
  savedMembershipsByKind,
  targetKind,
  canonicalRef,
}: {
  savedMembershipsByKind: SavedMembershipCache;
  targetKind: PlatformLibraryItem["targetKind"];
  canonicalRef: Ref;
}): void {
  const savedRefKeys = savedMembershipsByKind.get(targetKind);

  if (savedRefKeys !== undefined) {
    savedRefKeys.add(refKey(canonicalRef));
  }
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
      targetKind: report.targetKind,
      label: report.label,
      ...(item.addedAt === undefined ? {} : { addedAt: item.addedAt }),
      ...(item.canonicalHints === undefined ? {} : { canonicalHints: item.canonicalHints }),
      ...(report.canonicalRef === undefined ? {} : { canonicalRef: report.canonicalRef }),
      firstImportedBatchId: existingProvenance.value?.firstImportedBatchId ?? batchId,
      lastSeenBatchId: batchId,
      lastSeenAt: seenAt,
      status: report.status,
      ...(report.skipReason === undefined ? {} : { skipReason: report.skipReason }),
      ...(report.failureCode === undefined ? {} : { failureCode: report.failureCode }),
      ...(report.retryable === undefined ? {} : { retryable: report.retryable }),
    },
  });

  if (!storedProvenance.ok) {
    return storedProvenance;
  }

  const eventType =
    report.status === "skipped"
      ? "library_import.item.skipped"
      : report.status === "failed"
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
      targetKind: report.targetKind,
      status: report.status,
      canonicalRef: report.canonicalRef,
      collectionItemId: report.collectionItemId,
      canonicalOutcome: report.canonicalOutcome,
      collectionOutcome: report.collectionOutcome,
      skipReason: report.skipReason,
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
    case "skipped":
      counts.skippedItems += 1;
      break;
    case "failed":
      counts.failedItems += 1;
      break;
    case "absent":
      counts.absentItems += 1;
      break;
  }

  if (report.canonicalOutcome === "reused") {
    counts.canonicalRecordsReused += 1;
  } else if (report.canonicalOutcome === "created_provisional") {
    counts.canonicalRecordsCreated += 1;
  } else if (report.canonicalOutcome === "unresolved") {
    counts.canonicalRecordsUnresolved += 1;
  }

  if (report.collectionOutcome === "added") {
    counts.collectionItemsAdded += 1;
  } else if (report.collectionOutcome === "already_present") {
    counts.collectionItemsAlreadyPresent += 1;
  }
}

async function storePlatformLibraryAbsence({
  repository,
  events,
  batchId,
  batchKind,
  ownerScope,
  providerId,
  providerAccountId,
  absence,
  recordedAt,
}: {
  repository: LibraryImportRepository;
  events: EventPort;
  batchId: string;
  batchKind: LibraryImportBatchKind;
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  absence: PlatformLibraryAbsenceSummary;
  recordedAt: string;
}): Promise<Result<void>> {
  if (absence.currentBatchId === undefined) {
    return ok(undefined);
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

  if (absence.canonicalRef !== undefined) {
    record.canonicalRef = absence.canonicalRef;
  }

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
      canonicalRef: absence.canonicalRef,
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
    canonicalEstimates: estimates?.canonicalEstimates ?? emptyCanonicalEstimates(),
    collectionEstimates: estimates?.collectionEstimates ?? emptyCollectionEstimates(),
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
    case "saved_recordings":
      return "saved_recordings";
    case "saved_releases":
      return "saved_releases";
    case "saved_artists":
      return "saved_artists";
    case "discovery":
      return null;
  }
}

function providerAreaToScope(area: PlatformLibraryArea): LibraryImportScope {
  switch (area) {
    case "saved_recordings":
      return "saved_recordings";
    case "saved_releases":
      return "saved_releases";
    case "saved_artists":
      return "saved_artists";
    case "playlists":
    case "listening_history":
      return "discovery";
  }
}

function isFirstSliceArea(area: PlatformLibraryArea): boolean {
  switch (area) {
    case "saved_recordings":
    case "saved_releases":
    case "saved_artists":
      return true;
    case "playlists":
    case "listening_history":
      return false;
  }
}

function canUseProviderItemForCanonicalBinding(item: PlatformLibraryItem): boolean {
  return (
    item.sourceRef.namespace.trim().length > 0 &&
    item.sourceRef.kind.trim().length > 0 &&
    item.sourceRef.id.trim().length > 0 &&
    item.label.trim().length > 0 &&
    isFirstSliceTargetKind(item.targetKind)
  );
}

function isFirstSliceTargetKind(targetKind: PlatformLibraryItem["targetKind"]): boolean {
  switch (targetKind) {
    case "recording":
    case "release":
    case "artist":
      return true;
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
    status: batch.status,
    providerId: batch.providerId,
    ownerScope: batch.ownerScope,
    scopes: batch.scopes,
    startedAt: batch.startedAt,
    counts: batch.counts,
  };

  if (batch.completedAt !== undefined) {
    status.completedAt = batch.completedAt;
  }

  if (batch.issues !== undefined) {
    status.issues = batch.issues;
  }

  return status;
}

function batchToReport(batch: LibraryImportBatch): LibraryImportReport {
  const report: LibraryImportReport = {
    batchId: batch.id,
    batchKind: batch.batchKind,
    status: batch.status,
    providerId: batch.providerId,
    ownerScope: batch.ownerScope,
    scopes: batch.scopes,
    startedAt: batch.startedAt,
    counts: batch.counts,
    areas: [],
    items: [],
  };

  if (batch.completedAt !== undefined) {
    report.completedAt = batch.completedAt;
  }

  if (batch.issues !== undefined) {
    report.issues = batch.issues;
  }

  return report;
}

function emptyCanonicalEstimates(): LibraryImportCanonicalEstimateCounts {
  return {
    alreadyBound: 0,
    wouldCreateProvisional: 0,
    unresolved: 0,
    skipped: 0,
  };
}

function emptyCollectionEstimates(): LibraryImportCollectionEstimateCounts {
  return {
    alreadyPresent: 0,
    wouldAdd: 0,
    wouldAddAfterProvisional: 0,
    skipped: 0,
  };
}

function emptyUpdateEstimates(): LibraryImportUpdateEstimateCounts {
  return {
    wouldAdd: 0,
    alreadyPresent: 0,
    noLongerReturned: 0,
    failedOrSkipped: 0,
  };
}

function emptyCounts(): LibraryImportCounts {
  return {
    importedItems: 0,
    alreadyPresentItems: 0,
    skippedItems: 0,
    failedItems: 0,
    absentItems: 0,
    canonicalRecordsReused: 0,
    canonicalRecordsCreated: 0,
    canonicalRecordsUnresolved: 0,
    collectionItemsAdded: 0,
    collectionItemsAlreadyPresent: 0,
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
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
