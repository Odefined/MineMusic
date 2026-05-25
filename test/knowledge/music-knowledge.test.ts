import type { KnowledgeProvider } from "../../src/contracts/index.js";
import { createMusicKnowledgeService } from "../../src/knowledge/index.js";
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

async function queriesKnowledgeProvidersAsProviderAttributedItems(): Promise<void> {
  const registry = createPluginRegistry();
  const provider: KnowledgeProvider = {
    id: "fixture-knowledge",
    query: async () => ({
      ok: true,
      value: {
        items: [
          {
            kind: "structured",
            providerId: "fixture-knowledge",
            source: {
              ref: { namespace: "musicbrainz", kind: "recording", id: "mbid-1" },
            },
            rootNodeId: "recording:mbid-1",
            nodes: [
              {
                id: "recording:mbid-1",
                type: "recording",
                label: "Knowledge Track",
                ref: { namespace: "musicbrainz", kind: "recording", id: "mbid-1" },
              },
            ],
            edges: [],
          },
        ],
      },
    }),
  };
  await assertOk(
    registry.registerProvider({
      slot: "knowledge",
      providerId: provider.id,
      provider,
    }),
  );
  const knowledge = createMusicKnowledgeService({ pluginRegistry: registry });
  const result = await assertOk(
    knowledge.query({
      query: { text: "Knowledge Track", limit: 1 },
      sessionId: "session-1",
    }),
  );

  assert(result.items.length === 1, "knowledge service should return provider knowledge items");
  assert(result.items[0]?.kind === "structured", "knowledge output should keep structured items");
  assert(result.items[0]?.providerId === "fixture-knowledge", "knowledge output should keep provider attribution");
}

async function reportsMissingKnowledgeProvider(): Promise<void> {
  const knowledge = createMusicKnowledgeService({ pluginRegistry: createPluginRegistry() });
  const result = await knowledge.query({ query: { text: "anything" } });

  assert(!result.ok, "missing knowledge providers should fail explicitly");
  assert(result.error.code === "knowledge.no_provider", "missing provider should use stable knowledge error");
}

await queriesKnowledgeProvidersAsProviderAttributedItems();
await reportsMissingKnowledgeProvider();
