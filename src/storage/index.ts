import type {
  CanonicalRecord,
  EffectProposal,
  MemoryEntry,
  Ref,
  Result,
  StageEvent,
  StageSession,
} from "../contracts/index.js";
import type {
  CanonicalRecordRepository,
  EffectProposalRepository,
  EventRepository,
  MemoryRepository,
  Repository,
  SessionRepository,
} from "../ports/index.js";

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

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function cloneRecord<TRecord>(record: TRecord): TRecord {
  return structuredClone(record);
}
