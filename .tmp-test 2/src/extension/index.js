export { defineCapabilitySlot, isCapabilitySlotIdSafe, } from "./capability_slot.js";
export { createCapabilityRegistry, } from "./capability_registry.js";
export { isPluginIdSafe, validatePluginManifest, } from "./plugin_manifest.js";
export { createExtensionRuntime, } from "./plugin_runtime.js";
export { getSourceProvider, listSourceProviders, registerSourceProvider, sourceProviderSlot, validateSourceProviderRegistration, } from "./source_provider_slot.js";
export { getPlatformLibraryProvider, listPlatformLibraryProviders, platformLibraryProviderSlot, registerPlatformLibraryProvider, validatePlatformLibraryProviderRegistration, } from "./platform_library_provider_slot.js";
