import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CanonicalRecord,
  CollectionItem,
  ConfirmedCanonicalBinding,
  LibraryImportPreview,
  LibraryImportReport,
  PlatformLibraryItem,
  PlatformLibraryPreviewArea,
  PlatformLibraryProvider,
  PlatformLibraryReadAreaResult,
  Ref,
  Result,
  SourceProvider,
  StageSession,
} from "../../src/contracts/index.js";
import { createMineMusicStageCoreWithSourceProvider } from "../../src/stage_core/index.js";
import { codexToolNameFor, createMineMusicMcpToolDefinitions } from "../../src/surfaces/mcp/server.js";
import { createInMemoryLibraryImportRepository } from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

const session: StageSession = {
  id: "library-import-runtime-session",
  posture: "recommendation",
  activeInstruments: [],
};

async function importsPlatformLibraryThroughComposedStageCore(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-library-import-runtime-"));
  const libraryImportRepository = createInMemoryLibraryImportRepository();
  const importedSourceRef = sourceRef("runtime-track");
  const readInputs: Parameters<PlatformLibraryProvider["readItems"]>[0][] = [];
  const sourceProvider: SourceProvider = {
    id: "runtime-source-provider",
    async search() {
      return { ok: true, value: [] };
    },
    async getPlayableLinks() {
      return { ok: true, value: [] };
    },
  };
  const platformLibraryProvider: PlatformLibraryProvider = {
    id: "runtime-platform-library-provider",
    async preview() {
      return {
        ok: true,
        value: {
          providerId: "runtime-platform-library-provider",
          areas: [],
        },
      };
    },
    async readItems(input) {
      readInputs.push(input);
      return {
        ok: true,
        value: {
          providerId: "runtime-platform-library-provider",
          account: {
            providerAccountId: "runtime-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_source_tracks",
              status: "complete",
              items: [
                providerItem(importedSourceRef, "Runtime Imported Track", {
                  artistLabels: ["Runtime Artist"],
                  artistSourceRefs: [runtimeArtistSourceRef("runtime-artist", "Runtime Artist")],
                  releaseLabel: "Runtime Release",
                  releaseSourceRef: runtimeReleaseSourceRef("runtime-release", "Runtime Release"),
                  durationMs: 180000,
                }),
              ],
            },
          ],
        },
      };
    },
  };

  try {
    const stageCore = createMineMusicStageCoreWithSourceProvider({
      session,
      sourceProvider,
      platformLibraryProvider,
      libraryImportRepository,
      handbookPath: join(directory, "HANDBOOK.md"),
    });
    await stageCore.ready;

    const registeredSourceProvider = await assertOk(
      stageCore.plugins.getProvider({
        slot: "source",
        providerId: sourceProvider.id,
      }),
    );
    const registeredPlatformLibraryProvider = await assertOk(
      stageCore.plugins.getProvider({
        slot: "platform_library",
        providerId: platformLibraryProvider.id,
      }),
    );
    const report = await assertOk(
      stageCore.libraryImport.startImport({
        providerId: platformLibraryProvider.id,
        scopes: ["saved_source_tracks"],
      }),
    );
    const batches = await assertOk(libraryImportRepository.listBatches({}));
    const savedItems = await assertOk(
      stageCore.collection.listItems({
        ownerScope: "local_profile:default",
        collectionKind: "recording",
        relationKind: "saved",
      }),
    );
    const sourceEntity = await assertOk(
      stageCore.materialStore.getSourceEntity({
        sourceRef: importedSourceRef,
      }),
    );
    const sourceLibraryItems = await assertOk(
      stageCore.materialStore.listSourceLibraryItems({
        ownerScope: "local_profile:default",
        providerId: platformLibraryProvider.id,
        providerAccountId: "runtime-account",
      }),
    );
    const importEvents = await assertOk(
      stageCore.events.listBySession({
        sessionId: `library_import:${report.batchId}`,
      }),
    );

    assert(registeredSourceProvider === sourceProvider, "Stage Core should keep source provider registration separate");
    assert(
      registeredPlatformLibraryProvider === platformLibraryProvider,
      "Stage Core should register the platform-library provider separately",
    );
    assert(readInputs[0]?.areas.includes("saved_source_tracks"), "Library Import should read the requested provider area");
    assert(report.status === "completed_with_warnings", "unbound runtime import should complete with warnings");
    assert(report.counts.importedItems === 0, "Runtime Library Import should not write Collection without a confirmed binding");
    assert(report.counts.skippedItems === 1, "Runtime Library Import should report unbound source items as skipped");
    assert(report.counts.canonicalRecordsCreated === 0, "Runtime Library Import should not create canonical identity");
    assert(report.counts.collectionItemsAdded === 0, "Runtime Library Import should not save unbound source items");
    assert(
      batches.some((batch) => batch.id === report.batchId),
      "Runtime Library Import should use the injected import repository",
    );
    assert(savedItems.length === 0, "Runtime Library Import should leave Collection unchanged without a binding");
    assert(sourceEntity?.sourceRef.id === importedSourceRef.id, "Runtime Library Import should upsert a Source Entity");
    assert(sourceLibraryItems.length === 1, "Runtime Library Import should write Source Library state");
    assert(
      importEvents.map((event) => event.type).join(",") ===
        "library_import.batch.started,library_import.item.skipped,library_import.batch.completed",
      "Runtime Library Import should record factual import events",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function persistsLibraryImportStateThroughStageCoreDatabasePath(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-library-import-stage-core-sqlite-"));
  const databasePath = join(directory, "library-import.sqlite");
  const importedSourceRef = sourceRef("persisted-runtime-track");
  const platformLibraryProvider: PlatformLibraryProvider = {
    id: "runtime-platform-library-provider",
    async preview() {
      return {
        ok: true,
        value: {
          providerId: "runtime-platform-library-provider",
          areas: [],
        },
      };
    },
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "runtime-platform-library-provider",
          account: {
            providerAccountId: "runtime-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_source_tracks",
              status: "complete",
              items: [providerItem(importedSourceRef, "Persisted Runtime Track")],
            },
          ],
        },
      };
    },
  };

  try {
    const firstStageCore = createMineMusicStageCoreWithSourceProvider({
      session,
      sourceProvider: createEmptySourceProvider("sqlite-library-import-source-provider"),
      platformLibraryProvider,
      libraryImportDatabasePath: databasePath,
      handbookPath: join(directory, "first-HANDBOOK.md"),
    });
    await firstStageCore.ready;

    const report = await assertOk(
      firstStageCore.libraryImport.startImport({
        providerId: platformLibraryProvider.id,
        scopes: ["saved_source_tracks"],
      }),
    );

    const recreatedStageCore = createMineMusicStageCoreWithSourceProvider({
      session,
      sourceProvider: createEmptySourceProvider("sqlite-library-import-source-provider"),
      libraryImportDatabasePath: databasePath,
      handbookPath: join(directory, "second-HANDBOOK.md"),
    });
    await recreatedStageCore.ready;

    const status = await assertOk(recreatedStageCore.libraryImport.getStatus({ batchId: report.batchId }));
    const summary = await assertOk(recreatedStageCore.libraryImport.getSummary({ batchId: report.batchId }));

    assert(status.status === "completed_with_warnings", "recreated Stage Core should read persisted Library Import status");
    assert(summary.items[0]?.sourceRef.id === importedSourceRef.id, "persisted summary should keep item reports");
    assert(summary.areas[0]?.area === "saved_source_tracks", "persisted summary should keep area reports");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function coversFirstSliceImportAndUpdateThroughStageInterface(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-library-import-first-slice-"));
  const libraryImportRepository = createInMemoryLibraryImportRepository();
  const providerState = createPlatformLibraryProviderState();
  const sourceProvider = createEmptySourceProvider("first-slice-source-provider");
  const platformLibraryProvider = createStatefulPlatformLibraryProvider(providerState);
  const savedBoundRecord = canonicalRecording("saved-bound-recording", "Saved Bound Track", "saved-bound-track");
  const unsavedBoundRecord = canonicalRecording("unsaved-bound-recording", "Unsaved Bound Track", "unsaved-bound-track");

  try {
    const stageCore = createMineMusicStageCoreWithSourceProvider({
      session,
      sourceProvider,
      platformLibraryProvider,
      libraryImportRepository,
      canonicalRecords: [savedBoundRecord, unsavedBoundRecord],
      handbookPath: join(directory, "HANDBOOK.md"),
    });
    await stageCore.ready;
    await putRuntimeConfirmedBinding(stageCore, sourceRef("saved-bound-track"), savedBoundRecord.ref);
    await putRuntimeConfirmedBinding(stageCore, sourceRef("unsaved-bound-track"), unsavedBoundRecord.ref);
    await assertOk(
      stageCore.collection.addItemToSystemCollection({
        ownerScope: "local_profile:default",
        relationKind: "saved",
        canonicalRef: savedBoundRecord.ref,
        label: savedBoundRecord.label,
      }),
    );

    providerState.previewAreas = [
      readablePreviewArea("saved_source_tracks", 4),
      {
        area: "playlists",
        availability: "unsupported",
        issues: [
          {
            code: "scope_unsupported",
            message: "Playlists are outside the first Library Import slice.",
            area: "playlists",
            retryable: false,
          },
        ],
      },
    ];
    providerState.readAreas = [
      completeReadArea([
        runtimeProviderItem("saved-bound-track", "Saved Bound Track"),
        runtimeProviderItem("unsaved-bound-track", "Unsaved Bound Track"),
        runtimeProviderItem("new-strong-track", "New Strong Track"),
        runtimeProviderItem("weak-track", ""),
      ]),
    ];

    const discovery = await assertOk(
      stageCore.stageInterface.tools["library.import.preview"]({
        providerId: platformLibraryProvider.id,
        scopes: ["discovery"],
      }) as Promise<Result<LibraryImportPreview>>,
    );
    assert(
      providerState.readCalls.length === 0,
      "discovery preview should not read platform-library items",
    );
    assert(
      discovery.areas.some((area) => area.area === "playlists" && area.availability === "unsupported"),
      "discovery preview should expose unsupported provider areas",
    );

    const preview = await assertOk(
      stageCore.stageInterface.tools["library.import.preview"]({
        providerId: platformLibraryProvider.id,
        scopes: ["saved_source_tracks"],
      }) as Promise<Result<LibraryImportPreview>>,
    );
    const previewArea = preview.areas[0];

    assert(preview.ownerScope === "local_profile:default", "Stage Interface should default Library Import owner scope");
    assert(previewArea?.canonicalEstimates.alreadyBound === 2, "preview should estimate existing canonical bindings");
    assert(previewArea?.canonicalEstimates.wouldCreateProvisional === 0, "preview should not estimate provisional canonical creation");
    assert(previewArea?.canonicalEstimates.unresolved === 2, "preview should estimate unbound source items as unresolved");
    assert(previewArea?.collectionEstimates.alreadyPresent === 1, "preview should estimate existing Collection item");
    assert(previewArea?.collectionEstimates.wouldAdd === 1, "preview should estimate bound unsaved Collection item");
    assert(previewArea?.collectionEstimates.wouldAddAfterProvisional === 0, "preview should not estimate provisional Collection additions");
    assert(previewArea?.collectionEstimates.skipped === 2, "preview should estimate skipped unbound source items");

    const firstImport = await assertOk(
      stageCore.stageInterface.tools["library.import.start"]({
        providerId: platformLibraryProvider.id,
        scopes: ["saved_source_tracks"],
      }) as Promise<Result<LibraryImportReport>>,
    );
    const firstSnapshots = await assertOk(
      libraryImportRepository.listAreaSnapshots({
        batchId: firstImport.batchId,
        complete: true,
      }),
    );
    const firstProvenance = await assertOk(
      libraryImportRepository.listItemProvenance({
        providerId: platformLibraryProvider.id,
        providerAccountId: "runtime-account",
        ownerScope: "local_profile:default",
        scope: "saved_source_tracks",
      }),
    );
    const savedItemsAfterFirstImport = await listSavedRecordingItems(stageCore);
    assert(firstImport.status === "completed_with_warnings", "weak metadata should complete import with warnings");
    assert(firstImport.counts.alreadyPresentItems === 1, "initial import should count pre-existing saved items");
    assert(firstImport.counts.importedItems === 1, "initial import should add bound unsaved items only");
    assert(firstImport.counts.skippedItems === 2, "initial import should skip unbound source items");
    assert(firstImport.counts.canonicalRecordsReused === 2, "initial import should reuse existing canonical records");
    assert(firstImport.counts.canonicalRecordsCreated === 0, "initial import should not create provisional records");
    assert(firstImport.counts.collectionItemsAdded === 1, "initial import should save confirmed bound Collection items only");
    assert(savedItemsAfterFirstImport.length === 2, "initial import should save confirmed recordings only");
    assert(firstSnapshots[0]?.sourceRefs.length === 4, "initial import should store a complete baseline snapshot");
    assert(firstProvenance.length === 4, "initial import should store provenance for every observed item");

    const repeatedImport = await assertOk(
      stageCore.stageInterface.tools["library.import.start"]({
        providerId: platformLibraryProvider.id,
        scopes: ["saved_source_tracks"],
      }) as Promise<Result<LibraryImportReport>>,
    );
    const savedItemsAfterRepeatedImport = await listSavedRecordingItems(stageCore);

    assert(repeatedImport.counts.importedItems === 0, "repeated import should not import duplicate items");
    assert(repeatedImport.counts.alreadyPresentItems === 2, "repeated import should see existing confirmed saved items");
    assert(
      savedItemsAfterRepeatedImport.length === savedItemsAfterFirstImport.length,
      "repeated import should keep Collection membership idempotent",
    );

    providerState.previewAreas = [readablePreviewArea("saved_source_tracks", 4)];
    providerState.readAreas = [
      completeReadArea([
        runtimeProviderItem("saved-bound-track", "Saved Bound Track"),
        runtimeProviderItem("new-strong-track", "New Strong Track"),
        runtimeProviderItem("new-update-track", "New Update Track"),
        runtimeProviderItem("weak-update-track", ""),
      ]),
    ];
    const newUpdateCanonical = await assertOk(
      stageCore.canonical.createProvisional({
        kind: "recording",
        label: "New Update Track",
      }),
    );
    await putRuntimeConfirmedBinding(stageCore, sourceRef("new-update-track"), newUpdateCanonical.ref);

    const updatePreview = await assertOk(
      stageCore.stageInterface.tools["library.update.preview"]({
        providerId: platformLibraryProvider.id,
        scopes: ["saved_source_tracks"],
      }) as Promise<Result<LibraryImportPreview>>,
    );
    const updatePreviewArea = updatePreview.areas[0];

    assert(updatePreviewArea?.updateEstimates?.alreadyPresent === 1, "update preview should classify still-present bound items");
    assert(updatePreviewArea?.updateEstimates?.wouldAdd === 1, "update preview should classify newly observed items");
    assert(updatePreviewArea?.updateEstimates?.failedOrSkipped === 2, "update preview should classify unbound skipped items");
    assert(
      updatePreviewArea?.updateEstimates?.noLongerReturned === 2,
      "update preview should classify baseline items no longer returned",
    );

    const updateReport = await assertOk(
      stageCore.stageInterface.tools["library.update.start"]({
        providerId: platformLibraryProvider.id,
        scopes: ["saved_source_tracks"],
      }) as Promise<Result<LibraryImportReport>>,
    );
    const savedItemsAfterUpdate = await listSavedRecordingItems(stageCore);
    const absences = await assertOk(
      libraryImportRepository.listAbsences({
        currentBatchId: updateReport.batchId,
        providerId: platformLibraryProvider.id,
        providerAccountId: "runtime-account",
      }),
    );
    const updateEvents = await assertOk(
      stageCore.events.listBySession({
        sessionId: `library_import:${updateReport.batchId}`,
      }),
    );

    assert(updateReport.counts.alreadyPresentItems === 1, "update start should keep still-present bound items");
    assert(updateReport.counts.importedItems === 1, "update start should import newly observed items");
    assert(updateReport.counts.skippedItems === 2, "update start should skip unbound update items");
    assert(updateReport.counts.absentItems === 2, "update start should record no-longer-returned items");
    assert(absences.length === 2, "update start should store absence records for missing baseline refs");
    assert(
      savedItemsAfterUpdate.some((item) => item.canonicalRef.id === unsavedBoundRecord.ref.id),
      "update start should not remove Collection items no longer returned by the platform",
    );
    assert(
      savedItemsAfterUpdate.length === savedItemsAfterRepeatedImport.length + 1,
      "update start should add only the newly observed resolvable item",
    );
    assert(
      updateEvents.some((event) => event.type === "library_import.item.not_returned"),
      "update start should record factual not-returned events",
    );

    const mcpToolNames = createMineMusicMcpToolDefinitions(stageCore).map((definition) => definition.name);
    const libraryImportToolNames = [
      "library.import.preview",
      "library.import.start",
      "library.update.preview",
      "library.update.start",
      "library.import.status",
      "library.import.summary",
    ] as const;

    assert(
      libraryImportToolNames.every((toolName) => toolName in stageCore.stageInterface.tools),
      "Stage Interface should expose all Library Import tools",
    );
    assert(
      libraryImportToolNames.every((toolName) => mcpToolNames.includes(codexToolNameFor(toolName))),
      "MCP definitions should expose all Library Import tools",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function doesNotCreateAbsencesForPartialRuntimeUpdates(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-library-import-partial-update-"));
  const libraryImportRepository = createInMemoryLibraryImportRepository();
  const providerState = createPlatformLibraryProviderState();
  const platformLibraryProvider = createStatefulPlatformLibraryProvider(providerState);

  providerState.previewAreas = [readablePreviewArea("saved_source_tracks", 2)];
  providerState.readAreas = [
    completeReadArea([
      runtimeProviderItem("partial-kept-track", "Partial Kept Track"),
      runtimeProviderItem("partial-missing-track", "Partial Missing Track"),
    ]),
  ];

  try {
    const stageCore = createMineMusicStageCoreWithSourceProvider({
      session,
      sourceProvider: createEmptySourceProvider("partial-update-source-provider"),
      platformLibraryProvider,
      libraryImportRepository,
      handbookPath: join(directory, "HANDBOOK.md"),
    });
    await stageCore.ready;

    await assertOk(
      stageCore.stageInterface.tools["library.import.start"]({
        providerId: platformLibraryProvider.id,
        scopes: ["saved_source_tracks"],
      }) as Promise<Result<LibraryImportReport>>,
    );

    providerState.previewAreas = [readablePreviewArea("saved_source_tracks", 1)];
    providerState.readAreas = [
      {
        area: "saved_source_tracks",
        status: "partial",
        items: [runtimeProviderItem("partial-kept-track", "Partial Kept Track")],
        issues: [
          {
            code: "partial_read",
            message: "Only part of the provider library was returned.",
            area: "saved_source_tracks",
            retryable: true,
          },
        ],
      },
    ];

    const partialPreview = await assertOk(
      stageCore.stageInterface.tools["library.update.preview"]({
        providerId: platformLibraryProvider.id,
        scopes: ["saved_source_tracks"],
      }) as Promise<Result<LibraryImportPreview>>,
    );
    const partialReport = await assertOk(
      stageCore.stageInterface.tools["library.update.start"]({
        providerId: platformLibraryProvider.id,
        scopes: ["saved_source_tracks"],
      }) as Promise<Result<LibraryImportReport>>,
    );
    const absences = await assertOk(
      libraryImportRepository.listAbsences({
        currentBatchId: partialReport.batchId,
      }),
    );

    assert(
      partialPreview.areas[0]?.updateEstimates?.noLongerReturned === 0,
      "partial update preview should not derive absences",
    );
    assert(partialReport.counts.absentItems === 0, "partial update start should not count absences");
    assert(absences.length === 0, "partial update start should not store absence records");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

type MutablePlatformLibraryProviderState = {
  previewAreas: PlatformLibraryPreviewArea[];
  readAreas: PlatformLibraryReadAreaResult[];
  previewCalls: Parameters<PlatformLibraryProvider["preview"]>[0][];
  readCalls: Parameters<PlatformLibraryProvider["readItems"]>[0][];
};

function createPlatformLibraryProviderState(): MutablePlatformLibraryProviderState {
  return {
    previewAreas: [],
    readAreas: [],
    previewCalls: [],
    readCalls: [],
  };
}

function createStatefulPlatformLibraryProvider(
  state: MutablePlatformLibraryProviderState,
): PlatformLibraryProvider {
  return {
    id: "runtime-platform-library-provider",
    async preview(input) {
      state.previewCalls.push(input);

      return {
        ok: true,
        value: {
          providerId: "runtime-platform-library-provider",
          account: {
            providerAccountId: input.providerAccountId ?? "runtime-account",
            stable: true,
          },
          areas: structuredClone(state.previewAreas),
        },
      };
    },
    async readItems(input) {
      state.readCalls.push(input);

      return {
        ok: true,
        value: {
          providerId: "runtime-platform-library-provider",
          account: {
            providerAccountId: input.providerAccountId ?? "runtime-account",
            stable: true,
          },
          areas: structuredClone(
            state.readAreas.filter((area) => input.areas.includes(area.area)),
          ),
        },
      };
    },
  };
}

function createEmptySourceProvider(id: string): SourceProvider {
  return {
    id,
    async search() {
      return { ok: true, value: [] };
    },
    async getPlayableLinks() {
      return { ok: true, value: [] };
    },
  };
}

function canonicalRecording(id: string, label: string, sourceRefId: string): CanonicalRecord {
  return {
    ref: {
      namespace: "minemusic",
      kind: "recording",
      id,
      label,
    },
    kind: "recording",
    label,
    status: "active",
    sourceRefs: [sourceRef(sourceRefId)],
  };
}

function readablePreviewArea(area: "saved_source_tracks", count: number): PlatformLibraryPreviewArea {
  return {
    area,
    availability: "readable",
    count: {
      certainty: "exact",
      value: count,
    },
  };
}

function completeReadArea(items: PlatformLibraryItem[]): PlatformLibraryReadAreaResult {
  return {
    area: "saved_source_tracks",
    status: "complete",
    items,
  };
}

async function listSavedRecordingItems(
  stageCore: ReturnType<typeof createMineMusicStageCoreWithSourceProvider>,
): Promise<CollectionItem[]> {
  return assertOk(
    stageCore.collection.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );
}

async function putRuntimeConfirmedBinding(
  stageCore: ReturnType<typeof createMineMusicStageCoreWithSourceProvider>,
  sourceRefValue: Ref,
  canonicalRef: Ref,
): Promise<void> {
  const binding: ConfirmedCanonicalBinding = {
    sourceRef: sourceRefValue,
    canonicalRef,
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
  };

  await assertOk(stageCore.materialStore.putConfirmedCanonicalBinding({ binding }));
}

function runtimeProviderItem(id: string, label: string): PlatformLibraryItem {
  return providerItem(sourceRef(id), label);
}

function providerItem(
  sourceRefValue: Ref,
  label: string,
  canonicalHints?: PlatformLibraryItem["canonicalHints"],
): PlatformLibraryItem {
  return {
    providerId: "runtime-platform-library-provider",
    sourceRef: sourceRefValue,
    itemKind: "saved_source_track",
    targetKind: "recording",
    label,
    ...(canonicalHints === undefined ? {} : { canonicalHints }),
  };
}

function sourceRef(id: string): Ref {
  return {
    namespace: "source:runtime-platform-library",
    kind: "track",
    id,
  };
}

function runtimeArtistSourceRef(id: string, label: string): Ref {
  return {
    namespace: "source:runtime-platform-library",
    kind: "artist",
    id,
    label,
  };
}

function runtimeReleaseSourceRef(id: string, label: string): Ref {
  return {
    namespace: "source:runtime-platform-library",
    kind: "album",
    id,
    label,
  };
}

await importsPlatformLibraryThroughComposedStageCore();
await persistsLibraryImportStateThroughStageCoreDatabasePath();
await coversFirstSliceImportAndUpdateThroughStageInterface();
await doesNotCreateAbsencesForPartialRuntimeUpdates();
