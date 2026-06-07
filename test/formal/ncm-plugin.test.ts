import assert from "node:assert/strict";

import type { Result, SourceProvider } from "../../src/contracts/index.js";
import {
  createExtensionRuntime,
  sourceProviderSlot,
  type PluginActivationContext,
} from "../../src/extension/index.js";
import {
  createNcmPlugin,
  ncmPluginId,
  ncmProviderId,
  type NcmPluginConfig,
} from "../../src/extension/plugins/index.js";

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
assert.deepEqual(registeredRuntime.listSourceProviders().map((provider) => provider.providerId), [
  ncmProviderId,
]);
assert.equal(registeredRuntime.getSourceProvider(ncmProviderId)?.pluginId, ncmPluginId);

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
const trackSearch = await assertOk(trackProvider.search?.({
  query: {
    text: " seven ",
    targetKinds: ["track"],
    limit: 1,
    offset: 2,
  },
}) ?? fail("missing_search", "missing search"));
const track = trackSearch[0]?.sourceEntity;

assert.equal(trackFetch.urls[0]?.pathname, "/search");
assert.equal(trackFetch.urls[0]?.searchParams.get("keywords"), "seven");
assert.equal(trackFetch.urls[0]?.searchParams.get("type"), "1");
assert.equal(trackFetch.urls[0]?.searchParams.get("limit"), "1");
assert.equal(trackFetch.urls[0]?.searchParams.get("offset"), "2");
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
assert.deepEqual(track?.links, [
  {
    url: "https://music.163.com/#/song?id=1001",
    label: "NetEase Cloud Music",
    requiresAccount: true,
  },
]);
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
const unavailableTrackSearch = await assertOk(unavailableTrackProvider.search?.({
  query: { text: "unavailable", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"));
const unavailableTrack = unavailableTrackSearch[0]?.sourceEntity;

assert.equal(unavailableTrack?.availabilityHint, "unavailable");
assert.equal(unavailableTrack?.links, undefined);

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
const fallbackTrackSearch = await assertOk(fallbackTrackProvider.search?.({
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
const partialPrimaryArtistSearch = await assertOk(partialPrimaryArtistProvider.search?.({
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
const albumSearch = await assertOk(albumProvider.search?.({
  query: {
    text: "moon safari",
    targetKinds: ["album"],
    limit: 2,
  },
}) ?? fail("missing_search", "missing search"));
const album = albumSearch[0]?.sourceEntity;

assert.equal(albumFetch.urls[0]?.searchParams.get("type"), "10");
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
assert.equal(album?.links, undefined);

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
const artistSearch = await assertOk(artistProvider.search?.({
  query: {
    text: "phoenix",
    targetKinds: ["artist"],
  },
}) ?? fail("missing_search", "missing search"));
const artist = artistSearch[0]?.sourceEntity;

assert.equal(artistFetch.urls[0]?.searchParams.get("type"), "100");
assert.equal(artist?.kind, "artist");
assert.equal(artist?.name, "Phoenix");
assert.deepEqual(artist?.aliases, ["Alt Phoenix", "Translated Phoenix"]);
assert.equal(artist?.providerUrl, "https://music.163.com/#/artist?id=5001");
assert.equal(artist?.links, undefined);
assert.equal(artist?.versionInfo, undefined);

const defaultKindFetch = fetchJson({
  result: { songs: [] },
  code: 200,
});
const defaultKindProvider = await sourceProviderFor({
  fetch: defaultKindFetch.fetch,
});
await assertOk(defaultKindProvider.search?.({
  query: { text: "default kind" },
}) ?? fail("missing_search", "missing search"));
assert.equal(defaultKindFetch.urls[0]?.searchParams.get("type"), "1");
assert.equal(defaultKindFetch.urls[0]?.searchParams.get("limit"), "10");

const multiKindFetch = fetchSequence([
  { result: { songs: [{ id: 1003, name: "Track A", artists: [] }] }, code: 200 },
  { result: { albums: [{ id: 3003, name: "Album A", artists: [] }] }, code: 200 },
]);
const multiKindProvider = await sourceProviderFor({
  fetch: multiKindFetch.fetch,
});
const multiKindSearch = await assertOk(multiKindProvider.search?.({
  query: {
    text: "multi",
    targetKinds: ["track", "album"],
    limit: 3,
  },
}) ?? fail("missing_search", "missing search"));

assert.deepEqual(multiKindFetch.urls.map((url) => url.searchParams.get("type")), ["1", "10"]);
assert.deepEqual(multiKindFetch.urls.map((url) => url.searchParams.get("limit")), ["2", "1"]);
assert.equal(multiKindSearch.length, 2);

assertErrorCode(
  await multiKindProvider.search?.({
    query: {
      text: "multi",
      targetKinds: ["track", "album"],
      offset: 1,
    },
  }) ?? fail("missing_search", "missing search"),
  "extension.ncm_multi_kind_offset_unsupported",
);

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
const droppedSearch = await assertOk(droppedProvider.search?.({
  query: { text: "drop", targetKinds: ["track"] },
}) ?? fail("missing_search", "missing search"));
assert.deepEqual(droppedSearch, []);

const malformedProvider = await sourceProviderFor({
  fetch: fetchJson({
    result: {},
    code: 200,
  }).fetch,
});
assertErrorCode(
  await malformedProvider.search?.({
    query: { text: "malformed", targetKinds: ["track"] },
  }) ?? fail("missing_search", "missing search"),
  "extension.ncm_malformed_response",
);

const responseErrorProvider = await sourceProviderFor({
  fetch: fetchJson({
    code: 500,
    message: "provider error",
  }).fetch,
});
assertErrorCode(
  await responseErrorProvider.search?.({
    query: { text: "error", targetKinds: ["track"] },
  }) ?? fail("missing_search", "missing search"),
  "extension.ncm_provider_response_error",
);

const httpFailureProvider = await sourceProviderFor({
  fetch: async () => new Response("unavailable", { status: 503 }),
});
assertErrorCode(
  await httpFailureProvider.search?.({
    query: { text: "http", targetKinds: ["track"] },
  }) ?? fail("missing_search", "missing search"),
  "extension.ncm_provider_unavailable",
  true,
);

const malformedJsonProvider = await sourceProviderFor({
  fetch: async () => new Response("not-json", { status: 200 }),
});
assertErrorCode(
  await malformedJsonProvider.search?.({
    query: { text: "json", targetKinds: ["track"] },
  }) ?? fail("missing_search", "missing search"),
  "extension.ncm_malformed_response",
);

const invalidBaseUrlProvider = await sourceProviderFor({
  baseUrl: "not a url",
  fetch: fetchJson({
    result: { songs: [] },
    code: 200,
  }).fetch,
});
assertErrorCode(
  await invalidBaseUrlProvider.search?.({
    query: { text: "invalid base url", targetKinds: ["track"] },
  }) ?? fail("missing_search", "missing search"),
  "extension.ncm_invalid_config",
);

const nonStringBaseUrlProvider = await sourceProviderFor({
  baseUrl: Symbol("base-url") as unknown as string,
  fetch: fetchJson({
    result: { songs: [] },
    code: 200,
  }).fetch,
});
assertErrorCode(
  await nonStringBaseUrlProvider.search?.({
    query: { text: "invalid base url", targetKinds: ["track"] },
  }) ?? fail("missing_search", "missing search"),
  "extension.ncm_invalid_config",
);

const nonObjectConfigProvider = await sourceProviderFor(null as unknown as NcmPluginConfig);
assertErrorCode(
  await nonObjectConfigProvider.search?.({
    query: { text: "invalid config", targetKinds: ["track"] },
  }) ?? fail("missing_search", "missing search"),
  "extension.ncm_invalid_config",
);

function fetchJson(payload: unknown): { fetch: typeof fetch; urls: URL[] } {
  return fetchSequence([payload]);
}

function fetchSequence(payloads: readonly unknown[]): { fetch: typeof fetch; urls: URL[] } {
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
    registerSourceProvider(registration) {
      assert.equal(registration.pluginId, ncmPluginId);
      assert.equal(registration.providerId, ncmProviderId);
      provider = registration.provider;
      return { ok: true, value: undefined };
    },
  };
  const activated = await plugin.activate(context);

  assert.equal(activated.ok, true);
  assert.equal(plugin.manifest.capabilities[0], sourceProviderSlot.id);

  if (provider === undefined) {
    throw new Error("NCM plugin did not register a source provider.");
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
