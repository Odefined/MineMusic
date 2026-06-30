import { agentRuntimeSchemas } from "../../src/agent_runtime/index.js";
import { musicDataPlatformSchemas } from "../../src/music_data_platform/index.js";
import { musicExperienceSchemas } from "../../src/music_experience/index.js";
import { createMusicDatabase } from "../../src/storage/index.js";
import { stageInterfaceSchemas } from "../../src/stage_interface/index.js";
import {
    createPostgresTestSchema,
    dropPostgresTestSchema,
    postgresTestDatabaseUrl,
    resetPostgresTestSchema,
} from "../support/postgres.js";
const connectionString = postgresTestDatabaseUrl();
await resetPostgresTestSchema(connectionString);
const legacyDatabase = await createMusicDatabase({
    connectionString,
    schemas: [{
        id: "test.agent_runtime_radio_transcript_v1",
        async apply(context) {
            await context.run(`
              CREATE TABLE agent_runtime_radio_transcripts (
                owner_scope TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                messages_json JSONB NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(owner_scope, workspace_id)
              )
            `);
            await context.run(`
              INSERT INTO agent_runtime_radio_transcripts (
                owner_scope,
                workspace_id,
                messages_json,
                created_at,
                updated_at
              ) VALUES (
                'legacy-owner',
                'legacy-workspace',
                '[{"role":"assistant","content":[]}]'::jsonb,
                '2026-06-30T00:00:00.000Z',
                '2026-06-30T00:00:00.000Z'
              )
            `);
        },
    }],
});
await legacyDatabase.close();
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
const agentRuntimeTranscriptsTable = await context.get<{
    table_name: string;
}>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'agent_runtime_transcripts'
`);
if (agentRuntimeTranscriptsTable === undefined) {
    throw new Error("agent_runtime_transcripts table was not initialized");
}
const migratedRadioTranscript = await context.get<{
    actor_kind: string;
    messages_json: unknown;
}>(`
  SELECT actor_kind, messages_json
  FROM agent_runtime_transcripts
  WHERE owner_scope = 'legacy-owner'
    AND workspace_id = 'legacy-workspace'
`);
if (migratedRadioTranscript?.actor_kind !== "radio_agent") {
    throw new Error("legacy Radio transcript was not migrated into the shared actor transcript store");
}
const retiredRadioTranscriptsTable = await context.get<{ table_name: string }>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'agent_runtime_radio_transcripts'
`);
if (retiredRadioTranscriptsTable !== undefined) {
    throw new Error("legacy Radio-only transcript table remained after shared-store migration");
}
await database.close();

const customSchema = `minemusic_test_agent_runtime_${process.pid}`;
await createPostgresTestSchema({ connectionString, schema: customSchema });
try {
    const customLegacyDatabase = await createMusicDatabase({
        connectionString,
        schema: customSchema,
        schemas: [{
            id: "test.agent_runtime_radio_transcript_v1_custom_schema",
            async apply(context) {
                await context.run(`
                  CREATE TABLE agent_runtime_radio_transcripts (
                    owner_scope TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    messages_json JSONB NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY(owner_scope, workspace_id)
                  )
                `);
                await context.run(`
                  INSERT INTO agent_runtime_radio_transcripts (
                    owner_scope,
                    workspace_id,
                    messages_json,
                    created_at,
                    updated_at
                  ) VALUES (
                    'custom-legacy-owner',
                    'custom-legacy-workspace',
                    '[{"role":"assistant","content":[]}]'::jsonb,
                    '2026-06-30T00:00:00.000Z',
                    '2026-06-30T00:00:00.000Z'
                  )
                `);
            },
        }],
    });
    await customLegacyDatabase.close();

    const customDatabase = await createMusicDatabase({
        connectionString,
        schema: customSchema,
        schemas: agentRuntimeSchemas,
    });
    const customContext = customDatabase.context();
    const customMigratedRadioTranscript = await customContext.get<{
        actor_kind: string;
    }>(`
      SELECT actor_kind
      FROM agent_runtime_transcripts
      WHERE owner_scope = 'custom-legacy-owner'
        AND workspace_id = 'custom-legacy-workspace'
    `);
    if (customMigratedRadioTranscript?.actor_kind !== "radio_agent") {
        throw new Error("custom-schema legacy Radio transcript was not migrated into the shared actor transcript store");
    }
    const customRetiredRadioTranscriptsTable = await customContext.get<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name = 'agent_runtime_radio_transcripts'
    `, [customSchema]);
    if (customRetiredRadioTranscriptsTable !== undefined) {
        throw new Error("custom-schema legacy Radio-only transcript table remained after shared-store migration");
    }
    await customDatabase.close();
} finally {
    await dropPostgresTestSchema({ connectionString, schema: customSchema });
}
