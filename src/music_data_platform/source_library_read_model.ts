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
  getImportBatch(input: { batchId: string }): SourceLibraryImportBatchRecord | undefined;
  listSourceLibraries(input: { ownerScope: string }): readonly SourceLibraryRecord[];
};

export function createSourceLibraryReadPort(
  input: CreateSourceLibraryReadPortInput,
): SourceLibraryReadPort {
  const repositories = createSourceLibraryRepositories({ db: input.db });

  return {
    getImportBatch(readInput) {
      return repositories.batches.get(readInput);
    },
    listSourceLibraries(readInput) {
      return repositories.libraries.listByOwnerScope(readInput);
    },
  };
}
