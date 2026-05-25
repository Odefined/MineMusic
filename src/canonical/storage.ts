import type {
  CanonicalRecord,
  CanonicalRelation,
  Ref,
  Result,
  StageError,
} from "../contracts/index.js";
import type {
  CanonicalRecordRepository,
  CanonicalRelationListInput,
} from "../ports/index.js";
import {
  isCurrentCanonicalRecord,
  matchesCanonicalKind,
  matchesCanonicalRecordLabel,
  normalizeCanonicalLabel,
  sameRef,
} from "./normalization.js";

type CanonicalStorageOptions = {
  repository: CanonicalRecordRepository;
};

type PutOptions = {
  externalRefForConflict?: Ref;
};

export type CanonicalStorage = {
  get(ref: Ref): Promise<Result<CanonicalRecord | null>>;
  put(record: CanonicalRecord, options?: PutOptions): Promise<Result<CanonicalRecord>>;
  findByLabel(input: { label: string; kind?: string }): Promise<Result<CanonicalRecord[]>>;
  findCurrentByExternalEvidence(evidence: Ref[]): Promise<Result<CanonicalRecord | null>>;
  resolveExternalRef(ref: Ref): Promise<Result<CanonicalRecord | null>>;
  putRelation(relation: CanonicalRelation): Promise<Result<CanonicalRelation>>;
  listRelations(input: CanonicalRelationListInput): Promise<Result<CanonicalRelation[]>>;
  findExternalRefConflict(input: {
    canonicalRef: Ref;
    externalRef: Ref;
  }): Promise<Result<CanonicalRecord | null>>;
};

export function createCanonicalStorage({
  repository,
}: CanonicalStorageOptions): CanonicalStorage {
  return {
    get(ref) {
      return repository.get(ref);
    },

    async put(record, options = {}) {
      return mapRepositoryWriteResult(
        await repository.put(record),
        options.externalRefForConflict,
      );
    },

    async findByLabel({ label, kind }) {
      const records = await repository.list();

      if (!records.ok) {
        return records;
      }

      const normalizedLabel = normalizeCanonicalLabel(label);

      return ok(
        records.value.filter(
          (record) =>
            isCurrentCanonicalRecord(record) &&
            matchesCanonicalRecordLabel(record, normalizedLabel) &&
            (kind === undefined || matchesCanonicalKind(record, kind)),
        ),
      );
    },

    async findCurrentByExternalEvidence(evidence) {
      if (evidence.length === 0) {
        return ok(null);
      }

      const records = await repository.list();

      if (!records.ok) {
        return records;
      }

      return ok(
        records.value.find(
          (record) =>
            isCurrentCanonicalRecord(record) &&
            evidence.some((evidenceRef) =>
              (record.externalKeys ?? []).some((externalRef) =>
                sameRef(externalRef, evidenceRef),
              ),
            ),
        ) ?? null,
      );
    },

    async resolveExternalRef(ref) {
      const records = await repository.list();

      if (!records.ok) {
        return records;
      }

      return ok(
        records.value.find(
          (record) =>
            isCurrentCanonicalRecord(record) &&
            (record.externalKeys ?? []).some((externalRef) => sameRef(externalRef, ref)),
        ) ?? null,
      );
    },

    async findExternalRefConflict({ canonicalRef, externalRef }) {
      const records = await repository.list();

      if (!records.ok) {
        return records;
      }

      return ok(
        records.value.find(
          (record) =>
            !sameRef(record.ref, canonicalRef) &&
            (record.externalKeys ?? []).some((candidateRef) =>
              sameRef(candidateRef, externalRef),
            ),
        ) ?? null,
      );
    },

    async putRelation(relation) {
      return repository.putRelation({ relation });
    },

    async listRelations(input) {
      return repository.listRelations(input);
    },
  };
}

function mapRepositoryWriteResult(
  result: Result<CanonicalRecord>,
  externalRef: Ref | undefined,
): Result<CanonicalRecord> {
  if (result.ok || !isExternalRefUniqueStorageError(result.error)) {
    return result;
  }

  return fail({
    code: "canonical.external_ref_conflict",
    message:
      externalRef === undefined
        ? "An external ref is already attached to another canonical record."
        : `External ref '${externalRef.namespace}:${externalRef.kind}:${externalRef.id}' is already attached to another canonical record.`,
    module: "canonical",
    retryable: false,
  });
}

function isExternalRefUniqueStorageError(error: StageError): boolean {
  return (
    error.code === "storage.unavailable" &&
    hasExternalRefUniqueConstraint(error.cause)
  );
}

function hasExternalRefUniqueConstraint(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) {
    return false;
  }

  if (
    "constraint" in cause &&
    cause.constraint === "canonical_external_refs_unique"
  ) {
    return true;
  }

  if ("cause" in cause) {
    return hasExternalRefUniqueConstraint(cause.cause);
  }

  return false;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
