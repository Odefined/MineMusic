import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  LibraryImportAreaSnapshot,
  LibraryImportBatch,
  LibraryImportItemProvenance,
  LibraryImportReport,
  PlatformLibraryAbsence,
  Ref,
  Result,
} from "../../src/contracts/index.js";
import { createSqliteLibraryImportRepository } from "../../src/storage/index.js";

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

const emptyCounts: LibraryImportBatch["counts"] = {
  importedItems: 0,
  alreadyPresentItems: 0,
  skippedItems: 0,
  failedItems: 0,
  absentItems: 0,
  canonicalRecordsReused: 0,
  canonicalRecordsCreated: 0,
  canonicalRecordsUnresolved: 0,
  collectionItemsAdded: 0,
  collectionItemsAlreadyPresent: 0,
};

async function persistsBatchesAndReportsAcrossRepositoryReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-library-import-"));
  const databasePath = join(directory, "library-import.sqlite");
  const completedAt = "2026-05-25T00:01:00.000Z";
  const batch: LibraryImportBatch = {
    id: "library-import-batch-1",
    batchKind: "initial_import",
    status: "completed",
    providerId: "fixture-library",
    providerAccountId: "fixture-account",
    providerAccountStable: true,
    ownerScope: "local_profile:default",
    scopes: ["saved_recordings"],
    startedAt: "2026-05-25T00:00:00.000Z",
    completedAt,
    counts: {
      ...emptyCounts,
      importedItems: 1,
      collectionItemsAdded: 1,
    },
  };
  const report: LibraryImportReport = {
    batchId: batch.id,
    batchKind: batch.batchKind,
    status: batch.status,
    providerId: batch.providerId,
    ownerScope: batch.ownerScope,
    scopes: batch.scopes,
    startedAt: batch.startedAt,
    completedAt,
    counts: batch.counts,
    areas: [
      {
        scope: "saved_recordings",
        area: "saved_recordings",
        readStatus: "complete",
      },
    ],
    items: [
      {
        scope: "saved_recordings",
        area: "saved_recordings",
        sourceRef: sourceRef("track-1"),
        itemKind: "saved_recording",
        targetKind: "recording",
        label: "Track 1",
        status: "imported",
        canonicalRef: {
          namespace: "minemusic",
          kind: "recording",
          id: "canonical-track-1",
        },
        canonicalOutcome: "created_provisional",
        collectionItemId: "collection-item-1",
        collectionOutcome: "added",
      },
    ],
  };

  try {
    const firstRepository = createSqliteLibraryImportRepository({ path: databasePath });
    await assertOk(firstRepository.putBatch({ batch }));
    await assertOk(firstRepository.putReport({ report }));
    batch.scopes.push("saved_artists");
    report.items.push({ ...report.items[0]!, sourceRef: sourceRef("mutated-after-put") });

    const reopenedRepository = createSqliteLibraryImportRepository({ path: databasePath });
    const loadedBatch = await assertOk(reopenedRepository.getBatch({ batchId: "library-import-batch-1" }));
    const loadedReport = await assertOk(reopenedRepository.getReport({ batchId: "library-import-batch-1" }));
    const listed = await assertOk(
      reopenedRepository.listBatches({
        ownerScope: "local_profile:default",
        providerId: "fixture-library",
        providerAccountId: "fixture-account",
        batchKind: "initial_import",
        status: "completed",
      }),
    );

    assert(loadedBatch?.scopes.join(",") === "saved_recordings", "reopened repository should load stored batch");
    assert(loadedReport?.items.length === 1, "reopened repository should load stored report");
    assert(listed.length === 1 && listed[0]?.id === batch.id, "reopened repository should filter batches");

    loadedReport.items.push({ ...loadedReport.items[0]!, sourceRef: sourceRef("mutated-after-get") });
    const rereadReport = await assertOk(reopenedRepository.getReport({ batchId: "library-import-batch-1" }));
    assert(rereadReport?.items.length === 1, "SQLite repository should return report copies");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function persistsSnapshotsAndFindsStableLatestBaselineAfterReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-library-import-snapshot-"));
  const databasePath = join(directory, "library-import.sqlite");
  const oldComplete = areaSnapshot({
    batchId: "batch-old-complete",
    sourceRefId: "old",
    providerAccountStable: true,
    recordedAt: "2026-05-25T00:00:00.000Z",
  });
  const latestComplete = areaSnapshot({
    batchId: "batch-latest-complete",
    sourceRefId: "latest",
    providerAccountStable: true,
    recordedAt: "2026-05-25T02:00:00.000Z",
  });
  const newerPartial: LibraryImportAreaSnapshot = {
    ...areaSnapshot({
      batchId: "batch-newer-partial",
      sourceRefId: "partial",
      providerAccountStable: true,
      recordedAt: "2026-05-25T03:00:00.000Z",
    }),
    status: "partial",
    complete: false,
  };
  const newerUnstableComplete = areaSnapshot({
    batchId: "batch-newer-unstable-complete",
    sourceRefId: "unstable",
    providerAccountStable: false,
    recordedAt: "2026-05-25T04:00:00.000Z",
  });

  try {
    const firstRepository = createSqliteLibraryImportRepository({ path: databasePath });
    await assertOk(firstRepository.putAreaSnapshot({ snapshot: oldComplete }));
    await assertOk(firstRepository.putAreaSnapshot({ snapshot: latestComplete }));
    await assertOk(firstRepository.putAreaSnapshot({ snapshot: newerPartial }));
    await assertOk(firstRepository.putAreaSnapshot({ snapshot: newerUnstableComplete }));

    const reopenedRepository = createSqliteLibraryImportRepository({ path: databasePath });
    const completeSnapshots = await assertOk(
      reopenedRepository.listAreaSnapshots({
        ownerScope: "local_profile:default",
        providerId: "fixture-library",
        providerAccountId: "fixture-account",
        providerAccountStable: true,
        scope: "saved_recordings",
        area: "saved_recordings",
        complete: true,
      }),
    );
    const stableBaseline = await assertOk(
      reopenedRepository.getLatestCompleteAreaSnapshot({
        ownerScope: "local_profile:default",
        providerId: "fixture-library",
        providerAccountId: "fixture-account",
        providerAccountStable: true,
        scope: "saved_recordings",
        area: "saved_recordings",
      }),
    );
    const unstableBaseline = await assertOk(
      reopenedRepository.getLatestCompleteAreaSnapshot({
        ownerScope: "local_profile:default",
        providerId: "fixture-library",
        providerAccountId: "fixture-account",
        providerAccountStable: false,
        scope: "saved_recordings",
        area: "saved_recordings",
      }),
    );

    assert(completeSnapshots.length === 2, "snapshot query should filter complete stable rows");
    assert(stableBaseline?.batchId === "batch-latest-complete", "stable baseline should use latest complete row");
    assert(
      unstableBaseline?.batchId === "batch-newer-unstable-complete",
      "unstable baseline should not reuse stable account rows",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function persistsProvenanceAndAbsencesAcrossRepositoryReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-library-import-facts-"));
  const databasePath = join(directory, "library-import.sqlite");
  const first: LibraryImportItemProvenance = {
    ownerScope: "local_profile:default",
    providerId: "fixture-library",
    providerAccountId: "fixture-account",
    scope: "saved_recordings",
    area: "saved_recordings",
    sourceRef: sourceRef("track-1"),
    itemKind: "saved_recording",
    targetKind: "recording",
    label: "First Label",
    canonicalRef: {
      namespace: "minemusic",
      kind: "recording",
      id: "canonical-track-1",
    },
    firstImportedBatchId: "batch-1",
    lastSeenBatchId: "batch-1",
    lastSeenAt: "2026-05-25T00:00:00.000Z",
    status: "imported",
  };
  const updated: LibraryImportItemProvenance = {
    ...first,
    label: "Updated Label",
    lastSeenBatchId: "batch-2",
    lastSeenAt: "2026-05-25T02:00:00.000Z",
    status: "already_present",
  };
  const absence: PlatformLibraryAbsence = {
    id: "absence-1",
    ownerScope: "local_profile:default",
    providerId: "fixture-library",
    providerAccountId: "fixture-account",
    scope: "saved_recordings",
    area: "saved_recordings",
    sourceRef: sourceRef("missing-track"),
    canonicalRef: {
      namespace: "minemusic",
      kind: "recording",
      id: "canonical-missing-track",
    },
    label: "Missing Track",
    baselineBatchId: "batch-baseline",
    currentBatchId: "batch-current",
    reason: "platform_not_returned",
    recordedAt: "2026-05-25T04:00:00.000Z",
  };

  try {
    const firstRepository = createSqliteLibraryImportRepository({ path: databasePath });
    await assertOk(firstRepository.upsertItemProvenance({ provenance: first }));
    await assertOk(firstRepository.upsertItemProvenance({ provenance: updated }));
    await assertOk(firstRepository.putAbsence({ absence }));

    const reopenedRepository = createSqliteLibraryImportRepository({ path: databasePath });
    const loadedProvenance = await assertOk(
      reopenedRepository.getItemProvenance({
        ownerScope: first.ownerScope,
        providerId: first.providerId,
        providerAccountId: first.providerAccountId,
        scope: first.scope,
        area: first.area,
        sourceRef: first.sourceRef,
      }),
    );
    const listedProvenance = await assertOk(
      reopenedRepository.listItemProvenance({
        ownerScope: first.ownerScope,
        providerId: first.providerId,
        providerAccountId: first.providerAccountId,
        status: "already_present",
      }),
    );
    const listedAbsences = await assertOk(
      reopenedRepository.listAbsences({
        ownerScope: absence.ownerScope,
        providerId: absence.providerId,
        providerAccountId: absence.providerAccountId,
        baselineBatchId: "batch-baseline",
        currentBatchId: "batch-current",
      }),
    );

    assert(loadedProvenance?.label === "Updated Label", "reopened provenance should use latest upsert");
    assert(listedProvenance.length === 1, "reopened repository should filter provenance");
    assert(listedAbsences[0]?.sourceRef.id === "missing-track", "reopened repository should filter absences");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function areaSnapshot({
  batchId,
  sourceRefId,
  providerAccountStable,
  recordedAt,
}: {
  batchId: string;
  sourceRefId: string;
  providerAccountStable: boolean;
  recordedAt: string;
}): LibraryImportAreaSnapshot {
  return {
    batchId,
    ownerScope: "local_profile:default",
    providerId: "fixture-library",
    providerAccountId: "fixture-account",
    providerAccountStable,
    scope: "saved_recordings",
    area: "saved_recordings",
    status: "complete",
    complete: true,
    sourceRefs: [sourceRef(sourceRefId)],
    itemCount: 1,
    recordedAt,
  };
}

function sourceRef(id: string): Ref {
  return {
    namespace: "source:fixture-library",
    kind: "track",
    id,
  };
}

await persistsBatchesAndReportsAcrossRepositoryReopen();
await persistsSnapshotsAndFindsStableLatestBaselineAfterReopen();
await persistsProvenanceAndAbsencesAcrossRepositoryReopen();
