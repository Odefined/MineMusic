import {
  publicSourceLibraryScope,
  createLibraryImportRuntimeModule,
} from "../music_data_platform/stage_adapter/index.js";
import type { ExtensionRuntime } from "../extension/index.js";
import type {
  PlatformLibrarySourceDescriptor,
} from "../music_data_platform/stage_adapter/index.js";
import type {
  LibraryImportStartCommand,
  SourceLibraryReadPort,
} from "../music_data_platform/index.js";
import type { RuntimeModule } from "../stage_core/index.js";

export type LibraryImportServerPorts = {
  libraryImportStart(): LibraryImportStartCommand | undefined;
  sourceLibraryRead(): SourceLibraryReadPort | undefined;
};

export type CreateLibraryImportServerRuntimeModuleInput = {
  extensionRuntime: Pick<ExtensionRuntime, "listPlatformLibraryProviders">;
  ports: LibraryImportServerPorts;
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
    control: {
      async startImport(startInput) {
        const submitted = await libraryImportStartCommand().submit({
          providerId: startInput.providerId,
          libraryKind: startInput.libraryKind,
          ...(startInput.limit === undefined ? {} : { maxNewItems: startInput.limit }),
        });
        if (!submitted.ok) {
          return submitted;
        }
        return { ok: true, value: { batch: submitted.value.batch } };
      },
      getStatus(statusInput) {
        return sourceLibraryReadPort().getImportBatch(statusInput);
      },
      sourceLibraryScopeForBatch({ batch }) {
        if (batch.libraryRef === undefined) {
          return undefined;
        }

        return publicSourceLibraryScope({
          libraryRef: batch.libraryRef,
          providerId: batch.providerId,
          libraryKind: batch.libraryKind,
          providerNames: platformLibraryProviderNames(input.extensionRuntime),
        });
      },
    },
  });

  function libraryImportStartCommand() {
    const command = input.ports.libraryImportStart();

    if (command === undefined) {
      throw new Error("Library import start command is not initialized.");
    }

    return command;
  }

  function sourceLibraryReadPort() {
    const readPort = input.ports.sourceLibraryRead();

    if (readPort === undefined) {
      throw new Error("Source library read port is not initialized.");
    }

    return readPort;
  }
}

function platformLibraryProviderNames(
  extensionRuntime: Pick<ExtensionRuntime, "listPlatformLibraryProviders">,
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();

  for (const registration of extensionRuntime.listPlatformLibraryProviders()) {
    names.set(registration.providerId, registration.provider.descriptor.label);
  }

  return names;
}
