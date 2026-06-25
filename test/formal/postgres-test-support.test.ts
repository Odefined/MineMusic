import assert from "node:assert/strict";
import { Client } from "pg";

import {
  openUninitializedPostgresTestMusicDatabase,
  postgresTestDatabaseUrl,
} from "../support/postgres.js";

const connectionString = postgresTestDatabaseUrl();
const orphanSchema = "minemusic_test_99999999_1";
const activeSchema = `minemusic_test_${process.pid}_424242`;

await seedSchema(orphanSchema);
await dropSchema(activeSchema);

const database = await openUninitializedPostgresTestMusicDatabase({
  connectionString,
  schema: activeSchema,
});

assert.equal(await schemaExists(orphanSchema), false, "first helper open should clean leaked auto-test schemas from dead processes");
assert.equal(await schemaExists(activeSchema), true, "requested helper schema should exist while the database is open");

await database.close();

assert.equal(await schemaExists(activeSchema), false, "helper-opened test schemas should be dropped on close");

async function schemaExists(schema: string): Promise<boolean> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<{ nspname: string }>(`
      SELECT nspname
      FROM pg_namespace
      WHERE nspname = $1
    `, [schema]);
    return (result.rowCount ?? 0) > 0;
  } finally {
    await client.end();
  }
}

async function seedSchema(schema: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`GRANT ALL ON SCHEMA ${schema} TO public`);
  } finally {
    await client.end();
  }
}

async function dropSchema(schema: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    await client.end();
  }
}
