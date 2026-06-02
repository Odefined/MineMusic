import type {
  MaterialRecord,
  MusicMaterial,
  Ref,
  Result,
  SourceEntity,
  StageError,
} from "../../contracts/index.js";
import type { MaterialProjectionStorePort } from "../../ports/index.js";

type MaterialProjectionPurpose =
  | "material.query"
  | "context.brief"
  | "collection.snapshot"
  | "link.refresh"
  | "policy.evaluation";

export function materialRefToMaterialId(materialRef: Ref): string {
  return materialRef.id;
}

export function materialIdToRef(materialId: string): Ref {
  return {
    namespace: "minemusic",
    kind: "material",
    id: materialId,
  };
}

export async function currentMaterialRecordForRef(
  materialStore: MaterialProjectionStorePort,
  materialRef: Ref,
): Promise<Result<MaterialRecord | null>> {
  const current = await materialStore.resolveMaterialRedirect({ materialRef });

  if (!current.ok) {
    return current;
  }

  return materialStore.getMaterialRecord({ materialRef: current.value });
}

export async function materialForMaterialId({
  materialStore,
  materialId,
  ownerScope,
  purpose,
}: {
  materialStore: MaterialProjectionStorePort;
  materialId: string;
  ownerScope: string;
  purpose: MaterialProjectionPurpose;
}): Promise<Result<MusicMaterial | null>> {
  const record = await currentMaterialRecordForRef(materialStore, materialIdToRef(materialId));

  if (!record.ok) {
    return record;
  }

  if (record.value === null) {
    return ok(null);
  }

  return projectMaterialRecord(materialStore, record.value, { ownerScope, purpose });
}

export async function projectMaterialRecord(
  materialStore: MaterialProjectionStorePort,
  record: MaterialRecord,
  context: {
    ownerScope: string;
    purpose: MaterialProjectionPurpose;
    fallbackLabel?: string;
  },
): Promise<Result<MusicMaterial>> {
  const currentRef = await materialStore.resolveMaterialRedirect({ materialRef: record.materialRef });

  if (!currentRef.ok) {
    return currentRef;
  }

  const currentRecord = sameRef(currentRef.value, record.materialRef)
    ? ok(record)
    : await materialStore.getMaterialRecord({ materialRef: currentRef.value });

  if (!currentRecord.ok) {
    return currentRecord;
  }

  if (currentRecord.value === null) {
    return fail({
      code: "material_registry.conflict",
      message: `Material redirect target '${currentRef.value.id}' was not found.`,
      module: "material_store",
      retryable: false,
    });
  }

  const sourceRefs = sourceRefsForMaterialRecord(currentRecord.value);
  const sourceEntities = await sourceEntitiesForRefs(materialStore, sourceRefs);

  if (!sourceEntities.ok) {
    return sourceEntities;
  }

  const label = await labelForMaterialRecord(materialStore, currentRecord.value);

  if (!label.ok) {
    return label;
  }

  const playableLinks = playableLinksForSourceEntities(sourceEntities.value);
  const displayLabel = label.value === currentRecord.value.materialRef.id && context.fallbackLabel !== undefined
    ? context.fallbackLabel
    : label.value;

  return ok({
    id: currentRecord.value.materialRef.id,
    materialRef: currentRecord.value.materialRef,
    kind: normalizeMaterialKind(currentRecord.value.kind),
    label: displayLabel,
    state: projectedStateForMaterialRecord(currentRecord.value, playableLinks),
    identityState: currentRecord.value.identityState,
    ...(currentRecord.value.canonicalRef === undefined ? {} : { canonicalRef: currentRecord.value.canonicalRef }),
    ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
    ...(playableLinks.length === 0 ? {} : { playableLinks }),
  });
}

export function sourceRefsForMaterialRecord(record: MaterialRecord): Ref[] {
  const refs = record.primarySourceRef === undefined
    ? [...record.sourceRefs]
    : [record.primarySourceRef, ...record.sourceRefs];
  const seen = new Set<string>();
  const uniqueRefs: Ref[] = [];

  for (const ref of refs) {
    const key = `${ref.namespace}:${ref.kind}:${ref.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueRefs.push(ref);
  }

  return uniqueRefs;
}

export async function sourceEntitiesForRefs(
  materialStore: MaterialProjectionStorePort,
  sourceRefs: Ref[],
): Promise<Result<SourceEntity[]>> {
  const entities: SourceEntity[] = [];

  for (const sourceRef of sourceRefs) {
    const entity = await materialStore.getSourceEntity({ sourceRef });

    if (!entity.ok) {
      return entity;
    }

    if (entity.value !== null) {
      entities.push(entity.value);
    }
  }

  return ok(entities);
}

export async function labelForMaterialRecord(
  materialStore: MaterialProjectionStorePort,
  record: MaterialRecord,
): Promise<Result<string>> {
  if (record.canonicalRef !== undefined) {
    const canonical = await materialStore.getCanonical({ ref: record.canonicalRef });

    if (!canonical.ok) {
      return canonical;
    }

    if (canonical.value !== null) {
      return ok(canonical.value.label);
    }
  }

  const sourceRef = record.primarySourceRef ?? record.sourceRefs[0];

  if (sourceRef !== undefined) {
    const source = await materialStore.getSourceEntity({ sourceRef });

    if (!source.ok) {
      return source;
    }

    if (source.value !== null) {
      return ok(source.value.label);
    }
  }

  return ok(record.materialRef.label ?? record.materialRef.id);
}

export function playableLinksForSourceEntities(
  entities: SourceEntity[],
): NonNullable<MusicMaterial["playableLinks"]> {
  return entities.flatMap((entity) =>
    entity.providerUrl === undefined
      ? []
      : [{
          url: entity.providerUrl,
          label: entity.label,
          sourceRef: entity.sourceRef,
        }],
  );
}

export function projectedStateForMaterialRecord(
  record: MaterialRecord,
  playableLinks: NonNullable<MusicMaterial["playableLinks"]>,
): MusicMaterial["state"] {
  if (record.status !== "active") {
    return "unresolved";
  }

  if (playableLinks.length === 0) {
    return "grounded";
  }

  return record.identityState === "canonical_confirmed" ? "confirmed_playable" : "source_only_playable";
}

function normalizeMaterialKind(kind: string): string {
  switch (kind) {
    case "song":
    case "track":
      return "recording";
    case "album":
      return "release_group";
    default:
      return kind;
  }
}

function sameRef(left: Ref, right: Ref): boolean {
  return refKey(left) === refKey(right);
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
