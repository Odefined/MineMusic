import type {
  CanonicalRecord,
  CanonicalProvisionalHint,
  CanonicalRelation,
  Ref,
  Result,
  StageError,
} from "../contracts/index.js";
import type {
  CanonicalRecordRepository,
  CanonicalProvisionalHintListInput,
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
  sourceRefForConflict?: Ref;
};

export type CanonicalStorage = {
  get(ref: Ref): Promise<Result<CanonicalRecord | null>>;
  put(record: CanonicalRecord, options?: PutOptions): Promise<Result<CanonicalRecord>>;
  findByLabel(input: { label: string; kind?: string }): Promise<Result<CanonicalRecord[]>>;
  findCurrentBySourceEvidence(evidence: Ref[]): Promise<Result<CanonicalRecord | null>>;
  resolveSourceRef(ref: Ref): Promise<Result<CanonicalRecord | null>>;
  putRelation(relation: CanonicalRelation): Promise<Result<CanonicalRelation>>;
  listRelations(input: CanonicalRelationListInput): Promise<Result<CanonicalRelation[]>>;
  putProvisionalHint(hint: CanonicalProvisionalHint): Promise<Result<CanonicalProvisionalHint>>;
  listProvisionalHints(input: CanonicalProvisionalHintListInput): Promise<Result<CanonicalProvisionalHint[]>>;
  findSourceRefConflict(input: {
    canonicalRef: Ref;
    sourceRef: Ref;
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
        options.sourceRefForConflict,
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

    async findCurrentBySourceEvidence(evidence) {
      if (evidence.length === 0) {
        return ok(null);
      }

      if (repository.findBySourceRef !== undefined) {
        for (const evidenceRef of evidence) {
          const record = await repository.findBySourceRef({
            ref: evidenceRef,
            currentOnly: true,
          });

          if (!record.ok || record.value !== null) {
            return record;
          }
        }

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
              (record.sourceRefs ?? []).some((sourceRef) =>
                sameRef(sourceRef, evidenceRef),
              ),
            ),
        ) ?? null,
      );
    },

    async resolveSourceRef(ref) {
      if (repository.findBySourceRef !== undefined) {
        return repository.findBySourceRef({
          ref,
          currentOnly: true,
        });
      }

      const records = await repository.list();

      if (!records.ok) {
        return records;
      }

      return ok(
        records.value.find(
          (record) =>
            isCurrentCanonicalRecord(record) &&
            (record.sourceRefs ?? []).some((sourceRef) => sameRef(sourceRef, ref)),
        ) ?? null,
      );
    },

    async findSourceRefConflict({ canonicalRef, sourceRef }) {
      if (repository.findBySourceRef !== undefined) {
        const record = await repository.findBySourceRef({ ref: sourceRef });

        if (!record.ok) {
          return record;
        }

        return ok(record.value !== null && !sameRef(record.value.ref, canonicalRef) ? record.value : null);
      }

      const records = await repository.list();

      if (!records.ok) {
        return records;
      }

      return ok(
        records.value.find(
          (record) =>
            !sameRef(record.ref, canonicalRef) &&
            (record.sourceRefs ?? []).some((candidateRef) =>
              sameRef(candidateRef, sourceRef),
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

    async putProvisionalHint(hint) {
      return repository.putProvisionalHint({ hint });
    },

    async listProvisionalHints(input) {
      return repository.listProvisionalHints(input);
    },
  };
}

function mapRepositoryWriteResult(
  result: Result<CanonicalRecord>,
  sourceRef: Ref | undefined,
): Result<CanonicalRecord> {
  if (result.ok || !isSourceRefUniqueStorageError(result.error)) {
    return result;
  }

  return fail({
    code: "canonical.source_ref_conflict",
    message:
      sourceRef === undefined
        ? "A source ref is already attached to another canonical record."
        : `Source ref '${sourceRef.namespace}:${sourceRef.kind}:${sourceRef.id}' is already attached to another canonical record.`,
    module: "canonical",
    retryable: false,
  });
}

function isSourceRefUniqueStorageError(error: StageError): boolean {
  return (
    error.code === "storage.unavailable" &&
    hasSourceRefUniqueConstraint(error.cause)
  );
}

function hasSourceRefUniqueConstraint(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) {
    return false;
  }

  if (
    "constraint" in cause &&
    cause.constraint === "canonical_source_refs_unique"
  ) {
    return true;
  }

  if ("cause" in cause) {
    return hasSourceRefUniqueConstraint(cause.cause);
  }

  return false;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
