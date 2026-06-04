import type {
  CanonicalRecord,
  MaterialResolvedQuery,
  Ref,
  Result,
  SourceMaterial,
  SourceQuery,
} from "../../src/contracts/index.js";
import { createInMemoryEphemeralMaterialStore } from "../../src/material/ephemeral/index.js";
import { createMaterialPolicyEvaluator } from "../../src/material/policy/index.js";
import { createMaterialResolveService } from "../../src/material/resolve/index.js";
import {
  createMaterialSearchDocumentProvider,
  createMaterialSearchService,
} from "../../src/material/search/index.js";
import {
  createCanonicalStore,
  createInMemoryMaterialRegistry,
  createMaterialStore,
} from "../../src/material/store/index.js";
import type {
  MaterialPolicyCollectionBlockPort,
  MaterialSearchCollectionPort,
  SourceGroundingPort,
} from "../../src/ports/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemorySourceEntityStoreRepository,
  createSqliteMaterialSearchIndex,
} from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

function ref(namespace: string, kind: string, id: string, label?: string): Ref {
  return label === undefined ? { namespace, kind, id } : { namespace, kind, id, label };
}

function sourceMaterial(
  label: string,
  sourceRef?: Ref,
  canonicalRef?: Ref,
  kind: SourceMaterial["kind"] = "recording",
): SourceMaterial {
  return {
    id: `source-material:${label}`,
    kind,
    label,
    state: canonicalRef === undefined ? "source_only_playable" : "confirmed_playable",
    ...(canonicalRef === undefined ? {} : { canonicalRef }),
    ...(sourceRef === undefined ? {} : { sourceRefs: [sourceRef] }),
    ...(sourceRef === undefined
      ? {}
      : {
          playableLinks: [{
            url: `https://example.test/${sourceRef.id}`,
            sourceRef,
          }],
        }),
  };
}

function emptyMaterialSearchCollection(): MaterialSearchCollectionPort {
  return {
    listCollections: async () => ({ ok: true, value: [] }),
    listItems: async () => ({ ok: true, value: [] }),
  };
}

function createHarness(options: {
  sourceGrounding: SourceGroundingPort;
  collectionBlock?: MaterialPolicyCollectionBlockPort;
  canonicalRepository?: ReturnType<typeof createInMemoryCanonicalRecordRepository>;
}): {
  materialStore: ReturnType<typeof createMaterialStore>;
  ephemeralMaterialStore: ReturnType<typeof createInMemoryEphemeralMaterialStore>;
  resolve: (input: {
    text: string;
    id?: string;
    targetKind?: "recording" | "release" | "release_group" | "artist" | "work";
    ownerScope?: string;
    sessionId?: string;
    limit?: number;
  }) => Promise<Result<MaterialResolvedQuery>>;
} {
  let nextMaterialId = 1;
  const canonicalRepository = options.canonicalRepository ?? createInMemoryCanonicalRecordRepository();
  const sourceEntityStore = createInMemorySourceEntityStoreRepository();
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => `resolve-material-${nextMaterialId++}`,
      now: () => "2026-06-04T00:00:00.000Z",
    }),
    sourceEntityStore,
  });
  const materialSearch = createMaterialSearchService({
    materialStore,
    collection: emptyMaterialSearchCollection(),
    searchIndex: createSqliteMaterialSearchIndex({
      documents: createMaterialSearchDocumentProvider({ materialStore }),
    }),
  });
  const ephemeralMaterialStore = createInMemoryEphemeralMaterialStore({
    now: () => "2026-06-04T00:00:00.000Z",
    ttlMs: 10 * 60_000,
    maxEntriesPerSession: 20,
  });
  const materialResolve = createMaterialResolveService({
    materialStore,
    materialSearch,
    sourceGrounding: options.sourceGrounding,
    materialPolicyEvaluator: createMaterialPolicyEvaluator({
      materialStore,
      ...(options.collectionBlock === undefined ? {} : { collection: options.collectionBlock }),
    }),
    ephemeralMaterialStore,
  });

  return {
    materialStore,
    ephemeralMaterialStore,
    async resolve(input) {
      const result = await materialResolve.resolve({
        ...(input.ownerScope === undefined ? {} : { ownerScope: input.ownerScope }),
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        queries: [{
          text: input.text,
          ...(input.id === undefined ? {} : { id: input.id }),
          ...(input.targetKind === undefined ? {} : { targetKind: input.targetKind }),
        }],
      });

      if (!result.ok) {
        return result;
      }

      const resolved = result.value.results[0];
      assert(resolved !== undefined, "expected one resolve result");
      return { ok: true, value: resolved };
    },
  };
}

async function putCanonicalMaterial({
  materialStore,
  canonicalRepository,
  canonicalRef,
  label,
  sourceRef,
  aliases,
}: {
  materialStore: ReturnType<typeof createMaterialStore>;
  canonicalRepository: ReturnType<typeof createInMemoryCanonicalRecordRepository>;
  canonicalRef: Ref;
  label: string;
  sourceRef?: Ref;
  aliases?: string[];
}): Promise<void> {
  const canonical: CanonicalRecord = {
    ref: canonicalRef,
    kind: "recording",
    label,
    status: "active",
    ...(aliases === undefined ? {} : { aliases }),
  };
  await assertOk(canonicalRepository.put(canonical));

  if (sourceRef !== undefined) {
    await assertOk(
      materialStore.upsertSourceEntity({
        entity: {
          sourceRef,
          providerId: "fixture",
          kind: "track",
          label,
          title: label,
          providerUrl: `https://example.test/${sourceRef.id}`,
          createdAt: "2026-06-04T00:00:00.000Z",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      }),
    );
    await assertOk(
      materialStore.putSourceLibraryItem({
        item: {
          id: `library-item:${sourceRef.id}`,
          ownerScope: "local_profile:default",
          providerId: "fixture",
          providerAccountId: "fixture-account",
          sourceRef,
          sourceKind: "track",
          libraryKind: "saved_source_track",
          label,
          lastSeenAt: "2026-06-04T00:00:00.000Z",
          status: "present",
        },
      }),
    );
  }

  await assertOk(
    materialStore.getOrCreateByCanonicalRef({
      canonicalRef,
      kind: "recording",
      ...(sourceRef === undefined ? {} : { sourceRefs: [sourceRef] }),
    }),
  );
}

async function resolveStillGroundsProviderForExactLocalDurableHit(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const providerQueries: SourceQuery[] = [];
  const sourceRef = ref("source:fixture", "track", "local-exact-source");
  const canonicalRef = ref("minemusic", "recording", "local-exact-canonical");
  const harness = createHarness({
    canonicalRepository,
    sourceGrounding: {
      ground: async ({ query }) => {
        providerQueries.push(query);
        return { ok: true, value: [] };
      },
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
  });

  await putCanonicalMaterial({
    materialStore: harness.materialStore,
    canonicalRepository,
    canonicalRef,
    label: "Local Exact",
    sourceRef,
  });

  const resolved = await assertOk(
    harness.resolve({
      id: "local-exact",
      text: "Local Exact",
      targetKind: "recording",
      sessionId: "session-local",
    }),
  );

  assert(providerQueries.length === 1, "resolve should always ground provider candidates before rerank");
  assert(providerQueries[0]?.targetKind === "recording", "resolve should pass targetKind through SourceQuery");
  assert(resolved.status === "resolved", "exact local durable hit should still resolve");
  assert(resolved.materials[0]?.materialRef.kind === "material", "exact local durable hit should keep durable material refs");
  assert(resolved.reason === undefined, "provider no-match should not add a fallback reason when local durable candidates resolve");
  assert((resolved.issues ?? []).length === 0, "provider no-match should stay silent when local durable candidates already resolve");
}

async function providerCandidateStaysVisibleAlongsideLocalFuzzyDurableHit(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const harness = createHarness({
    canonicalRepository,
    sourceGrounding: {
      ground: async () => ({
        ok: true,
        value: [sourceMaterial("Provider Preferred", ref("source:fixture", "track", "provider-preferred-source"))],
      }),
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
  });

  await putCanonicalMaterial({
    materialStore: harness.materialStore,
    canonicalRepository,
    canonicalRef: ref("minemusic", "recording", "local-fuzzy"),
    label: "Local Preferred-ish",
    sourceRef: ref("source:fixture", "track", "local-fuzzy-source"),
  });

  const resolved = await assertOk(
    harness.resolve({
      id: "provider-ranks-first",
      text: "Provider Preferred",
      targetKind: "recording",
      sessionId: "session-provider-ranks-first",
    }),
  );

  assert(resolved.materials.length >= 1, "rerank should return at least one candidate");
  assert(
    resolved.materials.some((material) =>
      material.label === "Provider Preferred" && material.materialRef.kind === "ephemeral_material"
    ),
    "provider-expanded candidate should stay visible in the unified rerank result set",
  );
}

async function providerSourceRefMatchReturnsExistingDurableMaterial(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const sourceRef = ref("source:fixture", "track", "bound-provider-source");
  const canonicalRef = ref("minemusic", "recording", "bound-provider-canonical");
  const harness = createHarness({
    canonicalRepository,
    sourceGrounding: {
      ground: async () => ({
        ok: true,
        value: [sourceMaterial("Provider Bound Label", sourceRef)],
      }),
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
  });

  await putCanonicalMaterial({
    materialStore: harness.materialStore,
    canonicalRepository,
    canonicalRef,
    label: "Stored Canonical Label",
    sourceRef,
  });

  const resolved = await assertOk(
    harness.resolve({
      id: "provider-bound",
      text: "Provider Bound Label",
      sessionId: "session-bound",
    }),
  );

  assert(resolved.status === "resolved", "provider sourceRef matches should resolve durably");
  assert(resolved.materials[0]?.materialRef.kind === "material", "existing durable sourceRef match should return a durable material ref");
  assert(resolved.materials[0]?.canonicalRef?.id === canonicalRef.id, "existing durable sourceRef match should preserve canonical identity");
}

async function providerOnlyResultCreatesEphemeralSourceOnlyMaterial(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "ephemeral-provider-source");
  const harness = createHarness({
    sourceGrounding: {
      ground: async () => ({
        ok: true,
        value: [sourceMaterial("Ephemeral Provider", sourceRef)],
      }),
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
  });

  const resolved = await assertOk(
    harness.resolve({
      id: "provider-ephemeral",
      text: "Ephemeral Provider",
      sessionId: "session-ephemeral",
    }),
  );
  const material = resolved.materials[0];
  assert(material !== undefined, "provider result should produce one material");

  const stored = await assertOk(
    harness.ephemeralMaterialStore.get({ materialRef: material.materialRef }),
  );

  assert(resolved.status === "source_only", "provider-only non-durable result should stay source_only");
  assert(material.materialRef.kind === "ephemeral_material", "non-durable provider result should use ephemeral material refs");
  assert(material.identityState === "source_backed", "ephemeral provider result should stay source-backed");
  assert(stored?.material.label === "Ephemeral Provider", "ephemeral store should retain provider facts by exact ref");
}

async function artistTargetKindPassesThroughProviderGroundingAndRerank(): Promise<void> {
  const providerQueries: SourceQuery[] = [];
  const sourceRef = ref("source:fixture", "artist", "artist-provider-source");
  const harness = createHarness({
    sourceGrounding: {
      ground: async ({ query }) => {
        providerQueries.push(query);
        return {
          ok: true,
          value: [sourceMaterial("Phoenix", sourceRef, undefined, "artist")],
        };
      },
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
  });

  const resolved = await assertOk(
    harness.resolve({
      id: "provider-artist",
      text: "Phoenix",
      targetKind: "artist",
      sessionId: "session-artist",
    }),
  );

  assert(providerQueries[0]?.targetKind === "artist", "resolve should pass artist targetKind into provider grounding");
  assert(resolved.status === "source_only", "artist-only provider result should stay source_only when non-durable");
  assert(resolved.materials[0]?.kind === "artist", "artist targetKind should survive rerank and filtering");
  assert(
    resolved.materials[0]?.materialRef.kind === "ephemeral_material",
    "non-durable artist provider result should still use an ephemeral handle",
  );
}

async function subsequentResolveKeepsPreviouslyReturnedEphemeralHandleAlive(): Promise<void> {
  const groundedByQuery = new Map<string, SourceMaterial[]>([
    ["First Provider", [sourceMaterial("First Provider", ref("source:fixture", "track", "provider-first"))]],
    ["Second Provider", [sourceMaterial("Second Provider", ref("source:fixture", "track", "provider-second"))]],
  ]);
  const harness = createHarness({
    sourceGrounding: {
      ground: async ({ query }) => ({
        ok: true,
        value: groundedByQuery.get(query.text ?? "") ?? [],
      }),
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
  });

  const first = await assertOk(
    harness.resolve({
      id: "provider-first",
      text: "First Provider",
      sessionId: "session-keep-old-ephemeral",
    }),
  );
  const firstRef = first.materials[0]?.materialRef;
  assert(firstRef?.kind === "ephemeral_material", "first provider-only result should create an ephemeral handle");

  await assertOk(
    harness.resolve({
      id: "provider-second",
      text: "Second Provider",
      sessionId: "session-keep-old-ephemeral",
    }),
  );

  const storedFirst = await assertOk(
    harness.ephemeralMaterialStore.get({ materialRef: firstRef as Ref }),
  );

  assert(storedFirst?.material.label === "First Provider", "a later resolve in the same session should not invalidate an earlier returned ephemeral handle");
}

async function providerWithoutStableGroundingProducesIssuesWhenNothingElseResolves(): Promise<void> {
  const harness = createHarness({
    sourceGrounding: {
      ground: async () => ({
        ok: true,
        value: [{
          id: "provider-ungrounded",
          kind: "recording",
          label: "Ungrounded Provider",
          state: "unresolved",
        }],
      }),
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
  });

  const resolved = await assertOk(
    harness.resolve({
      id: "ungrounded",
      text: "Ungrounded Provider",
      sessionId: "session-ungrounded",
    }),
  );

  assert(resolved.status === "unresolved", "provider results without stable grounding should stay unresolved");
  assert(resolved.materials.length === 0, "provider results without stable grounding should not produce materials");
  assert(
    resolved.issues?.some((issue) => issue.code === "provider_result_missing_source_ref" && issue.resultLabel === "Ungrounded Provider"),
    "provider results without stable grounding should report provider_result_missing_source_ref",
  );
  assert(
    resolved.issues?.some((issue) => issue.code === "no_source_or_canonical_grounding"),
    "provider results without stable grounding should report no_source_or_canonical_grounding",
  );
}

async function providerNoMatchProducesRetryableIssueWhenNothingElseResolves(): Promise<void> {
  const providerQueries: SourceQuery[] = [];
  const harness = createHarness({
    sourceGrounding: {
      ground: async ({ query }) => {
        providerQueries.push(query);
        return { ok: true, value: [] };
      },
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
  });

  const resolved = await assertOk(
    harness.resolve({
      id: "provider-no-match",
      text: "No Match",
      sessionId: "session-no-match",
      limit: 1,
    }),
  );

  assert(providerQueries[0]?.text === "No Match", "provider no-match should ground the query text");
  assert(providerQueries[0]?.limit !== undefined, "provider no-match should preserve a bounded rerank window");
  assert(resolved.status === "unresolved", "provider no-match should stay unresolved");
  assert(resolved.materials.length === 0, "provider no-match should not produce materials");
  assert(
    resolved.issues?.some((issue) => issue.code === "provider_no_match" && issue.retryable === true && issue.query?.text === "No Match"),
    "provider no-match should report a retryable provider_no_match issue",
  );
}

await resolveStillGroundsProviderForExactLocalDurableHit();
await providerCandidateStaysVisibleAlongsideLocalFuzzyDurableHit();
await providerSourceRefMatchReturnsExistingDurableMaterial();
await providerOnlyResultCreatesEphemeralSourceOnlyMaterial();
await artistTargetKindPassesThroughProviderGroundingAndRerank();
await subsequentResolveKeepsPreviouslyReturnedEphemeralHandleAlive();
await providerWithoutStableGroundingProducesIssuesWhenNothingElseResolves();
await providerNoMatchProducesRetryableIssueWhenNothingElseResolves();
