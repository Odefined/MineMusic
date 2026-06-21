import assert from "node:assert/strict";

import { refKey, type Ref, type Result, type StageError } from "../../src/contracts/kernel.js";
import type { MusicMaterial, SourceTrack } from "../../src/contracts/music_data_platform.js";
import type {
  LibraryCatalogBrowseOutput,
  LibraryCatalogSampleOutput,
  LibraryCatalogSummaryOutput,
  StageToolContext,
} from "../../src/contracts/stage_interface.js";
import type {
  LibraryCatalogReadPort,
  LibraryCatalogRecord,
  LibraryCatalogReadScope,
  MaterialProjection,
} from "../../src/music_data_platform/index.js";
import {
  createLibraryCatalogReadPort,
  createMaterialProjection,
  DEFAULT_OWNER_SCOPE,
  musicDataPlatformIdentitySchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import {
  createLibraryCatalogRuntimeModule,
  libraryCatalogInstrument,
  type LibraryCatalogScopeAvailabilityPort,
} from "../../src/music_data_platform/stage_adapter/index.js";
import { createLibraryCatalogServerRuntimeModule, type MusicDataPlatformRuntimeModule } from "../../src/server/index.js";
import { createStageInterface } from "../../src/stage_interface/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

const sourceLibraryRef = ref("source_library", "saved_source_track", "src_liked_recordings");
const favoritePoolRef = ref("owner_material_relation_pool", "favorite", "favorite_pool");
const favoriteAlbumPoolRef = ref("owner_material_relation_pool", "favorite", "favorite_album_pool");

const projectedMaterials = new Map<string, MusicMaterial>();
const records = [
  catalogRecord("recording", "rec_a", "2026-01-01T00:00:00.000Z", "A One", "Artist A", "Album X"),
  catalogRecord("recording", "rec_b", "2026-01-02T00:00:00.000Z", "B Two", "Artist B", "Album X"),
  catalogRecord("recording", "rec_c", "2026-01-03T00:00:00.000Z", "C Three", "Artist A", "Album Y"),
  catalogRecord("recording", "rec_d", "2026-01-04T00:00:00.000Z", "D Four", "Artist C", "Album Y"),
  catalogRecord("album", "alb_x", "2026-01-05T00:00:00.000Z", "Album X", "Artist A"),
  catalogRecord("album", "alb_y", "2026-01-06T00:00:00.000Z", "Album Y", "Artist C"),
  catalogRecord("artist", "art_a", "2026-01-07T00:00:00.000Z", "Artist A"),
  catalogRecord("artist", "art_c", "2026-01-08T00:00:00.000Z", "Artist C"),
] satisfies readonly LibraryCatalogRecord[];

const materialProjection: MaterialProjection = {
  async projectMusicMaterial(input) {
    return projectedMaterials.get(refKey(input.materialRef));
  },
  async projectMusicMaterials(input) {
    return new Map(input.materialRefs.flatMap((materialRef) => {
      const materialRefKey = refKey(materialRef);
      const material = projectedMaterials.get(materialRefKey);

      return material === undefined ? [] : [[materialRefKey, material] as const];
    }));
  },
};

const catalog: LibraryCatalogReadPort = {
  async listCatalogItems(input) {
    switch (input.scope.kind) {
      case "library":
        return records;
      case "source_library":
        assert.deepEqual(input.scope.ref, sourceLibraryRef);
        assert.equal(input.scope.materialKind, "recording");
        return [recordAt(0), recordAt(1)];
      case "relation":
        {
          const materialKind = input.scope.materialKind;
          assert.deepEqual(input.scope.ref, materialKind === "album" ? favoriteAlbumPoolRef : favoritePoolRef);
        return records.filter((record) => {
          if (materialKind === "recording") {
            return record.materialRef.id === "rec_c" || record.materialRef.id === "rec_d";
          }
          if (materialKind === "album") {
            return record.materialRef.id === "alb_x";
          }
          return false;
        });
        }
    }
  },
};

const scopeAvailability: LibraryCatalogScopeAvailabilityPort = {
  listCatalogScopes() {
    return {
      ok: true,
      value: {
        sourceLibraries: [
          {
            id: "source_scope_recordings",
            ref: sourceLibraryRef,
            providerName: "NetEase Cloud Music",
            relationName: "saved",
            targetKind: "recording",
          },
        ],
        relations: [
          {
            id: "favorite_recording_scope",
            ref: favoritePoolRef,
            relationName: "favorite",
            targetKind: "recording",
          },
          {
            id: "favorite_album_scope",
            ref: favoriteAlbumPoolRef,
            relationName: "favorite",
            targetKind: "album",
          },
        ],
      },
    };
  },
};

const runtimeModule = createLibraryCatalogRuntimeModule({
  catalog,
  materialProjection,
  scopeAvailability,
});
const initialized = await runtimeModule.initialize({});
assert.equal(initialized.ok, true);

if (initialized.ok) {
  const stageInterface = createStageInterface({
    instruments: initialized.value.instruments ?? [],
    registrations: initialized.value.tools ?? [],
  });
  const context = testStageToolContext();

  assert.deepEqual(initialized.value.instruments, [libraryCatalogInstrument]);
  assert.deepEqual(
    initialized.value.tools?.map((registration) => registration.descriptor.name),
    [
      "library.catalog.list_scopes",
      "library.catalog.browse",
      "library.catalog.sample",
      "library.catalog.summary",
    ],
  );

  const scopes = await stageInterface.dispatch(context, {
    toolName: "library.catalog.list_scopes",
    payload: {},
  });
  assert.equal(scopes.ok, true);
  if (scopes.ok) {
    assert.deepEqual(scopes.value.result, {
      scopes: [
        {
          kind: "library",
          description: {
            label: "Library",
          },
        },
        {
          kind: "source_library",
          id: "source_scope_recordings",
          description: {
            label: "NetEase Cloud Music saved recording",
            targetKind: "recording",
          },
        },
        {
          kind: "relation",
          id: "favorite_recording_scope",
          description: {
            label: "favorite recording",
            targetKind: "recording",
          },
        },
        {
          kind: "relation",
          id: "favorite_album_scope",
          description: {
            label: "favorite album",
            targetKind: "album",
          },
        },
      ],
    });
    assert.equal(JSON.stringify(scopes.value.result).includes("provider"), false);
    assert.equal(JSON.stringify(scopes.value.result).includes('"all"'), false);
  }

  const browseFirst = await stageInterface.dispatch(context, {
    toolName: "library.catalog.browse",
    payload: {
      limit: 3,
    },
  });
  assert.equal(browseFirst.ok, true);
  let nextCursor = "";
  if (browseFirst.ok) {
    const output = browseFirst.value.result as LibraryCatalogBrowseOutput;
    assert.deepEqual(labels(output.items), ["Artist C", "Artist A", "Album Y - Artist C"]);
    assert.equal(typeof output.nextCursor, "string");
    nextCursor = output.nextCursor ?? "";
  }

  const browseSecond = await stageInterface.dispatch(context, {
    toolName: "library.catalog.browse",
    payload: {
      cursor: nextCursor,
      limit: 2,
    },
  });
  assert.equal(browseSecond.ok, true);
  if (browseSecond.ok) {
    assert.deepEqual(labels((browseSecond.value.result as LibraryCatalogBrowseOutput).items), ["Album X - Artist A", "D Four - Artist C"]);
  }

  const invalidCursorPage = await stageInterface.dispatch(context, {
    toolName: "library.catalog.browse",
    payload: {
      cursor: nextCursor,
      sort: "dictionary",
    },
  });
  assert.equal(invalidCursorPage.ok, false);
  if (!invalidCursorPage.ok) {
    assert.equal(invalidCursorPage.error.code, "invalid_input");
  }

  const dictionaryBrowse = await stageInterface.dispatch(context, {
    toolName: "library.catalog.browse",
    payload: {
      sort: "dictionary",
      limit: 4,
    },
  });
  assert.equal(dictionaryBrowse.ok, true);
  if (dictionaryBrowse.ok) {
    assert.deepEqual(labels((dictionaryBrowse.value.result as LibraryCatalogBrowseOutput).items), [
      "A One - Artist A",
      "Album X - Artist A",
      "Album Y - Artist C",
      "Artist A",
    ]);
  }

  const sampleA = await stageInterface.dispatch(context, {
    toolName: "library.catalog.sample",
    payload: {
      count: 4,
      seed: "taste-seed-a",
    },
  });
  const sampleARepeat = await stageInterface.dispatch(context, {
    toolName: "library.catalog.sample",
    payload: {
      count: 4,
      seed: "taste-seed-a",
    },
  });
  const sampleB = await stageInterface.dispatch(context, {
    toolName: "library.catalog.sample",
    payload: {
      count: 4,
      seed: "taste-seed-b",
    },
  });
  assert.equal(sampleA.ok, true);
  assert.equal(sampleARepeat.ok, true);
  assert.equal(sampleB.ok, true);
  if (sampleA.ok && sampleARepeat.ok && sampleB.ok) {
    assert.deepEqual(
      labels((sampleA.value.result as LibraryCatalogSampleOutput).items),
      labels((sampleARepeat.value.result as LibraryCatalogSampleOutput).items),
    );
    assert.notDeepEqual(
      labels((sampleA.value.result as LibraryCatalogSampleOutput).items),
      labels((sampleB.value.result as LibraryCatalogSampleOutput).items),
    );
  }

  const summary = await stageInterface.dispatch(context, {
    toolName: "library.catalog.summary",
    payload: {
      sampleCount: 8,
    },
  });
  assert.equal(summary.ok, true);
  if (summary.ok) {
    const output = summary.value.result as LibraryCatalogSummaryOutput;
    assert.deepEqual(output.sampleBands.map((band) => ({
      band: band.band,
      labels: labels(band.items),
    })), [
      { band: "earliest_25", labels: ["A One - Artist A", "B Two - Artist B"] },
      { band: "25_50", labels: ["C Three - Artist A", "D Four - Artist C"] },
      { band: "50_75", labels: ["Album X - Artist A", "Album Y - Artist C"] },
      { band: "latest_25", labels: ["Artist A", "Artist C"] },
    ]);

    assert.equal(signalCount(output, "recording_artist", "Artist A"), 2);
    assert.equal(signalCount(output, "recording_album", "Album X"), 2);
    assert.equal(signalCount(output, "album_artist", "Artist A"), 1);
    assert.equal(signalCount(output, "artist_item", "Artist A"), 1);
    assert.deepEqual(output.membershipSignals?.map((signal) => ({
      kind: signal.scope.kind,
      label: signal.scope.description.label,
      count: signal.count,
      examples: labels(signal.examples),
    })), [
      {
        kind: "source_library",
        label: "NetEase Cloud Music saved recording",
        count: 2,
        examples: ["A One - Artist A", "B Two - Artist B"],
      },
      {
        kind: "relation",
        label: "favorite recording",
        count: 2,
        examples: ["C Three - Artist A", "D Four - Artist C"],
      },
      {
        kind: "relation",
        label: "favorite album",
        count: 1,
        examples: ["Album X - Artist A"],
      },
    ]);
  }

  const relationSummary = await stageInterface.dispatch(context, {
    toolName: "library.catalog.summary",
    payload: {
      scope: {
        kind: "relation",
        id: "favorite_recording_scope",
      },
      sampleCount: 4,
    },
  });
  assert.equal(relationSummary.ok, true);
  if (relationSummary.ok) {
    const output = relationSummary.value.result as LibraryCatalogSummaryOutput;
    assert.equal(output.membershipSignals, undefined);
    assert.deepEqual(
      output.sampleBands.flatMap((band) => labels(band.items)),
      ["C Three - Artist A", "D Four - Artist C"],
    );
  }

  const oneItemSummary = await stageInterface.dispatch(context, {
    toolName: "library.catalog.summary",
    payload: {
      scope: {
        kind: "relation",
        id: "favorite_album_scope",
      },
      sampleCount: 1,
    },
  });
  assert.equal(oneItemSummary.ok, true);
  if (oneItemSummary.ok) {
    assert.deepEqual(
      (oneItemSummary.value.result as LibraryCatalogSummaryOutput).sampleBands.flatMap((band) => labels(band.items)),
      ["Album X - Artist A"],
    );
  }
}

const serverModule = createLibraryCatalogServerRuntimeModule({
  musicDataPlatformModule: fakeMusicDataPlatformModule({
    catalog,
    materialProjection,
    scopeAvailability,
  }),
});
const initializedServerModule = await serverModule.initialize({});
assert.equal(initializedServerModule.ok, true);
if (initializedServerModule.ok) {
  assert.deepEqual(
    initializedServerModule.value.tools?.map((registration) => registration.descriptor.name),
    [
      "library.catalog.list_scopes",
      "library.catalog.browse",
      "library.catalog.sample",
      "library.catalog.summary",
    ],
  );
}

{
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformOwnerCatalogEntriesSchema,
      musicDataPlatformOwnerRelationSchema,
      musicDataPlatformOwnerCatalogViewSchema,
    ],
  });
  const materialRef = ref("material", "recording", "catalog_without_search_metadata");
  const source = sourceTrack("catalog_without_search_metadata", "Projection Display Song", {
    artistLabels: ["Projection Artist"],
    albumLabel: "Projection Album",
  });

  await database.transaction(async (db) => {
    const identity = createIdentityWriteCommands({
      db,
      now: "2026-06-21T01:00:00.000Z",
      projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    await identity.upsertSourceRecord({ entity: source });
    await identity.upsertMaterialRecord({ materialRef, kind: "recording" });
    await identity.bindSourceToMaterial({
      sourceRef: source.sourceRef,
      materialRef,
    });
    await db.run(
      `
        INSERT INTO owner_material_entries (
          entry_key,
          owner_scope,
          entry_kind,
          entry_ref_key,
          material_ref_key,
          visibility_role,
          active,
          provenance_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "entry_catalog_without_search_metadata",
        DEFAULT_OWNER_SCOPE,
        "source_library",
        "source_library:saved_source_track:catalog_sql_guard",
        refKey(materialRef),
        "positive",
        1,
        JSON.stringify({ lastAddedAt: "2026-06-21T00:59:00.000Z" }),
        "2026-06-21T01:00:00.000Z",
        "2026-06-21T01:00:00.000Z",
      ],
    );
  });

  const catalogRecords = await createLibraryCatalogReadPort({
    db: database.context(),
  }).listCatalogItems({
    ownerScope: DEFAULT_OWNER_SCOPE,
    scope: { kind: "library" },
  });
  assert.deepEqual(catalogRecords.map((record) => ({
    materialRefKey: record.materialRefKey,
    materialKind: record.materialKind,
    recentlyAddedAt: record.recentlyAddedAt,
  })), [
    {
      materialRefKey: refKey(materialRef),
      materialKind: "recording",
      recentlyAddedAt: "2026-06-21T00:59:00.000Z",
    },
  ]);
  assert.equal(await createMaterialProjection({
    db: database.context(),
  }).projectMusicMaterial({ materialRef }).then((material) =>
    material?.kind === "recording" ? material.title : undefined), "Projection Display Song");
  await database.close();
}

function labels(items: readonly { description: { label: string } }[]): readonly string[] {
  return items.map((item) => item.description.label);
}

function recordAt(index: number): LibraryCatalogRecord {
  const record = records[index];
  if (record === undefined) {
    throw new Error(`Test record ${index} is missing.`);
  }

  return record;
}

function signalCount(
  output: LibraryCatalogSummaryOutput,
  signalKind: string,
  label: string,
): number | undefined {
  return output.concentrationSignals.find((signal) =>
    signal.signalKind === signalKind && signal.label === label)?.count;
}

function testStageToolContext(): StageToolContext {
  const cursors = new Map<string, { internalCursor: string; queryInput: unknown }>();
  let cursorCount = 0;

  return {
    ownerScope: "local",
    sessionId: "library-catalog-test-session",
    requestId: "library-catalog-test-request",
    clock: () => "2026-06-21T00:00:00.000Z",
    handleMinting: {
      async mint(input) {
        const anchor = input.internalAnchor as { materialRef?: string };
        return `mh_${anchor.materialRef?.replaceAll(":", "_") ?? "unknown"}`;
      },
      async resolve() {
        return undefined;
      },
    },
    lookupCursors: {
      async register(input) {
        cursorCount += 1;
        const cursorId = `cursor_${cursorCount}`;
        cursors.set(cursorId, {
          internalCursor: input.internalCursor,
          queryInput: input.queryInput,
        });
        return cursorId;
      },
      async resolve(input) {
        const binding = cursors.get(input.cursorId);
        if (binding === undefined) {
          return fail({
            code: "invalid_cursor",
            message: "missing test cursor",
            area: "music_intelligence",
            retryable: true,
          });
        }
        return {
          ok: true,
          value: binding,
        };
      },
    },
    providerAvailability: {
      async isProviderAvailable() {
        throw new Error("library catalog tests must not read provider availability");
      },
    },
    executionGate: {
      async preflight() {
        return {
          decision: "allow",
          auditLevel: "none",
        };
      },
    },
  };
}

function catalogRecord(
  kind: LibraryCatalogRecord["materialKind"],
  id: string,
  recentlyAddedAt: string,
  titleText: string,
  artistText = "",
  albumText = "",
): LibraryCatalogRecord {
  const materialRef = ref("material", kind, id);
  const materialRefKey = refKey(materialRef);
  projectedMaterials.set(materialRefKey, musicMaterial({
    kind,
    materialRef,
    titleText,
    artistText,
    albumText,
  }));

  return {
    materialRef,
    materialRefKey,
    materialKind: kind,
    recentlyAddedAt,
  };
}

function musicMaterial(input: {
  kind: LibraryCatalogRecord["materialKind"];
  materialRef: Ref;
  titleText: string;
  artistText: string;
  albumText: string;
}): MusicMaterial {
  switch (input.kind) {
    case "recording":
      return {
        kind: "recording",
        materialRef: input.materialRef,
        title: input.titleText,
        artistLabels: input.artistText.length === 0 ? [] : [input.artistText],
        ...(input.albumText.length === 0 ? {} : { albumLabel: input.albumText }),
        sourceNavigationLinks: [],
        availability: "unknown",
      };
    case "album":
      return {
        kind: "album",
        materialRef: input.materialRef,
        title: input.titleText,
        ...(input.artistText.length === 0 ? {} : { artistLabels: [input.artistText] }),
        sourceNavigationLinks: [],
        availability: "unknown",
      };
    case "artist":
      return {
        kind: "artist",
        materialRef: input.materialRef,
        name: input.titleText,
        sourceNavigationLinks: [],
        availability: "unknown",
      };
  }
}

function sourceTrack(
  id: string,
  title: string,
  input: Partial<Omit<SourceTrack, "kind" | "sourceRef" | "origin" | "providerId" | "providerEntityId" | "label" | "title">> = {},
): SourceTrack {
  return {
    kind: "track",
    sourceRef: {
      namespace: "source_netease",
      kind: "track",
      id,
    },
    origin: "provider",
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
    ...input,
  };
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

function fakeMusicDataPlatformModule(input: {
  catalog: LibraryCatalogReadPort;
  materialProjection: MaterialProjection;
  scopeAvailability: LibraryCatalogScopeAvailabilityPort;
}): MusicDataPlatformRuntimeModule {
  return {
    descriptor: {
      id: "music-data-platform",
      ownerArea: "music_data_platform",
    },
    async initialize() {
      return {
        ok: true,
        value: {},
      };
    },
    sourceLibraryImport() {
      return undefined;
    },
    sourceLibraryRead() {
      return undefined;
    },
    libraryCatalog() {
      return input.catalog;
    },
    libraryImportStart() {
      return undefined;
    },
    retrievalQuery() {
      return undefined;
    },
    musicScopeAvailability() {
      return {
        async listAvailableMusicScopes(readInput) {
          const result = await input.scopeAvailability.listCatalogScopes(readInput);
          if (!result.ok) {
            return result;
          }
          return {
            ok: true,
            value: {
              sourceLibraries: result.value.sourceLibraries,
              relations: result.value.relations,
              providers: [
                {
                  providerId: "netease",
                  providerName: "NetEase Cloud Music",
                  targetKinds: ["recording", "album", "artist"],
                },
              ],
            },
          };
        },
      };
    },
    candidateCommit() {
      return undefined;
    },
    materialProjection() {
      return input.materialProjection;
    },
    libraryRelation() {
      return undefined;
    },
    handleMinting() {
      return undefined;
    },
    lookupCursorStore() {
      return undefined;
    },
    download() {
      return undefined;
    },
    localSource() {
      return undefined;
    },
    localizeProviderSource() {
      return undefined;
    },
  };
}

function fail(error: StageError): Result<never> {
  return {
    ok: false,
    error,
  };
}
