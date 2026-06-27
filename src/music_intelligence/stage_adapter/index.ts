import type { RuntimeModule } from "../../stage_core/runtime_module.js";
import {
  createMusicDiscoveryListScopesRegistration,
  musicDiscoveryInstrument,
} from "./discovery_list_scopes.js";
import {
  createMusicDiscoveryLookupRegistration,
} from "./discovery_lookup.js";
import type {
  RetrievalQueryService,
} from "../core/retrieval/index.js";
import type { MusicScopeAvailabilityPort } from "./scope_availability.js";

export {
  createMusicScopeAvailabilityPort,
  createInMemoryMusicScopeAvailabilityPort,
  emptyMusicScopeAvailabilitySnapshot,
} from "./scope_availability.js";
export type {
  MusicCollectionScopeAvailability,
  MusicProviderScopeAvailability,
  MusicRelationScopeAvailability,
  MusicScopeAvailabilityPort,
  MusicScopeAvailabilityProviderMetadataPort,
  MusicScopeAvailabilityRowProvider,
  MusicScopeAvailabilityRowSnapshot,
  MusicScopeAvailabilitySnapshot,
  MusicSourceLibraryScopeAvailability,
  MusicSourceLibraryScopeAvailabilityRow,
} from "./scope_availability.js";
export {
  createMusicDiscoveryListScopesRegistration,
  musicDiscoveryInstrument,
  musicDiscoveryListScopesDescriptor,
} from "./discovery_list_scopes.js";
export type {
  CreateMusicDiscoveryListScopesRegistrationInput,
} from "./discovery_list_scopes.js";
export {
  createMusicDiscoveryLookupRegistration,
  musicDiscoveryLookupDescriptor,
} from "./discovery_lookup.js";
export type {
  CreateMusicDiscoveryLookupRegistrationInput,
} from "./discovery_lookup.js";

export function createMusicDiscoveryRuntimeModule(input: {
  scopeAvailability: MusicScopeAvailabilityPort;
  retrievalQuery?: RetrievalQueryService;
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
            ...(input.retrievalQuery === undefined
              ? []
              : [
                  createMusicDiscoveryLookupRegistration({
                    retrievalQuery: input.retrievalQuery,
                    scopeAvailability: input.scopeAvailability,
                  }),
                ]),
          ],
        },
      };
    },
  };
}
