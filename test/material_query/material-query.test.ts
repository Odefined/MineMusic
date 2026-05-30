import type {
  MaterialStorePort,
  SourceGroundingPort,
} from "../../src/ports/index.js";
import type {
  Ref,
  Result,
  SourceReleaseTracklistItem,
  SourceMaterial,
} from "../../src/contracts/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material_store/index.js";
import { createMaterialQueryService } from "../../src/material_query/index.js";
import { createMaterialResolveService } from "../../src/material_resolve/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemorySourceEntityStoreRepository,
} from "../../src/storage/index.js";

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

async function querySavedTracksReturnsOnlySavedTrackMaterials(): Promise<void> {
  const savedSourceRef = ref("source:fixture", "track", "saved-track");
  const outsideSourceRef = ref("source:fixture", "track", "outside-track");
  const { materialStore, sourceGrounding } = createMaterialQueryHarness([
    sourceMaterial("Saved Track", savedSourceRef),
    sourceMaterial("Outside Track", outsideSourceRef),
  ]);
  await putLibraryTrack(materialStore, savedSourceRef, "Saved Track");

  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({
      materialStore,
      sourceGrounding,
    }),
  });
  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "saved track query should not return pool-external materials");
  assert(output.items[0]?.title === "Saved Track", "saved track query should return the saved track card");
}

async function querySavedAlbumsExpandedToTracksReturnsRecordingCards(): Promise<void> {
  const releaseRef = ref("source:fixture", "release", "saved-release");
  const firstTrackRef = ref("source:fixture", "track", "album-track-1");
  const secondTrackRef = ref("source:fixture", "track", "album-track-2");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Album Track One", firstTrackRef),
    sourceMaterial("Album Track Two", secondTrackRef),
  ]);
  await putLibraryRelease(materialStore, releaseRef, "Saved Album", [
    { sourceRef: firstTrackRef, title: "Album Track One" },
    { sourceRef: secondTrackRef, title: "Album Track Two" },
  ]);

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_albums"], expand: "tracks" },
      limit: 10,
    }),
  );

  assert(output.items.length === 2, "expanded saved albums should return track cards");
  assert(output.items.every((item) => item.status === "playable_unverified"), "expanded album tracks should resolve as recording cards");
  assert(
    output.items.map((item) => item.title).join(",") === "Album Track One,Album Track Two",
    "expanded album query should preserve release tracklist order",
  );
}

async function explicitPoolDoesNotFallbackOutsidePool(): Promise<void> {
  const outsideSourceRef = ref("source:fixture", "track", "outside-track");
  const { materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Outside Track", outsideSourceRef),
  ]);

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      limit: 10,
    }),
  );

  assert(output.items.length === 0, "explicit source-library pool should not fallback to provider search results");
}

async function relationExclusionsRemoveBlockedWrongVersionAndNotPlayable(): Promise<void> {
  const blockedRef = ref("source:fixture", "track", "blocked-track");
  const wrongVersionRef = ref("source:fixture", "track", "wrong-version-track");
  const notPlayableRef = ref("source:fixture", "track", "not-playable-track");
  const keptRef = ref("source:fixture", "track", "kept-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Blocked Track", blockedRef),
    sourceMaterial("Wrong Version Track", wrongVersionRef),
    sourceMaterial("Not Playable Track", notPlayableRef),
    sourceMaterial("Kept Track", keptRef),
  ]);
  await putLibraryTrack(materialStore, blockedRef, "Blocked Track");
  await putLibraryTrack(materialStore, wrongVersionRef, "Wrong Version Track");
  await putLibraryTrack(materialStore, notPlayableRef, "Not Playable Track");
  await putLibraryTrack(materialStore, keptRef, "Kept Track");
  await putRelationForSource(materialStore, "blocked-relation", blockedRef, "blocked");
  await putRelationForSource(materialStore, "wrong-version-relation", wrongVersionRef, "wrong_version");
  await putRelationForSource(materialStore, "not-playable-relation", notPlayableRef, "not_playable");

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      exclude: { relations: ["blocked", "wrong_version", "not_playable"] },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "relation exclusions should remove active negative relation materials");
  assert(output.items[0]?.title === "Kept Track", "relation exclusions should keep unrelated material");
}

async function recentRecommendedHardExcludeWorks(): Promise<void> {
  const recentRef = ref("source:fixture", "track", "recent-track");
  const keptRef = ref("source:fixture", "track", "not-recent-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    sourceMaterial("Recent Track", recentRef),
    sourceMaterial("Not Recent Track", keptRef),
  ]);
  await putLibraryTrack(materialStore, recentRef, "Recent Track");
  await putLibraryTrack(materialStore, keptRef, "Not Recent Track");
  const recentRecord = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef: recentRef, kind: "recording" }));
  await assertOk(
    materialStore.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: recentRecord.materialRef,
        lastRecommendedAt: "2026-05-30T01:00:00.000Z",
        recommendedCountSession: 1,
        updatedAt: "2026-05-30T01:00:00.000Z",
      },
    }),
  );

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      exclude: { recent: { recommended: "session", mode: "hard" } },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "recent recommended hard exclude should remove session-recommended material");
  assert(output.items[0]?.title === "Not Recent Track", "recent recommended hard exclude should keep not-recent material");
}

async function recentOpenedAndPlayedHardExcludeWorksByWindow(): Promise<void> {
  const openedRef = ref("source:fixture", "track", "opened-track");
  const playedRef = ref("source:fixture", "track", "played-track");
  const keptRef = ref("source:fixture", "track", "old-track");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness(
    [
      sourceMaterial("Opened Track", openedRef),
      sourceMaterial("Played Track", playedRef),
      sourceMaterial("Old Track", keptRef),
    ],
    { clock: () => "2026-05-30T02:00:00.000Z" },
  );
  await putLibraryTrack(materialStore, openedRef, "Opened Track");
  await putLibraryTrack(materialStore, playedRef, "Played Track");
  await putLibraryTrack(materialStore, keptRef, "Old Track");
  await putActivityForSource(materialStore, openedRef, { lastOpenedAt: "2026-05-30T01:30:00.000Z", openedCountSession: 1 });
  await putActivityForSource(materialStore, playedRef, { lastPlayedAt: "2026-05-30T01:45:00.000Z", playedCountSession: 1 });
  await putActivityForSource(materialStore, keptRef, { lastOpenedAt: "2026-05-29T01:30:00.000Z", openedCountSession: 1 });

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      exclude: { recent: { opened: "1h", played: "1h", mode: "hard" } },
      limit: 10,
    }),
  );

  assert(output.items.length === 1, "recent opened/played hard exclude should honor the requested window");
  assert(output.items[0]?.title === "Old Track", "recent opened/played hard exclude should keep older material");
}

async function compactCardsDoNotExposeRawMaterialInternals(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "compact-track");
  const canonicalRef = ref("minemusic", "recording", "compact-canonical");
  const { materialStore, materialQuery } = createMaterialQueryServiceHarness([
    {
      ...sourceMaterial("Compact Track", sourceRef),
      canonicalRef,
      evidence: [{ kind: "source", source: sourceRef, note: "raw evidence" }],
    },
  ]);
  await putLibraryTrack(materialStore, sourceRef, "Compact Track");

  const output = await assertOk(
    materialQuery.query({
      ownerScope: "local_profile:default",
      pool: { kind: "source_library", areas: ["saved_tracks"] },
      limit: 1,
    }),
  );
  const card = output.items[0] as unknown as Record<string, unknown>;

  assert(typeof card.ref === "string" && card.ref.startsWith("mat_"), "compact card should expose only an opaque material ref");
  assert(!("canonicalRef" in card), "compact card should not expose canonicalRef");
  assert(!("sourceRefs" in card), "compact card should not expose sourceRefs");
  assert(!("evidence" in card), "compact card should not expose raw evidence");
  assert(!("providerAccountId" in card), "compact card should not expose provider account data");
  assert(!("tracklist" in card), "compact card should not expose raw tracklists");
}

function createMaterialQueryHarness(sourceMaterials: SourceMaterial[]): {
  materialStore: MaterialStorePort;
  sourceGrounding: SourceGroundingPort;
} {
  let nextMaterialId = 1;
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => `query-material-${nextMaterialId++}`,
      now: () => "2026-05-30T00:00:00.000Z",
    }),
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const sourceGrounding: SourceGroundingPort = {
    ground: async ({ query }) => ({
      ok: true,
      value: structuredClone(
        query.sourceRef === undefined
          ? sourceMaterials
          : sourceMaterials.filter((material) =>
              (material.sourceRefs ?? []).some((sourceRef) => sameRef(sourceRef, query.sourceRef as Ref)),
            ),
      ),
    }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };

  return { materialStore, sourceGrounding };
}

function createMaterialQueryServiceHarness(
  sourceMaterials: SourceMaterial[],
  options: { clock?: () => string } = {},
) {
  const { materialStore, sourceGrounding } = createMaterialQueryHarness(sourceMaterials);
  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({
      materialStore,
      sourceGrounding,
    }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });

  return { materialStore, sourceGrounding, materialQuery };
}

async function putLibraryTrack(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  label: string,
): Promise<void> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "track",
        label,
        title: label,
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
  await assertOk(
    materialStore.putSourceLibraryItem({
      item: {
        id: `item-${sourceRef.id}`,
        ownerScope: "local_profile:default",
        providerId: "fixture",
        providerAccountId: "fixture-account",
        sourceRef,
        sourceKind: "track",
        libraryKind: "saved_source_track",
        label,
        lastSeenAt: "2026-05-30T00:00:00.000Z",
        status: "present",
      },
    }),
  );
}

async function putLibraryRelease(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  label: string,
  tracklist: SourceReleaseTracklistItem[],
): Promise<void> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "release",
        label,
        title: label,
        tracklist,
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
  await assertOk(
    materialStore.putSourceLibraryItem({
      item: {
        id: `item-${sourceRef.id}`,
        ownerScope: "local_profile:default",
        providerId: "fixture",
        providerAccountId: "fixture-account",
        sourceRef,
        sourceKind: "release",
        libraryKind: "saved_source_release",
        label,
        lastSeenAt: "2026-05-30T00:00:00.000Z",
        status: "present",
      },
    }),
  );
}

async function putRelationForSource(
  materialStore: MaterialStorePort,
  id: string,
  sourceRef: Ref,
  relationKind: "blocked" | "wrong_version" | "not_playable",
): Promise<void> {
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));

  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id,
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        relationKind,
        scope: { level: "source", sourceRef },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
}

async function putActivityForSource(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  activity: {
    lastOpenedAt?: string;
    openedCountSession?: number;
    lastPlayedAt?: string;
    playedCountSession?: number;
  },
): Promise<void> {
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));

  await assertOk(
    materialStore.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        ...activity,
        updatedAt: activity.lastOpenedAt ?? activity.lastPlayedAt ?? "2026-05-30T00:00:00.000Z",
      },
    }),
  );
}

function sourceMaterial(label: string, sourceRef: Ref): SourceMaterial {
  return {
    id: sourceRef.id,
    kind: "recording",
    label,
    state: "source_only_playable",
    sourceRefs: [sourceRef],
    playableLinks: [
      {
        url: `https://example.test/${sourceRef.id}`,
        sourceRef,
      },
    ],
  };
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

await querySavedTracksReturnsOnlySavedTrackMaterials();
await querySavedAlbumsExpandedToTracksReturnsRecordingCards();
await explicitPoolDoesNotFallbackOutsidePool();
await relationExclusionsRemoveBlockedWrongVersionAndNotPlayable();
await recentRecommendedHardExcludeWorks();
await recentOpenedAndPlayedHardExcludeWorksByWindow();
await compactCardsDoNotExposeRawMaterialInternals();
