import type { Result, RuntimeErrorSummary } from "../contracts/index.js";
import {
  createCapabilityRegistry,
  type CapabilityRegistry,
} from "./capability_registry.js";
import { extensionError, failExtension, ok } from "./errors.js";
import {
  type MineMusicPluginManifest,
  validatePluginManifest,
} from "./plugin_manifest.js";
import {
  getSourceProvider,
  listSourceProviders,
  registerSourceProvider,
  searchSourceProvider,
  sourceProviderSlot,
  type SourceProviderSearchInput,
  type SourceProviderSearchResult,
  type SourceProviderRegistration,
} from "./source_provider_slot.js";

export type PluginActivationContext = {
  pluginId: string;
  registerSourceProvider(registration: SourceProviderRegistration): Result<void>;
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
  error?: RuntimeErrorSummary;
};

export type ExtensionRuntime = {
  initialize(): Promise<Result<ExtensionRuntimeSnapshot>>;
  stop(): Promise<Result<void>>;
  snapshot(): ExtensionRuntimeSnapshot;
  listSourceProviders(): readonly SourceProviderRegistration[];
  getSourceProvider(providerId: string): SourceProviderRegistration | undefined;
  searchSourceProvider(input: SourceProviderSearchInput): Promise<Result<SourceProviderSearchResult>>;
};

export type CreateExtensionRuntimeInput = {
  plugins?: readonly MineMusicPlugin[];
};

const knownCapabilityIds = new Set<string>([sourceProviderSlot.id]);

export function createExtensionRuntime(input: CreateExtensionRuntimeInput = {}): ExtensionRuntime {
  const plugins = input.plugins ?? [];
  let registry = createCapabilityRegistry({
    slots: [sourceProviderSlot],
  });
  const pluginIds = safePluginIds(plugins);
  let status: ExtensionRuntimeStatus = "created";
  let runtimeError: RuntimeErrorSummary | undefined;

  return {
    initialize,
    stop,
    snapshot,
    listSourceProviders() {
      return listSourceProviders(registry);
    },
    getSourceProvider(providerId) {
      return getSourceProvider(registry, providerId);
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

    const workingRegistry = createCapabilityRegistry({
      slots: [sourceProviderSlot],
    });

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
      sourceProviderCount: listSourceProviders(registry).length,
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
    registerSourceProvider(registration) {
      if (!activationOpen) {
        return failExtension(
          "extension.activation_context_closed",
          `Plugin '${plugin.manifest.id}' cannot register source providers after activation returns.`,
        );
      }

      if (!isRecord(registration) || typeof registration.pluginId !== "string") {
        registrationFailure = failExtension(
          "extension.invalid_source_provider_registration",
          `Plugin '${plugin.manifest.id}' source-provider registration must include pluginId.`,
        );
        return registrationFailure;
      }

      if (registration.pluginId !== plugin.manifest.id) {
        registrationFailure = failExtension(
          "extension.plugin_registration_owner_mismatch",
          `Plugin '${plugin.manifest.id}' cannot register provider for plugin '${registration.pluginId}'.`,
        );
        return registrationFailure;
      }

      if (!plugin.manifest.capabilities.includes(sourceProviderSlot.id)) {
        registrationFailure = failExtension(
          "extension.undeclared_capability_registration",
          `Plugin '${plugin.manifest.id}' did not declare capability '${sourceProviderSlot.id}'.`,
        );
        return registrationFailure;
      }

      const registered = registerSourceProvider(registry, registration);

      if (!registered.ok) {
        registrationFailure = registered;
        return registered;
      }

      registeredCapabilities.add(sourceProviderSlot.id);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function isResultLike(value: unknown): value is Result<unknown> {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }

  if (value.ok) {
    return "value" in value;
  }

  return isStageErrorLike(value.error);
}

function isStageErrorLike(value: unknown): value is { code: string; message: string; area: string; retryable: boolean } {
  return isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.area === "string" &&
    typeof value.retryable === "boolean";
}
