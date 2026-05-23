import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCanonicalStore } from "../../src/canonical/index.js";
import type { CanonicalRecord, Ref, Result } from "../../src/contracts/index.js";
import type { CanonicalRecordRepository } from "../../src/ports/index.js";
import { createSqliteCanonicalRecordRepository } from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

async function persistsCanonicalRecordsAcrossRepositoryReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-"));
  const databasePath = join(directory, "canonical.sqlite");
  const sourceRef: Ref = {
    namespace: "source:netease",
    kind: "track",
    id: "22644323",
    label: "Aruarian Dance - Nujabes, Fat Jon",
    url: "https://music.163.com/#/song?id=22644323",
  };

  try {
    const firstStore = createCanonicalStore({
      repository: createSqliteCanonicalRecordRepository({ path: databasePath }),
      idFactory: () => "canonical-aruarian-dance",
    });
    const created = await assertOk(
      firstStore.createProvisional({
        kind: "recording",
        label: "Aruarian Dance - Nujabes, Fat Jon",
        evidence: [sourceRef],
      }),
    );

    const reopenedStore = createCanonicalStore({
      repository: createSqliteCanonicalRecordRepository({ path: databasePath }),
    });
    const loaded = await assertOk(reopenedStore.get({ ref: created.ref }));
    const resolved = await assertOk(reopenedStore.resolveExternalRef({ ref: sourceRef }));

    assert(loaded?.ref.id === created.ref.id, "reopened store should load canonical record");
    assert(resolved?.ref.id === created.ref.id, "reopened store should resolve source ref evidence");
    assert(loaded?.ref.namespace === "minemusic", "canonical identity should remain MineMusic-owned");
    assert(
      resolved?.externalKeys?.[0]?.namespace === "source:netease",
      "source refs should remain external evidence",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function rejectsExternalRefConflictsAfterRepositoryReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-conflict-"));
  const databasePath = join(directory, "canonical.sqlite");
  const sourceRef: Ref = {
    namespace: "source:netease",
    kind: "track",
    id: "22821099",
  };

  try {
    const firstStore = createCanonicalStore({
      repository: createSqliteCanonicalRecordRepository({ path: databasePath }),
      idFactory: () => "canonical-feather",
    });

    await assertOk(
      firstStore.createProvisional({
        kind: "recording",
        label: "Feather - Nujabes",
        evidence: [sourceRef],
      }),
    );

    const reopenedStore = createCanonicalStore({
      repository: createSqliteCanonicalRecordRepository({ path: databasePath }),
      idFactory: () => "canonical-other",
    });
    const other = await assertOk(
      reopenedStore.createProvisional({
        kind: "recording",
        label: "Other Track",
      }),
    );
    const conflict = await reopenedStore.attachExternalRef({
      canonicalRef: other.ref,
      externalRef: sourceRef,
    });

    assert(!conflict.ok, "external ref should not attach to two canonical records after reopen");
    assert(
      conflict.error.code === "canonical.external_ref_conflict",
      "durable external ref conflicts should use the canonical conflict code",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function mapsSqliteExternalRefUniquenessFailureAtCanonicalBoundary(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-race-"));
  const databasePath = join(directory, "canonical.sqlite");
  const sourceRef: Ref = {
    namespace: "source:netease",
    kind: "track",
    id: "race-track",
  };
  const first: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "first-race" },
    kind: "recording",
    label: "First Race",
    status: "active",
    externalKeys: [sourceRef],
  };
  const second: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "second-race" },
    kind: "recording",
    label: "Second Race",
    status: "active",
  };

  try {
    const sqliteRepository = createSqliteCanonicalRecordRepository({ path: databasePath });

    await assertOk(sqliteRepository.put(first));
    await assertOk(sqliteRepository.put(second));

    let hideExistingConflictOnce = true;
    const staleConflictCheckRepository: CanonicalRecordRepository = {
      get: (ref) => sqliteRepository.get(ref),
      put: (record) => sqliteRepository.put(record),
      async list(query) {
        const records = await sqliteRepository.list(query);

        if (!records.ok || !hideExistingConflictOnce) {
          return records;
        }

        hideExistingConflictOnce = false;

        return {
          ok: true,
          value: records.value.filter((record) => record.ref.id !== first.ref.id),
        };
      },
    };
    const store = createCanonicalStore({
      repository: staleConflictCheckRepository,
    });
    const conflict = await store.attachExternalRef({
      canonicalRef: second.ref,
      externalRef: sourceRef,
    });

    assert(!conflict.ok, "SQLite unique external-ref failure should cross the canonical boundary");
    assert(
      conflict.error.code === "canonical.external_ref_conflict",
      "SQLite unique external-ref failure should map to canonical conflict code",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

await persistsCanonicalRecordsAcrossRepositoryReopen();
await rejectsExternalRefConflictsAfterRepositoryReopen();
await mapsSqliteExternalRefUniquenessFailureAtCanonicalBoundary();
