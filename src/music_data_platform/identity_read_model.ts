import type { Ref } from "../contracts/kernel.js";
import type { SourceRecord } from "../contracts/storage.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import {
  createIdentityRepositories,
  type SourceToMaterialBindingRecord,
} from "./identity_records.js";

export type CreateIdentityReadPortInput = {
  db: MusicDatabaseContext;
};

export type IdentityReadPort = {
  getSourceRecord(input: { sourceRef: Ref }): Promise<SourceRecord | undefined>;
  findMaterialForSource(input: { sourceRef: Ref }): Promise<SourceToMaterialBindingRecord | undefined>;
};

export function createIdentityReadPort(
  input: CreateIdentityReadPortInput,
): IdentityReadPort {
  const repositories = createIdentityRepositories({ db: input.db });

  return {
    async getSourceRecord(readInput) {
      return repositories.sourceRecords.get(readInput);
    },
    async findMaterialForSource(readInput) {
      return repositories.sourceMaterialBindings.findMaterialForSource(readInput);
    },
  };
}
