import { randomUUID } from "node:crypto";

import type {
  MaterialRecord,
  Ref,
  Result,
  StageError,
} from "../../../contracts/index.js";
import type { MaterialRegistryPort } from "../../../ports/index.js";

export type InMemoryMaterialRegistryOptions = {
  generateId?: () => string;
  now?: () => string;
};

export function createInMemoryMaterialRegistry({
  generateId = () => randomUUID(),
  now = () => new Date().toISOString(),
}: InMemoryMaterialRegistryOptions = {}): MaterialRegistryPort {
  const records = new Map<string, MaterialRecord>();
  const sourceRefs = new Map<string, Ref>();
  const canonicalRefs = new Map<string, Ref>();
  const redirects = new Map<string, Ref>();

  function createRecord(input: {
    kind: string;
    identityState: MaterialRecord["identityState"];
    canonicalRef?: Ref;
    sourceRefs?: Ref[];
    primarySourceRef?: Ref;
  }): MaterialRecord {
    const timestamp = now();
    const materialRef: Ref = {
      namespace: "minemusic",
      kind: "material",
      id: generateId(),
    };

    return {
      materialRef,
      kind: input.kind,
      identityState: input.identityState,
      ...(input.canonicalRef === undefined ? {} : { canonicalRef: clone(input.canonicalRef) }),
      sourceRefs: uniqueRefs(input.sourceRefs ?? []),
      ...(input.primarySourceRef === undefined ? {} : { primarySourceRef: clone(input.primarySourceRef) }),
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  function putRecord(record: MaterialRecord): MaterialRecord {
    records.set(refKey(record.materialRef), clone(record));
    return clone(record);
  }

  function getRecord(materialRef: Ref): MaterialRecord | null {
    const record = records.get(refKey(materialRef));
    return record === undefined ? null : clone(record);
  }

  function getCurrentRecord(materialRef: Ref): Result<MaterialRecord | null> {
    const resolved = resolveRedirect(materialRef);
    if (!resolved.ok) return resolved;
    return ok(getRecord(resolved.value));
  }

  function resolveRedirect(materialRef: Ref): Result<Ref> {
    let current = clone(materialRef);
    const seen = new Set<string>();

    for (let depth = 0; depth < 20; depth += 1) {
      const key = refKey(current);
      if (seen.has(key)) {
        return fail({
          code: "material_registry.conflict",
          message: "Material redirect cycle detected.",
          module: "material_store",
          retryable: false,
        });
      }
      seen.add(key);

      const next = redirects.get(key);
      if (next === undefined) {
        return ok(current);
      }
      current = clone(next);
    }

    return fail({
      code: "material_registry.conflict",
      message: "Material redirect chain exceeded the maximum depth.",
      module: "material_store",
      retryable: false,
    });
  }

  return {
    async getMaterialRecord({ materialRef }) {
      return ok(getRecord(materialRef));
    },

    async resolveMaterialRedirect({ materialRef }) {
      return resolveRedirect(materialRef);
    },

    async findMaterialBySourceRef({ sourceRef }) {
      const materialRef = sourceRefs.get(refKey(sourceRef));
      if (materialRef === undefined) {
        return ok(null);
      }
      return getCurrentRecord(materialRef);
    },

    async findMaterialByCanonicalRef({ canonicalRef }) {
      const materialRef = canonicalRefs.get(refKey(canonicalRef));
      if (materialRef === undefined) {
        return ok(null);
      }
      return getCurrentRecord(materialRef);
    },

    async getOrCreateBySourceRef({ sourceRef, kind, primarySourceRef }) {
      const existing = sourceRefs.get(refKey(sourceRef));
      if (existing !== undefined) {
        const current = getCurrentRecord(existing);
        if (!current.ok) return current;
        return current.value === null ? notFound(existing) : ok(current.value);
      }

      const record = createRecord({
        kind,
        identityState: "source_backed",
        sourceRefs: [sourceRef],
        primarySourceRef: primarySourceRef ?? sourceRef,
      });
      putRecord(record);
      sourceRefs.set(refKey(sourceRef), clone(record.materialRef));

      return ok(clone(record));
    },

    async getOrCreateByCanonicalRef({ canonicalRef, kind, sourceRefs: initialSourceRefs }) {
      const existing = canonicalRefs.get(refKey(canonicalRef));
      if (existing !== undefined) {
        const current = getCurrentRecord(existing);
        if (!current.ok) return current;
        return current.value === null ? notFound(existing) : ok(current.value);
      }

      for (const sourceRef of initialSourceRefs ?? []) {
        const sourceOwner = sourceRefs.get(refKey(sourceRef));
        if (sourceOwner !== undefined) {
          return conflict(`Source ref '${refKey(sourceRef)}' is already attached to material '${refKey(sourceOwner)}'.`);
        }
      }

      const record = createRecord({
        kind,
        identityState: "canonical_confirmed",
        canonicalRef,
        ...(initialSourceRefs === undefined ? {} : { sourceRefs: initialSourceRefs }),
        ...(initialSourceRefs?.[0] === undefined ? {} : { primarySourceRef: initialSourceRefs[0] }),
      });
      putRecord(record);
      canonicalRefs.set(refKey(canonicalRef), clone(record.materialRef));
      for (const sourceRef of record.sourceRefs) {
        sourceRefs.set(refKey(sourceRef), clone(record.materialRef));
      }

      return ok(clone(record));
    },

    async attachSourceRef({ materialRef, sourceRef }) {
      const resolved = resolveRedirect(materialRef);
      if (!resolved.ok) return resolved;
      const record = getRecord(resolved.value);
      if (record === null) {
        return notFound(resolved.value);
      }

      const sourceOwner = sourceRefs.get(refKey(sourceRef));
      if (sourceOwner !== undefined && refKey(sourceOwner) !== refKey(record.materialRef)) {
        return conflict(`Source ref '${refKey(sourceRef)}' is already attached to material '${refKey(sourceOwner)}'.`);
      }

      const updated: MaterialRecord = {
        ...record,
        sourceRefs: uniqueRefs([...record.sourceRefs, sourceRef]),
        updatedAt: now(),
      };
      putRecord(updated);
      sourceRefs.set(refKey(sourceRef), clone(updated.materialRef));

      return ok(clone(updated));
    },

    async promoteToCanonical({ materialRef, canonicalRef }) {
      const resolved = resolveRedirect(materialRef);
      if (!resolved.ok) return resolved;
      const record = getRecord(resolved.value);
      if (record === null) {
        return notFound(resolved.value);
      }
      if (record.canonicalRef !== undefined && !sameRef(record.canonicalRef, canonicalRef)) {
        return conflict(
          `Material '${refKey(record.materialRef)}' is already promoted to canonical ref '${refKey(record.canonicalRef)}'.`,
        );
      }

      const canonicalOwner = canonicalRefs.get(refKey(canonicalRef));
      if (canonicalOwner !== undefined && refKey(canonicalOwner) !== refKey(record.materialRef)) {
        return conflict(`Canonical ref '${refKey(canonicalRef)}' is already attached to material '${refKey(canonicalOwner)}'.`);
      }

      const updated: MaterialRecord = {
        ...record,
        canonicalRef: clone(canonicalRef),
        identityState: "canonical_confirmed",
        updatedAt: now(),
      };
      putRecord(updated);
      canonicalRefs.set(refKey(canonicalRef), clone(updated.materialRef));

      return ok(clone(updated));
    },

    async mergeMaterials({ from, into, reason }) {
      if (sameRef(from, into)) {
        return conflict(`Cannot merge material '${refKey(from)}' into itself.`);
      }

      const fromRecord = getRecord(from);
      if (fromRecord === null) {
        return notFound(from);
      }
      const survivor = getRecord(into);
      if (survivor === null) {
        return notFound(into);
      }
      const transferredPrimarySourceRef =
        survivor.primarySourceRef ?? fromRecord.primarySourceRef ?? fromRecord.sourceRefs[0];
      const survivorUpdated: MaterialRecord = {
        ...survivor,
        sourceRefs: uniqueRefs([...survivor.sourceRefs, ...fromRecord.sourceRefs]),
        ...(transferredPrimarySourceRef === undefined
          ? {}
          : { primarySourceRef: clone(transferredPrimarySourceRef) }),
        updatedAt: now(),
      };

      const updated: MaterialRecord = {
        ...fromRecord,
        status: "merged",
        mergedIntoMaterialRef: clone(survivor.materialRef),
        updatedAt: now(),
      };
      putRecord(survivorUpdated);
      putRecord(updated);
      for (const sourceRef of fromRecord.sourceRefs) {
        sourceRefs.set(refKey(sourceRef), clone(survivor.materialRef));
      }
      if (fromRecord.canonicalRef !== undefined) {
        canonicalRefs.set(refKey(fromRecord.canonicalRef), clone(survivor.materialRef));
      }
      redirects.set(refKey(fromRecord.materialRef), clone(survivor.materialRef));
      void reason;

      return ok(clone(updated));
    },
  };
}

function uniqueRefs(refs: Ref[]): Ref[] {
  const unique = new Map<string, Ref>();
  for (const ref of refs) {
    unique.set(refKey(ref), clone(ref));
  }
  return [...unique.values()];
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function sameRef(left: Ref, right: Ref): boolean {
  return refKey(left) === refKey(right);
}

function notFound<T>(materialRef: Ref): Result<T> {
  return fail({
    code: "material_registry.not_found",
    message: `Material record '${refKey(materialRef)}' was not found.`,
    module: "material_store",
    retryable: false,
  });
}

function conflict<T>(message: string): Result<T> {
  return fail({
    code: "material_registry.conflict",
    message,
    module: "material_store",
    retryable: false,
  });
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
