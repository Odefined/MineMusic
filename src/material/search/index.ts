import type {
  MaterialRecord,
  MaterialSearchDocument,
  MaterialSearchOutput,
  Ref,
  Result,
  SourceEntity,
  StageError,
} from "../../contracts/index.js";
import type {
  MaterialSearchCollectionPort,
  MaterialSearchDocumentProviderPort,
  MaterialSearchPort,
  MaterialSearchStorePort,
} from "../../ports/index.js";
import {
  currentMaterialRecordForRef,
  sourceRefsForMaterialRecord,
} from "../projection/index.js";

export type MaterialSearchServiceOptions = {
  materialStore: MaterialSearchStorePort;
  collection: MaterialSearchCollectionPort;
};

export function createMaterialSearchService(
  options: MaterialSearchServiceOptions,
): MaterialSearchPort {
  void options;

  return {
    async search(): Promise<Result<MaterialSearchOutput>> {
      return fail({
        code: "material_search.invalid_scope",
        message: "Material Search is not wired yet.",
        module: "material_search",
        retryable: false,
      });
    },
  };
}

export function createMaterialSearchDocumentProvider({
  materialStore,
}: {
  materialStore: MaterialSearchStorePort;
}): MaterialSearchDocumentProviderPort {
  return {
    async buildSearchDocument({ materialRef }) {
      const record = await currentMaterialRecordForRef(materialStore, materialRef);

      if (!record.ok) {
        return record;
      }

      if (record.value === null || record.value.status !== "active") {
        return ok(null);
      }

      return buildDocumentForRecord(materialStore, record.value);
    },

    async buildAllSearchDocuments() {
      const materialRefs = await materialRefsForFullRebuild(materialStore);

      if (!materialRefs.ok) {
        return materialRefs;
      }

      const documents: MaterialSearchDocument[] = [];

      for (const materialRef of materialRefs.value) {
        const document = await this.buildSearchDocument({ materialRef });

        if (!document.ok) {
          return document;
        }

        if (document.value !== null) {
          documents.push(document.value);
        }
      }

      return ok(dedupeDocuments(documents));
    },
  };
}

async function buildDocumentForRecord(
  materialStore: MaterialSearchStorePort,
  record: MaterialRecord,
): Promise<Result<MaterialSearchDocument>> {
  const canonicalFields = await canonicalTextForRecord(materialStore, record);

  if (!canonicalFields.ok) {
    return canonicalFields;
  }

  const sourceFields = await sourceTextForRecord(materialStore, record);

  if (!sourceFields.ok) {
    return sourceFields;
  }

  return ok(compactDocument({
    materialRef: record.materialRef,
    kind: normalizeMaterialKind(record.kind),
    ...canonicalFields.value,
    ...sourceFields.value,
  }));
}

async function canonicalTextForRecord(
  materialStore: MaterialSearchStorePort,
  record: MaterialRecord,
): Promise<Result<Partial<MaterialSearchDocument>>> {
  if (record.canonicalRef === undefined) {
    return ok({});
  }

  const canonical = await materialStore.getCanonical({ ref: record.canonicalRef });

  if (!canonical.ok) {
    return canonical;
  }

  if (canonical.value === null || canonical.value.status === "merged" || canonical.value.status === "rejected") {
    return ok({});
  }

  return ok({
    canonicalLabel: canonical.value.label,
    ...(canonical.value.aliases === undefined ? {} : { canonicalAliases: canonical.value.aliases }),
  });
}

async function sourceTextForRecord(
  materialStore: MaterialSearchStorePort,
  record: MaterialRecord,
): Promise<Result<Partial<MaterialSearchDocument>>> {
  const fields: Partial<MaterialSearchDocument> = {};
  const materialKind = normalizeMaterialKind(record.kind);

  for (const sourceRef of sourceRefsForMaterialRecord(record)) {
    const entity = await materialStore.getSourceEntity({ sourceRef });

    if (!entity.ok) {
      return entity;
    }

    if (entity.value === null) {
      continue;
    }

    appendSourceFields(fields, materialKind, entity.value);
  }

  return ok(compactDocumentFields(fields));
}

function appendSourceFields(
  fields: Partial<MaterialSearchDocument>,
  materialKind: string,
  entity: SourceEntity,
): void {
  if (materialKind === "recording" && entity.kind === "track") {
    appendField(fields, "sourceTitle", entity.title ?? entity.label);
    appendField(fields, "sourceArtistLabels", entity.artistLabels);
    appendField(fields, "sourceReleaseLabel", entity.releaseLabel);
    return;
  }

  if ((materialKind === "release" || materialKind === "release_group") && entity.kind === "release") {
    appendField(fields, "sourceTitle", entity.title ?? entity.label);
    appendField(fields, "sourceArtistLabels", entity.artistLabels);
    return;
  }

  if (materialKind === "artist" && entity.kind === "artist") {
    appendField(fields, "sourceTitle", entity.name ?? entity.label);
    appendField(fields, "sourceArtistAliases", entity.aliases);
  }
}

async function materialRefsForFullRebuild(
  materialStore: MaterialSearchStorePort,
): Promise<Result<Ref[]>> {
  const libraryItems = await materialStore.listSourceLibraryItems({ status: "present" });

  if (!libraryItems.ok) {
    return libraryItems;
  }

  const materialRefs: Ref[] = [];

  for (const item of libraryItems.value) {
    const record = await materialStore.findMaterialBySourceRef({ sourceRef: item.sourceRef });

    if (!record.ok) {
      return record;
    }

    if (record.value !== null) {
      materialRefs.push(record.value.materialRef);
    }
  }

  const relations = await materialStore.listMaterialRelations({ status: "active" });

  if (!relations.ok) {
    return relations;
  }

  materialRefs.push(...relations.value.map((relation) => relation.materialRef));

  return ok(dedupeRefs(materialRefs));
}

function compactDocument(document: MaterialSearchDocument): MaterialSearchDocument {
  const { materialRef, kind, ...fields } = document;

  return {
    materialRef,
    kind,
    ...compactDocumentFields(fields),
  };
}

function compactDocumentFields<T extends Partial<MaterialSearchDocument>>(fields: T): T {
  const compacted = { ...fields };

  for (const key of [
    "canonicalAliases",
    "sourceTitle",
    "sourceArtistLabels",
    "sourceReleaseLabel",
    "sourceArtistAliases",
  ] as const) {
    const values = dedupeTextValues(compacted[key] ?? []);

    if (values.length === 0) {
      delete compacted[key];
    } else {
      compacted[key] = values;
    }
  }

  if (compacted.canonicalLabel !== undefined && compacted.canonicalLabel.trim().length === 0) {
    delete compacted.canonicalLabel;
  }

  return compacted;
}

function appendField(
  fields: Partial<MaterialSearchDocument>,
  key: "sourceTitle" | "sourceArtistLabels" | "sourceReleaseLabel" | "sourceArtistAliases",
  value: string | string[] | undefined,
): void {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];

  if (values.length === 0) {
    return;
  }

  fields[key] = [...(fields[key] ?? []), ...values];
}

function dedupeDocuments(documents: MaterialSearchDocument[]): MaterialSearchDocument[] {
  const seen = new Set<string>();
  const unique: MaterialSearchDocument[] = [];

  for (const document of documents) {
    const key = refKey(document.materialRef);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(document);
  }

  return unique;
}

function dedupeRefs(refs: Ref[]): Ref[] {
  const seen = new Set<string>();
  const unique: Ref[] = [];

  for (const ref of refs) {
    const key = refKey(ref);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(ref);
  }

  return unique;
}

function dedupeTextValues(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values.map((entry) => entry.trim()).filter((entry) => entry.length > 0)) {
    const key = value.toLocaleLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(value);
  }

  return unique;
}

function normalizeMaterialKind(kind: string): string {
  switch (kind) {
    case "song":
    case "track":
      return "recording";
    case "album":
      return "release";
    default:
      return kind;
  }
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
