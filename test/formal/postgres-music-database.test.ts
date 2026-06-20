import assert from "node:assert/strict";
import { isMusicDatabaseError, MusicDatabaseError, PostgresMusicDatabase, type PostgresMusicDatabaseContext, type PostgresMusicDatabaseSchemaContribution, } from "../../src/storage/index.js";
import { postgresTestDatabaseUrl, resetPostgresTestSchema, } from "../support/postgres.js";
const connectionString = postgresTestDatabaseUrl();
assertDatabaseError(() => PostgresMusicDatabase.open({ connectionString: "" }), "storage.invalid_database_url");
assertDatabaseError(() => PostgresMusicDatabase.open({ connectionString: "   " }), "storage.invalid_database_url");
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
