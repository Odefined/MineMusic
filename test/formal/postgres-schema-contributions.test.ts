import { musicDataPlatformDownloadSchema, } from "../../src/music_data_platform/download_schema.js";
import { musicDataPlatformIdentitySchema, } from "../../src/music_data_platform/identity_schema.js";
import { musicDataPlatformMaterialTextProjectionSchema, } from "../../src/music_data_platform/material_text_projection_schema.js";
import { musicDataPlatformOwnerCatalogEntriesSchema, musicDataPlatformOwnerCatalogViewSchema, } from "../../src/music_data_platform/owner_catalog_schema.js";
import { musicDataPlatformOwnerRelationSchema, } from "../../src/music_data_platform/owner_material_relation_schema.js";
import { musicDataPlatformProjectionMaintenanceSchema, } from "../../src/music_data_platform/projection_maintenance_schema.js";
import { musicDataPlatformRetrievalResultSetSchema, } from "../../src/music_data_platform/retrieval_result_set_schema.js";
import { musicDataPlatformSourceLibrarySchema, } from "../../src/music_data_platform/source_library_schema.js";
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
        musicDataPlatformOwnerCatalogViewSchema,
        musicDataPlatformMaterialTextProjectionSchema,
        musicDataPlatformProjectionMaintenanceSchema,
        musicDataPlatformRetrievalResultSetSchema,
        musicDataPlatformDownloadSchema,
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
const materialTextFts = await context.get<{
    indexname: string;
}>(`
  SELECT indexname
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'material_text_fts_search_vector_idx'
`);
if (materialTextFts === undefined) {
    throw new Error("material text search vector index was not initialized");
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
await database.close();
