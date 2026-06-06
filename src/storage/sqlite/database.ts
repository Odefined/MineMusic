import { DatabaseSync } from "node:sqlite";

import {
  MusicDatabaseError,
  type InitializeMusicDatabaseInput,
  type MusicDatabase,
  type MusicDatabaseContext,
  type MusicDatabaseImmediateResult,
  type MusicDatabaseParameter,
} from "../database.js";
import { initializeSqliteSchema } from "./schema.js";

export type OpenSqliteMusicDatabaseInput = {
  filename: string;
};

type SqliteDatabaseState =
  | "opened"
  | "initializing"
  | "initialized"
  | "initialization_failed"
  | "closed";

type SqliteParameter = MusicDatabaseParameter;

export class SqliteMusicDatabase implements MusicDatabase {
  private state: SqliteDatabaseState = "opened";
  private transactionActive = false;

  private readonly initializedContext: MusicDatabaseContext = {
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

  private readonly initializationContext: MusicDatabaseContext = {
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

  private constructor(private readonly db: DatabaseSync) {}

  static open(input: OpenSqliteMusicDatabaseInput): SqliteMusicDatabase {
    if (input.filename.trim().length === 0) {
      throw new MusicDatabaseError({
        code: "storage.invalid_database_filename",
        message: "Music database filename must be explicit and non-empty.",
      });
    }

    return new SqliteMusicDatabase(new DatabaseSync(input.filename));
  }

  initialize(input: InitializeMusicDatabaseInput = {}): void {
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
    } catch (error) {
      this.state = "initialization_failed";
      throw new MusicDatabaseError({
        code: "storage.database_initialization_failed",
        message: "Music database initialization failed.",
        cause: error,
      });
    }
  }

  context(): MusicDatabaseContext {
    this.ensureInitialized();
    return this.initializedContext;
  }

  transaction<Result>(
    operation: (context: MusicDatabaseContext) => MusicDatabaseImmediateResult<Result>,
  ): MusicDatabaseImmediateResult<Result> {
    this.ensureCanStartTransaction();
    this.db.exec("BEGIN IMMEDIATE");
    this.transactionActive = true;
    let transactionContextActive = true;
    const transactionContext: MusicDatabaseContext = {
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
        throw new MusicDatabaseError({
          code: "storage.async_callback_not_supported",
          message: "Music database transaction callback must be synchronous.",
        });
      }

      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // SQLite may have already rolled back the transaction, for example
        // after an `OR ROLLBACK` constraint failure. Preserve the original
        // callback error for the caller.
      }

      throw error;
    } finally {
      transactionContextActive = false;
      this.transactionActive = false;
    }
  }

  close(): void {
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

  private runSql(sql: string, params?: readonly MusicDatabaseParameter[]): void {
    this.db.prepare(sql).run(...toSqliteParameters(params));
  }

  private allSql<Row>(sql: string, params?: readonly MusicDatabaseParameter[]): readonly Row[] {
    return this.db.prepare(sql).all(...toSqliteParameters(params)) as Row[];
  }

  private getSql<Row>(sql: string, params?: readonly MusicDatabaseParameter[]): Row | undefined {
    return this.db.prepare(sql).get(...toSqliteParameters(params)) as Row | undefined;
  }

  private ensureCanInitialize(): void {
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

  private ensureCanStartTransaction(): void {
    this.ensureInitialized();

    if (this.transactionActive) {
      throw new MusicDatabaseError({
        code: "storage.transaction_already_active",
        message: "Music database transaction is already active.",
      });
    }
  }

  private ensureInitialized(): void {
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

  private ensureInitializing(): void {
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

function toSqliteParameters(params: readonly MusicDatabaseParameter[] | undefined): SqliteParameter[] {
  return [...(params ?? [])] as SqliteParameter[];
}

function ensureTransactionContextActive(active: boolean): void {
  if (active) {
    return;
  }

  throw new MusicDatabaseError({
    code: "storage.transaction_context_inactive",
    message: "Music database transaction context is no longer active.",
  });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function";
}

function closedError(): MusicDatabaseError {
  return new MusicDatabaseError({
    code: "storage.database_closed",
    message: "Music database is closed.",
  });
}
