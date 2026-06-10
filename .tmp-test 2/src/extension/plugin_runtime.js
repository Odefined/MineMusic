import { createCapabilityRegistry, } from "./capability_registry.js";
import { failExtension, ok } from "./errors.js";
import { validatePluginManifest, } from "./plugin_manifest.js";
import { getPlatformLibraryProvider, listPlatformLibraryProviders, platformLibraryProviderSlot, readPlatformLibraryProvider, registerPlatformLibraryProvider, } from "./platform_library_provider_slot.js";
import { getSourceProvider, listSourceProviders, registerSourceProvider, searchSourceProvider, sourceProviderSlot, } from "./source_provider_slot.js";
const knownCapabilityIds = new Set([
    sourceProviderSlot.id,
    platformLibraryProviderSlot.id,
]);
export function createExtensionRuntime(input = {}) {
    const plugins = input.plugins ?? [];
    let registry = createCapabilityRegistry({
        slots: [sourceProviderSlot, platformLibraryProviderSlot],
    });
    const pluginIds = safePluginIds(plugins);
    let status = "created";
    let runtimeError;
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
                return Promise.resolve(failExtension("extension.runtime_failed", "Extension runtime failed and cannot search source providers."));
            }
            if (status === "stopped") {
                return Promise.resolve(failExtension("extension.runtime_stopped", "Extension runtime has stopped and cannot search source providers."));
            }
            if (status !== "ready") {
                return Promise.resolve(failExtension("extension.runtime_not_ready", "Extension runtime must be ready before source-provider search."));
            }
            return searchSourceProvider(registry, input);
        },
        listPlatformLibraryProviders() {
            return listPlatformLibraryProviders(registry);
        },
        getPlatformLibraryProvider(providerId) {
            return getPlatformLibraryProvider(registry, providerId);
        },
        readPlatformLibraryProvider(input) {
            if (status === "failed") {
                return Promise.resolve(failExtension("extension.runtime_failed", "Extension runtime failed and cannot read platform library providers."));
            }
            if (status === "stopped") {
                return Promise.resolve(failExtension("extension.runtime_stopped", "Extension runtime has stopped and cannot read platform library providers."));
            }
            if (status !== "ready") {
                return Promise.resolve(failExtension("extension.runtime_not_ready", "Extension runtime must be ready before platform-library provider reads."));
            }
            return readPlatformLibraryProvider(registry, input);
        },
    };
    async function initialize() {
        if (status === "ready") {
            return ok(snapshot());
        }
        if (status === "failed") {
            return failExtension("extension.runtime_failed", "Extension runtime failed and cannot be initialized again.");
        }
        if (status === "stopped") {
            return failExtension("extension.runtime_stopped", "Extension runtime has stopped and cannot be restarted.");
        }
        status = "initializing";
        runtimeError = undefined;
        const manifestValidation = validatePluginManifests(plugins);
        if (!manifestValidation.ok) {
            return failRuntime(manifestValidation.error);
        }
        const workingRegistry = createCapabilityRegistry({
            slots: [sourceProviderSlot, platformLibraryProviderSlot],
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
    async function stop() {
        status = "stopped";
        return ok(undefined);
    }
    function snapshot() {
        return {
            status,
            pluginIds: pluginIds.slice(),
            sourceProviderCount: listSourceProviders(registry).length,
            platformLibraryProviderCount: listPlatformLibraryProviders(registry).length,
            ...(runtimeError === undefined ? {} : { error: runtimeError }),
        };
    }
    function failRuntime(error) {
        status = "failed";
        runtimeError = {
            code: error.code,
            message: error.message,
            area: error.area,
        };
        return { ok: false, error };
    }
}
function validatePluginManifests(plugins) {
    const seenPluginIds = new Set();
    for (const plugin of plugins) {
        if (!isRecord(plugin)) {
            return failExtension("extension.invalid_plugin_manifest", "Plugin must be an object.");
        }
        const validation = validatePluginManifest({
            manifest: plugin.manifest,
            knownCapabilityIds,
        });
        if (!validation.ok) {
            return validation;
        }
        if (seenPluginIds.has(plugin.manifest.id)) {
            return failExtension("extension.duplicate_plugin", `Duplicate plugin id '${plugin.manifest.id}'.`);
        }
        seenPluginIds.add(plugin.manifest.id);
    }
    return ok(undefined);
}
async function activatePlugin(plugin, registry) {
    const registeredCapabilities = new Set();
    let registrationFailure;
    let activationOpen = true;
    const context = {
        pluginId: plugin.manifest.id,
        registerSourceProvider(registration) {
            if (!activationOpen) {
                return failExtension("extension.activation_context_closed", `Plugin '${plugin.manifest.id}' cannot register source providers after activation returns.`);
            }
            if (!isRecord(registration) || typeof registration.pluginId !== "string") {
                registrationFailure = failExtension("extension.invalid_source_provider_registration", `Plugin '${plugin.manifest.id}' source-provider registration must include pluginId.`);
                return registrationFailure;
            }
            if (registration.pluginId !== plugin.manifest.id) {
                registrationFailure = failExtension("extension.plugin_registration_owner_mismatch", `Plugin '${plugin.manifest.id}' cannot register provider for plugin '${registration.pluginId}'.`);
                return registrationFailure;
            }
            if (!plugin.manifest.capabilities.includes(sourceProviderSlot.id)) {
                registrationFailure = failExtension("extension.undeclared_capability_registration", `Plugin '${plugin.manifest.id}' did not declare capability '${sourceProviderSlot.id}'.`);
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
        registerPlatformLibraryProvider(registration) {
            if (!activationOpen) {
                return failExtension("extension.activation_context_closed", `Plugin '${plugin.manifest.id}' cannot register platform library providers after activation returns.`);
            }
            if (!isRecord(registration) || typeof registration.pluginId !== "string") {
                registrationFailure = failExtension("extension.invalid_platform_library_provider_registration", `Plugin '${plugin.manifest.id}' platform-library-provider registration must include pluginId.`);
                return registrationFailure;
            }
            if (registration.pluginId !== plugin.manifest.id) {
                registrationFailure = failExtension("extension.plugin_registration_owner_mismatch", `Plugin '${plugin.manifest.id}' cannot register platform library provider for plugin '${registration.pluginId}'.`);
                return registrationFailure;
            }
            if (!plugin.manifest.capabilities.includes(platformLibraryProviderSlot.id)) {
                registrationFailure = failExtension("extension.undeclared_capability_registration", `Plugin '${plugin.manifest.id}' did not declare capability '${platformLibraryProviderSlot.id}'.`);
                return registrationFailure;
            }
            const registered = registerPlatformLibraryProvider(registry, registration);
            if (!registered.ok) {
                registrationFailure = registered;
                return registered;
            }
            registeredCapabilities.add(platformLibraryProviderSlot.id);
            return registered;
        },
    };
    let activation;
    try {
        activation = await plugin.activate(context);
    }
    catch (cause) {
        activationOpen = false;
        return failExtension("extension.plugin_activation_failed", `Plugin '${plugin.manifest.id}' activation threw an error.`, cause);
    }
    activationOpen = false;
    if (!isResultLike(activation)) {
        return failExtension("extension.plugin_activation_failed", `Plugin '${plugin.manifest.id}' activation returned a malformed result.`, activation);
    }
    if (registrationFailure !== undefined && !registrationFailure.ok) {
        return registrationFailure;
    }
    if (!activation.ok) {
        return failExtension("extension.plugin_activation_failed", `Plugin '${plugin.manifest.id}' activation returned a failed result.`, activation.error);
    }
    for (const capabilityId of plugin.manifest.capabilities) {
        if (!registeredCapabilities.has(capabilityId)) {
            return failExtension("extension.missing_declared_capability_registration", `Plugin '${plugin.manifest.id}' declared capability '${capabilityId}' but registered nothing for it.`);
        }
    }
    return ok(undefined);
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function safePluginIds(plugins) {
    const pluginIds = [];
    for (const plugin of plugins) {
        if (!isRecord(plugin) || !isRecord(plugin.manifest) || typeof plugin.manifest.id !== "string") {
            continue;
        }
        pluginIds.push(plugin.manifest.id);
    }
    return pluginIds;
}
function isResultLike(value) {
    if (!isRecord(value) || typeof value.ok !== "boolean") {
        return false;
    }
    if (value.ok) {
        return "value" in value;
    }
    return isStageErrorLike(value.error);
}
function isStageErrorLike(value) {
    return isRecord(value) &&
        typeof value.code === "string" &&
        typeof value.message === "string" &&
        typeof value.area === "string" &&
        typeof value.retryable === "boolean";
}
