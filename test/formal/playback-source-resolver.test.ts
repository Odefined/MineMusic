import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { SourceEntity, SourcePreferencePolicy, SourceTrack } from "../../src/contracts/music_data_platform.js";
import {
  createLocalSourceRef,
  createPlaybackSourceResolver,
  MAIN_LOCAL_SOURCE_ROOT_ID,
  musicDataPlatformIdentitySchema,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";

const now = "2026-07-02T00:00:00.000Z";

{
  const database = await initializedDatabase();
  await database.transaction(async (db) => {
    const commands = createIdentityWriteCommands({
      db,
      now,
      projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    const neteaseSource = providerTrack("netease-source", "NetEase Track", "netease");
    const qqSource = providerTrack("qq-source", "QQ Track", "qq");
    const localSource = localTrack("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Local Track");
    const material = materialRef("recording", "playback-policy");
    const sourcePreferencePolicy: SourcePreferencePolicy = {
      defaultOrder: [
        { origin: "local_file" },
        { origin: "provider", providerId: "netease" },
        { origin: "provider", providerId: "qq" },
      ],
      purposeOverrides: {
        playback: [
          { origin: "provider", providerId: "qq" },
          { origin: "local_file" },
          { origin: "provider", providerId: "netease" },
        ],
      },
    };

    await commands.upsertMaterialRecord({ materialRef: material, kind: "recording" });
    for (const source of [neteaseSource, qqSource, localSource]) {
      await commands.upsertSourceRecord({ entity: source });
      await commands.bindSourceToMaterial({
        sourceRef: source.sourceRef,
        materialRef: material,
      });
    }

    const resolved = await createPlaybackSourceResolver({
      db,
      sourcePreferencePolicy,
    }).resolvePlaybackSources({ materialRef: material });

    assert.notEqual(resolved, undefined);
    assert.deepEqual(resolved === undefined ? [] : resolved.sources.map((source) => refKey(source.sourceRef)), [
      refKey(qqSource.sourceRef),
      refKey(localSource.sourceRef),
      refKey(neteaseSource.sourceRef),
    ]);
    assert.deepEqual(resolved?.requestedMaterialRef, material);
    assert.deepEqual(resolved?.materialRef, material);
  });
  await database.close();
}

{
  const database = await initializedDatabase();
  await database.transaction(async (db) => {
    const commands = createIdentityWriteCommands({
      db,
      now,
      projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    const loserSource = providerTrack("loser-source", "Loser", "netease");
    const winnerSource = providerTrack("winner-source", "Winner", "qq");
    const loser = materialRef("recording", "loser");
    const winner = materialRef("recording", "winner");

    await commands.upsertSourceRecord({ entity: loserSource });
    await commands.upsertSourceRecord({ entity: winnerSource });
    await commands.upsertMaterialRecord({ materialRef: loser, kind: "recording" });
    await commands.upsertMaterialRecord({ materialRef: winner, kind: "recording" });
    await commands.bindSourceToMaterial({ sourceRef: loserSource.sourceRef, materialRef: loser });
    await commands.bindSourceToMaterial({ sourceRef: winnerSource.sourceRef, materialRef: winner });
    await commands.mergeMaterialRecord({
      loserMaterialRef: loser,
      winnerMaterialRef: winner,
    });

    const resolved = await createPlaybackSourceResolver({
      db,
    }).resolvePlaybackSources({ materialRef: loser });

    assert.deepEqual(resolved?.requestedMaterialRef, loser);
    assert.deepEqual(resolved?.materialRef, winner);
    assert.deepEqual(resolved?.sources.map((source) => refKey(source.sourceRef)), [
      refKey(loserSource.sourceRef),
      refKey(winnerSource.sourceRef),
    ]);
  });
  await database.close();
}

{
  const database = await initializedDatabase();
  assert.equal(await createPlaybackSourceResolver({
    db: database.context(),
  }).resolvePlaybackSources({
    materialRef: materialRef("recording", "missing"),
  }), undefined);
  await database.close();
}

async function initializedDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({ schemas: [musicDataPlatformIdentitySchema] });
  return database;
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
