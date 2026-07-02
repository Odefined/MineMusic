import { isRecord, isResultLike } from "./type_guards.js";
import type { Result } from "../contracts/kernel.js";
import type { RuntimeErrorSummary } from "../contracts/stage_core.js";
import {
  createCapabilityRegistry,
  type CapabilityRegistry,
} from "./capability_registry.js";
import type { CapabilitySlot } from "./capability_slot.js";
import { extensionError, failExtension, ok } from "./errors.js";
import {
  type MineMusicPluginManifest,
  validatePluginManifest,
} from "./plugin_manifest.js";
import {
  platformLibraryProviderSlot,
  readPlatformLibraryProvider,
  type PlatformLibraryProviderReadInput,
  type PlatformLibraryProviderReadResult,
  type PlatformLibraryProviderRegistration,
} from "./platform_library_provider_slot.js";
import {
  getSourceProviderDownloadSource,
  getSourceProviderPlayableLinks,
  searchSourceProvider,
  sourceProviderSlot,
  type SourceProviderDownloadSourceInput,
  type SourceProviderDownloadSourceResult,
  type SourceProviderPlayableLinksInput,
  type SourceProviderPlayableLinksResult,
  type SourceProviderSearchInput,
  type SourceProviderSearchResult,
  type SourceProviderRegistration,
} from "./source_provider_slot.js";

export type PluginActivationContext = {
  pluginId: string;
  /**
   * Generic, typed capability registration. A new slot needs no change here —
   * it declares its `validateRegistration` with the slot and plugins register
   * through this single method (ADR-0018, open/closed).
   */
  register<T>(
    slot: CapabilitySlot<T>,
    registration: { key: string; value: T },
  ): Result<void>;
};

export type MineMusicPlugin = {
  manifest: MineMusicPluginManifest;
  activate(ctx: PluginActivationContext): Result<void> | Promise<Result<void>>;
};

export type ExtensionRuntimeStatus =
  | "created"
  | "initializing"
  | "ready"
  | "failed"
  | "stopped";

export type ExtensionRuntimeSnapshot = {
  status: ExtensionRuntimeStatus;
  pluginIds: readonly string[];
  sourceProviderCount: number;
  platformLibraryProviderCount: number;
  error?: RuntimeErrorSummary;
};

export type ExtensionRuntime = {
  initialize(): Promise<Result<ExtensionRuntimeSnapshot>>;
  stop(): Promise<Result<void>>;
  snapshot(): ExtensionRuntimeSnapshot;
  listSourceProviders(): readonly SourceProviderRegistration[];
  getSourceProvider(providerId: string): SourceProviderRegistration | undefined;
  searchSourceProvider(input: SourceProviderSearchInput): Promise<Result<SourceProviderSearchResult>>;
  getSourceProviderPlayableLinks(input: SourceProviderPlayableLinksInput): Promise<Result<SourceProviderPlayableLinksResult>>;
  getSourceProviderDownloadSource(input: SourceProviderDownloadSourceInput): Promise<Result<SourceProviderDownloadSourceResult>>;
  listPlatformLibraryProviders(): readonly PlatformLibraryProviderRegistration[];
  getPlatformLibraryProvider(providerId: string): PlatformLibraryProviderRegistration | undefined;
  readPlatformLibraryProvider(input: PlatformLibraryProviderReadInput): Promise<Result<PlatformLibraryProviderReadResult>>;
};

export type CreateExtensionRuntimeInput = {
  plugins?: readonly MineMusicPlugin[];
};

const ALL_SLOTS = [
  sourceProviderSlot,
  platformLibraryProviderSlot,
] as const;

const knownCapabilityIds = new Set<string>(ALL_SLOTS.map((slot) => slot.id));

export function createExtensionRuntime(input: CreateExtensionRuntimeInput = {}): ExtensionRuntime {
  const plugins = input.plugins ?? [];
  let registry = createCapabilityRegistry({ slots: ALL_SLOTS });
  const pluginIds = safePluginIds(plugins);
  let status: ExtensionRuntimeStatus = "created";
  let runtimeError: RuntimeErrorSummary | undefined;

  return {
    initialize,
    stop,
    snapshot,
    listSourceProviders() {
      return registry.list(sourceProviderSlot).map((registration) => ({
        pluginId: registration.pluginId,
        providerId: registration.key,
        provider: registration.value,
      }));
    },
    getSourceProvider(providerId) {
      const registration = registry.get(sourceProviderSlot, providerId);
      return registration === undefined
        ? undefined
        : {
            pluginId: registration.pluginId,
            providerId: registration.key,
            provider: registration.value,
          };
    },
    searchSourceProvider(input) {
      if (status === "failed") {
        return Promise.resolve(failExtension(
          "extension.runtime_failed",
          "Extension runtime failed and cannot search source providers.",
        ));
      }

      if (status === "stopped") {
        return Promise.resolve(failExtension(
          "extension.runtime_stopped",
          "Extension runtime has stopped and cannot search source providers.",
        ));
      }

      if (status !== "ready") {
        return Promise.resolve(failExtension(
          "extension.runtime_not_ready",
          "Extension runtime must be ready before source-provider search.",
        ));
      }

      return searchSourceProvider(registry, input);
    },
    getSourceProviderPlayableLinks(input) {
      if (status === "failed") {
        return Promise.resolve(failExtension(
          "extension.runtime_failed",
          "Extension runtime failed and cannot resolve playable links.",
        ));
      }

      if (status === "stopped") {
        return Promise.resolve(failExtension(
          "extension.runtime_stopped",
          "Extension runtime has stopped and cannot resolve playable links.",
        ));
      }

      if (status !== "ready") {
        return Promise.resolve(failExtension(
          "extension.runtime_not_ready",
          "Extension runtime must be ready before source-provider playable_links.",
        ));
      }

      return getSourceProviderPlayableLinks(registry, input);
    },
    getSourceProviderDownloadSource(input) {
      if (status === "failed") {
        return Promise.resolve(failExtension(
          "extension.runtime_failed",
          "Extension runtime failed and cannot resolve download sources.",
        ));
      }

      if (status === "stopped") {
        return Promise.resolve(failExtension(
          "extension.runtime_stopped",
          "Extension runtime has stopped and cannot resolve download sources.",
        ));
      }

      if (status !== "ready") {
        return Promise.resolve(failExtension(
          "extension.runtime_not_ready",
          "Extension runtime must be ready before source-provider download_source.",
        ));
      }

      return getSourceProviderDownloadSource(registry, input);
    },
    listPlatformLibraryProviders() {
      return registry.list(platformLibraryProviderSlot).map((registration) => ({
        pluginId: registration.pluginId,
        providerId: registration.key,
        provider: registration.value,
      }));
    },
    getPlatformLibraryProvider(providerId) {
      const registration = registry.get(platformLibraryProviderSlot, providerId);
      return registration === undefined
        ? undefined
        : {
            pluginId: registration.pluginId,
            providerId: registration.key,
            provider: registration.value,
          };
    },
    readPlatformLibraryProvider(input) {
      if (status === "failed") {
        return Promise.resolve(failExtension(
          "extension.runtime_failed",
          "Extension runtime failed and cannot read platform library providers.",
        ));
      }

      if (status === "stopped") {
        return Promise.resolve(failExtension(
          "extension.runtime_stopped",
          "Extension runtime has stopped and cannot read platform library providers.",
        ));
      }

      if (status !== "ready") {
        return Promise.resolve(failExtension(
          "extension.runtime_not_ready",
          "Extension runtime must be ready before platform-library provider reads.",
        ));
      }

      return readPlatformLibraryProvider(registry, input);
    },
  };

  async function initialize(): Promise<Result<ExtensionRuntimeSnapshot>> {
    if (status === "ready") {
      return ok(snapshot());
    }

    if (status === "failed") {
      return failExtension(
        "extension.runtime_failed",
        "Extension runtime failed and cannot be initialized again.",
      );
    }

    if (status === "stopped") {
      return failExtension(
        "extension.runtime_stopped",
        "Extension runtime has stopped and cannot be restarted.",
      );
    }

    status = "initializing";
    runtimeError = undefined;

    const manifestValidation = validatePluginManifests(plugins);

    if (!manifestValidation.ok) {
      return failRuntime(manifestValidation.error);
    }

    const workingRegistry = createCapabilityRegistry({ slots: ALL_SLOTS });

    for (const plugin of plugins) {
      const activation = await activatePlugin(plugin, workingRegistry);

      if (!activation.ok) {
        return failRuntime(activation.error);
      }
    }

    registry = workingRegistry;
    status = "ready";
    return ok(snapshot());
  }

  async function stop(): Promise<Result<void>> {
    status = "stopped";
    return ok(undefined);
  }

  function snapshot(): ExtensionRuntimeSnapshot {
    return {
      status,
      pluginIds: pluginIds.slice(),
      sourceProviderCount: registry.list(sourceProviderSlot).length,
      platformLibraryProviderCount: registry.list(platformLibraryProviderSlot).length,
      ...(runtimeError === undefined ? {} : { error: runtimeError }),
    };
  }

  function failRuntime(error: ReturnType<typeof extensionError>): Result<never> {
    status = "failed";
    runtimeError = {
      code: error.code,
      message: error.message,
      area: error.area,
    };
    return { ok: false, error };
  }
}

function validatePluginManifests(plugins: readonly MineMusicPlugin[]): Result<void> {
  const seenPluginIds = new Set<string>();

  for (const plugin of plugins) {
    if (!isRecord(plugin)) {
      return failExtension(
        "extension.invalid_plugin_manifest",
        "Plugin must be an object.",
      );
    }

    const validation = validatePluginManifest({
      manifest: plugin.manifest,
      knownCapabilityIds,
    });

    if (!validation.ok) {
      return validation;
    }

    if (seenPluginIds.has(plugin.manifest.id)) {
      return failExtension(
        "extension.duplicate_plugin",
        `Duplicate plugin id '${plugin.manifest.id}'.`,
      );
    }

    seenPluginIds.add(plugin.manifest.id);
  }

  return ok(undefined);
}

async function activatePlugin(
  plugin: MineMusicPlugin,
  registry: CapabilityRegistry,
): Promise<Result<void>> {
  const registeredCapabilities = new Set<string>();
  let registrationFailure: Result<void> | undefined;
  let activationOpen = true;

  const context: PluginActivationContext = {
    pluginId: plugin.manifest.id,
    register<T>(
      slot: CapabilitySlot<T>,
      registration: { key: string; value: T },
    ): Result<void> {
      if (!activationOpen) {
        return failExtension(
          "extension.activation_context_closed",
          `Plugin '${plugin.manifest.id}' cannot register capabilities after activation returns.`,
        );
      }

      if (!plugin.manifest.capabilities.includes(slot.id)) {
        registrationFailure = failExtension(
          "extension.undeclared_capability_registration",
          `Plugin '${plugin.manifest.id}' did not declare capability '${slot.id}'.`,
        );
        return registrationFailure;
      }

      if (slot.validateRegistration !== undefined) {
        const validation = slot.validateRegistration({
          pluginId: plugin.manifest.id,
          key: registration.key,
          value: registration.value,
        });

        if (!validation.ok) {
          registrationFailure = validation;
          return validation;
        }
      }

      const registered = registry.register(slot, {
        pluginId: plugin.manifest.id,
        key: registration.key,
        value: registration.value,
      });

      if (!registered.ok) {
        registrationFailure = registered;
        return registered;
      }

      registeredCapabilities.add(slot.id);
      return registered;
    },
  };

  let activation: unknown;

  try {
    activation = await plugin.activate(context);
  } catch (cause) {
    activationOpen = false;
    return failExtension(
      "extension.plugin_activation_failed",
      `Plugin '${plugin.manifest.id}' activation threw an error.`,
      cause,
    );
  }

  activationOpen = false;

  if (!isResultLike(activation)) {
    return failExtension(
      "extension.plugin_activation_failed",
      `Plugin '${plugin.manifest.id}' activation returned a malformed result.`,
      activation,
    );
  }

  if (registrationFailure !== undefined && !registrationFailure.ok) {
    return registrationFailure;
  }

  if (!activation.ok) {
    return failExtension(
      "extension.plugin_activation_failed",
      `Plugin '${plugin.manifest.id}' activation returned a failed result.`,
      activation.error,
    );
  }

  for (const capabilityId of plugin.manifest.capabilities) {
    if (!registeredCapabilities.has(capabilityId)) {
      return failExtension(
        "extension.missing_declared_capability_registration",
        `Plugin '${plugin.manifest.id}' declared capability '${capabilityId}' but registered nothing for it.`,
      );
    }
  }

  return ok(undefined);
}

function safePluginIds(plugins: readonly MineMusicPlugin[]): string[] {
  const pluginIds: string[] = [];

  for (const plugin of plugins) {
    if (!isRecord(plugin) || !isRecord(plugin.manifest) || typeof plugin.manifest.id !== "string") {
      continue;
    }

    pluginIds.push(plugin.manifest.id);
  }

  return pluginIds;
}
