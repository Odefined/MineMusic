import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  ConfirmedCanonicalBinding,
  Ref,
  Result,
  SourceLibraryItem,
  SourceRelease,
  SourceTrack,
} from "../../src/contracts/index.js";
import { createSqliteSourceEntityStoreRepository } from "../../src/storage/index.js";

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

async function persistsSourceEntitiesLibraryAndBindingsAcrossReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-source-entity-"));
  const databasePath = join(directory, "material-store.sqlite");
  const trackRef = sourceRef("track", "track-1");
  const releaseRef = sourceRef("release", "release-1");
  const track: SourceTrack = {
    kind: "track",
    sourceRef: trackRef,
    providerId: "fixture-library",
    label: "Fixture Track",
    title: "Fixture Track",
    artistLabels: ["Fixture Artist"],
    releaseSourceRef: releaseRef,
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
  };
  const release: SourceRelease = {
    kind: "release",
    sourceRef: releaseRef,
    providerId: "fixture-library",
    label: "Fixture Release",
    title: "Fixture Release",
    releaseDate: "2026-05-28",
    tracklist: [
      {
        sourceRef: trackRef,
        title: "Fixture Track",
        artistLabels: ["Fixture Artist"],
        discNumber: "1",
        trackNumber: 1,
        trackCount: 1,
        durationMs: 210000,
      },
    ],
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
  };
  const libraryItem: SourceLibraryItem = {
    id: "source-library-item-1",
    ownerScope: "local_profile:default",
    providerId: "fixture-library",
    providerAccountId: "fixture-account",
    sourceRef: trackRef,
    sourceKind: "track",
    libraryKind: "saved_source_track",
    label: "Fixture Track",
    firstImportedBatchId: "batch-1",
    lastSeenBatchId: "batch-1",
    lastSeenAt: "2026-05-28T00:01:00.000Z",
    status: "present",
  };
  const binding: ConfirmedCanonicalBinding = {
    sourceRef: trackRef,
    canonicalRef: {
      namespace: "minemusic",
      kind: "recording",
      id: "canonical-track-1",
    },
    createdAt: "2026-05-28T00:02:00.000Z",
    updatedAt: "2026-05-28T00:02:00.000Z",
  };

  try {
    const firstRepository = createSqliteSourceEntityStoreRepository({ path: databasePath });
    await assertOk(firstRepository.putSourceEntity({ entity: track }));
    await assertOk(firstRepository.putSourceEntity({ entity: release }));
    await assertOk(firstRepository.putSourceLibraryItem({ item: libraryItem }));
    await assertOk(firstRepository.putConfirmedCanonicalBinding({ binding }));
    track.label = "Mutated after put";
    libraryItem.label = "Mutated after put";

    const reopenedRepository = createSqliteSourceEntityStoreRepository({ path: databasePath });
    const loadedTrack = await assertOk(reopenedRepository.getSourceEntity({ sourceRef: trackRef }));
    const loadedRelease = await assertOk(reopenedRepository.getSourceEntity({ sourceRef: releaseRef }));
    const listedTracks = await assertOk(
      reopenedRepository.listSourceEntities({
        providerId: "fixture-library",
        kind: "track",
      }),
    );
    const loadedLibraryItem = await assertOk(
      reopenedRepository.getSourceLibraryItem({
        ownerScope: "local_profile:default",
        providerId: "fixture-library",
        providerAccountId: "fixture-account",
        libraryKind: "saved_source_track",
        sourceRef: trackRef,
      }),
    );
    const listedLibraryItems = await assertOk(
      reopenedRepository.listSourceLibraryItems({
        ownerScope: "local_profile:default",
        sourceKind: "track",
        status: "present",
      }),
    );
    const loadedBinding = await assertOk(
      reopenedRepository.getConfirmedCanonicalBinding({
        sourceRef: trackRef,
      }),
    );
    const listedBindings = await assertOk(
      reopenedRepository.listConfirmedCanonicalBindings({
        canonicalRef: binding.canonicalRef,
      }),
    );

    assert(loadedTrack?.label === "Fixture Track", "reopened repository should load source entities");
    assert(loadedRelease?.kind === "release", "reopened repository should load release entities");
    assert(loadedRelease?.tracklist?.[0]?.title === "Fixture Track", "reopened repository should preserve release tracklists");
    assert(listedTracks.length === 1 && listedTracks[0]?.sourceRef.id === "track-1", "repository should filter source entities");
    assert(loadedLibraryItem?.label === "Fixture Track", "reopened repository should load source library items");
    assert(listedLibraryItems.length === 1, "repository should filter source library items");
    assert(loadedBinding?.canonicalRef.id === "canonical-track-1", "reopened repository should load confirmed bindings");
    assert(listedBindings.length === 1, "repository should filter confirmed bindings");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function sourceRef(kind: string, id: string): Ref {
  return {
    namespace: "source:fixture",
    kind,
    id,
  };
}

await persistsSourceEntitiesLibraryAndBindingsAcrossReopen();
