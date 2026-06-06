import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const repositoryRoot = process.cwd();

const removedRuntimeRoots = [
  "fixtures",
  "docs/canonical-store",
  "docs/collection-service",
  "docs/host-adapters",
  "docs/knowledge-slot",
  "docs/library-import",
  "docs/material",
  "docs/material-search",
  "docs/material-store",
  "docs/operations",
  "docs/platform-library-provider",
  "docs/source-providers",
  "docs/stage-core",
  "docs/stage-interface",
  "scripts/reset-minemusic-launchd-runtime.sh",
  "skills/minemusic",
  "src/app",
  "src/collection",
  "src/effects",
  "src/events",
  "src/fixtures",
  "src/handbook",
  "src/knowledge",
  "src/material",
  "src/memory",
  "src/plugins",
  "src/ports",
  "src/providers",
  "src/source",
  "src/stage",
  "src/storage",
  "src/surfaces",
  "test/architecture",
  "test/canonical",
  "test/collection",
  "test/effects",
  "test/events",
  "test/fixtures",
  "test/integration",
  "test/knowledge",
  "test/library_import",
  "test/material_ephemeral",
  "test/material_policy",
  "test/material_query",
  "test/material_resolve",
  "test/material_search",
  "test/material_selection",
  "test/material_store",
  "test/memory",
  "test/plugins",
  "test/providers",
  "test/recommendation_presentation",
  "test/server",
  "test/source",
  "test/stage",
  "test/stage_core",
  "test/stage_interface",
  "test/storage",
  "test/surfaces",
];

const deletedVocabulary = [
  "Music" + "Material",
  "Source" + "Material",
  "Material" + "Resolve",
  "Public" + "Material" + "Resolve",
  "Ephemeral" + "Material",
  "Material" + "State",
  "mat" + ":",
  "emat" + ":",
  "canonical" + ".review",
  "Legacy" + "Music" + "Material",
  "Legacy" + "Source" + "Material",
];

for (const root of removedRuntimeRoots) {
  assert.equal(
    await pathExists(join(repositoryRoot, root)),
    false,
    `pre-formal runtime root must not remain active: ${root}`,
  );
}

const activeFiles = await sourceFilesUnder(join(repositoryRoot, "src"));
const failures: string[] = [];

for (const file of activeFiles) {
  const text = await readFile(file, "utf8");

  for (const vocabulary of deletedVocabulary) {
    if (text.includes(vocabulary)) {
      failures.push(`${relative(repositoryRoot, file)} contains deleted vocabulary '${vocabulary}'`);
    }
  }
}

assert.deepEqual(failures, []);

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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
