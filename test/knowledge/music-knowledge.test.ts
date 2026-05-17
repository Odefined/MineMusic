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

async function queriesKnowledgeProvidersWithoutClaimingPlayability(): Promise<void> {
  const registry = createPluginRegistry();
  const provider: KnowledgeProvider = {
    id: "fixture-knowledge",
    query: async () => ({
      ok: true,
      value: [
        {
          id: "material-knowledge-1",
          kind: "recording",
          label: "Knowledge Track",
          state: "confirmed_playable",
          playableLinks: [
            {
              url: "https://example.test/play",
              sourceRef: { namespace: "source:fixture", kind: "track", id: "track-1" },
            },
          ],
          evidence: [
            {
              kind: "metadata",
              source: { namespace: "musicbrainz", kind: "recording", id: "mbid-1" },
            },
          ],
        },
      ],
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

  assert(result.length === 1, "knowledge service should return provider material");
  assert(result[0]?.state === "grounded", "knowledge output should not claim playability");
  assert(result[0]?.playableLinks === undefined, "knowledge output should strip playable links");
}

async function reportsMissingKnowledgeProvider(): Promise<void> {
  const knowledge = createMusicKnowledgeService({ pluginRegistry: createPluginRegistry() });
  const result = await knowledge.query({ query: { text: "anything" } });

  assert(!result.ok, "missing knowledge providers should fail explicitly");
  assert(result.error.code === "knowledge.no_provider", "missing provider should use stable knowledge error");
}

await queriesKnowledgeProvidersWithoutClaimingPlayability();
await reportsMissingKnowledgeProvider();
