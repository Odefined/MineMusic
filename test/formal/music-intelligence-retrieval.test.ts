import assert from "node:assert/strict";

import {
  refKey,
} from "../../src/contracts/index.js";
import type {
  MaterialEntityKind,
  Ref,
  SourceEntity,
  SourceTrack,
} from "../../src/contracts/index.js";
import {
  DEFAULT_RETRIEVAL_LIMIT,
  MusicIntelligenceError,
  createRetrievalQueryService,
  isMusicIntelligenceError,
  type CreateRetrievalQueryServiceInput,
  type RetrievalEffectiveQuery,
  type RetrievalPoolFilter,
  type RetrievalQueryHit,
  type RetrievalQueryInput,
  type RetrievalQueryResult,
  type RetrievalQueryService,
} from "../../src/music_intelligence/index.js";
import {
  DEFAULT_OWNER_SCOPE,
  createMaterialTextProjectionCommands,
  createMusicDataPlatformRetrievalReadPort,
  createOwnerCatalogProjectionCommands,
  createSourceLibraryRef,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformSourceLibrarySchema,
} from "../../src/music_data_platform/index.js";
import type {
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
  Equal<keyof CreateRetrievalQueryServiceInput, "readPort">
>;

export type _retrievalQueryServiceShape = Expect<
  Equal<keyof RetrievalQueryService, "query">
>;

export type _retrievalQueryInputShape = Expect<
  Equal<
    keyof RetrievalQueryInput,
    "ownerScope" | "text" | "materialKind" | "poolFilter" | "order" | "limit" | "cursor"
  >
>;

export type _retrievalEffectiveQueryShape = Expect<
  Equal<
    keyof RetrievalEffectiveQuery,
    "ownerScope" | "text" | "materialKind" | "poolFilter" | "order"
  >
>;

export type _retrievalQueryResultShape = Expect<
  Equal<keyof RetrievalQueryResult, "query" | "basis" | "hits" | "page" | "freshness">
>;

export type _retrievalQueryHitShape = Expect<
  Equal<
    keyof RetrievalQueryHit,
    "materialRef" | "materialKind" | "display" | "rankScore" | "matchedText" | "pools" | "basis"
  >
>;

export type _retrievalPoolFilterShape = Expect<
  Equal<keyof RetrievalPoolFilter, "allOf" | "anyOf" | "noneOf">
>;

const defaultHarness = createReadPortHarness([
  {
    rows: [],
  },
]);
const defaultResult = defaultHarness.service.query({});
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
const textResult = textHarness.service.query({
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
unicodeTextHarness.service.query({
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
normalizedEmptyHarness.service.query({
  text: "   ",
  limit: 3,
});
assert.deepEqual(normalizedEmptyHarness.searchInputs, [{
  ownerScope: "local",
  order: "recently_added",
  limit: 3,
}]);
assertMusicIntelligenceError(
  () => normalizedEmptyHarness.service.query({
    text: "   ",
    order: "text_relevance",
  }),
  "music_intelligence.retrieval_query_invalid",
);

const droppedTextHarness = createReadPortHarness([{
  rows: [],
}]);
const droppedTextResult = droppedTextHarness.service.query({
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
assertMusicIntelligenceError(
  () => droppedTextHarness.service.query({
    text: "--- !!!",
    order: "text_relevance",
  }),
  "music_intelligence.retrieval_query_invalid",
);

const validationHarness = createReadPortHarness([{
  rows: [],
}]);
assertMusicIntelligenceError(
  () => validationHarness.service.query({ ownerScope: "other" }),
  "music_intelligence.retrieval_query_invalid",
);
assertMusicIntelligenceError(
  () => validationHarness.service.query({ limit: 0 }),
  "music_intelligence.retrieval_query_invalid",
);
assertMusicIntelligenceError(
  () => validationHarness.service.query({ limit: 101 }),
  "music_intelligence.retrieval_query_invalid",
);
assertMusicIntelligenceError(
  () => validationHarness.service.query({ limit: 1.5 }),
  "music_intelligence.retrieval_query_invalid",
);
assertMusicIntelligenceError(
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
const poolResult = poolHarness.service.query({
  poolFilter: {
    allOf: [libraryPoolB, libraryPoolA, libraryPoolA],
    anyOf: [],
    noneOf: [favoritePool],
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
assert.deepEqual(poolResult.query.poolFilter, {
  allOf: [
    refWithoutLabel(libraryPoolA),
    refWithoutLabel(libraryPoolB),
  ],
  noneOf: [favoritePool],
});

const emptyPoolHarness = createReadPortHarness([{
  rows: [],
}]);
const emptyPoolResult = emptyPoolHarness.service.query({
  poolFilter: {
    allOf: [],
    anyOf: [],
    noneOf: [],
  },
});
assert.equal(emptyPoolResult.query.poolFilter, undefined);
assert.deepEqual(emptyPoolHarness.searchInputs, [{
  ownerScope: "local",
  order: "recently_added",
  limit: DEFAULT_RETRIEVAL_LIMIT,
}]);
assertMusicIntelligenceError(
  () => poolHarness.service.query({
    poolFilter: {
      allOf: [libraryPoolA],
      noneOf: [libraryPoolA],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
assertMusicIntelligenceError(
  () => poolHarness.service.query({
    poolFilter: {
      anyOf: [materialRef("recording", "m_not_a_pool")],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);
assertMusicIntelligenceError(
  () => poolHarness.service.query({
    poolFilter: {
      anyOf: [ownerRelationPoolRef("blocked", "blocked")],
    },
  }),
  "music_intelligence.retrieval_query_invalid",
);

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
const firstCursorResult = cursorHarness.service.query({
  order: "stable",
  limit: 1,
});
assert.equal(typeof firstCursorResult.page.nextCursor, "string");
const nextCursor = firstCursorResult.page.nextCursor;
if (nextCursor === undefined) {
  throw new Error("Expected opaque cursor to be present.");
}
const secondCursorResult = cursorHarness.service.query({
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
  secondCursorResult.hits.map((hit) => refKey(hit.materialRef)),
  [refKey(materialRef("recording", "m_page_2"))],
);

assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    materialKind: "album",
    cursor: nextCursor,
  }),
  "music_intelligence.cursor_mismatch",
);
assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "recently_added",
    cursor: nextCursor,
  }),
  "music_intelligence.cursor_mismatch",
);
assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    text: "plainsong",
    cursor: nextCursor,
  }),
  "music_intelligence.cursor_mismatch",
);
assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    poolFilter: {
      anyOf: [libraryPoolA],
    },
    cursor: nextCursor,
  }),
  "music_intelligence.cursor_mismatch",
);
assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    cursor: Buffer.from("not json", "utf8").toString("base64url"),
  }),
  "music_intelligence.cursor_invalid",
);
assertMusicIntelligenceError(
  () => cursorHarness.service.query({
    order: "stable",
    cursor: Buffer.from(JSON.stringify({
      version: 2,
      queryFingerprint: "rqf_old",
      position: firstCursorPosition,
    }), "utf8").toString("base64url"),
  }),
  "music_intelligence.cursor_invalid",
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
const hitResult = hitHarness.service.query({
  text: "plainsong live",
  poolFilter: {
    allOf: [libraryPoolA],
  },
});
assert.deepEqual(hitResult.freshness, {
  status: "possibly_stale",
  dirtyTargetCount: 1,
});
assert.deepEqual(hitResult.hits, [{
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
const recentTextResult = recentTextHarness.service.query({
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
const stableRankResult = stableRankHarness.service.query({
  order: "stable",
});
assert.deepEqual(
  stableRankResult.hits.map((hit) => refKey(hit.materialRef)),
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
assert.deepEqual(noPoolBasisHarness.service.query({}).hits[0]?.basis, {
  textMatched: false,
  poolFilterApplied: false,
  positivePoolMatched: false,
});

const noneOfBasisHarness = createReadPortHarness([{
  rows: [materialRow({
    materialRef: materialRef("recording", "m_noneof_pool"),
  })],
}]);
assert.deepEqual(noneOfBasisHarness.service.query({
  poolFilter: {
    noneOf: [favoritePool],
  },
}).hits[0]?.basis, {
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
assertMusicIntelligenceError(
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
assertMusicIntelligenceError(
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
assertMusicIntelligenceError(
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
assertMusicIntelligenceError(
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
assertMusicIntelligenceError(
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

const integrationAccentResult = integrationService.query({
  text: "cafe",
  limit: 10,
});
assert.deepEqual(integrationAccentResult.query, {
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "cafe",
  order: "text_relevance",
});
assert.deepEqual(
  integrationAccentResult.hits.map((hit) => refKey(hit.materialRef)),
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

const integrationTextPageOne = integrationService.query({
  text: "lilt",
  limit: 1,
});
assert.equal(typeof integrationTextPageOne.page.nextCursor, "string");
const integrationNextCursor = integrationTextPageOne.page.nextCursor;
if (integrationNextCursor === undefined) {
  throw new Error("Expected integration text query to expose a continuation cursor.");
}
const integrationTextPageTwo = integrationService.query({
  text: "lilt",
  limit: 1,
  cursor: integrationNextCursor,
});
assert.equal(integrationTextPageOne.hits.length, 1);
assert.equal(integrationTextPageTwo.hits.length, 1);
assert.notEqual(
  refKey(integrationTextPageOne.hits[0]?.materialRef ?? materialRef("recording", "missing")),
  refKey(integrationTextPageTwo.hits[0]?.materialRef ?? materialRef("recording", "missing")),
);
assert.deepEqual(
  [
    refKey(integrationTextPageOne.hits[0]?.materialRef ?? materialRef("recording", "missing")),
    refKey(integrationTextPageTwo.hits[0]?.materialRef ?? materialRef("recording", "missing")),
  ].sort(),
  [
    refKey(integrationLiltMaterialRefOne),
    refKey(integrationLiltMaterialRefTwo),
  ].sort(),
);

const integrationDroppedTextResult = integrationService.query({
  text: "--- !!!",
  limit: 2,
});
assert.deepEqual(integrationDroppedTextResult.query, {
  ownerScope: DEFAULT_OWNER_SCOPE,
  order: "recently_added",
});
assert.deepEqual(
  integrationDroppedTextResult.hits.map((hit) => refKey(hit.materialRef)),
  [
    refKey(integrationLiltMaterialRefTwo),
    refKey(integrationLiltMaterialRefOne),
  ],
);
assertMusicIntelligenceError(
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

function assertMusicIntelligenceError(
  run: () => void,
  code: MusicIntelligenceError["code"],
): void {
  assert.throws(
    run,
    (error: unknown) =>
      isMusicIntelligenceError(error) &&
      error.code === code,
  );
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
  return {
    kind: "track",
    sourceRef: sourceRef("track", id),
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
  };
}

function sourceRef(kind: "track" | "album" | "artist", id: string): Ref {
  return {
    namespace: "source_netease",
    kind,
    id,
  };
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
