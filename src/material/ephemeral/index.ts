import type {
  Ref,
  Result,
} from "../../contracts/index.js";
import type {
  EphemeralMaterialEntry,
  EphemeralMaterialStorePort,
} from "../../ports/index.js";

type CreateInMemoryEphemeralMaterialStoreOptions = {
  now?: () => string;
  ttlMs?: number;
  maxEntriesPerSession?: number;
};

const defaultTtlMs = 30 * 60 * 1000;
const defaultMaxEntriesPerSession = 200;

export function createInMemoryEphemeralMaterialStore({
  now = () => new Date().toISOString(),
  ttlMs = defaultTtlMs,
  maxEntriesPerSession = defaultMaxEntriesPerSession,
}: CreateInMemoryEphemeralMaterialStoreOptions = {}): EphemeralMaterialStorePort {
  const entries = new Map<string, EphemeralMaterialEntry>();

  return {
    async put(input) {
      const createdAt = now();
      const entry: EphemeralMaterialEntry = {
        materialRef: structuredClone(input.materialRef),
        material: structuredClone(input.material),
        ownerScope: input.ownerScope,
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        createdAt,
        expiresAt: input.expiresAt ?? new Date(parseTimestamp(createdAt) + ttlMs).toISOString(),
      };

      entries.set(refKey(entry.materialRef), entry);
      cleanupInternal({
        entries,
        nowMs: parseTimestamp(createdAt),
        maxEntriesPerSession,
      });

      return ok(structuredClone(entry));
    },

    async get({ materialRef }) {
      cleanupInternal({
        entries,
        nowMs: parseTimestamp(now()),
        maxEntriesPerSession,
      });

      const entry = entries.get(refKey(materialRef));
      return ok(entry === undefined ? null : structuredClone(entry));
    },

    async delete({ materialRef }) {
      return ok(entries.delete(refKey(materialRef)));
    },

    async cleanup(input = {}) {
      return ok(
        cleanupInternal({
          entries,
          nowMs: parseTimestamp(input.now ?? now()),
          maxEntriesPerSession,
          ...(input.ownerScope === undefined ? {} : { ownerScope: input.ownerScope }),
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
          ...(input.keepMaterialRefs === undefined ? {} : { keepMaterialRefs: input.keepMaterialRefs }),
        }),
      );
    },
  };
}

function cleanupInternal({
  entries,
  nowMs,
  ownerScope,
  sessionId,
  keepMaterialRefs,
  maxEntriesPerSession,
}: {
  entries: Map<string, EphemeralMaterialEntry>;
  nowMs: number;
  ownerScope?: string;
  sessionId?: string;
  keepMaterialRefs?: Ref[];
  maxEntriesPerSession: number;
}): number {
  let removed = 0;
  const keepKeys = keepMaterialRefs === undefined
    ? undefined
    : new Set(keepMaterialRefs.map(refKey));

  for (const [key, entry] of entries) {
    if (parseTimestamp(entry.expiresAt) <= nowMs) {
      entries.delete(key);
      removed += 1;
      continue;
    }

    if (keepKeys !== undefined && entryMatchesScope(entry, ownerScope, sessionId) && !keepKeys.has(key)) {
      entries.delete(key);
      removed += 1;
    }
  }

  const scopedEntries = Array.from(entries.values()).reduce<Map<string, EphemeralMaterialEntry[]>>((buckets, entry) => {
    if (!entryMatchesScope(entry, ownerScope, sessionId)) {
      return buckets;
    }

    const bucketKey = sessionBucketKey(entry.ownerScope, entry.sessionId);
    const bucket = buckets.get(bucketKey);

    if (bucket === undefined) {
      buckets.set(bucketKey, [entry]);
      return buckets;
    }

    bucket.push(entry);
    return buckets;
  }, new Map());

  for (const bucket of scopedEntries.values()) {
    if (bucket.length <= maxEntriesPerSession) {
      continue;
    }

    bucket.sort((left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt));

    for (const stale of bucket.slice(maxEntriesPerSession)) {
      if (entries.delete(refKey(stale.materialRef))) {
        removed += 1;
      }
    }
  }

  return removed;
}

function entryMatchesScope(
  entry: EphemeralMaterialEntry,
  ownerScope?: string,
  sessionId?: string,
): boolean {
  if (ownerScope !== undefined && entry.ownerScope !== ownerScope) {
    return false;
  }

  if (sessionId !== undefined && entry.sessionId !== sessionId) {
    return false;
  }

  return true;
}

function sessionBucketKey(ownerScope: string, sessionId: string | undefined): string {
  return `${ownerScope}\u0000${sessionId ?? ""}`;
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function refKey(ref: Pick<Ref, "namespace" | "kind" | "id">): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
