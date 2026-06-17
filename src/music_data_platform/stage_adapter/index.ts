import type { RuntimeModule } from "../../stage_core/runtime_module.js";

export function createLibraryImportRuntimeModule(): RuntimeModule {
  return {
    descriptor: {
      id: "library-import",
      ownerArea: "music_data_platform",
      label: "Library Import",
    },
    async initialize() {
      return {
        ok: true,
        value: {},
      };
    },
  };
}
