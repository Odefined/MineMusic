import type {
  CanonicalRecord,
  MaterialRecord,
  MaterialResolveIssue,
  MusicMaterial,
  Ref,
  Result,
  SourceLibraryItem,
  SourceMaterial,
} from "../../contracts/index.js";
import type {
  MaterialSourceLibraryMaterializerPort,
  MaterialSourceMaterializerPort,
  MaterialSourceMaterializerStorePort,
  ProjectedSourceMaterial,
  ProjectedSourceMaterials,
} from "../../ports/index.js";
import { materialKindForMaterial, sourceKindToMaterialKind } from "../kinds.js";
import { projectMaterialRecord as projectStoredMaterialRecord } from "../projection/index.js";

export function createMaterialMaterializer({
  materialStore,
}: {
  materialStore: MaterialSourceMaterializerStorePort;
}): MaterialSourceMaterializerPort & MaterialSourceLibraryMaterializerPort {
  return {
    async materializeSourceMaterials({ materials }) {
      return projectSourceMaterials({ materialStore, materials });
    },

    async materializeSourceMaterial({ material }) {
      return projectSourceMaterial(materialStore, material);
    },

    async attachKnownCanonicalRefs({ materials }) {
      return attachKnownCanonicalRefsToMaterials(materialStore, materials);
    },

    async materialForSourceLibraryItem({ ownerScope, item }) {
      const record = await materialStore.getOrCreateBySourceRef({
        sourceRef: item.sourceRef,
        kind: sourceKindToMaterialKind(item.sourceKind),
        primarySourceRef: item.sourceRef,
      });

      if (!record.ok) {
        return record;
      }

      return projectStoredMaterialRecord(materialStore, record.value, {
        ownerScope,
        purpose: "resolve.cards",
        fallbackLabel: item.label,
      });
    },
  };
}

async function projectSourceMaterials({
  materialStore,
  materials,
}: {
  materialStore: MaterialSourceMaterializerStorePort;
  materials: SourceMaterial[];
}): Promise<Result<ProjectedSourceMaterials>> {
  const projected: MusicMaterial[] = [];
  const issues: MaterialResolveIssue[] = [];

  for (const material of materials) {
    const result = await projectSourceMaterial(materialStore, material);

    if (!result.ok) {
      return result;
    }

    issues.push(...result.value.issues);

    if (result.value.material !== null) {
      projected.push(result.value.material);
    }
  }

  return ok({ materials: projected, issues });
}

async function projectSourceMaterial(
  materialStore: MaterialSourceMaterializerStorePort,
  material: SourceMaterial,
): Promise<Result<ProjectedSourceMaterial>> {
  const sourceRefs = mergeRefs(
    material.sourceRefs ?? [],
    (material.playableLinks ?? []).map((link) => link.sourceRef),
  );
  const sourceMaterial: SourceMaterial = {
    ...material,
    ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
  };
  const recordResult = await resolveSourceMaterialToRecord(materialStore, sourceMaterial);

  if (!recordResult.ok) {
    return recordResult;
  }

  if (recordResult.value === null) {
    return ok({
      material: null,
      issues: [providerResultMissingSourceRefIssue(sourceMaterial)],
    });
  }

  const projected = await projectResolvedMaterialRecord(materialStore, recordResult.value, sourceMaterial);

  if (!projected.ok) {
    return projected;
  }

  return ok({ material: projected.value, issues: [] });
}

async function resolveSourceMaterialToRecord(
  materialStore: MaterialSourceMaterializerStorePort,
  material: SourceMaterial,
): Promise<Result<MaterialRecord | null>> {
  if (material.canonicalRef !== undefined) {
    return materialRecordForCanonicalSourceMaterial(materialStore, material.canonicalRef, material);
  }

  const sourceRef = material.sourceRefs?.[0];

  if (sourceRef === undefined) {
    return ok(null);
  }

  const record = await materialStore.getOrCreateBySourceRef({
    sourceRef,
    kind: materialKindForMaterial(material),
    primarySourceRef: sourceRef,
  });

  if (!record.ok) {
    return record;
  }

  return attachAdditionalSourceRefs(materialStore, record.value, material.sourceRefs?.slice(1) ?? []);
}

async function materialRecordForCanonicalSourceMaterial(
  materialStore: MaterialSourceMaterializerStorePort,
  canonicalRef: Ref,
  material: SourceMaterial,
): Promise<Result<MaterialRecord>> {
  const sourceRefs = material.sourceRefs ?? [];
  const sourceRecord =
    sourceRefs[0] === undefined
      ? ok(null)
      : await materialStore.findMaterialBySourceRef({ sourceRef: sourceRefs[0] });

  if (!sourceRecord.ok) {
    return sourceRecord;
  }

  const canonicalRecord = await materialStore.findMaterialByCanonicalRef({ canonicalRef });

  if (!canonicalRecord.ok) {
    return canonicalRecord;
  }

  if (sourceRecord.value === null && canonicalRecord.value === null) {
    return materialStore.getOrCreateByCanonicalRef({
      canonicalRef,
      kind: materialKindForMaterial(material),
      ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
    });
  }

  if (sourceRecord.value !== null && canonicalRecord.value === null) {
    const promoted = await materialStore.promoteToCanonical({
      materialRef: sourceRecord.value.materialRef,
      canonicalRef,
    });

    if (!promoted.ok) {
      return promoted;
    }

    return attachAdditionalSourceRefs(materialStore, promoted.value, sourceRefs.slice(1));
  }

  if (canonicalRecord.value !== null) {
    let record = canonicalRecord.value;

    if (sourceRecord.value !== null && refKey(sourceRecord.value.materialRef) !== refKey(record.materialRef)) {
      const merged = await materialStore.mergeMaterials({
        from: sourceRecord.value.materialRef,
        into: record.materialRef,
        reason: "confirmed_source_canonical_binding",
      });

      if (!merged.ok) {
        return merged;
      }

      return attachAdditionalSourceRefs(materialStore, record, sourceRefs);
    }

    for (const sourceRef of sourceRefs) {
      const attached = await materialStore.attachSourceRef({
        materialRef: record.materialRef,
        sourceRef,
      });

      if (!attached.ok) {
        return attached;
      }

      record = attached.value;
    }

    return ok(record);
  }

  return materialStore.getOrCreateByCanonicalRef({
    canonicalRef,
    kind: materialKindForMaterial(material),
    ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
  });
}

async function attachAdditionalSourceRefs(
  materialStore: MaterialSourceMaterializerStorePort,
  record: MaterialRecord,
  sourceRefs: Ref[],
): Promise<Result<MaterialRecord>> {
  let current = record;

  for (const sourceRef of sourceRefs) {
    const attached = await materialStore.attachSourceRef({
      materialRef: current.materialRef,
      sourceRef,
    });

    if (!attached.ok) {
      return attached;
    }

    current = attached.value;
  }

  return ok(current);
}

async function attachKnownCanonicalRefsToMaterials(
  materialStore: MaterialSourceMaterializerStorePort,
  materials: SourceMaterial[],
): Promise<Result<SourceMaterial[]>> {
  const attachedMaterials: SourceMaterial[] = [];

  for (const material of materials) {
    const sourceRefs = mergeRefs(
      material.sourceRefs ?? [],
      (material.playableLinks ?? []).map((link) => link.sourceRef),
    );
    const canonical = await findCanonicalForSourceRefs(materialStore, sourceRefs);

    if (!canonical.ok) {
      return canonical;
    }

    if (canonical.value === null) {
      attachedMaterials.push(material);
      continue;
    }

    attachedMaterials.push({
      ...material,
      canonicalRef: canonical.value.ref,
      ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
      state: stateWithCanonical(material),
    });
  }

  return ok(attachedMaterials);
}

async function projectResolvedMaterialRecord(
  materialStore: MaterialSourceMaterializerStorePort,
  record: MaterialRecord,
  sourceMaterial: SourceMaterial,
): Promise<Result<MusicMaterial>> {
  const canonical =
    record.canonicalRef === undefined
      ? ok(null)
      : await materialStore.getCanonical({ ref: record.canonicalRef });

  if (!canonical.ok) {
    return canonical;
  }

  return ok({
    ...sourceMaterial,
    kind: materialKindForMaterial(sourceMaterial),
    label: canonical.value?.label ?? sourceMaterial.label,
    materialRef: record.materialRef,
    identityState: record.identityState,
    ...(record.canonicalRef === undefined ? {} : { canonicalRef: record.canonicalRef }),
    ...(record.sourceRefs.length === 0 ? {} : { sourceRefs: record.sourceRefs }),
  });
}

async function findCanonicalForSourceRefs(
  materialStore: MaterialSourceMaterializerStorePort,
  sourceRefs: Ref[],
): Promise<Result<CanonicalRecord | null>> {
  for (const sourceRef of sourceRefs) {
    const binding = await materialStore.getConfirmedCanonicalBinding({ sourceRef });

    if (!binding.ok) {
      return binding;
    }

    if (binding.value === null) {
      continue;
    }

    const canonical = await materialStore.getCanonical({ ref: binding.value.canonicalRef });

    if (!canonical.ok || canonical.value !== null) {
      return canonical;
    }
  }

  return ok(null);
}

function stateWithCanonical(material: SourceMaterial): MusicMaterial["state"] {
  if (isTerminalState(material.state)) {
    return material.state;
  }

  return (material.playableLinks?.length ?? 0) > 0 ? "confirmed_playable" : "grounded";
}

function providerResultMissingSourceRefIssue(material: SourceMaterial): MaterialResolveIssue {
  return {
    code: "provider_result_missing_source_ref",
    message:
      "Provider result did not include a stable sourceRef or canonicalRef, so no Material Store-backed material was created.",
    retryable: false,
    resultLabel: material.label,
  };
}

function isTerminalState(state: MusicMaterial["state"]): boolean {
  return state === "blocked" || state === "unresolved" || state === "exploration" || state === "verbal_only";
}

function mergeRefs(left: Ref[], right: Ref[]): Ref[] {
  const refsByKey = new Map<string, Ref>();

  for (const ref of [...left, ...right]) {
    refsByKey.set(refKey(ref), ref);
  }

  return [...refsByKey.values()];
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
