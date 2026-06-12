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
import { DEFAULT_OWNER_SCOPE } from "./owner_scope.js";
import {
  createSourceLibraryRepositories,
  type SourceLibraryImportBatchRecord,
  type SourceLibraryImportItemOutcomeRecord,
  type SourceLibraryItemRecord,
} from "./source_library_records.js";
import { createSourceLibraryRef } from "./source_library_ref.js";

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

      const created = input.database.transaction((db) => {
        const repositories = createSourceLibraryRepositories({ db });
        const timestamp = now();
        const batchId = newBatchId();

        if (repositories.batches.get({ batchId }) !== undefined) {
          return failMusicData<SourceLibraryImportBatchRecord>(
            "music_data.source_library_import_batch_id_collision",
            `Source library import batch '${batchId}' already exists.`,
          );
        }

        return ok(repositories.batches.insert({
          batchId,
          ownerScope: DEFAULT_OWNER_SCOPE,
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
        }));
      });

      if (!created.ok) {
        return created;
      }

      return processNextPage(created.value.batchId, callLimit.value);
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

      return processNextPage(batch.batchId, callLimit.value);
    },
  };

  async function processNextPage(
    batchId: string,
    callLimit: number,
  ): Promise<Result<SourceLibraryImportResult>> {
    const initialBatch = getBatch(batchId);

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

    const pageValidation = validateProviderPageForBatch(initialBatch, read.value);

    if (!pageValidation.ok) {
      markBatchFailed(initialBatch.batchId, pageValidation.error, now());
      return pageValidation;
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
    const candidateValidation = validateProviderCandidatesForBatch(initialBatch, read.value, providerAccountId);

    if (!candidateValidation.ok) {
      markBatchFailed(initialBatch.batchId, candidateValidation.error, now());
      return candidateValidation;
    }

    let batch = persistBatchLibraryScope(initialBatch, providerAccountId, now());
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

      const itemResult = processCandidate(latestBatch, candidate);
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
  ): SourceLibraryImportItemResult {
    try {
      return input.database.transaction((db) => {
        const timestamp = now();
        const repositories = createSourceLibraryRepositories({ db });
        const identityRepositories = createIdentityRepositories({ db });
        const commands = createIdentityWriteCommands({ db, now: timestamp });
        const batchScope = requireBatchLibraryScope(batch);
        const sourceRefKey = refKey(candidate.sourceEntity.sourceRef);
        const existingItem = repositories.items.get({
          libraryRef: batchScope.libraryRef,
          sourceRefKey,
        });
        const nextAddedAt = existingItem?.addedAt ?? timestamp;
        const nextProviderAddedAt = candidate.providerAddedAt ?? existingItem?.providerAddedAt;
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
          libraryRef: batchScope.libraryRef,
          sourceRefKey,
          addedAt: nextAddedAt,
          ...(nextProviderAddedAt === undefined ? {} : { providerAddedAt: nextProviderAddedAt }),
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

  function persistBatchLibraryScope(
    batch: SourceLibraryImportBatchRecord,
    providerAccountId: string,
    timestamp: string,
  ): SourceLibraryImportBatchRecord {
    return input.database.transaction((db) => {
      const repositories = createSourceLibraryRepositories({ db });
      const libraryRef = createSourceLibraryRef({
        ownerScope: batch.ownerScope,
        providerId: batch.providerId,
        providerAccountId,
        libraryKind: batch.libraryKind,
      });
      const existingLibrary = repositories.libraries.get({ libraryRef });

      repositories.libraries.upsert({
        libraryRef,
        ownerScope: batch.ownerScope,
        providerId: batch.providerId,
        providerAccountId,
        libraryKind: batch.libraryKind,
        createdAt: existingLibrary?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });

      return repositories.batches.upsert({
        ...batch,
        providerAccountId,
        libraryRef,
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
  if (!isSafeId(input.providerId)) {
    return failMusicData(
      "music_data.invalid_source_library_import_input",
      "Source library import providerId must be a non-empty safe id.",
    );
  }

  if (
    input.providerAccountId !== undefined &&
    !isSafeId(input.providerAccountId)
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

  if (page.providerAccountId !== undefined && resolved === undefined) {
    return failMusicData(
      "music_data.source_library_account_invalid",
      "Platform library read returned an invalid provider account id.",
      true,
    );
  }

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
  if (!isRecord(page)) {
    return invalidProviderPage("Platform library read returned a malformed page.");
  }

  if (!isSafeId(page.providerId) || page.providerId !== batch.providerId) {
    return invalidProviderPage("Platform library read returned a provider id outside the import batch.");
  }

  if (page.kind !== batch.libraryKind) {
    return invalidProviderPage("Platform library read returned a library kind outside the import batch.");
  }

  if (!Array.isArray(page.candidates)) {
    return invalidProviderPage("Platform library read returned a non-array candidate list.");
  }

  if (
    page.nextCursor !== undefined &&
    (typeof page.nextCursor !== "string" || page.nextCursor.trim().length === 0)
  ) {
    return invalidProviderPage("Platform library read returned an invalid next cursor.");
  }

  if (
    page.totalCountHint !== undefined &&
    (
      typeof page.totalCountHint !== "number" ||
      !Number.isInteger(page.totalCountHint) ||
      page.totalCountHint < 0
    )
  ) {
    return invalidProviderPage("Platform library read returned an invalid total count hint.");
  }

  return ok(undefined);
}

function validateProviderCandidatesForBatch(
  batch: SourceLibraryImportBatchRecord,
  page: PlatformLibraryReadResult,
  providerAccountId: string,
): Result<void> {
  for (const candidate of page.candidates) {
    if (!isRecord(candidate)) {
      return invalidProviderPage("Platform library read returned a malformed candidate.");
    }

    if (candidate.libraryKind !== batch.libraryKind) {
      return invalidProviderPage("Platform library read returned a candidate outside the import batch kind.");
    }

    if (
      candidate.providerAccountId !== undefined &&
      (!isSafeId(candidate.providerAccountId) || candidate.providerAccountId !== providerAccountId)
    ) {
      return invalidProviderPage("Platform library read returned a candidate outside the resolved provider account.");
    }

    if (!isRecord(candidate.sourceEntity)) {
      return invalidProviderPage("Platform library read returned a candidate without source entity facts.");
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
  sourceEntity: Record<string, unknown>,
): Result<void> {
  const expectedKind = sourceKindForLibraryKind(batch.libraryKind);

  if (sourceEntity.kind !== expectedKind) {
    return invalidProviderPage("Platform library read returned source entity kind outside the import batch.");
  }

  if (!isSafeId(sourceEntity.providerId) || sourceEntity.providerId !== batch.providerId) {
    return invalidProviderPage("Platform library read returned source entity provider outside the import batch.");
  }

  if (!isSafeId(sourceEntity.providerEntityId)) {
    return invalidProviderPage("Platform library read returned source entity with unsafe provider entity id.");
  }

  if (!isRecord(sourceEntity.sourceRef)) {
    return invalidProviderPage("Platform library read returned source entity without source ref.");
  }

  const sourceRef = sourceEntity.sourceRef;
  const expectedNamespace = `source_${batch.providerId}`;

  if (sourceRef.namespace !== expectedNamespace) {
    return invalidProviderPage("Platform library read returned source ref namespace outside the import batch.");
  }

  if (sourceRef.kind !== expectedKind) {
    return invalidProviderPage("Platform library read returned source ref kind outside the import batch.");
  }

  if (!isSafeId(sourceRef.id)) {
    return invalidProviderPage("Platform library read returned source ref with unsafe id.");
  }

  return ok(undefined);
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

function optionalSourceRefKey(candidate: PlatformLibraryCandidate): string | undefined {
  try {
    return refKey(candidate.sourceEntity.sourceRef);
  } catch {
    return undefined;
  }
}

function requireBatchLibraryScope(
  batch: SourceLibraryImportBatchRecord,
): {
  providerAccountId: string;
  libraryRef: Ref;
} {
  if (batch.providerAccountId === undefined || batch.libraryRef === undefined) {
    throw new Error("Source library import batch is missing resolved library scope.");
  }

  return {
    providerAccountId: batch.providerAccountId,
    libraryRef: batch.libraryRef,
  };
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

function normalizeSafeId(value: unknown): string | undefined {
  return isSafeId(value) ? value : undefined;
}

function defaultBatchId(): string {
  return `source_library_import_${randomUUID().replaceAll("-", "")}`;
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" &&
    value.trim() === value &&
    isRefComponentSafe(value);
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

function invalidProviderPage(message: string): Result<never> {
  return failMusicData(
    "music_data.source_library_provider_page_invalid",
    message,
    true,
  );
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
