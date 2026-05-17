import { createPluginRegistry } from "../../src/plugins/index.js";

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

async function registersAndLooksUpProvidersBySlot(): Promise<void> {
  const registry = createPluginRegistry();
  const sourceProvider = { id: "fixture-source" };
  const knowledgeProvider = { id: "fixture-source" };

  await assertOk(
    registry.registerProvider({
      slot: "source",
      providerId: "fixture",
      provider: sourceProvider,
    }),
  );
  await assertOk(
    registry.registerProvider({
      slot: "knowledge",
      providerId: "fixture",
      provider: knowledgeProvider,
    }),
  );

  const sourceProviders = await assertOk(registry.listProviders({ slot: "source" }));
  const knowledgeProviders = await assertOk(registry.listProviders({ slot: "knowledge" }));
  const storedSourceProvider = await assertOk(
    registry.getProvider({ slot: "source", providerId: "fixture" }),
  );
  const storedKnowledgeProvider = await assertOk(
    registry.getProvider({ slot: "knowledge", providerId: "fixture" }),
  );

  assert(sourceProviders.length === 1 && sourceProviders[0] === "fixture", "source slot should list provider");
  assert(
    knowledgeProviders.length === 1 && knowledgeProviders[0] === "fixture",
    "knowledge slot should list provider independently",
  );
  assert(storedSourceProvider === sourceProvider, "source provider lookup should return registered object");
  assert(
    storedKnowledgeProvider === knowledgeProvider,
    "provider ids should be scoped by capability slot",
  );
}

async function returnsStableErrorForMissingProvider(): Promise<void> {
  const registry = createPluginRegistry();
  const missing = await registry.getProvider({ slot: "source", providerId: "missing" });

  assert(!missing.ok, "missing provider lookup should fail");
  assert(missing.error.code === "plugin.provider_not_found", "missing provider should use stable error code");
  assert(missing.error.module === "plugins", "missing provider error should be owned by plugins");
  assert(missing.error.retryable === false, "missing provider error should not be retryable by default");

  const emptyList = await assertOk(registry.listProviders({ slot: "source" }));
  assert(emptyList.length === 0, "empty provider slot should still list successfully");
}

await registersAndLooksUpProvidersBySlot();
await returnsStableErrorForMissingProvider();
