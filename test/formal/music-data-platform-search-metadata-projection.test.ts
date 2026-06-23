import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { SourceEntity, VersionInfo } from "../../src/contracts/music_data_platform.js";
import {
  createSearchMetadataProjectionCommands,
  createSearchMetadataProjectionRecords,
  musicDataPlatformIdentitySchema,
  musicDataPlatformSearchMetadataProjectionSchema,
  type CreateSearchMetadataProjectionCommandsInput,
  type CreateSearchMetadataProjectionRecordsInput,
  type GetSearchMetadataDocumentInput,
  type RebuildSearchMetadataDocumentInput,
  type RebuildSearchMetadataDocumentSummary,
  type RebuildSearchMetadataDocumentsInput,
  type RebuildSearchMetadataDocumentsSummary,
  type SearchMetadataDocumentRecord,
  type SearchMetadataProjectionCommands,
  type SearchMetadataProjectionReadPort,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import {
  buildRuntimeProviderCandidateSearchMetadata,
  type SearchMetadataDocumentFields,
} from "../../src/music_data_platform/search_metadata_document_builder.js";
import { normalizeSearchMetadataValue } from "../../src/music_data_platform/search_metadata_normalization.js";
import type { MusicDatabase, MusicDatabaseParameter, MusicDatabaseTransactionContext } from "../../src/storage/index.js";
import { foreignKeyColumns, indexExists, primaryKeyColumns, relationKind, tableColumns } from "./helpers/postgres-introspection.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Expect<Check extends true> = Check;

export type _createSearchMetadataProjectionRecordsInputShape =
  Expect<Equal<keyof CreateSearchMetadataProjectionRecordsInput, "db">>;
export type _getSearchMetadataDocumentInputShape =
  Expect<Equal<keyof GetSearchMetadataDocumentInput, "materialRef">>;
export type _searchMetadataDocumentRecordShape = Expect<Equal<
  keyof SearchMetadataDocumentRecord,
  "materialRefKey" | "materialKind" | "fieldsJson" | "titleText" | "artistText" |
  "albumText" | "versionText" | "aliasText" | "searchText" | "updatedAt"
>>;
export type _searchMetadataProjectionReadPortShape =
  Expect<Equal<keyof SearchMetadataProjectionReadPort, "getSearchMetadataDocument">>;
export type _createSearchMetadataProjectionCommandsInputShape =
  Expect<Equal<keyof CreateSearchMetadataProjectionCommandsInput, "db" | "now">>;
export type _rebuildSearchMetadataDocumentInputShape =
  Expect<Equal<keyof RebuildSearchMetadataDocumentInput, "materialRef">>;
export type _rebuildSearchMetadataDocumentsInputShape =
  Expect<Equal<keyof RebuildSearchMetadataDocumentsInput, "materialRefs">>;
export type _rebuildSearchMetadataDocumentSummaryShape =
  Expect<Equal<keyof RebuildSearchMetadataDocumentSummary, "materialRefKey" | "outcome">>;
export type _rebuildSearchMetadataDocumentsSummaryShape = Expect<Equal<
  keyof RebuildSearchMetadataDocumentsSummary,
  "processedMaterialCount" | "rebuiltDocumentCount" | "deletedDocumentCount" | "outcomes"
>>;
export type _searchMetadataProjectionCommandsShape = Expect<Equal<
  keyof SearchMetadataProjectionCommands,
  "rebuildSearchMetadataDocument" | "rebuildSearchMetadataDocuments"
>>;

assert.equal(normalizeSearchMetadataValue(" Ｎight\tCafé "), "night cafe");

const schemaDatabase = await initializedDatabase();
assert.equal(await relationKind(schemaDatabase, "search_metadata_documents"), "table");
assert.equal(await indexExists(schemaDatabase, "search_metadata_documents_material_kind_idx"), true);
assert.equal(await indexExists(schemaDatabase, "search_metadata_documents_search_vector_idx"), true);
assert.equal(await indexExists(schemaDatabase, "search_metadata_documents_search_text_trgm_idx"), true);
assert.deepEqual(await tableColumns(schemaDatabase, "search_metadata_documents"), [
  "material_ref_key",
  "material_kind",
  "fields_json",
  "title_text",
  "artist_text",
  "album_text",
  "version_text",
  "alias_text",
  "search_text",
  "search_vector",
  "updated_at",
]);
assert.deepEqual(await primaryKeyColumns(schemaDatabase, "search_metadata_documents"), ["material_ref_key"]);
assert.deepEqual(await foreignKeyColumns(schemaDatabase, "search_metadata_documents"), [
  {
    table: "material_records",
    from: "material_ref_key",
    to: "ref_key",
  },
]);
await schemaDatabase.close();

const database = await initializedDatabase();
const nightMaterialRef = materialRef("recording", "m_night");
const canonical = canonicalRef("recording", "c_night");
const providerTrack = sourceTrack("1001", "Night", {
  artistLabels: ["The Night Band"],
  albumLabel: "First Light",
  versionInfo: {
    label: "Live",
  },
});
const duplicateProviderTrack = sourceTrack("1002", " night ", {
  artistLabels: ["the night band"],
  albumLabel: "Second Light",
  versionInfo: {
    tags: ["live"],
  },
});

await database.transaction(async (db) => {
  const identity = createIdentityTestCommands(db, "2026-06-20T10:00:00.000Z");
  let searchMetadataDocumentUpdateCount = 0;

  await identity.upsertSourceRecord({ entity: providerTrack });
  await identity.upsertSourceRecord({ entity: duplicateProviderTrack });
  await identity.upsertMaterialRecord({
    materialRef: nightMaterialRef,
    kind: "recording",
    versionInfo: {
      label: "Remaster",
    },
  });
  await identity.upsertCanonicalRecord({
    entity: {
      canonicalRef: canonical,
      kind: "recording",
      label: "Night",
      aliases: ["Nite"],
      versionInfo: {
        label: "Canonical Mix",
      },
    },
    status: "active",
  });
  await identity.bindSourceToMaterial({
    sourceRef: providerTrack.sourceRef,
    materialRef: nightMaterialRef,
  });
  await identity.bindSourceToMaterial({
    sourceRef: duplicateProviderTrack.sourceRef,
    materialRef: nightMaterialRef,
  });
  await identity.bindMaterialToCanonical({
    materialRef: nightMaterialRef,
    canonicalRef: canonical,
  });
  const summary = await createSearchMetadataProjectionCommands({
    db: wrapTransactionWithRunInterceptor(db, ({ sql }) => {
      if (sql.includes("UPDATE search_metadata_documents")) {
        searchMetadataDocumentUpdateCount += 1;
      }
    }),
    now: "2026-06-20T10:05:00.000Z",
  }).rebuildSearchMetadataDocuments({
    materialRefs: [nightMaterialRef, nightMaterialRef],
  });
  assert.deepEqual(summary, {
    processedMaterialCount: 1,
    rebuiltDocumentCount: 1,
    deletedDocumentCount: 0,
    outcomes: [
      {
        materialRefKey: refKey(nightMaterialRef),
        outcome: "rebuilt",
      },
    ],
  });
  assert.equal(searchMetadataDocumentUpdateCount, 0);
});

const document = await createSearchMetadataProjectionRecords({
  db: database.context(),
}).getSearchMetadataDocument({
  materialRef: nightMaterialRef,
});
assert.equal(document?.materialRefKey, refKey(nightMaterialRef));
assert.equal(document?.materialKind, "recording");
assert.equal(document?.titleText, "night");
assert.equal(document?.artistText, "the night band");
assert.equal(document?.albumText, "first light\nsecond light");
assert.equal(document?.versionText, "canonical mix\nlive\nremaster");
assert.equal(document?.aliasText, "nite");
assert.equal(document?.searchText.includes("night"), true);
assert.equal(JSON.stringify(document).includes("primary_source"), false);

const fields = JSON.parse(document?.fieldsJson ?? "{}") as {
  fields: SearchMetadataDocumentFields;
};
assert.equal(fields.fields.title.length, 1);
assert.equal(fields.fields.title[0]?.value, "night");
assert.deepEqual(fields.fields.title[0]?.attributions.map((entry) => entry.kind).sort(), [
  "bound_source_fact",
  "bound_source_fact",
  "canonical_fact",
]);
assert.equal(fields.fields.alias[0]?.value, "nite");

const indexed = await database.context().get<{ material_ref_key: string }>(
  `
    SELECT material_ref_key
    FROM search_metadata_documents
    WHERE search_vector @@ to_tsquery('simple', ?)
  `,
  ["night"],
);
assert.equal(indexed?.material_ref_key, refKey(nightMaterialRef));

const runtimeCandidate = buildRuntimeProviderCandidateSearchMetadata({
  sourceEntity: sourceTrack("candidate_1", "Provider Night", {
    artistLabels: ["Provider Artist"],
    albumLabel: "Provider Album",
  }),
});
assert.equal(runtimeCandidate.titleText, "provider night");
assert.equal(runtimeCandidate.artistText, "provider artist");
assert.equal(JSON.stringify(runtimeCandidate).includes("provider_candidate_fact"), true);

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

async function initializedDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformSearchMetadataProjectionSchema,
    ],
  });
  return database;
}

function wrapTransactionWithRunInterceptor(
  context: MusicDatabaseTransactionContext,
  interceptor: (input: {
    sql: string;
    params: readonly MusicDatabaseParameter[] | undefined;
  }) => void,
): MusicDatabaseTransactionContext {
  return {
    async run(sql: string, params?: readonly MusicDatabaseParameter[]) {
      await context.run(sql, params);
      interceptor({ sql, params });
    },
    async all<Row>(sql: string, params?: readonly MusicDatabaseParameter[]) {
      return await context.all<Row>(sql, params);
    },
    async get<Row>(sql: string, params?: readonly MusicDatabaseParameter[]) {
      return await context.get<Row>(sql, params);
    },
  } as MusicDatabaseTransactionContext;
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

function canonicalRef(kind: string, id: string): Ref {
  return {
    namespace: "canonical_minemusic",
    kind,
    id,
  };
}
