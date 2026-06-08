import { randomUUID } from "node:crypto";

import {
  isRefComponentSafe,
  refKey,
  type MaterialEntityKind,
  type PlatformLibraryCandidate,
  type PlatformLibraryKind,
  type PlatformLibraryReadInput,
  type PlatformLibraryReadResult,
  type Ref,
  type Result,
  type SourceEntity,
  type SourceLibraryImportCompletionReason,
  type SourceLibraryImportItemOutcome,
  type SourceRecord,
  type StageError,
} from "../contracts/index.js";
import type { MusicDatabase } from "../storage/database.js";
import {
  createIdentityRepositories,
} from "./identity_records.js";
import {
  createIdentityWriteCommands,
} from "./identity_write_model.js";
import type { MaterialRefFactory } from "./material_ref_factory.js";
import {
  createSourceLibraryRepositories,
  sourceLibraryItemKey,
  type SourceLibraryImportBatchRecord,
  type SourceLibraryImportItemOutcomeRecord,
  type SourceLibraryItemRecord,
} from "./source_library_records.js";

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

      const batch = input.database.transaction((db) => {
        const repositories = createSourceLibraryRepositories({ db });
        const timestamp = now();

        return repositories.batches.upsert({
          batchId: newBatchId(),
          providerId: startInput.providerId,
          ...(startInput.providerAccountId === undefined ? {} : { providerAccountId: startInput.providerAccountId }),
          libraryKind: startInput.libraryKind,
          status: "running",
          ...(startInput.maxNewItems === undefined ? {} : { maxNewItems: startInput.maxNewItems }),
          processedCount: 0,
          importedCount: 0,
          alreadyPresentCount: 0,
          failedCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      });

      return processNextPage(batch.batchId, startInput.limit);
    },
    async continueImport(continueInput) {
      const validation = validateContinueInput(continueInput);

      if (!validation.ok) {
        return validation;
      }

      const batch = getBatch(continueInput.batchId);

      if (batch === undefined) {
        return failMusicData(
          "music_data.source_library_import_batch_not_found",
          `Source library import batch '${continueInput.batchId}' was not found.`,
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

      return processNextPage(batch.batchId, continueInput.limit);
    },
  };

  async function processNextPage(
    batchId: string,
    requestedLimit: number | undefined,
  ): Promise<Result<SourceLibraryImportResult>> {
    const initialBatch = getBatch(batchId);

    if (initialBatch === undefined) {
      return failMusicData(
        "music_data.source_library_import_batch_not_found",
        `Source library import batch '${batchId}' was not found.`,
      );
    }

    const callLimit = requestedLimit ?? defaultLimit;
    const allowance = providerReadLimit(initialBatch, callLimit);

    if (!allowance.ok) {
      return allowance;
    }

    if (allowance.value === 0) {
      const batch = completeBatch(
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
      markBatchFailed(initialBatch.batchId, read.error, now());
      return read;
    }

    if (read.value.candidates.length > allowance.value) {
      const error = musicDataError(
        "music_data.source_library_provider_limit_exceeded",
        "Platform library provider returned more candidates than requested.",
      );
      markBatchFailed(initialBatch.batchId, error, now());
      return { ok: false, error };
    }

    const accountValidation = resolvedProviderAccountId(initialBatch, read.value);

    if (!accountValidation.ok) {
      markBatchFailed(initialBatch.batchId, accountValidation.error, now());
      return accountValidation;
    }

    const providerAccountId = accountValidation.value;
    let batch = persistBatchProviderAccount(initialBatch, providerAccountId, now());
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
      const latestBatch = requireBatch(batch.batchId);

      if (hasReachedMaxNewItems(latestBatch)) {
        batch = completeBatch(latestBatch, "max_new_items_reached", now());
        break;
      }

      const itemResult = processCandidate(latestBatch, candidate, providerAccountId);
      itemResults.push(itemResult);
      batch = requireBatch(batch.batchId);
    }

    const latestBatch = requireBatch(batch.batchId);

    if (hasReachedMaxNewItems(latestBatch)) {
      batch = completeBatch(latestBatch, "max_new_items_reached", now());
    } else if (read.value.nextCursor === undefined) {
      batch = completeBatch(latestBatch, "provider_exhausted", now());
    } else {
      batch = updateBatchCursor(latestBatch, read.value.nextCursor, now());
    }

    return ok({
      batch,
      providerPage: page,
      itemResults,
    });
  }

  function processCandidate(
    batch: SourceLibraryImportBatchRecord,
    candidate: PlatformLibraryCandidate,
    providerAccountId: string,
  ): SourceLibraryImportItemResult {
    try {
      return input.database.transaction((db) => {
        const timestamp = now();
        const repositories = createSourceLibraryRepositories({ db });
        const identityRepositories = createIdentityRepositories({ db });
        const commands = createIdentityWriteCommands({ db, now: timestamp });
        const sourceRefKey = refKey(candidate.sourceEntity.sourceRef);
        const existingItem = repositories.items.get({
          providerId: batch.providerId,
          providerAccountId,
          libraryKind: batch.libraryKind,
          sourceRefKey,
        });
        const nextAddedAt = candidate.addedAt ?? existingItem?.addedAt;
        const sourceRecord = commands.upsertSourceRecord({
          entity: candidate.sourceEntity,
        });
        const existingBinding = identityRepositories.sourceMaterialBindings.findMaterialForSource({
          sourceRef: candidate.sourceEntity.sourceRef,
        });
        const materialRef = existingBinding?.materialRef ??
          input.materialRefFactory.createMaterialRef(materialKindForSource(candidate.sourceEntity));

        if (existingBinding === undefined) {
          commands.upsertMaterialRecord({
            materialRef,
            kind: materialKindForSource(candidate.sourceEntity),
            ...(candidate.sourceEntity.versionInfo === undefined ? {} : { versionInfo: candidate.sourceEntity.versionInfo }),
          });
        }

        commands.bindSourceToMaterial({
          sourceRef: candidate.sourceEntity.sourceRef,
          materialRef,
          makePrimary: existingBinding === undefined,
        });

        const sourceLibraryItem = repositories.items.upsert({
          providerId: batch.providerId,
          providerAccountId,
          libraryKind: batch.libraryKind,
          sourceRefKey,
          ...(nextAddedAt === undefined ? {} : { addedAt: nextAddedAt }),
          firstImportedAt: existingItem?.firstImportedAt ?? timestamp,
          lastSeenAt: timestamp,
        });
        const outcomeKind: SourceLibraryImportItemOutcome =
          existingItem === undefined ? "imported" : "already_present";
        const outcome = repositories.itemOutcomes.insert({
          batchId: batch.batchId,
          sequence: batch.processedCount + 1,
          outcome: outcomeKind,
          sourceRefKey,
          providerId: candidate.sourceEntity.providerId,
          providerEntityId: candidate.sourceEntity.providerEntityId,
          materialRefKey: refKey(materialRef),
          createdAt: timestamp,
        });

        repositories.batches.upsert(incrementBatchCounts(
          batch,
          outcomeKind,
          timestamp,
        ));

        return {
          candidate,
          outcome,
          sourceRecord,
          sourceLibraryItem,
          materialRef,
        };
      });
    } catch (error) {
      return recordFailedCandidate(batch.batchId, candidate, error);
    }
  }

  function recordFailedCandidate(
    batchId: string,
    candidate: PlatformLibraryCandidate,
    error: unknown,
  ): SourceLibraryImportItemResult {
    return input.database.transaction((db) => {
      const repositories = createSourceLibraryRepositories({ db });
      const batch = requireRecord(
        repositories.batches.get({ batchId }),
        "source library import batch disappeared while recording item failure",
      );
      const timestamp = now();
      const compactError = compactItemError(error);
      const sourceRefKey = optionalSourceRefKey(candidate);
      const outcome = repositories.itemOutcomes.insert({
        batchId,
        sequence: batch.processedCount + 1,
        outcome: "failed",
        ...(sourceRefKey === undefined ? {} : { sourceRefKey }),
        providerId: candidate.sourceEntity.providerId,
        providerEntityId: candidate.sourceEntity.providerEntityId,
        errorCode: compactError.code,
        errorMessage: compactError.message,
        createdAt: timestamp,
      });

      repositories.batches.upsert(incrementBatchCounts(
        batch,
        "failed",
        timestamp,
      ));

      return {
        candidate,
        outcome,
        error: compactError,
      };
    });
  }

  function getBatch(batchId: string): SourceLibraryImportBatchRecord | undefined {
    return createSourceLibraryRepositories({
      db: input.database.context(),
    }).batches.get({ batchId });
  }

  function requireBatch(batchId: string): SourceLibraryImportBatchRecord {
    return requireRecord(
      getBatch(batchId),
      "source library import batch disappeared during processing",
    );
  }

  function persistBatchProviderAccount(
    batch: SourceLibraryImportBatchRecord,
    providerAccountId: string,
    timestamp: string,
  ): SourceLibraryImportBatchRecord {
    if (batch.providerAccountId === providerAccountId) {
      return batch;
    }

    return input.database.transaction((db) => {
      return createSourceLibraryRepositories({ db }).batches.upsert({
        ...batch,
        providerAccountId,
        updatedAt: timestamp,
      });
    });
  }

  function markBatchFailed(
    batchId: string,
    error: StageError,
    timestamp: string,
  ): SourceLibraryImportBatchRecord | undefined {
    return input.database.transaction((db) => {
      const repositories = createSourceLibraryRepositories({ db });
      const batch = repositories.batches.get({ batchId });

      if (batch === undefined) {
        return undefined;
      }

      return repositories.batches.upsert({
        ...withoutCursor(batch),
        status: "failed",
        failureCode: error.code,
        failureMessage: error.message,
        updatedAt: timestamp,
      });
    });
  }

  function completeBatch(
    batch: SourceLibraryImportBatchRecord,
    completionReason: SourceLibraryImportCompletionReason,
    timestamp: string,
  ): SourceLibraryImportBatchRecord {
    return input.database.transaction((db) => {
      return createSourceLibraryRepositories({ db }).batches.upsert({
        ...withoutCursor(batch),
        status: "completed",
        completionReason,
        updatedAt: timestamp,
      });
    });
  }

  function updateBatchCursor(
    batch: SourceLibraryImportBatchRecord,
    cursor: string,
    timestamp: string,
  ): SourceLibraryImportBatchRecord {
    return input.database.transaction((db) => {
      return createSourceLibraryRepositories({ db }).batches.upsert({
        ...batch,
        cursor,
        updatedAt: timestamp,
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

  if (!isOptionalPositiveInteger(input.limit)) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import limit must be a positive integer when present.",
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

  if (!isOptionalPositiveInteger(input.limit)) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import limit must be a positive integer when present.",
    );
  }

  return ok(undefined);
}

function providerReadLimit(
  batch: SourceLibraryImportBatchRecord,
  callLimit: number,
): Result<number> {
  if (!Number.isInteger(callLimit) || callLimit < 1) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import limit must be a positive integer.",
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
  const resolved = normalizeId(page.providerAccountId);

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

function incrementBatchCounts(
  batch: SourceLibraryImportBatchRecord,
  outcome: SourceLibraryImportItemOutcome,
  timestamp: string,
): SourceLibraryImportBatchRecord {
  return {
    ...batch,
    processedCount: batch.processedCount + 1,
    importedCount: batch.importedCount + (outcome === "imported" ? 1 : 0),
    alreadyPresentCount: batch.alreadyPresentCount + (outcome === "already_present" ? 1 : 0),
    failedCount: batch.failedCount + (outcome === "failed" ? 1 : 0),
    updatedAt: timestamp,
  };
}

function hasReachedMaxNewItems(batch: SourceLibraryImportBatchRecord): boolean {
  return batch.maxNewItems !== undefined && batch.importedCount >= batch.maxNewItems;
}

function withoutCursor(
  batch: SourceLibraryImportBatchRecord,
): Omit<SourceLibraryImportBatchRecord, "cursor"> {
  const { cursor: _cursor, ...rest } = batch;

  return rest;
}

function materialKindForSource(sourceEntity: SourceEntity): MaterialEntityKind {
  switch (sourceEntity.kind) {
    case "track":
      return "recording";
    case "album":
      return "album";
    case "artist":
      return "artist";
  }
}

function optionalSourceRefKey(candidate: PlatformLibraryCandidate): string | undefined {
  try {
    return sourceLibraryItemKey({
      providerId: candidate.sourceEntity.providerId,
      providerAccountId: candidate.providerAccountId ?? "unknown",
      libraryKind: candidate.libraryKind,
      sourceRef: candidate.sourceEntity.sourceRef,
    }).sourceRefKey;
  } catch {
    return undefined;
  }
}

function compactItemError(error: unknown): { code: string; message: string } {
  if (isRecord(error) && typeof error.code === "string" && typeof error.message === "string") {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: "music_data.source_library_item_write_failed",
      message: error.message,
    };
  }

  return {
    code: "music_data.source_library_item_write_failed",
    message: "Source library item write failed.",
  };
}

function isOptionalPositiveInteger(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

function isPlatformLibraryKind(value: unknown): value is PlatformLibraryKind {
  return value === "saved_source_track" ||
    value === "saved_source_album" ||
    value === "followed_source_artist";
}

function normalizeId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function defaultBatchId(): string {
  return `source_library_import_${randomUUID().replaceAll("-", "")}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
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
