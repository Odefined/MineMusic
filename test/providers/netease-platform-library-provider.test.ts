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
      throw new Error(`Task 2 provider factory should not read NetEase payloads yet: ${path}`);
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

await createsPlatformLibraryProviderWithSharedRequesterOptions();
