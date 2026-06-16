import type { RuntimeModule } from "../../stage_core/runtime_module.js";
import {
  createMusicDiscoveryListScopesRegistration,
  musicDiscoveryInstrument,
} from "./discovery_list_scopes.js";
import type { MusicScopeAvailabilityPort } from "./scope_availability.js";

export {
  createInMemoryMusicScopeAvailabilityPort,
  emptyMusicScopeAvailabilitySnapshot,
} from "./scope_availability.js";
export type {
  MusicProviderScopeAvailability,
  MusicRelationScopeAvailability,
  MusicScopeAvailabilityPort,
  MusicScopeAvailabilitySnapshot,
  MusicSourceLibraryScopeAvailability,
} from "./scope_availability.js";
export {
  createMusicDiscoveryListScopesRegistration,
  musicDiscoveryInstrument,
  musicDiscoveryListScopesDescriptor,
} from "./discovery_list_scopes.js";
export type {
  CreateMusicDiscoveryListScopesRegistrationInput,
} from "./discovery_list_scopes.js";

export function createMusicDiscoveryRuntimeModule(input: {
  scopeAvailability: MusicScopeAvailabilityPort;
}): RuntimeModule {
  return {
    descriptor: {
      id: "music-discovery",
      ownerArea: "music_intelligence",
      label: "Music Discovery",
    },
    async initialize() {
      return {
        ok: true,
        value: {
          instruments: [musicDiscoveryInstrument],
          tools: [
            createMusicDiscoveryListScopesRegistration({
              scopeAvailability: input.scopeAvailability,
            }),
          ],
        },
      };
    },
  };
}
