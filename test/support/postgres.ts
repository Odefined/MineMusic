import { Client } from "pg";

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
  } finally {
    await client.end();
  }
}
