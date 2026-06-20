import { randomUUID } from "node:crypto";

import { assertRefSafe, isRefComponentSafe, type Ref, type Result, type StageError } from "../contracts/kernel.js";
import type { MaterialEntityKind, PlatformLibraryCandidate, PlatformLibraryKind, PlatformLibraryReadInput, PlatformLibraryReadResult, SourceEntity, SourceLibraryImportCompletionReason } from "../contracts/music_data_platform.js";
import type { SourceRecord } from "../contracts/storage.js";
import { isMusicDatabaseError, type MusicDatabase } from "../storage/database.js";
import { isMusicDataPlatformError } from "./errors.js";
import {
  createIdentityReadPort,
} from "./identity_read_model.js";
import { materialKindForSourceKind } from "./material_ref.js";
import type { MaterialRefFactory } from "./material_ref_factory.js";
import { DEFAULT_OWNER_SCOPE } from "./owner_scope.js";
import {
  type SourceLibraryImportBatchRecord,
  type SourceLibraryImportItemOutcomeRecord,
  type SourceLibraryItemRecord,
} from "./source_library_records.js";
import { createSourceLibraryReadPort } from "./source_library_read_model.js";
import { createMusicDataPlatformSourceOfTruthWriteCommands } from "./source_of_truth_write_commands.js";

export type PlatformLibraryReadPort = {
  readPlatformLibraryProvider(input: {
    providerId: string;
    request: PlatformLibraryReadInput;
  }): Promise<Result<PlatformLibraryReadResult>>;
};

export type CreateSourceLibraryImportServiceInput = {
  database: MusicDatabase;
  platformLibraryProvider: PlatformLibraryReadPort;
  materialRefFactory: MaterialRefFactory;
  now?: () => string;
  newBatchId?: () => string;
  defaultLimit?: number;
};

export type SourceLibraryImportService = {
  startImport(input: SourceLibraryImportStartInput): Promise<Result<SourceLibraryImportResult>>;
  continueImport(input: SourceLibraryImportContinueInput): Promise<Result<SourceLibraryImportResult>>;
};

export type SourceLibraryImportStartInput = {
  providerId: string;
  providerAccountId?: string;
  libraryKind: PlatformLibraryKind;
  limit?: number;
  maxNewItems?: number;
};

export type SourceLibraryImportContinueInput = {
  batchId: string;
  limit?: number;
};

export type SourceLibraryImportResult = {
  batch: SourceLibraryImportBatchRecord;
  providerPage?: SourceLibraryImportProviderPage;
  itemResults: readonly SourceLibraryImportItemResult[];
};

export type SourceLibraryImportProviderPage = {
  providerId: string;
  providerAccountId: string;
  libraryKind: PlatformLibraryKind;
  candidateCount: number;
  nextCursor?: string;
  totalCountHint?: number;
};

export type SourceLibraryImportItemResult = {
  candidate: PlatformLibraryCandidate;
  outcome: SourceLibraryImportItemOutcomeRecord;
  sourceRecord?: SourceRecord;
  sourceLibraryItem?: SourceLibraryItemRecord;
  materialRef?: Ref;
  error?: {
    code: string;
    message: string;
  };
};

const defaultImportLimit = 50;
const maxProviderReadLimit = 100;

export function createSourceLibraryImportService(
  input: CreateSourceLibraryImportServiceInput,
): SourceLibraryImportService {
  const now = input.now ?? (() => new Date().toISOString());
  const newBatchId = input.newBatchId ?? defaultBatchId;
  const defaultLimit = input.defaultLimit ?? defaultImportLimit;

  return {
    async startImport(startInput) {
      const validation = validateStartInput(startInput);

      if (!validation.ok) {
        return validation;
      }

      const callLimit = resolveCallLimit(startInput.limit, defaultLimit);

      if (!callLimit.ok) {
        return callLimit;
      }

      const created = await input.database.transaction(async (db) => {
        const timestamp = now();
        const batchId = newBatchId();
        const commands = createMusicDataPlatformSourceOfTruthWriteCommands({
          db,
          now: timestamp,
        }).sourceLibrary;

        return await musicDataCommandResult(() => commands.createImportBatch({
          batchId,
          ownerScope: DEFAULT_OWNER_SCOPE,
          providerId: startInput.providerId,
          ...(startInput.providerAccountId === undefined ? {} : { providerAccountId: startInput.providerAccountId }),
          libraryKind: startInput.libraryKind,
          ...(startInput.maxNewItems === undefined ? {} : { maxNewItems: startInput.maxNewItems }),
        }));
      });

      if (!created.ok) {
        return created;
      }

      return await processNextPage(created.value.batchId, callLimit.value);
    },
    async continueImport(continueInput) {
      const validation = validateContinueInput(continueInput);

      if (!validation.ok) {
        return validation;
      }

      const callLimit = resolveCallLimit(continueInput.limit, defaultLimit);

      if (!callLimit.ok) {
        return callLimit;
      }

      const batch = await getBatch(continueInput.batchId);

      if (batch === undefined) {
        return failMusicData(
          "music_data.source_library_import_batch_not_found",
          `Source library import batch '${continueInput.batchId}' was not found.`,
        );
      }

      if (batch.ownerScope !== DEFAULT_OWNER_SCOPE) {
        return failMusicData(
          "music_data.owner_scope_unsupported",
          `Workflow-facing source library import currently supports only owner scope '${DEFAULT_OWNER_SCOPE}'.`,
        );
      }

      if (batch.status === "completed") {
        return ok({
          batch,
          itemResults: [],
        });
      }

      if (batch.status === "failed") {
        return failMusicData(
          "music_data.source_library_import_batch_failed",
          `Source library import batch '${continueInput.batchId}' has failed.`,
        );
      }

      return await processNextPage(batch.batchId, callLimit.value);
    },
  };

  async function processNextPage(
    batchId: string,
    callLimit: number,
  ): Promise<Result<SourceLibraryImportResult>> {
    const initialBatch = await getBatch(batchId);

    if (initialBatch === undefined) {
      return failMusicData(
        "music_data.source_library_import_batch_not_found",
        `Source library import batch '${batchId}' was not found.`,
      );
    }

    const allowance = providerReadLimit(initialBatch, callLimit);

    if (!allowance.ok) {
      return allowance;
    }

    if (allowance.value === 0) {
      const batch = await completeBatch(
        initialBatch,
        "max_new_items_reached",
        now(),
      );

      return ok({
        batch,
        itemResults: [],
      });
    }

    const read = await input.platformLibraryProvider.readPlatformLibraryProvider({
      providerId: initialBatch.providerId,
      request: {
        kind: initialBatch.libraryKind,
        limit: allowance.value,
        ...(initialBatch.providerAccountId === undefined ? {} : { providerAccountId: initialBatch.providerAccountId }),
        ...(initialBatch.cursor === undefined ? {} : { cursor: initialBatch.cursor }),
      },
    });

    if (!read.ok) {
      await markBatchFailed(initialBatch.batchId, read.error, now());
      return read;
    }

    // Two distinct ownership layers run on overlapping fields (providerId, kind):
    //   1. EXTENSION-POST-CONTRACT INVARIANT (throws): structural validity — is the
    //      page an object, is providerId a safe id, is kind a valid
    //      PlatformLibraryKind, are candidates an array within limit? Extension
    //      already guarantees these in a validated port; a violation is a broken
    //      internal contract, so it throws (one failure channel: throw = invariant).
    //   2. BATCH-MEMBERSHIP SEMANTICS (Result): does the structurally-valid page
    //      belong to THIS batch (providerId/kind/account match)? An expected,
    //      retryable provider-page failure, so it returns Result.
    // When tightening a kind rule, update structural validity in the assert layer
    // and batch-membership equality in the validate layer independently.
    try {
      assertProviderReadPostExtensionContract(read.value, allowance.value);
    } catch (error) {
      await markBatchFailed(
        initialBatch.batchId,
        systemProviderReadContractFailure(),
        now(),
      );
      throw error;
    }

    const pageValidation = validateProviderPageForBatch(initialBatch, read.value);

    if (!pageValidation.ok) {
      await markBatchFailed(initialBatch.batchId, pageValidation.error, now());
      return pageValidation;
    }

    const accountValidation = resolvedProviderAccountId(initialBatch, read.value);

    if (!accountValidation.ok) {
      await markBatchFailed(initialBatch.batchId, accountValidation.error, now());
      return accountValidation;
    }

    const providerAccountId = accountValidation.value;
    const candidateValidation = validateProviderCandidatesForBatch(initialBatch, read.value, providerAccountId);

    if (!candidateValidation.ok) {
      await markBatchFailed(initialBatch.batchId, candidateValidation.error, now());
      return candidateValidation;
    }

    let batch = await persistBatchLibraryScope(initialBatch, providerAccountId, now());
    const page: SourceLibraryImportProviderPage = {
      providerId: read.value.providerId,
      providerAccountId,
      libraryKind: read.value.kind,
      candidateCount: read.value.candidates.length,
      ...(read.value.nextCursor === undefined ? {} : { nextCursor: read.value.nextCursor }),
      ...(read.value.totalCountHint === undefined ? {} : { totalCountHint: read.value.totalCountHint }),
    };
    const itemResults: SourceLibraryImportItemResult[] = [];

    for (const candidate of read.value.candidates) {
      const latestBatch = await requireBatch(batch.batchId);

      if (hasReachedMaxNewItems(latestBatch)) {
        batch = await completeBatch(latestBatch, "max_new_items_reached", now());
        break;
      }

      let itemResult: SourceLibraryImportItemResult;
      try {
        itemResult = await processCandidate(latestBatch, candidate);
      } catch (error) {
        // TRANSLATE, never silence: classify the write failure so the durable
        // batch record carries the real cause, then rethrow with the original as
        // `cause` so logs/telemetry keep it too.
        const failure = classifyCandidateWriteFailure(error);
        await markBatchFailed(latestBatch.batchId, failure, now());
        throw new CandidateWriteFailureError(failure, error);
      }

      itemResults.push(itemResult);
      batch = await requireBatch(batch.batchId);
    }

    const latestBatch = await requireBatch(batch.batchId);

    if (hasReachedMaxNewItems(latestBatch)) {
      batch = await completeBatch(latestBatch, "max_new_items_reached", now());
    } else if (read.value.nextCursor === undefined) {
      batch = await completeBatch(latestBatch, "provider_exhausted", now());
    } else {
      batch = await updateBatchCursor(latestBatch, read.value.nextCursor, now());
    }

    return ok({
      batch,
      providerPage: page,
      itemResults,
    });
  }

  async function processCandidate(
    batch: SourceLibraryImportBatchRecord,
    candidate: PlatformLibraryCandidate,
  ): Promise<SourceLibraryImportItemResult> {
    return input.database.transaction(async (db) => {
      const timestamp = now();
      const identityRead = createIdentityReadPort({ db });
      const writes = createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: timestamp,
      });
      const identityCommands = writes.identity;
      const sourceLibraryCommands = writes.sourceLibrary;
      const sourceRecord = await identityCommands.upsertSourceRecord({
        entity: candidate.sourceEntity,
      });
      const existingBinding = await identityRead.findMaterialForSource({
        sourceRef: candidate.sourceEntity.sourceRef,
      });
      const materialRef = existingBinding?.materialRef ??
        input.materialRefFactory.createMaterialRef(materialKindForSourceKind(candidate.sourceEntity.kind));

      if (existingBinding === undefined) {
        await identityCommands.upsertMaterialRecord({
          materialRef,
          kind: materialKindForSourceKind(candidate.sourceEntity.kind),
          ...(candidate.sourceEntity.versionInfo === undefined ? {} : { versionInfo: candidate.sourceEntity.versionInfo }),
        });
      }

      await identityCommands.bindSourceToMaterial({
        sourceRef: candidate.sourceEntity.sourceRef,
        materialRef,
      });

      const itemWrite = await sourceLibraryCommands.recordImportItem({
        batch,
        sourceRef: candidate.sourceEntity.sourceRef,
        providerId: candidate.sourceEntity.providerId!,
        providerEntityId: candidate.sourceEntity.providerEntityId!,
        materialRef,
        ...(candidate.providerAddedAt === undefined ? {} : { providerAddedAt: candidate.providerAddedAt }),
      });

      return {
        candidate,
        outcome: itemWrite.outcome,
        sourceRecord,
        sourceLibraryItem: itemWrite.sourceLibraryItem,
        materialRef,
      };
    });
  }

  async function getBatch(batchId: string): Promise<SourceLibraryImportBatchRecord | undefined> {
    return createSourceLibraryReadPort({
      db: input.database.context(),
    }).getImportBatch({ batchId });
  }

  async function requireBatch(batchId: string): Promise<SourceLibraryImportBatchRecord> {
    return requireRecord(
      await getBatch(batchId),
      "source library import batch disappeared during processing",
    );
  }

  function persistBatchLibraryScope(
    batch: SourceLibraryImportBatchRecord,
    providerAccountId: string,
    timestamp: string,
  ): Promise<SourceLibraryImportBatchRecord> {
    return input.database.transaction(async (db) => {
      return createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: timestamp,
      }).sourceLibrary.resolveImportBatchLibraryScope({
        batch,
        providerAccountId,
      });
    });
  }

  function markBatchFailed(
    batchId: string,
    error: StageError,
    timestamp: string,
  ): Promise<SourceLibraryImportBatchRecord | undefined> {
    return input.database.transaction(async (db) => {
      return createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: timestamp,
      }).sourceLibrary.failImportBatch({
        batchId,
        errorCode: error.code,
        errorMessage: error.message,
      });
    });
  }

  function completeBatch(
    batch: SourceLibraryImportBatchRecord,
    completionReason: SourceLibraryImportCompletionReason,
    timestamp: string,
  ): Promise<SourceLibraryImportBatchRecord> {
    return input.database.transaction(async (db) => {
      return createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: timestamp,
      }).sourceLibrary.completeImportBatch({
        batch,
        completionReason,
      });
    });
  }

  function updateBatchCursor(
    batch: SourceLibraryImportBatchRecord,
    cursor: string,
    timestamp: string,
  ): Promise<SourceLibraryImportBatchRecord> {
    return input.database.transaction(async (db) => {
      return createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: timestamp,
      }).sourceLibrary.advanceImportBatchCursor({
        batch,
        cursor,
      });
    });
  }
}

function validateStartInput(
  input: SourceLibraryImportStartInput,
): Result<void> {
  if (!isRefComponentSafe(input.providerId)) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import providerId must be a non-empty safe id.",
    );
  }

  if (
    input.providerAccountId !== undefined &&
    !isRefComponentSafe(input.providerAccountId)
  ) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import providerAccountId must be a non-empty safe id when present.",
    );
  }

  if (!isPlatformLibraryKind(input.libraryKind)) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import libraryKind is not supported.",
    );
  }

  if (!isOptionalReadLimit(input.limit)) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import limit must be an integer from 1 through 100 when present.",
    );
  }

  if (!isOptionalPositiveInteger(input.maxNewItems)) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import maxNewItems must be a positive integer when present.",
    );
  }

  return ok(undefined);
}

function validateContinueInput(
  input: SourceLibraryImportContinueInput,
): Result<void> {
  if (typeof input.batchId !== "string" || input.batchId.length === 0) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import batchId must be a non-empty string.",
    );
  }

  if (!isOptionalReadLimit(input.limit)) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import limit must be an integer from 1 through 100 when present.",
    );
  }

  return ok(undefined);
}

function resolveCallLimit(
  requestedLimit: number | undefined,
  defaultLimit: number,
): Result<number> {
  const callLimit = requestedLimit ?? defaultLimit;

  if (!isReadLimit(callLimit)) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import limit must be an integer from 1 through 100.",
    );
  }

  return ok(callLimit);
}

function providerReadLimit(
  batch: SourceLibraryImportBatchRecord,
  callLimit: number,
): Result<number> {
  if (!isReadLimit(callLimit)) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import limit must be an integer from 1 through 100.",
    );
  }

  if (batch.maxNewItems === undefined) {
    return ok(callLimit);
  }

  const remaining = batch.maxNewItems - batch.importedCount;

  return ok(Math.max(0, Math.min(callLimit, remaining)));
}

function resolvedProviderAccountId(
  batch: SourceLibraryImportBatchRecord,
  page: PlatformLibraryReadResult,
): Result<string> {
  const resolved = normalizeSafeId(page.providerAccountId);

  // assertProviderReadPostExtensionContract already guarantees providerAccountId
  // is undefined or a safe id, so `resolved === undefined` only when the field is
  // absent — handled by the branches below. One failure channel: Result<string>.

  if (batch.providerAccountId === undefined) {
    if (resolved === undefined) {
      return failMusicData(
        "music_data.source_library_account_unresolved",
        "Platform library read did not resolve a provider account id.",
        true,
      );
    }

    return ok(resolved);
  }

  if (resolved === undefined || resolved !== batch.providerAccountId) {
    return failMusicData(
      "music_data.source_library_account_mismatch",
      "Platform library read provider account id did not match the import batch.",
      true,
    );
  }

  return ok(batch.providerAccountId);
}

function validateProviderPageForBatch(
  batch: SourceLibraryImportBatchRecord,
  page: PlatformLibraryReadResult,
): Result<void> {
  // Batch-membership semantics (MDP-owned). A structurally-valid page that does
  // not belong to this batch is an expected, retryable provider-page failure, not
  // a broken contract — hence Result. Structural validity of the same fields
  // (isRefComponentSafe providerId, isPlatformLibraryKind kind) is owned by
  // assertProviderReadPostExtensionContract and MUST NOT be re-checked here.
  if (page.providerId !== batch.providerId) {
    return invalidProviderPage("Platform library read returned a provider id outside the import batch.");
  }

  if (page.kind !== batch.libraryKind) {
    return invalidProviderPage("Platform library read returned a library kind outside the import batch.");
  }

  return ok(undefined);
}

function validateProviderCandidatesForBatch(
  batch: SourceLibraryImportBatchRecord,
  page: PlatformLibraryReadResult,
  providerAccountId: string,
): Result<void> {
  for (const candidate of page.candidates) {
    if (candidate.libraryKind !== batch.libraryKind) {
      return invalidProviderPage("Platform library read returned a candidate outside the import batch kind.");
    }

    if (
      candidate.providerAccountId !== undefined &&
      candidate.providerAccountId !== providerAccountId
    ) {
      return invalidProviderPage("Platform library read returned a candidate outside the resolved provider account.");
    }

    const sourceValidation = validateProviderSourceEntityForBatch(batch, candidate.sourceEntity);

    if (!sourceValidation.ok) {
      return sourceValidation;
    }
  }

  return ok(undefined);
}

function validateProviderSourceEntityForBatch(
  batch: SourceLibraryImportBatchRecord,
  sourceEntity: SourceEntity,
): Result<void> {
  const expectedKind = sourceKindForLibraryKind(batch.libraryKind);

  if (sourceEntity.kind !== expectedKind) {
    return invalidProviderPage("Platform library read returned source entity kind outside the import batch.");
  }

  if (sourceEntity.providerId !== batch.providerId) {
    return invalidProviderPage("Platform library read returned source entity provider outside the import batch.");
  }

  const sourceRef = sourceEntity.sourceRef;
  const expectedNamespace = `source_${batch.providerId}`;

  if (sourceRef.namespace !== expectedNamespace) {
    return invalidProviderPage("Platform library read returned source ref namespace outside the import batch.");
  }

  if (sourceRef.kind !== expectedKind) {
    return invalidProviderPage("Platform library read returned source ref kind outside the import batch.");
  }

  return ok(undefined);
}

/**
 * Extension-post-contract invariant. Owns STRUCTURAL validity of the provider-read
 * result (object shape, safe ids, valid PlatformLibraryKind enum, array candidates
 * within limit, cursor/totalCountHint shape). Extension's platform-library read seam
 * already validates this; reaching this assert means a post-Extension contract was
 * broken, so it THROWS rather than returning a Result. Do NOT move these checks into
 * the validate*ForBatch Result layer — that would conflate a broken invariant
 * (throw) with an expected batch-membership failure (Result). The two layers check
 * different invariants on overlapping fields (providerId, kind) and MUST stay on
 * separate error channels (see the call site in processNextPage).
 */
function assertProviderReadPostExtensionContract(
  page: PlatformLibraryReadResult,
  requestedLimit: number,
): void {
  if (!isRecord(page)) {
    postExtensionContractViolation("returned a malformed page.");
  }

  if (!isRefComponentSafe(page.providerId)) {
    postExtensionContractViolation("returned an unsafe provider id.");
  }

  if (!isPlatformLibraryKind(page.kind)) {
    postExtensionContractViolation("returned an unsupported library kind.");
  }

  if (
    page.providerAccountId !== undefined &&
    !isRefComponentSafe(page.providerAccountId)
  ) {
    postExtensionContractViolation("returned an unsafe provider account id.");
  }

  if (!Array.isArray(page.candidates)) {
    postExtensionContractViolation("returned a non-array candidate list.");
  }

  if (page.candidates.length > requestedLimit) {
    postExtensionContractViolation("returned more candidates than requested.");
  }

  if (
    page.nextCursor !== undefined &&
    (typeof page.nextCursor !== "string" || page.nextCursor.trim().length === 0)
  ) {
    postExtensionContractViolation("returned an invalid next cursor.");
  }

  if (
    page.totalCountHint !== undefined &&
    (
      typeof page.totalCountHint !== "number" ||
      !Number.isInteger(page.totalCountHint) ||
      page.totalCountHint < 0
    )
  ) {
    postExtensionContractViolation("returned an invalid total count hint.");
  }

  for (const candidate of page.candidates as readonly unknown[]) {
    assertProviderCandidatePostExtensionContract(candidate);
  }
}

function assertProviderCandidatePostExtensionContract(
  candidate: unknown,
): asserts candidate is PlatformLibraryCandidate {
  if (!isRecord(candidate)) {
    postExtensionContractViolation("returned a malformed candidate.");
  }

  if (!isPlatformLibraryKind(candidate.libraryKind)) {
    postExtensionContractViolation("returned an unsupported candidate kind.");
  }

  if (
    candidate.providerAccountId !== undefined &&
    !isRefComponentSafe(candidate.providerAccountId)
  ) {
    postExtensionContractViolation("returned an unsafe candidate provider account id.");
  }

  if (!isRecord(candidate.sourceEntity)) {
    postExtensionContractViolation("returned a candidate without source entity.");
  }

  assertProviderSourceEntityPostExtensionContract(candidate.sourceEntity);
}

function assertProviderSourceEntityPostExtensionContract(
  sourceEntity: Record<string, unknown>,
): asserts sourceEntity is SourceEntity {
  if (!isSourceEntityKind(sourceEntity.kind)) {
    postExtensionContractViolation("returned an unsupported source entity kind.");
  }

  if (!isRefComponentSafe(sourceEntity.providerId)) {
    postExtensionContractViolation("returned an unsafe source entity provider id.");
  }

  if (!isRefComponentSafe(sourceEntity.providerEntityId)) {
    postExtensionContractViolation("returned an unsafe provider entity id.");
  }

  if (!isRecord(sourceEntity.sourceRef)) {
    postExtensionContractViolation("returned a source entity without source ref.");
  }

  const sourceRef = sourceEntity.sourceRef;

  if (
    typeof sourceRef.namespace !== "string" ||
    typeof sourceRef.kind !== "string" ||
    typeof sourceRef.id !== "string"
  ) {
    postExtensionContractViolation("returned a malformed source ref.");
  }

  // Validate ref-component safety without building (and discarding) a key string.
  assertRefSafe({
    namespace: sourceRef.namespace,
    kind: sourceRef.kind,
    id: sourceRef.id,
  });
}

function hasReachedMaxNewItems(batch: SourceLibraryImportBatchRecord): boolean {
  return batch.maxNewItems !== undefined && batch.importedCount >= batch.maxNewItems;
}

function sourceKindForLibraryKind(kind: PlatformLibraryKind): SourceEntity["kind"] {
  switch (kind) {
    case "saved_source_track":
      return "track";
    case "saved_source_album":
      return "album";
    case "followed_source_artist":
      return "artist";
  }
}

function isOptionalPositiveInteger(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

function isOptionalReadLimit(value: unknown): boolean {
  return value === undefined || isReadLimit(value);
}

function isReadLimit(value: unknown): boolean {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= maxProviderReadLimit;
}

function isPlatformLibraryKind(value: unknown): value is PlatformLibraryKind {
  return value === "saved_source_track" ||
    value === "saved_source_album" ||
    value === "followed_source_artist";
}

function isSourceEntityKind(value: unknown): value is SourceEntity["kind"] {
  return value === "track" || value === "album" || value === "artist";
}

function normalizeSafeId(value: unknown): string | undefined {
  return isRefComponentSafe(value) ? value : undefined;
}

function defaultBatchId(): string {
  return `source_library_import_${randomUUID().replaceAll("-", "")}`;
}

// Ref-component safety (non-empty, whitespace-trimmed, no ':') is owned by the
// kernel contract `isRefComponentSafe`; do not re-express it locally.


function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

async function musicDataCommandResult<T>(operation: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    if (isMusicDataPlatformError(error)) {
      return failMusicData(error.code, error.message);
    }

    throw error;
  }
}

function failMusicData<T = never>(
  code: string,
  message: string,
  retryable = false,
): Result<T> {
  return {
    ok: false,
    error: musicDataError(code, message, retryable),
  };
}

function invalidProviderPage(message: string): Result<never> {
  return failMusicData(
    "music_data.source_library_provider_page_invalid",
    message,
    true,
  );
}

const POSTGRES_CONSTRAINT_SQLSTATES = new Set(["23505", "23503", "23514", "23P01"]);
const POSTGRES_TRANSIENT_SQLSTATES = new Set(["40001", "40P01", "55P03"]);

// Classifies a processCandidate write failure into a durable StageError so the
// batch record and the rethrown error describe the SAME cause. No branch
// silences: unknown errors are still classified, recorded, and rethrown.
function classifyCandidateWriteFailure(error: unknown): StageError {
  if (isMusicDataPlatformError(error)) {
    // Command-invariant failures (material ref, source-library command) carry
    // their own typed code — record it verbatim.
    return musicDataError(error.code, error.message, false);
  }

  const sqlState = postgresSqlState(error);

  if (sqlState !== undefined && POSTGRES_CONSTRAINT_SQLSTATES.has(sqlState)) {
    return musicDataError(
      "music_data.source_library_import_constraint_conflict",
      errorMessage(error, "Source library import item write violated a database constraint."),
      false,
    );
  }

  if (sqlState !== undefined && POSTGRES_TRANSIENT_SQLSTATES.has(sqlState)) {
    return musicDataError(
      "music_data.source_library_import_write_contention",
      errorMessage(error, "Source library import item write failed due to database contention."),
      true,
    );
  }

  if (isMusicDatabaseError(error)) {
    return musicDataError(
      "music_data.source_library_import_write_failed",
      errorMessage(error, "Source library import item write failed at the storage boundary."),
      true,
    );
  }

  return musicDataError(
    "music_data.source_library_import_write_failed",
    errorMessage(error, "Source library import item write failed."),
    true,
  );
}

function postgresSqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const candidate = (error as { code?: unknown }).code;
  return typeof candidate === "string" && /^[0-9A-Z]{5}$/u.test(candidate)
    ? candidate
    : undefined;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

class CandidateWriteFailureError extends Error {
  readonly failure: StageError;

  constructor(failure: StageError, cause: unknown) {
    super(`${failure.code}: ${failure.message}`);
    this.name = "CandidateWriteFailureError";
    this.failure = failure;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export type SourceLibraryImportWriteFailure = {
  readonly failure: StageError;
};

export function isSourceLibraryImportWriteFailure(
  error: unknown,
): error is SourceLibraryImportWriteFailure {
  return error instanceof CandidateWriteFailureError;
}


function systemProviderReadContractFailure(): StageError {
  return musicDataError(
    "music_data.source_library_provider_read_contract_invalid",
    "Platform library read violated the post-Extension validation contract.",
    true,
  );
}

// Single owner of the post-Extension-contract-violation throw. The assert family
// below runs AFTER Extension's platform-library read seam has already validated
// provider output, so any structural violation reaching these asserts is a broken
// internal contract — it must fail loudly (throw) so the workflow boundary
// (markBatchFailed + rethrow) reports it, never as a fallback Result or empty page.
// `detail` is a sentence fragment completing "PlatformLibraryReadPort ___ after
// Extension validation." (e.g. "returned an unsafe provider id"); a trailing period
// is stripped so the composed message reads as one sentence.
function postExtensionContractViolation(detail: string): never {
  const fragment = detail.endsWith(".") ? detail.slice(0, -1) : detail;
  throw new Error(`PlatformLibraryReadPort ${fragment} after Extension validation.`);
}

function musicDataError(
  code: string,
  message: string,
  retryable = false,
): StageError {
  return {
    code,
    message,
    area: "music_data_platform",
    retryable,
  };
}

function requireRecord<T>(record: T | undefined, message: string): T {
  if (record === undefined) {
    throw new Error(message);
  }

  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
