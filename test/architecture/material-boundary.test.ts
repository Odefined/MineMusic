import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const materialRoots = [
  "src/material",
];

const legacyMaterialRoots = [
  "src/material_store",
  "src/material_resolve",
  "src/material_query",
  "src/material_policy",
  "src/material_selection",
  "src/recommendation_presentation",
];

const forbiddenSourceFragments = [
  "stage_interface",
  "material_cards",
];

const forbiddenImportedNames = [
  "MaterialCard",
  "MaterialCardsPort",
  "CandidateMaterialCard",
  "PresentedMaterialCard",
  "MaterialCardSnapshot",
  "RecentMaterialCard",
  "RecommendationPresentedCardSnapshot",
  "CompactMaterialCard",
  "CompactCandidateMaterialCard",
  "CompactPresentedMaterialCard",
];

async function materialModulesDoNotImportAgentFacingOutputShapes(): Promise<void> {
  const files = await materialSourceFiles();
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      const sourceFailure = forbiddenSourceFragments.find((fragment) => importStatement.source.includes(fragment));

      if (sourceFailure !== undefined) {
        failures.push(`${relative(process.cwd(), file)} imports ${sourceFailure} via ${importStatement.source}`);
      }

      const nameFailures = forbiddenImportedNames.filter((name) =>
        new RegExp(`\\b${name}\\b`).test(importStatement.clause)
      );
      const compactNameFailures = Array.from(importStatement.clause.matchAll(/\bCompact[A-Za-z0-9_]*\b/g))
        .map((match) => match[0] ?? "");

      for (const name of new Set([...nameFailures, ...compactNameFailures])) {
        failures.push(`${relative(process.cwd(), file)} imports agent-facing output DTO ${name}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material modules must not import Stage Interface output DTOs:\n${failures.join("\n")}`,
  );
}

async function legacyMaterialRootDirectoriesAreRemoved(): Promise<void> {
  const existingLegacyRoots: string[] = [];

  for (const root of legacyMaterialRoots) {
    if (await pathExists(join(process.cwd(), root))) {
      existingLegacyRoots.push(root);
    }
  }

  assert(
    existingLegacyRoots.length === 0,
    `Material bounded context should not keep legacy root directories:\n${existingLegacyRoots.join("\n")}`,
  );
}

async function materialSourceFiles(): Promise<string[]> {
  const files: string[] = [];

  for (const root of materialRoots.map((folder) => join(process.cwd(), folder))) {
    if (!(await pathExists(root))) {
      continue;
    }

    files.push(...await sourceFilesUnder(root));
  }

  return files;
}

async function sourceFilesUnder(root: string): Promise<string[]> {
  const entry = await stat(root);

  if (entry.isFile()) {
    return root.endsWith(".ts") ? [root] : [];
  }

  const files: string[] = [];
  const children = await readdir(root, { withFileTypes: true });

  for (const child of children) {
    const childPath = join(root, child.name);

    if (child.isDirectory()) {
      files.push(...await sourceFilesUnder(childPath));
      continue;
    }

    if (child.isFile() && child.name.endsWith(".ts")) {
      files.push(childPath);
    }
  }

  return files;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function importStatements(text: string): Array<{ clause: string; source: string }> {
  const imports: Array<{ clause: string; source: string }> = [];
  const fromImportPattern = /\bimport\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  const sideEffectImportPattern = /\bimport\s+["']([^"']+)["']/g;

  for (const match of text.matchAll(fromImportPattern)) {
    imports.push({
      clause: match[1] ?? "",
      source: match[2] ?? "",
    });
  }

  for (const match of text.matchAll(sideEffectImportPattern)) {
    imports.push({
      clause: "",
      source: match[1] ?? "",
    });
  }

  return imports;
}

await materialModulesDoNotImportAgentFacingOutputShapes();
await legacyMaterialRootDirectoriesAreRemoved();
