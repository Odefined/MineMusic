import assert from "node:assert/strict";

import type { Ref } from "../../src/contracts/kernel.js";
import type {
  SourceAlbum,
  SourceArtist,
  SourceEntity,
  SourceTrack,
} from "../../src/contracts/music_data_platform.js";
import { musicDataPlatformIdentitySchema } from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createMaterialProjection } from "../../src/music_data_platform/material_projection.js";
import { SqliteMusicDatabase } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

const now = "2026-06-18T00:00:00.000Z";

const database = SqliteMusicDatabase.open({ filename: ":memory:" });
database.initialize({ schemas: [musicDataPlatformIdentitySchema] });

database.transaction((db) => {
  const commands = createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
  const source = sourceTrack("primary-recording", "Primary Title", {
    artistLabels: ["Primary Artist"],
    albumLabel: "Primary Album",
    trackPosition: {
      discNumber: "1",
      trackNumber: 7,
      trackCount: 12,
    },
    durationMs: 233000,
    links: [{
      url: "https://music.example/primary-recording",
      label: "Play Primary",
      requiresAccount: true,
    }],
    availabilityHint: "playable",
    versionInfo: {
      label: "single version",
      tags: ["explicit"],
    },
  });
  const material = materialRef("recording", "primary-recording");

  commands.upsertSourceRecord({ entity: source });
  commands.upsertMaterialRecord({ materialRef: material, kind: "recording" });
  commands.bindSourceToMaterial({
    sourceRef: source.sourceRef,
    materialRef: material,
    makePrimary: true,
  });

  assert.deepEqual(
    createMaterialProjection({ db }).projectMusicMaterial({ materialRef: material }),
    {
      kind: "recording",
      materialRef: material,
      primarySourceRef: source.sourceRef,
      title: "Primary Title",
      artistLabels: ["Primary Artist"],
      albumLabel: "Primary Album",
      trackPosition: {
        discNumber: "1",
        trackNumber: 7,
        trackCount: 12,
      },
      durationMs: 233000,
      playableLinks: [{
        url: "https://music.example/primary-recording",
        label: "Play Primary",
        requiresAccount: true,
      }],
      availability: "playable",
      versionInfo: {
        label: "single version",
        tags: ["explicit"],
      },
    },
  );
});

database.transaction((db) => {
  const commands = createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
  const source = sourceAlbum("primary-album", "Primary Album", {
    artistLabels: ["Album Artist"],
    releaseDate: "2026-06-18",
    links: [{
      url: "https://music.example/primary-album",
      label: "Open Album",
    }],
    availabilityHint: "restricted",
    versionInfo: {
      label: "deluxe",
      tags: ["deluxe"],
    },
  });
  const material = materialRef("album", "primary-album");

  commands.upsertSourceRecord({ entity: source });
  commands.upsertMaterialRecord({ materialRef: material, kind: "album" });
  commands.bindSourceToMaterial({
    sourceRef: source.sourceRef,
    materialRef: material,
    makePrimary: true,
  });

  assert.deepEqual(
    createMaterialProjection({ db }).projectMusicMaterial({ materialRef: material }),
    {
      kind: "album",
      materialRef: material,
      primarySourceRef: source.sourceRef,
      title: "Primary Album",
      artistLabels: ["Album Artist"],
      releaseDate: "2026-06-18",
      playableLinks: [{
        url: "https://music.example/primary-album",
        label: "Open Album",
      }],
      availability: "restricted",
      versionInfo: {
        label: "deluxe",
        tags: ["deluxe"],
      },
    },
  );
});

database.transaction((db) => {
  const commands = createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
  const source = sourceArtist("primary-artist", "Primary Artist", {
    aliases: ["P. Artist"],
    availabilityHint: "unknown",
  });
  const material = materialRef("artist", "primary-artist");

  commands.upsertSourceRecord({ entity: source });
  commands.upsertMaterialRecord({ materialRef: material, kind: "artist" });
  commands.bindSourceToMaterial({
    sourceRef: source.sourceRef,
    materialRef: material,
    makePrimary: true,
  });

  assert.deepEqual(
    createMaterialProjection({ db }).projectMusicMaterial({ materialRef: material }),
    {
      kind: "artist",
      materialRef: material,
      primarySourceRef: source.sourceRef,
      name: "Primary Artist",
      aliases: ["P. Artist"],
      playableLinks: [],
      availability: "unknown",
    },
  );
});

database.transaction((db) => {
  const commands = createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
  const primary = sourceTrack("multi-primary", "Primary Wins", {
    artistLabels: ["Primary Artist"],
    albumLabel: "Primary Album",
    links: [{
      url: "https://music.example/primary",
      label: "Primary Link",
    }],
    availabilityHint: "restricted",
    versionInfo: {
      label: "primary version",
    },
  });
  const secondary = sourceTrack("multi-secondary", "Secondary Ignored", {
    artistLabels: ["Secondary Artist"],
    albumLabel: "Secondary Album",
    links: [{
      url: "https://music.example/secondary",
      label: "Secondary Link",
    }],
    availabilityHint: "playable",
    versionInfo: {
      label: "secondary version",
    },
  });
  const material = materialRef("recording", "multi-source");

  commands.upsertSourceRecord({ entity: primary });
  commands.upsertSourceRecord({ entity: secondary });
  commands.upsertMaterialRecord({ materialRef: material, kind: "recording" });
  commands.bindSourceToMaterial({
    sourceRef: secondary.sourceRef,
    materialRef: material,
  });
  commands.bindSourceToMaterial({
    sourceRef: primary.sourceRef,
    materialRef: material,
    makePrimary: true,
  });

  assert.deepEqual(
    createMaterialProjection({ db }).projectMusicMaterial({ materialRef: material }),
    {
      kind: "recording",
      materialRef: material,
      primarySourceRef: primary.sourceRef,
      title: "Primary Wins",
      artistLabels: ["Primary Artist"],
      albumLabel: "Primary Album",
      playableLinks: [{
        url: "https://music.example/primary",
        label: "Primary Link",
      }],
      availability: "restricted",
      versionInfo: {
        label: "primary version",
      },
    },
  );
});

database.transaction((db) => {
  const commands = createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
  const loserSource = sourceTrack("merged-loser-source", "Loser Source");
  const winnerSource = sourceTrack("merged-winner-source", "Winner Source", {
    artistLabels: ["Winner Artist"],
    availabilityHint: "playable",
  });
  const loser = materialRef("recording", "merged-loser");
  const winner = materialRef("recording", "merged-winner");

  commands.upsertSourceRecord({ entity: loserSource });
  commands.upsertSourceRecord({ entity: winnerSource });
  commands.upsertMaterialRecord({ materialRef: loser, kind: "recording" });
  commands.upsertMaterialRecord({ materialRef: winner, kind: "recording" });
  commands.bindSourceToMaterial({
    sourceRef: loserSource.sourceRef,
    materialRef: loser,
    makePrimary: true,
  });
  commands.bindSourceToMaterial({
    sourceRef: winnerSource.sourceRef,
    materialRef: winner,
    makePrimary: true,
  });
  commands.mergeMaterialRecord({
    loserMaterialRef: loser,
    winnerMaterialRef: winner,
  });

  assert.deepEqual(
    createMaterialProjection({ db }).projectMusicMaterial({ materialRef: loser }),
    {
      kind: "recording",
      materialRef: winner,
      primarySourceRef: winnerSource.sourceRef,
      title: "Winner Source",
      artistLabels: ["Winner Artist"],
      playableLinks: [],
      availability: "playable",
    },
  );
});

database.transaction((db) => {
  const commands = createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
  const source = sourceTrack("primaryless-source", "Primaryless Source");
  const primaryless = materialRef("recording", "primaryless");

  commands.upsertSourceRecord({ entity: source });
  commands.upsertMaterialRecord({ materialRef: primaryless, kind: "recording" });
  commands.bindSourceToMaterial({
    sourceRef: source.sourceRef,
    materialRef: primaryless,
  });

  assert.equal(
    createMaterialProjection({ db }).projectMusicMaterial({ materialRef: primaryless }),
    undefined,
  );
});

database.transaction((db) => {
  assert.equal(
    createMaterialProjection({ db }).projectMusicMaterial({
      materialRef: materialRef("recording", "missing"),
    }),
    undefined,
  );
});

database.close();

type SourceTrackOverrides = Partial<Omit<SourceTrack, "kind" | "sourceRef" | "providerId" | "providerEntityId" | "label" | "title">>;
type SourceAlbumOverrides = Partial<Omit<SourceAlbum, "kind" | "sourceRef" | "providerId" | "providerEntityId" | "label" | "title">>;
type SourceArtistOverrides = Partial<Omit<SourceArtist, "kind" | "sourceRef" | "providerId" | "providerEntityId" | "label" | "name">>;

function sourceTrack(
  id: string,
  title: string,
  overrides: SourceTrackOverrides = {},
): SourceTrack {
  return {
    kind: "track",
    sourceRef: sourceRef("track", id),
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
    ...overrides,
  };
}

function sourceAlbum(
  id: string,
  title: string,
  overrides: SourceAlbumOverrides = {},
): SourceAlbum {
  return {
    kind: "album",
    sourceRef: sourceRef("album", id),
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
    ...overrides,
  };
}

function sourceArtist(
  id: string,
  name: string,
  overrides: SourceArtistOverrides = {},
): SourceArtist {
  return {
    kind: "artist",
    sourceRef: sourceRef("artist", id),
    providerId: "netease",
    providerEntityId: id,
    label: name,
    name,
    ...overrides,
  };
}

function sourceRef(kind: SourceEntity["kind"], id: string): Ref {
  return {
    namespace: "source_netease",
    kind,
    id,
  };
}

function materialRef(kind: "recording" | "album" | "artist", id: string): Ref {
  return {
    namespace: "material",
    kind,
    id,
  };
}
