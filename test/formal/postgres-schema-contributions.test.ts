import { musicDataPlatformDownloadSchema, } from "../../src/music_data_platform/download_schema.js";
import { musicDataPlatformIdentitySchema, } from "../../src/music_data_platform/identity_schema.js";
import { musicDataPlatformOwnerCatalogEntriesSchema, musicDataPlatformOwnerCatalogViewSchema, } from "../../src/music_data_platform/owner_catalog_schema.js";
import { musicDataPlatformOwnerRelationSchema, } from "../../src/music_data_platform/owner_material_relation_schema.js";
import { musicDataPlatformCollectionSchema, } from "../../src/music_data_platform/collection_schema.js";
import { musicDataPlatformProjectionMaintenanceSchema, } from "../../src/music_data_platform/projection_maintenance_schema.js";
import { musicDataPlatformRetrievalResultSetSchema, } from "../../src/music_data_platform/retrieval_result_set_schema.js";
import { musicDataPlatformSearchMetadataProjectionSchema, } from "../../src/music_data_platform/search_metadata_projection_schema.js";
import { musicDataPlatformSearchResultSetSchema, } from "../../src/music_data_platform/search_result_set_schema.js";
import { musicDataPlatformSourceLibrarySchema, } from "../../src/music_data_platform/source_library_schema.js";
import { musicExperienceQueuePlaybackSchema, } from "../../src/music_experience/schema.js";
import { PostgresMusicDatabase, type PostgresMusicDatabaseSchemaContribution, } from "../../src/storage/index.js";
import { stageInterfaceHandleRegistrySchema, } from "../../src/stage_interface/handle_registry_schema.js";
import { stageInterfaceLookupCursorRegistrySchema, } from "../../src/stage_interface/lookup_cursor_registry_schema.js";
import { postgresTestDatabaseUrl, resetPostgresTestSchema, } from "../support/postgres.js";
const connectionString = postgresTestDatabaseUrl();
await resetPostgresTestSchema(connectionString);
const database = PostgresMusicDatabase.open({ connectionString });
await database.initialize({
    schemas: [
        musicDataPlatformIdentitySchema,
        musicDataPlatformSourceLibrarySchema,
        musicDataPlatformOwnerCatalogEntriesSchema,
        musicDataPlatformOwnerRelationSchema,
        musicDataPlatformCollectionSchema,
        musicDataPlatformOwnerCatalogViewSchema,
        musicDataPlatformSearchMetadataProjectionSchema,
        musicDataPlatformProjectionMaintenanceSchema,
        musicDataPlatformRetrievalResultSetSchema,
        musicDataPlatformSearchResultSetSchema,
        musicDataPlatformDownloadSchema,
        musicExperienceQueuePlaybackSchema,
        stageInterfaceHandleRegistrySchema,
        stageInterfaceLookupCursorRegistrySchema,
    ] as unknown as readonly PostgresMusicDatabaseSchemaContribution[],
});
const context = database.context();
const sourceRecords = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'source_records'
`);
if (sourceRecords === undefined) {
    throw new Error("source_records table was not initialized");
}
const searchMetadataDocuments = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'search_metadata_documents'
`);
if (searchMetadataDocuments === undefined) {
    throw new Error("search metadata documents table was not initialized");
}
const searchResultSets = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'search_result_sets'
`);
if (searchResultSets === undefined) {
    throw new Error("search result sets table was not initialized");
}
const ownerCatalogView = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name = 'owner_material_catalog_view'
`);
if (ownerCatalogView === undefined) {
    throw new Error("owner_material_catalog_view was not initialized");
}
const collectionsTable = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'collections'
`);
if (collectionsTable === undefined) {
    throw new Error("collections table was not initialized");
}
const collectionItemsTable = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'collection_items'
`);
if (collectionItemsTable === undefined) {
    throw new Error("collection_items table was not initialized");
}
const musicExperienceStateTable = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'music_experience_state'
`);
if (musicExperienceStateTable === undefined) {
    throw new Error("music_experience_state table was not initialized");
}
const musicExperienceQueueItemsTable = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'music_experience_queue_items'
`);
if (musicExperienceQueueItemsTable === undefined) {
    throw new Error("music_experience_queue_items table was not initialized");
}
await database.close();
