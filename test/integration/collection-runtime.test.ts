import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CanonicalRecord,
  Ref,
  Result,
  SourceMaterial,
  StageSession,
} from "../../src/contracts/index.js";
import { createFixtureMineMusicStageRuntime } from "../../src/stage_core/index.js";
import type {
  CompactCollectionItemOutput,
  CompactCollectionListOutput,
  CompactCollectionOutput,
  CompactPublicMaterialResolveOutput,
  CompactRecommendationPresentOutput,
} from "../../src/stage_interface/outputs/index.js";

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

const session: StageSession = {
  id: "collection-runtime-session",
  posture: "recommendation",
  activeInstruments: [],
};
const canonicalRecordingRef: Ref = {
  namespace: "minemusic",
  kind: "recording",
  id: "quiet-canonical-recording",
  label: "Quiet Canonical Recording",
};
const sourceRecordingRef: Ref = {
  namespace: "source:fixture",
  kind: "track",
  id: "quiet-canonical-recording",
};
const canonicalRecording: CanonicalRecord = {
  ref: canonicalRecordingRef,
  kind: "recording",
  label: "Quiet Canonical Recording",
  status: "active",
  sourceRefs: [sourceRecordingRef],
};
const sourceRecordingMaterial: SourceMaterial = {
  id: "fixture:track:quiet-canonical-recording",
  kind: "recording",
  label: "Quiet Canonical Recording",
  state: "grounded",
  sourceRefs: [sourceRecordingRef],
  playableLinks: [
    {
      url: "https://fixture.example/play/quiet-canonical-recording",
      sourceRef: sourceRecordingRef,
    },
  ],
};

async function createRuntime({
  sourceMaterials = [],
  canonicalRecords = [],
  collectionDatabasePath,
}: {
  sourceMaterials?: SourceMaterial[];
  canonicalRecords?: CanonicalRecord[];
  collectionDatabasePath?: string;
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-collection-runtime-"));
  const stageRuntime = createFixtureMineMusicStageRuntime({
    session,
    sourceMaterials,
    canonicalRecords,
    ...(collectionDatabasePath === undefined ? {} : { collectionDatabasePath }),
    handbookPath: join(directory, "HANDBOOK.md"),
  });
  await stageRuntime.ready;

  return {
    directory,
    stageRuntime,
  };
}

async function resolveCanonicalRecordingMaterialId(
  stageRuntime: Awaited<ReturnType<typeof createRuntime>>["stageRuntime"],
): Promise<string> {
  const cards = await assertOk(
    stageRuntime.stageInterface.tools["music.material.resolve"]({
      queries: [{
        targetKind: "recording",
        text: "Quiet Canonical Recording",
      }],
    }) as Promise<Result<CompactPublicMaterialResolveOutput>>,
  );
  const materialId = cards.items[0]?.materialId;

  assert(materialId !== undefined, "Material resolve should expose a materialId for collection writes");

  if (materialId.startsWith("emat:")) {
    const presented = await assertOk(
      stageRuntime.stageInterface.tools["stage.recommendation.present"]({
        items: [{ materialId }],
      }) as Promise<Result<CompactRecommendationPresentOutput>>,
    );
    const durableMaterialId = presented.cards[0]?.materialId;

    assert(durableMaterialId !== undefined, "Recommendation presentation should materialize a durable materialId for collection writes");
    return durableMaterialId;
  }

  return materialId;
}

async function listsDefaultOwnerSystemCollectionsThroughStageInterface(): Promise<void> {
  const { directory, stageRuntime } = await createRuntime();

  try {
    const output = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.list"]({}) as Promise<Result<CompactCollectionListOutput>>,
    );
    const savedRecordings = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.list"]({
        collectionKind: "recording",
        relationKind: "saved",
      }) as Promise<Result<CompactCollectionListOutput>>,
    );

    assert(output.collections.length === 15, "Stage Interface should list the default owner's system collections");
    assert(
      savedRecordings.collections.length === 1 &&
        savedRecordings.collections[0]?.label === "saved recordings" &&
        !("relationKind" in savedRecordings.collections[0]) &&
        !("ownerScope" in savedRecordings.collections[0]),
      "Stage Interface should expose the default saved recording system collection as compact output",
    );
    assert(output.items.length === 0, "New default owner system collections should start without items");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function blocksCanonicalRecordingAndClearsSavedFavoriteMemberships(): Promise<void> {
  const { directory, stageRuntime } = await createRuntime({
    sourceMaterials: [sourceRecordingMaterial],
    canonicalRecords: [canonicalRecording],
  });

  try {
    const materialId = await resolveCanonicalRecordingMaterialId(stageRuntime);

    await assertOk(
      stageRuntime.stageInterface.tools["music.collection.save"]({
        materialId,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CompactCollectionItemOutput>>,
    );
    await assertOk(
      stageRuntime.stageInterface.tools["music.collection.favorite"]({
        materialId,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CompactCollectionItemOutput>>,
    );
    await assertOk(
      stageRuntime.stageInterface.tools["music.collection.block"]({
        materialId,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CompactCollectionItemOutput>>,
    );

    const saved = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.list"]({
        collectionKind: "recording",
        relationKind: "saved",
      }) as Promise<Result<CompactCollectionListOutput>>,
    );
    const favorites = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.list"]({
        collectionKind: "recording",
        relationKind: "favorite",
      }) as Promise<Result<CompactCollectionListOutput>>,
    );
    const blocked = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.list"]({
        collectionKind: "recording",
        relationKind: "blocked",
      }) as Promise<Result<CompactCollectionListOutput>>,
    );

    assert(saved.items.length === 0, "Blocking a recording should remove saved system membership");
    assert(favorites.items.length === 0, "Blocking a recording should remove favorite system membership");
    assert(
      blocked.items.some((item) => item.materialId === materialId),
      "Blocking a recording should keep blocked system membership",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function managesCustomCollectionLifecycleThroughStageInterface(): Promise<void> {
  const { directory, stageRuntime } = await createRuntime({
    sourceMaterials: [sourceRecordingMaterial],
    canonicalRecords: [canonicalRecording],
  });

  try {
    const materialId = await resolveCanonicalRecordingMaterialId(stageRuntime);
    const created = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.create"]({
        collectionKind: "recording",
        label: "Night coding",
      }) as Promise<Result<CompactCollectionOutput>>,
    );
    await assertOk(
      stageRuntime.stageInterface.tools["music.collection.item.add"]({
        collectionId: created.collectionId,
        materialId,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CompactCollectionItemOutput>>,
    );
    const withItem = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.list"]({
        collectionId: created.collectionId,
      }) as Promise<Result<CompactCollectionListOutput>>,
    );
    const updated = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.update"]({
        collectionId: created.collectionId,
        label: "Late night coding",
      }) as Promise<Result<CompactCollectionOutput>>,
    );
    const removed = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.delete"]({
        collectionId: created.collectionId,
      }) as Promise<Result<CompactCollectionOutput>>,
    );
    const activeCustom = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.list"]({
        relationKind: "custom",
      }) as Promise<Result<CompactCollectionListOutput>>,
    );
    const removedCustom = await assertOk(
      stageRuntime.stageInterface.tools["music.collection.list"]({
        relationKind: "custom",
        includeRemoved: true,
      }) as Promise<Result<CompactCollectionListOutput>>,
    );

    assert(created.collectionId !== undefined, "Custom collection create should return a compact collection id");
    assert(created.label === "Night coding", "Custom collection create should return compact collection output");
    assert(
      withItem.items.some((item) => item.collectionId === created.collectionId && item.materialId === materialId),
      "Custom collection list should include the added item",
    );
    assert(updated.label === "Late night coding", "Custom collection update should change label");
    assert(removed.collectionId === created.collectionId, "Custom collection delete should return compact collection output");
    assert(
      !activeCustom.collections.some((collection) => collection.collectionId === created.collectionId),
      "Default custom collection list should hide soft-removed collections",
    );
    assert(
      removedCustom.collections.some((collection) => collection.collectionId === created.collectionId),
      "includeRemoved custom collection list should expose soft-removed collections",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function materialResolveReportsBlockedCanonicalCandidateThroughStageInterface(): Promise<void> {
  const { directory, stageRuntime } = await createRuntime({
    sourceMaterials: [sourceRecordingMaterial],
    canonicalRecords: [canonicalRecording],
  });

  try {
    const materialId = await resolveCanonicalRecordingMaterialId(stageRuntime);

    await assertOk(
      stageRuntime.stageInterface.tools["music.collection.block"]({
        materialId,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CompactCollectionItemOutput>>,
    );

    const resolveResult = await assertOk(
      stageRuntime.stageInterface.tools["music.material.resolve"]({
        queries: [{ text: "Quiet Canonical Recording", targetKind: "recording" }],
      }) as Promise<Result<CompactPublicMaterialResolveOutput>>,
    );

    assert(
      resolveResult.items[0]?.state === "blocked",
      "Blocked collection membership should mark resolved material blocked",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function persistsCollectionStateThroughStageRuntimeDatabasePath(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-collection-runtime-sqlite-"));
  const databasePath = join(directory, "collection.sqlite");

  try {
    const firstStageRuntime = createFixtureMineMusicStageRuntime({
      session,
      sourceMaterials: [sourceRecordingMaterial],
      canonicalRecords: [canonicalRecording],
      collectionDatabasePath: databasePath,
      handbookPath: join(directory, "first-HANDBOOK.md"),
    });
    await firstStageRuntime.ready;
    const materialId = await resolveCanonicalRecordingMaterialId(firstStageRuntime);

    const created = await assertOk(
      firstStageRuntime.stageInterface.tools["music.collection.create"]({
        collectionKind: "recording",
        label: "Persistent coding",
      }) as Promise<Result<CompactCollectionOutput>>,
    );
    await assertOk(
      firstStageRuntime.stageInterface.tools["music.collection.item.add"]({
        collectionId: created.collectionId,
        materialId,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CompactCollectionItemOutput>>,
    );

    const recreatedStageRuntime = createFixtureMineMusicStageRuntime({
      session,
      sourceMaterials: [],
      collectionDatabasePath: databasePath,
      handbookPath: join(directory, "second-HANDBOOK.md"),
    });
    await recreatedStageRuntime.ready;

    const persisted = await assertOk(
      recreatedStageRuntime.stageInterface.tools["music.collection.list"]({
        relationKind: "custom",
      }) as Promise<Result<CompactCollectionListOutput>>,
    );

    assert(
      persisted.collections.some((collection) => collection.collectionId === created.collectionId),
      "recreated Stage Runtime should read persisted custom collections",
    );
    assert(
      persisted.items.some((item) => item.collectionId === created.collectionId),
      "recreated Stage Runtime should read persisted collection items",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

await listsDefaultOwnerSystemCollectionsThroughStageInterface();
await blocksCanonicalRecordingAndClearsSavedFavoriteMemberships();
await managesCustomCollectionLifecycleThroughStageInterface();
await materialResolveReportsBlockedCanonicalCandidateThroughStageInterface();
await persistsCollectionStateThroughStageRuntimeDatabasePath();
