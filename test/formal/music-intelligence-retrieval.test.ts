import assert from "node:assert/strict";

import {
  refKey,
} from "../../src/contracts/index.js";
import type {
  MaterialEntityKind,
  ProviderMaterialCandidate,
  Ref,
  SourceEntity,
  SourceQuery,
  SourceTrack,
} from "../../src/contracts/index.js";
import {
  DEFAULT_RETRIEVAL_LIMIT,
  MAX_RETRIEVAL_POOL_GROUP_SIZE,
  MAX_RETRIEVAL_POOL_TOTAL,
  MusicIntelligenceError,
  createRetrievalQueryService,
  isMusicIntelligenceError,
  type CreateRetrievalQueryServiceInput,
  type RetrievalEffectiveQuery,
  type RetrievalPool,
  type RetrievalPoolFilter,
  type RetrievalQueryHit,
  type RetrievalQueryInput,
  type RetrievalQueryMaterialCandidateHit,
  type RetrievalQueryMaterialHit,
  type RetrievalQueryResult,
  type RetrievalQueryService,
} from "../../src/music_intelligence/index.js";
import {
  DEFAULT_OWNER_SCOPE,
  createMaterialTextProjectionCommands,
  createMusicDataPlatformRetrievalWorkspace,
  createMusicDataPlatformRetrievalReadPort,
  createOwnerCatalogProjectionCommands,
  createSourceLibraryRef,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformRetrievalResultSetSchema,
  musicDataPlatformSourceLibrarySchema,
} from "../../src/music_data_platform/index.js";
import type {
  MusicDataPlatformRetrievalWorkspace,
  MusicDataPlatformRetrievalMaterialRow,
  MusicDataPlatformRetrievalReadPort,
  MusicDataPlatformRetrievalSearchInput,
  MusicDataPlatformRetrievalSearchPage,
  RetrievalFreshness,
  RetrievalReadCursorPosition,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import { SqliteMusicDatabase } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

export type _createRetrievalQueryServiceInputShape = Expect<
  Equal<keyof CreateRetrievalQueryServiceInput, "readPort" | "mixedRetrievalWorkspace" | "providerSearch">
>;

export type _retrievalQueryServiceShape = Expect<
  Equal<keyof RetrievalQueryService, "query">
>;

export type _retrievalQueryServiceQueryReturnShape = Expect<
  Equal<ReturnType<RetrievalQueryService["query"]>, Promise<RetrievalQueryResult>>
>;

export type _retrievalQueryInputShape = Expect<
  Equal<
    keyof RetrievalQueryInput,
    "ownerScope" | "text" | "materialKind" | "pools" | "order" | "limit" | "cursor" | "sessionId"
  >
>;

export type _retrievalEffectiveQueryShape = Expect<
  Equal<
    keyof RetrievalEffectiveQuery,
    "ownerScope" | "text" | "materialKind" | "pools" | "order"
  >
>;

export type _retrievalQueryResultShape = Expect<
  Equal<keyof RetrievalQueryResult, "query" | "basis" | "hits" | "page" | "freshness">
>;

export type _retrievalQueryHitShape = Expect<
  Equal<
    keyof RetrievalQueryHit,
    "kind" | "display" | "rankScore" | "matchedText" | "pools" | "basis"
  >
>;

export type _retrievalQueryMaterialHitShape = Expect<
  Equal<
    keyof RetrievalQueryMaterialHit,
    "kind" | "materialRef" | "materialKind" | "display" | "rankScore" | "matchedText" | "pools" | "basis"
  >
>;

export type _retrievalQueryMaterialCandidateHitShape = Expect<
  Equal<
    keyof RetrievalQueryMaterialCandidateHit,
    "kind" | "materialCandidateRef" | "display" | "rankScore" | "matchedText" | "pools" | "basis"
  >
>;

export type _retrievalPoolFilterShape = Expect<
  Equal<keyof RetrievalPoolFilter, "allOf" | "anyOf" | "noneOf">
>;

export type _retrievalPoolShape = Expect<
  Equal<
    RetrievalPool,
    | { kind: "local_catalog" }
    | { kind: "source_library"; ref: Ref }
    | { kind: "owner_relation"; ref: Ref }
    | { kind: "provider_search"; providerId: string; limit?: number }
  >
>;

const defaultHarness = createReadPortHarness([
  {
    rows: [],
  },
]);
const defaultResult = await defaultHarness.service.query({});
assert.deepEqual(defaultHarness.searchInputs, [{
  ownerScope: "local",
  order: "recently_added",
  limit: DEFAULT_RETRIEVAL_LIMIT,
}]);
assert.deepEqual(defaultHarness.freshnessInputs, ["local"]);
assert.deepEqual(defaultResult.query, {
  ownerScope: "local",
  order: "recently_added",
});
assert.deepEqual(defaultResult.basis, {
  ownerCatalogVisibilityApplied: true,
  blockedMaterialsExcluded: true,
});
assert.deepEqual(defaultResult.page, {
  limit: DEFAULT_RETRIEVAL_LIMIT,
});
assert.deepEqual(defaultResult.freshness, {
  status: "current",
});

const textHarness = createReadPortHarness([{
  rows: [],
}]);
const textResult = await textHarness.service.query({
  text: "  Plainsong　LIVE  ",
  limit: 5,
});
assert.deepEqual(textHarness.searchInputs, [{
  ownerScope: "local",
  text: "plainsong live",
  order: "text_relevance",
  limit: 5,
}]);
assert.deepEqual(textResult.query, {
  ownerScope: "local",
  text: "plainsong live",
  order: "text_relevance",
});

const unicodeTextHarness = createReadPortHarness([{
  rows: [],
}]);
await unicodeTextHarness.service.query({
  text: "  Café　Del   Mar ",
  limit: 4,
});
assert.deepEqual(unicodeTextHarness.searchInputs, [{
  ownerScope: "local",
  text: "café del mar",
  order: "text_relevance",
  limit: 4,
}]);

const normalizedEmptyHarness = createReadPortHarness([{
  rows: [],
}]);
await normalizedEmptyHarness.service.query({
  text: "   ",
  limit: 3,
});
assert.deepEqual(normalizedEmptyHarness.searchInputs, [{
  ownerScope: "local",
  order: "recently_added",
  limit: 3,
}]);
await assertMusicIntelligenceError(
  () => normalizedEmptyHarness.service.query({
    text: "   ",
    order: "text_relevance",
  }),
  "music_intelligence.retrieval_query_invalid",
);

const droppedTextHarness = createReadPortHarness([{
  rows: [],
}]);
const droppedTextResult = await droppedTextHarness.service.query({
  text: "--- !!!",
  limit: 3,
});
assert.deepEqual(droppedTextHarness.searchInputs, [{
  ownerScope: "local",
  order: "recently_added",
  limit: 3,
}]);
assert.deepEqual(droppedTextResult.query, {
  ownerScope: "local",
  order: "recently_added",
});
await assertMusicIntelligenceError(
  () => droppedTextHarness.service.query({
    text: "--- !!!",
    order: "text_relevance",
  }),
  "music_intelligence.retrieval_query_invalid",
);

const validationHarness = createReadPortHarness([{
  rows: [],
}]);
await assertMusicIntelligenceError(
  () => validationHarness.service.query({ ownerScope: "other" }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => validationHarness.service.query({ limit: 0 }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => validationHarness.service.query({ limit: 101 }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => validationHarness.service.query({ limit: 1.5 }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => validationHarness.service.query({
    materialKind: "playlist" as MaterialEntityKind,
  }),
  "music_intelligence.retrieval_query_invalid",
);

const libraryPoolB = sourceLibraryRef("saved_source_track", "bbb");
const libraryPoolA = {
  ...sourceLibraryRef("saved_source_track", "aaa"),
  label: "caller label must not affect query identity",
};
const favoritePool = ownerRelationPoolRef("favorite", "fav");
const poolHarness = createReadPortHarness([{
  rows: [],
}]);
const poolResult = await poolHarness.service.query({
  pools: {
    allOf: [
      sourceLibraryPool(libraryPoolB),
      sourceLibraryPool(libraryPoolA),
      sourceLibraryPool(libraryPoolA),
    ],
    anyOf: [],
    noneOf: [ownerRelationPool(favoritePool)],
  },
  limit: 7,
});
assert.deepEqual(poolHarness.searchInputs, [{
  ownerScope: "local",
  poolFilter: {
    allOf: [
      refWithoutLabel(libraryPoolA),
      refWithoutLabel(libraryPoolB),
    ],
    noneOf: [favoritePool],
  },
  order: "recently_added",
  limit: 7,
}]);
assert.deepEqual(poolResult.query.pools, {
  allOf: [
    sourceLibraryPool(refWithoutLabel(libraryPoolA)),
    sourceLibraryPool(refWithoutLabel(libraryPoolB)),
  ],
  noneOf: [ownerRelationPool(favoritePool)],
});

const emptyPoolHarness = createReadPortHarness([{
  rows: [],
}]);
const emptyPoolResult = await emptyPoolHarness.service.query({
  pools: {
    allOf: [],
    anyOf: [],
    noneOf: [],
  },
});
assert.equal(emptyPoolResult.query.pools, undefined);
assert.deepEqual(emptyPoolHarness.searchInputs, [{
  ownerScope: "local",
  order: "recently_added",
  limit: DEFAULT_RETRIEVAL_LIMIT,
}]);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    poolFilter: {
      allOf: [libraryPoolA],
    },
  } as unknown as RetrievalQueryInput),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      allOf: Array.from({ length: MAX_RETRIEVAL_POOL_GROUP_SIZE + 1 }, (_, index) =>
        sourceLibraryPool(sourceLibraryRef("saved_source_track", `cap_group_${index}`)),
      ),
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      allOf: Array.from({ length: MAX_RETRIEVAL_POOL_GROUP_SIZE }, (_, index) =>
        sourceLibraryPool(sourceLibraryRef("saved_source_track", `cap_total_all_${index}`)),
      ),
      anyOf: Array.from({ length: MAX_RETRIEVAL_POOL_GROUP_SIZE }, (_, index) =>
        sourceLibraryPool(sourceLibraryRef("saved_source_album", `cap_total_any_${index}`)),
      ),
      noneOf: [
        sourceLibraryPool(sourceLibraryRef("followed_source_artist", "cap_total_none")),
      ],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: [] as unknown as RetrievalPoolFilter,
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: "not pools" as unknown as RetrievalPoolFilter,
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: null as unknown as RetrievalPoolFilter,
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      allOf: {} as unknown as RetrievalPool[],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      anyOf: "not an array" as unknown as RetrievalPool[],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      allOf: [libraryPoolA as unknown as RetrievalPool],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      allOf: [sourceLibraryPool(libraryPoolA)],
      noneOf: [sourceLibraryPool(libraryPoolA)],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      anyOf: [sourceLibraryPool(materialRef("recording", "m_not_a_pool"))],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      anyOf: [ownerRelationPool(ownerRelationPoolRef("blocked", "blocked"))],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
const localCatalogAnyOfHarness = createReadPortHarness([{
  rows: [materialRow({
    materialRef: materialRef("recording", "m_local_catalog_positive"),
  })],
}]);
const localCatalogAnyOfResult = await localCatalogAnyOfHarness.service.query({
  pools: {
    anyOf: [
      { kind: "local_catalog" },
      sourceLibraryPool(libraryPoolA),
    ],
  },
});
assert.deepEqual(localCatalogAnyOfHarness.searchInputs, [{
  ownerScope: "local",
  order: "recently_added",
  limit: DEFAULT_RETRIEVAL_LIMIT,
}]);
assert.deepEqual(localCatalogAnyOfResult.query.pools, {
  anyOf: [
    { kind: "local_catalog" },
    sourceLibraryPool(refWithoutLabel(libraryPoolA)),
  ],
});
assert.deepEqual(localCatalogAnyOfResult.hits[0]?.basis, {
  textMatched: false,
  poolFilterApplied: true,
  positivePoolMatched: true,
});
const localCatalogAllOfHarness = createReadPortHarness([{
  rows: [],
}]);
await localCatalogAllOfHarness.service.query({
  pools: {
    allOf: [
      { kind: "local_catalog" },
      sourceLibraryPool(libraryPoolA),
    ],
  },
});
assert.deepEqual(localCatalogAllOfHarness.searchInputs, [{
  ownerScope: "local",
  poolFilter: {
    allOf: [refWithoutLabel(libraryPoolA)],
  },
  order: "recently_added",
  limit: DEFAULT_RETRIEVAL_LIMIT,
}]);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      noneOf: [{ kind: "local_catalog" }],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      anyOf: [{
        kind: "provider_search",
        providerId: "netease",
        limit: 20,
      }],
    },
    text: "plainsong",
  }),
  "music_intelligence.provider_search_pool_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      allOf: [{
        kind: "provider_search",
        providerId: "netease",
      }],
    },
    text: "plainsong",
  }),
  "music_intelligence.provider_search_pool_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      anyOf: [
        {
          kind: "provider_search",
          providerId: "netease",
        },
        {
          kind: "provider_search",
          providerId: "netease",
          limit: 20,
        },
      ],
    },
    text: "plainsong",
  }),
  "music_intelligence.provider_search_pool_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      anyOf: [
        {
          kind: "provider_search",
          providerId: "spotify",
          limit: 10,
        },
        {
          kind: "provider_search",
          providerId: "spotify",
          limit: 10,
        },
      ],
    },
    text: "plainsong",
  }),
  "music_intelligence.provider_search_pool_invalid",
);
await assertMusicIntelligenceError(
  () => poolHarness.service.query({
    pools: {
      anyOf: [{
        kind: "provider_search",
        providerId: "netease",
        text: "pool level text",
      } as unknown as RetrievalPool],
    },
    text: "plainsong",
  }),
  "music_intelligence.provider_search_pool_invalid",
);

const fixtureMixedDatabase = initializedDatabase();
const fixtureProviderSearchCalls: {
  providerId: string;
  query: SourceQuery;
  sessionId?: string;
}[] = [];
const fixtureMixedService = createRetrievalQueryService({
  readPort: throwingReadPort(),
  mixedRetrievalWorkspace: createMusicDataPlatformRetrievalWorkspace({
    database: fixtureMixedDatabase,
  }),
  providerSearch: {
    async search(input) {
      fixtureProviderSearchCalls.push({
        providerId: input.providerId,
        query: input.query,
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      });

      return {
        providerId: input.providerId,
        query: input.query,
        candidates: [
          providerCandidate(sourceTrackEntity("fixture_1", "fixture alpha one")),
          providerCandidate(sourceTrackEntity("fixture_2", "fixture alpha two")),
        ],
      };
    },
  },
});
const fixtureMixedPageOne = await fixtureMixedService.query({
  text: "fixture alpha",
  pools: {
    anyOf: [{
      kind: "provider_search",
      providerId: "netease",
    }],
  },
  limit: 1,
  sessionId: "s_fixture",
});
assert.deepEqual(fixtureProviderSearchCalls, [{
  providerId: "netease",
  query: {
    text: "fixture alpha",
    limit: 2,
    offset: 0,
  },
  sessionId: "s_fixture",
}]);
assert.deepEqual(fixtureMixedPageOne.basis, {
  ownerCatalogVisibilityApplied: false,
  blockedMaterialsExcluded: true,
});
assert.equal(fixtureMixedPageOne.hits[0]?.kind, "material_candidate");
assert.equal(
  fixtureMixedPageOne.hits[0]?.kind === "material_candidate"
    ? fixtureMixedPageOne.hits[0].materialCandidateRef.namespace
    : undefined,
  "material_candidate",
);
assert.equal(typeof fixtureMixedPageOne.page.nextCursor, "string");
const fixtureMixedCursor = fixtureMixedPageOne.page.nextCursor;
if (fixtureMixedCursor === undefined) {
  throw new Error("Expected fixture mixed query to expose a result-set cursor.");
}
const fixtureMixedPageTwo = await fixtureMixedService.query({
  text: "fixture alpha",
  pools: {
    anyOf: [{
      kind: "provider_search",
      providerId: "netease",
    }],
  },
  limit: 2,
  cursor: fixtureMixedCursor,
  sessionId: "s_fixture",
});
assert.equal(fixtureProviderSearchCalls.length, 1);
assert.equal(fixtureMixedPageTwo.hits[0]?.kind, "material_candidate");
fixtureMixedDatabase.close();

{
  const mixedWorkspace = createMixedWorkspaceHarness();
  const providerSearchCalls: {
    providerId: string;
    query: SourceQuery;
    sessionId?: string;
  }[] = [];
  const service = createRetrievalQueryService({
    readPort: throwingReadPort(),
    mixedRetrievalWorkspace: mixedWorkspace.workspace,
    providerSearch: {
      async search(input) {
        providerSearchCalls.push({
          providerId: input.providerId,
          query: input.query,
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        });
        return {
          providerId: input.providerId,
          query: input.query,
          candidates: [],
        };
      },
    },
  });

  await service.query({
    text: "Provider Limit",
    materialKind: "recording",
    pools: {
      anyOf: [{
        kind: "provider_search",
        providerId: "netease",
      }],
    },
    limit: 30,
    sessionId: "s_a",
  });
  await service.query({
    text: "Provider Limit",
    materialKind: "recording",
    pools: {
      anyOf: [{
        kind: "provider_search",
        providerId: "netease",
      }],
    },
    limit: 30,
    sessionId: "s_b",
  });

  assert.deepEqual(providerSearchCalls, [
    {
      providerId: "netease",
      query: {
        text: "provider limit",
        targetKinds: ["track"],
        limit: 50,
        offset: 0,
      },
      sessionId: "s_a",
    },
    {
      providerId: "netease",
      query: {
        text: "provider limit",
        targetKinds: ["track"],
        limit: 50,
        offset: 0,
      },
      sessionId: "s_b",
    },
  ]);
  assert.equal(mixedWorkspace.calls.length, 2);
  assert.equal(
    mixedWorkspace.calls[0]?.queryFingerprint,
    mixedWorkspace.calls[1]?.queryFingerprint,
  );
}

{
  const mixedWorkspace = createMixedWorkspaceHarness();
  const providerSearchCalls: SourceQuery[] = [];
  const service = createRetrievalQueryService({
    readPort: throwingReadPort(),
    mixedRetrievalWorkspace: mixedWorkspace.workspace,
    providerSearch: {
      async search(input) {
        providerSearchCalls.push(input.query);
        return {
          providerId: input.providerId,
          query: input.query,
          candidates: [],
        };
      },
    },
  });

  await service.query({
    text: "Kind Map",
    materialKind: "album",
    pools: {
      anyOf: [{
        kind: "provider_search",
        providerId: "netease",
      }],
    },
    limit: 3,
  });
  await service.query({
    text: "Kind Map",
    materialKind: "artist",
    pools: {
      anyOf: [{
        kind: "provider_search",
        providerId: "netease",
      }],
    },
    limit: 4,
  });

  assert.deepEqual(providerSearchCalls, [
    {
      text: "kind map",
      targetKinds: ["album"],
      limit: 6,
      offset: 0,
    },
    {
      text: "kind map",
      targetKinds: ["artist"],
      limit: 8,
      offset: 0,
    },
  ]);

  for (const materialKind of ["release", "work"] as const) {
    await assertMusicIntelligenceError(
      () => service.query({
        text: "Kind Map",
        materialKind,
        pools: {
          anyOf: [{
            kind: "provider_search",
            providerId: "netease",
          }],
        },
      }),
      "music_intelligence.provider_search_pool_invalid",
    );
  }
}

{
  const mixedWorkspace = createMixedWorkspaceHarness();
  const providerSearchCalls: string[] = [];
  const resolvers: ((value: {
    providerId: string;
    query: SourceQuery;
    candidates: readonly ProviderMaterialCandidate[];
  }) => void)[] = [];
  const service = createRetrievalQueryService({
    readPort: throwingReadPort(),
    mixedRetrievalWorkspace: mixedWorkspace.workspace,
    providerSearch: {
      search(input) {
        providerSearchCalls.push(input.providerId);
        return new Promise((resolve) => {
          resolvers.push(resolve);
        });
      },
    },
  });
  const queryPromise = service.query({
    text: "Parallel Search",
    pools: {
      anyOf: [
        {
          kind: "provider_search",
          providerId: "netease",
          limit: 1,
        },
        {
          kind: "provider_search",
          providerId: "spotify",
          limit: 1,
        },
      ],
    },
  });

  await flushMicrotasks();

  assert.deepEqual(providerSearchCalls, ["netease", "spotify"]);
  assert.equal(mixedWorkspace.calls.length, 0);

  resolvers[1]?.({
    providerId: "spotify",
    query: {
      text: "parallel search",
      limit: 1,
      offset: 0,
    },
    candidates: [
      providerCandidate(sourceTrackEntityForProvider("spotify", "sp_1", "parallel search spotify")),
    ],
  });
  resolvers[0]?.({
    providerId: "netease",
    query: {
      text: "parallel search",
      limit: 1,
      offset: 0,
    },
    candidates: [
      providerCandidate(sourceTrackEntityForProvider("netease", "ne_1", "parallel search netease")),
    ],
  });
  await queryPromise;

  assert.equal(mixedWorkspace.calls.length, 1);
  assert.equal(mixedWorkspace.calls[0]?.providerCandidates?.length, 2);
}

{
  const mixedWorkspace = createMixedWorkspaceHarness();
  const failedService = createRetrievalQueryService({
    readPort: throwingReadPort(),
    mixedRetrievalWorkspace: mixedWorkspace.workspace,
    providerSearch: {
      async search() {
        throw new Error("provider exploded");
      },
    },
  });

  await assertMusicIntelligenceError(
    () => failedService.query({
      text: "Provider Failure",
      pools: {
        anyOf: [{
          kind: "provider_search",
          providerId: "netease",
        }],
      },
    }),
    "music_intelligence.provider_search_failed",
  );
  assert.equal(mixedWorkspace.calls.length, 0);

  const unavailableService = createRetrievalQueryService({
    readPort: throwingReadPort(),
    mixedRetrievalWorkspace: mixedWorkspace.workspace,
    providerSearch: {
      async search() {
        throw new MusicIntelligenceError({
          code: "music_intelligence.provider_search_unavailable",
          message: "Provider search unavailable.",
        });
      },
    },
  });
  await assertMusicIntelligenceError(
    () => unavailableService.query({
      text: "Provider Failure",
      pools: {
        anyOf: [{
          kind: "provider_search",
          providerId: "netease",
        }],
      },
    }),
    "music_intelligence.provider_search_unavailable",
  );

  const invalidResultService = createRetrievalQueryService({
    readPort: throwingReadPort(),
    mixedRetrievalWorkspace: mixedWorkspace.workspace,
    providerSearch: {
      async search(input) {
        return {
          providerId: "wrong_provider",
          query: input.query,
          candidates: [],
        };
      },
    },
  });
  await assertMusicIntelligenceError(
    () => invalidResultService.query({
      text: "Provider Failure",
      pools: {
        anyOf: [{
          kind: "provider_search",
          providerId: "netease",
        }],
      },
    }),
    "music_intelligence.provider_search_result_invalid",
  );

  const invalidTargetKindService = createRetrievalQueryService({
    readPort: throwingReadPort(),
    mixedRetrievalWorkspace: mixedWorkspace.workspace,
    providerSearch: {
      async search(input) {
        return {
          providerId: input.providerId,
          query: input.query,
          candidates: [
            providerCandidate(sourceTrackEntity("wrong_kind", "wrong target kind")),
          ],
        };
      },
    },
  });
  await assertMusicIntelligenceError(
    () => invalidTargetKindService.query({
      text: "Provider Failure",
      materialKind: "album",
      pools: {
        anyOf: [{
          kind: "provider_search",
          providerId: "netease",
        }],
      },
    }),
    "music_intelligence.provider_search_result_invalid",
  );

  const invalidOptionalSourceFieldService = createRetrievalQueryService({
    readPort: throwingReadPort(),
    mixedRetrievalWorkspace: mixedWorkspace.workspace,
    providerSearch: {
      async search(input) {
        return {
          providerId: input.providerId,
          query: input.query,
          candidates: [
            providerCandidate({
              ...sourceTrackEntity("bad_optional_field", "bad optional field"),
              albumLabel: 123,
            } as unknown as SourceEntity),
          ],
        };
      },
    },
  });
  await assertMusicIntelligenceError(
    () => invalidOptionalSourceFieldService.query({
      text: "Provider Failure",
      pools: {
        anyOf: [{
          kind: "provider_search",
          providerId: "netease",
        }],
      },
    }),
    "music_intelligence.provider_search_result_invalid",
  );
  assert.equal(mixedWorkspace.calls.length, 0);
}

for (const [status, code] of [
  ["result_set_expired", "music_intelligence.retrieval_result_set_expired"],
  ["material_candidate_expired", "music_intelligence.material_candidate_expired"],
] as const) {
  const statusService = createRetrievalQueryService({
    readPort: throwingReadPort(),
    mixedRetrievalWorkspace: {
      searchMixedResultSet() {
        return { status };
      },
    } satisfies MusicDataPlatformRetrievalWorkspace,
    providerSearch: {
      async search(input) {
        return {
          providerId: input.providerId,
          query: input.query,
          candidates: [],
        };
      },
    },
  });

  await assertMusicIntelligenceError(
    () => statusService.query({
      text: "fixture alpha",
      pools: {
        anyOf: [{
          kind: "provider_search",
          providerId: "netease",
        }],
      },
      limit: 1,
    }),
    code,
  );
}

const firstCursorPosition = {
  order: "stable",
  materialRefKey: refKey(materialRef("recording", "m_page_1")),
} satisfies RetrievalReadCursorPosition;
const cursorHarness = createReadPortHarness([
  {
    rows: [materialRow({
      materialRef: materialRef("recording", "m_page_1"),
    })],
    nextCursorPosition: firstCursorPosition,
  },
  {
    rows: [materialRow({
      materialRef: materialRef("recording", "m_page_2"),
    })],
  },
]);
const firstCursorResult = await cursorHarness.service.query({
  order: "stable",
  limit: 1,
});
assert.equal(typeof firstCursorResult.page.nextCursor, "string");
const nextCursor = firstCursorResult.page.nextCursor;
if (nextCursor === undefined) {
  throw new Error("Expected opaque cursor to be present.");
}
const secondCursorResult = await cursorHarness.service.query({
  order: "stable",
  limit: 50,
  cursor: nextCursor,
});
assert.deepEqual(cursorHarness.searchInputs[1], {
  ownerScope: "local",
  order: "stable",
  limit: 50,
  cursorPosition: firstCursorPosition,
});
assert.deepEqual(
  materialHitRefKeys(secondCursorResult.hits),
  [refKey(materialRef("recording", "m_page_2"))],
);

await assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    materialKind: "album",
    cursor: nextCursor,
  }),
  "music_intelligence.retrieval_cursor_invalid",
);
await assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "recently_added",
    cursor: nextCursor,
  }),
  "music_intelligence.retrieval_cursor_invalid",
);
await assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    text: "plainsong",
    cursor: nextCursor,
  }),
  "music_intelligence.retrieval_cursor_invalid",
);
await assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    pools: {
      anyOf: [sourceLibraryPool(libraryPoolA)],
    },
    cursor: nextCursor,
  }),
  "music_intelligence.retrieval_cursor_invalid",
);
await assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    cursor: Buffer.from("not json", "utf8").toString("base64url"),
  }),
  "music_intelligence.retrieval_cursor_invalid",
);
await assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    cursor: Buffer.from(JSON.stringify({
      version: 1,
      queryFingerprint: "rqf_old",
      position: firstCursorPosition,
    }), "utf8").toString("base64url"),
  }),
  "music_intelligence.retrieval_cursor_invalid",
);
// Cursor position shape must match its declared order: a text_relevance position missing
// its rank-evidence fields is rejected during decode, before any fingerprint comparison.
await assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    cursor: Buffer.from(JSON.stringify({
      version: 2,
      queryFingerprint: "rqf_anything",
      position: { order: "text_relevance", materialRefKey: "material:recording:m_x" },
    }), "utf8").toString("base64url"),
  }),
  "music_intelligence.retrieval_cursor_invalid",
);
// A present resultSetId must be non-empty.
await assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    cursor: Buffer.from(JSON.stringify({
      version: 2,
      queryFingerprint: "rqf_anything",
      position: firstCursorPosition,
      resultSetId: "",
    }), "utf8").toString("base64url"),
  }),
  "music_intelligence.retrieval_cursor_invalid",
);

const textHitRow = materialRow({
  materialRef: materialRef("recording", "m_text_hit"),
  titleText: "plainsong",
  artistText: "the cure",
  albumText: "disintegration",
  versionText: "live",
  matchedPoolRefs: [libraryPoolA],
  matchedTextFields: ["title", "version"],
  matchedTextTokensByField: [
    {
      field: "title",
      tokens: ["plainsong"],
    },
    {
      field: "version",
      tokens: ["live"],
    },
  ],
  matchedTokenCount: 2,
  rankScore: {
    kind: "fts_bm25",
    value: 4.2,
  },
});
const hitHarness = createReadPortHarness([{
  rows: [textHitRow],
  freshness: {
    status: "possibly_stale",
    dirtyTargetCount: 1,
  },
}]);
const hitResult = await hitHarness.service.query({
  text: "plainsong live",
  pools: {
    allOf: [sourceLibraryPool(libraryPoolA)],
  },
});
assert.deepEqual(hitResult.freshness, {
  status: "possibly_stale",
  dirtyTargetCount: 1,
});
assert.deepEqual(hitResult.hits, [{
  kind: "material",
  materialRef: textHitRow.materialRef,
  materialKind: "recording",
  display: {
    title: "plainsong",
    artistsText: "the cure",
    album: "disintegration",
    versionText: "live",
  },
  rankScore: {
    kind: "fts_bm25",
    value: 4.2,
  },
  matchedText: {
    fields: ["title", "version"],
    tokensByField: [
      {
        field: "title",
        tokens: ["plainsong"],
      },
      {
        field: "version",
        tokens: ["live"],
      },
    ],
    summary: "title matched plainsong; version matched live",
  },
  pools: {
    matched: [refWithoutLabel(libraryPoolA)],
  },
  basis: {
    textMatched: true,
    poolFilterApplied: true,
    positivePoolMatched: true,
  },
}]);

const recentTextHarness = createReadPortHarness([{
  rows: [materialRow({
    materialRef: materialRef("recording", "m_recent_text_hit"),
    titleText: "recent text",
    matchedTextFields: ["title"],
    matchedTextTokensByField: [{
      field: "title",
      tokens: ["recent"],
    }],
    matchedTokenCount: 1,
  })],
}]);
const recentTextResult = await recentTextHarness.service.query({
  text: "recent",
  order: "recently_added",
});
assert.deepEqual(recentTextResult.hits[0]?.matchedText, {
  fields: ["title"],
  tokensByField: [{
    field: "title",
    tokens: ["recent"],
  }],
  summary: "title matched recent",
});
assert.equal(recentTextResult.hits[0]?.rankScore, undefined);
assert.equal(recentTextResult.hits[0]?.basis.textMatched, true);

const stableRankHarness = createReadPortHarness([{
  rows: [
    materialRow({
      materialRef: materialRef("recording", "m_low_score_first"),
      titleText: "first",
      rankScore: {
        kind: "fts_bm25",
        value: 1,
      },
    }),
    materialRow({
      materialRef: materialRef("recording", "m_high_score_second"),
      titleText: "second",
      rankScore: {
        kind: "fts_bm25",
        value: 999,
      },
    }),
  ],
}]);
const stableRankResult = await stableRankHarness.service.query({
  order: "stable",
});
assert.deepEqual(
  materialHitRefKeys(stableRankResult.hits),
  [
    refKey(materialRef("recording", "m_low_score_first")),
    refKey(materialRef("recording", "m_high_score_second")),
  ],
);
assert.equal(stableRankResult.hits[0]?.rankScore, undefined);
assert.equal(stableRankResult.hits[1]?.rankScore, undefined);

const noPoolBasisHarness = createReadPortHarness([{
  rows: [materialRow({
    materialRef: materialRef("recording", "m_no_pool"),
  })],
}]);
assert.deepEqual((await noPoolBasisHarness.service.query({})).hits[0]?.basis, {
  textMatched: false,
  poolFilterApplied: false,
  positivePoolMatched: false,
});

const noneOfBasisHarness = createReadPortHarness([{
  rows: [materialRow({
    materialRef: materialRef("recording", "m_noneof_pool"),
  })],
}]);
assert.deepEqual((await noneOfBasisHarness.service.query({
  pools: {
    noneOf: [ownerRelationPool(favoritePool)],
  },
})).hits[0]?.basis, {
  textMatched: false,
  poolFilterApplied: true,
  positivePoolMatched: false,
});
assert.deepEqual(noneOfBasisHarness.searchInputs[0]?.poolFilter, {
  noneOf: [favoritePool],
});

const invalidRankHarness = createReadPortHarness([{
  rows: [materialRow({
    materialRef: materialRef("recording", "m_missing_rank"),
    matchedTextFields: ["title"],
    matchedTextTokensByField: [{
      field: "title",
      tokens: ["plain"],
    }],
    matchedTokenCount: 1,
  })],
}]);
await assertMusicIntelligenceError(
  () => invalidRankHarness.service.query({
    text: "plain",
  }),
  "music_intelligence.retrieval_result_invalid",
);

const missingTextFieldsHarness = createReadPortHarness([{
  rows: [materialRow({
    materialRef: materialRef("recording", "m_missing_text_fields"),
    matchedTextTokensByField: [{
      field: "title",
      tokens: ["plain"],
    }],
    matchedTokenCount: 1,
    rankScore: {
      kind: "fts_bm25",
      value: 1,
    },
  })],
}]);
await assertMusicIntelligenceError(
  () => missingTextFieldsHarness.service.query({
    text: "plain",
  }),
  "music_intelligence.retrieval_result_invalid",
);

const missingTextTokensHarness = createReadPortHarness([{
  rows: [materialRow({
    materialRef: materialRef("recording", "m_missing_text_tokens"),
    matchedTextFields: ["title"],
    matchedTokenCount: 1,
    rankScore: {
      kind: "fts_bm25",
      value: 1,
    },
  })],
}]);
await assertMusicIntelligenceError(
  () => missingTextTokensHarness.service.query({
    text: "plain",
  }),
  "music_intelligence.retrieval_result_invalid",
);

const missingTextTokenCountHarness = createReadPortHarness([{
  rows: [materialRow({
    materialRef: materialRef("recording", "m_missing_text_token_count"),
    matchedTextFields: ["title"],
    matchedTextTokensByField: [{
      field: "title",
      tokens: ["plain"],
    }],
    rankScore: {
      kind: "fts_bm25",
      value: 1,
    },
  })],
}]);
await assertMusicIntelligenceError(
  () => missingTextTokenCountHarness.service.query({
    text: "plain",
  }),
  "music_intelligence.retrieval_result_invalid",
);

const zeroTextTokenCountHarness = createReadPortHarness([{
  rows: [materialRow({
    materialRef: materialRef("recording", "m_zero_text_token_count"),
    matchedTextFields: ["title"],
    matchedTextTokensByField: [{
      field: "title",
      tokens: ["plain"],
    }],
    matchedTokenCount: 0,
    rankScore: {
      kind: "fts_bm25",
      value: 1,
    },
  })],
}]);
await assertMusicIntelligenceError(
  () => zeroTextTokenCountHarness.service.query({
    text: "plain",
  }),
  "music_intelligence.retrieval_result_invalid",
);

const integrationDatabase = initializedDatabase();
const integrationLibraryRef = mdpSourceLibraryRef(
  DEFAULT_OWNER_SCOPE,
  "7601",
  "saved_source_track",
);
const integrationAccentSource = sourceTrackEntity("7601", "café del mar");
const integrationLiltSourceOne = sourceTrackEntity("7602", "lilt horizon");
const integrationLiltSourceTwo = sourceTrackEntity("7603", "lilt night");
const integrationAccentMaterialRef = materialRef("recording", "m_integration_accent");
const integrationLiltMaterialRefOne = materialRef("recording", "m_integration_lilt_1");
const integrationLiltMaterialRefTwo = materialRef("recording", "m_integration_lilt_2");

integrationDatabase.transaction((db) => {
  const identity = createIdentityTestCommands(db, "2026-06-14T06:00:00.000Z");
  const libraries = createSourceLibraryRepositories({ db });

  bindSourceToMaterial(identity, integrationAccentSource, integrationAccentMaterialRef);
  bindSourceToMaterial(identity, integrationLiltSourceOne, integrationLiltMaterialRefOne);
  bindSourceToMaterial(identity, integrationLiltSourceTwo, integrationLiltMaterialRefTwo);
  upsertActualLibrary(
    libraries,
    integrationLibraryRef,
    DEFAULT_OWNER_SCOPE,
    "7601",
    "saved_source_track",
  );
  upsertActualLibraryItem(
    libraries,
    integrationLibraryRef,
    integrationAccentSource.sourceRef,
    "2026-06-14T06:01:00.000Z",
  );
  upsertActualLibraryItem(
    libraries,
    integrationLibraryRef,
    integrationLiltSourceOne.sourceRef,
    "2026-06-14T06:02:00.000Z",
  );
  upsertActualLibraryItem(
    libraries,
    integrationLibraryRef,
    integrationLiltSourceTwo.sourceRef,
    "2026-06-14T06:03:00.000Z",
  );
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-14T06:04:00.000Z",
  }).rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: integrationLibraryRef,
  });
  const textCommands = createMaterialTextProjectionCommands({
    db,
    now: "2026-06-14T06:05:00.000Z",
  });
  textCommands.rebuildMaterialTextDocument({ materialRef: integrationAccentMaterialRef });
  textCommands.rebuildMaterialTextDocument({ materialRef: integrationLiltMaterialRefOne });
  textCommands.rebuildMaterialTextDocument({ materialRef: integrationLiltMaterialRefTwo });
});

const integrationService = createRetrievalQueryService({
  readPort: createMusicDataPlatformRetrievalReadPort({
    db: integrationDatabase.context(),
  }),
});

const integrationAccentResult = await integrationService.query({
  text: "cafe",
  limit: 10,
});
assert.deepEqual(integrationAccentResult.query, {
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "cafe",
  order: "text_relevance",
});
assert.deepEqual(
  materialHitRefKeys(integrationAccentResult.hits),
  [refKey(integrationAccentMaterialRef)],
);
assert.equal(integrationAccentResult.hits[0]?.rankScore?.kind, "fts_bm25");
assert.deepEqual(integrationAccentResult.hits[0]?.matchedText, {
  fields: ["title"],
  tokensByField: [{
    field: "title",
    tokens: ["cafe"],
  }],
  summary: "title matched cafe",
});

const integrationTextPageOne = await integrationService.query({
  text: "lilt",
  limit: 1,
});
assert.equal(typeof integrationTextPageOne.page.nextCursor, "string");
const integrationNextCursor = integrationTextPageOne.page.nextCursor;
if (integrationNextCursor === undefined) {
  throw new Error("Expected integration text query to expose a continuation cursor.");
}
const integrationTextPageTwo = await integrationService.query({
  text: "lilt",
  limit: 1,
  cursor: integrationNextCursor,
});
assert.equal(integrationTextPageOne.hits.length, 1);
assert.equal(integrationTextPageTwo.hits.length, 1);
assert.notEqual(
  refKey(materialHitRef(integrationTextPageOne.hits[0])),
  refKey(materialHitRef(integrationTextPageTwo.hits[0])),
);
assert.deepEqual(
  [
    refKey(materialHitRef(integrationTextPageOne.hits[0])),
    refKey(materialHitRef(integrationTextPageTwo.hits[0])),
  ].sort(),
  [
    refKey(integrationLiltMaterialRefOne),
    refKey(integrationLiltMaterialRefTwo),
  ].sort(),
);

const integrationDroppedTextResult = await integrationService.query({
  text: "--- !!!",
  limit: 2,
});
assert.deepEqual(integrationDroppedTextResult.query, {
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "recently_added",
});
assert.deepEqual(
  materialHitRefKeys(integrationDroppedTextResult.hits),
  [
    refKey(integrationLiltMaterialRefTwo),
    refKey(integrationLiltMaterialRefOne),
  ],
);
await assertMusicIntelligenceError(
  () => integrationService.query({
    text: "--- !!!",
    order: "text_relevance",
  }),
  "music_intelligence.retrieval_query_invalid",
);
integrationDatabase.close();

function createReadPortHarness(pages: readonly (MusicDataPlatformRetrievalSearchPage & {
  freshness?: RetrievalFreshness;
})[]): {
  service: RetrievalQueryService;
  searchInputs: MusicDataPlatformRetrievalSearchInput[];
  freshnessInputs: string[];
} {
  const searchInputs: MusicDataPlatformRetrievalSearchInput[] = [];
  const freshnessInputs: string[] = [];
  let pageIndex = 0;
  let lastFreshness: RetrievalFreshness = {
    status: "current",
  };
  const readPort = {
    searchOwnerCatalogMaterials(input) {
      searchInputs.push(input);
      const page = pages[pageIndex];
      pageIndex += 1;

      if (page === undefined) {
        throw new Error("No fake retrieval page was configured for this call.");
      }

      if (page.freshness !== undefined) {
        lastFreshness = page.freshness;
      }

      return page;
    },
    getRetrievalFreshness(input) {
      freshnessInputs.push(input.ownerScope);
      return lastFreshness;
    },
  } satisfies MusicDataPlatformRetrievalReadPort;

  return {
    service: createRetrievalQueryService({
      readPort,
    }),
    searchInputs,
    freshnessInputs,
  };
}

function createMixedWorkspaceHarness(): {
  workspace: MusicDataPlatformRetrievalWorkspace;
  calls: Parameters<MusicDataPlatformRetrievalWorkspace["searchMixedResultSet"]>[0][];
} {
  const calls: Parameters<MusicDataPlatformRetrievalWorkspace["searchMixedResultSet"]>[0][] = [];

  return {
    calls,
    workspace: {
      searchMixedResultSet(input) {
        calls.push(input);
        return {
          status: "ok",
          resultSetId: `rs_fake_${calls.length}`,
          rows: [],
        };
      },
    },
  };
}

function materialRow(input: {
  materialRef: Ref;
  materialKind?: MaterialEntityKind;
  titleText?: string;
  artistText?: string;
  albumText?: string;
  versionText?: string;
  aliasText?: string;
  recentlyAddedAt?: string;
  matchedPoolRefs?: readonly Ref[];
  matchedTextFields?: MusicDataPlatformRetrievalMaterialRow["matchedTextFields"];
  matchedTextTokensByField?: MusicDataPlatformRetrievalMaterialRow["matchedTextTokensByField"];
  matchedTokenCount?: number;
  rankScore?: MusicDataPlatformRetrievalMaterialRow["rankScore"];
}): MusicDataPlatformRetrievalMaterialRow {
  return {
    materialRef: input.materialRef,
    materialKind: input.materialKind ?? "recording",
    titleText: input.titleText ?? "",
    artistText: input.artistText ?? "",
    albumText: input.albumText ?? "",
    versionText: input.versionText ?? "",
    aliasText: input.aliasText ?? "",
    recentlyAddedAt: input.recentlyAddedAt ?? "2026-06-14T00:00:00.000Z",
    matchedPoolRefs: (input.matchedPoolRefs ?? []).map((ref) => refWithoutLabel(ref)),
    matchedTextFields: input.matchedTextFields ?? [],
    ...(input.matchedTextTokensByField === undefined
      ? {}
      : { matchedTextTokensByField: input.matchedTextTokensByField }),
    ...(input.matchedTokenCount === undefined ? {} : { matchedTokenCount: input.matchedTokenCount }),
    ...(input.rankScore === undefined ? {} : { rankScore: input.rankScore }),
  };
}

async function assertMusicIntelligenceError(
  run: () => unknown | Promise<unknown>,
  code: MusicIntelligenceError["code"],
): Promise<void> {
  let thrown: unknown;

  try {
    await run();
  } catch (error) {
    thrown = error;
  }

  assert.equal(
    isMusicIntelligenceError(thrown) && thrown.code === code,
    true,
  );
}

function materialHitRefKeys(hits: readonly RetrievalQueryHit[]): readonly string[] {
  return hits.map((hit) => refKey(materialHitRef(hit)));
}

function materialHitRef(hit: RetrievalQueryHit | undefined): Ref {
  if (hit?.kind !== "material") {
    throw new Error("Expected Retrieval hit to be a material hit.");
  }

  return hit.materialRef;
}

function providerCandidate(sourceEntity: SourceEntity): ProviderMaterialCandidate {
  return { sourceEntity };
}

function throwingReadPort(): MusicDataPlatformRetrievalReadPort {
  return {
    searchOwnerCatalogMaterials() {
      throw new Error("Mixed fixture retrieval must not call the local retrieval read port.");
    },
    getRetrievalFreshness() {
      throw new Error("Mixed fixture retrieval must not call local retrieval freshness.");
    },
  };
}

function createIdentityTestCommands(
  db: Parameters<typeof createIdentityWriteCommands>[0]["db"],
  now: string,
) {
  return createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
}

function materialRef(kind: MaterialEntityKind, id: string): Ref {
  return {
    namespace: "material",
    kind,
    id,
  };
}

function sourceLibraryRef(kind: "saved_source_track" | "saved_source_album" | "followed_source_artist", id: string): Ref {
  return {
    namespace: "source_library",
    kind,
    id: `l_${id}`,
  };
}

function ownerRelationPoolRef(kind: string, id: string): Ref {
  return {
    namespace: "owner_material_relation_pool",
    kind,
    id: `rp_${id}`,
  };
}

function sourceLibraryPool(ref: Ref): RetrievalPool {
  return {
    kind: "source_library",
    ref,
  };
}

function ownerRelationPool(ref: Ref): RetrievalPool {
  return {
    kind: "owner_relation",
    ref,
  };
}

function refWithoutLabel(ref: Ref): Ref {
  return {
    namespace: ref.namespace,
    kind: ref.kind,
    id: ref.id,
  };
}

function initializedDatabase(): ReturnType<typeof SqliteMusicDatabase.open> {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformSourceLibrarySchema,
      musicDataPlatformOwnerRelationSchema,
      musicDataPlatformOwnerCatalogEntriesSchema,
      musicDataPlatformOwnerCatalogViewSchema,
      musicDataPlatformMaterialTextProjectionSchema,
      musicDataPlatformProjectionMaintenanceSchema,
      musicDataPlatformRetrievalResultSetSchema,
    ],
  });
  return database;
}

function bindSourceToMaterial(
  identity: ReturnType<typeof createIdentityTestCommands>,
  source: SourceEntity,
  nextMaterialRef: Ref,
): void {
  identity.upsertSourceRecord({ entity: source });
  identity.upsertMaterialRecord({
    materialRef: nextMaterialRef,
    kind: nextMaterialRef.kind as MaterialEntityKind,
  });
  identity.bindSourceToMaterial({
    sourceRef: source.sourceRef,
    materialRef: nextMaterialRef,
    makePrimary: true,
  });
}

function upsertActualLibrary(
  libraries: ReturnType<typeof createSourceLibraryRepositories>,
  libraryRef: Ref,
  ownerScope: string,
  providerAccountId: string,
  libraryKind: "saved_source_track" | "saved_source_album" | "followed_source_artist",
): void {
  libraries.libraries.upsert({
    libraryRef,
    ownerScope,
    providerId: "netease",
    providerAccountId,
    libraryKind,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  });
}

function upsertActualLibraryItem(
  libraries: ReturnType<typeof createSourceLibraryRepositories>,
  libraryRef: Ref,
  sourceRef: Ref,
  addedAt: string,
): void {
  libraries.items.upsert({
    libraryRef,
    sourceRefKey: refKey(sourceRef),
    addedAt,
    providerAddedAt: addedAt,
    firstImportedAt: addedAt,
  });
}

function sourceTrackEntity(id: string, title: string): SourceTrack {
  return sourceTrackEntityForProvider("netease", id, title);
}

function sourceTrackEntityForProvider(providerId: string, id: string, title: string): SourceTrack {
  return {
    kind: "track",
    sourceRef: sourceRefForProvider(providerId, "track", id),
    providerId,
    providerEntityId: id,
    label: title,
    title,
  };
}

function sourceRef(kind: "track" | "album" | "artist", id: string): Ref {
  return sourceRefForProvider("netease", kind, id);
}

function sourceRefForProvider(providerId: string, kind: "track" | "album" | "artist", id: string): Ref {
  return {
    namespace: `source_${providerId}`,
    kind,
    id,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function mdpSourceLibraryRef(
  ownerScope: string,
  providerAccountId: string,
  libraryKind: "saved_source_track" | "saved_source_album" | "followed_source_artist",
): Ref {
  return createSourceLibraryRef({
    ownerScope,
    providerId: "netease",
    providerAccountId,
    libraryKind,
  });
}
