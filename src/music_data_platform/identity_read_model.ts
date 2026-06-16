import type { Ref } from "../contracts/kernel.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import {
  createIdentityRepositories,
  type SourceToMaterialBindingRecord,
} from "./identity_records.js";

export type CreateIdentityReadPortInput = {
  db: MusicDatabaseContext;
};

export type IdentityReadPort = {
  findMaterialForSource(input: { sourceRef: Ref }): SourceToMaterialBindingRecord | undefined;
};

export function createIdentityReadPort(
  input: CreateIdentityReadPortInput,
): IdentityReadPort {
  const repositories = createIdentityRepositories({ db: input.db });

  return {
    findMaterialForSource(readInput) {
      return repositories.sourceMaterialBindings.findMaterialForSource(readInput);
    },
  };
}
