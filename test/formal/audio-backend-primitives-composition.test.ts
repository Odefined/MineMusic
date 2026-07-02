import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { SourcePreferencePolicy, SourceTrack } from "../../src/contracts/music_data_platform.js";
import {
  createCapabilityRegistry,
  sourceProviderSlot,
} from "../../src/extension/index.js";
import { getSourceProviderPlayableLinks } from "../../src/extension/source_provider_slot.js";
import {
  createLocalSourceRef,
  createPlaybackSourceResolver,
  MAIN_LOCAL_SOURCE_ROOT_ID,
  musicDataPlatformIdentitySchema,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import {
  createInMemoryLocalAudioTokenStore,
  createLocalAudioFileResolver,
} from "../../src/server/local_audio_serving.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";

const now = "2026-07-02T00:00:00.000Z";

{
  const database = await initializedDatabase();
  const material = materialRef("recording", "composition-local-first");
  const localSource = localTrack("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Local Track");
  const providerSource = providerTrack("provider-track", "Provider Track", "netease");
  await insertMaterialWithSources(database, material, [localSource, providerSource]);

  const resolved = await createPlaybackSourceResolver({
    db: database.context(),
    sourcePreferencePolicy: {
      defaultOrder: [
        { origin: "local_file" },
        { origin: "provider", providerId: "netease" },
      ],
      purposeOverrides: {
        playback: [
          { origin: "local_file" },
          { origin: "provider", providerId: "netease" },
        ],
      },
    },
  }).resolvePlaybackSources({ materialRef: material });
  const selected = resolved?.sources[0];
  assert.equal(selected?.origin, "local_file");
  assert.equal(selected === undefined ? "" : refKey(selected.sourceRef), refKey(localSource.sourceRef));

  if (selected?.origin === "local_file") {
    const tokenStore = createInMemoryLocalAudioTokenStore({
      ttlMs: 5000,
      clock: () => now,
      tokenFactory: () => "local-token",
    });
    const fileResolver = createLocalAudioFileResolver({
      resolveRootDir: (rootId) => rootId === MAIN_LOCAL_SOURCE_ROOT_ID ? "/music/root" : undefined,
    });
    const token = await tokenStore.mint({
      ownerScope: "owner-a",
      rootId: selected.rootId,
      relativePath: selected.relativePath,
    });
    assert.deepEqual(token, {
      token: "local-token",
      expiresAt: "2026-07-02T00:00:05.000Z",
    });
    assert.deepEqual(fileResolver.resolve({
      rootId: selected.rootId,
      relativePath: selected.relativePath,
    }), {
      ok: true,
      value: { absolutePath: "/music/root/tracks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp3" },
    });
  }

  await database.close();
}

{
  const database = await initializedDatabase();
  const material = materialRef("recording", "composition-provider-first");
  const localSource = localTrack("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "Local Track");
  const providerSource = providerTrack("provider-track", "Provider Track", "netease");
  await insertMaterialWithSources(database, material, [localSource, providerSource]);

  const resolved = await createPlaybackSourceResolver({
    db: database.context(),
    sourcePreferencePolicy: providerFirstPolicy(),
  }).resolvePlaybackSources({ materialRef: material });
  const selected = resolved?.sources[0];
  assert.equal(selected?.origin, "provider");
  assert.equal(selected === undefined ? "" : refKey(selected.sourceRef), refKey(providerSource.sourceRef));

  const registry = createCapabilityRegistry({ slots: [sourceProviderSlot] });
  await registry.register(sourceProviderSlot, {
    pluginId: "test.composition",
    key: "netease",
    value: {
      descriptor: { providerId: "netease", label: "NetEase", capabilities: ["playable_links"] },
      async getPlayableLinks() {
        return { ok: true, value: [{ url: "https://provider.example/play.m4a" }] };
      },
    },
  });

  if (selected?.origin === "provider") {
    assert.deepEqual(await getSourceProviderPlayableLinks(registry, {
      providerId: selected.providerId,
      sourceRef: selected.sourceRef,
    }), {
      ok: true,
      value: {
        providerId: "netease",
        sourceRef: providerSource.sourceRef,
        playableLinks: [{ url: "https://provider.example/play.m4a" }],
      },
    });
  }

  await database.close();
}

async function initializedDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({ schemas: [musicDataPlatformIdentitySchema] });
  return database;
}

async function insertMaterialWithSources(
  database: MusicDatabase,
  material: Ref,
  sources: readonly SourceTrack[],
): Promise<void> {
  await database.transaction(async (db) => {
    const commands = createIdentityWriteCommands({
      db,
      now,
      projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    await commands.upsertMaterialRecord({ materialRef: material, kind: "recording" });
    for (const source of sources) {
      await commands.upsertSourceRecord({ entity: source });
      await commands.bindSourceToMaterial({
        materialRef: material,
        sourceRef: source.sourceRef,
      });
    }
  });
}

function providerFirstPolicy(): SourcePreferencePolicy {
  return {
    defaultOrder: [
      { origin: "local_file" },
      { origin: "provider", providerId: "netease" },
    ],
    purposeOverrides: {
      playback: [
        { origin: "provider", providerId: "netease" },
        { origin: "local_file" },
      ],
    },
  };
}

function providerTrack(id: string, title: string, providerId: string): SourceTrack {
  return {
    kind: "track",
    sourceRef: {
      namespace: `source_${providerId}`,
      kind: "track",
      id,
    },
    origin: "provider",
    providerId,
    providerEntityId: id,
    label: title,
    title,
  };
}

function localTrack(contentMd5: string, title: string): SourceTrack {
  const relativePath = `tracks/${contentMd5}.mp3`;
  return {
    kind: "track",
    sourceRef: createLocalSourceRef({
      rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
      relativePath,
      kind: "track",
    }),
    origin: "local_file",
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath,
    contentMd5,
    label: title,
    title,
  };
}

function materialRef(kind: "recording" | "album" | "artist", id: string): Ref {
  return {
    namespace: "material",
    kind,
    id,
  };
}
