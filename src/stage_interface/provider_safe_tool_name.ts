import type { ToolDeclaration } from "../contracts/stage_interface.js";

export function toProviderSafeToolName(internalName: string): string {
  const providerSafeName = internalName.replace(/[^a-zA-Z0-9_-]/gu, "_");

  if (!/^[a-zA-Z0-9_-]{1,64}$/u.test(providerSafeName)) {
    throw new Error(`Stage tool name '${internalName}' cannot be mapped to a provider-safe tool name.`);
  }

  return providerSafeName;
}

export function assertUniqueProviderSafeToolNames(tools: readonly ToolDeclaration[]): void {
  const seen = new Map<string, string>();

  for (const tool of tools) {
    const providerSafeName = toProviderSafeToolName(tool.name);
    const prior = seen.get(providerSafeName);

    if (prior !== undefined) {
      throw new Error(
        `Stage tool names '${prior}' and '${tool.name}' both map to provider-safe tool name '${providerSafeName}'.`,
      );
    }

    seen.set(providerSafeName, tool.name);
  }
}
