import assert from "node:assert/strict";

import type { Result, StageError } from "../../src/contracts/kernel.js";
import type {
  PlatformLibraryProviderRegistration,
  ExtensionRuntime,
  ExtensionRuntimeSnapshot,
} from "../../src/extension/index.js";
import type {
  PlatformLibraryCandidate,
  PlatformLibraryReadInput,
  PlatformLibraryReadResult,
} from "../../src/contracts/music_data_platform.js";
import type {
  LibraryImportDriveOutput,
  LibraryImportStatusOutput,
} from "../../src/contracts/stage_interface.js";
import {
  createLibraryImportServerRuntimeModule,
  createMusicDataPlatformRuntimeModule,
} from "../../src/server/index.js";
import {
  createStageInterface,
  createStageToolContext,
} from "../../src/stage_interface/index.js";
import {
  SqliteMusicDatabase,
} from "../../src/storage/index.js";

const now = "2026-06-18T00:00:00.000Z";
const database = SqliteMusicDatabase.open({
  filename: ":memory:",
});
let providerReadIndex = 0;
const extensionRuntime = extensionRuntimeForPages([
  ["old-track", "keep-track"],
  ["keep-track"],
]);
const musicDataPlatformModule = createMusicDataPlatformRuntimeModule({
  extensionRuntime,
  database,
  config: {
    projectionMaintenance: {
      enabled: false,
    },
  },
});
const initializedMdp = await musicDataPlatformModule.initialize({});

assert.equal(initializedMdp.ok, true);

const serverModule = createLibraryImportServerRuntimeModule({
  extensionRuntime,
  musicDataPlatformModule,
});
const initializedServerModule = await serverModule.initialize({});

assert.equal(initializedServerModule.ok, true);

if (initializedServerModule.ok) {
  const stageInterface = createStageInterface({
    instruments: initializedServerModule.value.instruments ?? [],
    registrations: initializedServerModule.value.tools ?? [],
  });
  const ctx = createStageToolContext({
    ownerScope: "local",
    sessionId: "library-import-agent-path-test",
    requestId: "library-import-agent-path-test-request",
    clock: () => now,
  });
  const firstImport = await stageInterface.dispatch(ctx, {
    toolName: "library.import.start",
    payload: {
      providerId: "netease",
      libraryKind: "saved_source_track",
      limit: 10,
    },
  });

  assert.equal(firstImport.ok, true);
  assert.deepEqual(sourceLibraryItemKeys(), [
    "source_netease:track:keep-track",
    "source_netease:track:old-track",
  ]);

  const secondImport = await stageInterface.dispatch(ctx, {
    toolName: "library.import.start",
    payload: {
      providerId: "netease",
      libraryKind: "saved_source_track",
      limit: 10,
    },
  });

  assert.equal(secondImport.ok, true);
  let secondBatchId: string | undefined;

  if (secondImport.ok) {
    const output = secondImport.value.result as LibraryImportDriveOutput;

    secondBatchId = output.batchId;
    assert.equal(output.status, "completed");
    assert.equal(output.hasMore, false);
    assert.deepEqual(output.totals, {
      imported: 0,
      alreadyPresent: 1,
      failed: 0,
    });
    assert.equal(output.sourceLibraryScope?.kind, "source_library");
  }

  assert.deepEqual(sourceLibraryItemKeys(), [
    "source_netease:track:keep-track",
  ]);

  const secondStatus = await stageInterface.dispatch(ctx, {
    toolName: "library.import.status",
    payload: {
      batchId: secondBatchId,
    },
  });

  assert.equal(secondStatus.ok, true);

  if (secondStatus.ok) {
    const output = secondStatus.value.result as LibraryImportStatusOutput;

    assert.equal(output.status, "completed");
    assert.equal(output.hasMore, false);
    assert.equal("page" in output, false);
  }
}

const stopped = await musicDataPlatformModule.stop?.();

assert.equal(stopped?.ok, true);
database.close();

function extensionRuntimeForPages(
  pages: readonly (readonly string[])[],
): ExtensionRuntime {
  const snapshot: ExtensionRuntimeSnapshot = {
    status: "ready",
    pluginIds: ["test-plugin"],
    sourceProviderCount: 0,
    platformLibraryProviderCount: 1,
  };
  const registration: PlatformLibraryProviderRegistration = {
    pluginId: "test-plugin",
    providerId: "netease",
    provider: {
      descriptor: {
        providerId: "netease",
        label: "NetEase Cloud Music",
        accountRequired: true,
        libraryKinds: ["saved_source_track"],
      },
      read(input) {
        return Promise.resolve(readPlatformLibrary(input));
      },
    },
  };

  return {
    async initialize() {
      return ok(snapshot);
    },
    async stop() {
      return ok(undefined);
    },
    snapshot() {
      return snapshot;
    },
    listSourceProviders() {
      return [];
    },
    getSourceProvider() {
      return undefined;
    },
    async searchSourceProvider() {
      return error("extension.source_provider_not_found");
    },
    listPlatformLibraryProviders() {
      return [registration];
    },
    getPlatformLibraryProvider(providerId) {
      return providerId === "netease" ? registration : undefined;
    },
    readPlatformLibraryProvider(input) {
      return Promise.resolve(readPlatformLibrary(input.request));
    },
  };

  function readPlatformLibrary(
    input: PlatformLibraryReadInput,
  ): Result<PlatformLibraryReadResult> {
    const ids = pages[providerReadIndex] ?? [];
    providerReadIndex += 1;

    return ok({
      providerId: "netease",
      providerAccountId: "test-account",
      kind: input.kind,
      candidates: ids.map(platformCandidate),
      totalCountHint: ids.length,
    });
  }
}

function platformCandidate(id: string): PlatformLibraryCandidate {
  return {
    libraryKind: "saved_source_track",
    providerAccountId: "test-account",
    sourceEntity: {
      kind: "track",
      sourceRef: {
        namespace: "source_netease",
        kind: "track",
        id,
      },
      providerId: "netease",
      providerEntityId: id,
      label: `Track ${id}`,
      title: `Track ${id}`,
    },
  };
}

function sourceLibraryItemKeys(): readonly string[] {
  return database.context().all<{ source_ref_key: string }>(
    `
      SELECT source_ref_key
      FROM source_library_items
      ORDER BY source_ref_key ASC
    `,
  ).map((row) => row.source_ref_key);
}

function ok<T>(value: T): Result<T> {
  return {
    ok: true,
    value,
  };
}

function error<T = never>(code: string): Result<T> {
  const stageError: StageError = {
    code,
    message: code,
    area: "extension",
    retryable: false,
  };

  return {
    ok: false,
    error: stageError,
  };
}
