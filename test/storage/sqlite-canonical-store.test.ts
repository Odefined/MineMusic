import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createCanonicalStore } from "../../src/canonical/index.js";
import type { CanonicalProviderIdentity, CanonicalRecord, Ref, Result } from "../../src/contracts/index.js";
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
    const resolved = await assertOk(reopenedStore.resolveSourceRef({ ref: sourceRef }));

    assert(loaded?.ref.id === created.ref.id, "reopened store should load canonical record");
    assert(resolved?.ref.id === created.ref.id, "reopened store should resolve source ref evidence");
    assert(loaded?.ref.namespace === "minemusic", "canonical identity should remain MineMusic-owned");
    assert(
      resolved?.sourceRefs?.[0]?.namespace === "source:netease",
      "source refs should remain source-ref evidence",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function rejectsSourceRefConflictsAfterRepositoryReopen(): Promise<void> {
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
    const conflict = await reopenedStore.attachSourceRef({
      canonicalRef: other.ref,
      sourceRef: sourceRef,
    });

    assert(!conflict.ok, "source ref should not attach to two canonical records after reopen");
    assert(
      conflict.error.code === "canonical.source_ref_conflict",
      "durable source ref conflicts should use the canonical conflict code",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function mapsSqliteSourceRefUniquenessFailureAtCanonicalBoundary(): Promise<void> {
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
    sourceRefs: [sourceRef],
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
      putRelation: (input) => sqliteRepository.putRelation(input),
      listRelations: (input) => sqliteRepository.listRelations(input),
      putProvisionalHint: (input) => sqliteRepository.putProvisionalHint(input),
      listProvisionalHints: (input) => sqliteRepository.listProvisionalHints(input),
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
    const conflict = await store.attachSourceRef({
      canonicalRef: second.ref,
      sourceRef: sourceRef,
    });

    assert(!conflict.ok, "SQLite unique source-ref failure should cross the canonical boundary");
    assert(
      conflict.error.code === "canonical.source_ref_conflict",
      "SQLite unique source-ref failure should map to canonical conflict code",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function usesIndexedSourceRefLookupWithoutFullRepositoryList(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-indexed-"));
  const databasePath = join(directory, "canonical.sqlite");
  const sourceRef: Ref = {
    namespace: "source:netease",
    kind: "track",
    id: "indexed-track",
  };

  try {
    const sqliteRepository = createSqliteCanonicalRecordRepository({ path: databasePath });
    const firstStore = createCanonicalStore({
      repository: sqliteRepository,
      idFactory: (() => {
        const ids = ["canonical-indexed", "canonical-other"];

        return () => ids.shift() ?? "unexpected";
      })(),
    });
    const first = await assertOk(
      firstStore.createProvisional({
        kind: "recording",
        label: "Indexed Track",
        evidence: [sourceRef],
      }),
    );
    const second = await assertOk(
      firstStore.createProvisional({
        kind: "recording",
        label: "Other Indexed Track",
      }),
    );
    const indexedRepository: CanonicalRecordRepository = {
      get: (ref) => sqliteRepository.get(ref),
      put: (record) => sqliteRepository.put(record),
      findBySourceRef: (input) => sqliteRepository.findBySourceRef?.(input) ?? assertUnreachable(),
      putRelation: (input) => sqliteRepository.putRelation(input),
      listRelations: (input) => sqliteRepository.listRelations(input),
      putProvisionalHint: (input) => sqliteRepository.putProvisionalHint(input),
      listProvisionalHints: (input) => sqliteRepository.listProvisionalHints(input),
      async list() {
        throw new Error("source-ref lookups should use the SQLite source-ref index");
      },
    };
    const indexedStore = createCanonicalStore({
      repository: indexedRepository,
      idFactory: () => "unexpected-created",
    });
    const resolved = await assertOk(indexedStore.resolveSourceRef({ ref: sourceRef }));
    const reused = await assertOk(
      indexedStore.createProvisional({
        kind: "recording",
        label: "Indexed Track Reimport",
        evidence: [sourceRef],
      }),
    );
    const conflict = await indexedStore.attachSourceRef({
      canonicalRef: second.ref,
      sourceRef,
    });

    assert(resolved?.ref.id === first.ref.id, "source-ref lookup should use the indexed repository path");
    assert(reused.ref.id === first.ref.id, "provisional creation should reuse indexed source-ref matches");
    assert(!conflict.ok, "source-ref conflict checks should use the indexed repository path");
    assert(
      conflict.error.code === "canonical.source_ref_conflict",
      "indexed source-ref conflict checks should keep the canonical error code",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function migratesLegacySourceRefTableToSourceRefs(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-migration-"));
  const databasePath = join(directory, "canonical.sqlite");
  const sourceRef: Ref = {
    namespace: "source:netease",
    kind: "track",
    id: "legacy-track",
  };

  try {
    const legacyDatabase = new DatabaseSync(databasePath);

    legacyDatabase.exec(`
      CREATE TABLE canonical_entities (
        id TEXT PRIMARY KEY,
        namespace TEXT NOT NULL DEFAULT 'minemusic',
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        normalized_label TEXT NOT NULL,
        status TEXT NOT NULL,
        merged_into_id TEXT,
        disambiguation TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (status IN ('active', 'provisional', 'merged', 'rejected'))
      );

      CREATE TABLE canonical_external_refs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        canonical_id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        kind TEXT NOT NULL,
        external_id TEXT NOT NULL,
        label TEXT,
        url TEXT,
        confidence REAL,
        evidence_event_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (canonical_id) REFERENCES canonical_entities(id),
        UNIQUE(namespace, kind, external_id)
      );

      INSERT INTO canonical_entities (
        id,
        namespace,
        kind,
        label,
        normalized_label,
        status,
        created_at,
        updated_at
      )
      VALUES (
        'legacy-canonical',
        'minemusic',
        'recording',
        'Legacy Track',
        'legacy track',
        'provisional',
        '2026-05-25T00:00:00.000Z',
        '2026-05-25T00:00:00.000Z'
      );

      INSERT INTO canonical_external_refs (
        canonical_id,
        namespace,
        kind,
        external_id,
        created_at
      )
      VALUES (
        'legacy-canonical',
        'source:netease',
        'track',
        'legacy-track',
        '2026-05-25T00:00:00.000Z'
      );
    `);
    legacyDatabase.close();

    const store = createCanonicalStore({
      repository: createSqliteCanonicalRecordRepository({ path: databasePath }),
    });
    const resolved = await assertOk(store.resolveSourceRef({ ref: sourceRef }));

    assert(resolved?.ref.id === "legacy-canonical", "legacy source refs should migrate");
    assert(
      resolved?.sourceRefs?.[0]?.id === sourceRef.id,
      "migrated canonical records should expose sourceRefs",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function persistsCanonicalRelationsAcrossRepositoryReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-relations-"));
  const databasePath = join(directory, "canonical.sqlite");
  const sourceRef: Ref = {
    namespace: "source:netease",
    kind: "track",
    id: "relation-track",
    label: "Relation Track - Fixture Artist",
  };

  try {
    const firstStore = createCanonicalStore({
      repository: createSqliteCanonicalRecordRepository({ path: databasePath }),
      idFactory: () => "canonical-relation-track",
      clock: () => "2026-05-25T00:00:00.000Z",
    });
    const created = await assertOk(
      firstStore.createProvisional({
        kind: "recording",
        label: "Relation Track - Fixture Artist",
        evidence: [sourceRef],
      }),
    );

    await assertOk(
      firstStore.recordProvisionalRelations({
        subjectRef: created.ref,
        sourceRef,
        providerId: "netease",
        batchId: "batch-1",
        relations: [
          {
            predicate: "performed_by",
            objectKind: "artist",
            objectLabel: "Fixture Artist",
          },
          {
            predicate: "appears_on_release",
            objectKind: "release",
            objectLabel: "Fixture Release",
          },
          {
            predicate: "has_duration_ms",
            objectKind: "duration_ms",
            objectValue: 123456,
          },
        ],
      }),
    );

    const reopenedStore = createCanonicalStore({
      repository: createSqliteCanonicalRecordRepository({ path: databasePath }),
    });
    const relations = await assertOk(
      reopenedStore.listRelations({
        subjectRef: created.ref,
      }),
    );

    assert(relations.length === 3, "reopened canonical repository should load provisional relations");
    assert(
      relations.some((relation) => relation.predicate === "performed_by" && relation.objectLabel === "Fixture Artist"),
      "reopened relations should keep artist labels",
    );
    assert(
      relations.some((relation) => relation.predicate === "has_duration_ms" && relation.objectValue === 123456),
      "reopened relations should keep duration values",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function persistsFactsAndProviderIdentitiesAcrossRepositoryReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-provider-identity-"));
  const databasePath = join(directory, "canonical.sqlite");
  const record: CanonicalRecord = {
    ref: {
      namespace: "minemusic",
      kind: "recording",
      id: "canonical-mb-recording",
    },
    kind: "recording",
    label: "MusicBrainz Recording Title",
    status: "active",
    facts: {
      artistCreditText: "Fixture Artist",
      durationMs: 123456,
      isrcs: ["TESTISRC0001"],
      disambiguation: "fixture version",
    },
  };
  const identity: CanonicalProviderIdentity = {
    canonicalRef: record.ref,
    providerId: "musicbrainz",
    entityKind: "recording",
    providerEntityId: "mb-recording-1",
  };

  try {
    const repository = createSqliteCanonicalRecordRepository({ path: databasePath });

    assert(repository.commitChanges !== undefined, "SQLite repository should commit canonical changesets");
    await assertOk(
      repository.commitChanges({
        putRecords: [record],
        putProviderIdentities: [identity],
      }),
    );

    const reopenedRepository = createSqliteCanonicalRecordRepository({ path: databasePath });
    const loaded = await assertOk(reopenedRepository.get(record.ref));
    const matches = await assertOk(
      reopenedRepository.findCurrentByProviderIdentity?.({
        providerId: "musicbrainz",
        entityKind: "recording",
        providerEntityId: "mb-recording-1",
      }) ?? assertUnreachable("SQLite repository should expose provider identity lookup"),
    );

    assert(loaded?.facts?.artistCreditText === "Fixture Artist", "reopened records should keep facts");
    assert(loaded?.facts?.durationMs === 123456, "reopened records should keep numeric facts");
    assert(matches.length === 1, "provider identity lookup should find one current record");
    assert(matches[0]?.ref.id === record.ref.id, "provider identity lookup should return the bound record");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function changesetDeletesOnlyRequestedRelations(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-delete-relations-"));
  const databasePath = join(directory, "canonical.sqlite");
  const subjectRef: Ref = {
    namespace: "minemusic",
    kind: "recording",
    id: "delete-relation-subject",
  };
  const sourceRef: Ref = {
    namespace: "source:netease",
    kind: "track",
    id: "delete-relation-track",
  };

  try {
    const repository = createSqliteCanonicalRecordRepository({ path: databasePath });

    await assertOk(
      repository.put({
        ref: subjectRef,
        kind: "recording",
        label: "Delete Relation Subject",
        status: "provisional",
      }),
    );
    await assertOk(
      repository.putRelation({
        relation: {
          id: "delete-me",
          subjectRef,
          predicate: "performed_by",
          objectKind: "artist",
          objectLabel: "Fixture Artist",
          sourceRef,
          status: "provisional",
          createdAt: "2026-05-27T00:00:00.000Z",
          updatedAt: "2026-05-27T00:00:00.000Z",
        },
      }),
    );
    await assertOk(
      repository.putRelation({
        relation: {
          id: "keep-me",
          subjectRef,
          predicate: "has_duration_ms",
          objectKind: "duration_ms",
          objectValue: 123456,
          sourceRef,
          status: "provisional",
          createdAt: "2026-05-27T00:00:00.000Z",
          updatedAt: "2026-05-27T00:00:00.000Z",
        },
      }),
    );

    assert(repository.commitChanges !== undefined, "SQLite repository should commit canonical changesets");
    await assertOk(repository.commitChanges({ deleteRelationIds: ["delete-me"] }));

    const relations = await assertOk(repository.listRelations({ subjectRef }));

    assert(relations.length === 1, "changeset should delete only requested relation ids");
    assert(relations[0]?.id === "keep-me", "changeset should keep unrelated relations");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function persistsCanonicalProvisionalHintsAcrossRepositoryReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-hints-"));
  const databasePath = join(directory, "canonical.sqlite");
  const sourceRef: Ref = {
    namespace: "source:netease",
    kind: "track",
    id: "hint-track",
    label: "Hint Track - Fixture Artist",
  };

  try {
    const firstStore = createCanonicalStore({
      repository: createSqliteCanonicalRecordRepository({ path: databasePath }),
      idFactory: () => "canonical-hint-track",
      clock: () => "2026-05-25T00:00:00.000Z",
    });
    const created = await assertOk(
      firstStore.createProvisional({
        kind: "recording",
        label: "Hint Track - Fixture Artist",
        evidence: [sourceRef],
      }),
    );

    await assertOk(
      firstStore.recordProvisionalHints({
        subjectRef: created.ref,
        sourceRef,
        providerId: "netease",
        batchId: "batch-1",
        hints: [
          {
            kind: "source_recording_context",
            facts: {
              title: "Hint Track",
              artistLabels: ["Fixture Artist"],
              releaseLabel: "Fixture Release",
              releaseSourceRef: {
                namespace: "source:netease",
                kind: "album",
                id: "hint-album",
              },
              durationMs: 123456,
              trackPosition: {
                discNumber: "1",
                trackNumber: 5,
                trackCount: 12,
              },
            },
          },
        ],
      }),
    );

    const reopenedStore = createCanonicalStore({
      repository: createSqliteCanonicalRecordRepository({ path: databasePath }),
    });
    const bySubject = await assertOk(
      reopenedStore.listProvisionalHints({
        subjectRef: created.ref,
      }),
    );
    const bySource = await assertOk(
      reopenedStore.listProvisionalHints({
        sourceRef,
        kind: "source_recording_context",
      }),
    );

    assert(bySubject.length === 1, "reopened canonical repository should load provisional hints");
    assert(bySource.length === 1, "reopened hints should be filterable by source ref and kind");
    assert(
      bySubject[0]?.facts.trackPosition?.trackNumber === 5,
      "reopened hints should keep source-side track position facts",
    );
    assert(bySubject[0]?.providerId === "netease", "reopened hints should keep provider id");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function persistsMergedRedirectsAcrossRepositoryReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-canonical-redirect-"));
  const databasePath = join(directory, "canonical.sqlite");
  const targetRef: Ref = {
    namespace: "minemusic",
    kind: "recording",
    id: "redirect-target",
  };
  const subjectRef: Ref = {
    namespace: "minemusic",
    kind: "recording",
    id: "redirect-subject",
  };

  try {
    const repository = createSqliteCanonicalRecordRepository({ path: databasePath });

    await assertOk(
      repository.put({
        ref: targetRef,
        kind: "recording",
        label: "Redirect Target",
        status: "active",
      }),
    );
    await assertOk(
      repository.put({
        ref: subjectRef,
        kind: "recording",
        label: "Redirect Subject",
        status: "merged",
        mergedIntoRef: targetRef,
      }),
    );

    const reopenedStore = createCanonicalStore({
      repository: createSqliteCanonicalRecordRepository({ path: databasePath }),
    });
    const redirected = await assertOk(reopenedStore.get({ ref: subjectRef }));

    assert(redirected?.ref.id === targetRef.id, "ordinary canonical get should follow persisted redirects");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

await persistsCanonicalRecordsAcrossRepositoryReopen();
await rejectsSourceRefConflictsAfterRepositoryReopen();
await mapsSqliteSourceRefUniquenessFailureAtCanonicalBoundary();
await usesIndexedSourceRefLookupWithoutFullRepositoryList();
await migratesLegacySourceRefTableToSourceRefs();
await persistsCanonicalRelationsAcrossRepositoryReopen();
await persistsFactsAndProviderIdentitiesAcrossRepositoryReopen();
await changesetDeletesOnlyRequestedRelations();
await persistsCanonicalProvisionalHintsAcrossRepositoryReopen();
await persistsMergedRedirectsAcrossRepositoryReopen();

function assertUnreachable(message = "SQLite repository should expose indexed source-ref lookup"): never {
  throw new Error(message);
}
