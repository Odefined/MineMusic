import type {
  Collection,
  CollectionItem,
  MaterialRecord,
  MaterialSearchDocument,
  MaterialSearchHit,
  MaterialSearchInput,
  MaterialSearchOutput,
  MaterialSearchProvenance,
  MaterialSearchRerankInput,
  MaterialSearchRerankOutput,
  MaterialSearchScope,
  MaterialSearchWarning,
  MusicMaterial,
  Ref,
  Result,
  SourceEntity,
  SourceLibraryItem,
  StageError,
} from "../../contracts/index.js";
import type {
  MaterialSearchCollectionPort,
  MaterialSearchDocumentProviderPort,
  MaterialSearchIndexPort,
  MaterialSearchPort,
  MaterialSearchStorePort,
} from "../../ports/index.js";
import {
  currentMaterialRecordForRef,
  sourceRefsForMaterialRecord,
} from "../projection/index.js";

const defaultOwnerScope = "local_profile:default";
const defaultLimit = 50;

export type MaterialSearchServiceOptions = {
  materialStore: MaterialSearchStorePort;
  collection: MaterialSearchCollectionPort;
  searchIndex?: MaterialSearchIndexPort;
};

export function createMaterialSearchService(
  options: MaterialSearchServiceOptions,
): MaterialSearchPort {
  return {
    async search(input): Promise<Result<MaterialSearchOutput>> {
      const ownerScope = input.ownerScope ?? defaultOwnerScope;
      const pool = await collectCandidatePool({
        materialStore: options.materialStore,
        collection: options.collection,
        ownerScope,
        input,
      });

      if (!pool.ok) {
        return pool;
      }

      const eligible = await eligibleCandidateHits({
        materialStore: options.materialStore,
        ownerScope,
        entries: pool.value.entries,
        targetKind: input.targetKind,
      });

      if (!eligible.ok) {
        return eligible;
      }

      const hits = eligible.value
        .sort((left, right) => refKey(left.materialRef).localeCompare(refKey(right.materialRef)));
      const page = await pageHits({
        searchIndex: options.searchIndex,
        ownerScope,
        input,
        hits,
      });

      if (!page.ok) {
        return page;
      }

      return ok({
        hits: page.value.hits,
        ...(page.value.nextCursor === undefined ? {} : { nextCursor: page.value.nextCursor }),
        ...(pool.value.warnings.length === 0 ? {} : { warnings: pool.value.warnings }),
      });
    },

    async rerank(input): Promise<Result<MaterialSearchRerankOutput>> {
      const text = normalizeSearchText(input.text);

      if (text.length === 0) {
        return invalidRerank("Material Search rerank requires a non-empty text query.");
      }

      if (options.searchIndex === undefined) {
        return fail({
          code: "storage.unavailable",
          message: "Material Search rerank requires a SearchIndex.",
          module: "material_search",
          retryable: false,
        });
      }

      const corpus = await prepareRerankCorpus({
        materialStore: options.materialStore,
        materials: input.materials,
        targetKind: input.targetKind,
      });

      if (!corpus.ok) {
        return corpus;
      }

      if (corpus.value.documents.length === 0) {
        return ok({
          hits: [],
          ...(corpus.value.warnings.length === 0 ? {} : { warnings: corpus.value.warnings }),
        });
      }

      const reranked = await options.searchIndex.rerankDocuments({
        text,
        documents: corpus.value.documents,
        limit: normalizeLimit(input.limit),
      });

      if (!reranked.ok) {
        return reranked;
      }

      return ok({
        hits: reranked.value.hits.map((hit) => ({
          materialRef: hit.materialRef,
          score: hit.score,
          evidence: hit.evidence,
        })),
        ...(corpus.value.warnings.length === 0 ? {} : { warnings: corpus.value.warnings }),
      });
    },
  };
}

type SearchPage = {
  hits: MaterialSearchHit[];
  nextCursor?: string;
};

type DecodedSearchCursor = {
  v: 1;
  offset: number;
  fingerprint: string;
};

type PreparedRerankCorpus = {
  documents: MaterialSearchDocument[];
  warnings: MaterialSearchWarning[];
};

async function pageHits({
  searchIndex,
  ownerScope,
  input,
  hits,
}: {
  searchIndex: MaterialSearchIndexPort | undefined;
  ownerScope: string;
  input: MaterialSearchInput;
  hits: MaterialSearchHit[];
}): Promise<Result<SearchPage>> {
  const limit = normalizeLimit(input.limit);
  const text = normalizeSearchText(input.text);
  const fingerprint = cursorFingerprint({ ownerScope, input, text, limit });
  const cursor = parseCursor(input.cursor);

  if (!cursor.ok) {
    return cursor;
  }

  if (cursor.value !== null && cursor.value.fingerprint !== fingerprint) {
    return invalidCursor("Material Search cursor does not match the current search shape.");
  }

  const offset = cursor.value?.offset ?? 0;

  if (text.length === 0) {
    const sorted = sortBrowseHits(hits);
    const page = sorted.slice(offset, offset + limit);
    const nextCursor = offset + limit < sorted.length
      ? encodeCursor({ v: 1, offset: offset + limit, fingerprint })
      : undefined;

    return ok({
      hits: page,
      ...(nextCursor === undefined ? {} : { nextCursor }),
    });
  }

  if (searchIndex === undefined) {
    return fail({
      code: "storage.unavailable",
      message: "Material Search text matching requires a SearchIndex.",
      module: "material_search",
      retryable: false,
    });
  }

  const materialRefs = hits.map((hit) => hit.materialRef);
  const refreshed = await searchIndex.refreshDirty({ materialRefs });

  if (!refreshed.ok) {
    return refreshed;
  }

  const indexed = await searchIndex.search({
    text,
    candidateMaterialRefs: materialRefs,
    limit: offset + limit + 1,
  });

  if (!indexed.ok) {
    return indexed;
  }

  const provenanceByRef = new Map(hits.map((hit) => [refKey(hit.materialRef), hit.provenance ?? []]));
  const rankedHits = indexed.value.hits.map((hit) => ({
    materialRef: hit.materialRef,
    score: hit.score,
    evidence: hit.evidence,
    provenance: provenanceByRef.get(refKey(hit.materialRef)) ?? [],
  }));
  const page = rankedHits.slice(offset, offset + limit);
  const nextCursor = rankedHits.length > offset + limit
    ? encodeCursor({ v: 1, offset: offset + limit, fingerprint })
    : undefined;

  return ok({
    hits: page,
    ...(nextCursor === undefined ? {} : { nextCursor }),
  });
}

function sortBrowseHits(hits: MaterialSearchHit[]): MaterialSearchHit[] {
  return [...hits].sort((left, right) => {
    const leftSort = browseSortKey(left);
    const rightSort = browseSortKey(right);

    return leftSort.priority - rightSort.priority ||
      rightSort.descTimestamp.localeCompare(leftSort.descTimestamp) ||
      leftSort.label.localeCompare(rightSort.label) ||
      leftSort.position - rightSort.position ||
      leftSort.ascTimestamp.localeCompare(rightSort.ascTimestamp) ||
      refKey(left.materialRef).localeCompare(refKey(right.materialRef));
  });
}

function browseSortKey(hit: MaterialSearchHit): {
  priority: number;
  descTimestamp: string;
  label: string;
  position: number;
  ascTimestamp: string;
} {
  const provenance = [...(hit.provenance ?? [])].sort((left, right) =>
    provenancePriority(left) - provenancePriority(right)
  )[0];

  if (provenance === undefined) {
    return {
      priority: 99,
      descTimestamp: "",
      label: "",
      position: Number.POSITIVE_INFINITY,
      ascTimestamp: "",
    };
  }

  if (provenance.kind === "source_library") {
    return {
      priority: provenancePriority(provenance),
      descTimestamp: provenance.addedAt ?? provenance.lastSeenAt ?? "",
      label: "",
      position: Number.POSITIVE_INFINITY,
      ascTimestamp: "",
    };
  }

  if (provenance.relationKind === "custom") {
    return {
      priority: provenancePriority(provenance),
      descTimestamp: "",
      label: provenance.label,
      position: provenance.position ?? Number.POSITIVE_INFINITY,
      ascTimestamp: provenance.createdAt,
    };
  }

  return {
    priority: provenancePriority(provenance),
    descTimestamp: provenance.createdAt,
    label: provenance.label,
    position: provenance.position ?? Number.POSITIVE_INFINITY,
    ascTimestamp: provenance.createdAt,
  };
}

function provenancePriority(provenance: MaterialSearchProvenance): number {
  if (provenance.kind === "source_library") {
    return 3;
  }

  switch (provenance.relationKind) {
    case "favorite":
      return 0;
    case "saved":
      return 1;
    case "custom":
      return 2;
    case "blocked":
      return 4;
  }
}

function parseCursor(cursor: string | undefined): Result<DecodedSearchCursor | null> {
  if (cursor === undefined) {
    return ok(null);
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<DecodedSearchCursor>;

    if (parsed.v !== 1 ||
      typeof parsed.offset !== "number" ||
      !Number.isInteger(parsed.offset) ||
      parsed.offset < 0 ||
      typeof parsed.fingerprint !== "string") {
      return invalidCursor("Material Search cursor is malformed.");
    }

    return ok({
      v: 1,
      offset: parsed.offset,
      fingerprint: parsed.fingerprint,
    });
  } catch {
    return invalidCursor("Material Search cursor is malformed.");
  }
}

function encodeCursor(cursor: DecodedSearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function cursorFingerprint({
  ownerScope,
  input,
  text,
  limit,
}: {
  ownerScope: string;
  input: MaterialSearchInput;
  text: string;
  limit: number;
}): string {
  return stableStringify({
    ownerScope,
    scopes: input.scopes === undefined || input.scopes.length === 0 ? [{ kind: "all" }] : input.scopes,
    targetKind: input.targetKind,
    text,
    limit,
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .filter((key) => object[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function normalizeSearchText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

type CandidatePool = {
  entries: CandidatePoolEntry[];
  warnings: MaterialSearchWarning[];
};

type CandidatePoolEntry = {
  materialRef: Ref;
  provenance: MaterialSearchProvenance[];
  explicitBlockedScope: boolean;
};

async function collectCandidatePool({
  materialStore,
  collection,
  ownerScope,
  input,
}: {
  materialStore: MaterialSearchStorePort;
  collection: MaterialSearchCollectionPort;
  ownerScope: string;
  input: MaterialSearchInput;
}): Promise<Result<CandidatePool>> {
  const pool: CandidatePool = { entries: [], warnings: [] };
  const scopes = input.scopes === undefined || input.scopes.length === 0
    ? [{ kind: "all" } satisfies MaterialSearchScope]
    : input.scopes;

  for (const scope of scopes) {
    const scoped = await collectScope({ materialStore, collection, ownerScope, scope });

    if (!scoped.ok) {
      return scoped;
    }

    pool.entries.push(...scoped.value.entries);
    pool.warnings.push(...scoped.value.warnings);
  }

  return ok(mergeCandidateEntries(pool));
}

async function collectScope({
  materialStore,
  collection,
  ownerScope,
  scope,
}: {
  materialStore: MaterialSearchStorePort;
  collection: MaterialSearchCollectionPort;
  ownerScope: string;
  scope: MaterialSearchScope;
}): Promise<Result<CandidatePool>> {
  switch (scope.kind) {
    case "all":
      return collectAllScope({ materialStore, collection, ownerScope });
    case "source_library":
      return collectSourceLibraryScope({ materialStore, ownerScope, scope });
    case "collection":
      return collectCollectionScope({ collection, ownerScope, scope });
  }
}

async function collectAllScope({
  materialStore,
  collection,
  ownerScope,
}: {
  materialStore: MaterialSearchStorePort;
  collection: MaterialSearchCollectionPort;
  ownerScope: string;
}): Promise<Result<CandidatePool>> {
  const sourceLibrary = await collectSourceLibraryScope({
    materialStore,
    ownerScope,
    scope: { kind: "source_library" },
  });

  if (!sourceLibrary.ok) {
    return sourceLibrary;
  }

  const collections = await collection.listCollections({ ownerScope, includeRemoved: false });

  if (!collections.ok) {
    return collections;
  }

  const pool: CandidatePool = {
    entries: [...sourceLibrary.value.entries],
    warnings: [...sourceLibrary.value.warnings],
  };

  for (const entry of collections.value.filter(isPositiveCollection)) {
    const items = await collectCollectionItems({
      collection,
      ownerScope,
      selectedCollection: entry,
      explicitBlockedScope: false,
    });

    if (!items.ok) {
      return items;
    }

    pool.entries.push(...items.value.entries);
    pool.warnings.push(...items.value.warnings);
  }

  return ok(mergeCandidateEntries(pool));
}

async function collectSourceLibraryScope({
  materialStore,
  ownerScope,
  scope,
}: {
  materialStore: MaterialSearchStorePort;
  ownerScope: string;
  scope: Extract<MaterialSearchScope, { kind: "source_library" }>;
}): Promise<Result<CandidatePool>> {
  const pool: CandidatePool = { entries: [], warnings: [] };
  const libraryKinds = scope.libraryKinds === undefined ? [undefined] : scope.libraryKinds;

  for (const libraryKind of libraryKinds) {
    const items = await materialStore.listSourceLibraryItems({
      ownerScope,
      status: "present",
      ...(libraryKind === undefined ? {} : { libraryKind }),
      ...(scope.providerId === undefined ? {} : { providerId: scope.providerId }),
      ...(scope.providerAccountId === undefined ? {} : { providerAccountId: scope.providerAccountId }),
    });

    if (!items.ok) {
      return items;
    }

    for (const item of items.value) {
      const material = await materialStore.findMaterialBySourceRef({ sourceRef: item.sourceRef });

      if (!material.ok) {
        return material;
      }

      if (material.value === null) {
        pool.warnings.push(missingMaterialRecordWarning(item));
        continue;
      }

      pool.entries.push({
        materialRef: material.value.materialRef,
        provenance: [sourceLibraryProvenance(item)],
        explicitBlockedScope: false,
      });
    }
  }

  return ok(mergeCandidateEntries(pool));
}

async function collectCollectionScope({
  collection,
  ownerScope,
  scope,
}: {
  collection: MaterialSearchCollectionPort;
  ownerScope: string;
  scope: Extract<MaterialSearchScope, { kind: "collection" }>;
}): Promise<Result<CandidatePool>> {
  const selected = await collectionsForScope({ collection, ownerScope, scope });

  if (!selected.ok) {
    return selected;
  }

  const pool: CandidatePool = { entries: [], warnings: [] };

  for (const entry of selected.value) {
    const explicitBlockedScope = scope.relation === "blocked" ||
      (entry.relationKind === "blocked" &&
        (scope.ref !== undefined || scope.collectionId !== undefined || scope.label !== undefined));
    const items = await collectCollectionItems({
      collection,
      ownerScope,
      selectedCollection: entry,
      explicitBlockedScope,
    });

    if (!items.ok) {
      return items;
    }

    pool.entries.push(...items.value.entries);
    pool.warnings.push(...items.value.warnings);
  }

  return ok(mergeCandidateEntries(pool));
}

async function collectionsForScope({
  collection,
  ownerScope,
  scope,
}: {
  collection: MaterialSearchCollectionPort;
  ownerScope: string;
  scope: Extract<MaterialSearchScope, { kind: "collection" }>;
}): Promise<Result<Collection[]>> {
  const collectionId = scope.collectionId ?? scope.ref;

  if (collectionId !== undefined || scope.label !== undefined) {
    const collections = await collection.listCollections({ ownerScope, includeRemoved: false });

    if (!collections.ok) {
      return collections;
    }

    if (collectionId !== undefined && scope.label !== undefined) {
      const byId = collections.value.find((entry) => entry.id === collectionId);

      if (byId === undefined || byId.label !== scope.label) {
        return invalidScope("Collection scope ref/id and label do not identify the same Collection.");
      }

      return ok(matchesCollectionRelation(byId, scope.relation) ? [byId] : []);
    }

    if (collectionId !== undefined) {
      const byId = collections.value.find((entry) => entry.id === collectionId);
      return ok(byId === undefined || !matchesCollectionRelation(byId, scope.relation) ? [] : [byId]);
    }

    const labelMatches = collections.value.filter((entry) =>
      entry.label === scope.label && matchesCollectionRelation(entry, scope.relation)
    );

    if (labelMatches.length > 1) {
      return invalidScope(`Collection scope label '${scope.label}' is ambiguous.`);
    }

    return ok(labelMatches);
  }

  if (scope.relation !== undefined) {
    const collections = await collection.listCollections({
      ownerScope,
      includeRemoved: false,
      relationKind: scope.relation,
    });

    return collections.ok ? ok(collections.value) : collections;
  }

  const collections = await collection.listCollections({ ownerScope, includeRemoved: false });

  if (!collections.ok) {
    return collections;
  }

  return ok(collections.value.filter(isPositiveCollection));
}

async function collectCollectionItems({
  collection,
  ownerScope,
  selectedCollection,
  explicitBlockedScope,
}: {
  collection: MaterialSearchCollectionPort;
  ownerScope: string;
  selectedCollection: Collection;
  explicitBlockedScope: boolean;
}): Promise<Result<CandidatePool>> {
  const items = await collection.listItems({
    ownerScope,
    collectionId: selectedCollection.id,
  });

  if (!items.ok) {
    return items;
  }

  return ok({
    entries: items.value.map((item) => ({
      materialRef: item.materialRef,
      provenance: [collectionProvenance(selectedCollection, item)],
      explicitBlockedScope,
    })),
    warnings: [],
  });
}

async function eligibleCandidateHits({
  materialStore,
  ownerScope,
  entries,
  targetKind,
}: {
  materialStore: MaterialSearchStorePort;
  ownerScope: string;
  entries: CandidatePoolEntry[];
  targetKind?: MaterialSearchInput["targetKind"];
}): Promise<Result<MaterialSearchHit[]>> {
  const currentEntries: CandidatePoolEntry[] = [];

  for (const entry of entries) {
    const currentRef = await materialStore.resolveMaterialRedirect({ materialRef: entry.materialRef });

    if (!currentRef.ok) {
      return currentRef;
    }

    const record = await materialStore.getMaterialRecord({ materialRef: currentRef.value });

    if (!record.ok) {
      return record;
    }

    if (record.value === null || record.value.status !== "active" || !matchesTargetKind(record.value, targetKind)) {
      continue;
    }

    currentEntries.push({
      ...entry,
      materialRef: currentRef.value,
    });
  }

  const deduped = mergeCandidateEntries({ entries: currentEntries, warnings: [] }).entries;
  const blocked = await materialLevelBlockedMaterialRefs({ materialStore, ownerScope });

  if (!blocked.ok) {
    return blocked;
  }

  return ok(
    deduped
      .filter((entry) => entry.explicitBlockedScope || !blocked.value.has(refKey(entry.materialRef)))
      .map((entry) => ({
        materialRef: entry.materialRef,
        provenance: entry.provenance,
      })),
  );
}

async function materialLevelBlockedMaterialRefs({
  materialStore,
  ownerScope,
}: {
  materialStore: MaterialSearchStorePort;
  ownerScope: string;
}): Promise<Result<Set<string>>> {
  const relations = await materialStore.listMaterialRelations({
    ownerScope,
    relationKind: "blocked",
    status: "active",
  });

  return relations.ok
    ? ok(new Set(relations.value
        .filter((relation) => relation.scope.level === "material")
        .map((relation) => refKey(relation.materialRef))))
    : relations;
}

function mergeCandidateEntries(pool: CandidatePool): CandidatePool {
  const entries = new Map<string, CandidatePoolEntry>();

  for (const entry of pool.entries) {
    const key = refKey(entry.materialRef);
    const existing = entries.get(key);

    if (existing === undefined) {
      entries.set(key, {
        materialRef: entry.materialRef,
        provenance: [...entry.provenance],
        explicitBlockedScope: entry.explicitBlockedScope,
      });
      continue;
    }

    existing.provenance = dedupeProvenance([...existing.provenance, ...entry.provenance]);
    existing.explicitBlockedScope = existing.explicitBlockedScope || entry.explicitBlockedScope;
  }

  return {
    entries: [...entries.values()],
    warnings: pool.warnings,
  };
}

function dedupeProvenance(provenance: MaterialSearchProvenance[]): MaterialSearchProvenance[] {
  const seen = new Set<string>();
  const unique: MaterialSearchProvenance[] = [];

  for (const item of provenance) {
    const key = item.kind === "source_library"
      ? `source_library:${refKey(item.sourceRef)}:${item.libraryKind}:${item.providerId}:${item.providerAccountId}`
      : `collection:${item.collectionId}:${item.itemId}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function sourceLibraryProvenance(item: SourceLibraryItem): MaterialSearchProvenance {
  return {
    kind: "source_library",
    sourceRef: item.sourceRef,
    libraryKind: item.libraryKind,
    providerId: item.providerId,
    providerAccountId: item.providerAccountId,
    ...(item.addedAt === undefined ? {} : { addedAt: item.addedAt }),
    ...(item.lastSeenAt === undefined ? {} : { lastSeenAt: item.lastSeenAt }),
  };
}

function collectionProvenance(collection: Collection, item: CollectionItem): MaterialSearchProvenance {
  return {
    kind: "collection",
    collectionId: collection.id,
    collectionKind: collection.collectionKind,
    relationKind: collection.relationKind,
    label: collection.label,
    itemId: item.id,
    createdAt: item.createdAt,
    ...(item.position === undefined ? {} : { position: item.position }),
  };
}

function missingMaterialRecordWarning(item: SourceLibraryItem): MaterialSearchWarning {
  return {
    code: "material_search.missing_material_record",
    message: `Present Source Library item '${item.id}' has no durable MaterialRecord and was skipped.`,
    sourceRef: item.sourceRef,
  };
}

function missingRerankDocumentWarning(material: MusicMaterial): MaterialSearchWarning {
  return {
    code: "material_search.missing_material_record",
    message: `Rerank candidate '${material.materialRef.id}' has no active SearchDocument and was skipped.`,
    materialRef: material.materialRef,
  };
}

function matchesCollectionRelation(
  collection: Collection,
  relation: Extract<MaterialSearchScope, { kind: "collection" }>["relation"],
): boolean {
  return relation === undefined || collection.relationKind === relation;
}

function matchesTargetKind(record: MaterialRecord, targetKind: MaterialSearchInput["targetKind"]): boolean {
  return targetKind === undefined || normalizeMaterialKind(record.kind) === normalizeMaterialKind(targetKind);
}

function matchesRerankTargetKind(
  material: MusicMaterial,
  targetKind: MaterialSearchRerankInput["targetKind"],
): boolean {
  return targetKind === undefined || normalizeMaterialKind(material.kind) === normalizeMaterialKind(targetKind);
}

function isPositiveCollection(collection: Collection): boolean {
  return collection.relationKind === "favorite" ||
    collection.relationKind === "saved" ||
    collection.relationKind === "custom";
}

function invalidScope<T>(message: string): Result<T> {
  return fail({
    code: "material_search.invalid_scope",
    message,
    module: "material_search",
    retryable: false,
  });
}

function invalidCursor<T>(message: string): Result<T> {
  return fail({
    code: "material_search.invalid_cursor",
    message,
    module: "material_search",
    retryable: false,
  });
}

function invalidRerank<T>(message: string): Result<T> {
  return fail({
    code: "material_search.invalid_rerank",
    message,
    module: "material_search",
    retryable: false,
  });
}

function normalizeLimit(limit: number | undefined): number {
  return limit === undefined || !Number.isFinite(limit) || limit <= 0
    ? defaultLimit
    : Math.max(1, Math.floor(limit));
}

async function prepareRerankCorpus({
  materialStore,
  materials,
  targetKind,
}: {
  materialStore: MaterialSearchStorePort;
  materials: MusicMaterial[];
  targetKind?: MaterialSearchRerankInput["targetKind"];
}): Promise<Result<PreparedRerankCorpus>> {
  const documents: MaterialSearchDocument[] = [];
  const warnings: MaterialSearchWarning[] = [];
  const seenRefs = new Set<string>();

  for (const material of materials) {
    if (!matchesRerankTargetKind(material, targetKind)) {
      continue;
    }

    const key = refKey(material.materialRef);

    if (seenRefs.has(key)) {
      continue;
    }

    seenRefs.add(key);

    const document = await buildDocumentForMaterial(materialStore, material);

    if (!document.ok) {
      return document;
    }

    if (document.value === null) {
      warnings.push(missingRerankDocumentWarning(material));
      continue;
    }

    documents.push(document.value);
  }

  return ok({
    documents: dedupeDocuments(documents),
    warnings,
  });
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

async function buildDocumentForMaterial(
  materialStore: MaterialSearchStorePort,
  material: MusicMaterial,
): Promise<Result<MaterialSearchDocument | null>> {
  if (isDurableMaterialRef(material.materialRef)) {
    const record = await currentMaterialRecordForRef(materialStore, material.materialRef);

    if (!record.ok) {
      return record;
    }

    if (record.value === null || record.value.status !== "active") {
      return ok(null);
    }

    const document = await buildDocumentForRecord(materialStore, record.value);

    if (!document.ok) {
      return document;
    }

    return ok(withMaterialLabelFallback(document.value, material));
  }

  return buildDocumentForMaterialSnapshot(materialStore, material);
}

async function buildDocumentForMaterialSnapshot(
  materialStore: MaterialSearchStorePort,
  material: MusicMaterial,
): Promise<Result<MaterialSearchDocument>> {
  const fields: Partial<MaterialSearchDocument> = {};

  if (material.canonicalRef !== undefined) {
    const canonical = await materialStore.getCanonical({ ref: material.canonicalRef });

    if (!canonical.ok) {
      return canonical;
    }

    if (canonical.value !== null && canonical.value.status === "active") {
      fields.canonicalLabel = canonical.value.label;
      if (canonical.value.aliases !== undefined) {
        fields.canonicalAliases = canonical.value.aliases;
      }
    }
  }

  const sourceFields = await sourceTextForMaterialSnapshot(materialStore, material);

  if (!sourceFields.ok) {
    return sourceFields;
  }

  Object.assign(fields, sourceFields.value);
  appendField(fields, "sourceTitle", material.label);

  for (const link of material.playableLinks ?? []) {
    appendField(fields, "sourceTitle", link.label);
  }

  return ok(compactDocument({
    materialRef: material.materialRef,
    kind: normalizeMaterialKind(material.kind),
    ...fields,
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

async function sourceTextForMaterialSnapshot(
  materialStore: MaterialSearchStorePort,
  material: MusicMaterial,
): Promise<Result<Partial<MaterialSearchDocument>>> {
  const fields: Partial<MaterialSearchDocument> = {};
  const sourceRefs = dedupeRefs([
    ...(material.sourceRefs ?? []),
    ...(material.playableLinks ?? []).map((link) => link.sourceRef),
  ]);
  const materialKind = normalizeMaterialKind(material.kind);

  for (const sourceRef of sourceRefs) {
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

function withMaterialLabelFallback(
  document: MaterialSearchDocument,
  material: MusicMaterial,
): MaterialSearchDocument {
  const fields: Partial<MaterialSearchDocument> = {
    ...document,
  };
  appendField(fields, "sourceTitle", material.label);

  for (const link of material.playableLinks ?? []) {
    appendField(fields, "sourceTitle", link.label);
  }

  return compactDocument({
    ...document,
    ...fields,
  });
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

function isDurableMaterialRef(ref: Ref): boolean {
  return ref.namespace === "minemusic" && ref.kind === "material";
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
