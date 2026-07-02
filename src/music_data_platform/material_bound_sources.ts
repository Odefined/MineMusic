import { refKey, type Ref } from "../contracts/kernel.js";
import type { SourceEntity } from "../contracts/music_data_platform.js";
import type { MaterialRecord } from "../contracts/storage.js";
import { MusicDataPlatformError } from "./errors.js";
import {
  createIdentityRepositories,
  type SourceToMaterialBindingRecord,
} from "./identity_records.js";

export type IdentityRepositories = ReturnType<typeof createIdentityRepositories>;

export async function materialRecordClosure(input: {
  materialRefs: readonly Ref[];
  repositories: IdentityRepositories;
}): Promise<ReadonlyMap<string, MaterialRecord>> {
  const records = new Map<string, MaterialRecord>();
  const pending = new Map(input.materialRefs.map((materialRef) => [refKey(materialRef), materialRef]));

  while (pending.size > 0) {
    const batch = [...pending.values()];
    pending.clear();
    const loaded = await input.repositories.materialRecords.listByRefs({
      materialRefs: batch,
    });

    for (const record of loaded) {
      const materialRefKey = refKey(record.entity.materialRef);
      if (records.has(materialRefKey)) {
        continue;
      }
      records.set(materialRefKey, record);

      if (record.mergedIntoMaterialRef !== undefined) {
        const mergedRefKey = refKey(record.mergedIntoMaterialRef);
        if (!records.has(mergedRefKey)) {
          pending.set(mergedRefKey, record.mergedIntoMaterialRef);
        }
      }
    }
  }

  return records;
}

export function survivorRecordForRef(
  materialRef: Ref,
  records: ReadonlyMap<string, MaterialRecord>,
): MaterialRecord | undefined {
  let materialRefKey = refKey(materialRef);
  const seen = new Set<string>();

  for (;;) {
    if (seen.has(materialRefKey)) {
      throw new MusicDataPlatformError({
        code: "music_data.material_ref_invalid",
        message: "Material bound-source lookup encountered a material merge cycle.",
      });
    }
    seen.add(materialRefKey);

    const record = records.get(materialRefKey);
    if (record === undefined) {
      return undefined;
    }
    if (record.mergedIntoMaterialRef === undefined) {
      return record;
    }
    materialRefKey = refKey(record.mergedIntoMaterialRef);
  }
}

export async function boundSourcesForMaterialRecords(input: {
  materialRecords: readonly MaterialRecord[];
  repositories: IdentityRepositories;
}): Promise<ReadonlyMap<string, readonly SourceEntity[]>> {
  const output = new Map<string, readonly SourceEntity[]>();
  if (input.materialRecords.length === 0) {
    return output;
  }

  const bindings = await input.repositories.sourceMaterialBindings.listSourcesForMaterials({
    materialRefs: input.materialRecords.map((record) => record.entity.materialRef),
  });
  const bindingsByMaterialKey = groupBindingsByMaterialKey(bindings);
  const sourceRecords = await input.repositories.sourceRecords.listByRefs({
    sourceRefs: uniqueRefs(input.materialRecords.flatMap((record) => record.entity.sourceRefs)),
  });
  const sourceRecordsByKey = new Map(sourceRecords.map((record) => [
    refKey(record.entity.sourceRef),
    record,
  ]));

  for (const materialRecord of input.materialRecords) {
    const materialRefKey = refKey(materialRecord.entity.materialRef);
    const materialBindings = bindingsByMaterialKey.get(materialRefKey) ?? [];
    const bindingRefKeys = new Set(materialBindings.map((binding) => refKey(binding.sourceRef)));
    const materialSourceRefKeys = materialRecord.entity.sourceRefs.map(refKey);

    if (
      materialBindings.length !== materialSourceRefKeys.length ||
      materialSourceRefKeys.some((sourceRefKey) => !bindingRefKeys.has(sourceRefKey))
    ) {
      throw new MusicDataPlatformError({
        code: "music_data.material_source_binding_invalid",
        message: "Material sourceRefs must match current source-material bindings.",
      });
    }

    const sources: SourceEntity[] = [];
    for (const sourceRef of materialRecord.entity.sourceRefs) {
      const sourceRecord = sourceRecordsByKey.get(refKey(sourceRef));
      if (sourceRecord === undefined) {
        throw new MusicDataPlatformError({
          code: "music_data.source_not_found",
          message: `Material bound source is missing a source record: ${refKey(sourceRef)}`,
        });
      }
      sources.push(sourceRecord.entity);
    }
    output.set(materialRefKey, sources);
  }

  return output;
}

function groupBindingsByMaterialKey(
  bindings: readonly SourceToMaterialBindingRecord[],
): ReadonlyMap<string, readonly SourceToMaterialBindingRecord[]> {
  const grouped = new Map<string, SourceToMaterialBindingRecord[]>();
  for (const binding of bindings) {
    const materialRefKey = refKey(binding.materialRef);
    grouped.set(materialRefKey, [...(grouped.get(materialRefKey) ?? []), binding]);
  }

  return grouped;
}

function uniqueRefs(refs: readonly Ref[]): readonly Ref[] {
  return [...new Map(refs.map((ref) => [refKey(ref), ref])).values()];
}
