import {
  createLibraryCatalogRuntimeModule,
  type LibraryCatalogScopeAvailabilityPort,
} from "../music_data_platform/stage_adapter/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import type { MusicDataPlatformRuntimeModule } from "./music_data_platform_runtime_module.js";

export type CreateLibraryCatalogServerRuntimeModuleInput = {
  musicDataPlatformModule: MusicDataPlatformRuntimeModule;
};

export function createLibraryCatalogServerRuntimeModule(
  input: CreateLibraryCatalogServerRuntimeModuleInput,
): RuntimeModule {
  return createLibraryCatalogRuntimeModule({
    catalog: {
      listCatalogItems(readInput) {
        const port = input.musicDataPlatformModule.libraryCatalog();
        if (port === undefined) {
          throw new Error("Library catalog read port is not initialized.");
        }

        return port.listCatalogItems(readInput);
      },
    },
    materialProjection: {
      projectMusicMaterial(projectInput) {
        const port = input.musicDataPlatformModule.materialProjection();
        if (port === undefined) {
          throw new Error("Material Projection is not initialized.");
        }

        return port.projectMusicMaterial(projectInput);
      },
      projectMusicMaterials(projectInput) {
        const port = input.musicDataPlatformModule.materialProjection();
        if (port === undefined) {
          throw new Error("Material Projection is not initialized.");
        }

        return port.projectMusicMaterials(projectInput);
      },
    },
    scopeAvailability: createServerLibraryCatalogScopeAvailability(input.musicDataPlatformModule),
  });
}

function createServerLibraryCatalogScopeAvailability(
  musicDataPlatformModule: MusicDataPlatformRuntimeModule,
): LibraryCatalogScopeAvailabilityPort {
  return {
    async listCatalogScopes(readInput) {
      const port = musicDataPlatformModule.musicScopeAvailability();
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
