import assert from "node:assert/strict";

import type { Ref, Result, StageError } from "../../src/contracts/kernel.js";
import type {
  PlatformLibraryCandidate,
} from "../../src/contracts/music_data_platform.js";
import type {
  LibraryImportDriveOutput,
  StageToolContext,
} from "../../src/contracts/stage_interface.js";
import type {
  SourceLibraryImportBatchRecord,
  SourceLibraryImportService,
  SourceLibraryImportResult,
  SourceLibraryReadPort,
} from "../../src/music_data_platform/index.js";
import {
  createLibraryImportContinueRegistration,
  createLibraryImportStartRegistration,
  createLibraryImportStatusRegistration,
  libraryImportContinueDescriptor,
  libraryImportInstrument,
  libraryImportStartDescriptor,
  libraryImportStatusDescriptor,
  type LibraryImportControlPort,
} from "../../src/music_data_platform/stage_adapter/index.js";
import {
  assertSampleOutputHasNoInternalAnchors,
  createStageInterface,
} from "../../src/stage_interface/index.js";
import {
  createLibraryImportServerRuntimeModule,
  type MusicDataPlatformRuntimeModule,
} from "../../src/server/index.js";

const now = "2026-06-18T00:00:00.000Z";
const libraryRef: Ref = {
  namespace: "source_library",
  kind: "saved_source_track",
  id: "local_netease_130950618_saved_source_track",
};
const sourceLibraryScope = {
  kind: "source_library" as const,
  id: "source_library_public_1",
  description: {
    label: "NetEase Cloud Music saved recording",
    targetKind: "recording" as const,
  },
};

assert.equal(libraryImportStartDescriptor.name, "library.import.start");
assert.equal(libraryImportStartDescriptor.sideEffect.durableUserStateWrite, true);
assert.equal(libraryImportStartDescriptor.sideEffect.externalCall, true);
assert.equal(libraryImportStartDescriptor.invocationPolicy.dataEgress, "provider_account");
assert.equal(libraryImportStartDescriptor.invocationPolicy.intakeDrivenByUserRequest, true);
assert.equal(libraryImportContinueDescriptor.name, "library.import.continue");
assert.equal(libraryImportContinueDescriptor.invocationPolicy.intakeDrivenByUserRequest, true);
assert.equal(libraryImportStatusDescriptor.name, "library.import.status");
assert.equal(libraryImportStatusDescriptor.sideEffect.durableUserStateWrite, false);
assert.equal(libraryImportStatusDescriptor.sideEffect.externalCall, false);
assert.equal(libraryImportStatusDescriptor.invocationPolicy.readOnlyHint, true);

{
  let startCalls = 0;
  const control = testControl({
    async startImport(input) {
      startCalls += 1;
      assert.deepEqual(input, {
        providerId: "netease",
        libraryKind: "saved_source_track",
        limit: 2,
      });

      return ok({
        batch: batchRecord({
          status: "running",
          libraryRef,
          processedCount: 2,
          importedCount: 1,
          alreadyPresentCount: 1,
        }),
        providerPage: {
          providerId: "netease",
          providerAccountId: "130950618",
          libraryKind: "saved_source_track",
          candidateCount: 2,
          nextCursor: "internal-provider-cursor",
          totalCountHint: 10,
        },
        itemResults: [
          itemResult("imported", 1),
          itemResult("already_present", 2),
        ],
      });
    },
  });
  const result = await interfaceFor(control).dispatch(testStageToolContext(), {
    toolName: "library.import.start",
    payload: {
      providerId: "netease",
      libraryKind: "saved_source_track",
      limit: 2,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(startCalls, 1);

  if (result.ok) {
    assert.deepEqual(result.value.result, {
      batchId: "batch-1",
      status: "running",
      sourceLibraryScope,
      totals: {
        imported: 1,
        alreadyPresent: 1,
        failed: 0,
      },
      page: {
        imported: 1,
        alreadyPresent: 1,
        failed: 0,
      },
      providerTotalCountHint: 10,
      hasMore: true,
    });
    assertSampleOutputHasNoInternalAnchors({
      label: "library.import.start result",
      output: result.value.result,
    });
    assertNoInternalImportKeys(result.value.result);
  }
}

{
  let startCalls = 0;
  const result = await interfaceFor(testControl({
    async startImport() {
      startCalls += 1;
      return error("music_data.invalid_source_library_import_input");
    },
  })).dispatch(testStageToolContext(), {
    toolName: "library.import.start",
    payload: {
      providerId: "netease",
      libraryKind: "saved_source_track",
      limit: 0,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(startCalls, 0);

  if (!result.ok) {
    assert.equal(result.error.code, "stage_interface.invalid_input");
  }
}

await assertStartError(
  error("extension.platform_library_provider_not_found"),
  "provider_not_found",
);
await assertStartError(
  error("extension.platform_library_provider_kind_unsupported"),
  "kind_unsupported",
);
await assertStartError(
  error("extension.platform_library_provider_read_failed", {
    cause: stageError("extension.ncm_malformed_response"),
  }),
  "provider_response_invalid",
);
await assertStartError(
  error("music_data.source_library_account_unresolved"),
  "account_unavailable",
);
await assertStartError(
  error("music_data.source_library_import_write_failed"),
  "write_failed",
);

{
  const result = await interfaceFor(testControl({
    async continueImport() {
      return ok({
        batch: batchRecord({
          status: "completed",
          libraryRef,
          processedCount: 8,
          importedCount: 5,
          alreadyPresentCount: 3,
        }),
        itemResults: [],
      });
    },
  })).dispatch(testStageToolContext(), {
    toolName: "library.import.continue",
    payload: {
      batchId: "batch-1",
      limit: 5,
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    const output = result.value.result as LibraryImportDriveOutput;

    assert.deepEqual(output.totals, {
      imported: 5,
      alreadyPresent: 3,
      failed: 0,
    });
    assert.equal(output.status, "completed");
    assert.equal(output.hasMore, false);
    assert.equal("page" in output, false);
    assert.equal("providerTotalCountHint" in output, false);
    assertNoInternalImportKeys(output);
  }
}

await assertContinueError(
  error("music_data.source_library_import_batch_not_found"),
  "batch_not_found",
);
await assertContinueError(
  error("music_data.source_library_import_batch_failed"),
  "batch_failed",
);

{
  let startCalls = 0;
  let continueCalls = 0;
  let statusCalls = 0;
  const result = await interfaceFor(testControl({
    async startImport() {
      startCalls += 1;
      throw new Error("status must not call startImport");
    },
    async continueImport() {
      continueCalls += 1;
      throw new Error("status must not call continueImport");
    },
    getStatus(input) {
      statusCalls += 1;
      assert.deepEqual(input, {
        batchId: "batch-1",
      });

      return batchRecord({
        status: "failed",
        libraryRef,
        processedCount: 4,
        importedCount: 2,
        alreadyPresentCount: 1,
        failedCount: 1,
        failureCode: "music_data.source_library_import_write_failed",
        failureMessage: "internal storage detail",
      });
    },
  })).dispatch(testStageToolContext(), {
    toolName: "library.import.status",
    payload: {
      batchId: "batch-1",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(startCalls, 0);
  assert.equal(continueCalls, 0);
  assert.equal(statusCalls, 1);

  if (result.ok) {
    assert.deepEqual(result.value.result, {
      batchId: "batch-1",
      status: "failed",
      sourceLibraryScope,
      totals: {
        imported: 2,
        alreadyPresent: 1,
        failed: 1,
      },
      hasMore: false,
      failureCategories: [
        {
          category: "write_failed",
          count: 1,
        },
      ],
    });
    assertNoInternalImportKeys(result.value.result);
  }
}

{
  const result = await interfaceFor(testControl({
    getStatus() {
      return undefined;
    },
  })).dispatch(testStageToolContext(), {
    toolName: "library.import.status",
    payload: {
      batchId: "missing-batch",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, "batch_not_found");
  }
}

{
  let serviceStartCalls = 0;
  let statusReadCalls = 0;
  const serverModule = createLibraryImportServerRuntimeModule({
    extensionRuntime: {
      listPlatformLibraryProviders() {
        return [{
          pluginId: "test-plugin",
          providerId: "netease",
          provider: {
            descriptor: {
              providerId: "netease",
              label: "NetEase Cloud Music",
              accountRequired: true,
              libraryKinds: ["saved_source_track"],
            },
            async read() {
              throw new Error("server wiring test must not read provider directly");
            },
          },
        }];
      },
    },
    musicDataPlatformModule: musicDataPlatformModuleFor({
      importService: {
        async startImport() {
          serviceStartCalls += 1;
          return ok({
            batch: batchRecord({
              status: "completed",
              libraryRef,
              processedCount: 1,
              importedCount: 1,
            }),
            itemResults: [
              itemResult("imported", 1),
            ],
          });
        },
        async continueImport() {
          throw new Error("server wiring start test must not continue import");
        },
      },
      readPort: {
        getImportBatch() {
          statusReadCalls += 1;
          return batchRecord({
            status: "completed",
            libraryRef,
            processedCount: 1,
            importedCount: 1,
          });
        },
        listSourceLibraries() {
          return [];
        },
      },
    }),
  });
  const initialized = await serverModule.initialize({});

  assert.equal(initialized.ok, true);

  if (initialized.ok) {
    const serverInterface = createStageInterface({
      instruments: initialized.value.instruments ?? [],
      registrations: initialized.value.tools ?? [],
    });
    const start = await serverInterface.dispatch(testStageToolContext(), {
      toolName: "library.import.start",
      payload: {
        providerId: "netease",
        libraryKind: "saved_source_track",
      },
    });
    const status = await serverInterface.dispatch(testStageToolContext(), {
      toolName: "library.import.status",
      payload: {
        batchId: "batch-1",
      },
    });

    assert.equal(start.ok, true);
    assert.equal(status.ok, true);
    assert.equal(serviceStartCalls, 1);
    assert.equal(statusReadCalls, 1);

    if (start.ok) {
      const output = start.value.result as LibraryImportDriveOutput;

      assert.equal(output.sourceLibraryScope?.kind, "source_library");
      assert.equal(output.sourceLibraryScope?.id.startsWith("source_library_"), true);
      assert.equal(output.sourceLibraryScope?.description.label, "NetEase Cloud Music saved recording");
    }
  }
}

function interfaceFor(control: LibraryImportControlPort) {
  return createStageInterface({
    instruments: [libraryImportInstrument],
    registrations: [
      createLibraryImportStartRegistration({ control }),
      createLibraryImportContinueRegistration({ control }),
      createLibraryImportStatusRegistration({ control }),
    ],
  });
}

function testControl(
  overrides: Partial<LibraryImportControlPort>,
): LibraryImportControlPort {
  return {
    async startImport() {
      throw new Error("unexpected startImport call");
    },
    async continueImport() {
      throw new Error("unexpected continueImport call");
    },
    getStatus() {
      throw new Error("unexpected getStatus call");
    },
    sourceLibraryScopeForBatch({ batch }) {
      return batch.libraryRef === undefined ? undefined : sourceLibraryScope;
    },
    ...overrides,
  };
}

function musicDataPlatformModuleFor(input: {
  importService: SourceLibraryImportService;
  readPort: SourceLibraryReadPort;
}): MusicDataPlatformRuntimeModule {
  return {
    descriptor: {
      id: "music-data-platform",
      ownerArea: "music_data_platform",
    },
    async initialize() {
      return {
        ok: true,
        value: {},
      };
    },
    sourceLibraryImport() {
      return input.importService;
    },
    sourceLibraryRead() {
      return input.readPort;
    },
    retrievalQuery() {
      return undefined;
    },
    musicScopeAvailability() {
      return undefined;
    },
    candidateCommit() {
      return undefined;
    },
    materialProjection() {
      return undefined;
    },
  };
}

async function assertStartError(
  failure: Result<SourceLibraryImportResult>,
  expectedCode: string,
): Promise<void> {
  const result = await interfaceFor(testControl({
    async startImport() {
      return failure;
    },
  })).dispatch(testStageToolContext(), {
    toolName: "library.import.start",
    payload: {
      providerId: "netease",
      libraryKind: "saved_source_track",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, expectedCode);
  }
}

async function assertContinueError(
  failure: Result<SourceLibraryImportResult>,
  expectedCode: string,
): Promise<void> {
  const result = await interfaceFor(testControl({
    async continueImport() {
      return failure;
    },
  })).dispatch(testStageToolContext(), {
    toolName: "library.import.continue",
    payload: {
      batchId: "batch-1",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, expectedCode);
  }
}

function batchRecord(
  overrides: Partial<SourceLibraryImportBatchRecord> = {},
): SourceLibraryImportBatchRecord {
  return {
    batchId: "batch-1",
    ownerScope: "local",
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    status: "running",
    processedCount: 0,
    importedCount: 0,
    alreadyPresentCount: 0,
    failedCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function itemResult(
  outcome: "imported" | "already_present" | "failed",
  sequence: number,
) {
  return {
    candidate: platformCandidate(`track-${sequence}`),
    outcome: {
      batchId: "batch-1",
      sequence,
      outcome,
      createdAt: now,
      ...(outcome === "failed" ? { errorCode: "music_data.test_failure" } : {}),
    },
  };
}

function platformCandidate(id: string): PlatformLibraryCandidate {
  return {
    libraryKind: "saved_source_track",
    providerAccountId: "130950618",
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

function ok<T>(value: T): Result<T> {
  return {
    ok: true,
    value,
  };
}

function error(
  code: string,
  input: {
    cause?: StageError;
  } = {},
): Result<never> {
  return {
    ok: false,
    error: stageError(code, input),
  };
}

function stageError(
  code: string,
  input: {
    cause?: StageError;
  } = {},
): StageError {
  return {
    code,
    message: `${code} test failure`,
    area: code.startsWith("extension.") ? "extension" : "music_data_platform",
    retryable: true,
    ...(input.cause === undefined ? {} : { cause: input.cause }),
  };
}

function assertNoInternalImportKeys(output: unknown): void {
  const serialized = JSON.stringify(output);

  for (const key of [
    "providerAccountId",
    "sourceRef",
    "libraryRef",
    "materialRef",
    "providerEntityId",
    "cursor",
    "nextCursor",
    "completionReason",
    "failureCode",
    "failureMessage",
  ]) {
    assert.equal(serialized.includes(key), false, key);
  }
}

function testStageToolContext(): StageToolContext {
  return {
    ownerScope: "local",
    sessionId: "library-import-control-test-session",
    requestId: "library-import-control-test-request",
    clock: () => now,
    handleMinting: {
      async mint() {
        return "unused-handle";
      },
      async resolve() {
        return undefined;
      },
    },
    providerAvailability: {
      async isProviderAvailable() {
        return true;
      },
    },
    executionGate: {
      async preflight() {
        return {
          decision: "allow",
          auditLevel: "metadata",
        };
      },
    },
  };
}
