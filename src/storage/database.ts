export type MusicDatabaseParameter = unknown;

export type MusicDatabaseContext = {
  run(sql: string, params?: readonly MusicDatabaseParameter[]): void;
  all<Row>(sql: string, params?: readonly MusicDatabaseParameter[]): readonly Row[];
  get<Row>(sql: string, params?: readonly MusicDatabaseParameter[]): Row | undefined;
};

export type MusicDatabaseSchemaContribution = {
  id: string;
  apply(context: MusicDatabaseContext): void;
};

export type InitializeMusicDatabaseInput = {
  schemas?: readonly MusicDatabaseSchemaContribution[];
};

export type MusicDatabase = {
  initialize(input?: InitializeMusicDatabaseInput): void;
  context(): MusicDatabaseContext;
  transaction<Result>(operation: (context: MusicDatabaseContext) => Result): Result;
  close(): void;
};

export type MusicDatabaseErrorCode =
  | "storage.database_not_initialized"
  | "storage.database_already_initialized"
  | "storage.database_initialization_failed"
  | "storage.database_closed"
  | "storage.transaction_already_active";

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
