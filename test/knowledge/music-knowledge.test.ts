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
            relations: [],
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
  const resultWithUnsupportedRelationFocus = await knowledge.query({
    query: {
      text: "anything",
      relationFocus: ["lineup"],
    } as never,
  });
  const filtersOnly = await knowledge.query({
    query: {
      filters: { tags: { include: ["ambient"] } },
    } as never,
  });
  const emptyTagQuery = await knowledge.query({
    query: {
      tagQuery: [],
    } as never,
  });
  const emptyNormalizedTagQuery = await knowledge.query({
    query: {
      tagQuery: ["   "],
    } as never,
  });
  const overlappingTagFilters = await knowledge.query({
    query: {
      text: "anything",
      filters: {
        tags: {
          include: [" Ambient "],
          exclude: ["ambient"],
        },
      },
    } as never,
  });
  const emptyFieldQuery = await knowledge.query({
    query: {
      fieldQuery: {},
    } as never,
  });
  const multipleStructuredEntries = await knowledge.query({
    query: {
      tagQuery: ["ambient"],
      fieldQuery: { artist: "Stars of the Lid" },
    } as never,
  });
  const excludedTagQueryOverlap = await knowledge.query({
    query: {
      tagQuery: [" Ambient "],
      filters: {
        tags: {
          exclude: ["ambient"],
        },
      },
    } as never,
  });

  assert(!result.ok, "invalid knowledge query should fail explicitly");
  assert(result.error.code === "knowledge.invalid_query", "invalid query should be rejected before provider lookup");
  assert(!resultWithBothInputs.ok, "knowledge query with two primary inputs should fail explicitly");
  assert(
    resultWithBothInputs.error.code === "knowledge.invalid_query",
    "query with both text and canonicalRef should be rejected",
  );
  assert(!resultWithUnsupportedRelationFocus.ok, "unsupported relation focus should fail explicitly");
  assert(
    resultWithUnsupportedRelationFocus.error.code === "knowledge.invalid_query",
    "unsupported relation focus should be rejected before provider lookup",
  );
  assert(!filtersOnly.ok, "filters-only knowledge query should fail explicitly");
  assert(filtersOnly.error.code === "knowledge.invalid_query", "filters should not be a query entry");
  assert(!emptyTagQuery.ok, "empty tag query should fail explicitly");
  assert(emptyTagQuery.error.code === "knowledge.invalid_query", "empty tag arrays should be rejected");
  assert(!emptyNormalizedTagQuery.ok, "empty normalized tag values should fail explicitly");
  assert(
    emptyNormalizedTagQuery.error.code === "knowledge.invalid_query",
    "empty normalized tag values should be rejected",
  );
  assert(!overlappingTagFilters.ok, "overlapping include/exclude tag filters should fail explicitly");
  assert(
    overlappingTagFilters.error.code === "knowledge.invalid_query",
    "overlapping tag filters should be rejected",
  );
  assert(!emptyFieldQuery.ok, "empty field query should fail explicitly");
  assert(emptyFieldQuery.error.code === "knowledge.invalid_query", "empty field query should be rejected");
  assert(!multipleStructuredEntries.ok, "tagQuery and fieldQuery should be mutually exclusive");
  assert(
    multipleStructuredEntries.error.code === "knowledge.invalid_query",
    "structured query entries should be mutually exclusive",
  );
  assert(!excludedTagQueryOverlap.ok, "tag query tags should not overlap excluded filters");
  assert(
    excludedTagQueryOverlap.error.code === "knowledge.invalid_query",
    "overlapping tagQuery and exclude filters should be rejected",
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

async function routesStructuredTagQueriesWithNormalizedTags(): Promise<void> {
  const registry = createPluginRegistry();
  let capturedQuery: unknown;
  const provider: KnowledgeProvider = {
    id: "fixture-knowledge",
    query: async (input) => {
      capturedQuery = input.query;
      return { ok: true, value: { items: [] } };
    },
  };

  await assertOk(
    registry.registerProvider({
      slot: "knowledge",
      providerId: provider.id,
      provider,
    }),
  );

  const knowledge = createMusicKnowledgeService({ pluginRegistry: registry });
  await assertOk(
    knowledge.query({
      query: {
        tagQuery: [" Ambient ", "ambient", "Post   Rock"],
        filters: {
          tags: {
            include: [" Shoegaze "],
            exclude: [" New Age "],
          },
        },
        limit: 3,
      },
    }),
  );

  const query = capturedQuery as {
    tagQuery?: string[];
    filters?: { tags?: { include?: string[]; exclude?: string[] } };
  };

  assert(query.tagQuery?.join(",") === "ambient,post rock", "tagQuery should be normalized and deduplicated");
  assert(query.filters?.tags?.include?.[0] === "shoegaze", "included tags should be normalized");
  assert(query.filters?.tags?.exclude?.[0] === "new age", "excluded tags should be normalized");
}

async function wrapsProviderContinuationCursors(): Promise<void> {
  const registry = createPluginRegistry();
  const capturedCursors: Array<string | undefined> = [];
  const provider: KnowledgeProvider = {
    id: "fixture-knowledge",
    query: async (input) => {
      capturedCursors.push(input.query.cursor);

      return {
        ok: true,
        value: {
          items: [],
          ...(input.query.cursor === undefined ? { nextCursor: "provider-page-2" } : {}),
        },
      };
    },
  };

  await assertOk(
    registry.registerProvider({
      slot: "knowledge",
      providerId: provider.id,
      provider,
    }),
  );

  const knowledge = createMusicKnowledgeService({ pluginRegistry: registry });
  const firstPage = await assertOk(knowledge.query({ query: { text: "continuation", limit: 1 } }));
  assert(firstPage.nextCursor !== undefined, "service should return a public continuation cursor");
  assert(firstPage.nextCursor !== "provider-page-2", "service should not expose provider-local cursor directly");

  await assertOk(knowledge.query({ query: { text: "continuation", limit: 5, cursor: firstPage.nextCursor } }));
  const mismatchedQuery = await knowledge.query({
    query: {
      text: "different continuation",
      cursor: firstPage.nextCursor,
    },
  });

  assert(capturedCursors[0] === undefined, "first provider call should not receive a cursor");
  assert(capturedCursors[1] === "provider-page-2", "service should route decoded provider cursor to provider");
  assert(!mismatchedQuery.ok, "cursor with a changed query shape should fail");
  assert(mismatchedQuery.error.code === "knowledge.invalid_query", "cursor mismatch should be invalid query");
}

await queriesKnowledgeProvidersAsProviderAttributedItems();
await reportsMissingKnowledgeProvider();
await preservesProviderWarnings();
await rejectsInvalidKnowledgeQueryBeforeProviderLookup();
await routesCanonicalContextToProviders();
await routesStructuredTagQueriesWithNormalizedTags();
await wrapsProviderContinuationCursors();
