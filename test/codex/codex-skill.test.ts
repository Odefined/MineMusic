import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function readsJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function exists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

async function packagesRepoLocalCodexSkill(): Promise<void> {
  const root = process.cwd();
  const packageJson = await readsJson(join(root, "package.json"));
  const skillText = await readFile(join(root, "skills/minemusic/SKILL.md"), "utf8");
  const handbookText = await readFile(join(root, "skills/minemusic/HANDBOOK.md"), "utf8");
  const stageCoreText = await readFile(join(root, "src/stage_core/index.ts"), "utf8");

  assert(!(await exists(join(root, "plugins/minemusic/.codex-plugin/plugin.json"))), "repo should not ship a Codex plugin manifest");
  assert(!(await exists(join(root, "plugins/minemusic/.mcp.json"))), "repo should not ship plugin-local MCP config");
  assert(!(await exists(join(root, ".agents/plugins/marketplace.json"))), "repo should not advertise MineMusic as a Codex plugin");
  assert(!stageCoreText.includes("skills/minemusic"), "Stage Core should not depend on the Codex skill path");
  assert(!stageCoreText.includes("plugins/minemusic"), "Stage Core should not depend on the old Codex plugin path");
  assert(skillText.includes("name: minemusic"), "MineMusic skill should declare its skill name");
  assert(
    skillText.includes("global") && skillText.includes("Codex MCP client config"),
    "MineMusic skill should describe the external MCP server boundary",
  );
  assert(
    skillText.includes("minemusic.stage.context.read"),
    "MineMusic skill should route music requests through the current context tool",
  );
  assert(
    skillText.includes("HANDBOOK.md"),
    "MineMusic skill should point agents at the generated instrument handbook file",
  );
  assert(
    skillText.includes("minemusic.handbook.tool.read"),
    "MineMusic skill should mention precise handbook tool lookup",
  );
  assert(
    !skillText.includes("handbookRef"),
    "MineMusic skill should not treat context as carrying a handbook reference",
  );
  assert(!skillText.includes("session handbook"), "MineMusic skill should not mention session handbook files");
  assert(handbookText.includes("# MineMusic Instrument Handbook"), "skill should ship a generated handbook overview");
  assert(handbookText.includes("`music.material.resolve`"), "handbook should document the resolve tool");
  assert(handbookText.includes("`memory.feedback.record`"), "handbook should document the feedback tool");
  assert(handbookText.includes("Input: `MaterialResolveRequest`"), "handbook should document tool input schema refs");
  assert(handbookText.includes("Output: `MaterialResolveResult`"), "handbook should document tool output schema refs");
  assert(
    skillText.includes("minemusic.stage.recommendation.present"),
    "MineMusic skill should require the recommendation presentation boundary before answering",
  );
  assert(
    skillText.includes("exactly the returned cards"),
    "MineMusic skill should tell agents to answer from returned presentation cards",
  );
  assert(
    !skillText.includes("Before presenting any material or link, call"),
    "MineMusic skill should not require the old prepare-first recommendation path",
  );
  assert(
    skillText.includes("minemusic.music.material.resolve"),
    "MineMusic skill should route recommendations through the current material resolve tool",
  );
  assert(
    skillText.includes("listening context"),
    "MineMusic skill should distinguish listening context from source search text",
  );
  assert(
    skillText.includes("music candidates"),
    "MineMusic skill should require agent-selected music candidates",
  );
  assert(!skillText.includes("minemusic.music.material.ground"), "MineMusic skill should not route agents to ground directly");
  assert(
    skillText.includes("listening context") && skillText.includes("Send provider searches as concrete"),
    "MineMusic skill should frame context interpretation in positive terms",
  );
  assert(
    skillText.includes("Use only fields shown by the live handbook/tool schema") &&
      skillText.includes("`q` is for concrete"),
    "MineMusic skill should avoid teaching hidden material style-hint fields to agents",
  );
  assert(!skillText.includes("Do not") && !skillText.includes("do not"), "MineMusic skill should avoid unnecessary negative directives");
  assert(!skillText.includes("preferenceHints"), "MineMusic skill should not name hidden material style-hint fields");
  assert(
    !skillText.includes("with the user's wording"),
    "MineMusic skill should not tell agents to search providers with the raw user request",
  );
  assert(!skillText.includes("minemusic.context.read"), "MineMusic skill should not mention the old context tool");
  assert(!skillText.includes("minemusic.candidates.build"), "MineMusic skill should not mention the old candidate tool");
  assert(!skillText.includes("minemusic.memory.propose_update"), "MineMusic skill should not mention old memory tool");
  assert(
    !skillText.includes("MINEMUSIC_NETEASE_BASE_URL"),
    "skill should not own provider runtime env",
  );
  assert(
    !skillText.includes("MINEMUSIC_MATERIAL_STORE_DB_PATH"),
    "skill should not own Canonical Store runtime env",
  );
  assert(
    !skillText.includes("MINEMUSIC_COLLECTION_DB_PATH"),
    "skill should not own Collection runtime env",
  );
  assert(
    !skillText.includes("MINEMUSIC_LIBRARY_IMPORT_DB_PATH"),
    "skill should not own Library Import runtime env",
  );
  assert(
    !skillText.includes("MINEMUSIC_PROVIDER_HTTP_CACHE_DB_PATH"),
    "skill should not own provider cache runtime env",
  );

  const scripts = packageJson.scripts as Record<string, unknown>;

  assert(
    typeof scripts["server:minemusic"] === "string" && scripts["server:minemusic"].includes("src/server/index.js"),
    "server script should start the MineMusic server entrypoint",
  );
  assert(
    typeof scripts["mcp:minemusic:dev"] === "string" && scripts["mcp:minemusic:dev"].includes("src/surfaces/mcp/stdio-dev.js"),
    "embedded MCP startup should be named as a dev path",
  );
  assert(!("mcp:minemusic" in scripts), "package scripts should not expose ambiguous embedded MCP startup");
  assert(!("service:minemusic" in scripts), "package scripts should not expose the wrong Codex-owned startup path");
}

await packagesRepoLocalCodexSkill();
