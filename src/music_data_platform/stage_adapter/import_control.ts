import type { Result, StageError } from "../../contracts/kernel.js";
import {
  libraryImportContinueInputSchema,
  libraryImportDriveOutputSchema,
  libraryImportStartInputSchema,
  libraryImportStatusInputSchema,
  libraryImportStatusOutputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import type {
  LibraryImportContinueInput,
  LibraryImportCounts,
  LibraryImportDriveOutput,
  LibraryImportFailureCategory,
  LibraryImportFailureCategoryCount,
  LibraryImportSourceLibraryScope,
  LibraryImportStartInput,
  LibraryImportStatusInput,
  LibraryImportStatusOutput,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import type {
  SourceLibraryImportBatchRecord,
  SourceLibraryImportItemOutcomeRecord,
  SourceLibraryImportItemResult,
  SourceLibraryImportResult,
} from "../index.js";
import {
  isSourceLibraryImportWriteFailure,
} from "../index.js";
import {
  libraryImportInstrument,
} from "./list_sources.js";

export type LibraryImportControlPort = {
  startImport(input: LibraryImportStartInput): Promise<Result<SourceLibraryImportResult>>;
  continueImport(input: LibraryImportContinueInput): Promise<Result<SourceLibraryImportResult>>;
  getStatus(input: LibraryImportStatusInput): Promise<SourceLibraryImportBatchRecord | undefined>;
  sourceLibraryScopeForBatch(input: {
    batch: SourceLibraryImportBatchRecord;
  }): LibraryImportSourceLibraryScope | undefined;
};

export type CreateLibraryImportControlRegistrationInput = {
  control: LibraryImportControlPort;
};

export const libraryImportStartDescriptor: ToolDeclaration = {
  name: "library.import.start",
  instrumentId: libraryImportInstrument.id,
  label: "Start Library Import",
  ownerArea: "music_data_platform",
  description: "Start importing one provider library area into the owner's MineMusic library.",
  usage: {
    useWhen: "Use after library.import.list_sources when the user asks to import a provider library and the agent has a valid providerId and libraryKind.",
    doNotUseWhen: "Do not use to search, browse, diagnose provider cookies, inspect raw provider pages, or import a provider/library kind not returned by library.import.list_sources.",
    outputSemantics: "Returns a compact import batch summary and public source-library scope when resolved; it does not expose provider cursors, account ids, raw source refs, item payloads, or storage rows.",
  },
  examples: [
    {
      prompt: "import my NetEase liked songs",
      expects: "call",
      note: "call library.import.list_sources first if the providerId or libraryKind is not already known",
    },
    {
      prompt: "find songs named whoo",
      expects: "avoid",
      note: "music discovery lookup owns search",
    },
  ],
  sideEffect: {
    durableUserStateWrite: true,
    runtimeStateWrite: false,
    externalCall: true,
  },
  invocationPolicy: {
    defaultDecision: "auto",
    dataEgress: "provider_account",
    readOnlyHint: false,
    destructiveHint: false,
    intakeDrivenByUserRequest: true,
  },
  inputSchema: libraryImportStartInputSchema,
  outputSchema: libraryImportDriveOutputSchema,
  errors: [
    {
      code: "invalid_input",
      retryable: false,
      suggestedFixTemplate: "Retry with providerId, libraryKind, and optional integer limit from 1 through 100.",
    },
    {
      code: "provider_not_found",
      retryable: true,
      suggestedFixTemplate: "Call library.import.list_sources and retry with an available providerId.",
    },
    {
      code: "kind_unsupported",
      retryable: false,
      suggestedFixTemplate: "Call library.import.list_sources and choose a libraryKind supported by that provider.",
    },
    {
      code: "owner_scope_unsupported",
      retryable: false,
      suggestedFixTemplate: "Retry from the supported local owner scope.",
    },
    {
      code: "provider_unavailable",
      retryable: true,
      suggestedFixTemplate: "Retry later after the provider account and network are available.",
    },
    {
      code: "provider_response_invalid",
      retryable: true,
      suggestedFixTemplate: "Retry later; if it repeats, refresh the provider integration before importing again.",
    },
    {
      code: "account_unavailable",
      retryable: true,
      suggestedFixTemplate: "Reconnect or refresh the provider account, then retry the import.",
    },
    {
      code: "write_failed",
      retryable: true,
      suggestedFixTemplate: "Retry later after local storage is available.",
    },
  ],
  resultSummary: importBatchSummary,
};

export const libraryImportContinueDescriptor: ToolDeclaration = {
  ...libraryImportStartDescriptor,
  name: "library.import.continue",
  label: "Continue Library Import",
  description: "Continue an existing library import batch by reading and importing the next provider page.",
  usage: {
    useWhen: "Use when library.import.start or a previous library.import.continue returned hasMore true for a batchId.",
    doNotUseWhen: "Do not use to restart a new provider library import, inspect raw cursors, search imported music, or continue a failed batch before checking status.",
    outputSemantics: "Returns the same compact import batch summary as start; it advances by batchId without exposing provider cursors or raw rows.",
  },
  examples: [
    {
      prompt: "keep importing the rest of that batch",
      expects: "call",
    },
    {
      prompt: "import my NetEase liked songs from scratch",
      expects: "avoid",
      note: "use library.import.start for a new import batch",
    },
  ],
  inputSchema: libraryImportContinueInputSchema,
  errors: [
    ...libraryImportStartDescriptor.errors,
    {
      code: "batch_not_found",
      retryable: true,
      suggestedFixTemplate: "Retry with a batchId returned by library.import.start, or start a new import.",
    },
    {
      code: "batch_failed",
      retryable: false,
      suggestedFixTemplate: "Call library.import.status for the failed batch summary, then start a new import if needed.",
    },
  ],
};

export const libraryImportStatusDescriptor: ToolDeclaration = {
  name: "library.import.status",
  instrumentId: libraryImportInstrument.id,
  label: "Library Import Status",
  ownerArea: "music_data_platform",
  description: "Read the compact status of an existing library import batch.",
  usage: {
    useWhen: "Use to check whether an import batch is running, completed, or failed without reading provider data.",
    doNotUseWhen: "Do not use to start or advance provider import pages, inspect provider cursors, or search imported music.",
    outputSemantics: "Returns durable batch totals and public source-library scope when resolved; it omits page counts, cursors, raw provider data, and storage internals.",
  },
  examples: [
    {
      prompt: "what happened to that import batch?",
      expects: "call",
    },
    {
      prompt: "continue importing the next page",
      expects: "avoid",
      note: "use library.import.continue when hasMore is true",
    },
  ],
  sideEffect: {
    durableUserStateWrite: false,
    runtimeStateWrite: false,
    externalCall: false,
  },
  invocationPolicy: {
    defaultDecision: "auto",
    dataEgress: "none",
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: libraryImportStatusInputSchema,
  outputSchema: libraryImportStatusOutputSchema,
  errors: [
    {
      code: "invalid_input",
      retryable: false,
      suggestedFixTemplate: "Retry with a non-empty batchId.",
    },
    {
      code: "batch_not_found",
      retryable: true,
      suggestedFixTemplate: "Retry with a batchId returned by library.import.start, or start a new import.",
    },
  ],
  resultSummary: importBatchSummary,
};

export function createLibraryImportStartRegistration(
  input: CreateLibraryImportControlRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryImportStartDescriptor,
    handler: (_ctx, payload) => handleLibraryImportStart(payload, input.control),
  };
}

export function createLibraryImportContinueRegistration(
  input: CreateLibraryImportControlRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryImportContinueDescriptor,
    handler: (_ctx, payload) => handleLibraryImportContinue(payload, input.control),
  };
}

export function createLibraryImportStatusRegistration(
  input: CreateLibraryImportControlRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryImportStatusDescriptor,
    handler: (_ctx, payload) => handleLibraryImportStatus(payload, input.control),
  };
}

async function handleLibraryImportStart(
  payload: unknown,
  control: LibraryImportControlPort,
): Promise<Result<LibraryImportDriveOutput>> {
  const started = await invokeImportControl(() =>
    control.startImport(payload as LibraryImportStartInput),
  );

  if (!started.ok) {
    return publicImportError(started.error);
  }

  return {
    ok: true,
    value: driveOutput(started.value, control),
  };
}

async function handleLibraryImportContinue(
  payload: unknown,
  control: LibraryImportControlPort,
): Promise<Result<LibraryImportDriveOutput>> {
  const continued = await invokeImportControl(() =>
    control.continueImport(payload as LibraryImportContinueInput),
  );

  if (!continued.ok) {
    return publicImportError(continued.error);
  }

  return {
    ok: true,
    value: driveOutput(continued.value, control),
  };
}

async function handleLibraryImportStatus(
  payload: unknown,
  control: LibraryImportControlPort,
): Promise<Result<LibraryImportStatusOutput>> {
  const batch = await control.getStatus(payload as LibraryImportStatusInput);

  if (batch === undefined) {
    return fail({
      code: "batch_not_found",
      message: "Library import batch was not found.",
      retryable: true,
      suggestedFix: "Retry with a batchId returned by library.import.start, or start a new import.",
    });
  }

  return {
    ok: true,
    value: statusOutput(batch, control),
  };
}

// MDP Stage Adapter boundary: translate the import service's classified write
// failure into the tool's declared public Result; programmer errors keep
// throwing to the Tool Call Router.
async function invokeImportControl<T>(
  run: () => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    return await run();
  } catch (error) {
    if (isSourceLibraryImportWriteFailure(error)) {
      return {
        ok: false,
        error: error.failure,
      };
    }
    throw error;
  }
}

function driveOutput(
  result: SourceLibraryImportResult,
  control: LibraryImportControlPort,
): LibraryImportDriveOutput {
  const batch = result.batch;
  const failureCategories = failureCategoriesForResult(result);

  return {
    batchId: batch.batchId,
    status: batch.status,
    ...sourceLibraryScopeField(batch, control),
    totals: batchCounts(batch),
    ...(result.providerPage === undefined && result.itemResults.length === 0
      ? {}
      : { page: pageCounts(result.itemResults) }),
    ...(result.providerPage?.totalCountHint === undefined
      ? {}
      : { providerTotalCountHint: result.providerPage.totalCountHint }),
    hasMore: batch.status === "running",
    ...(failureCategories === undefined ? {} : { failureCategories }),
  };
}

function statusOutput(
  batch: SourceLibraryImportBatchRecord,
  control: LibraryImportControlPort,
): LibraryImportStatusOutput {
  const failureCategories = failureCategoriesForBatch(batch);

  return {
    batchId: batch.batchId,
    status: batch.status,
    ...sourceLibraryScopeField(batch, control),
    totals: batchCounts(batch),
    hasMore: batch.status === "running",
    ...(failureCategories === undefined ? {} : { failureCategories }),
  };
}

function sourceLibraryScopeField(
  batch: SourceLibraryImportBatchRecord,
  control: LibraryImportControlPort,
): { sourceLibraryScope?: LibraryImportSourceLibraryScope } {
  const sourceLibraryScope = control.sourceLibraryScopeForBatch({ batch });

  return sourceLibraryScope === undefined ? {} : { sourceLibraryScope };
}

function batchCounts(batch: SourceLibraryImportBatchRecord): LibraryImportCounts {
  return {
    imported: batch.importedCount,
    alreadyPresent: batch.alreadyPresentCount,
    failed: batch.failedCount,
  };
}

function pageCounts(items: readonly SourceLibraryImportItemResult[]): LibraryImportCounts {
  const counts: LibraryImportCounts = {
    imported: 0,
    alreadyPresent: 0,
    failed: 0,
  };

  for (const item of items) {
    incrementCounts(counts, item.outcome);
  }

  return counts;
}

function incrementCounts(
  counts: LibraryImportCounts,
  outcome: SourceLibraryImportItemOutcomeRecord,
): void {
  switch (outcome.outcome) {
    case "imported":
      counts.imported += 1;
      break;
    case "already_present":
      counts.alreadyPresent += 1;
      break;
    case "failed":
      counts.failed += 1;
      break;
  }
}

function failureCategoriesForResult(
  result: SourceLibraryImportResult,
): readonly LibraryImportFailureCategoryCount[] | undefined {
  const codes = new Map<string, number>();

  addBatchFailureCode(codes, result.batch);
  for (const item of result.itemResults) {
    if (item.outcome.errorCode !== undefined) {
      addCode(codes, item.outcome.errorCode);
    }
    if (item.error?.code !== undefined) {
      addCode(codes, item.error.code);
    }
  }

  return failureCategoryCounts(codes);
}

function failureCategoriesForBatch(
  batch: SourceLibraryImportBatchRecord,
): readonly LibraryImportFailureCategoryCount[] | undefined {
  const codes = new Map<string, number>();

  addBatchFailureCode(codes, batch);
  return failureCategoryCounts(codes);
}

function addBatchFailureCode(
  codes: Map<string, number>,
  batch: SourceLibraryImportBatchRecord,
): void {
  if (batch.failureCode !== undefined) {
    addCode(codes, batch.failureCode);
  }
}

function addCode(codes: Map<string, number>, code: string): void {
  codes.set(code, (codes.get(code) ?? 0) + 1);
}

function failureCategoryCounts(
  codes: ReadonlyMap<string, number>,
): readonly LibraryImportFailureCategoryCount[] | undefined {
  if (codes.size === 0) {
    return undefined;
  }

  const byCategory = new Map<LibraryImportFailureCategory, number>();

  for (const [code, count] of codes) {
    const category = failureCategoryForCode(code);
    byCategory.set(category, (byCategory.get(category) ?? 0) + count);
  }

  return Array.from(byCategory.entries()).map(([category, count]) => ({
    category,
    count,
  }));
}

function publicImportError(error: StageError): Result<never> {
  const codes = stageErrorCodes(error);

  if (codes.some((code) => code === "music_data.invalid_source_library_import_input" || code === "extension.invalid_platform_library_provider_read_input")) {
    return fail({
      code: "invalid_input",
      message: "Library import request is invalid.",
      retryable: false,
      suggestedFix: "Retry with providerId, libraryKind or batchId, and optional integer limit from 1 through 100.",
    });
  }

  if (codes.includes("extension.platform_library_provider_not_found")) {
    return fail({
      code: "provider_not_found",
      message: "Library import provider is not available.",
      retryable: true,
      suggestedFix: "Call library.import.list_sources and retry with an available providerId.",
    });
  }

  if (codes.includes("extension.platform_library_provider_kind_unsupported")) {
    return fail({
      code: "kind_unsupported",
      message: "Library import provider does not support the requested libraryKind.",
      retryable: false,
      suggestedFix: "Call library.import.list_sources and choose a libraryKind supported by that provider.",
    });
  }

  if (codes.includes("music_data.source_library_import_batch_not_found")) {
    return fail({
      code: "batch_not_found",
      message: "Library import batch was not found.",
      retryable: true,
      suggestedFix: "Retry with a batchId returned by library.import.start, or start a new import.",
    });
  }

  if (codes.includes("music_data.source_library_import_batch_failed")) {
    return fail({
      code: "batch_failed",
      message: "Library import batch has failed.",
      retryable: false,
      suggestedFix: "Call library.import.status for the failed batch summary, then start a new import if needed.",
    });
  }

  if (codes.includes("music_data.owner_scope_unsupported")) {
    return fail({
      code: "owner_scope_unsupported",
      message: "Library import currently supports only the local owner scope.",
      retryable: false,
      suggestedFix: "Retry from the supported local owner scope.",
    });
  }

  const category = firstFailureCategory(codes);

  switch (category) {
    case "provider_response_invalid":
      return fail({
        code: "provider_response_invalid",
        message: "Library import provider returned an invalid library page.",
        retryable: true,
        suggestedFix: "Retry later; if it repeats, refresh the provider integration before importing again.",
      });
    case "account_unavailable":
      return fail({
        code: "account_unavailable",
        message: "Library import provider account could not be resolved.",
        retryable: true,
        suggestedFix: "Reconnect or refresh the provider account, then retry the import.",
      });
    case "write_failed":
      return fail({
        code: "write_failed",
        message: "Library import could not write imported items.",
        retryable: true,
        suggestedFix: "Retry later after local storage is available.",
      });
    case "provider_unavailable":
      return fail({
        code: "provider_unavailable",
        message: "Library import provider is unavailable or failed during read.",
        retryable: true,
        suggestedFix: "Retry later after the provider account and network are available.",
      });
    case "unknown":
      return fail({
        code: "write_failed",
        message: "Library import failed before the cause could be categorized.",
        retryable: true,
        suggestedFix: "Retry later after local storage is available.",
      });
  }
}

function firstFailureCategory(codes: readonly string[]): LibraryImportFailureCategory {
  let fallback: LibraryImportFailureCategory = "unknown";

  for (const code of codes) {
    const category = failureCategoryForCode(code);

    if (
      category === "provider_response_invalid" ||
      category === "account_unavailable" ||
      category === "write_failed"
    ) {
      return category;
    }

    if (category === "provider_unavailable") {
      fallback = category;
    }
  }

  return fallback;
}

function failureCategoryForCode(code: string): LibraryImportFailureCategory {
  if (
    code === "extension.platform_library_provider_read_failed" ||
    code === "extension.runtime_failed" ||
    code === "extension.runtime_stopped" ||
    code === "extension.runtime_not_ready" ||
    code === "extension.ncm_provider_unavailable"
  ) {
    return "provider_unavailable";
  }

  if (
    code === "extension.invalid_platform_library_provider_read_output" ||
    code === "music_data.source_library_provider_page_invalid" ||
    code === "music_data.source_library_provider_read_contract_invalid" ||
    code === "extension.ncm_malformed_response" ||
    code === "extension.ncm_provider_response_error" ||
    code === "extension.ncm_invalid_cursor" ||
    code === "extension.ncm_song_detail_missing"
  ) {
    return "provider_response_invalid";
  }

  if (
    code === "music_data.source_library_account_unresolved" ||
    code === "music_data.source_library_account_mismatch" ||
    code === "extension.ncm_account_unresolved" ||
    code === "extension.ncm_account_mismatch" ||
    code === "extension.ncm_invalid_provider_account_id" ||
    code === "extension.ncm_invalid_config" ||
    code === "extension.ncm_liked_playlist_unresolved"
  ) {
    return "account_unavailable";
  }

  if (
    code === "music_data.source_library_import_write_failed" ||
    code === "music_data.source_library_import_write_contention" ||
    code === "music_data.source_library_import_constraint_conflict" ||
    code === "music_data.source_library_material_binding_mismatch" ||
    code === "music_data.source_library_import_batch_scope_missing" ||
    code === "music_data.material_ref_invalid"
  ) {
    return "write_failed";
  }

  return "unknown";
}

function stageErrorCodes(error: StageError): readonly string[] {
  const codes: string[] = [error.code];
  let cause = error.cause;

  while (isStageErrorLike(cause)) {
    codes.push(cause.code);
    cause = cause.cause;
  }

  return codes;
}

function isStageErrorLike(value: unknown): value is StageError {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string" &&
    typeof (value as { retryable?: unknown }).retryable === "boolean";
}

function importBatchSummary(result: unknown): string {
  const output = result as {
    batchId: string;
    status: string;
    totals: LibraryImportCounts;
    hasMore: boolean;
  };
  return `Import batch ${output.batchId}: ${output.status}; imported ${output.totals.imported}, already present ${output.totals.alreadyPresent}, failed ${output.totals.failed}; hasMore=${output.hasMore}.`;
}

function fail(input: {
  code: string;
  message: string;
  retryable: boolean;
  suggestedFix?: string;
}): Result<never> {
  const error: StageError = {
    code: input.code,
    message: input.message,
    area: "music_data_platform",
    retryable: input.retryable,
    ...(input.suggestedFix === undefined ? {} : { suggestedFix: input.suggestedFix }),
  };

  return {
    ok: false,
    error,
  };
}
