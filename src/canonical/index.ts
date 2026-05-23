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
import { sameRef } from "./normalization.js";
import { createCanonicalStorage } from "./storage.js";

type CanonicalStoreOptions = {
  repository: CanonicalRecordRepository;
  idFactory?: () => string;
};

export function createCanonicalStore({
  repository,
  idFactory = createDefaultIdFactory("canonical"),
}: CanonicalStoreOptions): CanonicalStorePort {
  const storage = createCanonicalStorage({ repository });

  return {
    async get({ ref }) {
      return storage.get(ref);
    },

    async findByLabel({ label, kind }) {
      return storage.findByLabel({
        label,
        ...(kind === undefined ? {} : { kind }),
      });
    },

    async resolveExternalRef({ ref }) {
      return storage.resolveExternalRef(ref);
    },

    async createProvisional({ kind, label, evidence }) {
      const existingByEvidence = await storage.findCurrentByExternalEvidence(evidence ?? []);

      if (!existingByEvidence.ok) {
        return existingByEvidence;
      }

      if (existingByEvidence.value !== null) {
        return ok(existingByEvidence.value);
      }

      const existingByLabel = await storage.findByLabel({ kind, label });

      if (!existingByLabel.ok) {
        return existingByLabel;
      }

      if (existingByLabel.value[0] !== undefined) {
        return ok(existingByLabel.value[0]);
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

      const evidenceRefForConflict = evidence?.[0];

      return storage.put(
        record,
        evidenceRefForConflict === undefined
          ? {}
          : { externalRefForConflict: evidenceRefForConflict },
      );
    },

    async attachExternalRef({ canonicalRef, externalRef }) {
      const canonicalRecord = await storage.get(canonicalRef);

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

      const conflict = await storage.findExternalRefConflict({
        canonicalRef,
        externalRef,
      });

      if (!conflict.ok) {
        return conflict;
      }

      if (conflict.value !== null) {
        return fail({
          code: "canonical.external_ref_conflict",
          message: `External ref '${externalRef.namespace}:${externalRef.kind}:${externalRef.id}' is already attached to canonical record '${conflict.value.ref.id}'.`,
          module: "canonical",
          retryable: false,
        });
      }

      const existingExternalKeys = canonicalRecord.value.externalKeys ?? [];
      const externalKeys = existingExternalKeys.some((ref) => sameRef(ref, externalRef))
        ? existingExternalKeys
        : [...existingExternalKeys, externalRef];

      return storage.put(
        {
          ...canonicalRecord.value,
          externalKeys,
        },
        { externalRefForConflict: externalRef },
      );
    },
  };
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
