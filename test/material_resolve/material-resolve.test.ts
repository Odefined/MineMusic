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

function sourceMaterial(label: string, sourceRef?: Ref, canonicalRef?: Ref): SourceMaterial {
  return {
    id: `source-material:${label}`,
    kind: "recording",
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

async function highConfidenceLocalDurableHitSkipsProviderGrounding(): Promise<void> {
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

  assert(providerQueries.length === 0, "high-confidence local durable results should skip provider grounding");
  assert(resolved.status === "resolved", "canonical local exact hit should resolve");
  assert(resolved.materials[0]?.materialRef.kind === "material", "local durable hit should keep durable material refs");
  assert(resolved.materials[0]?.canonicalRef?.id === canonicalRef.id, "local durable hit should preserve canonical identity");
}

async function ambiguousLocalDurableHitsStillCallProviderGrounding(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const providerQueries: SourceQuery[] = [];
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
    canonicalRef: ref("minemusic", "recording", "ambiguous-1"),
    label: "Shared Title",
    sourceRef: ref("source:fixture", "track", "ambiguous-source-1"),
  });
  await putCanonicalMaterial({
    materialStore: harness.materialStore,
    canonicalRepository,
    canonicalRef: ref("minemusic", "recording", "ambiguous-2"),
    label: "Shared Title",
    sourceRef: ref("source:fixture", "track", "ambiguous-source-2"),
  });

  const resolved = await assertOk(
    harness.resolve({
      id: "ambiguous",
      text: "Shared Title",
      targetKind: "recording",
      sessionId: "session-ambiguous",
    }),
  );

  assert(providerQueries.length === 1, "ambiguous local durable results should still trigger provider grounding");
  assert(resolved.materials.length === 2, "provider fallback should not discard local durable candidates");
  assert(
    resolved.reason?.includes("low-confidence local material hits"),
    "provider no-match fallback should explain that local durable hits stayed on a low-confidence path",
  );
}

async function highConfidenceCanonicalAliasSkipsProviderGrounding(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const providerQueries: SourceQuery[] = [];
  const sourceRef = ref("source:fixture", "track", "alias-source");
  const canonicalRef = ref("minemusic", "recording", "alias-canonical");
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
    label: "Official Label",
    aliases: ["Alias Exact"],
    sourceRef,
  });

  const resolved = await assertOk(
    harness.resolve({
      id: "alias-exact",
      text: "Alias Exact",
      targetKind: "recording",
      sessionId: "session-alias",
    }),
  );

  assert(providerQueries.length === 0, "unique exact canonical alias hits should skip provider grounding");
  assert(resolved.status === "resolved", "unique exact canonical alias hits should resolve locally");
  assert(resolved.materials[0]?.canonicalRef?.id === canonicalRef.id, "canonical alias exact hits should preserve the durable canonical match");
}

async function providerDisplayableResultOverridesLowConfidenceLocalHit(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const providerSourceRef = ref("source:fixture", "track", "provider-preferred-source");
  const harness = createHarness({
    canonicalRepository,
    sourceGrounding: {
      ground: async () => ({
        ok: true,
        value: [sourceMaterial("Provider Preferred", providerSourceRef)],
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
      id: "provider-overrides-local",
      text: "Preferred",
      targetKind: "recording",
      sessionId: "session-provider-wins",
    }),
  );

  assert(resolved.materials.length === 1, "provider-backed displayable results should replace low-confidence local hits instead of merging with them");
  assert(resolved.materials[0]?.label === "Provider Preferred", "provider-backed displayable results should win over low-confidence local hits");
  assert(resolved.materials[0]?.materialRef.kind === "ephemeral_material", "provider-backed non-durable wins should stay on the ephemeral path");
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

async function providerBindingMatchReturnsExistingDurableMaterial(): Promise<void> {
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
  });
  await assertOk(
    harness.materialStore.putConfirmedCanonicalBinding({
      binding: {
        sourceRef,
        canonicalRef,
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:00.000Z",
      },
    }),
  );

  const resolved = await assertOk(
    harness.resolve({
      id: "provider-bound",
      text: "Provider Bound Label",
      sessionId: "session-bound",
    }),
  );

  assert(resolved.status === "resolved", "provider source facts with a confirmed durable binding should resolve durably");
  assert(resolved.materials[0]?.materialRef.kind === "material", "confirmed binding should return a durable material ref");
  assert(resolved.materials[0]?.canonicalRef?.id === canonicalRef.id, "confirmed binding should project the durable canonical identity");
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

async function providerWithoutStableGroundingProducesIssues(): Promise<void> {
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

async function providerNoMatchProducesRetryableIssue(): Promise<void> {
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
  assert(providerQueries[0]?.limit === 1, "provider no-match should preserve per-query limit");
  assert(resolved.status === "unresolved", "provider no-match should stay unresolved");
  assert(resolved.materials.length === 0, "provider no-match should not produce materials");
  assert(
    resolved.issues?.some((issue) => issue.code === "provider_no_match" && issue.retryable === true && issue.query?.text === "No Match"),
    "provider no-match should report a retryable provider_no_match issue",
  );
}

await highConfidenceLocalDurableHitSkipsProviderGrounding();
await ambiguousLocalDurableHitsStillCallProviderGrounding();
await highConfidenceCanonicalAliasSkipsProviderGrounding();
await providerDisplayableResultOverridesLowConfidenceLocalHit();
await providerBindingMatchReturnsExistingDurableMaterial();
await providerOnlyResultCreatesEphemeralSourceOnlyMaterial();
await subsequentResolveKeepsPreviouslyReturnedEphemeralHandleAlive();
await providerWithoutStableGroundingProducesIssues();
await providerNoMatchProducesRetryableIssue();
