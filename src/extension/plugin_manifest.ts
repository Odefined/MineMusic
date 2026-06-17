import { isRecord } from "./type_guards.js";
import type { Result } from "../contracts/kernel.js";
import { failExtension, ok } from "./errors.js";

export type MineMusicPluginManifest = {
  id: string;
  displayName: string;
  version: string;
  minCoreVersion: string;
  capabilities: readonly string[];
};

export type ValidatePluginManifestInput = {
  manifest: MineMusicPluginManifest;
  knownCapabilityIds: ReadonlySet<string>;
};

export function validatePluginManifest(input: ValidatePluginManifestInput): Result<void> {
  const { manifest, knownCapabilityIds } = input;

  if (!isRecord(manifest)) {
    return failExtension(
      "extension.invalid_plugin_manifest",
      "Plugin manifest must be an object.",
    );
  }

  if (typeof manifest.id !== "string") {
    return failExtension(
      "extension.invalid_plugin_id",
      "Plugin id must be a string using lowercase dotted/kebab segments.",
    );
  }

  if (!isPluginIdSafe(manifest.id)) {
    return failExtension(
      "extension.invalid_plugin_id",
      `Plugin id '${manifest.id}' must use lowercase dotted/kebab segments.`,
    );
  }

  if (
    typeof manifest.displayName !== "string" ||
    manifest.displayName.trim().length === 0 ||
    typeof manifest.version !== "string" ||
    manifest.version.trim().length === 0 ||
    typeof manifest.minCoreVersion !== "string" ||
    manifest.minCoreVersion.trim().length === 0
  ) {
    return failExtension(
      "extension.invalid_plugin_manifest",
      `Plugin '${manifest.id}' manifest must include non-empty displayName, version, and minCoreVersion.`,
    );
  }

  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    return failExtension(
      "extension.invalid_plugin_manifest",
      `Plugin '${manifest.id}' manifest must declare at least one capability.`,
    );
  }

  const seenCapabilities = new Set<string>();

  for (const capabilityId of manifest.capabilities) {
    if (typeof capabilityId !== "string") {
      return failExtension(
        "extension.invalid_plugin_manifest",
        `Plugin '${manifest.id}' manifest capability ids must be strings.`,
      );
    }

    if (seenCapabilities.has(capabilityId)) {
      return failExtension(
        "extension.invalid_plugin_manifest",
        `Plugin '${manifest.id}' manifest declares duplicate capability '${capabilityId}'.`,
      );
    }

    seenCapabilities.add(capabilityId);

    if (!knownCapabilityIds.has(capabilityId)) {
      return failExtension(
        "extension.unknown_capability",
        `Plugin '${manifest.id}' declares unknown capability '${capabilityId}'.`,
      );
    }
  }

  return ok(undefined);
}

export function isPluginIdSafe(pluginId: unknown): pluginId is string {
  return typeof pluginId === "string" &&
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/.test(pluginId);
}
