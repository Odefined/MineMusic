import type {
  CanonicalRecord,
  CanonicalRelation,
  KnowledgeProvider,
  Ref,
} from "../../src/contracts/index.js";
import { createMusicKnowledgeService } from "../../src/knowledge/index.js";
import { createPluginRegistry } from "../../src/plugins/index.js";
import type { CanonicalStorePort } from "../../src/ports/index.js";

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

async function preservesProviderWarnings(): Promise<void> {
  const registry = createPluginRegistry();
  const provider: KnowledgeProvider = {
    id: "fixture-knowledge",
    query: async () => ({
      ok: true,
      value: { items: [] },
      warnings: [
        {
          code: "knowledge.partial_result",
          message: "Provider returned a partial result.",
          module: "knowledge",
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
  const result = await knowledge.query({ query: { text: "anything" } });

  assert(result.ok, "knowledge query should succeed");
  assert(result.warnings?.length === 1, "knowledge service should preserve provider warnings");
  assert(result.warnings[0]?.code === "knowledge.partial_result", "warning code should be preserved");
}

async function rejectsInvalidKnowledgeQueryBeforeProviderLookup(): Promise<void> {
  const knowledge = createMusicKnowledgeService({ pluginRegistry: createPluginRegistry() });
  const result = await knowledge.query({ query: {} as never });
  const resultWithBothInputs = await knowledge.query({
    query: {
      text: "anything",
      canonicalRef: { namespace: "minemusic", kind: "recording", id: "canonical-1" },
    } as never,
  });

  assert(!result.ok, "invalid knowledge query should fail explicitly");
  assert(result.error.code === "knowledge.invalid_query", "invalid query should be rejected before provider lookup");
  assert(!resultWithBothInputs.ok, "knowledge query with two primary inputs should fail explicitly");
  assert(
    resultWithBothInputs.error.code === "knowledge.invalid_query",
    "query with both text and canonicalRef should be rejected",
  );
}

async function routesCanonicalContextToProviders(): Promise<void> {
  const registry = createPluginRegistry();
  const canonicalRef: Ref = { namespace: "minemusic", kind: "recording", id: "canonical-1" };
  const canonicalRecord: CanonicalRecord = {
    ref: canonicalRef,
    kind: "recording",
    label: "Canonical Track",
    status: "active",
    sourceRefs: [{ namespace: "musicbrainz", kind: "recording", id: "mbid-1" }],
    aliases: ["Canonical Track Alias"],
  };
  const relation: CanonicalRelation = {
    id: "relation-1",
    subjectRef: canonicalRef,
    predicate: "performed_by",
    objectKind: "artist",
    objectLabel: "Canonical Artist",
    sourceRef: { namespace: "source:fixture", kind: "recording", id: "source-1" },
    status: "provisional",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
  };
  let capturedContext:
    | {
        record?: CanonicalRecord;
        relations?: CanonicalRelation[];
      }
    | undefined;
  const provider: KnowledgeProvider = {
    id: "fixture-knowledge",
    query: async (input) => {
      capturedContext = input.canonicalContext;
      return { ok: true, value: { items: [] } };
    },
  };
  const canonicalStore: CanonicalStorePort = {
    get: async () => ({ ok: true, value: canonicalRecord }),
    findByLabel: async () => ({ ok: true, value: [] }),
    resolveSourceRef: async () => ({ ok: true, value: null }),
    createProvisional: async () => ({ ok: true, value: canonicalRecord }),
    attachSourceRef: async () => ({ ok: true, value: canonicalRecord }),
    recordProvisionalRelations: async () => ({ ok: true, value: [] }),
    listRelations: async () => ({ ok: true, value: [relation] }),
  };

  await assertOk(
    registry.registerProvider({
      slot: "knowledge",
      providerId: provider.id,
      provider,
    }),
  );

  const knowledge = createMusicKnowledgeService({ pluginRegistry: registry, canonicalStore });
  await assertOk(knowledge.query({ query: { canonicalRef } }));

  assert(capturedContext?.record?.label === "Canonical Track", "provider should receive canonical record context");
  assert(capturedContext?.relations?.[0]?.objectLabel === "Canonical Artist", "provider should receive relation context");
}

await queriesKnowledgeProvidersAsProviderAttributedItems();
await reportsMissingKnowledgeProvider();
await preservesProviderWarnings();
await rejectsInvalidKnowledgeQueryBeforeProviderLookup();
await routesCanonicalContextToProviders();
