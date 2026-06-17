import {
  createLibraryImportRuntimeModule,
} from "../music_data_platform/stage_adapter/index.js";
import type { RuntimeModule } from "../stage_core/index.js";

export function createLibraryImportServerRuntimeModule(): RuntimeModule {
  return createLibraryImportRuntimeModule();
}
