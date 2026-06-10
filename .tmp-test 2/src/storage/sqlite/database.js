import { DatabaseSync } from "node:sqlite";
import { MusicDatabaseError, } from "../database.js";
import { initializeSqliteSchema } from "./schema.js";
export class SqliteMusicDatabase {
    db;
    state = "opened";
    transactionActive = false;
    initializedContext = {
        run: (sql, params) => {
            this.ensureInitialized();
            this.runSql(sql, params);
        },
        all: (sql, params) => {
            this.ensureInitialized();
            return this.allSql(sql, params);
        },
        get: (sql, params) => {
            this.ensureInitialized();
            return this.getSql(sql, params);
        },
    };
    initializationContext = {
        run: (sql, params) => {
            this.ensureInitializing();
            this.runSql(sql, params);
        },
        all: (sql, params) => {
            this.ensureInitializing();
            return this.allSql(sql, params);
        },
        get: (sql, params) => {
            this.ensureInitializing();
            return this.getSql(sql, params);
        },
    };
    constructor(db) {
        this.db = db;
    }
    static open(input) {
        if (input.filename.trim().length === 0) {
            throw new MusicDatabaseError({
                code: "storage.invalid_database_filename",
                message: "Music database filename must be explicit and non-empty.",
            });
        }
        return new SqliteMusicDatabase(new DatabaseSync(input.filename));
    }
    initialize(input = {}) {
        this.ensureCanInitialize();
        this.state = "initializing";
        try {
            initializeSqliteSchema(input.schemas === undefined
                ? {
                    context: this.initializationContext,
                }
                : {
                    context: this.initializationContext,
                    schemas: input.schemas,
                });
            this.state = "initialized";
        }
        catch (error) {
            this.state = "initialization_failed";
            throw new MusicDatabaseError({
                code: "storage.database_initialization_failed",
                message: "Music database initialization failed.",
                cause: error,
            });
        }
    }
    context() {
        this.ensureInitialized();
        return this.initializedContext;
    }
    transaction(operation) {
        this.ensureCanStartTransaction();
        this.db.exec("BEGIN IMMEDIATE");
        this.transactionActive = true;
        let transactionContextActive = true;
        const transactionContext = {
            run: (sql, params) => {
                ensureTransactionContextActive(transactionContextActive);
                this.ensureInitialized();
                this.runSql(sql, params);
            },
            all: (sql, params) => {
                ensureTransactionContextActive(transactionContextActive);
                this.ensureInitialized();
                return this.allSql(sql, params);
            },
            get: (sql, params) => {
                ensureTransactionContextActive(transactionContextActive);
                this.ensureInitialized();
                return this.getSql(sql, params);
            },
        };
        try {
            const result = operation(transactionContext);
            if (isPromiseLike(result)) {
                absorbUnsupportedAsyncResult(result);
                throw new MusicDatabaseError({
                    code: "storage.async_callback_not_supported",
                    message: "Music database transaction callback must be synchronous.",
                });
            }
            this.db.exec("COMMIT");
            return result;
        }
        catch (error) {
            try {
                this.db.exec("ROLLBACK");
            }
            catch {
                // SQLite may have already rolled back the transaction, for example
                // after an `OR ROLLBACK` constraint failure. Preserve the original
                // callback error for the caller.
            }
            throw error;
        }
        finally {
            transactionContextActive = false;
            this.transactionActive = false;
        }
    }
    close() {
        if (this.state === "closed") {
            return;
        }
        if (this.state === "initializing") {
            throw new MusicDatabaseError({
                code: "storage.database_initialization_active",
                message: "Cannot close music database while initialization is active.",
            });
        }
        if (this.transactionActive) {
            throw new MusicDatabaseError({
                code: "storage.transaction_already_active",
                message: "Cannot close music database while a transaction is active.",
            });
        }
        this.db.close();
        this.state = "closed";
    }
    runSql(sql, params) {
        this.db.prepare(sql).run(...toSqliteParameters(params));
    }
    allSql(sql, params) {
        return this.db.prepare(sql).all(...toSqliteParameters(params));
    }
    getSql(sql, params) {
        return this.db.prepare(sql).get(...toSqliteParameters(params));
    }
    ensureCanInitialize() {
        if (this.state === "closed") {
            throw closedError();
        }
        if (this.state === "initialized") {
            throw new MusicDatabaseError({
                code: "storage.database_already_initialized",
                message: "Music database is already initialized.",
            });
        }
        if (this.state === "initialization_failed") {
            throw new MusicDatabaseError({
                code: "storage.database_initialization_failed",
                message: "Music database initialization already failed; close and reopen to retry.",
            });
        }
        if (this.state === "initializing") {
            throw new MusicDatabaseError({
                code: "storage.database_already_initialized",
                message: "Music database initialization is already active.",
            });
        }
    }
    ensureCanStartTransaction() {
        this.ensureInitialized();
        if (this.transactionActive) {
            throw new MusicDatabaseError({
                code: "storage.transaction_already_active",
                message: "Music database transaction is already active.",
            });
        }
    }
    ensureInitialized() {
        if (this.state === "initialized") {
            return;
        }
        if (this.state === "closed") {
            throw closedError();
        }
        if (this.state === "initialization_failed") {
            throw new MusicDatabaseError({
                code: "storage.database_initialization_failed",
                message: "Music database initialization failed; close and reopen to retry.",
            });
        }
        throw new MusicDatabaseError({
            code: "storage.database_not_initialized",
            message: "Music database is not initialized.",
        });
    }
    ensureInitializing() {
        if (this.state === "initializing") {
            return;
        }
        if (this.state === "closed") {
            throw closedError();
        }
        throw new MusicDatabaseError({
            code: "storage.database_not_initialized",
            message: "Music database is not initializing.",
        });
    }
}
function toSqliteParameters(params) {
    return [...(params ?? [])];
}
function ensureTransactionContextActive(active) {
    if (active) {
        return;
    }
    throw new MusicDatabaseError({
        code: "storage.transaction_context_inactive",
        message: "Music database transaction context is no longer active.",
    });
}
function isPromiseLike(value) {
    return (typeof value === "object" || typeof value === "function") &&
        value !== null &&
        "then" in value &&
        typeof value.then === "function";
}
function absorbUnsupportedAsyncResult(result) {
    void Promise.resolve(result).catch(() => undefined);
}
function closedError() {
    return new MusicDatabaseError({
        code: "storage.database_closed",
        message: "Music database is closed.",
    });
}
