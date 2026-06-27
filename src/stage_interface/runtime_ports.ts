import type { HandleMintingPort, LookupCursorStore } from "../contracts/stage_interface.js";
import type { MusicDatabaseContext } from "../storage/index.js";
import {
  createStageInterfaceCandidateHandleCachePort,
  createStageInterfaceHandleMintingPortFromRecords,
  type CandidateHandleBackingCachePort,
} from "./handle_minting.js";
import { createStageInterfaceHandleRegistryRecords } from "./handle_registry_records.js";
import {
  createLookupCursorStore,
  DEFAULT_LOOKUP_CURSOR_TTL_MS,
} from "./lookup_cursor_store.js";

export type StageInterfaceRuntimePorts = {
  handleMinting: HandleMintingPort;
  lookupCursorStore: LookupCursorStore;
};

export type CreateStageInterfaceRuntimePortsInput = {
  db: MusicDatabaseContext;
  materialCandidateCache: CandidateHandleBackingCachePort;
};

export function createStageInterfaceRuntimePorts(
  input: CreateStageInterfaceRuntimePortsInput,
): StageInterfaceRuntimePorts {
  const handleRegistryRecords = createStageInterfaceHandleRegistryRecords({
    db: input.db,
  });

  return {
    handleMinting: createStageInterfaceHandleMintingPortFromRecords({
      records: handleRegistryRecords,
      candidateHandles: createStageInterfaceCandidateHandleCachePort({
        records: handleRegistryRecords,
        candidateCache: input.materialCandidateCache,
      }),
    }),
    lookupCursorStore: createLookupCursorStore({
      db: input.db,
      ttlMs: DEFAULT_LOOKUP_CURSOR_TTL_MS,
    }),
  };
}
