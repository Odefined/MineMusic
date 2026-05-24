import type { PlatformLibraryProvider } from "../../src/contracts/index.js";
import {
  createNetEasePlatformLibraryProvider,
  type NetEaseProviderOptions,
} from "../../src/providers/netease/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, "expected Result.ok");
  return awaited.value;
}

async function createsPlatformLibraryProviderWithSharedRequesterOptions(): Promise<void> {
  const options: NetEaseProviderOptions = {
    requestJson: async ({ path }) => {
      assert(path === "/login/status", "shared requester options should be used for account status reads");

      return {
        ok: true,
        value: {
          data: {
            profile: {
              userId: 67890,
              nickname: "Shared Options Listener",
            },
          },
        },
      };
    },
  };

  const provider: PlatformLibraryProvider = createNetEasePlatformLibraryProvider(options);

  assert(provider.id === "netease", "NetEase platform-library provider id should be stable");

  const preview = await assertOk(provider.preview({ areas: [] }));
  assert(preview.providerId === "netease", "preview should identify the provider");
  assert(preview.areas.length === 0, "Task 2 preview should not invent readable areas");

  const read = await assertOk(provider.readItems({ areas: [] }));
  assert(read.providerId === "netease", "readItems should identify the provider");
  assert(read.areas.length === 0, "Task 2 readItems should not invent readable items");
}

async function previewReturnsCurrentAccountIdentityWhenLoginStatusExposesIt(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path, query }) => {
      assert(path === "/login/status", "preview should read NetEase login status for account identity");
      assert(Object.keys(query).length === 0, "login status should not receive library-scope query parameters");

      return {
        ok: true,
        value: {
          data: {
            profile: {
              userId: 12345,
              nickname: "Quiet Listener",
            },
          },
        },
      };
    },
  });

  const preview = await assertOk(provider.preview({ areas: [] }));

  assert(preview.account?.providerAccountId === "12345", "preview should expose stable provider account id");
  assert(preview.account.stable === true, "NetEase user id should be stable");
  assert(preview.account.label === "Quiet Listener", "preview should expose provider account label when available");
  assert((preview.issues ?? []).length === 0, "successful account identity should not add account issues");
}

async function previewReportsLoginRequiredWhenAccountCannotBeProven(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async () => ({
      ok: true,
      value: {
        data: {
          profile: null,
        },
      },
    }),
  });

  const preview = await assertOk(provider.preview({ areas: [] }));

  assert(preview.account === undefined, "preview should omit account when login status has no usable account");
  assert(preview.issues?.[0]?.code === "login_required", "preview should report login_required");
  assert(preview.issues[0]?.retryable === true, "login_required should be retryable after user logs in");
}

async function previewReportsLoginRequiredForAnonymousAccountWithoutProfile(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async () => ({
      ok: true,
      value: {
        data: {
          account: {
            id: 123456,
            anonimousUser: true,
            status: -10,
          },
        },
      },
    }),
  });

  const preview = await assertOk(provider.preview({ areas: [] }));

  assert(preview.account === undefined, "anonymous NetEase account id should not prove provider account identity");
  assert(preview.issues?.[0]?.code === "login_required", "anonymous NetEase session should report login_required");
}

async function previewMapsLoginStatusFailureToProviderUnavailable(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      assert(path === "/login/status", "account resolution should read login status first");

      return {
        ok: false,
        error: {
          code: "source.provider_unavailable",
          message: "NetEase local API is unavailable.",
          module: "source",
          retryable: true,
        },
      };
    },
  });

  const preview = await assertOk(provider.preview({ areas: ["saved_recordings"] }));

  assert(preview.account === undefined, "provider-unavailable login status should not expose account");
  assert(preview.areas.length === 0, "provider-unavailable login status should not read areas");
  assert(preview.issues?.[0]?.code === "provider_unavailable", "login status failure should map provider_unavailable");
  assert(preview.issues[0]?.retryable === true, "provider unavailable should be retryable");
}

async function readItemsReturnsCurrentAccountIdentityWhenLoginStatusExposesIt(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      assert(path === "/login/status", "readItems should read NetEase login status for account identity");

      return {
        ok: true,
        value: {
          data: {
            account: {
              id: "account-2468",
              userName: "Account Listener",
            },
          },
        },
      };
    },
  });

  const read = await assertOk(provider.readItems({ areas: [] }));

  assert(read.account?.providerAccountId === "account-2468", "readItems should expose provider account id");
  assert(read.account.stable === true, "readItems account id should be stable");
  assert(read.account.label === "Account Listener", "readItems should expose account label when available");
  assert((read.issues ?? []).length === 0, "successful read account identity should not add account issues");
}

async function previewReportsLoginRequiredWhenRequestedAccountDoesNotMatchCurrentSession(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async () => ({
      ok: true,
      value: {
        data: {
          profile: {
            userId: 13579,
            nickname: "Different Listener",
          },
        },
      },
    }),
  });

  const preview = await assertOk(provider.preview({ providerAccountId: "24680", areas: [] }));

  assert(preview.account === undefined, "preview should not expose a different current account");
  assert(preview.issues?.[0]?.code === "login_required", "preview should require login to the requested account");
}

async function previewDefaultsToReadableAreasWithExactCounts(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 5050,
                nickname: "Preview Listener",
              },
            },
          },
        };
      }

      if (path === "/likelist") {
        return { ok: true, value: { code: 200, ids: [] } };
      }

      if (path === "/album/sublist") {
        return { ok: true, value: { code: 200, count: 0, data: [] } };
      }

      if (path === "/artist/sublist") {
        return { ok: true, value: { code: 200, data: [], count: 0 } };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const preview = await assertOk(provider.preview({}));

  assert(
    preview.areas.map((area) => area.area).join(",") === "saved_recordings,saved_releases,saved_artists",
    "preview should default to first-slice readable areas",
  );
  assert(
    preview.areas.every((area) => area.availability === "readable"),
    "default preview areas should be readable",
  );
  assert(
    preview.areas.every((area) => area.count?.certainty === "exact" && area.count.value === 0),
    "empty readable areas should return exact zero counts",
  );
}

async function previewDiscoveryReportsUnsupportedAreas(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 6060,
                nickname: "Discovery Listener",
              },
            },
          },
        };
      }

      if (path === "/likelist") {
        return { ok: true, value: { code: 200, ids: [] } };
      }

      if (path === "/album/sublist") {
        return { ok: true, value: { code: 200, count: 0, data: [] } };
      }

      if (path === "/artist/sublist") {
        return { ok: true, value: { code: 200, data: [], count: 0 } };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const preview = await assertOk(provider.preview({ discovery: true }));
  const playlists = preview.areas.find((area) => area.area === "playlists");
  const listeningHistory = preview.areas.find((area) => area.area === "listening_history");

  assert(playlists?.availability === "unsupported", "discovery should report playlists as unsupported");
  assert(playlists.issues?.[0]?.code === "scope_unsupported", "playlists should use standard unsupported issue");
  assert(
    listeningHistory?.availability === "unsupported",
    "discovery should report listening history as unsupported",
  );
  assert(
    listeningHistory.issues?.[0]?.code === "scope_unsupported",
    "listening history should use standard unsupported issue",
  );
}

async function previewReturnsBoundedLightweightSamples(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path, query }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 7070,
                nickname: "Sample Listener",
              },
            },
          },
        };
      }

      if (path === "/likelist") {
        return { ok: true, value: { code: 200, ids: [1, 2] } };
      }

      if (path === "/song/detail") {
        assert(query.ids === "1", "preview samples should respect sampleLimitPerArea");
        return {
          ok: true,
          value: {
            code: 200,
            songs: [
              {
                id: 1,
                name: "Sample Track",
                ar: [{ name: "Sample Artist" }],
              },
            ],
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const preview = await assertOk(
    provider.preview({ areas: ["saved_recordings"], sampleLimitPerArea: 1 }),
  );
  const sample = preview.areas[0]?.samples?.[0];

  assert(preview.areas[0]?.count?.certainty === "exact", "preview should still include exact count");
  assert(preview.areas[0]?.count?.value === 2, "preview count should be based on all liked ids");
  assert(sample?.label === "Sample Track - Sample Artist", "sample should include display label");
  assert(sample.itemKind === "saved_recording", "sample should include item kind");
  assert(sample.targetKind === "recording", "sample should include target kind");
  assert(sample.artistLabels?.[0] === "Sample Artist", "sample should include generic artist labels");
  assert(!("sourceRef" in sample), "sample should not expose sourceRef");
  assert(!("canonicalHints" in sample), "sample should not expose canonical hints");
  assert(!("raw" in sample), "sample should not expose raw provider payload");
}

async function previewReturnsReleaseAndArtistSamples(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 8080,
                nickname: "Sample Listener",
              },
            },
          },
        };
      }

      if (path === "/album/sublist") {
        return {
          ok: true,
          value: {
            code: 200,
            data: [
              { id: 10, name: "Sample Album", artists: [{ name: "Release Artist" }] },
              { id: 11, name: "Extra Album", artists: [{ name: "Extra Artist" }] },
            ],
          },
        };
      }

      if (path === "/artist/sublist") {
        return {
          ok: true,
          value: {
            code: 200,
            data: [
              { id: 20, name: "Sample Followed Artist" },
              { id: 21, name: "Extra Followed Artist" },
            ],
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const preview = await assertOk(
    provider.preview({ areas: ["saved_releases", "saved_artists"], sampleLimitPerArea: 1 }),
  );
  const releaseArea = preview.areas.find((area) => area.area === "saved_releases");
  const artistArea = preview.areas.find((area) => area.area === "saved_artists");
  const releaseSample = releaseArea?.samples?.[0];
  const artistSample = artistArea?.samples?.[0];

  assert(releaseArea?.count?.certainty === "exact", "release preview should include exact count");
  assert(releaseArea.count.value === 2, "release preview should count all returned releases");
  assert(releaseArea.samples?.length === 1, "release preview should respect sample limit");
  assert(releaseSample?.label === "Sample Album - Release Artist", "release sample should include display label");
  assert(releaseSample.itemKind === "saved_release", "release sample should include item kind");
  assert(releaseSample.targetKind === "release", "release sample should include target kind");
  assert(releaseSample.artistLabels?.[0] === "Release Artist", "release sample should include artist labels");
  assert(!("sourceRef" in releaseSample), "release sample should not expose sourceRef");
  assert(!("raw" in releaseSample), "release sample should not expose raw provider payload");

  assert(artistArea?.count?.certainty === "exact", "artist preview should include exact count");
  assert(artistArea.count.value === 2, "artist preview should count all returned artists");
  assert(artistArea.samples?.length === 1, "artist preview should respect sample limit");
  assert(artistSample?.label === "Sample Followed Artist", "artist sample should include display label");
  assert(artistSample.itemKind === "followed_artist", "artist sample should include item kind");
  assert(artistSample.targetKind === "artist", "artist sample should include target kind");
  assert(!("sourceRef" in artistSample), "artist sample should not expose sourceRef");
  assert(!("raw" in artistSample), "artist sample should not expose raw provider payload");
}

async function previewMapsRequesterTimeoutToUnavailableIssue(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 9090,
                nickname: "Timeout Preview Listener",
              },
            },
          },
        };
      }

      if (path === "/likelist") {
        return {
          ok: false,
          error: {
            code: "source.timeout",
            message: "NetEase local API timed out.",
            module: "source",
            retryable: true,
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const preview = await assertOk(provider.preview({ areas: ["saved_recordings"] }));
  const area = preview.areas[0];

  assert(area?.availability === "unavailable", "timeout preview area should be unavailable");
  assert(area.issues?.[0]?.code === "timeout", "timeout preview area should use timeout issue");
  assert(area.issues[0]?.retryable === true, "timeout issue should be retryable");
}

async function readItemsMapsSavedRecordingsToGenericItems(): Promise<void> {
  const paths: string[] = [];
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path, query }) => {
      paths.push(path);

      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 1010,
                nickname: "Recording Listener",
              },
            },
          },
        };
      }

      if (path === "/likelist") {
        assert(query.uid === "1010", "saved recordings should use the proven account id");
        return { ok: true, value: { code: 200, ids: [98765] } };
      }

      if (path === "/song/detail") {
        assert(query.ids === "98765", "saved recordings should fetch song details by liked ids");
        return {
          ok: true,
          value: {
            code: 200,
            songs: [
              {
                id: 98765,
                name: "Kept Track",
                ar: [{ name: "Kept Artist" }],
                al: { name: "Kept Release" },
                dt: 246000,
              },
            ],
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_recordings"] }));
  const area = read.areas[0];
  const item = area?.items[0];

  assert(paths.join(",") === "/login/status,/likelist,/song/detail", "saved recordings should use expected endpoints");
  assert(area?.area === "saved_recordings", "read result should include saved_recordings area");
  assert(area.status === "complete", "successful saved recordings read should be complete");
  assert(item?.providerId === "netease", "item should identify provider");
  assert(item.itemKind === "saved_recording", "item kind should be generic saved recording");
  assert(item.targetKind === "recording", "target kind should be generic recording");
  assert(item.label === "Kept Track - Kept Artist", "item label should be generic display label");
  assert(item.sourceRef.namespace === "source:netease", "source ref should use NetEase source namespace");
  assert(item.sourceRef.kind === "track", "source ref should identify NetEase track object");
  assert(item.sourceRef.id === "98765", "source ref should use stable NetEase track id");
  assert(item.canonicalHints?.label === "Kept Track", "canonical hints should include generic recording label");
  assert(item.canonicalHints?.artistLabels?.[0] === "Kept Artist", "canonical hints should include artist labels");
  assert(item.canonicalHints.releaseLabel === "Kept Release", "canonical hints should include release label");
  assert(item.canonicalHints.durationMs === 246000, "canonical hints should include duration when available");
  assert(!("raw" in item), "provider item should not expose raw provider payload");
}

async function readItemsBatchesSavedRecordingDetails(): Promise<void> {
  const detailRequests: string[] = [];
  const likedIds = Array.from({ length: 1001 }, (_, index) => index + 1);
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path, query }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 1111,
                nickname: "Large Recording Listener",
              },
            },
          },
        };
      }

      if (path === "/likelist") {
        return { ok: true, value: { code: 200, ids: likedIds } };
      }

      if (path === "/song/detail") {
        assert(query.ids !== undefined, "song detail request should include ids");
        detailRequests.push(query.ids);
        const songs = query.ids.split(",").map((id) => ({
          id,
          name: `Track ${id}`,
        }));

        return { ok: true, value: { code: 200, songs } };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_recordings"] }));

  assert(read.areas[0]?.items.length === 1001, "saved recordings should read every liked song detail");
  assert(detailRequests.length === 2, "song detail reads should be batched below the API limit");
  assert(detailRequests[0]?.split(",").length === 1000, "first song detail batch should use API maximum size");
  assert(detailRequests[1] === "1001", "remaining saved recordings should be fetched in a final batch");
}

async function readItemsMapsSavedReleasesToGenericItems(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              account: {
                id: 2020,
                userName: "Release Listener",
              },
            },
          },
        };
      }

      if (path === "/album/sublist") {
        return {
          ok: true,
          value: {
            code: 200,
            data: [
              {
                id: 112233,
                name: "Kept Album",
                artists: [{ name: "Album Artist" }],
              },
            ],
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_releases"] }));
  const area = read.areas[0];
  const item = area?.items[0];

  assert(area?.area === "saved_releases", "read result should include saved_releases area");
  assert(area.status === "complete", "successful saved releases read should be complete");
  assert(item?.itemKind === "saved_release", "item kind should be generic saved release");
  assert(item.targetKind === "release", "target kind should be generic release");
  assert(item.label === "Kept Album - Album Artist", "release label should include artist when available");
  assert(item.sourceRef.namespace === "source:netease", "release source ref should use NetEase source namespace");
  assert(item.sourceRef.kind === "album", "source ref should identify NetEase album object");
  assert(item.sourceRef.id === "112233", "source ref should use stable NetEase album id");
  assert(item.canonicalHints?.label === "Kept Album", "release hints should include generic release label");
  assert(item.canonicalHints?.artistLabels?.[0] === "Album Artist", "release hints should include artist labels");
  assert(!("raw" in item), "release item should not expose raw provider payload");
}

async function readItemsPaginatesSavedReleases(): Promise<void> {
  const offsets: string[] = [];
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path, query }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              account: {
                id: 2222,
                userName: "Paged Release Listener",
              },
            },
          },
        };
      }

      if (path === "/album/sublist") {
        assert(query.offset !== undefined, "saved releases request should include offset");
        offsets.push(query.offset);
        assert(query.limit === "100", "saved releases should request stable page sizes");

        if (query.offset === "0") {
          return {
            ok: true,
            value: {
              code: 200,
              count: 2,
              data: [{ id: 1, name: "First Album" }],
            },
          };
        }

        if (query.offset === "100") {
          return {
            ok: true,
            value: {
              code: 200,
              count: 2,
              data: [{ id: 2, name: "Second Album" }],
            },
          };
        }
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_releases"] }));

  assert(offsets.join(",") === "0,100", "saved releases should follow count-driven pagination");
  assert(read.areas[0]?.items.length === 2, "saved releases should include items from every page");
}

async function readItemsMapsSavedArtistsToGenericItems(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 3030,
                nickname: "Artist Listener",
              },
            },
          },
        };
      }

      if (path === "/artist/sublist") {
        return {
          ok: true,
          value: {
            code: 200,
            data: [
              {
                id: 445566,
                name: "Kept Artist",
              },
            ],
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_artists"] }));
  const area = read.areas[0];
  const item = area?.items[0];

  assert(area?.area === "saved_artists", "read result should include saved_artists area");
  assert(area.status === "complete", "successful saved artists read should be complete");
  assert(item?.itemKind === "followed_artist", "item kind should be generic followed artist");
  assert(item.targetKind === "artist", "target kind should be generic artist");
  assert(item.label === "Kept Artist", "artist item label should be generic artist label");
  assert(item.sourceRef.namespace === "source:netease", "artist source ref should use NetEase source namespace");
  assert(item.sourceRef.kind === "artist", "source ref should identify NetEase artist object");
  assert(item.sourceRef.id === "445566", "source ref should use stable NetEase artist id");
  assert(item.canonicalHints?.label === "Kept Artist", "artist hints should include generic artist label");
  assert(!("raw" in item), "artist item should not expose raw provider payload");
}

async function readItemsPaginatesSavedArtists(): Promise<void> {
  const offsets: string[] = [];
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path, query }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 3333,
                nickname: "Paged Artist Listener",
              },
            },
          },
        };
      }

      if (path === "/artist/sublist") {
        assert(query.offset !== undefined, "saved artists request should include offset");
        offsets.push(query.offset);
        assert(query.limit === "100", "saved artists should request stable page sizes");

        if (query.offset === "0") {
          return {
            ok: true,
            value: {
              code: 200,
              count: 2,
              data: [{ id: 10, name: "First Artist" }],
            },
          };
        }

        if (query.offset === "100") {
          return {
            ok: true,
            value: {
              code: 200,
              count: 2,
              data: [{ id: 20, name: "Second Artist" }],
            },
          };
        }
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_artists"] }));

  assert(offsets.join(",") === "0,100", "saved artists should follow count-driven pagination");
  assert(read.areas[0]?.items.length === 2, "saved artists should include items from every page");
}

async function readItemsSkipsProviderItemsWithoutStableSourceRefs(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 4040,
                nickname: "Sparse Listener",
              },
            },
          },
        };
      }

      if (path === "/artist/sublist") {
        return {
          ok: true,
          value: {
            code: 200,
            data: [{ name: "No Stable Id Artist" }],
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_artists"] }));

  assert(read.areas[0]?.items.length === 0, "items without stable source refs should not be returned");
}

async function readItemsReportsUnsupportedAreas(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      assert(path === "/login/status", "unsupported read should only need account identity");

      return {
        ok: true,
        value: {
          data: {
            profile: {
              userId: 5151,
              nickname: "Unsupported Listener",
            },
          },
        },
      };
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["playlists", "listening_history"] }));

  assert(read.areas.length === 2, "unsupported read should return requested area results");
  assert(
    read.areas.every((area) => area.status === "unavailable"),
    "unsupported areas should be unavailable for item reads",
  );
  assert(
    read.areas.every((area) => area.items.length === 0),
    "unsupported areas should not invent read items",
  );
  assert(
    read.areas.every((area) => area.issues?.[0]?.code === "scope_unsupported"),
    "unsupported areas should use scope_unsupported issue",
  );
}

async function readItemsKeepsOtherAreasWhenOneAreaFails(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 6161,
                nickname: "Mixed Listener",
              },
            },
          },
        };
      }

      if (path === "/likelist") {
        return {
          ok: false,
          error: {
            code: "source.provider_unavailable",
            message: "NetEase failed liked songs.",
            module: "source",
            retryable: true,
          },
        };
      }

      if (path === "/artist/sublist") {
        return {
          ok: true,
          value: {
            code: 200,
            count: 1,
            data: [{ id: 77, name: "Still Read Artist" }],
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_recordings", "saved_artists"] }));
  const failed = read.areas.find((area) => area.area === "saved_recordings");
  const complete = read.areas.find((area) => area.area === "saved_artists");

  assert(failed?.status === "failed", "failed readable area should report failed status");
  assert(failed.items.length === 0, "failed area should not invent items");
  assert(failed.issues?.[0]?.code === "provider_unavailable", "provider failures should map to provider_unavailable");
  assert(complete?.status === "complete", "other readable areas should still complete");
  assert(complete.items.length === 1, "successful area should keep its items");
}

async function readItemsMapsMalformedProviderPayload(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 6262,
                nickname: "Malformed Listener",
              },
            },
          },
        };
      }

      if (path === "/likelist") {
        return {
          ok: true,
          value: {
            code: 200,
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_recordings"] }));
  const area = read.areas[0];

  assert(area?.status === "failed", "malformed payload should fail the area read");
  assert(area.items.length === 0, "malformed payload should not invent items");
  assert(area.issues?.[0]?.code === "malformed_response", "malformed payload should use malformed_response");
  assert(area.issues[0]?.retryable === false, "malformed response should not be retryable by default");
}

async function readItemsMapsRateLimitedProviderPayload(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 6363,
                nickname: "Rate Limited Listener",
              },
            },
          },
        };
      }

      if (path === "/album/sublist") {
        return {
          ok: true,
          value: {
            code: 429,
            message: "Too many requests.",
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_releases"] }));
  const area = read.areas[0];

  assert(area?.status === "failed", "rate-limited payload should fail the area read");
  assert(area.issues?.[0]?.code === "rate_limited", "rate-limited payload should use rate_limited");
  assert(area.issues[0]?.retryable === true, "rate-limited issue should be retryable");
}

async function readItemsReportsPartialWhenRecordingDetailBatchFails(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path, query }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 7171,
                nickname: "Partial Recording Listener",
              },
            },
          },
        };
      }

      if (path === "/likelist") {
        return {
          ok: true,
          value: {
            code: 200,
            ids: Array.from({ length: 1001 }, (_, index) => index + 1),
          },
        };
      }

      if (path === "/song/detail") {
        assert(query.ids !== undefined, "song detail request should include ids");

        if (query.ids === "1001") {
          return {
            ok: false,
            error: {
              code: "source.provider_unavailable",
              message: "NetEase failed final song detail batch.",
              module: "source",
              retryable: true,
            },
          };
        }

        return {
          ok: true,
          value: {
            code: 200,
            songs: query.ids.split(",").map((id) => ({
              id,
              name: `Partial Track ${id}`,
            })),
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_recordings"] }));
  const area = read.areas[0];

  assert(area?.status === "partial", "saved recordings should report partial when a later batch fails");
  assert(area.items.length === 1000, "partial saved recordings should keep successfully read items");
  assert(area.issues?.[0]?.code === "partial_read", "partial saved recordings should report partial_read");
}

async function readItemsReportsPartialWhenPaginationFailsAfterItems(): Promise<void> {
  const provider = createNetEasePlatformLibraryProvider({
    requestJson: async ({ path, query }) => {
      if (path === "/login/status") {
        return {
          ok: true,
          value: {
            data: {
              profile: {
                userId: 8181,
                nickname: "Partial Page Listener",
              },
            },
          },
        };
      }

      if (path === "/album/sublist") {
        if (query.offset === "0") {
          return {
            ok: true,
            value: {
              code: 200,
              count: 2,
              data: [{ id: 1, name: "First Partial Album" }],
            },
          };
        }

        return {
          ok: false,
          error: {
            code: "source.provider_unavailable",
            message: "NetEase failed next album page.",
            module: "source",
            retryable: true,
          },
        };
      }

      throw new Error(`unexpected request path: ${path}`);
    },
  });

  const read = await assertOk(provider.readItems({ areas: ["saved_releases"] }));
  const area = read.areas[0];

  assert(area?.status === "partial", "saved releases should report partial when a later page fails");
  assert(area.items.length === 1, "partial saved releases should keep successfully read items");
  assert(area.issues?.[0]?.code === "partial_read", "partial saved releases should report partial_read");
}

await createsPlatformLibraryProviderWithSharedRequesterOptions();
await previewReturnsCurrentAccountIdentityWhenLoginStatusExposesIt();
await previewReportsLoginRequiredWhenAccountCannotBeProven();
await previewReportsLoginRequiredForAnonymousAccountWithoutProfile();
await previewMapsLoginStatusFailureToProviderUnavailable();
await readItemsReturnsCurrentAccountIdentityWhenLoginStatusExposesIt();
await previewReportsLoginRequiredWhenRequestedAccountDoesNotMatchCurrentSession();
await previewDefaultsToReadableAreasWithExactCounts();
await previewDiscoveryReportsUnsupportedAreas();
await previewReturnsBoundedLightweightSamples();
await previewReturnsReleaseAndArtistSamples();
await previewMapsRequesterTimeoutToUnavailableIssue();
await readItemsMapsSavedRecordingsToGenericItems();
await readItemsBatchesSavedRecordingDetails();
await readItemsMapsSavedReleasesToGenericItems();
await readItemsPaginatesSavedReleases();
await readItemsMapsSavedArtistsToGenericItems();
await readItemsPaginatesSavedArtists();
await readItemsSkipsProviderItemsWithoutStableSourceRefs();
await readItemsReportsUnsupportedAreas();
await readItemsKeepsOtherAreasWhenOneAreaFails();
await readItemsMapsMalformedProviderPayload();
await readItemsMapsRateLimitedProviderPayload();
await readItemsReportsPartialWhenRecordingDetailBatchFails();
await readItemsReportsPartialWhenPaginationFailsAfterItems();
