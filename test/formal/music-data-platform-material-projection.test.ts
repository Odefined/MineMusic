import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { SourceAlbum, SourceArtist, SourceEntity, SourcePreferencePolicy, SourceTrack, } from "../../src/contracts/music_data_platform.js";
import { musicDataPlatformIdentitySchema } from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createMaterialProjection, rankBoundSources } from "../../src/music_data_platform/material_projection.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
const now = "2026-06-18T00:00:00.000Z";
const database = await openUninitializedPostgresTestMusicDatabase();
await database.initialize({ schemas: [musicDataPlatformIdentitySchema] });
await database.transaction(async (db) => {
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
        providerUrl: "https://music.example/primary-recording",
        availabilityHint: "playable",
        versionInfo: {
            label: "single version",
            tags: ["explicit"],
        },
    });
    const material = materialRef("recording", "primary-recording");
    await commands.upsertSourceRecord({ entity: source });
    await commands.upsertMaterialRecord({ materialRef: material, kind: "recording" });
    await commands.bindSourceToMaterial({
        sourceRef: source.sourceRef,
        materialRef: material,
        makePrimary: true,
    });
    assert.deepEqual(await createMaterialProjection({ db }).projectMusicMaterial({ materialRef: material }), {
        kind: "recording",
        materialRef: material,
        title: "Primary Title",
        artistLabels: ["Primary Artist"],
        albumLabel: "Primary Album",
        trackPosition: {
            discNumber: "1",
            trackNumber: 7,
            trackCount: 12,
        },
        durationMs: 233000,
        sourceNavigationLinks: [{
                url: "https://music.example/primary-recording",
            }],
        availability: "playable",
        versionInfo: {
            label: "single version",
            tags: ["explicit"],
        },
    });
});
await database.transaction(async (db) => {
    const commands = createIdentityWriteCommands({
        db,
        now,
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    const providerSource = sourceTrack("policy-navigation", "Provider Title", {
        artistLabels: ["Provider Artist"],
        albumLabel: "Provider Album",
        providerUrl: "https://music.example/provider-navigation",
        availabilityHint: "restricted",
        versionInfo: {
            label: "provider version",
        },
    });
    const localSource = localSourceTrack("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Localized Title", {
        artistLabels: ["Localized Artist"],
        albumLabel: "Localized Album",
        availabilityHint: "playable",
        versionInfo: {
            label: "localized version",
        },
    });
    const material = materialRef("recording", "purpose-policy");
    const sourcePreferencePolicy: SourcePreferencePolicy = {
        defaultOrder: [
            { origin: "local_file" },
            { origin: "provider", providerId: "netease" },
        ],
        purposeOverrides: {
            source_navigation: [
                { origin: "provider", providerId: "netease" },
                { origin: "local_file" },
            ],
        },
    };
    await commands.upsertSourceRecord({ entity: providerSource });
    await commands.upsertSourceRecord({ entity: localSource });
    await commands.upsertMaterialRecord({ materialRef: material, kind: "recording" });
    await commands.bindSourceToMaterial({
        sourceRef: providerSource.sourceRef,
        materialRef: material,
        makePrimary: true,
    });
    await commands.bindSourceToMaterial({
        sourceRef: localSource.sourceRef,
        materialRef: material,
    });
    assert.deepEqual(rankBoundSources({
        sources: [providerSource, localSource],
        policy: sourcePreferencePolicy,
        purpose: "descriptive_metadata",
    }).map((source) => refKey(source.sourceRef)), [
        refKey(localSource.sourceRef),
        refKey(providerSource.sourceRef),
    ]);
    assert.deepEqual(rankBoundSources({
        sources: [providerSource, localSource],
        policy: sourcePreferencePolicy,
        purpose: "source_navigation",
    }).map((source) => refKey(source.sourceRef)), [
        refKey(providerSource.sourceRef),
        refKey(localSource.sourceRef),
    ]);
    assert.deepEqual(await createMaterialProjection({
        db,
        sourcePreferencePolicy,
    }).projectMusicMaterial({ materialRef: material }), {
        kind: "recording",
        materialRef: material,
        title: "Localized Title",
        artistLabels: ["Localized Artist"],
        albumLabel: "Localized Album",
        sourceNavigationLinks: [{
                url: "https://music.example/provider-navigation",
            }],
        availability: "playable",
        versionInfo: {
            label: "localized version",
        },
    });
});
await database.transaction(async (db) => {
    const commands = createIdentityWriteCommands({
        db,
        now,
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    const source = sourceAlbum("primary-album", "Primary Album", {
        artistLabels: ["Album Artist"],
        releaseDate: "2026-06-18",
        providerUrl: "https://music.example/primary-album",
        availabilityHint: "restricted",
        versionInfo: {
            label: "deluxe",
            tags: ["deluxe"],
        },
    });
    const material = materialRef("album", "primary-album");
    await commands.upsertSourceRecord({ entity: source });
    await commands.upsertMaterialRecord({ materialRef: material, kind: "album" });
    await commands.bindSourceToMaterial({
        sourceRef: source.sourceRef,
        materialRef: material,
        makePrimary: true,
    });
    assert.deepEqual(await createMaterialProjection({ db }).projectMusicMaterial({ materialRef: material }), {
        kind: "album",
        materialRef: material,
        title: "Primary Album",
        artistLabels: ["Album Artist"],
        releaseDate: "2026-06-18",
        sourceNavigationLinks: [{
                url: "https://music.example/primary-album",
            }],
        availability: "restricted",
        versionInfo: {
            label: "deluxe",
            tags: ["deluxe"],
        },
    });
});
await database.transaction(async (db) => {
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
    await commands.upsertSourceRecord({ entity: source });
    await commands.upsertMaterialRecord({ materialRef: material, kind: "artist" });
    await commands.bindSourceToMaterial({
        sourceRef: source.sourceRef,
        materialRef: material,
        makePrimary: true,
    });
    assert.deepEqual(await createMaterialProjection({ db }).projectMusicMaterial({ materialRef: material }), {
        kind: "artist",
        materialRef: material,
        name: "Primary Artist",
        aliases: ["P. Artist"],
        sourceNavigationLinks: [],
        availability: "unknown",
    });
});
await database.transaction(async (db) => {
    const commands = createIdentityWriteCommands({
        db,
        now,
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    const primary = sourceTrack("multi-netease", "Netease Durable Primary", {
        artistLabels: ["Netease Artist"],
        albumLabel: "Netease Album",
        providerUrl: "https://music.example/netease",
        availabilityHint: "restricted",
        versionInfo: {
            label: "netease version",
        },
    });
    const secondary = sourceTrack("multi-qq", "QQ Policy Preferred", {
        artistLabels: ["QQ Artist"],
        albumLabel: "QQ Album",
        providerUrl: "https://music.example/qq",
        availabilityHint: "playable",
        versionInfo: {
            label: "qq version",
        },
    }, "qq");
    const material = materialRef("recording", "multi-source");
    const sourcePreferencePolicy: SourcePreferencePolicy = {
        defaultOrder: [
            { origin: "provider", providerId: "qq" },
            { origin: "provider", providerId: "netease" },
        ],
    };
    await commands.upsertSourceRecord({ entity: primary });
    await commands.upsertSourceRecord({ entity: secondary });
    await commands.upsertMaterialRecord({ materialRef: material, kind: "recording" });
    await commands.bindSourceToMaterial({
        sourceRef: secondary.sourceRef,
        materialRef: material,
    });
    await commands.bindSourceToMaterial({
        sourceRef: primary.sourceRef,
        materialRef: material,
        makePrimary: true,
    });
    assert.deepEqual(rankBoundSources({
        sources: [primary, secondary],
        policy: sourcePreferencePolicy,
        purpose: "descriptive_metadata",
    }).map((source) => refKey(source.sourceRef)), [
        refKey(secondary.sourceRef),
        refKey(primary.sourceRef),
    ]);
    assert.deepEqual(await createMaterialProjection({
        db,
        sourcePreferencePolicy,
    }).projectMusicMaterial({ materialRef: material }), {
        kind: "recording",
        materialRef: material,
        title: "QQ Policy Preferred",
        artistLabels: ["QQ Artist"],
        albumLabel: "QQ Album",
        sourceNavigationLinks: [{
                url: "https://music.example/qq",
            }],
        availability: "playable",
        versionInfo: {
            label: "qq version",
        },
    });
});
await database.transaction(async (db) => {
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
    await commands.upsertSourceRecord({ entity: loserSource });
    await commands.upsertSourceRecord({ entity: winnerSource });
    await commands.upsertMaterialRecord({ materialRef: loser, kind: "recording" });
    await commands.upsertMaterialRecord({ materialRef: winner, kind: "recording" });
    await commands.bindSourceToMaterial({
        sourceRef: loserSource.sourceRef,
        materialRef: loser,
        makePrimary: true,
    });
    await commands.bindSourceToMaterial({
        sourceRef: winnerSource.sourceRef,
        materialRef: winner,
        makePrimary: true,
    });
    await commands.mergeMaterialRecord({
        loserMaterialRef: loser,
        winnerMaterialRef: winner,
    });
    assert.deepEqual(await createMaterialProjection({ db }).projectMusicMaterial({ materialRef: loser }), {
        kind: "recording",
        materialRef: winner,
        title: "Winner Source",
        artistLabels: ["Winner Artist"],
        sourceNavigationLinks: [],
        availability: "playable",
    });
});
await database.transaction(async (db) => {
    const commands = createIdentityWriteCommands({
        db,
        now,
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    const source = sourceTrack("primaryless-source", "Primaryless Source");
    const primaryless = materialRef("recording", "primaryless");
    await commands.upsertSourceRecord({ entity: source });
    await commands.upsertMaterialRecord({ materialRef: primaryless, kind: "recording" });
    await commands.bindSourceToMaterial({
        sourceRef: source.sourceRef,
        materialRef: primaryless,
    });
    assert.deepEqual(await createMaterialProjection({ db }).projectMusicMaterial({ materialRef: primaryless }), {
        kind: "recording",
        materialRef: primaryless,
        title: "Primaryless Source",
        artistLabels: [],
        sourceNavigationLinks: [],
        availability: "unknown",
    });
});
await database.transaction(async (db) => {
    assert.equal(await createMaterialProjection({ db }).projectMusicMaterial({
        materialRef: materialRef("recording", "missing"),
    }), undefined);
});
await database.close();
type ProviderSourceTrack = Extract<SourceTrack, { origin: "provider" }>;
type ProviderSourceAlbum = Extract<SourceAlbum, { origin: "provider" }>;
type ProviderSourceArtist = Extract<SourceArtist, { origin: "provider" }>;
type LocalSourceTrack = Extract<SourceTrack, { origin: "local_file" }>;
type SourceTrackOverrides = Partial<Omit<ProviderSourceTrack, "kind" | "sourceRef" | "origin" | "providerId" | "providerEntityId" | "label" | "title">>;
type SourceAlbumOverrides = Partial<Omit<ProviderSourceAlbum, "kind" | "sourceRef" | "origin" | "providerId" | "providerEntityId" | "label" | "title">>;
type SourceArtistOverrides = Partial<Omit<ProviderSourceArtist, "kind" | "sourceRef" | "origin" | "providerId" | "providerEntityId" | "label" | "name">>;
type LocalSourceTrackOverrides = Partial<Omit<LocalSourceTrack, "kind" | "sourceRef" | "origin" | "providerId" | "providerEntityId" | "filePath" | "label" | "title">>;
function sourceTrack(
    id: string,
    title: string,
    overrides: SourceTrackOverrides = {},
    providerId = "netease",
): SourceTrack {
    return {
        kind: "track",
        sourceRef: sourceRef("track", id, providerId),
        origin: "provider",
        providerId,
        providerEntityId: id,
        label: title,
        title,
        ...overrides,
    };
}
function sourceAlbum(id: string, title: string, overrides: SourceAlbumOverrides = {}): SourceAlbum {
    return {
        kind: "album",
        sourceRef: sourceRef("album", id),
        origin: "provider",
        providerId: "netease",
        providerEntityId: id,
        label: title,
        title,
        ...overrides,
    };
}
function sourceArtist(id: string, name: string, overrides: SourceArtistOverrides = {}): SourceArtist {
    return {
        kind: "artist",
        sourceRef: sourceRef("artist", id),
        origin: "provider",
        providerId: "netease",
        providerEntityId: id,
        label: name,
        name,
        ...overrides,
    };
}
function localSourceTrack(md5: string, title: string, overrides: LocalSourceTrackOverrides = {}): SourceTrack {
    return {
        kind: "track",
        sourceRef: localSourceRef("track", md5),
        origin: "local_file",
        providerEntityId: md5,
        filePath: `/tmp/minemusic/${md5}.mp3`,
        label: title,
        title,
        ...overrides,
    };
}
function sourceRef(kind: SourceEntity["kind"], id: string, providerId = "netease"): Ref {
    return {
        namespace: `source_${providerId}`,
        kind,
        id,
    };
}
function localSourceRef(kind: SourceEntity["kind"], id: string): Ref {
    return {
        namespace: "source_local",
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
