import type {
  CanonicalRecord,
  Collection,
  CollectionItem,
  EffectProposal,
  LibraryImportAreaSnapshot,
  LibraryImportBatch,
  LibraryImportItemProvenance,
  MemoryEntry,
  PlatformLibraryAbsence,
  Ref,
  Result,
  StageError,
  StageEvent,
  StageSession,
} from "../contracts/index.js";
import type {
  CanonicalRecordRepository,
  CollectionRepository,
  EffectProposalRepository,
  EventRepository,
  LibraryImportRepository,
  MemoryRepository,
  Repository,
  SessionRepository,
} from "../ports/index.js";

export {
  createSqliteCanonicalRecordRepository,
  sqliteCanonicalExternalRefConflictConstraint,
} from "./sqlite/index.js";
export type { SqliteCanonicalRecordRepositoryOptions } from "./sqlite/index.js";

type RepositoryOptions<TRecord, TKey> = {
  recordKey(record: TRecord): TKey;
  keyToStorageKey(key: TKey): string;
};

export function refToStorageKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

export function createInMemoryRepository<TRecord, TKey>({
  recordKey,
  keyToStorageKey,
}: RepositoryOptions<TRecord, TKey>): Repository<TRecord, TKey> {
  const records = new Map<string, TRecord>();

  return {
    async get(key) {
      const record = records.get(keyToStorageKey(key));

      return ok(record === undefined ? null : cloneRecord(record));
    },

    async put(record) {
      records.set(keyToStorageKey(recordKey(record)), cloneRecord(record));

      return ok(cloneRecord(record));
    },

    async list() {
      return ok([...records.values()].map((record) => cloneRecord(record)));
    },
  };
}

export function createInMemoryCanonicalRecordRepository(): CanonicalRecordRepository {
  return createInMemoryRepository<CanonicalRecord, Ref>({
    recordKey: (record) => record.ref,
    keyToStorageKey: refToStorageKey,
  });
}

export function createInMemoryCollectionRepository(): CollectionRepository {
  const collections = new Map<string, Collection>();
  const items = new Map<string, CollectionItem>();

  return {
    async getCollection({ collectionId }) {
      const collection = collections.get(collectionId);

      return ok(collection === undefined ? null : cloneRecord(collection));
    },

    async putCollection({ collection }) {
      const labelConflict = findActiveCollectionLabelConflict(collections, collection);

      if (labelConflict !== null) {
        return fail({
          code: "collection.duplicate_label",
          message: `Collection label '${collection.label}' already exists for owner '${collection.ownerScope}'.`,
          module: "storage",
          retryable: false,
        });
      }

      collections.set(collection.id, cloneRecord(collection));

      return ok(cloneRecord(collection));
    },

    async listCollections(query) {
      return ok(
        [...collections.values()]
          .filter((collection) => matchesCollectionQuery(collection, query))
          .map((collection) => cloneRecord(collection)),
      );
    },

    async findActiveCollectionByLabel({ ownerScope, label }) {
      const collection =
        [...collections.values()].find(
          (candidate) =>
            candidate.ownerScope === ownerScope &&
            candidate.label === label &&
            candidate.removedAt === undefined,
        ) ?? null;

      return ok(collection === null ? null : cloneRecord(collection));
    },

    async getItem({ itemId }) {
      const item = items.get(itemId);

      return ok(item === undefined ? null : cloneRecord(item));
    },

    async putItem({ item }) {
      items.set(item.id, cloneRecord(item));

      return ok(cloneRecord(item));
    },

    async findItemByMembership({ collectionId, canonicalRef, includeRemoved }) {
      const item =
        [...items.values()].find(
          (candidate) =>
            candidate.collectionId === collectionId &&
            refToStorageKey(candidate.canonicalRef) === refToStorageKey(canonicalRef) &&
            (includeRemoved === true || candidate.removedAt === undefined),
        ) ?? null;

      return ok(item === null ? null : cloneRecord(item));
    },

    async listItems(query) {
      const matchedItems = [...items.values()]
        .filter((item) => matchesItemQuery(item, collections, query))
        .slice(0, query.limit);

      return ok(matchedItems.map((item) => cloneRecord(item)));
    },
  };
}

export function createInMemoryLibraryImportRepository(): LibraryImportRepository {
  const batches = new Map<string, LibraryImportBatch>();
  const areaSnapshots = new Map<string, LibraryImportAreaSnapshot>();
  const itemProvenance = new Map<string, LibraryImportItemProvenance>();
  const absences = new Map<string, PlatformLibraryAbsence>();

  return {
    async getBatch({ batchId }) {
      const batch = batches.get(batchId);

      return ok(batch === undefined ? null : cloneRecord(batch));
    },

    async putBatch({ batch }) {
      batches.set(batch.id, cloneRecord(batch));

      return ok(cloneRecord(batch));
    },

    async listBatches(query) {
      return ok(
        [...batches.values()]
          .filter((batch) => matchesLibraryImportBatchQuery(batch, query))
          .map((batch) => cloneRecord(batch)),
      );
    },

    async putAreaSnapshot({ snapshot }) {
      areaSnapshots.set(libraryImportAreaSnapshotKey(snapshot), cloneRecord(snapshot));

      return ok(cloneRecord(snapshot));
    },

    async listAreaSnapshots(query) {
      return ok(
        [...areaSnapshots.values()]
          .filter((snapshot) => matchesLibraryImportAreaSnapshotQuery(snapshot, query))
          .map((snapshot) => cloneRecord(snapshot)),
      );
    },

    async getLatestCompleteAreaSnapshot(input) {
      const snapshots = [...areaSnapshots.values()]
        .filter(
          (snapshot) =>
            snapshot.complete &&
            snapshot.ownerScope === input.ownerScope &&
            snapshot.providerId === input.providerId &&
            snapshot.providerAccountId === input.providerAccountId &&
            snapshot.scope === input.scope &&
            snapshot.area === input.area,
        )
        .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));

      return ok(snapshots[0] === undefined ? null : cloneRecord(snapshots[0]));
    },

    async upsertItemProvenance({ provenance }) {
      itemProvenance.set(libraryImportItemProvenanceKey(provenance), cloneRecord(provenance));

      return ok(cloneRecord(provenance));
    },

    async getItemProvenance(input) {
      const provenance = itemProvenance.get(libraryImportItemProvenanceKey(input));

      return ok(provenance === undefined ? null : cloneRecord(provenance));
    },

    async listItemProvenance(query) {
      return ok(
        [...itemProvenance.values()]
          .filter((provenance) => matchesLibraryImportItemProvenanceQuery(provenance, query))
          .map((provenance) => cloneRecord(provenance)),
      );
    },

    async putAbsence({ absence }) {
      absences.set(absence.id, cloneRecord(absence));

      return ok(cloneRecord(absence));
    },

    async listAbsences(query) {
      return ok(
        [...absences.values()]
          .filter((absence) => matchesPlatformLibraryAbsenceQuery(absence, query))
          .map((absence) => cloneRecord(absence)),
      );
    },
  };
}

export function createInMemoryEventRepository(): EventRepository {
  return createInMemoryRepository<StageEvent, string>({
    recordKey: (record) => record.id,
    keyToStorageKey: stringStorageKey,
  });
}

export function createInMemoryMemoryRepository(): MemoryRepository {
  return createInMemoryRepository<MemoryEntry, string>({
    recordKey: (record) => record.id,
    keyToStorageKey: stringStorageKey,
  });
}

export function createInMemorySessionRepository(): SessionRepository {
  return createInMemoryRepository<StageSession, string>({
    recordKey: (record) => record.id,
    keyToStorageKey: stringStorageKey,
  });
}

export function createInMemoryEffectProposalRepository(): EffectProposalRepository {
  return createInMemoryRepository<EffectProposal, string>({
    recordKey: (record) => record.id,
    keyToStorageKey: stringStorageKey,
  });
}

function stringStorageKey(key: string): string {
  return key;
}

function matchesLibraryImportBatchQuery(
  batch: LibraryImportBatch,
  query: Parameters<LibraryImportRepository["listBatches"]>[0],
): boolean {
  return (
    (query.ownerScope === undefined || batch.ownerScope === query.ownerScope) &&
    (query.providerId === undefined || batch.providerId === query.providerId) &&
    (query.providerAccountId === undefined || batch.providerAccountId === query.providerAccountId) &&
    (query.batchKind === undefined || batch.batchKind === query.batchKind) &&
    (query.status === undefined || batch.status === query.status)
  );
}

function libraryImportAreaSnapshotKey(snapshot: LibraryImportAreaSnapshot): string {
  return [
    snapshot.batchId,
    snapshot.ownerScope,
    snapshot.providerId,
    snapshot.providerAccountId,
    snapshot.scope,
    snapshot.area,
  ].join(":");
}

function matchesLibraryImportAreaSnapshotQuery(
  snapshot: LibraryImportAreaSnapshot,
  query: Parameters<LibraryImportRepository["listAreaSnapshots"]>[0],
): boolean {
  return (
    (query.batchId === undefined || snapshot.batchId === query.batchId) &&
    (query.ownerScope === undefined || snapshot.ownerScope === query.ownerScope) &&
    (query.providerId === undefined || snapshot.providerId === query.providerId) &&
    (query.providerAccountId === undefined || snapshot.providerAccountId === query.providerAccountId) &&
    (query.scope === undefined || snapshot.scope === query.scope) &&
    (query.area === undefined || snapshot.area === query.area) &&
    (query.complete === undefined || snapshot.complete === query.complete)
  );
}

function libraryImportItemProvenanceKey(
  provenance: Pick<
    LibraryImportItemProvenance,
    "ownerScope" | "providerId" | "providerAccountId" | "scope" | "area" | "sourceRef"
  >,
): string {
  return [
    provenance.ownerScope,
    provenance.providerId,
    provenance.providerAccountId,
    provenance.scope,
    provenance.area,
    refToStorageKey(provenance.sourceRef),
  ].join(":");
}

function matchesLibraryImportItemProvenanceQuery(
  provenance: LibraryImportItemProvenance,
  query: Parameters<LibraryImportRepository["listItemProvenance"]>[0],
): boolean {
  return (
    (query.ownerScope === undefined || provenance.ownerScope === query.ownerScope) &&
    (query.providerId === undefined || provenance.providerId === query.providerId) &&
    (query.providerAccountId === undefined || provenance.providerAccountId === query.providerAccountId) &&
    (query.scope === undefined || provenance.scope === query.scope) &&
    (query.area === undefined || provenance.area === query.area) &&
    (query.sourceRef === undefined ||
      refToStorageKey(provenance.sourceRef) === refToStorageKey(query.sourceRef)) &&
    (query.status === undefined || provenance.status === query.status)
  );
}

function matchesPlatformLibraryAbsenceQuery(
  absence: PlatformLibraryAbsence,
  query: Parameters<LibraryImportRepository["listAbsences"]>[0],
): boolean {
  return (
    (query.ownerScope === undefined || absence.ownerScope === query.ownerScope) &&
    (query.providerId === undefined || absence.providerId === query.providerId) &&
    (query.providerAccountId === undefined || absence.providerAccountId === query.providerAccountId) &&
    (query.scope === undefined || absence.scope === query.scope) &&
    (query.area === undefined || absence.area === query.area) &&
    (query.baselineBatchId === undefined || absence.baselineBatchId === query.baselineBatchId) &&
    (query.currentBatchId === undefined || absence.currentBatchId === query.currentBatchId)
  );
}

function matchesCollectionQuery(
  collection: Collection,
  query: Parameters<CollectionRepository["listCollections"]>[0],
): boolean {
  return (
    (query.ownerScope === undefined || collection.ownerScope === query.ownerScope) &&
    (query.collectionKind === undefined || collection.collectionKind === query.collectionKind) &&
    (query.relationKind === undefined || collection.relationKind === query.relationKind) &&
    (query.includeRemoved === true || collection.removedAt === undefined)
  );
}

function findActiveCollectionLabelConflict(
  collections: Map<string, Collection>,
  collection: Collection,
): Collection | null {
  if (collection.removedAt !== undefined) {
    return null;
  }

  return (
    [...collections.values()].find(
      (candidate) =>
        candidate.id !== collection.id &&
        candidate.ownerScope === collection.ownerScope &&
        candidate.label === collection.label &&
        candidate.removedAt === undefined,
    ) ?? null
  );
}

function matchesItemQuery(
  item: CollectionItem,
  collections: Map<string, Collection>,
  query: Parameters<CollectionRepository["listItems"]>[0],
): boolean {
  if (query.collectionId !== undefined && item.collectionId !== query.collectionId) {
    return false;
  }

  if (query.includeRemoved !== true && item.removedAt !== undefined) {
    return false;
  }

  if (
    query.ownerScope === undefined &&
    query.collectionKind === undefined &&
    query.relationKind === undefined
  ) {
    return true;
  }

  const collection = collections.get(item.collectionId);

  if (collection === undefined) {
    return false;
  }

  return (
    (query.ownerScope === undefined || collection.ownerScope === query.ownerScope) &&
    (query.collectionKind === undefined || collection.collectionKind === query.collectionKind) &&
    (query.relationKind === undefined || collection.relationKind === query.relationKind) &&
    (query.includeRemoved === true || collection.removedAt === undefined)
  );
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}

function cloneRecord<TRecord>(record: TRecord): TRecord {
  return structuredClone(record);
}
