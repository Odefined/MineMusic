import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CollectionItem,
  PlatformLibraryItem,
  PlatformLibraryProvider,
  Ref,
  Result,
  SourceProvider,
  StageSession,
} from "../../src/contracts/index.js";
import { createMineMusicStageCoreWithSourceProvider } from "../../src/stage_core/index.js";
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
  activeInstruments: ["minemusic.mvp"],
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
              area: "saved_recordings",
              status: "complete",
              items: [providerItem(importedSourceRef, "Runtime Imported Track")],
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
        scopes: ["saved_recordings"],
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
    const canonicalRecord = await assertOk(
      stageCore.canonical.resolveExternalRef({
        ref: importedSourceRef,
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
    assert(readInputs[0]?.areas.includes("saved_recordings"), "Library Import should read the requested provider area");
    assert(report.status === "completed", "Runtime Library Import should complete a clean import");
    assert(report.counts.importedItems === 1, "Runtime Library Import should import the provider item");
    assert(report.counts.canonicalRecordsCreated === 1, "Runtime Library Import should create canonical identity");
    assert(report.counts.collectionItemsAdded === 1, "Runtime Library Import should save imported canonical identity");
    assert(
      batches.some((batch) => batch.id === report.batchId),
      "Runtime Library Import should use the injected import repository",
    );
    assert(
      savedItems.some((item: CollectionItem) => item.canonicalRef.id === canonicalRecord?.ref.id),
      "Runtime Library Import should write through the composed Collection Service",
    );
    assert(
      canonicalRecord?.externalKeys?.some((ref) => ref.id === importedSourceRef.id),
      "Runtime Library Import should bind the imported source ref through Canonical Store",
    );
    assert(
      importEvents.map((event) => event.type).join(",") ===
        "library_import.batch.started,library_import.item.imported,library_import.batch.completed",
      "Runtime Library Import should record factual import events",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function providerItem(sourceRefValue: Ref, label: string): PlatformLibraryItem {
  return {
    providerId: "runtime-platform-library-provider",
    sourceRef: sourceRefValue,
    itemKind: "saved_recording",
    targetKind: "recording",
    label,
  };
}

function sourceRef(id: string): Ref {
  return {
    namespace: "source:runtime-platform-library",
    kind: "track",
    id,
  };
}

await importsPlatformLibraryThroughComposedStageCore();
