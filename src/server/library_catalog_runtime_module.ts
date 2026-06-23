import {
  createLibraryCatalogRuntimeModule,
  type LibraryCatalogScopeAvailabilityPort,
} from "../music_data_platform/stage_adapter/index.js";
import type {
  LibraryCatalogReadPort,
  MaterialProjection,
} from "../music_data_platform/index.js";
import type { MusicScopeAvailabilityPort } from "../music_intelligence/stage_adapter/index.js";
import type { RuntimeModule } from "../stage_core/index.js";

export type LibraryCatalogScopeServerPorts = {
  musicScopeAvailability(): MusicScopeAvailabilityPort | undefined;
};

export type LibraryCatalogServerPorts = LibraryCatalogScopeServerPorts & {
  libraryCatalog(): LibraryCatalogReadPort | undefined;
  materialProjection(): MaterialProjection | undefined;
};

export type CreateLibraryCatalogServerRuntimeModuleInput = {
  ports: LibraryCatalogServerPorts;
};

export function createLibraryCatalogServerRuntimeModule(
  input: CreateLibraryCatalogServerRuntimeModuleInput,
): RuntimeModule {
  return createLibraryCatalogRuntimeModule({
    catalog: {
      listCatalogItems(readInput) {
        const port = input.ports.libraryCatalog();
        if (port === undefined) {
          throw new Error("Library catalog read port is not initialized.");
        }

        return port.listCatalogItems(readInput);
      },
    },
    materialProjection: {
      projectMusicMaterial(projectInput) {
        const port = input.ports.materialProjection();
        if (port === undefined) {
          throw new Error("Material Projection is not initialized.");
        }

        return port.projectMusicMaterial(projectInput);
      },
      projectMusicMaterials(projectInput) {
        const port = input.ports.materialProjection();
        if (port === undefined) {
          throw new Error("Material Projection is not initialized.");
        }

        return port.projectMusicMaterials(projectInput);
      },
    },
    scopeAvailability: createServerLibraryCatalogScopeAvailability(input.ports),
  });
}

// Shared by the catalog read module and the collection edit module: both need
// to resolve collection scope ids to refs and to read the catalog scope list.
export function createServerLibraryCatalogScopeAvailability(
  ports: LibraryCatalogScopeServerPorts,
): LibraryCatalogScopeAvailabilityPort {
  return {
    async listCatalogScopes(readInput) {
      const port = ports.musicScopeAvailability();
      if (port === undefined) {
        return {
          ok: false,
          error: {
            code: "music_data_platform.scope_availability_uninitialized",
            message: "Music scope availability port is not initialized.",
            area: "music_data_platform",
            retryable: true,
          },
        };
      }

      const available = await port.listAvailableMusicScopes(readInput);
      if (!available.ok) {
        return {
          ok: false,
          error: available.error,
        };
      }

      return {
        ok: true,
        value: {
          sourceLibraries: available.value.sourceLibraries,
          relations: available.value.relations,
          collections: available.value.collections,
        },
      };
    },
  };
}
