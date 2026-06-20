import type { MusicDatabaseContext } from "../storage/database.js";
import {
  createSourceLibraryRepositories,
  type SourceLibraryImportBatchRecord,
  type SourceLibraryRecord,
} from "./source_library_records.js";

export type CreateSourceLibraryReadPortInput = {
  db: MusicDatabaseContext;
};

export type SourceLibraryReadPort = {
  getImportBatch(input: { batchId: string }): Promise<SourceLibraryImportBatchRecord | undefined>;
  listSourceLibraries(input: { ownerScope: string }): Promise<readonly SourceLibraryRecord[]>;
};

export function createSourceLibraryReadPort(
  input: CreateSourceLibraryReadPortInput,
): SourceLibraryReadPort {
  const repositories = createSourceLibraryRepositories({ db: input.db });

  return {
    async getImportBatch(readInput) {
      return repositories.batches.get(readInput);
    },
    async listSourceLibraries(readInput) {
      return repositories.libraries.listByOwnerScope(readInput);
    },
  };
}
