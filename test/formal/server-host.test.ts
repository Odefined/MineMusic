import assert from "node:assert/strict";

import type { StageError } from "../../src/contracts/kernel.js";
import type {
  ExtensionRuntime,
  ExtensionRuntimeSnapshot,
} from "../../src/extension/index.js";
import {
  isMusicIntelligenceError,
  type MusicIntelligenceErrorCode,
} from "../../src/music_intelligence/index.js";
import {
  createExtensionRuntimeRetrievalProviderSearchPort,
  createMineMusicExtensionRuntime,
  createServerHost,
} from "../../src/server/index.js";

const host = createServerHost({
  config: {
    projectionMaintenance: {
      enabled: false,
    },
  },
});

assert.equal(host.snapshot().status, "created");
assert.equal(host.snapshot().interfaceContract.tools.length, 0);
assert.deepEqual(host.snapshot().modules.map((module) => module.id), [
  "music-data-platform",
  "extension",
  "runtime-status",
]);
assert.equal(host.sourceLibraryImport(), undefined);
assert.equal(host.retrievalQuery(), undefined);

const started = await host.start();

assert.equal(started.ok, true);
assert.equal(host.snapshot().status, "ready");
assert.equal(host.sourceLibraryImport() === undefined, false);
assert.equal(host.retrievalQuery() === undefined, false);
assert.deepEqual(host.snapshot().modules.map(({ id, ownerArea, status }) => ({
  id,
  ownerArea,
  status,
})), [
  {
    id: "music-data-platform",
    ownerArea: "music_data_platform",
    status: "initialized",
  },
  {
    id: "extension",
    ownerArea: "extension",
    status: "initialized",
  },
  {
    id: "runtime-status",
    ownerArea: "stage_core",
    status: "initialized",
  },
]);
assert.equal(host.snapshot().interfaceContract.tools[0]?.name, "stage.runtime.status");
assert.equal(host.snapshot().interfaceContract.tools.length, 1);

const stopped = await host.stop();

assert.equal(stopped.ok, true);
assert.equal(host.snapshot().status, "stopped");
assert.equal(host.retrievalQuery(), undefined);
assert.deepEqual(host.snapshot().modules.map(({ id, ownerArea, status }) => ({
  id,
  ownerArea,
  status,
})), [
  {
    id: "music-data-platform",
    ownerArea: "music_data_platform",
    status: "stopped",
  },
  {
    id: "extension",
    ownerArea: "extension",
    status: "stopped",
  },
  {
    id: "runtime-status",
    ownerArea: "stage_core",
    status: "stopped",
  },
]);

const stoppedAgain = await host.stop();

assert.equal(stoppedAgain.ok, true);
assert.equal(host.snapshot().status, "stopped");

let probedNcm = false;
const configuredExtensionRuntime = createMineMusicExtensionRuntime({
  plugins: {
    "minemusic.ncm": {
      baseUrl: "http://unavailable.ncm.test",
      fetch: async () => {
        probedNcm = true;
        throw new Error("NCM should not be probed during initialization.");
      },
    },
  },
});
const configuredExtensionStarted = await configuredExtensionRuntime.initialize();

assert.equal(configuredExtensionStarted.ok, true);
assert.equal(probedNcm, false);
assert.deepEqual(configuredExtensionRuntime.listSourceProviders().map((provider) => provider.providerId), [
  "netease",
]);
assert.deepEqual(configuredExtensionRuntime.listPlatformLibraryProviders().map((provider) => provider.providerId), [
  "netease",
]);

for (const [extensionCode, musicIntelligenceCode] of [
  ["extension.source_provider_not_found", "music_intelligence.provider_search_unavailable"],
  ["extension.source_provider_search_unsupported", "music_intelligence.provider_search_unavailable"],
  ["extension.runtime_not_ready", "music_intelligence.provider_search_unavailable"],
  ["extension.invalid_source_provider_search_input", "music_intelligence.provider_search_pool_invalid"],
  ["extension.invalid_source_provider_search_output", "music_intelligence.provider_search_result_invalid"],
  ["extension.source_provider_search_failed", "music_intelligence.provider_search_failed"],
] as const) {
  const providerSearch = createExtensionRuntimeRetrievalProviderSearchPort({
    extensionRuntime: extensionRuntimeWithSearch(async () => ({
      ok: false,
      error: stageError(extensionCode),
    })),
  });

  await assertMusicIntelligenceProviderSearchError(
    () => providerSearch.search({
      providerId: "netease",
      query: {
        text: "plainsong",
      },
    }),
    musicIntelligenceCode,
  );
}

function extensionRuntimeWithSearch(
  searchSourceProvider: ExtensionRuntime["searchSourceProvider"],
): ExtensionRuntime {
  const snapshot: ExtensionRuntimeSnapshot = {
    status: "created",
    pluginIds: [],
    sourceProviderCount: 0,
    platformLibraryProviderCount: 0,
  };

  return {
    initialize: async () => ({
      ok: true,
      value: snapshot,
    }),
    stop: async () => ({
      ok: true,
      value: undefined,
    }),
    snapshot: () => ({
      status: "ready",
      pluginIds: [],
      sourceProviderCount: 0,
      platformLibraryProviderCount: 0,
    }),
    listSourceProviders: () => [],
    getSourceProvider: () => undefined,
    searchSourceProvider,
    listPlatformLibraryProviders: () => [],
    getPlatformLibraryProvider: () => undefined,
    readPlatformLibraryProvider: async () => ({
      ok: false,
      error: stageError("extension.platform_library_provider_not_found"),
    }),
  };
}

function stageError(code: string): StageError {
  return {
    code,
    message: code,
    area: "extension",
    retryable: false,
  };
}

async function assertMusicIntelligenceProviderSearchError(
  run: () => Promise<unknown>,
  code: MusicIntelligenceErrorCode,
): Promise<void> {
  let thrown: unknown;

  try {
    await run();
  } catch (error) {
    thrown = error;
  }

  assert.equal(isMusicIntelligenceError(thrown) && thrown.code === code, true);
}
