import type {
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
  LibraryImportScope,
  LibraryImportStatus,
  PlatformLibraryArea,
  PlatformLibraryPreviewArea,
  PlatformLibraryProvider,
  PlatformLibraryReadAreaResult,
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
  canonicalStore: _canonicalStore,
  collection: _collection,
  events: _events,
  repository,
  idFactory = createDefaultIdFactory("library-import-batch"),
  clock = () => new Date().toISOString(),
}: LibraryImportServiceOptions): LibraryImportPort {
  return {
    previewImport(input) {
      return previewLibraryImport({
        pluginRegistry,
        input,
        includeUpdateEstimates: false,
      });
    },

    startImport(input) {
      return startLibraryImport({
        pluginRegistry,
        repository,
        input,
        batchKind: "initial_import",
        idFactory,
        clock,
      });
    },

    previewUpdate(input) {
      return previewLibraryImport({
        pluginRegistry,
        input,
        includeUpdateEstimates: true,
      });
    },

    startUpdate(input) {
      return startLibraryImport({
        pluginRegistry,
        repository,
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
  input,
  includeUpdateEstimates,
}: {
  pluginRegistry: PluginRegistryPort;
  input: LibraryImportPreviewInput;
  includeUpdateEstimates: boolean;
}): Promise<Result<LibraryImportPreview>> {
  const provider = await resolvePlatformLibraryProvider(pluginRegistry, input.providerId);

  if (!provider.ok) {
    return provider;
  }

  const scopes = normalizeScopes(input.scopes);
  const areas = scopesToProviderAreas(scopes);
  const preview = await provider.value.preview({
    ...(input.providerAccountId === undefined ? {} : { providerAccountId: input.providerAccountId }),
    ...(areas.length === 0 ? {} : { areas }),
    ...(scopes.includes("discovery") ? { discovery: true } : {}),
    ...(input.sampleLimitPerArea === undefined ? {} : { sampleLimitPerArea: input.sampleLimitPerArea }),
  });

  if (!preview.ok) {
    return providerReadFailed(input.providerId, preview.error);
  }

  const result: LibraryImportPreview = {
    providerId: preview.value.providerId,
    ownerScope: input.ownerScope ?? defaultOwnerScope,
    scopes,
    areas: preview.value.areas.map((area) =>
      providerPreviewAreaToLibraryImportArea(area, includeUpdateEstimates),
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

async function startLibraryImport({
  pluginRegistry,
  repository,
  input,
  batchKind,
  idFactory,
  clock,
}: {
  pluginRegistry: PluginRegistryPort;
  repository: LibraryImportRepository;
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

  const read = await provider.value.readItems({
    ...(input.providerAccountId === undefined ? {} : { providerAccountId: input.providerAccountId }),
    areas: scopesToProviderAreas(scopes),
  });

  if (!read.ok) {
    return providerReadFailed(input.providerId, read.error);
  }

  const now = clock();
  const counts = emptyCounts();
  const batch: LibraryImportBatch = {
    id: idFactory(),
    batchKind,
    status: readHasWarnings(read.value.areas, read.value.issues) ? "completed_with_warnings" : "completed",
    providerId: read.value.providerId,
    ownerScope: input.ownerScope ?? defaultOwnerScope,
    scopes,
    startedAt: now,
    completedAt: now,
    counts,
  };

  if (read.value.account?.providerAccountId !== undefined) {
    batch.providerAccountId = read.value.account.providerAccountId;
    batch.providerAccountStable = read.value.account.stable;
  } else if (input.providerAccountId !== undefined) {
    batch.providerAccountId = input.providerAccountId;
  }

  if (read.value.issues !== undefined) {
    batch.issues = read.value.issues;
  }

  const stored = await repository.putBatch({ batch });

  if (!stored.ok) {
    return stored;
  }

  const report = batchToReport(stored.value);
  report.areas = read.value.areas.map(providerReadAreaToReportArea);

  if (read.value.account !== undefined) {
    report.account = read.value.account;
  }

  return ok(report);
}

function providerPreviewAreaToLibraryImportArea(
  area: PlatformLibraryPreviewArea,
  includeUpdateEstimates: boolean,
): LibraryImportPreviewArea {
  const previewArea: LibraryImportPreviewArea = {
    scope: providerAreaToScope(area.area),
    area: area.area,
    availability: area.availability,
    canonicalEstimates: emptyCanonicalEstimates(),
    collectionEstimates: emptyCollectionEstimates(),
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
    previewArea.updateEstimates = {
      wouldAdd: 0,
      alreadyPresent: 0,
      noLongerReturned: 0,
      failedOrSkipped: 0,
    };
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
  return fail({
    code: "library_import.provider_read_failed",
    message: `Platform library provider '${providerId}' failed to read library facts.`,
    module: "library_import",
    retryable: true,
    cause,
  });
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
