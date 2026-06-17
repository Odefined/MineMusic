import { refKey, type Ref, type Result } from "../contracts/kernel.js";
import type { ProviderMaterialCandidate, SourceEntity } from "../contracts/music_data_platform.js";
import type { MusicDatabase } from "../storage/database.js";
import { createIdentityReadPort } from "./identity_read_model.js";
import {
  assertProviderMaterialCandidateRef,
  providerMaterialCandidateRefKey,
} from "./material_candidate_ref.js";
import { materialKindForSourceKind } from "./material_ref.js";
import type { MaterialRefFactory } from "./material_ref_factory.js";
import {
  createRetrievalResultSetRecords,
  type MaterialCandidateCacheRecord,
} from "./retrieval_result_set_records.js";
import { createMusicDataPlatformSourceOfTruthWriteCommands } from "./source_of_truth_write_commands.js";

export type CreateCandidateCommitCommandInput = {
  database: MusicDatabase;
  materialRefFactory: MaterialRefFactory;
  now?: () => string;
};

export type CandidateCommitCommand = {
  commitCandidate(input: CandidateCommitInput): Result<CandidateCommitResult>;
};

export type CandidateCommitInput = {
  materialCandidateRef: Ref;
};

export type CandidateCommitResult = {
  materialRef: Ref;
  created: boolean;
};

export function createCandidateCommitCommand(
  input: CreateCandidateCommitCommandInput,
): CandidateCommitCommand {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    commitCandidate(commandInput) {
      assertProviderMaterialCandidateRef(commandInput.materialCandidateRef);

      return input.database.transaction((db) => {
        const timestamp = now();
        const candidateCache = createRetrievalResultSetRecords({ db })
          .materialCandidates;
        const materialCandidateRefKey = providerMaterialCandidateRefKey({
          materialCandidateRef: commandInput.materialCandidateRef,
        });
        const cacheRecord = candidateCache.getByRefKey({
          materialCandidateRefKey,
        });

        if (cacheRecord === undefined) {
          return failMusicData(
            "music_data.material_candidate_not_found",
            "Material candidate is missing or has already been removed from the runtime cache.",
            true,
          );
        }

        if (cacheRecord.expiresAt <= timestamp) {
          return failMusicData(
            "music_data.material_candidate_expired",
            "Material candidate has expired from the runtime cache.",
            true,
          );
        }

        const sourceEntity = sourceEntityFromCacheRecord(cacheRecord);
        const identityRead = createIdentityReadPort({ db });
        const existingBinding = identityRead.findMaterialForSource({
          sourceRef: sourceEntity.sourceRef,
        });

        if (existingBinding !== undefined) {
          return ok({
            materialRef: existingBinding.materialRef,
            created: false,
          });
        }

        const writes = createMusicDataPlatformSourceOfTruthWriteCommands({
          db,
          now: timestamp,
        });
        const kind = materialKindForSourceKind(sourceEntity.kind);

        writes.identity.upsertSourceRecord({ entity: sourceEntity });
        const materialRef = input.materialRefFactory.createMaterialRef(kind);
        writes.identity.upsertMaterialRecord({
          materialRef,
          kind,
          ...(sourceEntity.versionInfo === undefined
            ? {}
            : { versionInfo: sourceEntity.versionInfo }),
        });
        writes.identity.bindSourceToMaterial({
          sourceRef: sourceEntity.sourceRef,
          materialRef,
          makePrimary: true,
        });

        return ok({
          materialRef,
          created: true,
        });
      });
    },
  };
}

function sourceEntityFromCacheRecord(record: MaterialCandidateCacheRecord): SourceEntity {
  const parsed = parseProviderMaterialCandidate(record.validatedProviderCandidateJson);
  const sourceEntity = parsed.sourceEntity;

  assertCandidateCacheRecordMatchesSource(record, sourceEntity);
  return sourceEntity;
}

function parseProviderMaterialCandidate(json: string): ProviderMaterialCandidate {
  const parsed = JSON.parse(json) as unknown;

  if (!isRecord(parsed) || !isRecord(parsed.sourceEntity)) {
    throw new Error("Material candidate cache record does not contain SourceEntity facts.");
  }

  return parsed as ProviderMaterialCandidate;
}

function assertCandidateCacheRecordMatchesSource(
  record: MaterialCandidateCacheRecord,
  sourceEntity: SourceEntity,
): void {
  if (
    record.materialCandidateKind !== "provider_candidate" ||
    record.sourceRefKey !== refKey(sourceEntity.sourceRef) ||
    record.providerId !== sourceEntity.providerId ||
    record.providerEntityId !== sourceEntity.providerEntityId ||
    record.sourceKind !== sourceEntity.kind
  ) {
    throw new Error("Material candidate cache record does not match cached SourceEntity facts.");
  }
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
    error: {
      code,
      message,
      area: "music_data_platform",
      retryable,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
