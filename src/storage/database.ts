export type MusicDatabaseParameter =
  | null
  | boolean
  | number
  | bigint
  | string
  | Uint8Array;

export type MusicDatabaseContext = {
  run(sql: string, params?: readonly MusicDatabaseParameter[]): Promise<void>;
  all<Row>(sql: string, params?: readonly MusicDatabaseParameter[]): Promise<readonly Row[]>;
  get<Row>(sql: string, params?: readonly MusicDatabaseParameter[]): Promise<Row | undefined>;
};

declare const transactionContextBrand: unique symbol;

export type MusicDatabaseTransactionContext = MusicDatabaseContext & {
  readonly [transactionContextBrand]: true;
};

export type MusicDatabaseImmediateResult<Result> = Result | Promise<Result>;

export type MusicDatabaseSchemaContribution = {
  id: string;
  apply(context: MusicDatabaseContext): void | Promise<void>;
};

export type InitializeMusicDatabaseInput = {
  schemas?: readonly MusicDatabaseSchemaContribution[];
};

export type MusicDatabase = {
  initialize(input?: InitializeMusicDatabaseInput): Promise<void>;
  context(): MusicDatabaseContext;
  transaction<Result>(
    operation: (context: MusicDatabaseTransactionContext) => MusicDatabaseImmediateResult<Result>,
  ): Promise<Result>;
  close(): Promise<void>;
};

export type MusicDatabaseErrorCode =
  | "storage.invalid_database_url"
  | "storage.invalid_transaction_timeout"
  | "storage.database_not_initialized"
  | "storage.database_already_initialized"
  | "storage.database_initialization_failed"
  | "storage.database_initialization_active"
  | "storage.database_closed"
  | "storage.transaction_already_active"
  | "storage.transaction_timeout"
  | "storage.transaction_context_inactive";

export type CreateMusicDatabaseErrorInput = {
  code: MusicDatabaseErrorCode;
  message: string;
  cause?: unknown;
};

export class MusicDatabaseError extends Error {
  readonly code: MusicDatabaseErrorCode;
  override readonly cause?: unknown;

  constructor(input: CreateMusicDatabaseErrorInput) {
    super(input.message);
    this.name = "MusicDatabaseError";
    this.code = input.code;

    if (input.cause !== undefined) {
      this.cause = input.cause;
    }
  }
}

export function isMusicDatabaseError(error: unknown): error is MusicDatabaseError {
  return error instanceof MusicDatabaseError;
}

// True when an error raised by the underlying SQL engine is a unique-constraint
// violation (ISO SQL SQLSTATE 23505). The error is the raw driver error, not a
// MusicDatabaseError, so this duck-types the standard SQLSTATE `code` field.
// Storage consumers use it to treat a concurrent insert that lost a
// partial-unique-index race as idempotent reuse rather than a hard failure.
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code === "23505";
}
