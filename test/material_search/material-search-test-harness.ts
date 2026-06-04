import type {
  Collection,
  CollectionItem,
  MaterialRecord,
  MusicMaterialRelation,
  Ref,
  Result,
  SourceEntity,
  SourceLibraryItem,
} from "../../src/contracts/index.js";
import type {
  CollectionListCollectionsInput,
  CollectionListItemsInput,
  MaterialSearchCollectionPort,
  MaterialSearchStorePort,
  MusicMaterialRelationListInput,
  SourceLibraryItemListInput,
} from "../../src/ports/index.js";

export class FakeMaterialSearchStore implements MaterialSearchStorePort {
  readonly records = new Map<string, MaterialRecord>();
  readonly canonicals = new Map<string, never>();
  readonly sources = new Map<string, SourceEntity>();
  readonly libraryItems: SourceLibraryItem[] = [];
  readonly relations: MusicMaterialRelation[] = [];
  readonly redirects = new Map<string, Ref>();

  putMaterial(record: MaterialRecord): void {
    this.records.set(refKey(record.materialRef), structuredClone(record));
  }

  putSource(entity: SourceEntity): void {
    this.sources.set(refKey(entity.sourceRef), structuredClone(entity));
  }

  putLibraryItem(item: SourceLibraryItem): void {
    this.libraryItems.push(structuredClone(item));
  }

  putRelation(relation: MusicMaterialRelation): void {
    this.relations.push(structuredClone(relation));
  }

  putRedirect(from: Ref, to: Ref): void {
    this.redirects.set(refKey(from), structuredClone(to));
  }

  async resolveMaterialRedirect({ materialRef }: { materialRef: Ref }): Promise<Result<Ref>> {
    return ok(structuredClone(this.redirects.get(refKey(materialRef)) ?? materialRef));
  }

  async getMaterialRecord({ materialRef }: { materialRef: Ref }): Promise<Result<MaterialRecord | null>> {
    const record = this.records.get(refKey(materialRef));
    return ok(record === undefined ? null : structuredClone(record));
  }

  async getSourceEntity({ sourceRef }: { sourceRef: Ref }): Promise<Result<SourceEntity | null>> {
    const entity = this.sources.get(refKey(sourceRef));
    return ok(entity === undefined ? null : structuredClone(entity));
  }

  async getCanonical(): Promise<Result<null>> {
    return ok(null);
  }

  async findMaterialBySourceRef({ sourceRef }: { sourceRef: Ref }): Promise<Result<MaterialRecord | null>> {
    const found = [...this.records.values()].find((record) =>
      [record.primarySourceRef, ...record.sourceRefs]
        .filter((candidate): candidate is Ref => candidate !== undefined)
        .some((candidate) => refKey(candidate) === refKey(sourceRef))
    );

    return ok(found === undefined ? null : structuredClone(found));
  }

  async listSourceLibraryItems(query: SourceLibraryItemListInput): Promise<Result<SourceLibraryItem[]>> {
    return ok(
      this.libraryItems
        .filter((item) => query.ownerScope === undefined || item.ownerScope === query.ownerScope)
        .filter((item) => query.status === undefined || item.status === query.status)
        .filter((item) => query.providerId === undefined || item.providerId === query.providerId)
        .filter((item) => query.providerAccountId === undefined || item.providerAccountId === query.providerAccountId)
        .filter((item) => query.libraryKind === undefined || item.libraryKind === query.libraryKind)
        .filter((item) => query.sourceRef === undefined || refKey(item.sourceRef) === refKey(query.sourceRef))
        .map((item) => structuredClone(item)),
    );
  }

  async listMaterialRelations(query: MusicMaterialRelationListInput): Promise<Result<MusicMaterialRelation[]>> {
    return ok(
      this.relations
        .filter((relation) => query.ownerScope === undefined || relation.ownerScope === query.ownerScope)
        .filter((relation) => query.status === undefined || relation.status === query.status)
        .filter((relation) => query.relationKind === undefined || relation.relationKind === query.relationKind)
        .filter((relation) =>
          query.materialRef === undefined || refKey(relation.materialRef) === refKey(query.materialRef)
        )
        .map((relation) => structuredClone(relation)),
    );
  }
}

export class FakeMaterialSearchCollection implements MaterialSearchCollectionPort {
  readonly collections: Collection[] = [];
  readonly items: CollectionItem[] = [];

  putCollection(collection: Collection): void {
    this.collections.push(structuredClone(collection));
  }

  putItem(item: CollectionItem): void {
    this.items.push(structuredClone(item));
  }

  async listCollections(query: CollectionListCollectionsInput): Promise<Result<Collection[]>> {
    return ok(
      this.collections
        .filter((collection) => collection.ownerScope === query.ownerScope)
        .filter((collection) => query.relationKind === undefined || collection.relationKind === query.relationKind)
        .filter((collection) => query.collectionKind === undefined || collection.collectionKind === query.collectionKind)
        .filter((collection) => query.includeRemoved === true || collection.removedAt === undefined)
        .map((collection) => structuredClone(collection)),
    );
  }

  async listItems(query: CollectionListItemsInput): Promise<Result<CollectionItem[]>> {
    const matchingCollections = this.collections
      .filter((collection) => collection.ownerScope === query.ownerScope)
      .filter((collection) => query.collectionId === undefined || collection.id === query.collectionId)
      .filter((collection) => query.collectionKind === undefined || collection.collectionKind === query.collectionKind)
      .filter((collection) => query.relationKind === undefined || collection.relationKind === query.relationKind)
      .map((collection) => collection.id);
    const collectionIds = new Set(matchingCollections);

    return ok(
      this.items
        .filter((item) => collectionIds.has(item.collectionId))
        .filter((item) => query.includeRemoved === true || item.removedAt === undefined)
        .slice(0, query.limit)
        .map((item) => structuredClone(item)),
    );
  }
}

export function activeMaterial(materialRef: Ref, kind = "recording", sourceRefs: Ref[] = []): MaterialRecord {
  return {
    materialRef,
    kind,
    identityState: "source_backed",
    sourceRefs,
    status: "active",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

export function collection(input: {
  id: string;
  relationKind: Collection["relationKind"];
  label?: string;
  collectionKind?: Collection["collectionKind"];
  ownerScope?: string;
}): Collection {
  return {
    id: input.id,
    ownerScope: input.ownerScope ?? "local_profile:default",
    collectionKind: input.collectionKind ?? "recording",
    relationKind: input.relationKind,
    label: input.label ?? input.id,
    createdAt: "2026-06-04T00:00:00.000Z",
  };
}

export function collectionItem(collectionId: string, materialRef: Ref, position?: number): CollectionItem {
  return {
    id: `${collectionId}-${materialRef.id}`,
    collectionId,
    materialRef,
    label: materialRef.label ?? materialRef.id,
    ...(position === undefined ? {} : { position }),
    createdAt: "2026-06-04T00:00:00.000Z",
  };
}

export function libraryItem(input: {
  id: string;
  sourceRef: Ref;
  libraryKind?: SourceLibraryItem["libraryKind"];
  status?: SourceLibraryItem["status"];
  providerId?: string;
  providerAccountId?: string;
  ownerScope?: string;
}): SourceLibraryItem {
  return {
    id: input.id,
    ownerScope: input.ownerScope ?? "local_profile:default",
    providerId: input.providerId ?? "fixture",
    providerAccountId: input.providerAccountId ?? "acct",
    sourceRef: input.sourceRef,
    sourceKind: input.sourceRef.kind === "release" ? "release" : input.sourceRef.kind === "artist" ? "artist" : "track",
    libraryKind: input.libraryKind ?? "saved_source_track",
    label: input.id,
    lastSeenAt: "2026-06-04T00:00:00.000Z",
    status: input.status ?? "present",
  };
}

export function relation(
  materialRef: Ref,
  relationKind: MusicMaterialRelation["relationKind"],
  ownerScope = "local_profile:default",
  scope: MusicMaterialRelation["scope"] = { level: "material" },
): MusicMaterialRelation {
  return {
    id: `relation-${relationKind}-${materialRef.id}`,
    ownerScope,
    materialRef,
    relationKind,
    scope,
    source: "user_explicit",
    status: "active",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

export function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

export function materialRef(id: string): Ref {
  return ref("minemusic", "material", id);
}

export function sourceRef(kind: string, id: string): Ref {
  return ref("source:fixture", kind, id);
}

export function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

export async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

export async function assertError<T>(result: Promise<Result<T>>, code: string): Promise<void> {
  const awaited = await result;
  assert(!awaited.ok, `expected ${code} but operation succeeded`);
  assert(awaited.error.code === code, `expected ${code} but received ${awaited.error.code}`);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
