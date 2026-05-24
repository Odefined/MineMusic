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

await createsPlatformLibraryProviderWithSharedRequesterOptions();
await previewReturnsCurrentAccountIdentityWhenLoginStatusExposesIt();
await previewReportsLoginRequiredWhenAccountCannotBeProven();
await readItemsReturnsCurrentAccountIdentityWhenLoginStatusExposesIt();
await previewReportsLoginRequiredWhenRequestedAccountDoesNotMatchCurrentSession();
await readItemsMapsSavedRecordingsToGenericItems();
await readItemsMapsSavedReleasesToGenericItems();
await readItemsMapsSavedArtistsToGenericItems();
await readItemsSkipsProviderItemsWithoutStableSourceRefs();
