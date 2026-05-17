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
  const skillText = await readFile(join(root, "plugins/minemusic/skills/minemusic/SKILL.md"), "utf8");

  assert(pluginJson.name === "minemusic", "plugin name should match local plugin directory");
  assert(pluginJson.mcpServers === "./.mcp.json", "plugin should point Codex at its MCP config");
  assert(pluginJson.skills === "./skills/", "plugin should include the MineMusic workflow skill");
  assert(!JSON.stringify(pluginJson).includes("[TODO:"), "plugin.json should not keep scaffold TODOs");
  assert(skillText.includes("name: minemusic"), "MineMusic skill should declare its skill name");
  assert(
    skillText.includes("minemusic.stage.context.read"),
    "MineMusic skill should route music requests through the current context tool",
  );
  assert(
    skillText.includes("minemusic.stage.handbook.read"),
    "MineMusic skill should tell agents how to read the session handbook on demand",
  );
  assert(
    skillText.includes("handbookRef"),
    "MineMusic skill should treat the handbook as a session-scoped document reference",
  );
  assert(
    !skillText.includes("follow the returned Handbook"),
    "MineMusic skill should not imply context embeds the handbook content",
  );
  assert(
    skillText.includes("minemusic.stage.materials.prepare"),
    "MineMusic skill should require Stage material preparation before presenting links",
  );
  assert(
    skillText.includes("minemusic.music.material.ground"),
    "MineMusic skill should route grounding through the current material tool",
  );
  assert(
    skillText.includes("listening context"),
    "MineMusic skill should distinguish listening context from source search text",
  );
  assert(
    skillText.includes("source-searchable candidate"),
    "MineMusic skill should require agent-selected source-searchable candidates",
  );
  assert(
    skillText.includes("Do not send environment words"),
    "MineMusic skill should forbid using environment terms as literal song searches",
  );
  assert(
    !skillText.includes("with the user's wording"),
    "MineMusic skill should not tell agents to search providers with the raw user request",
  );
  assert(!skillText.includes("minemusic.context.read"), "MineMusic skill should not mention the old context tool");
  assert(!skillText.includes("minemusic.candidates.build"), "MineMusic skill should not mention the old candidate tool");
  assert(!skillText.includes("minemusic.memory.propose_update"), "MineMusic skill should not mention old memory tool");

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
