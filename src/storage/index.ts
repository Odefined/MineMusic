import type {
  CanonicalRecord,
  CanonicalProviderIdentity,
  CanonicalProvisionalHint,
  CanonicalRelation,
  CanonicalReviewState,
  Collection,
  CollectionItem,
  EffectProposal,
  LibraryImportAreaSnapshot,
  LibraryImportBatch,
  LibraryImportItemProvenance,
  LibraryImportReport,
  MemoryEntry,
  PlatformLibraryAbsence,
  ProviderHttpCacheEntry,
  Ref,
  Result,
  SourceEntity,
  SourceLibraryItem,
  StageError,
  StageEvent,
  StageSession,
  ConfirmedCanonicalBinding,
} from "../contracts/index.js";
import type {
  CanonicalRecordRepository,
  CollectionRepository,
  EffectProposalRepository,
  EventRepository,
  LibraryImportRepository,
  MemoryRepository,
  ProviderHttpCacheRepository,
  Repository,
  SessionRepository,
  SourceEntityStoreRepository,
} from "../ports/index.js";

export {
  createSqliteCanonicalRecordRepository,
  createSqliteCollectionRepository,
  createSqliteLibraryImportRepository,
  createSqliteProviderHttpCacheRepository,
  createSqliteSourceEntityStoreRepository,
  sqliteCanonicalSourceRefConflictConstraint,
} from "./sqlite/index.js";
export type {
  SqliteCanonicalRecordRepositoryOptions,
  SqliteCollectionRepositoryOptions,
  SqliteLibraryImportRepositoryOptions,
  SqliteProviderHttpCacheRepositoryOptions,
  SqliteSourceEntityStoreRepositoryOptions,
} from "./sqlite/index.js";

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
  const records = new Map<string, CanonicalRecord>();
  const providerIdentities = new Map<string, CanonicalProviderIdentity>();
  const relations = new Map<string, CanonicalRelation>();
  const provisionalHints = new Map<string, CanonicalProvisionalHint>();
  const reviewStates = new Map<string, CanonicalReviewState>();

  return {
    async get(ref) {
      const record = records.get(refToStorageKey(ref));

      return ok(record === undefined ? null : cloneRecord(record));
    },

    async put(record) {
      records.set(refToStorageKey(record.ref), cloneRecord(record));

      return ok(cloneRecord(record));
    },

    async list() {
      return ok([...records.values()].map((record) => cloneRecord(record)));
    },

    async findCurrentByProviderIdentity(input) {
      const matched = [...providerIdentities.values()]
        .filter((identity) =>
          identity.providerId === input.providerId &&
          identity.entityKind === input.entityKind &&
          identity.providerEntityId === input.providerEntityId,
        )
        .map((identity) => records.get(refToStorageKey(identity.canonicalRef)))
        .filter((record): record is CanonicalRecord =>
          record !== undefined && isCurrentCanonicalRecordStatus(record.status),
        )
        .map((record) => cloneRecord(record));

      return ok(matched);
    },

    async commitChanges(input) {
      const nextRecords = new Map(records);
      const nextProviderIdentities = new Map(providerIdentities);
      const nextRelations = new Map(relations);

      for (const record of input.putRecords ?? []) {
        nextRecords.set(refToStorageKey(record.ref), cloneRecord(record));
      }

      for (const identity of input.putProviderIdentities ?? []) {
        nextProviderIdentities.set(providerIdentityKey(identity), cloneRecord(identity));
      }

      for (const relationId of input.deleteRelationIds ?? []) {
        nextRelations.delete(relationId);
      }

      records.clear();
      for (const [key, record] of nextRecords) {
        records.set(key, record);
      }

      providerIdentities.clear();
      for (const [key, identity] of nextProviderIdentities) {
        providerIdentities.set(key, identity);
      }

      relations.clear();
      for (const [key, relation] of nextRelations) {
        relations.set(key, relation);
      }

      return ok({
        records: (input.putRecords ?? []).map((record) => cloneRecord(record)),
        providerIdentities: (input.putProviderIdentities ?? []).map((identity) =>
          cloneRecord(identity),
        ),
        deletedRelationIds: [...(input.deleteRelationIds ?? [])],
      });
    },

    async putRelation({ relation }) {
      relations.set(relation.id, cloneRecord(relation));

      return ok(cloneRecord(relation));
    },

    async listRelations(query) {
      return ok(
        [...relations.values()]
          .filter((relation) => matchesCanonicalRelationQuery(relation, query))
          .map((relation) => cloneRecord(relation)),
      );
    },

    async putProvisionalHint({ hint }) {
      const existing = provisionalHints.get(hint.id);
      const stored = existing === undefined
        ? hint
        : {
            ...hint,
            createdAt: existing.createdAt,
          };

      provisionalHints.set(hint.id, cloneRecord(stored));

      return ok(cloneRecord(stored));
    },

    async listProvisionalHints(query) {
      return ok(
        [...provisionalHints.values()]
          .filter((hint) => matchesCanonicalProvisionalHintQuery(hint, query))
          .map((hint) => cloneRecord(hint)),
      );
    },

    async putReviewState({ state }) {
      const key = refToStorageKey(state.subjectRef);
      const existing = reviewStates.get(key);
      const stored = existing === undefined
        ? state
        : {
            ...state,
            createdAt: existing.createdAt,
          };

      reviewStates.set(key, cloneRecord(stored));

      return ok(cloneRecord(stored));
    },

    async listReviewStates(query) {
      return ok(
        [...reviewStates.values()]
          .filter((state) => matchesCanonicalReviewStateQuery(state, query))
          .map((state) => cloneRecord(state)),
      );
    },

    async deleteReviewState({ subjectRef }) {
      reviewStates.delete(refToStorageKey(subjectRef));

      return ok(undefined);
    },
  };
}

export function createInMemorySourceEntityStoreRepository(): SourceEntityStoreRepository {
  const entities = new Map<string, SourceEntity>();
  const libraryItems = new Map<string, SourceLibraryItem>();
  const bindings = new Map<string, ConfirmedCanonicalBinding>();

  return {
    async getSourceEntity({ sourceRef }) {
      const entity = entities.get(refToStorageKey(sourceRef));

      return ok(entity === undefined ? null : cloneRecord(entity));
    },

    async putSourceEntity({ entity }) {
      entities.set(refToStorageKey(entity.sourceRef), cloneRecord(entity));

      return ok(cloneRecord(entity));
    },

    async listSourceEntities(query) {
      return ok(
        [...entities.values()]
          .filter((entity) => matchesSourceEntityQuery(entity, query))
          .map((entity) => cloneRecord(entity)),
      );
    },

    async getSourceLibraryItem(input) {
      const item = libraryItems.get(sourceLibraryItemKey(input));

      return ok(item === undefined ? null : cloneRecord(item));
    },

    async putSourceLibraryItem({ item }) {
      libraryItems.set(sourceLibraryItemKey(item), cloneRecord(item));

      return ok(cloneRecord(item));
    },

    async listSourceLibraryItems(query) {
      return ok(
        [...libraryItems.values()]
          .filter((item) => matchesSourceLibraryItemQuery(item, query))
          .map((item) => cloneRecord(item)),
      );
    },

    async getConfirmedCanonicalBinding({ sourceRef }) {
      const binding = bindings.get(refToStorageKey(sourceRef));

      return ok(binding === undefined ? null : cloneRecord(binding));
    },

    async putConfirmedCanonicalBinding({ binding }) {
      bindings.set(refToStorageKey(binding.sourceRef), cloneRecord(binding));

      return ok(cloneRecord(binding));
    },

    async listConfirmedCanonicalBindings(query) {
      return ok(
        [...bindings.values()]
          .filter((binding) => matchesConfirmedCanonicalBindingQuery(binding, query))
          .map((binding) => cloneRecord(binding)),
      );
    },
  };
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
  const reports = new Map<string, LibraryImportReport>();
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

    async getReport({ batchId }) {
      const report = reports.get(batchId);

      return ok(report === undefined ? null : cloneRecord(report));
    },

    async putReport({ report }) {
      reports.set(report.batchId, cloneRecord(report));

      return ok(cloneRecord(report));
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
            snapshot.providerAccountStable === input.providerAccountStable &&
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

export function createInMemoryProviderHttpCacheRepository(): ProviderHttpCacheRepository {
  const entries = new Map<string, ProviderHttpCacheEntry>();

  return {
    async get({ providerId, cacheKey, now }) {
      const storageKey = providerHttpCacheStorageKey(providerId, cacheKey);
      const entry = entries.get(storageKey);

      if (entry === undefined) {
        return ok(null);
      }

      const updatedEntry = {
        ...entry,
        lastUsedAt: now,
      };
      entries.set(storageKey, cloneRecord(updatedEntry));

      return ok(cloneRecord(updatedEntry));
    },

    async put({ entry }) {
      entries.set(providerHttpCacheStorageKey(entry.providerId, entry.cacheKey), cloneRecord(entry));

      return ok(cloneRecord(entry));
    },

    async listLeastRecentlyUsed({ providerId, limit }) {
      const matched = [...entries.values()]
        .filter((entry) => providerId === undefined || entry.providerId === providerId)
        .sort((left, right) => left.lastUsedAt.localeCompare(right.lastUsedAt))
        .slice(0, limit);

      return ok(matched.map((entry) => cloneRecord(entry)));
    },

    async deleteUnusedSince({ providerId, lastUsedBefore }) {
      let deleted = 0;

      for (const [storageKey, entry] of entries) {
        if (
          (providerId === undefined || entry.providerId === providerId) &&
          entry.lastUsedAt < lastUsedBefore
        ) {
          entries.delete(storageKey);
          deleted += 1;
        }
      }

      return ok(deleted);
    },

    async deleteByProvider({ providerId, cacheKey }) {
      return ok(entries.delete(providerHttpCacheStorageKey(providerId, cacheKey)));
    },

    async clearProvider({ providerId }) {
      let deleted = 0;

      for (const [storageKey, entry] of entries) {
        if (entry.providerId === providerId) {
          entries.delete(storageKey);
          deleted += 1;
        }
      }

      return ok(deleted);
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

function matchesCanonicalRelationQuery(
  relation: CanonicalRelation,
  query: Parameters<CanonicalRecordRepository["listRelations"]>[0],
): boolean {
  return (
    (query.subjectRef === undefined ||
      refToStorageKey(relation.subjectRef) === refToStorageKey(query.subjectRef)) &&
    (query.sourceRef === undefined ||
      refToStorageKey(relation.sourceRef) === refToStorageKey(query.sourceRef)) &&
    (query.predicate === undefined || relation.predicate === query.predicate) &&
    (query.status === undefined || relation.status === query.status)
  );
}

function matchesCanonicalProvisionalHintQuery(
  hint: CanonicalProvisionalHint,
  query: Parameters<CanonicalRecordRepository["listProvisionalHints"]>[0],
): boolean {
  return (
    (query.subjectRef === undefined ||
      refToStorageKey(hint.subjectRef) === refToStorageKey(query.subjectRef)) &&
    (query.sourceRef === undefined ||
      refToStorageKey(hint.sourceRef) === refToStorageKey(query.sourceRef)) &&
    (query.kind === undefined || hint.kind === query.kind)
  );
}

function matchesCanonicalReviewStateQuery(
  state: CanonicalReviewState,
  query: Parameters<CanonicalRecordRepository["listReviewStates"]>[0],
): boolean {
  return (
    (query.subjectRef === undefined ||
      refToStorageKey(state.subjectRef) === refToStorageKey(query.subjectRef)) &&
    (query.outcome === undefined || state.outcome === query.outcome)
  );
}

function matchesSourceEntityQuery(
  entity: SourceEntity,
  query: Parameters<SourceEntityStoreRepository["listSourceEntities"]>[0],
): boolean {
  return (
    (query.providerId === undefined || entity.providerId === query.providerId) &&
    (query.kind === undefined || entity.kind === query.kind) &&
    (query.sourceRef === undefined ||
      refToStorageKey(entity.sourceRef) === refToStorageKey(query.sourceRef))
  );
}

function sourceLibraryItemKey(
  item: Pick<
    SourceLibraryItem,
    "ownerScope" | "providerId" | "providerAccountId" | "libraryKind" | "sourceRef"
  >,
): string {
  return [
    item.ownerScope,
    item.providerId,
    item.providerAccountId,
    item.libraryKind,
    refToStorageKey(item.sourceRef),
  ].join(":");
}

function matchesSourceLibraryItemQuery(
  item: SourceLibraryItem,
  query: Parameters<SourceEntityStoreRepository["listSourceLibraryItems"]>[0],
): boolean {
  return (
    (query.ownerScope === undefined || item.ownerScope === query.ownerScope) &&
    (query.providerId === undefined || item.providerId === query.providerId) &&
    (query.providerAccountId === undefined || item.providerAccountId === query.providerAccountId) &&
    (query.sourceKind === undefined || item.sourceKind === query.sourceKind) &&
    (query.libraryKind === undefined || item.libraryKind === query.libraryKind) &&
    (query.status === undefined || item.status === query.status) &&
    (query.sourceRef === undefined ||
      refToStorageKey(item.sourceRef) === refToStorageKey(query.sourceRef))
  );
}

function matchesConfirmedCanonicalBindingQuery(
  binding: ConfirmedCanonicalBinding,
  query: Parameters<SourceEntityStoreRepository["listConfirmedCanonicalBindings"]>[0],
): boolean {
  return (
    (query.sourceRef === undefined ||
      refToStorageKey(binding.sourceRef) === refToStorageKey(query.sourceRef)) &&
    (query.canonicalRef === undefined ||
      refToStorageKey(binding.canonicalRef) === refToStorageKey(query.canonicalRef))
  );
}

function providerIdentityKey(identity: Pick<
  CanonicalProviderIdentity,
  "providerId" | "entityKind" | "providerEntityId"
>): string {
  return [
    identity.providerId,
    identity.entityKind,
    identity.providerEntityId,
  ].join(":");
}

function isCurrentCanonicalRecordStatus(status: CanonicalRecord["status"]): boolean {
  return status === "active" || status === "provisional";
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
    (query.providerAccountStable === undefined ||
      snapshot.providerAccountStable === query.providerAccountStable) &&
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

function providerHttpCacheStorageKey(providerId: string, cacheKey: string): string {
  return `${providerId}:${cacheKey}`;
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
