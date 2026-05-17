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

    async resolveExternalRef({ ref }) {
      const records = await repository.list();

      if (!records.ok) {
        return records;
      }

      return ok(
        records.value.find((record) =>
          (record.externalKeys ?? []).some((externalRef) => sameRef(externalRef, ref)),
        ) ?? null,
      );
    },

    async createProvisional({ kind, label, evidence }) {
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

      return repository.put(record);
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

      return repository.put({
        ...canonicalRecord.value,
        externalKeys,
      });
    },
  };
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

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
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
