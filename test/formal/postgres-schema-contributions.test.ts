import { agentRuntimeSchemas } from "../../src/agent_runtime/index.js";
import { musicDataPlatformSchemas } from "../../src/music_data_platform/index.js";
import { musicExperienceSchemas } from "../../src/music_experience/index.js";
import { createMusicDatabase } from "../../src/storage/index.js";
import { stageInterfaceSchemas } from "../../src/stage_interface/index.js";
import { postgresTestDatabaseUrl, resetPostgresTestSchema, } from "../support/postgres.js";
const connectionString = postgresTestDatabaseUrl();
await resetPostgresTestSchema(connectionString);
const database = await createMusicDatabase({
    connectionString,
    schemas: [
        ...agentRuntimeSchemas,
        ...musicDataPlatformSchemas,
        ...stageInterfaceSchemas,
        ...musicExperienceSchemas,
    ],
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
const musicExperienceRadioTruthTable = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'music_experience_radio_truth'
`);
if (musicExperienceRadioTruthTable === undefined) {
    throw new Error("music_experience_radio_truth table was not initialized");
}
const agentRuntimeRadioTranscriptsTable = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'agent_runtime_radio_transcripts'
`);
if (agentRuntimeRadioTranscriptsTable === undefined) {
    throw new Error("agent_runtime_radio_transcripts table was not initialized");
}
await database.close();
