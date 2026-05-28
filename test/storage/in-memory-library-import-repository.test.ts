import type {
  LibraryImportAreaSnapshot,
  LibraryImportBatch,
  LibraryImportItemProvenance,
  LibraryImportReport,
  PlatformLibraryAbsence,
  Ref,
} from "../../src/contracts/index.js";
import { createInMemoryLibraryImportRepository } from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, "expected Result.ok");
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

async function storesBatchesByIdAndReturnsCopies(): Promise<void> {
  const repository = createInMemoryLibraryImportRepository();
  const batch: LibraryImportBatch = {
    id: "library-import-batch-1",
    batchKind: "initial_import",
    status: "running",
    providerId: "fixture-library",
    providerAccountId: "fixture-account",
    providerAccountStable: true,
    ownerScope: "local_profile:default",
    scopes: ["saved_source_tracks"],
    startedAt: "2026-05-25T00:00:00.000Z",
    counts: emptyCounts,
  };

  await assertOk(repository.putBatch({ batch }));
  batch.status = "failed";
  batch.scopes.push("saved_source_artists");

  const firstRead = await assertOk(repository.getBatch({ batchId: batch.id }));
  assert(firstRead !== null, "library import repository should get a batch by id");
  assert(firstRead.status === "running", "repository should not retain batch caller mutations");
  assert(firstRead.scopes.length === 1, "repository should clone nested batch arrays on put");

  firstRead.scopes.push("saved_source_releases");
  const secondRead = await assertOk(repository.getBatch({ batchId: batch.id }));
  assert(secondRead?.scopes.length === 1, "repository should return batch copies");

  const listed = await assertOk(
    repository.listBatches({
      ownerScope: "local_profile:default",
      providerId: "fixture-library",
      providerAccountId: "fixture-account",
      batchKind: "initial_import",
      status: "running",
    }),
  );
  assert(listed.length === 1 && listed[0]?.id === batch.id, "repository should filter batches by query");
}

async function storesReportsByBatchIdAndReturnsCopies(): Promise<void> {
  const repository = createInMemoryLibraryImportRepository();
  const report: LibraryImportReport = {
    batchId: "library-import-batch-1",
    batchKind: "initial_import",
    status: "completed",
    providerId: "fixture-library",
    ownerScope: "local_profile:default",
    scopes: ["saved_source_tracks"],
    startedAt: "2026-05-25T00:00:00.000Z",
    completedAt: "2026-05-25T00:01:00.000Z",
    counts: emptyCounts,
    areas: [
      {
        scope: "saved_source_tracks",
        area: "saved_source_tracks",
        readStatus: "complete",
      },
    ],
    items: [
      {
        scope: "saved_source_tracks",
        area: "saved_source_tracks",
        sourceRef: sourceRef("track-1"),
        itemKind: "saved_source_track",
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

  await assertOk(repository.putReport({ report }));
  report.items.push({
    ...report.items[0]!,
    sourceRef: sourceRef("mutated-after-put"),
  });

  const firstRead = await assertOk(repository.getReport({ batchId: report.batchId }));
  assert(firstRead !== null, "library import repository should get a report by batch id");
  assert(firstRead.items.length === 1, "repository should not retain report caller mutations");

  firstRead.items.push({
    ...firstRead.items[0]!,
    sourceRef: sourceRef("mutated-after-get"),
  });
  const secondRead = await assertOk(repository.getReport({ batchId: report.batchId }));
  assert(secondRead?.items.length === 1, "repository should return report copies");
}

async function storesAreaSnapshotsAndFindsLatestCompleteBaseline(): Promise<void> {
  const repository = createInMemoryLibraryImportRepository();
  const oldComplete: LibraryImportAreaSnapshot = {
    batchId: "batch-old-complete",
    ownerScope: "local_profile:default",
    providerId: "fixture-library",
    providerAccountId: "fixture-account",
    providerAccountStable: true,
    scope: "saved_source_tracks",
    area: "saved_source_tracks",
    status: "complete",
    complete: true,
    sourceRefs: [sourceRef("old")],
    itemCount: 1,
    recordedAt: "2026-05-25T00:00:00.000Z",
  };
  const latestComplete: LibraryImportAreaSnapshot = {
    ...oldComplete,
    batchId: "batch-latest-complete",
    sourceRefs: [sourceRef("latest")],
    recordedAt: "2026-05-25T02:00:00.000Z",
  };
  const newerPartial: LibraryImportAreaSnapshot = {
    ...oldComplete,
    batchId: "batch-newer-partial",
    status: "partial",
    complete: false,
    sourceRefs: [sourceRef("partial")],
    recordedAt: "2026-05-25T03:00:00.000Z",
  };
  const newerUnstableComplete: LibraryImportAreaSnapshot = {
    ...oldComplete,
    batchId: "batch-newer-unstable-complete",
    providerAccountStable: false,
    sourceRefs: [sourceRef("unstable")],
    recordedAt: "2026-05-25T04:00:00.000Z",
  };

  await assertOk(repository.putAreaSnapshot({ snapshot: oldComplete }));
  await assertOk(repository.putAreaSnapshot({ snapshot: latestComplete }));
  await assertOk(repository.putAreaSnapshot({ snapshot: newerPartial }));
  await assertOk(repository.putAreaSnapshot({ snapshot: newerUnstableComplete }));
  latestComplete.sourceRefs.push(sourceRef("mutated-after-put"));

  const completeSnapshots = await assertOk(
    repository.listAreaSnapshots({
      ownerScope: "local_profile:default",
      providerId: "fixture-library",
      providerAccountId: "fixture-account",
      providerAccountStable: true,
      scope: "saved_source_tracks",
      area: "saved_source_tracks",
      complete: true,
    }),
  );
  assert(completeSnapshots.length === 2, "area snapshot query should filter complete snapshots");
  assert(
    completeSnapshots.every((snapshot) => snapshot.complete),
    "complete snapshot query should exclude partial snapshots",
  );

  completeSnapshots[0]?.sourceRefs.push(sourceRef("mutated-after-get"));
  const latestBaseline = await assertOk(
    repository.getLatestCompleteAreaSnapshot({
      ownerScope: "local_profile:default",
      providerId: "fixture-library",
      providerAccountId: "fixture-account",
      providerAccountStable: true,
      scope: "saved_source_tracks",
      area: "saved_source_tracks",
    }),
  );
  assert(latestBaseline?.batchId === "batch-latest-complete", "baseline lookup should return latest complete snapshot");
  assert(latestBaseline.sourceRefs.length === 1, "area snapshot reads should return copies");

  const unstableBaseline = await assertOk(
    repository.getLatestCompleteAreaSnapshot({
      ownerScope: "local_profile:default",
      providerId: "fixture-library",
      providerAccountId: "fixture-account",
      providerAccountStable: false,
      scope: "saved_source_tracks",
      area: "saved_source_tracks",
    }),
  );
  assert(
    unstableBaseline?.batchId === "batch-newer-unstable-complete",
    "baseline lookup should keep stable and unstable account identities separate",
  );
}

async function upsertsAndQueriesItemProvenanceByStableSourceRef(): Promise<void> {
  const repository = createInMemoryLibraryImportRepository();
  const first: LibraryImportItemProvenance = {
    ownerScope: "local_profile:default",
    providerId: "fixture-library",
    providerAccountId: "fixture-account",
    scope: "saved_source_tracks",
    area: "saved_source_tracks",
    sourceRef: sourceRef("track-1"),
    itemKind: "saved_source_track",
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

  await assertOk(repository.upsertItemProvenance({ provenance: first }));
  await assertOk(repository.upsertItemProvenance({ provenance: updated }));
  updated.label = "Mutated after put";

  const stored = await assertOk(
    repository.getItemProvenance({
      ownerScope: first.ownerScope,
      providerId: first.providerId,
      providerAccountId: first.providerAccountId,
      scope: first.scope,
      area: first.area,
      sourceRef: first.sourceRef,
    }),
  );
  assert(stored?.label === "Updated Label", "provenance upsert should replace the same source-ref record");
  assert(stored.lastSeenBatchId === "batch-2", "provenance upsert should keep latest seen batch");

  stored.label = "Mutated after get";
  const listed = await assertOk(
    repository.listItemProvenance({
      ownerScope: first.ownerScope,
      providerId: first.providerId,
      providerAccountId: first.providerAccountId,
      scope: first.scope,
      area: first.area,
      status: "already_present",
    }),
  );
  assert(listed.length === 1 && listed[0]?.label === "Updated Label", "provenance list should filter and return copies");
}

async function storesAndQueriesPlatformLibraryAbsences(): Promise<void> {
  const repository = createInMemoryLibraryImportRepository();
  const absence: PlatformLibraryAbsence = {
    id: "absence-1",
    ownerScope: "local_profile:default",
    providerId: "fixture-library",
    providerAccountId: "fixture-account",
    scope: "saved_source_tracks",
    area: "saved_source_tracks",
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

  await assertOk(repository.putAbsence({ absence }));
  absence.label = "Mutated after put";

  const listed = await assertOk(
    repository.listAbsences({
      ownerScope: "local_profile:default",
      providerId: "fixture-library",
      providerAccountId: "fixture-account",
      scope: "saved_source_tracks",
      area: "saved_source_tracks",
      baselineBatchId: "batch-baseline",
      currentBatchId: "batch-current",
    }),
  );
  assert(listed.length === 1 && listed[0]?.label === "Missing Track", "absence query should filter records");

  listed[0].label = "Mutated after get";
  const secondRead = await assertOk(repository.listAbsences({ currentBatchId: "batch-current" }));
  assert(secondRead[0]?.label === "Missing Track", "absence reads should return copies");
}

function sourceRef(id: string): Ref {
  return {
    namespace: "source:fixture-library",
    kind: "track",
    id,
  };
}

await storesBatchesByIdAndReturnsCopies();
await storesReportsByBatchIdAndReturnsCopies();
await storesAreaSnapshotsAndFindsLatestCompleteBaseline();
await upsertsAndQueriesItemProvenanceByStableSourceRef();
await storesAndQueriesPlatformLibraryAbsences();
