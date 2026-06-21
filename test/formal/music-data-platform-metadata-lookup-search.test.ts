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
  type CreateMusicDataPlatformMetadataLookupSearchWorkspaceInput,
  type MetadataLookupSearchCursorPosition,
  type MusicDataPlatformMetadataLookupSearchInput,
  type MusicDataPlatformMetadataLookupSearchPage,
  type MusicDataPlatformMetadataLookupSearchRow,
  type MusicDataPlatformMetadataLookupSearchWorkspace,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import type { MusicDatabase, MusicDatabaseTransactionContext } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
import { indexExists, tableColumns } from "./helpers/postgres-introspection.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Expect<Check extends true> = Check;

export type _createMusicDataPlatformMetadataLookupSearchWorkspaceInputShape =
  Expect<Equal<keyof CreateMusicDataPlatformMetadataLookupSearchWorkspaceInput, "database">>;
export type _metadataLookupSearchCursorPositionShape = Expect<Equal<
  keyof MetadataLookupSearchCursorPosition,
  "order" | "matchedTokenCount" | "bestFieldPriority" | "rankSortValue" | "rowKind" | "stableRefKey"
>>;
export type _musicDataPlatformMetadataLookupSearchInputShape = Expect<Equal<
  keyof MusicDataPlatformMetadataLookupSearchInput,
  "ownerScope" | "text" | "materialKind" | "durablePoolFilter" | "includeLocalCatalog" |
  "limit" | "queryFingerprint" | "providerCandidates" | "cursor" | "now" | "ttlMs"
>>;
export type _musicDataPlatformMetadataLookupSearchPageShape =
  Expect<Equal<MusicDataPlatformMetadataLookupSearchPage["status"], "ok" | "result_set_expired" | "material_candidate_expired" | "query_fingerprint_mismatch">>;
export type _musicDataPlatformMetadataLookupSearchRowKind =
  Expect<Equal<MusicDataPlatformMetadataLookupSearchRow["kind"], "material" | "material_candidate">>;
export type _musicDataPlatformMetadataLookupSearchWorkspaceShape =
  Expect<Equal<keyof MusicDataPlatformMetadataLookupSearchWorkspace, "searchMetadataLookupResultSet">>;

const database = await initializedDatabase();
assert.deepEqual(await tableColumns(database, "search_result_rows"), [
  "result_set_id",
  "row_kind",
  "stable_ref_key",
  "material_ref_key",
  "material_candidate_ref_key",
  "material_kind",
  "row_kind_sort",
  "score_value",
  "score_sort_value",
  "evidence_json",
  "title_text",
  "artist_text",
  "album_text",
  "version_text",
  "alias_text",
]);
assert.equal(await indexExists(database, "search_result_rows_search_vector_idx"), false);
const material = materialRef("recording", "m_night");
const resolvedSource = sourceTrack("1001", "Night", {
  artistLabels: ["Durable Artist"],
});

await database.transaction(async (db) => {
  const identity = createIdentityTestCommands(db, "2026-06-20T12:00:00.000Z");
  await identity.upsertSourceRecord({ entity: resolvedSource });
  await identity.upsertMaterialRecord({
    materialRef: material,
    kind: "recording",
  });
  await identity.bindSourceToMaterial({
    sourceRef: resolvedSource.sourceRef,
    materialRef: material,
  });
  await createSearchMetadataProjectionCommands({
    db,
    now: "2026-06-20T12:01:00.000Z",
  }).rebuildSearchMetadataDocument({
    materialRef: material,
  });
  await insertOwnerCatalogEntry(db, material, "2026-06-20T12:02:00.000Z");
});

const workspace = createMusicDataPlatformMetadataLookupSearchWorkspace({ database });
const resolvedProviderNoise = providerCandidate(sourceTrack("1001", "Provider Noise", {
  artistLabels: ["Provider Artist"],
}));
const unresolvedProviderNoise = providerCandidate(sourceTrack("2001", "Noise Song", {
  artistLabels: ["Provider Artist"],
}));

const noisePage = await workspace.searchMetadataLookupResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "noise",
  materialKind: "recording",
  includeLocalCatalog: false,
  limit: 10,
  queryFingerprint: "metadata-lookup-noise",
  providerCandidates: [resolvedProviderNoise, unresolvedProviderNoise],
  now: "2026-06-20T12:03:00.000Z",
});
assert.equal(noisePage.status, "ok");
if (noisePage.status === "ok") {
  assert.deepEqual(noisePage.rows.map((row) => row.kind), ["material_candidate"]);
  assert.equal(noisePage.rows[0]?.titleText, "noise song");
  assert.equal(JSON.stringify(noisePage.rows).includes(refKey(material)), false);
  assert.equal(await searchResultSetRowCount(database, noisePage.resultSetId), 1);
}

const nightPage = await workspace.searchMetadataLookupResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "night",
  materialKind: "recording",
  includeLocalCatalog: true,
  limit: 10,
  queryFingerprint: "metadata-lookup-night",
  providerCandidates: [resolvedProviderNoise],
  now: "2026-06-20T12:04:00.000Z",
});
assert.equal(nightPage.status, "ok");
if (nightPage.status === "ok") {
  assert.equal(nightPage.rows.length, 1);
  assert.equal(nightPage.rows[0]?.kind, "material");
  assert.equal(nightPage.rows[0]?.titleText, "night");
  assert.equal(nightPage.rows[0]?.artistText, "durable artist");
  assert.equal(nightPage.rows[0]?.rankScore.kind, "postgres_text_rank");
  assert.equal(JSON.stringify(nightPage.rows).includes("Provider Noise"), false);
  assert.equal(await searchResultSetRowCount(database, nightPage.resultSetId), 1);
}

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
      VALUES (?, ?, 'collection', ?, ?, 'positive', 1, ?::jsonb::text, ?, ?)
    `,
    [
      `entry_${materialRefValue.id}`,
      DEFAULT_OWNER_SCOPE,
      "collection:local:test",
      refKey(materialRefValue),
      JSON.stringify({ lastAddedAt: now }),
      now,
      now,
    ],
  );
}

async function searchResultSetRowCount(
  database: MusicDatabase,
  resultSetId: string,
): Promise<number> {
  const row = await database.context().get<{ row_count: number }>(
    `
      SELECT row_count
      FROM search_result_sets
      WHERE result_set_id = ?
    `,
    [resultSetId],
  );

  if (row === undefined) {
    throw new Error(`Missing search result set '${resultSetId}'.`);
  }

  return row.row_count;
}

function providerCandidate(sourceEntity: SourceEntity): ProviderMaterialCandidate {
  return { sourceEntity };
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
