import { AsyncLocalStorage } from "node:async_hooks";

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

const DEFAULT_POSTGRES_TRANSACTION_TIMEOUT_MS = 60_000;

export type OpenPostgresMusicDatabaseInput = {
  connectionString: string;
  maxConnections?: number;
  schema?: string;
  transactionTimeoutMs?: number;
};

export type PostgresMusicDatabaseContext = MusicDatabaseContext;

export type PostgresMusicDatabaseTransactionContext = MusicDatabaseTransactionContext;

export type InitializePostgresMusicDatabaseInput = {
  schemas?: readonly PostgresMusicDatabaseSchemaContribution[];
};

export type CreateMusicDatabaseInput = OpenPostgresMusicDatabaseInput & InitializePostgresMusicDatabaseInput;

export async function createMusicDatabase(input: CreateMusicDatabaseInput): Promise<MusicDatabase> {
  const database = PostgresMusicDatabase.open(input);

  try {
    await database.initialize({
      ...(input.schemas === undefined ? {} : { schemas: input.schemas }),
    });
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}

type PostgresDatabaseState =
  | "opened"
  | "initializing"
  | "initialized"
  | "initialization_failed"
  | "closed";

export class PostgresMusicDatabase implements MusicDatabase {
  private state: PostgresDatabaseState = "opened";
  private transactionActive = false;
  private pendingTransactions = 0;
  private transactionQueue: Promise<void> = Promise.resolve();
  private readonly transactionScope = new AsyncLocalStorage<boolean>();

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

  private constructor(
    private readonly pool: Pool,
    private readonly transactionTimeoutMs: number,
  ) {}

  static open(input: OpenPostgresMusicDatabaseInput): PostgresMusicDatabase {
    if (input.connectionString.trim().length === 0) {
      throw new MusicDatabaseError({
        code: "storage.invalid_database_url",
        message: "Postgres connection string must be explicit and non-empty.",
      });
    }
    const transactionTimeoutMs = input.transactionTimeoutMs ?? DEFAULT_POSTGRES_TRANSACTION_TIMEOUT_MS;
    if (!Number.isSafeInteger(transactionTimeoutMs) || transactionTimeoutMs <= 0) {
      throw new MusicDatabaseError({
        code: "storage.invalid_transaction_timeout",
        message: "Postgres transaction timeout must be a positive safe integer in milliseconds.",
      });
    }

    const config: PoolConfig = {
      connectionString: input.connectionString,
      connectionTimeoutMillis: transactionTimeoutMs,
      statement_timeout: transactionTimeoutMs,
      ...(input.schema === undefined ? {} : { options: `-c search_path=${safeSchemaName(input.schema)},public` }),
      ...(input.maxConnections === undefined ? {} : { max: input.maxConnections }),
    };
    return new PostgresMusicDatabase(new Pool(config), transactionTimeoutMs);
  }

  async initialize(input: InitializePostgresMusicDatabaseInput = {}): Promise<void> {
    this.ensureCanInitialize();
    this.state = "initializing";

    try {
      await this.runInitializationTransaction(async (context) => {
        await initializePostgresSchema({
          context,
          ...(input.schemas === undefined ? {} : { schemas: input.schemas }),
        });
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
    if (this.transactionScope.getStore() === true) {
      throw new MusicDatabaseError({
        code: "storage.transaction_already_active",
        message: "Postgres music database transaction is already active.",
      });
    }
    this.ensureInitialized();
    this.pendingTransactions += 1;
    const priorTransaction = this.transactionQueue;
    let releaseQueueSlot: () => void = () => {};
    this.transactionQueue = new Promise<void>((resolve) => {
      releaseQueueSlot = resolve;
    });

    await priorTransaction;
    this.pendingTransactions -= 1;
    this.ensureCanStartTransaction();
    let client: PoolClient | undefined;
    let clientReleased = false;
    let transactionTimedOut = false;
    let transactionContextActive = true;
    this.transactionActive = true;

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        transactionTimedOut = true;
        if (client !== undefined && !clientReleased) {
          clientReleased = true;
          client.release(true);
        }
        reject(transactionTimeoutError(this.transactionTimeoutMs));
      }, this.transactionTimeoutMs);
    });

    try {
      return await Promise.race([
        (async () => {
          client = await this.pool.connect();
          if (transactionTimedOut) {
            if (!clientReleased) {
              clientReleased = true;
              client.release(true);
            }
            throw transactionTimeoutError(this.transactionTimeoutMs);
          }
          const activeClient = client;
          const transactionContext = {
            run: async (sql, params) => {
              ensureTransactionContextActive(transactionContextActive);
              this.ensureInitialized();
              await queryRun(activeClient, sql, params);
            },
            all: async (sql, params) => {
              ensureTransactionContextActive(transactionContextActive);
              this.ensureInitialized();
              return queryAll(activeClient, sql, params);
            },
            get: async (sql, params) => {
              ensureTransactionContextActive(transactionContextActive);
              this.ensureInitialized();
              return queryGet(activeClient, sql, params);
            },
          } as PostgresMusicDatabaseTransactionContext;
          await client.query("BEGIN");
          const result = await this.transactionScope.run(true, async () => await operation(transactionContext));
          await client.query("COMMIT");
          return result;
        })(),
        timeout,
      ]);
    } catch (error) {
      if (!transactionTimedOut) {
        try {
          await client?.query("ROLLBACK");
        } catch {
          // Preserve the original operation error.
        }
      }
      throw error;
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
      transactionContextActive = false;
      this.transactionActive = false;
      releaseQueueSlot();
      if (client !== undefined && !clientReleased) {
        clientReleased = true;
        client.release();
      }
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

    if (this.transactionActive || this.pendingTransactions > 0) {
      throw new MusicDatabaseError({
        code: "storage.transaction_already_active",
        message: "Cannot close Postgres music database while a transaction is active.",
      });
    }

    await this.pool.end();
    this.state = "closed";
  }

  private async runInitializationTransaction(
    operation: (context: PostgresMusicDatabaseContext) => Promise<void>,
  ): Promise<void> {
    this.ensureInitializing();
    let client: PoolClient | undefined;
    let clientReleased = false;
    let transactionTimedOut = false;
    let transactionContextActive = true;

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        transactionTimedOut = true;
        if (client !== undefined && !clientReleased) {
          clientReleased = true;
          client.release(true);
        }
        reject(transactionTimeoutError(this.transactionTimeoutMs));
      }, this.transactionTimeoutMs);
    });

    try {
      await Promise.race([
        (async () => {
          client = await this.pool.connect();
          if (transactionTimedOut) {
            if (!clientReleased) {
              clientReleased = true;
              client.release(true);
            }
            throw transactionTimeoutError(this.transactionTimeoutMs);
          }
          const activeClient = client;
          const transactionContext: PostgresMusicDatabaseContext = {
            run: async (sql, params) => {
              ensureTransactionContextActive(transactionContextActive);
              this.ensureInitializing();
              await queryRun(activeClient, sql, params);
            },
            all: async (sql, params) => {
              ensureTransactionContextActive(transactionContextActive);
              this.ensureInitializing();
              return queryAll(activeClient, sql, params);
            },
            get: async (sql, params) => {
              ensureTransactionContextActive(transactionContextActive);
              this.ensureInitializing();
              return queryGet(activeClient, sql, params);
            },
          };
          await client.query("BEGIN");
          await operation(transactionContext);
          await client.query("COMMIT");
        })(),
        timeout,
      ]);
    } catch (error) {
      if (!transactionTimedOut) {
        try {
          await client?.query("ROLLBACK");
        } catch {
          // Preserve the original initialization error.
        }
      }
      throw error;
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
      transactionContextActive = false;
      if (client !== undefined && !clientReleased) {
        clientReleased = true;
        client.release();
      }
    }
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

function transactionTimeoutError(timeoutMs: number): MusicDatabaseError {
  return new MusicDatabaseError({
    code: "storage.transaction_timeout",
    message: `Postgres music database transaction exceeded ${timeoutMs}ms.`,
  });
}
