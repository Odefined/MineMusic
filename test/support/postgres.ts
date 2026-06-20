import { Client } from "pg";
import {
  PostgresMusicDatabase,
  type MusicDatabaseSchemaContribution,
} from "../../src/storage/index.js";

let testSchemaId = 0;
export function postgresTestDatabaseUrl(): string {
    const url = process.env["MINEMUSIC_TEST_DATABASE_URL"];
    if (url !== undefined && url.trim().length > 0) {
        return url;
    }
    return "postgres://postgres:postgres@127.0.0.1:55432/minemusic_test";
}
export async function resetPostgresTestSchema(connectionString = postgresTestDatabaseUrl()): Promise<void> {
    const client = new Client({ connectionString });
    await client.connect();
    try {
        await client.query("DROP SCHEMA IF EXISTS public CASCADE");
        await client.query("CREATE SCHEMA public");
        await client.query("GRANT ALL ON SCHEMA public TO public");
    }
    finally {
        await client.end();
    }
}

export type OpenPostgresTestMusicDatabaseInput = {
  connectionString?: string;
  schema?: string;
  reset?: boolean;
  schemas?: readonly MusicDatabaseSchemaContribution[];
};

export async function openPostgresTestMusicDatabase(
  input: OpenPostgresTestMusicDatabaseInput = {},
): Promise<PostgresMusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase(input);
  await database.initialize(input);
  return database;
}

export async function openUninitializedPostgresTestMusicDatabase(
  input: Pick<OpenPostgresTestMusicDatabaseInput, "connectionString" | "schema" | "reset"> = {},
): Promise<PostgresMusicDatabase> {
  const connectionString = input.connectionString ?? postgresTestDatabaseUrl();
  const schema = input.schema ?? `minemusic_test_${process.pid}_${++testSchemaId}`;
  if (input.reset ?? true) {
    await createPostgresTestSchema({ connectionString, schema });
  }

  return PostgresMusicDatabase.open({ connectionString, schema });
}

export async function createPostgresTestSchema(input: { connectionString?: string; schema: string }): Promise<void> {
  const connectionString = input.connectionString ?? postgresTestDatabaseUrl();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`DROP SCHEMA IF EXISTS ${input.schema} CASCADE`);
    await client.query(`CREATE SCHEMA ${input.schema}`);
    await client.query(`GRANT ALL ON SCHEMA ${input.schema} TO public`);
  } finally {
    await client.end();
  }
}
