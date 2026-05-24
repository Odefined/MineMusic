import type {
  CanonicalRecord,
  Collection,
  CollectionItem,
  EffectProposal,
  MemoryEntry,
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
