import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CanonicalRecord,
  Collection,
  CollectionItem,
  MaterialResolveResult,
  MusicMaterial,
  Ref,
  Result,
  StageSession,
} from "../../src/contracts/index.js";
import { createMineMusicStageCore } from "../../src/stage_core/index.js";

type CollectionListOutput = {
  collections: Collection[];
  items: CollectionItem[];
};

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
  activeInstruments: ["minemusic.mvp"],
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
  externalKeys: [sourceRecordingRef],
};
const sourceRecordingMaterial: MusicMaterial = {
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
}: {
  sourceMaterials?: MusicMaterial[];
  canonicalRecords?: CanonicalRecord[];
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-collection-runtime-"));
  const stageCore = createMineMusicStageCore({
    session,
    sourceMaterials,
    canonicalRecords,
    handbookPath: join(directory, "HANDBOOK.md"),
  });
  await stageCore.ready;

  return {
    directory,
    stageCore,
  };
}

async function listsDefaultOwnerSystemCollectionsThroughStageInterface(): Promise<void> {
  const { directory, stageCore } = await createRuntime();

  try {
    const output = await assertOk(
      stageCore.stageInterface.tools["music.collection.list"]({}) as Promise<Result<CollectionListOutput>>,
    );

    assert(output.collections.length === 15, "Stage Interface should list the default owner's system collections");
    assert(
      output.collections.some(
        (collection) =>
          collection.ownerScope === "local_profile:default" &&
          collection.relationKind === "saved" &&
          collection.collectionKind === "recording",
      ),
      "Stage Interface should expose the default saved recording system collection",
    );
    assert(output.items.length === 0, "New default owner system collections should start without items");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function blocksCanonicalRecordingAndClearsSavedFavoriteMemberships(): Promise<void> {
  const { directory, stageCore } = await createRuntime();

  try {
    await assertOk(
      stageCore.stageInterface.tools["music.collection.save"]({
        canonicalRef: canonicalRecordingRef,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CollectionItem>>,
    );
    await assertOk(
      stageCore.stageInterface.tools["music.collection.favorite"]({
        canonicalRef: canonicalRecordingRef,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CollectionItem>>,
    );
    await assertOk(
      stageCore.stageInterface.tools["music.collection.block"]({
        canonicalRef: canonicalRecordingRef,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CollectionItem>>,
    );

    const saved = await assertOk(
      stageCore.stageInterface.tools["music.collection.list"]({
        collectionKind: "recording",
        relationKind: "saved",
      }) as Promise<Result<CollectionListOutput>>,
    );
    const favorites = await assertOk(
      stageCore.stageInterface.tools["music.collection.list"]({
        collectionKind: "recording",
        relationKind: "favorite",
      }) as Promise<Result<CollectionListOutput>>,
    );
    const blocked = await assertOk(
      stageCore.stageInterface.tools["music.collection.list"]({
        collectionKind: "recording",
        relationKind: "blocked",
      }) as Promise<Result<CollectionListOutput>>,
    );

    assert(saved.items.length === 0, "Blocking a recording should remove saved system membership");
    assert(favorites.items.length === 0, "Blocking a recording should remove favorite system membership");
    assert(
      blocked.items.some((item) => item.canonicalRef.id === canonicalRecordingRef.id),
      "Blocking a recording should keep blocked system membership",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function managesCustomCollectionLifecycleThroughStageInterface(): Promise<void> {
  const { directory, stageCore } = await createRuntime();

  try {
    const created = await assertOk(
      stageCore.stageInterface.tools["music.collection.create"]({
        collectionKind: "recording",
        label: "Night coding",
      }) as Promise<Result<Collection>>,
    );
    await assertOk(
      stageCore.stageInterface.tools["music.collection.item.add"]({
        collectionId: created.id,
        canonicalRef: canonicalRecordingRef,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CollectionItem>>,
    );
    const withItem = await assertOk(
      stageCore.stageInterface.tools["music.collection.list"]({
        collectionId: created.id,
      }) as Promise<Result<CollectionListOutput>>,
    );
    const updated = await assertOk(
      stageCore.stageInterface.tools["music.collection.update"]({
        collectionId: created.id,
        label: "Late night coding",
      }) as Promise<Result<Collection>>,
    );
    const removed = await assertOk(
      stageCore.stageInterface.tools["music.collection.delete"]({
        collectionId: created.id,
      }) as Promise<Result<Collection>>,
    );
    const activeCustom = await assertOk(
      stageCore.stageInterface.tools["music.collection.list"]({
        relationKind: "custom",
      }) as Promise<Result<CollectionListOutput>>,
    );
    const removedCustom = await assertOk(
      stageCore.stageInterface.tools["music.collection.list"]({
        relationKind: "custom",
        includeRemoved: true,
      }) as Promise<Result<CollectionListOutput>>,
    );

    assert(created.ownerScope === "local_profile:default", "Custom collection create should default owner scope");
    assert(created.relationKind === "custom", "Custom collection create should use custom relation kind");
    assert(
      withItem.items.some((item) => item.collectionId === created.id && item.canonicalRef.id === canonicalRecordingRef.id),
      "Custom collection list should include the added item",
    );
    assert(updated.label === "Late night coding", "Custom collection update should change label");
    assert(removed.removedAt !== undefined, "Custom collection delete should soft-remove the collection");
    assert(
      !activeCustom.collections.some((collection) => collection.id === created.id),
      "Default custom collection list should hide soft-removed collections",
    );
    assert(
      removedCustom.collections.some((collection) => collection.id === created.id && collection.removedAt !== undefined),
      "includeRemoved custom collection list should expose soft-removed collections",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function materialResolveReportsBlockedCanonicalCandidateThroughStageInterface(): Promise<void> {
  const { directory, stageCore } = await createRuntime({
    sourceMaterials: [sourceRecordingMaterial],
    canonicalRecords: [canonicalRecording],
  });

  try {
    await assertOk(
      stageCore.stageInterface.tools["music.collection.block"]({
        canonicalRef: canonicalRecordingRef,
        label: "Quiet Canonical Recording",
      }) as Promise<Result<CollectionItem>>,
    );

    const resolveResult = await assertOk(
      stageCore.stageInterface.tools["music.material.resolve"]({
        kind: "single",
        candidate: {
          id: "quiet-canonical-recording",
          label: "Quiet Canonical Recording",
          canonicalRef: canonicalRecordingRef,
        },
      }) as Promise<Result<MaterialResolveResult>>,
    );

    assert(resolveResult.kind === "single", "Material Resolve should return a single result");
    assert(resolveResult.result.status === "blocked", "Blocked collection membership should mark resolve result blocked");
    assert(
      resolveResult.result.materials[0]?.state === "blocked",
      "Blocked collection membership should mark resolved material blocked",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

await listsDefaultOwnerSystemCollectionsThroughStageInterface();
await blocksCanonicalRecordingAndClearsSavedFavoriteMemberships();
await managesCustomCollectionLifecycleThroughStageInterface();
await materialResolveReportsBlockedCanonicalCandidateThroughStageInterface();
