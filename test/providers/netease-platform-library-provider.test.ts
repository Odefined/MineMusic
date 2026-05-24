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

await createsPlatformLibraryProviderWithSharedRequesterOptions();
await previewReturnsCurrentAccountIdentityWhenLoginStatusExposesIt();
await previewReportsLoginRequiredWhenAccountCannotBeProven();
await readItemsReturnsCurrentAccountIdentityWhenLoginStatusExposesIt();
await previewReportsLoginRequiredWhenRequestedAccountDoesNotMatchCurrentSession();
