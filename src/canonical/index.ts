import type {
  CanonicalRecord,
  Ref,
  Result,
  StageError,
} from "../contracts/index.js";
import type {
  CanonicalRecordRepository,
  CanonicalStorePort,
} from "../ports/index.js";

type CanonicalStoreOptions = {
  repository: CanonicalRecordRepository;
  idFactory?: () => string;
};

export function createCanonicalStore({
  repository,
  idFactory = createDefaultIdFactory("canonical"),
}: CanonicalStoreOptions): CanonicalStorePort {
  return {
    async get({ ref }) {
      return repository.get(ref);
    },

    async findByLabel({ label, kind }) {
      const records = await repository.list();

      if (!records.ok) {
        return records;
      }

      const normalizedLabel = normalizeLabel(label);

      return ok(
        records.value.filter(
          (record) =>
            isCurrentRecord(record) &&
            matchesRecordLabel(record, normalizedLabel) &&
            (kind === undefined || record.kind === kind || record.ref.kind === kind),
        ),
      );
    },

    async resolveExternalRef({ ref }) {
      const records = await repository.list();

      if (!records.ok) {
        return records;
      }

      return ok(
        records.value.find((record) =>
          isCurrentRecord(record) &&
          (record.externalKeys ?? []).some((externalRef) => sameRef(externalRef, ref)),
        ) ?? null,
      );
    },

    async createProvisional({ kind, label, evidence }) {
      const existingByEvidence = await findCurrentRecordByExternalEvidence(
        repository,
        evidence ?? [],
      );

      if (!existingByEvidence.ok) {
        return existingByEvidence;
      }

      if (existingByEvidence.value !== null) {
        return ok(existingByEvidence.value);
      }

      const existingByLabel = await findCurrentRecordByLabel(repository, { kind, label });

      if (!existingByLabel.ok) {
        return existingByLabel;
      }

      if (existingByLabel.value !== null) {
        return ok(existingByLabel.value);
      }

      const record: CanonicalRecord = {
        ref: {
          namespace: "minemusic",
          kind,
          id: idFactory(),
          label,
        },
        kind,
        label,
        status: "provisional",
        externalKeys: evidence ?? [],
      };

      return mapRepositoryWriteResult(await repository.put(record), evidence?.[0]);
    },

    async attachExternalRef({ canonicalRef, externalRef }) {
      const canonicalRecord = await repository.get(canonicalRef);

      if (!canonicalRecord.ok) {
        return canonicalRecord;
      }

      if (canonicalRecord.value === null) {
        return fail({
          code: "canonical.not_found",
          message: `Canonical record '${canonicalRef.id}' was not found.`,
          module: "canonical",
          retryable: false,
        });
      }

      const conflict = await findExternalRefConflict(repository, canonicalRef, externalRef);

      if (!conflict.ok) {
        return conflict;
      }

      const existingExternalKeys = canonicalRecord.value.externalKeys ?? [];
      const externalKeys = existingExternalKeys.some((ref) => sameRef(ref, externalRef))
        ? existingExternalKeys
        : [...existingExternalKeys, externalRef];

      return mapRepositoryWriteResult(
        await repository.put({
          ...canonicalRecord.value,
          externalKeys,
        }),
        externalRef,
      );
    },
  };
}

async function findCurrentRecordByExternalEvidence(
  repository: CanonicalRecordRepository,
  evidence: Ref[],
): Promise<Result<CanonicalRecord | null>> {
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
        isCurrentRecord(record) &&
        evidence.some((evidenceRef) =>
          (record.externalKeys ?? []).some((externalRef) => sameRef(externalRef, evidenceRef)),
        ),
    ) ?? null,
  );
}

async function findCurrentRecordByLabel(
  repository: CanonicalRecordRepository,
  {
    kind,
    label,
  }: {
    kind: string;
    label: string;
  },
): Promise<Result<CanonicalRecord | null>> {
  const records = await repository.list();

  if (!records.ok) {
    return records;
  }

  const normalizedLabel = normalizeLabel(label);

  return ok(
    records.value.find(
      (record) =>
        isCurrentRecord(record) &&
        (record.kind === kind || record.ref.kind === kind) &&
        matchesRecordLabel(record, normalizedLabel),
    ) ?? null,
  );
}

async function findExternalRefConflict(
  repository: CanonicalRecordRepository,
  canonicalRef: Ref,
  externalRef: Ref,
): Promise<Result<null>> {
  const records = await repository.list();

  if (!records.ok) {
    return records;
  }

  const conflictingRecord = records.value.find(
    (record) =>
      !sameRef(record.ref, canonicalRef) &&
      (record.externalKeys ?? []).some((candidateRef) => sameRef(candidateRef, externalRef)),
  );

  if (conflictingRecord !== undefined) {
    return fail({
      code: "canonical.external_ref_conflict",
      message: `External ref '${externalRef.namespace}:${externalRef.kind}:${externalRef.id}' is already attached to canonical record '${conflictingRecord.ref.id}'.`,
      module: "canonical",
      retryable: false,
    });
  }

  return ok(null);
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

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

function isCurrentRecord(record: CanonicalRecord): boolean {
  return record.status === "active" || record.status === "provisional";
}

function matchesRecordLabel(record: CanonicalRecord, normalizedLabel: string): boolean {
  return (
    normalizeLabel(record.label) === normalizedLabel ||
    (record.aliases ?? []).some((alias) => normalizeLabel(alias) === normalizedLabel)
  );
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function createDefaultIdFactory(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
