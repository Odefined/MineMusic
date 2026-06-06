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
    schema.apply(input.context);
  }
}
