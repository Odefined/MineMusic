import type { Result } from "../contracts/index.js";
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

export function validatePluginManifest({
  manifest,
  knownCapabilityIds,
}: ValidatePluginManifestInput): Result<void> {
  if (!isPluginIdSafe(manifest.id)) {
    return failExtension(
      "extension.invalid_plugin_id",
      `Plugin id '${manifest.id}' must use lowercase dotted/kebab segments.`,
    );
  }

  if (
    manifest.displayName.length === 0 ||
    manifest.version.length === 0 ||
    manifest.minCoreVersion.length === 0
  ) {
    return failExtension(
      "extension.invalid_plugin_manifest",
      `Plugin '${manifest.id}' manifest must include non-empty displayName, version, and minCoreVersion.`,
    );
  }

  if (manifest.capabilities.length === 0) {
    return failExtension(
      "extension.invalid_plugin_manifest",
      `Plugin '${manifest.id}' manifest must declare at least one capability.`,
    );
  }

  const seenCapabilities = new Set<string>();

  for (const capabilityId of manifest.capabilities) {
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

export function isPluginIdSafe(pluginId: string): boolean {
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/.test(pluginId);
}
