import assert from "node:assert/strict";
import { Client } from "pg";
import { createMusicDatabase, isMusicDatabaseError, MusicDatabaseError, PostgresMusicDatabase, type PostgresMusicDatabaseContext, type PostgresMusicDatabaseSchemaContribution, } from "../../src/storage/index.js";
import { postgresTestDatabaseUrl, resetPostgresTestSchema, } from "../support/postgres.js";
const connectionString = postgresTestDatabaseUrl();
assertDatabaseError(() => PostgresMusicDatabase.open({ connectionString: "" }), "storage.invalid_database_url");
assertDatabaseError(() => PostgresMusicDatabase.open({ connectionString: "   " }), "storage.invalid_database_url");
assertDatabaseError(() => PostgresMusicDatabase.open({ connectionString, transactionTimeoutMs: 0 }), "storage.invalid_transaction_timeout");
assertDatabaseError(() => PostgresMusicDatabase.open({ connectionString, transactionTimeoutMs: 1.5 }), "storage.invalid_transaction_timeout");
await resetPostgresTestSchema(connectionString);
const preInitDatabase = PostgresMusicDatabase.open({ connectionString });
assertDatabaseError(() => preInitDatabase.context(), "storage.database_not_initialized");
await assertDatabaseErrorAsync(() => preInitDatabase.transaction(async () => undefined), "storage.database_not_initialized");
await preInitDatabase.close();
const orderedDatabase = PostgresMusicDatabase.open({ connectionString });
const schemaOrder: string[] = [];
await orderedDatabase.initialize({
    schemas: [
        schema("first", schemaOrder, async (context) => {
            await context.run("CREATE TABLE first_schema (id SERIAL PRIMARY KEY, label TEXT)");
        }),
        schema("second", schemaOrder, async (context) => {
            await context.run("CREATE TABLE second_schema (id SERIAL PRIMARY KEY, label TEXT)");
        }),
        schema("unique", schemaOrder, async (context) => {
            await context.run("CREATE TABLE unique_schema (id SERIAL PRIMARY KEY, label TEXT UNIQUE)");
            await context.run("INSERT INTO unique_schema (label) VALUES (?)", ["duplicate"]);
        }),
        schema("blob", schemaOrder, async (context) => {
            await context.run("CREATE TABLE blob_schema (id SERIAL PRIMARY KEY, payload BYTEA)");
        }),
    ],
});
assert.deepEqual(schemaOrder, ["first", "second", "unique", "blob"]);
await assertDatabaseErrorAsync(async () => await orderedDatabase.initialize(), "storage.database_already_initialized");
const context = orderedDatabase.context();
await context.run("INSERT INTO first_schema (label) VALUES (?)", ["alpha"]);
await context.run("INSERT INTO first_schema (label) VALUES (?)", ["beta"]);
assert.deepEqual((await context.all<{
    label: string;
}>("SELECT label FROM first_schema WHERE label > ? ORDER BY label", ["a"])).map((row) => row.label), ["alpha", "beta"]);
assert.equal((await context.get<{
    label: string;
}>("SELECT label FROM first_schema WHERE label = ?", ["alpha"]))?.label, "alpha");
assert.equal(await context.get<{
    label: string;
}>("SELECT label FROM first_schema WHERE label = ?", ["missing"]), undefined);
const blobPayload = new Uint8Array([1, 2, 3]);
await context.run("INSERT INTO blob_schema (payload) VALUES (?)", [blobPayload]);
const storedBlob = await context.get<{
    payload: Uint8Array;
}>("SELECT payload FROM blob_schema");
assert.ok(storedBlob?.payload instanceof Uint8Array);
assert.deepEqual(Array.from(storedBlob.payload), [1, 2, 3]);
await orderedDatabase.transaction(async (tx) => {
    await tx.run("INSERT INTO first_schema (label) VALUES (?)", ["committed"]);
});
assert.equal((await context.get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM first_schema WHERE label = ?", ["committed"]))?.count, 1);
const rollbackError = new Error("rollback fixture");
await assert.rejects(async () => {
    await orderedDatabase.transaction(async (tx) => {
        await tx.run("INSERT INTO first_schema (label) VALUES (?)", ["rolled-back"]);
        throw rollbackError;
    });
}, (error) => error === rollbackError);
assert.equal((await context.get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM first_schema WHERE label = ?", ["rolled-back"]))?.count, 0);
await orderedDatabase.transaction(async (tx) => {
    await tx.run("INSERT INTO first_schema (label) VALUES (?)", ["after-rollback"]);
});
assert.equal((await context.get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM first_schema WHERE label = ?", ["after-rollback"]))?.count, 1);
await orderedDatabase.transaction(async () => {
    await assertDatabaseErrorAsync(() => orderedDatabase.transaction(async () => undefined), "storage.transaction_already_active");
    await assertDatabaseErrorAsync(() => orderedDatabase.close(), "storage.transaction_already_active");
});
let releaseFirstTransaction: () => void = () => {};
const firstTransactionMayFinish = new Promise<void>((resolve) => {
    releaseFirstTransaction = resolve;
});
const transactionOrder: string[] = [];
const firstConcurrentTransaction = orderedDatabase.transaction(async (tx) => {
    transactionOrder.push("first:start");
    await tx.run("INSERT INTO first_schema (label) VALUES (?)", ["queued-first"]);
    await firstTransactionMayFinish;
    transactionOrder.push("first:end");
});
await waitUntil(() => transactionOrder.includes("first:start"));
const secondConcurrentTransaction = orderedDatabase.transaction(async (tx) => {
    transactionOrder.push("second:start");
    await tx.run("INSERT INTO first_schema (label) VALUES (?)", ["queued-second"]);
    transactionOrder.push("second:end");
});
for (let attempt = 0; attempt < 20 && !transactionOrder.includes("second:end"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
}
const transactionOrderBeforeFirstReleased = transactionOrder.slice();
releaseFirstTransaction();
await Promise.all([firstConcurrentTransaction, secondConcurrentTransaction]);
assert.deepEqual(transactionOrderBeforeFirstReleased, ["first:start", "second:start", "second:end"]);
assert.deepEqual(transactionOrder, ["first:start", "second:start", "second:end", "first:end"]);
assert.equal((await context.get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM first_schema WHERE label IN (?, ?)", ["queued-first", "queued-second"]))?.count, 2);
let staleContext: PostgresMusicDatabaseContext | undefined;
await orderedDatabase.transaction(async (tx) => {
    staleContext = tx;
});
if (staleContext === undefined) {
    throw new Error("transaction fixture did not capture a context");
}
const capturedStaleContext = staleContext;
await assertDatabaseErrorAsync(() => capturedStaleContext.run("INSERT INTO first_schema (label) VALUES (?)", ["stale"]), "storage.transaction_context_inactive");
await orderedDatabase.close();
await orderedDatabase.close();
assertDatabaseError(() => orderedDatabase.context(), "storage.database_closed");
await assertDatabaseErrorAsync(() => orderedDatabase.transaction(async () => undefined), "storage.database_closed");
await assertDatabaseErrorAsync(async () => await orderedDatabase.initialize(), "storage.database_closed");
await resetPostgresTestSchema(connectionString);
const timeoutDatabase = PostgresMusicDatabase.open({ connectionString, transactionTimeoutMs: 250 });
await timeoutDatabase.initialize({
    schemas: [
        schema("transaction_timeout", [], async (timeoutContext) => {
            await timeoutContext.run("CREATE TABLE transaction_timeout_fixture (label TEXT PRIMARY KEY)");
        }),
    ],
});
const timeoutContext = timeoutDatabase.context();
assert.equal((await timeoutContext.get<{
    statement_timeout: string;
}>("SHOW statement_timeout"))?.statement_timeout, "250ms");
let timeoutTransactionStarted = false;
const timedOutTransaction = timeoutDatabase.transaction(async (tx) => {
    await tx.run("INSERT INTO transaction_timeout_fixture (label) VALUES (?)", ["timed-out"]);
    timeoutTransactionStarted = true;
    await new Promise<never>(() => {});
});
await waitUntil(() => timeoutTransactionStarted);
const queuedAfterTimeout = timeoutDatabase.transaction(async (tx) => {
    await tx.run("INSERT INTO transaction_timeout_fixture (label) VALUES (?)", ["queued-after-timeout"]);
});
await assertDatabaseErrorAsync(() => timedOutTransaction, "storage.transaction_timeout");
await queuedAfterTimeout;
assert.deepEqual(await timeoutContext.all<{
    label: string;
}>("SELECT label FROM transaction_timeout_fixture ORDER BY label"), [{ label: "queued-after-timeout" }]);
await timeoutDatabase.close();
await resetPostgresTestSchema(connectionString);
const failingDatabase = PostgresMusicDatabase.open({ connectionString });
await assertDatabaseErrorAsync(async () => await failingDatabase.initialize({
    schemas: [
        {
            id: "failing",
            apply() {
                throw new Error("schema fixture failed");
            },
        },
    ],
}), "storage.database_initialization_failed");
assertDatabaseError(() => failingDatabase.context(), "storage.database_initialization_failed");
await assertDatabaseErrorAsync(() => failingDatabase.transaction(async () => undefined), "storage.database_initialization_failed");
await assertDatabaseErrorAsync(async () => await failingDatabase.initialize(), "storage.database_initialization_failed");
await failingDatabase.close();
await failingDatabase.close();
await resetPostgresTestSchema(connectionString);
const factoryDatabase = await createMusicDatabase({
    connectionString,
    schemas: [
        schema("factory", [], async (factoryContext) => {
            await factoryContext.run("CREATE TABLE factory_schema (id SERIAL PRIMARY KEY)");
        }),
    ],
});
await factoryDatabase.context().run("INSERT INTO factory_schema DEFAULT VALUES");
assert.equal((await factoryDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM factory_schema"))?.count, 1);
await factoryDatabase.close();
await resetPostgresTestSchema(connectionString);
const failingFactoryApplicationName = `minemusic_factory_failure_${process.pid}`;
await assertDatabaseErrorAsync(async () => await createMusicDatabase({
    connectionString: connectionStringWithApplicationName(connectionString, failingFactoryApplicationName),
    schemas: [
        {
            id: "failing_factory",
            async apply(context) {
                await context.run("CREATE TABLE failing_factory_schema (id SERIAL PRIMARY KEY)");
                throw new Error("factory schema fixture failed");
            },
        },
    ],
}), "storage.database_initialization_failed");
assert.equal(await postgresApplicationConnectionCount(connectionString, failingFactoryApplicationName), 0);
await resetPostgresTestSchema(connectionString);
await assertDatabaseErrorAsync(async () => await createMusicDatabase({
    connectionString,
    schemas: [
        schema("initialization_atomic_first", [], async (context) => {
            await context.run("CREATE TABLE initialization_atomic_first (label TEXT PRIMARY KEY)");
            await context.run("INSERT INTO initialization_atomic_first (label) VALUES (?)", ["rolled-back"]);
        }),
        schema("initialization_atomic_failure", [], async (context) => {
            await context.run("CREATE TABLE initialization_atomic_failure (label TEXT PRIMARY KEY)");
            throw new Error("schema initialization atomicity fixture failed");
        }),
    ],
}), "storage.database_initialization_failed");
assert.deepEqual(await postgresTableNames(connectionString, [
    "initialization_atomic_first",
    "initialization_atomic_failure",
]), []);
function schema(id: string, order: string[], apply: (context: PostgresMusicDatabaseContext) => Promise<void>): PostgresMusicDatabaseSchemaContribution {
    return {
        id,
        async apply(context) {
            order.push(id);
            await apply(context);
        },
    };
}
function assertDatabaseError(operation: () => unknown, code: MusicDatabaseError["code"]): void {
    assert.throws(operation, (error) => isMusicDatabaseError(error) && error.code === code);
}
async function assertDatabaseErrorAsync(operation: () => Promise<unknown>, code: MusicDatabaseError["code"]): Promise<void> {
    await assert.rejects(operation, (error) => isMusicDatabaseError(error) && error.code === code);
}
async function waitUntil(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Timed out waiting for test condition.");
}
function connectionStringWithApplicationName(connectionString: string, applicationName: string): string {
    const url = new URL(connectionString);
    url.searchParams.set("application_name", applicationName);
    return url.toString();
}
async function postgresApplicationConnectionCount(connectionString: string, applicationName: string): Promise<number> {
    const client = new Client({ connectionString });
    await client.connect();
    try {
        const result = await client.query<{ count: string | number }>(`
      SELECT COUNT(*) AS count
      FROM pg_stat_activity
      WHERE application_name = $1
    `, [applicationName]);
        return Number(result.rows[0]?.count ?? 0);
    }
    finally {
        await client.end();
    }
}
async function postgresTableNames(connectionString: string, tableNames: readonly string[]): Promise<readonly string[]> {
    const client = new Client({ connectionString });
    await client.connect();
    try {
        const result = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name
    `, [tableNames]);
        return result.rows.map((row) => row.table_name);
    }
    finally {
        await client.end();
    }
}
