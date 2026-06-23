import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { ProviderMaterialCandidate, SourceEntity, VersionInfo } from "../../src/contracts/music_data_platform.js";
import {
  DEFAULT_OWNER_SCOPE,
  createMusicDataPlatformMetadataLookupSearchWorkspace,
  createSearchMetadataProjectionCommands,
  musicDataPlatformIdentitySchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformRetrievalResultSetSchema,
  musicDataPlatformSearchMetadataProjectionSchema,
  musicDataPlatformSearchResultSetSchema,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import {
  createMetadataLookupRetrievalQueryService,
  type RetrievalProviderSearchInput,
  type RetrievalProviderSearchPort,
} from "../../src/music_intelligence/index.js";
import type { MusicDatabase, MusicDatabaseTransactionContext } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

const database = await initializedDatabase();
const material = materialRef("recording", "m_adapter_night");
const boundSource = sourceTrack("1001", "Night", {
  artistLabels: ["Durable Artist"],
});
const unresolvedProviderCandidate = providerCandidate(sourceTrack("2001", "Night Provider", {
  artistLabels: ["Provider Artist"],
}));
const providerCalls: RetrievalProviderSearchInput[] = [];
const providerSearch: RetrievalProviderSearchPort = {
  async search(input) {
    providerCalls.push(input);
    return {
      providerId: input.providerId,
      query: input.query,
      candidates: [unresolvedProviderCandidate],
    };
  },
};

await database.transaction(async (db) => {
  const identity = createIdentityTestCommands(db, "2026-06-21T12:00:00.000Z");
  await identity.upsertSourceRecord({ entity: boundSource });
  await identity.upsertMaterialRecord({
    materialRef: material,
    kind: "recording",
  });
  await identity.bindSourceToMaterial({
    sourceRef: boundSource.sourceRef,
    materialRef: material,
  });
  await createSearchMetadataProjectionCommands({
    db,
    now: "2026-06-21T12:01:00.000Z",
  }).rebuildSearchMetadataDocument({
    materialRef: material,
  });
  await insertOwnerCatalogEntry(db, material, "2026-06-21T12:02:00.000Z");
});

const retrieval = createMetadataLookupRetrievalQueryService({
  searchWorkspace: createMusicDataPlatformMetadataLookupSearchWorkspace({
    database,
  }),
  providerSearch,
});
const firstPage = await retrieval.query({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "night",
  materialKind: "recording",
  pools: {
    anyOf: [
      { kind: "local_catalog" },
      { kind: "provider_search", providerId: "netease" },
    ],
  },
  order: "text_relevance",
  limit: 1,
  sessionId: "metadata-lookup-adapter-session",
});

assert.equal(providerCalls.length, 1);
assert.deepEqual(providerCalls[0], {
  providerId: "netease",
  query: {
    text: "night",
    targetKinds: ["track"],
    limit: 2,
    offset: 0,
  },
  sessionId: "metadata-lookup-adapter-session",
});
assert.equal(firstPage.hits.length, 1);
const nextCursor = firstPage.page.nextCursor;
assert.equal(typeof nextCursor, "string");
if (nextCursor === undefined) {
  throw new Error("Expected first metadata lookup page to return a cursor.");
}
assert.equal(nextCursor.startsWith("ey"), true);

const storedResultSet = await database.context().get<{
  query_fingerprint: string;
  row_count: number;
}>(`
  SELECT query_fingerprint, row_count
  FROM search_result_sets
  ORDER BY created_at DESC, result_set_id DESC
  LIMIT 1
`);
assert.equal(storedResultSet?.query_fingerprint.startsWith("mlqf_"), true);
assert.equal(storedResultSet?.query_fingerprint.startsWith("rqf_"), false);
assert.equal(storedResultSet?.row_count, 2);

const secondPage = await retrieval.query({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "night",
  materialKind: "recording",
  pools: {
    anyOf: [
      { kind: "local_catalog" },
      { kind: "provider_search", providerId: "netease" },
    ],
  },
  order: "text_relevance",
  cursor: nextCursor,
  limit: 10,
  sessionId: "metadata-lookup-adapter-session",
});

assert.equal(providerCalls.length, 1);
assert.equal(secondPage.hits.length, 1);
assert.deepEqual(
  [...new Set([...firstPage.hits, ...secondPage.hits].map((hit) => hit.kind))].sort(),
  ["material", "material_candidate"],
);

await database.close();

function createIdentityTestCommands(
  db: MusicDatabaseTransactionContext,
  now: string,
) {
  return createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
}

async function insertOwnerCatalogEntry(
  db: MusicDatabaseTransactionContext,
  materialRefValue: Ref,
  now: string,
): Promise<void> {
  await db.run(
    `
      INSERT INTO owner_material_entries (
        entry_key,
        owner_scope,
        entry_kind,
        entry_ref_key,
        material_ref_key,
        visibility_role,
        active,
        provenance_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, 'collection', ?, ?, 'positive', 1, ?::jsonb, ?, ?)
    `,
    [
      `entry_${materialRefValue.id}`,
      DEFAULT_OWNER_SCOPE,
      "collection:local:adapter-test",
      refKey(materialRefValue),
      JSON.stringify({ lastAddedAt: now }),
      now,
      now,
    ],
  );
}

async function initializedDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformOwnerRelationSchema,
      musicDataPlatformOwnerCatalogEntriesSchema,
      musicDataPlatformOwnerCatalogViewSchema,
      musicDataPlatformSearchMetadataProjectionSchema,
      musicDataPlatformRetrievalResultSetSchema,
      musicDataPlatformSearchResultSetSchema,
    ],
  });
  return database;
}

function providerCandidate(sourceEntity: SourceEntity): ProviderMaterialCandidate {
  return { sourceEntity };
}

function sourceTrack(
  id: string,
  title: string,
  input: {
    artistLabels?: readonly string[];
    albumLabel?: string;
    versionInfo?: VersionInfo;
  } = {},
): Extract<SourceEntity, { kind: "track" }> {
  return {
    origin: "provider",
    providerId: "netease",
    providerEntityId: id,
    sourceRef: sourceRef("track", id),
    kind: "track",
    label: title,
    title,
    ...(input.artistLabels === undefined ? {} : { artistLabels: input.artistLabels }),
    ...(input.albumLabel === undefined ? {} : { albumLabel: input.albumLabel }),
    ...(input.versionInfo === undefined ? {} : { versionInfo: input.versionInfo }),
  };
}

function sourceRef(kind: string, id: string): Ref {
  return {
    namespace: "source_netease",
    kind,
    id,
  };
}

function materialRef(kind: string, id: string): Ref {
  return {
    namespace: "material",
    kind,
    id,
  };
}
