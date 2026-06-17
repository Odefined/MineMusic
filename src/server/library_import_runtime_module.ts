import {
  createLibraryImportRuntimeModule,
} from "../music_data_platform/stage_adapter/index.js";
import type { ExtensionRuntime } from "../extension/index.js";
import type { PlatformLibrarySourceDescriptor } from "../music_data_platform/stage_adapter/index.js";
import type { RuntimeModule } from "../stage_core/index.js";

export type CreateLibraryImportServerRuntimeModuleInput = {
  extensionRuntime: Pick<ExtensionRuntime, "listPlatformLibraryProviders">;
};

export function createLibraryImportServerRuntimeModule(
  input: CreateLibraryImportServerRuntimeModuleInput,
): RuntimeModule {
  return createLibraryImportRuntimeModule({
    sourceListing: {
      listPlatformLibrarySources() {
        return input.extensionRuntime.listPlatformLibraryProviders().map((registration): PlatformLibrarySourceDescriptor => ({
          providerId: registration.providerId,
          label: registration.provider.descriptor.label,
          ...(registration.provider.descriptor.accountRequired === true ? { accountRequired: true } : {}),
          libraryKinds: registration.provider.descriptor.libraryKinds,
        }));
      },
    },
  });
}
