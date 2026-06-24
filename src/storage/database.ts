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
  | "storage.database_not_initialized"
  | "storage.database_already_initialized"
  | "storage.database_initialization_failed"
  | "storage.database_initialization_active"
  | "storage.database_closed"
  | "storage.transaction_already_active"
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
