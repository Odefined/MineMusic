import assert from "node:assert/strict";

import type { Ref, Result, StageError } from "../../src/contracts/kernel.js";
import type {
  LookupCursorStore,
  MusicDiscoveryLookupOutput,
  StageToolContext,
} from "../../src/contracts/stage_interface.js";
import {
  MusicIntelligenceError,
  type RetrievalQueryHit,
  type RetrievalQueryInput,
  type RetrievalQueryResult,
  type RetrievalQueryService,
} from "../../src/music_intelligence/index.js";
import {
  createInMemoryMusicScopeAvailabilityPort,
  createMusicDiscoveryLookupRegistration,
  musicDiscoveryInstrument,
  musicDiscoveryLookupDescriptor,
} from "../../src/music_intelligence/stage_adapter/index.js";
import {
  createStageInterface,
} from "../../src/stage_interface/index.js";

const libraryMaterialRef = ref("material", "recording", "m_library_whoo");
const candidateRef = ref("material_candidate", "provider_candidate", "mc_provider_whoo");
const sourceLibraryRef = ref("source_library", "saved_source_track", "l_saved_tracks");
const relationPoolRef = ref("owner_material_relation_pool", "favorite", "rp_favorite");

const scopeAvailability = createInMemoryMusicScopeAvailabilityPort({
  sourceLibraries: [
    {
      id: "scope_saved_recording",
      ref: sourceLibraryRef,
      providerName: "NetEase Cloud Music",
      relationName: "saved",
      targetKind: "recording",
    },
  ],
  relations: [
    {
      id: "scope_favorite_recording",
      ref: relationPoolRef,
      relationName: "favorite",
      targetKind: "recording",
    },
  ],
  providers: [
    {
      providerId: "netease",
      providerName: "NetEase Cloud Music",
      targetKinds: ["recording", "album"],
    },
    {
      providerId: "spotify",
      providerName: "Spotify",
      targetKinds: ["recording"],
    },
  ],
});

const queryCalls: RetrievalQueryInput[] = [];
const mintedAnchors: unknown[] = [];
const retrievalQuery: RetrievalQueryService = {
  async query(input) {
    queryCalls.push(input);

    if (input.cursor !== undefined) {
      assert.equal(input.cursor, "internal_cursor_page_2");
      return retrievalResult({
        input,
        hits: [],
      });
    }

    return retrievalResult({
      input,
      hits: [
        materialHit({
          materialRef: libraryMaterialRef,
          title: "whoo",
          artistsText: "Nemophila",
          album: "Seize the Fate",
          versionText: "live",
        }),
        candidateHit({
          materialCandidateRef: candidateRef,
          title: "Provider whoo",
          artistsText: "Provider Artist",
        }),
      ],
      nextCursor: "internal_cursor_page_2",
    });
  },
};

const lookupRegistration = createMusicDiscoveryLookupRegistration({
  retrievalQuery,
  scopeAvailability,
});
const stageInterface = createStageInterface({
  instruments: [musicDiscoveryInstrument],
  registrations: [lookupRegistration],
});
const lookupCursors = testLookupCursorStore();

assert.deepEqual(
  musicDiscoveryLookupDescriptor.errors.map((error) => error.code),
  [
    "invalid_input",
    "invalid_cursor",
    "unknown_scope",
    "unknown_provider_scope",
    "unsupported_scope_target",
    "provider_scope_failed",
    "scope_budget_exceeded",
    "result_window_expired",
    "scope_availability_failed",
  ],
);
assert.equal(musicDiscoveryLookupDescriptor.sideEffect.durableUserStateWrite, false);
assert.equal(musicDiscoveryLookupDescriptor.sideEffect.runtimeStateWrite, true);
assert.equal(musicDiscoveryLookupDescriptor.sideEffect.externalCall, true);
assert.equal(
  musicDiscoveryLookupDescriptor.examples.some((example) =>
    example.expects === "avoid" && example.prompt.includes("quiet walking")
  ),
  true,
);
assert.equal(
  musicDiscoveryLookupDescriptor.examples.some((example) =>
    example.expects === "avoid" && example.prompt.includes("browse")
  ),
  true,
);
assert.equal(
  (musicDiscoveryLookupDescriptor.allowedActions ?? []).some((action) =>
    action.action === "save" || action.action === "play" || action.action === "commit"
  ),
  false,
);

const lookupResult = await stageInterface.dispatch(testStageToolContext({
  mintedAnchors,
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    scopes: [
      { kind: "library" },
      {
        kind: "provider",
        providerId: "netease",
        description: { label: "stale label ignored" },
        targetKinds: ["recording"],
      },
    ],
    limit: 2,
  },
});

assert.equal(lookupResult.ok, true);
assert.equal(queryCalls.length, 1);
assert.deepEqual(queryCalls[0], {
  ownerScope: "local",
  text: "whoo",
  materialKind: "recording",
  pools: {
    anyOf: [
      { kind: "local_catalog" },
      { kind: "provider_search", providerId: "netease" },
    ],
  },
  order: "text_relevance",
  limit: 2,
  sessionId: "music-discovery-lookup-test-session",
});
assert.equal(mintedAnchors.length, 2);

if (lookupResult.ok) {
  assert.equal(lookupResult.value.toolName, "music.discovery.lookup");
  const output = lookupResult.value.result as MusicDiscoveryLookupOutput;

  assert.equal(output.items.length, 2);
  assert.deepEqual(output.items[0], {
    handle: {
      kind: "library",
      id: "public_library_1",
    },
    description: {
      label: "whoo - Nemophila",
      title: "whoo",
      artistsText: "Nemophila",
      album: "Seize the Fate",
      versionText: "live",
    },
  });
  assert.deepEqual(output.items[1], {
    handle: {
      kind: "candidate",
      id: "public_candidate_2",
    },
    description: {
      label: "Provider whoo - Provider Artist",
      title: "Provider whoo",
      artistsText: "Provider Artist",
    },
  });
  assert.equal(typeof output.nextCursor, "string");
  assert.equal(output.nextCursor?.startsWith("lc_"), true);
  assertPublicLookupOutputIsVeiled(output);

  const cursorPage = await stageInterface.dispatch(testStageToolContext({
    mintedAnchors,
  }), {
    toolName: "music.discovery.lookup",
    payload: {
      cursor: output.nextCursor,
      limit: 1,
    },
  });

  assert.equal(cursorPage.ok, true);
  assert.equal(queryCalls.length, 2);
  assert.deepEqual(queryCalls[1], {
    ownerScope: "local",
    text: "whoo",
    materialKind: "recording",
    pools: {
      anyOf: [
        { kind: "local_catalog" },
        { kind: "provider_search", providerId: "netease" },
      ],
    },
    order: "text_relevance",
    cursor: "internal_cursor_page_2",
    limit: 1,
    sessionId: "music-discovery-lookup-test-session",
  });

  if (cursorPage.ok) {
    assert.deepEqual(cursorPage.value.result, {
      items: [],
    });
  }
}

const forgedCursor = await stageInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    cursor: "mlc1.forged.cursor.token",
  },
});

assert.equal(forgedCursor.ok, false);
if (!forgedCursor.ok) {
  assert.equal(forgedCursor.error.code, "invalid_cursor");
}

const expiringInterface = createStageInterface({
  instruments: [musicDiscoveryInstrument],
  registrations: [
    createMusicDiscoveryLookupRegistration({
      retrievalQuery,
      scopeAvailability,
    }),
  ],
});
const expiringLookupCursors = testLookupCursorStore({ ttlMs: 1 });
expiringLookupCursors.setNow("2026-06-17T00:00:00.000Z");
const expiringFirstPage = await expiringInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
  lookupCursors: expiringLookupCursors,
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    scopes: [{ kind: "library" }],
  },
});

assert.equal(expiringFirstPage.ok, true);
if (expiringFirstPage.ok) {
  const expiredCursor = (expiringFirstPage.value.result as MusicDiscoveryLookupOutput).nextCursor;
  assert.equal(typeof expiredCursor, "string");

  expiringLookupCursors.setNow("2026-06-17T00:00:00.001Z");
  const expiredCursorPage = await expiringInterface.dispatch(testStageToolContext({
    mintedAnchors: [],
    lookupCursors: expiringLookupCursors,
  }), {
    toolName: "music.discovery.lookup",
    payload: {
      cursor: expiredCursor,
    },
  });

  assert.equal(expiredCursorPage.ok, false);
  if (!expiredCursorPage.ok) {
    assert.equal(expiredCursorPage.error.code, "result_window_expired");
  }
}

const failingProviderInterface = createStageInterface({
  instruments: [musicDiscoveryInstrument],
  registrations: [
    createMusicDiscoveryLookupRegistration({
      retrievalQuery: {
        async query() {
          throw new MusicIntelligenceError({
            code: "music_intelligence.provider_search_failed",
            message: "Provider search failed for spotify.",
          });
        },
      },
      scopeAvailability,
    }),
  ],
});
const failingProviderResult = await failingProviderInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    scopes: [
      { kind: "library" },
      { kind: "provider", providerId: "netease" },
      { kind: "provider", providerId: "spotify" },
    ],
  },
});

assert.equal(failingProviderResult.ok, false);
if (!failingProviderResult.ok) {
  assert.equal(failingProviderResult.error.code, "provider_scope_failed");
  assert.equal(failingProviderResult.error.message.includes("spotify"), true);
  assert.equal(failingProviderResult.error.suggestedFix?.includes("spotify"), true);
}

const plainRetrievalThrowResult = await lookupInterfaceForThrownRetrievalError(
  new Error("Retrieval query service is not initialized."),
).dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    scopes: [{ kind: "library" }],
  },
});
assert.equal(plainRetrievalThrowResult.ok, false);
if (!plainRetrievalThrowResult.ok) {
  assert.equal(plainRetrievalThrowResult.error.code, "stage_interface.tool_handler_failed");
}

const retrievalResultInvalidResult = await lookupInterfaceForThrownRetrievalError(
  new MusicIntelligenceError({
    code: "music_intelligence.retrieval_result_invalid",
    message: "Text query hits must include matched text evidence.",
  }),
).dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    scopes: [{ kind: "library" }],
  },
});
assert.equal(retrievalResultInvalidResult.ok, false);
if (!retrievalResultInvalidResult.ok) {
  assert.equal(retrievalResultInvalidResult.error.code, "stage_interface.tool_handler_failed");
}

const providerSearchPoolInvalidResult = await lookupInterfaceForThrownRetrievalError(
  new MusicIntelligenceError({
    code: "music_intelligence.provider_search_pool_invalid",
    message: "provider_search pools require mixed retrieval and provider-search wiring.",
  }),
).dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    scopes: [{ kind: "provider", providerId: "netease" }],
  },
});
assert.equal(providerSearchPoolInvalidResult.ok, false);
if (!providerSearchPoolInvalidResult.ok) {
  assert.equal(providerSearchPoolInvalidResult.error.code, "stage_interface.tool_handler_failed");
}

const cursorMismatchResult = await lookupInterfaceForThrownRetrievalError(
  new MusicIntelligenceError({
    code: "music_intelligence.cursor_mismatch",
    message: "Cursor does not belong to this query.",
  }),
).dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    scopes: [{ kind: "library" }],
  },
});
assert.equal(cursorMismatchResult.ok, false);
if (!cursorMismatchResult.ok) {
  assert.equal(cursorMismatchResult.error.code, "invalid_cursor");
}

let budgetRetrievalCalls = 0;
const budgetInterface = createStageInterface({
  instruments: [musicDiscoveryInstrument],
  registrations: [
    createMusicDiscoveryLookupRegistration({
      retrievalQuery: {
        async query(input) {
          budgetRetrievalCalls += 1;
          return retrievalResult({ input, hits: [] });
        },
      },
      scopeAvailability: createInMemoryMusicScopeAvailabilityPort({
        sourceLibraries: [],
        relations: [],
        providers: [
          providerScope("provider_1"),
          providerScope("provider_2"),
          providerScope("provider_3"),
          providerScope("provider_4"),
          providerScope("provider_5"),
        ],
      }),
    }),
  ],
});
const budgetResult = await budgetInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    scopes: [{ kind: "all" }],
  },
});

assert.equal(budgetResult.ok, false);
assert.equal(budgetRetrievalCalls, 0);
if (!budgetResult.ok) {
  assert.equal(budgetResult.error.code, "scope_budget_exceeded");
  assert.equal(budgetResult.error.message.includes("provider_5"), true);
}

const scopeAvailabilityFailedInterface = createStageInterface({
  instruments: [musicDiscoveryInstrument],
  registrations: [
    createMusicDiscoveryLookupRegistration({
      retrievalQuery,
      scopeAvailability: {
        listAvailableMusicScopes() {
          return {
            ok: false,
            error: {
              code: "music_data_platform.scope_read_failed",
              message: "scope read failed",
              area: "music_data_platform",
              retryable: true,
            },
          };
        },
      },
    }),
  ],
});
const scopeAvailabilityFailedResult = await scopeAvailabilityFailedInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    scopes: [{ kind: "library" }],
  },
});

assert.equal(scopeAvailabilityFailedResult.ok, false);
if (!scopeAvailabilityFailedResult.ok) {
  assert.equal(scopeAvailabilityFailedResult.error.code, "scope_availability_failed");
  assert.equal(scopeAvailabilityFailedResult.error.retryable, true);
}

const sourceLibraryTargetMismatch = await stageInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    targetKind: "album",
    scopes: [{ kind: "source_library", id: "scope_saved_recording" }],
  },
});

assert.equal(sourceLibraryTargetMismatch.ok, false);
if (!sourceLibraryTargetMismatch.ok) {
  assert.equal(sourceLibraryTargetMismatch.error.code, "unsupported_scope_target");
  assert.equal(sourceLibraryTargetMismatch.error.retryable, true);
}

const relationTargetMismatch = await stageInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    targetKind: "album",
    scopes: [{ kind: "relation", id: "scope_favorite_recording" }],
  },
});

assert.equal(relationTargetMismatch.ok, false);
if (!relationTargetMismatch.ok) {
  assert.equal(relationTargetMismatch.error.code, "unsupported_scope_target");
}

const providerTargetMismatch = await stageInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    targetKind: "album",
    scopes: [{ kind: "provider", providerId: "spotify" }],
  },
});

assert.equal(providerTargetMismatch.ok, false);
if (!providerTargetMismatch.ok) {
  assert.equal(providerTargetMismatch.error.code, "unsupported_scope_target");
}

const nonComparableClockResult = await stageInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
  lookupCursors: {
    register() {
      throw new Error("lookup cursor clock must return a fixed-width UTC ISO timestamp.");
    },
    resolve() {
      throw new Error("unexpected cursor resolve");
    },
  },
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    scopes: [{ kind: "library" }],
  },
});

assert.equal(nonComparableClockResult.ok, false);
if (!nonComparableClockResult.ok) {
  // A store-injected non-fixed-width clock fails loud through the router-global handler-failure
  // code rather than silently misordering the lexicographic expiry comparison.
  assert.equal(nonComparableClockResult.error.code, "stage_interface.tool_handler_failed");
}

const matchingSourceLibraryScope = await stageInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    targetKind: "recording",
    scopes: [{ kind: "source_library", id: "scope_saved_recording" }],
  },
});

assert.equal(matchingSourceLibraryScope.ok, true);

const matchingRelationScope = await stageInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    lookupText: "whoo",
    targetKind: "recording",
    scopes: [{ kind: "relation", id: "scope_favorite_recording" }],
  },
});

assert.equal(matchingRelationScope.ok, true);

const lookupInputSchemaJson = JSON.stringify(musicDiscoveryLookupDescriptor.inputSchema);
assert.equal((musicDiscoveryLookupDescriptor.inputSchema as { type?: unknown }).type, "object");
assert.equal(lookupInputSchemaJson.includes('"type":"integer"'), true);
assert.equal(lookupInputSchemaJson.includes('"minimum":1'), true);
assert.equal(lookupInputSchemaJson.includes('"maximum":100'), true);
assert.equal(lookupInputSchemaJson.includes('"limit":{"type":"number"'), false);
// Empty-string scope identifiers are rejected at the structural (AJV) layer, not
// in the handler: the generator overlay tightens scope-handle id/providerId to
// minLength:1, so an empty id never reaches resolution as a bogus empty-key scope.
assert.equal(lookupInputSchemaJson.includes('"id":{"type":"string","minLength":1}'), true);
assert.equal(lookupInputSchemaJson.includes('"providerId":{"type":"string","minLength":1}'), true);

const cursorPageWithFirstPageScope = await stageInterface.dispatch(testStageToolContext({
  mintedAnchors: [],
}), {
  toolName: "music.discovery.lookup",
  payload: {
    cursor: "mlc1.forged.cursor.token",
    scopes: [{ kind: "library" }],
  },
});

assert.equal(cursorPageWithFirstPageScope.ok, false);
if (!cursorPageWithFirstPageScope.ok) {
  // Field isolation is now enforced by the handler, not the schema gate (the
  // public schema has no top-level oneOf — the Anthropic API rejects top-level
  // composition keywords), so this is a handler-driven invalid_input carrying
  // the bare code declared in descriptor.errors, matching the other handler
  // error codes above.
  assert.equal(cursorPageWithFirstPageScope.error.code, "invalid_input");
}

function retrievalResult(input: {
  input: RetrievalQueryInput;
  hits: readonly RetrievalQueryHit[];
  nextCursor?: string;
}): RetrievalQueryResult {
  return {
    query: {
      ownerScope: input.input.ownerScope ?? "local",
      ...(input.input.text === undefined ? {} : { text: input.input.text }),
      ...(input.input.materialKind === undefined ? {} : { materialKind: input.input.materialKind }),
      ...(input.input.pools === undefined ? {} : { pools: input.input.pools }),
      order: "text_relevance",
    },
    basis: {
      ownerCatalogVisibilityApplied: !JSON.stringify(input.input.pools ?? {}).includes("provider_search"),
      blockedMaterialsExcluded: true,
    },
    hits: input.hits,
    page: {
      limit: input.input.limit ?? 20,
      ...(input.nextCursor === undefined ? {} : { nextCursor: input.nextCursor }),
    },
  };
}

function materialHit(input: {
  materialRef: Ref;
  title?: string;
  artistsText?: string;
  album?: string;
  versionText?: string;
}): RetrievalQueryHit {
  return {
    kind: "material",
    materialRef: input.materialRef,
    materialKind: "recording",
    display: display(input),
    pools: {
      matched: [],
    },
    basis: {
      textMatched: true,
      poolFilterApplied: true,
      positivePoolMatched: true,
    },
  };
}

function candidateHit(input: {
  materialCandidateRef: Ref;
  title?: string;
  artistsText?: string;
  album?: string;
  versionText?: string;
}): RetrievalQueryHit {
  return {
    kind: "material_candidate",
    materialCandidateRef: input.materialCandidateRef,
    display: display(input),
    pools: {
      matched: [],
    },
    basis: {
      textMatched: true,
      poolFilterApplied: true,
      positivePoolMatched: true,
    },
  };
}

function display(input: {
  title?: string;
  artistsText?: string;
  album?: string;
  versionText?: string;
}): RetrievalQueryHit["display"] {
  return {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.artistsText === undefined ? {} : { artistsText: input.artistsText }),
    ...(input.album === undefined ? {} : { album: input.album }),
    ...(input.versionText === undefined ? {} : { versionText: input.versionText }),
  };
}

function providerScope(providerId: string): {
  providerId: string;
  providerName: string;
  targetKinds: ["recording"];
} {
  return {
    providerId,
    providerName: providerId,
    targetKinds: ["recording"],
  };
}

function lookupInterfaceForThrownRetrievalError(error: unknown): ReturnType<typeof createStageInterface> {
  return createStageInterface({
    instruments: [musicDiscoveryInstrument],
    registrations: [
      createMusicDiscoveryLookupRegistration({
        retrievalQuery: {
          async query() {
            throw error;
          },
        },
        scopeAvailability,
      }),
    ],
  });
}

function testStageToolContext(input: {
  mintedAnchors: unknown[];
  clock?: () => string;
  lookupCursors?: LookupCursorStore;
}): StageToolContext {
  return {
    ownerScope: "local",
    sessionId: "music-discovery-lookup-test-session",
    requestId: "music-discovery-lookup-test-request",
    clock: input.clock ?? (() => "2026-06-17T00:00:00.000Z"),
    handleMinting: {
      async mint(mintInput) {
        input.mintedAnchors.push(mintInput.internalAnchor);
        return `public_${mintInput.handleKind}_${input.mintedAnchors.length}`;
      },
      async resolve() {
        return undefined;
      },
    },
    lookupCursors: input.lookupCursors ?? lookupCursors,
    providerAvailability: {
      async isProviderAvailable() {
        return true;
      },
    },
    executionGate: {
      async preflight() {
        return {
          decision: "allow",
          auditLevel: "none",
        };
      },
    },
  };
}

type TestLookupCursorStore = LookupCursorStore & {
  setNow(nextNow: string): void;
};

function testLookupCursorStore(input: {
  ttlMs?: number;
} = {}): TestLookupCursorStore {
  const ttlMs = input.ttlMs ?? 30 * 60 * 1000;
  let now = "2026-06-17T00:00:00.000Z";
  let sequence = 0;
  const rows = new Map<string, {
    ownerScope: string;
    internalCursor: string;
    queryInput: unknown;
    expiresAt: string;
  }>();

  return {
    setNow(nextNow) {
      now = nextNow;
    },
    register(registerInput) {
      assertComparableTimestamp(now);
      sequence += 1;
      const cursorId = `lc_test_${sequence}`;
      rows.set(cursorId, {
        ownerScope: registerInput.ownerScope,
        internalCursor: registerInput.internalCursor,
        queryInput: registerInput.queryInput,
        expiresAt: new Date(Date.parse(now) + ttlMs).toISOString(),
      });
      return cursorId;
    },
    resolve(resolveInput) {
      assertComparableTimestamp(now);
      const row = rows.get(resolveInput.cursorId);
      if (row === undefined || row.ownerScope !== resolveInput.ownerScope) {
        return cursorFailure("invalid_cursor", "music.discovery.lookup cursor is unknown for this owner.");
      }
      if (row.expiresAt <= now) {
        return cursorFailure("result_window_expired", "music.discovery.lookup result window expired.");
      }
      return {
        ok: true,
        value: {
          internalCursor: row.internalCursor,
          queryInput: row.queryInput,
        },
      };
    },
  };
}

function cursorFailure(code: "invalid_cursor" | "result_window_expired", message: string): Result<never> {
  const error: StageError = {
    code,
    message,
    area: "music_intelligence",
    retryable: true,
    suggestedFix: "Start a fresh first-page music.discovery.lookup call.",
  };
  return { ok: false, error };
}

function assertComparableTimestamp(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("test lookup cursor clock must return a fixed-width UTC ISO timestamp.");
  }
}

function ref(namespace: string, kind: string, id: string): Ref {
  return {
    namespace,
    kind,
    id,
  };
}

function assertPublicLookupOutputIsVeiled(output: MusicDiscoveryLookupOutput): void {
  const text = JSON.stringify(output);

  for (const forbidden of [
    "m_library_whoo",
    "mc_provider_whoo",
    "internal_cursor_page_2",
    "source_library",
    "owner_material_relation_pool",
    "providerEntityId",
    "materialRef",
    "materialCandidateRef",
  ]) {
    assert.equal(
      text.includes(forbidden),
      false,
      `lookup output leaked internal token '${forbidden}'`,
    );
  }
}
