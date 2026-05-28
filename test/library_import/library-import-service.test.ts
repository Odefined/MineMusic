import type {
  CanonicalRecord,
  PlatformLibraryItem,
  PlatformLibraryPreviewInput,
  PlatformLibraryProvider,
  Ref,
} from "../../src/contracts/index.js";
import { createCanonicalStore } from "../../src/material_store/canonical/index.js";
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
      sampleLimitPerArea: 200,
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
  assert(readInputs[0]?.sampleLimitPerArea === 200, "start should pass sample limit to provider reads");
  assert(status.batchId === report.batchId, "status should read back the stored batch");
  assert(status.status === "completed", "status should expose stored batch status");
}

async function marksStartedBatchFailedWhenProviderReadFails(): Promise<void> {
  const registry = createPluginRegistry();
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
    async readItems() {
      return {
        ok: false,
        error: {
          code: "fixture.read_failed",
          message: "fixture read failed",
          module: "library_import",
          retryable: true,
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const environment = createTestLibraryImportEnvironment(registry);

  await assertErrorCode(
    environment.libraryImport.startImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
    "library_import.provider_read_failed",
  );
  const status = await assertOk(
    environment.libraryImport.getStatus({ batchId: "library-import-batch-1" }),
  );

  assert(status.status === "failed", "failed provider reads should not leave the batch running");
  assert(status.completedAt === "2026-05-25T00:00:00.000Z", "failed batches should record completion time");
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
    sourceRefs: [sourceRef("bound-track")],
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
    sourceRefs: [sourceRef("bound-unsaved-track")],
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

async function importsReadableItemsIntoMineMusicStateAndRecordsFacts(): Promise<void> {
  const registry = createPluginRegistry();
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
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: "fixture-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_recordings",
              status: "complete",
              items: [
                providerItem("bound-track", "Bound Track"),
                providerItem("new-track", "New Track - Fixture Artist", {
                  label: "New Track",
                  artistLabels: ["Fixture Artist"],
                  artistSourceRefs: [artistSourceRef("fixture-artist", "Fixture Artist")],
                  releaseLabel: "Fixture Release",
                  releaseSourceRef: releaseSourceRef("fixture-release", "Fixture Release"),
                  releaseDate: "2015-09-11",
                  durationMs: 123456,
                  trackPosition: {
                    discNumber: "1",
                    trackNumber: 5,
                    trackCount: 12,
                  },
                }),
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
    sourceRefs: [sourceRef("bound-track")],
  };
  await assertOk(environment.canonicalRepository.put(boundCanonical));
  await assertOk(environment.collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }));
  await assertOk(
    environment.collections.addItemToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "saved",
      canonicalRef: boundCanonical.ref,
      label: boundCanonical.label,
    }),
  );

  const report = await assertOk(
    environment.libraryImport.startImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  const status = await assertOk(environment.libraryImport.getStatus({ batchId: report.batchId }));
  const summary = await assertOk(environment.libraryImport.getSummary({ batchId: report.batchId }));
  const canonicalRecords = await assertOk(environment.canonicalRepository.list());
  const savedItems = await assertOk(
    environment.collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );
  const provenance = await assertOk(
    environment.libraryImportRepository.listItemProvenance({
      ownerScope: "local_profile:default",
      providerId: provider.id,
      providerAccountId: "fixture-account",
      scope: "saved_recordings",
      area: "saved_recordings",
    }),
  );
  const snapshots = await assertOk(
    environment.libraryImportRepository.listAreaSnapshots({
      ownerScope: "local_profile:default",
      providerId: provider.id,
      providerAccountId: "fixture-account",
      scope: "saved_recordings",
      area: "saved_recordings",
      complete: true,
    }),
  );
  const newTrackRelations = await assertOk(
    environment.canonicalStore.listRelations({
      subjectRef: {
        namespace: "minemusic",
        kind: "recording",
        id: "canonical-1",
      },
    }),
  );
  const provisionalHints = await assertOk(
    environment.canonicalStore.listProvisionalHints({
      kind: "source_recording_context",
    }),
  );
  const fixtureArtist = await assertOk(
    environment.canonicalStore.resolveSourceRef({
      ref: artistSourceRef("fixture-artist", "Fixture Artist"),
    }),
  );
  const fixtureRelease = await assertOk(
    environment.canonicalStore.resolveSourceRef({
      ref: releaseSourceRef("fixture-release", "Fixture Release"),
    }),
  );
  const importEvents = await assertOk(
    environment.events.listBySession({ sessionId: `library_import:${report.batchId}` }),
  );

  assert(report.status === "completed_with_warnings", "skipped items should complete the batch with warnings");
  assert(status.status === report.status, "status should expose the completed batch state");
  assert(report.counts.alreadyPresentItems === 1, "import should count already-present Collection items");
  assert(report.counts.importedItems === 1, "import should count newly imported Collection items");
  assert(report.counts.skippedItems === 1, "import should count skipped weak-metadata items");
  assert(report.counts.canonicalRecordsReused === 1, "import should count reused canonical bindings");
  assert(report.counts.canonicalRecordsCreated === 1, "import should count provisional canonical creates");
  assert(report.counts.canonicalRecordsUnresolved === 1, "import should count unresolved canonical items");
  assert(report.counts.collectionItemsAdded === 1, "import should count saved Collection additions");
  assert(report.counts.collectionItemsAlreadyPresent === 1, "import should count existing saved Collection items");
  assert(report.items.length === 3, "import report should include every provider item result");
  assert(summary.items.length === report.items.length, "summary should return the completed item report");
  assert(summary.counts.importedItems === report.counts.importedItems, "summary should preserve completed counts");
  assert(
    report.items.some((item) => item.sourceRef.id === "new-track" && item.status === "imported"),
    "import report should include imported item results",
  );
  assert(
    report.items.some((item) => item.sourceRef.id === "unresolved-track" && item.status === "skipped"),
    "import report should include skipped item results",
  );
  assert(
    canonicalRecords.some((record) => record.sourceRefs?.some((ref) => ref.id === "new-track")),
    "import should create a provisional canonical record with the source ref",
  );
  assert(
    canonicalRecords.find((record) => record.sourceRefs?.some((ref) => ref.id === "new-track"))?.label === "New Track",
    "import should keep recording title separate from provider artist credit in canonical labels",
  );
  assert(savedItems.length === 2, "import should add only resolvable items to saved Collection");
  assert(
    fixtureArtist?.kind === "artist",
    "import should create provisional artist canonical records from source-ref hints",
  );
  assert(
    fixtureRelease?.kind === "release",
    "import should create provisional release canonical records from source-ref hints",
  );
  assert(
    newTrackRelations.some(
      (relation) =>
        relation.predicate === "performed_by" &&
        relation.objectLabel === "Fixture Artist" &&
        relation.objectRef?.id === fixtureArtist?.ref.id,
    ),
    "import should record provisional artist relations from provider hints",
  );
  assert(
    newTrackRelations.some(
      (relation) =>
        relation.predicate === "appears_on_release" &&
        relation.objectLabel === "Fixture Release" &&
        relation.objectRef?.id === fixtureRelease?.ref.id,
    ),
    "import should record provisional release relations from provider hints",
  );
  assert(
    newTrackRelations.some((relation) => relation.predicate === "has_duration_ms" && relation.objectValue === 123456),
    "import should record provisional duration relations from provider hints",
  );
  assert(
    newTrackRelations.every((relation) => relation.predicate !== "track_position"),
    "import should not store track position as a canonical relation",
  );
  assert(provisionalHints.length === 1, "import should store one source recording context hint");
  assert(
    provisionalHints[0]?.subjectRef.id === "canonical-1",
    "source recording context hints should attach to the provisional recording",
  );
  assert(
    provisionalHints[0]?.sourceRef.id === "new-track",
    "source recording context hints should attach to the provider source ref",
  );
  assert(
    provisionalHints[0]?.facts.trackPosition?.trackNumber === 5,
    "source recording context hints should keep provider track position facts",
  );
  assert(
    provisionalHints[0]?.facts.durationMs === 123456,
    "source recording context hints should keep duration facts",
  );
  assert(
    provisionalHints[0]?.facts.releaseDate === "2015-09-11",
    "source recording context hints should keep source release date facts",
  );
  assert(
    provenance.find((item) => item.sourceRef.id === "new-track")?.canonicalHints?.trackPosition?.trackCount === 12,
    "item provenance should preserve provider canonicalHints unchanged",
  );
  assert(provenance.length === 3, "import should store item provenance for every observed provider item");
  assert(snapshots.length === 1, "import should store a complete area snapshot");
  assert(snapshots[0]?.sourceRefs.length === 3, "complete snapshots should keep the full observed source-ref set");
  assert(
    importEvents.map((event) => event.type).join(",") ===
      "library_import.batch.started,library_import.item.imported,library_import.item.imported,library_import.item.skipped,library_import.batch.completed",
    "import should record batch and item facts",
  );
}

async function importsSameLabelDifferentSourceRefsAsSeparateProvisionalIdentities(): Promise<void> {
  const registry = createPluginRegistry();
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
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: "fixture-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_recordings",
              status: "complete",
              items: [
                providerItem("same-title-first", "Same Title"),
                providerItem("same-title-second", "Same Title"),
              ],
            },
          ],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const environment = createTestLibraryImportEnvironment(registry);
  await assertOk(environment.collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }));

  const report = await assertOk(
    environment.libraryImport.startImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  const canonicalRecords = await assertOk(environment.canonicalRepository.list());
  const savedItems = await assertOk(
    environment.collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );

  assert(report.counts.canonicalRecordsCreated === 2, "same labels should not collapse canonical creates");
  assert(report.counts.collectionItemsAdded === 2, "same labels with different source refs should both save");
  assert(
    canonicalRecords.length === 2,
    "same-label imports should remain separate source-bound provisional identities",
  );
  assert(savedItems.length === 2, "Collection should contain both provisional source-bound imports");
}

async function cachesSavedCollectionMembershipDuringImportBatch(): Promise<void> {
  const registry = createPluginRegistry();
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
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: "fixture-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_recordings",
              status: "complete",
              items: [
                providerItem("cache-track-1", "Cache Track 1"),
                providerItem("cache-track-2", "Cache Track 2"),
                providerItem("cache-track-3", "Cache Track 3"),
              ],
            },
          ],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const environment = createTestLibraryImportEnvironment(registry);
  const listItems = environment.collections.listItems.bind(environment.collections);
  let savedRecordingLookups = 0;
  environment.collections.listItems = (input) => {
    if (input.collectionKind === "recording" && input.relationKind === "saved") {
      savedRecordingLookups += 1;
    }

    return listItems(input);
  };
  const report = await assertOk(
    environment.libraryImport.startImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );

  assert(report.counts.importedItems === 3, "fixture import should add every provider item");
  assert(
    savedRecordingLookups === 1,
    "import should read saved recording membership once per batch and update the cache in memory",
  );
}

async function returnsStoredSummaryAfterServiceRecreation(): Promise<void> {
  const registry = createPluginRegistry();
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
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: "fixture-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_recordings",
              status: "complete",
              items: [providerItem("persisted-track", "Persisted Track")],
            },
          ],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const environment = createTestLibraryImportEnvironment(registry);
  const report = await assertOk(
    environment.libraryImport.startImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  const recreatedLibraryImport = createLibraryImportService({
    pluginRegistry: registry,
    canonicalStore: createCanonicalStore({
      repository: environment.canonicalRepository,
      idFactory: createSequence("recreated-canonical"),
    }),
    collection: environment.collections,
    events: environment.events,
    repository: environment.libraryImportRepository,
    idFactory: createSequence("recreated-library-import-batch"),
    clock: () => "2026-05-25T00:00:00.000Z",
  });

  const summary = await assertOk(recreatedLibraryImport.getSummary({ batchId: report.batchId }));

  assert(summary.items.length === 1, "summary should survive service-local report cache loss");
  assert(summary.items[0]?.sourceRef.id === "persisted-track", "stored summary should include item reports");
  assert(summary.areas[0]?.area === "saved_recordings", "stored summary should include read areas");
}

async function doesNotStoreCompleteSnapshotForPartialImportReads(): Promise<void> {
  const registry = createPluginRegistry();
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
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: "fixture-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_recordings",
              status: "partial",
              items: [providerItem("partial-track", "Partial Track")],
            },
          ],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const environment = createTestLibraryImportEnvironment(registry);
  const report = await assertOk(
    environment.libraryImport.startImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  const snapshots = await assertOk(
    environment.libraryImportRepository.listAreaSnapshots({
      ownerScope: "local_profile:default",
      providerId: provider.id,
      providerAccountId: "fixture-account",
      scope: "saved_recordings",
      area: "saved_recordings",
    }),
  );

  assert(report.status === "completed_with_warnings", "partial reads should complete with warnings");
  assert(snapshots.length === 0, "partial reads should not be stored as complete baselines");
}

async function previewsLibraryUpdateAgainstLatestCompleteBaselineWithoutWriting(): Promise<void> {
  const registry = createPluginRegistry();
  let providerItems = [
    providerItem("kept-track", "Kept Track"),
    providerItem("missing-track", "Missing Track"),
  ];
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
              count: { certainty: "exact", value: providerItems.length },
            },
          ],
        },
      };
    },
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: "fixture-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_recordings",
              status: "complete",
              items: providerItems,
            },
          ],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const environment = createTestLibraryImportEnvironment(registry);
  await assertOk(
    environment.libraryImport.startImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  const preExistingCanonical: CanonicalRecord = {
    ref: {
      namespace: "minemusic",
      kind: "recording",
      id: "pre-existing-recording",
    },
    kind: "recording",
    label: "Saved New Track",
    status: "active",
    sourceRefs: [sourceRef("saved-new-track")],
  };
  await assertOk(environment.canonicalRepository.put(preExistingCanonical));
  await assertOk(
    environment.collections.addItemToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "saved",
      canonicalRef: preExistingCanonical.ref,
      label: preExistingCanonical.label,
    }),
  );
  providerItems = [
    providerItem("kept-track", "Kept Track"),
    providerItem("saved-new-track", "Saved New Track"),
  ];
  const batchesBeforePreview = await assertOk(environment.libraryImportRepository.listBatches({}));
  const savedItemsBeforePreview = await assertOk(
    environment.collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );

  const preview = await assertOk(
    environment.libraryImport.previewUpdate({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  const batchesAfterPreview = await assertOk(environment.libraryImportRepository.listBatches({}));
  const absencesAfterPreview = await assertOk(
    environment.libraryImportRepository.listAbsences({
      ownerScope: "local_profile:default",
      providerId: provider.id,
      providerAccountId: "fixture-account",
      scope: "saved_recordings",
      area: "saved_recordings",
    }),
  );
  const savedItemsAfterPreview = await assertOk(
    environment.collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );

  assert(preview.areas[0]?.updateEstimates?.alreadyPresent === 1, "update preview should count still-present assets");
  assert(preview.areas[0]?.updateEstimates?.wouldAdd === 1, "update preview should count newly observed assets");
  assert(
    preview.areas[0]?.updateEstimates?.noLongerReturned === 1,
    "update preview should count baseline assets no longer returned",
  );
  assert(preview.areas[0]?.updateEstimates?.failedOrSkipped === 0, "update preview should count failed/skipped items");
  assert(preview.areas[0]?.absences?.[0]?.sourceRef.id === "missing-track", "update preview should describe absences");
  assert(batchesAfterPreview.length === batchesBeforePreview.length, "update preview should not create batches");
  assert(absencesAfterPreview.length === 0, "update preview should not store absence records");
  assert(savedItemsAfterPreview.length === savedItemsBeforePreview.length, "update preview should not write collections");
}

async function doesNotUseStableAccountBaselinesForUnstableUpdateReads(): Promise<void> {
  const registry = createPluginRegistry();
  let providerItems = [
    providerItem("kept-track", "Kept Track"),
    providerItem("missing-track", "Missing Track"),
  ];
  let accountStable = true;
  const provider: PlatformLibraryProvider = {
    id: "fixture-library",
    async preview(input) {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: input.providerAccountId ?? "fixture-account",
            stable: accountStable,
          },
          areas: [
            {
              area: "saved_recordings",
              availability: "readable",
            },
          ],
        },
      };
    },
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: "fixture-account",
            stable: accountStable,
          },
          areas: [
            {
              area: "saved_recordings",
              status: "complete",
              items: providerItems,
            },
          ],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const environment = createTestLibraryImportEnvironment(registry);
  await assertOk(
    environment.libraryImport.startImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  accountStable = false;
  providerItems = [providerItem("kept-track", "Kept Track")];

  const preview = await assertOk(
    environment.libraryImport.previewUpdate({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );

  assert(
    preview.areas[0]?.updateEstimates?.noLongerReturned === 0,
    "unstable update reads should not derive absences from stable account baselines",
  );
  assert(preview.areas[0]?.absences === undefined, "stable-account absences should not leak into unstable previews");
}

async function startsLibraryUpdateAndRecordsPlatformAbsencesWithoutRemovingCollections(): Promise<void> {
  const registry = createPluginRegistry();
  let providerItems = [
    providerItem("kept-track", "Kept Track"),
    providerItem("missing-track", "Missing Track"),
  ];
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
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: "fixture-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_recordings",
              status: "complete",
              items: providerItems,
            },
          ],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const environment = createTestLibraryImportEnvironment(registry);
  await assertOk(
    environment.libraryImport.startImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  providerItems = [
    providerItem("kept-track", "Kept Track"),
    providerItem("new-track", "New Track"),
  ];

  const update = await assertOk(
    environment.libraryImport.startUpdate({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  const savedItems = await assertOk(
    environment.collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );
  const absences = await assertOk(
    environment.libraryImportRepository.listAbsences({
      ownerScope: "local_profile:default",
      providerId: provider.id,
      providerAccountId: "fixture-account",
      currentBatchId: update.batchId,
    }),
  );
  const updateEvents = await assertOk(
    environment.events.listBySession({ sessionId: `library_import:${update.batchId}` }),
  );

  assert(update.batchKind === "library_update", "startUpdate should create a library update batch");
  assert(update.counts.alreadyPresentItems === 1, "update should count still-present saved items");
  assert(update.counts.importedItems === 1, "update should import newly observed items");
  assert(update.counts.absentItems === 1, "update should count platform absences");
  assert(update.absences?.[0]?.sourceRef.id === "missing-track", "update report should include absence summaries");
  assert(savedItems.length === 3, "update should not remove saved Collection items when the platform omits them");
  assert(absences.length === 1, "update should store absence records");
  assert(absences[0]?.sourceRef.id === "missing-track", "stored absence should identify the missing source ref");
  assert(
    updateEvents.some((event) => event.type === "library_import.item.not_returned"),
    "update should record not-returned item facts",
  );
}

async function doesNotPreviewUpdateAbsencesForPartialCurrentReads(): Promise<void> {
  const registry = createPluginRegistry();
  let providerItems = [
    providerItem("kept-track", "Kept Track"),
    providerItem("missing-track", "Missing Track"),
  ];
  let readStatus: "complete" | "partial" = "complete";
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
            },
          ],
        },
      };
    },
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "fixture-library",
          account: {
            providerAccountId: "fixture-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_recordings",
              status: readStatus,
              items: providerItems,
            },
          ],
        },
      };
    },
  };
  await assertOk(registry.registerProvider({ slot: "platform_library", providerId: provider.id, provider }));

  const environment = createTestLibraryImportEnvironment(registry);
  await assertOk(
    environment.libraryImport.startImport({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );
  providerItems = [providerItem("kept-track", "Kept Track")];
  readStatus = "partial";

  const preview = await assertOk(
    environment.libraryImport.previewUpdate({
      providerId: provider.id,
      scopes: ["saved_recordings"],
    }),
  );

  assert(
    preview.areas[0]?.updateEstimates?.noLongerReturned === 0,
    "partial update preview should not derive absences",
  );
  assert(preview.areas[0]?.absences === undefined, "partial update preview should not include absence summaries");
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
    canonicalStore,
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

function providerItem(id: string, label: string, canonicalHints?: PlatformLibraryItem["canonicalHints"]) {
  return {
    providerId: "fixture-library",
    sourceRef: sourceRef(id),
    itemKind: "saved_recording",
    targetKind: "recording",
    label,
    ...(canonicalHints === undefined ? {} : { canonicalHints }),
  } as const;
}

function sourceRef(id: string): Ref {
  return {
    namespace: "source:fixture-library",
    kind: "track",
    id,
  };
}

function artistSourceRef(id: string, label: string): Ref {
  return {
    namespace: "source:fixture-library",
    kind: "artist",
    id,
    label,
  };
}

function releaseSourceRef(id: string, label: string): Ref {
  return {
    namespace: "source:fixture-library",
    kind: "album",
    id,
    label,
  };
}

await previewsImportThroughRegisteredPlatformLibraryProvider();
await mapsMissingPlatformLibraryProviderToLibraryImportError();
await rejectsDiscoveryScopesForStartCalls();
await startsReadableImportBatchAndExposesStatus();
await marksStartedBatchFailedWhenProviderReadFails();
await estimatesReadableImportPreviewWithoutWritingMineMusicState();
await previewsDiscoveryWithoutReadingProviderItems();
await importsReadableItemsIntoMineMusicStateAndRecordsFacts();
await importsSameLabelDifferentSourceRefsAsSeparateProvisionalIdentities();
await cachesSavedCollectionMembershipDuringImportBatch();
await returnsStoredSummaryAfterServiceRecreation();
await doesNotStoreCompleteSnapshotForPartialImportReads();
await previewsLibraryUpdateAgainstLatestCompleteBaselineWithoutWriting();
await doesNotUseStableAccountBaselinesForUnstableUpdateReads();
await startsLibraryUpdateAndRecordsPlatformAbsencesWithoutRemovingCollections();
await doesNotPreviewUpdateAbsencesForPartialCurrentReads();
