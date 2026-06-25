import { Client } from "pg";
import {
  PostgresMusicDatabase,
  type MusicDatabaseSchemaContribution,
} from "../../src/storage/index.js";

let testSchemaId = 0;
const AUTO_TEST_SCHEMA_PREFIX = "minemusic_test_";
const testSchemaIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const autoTestSchemaPattern = /^minemusic_test_(\d+)_(\d+)$/u;
const cleanupRegistrations = new Map<string, Set<string>>();
const autoSchemaCleanupByConnection = new Map<string, Promise<void>>();
let cleanupHooksInstalled = false;
let cleanupRunning: Promise<void> | undefined;

export function postgresTestDatabaseUrl(): string {
    const url = process.env["MINEMUSIC_TEST_DATABASE_URL"];
    if (url !== undefined && url.trim().length > 0) {
        return url;
    }
    return "postgres://postgres:postgres@127.0.0.1:55432/minemusic_test";
}
export async function resetPostgresTestSchema(connectionString = postgresTestDatabaseUrl()): Promise<void> {
    await ensureAutoTestSchemaHousekeeping(connectionString);
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
  await ensureAutoTestSchemaHousekeeping(connectionString);
  const schema = input.schema ?? `minemusic_test_${process.pid}_${++testSchemaId}`;
  if (input.reset ?? true) {
    await createPostgresTestSchema({ connectionString, schema });
  }

  const database = PostgresMusicDatabase.open({ connectionString, schema });
  if (input.reset ?? true) {
    const close = database.close.bind(database);
    let dropped = false;
    database.close = async () => {
      let closed = false;
      try {
        await close();
        closed = true;
      } finally {
        if (closed && !dropped) {
          dropped = true;
          await dropPostgresTestSchema({ connectionString, schema });
        }
      }
    };
  }

  return database;
}

export async function createPostgresTestSchema(input: { connectionString?: string; schema: string }): Promise<void> {
  const connectionString = input.connectionString ?? postgresTestDatabaseUrl();
  await ensureAutoTestSchemaHousekeeping(connectionString);
  const schema = assertSchemaIdentifier(input.schema);
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await dropSchemaWithClient(client, schema);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`GRANT ALL ON SCHEMA ${schema} TO public`);
  } finally {
    await client.end();
  }

  registerSchemaForCleanup(connectionString, schema);
}

export async function dropPostgresTestSchema(input: { connectionString?: string; schema: string }): Promise<void> {
  const connectionString = input.connectionString ?? postgresTestDatabaseUrl();
  const schema = assertSchemaIdentifier(input.schema);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await dropSchemaWithClient(client, schema);
  } finally {
    await client.end();
  }
  unregisterSchemaForCleanup(connectionString, schema);
}

async function ensureAutoTestSchemaHousekeeping(connectionString: string): Promise<void> {
  const existing = autoSchemaCleanupByConnection.get(connectionString);
  if (existing !== undefined) {
    await existing;
    return;
  }

  const run = cleanupLeakedAutoTestSchemas(connectionString);
  autoSchemaCleanupByConnection.set(connectionString, run);
  try {
    await run;
  } catch (error) {
    autoSchemaCleanupByConnection.delete(connectionString);
    throw error;
  }
}

async function cleanupLeakedAutoTestSchemas(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const rows = await client.query<{ nspname: string }>(`
      SELECT nspname
      FROM pg_namespace
      WHERE nspname LIKE $1
      ORDER BY nspname ASC
    `, [`${AUTO_TEST_SCHEMA_PREFIX}%`]);

    for (const row of rows.rows) {
      const schema = row.nspname;
      if (!isAutoTestSchema(schema) || schemaOwnedByLiveProcess(schema)) {
        continue;
      }
      await dropSchemaWithClient(client, schema);
      unregisterSchemaForCleanup(connectionString, schema);
    }
  } finally {
    await client.end();
  }
}

function registerSchemaForCleanup(connectionString: string, schema: string): void {
  installCleanupHooks();
  const existing = cleanupRegistrations.get(connectionString);
  if (existing === undefined) {
    cleanupRegistrations.set(connectionString, new Set([schema]));
    return;
  }
  existing.add(schema);
}

function unregisterSchemaForCleanup(connectionString: string, schema: string): void {
  const existing = cleanupRegistrations.get(connectionString);
  if (existing === undefined) {
    return;
  }
  existing.delete(schema);
  if (existing.size === 0) {
    cleanupRegistrations.delete(connectionString);
  }
}

function installCleanupHooks(): void {
  if (cleanupHooksInstalled) {
    return;
  }
  cleanupHooksInstalled = true;

  process.once("beforeExit", () => {
    void cleanupRegisteredSchemas().catch(reportCleanupFailure);
  });
}

async function cleanupRegisteredSchemas(): Promise<void> {
  if (cleanupRunning !== undefined) {
    await cleanupRunning;
    return;
  }

  cleanupRunning = (async () => {
    const entries = Array.from(cleanupRegistrations.entries())
      .map(([connectionString, schemas]) => ({
        connectionString,
        schemas: Array.from(schemas.values()),
      }));
    for (const entry of entries) {
      for (const schema of entry.schemas) {
        await dropPostgresTestSchema({
          connectionString: entry.connectionString,
          schema,
        });
      }
    }
  })();

  try {
    await cleanupRunning;
  } finally {
    cleanupRunning = undefined;
  }
}

function reportCleanupFailure(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Postgres test schema cleanup failed: ${message}\n`);
}

function assertSchemaIdentifier(schema: string): string {
  if (!testSchemaIdentifierPattern.test(schema)) {
    throw new Error(`Invalid Postgres test schema identifier: ${schema}`);
  }
  return schema;
}

function isAutoTestSchema(schema: string): boolean {
  return autoTestSchemaPattern.test(schema);
}

function schemaOwnedByLiveProcess(schema: string): boolean {
  const match = autoTestSchemaPattern.exec(schema);
  if (match === null) {
    return false;
  }
  const pid = Number(match[1]);
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: unknown }).code !== "ESRCH";
  }
}

async function dropSchemaWithClient(client: Client, schema: string): Promise<void> {
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}
