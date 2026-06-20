import { Pool, types, type PoolClient, type PoolConfig } from "pg";

import {
  type MusicDatabase,
  type MusicDatabaseContext,
  MusicDatabaseError,
  type MusicDatabaseParameter,
  type MusicDatabaseTransactionContext,
} from "../database.js";
import { initializePostgresSchema, type PostgresMusicDatabaseSchemaContribution } from "./schema.js";

types.setTypeParser(20, (value) => Number(value));

export type OpenPostgresMusicDatabaseInput = {
  connectionString: string;
  maxConnections?: number;
  schema?: string;
};

export type PostgresMusicDatabaseContext = MusicDatabaseContext;

export type PostgresMusicDatabaseTransactionContext = MusicDatabaseTransactionContext;

export type InitializePostgresMusicDatabaseInput = {
  schemas?: readonly PostgresMusicDatabaseSchemaContribution[];
};

type PostgresDatabaseState =
  | "opened"
  | "initializing"
  | "initialized"
  | "initialization_failed"
  | "closed";

export class PostgresMusicDatabase implements MusicDatabase {
  private state: PostgresDatabaseState = "opened";
  private transactionActive = false;

  private readonly initializedContext: PostgresMusicDatabaseContext = {
    run: async (sql, params) => {
      this.ensureInitialized();
      await queryRun(this.pool, sql, params);
    },
    all: async (sql, params) => {
      this.ensureInitialized();
      return queryAll(this.pool, sql, params);
    },
    get: async (sql, params) => {
      this.ensureInitialized();
      return queryGet(this.pool, sql, params);
    },
  };

  private readonly initializationContext: PostgresMusicDatabaseContext = {
    run: async (sql, params) => {
      this.ensureInitializing();
      await queryRun(this.pool, sql, params);
    },
    all: async (sql, params) => {
      this.ensureInitializing();
      return queryAll(this.pool, sql, params);
    },
    get: async (sql, params) => {
      this.ensureInitializing();
      return queryGet(this.pool, sql, params);
    },
  };

  private constructor(private readonly pool: Pool) {}

  static open(input: OpenPostgresMusicDatabaseInput): PostgresMusicDatabase {
    if (input.connectionString.trim().length === 0) {
      throw new MusicDatabaseError({
        code: "storage.invalid_database_url",
        message: "Postgres connection string must be explicit and non-empty.",
      });
    }

    const config: PoolConfig = {
      connectionString: input.connectionString,
      ...(input.schema === undefined ? {} : { options: `-c search_path=${safeSchemaName(input.schema)},public` }),
      ...(input.maxConnections === undefined ? {} : { max: input.maxConnections }),
    };
    return new PostgresMusicDatabase(new Pool(config));
  }

  async initialize(input: InitializePostgresMusicDatabaseInput = {}): Promise<void> {
    this.ensureCanInitialize();
    this.state = "initializing";

    try {
      await initializePostgresSchema({
        context: this.initializationContext,
        ...(input.schemas === undefined ? {} : { schemas: input.schemas }),
      });
      this.state = "initialized";
    } catch (error) {
      this.state = "initialization_failed";
      throw new MusicDatabaseError({
        code: "storage.database_initialization_failed",
        message: "Postgres music database initialization failed.",
        cause: error,
      });
    }
  }

  context(): PostgresMusicDatabaseContext {
    this.ensureInitialized();
    return this.initializedContext;
  }

  async transaction<Result>(
    operation: (context: PostgresMusicDatabaseTransactionContext) => Result | Promise<Result>,
  ): Promise<Result> {
    this.ensureCanStartTransaction();
    const client = await this.pool.connect();
    this.transactionActive = true;
    let transactionContextActive = true;
    const transactionContext = {
      run: async (sql, params) => {
        ensureTransactionContextActive(transactionContextActive);
        this.ensureInitialized();
        await queryRun(client, sql, params);
      },
      all: async (sql, params) => {
        ensureTransactionContextActive(transactionContextActive);
        this.ensureInitialized();
        return queryAll(client, sql, params);
      },
      get: async (sql, params) => {
        ensureTransactionContextActive(transactionContextActive);
        this.ensureInitialized();
        return queryGet(client, sql, params);
      },
    } as PostgresMusicDatabaseTransactionContext;

    try {
      await client.query("BEGIN");
      const result = await operation(transactionContext);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original operation error.
      }
      throw error;
    } finally {
      transactionContextActive = false;
      this.transactionActive = false;
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.state === "closed") {
      return;
    }

    if (this.state === "initializing") {
      throw new MusicDatabaseError({
        code: "storage.database_initialization_active",
        message: "Cannot close Postgres music database while initialization is active.",
      });
    }

    if (this.transactionActive) {
      throw new MusicDatabaseError({
        code: "storage.transaction_already_active",
        message: "Cannot close Postgres music database while a transaction is active.",
      });
    }

    await this.pool.end();
    this.state = "closed";
  }

  private ensureCanInitialize(): void {
    if (this.state === "closed") {
      throw closedError();
    }

    if (this.state === "initialized") {
      throw new MusicDatabaseError({
        code: "storage.database_already_initialized",
        message: "Postgres music database is already initialized.",
      });
    }

    if (this.state === "initialization_failed") {
      throw new MusicDatabaseError({
        code: "storage.database_initialization_failed",
        message: "Postgres music database initialization already failed; close and reopen to retry.",
      });
    }

    if (this.state === "initializing") {
      throw new MusicDatabaseError({
        code: "storage.database_already_initialized",
        message: "Postgres music database initialization is already active.",
      });
    }
  }

  private ensureCanStartTransaction(): void {
    this.ensureInitialized();

    if (this.transactionActive) {
      throw new MusicDatabaseError({
        code: "storage.transaction_already_active",
        message: "Postgres music database transaction is already active.",
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
        message: "Postgres music database initialization failed; close and reopen to retry.",
      });
    }

    throw new MusicDatabaseError({
      code: "storage.database_not_initialized",
      message: "Postgres music database is not initialized.",
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
      message: "Postgres music database is not initializing.",
    });
  }
}

async function queryRun(
  client: Pick<Pool | PoolClient, "query">,
  sql: string,
  params?: readonly MusicDatabaseParameter[],
): Promise<void> {
  await client.query(toPostgresSql(sql), toPostgresParameters(params));
}

async function queryAll<Row>(
  client: Pick<Pool | PoolClient, "query">,
  sql: string,
  params?: readonly MusicDatabaseParameter[],
): Promise<readonly Row[]> {
  const result = await client.query(toPostgresSql(sql), toPostgresParameters(params));
  return result.rows as Row[];
}

async function queryGet<Row>(
  client: Pick<Pool | PoolClient, "query">,
  sql: string,
  params?: readonly MusicDatabaseParameter[],
): Promise<Row | undefined> {
  const rows = await queryAll<Row>(client, sql, params);
  return rows[0];
}

function toPostgresSql(sql: string): string {
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let output = "";

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (char === "'" && !inDoubleQuote) {
      output += char;
      if (inSingleQuote && next === "'") {
        output += next;
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === "\"" && !inSingleQuote) {
      output += char;
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === "?" && !inSingleQuote && !inDoubleQuote) {
      index += 1;
      output += `$${index}`;
      continue;
    }

    output += char;
  }

  return output;
}

function toPostgresParameters(params: readonly MusicDatabaseParameter[] | undefined): unknown[] {
  return [...(params ?? [])].map((param) => {
    if (param instanceof Uint8Array) {
      return Buffer.from(param);
    }
    return param;
  });
}

function safeSchemaName(schema: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(schema)) {
    throw new MusicDatabaseError({
      code: "storage.invalid_database_url",
      message: "Postgres schema name must be a safe SQL identifier.",
    });
  }

  return schema;
}

function ensureTransactionContextActive(active: boolean): void {
  if (active) {
    return;
  }

  throw new MusicDatabaseError({
    code: "storage.transaction_context_inactive",
    message: "Postgres music database transaction context is no longer active.",
  });
}

function closedError(): MusicDatabaseError {
  return new MusicDatabaseError({
    code: "storage.database_closed",
    message: "Postgres music database is closed.",
  });
}
