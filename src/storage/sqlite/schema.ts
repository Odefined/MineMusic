import type {
  MusicDatabaseContext,
  MusicDatabaseSchemaContribution,
} from "../database.js";

export type InitializeSqliteSchemaInput = {
  context: MusicDatabaseContext;
  schemas?: readonly MusicDatabaseSchemaContribution[];
};

export function initializeSqliteSchema(input: InitializeSqliteSchemaInput): void {
  input.context.run("PRAGMA foreign_keys = ON");
  input.context.run("PRAGMA journal_mode = WAL");
  input.context.run("PRAGMA synchronous = NORMAL");

  for (const schema of input.schemas ?? []) {
    const result = schema.apply(input.context);

    if (result !== undefined) {
      if (isPromiseLike(result)) {
        absorbUnsupportedAsyncResult(result);
      }

      throw new Error(`Music database schema contribution '${schema.id}' must be synchronous.`);
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function";
}

function absorbUnsupportedAsyncResult(result: PromiseLike<unknown>): void {
  void Promise.resolve(result).catch(() => undefined);
}
