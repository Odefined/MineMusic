import assert from "node:assert/strict";
import type { PlatformLibraryProvider, SourceProvider } from "../../src/contracts/music_data_platform.js";
import type { Result } from "../../src/contracts/kernel.js";
import { createExtensionRuntime, platformLibraryProviderSlot, sourceProviderSlot, type PluginActivationContext, } from "../../src/extension/index.js";
import { createNcmPlugin, ncmPluginId, ncmProviderId, type NcmPluginConfig, } from "../../src/extension/plugins/index.js";
const registeredRuntime = createExtensionRuntime({
    plugins: [
        createNcmPlugin({
            baseUrl: "http://ncm.test",
            fetch: fetchJson({
                result: {
                    songs: [],
                },
                code: 200,
            }).fetch,
        }),
    ],
});
assert.equal((await registeredRuntime.initialize()).ok, true);
assert.deepEqual((await registeredRuntime.listSourceProviders()).map((provider) => provider.providerId), [
    ncmProviderId,
]);
assert.equal((await registeredRuntime.getSourceProvider(ncmProviderId))?.pluginId, ncmPluginId);
assert.deepEqual((await registeredRuntime.listPlatformLibraryProviders()).map((provider) => provider.providerId), [
    ncmProviderId,
]);
assert.equal((await registeredRuntime.getPlatformLibraryProvider(ncmProviderId))?.pluginId, ncmPluginId);
const trackFetch = fetchJson({
    result: {
        songs: [
            {
                id: 1001,
                name: "Seven (Remastered)",
                artists: [
                    { id: 2001, name: "Quiet Artist" },
                    { name: "Name Only Artist" },
                ],
                album: {
                    id: 3001,
                    name: "Diary (Remastered and Expanded Edition)",
                    size: 12,
                },
                fee: 1,
                duration: 233000,
                cd: "1",
                no: 7,
            },
        ],
    },
    code: 200,
});
const trackProvider = await sourceProviderFor({
    baseUrl: "http://ncm.test",
    fetch: trackFetch.fetch,
});
const trackSearch = await assertOk(await trackProvider.search?.({
    query: {
        text: " seven ",
        targetKinds: ["track"],
        limit: 1,
        offset: 2,
    },
}) ?? fail("missing_search", "missing search"));
const track = trackSearch[0]?.sourceEntity;
assert.equal(trackFetch.urls[0]?.pathname, "/search");
assert.equal(await trackFetch.urls[0]?.searchParams.get("keywords"), "seven");
assert.equal(await trackFetch.urls[0]?.searchParams.get("type"), "1");
assert.equal(await trackFetch.urls[0]?.searchParams.get("limit"), "1");
assert.equal(await trackFetch.urls[0]?.searchParams.get("offset"), "2");
assert.equal(track?.kind, "track");
assert.equal(track?.sourceRef.namespace, "source_netease");
assert.equal(track?.sourceRef.kind, "track");
assert.equal(track?.sourceRef.id, "1001");
assert.equal(track?.providerId, "netease");
assert.equal(track?.providerEntityId, "1001");
assert.equal(track?.label, "Seven (Remastered) - Quiet Artist, Name Only Artist");
assert.equal(track?.title, "Seven (Remastered)");
assert.deepEqual(track?.artistLabels, ["Quiet Artist", "Name Only Artist"]);
assert.deepEqual(track?.artistSourceRefs, [
    {
        namespace: "source_netease",
        kind: "artist",
        id: "2001",
        label: "Quiet Artist",
    },
]);
assert.equal(track?.albumLabel, "Diary (Remastered and Expanded Edition)");
assert.deepEqual(track?.albumSourceRef, {
    namespace: "source_netease",
    kind: "album",
    id: "3001",
    label: "Diary (Remastered and Expanded Edition)",
});
assert.deepEqual(track?.trackPosition, {
    discNumber: "1",
    trackNumber: 7,
    trackCount: 12,
});
assert.equal(track?.durationMs, 233000);
assert.deepEqual(track?.versionInfo, {
    label: "Remastered",
    tags: ["remaster", "extended"],
});
assert.equal(track?.providerUrl, "https://music.163.com/#/song?id=1001");
assert.equal(track?.availabilityHint, "restricted");
assert.equal("providerScore" in (trackSearch[0] ?? {}), false);
const unavailableTrackProvider = await sourceProviderFor({
    fetch: fetchJson({
        result: {
            songs: [
                {
                    id: 1002,
                    name: "Unavailable Song",
                    artists: [{ id: 2002, name: "Unavailable Artist" }],
                    noCopyrightRcmd: { type: 1 },
                },
            ],
        },
        code: 200,
    }).fetch,
});
const unavailableTrackSearch = await assertOk(await unavailableTrackProvider.search?.({
    query: { text: "unavailable", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"));
const unavailableTrack = unavailableTrackSearch[0]?.sourceEntity;
assert.equal(unavailableTrack?.availabilityHint, "unavailable");
const fallbackTrackProvider = await sourceProviderFor({
    fetch: fetchJson({
        result: {
            songs: [
                {
                    id: 1005,
                    name: "Fallback Facts",
                    artists: [],
                    ar: [{ id: 2005, name: "Fallback Artist" }],
                    album: {},
                    al: {
                        id: 3005,
                        name: "Fallback Album",
                        size: 8,
                    },
                    no: 3,
                },
            ],
        },
        code: 200,
    }).fetch,
});
const fallbackTrackSearch = await assertOk(await fallbackTrackProvider.search?.({
    query: { text: "fallback", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"));
const fallbackTrack = fallbackTrackSearch[0]?.sourceEntity;
assert.equal(fallbackTrack?.kind, "track");
assert.deepEqual(fallbackTrack?.artistLabels, ["Fallback Artist"]);
assert.deepEqual(fallbackTrack?.artistSourceRefs, [
    {
        namespace: "source_netease",
        kind: "artist",
        id: "2005",
        label: "Fallback Artist",
    },
]);
assert.equal(fallbackTrack?.albumLabel, "Fallback Album");
assert.deepEqual(fallbackTrack?.albumSourceRef, {
    namespace: "source_netease",
    kind: "album",
    id: "3005",
    label: "Fallback Album",
});
assert.deepEqual(fallbackTrack?.trackPosition, {
    trackNumber: 3,
    trackCount: 8,
});
const partialPrimaryArtistProvider = await sourceProviderFor({
    fetch: fetchJson({
        result: {
            songs: [
                {
                    id: 1006,
                    name: "Partial Primary Artists",
                    artists: [
                        { id: 2006, name: "Primary Artist" },
                        { name: "Recovered Artist" },
                    ],
                    ar: [
                        { id: 2006, name: "Primary Artist" },
                        { id: 2007, name: "Recovered Artist" },
                    ],
                },
            ],
        },
        code: 200,
    }).fetch,
});
const partialPrimaryArtistSearch = await assertOk(await partialPrimaryArtistProvider.search?.({
    query: { text: "partial primary", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"));
const partialPrimaryArtistTrack = partialPrimaryArtistSearch[0]?.sourceEntity;
assert.equal(partialPrimaryArtistTrack?.kind, "track");
assert.deepEqual(partialPrimaryArtistTrack?.artistLabels, [
    "Primary Artist",
    "Recovered Artist",
]);
assert.deepEqual(partialPrimaryArtistTrack?.artistSourceRefs, [
    {
        namespace: "source_netease",
        kind: "artist",
        id: "2006",
        label: "Primary Artist",
    },
    {
        namespace: "source_netease",
        kind: "artist",
        id: "2007",
        label: "Recovered Artist",
    },
]);
const albumFetch = fetchJson({
    result: {
        albums: [
            {
                id: 3002,
                name: "Moon Safari (Deluxe Edition)",
                artists: [
                    { id: 4001, name: "Air" },
                    { id: 4001, name: "Air" },
                ],
                artist: { id: 9999, name: "Fallback Artist" },
                publishTime: Date.UTC(1998, 0, 16),
            },
        ],
    },
    code: 200,
});
const albumProvider = await sourceProviderFor({
    baseUrl: "http://ncm.test",
    fetch: albumFetch.fetch,
});
const albumSearch = await assertOk(await albumProvider.search?.({
    query: {
        text: "moon safari",
        targetKinds: ["album"],
        limit: 2,
    },
}) ?? fail("missing_search", "missing search"));
const album = albumSearch[0]?.sourceEntity;
assert.equal(await albumFetch.urls[0]?.searchParams.get("type"), "10");
assert.equal(album?.kind, "album");
assert.equal(album?.label, "Moon Safari (Deluxe Edition) - Air");
assert.deepEqual(album?.artistLabels, ["Air"]);
assert.deepEqual(album?.artistSourceRefs, [
    {
        namespace: "source_netease",
        kind: "artist",
        id: "4001",
        label: "Air",
    },
]);
assert.equal(album?.releaseDate, "1998-01-16");
assert.deepEqual(album?.versionInfo, {
    label: "Deluxe Edition",
    tags: ["deluxe"],
});
assert.equal(album?.providerUrl, "https://music.163.com/#/album?id=3002");
const artistFetch = fetchJson({
    result: {
        artists: [
            {
                id: 5001,
                name: "Phoenix",
                alias: ["Phoenix"],
                alia: ["Alt Phoenix"],
                trans: "Translated Phoenix",
            },
        ],
    },
    code: 200,
});
const artistProvider = await sourceProviderFor({
    baseUrl: "http://ncm.test",
    fetch: artistFetch.fetch,
});
const artistSearch = await assertOk(await artistProvider.search?.({
    query: {
        text: "phoenix",
        targetKinds: ["artist"],
    },
}) ?? fail("missing_search", "missing search"));
const artist = artistSearch[0]?.sourceEntity;
assert.equal(await artistFetch.urls[0]?.searchParams.get("type"), "100");
assert.equal(artist?.kind, "artist");
assert.equal(artist?.name, "Phoenix");
assert.deepEqual(artist?.aliases, ["Alt Phoenix", "Translated Phoenix"]);
assert.equal(artist?.providerUrl, "https://music.163.com/#/artist?id=5001");
assert.equal(artist?.versionInfo, undefined);
const savedTrackAddedAt = Date.UTC(2026, 0, 2, 3, 4, 5);
const savedTrackFetch = fetchSequence([
    {
        code: 200,
        profile: {
            userId: 130950618,
        },
    },
    {
        code: 200,
        playlist: [
            {
                id: 9001,
                name: "我喜欢的音乐",
                specialType: 5,
            },
        ],
    },
    {
        code: 200,
        playlist: {
            trackIds: [
                {
                    id: 1001,
                    at: savedTrackAddedAt,
                },
                {
                    id: 1002,
                },
            ],
        },
    },
    {
        code: 200,
        songs: [
            {
                id: 1001,
                name: "Saved Track",
                artists: [{ id: 2001, name: "Saved Artist" }],
                album: {
                    id: 3001,
                    name: "Saved Album",
                    size: 9,
                },
                no: 4,
            },
        ],
    },
]);
const savedTrackLibraryProvider = await platformLibraryProviderFor({
    baseUrl: "http://ncm.test",
    fetch: savedTrackFetch.fetch,
});
const savedTracks = await assertOk(await savedTrackLibraryProvider.read({
    kind: "saved_source_track",
    limit: 1,
}));
const savedTrack = savedTracks.candidates[0];
assert.deepEqual(savedTrackFetch.urls.map((url) => url.pathname), [
    "/user/account",
    "/user/playlist",
    "/playlist/detail",
    "/song/detail",
]);
assert.equal(await savedTrackFetch.urls[1]?.searchParams.get("uid"), "130950618");
assert.equal(await savedTrackFetch.urls[2]?.searchParams.get("id"), "9001");
assert.equal(await savedTrackFetch.urls[3]?.searchParams.get("ids"), "1001");
assert.equal(savedTracks.providerId, ncmProviderId);
assert.equal(savedTracks.providerAccountId, "130950618");
assert.equal(savedTracks.kind, "saved_source_track");
assert.equal(savedTracks.nextCursor, "1");
assert.equal(savedTracks.totalCountHint, 2);
assert.equal(savedTrack?.libraryKind, "saved_source_track");
assert.equal(savedTrack?.providerAccountId, "130950618");
assert.equal(savedTrack?.providerAddedAt, "2026-01-02T03:04:05.000Z");
assert.equal(savedTrack?.sourceEntity.kind, "track");
assert.equal(savedTrack?.sourceEntity.sourceRef.id, "1001");
assert.equal(savedTrack?.sourceEntity.label, "Saved Track - Saved Artist");
assert.deepEqual(savedTrack?.sourceEntity.trackPosition, {
    trackNumber: 4,
    trackCount: 9,
});
const savedAlbumAddedAt = Date.UTC(1998, 0, 16, 1, 2, 3);
const savedAlbumFetch = fetchSequence([
    {
        code: 200,
        profile: {
            userId: 130950618,
        },
    },
    {
        code: 200,
        data: [
            {
                id: 3002,
                name: "Saved Album (Deluxe Edition)",
                artists: [{ id: 4001, name: "Album Artist" }],
                subTime: savedAlbumAddedAt,
            },
        ],
        hasMore: true,
        count: 10,
    },
]);
const savedAlbumLibraryProvider = await platformLibraryProviderFor({
    baseUrl: "http://ncm.test",
    fetch: savedAlbumFetch.fetch,
});
const savedAlbums = await assertOk(await savedAlbumLibraryProvider.read({
    providerAccountId: "130950618",
    kind: "saved_source_album",
    limit: 2,
    cursor: "3",
}));
const savedAlbum = savedAlbums.candidates[0];
assert.deepEqual(savedAlbumFetch.urls.map((url) => url.pathname), [
    "/user/account",
    "/album/sublist",
]);
assert.equal(await savedAlbumFetch.urls[1]?.searchParams.get("limit"), "2");
assert.equal(await savedAlbumFetch.urls[1]?.searchParams.get("offset"), "3");
assert.equal(savedAlbums.providerAccountId, "130950618");
assert.equal(savedAlbums.kind, "saved_source_album");
assert.equal(savedAlbums.nextCursor, "4");
assert.equal(savedAlbums.totalCountHint, 10);
assert.equal(savedAlbum?.libraryKind, "saved_source_album");
assert.equal(savedAlbum?.providerAddedAt, "1998-01-16T01:02:03.000Z");
assert.equal(savedAlbum?.sourceEntity.kind, "album");
assert.equal(savedAlbum?.sourceEntity.sourceRef.id, "3002");
assert.deepEqual(savedAlbum?.sourceEntity.versionInfo, {
    label: "Deluxe Edition",
    tags: ["deluxe"],
});
const followedArtistFetch = fetchSequence([
    {
        code: 200,
        account: {
            id: 130950618,
        },
    },
    {
        code: 200,
        data: [
            {
                id: 5002,
                name: "Followed Artist",
                alias: ["Alias"],
            },
        ],
        hasMore: false,
        total: 1,
    },
]);
const followedArtistLibraryProvider = await platformLibraryProviderFor({
    baseUrl: "http://ncm.test",
    fetch: followedArtistFetch.fetch,
});
const followedArtists = await assertOk(await followedArtistLibraryProvider.read({
    kind: "followed_source_artist",
    limit: 5,
}));
const followedArtist = followedArtists.candidates[0];
assert.deepEqual(followedArtistFetch.urls.map((url) => url.pathname), [
    "/user/account",
    "/artist/sublist",
]);
assert.equal(followedArtists.providerAccountId, "130950618");
assert.equal(followedArtists.kind, "followed_source_artist");
assert.equal(followedArtists.nextCursor, undefined);
assert.equal(followedArtists.totalCountHint, 1);
assert.equal(followedArtist?.libraryKind, "followed_source_artist");
assert.equal(followedArtist?.providerAddedAt, undefined);
assert.equal(followedArtist?.sourceEntity.kind, "artist");
assert.equal(followedArtist?.sourceEntity.sourceRef.id, "5002");
const accountMismatchProvider = await platformLibraryProviderFor({
    fetch: fetchJson({
        code: 200,
        profile: {
            userId: 130950619,
        },
    }).fetch,
});
assertErrorCode(await accountMismatchProvider.read({
    providerAccountId: "130950618",
    kind: "saved_source_album",
    limit: 1,
}), "extension.ncm_account_mismatch", true);
const missingSongDetailFetch = fetchSequence([
    {
        code: 200,
        profile: {
            userId: 130950618,
        },
    },
    {
        code: 200,
        playlist: [
            {
                id: 9001,
                name: "我喜欢的音乐",
                specialType: 5,
            },
        ],
    },
    {
        code: 200,
        playlist: {
            trackIds: [{ id: 1001 }],
        },
    },
    {
        code: 200,
        songs: [],
    },
]);
const missingSongDetailProvider = await platformLibraryProviderFor({
    fetch: missingSongDetailFetch.fetch,
});
assertErrorCode(await missingSongDetailProvider.read({
    kind: "saved_source_track",
    limit: 1,
}), "extension.ncm_song_detail_missing");
assert.deepEqual(missingSongDetailFetch.urls.map((url) => url.pathname), [
    "/user/account",
    "/user/playlist",
    "/playlist/detail",
    "/song/detail",
]);
const malformedSavedAlbumProvider = await platformLibraryProviderFor({
    fetch: fetchSequence([
        {
            code: 200,
            profile: {
                userId: 130950618,
            },
        },
        {
            code: 200,
            data: [
                {
                    name: "Missing Album Id",
                },
            ],
        },
    ]).fetch,
});
assertErrorCode(await malformedSavedAlbumProvider.read({
    kind: "saved_source_album",
    limit: 1,
}), "extension.ncm_malformed_response");
const malformedFollowedArtistProvider = await platformLibraryProviderFor({
    fetch: fetchSequence([
        {
            code: 200,
            profile: {
                userId: 130950618,
            },
        },
        {
            code: 200,
            data: [
                {
                    id: 5002,
                },
            ],
        },
    ]).fetch,
});
assertErrorCode(await malformedFollowedArtistProvider.read({
    kind: "followed_source_artist",
    limit: 1,
}), "extension.ncm_malformed_response");
const emptyHasMoreSavedAlbumProvider = await platformLibraryProviderFor({
    fetch: fetchSequence([
        {
            code: 200,
            profile: {
                userId: 130950618,
            },
        },
        {
            code: 200,
            data: [],
            hasMore: true,
        },
    ]).fetch,
});
assertErrorCode(await emptyHasMoreSavedAlbumProvider.read({
    kind: "saved_source_album",
    limit: 1,
}), "extension.ncm_malformed_response");
const emptyHasMoreFollowedArtistProvider = await platformLibraryProviderFor({
    fetch: fetchSequence([
        {
            code: 200,
            profile: {
                userId: 130950618,
            },
        },
        {
            code: 200,
            data: [],
            more: true,
        },
    ]).fetch,
});
assertErrorCode(await emptyHasMoreFollowedArtistProvider.read({
    kind: "followed_source_artist",
    limit: 1,
}), "extension.ncm_malformed_response");
const malformedLikedTrackIdProvider = await platformLibraryProviderFor({
    fetch: fetchSequence([
        {
            code: 200,
            profile: {
                userId: 130950618,
            },
        },
        {
            code: 200,
            playlist: [
                {
                    id: 9001,
                    name: "我喜欢的音乐",
                    specialType: 5,
                },
            ],
        },
        {
            code: 200,
            playlist: {
                trackIds: [
                    {
                        at: Date.UTC(2026, 0, 1),
                    },
                ],
            },
        },
    ]).fetch,
});
assertErrorCode(await malformedLikedTrackIdProvider.read({
    kind: "saved_source_track",
    limit: 1,
}), "extension.ncm_malformed_response");
const unresolvedAccountProvider = await platformLibraryProviderFor({
    fetch: fetchJson({
        code: 200,
        profile: {},
    }).fetch,
});
assertErrorCode(await unresolvedAccountProvider.read({
    kind: "saved_source_album",
    limit: 1,
}), "extension.ncm_account_unresolved", true);
const invalidCursorFetch = fetchJson({
    code: 200,
    profile: {
        userId: 130950618,
    },
});
const invalidCursorProvider = await platformLibraryProviderFor({
    fetch: invalidCursorFetch.fetch,
});
assertErrorCode(await invalidCursorProvider.read({
    kind: "followed_source_artist",
    cursor: "not-offset",
}), "extension.ncm_invalid_cursor");
assert.deepEqual(invalidCursorFetch.urls, []);
const defaultKindFetch = fetchJson({
    result: { songs: [] },
    code: 200,
});
const defaultKindProvider = await sourceProviderFor({
    fetch: defaultKindFetch.fetch,
});
await assertOk(await defaultKindProvider.search?.({
    query: { text: "default kind" },
}) ?? fail("missing_search", "missing search"));
assert.equal(await defaultKindFetch.urls[0]?.searchParams.get("type"), "1");
assert.equal(await defaultKindFetch.urls[0]?.searchParams.get("limit"), "10");
const multiKindFetch = fetchSequence([
    { result: { songs: [{ id: 1003, name: "Track A", artists: [] }] }, code: 200 },
    { result: { albums: [{ id: 3003, name: "Album A", artists: [] }] }, code: 200 },
]);
const multiKindProvider = await sourceProviderFor({
    fetch: multiKindFetch.fetch,
});
const multiKindSearch = await assertOk(await multiKindProvider.search?.({
    query: {
        text: "multi",
        targetKinds: ["track", "album"],
        limit: 3,
    },
}) ?? fail("missing_search", "missing search"));
assert.deepEqual(multiKindFetch.urls.map((url) => url.searchParams.get("type")), ["1", "10"]);
assert.deepEqual(multiKindFetch.urls.map((url) => url.searchParams.get("limit")), ["2", "1"]);
assert.equal(multiKindSearch.length, 2);
assertErrorCode(await multiKindProvider.search?.({
    query: {
        text: "multi",
        targetKinds: ["track", "album"],
        offset: 1,
    },
}) ?? fail("missing_search", "missing search"), "extension.ncm_multi_kind_offset_unsupported");
const droppedProvider = await sourceProviderFor({
    fetch: fetchJson({
        result: {
            songs: [
                { name: "Missing Id" },
                { id: 0, name: "Zero Id" },
            ],
        },
        code: 200,
    }).fetch,
});
const droppedSearch = await assertOk(await droppedProvider.search?.({
    query: { text: "drop", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"));
assert.deepEqual(droppedSearch, []);
const nonObjectRowProvider = await sourceProviderFor({
    fetch: fetchJson({
        result: {
            songs: [
                "not an object",
            ],
        },
        code: 200,
    }).fetch,
});
assertErrorCode(await nonObjectRowProvider.search?.({
    query: { text: "malformed-row", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_malformed_response");
const missingTitleProvider = await sourceProviderFor({
    fetch: fetchJson({
        result: {
            songs: [
                { id: 1001 },
            ],
        },
        code: 200,
    }).fetch,
});
assertErrorCode(await missingTitleProvider.search?.({
    query: { text: "missing-title", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_malformed_response");
// Symmetric coverage: a usable provider id but a missing title/name must fail with
// extension.ncm_malformed_response for album and artist kinds too, not only track.
const missingAlbumTitleProvider = await sourceProviderFor({
    fetch: fetchJson({
        result: {
            albums: [
                { id: 3001 },
            ],
        },
        code: 200,
    }).fetch,
});
assertErrorCode(await missingAlbumTitleProvider.search?.({
    query: { text: "missing-album-title", targetKinds: ["album"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_malformed_response");
const missingArtistNameProvider = await sourceProviderFor({
    fetch: fetchJson({
        result: {
            artists: [
                { id: 5001 },
            ],
        },
        code: 200,
    }).fetch,
});
assertErrorCode(await missingArtistNameProvider.search?.({
    query: { text: "missing-artist-name", targetKinds: ["artist"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_malformed_response");
const malformedProvider = await sourceProviderFor({
    fetch: fetchJson({
        result: {},
        code: 200,
    }).fetch,
});
assertErrorCode(await malformedProvider.search?.({
    query: { text: "malformed", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_malformed_response");
const responseErrorProvider = await sourceProviderFor({
    fetch: fetchJson({
        code: 500,
        message: "provider error",
    }).fetch,
});
assertErrorCode(await responseErrorProvider.search?.({
    query: { text: "error", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_provider_response_error");
const httpFailureProvider = await sourceProviderFor({
    fetch: async () => new Response("unavailable", { status: 503 }),
});
assertErrorCode(await httpFailureProvider.search?.({
    query: { text: "http", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_provider_unavailable", true);
const malformedJsonProvider = await sourceProviderFor({
    fetch: async () => new Response("not-json", { status: 200 }),
});
assertErrorCode(await malformedJsonProvider.search?.({
    query: { text: "json", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_malformed_response");
const invalidBaseUrlProvider = await sourceProviderFor({
    baseUrl: "not a url",
    fetch: fetchJson({
        result: { songs: [] },
        code: 200,
    }).fetch,
});
assertErrorCode(await invalidBaseUrlProvider.search?.({
    query: { text: "invalid base url", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_invalid_config");
const nonStringBaseUrlProvider = await sourceProviderFor({
    baseUrl: Symbol("base-url") as unknown as string,
    fetch: fetchJson({
        result: { songs: [] },
        code: 200,
    }).fetch,
});
assertErrorCode(await nonStringBaseUrlProvider.search?.({
    query: { text: "invalid base url", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_invalid_config");
const nonObjectConfigProvider = await sourceProviderFor(null as unknown as NcmPluginConfig);
assertErrorCode(await nonObjectConfigProvider.search?.({
    query: { text: "invalid config", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"), "extension.ncm_invalid_config");
// getPlayableLinks: a resolved track maps to a single playable direct link.
const playableLinksFetch = fetchJson({
    code: 200,
    data: [
        {
            url: "http://ncm.test/audio.flac",
            br: 991769,
            size: 26386023,
            md5: "fa838839770f450c4170d6deafcb5488",
            type: "flac",
        },
    ],
});
const playableLinksProvider = await sourceProviderFor({
    baseUrl: "http://ncm.test",
    fetch: playableLinksFetch.fetch,
});
const playableLinks = await assertOk(await playableLinksProvider.getPlayableLinks?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
}) ?? fail("missing_playable_links", "missing getPlayableLinks"));
assert.equal(playableLinksFetch.urls[0]?.pathname, "/song/url");
assert.equal(await playableLinksFetch.urls[0]?.searchParams.get("id"), "1001");
assert.equal(await playableLinksFetch.urls[0]?.searchParams.get("br"), "999000");
assert.deepEqual(playableLinks, [
    { url: "http://ncm.test/audio.flac", label: "NetEase Cloud Music" },
]);
// getPlayableLinks: a non-track sourceRef yields an empty list, never an error.
const albumPlayableLinks = await assertOk(await playableLinksProvider.getPlayableLinks?.({
    sourceRef: { namespace: "source_netease", kind: "album", id: "3001" },
}) ?? fail("missing_playable_links", "missing getPlayableLinks"));
assert.deepEqual(albumPlayableLinks, []);
// getPlayableLinks: a track with no resolvable url (no copyright / expired cookie) -> empty list.
const noUrlProvider = await sourceProviderFor({
    fetch: fetchJson({ code: 200, data: [{ url: null }] }).fetch,
});
const noUrlPlayableLinks = await assertOk(await noUrlProvider.getPlayableLinks?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
}) ?? fail("missing_playable_links", "missing getPlayableLinks"));
assert.deepEqual(noUrlPlayableLinks, []);
// getDownloadSource: a resolved track maps to a DownloadSource with full facts.
const downloadSourceFetch = fetchJson({
    code: 200,
    data: [
        {
            url: "http://ncm.test/audio.flac",
            br: 991769,
            size: 26386023,
            md5: "fa838839770f450c4170d6deafcb5488",
            type: "flac",
        },
    ],
});
const downloadSourceProvider = await sourceProviderFor({
    baseUrl: "http://ncm.test",
    fetch: downloadSourceFetch.fetch,
});
const downloadSource = await assertOk(await downloadSourceProvider.getDownloadSource?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
}) ?? fail("missing_download_source", "missing getDownloadSource"));
assert.equal(downloadSource.url, "http://ncm.test/audio.flac");
assert.equal(downloadSource.container, "flac");
assert.equal(downloadSource.bitrate, 991769);
assert.equal(downloadSource.sizeBytes, 26386023);
assert.equal(downloadSource.md5, "fa838839770f450c4170d6deafcb5488");
// getDownloadSource: preferredBitrate is forwarded to /song/url as br.
const preferredBitrateFetch = fetchJson({
    code: 200,
    data: [{ url: "http://ncm.test/audio.mp3", br: 320000, type: "mp3" }],
});
const preferredBitrateProvider = await sourceProviderFor({
    fetch: preferredBitrateFetch.fetch,
});
await assertOk(await preferredBitrateProvider.getDownloadSource?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
    preferredBitrate: 320000,
}) ?? fail("missing_download_source", "missing getDownloadSource"));
assert.equal(await preferredBitrateFetch.urls[0]?.searchParams.get("br"), "320000");
// getDownloadSource: a non-track sourceRef is an explicit failure (no audio stream).
assertErrorCode(await downloadSourceProvider.getDownloadSource?.({
    sourceRef: { namespace: "source_netease", kind: "album", id: "3001" },
}) ?? fail("missing_download_source", "missing getDownloadSource"), "extension.ncm_no_audio_stream");
// getDownloadSource: a track with no resolvable url is an explicit FAILURE, not a
// silent empty — the playable/downloadable split. No copyright / expired cookie.
assertErrorCode(await noUrlProvider.getDownloadSource?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
}) ?? fail("missing_download_source", "missing getDownloadSource"), "extension.ncm_no_download_source", true);
// getDownloadSource: a malformed /song/url payload shape is a FAILURE, not "no stream".
const malformedSongUrlProvider = await sourceProviderFor({
    fetch: fetchJson({ code: 200, data: "not-an-array" }).fetch,
});
assertErrorCode(await malformedSongUrlProvider.getDownloadSource?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
}) ?? fail("missing_download_source", "missing getDownloadSource"), "extension.ncm_malformed_response");
// getEntityPictureUrl is declared as a provider capability.
assert.ok((await sourceProviderFor({ fetch: fetchJson({ code: 200 }).fetch })).descriptor.capabilities.includes("entity_picture_url"));
// getEntityPictureUrl: an album maps to /album and returns album.picUrl.
const albumPictureFetch = fetchJson({
    code: 200,
    album: { id: 3001, name: "Cover Album", picUrl: "http://ncm.test/album.jpg" },
});
const albumPictureProvider = await sourceProviderFor({
    baseUrl: "http://ncm.test",
    fetch: albumPictureFetch.fetch,
});
const albumPicture = await assertOk(await albumPictureProvider.getEntityPictureUrl?.({
    sourceRef: { namespace: "source_netease", kind: "album", id: "3001" },
}) ?? fail("missing_entity_picture_url", "missing getEntityPictureUrl"));
assert.equal(albumPictureFetch.urls[0]?.pathname, "/album");
assert.equal(await albumPictureFetch.urls[0]?.searchParams.get("id"), "3001");
assert.equal(albumPicture, "http://ncm.test/album.jpg");
// getEntityPictureUrl: a track maps to /song/detail and returns its album cover (al.picUrl).
const trackPictureFetch = fetchJson({
    code: 200,
    songs: [{ id: 1001, al: { id: 3001, picUrl: "http://ncm.test/track.jpg" } }],
});
const trackPictureProvider = await sourceProviderFor({
    baseUrl: "http://ncm.test",
    fetch: trackPictureFetch.fetch,
});
const trackPicture = await assertOk(await trackPictureProvider.getEntityPictureUrl?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
}) ?? fail("missing_entity_picture_url", "missing getEntityPictureUrl"));
assert.equal(trackPictureFetch.urls[0]?.pathname, "/song/detail");
assert.equal(await trackPictureFetch.urls[0]?.searchParams.get("ids"), "1001");
assert.equal(trackPicture, "http://ncm.test/track.jpg");
// getEntityPictureUrl: an artist maps to /artist and returns artist.picUrl.
const artistPictureFetch = fetchJson({
    code: 200,
    artist: { id: 2001, name: "Pictured Artist", picUrl: "http://ncm.test/artist.jpg" },
});
const artistPictureProvider = await sourceProviderFor({
    baseUrl: "http://ncm.test",
    fetch: artistPictureFetch.fetch,
});
const artistPicture = await assertOk(await artistPictureProvider.getEntityPictureUrl?.({
    sourceRef: { namespace: "source_netease", kind: "artist", id: "2001" },
}) ?? fail("missing_entity_picture_url", "missing getEntityPictureUrl"));
assert.equal(artistPictureFetch.urls[0]?.pathname, "/artist");
assert.equal(await artistPictureFetch.urls[0]?.searchParams.get("id"), "2001");
assert.equal(artistPicture, "http://ncm.test/artist.jpg");
// getEntityPictureUrl: an artist without picUrl falls back to img1v1Url.
const artistAvatarProvider = await sourceProviderFor({
    fetch: fetchJson({
        code: 200,
        artist: { id: 2002, name: "Avatar Artist", img1v1Url: "http://ncm.test/avatar.jpg" },
    }).fetch,
});
const artistAvatar = await assertOk(await artistAvatarProvider.getEntityPictureUrl?.({
    sourceRef: { namespace: "source_netease", kind: "artist", id: "2002" },
}) ?? fail("missing_entity_picture_url", "missing getEntityPictureUrl"));
assert.equal(artistAvatar, "http://ncm.test/avatar.jpg");
// getEntityPictureUrl: an entity with no picture (album present, no picUrl) is an honest empty.
const noPictureProvider = await sourceProviderFor({
    fetch: fetchJson({ code: 200, album: { id: 3003, name: "Coverless Album" } }).fetch,
});
const noPicture = await assertOk(await noPictureProvider.getEntityPictureUrl?.({
    sourceRef: { namespace: "source_netease", kind: "album", id: "3003" },
}) ?? fail("missing_entity_picture_url", "missing getEntityPictureUrl"));
assert.equal(noPicture, undefined);
// getEntityPictureUrl: a track with no album record is an honest empty.
const tracklessProvider = await sourceProviderFor({
    fetch: fetchJson({ code: 200, songs: [{ id: 1002 }] }).fetch,
});
const trackless = await assertOk(await tracklessProvider.getEntityPictureUrl?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1002" },
}) ?? fail("missing_entity_picture_url", "missing getEntityPictureUrl"));
assert.equal(trackless, undefined);
// getEntityPictureUrl: a structurally malformed /album payload (no album object) is a FAILURE.
const malformedAlbumPictureProvider = await sourceProviderFor({
    fetch: fetchJson({ code: 200, album: null }).fetch,
});
assertErrorCode(await malformedAlbumPictureProvider.getEntityPictureUrl?.({
    sourceRef: { namespace: "source_netease", kind: "album", id: "3001" },
}) ?? fail("missing_entity_picture_url", "missing getEntityPictureUrl"), "extension.ncm_malformed_response");
// getSongLyrics is declared as a provider capability.
assert.ok((await sourceProviderFor({ fetch: fetchJson({ code: 200 }).fetch })).descriptor.capabilities.includes("song_lyrics"));
// getSongLyrics: a track maps to /lyric and returns main lyrics + translation + romanization.
const lyricsFetch = fetchJson({
    code: 200,
    lrc: { lyric: "[00:01.00]main line" },
    tlyric: { lyric: "[00:01.00]translated line" },
    romalrc: { lyric: "[00:01.00]romanized line" },
});
const lyricsProvider = await sourceProviderFor({
    baseUrl: "http://ncm.test",
    fetch: lyricsFetch.fetch,
});
const lyrics = await assertOk(await lyricsProvider.getSongLyrics?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
}) ?? fail("missing_song_lyrics", "missing getSongLyrics"));
assert.equal(lyricsFetch.urls[0]?.pathname, "/lyric");
assert.equal(await lyricsFetch.urls[0]?.searchParams.get("id"), "1001");
assert.deepEqual(lyrics, {
    lyrics: "[00:01.00]main line",
    translation: "[00:01.00]translated line",
    romanization: "[00:01.00]romanized line",
});
// getSongLyrics: a track with only main lyrics omits translation/romanization keys.
const mainOnlyProvider = await sourceProviderFor({
    fetch: fetchJson({ code: 200, lrc: { lyric: "[00:02.00]solo" } }).fetch,
});
const mainOnly = await assertOk(await mainOnlyProvider.getSongLyrics?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
}) ?? fail("missing_song_lyrics", "missing getSongLyrics"));
assert.deepEqual(mainOnly, { lyrics: "[00:02.00]solo" });
// getSongLyrics: a track with no lyrics (lrc absent) is an honest empty.
const noLyricsProvider = await sourceProviderFor({
    fetch: fetchJson({ code: 200 }).fetch,
});
const noLyrics = await assertOk(await noLyricsProvider.getSongLyrics?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
}) ?? fail("missing_song_lyrics", "missing getSongLyrics"));
assert.equal(noLyrics, undefined);
// getSongLyrics: a non-track sourceRef is an honest empty, never an error.
const albumLyrics = await assertOk(await lyricsProvider.getSongLyrics?.({
    sourceRef: { namespace: "source_netease", kind: "album", id: "3001" },
}) ?? fail("missing_song_lyrics", "missing getSongLyrics"));
assert.equal(albumLyrics, undefined);
// getSongLyrics: an unreachable provider is a FAILURE (transport), never ok(undefined).
const lyricsUnavailableProvider = await sourceProviderFor({
    fetch: async () => new Response("unavailable", { status: 503 }),
});
assertErrorCode(await lyricsUnavailableProvider.getSongLyrics?.({
    sourceRef: { namespace: "source_netease", kind: "track", id: "1001" },
}) ?? fail("missing_song_lyrics", "missing getSongLyrics"), "extension.ncm_provider_unavailable", true);
function fetchJson(payload: unknown): {
    fetch: typeof fetch;
    urls: URL[];
} {
    return fetchSequence([payload]);
}
function fetchSequence(payloads: readonly unknown[]): {
    fetch: typeof fetch;
    urls: URL[];
} {
    const urls: URL[] = [];
    let index = 0;
    const fetcher: typeof fetch = async (input) => {
        urls.push(new URL(String(input)));
        const payload = payloads[index] ?? payloads[payloads.length - 1];
        index += 1;
        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        });
    };
    return { fetch: fetcher, urls };
}
async function sourceProviderFor(config: NcmPluginConfig): Promise<SourceProvider> {
    const plugin = createNcmPlugin(config);
    let provider: SourceProvider | undefined;
    const context: PluginActivationContext = {
        pluginId: ncmPluginId,
        register(slot, registration) {
            assert.equal(registration.key, ncmProviderId);
            if (slot.id === sourceProviderSlot.id) {
                provider = registration.value as SourceProvider;
            }
            return { ok: true, value: undefined };
        },
    };
    const activated = await plugin.activate(context);
    assert.equal(activated.ok, true);
    assert.equal(plugin.manifest.capabilities[0], sourceProviderSlot.id);
    assert.equal(plugin.manifest.capabilities[1], platformLibraryProviderSlot.id);
    if (provider === undefined) {
        throw new Error("NCM plugin did not register a source provider.");
    }
    return provider;
}
async function platformLibraryProviderFor(config: NcmPluginConfig): Promise<PlatformLibraryProvider> {
    const plugin = createNcmPlugin(config);
    let provider: PlatformLibraryProvider | undefined;
    const context: PluginActivationContext = {
        pluginId: ncmPluginId,
        register(slot, registration) {
            assert.equal(registration.key, ncmProviderId);
            if (slot.id === platformLibraryProviderSlot.id) {
                provider = registration.value as PlatformLibraryProvider;
            }
            return { ok: true, value: undefined };
        },
    };
    const activated = await plugin.activate(context);
    assert.equal(activated.ok, true);
    assert.equal(plugin.manifest.capabilities[0], sourceProviderSlot.id);
    assert.equal(plugin.manifest.capabilities[1], platformLibraryProviderSlot.id);
    if (provider === undefined) {
        throw new Error("NCM plugin did not register a platform library provider.");
    }
    return provider;
}
async function assertOk<T>(result: Promise<Result<T>> | Result<T>): Promise<T> {
    const awaited = await result;
    if (!awaited.ok) {
        throw new Error(awaited.error.message);
    }
    return awaited.value;
}
function assertErrorCode(result: Result<unknown>, code: string, retryable = false): void {
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.code, code);
        assert.equal(result.error.area, "extension");
        assert.equal(result.error.retryable, retryable);
    }
}
function fail(code: string, message: string): Result<never> {
    return {
        ok: false,
        error: {
            code,
            message,
            area: "extension",
            retryable: false,
        },
    };
}
