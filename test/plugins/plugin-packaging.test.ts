import { readFile } from "node:fs/promises";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function readsJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function packagesRepoLocalCodexPlugin(): Promise<void> {
  const root = process.cwd();
  const pluginJson = await readsJson(join(root, "plugins/minemusic/.codex-plugin/plugin.json"));
  const mcpJson = await readsJson(join(root, "plugins/minemusic/.mcp.json"));
  const marketplaceJson = await readsJson(join(root, ".agents/plugins/marketplace.json"));

  assert(pluginJson.name === "minemusic", "plugin name should match local plugin directory");
  assert(pluginJson.mcpServers === "./.mcp.json", "plugin should point Codex at its MCP config");
  assert(!JSON.stringify(pluginJson).includes("[TODO:"), "plugin.json should not keep scaffold TODOs");

  const mcpServers = mcpJson.mcpServers as Record<string, unknown>;
  const server = mcpServers.minemusic as { command?: unknown; args?: unknown };

  assert(server.command === "npm", "MCP server should start through npm");
  assert(Array.isArray(server.args), "MCP server should define args");
  assert(server.args.includes("--prefix"), "MCP server should run from the MineMusic repo root");
  assert(server.args.includes(root), "MCP server should use this repo as npm prefix");
  assert(server.args.includes("mcp:minemusic"), "MCP server should use the MineMusic MCP script");

  const marketplacePlugins = marketplaceJson.plugins as Array<{
    name?: string;
    source?: { source?: string; path?: string };
    policy?: { installation?: string; authentication?: string };
  }>;
  const entry = marketplacePlugins.find((plugin) => plugin.name === "minemusic");

  assert(entry !== undefined, "marketplace should expose the MineMusic plugin");
  assert(entry.source?.source === "local", "marketplace should use a local plugin source");
  assert(entry.source?.path === "./plugins/minemusic", "marketplace should point at repo-local plugin path");
  assert(entry.policy?.installation === "AVAILABLE", "marketplace should leave install as explicit opt-in");
  assert(entry.policy?.authentication === "ON_INSTALL", "marketplace should use plugin-creator auth policy");
}

await packagesRepoLocalCodexPlugin();
