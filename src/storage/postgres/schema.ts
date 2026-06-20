import type { PostgresMusicDatabaseContext } from "./database.js";

export type PostgresMusicDatabaseSchemaContribution = {
  id: string;
  apply(context: PostgresMusicDatabaseContext): Promise<void> | void;
};

export type InitializePostgresSchemaInput = {
  context: PostgresMusicDatabaseContext;
  schemas?: readonly PostgresMusicDatabaseSchemaContribution[];
};

export async function initializePostgresSchema(input: InitializePostgresSchemaInput): Promise<void> {
  for (const schema of input.schemas ?? []) {
    await schema.apply(input.context);
  }
}
