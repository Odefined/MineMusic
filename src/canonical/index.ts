import type {
  CanonicalRecord,
  CanonicalRelation,
  CanonicalRelationDraft,
  CanonicalRelationValue,
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
  clock?: () => string;
};

export function createCanonicalStore({
  repository,
  idFactory = createDefaultIdFactory("canonical"),
  clock = () => new Date().toISOString(),
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

    async recordProvisionalRelations({ subjectRef, sourceRef, providerId, batchId, relations }) {
      const subject = await storage.get(subjectRef);

      if (!subject.ok) {
        return fail(subject.error);
      }

      if (subject.value === null) {
        return fail({
          code: "canonical.not_found",
          message: `Canonical record '${subjectRef.id}' was not found.`,
          module: "canonical",
          retryable: false,
        });
      }

      const storedRelations: CanonicalRelation[] = [];

      for (const relation of relations) {
        const now = clock();
        const provisionalRelation: CanonicalRelation = {
          id: canonicalRelationId({
            subjectRef,
            sourceRef,
            relation,
          }),
          subjectRef,
          predicate: relation.predicate,
          objectKind: relation.objectKind,
          ...(relation.objectRef === undefined ? {} : { objectRef: relation.objectRef }),
          ...(relation.objectLabel === undefined ? {} : { objectLabel: relation.objectLabel }),
          ...(relation.objectValue === undefined ? {} : { objectValue: relation.objectValue }),
          sourceRef,
          ...(providerId === undefined ? {} : { providerId }),
          ...(batchId === undefined ? {} : { batchId }),
          status: "provisional",
          createdAt: now,
          updatedAt: now,
        };
        const stored = await storage.putRelation(provisionalRelation);

        if (!stored.ok) {
          return stored;
        }

        storedRelations.push(stored.value);
      }

      return ok(storedRelations);
    },

    async listRelations(input) {
      return storage.listRelations(input);
    },
  };
}

function createDefaultIdFactory(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function canonicalRelationId({
  subjectRef,
  sourceRef,
  relation,
}: {
  subjectRef: Ref;
  sourceRef: Ref;
  relation: CanonicalRelationDraft;
}): string {
  return JSON.stringify([
    refKey(subjectRef),
    relation.predicate,
    relation.objectKind,
    relation.objectRef === undefined ? null : refKey(relation.objectRef),
    relation.objectLabel ?? null,
    relation.objectValue === undefined ? null : relationValueKey(relation.objectValue),
    refKey(sourceRef),
  ]);
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function relationValueKey(value: CanonicalRelationValue): string {
  return JSON.stringify(value);
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
