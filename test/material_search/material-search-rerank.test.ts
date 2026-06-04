import type {
  MusicMaterial,
  Ref,
} from "../../src/contracts/index.js";
import {
  createMaterialSearchDocumentProvider,
  createMaterialSearchService,
} from "../../src/material/index.js";
import { createSqliteMaterialSearchIndex } from "../../src/storage/index.js";
import {
  activeMaterial,
  assert,
  assertOk,
  FakeMaterialSearchCollection,
  FakeMaterialSearchStore,
  materialRef,
  sourceRef,
} from "./material-search-test-harness.js";

function ephemeralMaterial(input: {
  id: string;
  label: string;
  sourceRef?: Ref;
  kind?: string;
}): MusicMaterial {
  return {
    id: input.id,
    materialRef: {
      namespace: "minemusic",
      kind: "ephemeral_material",
      id: input.id,
    },
    kind: input.kind ?? "recording",
    label: input.label,
    state: "source_only_playable",
    identityState: "source_backed",
    ...(input.sourceRef === undefined ? {} : { sourceRefs: [input.sourceRef] }),
    ...(input.sourceRef === undefined
      ? {}
      : {
          playableLinks: [{
            url: `https://example.test/${input.sourceRef.id}`,
            sourceRef: input.sourceRef,
          }],
        }),
  };
}

function durableMaterial(input: {
  materialRef: Ref;
  label: string;
  sourceRef?: Ref;
  kind?: string;
}): MusicMaterial {
  return {
    id: input.materialRef.id,
    materialRef: input.materialRef,
    kind: input.kind ?? "recording",
    label: input.label,
    state: "source_only_playable",
    identityState: "source_backed",
    ...(input.sourceRef === undefined ? {} : { sourceRefs: [input.sourceRef] }),
  };
}

async function rerankRanksProviderEphemeralAheadOfLocalFuzzyDurable(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const localRef = materialRef("local-fuzzy");
  const localSource = sourceRef("track", "local-fuzzy-source");
  store.putMaterial(activeMaterial(localRef, "recording", [localSource]));
  store.putSource({
    kind: "track",
    sourceRef: localSource,
    providerId: "fixture",
    label: "Local Preferred-ish",
    title: "Local Preferred-ish",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });

  const documentProvider = createMaterialSearchDocumentProvider({ materialStore: store });
  const searchIndex = createSqliteMaterialSearchIndex({ documents: documentProvider });
  const search = createMaterialSearchService({ materialStore: store, collection: collections, searchIndex });

  const result = await assertOk(search.rerank({
    text: "Provider Preferred",
    materials: [
      durableMaterial({
        materialRef: localRef,
        label: "Local Preferred-ish",
        sourceRef: localSource,
      }),
      ephemeralMaterial({
        id: "provider-preferred",
        label: "Provider Preferred",
        sourceRef: sourceRef("track", "provider-preferred-source"),
      }),
    ],
    limit: 10,
  }));

  assert(result.hits.length >= 1, "rerank should return at least one hit");
  assert(result.hits[0]?.materialRef.kind === "ephemeral_material", "provider exact candidate should rank ahead of fuzzy durable candidate");
}

async function rerankSkipsMissingDurableCandidateAndWarns(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const documentProvider = createMaterialSearchDocumentProvider({ materialStore: store });
  const searchIndex = createSqliteMaterialSearchIndex({ documents: documentProvider });
  const search = createMaterialSearchService({ materialStore: store, collection: collections, searchIndex });

  const result = await assertOk(search.rerank({
    text: "Ephemeral Winner",
    materials: [
      durableMaterial({
        materialRef: materialRef("missing-durable"),
        label: "Missing Durable",
      }),
      ephemeralMaterial({
        id: "ephemeral-winner",
        label: "Ephemeral Winner",
        sourceRef: sourceRef("track", "ephemeral-winner-source"),
      }),
    ],
    limit: 10,
  }));

  assert(result.hits.length === 1, "missing durable rerank candidates should be skipped");
  assert(result.hits[0]?.materialRef.id === "ephemeral-winner", "remaining ephemeral candidate should still be ranked");
  assert(
    result.warnings?.some((warning) => warning.code === "material_search.missing_material_record" && warning.materialRef?.id === "missing-durable") === true,
    "missing durable rerank candidates should report a warning",
  );
}

async function rerankAppliesTargetKindAsHardFilter(): Promise<void> {
  const store = new FakeMaterialSearchStore();
  const collections = new FakeMaterialSearchCollection();
  const documentProvider = createMaterialSearchDocumentProvider({ materialStore: store });
  const searchIndex = createSqliteMaterialSearchIndex({ documents: documentProvider });
  const search = createMaterialSearchService({ materialStore: store, collection: collections, searchIndex });

  const result = await assertOk(search.rerank({
    text: "Shared Label",
    targetKind: "recording",
    materials: [
      ephemeralMaterial({
        id: "recording-shared",
        label: "Shared Label",
        sourceRef: sourceRef("track", "recording-shared-source"),
        kind: "recording",
      }),
      ephemeralMaterial({
        id: "artist-shared",
        label: "Shared Label",
        sourceRef: sourceRef("artist", "artist-shared-source"),
        kind: "artist",
      }),
    ],
    limit: 10,
  }));

  assert(result.hits.length === 1, "targetKind should hard-filter rerank inputs");
  assert(result.hits[0]?.materialRef.id === "recording-shared", "targetKind should keep only matching materials");
}

await rerankRanksProviderEphemeralAheadOfLocalFuzzyDurable();
await rerankSkipsMissingDurableCandidateAndWarns();
await rerankAppliesTargetKindAsHardFilter();
