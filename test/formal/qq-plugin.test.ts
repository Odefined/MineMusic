import assert from "node:assert/strict";
import type { PlatformLibraryProvider, SourceProvider } from "../../src/contracts/music_data_platform.js";
import type { Result } from "../../src/contracts/kernel.js";
import { createExtensionRuntime, platformLibraryProviderSlot, sourceProviderSlot, type PluginActivationContext, } from "../../src/extension/index.js";
import { createQqPlugin, qqPluginId, qqProviderId, type QqPluginConfig, } from "../../src/extension/plugins/index.js";

// --- registration ----------------------------------------------------------

const registeredRuntime = createExtensionRuntime({
    plugins: [
        createQqPlugin({
            baseUrl: "http://qq.test",
            fetch: fetchJson({ code: 0, data: { song: [] } }).fetch,
        }),
    ],
});
assert.equal((await registeredRuntime.initialize()).ok, true);
assert.deepEqual((await registeredRuntime.listSourceProviders()).map((provider) => provider.providerId), [
    qqProviderId,
]);
assert.equal((await registeredRuntime.getSourceProvider(qqProviderId))?.pluginId, qqPluginId);
assert.deepEqual((await registeredRuntime.listPlatformLibraryProviders()).map((provider) => provider.providerId), [
    qqProviderId,
]);
assert.equal((await registeredRuntime.getPlatformLibraryProvider(qqProviderId))?.pluginId, qqPluginId);

// --- search: track ---------------------------------------------------------

const trackFetch = fetchJson({
    code: 0,
    msg: "ok",
    data: {
        nextpage: -1,
        total_num: 1,
        song: [
            {
                id: 1,
                mid: "001QF4Ux0xlpCN",
                name: "晴天",
                singer: [{ mid: "002", name: "周杰伦" }],
                album: { mid: "003", name: "叶惠美" },
                interval: 269,
            },
        ],
    },
});
const trackProvider = await sourceProviderFor({ baseUrl: "http://qq.test", fetch: trackFetch.fetch });
const trackSearch = await assertOk(await trackProvider.search?.({
    query: {
        text: " 晴天 ",
        targetKinds: ["track"],
        limit: 1,
        offset: 0,
    },
}) ?? fail("missing_search", "missing search"));
const track = trackSearch[0]?.sourceEntity;
assert.equal(trackFetch.urls[0]?.pathname, "/search/search_by_type");
assert.equal(trackFetch.urls[0]?.searchParams.get("keyword"), "晴天");
assert.equal(trackFetch.urls[0]?.searchParams.get("search_type"), "0");
assert.equal(trackFetch.urls[0]?.searchParams.get("page"), "1");
assert.equal(trackFetch.urls[0]?.searchParams.get("num"), "1");
assert.equal(track?.kind, "track");
assert.equal(track?.sourceRef.namespace, "source_qq");
assert.equal(track?.sourceRef.kind, "track");
assert.equal(track?.sourceRef.id, "001QF4Ux0xlpCN");
assert.equal(track?.providerId, "qq");
assert.equal(track?.providerEntityId, "001QF4Ux0xlpCN");
assert.equal(track?.origin, "provider");
assert.equal(track?.title, "晴天");
assert.equal(track?.label, "晴天 — 周杰伦");
assert.deepEqual(track?.artistLabels, ["周杰伦"]);
assert.deepEqual(track?.artistSourceRefs, [
    { namespace: "source_qq", kind: "artist", id: "002", label: "周杰伦" },
]);
assert.equal(track?.albumLabel, "叶惠美");
assert.deepEqual(track?.albumSourceRef, {
    namespace: "source_qq",
    kind: "album",
    id: "003",
    label: "叶惠美",
});
assert.equal(track?.durationMs, 269000);
assert.equal(track?.providerUrl, "https://y.qq.com/n/ryqq/songDetail/001QF4Ux0xlpCN");
assert.equal(track?.availabilityHint, "playable");

// --- search: album ---------------------------------------------------------

const albumFetch = fetchJson({
    code: 0,
    data: {
        album: [
            {
                id: 1,
                mid: "003",
                name: "叶惠美",
                singer_list: [{ mid: "002", name: "周杰伦" }],
                time_public: "2003-07-31",
            },
        ],
    },
});
const albumProvider = await sourceProviderFor({ baseUrl: "http://qq.test", fetch: albumFetch.fetch });
const albumSearch = await assertOk(await albumProvider.search?.({
    query: { text: "叶惠美", targetKinds: ["album"] },
}) ?? fail("missing_search", "missing search"));
const album = albumSearch[0]?.sourceEntity;
assert.equal(albumFetch.urls[0]?.searchParams.get("search_type"), "2");
assert.equal(album?.kind, "album");
assert.equal(album?.sourceRef.namespace, "source_qq");
assert.equal(album?.sourceRef.id, "003");
assert.equal(album?.title, "叶惠美");
assert.deepEqual(album?.artistLabels, ["周杰伦"]);
assert.equal(album?.releaseDate, "2003-07-31");
assert.equal(album?.providerUrl, "https://y.qq.com/n/ryqq/albumDetail/003");

// --- search: artist --------------------------------------------------------

const artistFetch = fetchJson({
    code: 0,
    data: {
        singer: [{ id: 1, mid: "002", name: "周杰伦" }],
    },
});
const artistProvider = await sourceProviderFor({ baseUrl: "http://qq.test", fetch: artistFetch.fetch });
const artistSearch = await assertOk(await artistProvider.search?.({
    query: { text: "周杰伦", targetKinds: ["artist"] },
}) ?? fail("missing_search", "missing search"));
const artist = artistSearch[0]?.sourceEntity;
assert.equal(artistFetch.urls[0]?.searchParams.get("search_type"), "1");
assert.equal(artist?.kind, "artist");
assert.equal(artist?.sourceRef.namespace, "source_qq");
assert.equal(artist?.sourceRef.id, "002");
assert.equal(artist?.name, "周杰伦");
assert.equal(artist?.providerUrl, "https://y.qq.com/n/ryqq/singer/002");

// --- search: version tags (shared extractVersionInfo) ---------------------

const versionedFetch = fetchJson({
    code: 0,
    data: { song: [{ mid: "v1", name: "Yesterday (Remastered)", singer: [{ mid: "a1", name: "The Beatles" }], album: { mid: "al1", name: "Help! (Remastered)" } }] },
});
const versionedProvider = await sourceProviderFor({ baseUrl: "http://qq.test", fetch: versionedFetch.fetch });
const versionedSearch = await assertOk(await versionedProvider.search?.({ query: { text: "yesterday", targetKinds: ["track"] } }) ?? fail("missing_search", "missing search"));
assert.deepEqual(versionedSearch[0]?.sourceEntity?.versionInfo?.tags, ["remaster"]);

// --- search: error paths ---------------------------------------------------

const malformedProvider = await sourceProviderFor({
    fetch: fetchJson({ code: 0, msg: "ok" }).fetch,
});
assertErrorCode(await malformedProvider.search?.({ query: { text: "x", targetKinds: ["track"] } }) ?? fail("missing_search", ""), "extension.qq_malformed_response");

const providerErrorProvider = await sourceProviderFor({
    fetch: fetchJson({ code: -1, msg: "rate limited" }).fetch,
});
assertErrorCode(await providerErrorProvider.search?.({ query: { text: "x", targetKinds: ["track"] } }) ?? fail("missing_search", ""), "extension.qq_provider_response_error");

const unavailableProvider = await sourceProviderFor({
    fetch: async () => new Response("down", { status: 503 }),
});
assertErrorCode(await unavailableProvider.search?.({ query: { text: "x", targetKinds: ["track"] } }) ?? fail("missing_search", ""), "extension.qq_provider_unavailable", true);
// #88: a hung QQ bridge is bounded by requestTimeoutMs. The injected fetch honors
// the abort signal the way real fetch does; the plugin aborts and maps the timeout
// onto the existing extension.qq_provider_unavailable code (retryable), with a
// message that names the timeout. No new error code. (Same shape as the NCM guard.)
const hungQqFetch: typeof fetch = (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
        reject(init?.signal?.reason ?? new Error("aborted"));
    });
});
const qqTimeoutProvider = await sourceProviderFor({
    baseUrl: "http://qq.test",
    requestTimeoutMs: 50,
    fetch: hungQqFetch,
});
const qqTimeoutSearch = await qqTimeoutProvider.search?.({
    query: { text: "slow", targetKinds: ["track"] },
}) ?? fail("missing_search", "");
assertErrorCode(qqTimeoutSearch, "extension.qq_provider_unavailable", true);
if (!qqTimeoutSearch.ok) {
    assert.equal(qqTimeoutSearch.error.message.includes("timeout"), true);
}
// #88: a QQ response exceeding maxResponseBytes is rejected as malformed, streamed
// so it cannot OOM the process. The over-cap body is VALID JSON larger than the cap,
// so the only path to qq_malformed_response is the byte cap firing pre-parse —
// removing the cap would let this parse and fail the assertion. The "exceeded"
// message check pins the oversize path rather than a parse failure.
const qqOversizedProvider = await sourceProviderFor({
    baseUrl: "http://qq.test",
    maxResponseBytes: 8,
    fetch: async () => new Response(JSON.stringify({ pad: "a".repeat(64) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    }),
});
const qqOversizedSearch = await qqOversizedProvider.search?.({
    query: { text: "big", targetKinds: ["track"] },
}) ?? fail("missing_search", "");
assertErrorCode(qqOversizedSearch, "extension.qq_malformed_response");
if (!qqOversizedSearch.ok) {
    assert.equal(qqOversizedSearch.error.message.includes("exceeded"), true);
}
// #88: a mid-stream transport failure (the body stream errors after the headers
// arrive) maps onto extension.qq_provider_unavailable (retryable), NOT
// malformed_response — a torn connection is consistently retryable whether it fails
// at the headers or mid-body. (Same shape as the NCM guard.)
const tornQqStreamFetch: typeof fetch = async () => new Response(
    new ReadableStream({
        start(controller) {
            controller.error(new Error("connection torn mid-stream"));
        },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
);
const qqTornStreamProvider = await sourceProviderFor({
    baseUrl: "http://qq.test",
    fetch: tornQqStreamFetch,
});
assertErrorCode(await qqTornStreamProvider.search?.({
    query: { text: "torn", targetKinds: ["track"] },
}) ?? fail("missing_search", ""), "extension.qq_provider_unavailable", true);
// #88: non-positive / non-integer HTTP bounds are invalid config, surfaced at the
// provider boundary rather than silently coerced to a default.
const qqInvalidTimeoutProvider = await sourceProviderFor({
    baseUrl: "http://qq.test",
    requestTimeoutMs: 0,
    fetch: fetchJson({ code: 0, data: { song: { list: [] } } }).fetch,
});
assertErrorCode(await qqInvalidTimeoutProvider.search?.({
    query: { text: "cfg-timeout", targetKinds: ["track"] },
}) ?? fail("missing_search", ""), "extension.qq_invalid_config");
const qqInvalidMaxBytesProvider = await sourceProviderFor({
    baseUrl: "http://qq.test",
    maxResponseBytes: -1,
    fetch: fetchJson({ code: 0, data: { song: { list: [] } } }).fetch,
});
assertErrorCode(await qqInvalidMaxBytesProvider.search?.({
    query: { text: "cfg-bytes", targetKinds: ["track"] },
}) ?? fail("missing_search", ""), "extension.qq_invalid_config");

// Multi-kind search is rejected loudly (single-kind only): the plugin does not
// narrow silently, and the declared error surfaces before any provider call.
const multiKindFetch = fetchJson({ code: 0, data: { song: [] } });
const multiKindProvider = await sourceProviderFor({
    fetch: multiKindFetch.fetch,
});
assertErrorCode(await multiKindProvider.search?.({
    query: { text: "x", targetKinds: ["track", "album"] },
}) ?? fail("missing_search", ""), "extension.qq_multi_kind_unsupported");
assert.equal(multiKindFetch.urls.length, 0);

// --- audio: playable_links + download_source ------------------------------

// No stream (midurlinfo empty / VIP-only): playable is an honest empty list,
// download fails retryably — mirrors ncm's playable/download split.
const noStreamProvider = await sourceProviderFor({
    fetch: fetchJson({ code: 0, data: { midurlinfo: [] } }).fetch,
});
const trackRef = { namespace: "source_qq", kind: "track" as const, id: "mid1" };
assert.deepEqual(await assertOk(await noStreamProvider.getPlayableLinks?.({ sourceRef: trackRef }) ?? fail("missing", "")), []);
assertErrorCode(await noStreamProvider.getDownloadSource?.({ sourceRef: trackRef }) ?? fail("missing", ""), "extension.qq_no_download_source", true);

// Resolved stream: sip + purl (M500 = MP3_128) + query_song size.
const audioFetch = fetchSequence([
    { code: 0, data: { midurlinfo: [{ purl: "M500song.mp3?vkey=k" }] } },
    { code: 0, data: { sip: ["http://cdn.test/"] } },
    { code: 0, data: { midurlinfo: [{ purl: "M500song.mp3?vkey=k" }] } },
    { code: 0, data: { sip: ["http://cdn.test/"] } },
    { code: 0, data: { tracks: [{ file: { size_128mp3: 4317292 } }] } },
]);
const audioProvider = await sourceProviderFor({ baseUrl: "http://qq.test", fetch: audioFetch.fetch });
assert.deepEqual(await assertOk(await audioProvider.getPlayableLinks?.({ sourceRef: trackRef }) ?? fail("missing", "")), [
    { url: "http://cdn.test/M500song.mp3?vkey=k", label: "QQ Music" },
]);
const download = await assertOk(await audioProvider.getDownloadSource?.({ sourceRef: trackRef }) ?? fail("missing", ""));
assert.equal(download.url, "http://cdn.test/M500song.mp3?vkey=k");
assert.equal(download.container, "mp3");
assert.equal(download.bitrate, 128000);
assert.equal(download.sizeBytes, 4317292);
assert.equal("md5" in download, false);
assertErrorCode(await audioProvider.getDownloadSource?.({ sourceRef: { namespace: "source_qq", kind: "album", id: "a1" } }) ?? fail("missing", ""), "extension.qq_no_audio_stream");

// --- picture + lyrics ------------------------------------------------------

// Picture: static y.gtimg.cn URL for album/artist; track needs album.mid.
const staticPicProvider = await sourceProviderFor({ fetch: fetchJson({ code: 0, data: {} }).fetch });
assert.equal(await assertOk(await staticPicProvider.getEntityPictureUrl?.({ sourceRef: { namespace: "source_qq", kind: "album", id: "alb1" } }) ?? fail("missing", "")), "https://y.gtimg.cn/music/photo_new/T002R300x300M000alb1.jpg");
assert.equal(await assertOk(await staticPicProvider.getEntityPictureUrl?.({ sourceRef: { namespace: "source_qq", kind: "artist", id: "art1" } }) ?? fail("missing", "")), "https://y.gtimg.cn/music/photo_new/T001R300x300M000art1.jpg");
const trackPicProvider = await sourceProviderFor({
    fetch: fetchSequence([{ code: 0, data: { tracks: [{ album: { mid: "alb1" } }] } }]).fetch,
});
assert.equal(await assertOk(await trackPicProvider.getEntityPictureUrl?.({ sourceRef: trackRef }) ?? fail("missing", "")), "https://y.gtimg.cn/music/photo_new/T002R300x300M000alb1.jpg");

// Lyrics: encrypted QRC (crypt != 0) decrypted in-process. The hex below is the
// qrcDecrypt ground-truth vector for "[ti:Test]\nHello world".
const lyricsProvider = await sourceProviderFor({
    fetch: fetchJson({ code: 0, data: { crypt: 1, lyric: "1eaa9479b9b1b2f5af04f8c211f7bfbe66ee93bfa52973bf7ae11bba800f94ce", trans: "", roma: "" } }).fetch,
});
const lyrics = await assertOk(await lyricsProvider.getSongLyrics?.({ sourceRef: trackRef }) ?? fail("missing", ""));
assert.notEqual(lyrics, undefined);
assert.equal(lyrics!.lyrics, "[ti:Test]\nHello world");
assert.equal(lyrics !== undefined && "translation" in lyrics, false);
assert.equal(await assertOk(await lyricsProvider.getSongLyrics?.({ sourceRef: { namespace: "source_qq", kind: "album", id: "alb1" } }) ?? fail("missing", "")), undefined);

// --- platform library: saved tracks / albums / followed artists ------------

// Saved tracks: refresh_credential (euin) + /user/{euin}/fav/songs.
const libFetch = fetchSequence([
    { code: 0, data: { encryptUin: "euin1" } },
    { code: 0, data: { songlist: [{ mid: "mid1", name: "Song", singer: [{ mid: "art1", name: "Artist" }], album: { mid: "alb1", name: "Album" } }], hasmore: 1, total_song_num: 5 } },
]);
const libProvider = await platformLibraryProviderFor({ baseUrl: "http://qq.test", fetch: libFetch.fetch });
const libResult = await assertOk(await libProvider.read({ kind: "saved_source_track", limit: 10 }));
assert.equal(libResult.providerId, "qq");
assert.equal(libResult.providerAccountId, "euin1");
assert.equal(libResult.kind, "saved_source_track");
assert.equal(libResult.candidates.length, 1);
const firstLib = libResult.candidates[0];
assert.notEqual(firstLib, undefined);
assert.equal(firstLib!.libraryKind, "saved_source_track");
assert.equal(firstLib!.sourceEntity.kind, "track");
assert.equal(firstLib!.sourceEntity.sourceRef.namespace, "source_qq");
assert.equal(libResult.nextCursor, "2");
assert.equal(libResult.totalCountHint, 5);

// No euin in refresh_credential → account unresolved.
const noAccountProvider = await platformLibraryProviderFor({
    fetch: fetchJson({ code: 0, data: {} }).fetch,
});
assertErrorCode(await noAccountProvider.read({ kind: "saved_source_album" }), "extension.qq_account_unresolved", true);

// Requested providerAccountId does not match the logged-in euin.
const mismatchProvider = await platformLibraryProviderFor({
    fetch: fetchJson({ code: 0, data: { encryptUin: "real-euin" } }).fetch,
});
assertErrorCode(await mismatchProvider.read({ kind: "followed_source_artist", providerAccountId: "other-euin" }), "extension.qq_account_mismatch", true);

// --- helpers ---------------------------------------------------------------

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
            headers: { "Content-Type": "application/json" },
        });
    };
    return { fetch: fetcher, urls };
}

async function sourceProviderFor(config: QqPluginConfig): Promise<SourceProvider> {
    const plugin = createQqPlugin(config);
    let provider: SourceProvider | undefined;
    const context: PluginActivationContext = {
        pluginId: qqPluginId,
        register(slot, registration) {
            assert.equal(registration.key, qqProviderId);
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
        throw new Error("QQ plugin did not register a source provider.");
    }
    return provider;
}

async function platformLibraryProviderFor(config: QqPluginConfig): Promise<PlatformLibraryProvider> {
    const plugin = createQqPlugin(config);
    let provider: PlatformLibraryProvider | undefined;
    const context: PluginActivationContext = {
        pluginId: qqPluginId,
        register(slot, registration) {
            assert.equal(registration.key, qqProviderId);
            if (slot.id === platformLibraryProviderSlot.id) {
                provider = registration.value as PlatformLibraryProvider;
            }
            return { ok: true, value: undefined };
        },
    };
    const activated = await plugin.activate(context);
    assert.equal(activated.ok, true);
    if (provider === undefined) {
        throw new Error("QQ plugin did not register a platform library provider.");
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
        error: { code, message, area: "extension", retryable: false },
    };
}
