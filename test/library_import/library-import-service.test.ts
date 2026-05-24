import type {
  CanonicalRecord,
  PlatformLibraryPreviewInput,
  PlatformLibraryProvider,
  Ref,
} from "../../src/contracts/index.js";
import { createCanonicalStore } from "../../src/canonical/index.js";
import { createCollectionService } from "../../src/collection/index.js";
import { createEventService } from "../../src/events/index.js";
import { createLibraryImportService } from "../../src/library_import/index.js";
import { createPluginRegistry } from "../../src/plugins/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryCollectionRepository,
  createInMemoryEventRepository,
  createInMemoryLibraryImportRepository,
} from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, "expected Result.ok");
  return awaited.value;
}

async function assertErrorCode(
  result: Promise<{ ok: true } | { ok: false; error: { code: string } }>,
  code: string,
): Promise<void> {
  const awaited = await result;
  assert(!awaited.ok, "expected Result.error");
  assert(awaited.error.code === code, `expected error code ${code}`);
}

async function previewsImportThroughRegisteredPlatformLibraryProvider(): Promise<void> {
  const registry = createPluginRegistry();
  const previewInputs: PlatformLibraryPreviewInput[] = [];
  const provider: PlatformLibraryProvider = {
    id: "fixture-library",
    async preview(input) {
      previewInputs.push(input);

      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: input.providerAccountId ?? "fixture-account",
            stable: true,
          },
          areas: (input.areas ?? []).map((area) => ({
            area,
            availability: "readable",
            count: { certainty: "exact", value: 1 },
          })),
        },
      };
    },
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          areas: [],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const libraryImport = createTestLibraryImportService(registry);
  const preview = await assertOk(
    libraryImport.previewImport({
      providerId: provider.id,
      providerAccountId: "fixture-account",
      scopes: ["saved_recordings", "saved_artists"],
      sampleLimitPerArea: 3,
    }),
  );

  assert(preview.providerId === "fixture-library", "preview should report the provider id");
  assert(preview.ownerScope === "local_profile:default", "preview should default the owner scope");
  assert(preview.scopes.join(",") === "saved_recordings,saved_artists", "preview should keep requested scopes");
  assert(preview.account?.providerAccountId === "fixture-account", "preview should keep provider account identity");
  assert(preview.areas.length === 2, "preview should return one area per requested first-slice scope");
  assert(preview.areas[0]?.scope === "saved_recordings", "preview should map saved recordings scope");
  assert(preview.areas[1]?.scope === "saved_artists", "preview should map saved artists scope");
  assert(
    preview.areas.every((area) => area.canonicalEstimates.alreadyBound >= 0),
    "preview should return canonical estimate fields",
  );
  assert(previewInputs.length === 1, "preview should call the provider once");
  assert(
    previewInputs[0]?.areas?.join(",") === "saved_recordings,saved_artists",
    "preview should map MineMusic scopes to provider areas",
  );
  assert(previewInputs[0]?.providerAccountId === "fixture-account", "preview should pass provider account id");
  assert(previewInputs[0]?.sampleLimitPerArea === 3, "preview should pass sample limit");
}

async function mapsMissingPlatformLibraryProviderToLibraryImportError(): Promise<void> {
  const libraryImport = createTestLibraryImportService(createPluginRegistry());

  await assertErrorCode(
    libraryImport.previewImport({
      providerId: "missing-library",
      scopes: ["saved_recordings"],
    }),
    "library_import.provider_not_found",
  );
}

async function rejectsDiscoveryScopesForStartCalls(): Promise<void> {
  const libraryImport = createTestLibraryImportService(createPluginRegistry());

  await assertErrorCode(
    libraryImport.startImport({
      providerId: "missing-library",
      scopes: ["discovery"],
    }),
    "library_import.scope_unsupported",
  );
  await assertErrorCode(
    libraryImport.startUpdate({
      providerId: "missing-library",
      scopes: ["discovery", "saved_recordings"],
    }),
    "library_import.scope_unsupported",
  );
}

async function startsReadableImportBatchAndExposesStatus(): Promise<void> {
  const registry = createPluginRegistry();
  const readInputs: Parameters<PlatformLibraryProvider["readItems"]>[0][] = [];
  const provider: PlatformLibraryProvider = {
    id: "fixture-library",
    async preview() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          areas: [],
        },
      };
    },
    async readItems(input) {
      readInputs.push(input);

      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: input.providerAccountId ?? "fixture-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_recordings",
              status: "complete",
              items: [
                {
                  providerId: "fixture-library",
                  sourceRef: {
                    namespace: "source:fixture-library",
                    kind: "track",
                    id: "track-1",
                  },
                  itemKind: "saved_recording",
                  targetKind: "recording",
                  label: "Fixture Track",
                },
              ],
            },
          ],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const libraryImport = createTestLibraryImportService(registry);
  const report = await assertOk(
    libraryImport.startImport({
      providerId: provider.id,
      providerAccountId: "fixture-account",
      ownerScope: "local_profile:work",
      scopes: ["saved_recordings"],
    }),
  );
  const status = await assertOk(libraryImport.getStatus({ batchId: report.batchId }));

  assert(report.batchId === "library-import-batch-1", "start should assign a batch id");
  assert(report.batchKind === "initial_import", "startImport should create an initial import batch");
  assert(report.status === "completed", "complete provider reads should create a completed skeleton batch");
  assert(report.ownerScope === "local_profile:work", "start should keep explicit owner scope");
  assert(report.startedAt === "2026-05-25T00:00:00.000Z", "start should use the service clock");
  assert(report.account?.providerAccountId === "fixture-account", "start should keep provider account identity");
  assert(report.areas[0]?.scope === "saved_recordings", "start should map read areas back to import scopes");
  assert(readInputs[0]?.areas.join(",") === "saved_recordings", "start should pass provider read areas");
  assert(readInputs[0]?.providerAccountId === "fixture-account", "start should pass provider account id");
  assert(status.batchId === report.batchId, "status should read back the stored batch");
  assert(status.status === "completed", "status should expose stored batch status");
}

async function estimatesReadableImportPreviewWithoutWritingMineMusicState(): Promise<void> {
  const registry = createPluginRegistry();
  const readInputs: Parameters<PlatformLibraryProvider["readItems"]>[0][] = [];
  const provider: PlatformLibraryProvider = {
    id: "fixture-library",
    async preview(input) {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: input.providerAccountId ?? "fixture-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_recordings",
              availability: "readable",
              count: { certainty: "exact", value: 4 },
            },
          ],
        },
      };
    },
    async readItems(input) {
      readInputs.push(input);

      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          areas: [
            {
              area: "saved_recordings",
              status: "complete",
              items: [
                providerItem("bound-track", "Bound Track"),
                providerItem("bound-unsaved-track", "Unsaved Bound Track"),
                providerItem("new-track", "New Track"),
                providerItem("unresolved-track", ""),
              ],
            },
          ],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const environment = createTestLibraryImportEnvironment(registry);
  const boundCanonical: CanonicalRecord = {
    ref: {
      namespace: "minemusic",
      kind: "recording",
      id: "bound-recording",
    },
    kind: "recording",
    label: "Bound Track",
    status: "active",
    externalKeys: [sourceRef("bound-track")],
  };
  const unsavedCanonical: CanonicalRecord = {
    ref: {
      namespace: "minemusic",
      kind: "recording",
      id: "unsaved-recording",
    },
    kind: "recording",
    label: "Unsaved Bound Track",
    status: "active",
    externalKeys: [sourceRef("bound-unsaved-track")],
  };
  await assertOk(environment.canonicalRepository.put(boundCanonical));
  await assertOk(environment.canonicalRepository.put(unsavedCanonical));
  await assertOk(environment.collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }));
  await assertOk(
    environment.collections.addItemToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "saved",
      canonicalRef: boundCanonical.ref,
      label: boundCanonical.label,
    }),
  );
  const eventsBeforePreview = await assertOk(
    environment.events.listBySession({ sessionId: "collection:local_profile:default" }),
  );

  const preview = await assertOk(
    environment.libraryImport.previewImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  const batchesAfterPreview = await assertOk(environment.libraryImportRepository.listBatches({}));
  const canonicalRecordsAfterPreview = await assertOk(environment.canonicalRepository.list());
  const savedItemsAfterPreview = await assertOk(
    environment.collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );
  const eventsAfterPreview = await assertOk(
    environment.events.listBySession({ sessionId: "collection:local_profile:default" }),
  );

  assert(readInputs.length === 1, "readable preview should read provider items for estimates");
  assert(readInputs[0]?.areas.join(",") === "saved_recordings", "preview read should use requested readable areas");
  assert(preview.areas[0]?.canonicalEstimates.alreadyBound === 2, "preview should count exact source-ref bindings");
  assert(
    preview.areas[0]?.canonicalEstimates.wouldCreateProvisional === 1,
    "preview should count importable unbound items as provisional creates",
  );
  assert(preview.areas[0]?.canonicalEstimates.unresolved === 1, "preview should count weak metadata as unresolved");
  assert(preview.areas[0]?.collectionEstimates.alreadyPresent === 1, "preview should count existing saved items");
  assert(preview.areas[0]?.collectionEstimates.wouldAdd === 1, "preview should count bound items missing from saved Collection");
  assert(
    preview.areas[0]?.collectionEstimates.wouldAddAfterProvisional === 1,
    "preview should count provisional collection additions separately",
  );
  assert(preview.areas[0]?.collectionEstimates.skipped === 1, "preview should count unresolved collection skips");
  assert(batchesAfterPreview.length === 0, "preview should not create import batches");
  assert(canonicalRecordsAfterPreview.length === 2, "preview should not create canonical records");
  assert(savedItemsAfterPreview.length === 1, "preview should not add collection items");
  assert(eventsAfterPreview.length === eventsBeforePreview.length, "preview should not record events");
}

async function previewsDiscoveryWithoutReadingProviderItems(): Promise<void> {
  const registry = createPluginRegistry();
  const previewInputs: PlatformLibraryPreviewInput[] = [];
  let readCount = 0;
  const provider: PlatformLibraryProvider = {
    id: "fixture-library",
    async preview(input) {
      previewInputs.push(input);

      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          areas: [
            {
              area: "playlists",
              availability: "unsupported",
              issues: [
                {
                  code: "scope_unsupported",
                  message: "Playlists are not importable in the first slice.",
                  retryable: false,
                  area: "playlists",
                },
              ],
            },
          ],
        },
      };
    },
    async readItems() {
      readCount += 1;

      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          areas: [],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const libraryImport = createTestLibraryImportService(registry);
  const preview = await assertOk(
    libraryImport.previewImport({
      providerId: provider.id,
      scopes: ["discovery"],
    }),
  );

  assert(previewInputs[0]?.discovery === true, "discovery preview should call provider preview with discovery mode");
  assert(previewInputs[0]?.areas === undefined, "discovery preview should not request first-slice areas");
  assert(readCount === 0, "discovery preview should not read provider items");
  assert(preview.areas[0]?.scope === "discovery", "discovery preview should preserve unsupported provider areas");
  assert(preview.areas[0]?.issues?.[0]?.code === "scope_unsupported", "discovery preview should keep provider issues");
}

function createTestLibraryImportService(registry: ReturnType<typeof createPluginRegistry>) {
  return createTestLibraryImportEnvironment(registry).libraryImport;
}

function createTestLibraryImportEnvironment(registry: ReturnType<typeof createPluginRegistry>) {
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    idFactory: createSequence("event"),
    clock: () => "2026-05-25T00:00:00.000Z",
  });
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const canonicalStore = createCanonicalStore({
    repository: canonicalRepository,
    idFactory: createSequence("canonical"),
  });
  const collections = createCollectionService({
    repository: createInMemoryCollectionRepository(),
    events,
    idFactory: createSequence("collection"),
    clock: () => "2026-05-25T00:00:00.000Z",
  });
  const libraryImportRepository = createInMemoryLibraryImportRepository();
  const libraryImport = createLibraryImportService({
    pluginRegistry: registry,
    canonicalStore,
    collection: collections,
    events,
    repository: libraryImportRepository,
    idFactory: createSequence("library-import-batch"),
    clock: () => "2026-05-25T00:00:00.000Z",
  });

  return {
    libraryImport,
    canonicalRepository,
    collections,
    events,
    libraryImportRepository,
  };
}

function createSequence(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function providerItem(id: string, label: string) {
  return {
    providerId: "fixture-library",
    sourceRef: sourceRef(id),
    itemKind: "saved_recording",
    targetKind: "recording",
    label,
  } as const;
}

function sourceRef(id: string): Ref {
  return {
    namespace: "source:fixture-library",
    kind: "track",
    id,
  };
}

await previewsImportThroughRegisteredPlatformLibraryProvider();
await mapsMissingPlatformLibraryProviderToLibraryImportError();
await rejectsDiscoveryScopesForStartCalls();
await startsReadableImportBatchAndExposesStatus();
await estimatesReadableImportPreviewWithoutWritingMineMusicState();
await previewsDiscoveryWithoutReadingProviderItems();
