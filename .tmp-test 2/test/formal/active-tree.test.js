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
    assert.equal(await pathExists(join(repositoryRoot, root)), false, `pre-formal runtime root must not remain active: ${root}`);
}
assert.equal(await pathExists(join(repositoryRoot, "src/extension")), true, "formal Extension root must exist in active source after Phase 3");
assert.equal(await pathExists(join(repositoryRoot, "src/storage")), true, "formal Storage root must exist in active source after Phase 4");
assert.equal(await pathExists(join(repositoryRoot, "src/music_data_platform")), true, "formal Music Data Platform root must exist in active source after Phase 5");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/storage")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/storage/database.ts",
    "src/storage/index.ts",
    "src/storage/sqlite/database.ts",
    "src/storage/sqlite/schema.ts",
], "Phase 4 formal Storage root must not grow unrelated storage implementations");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/music_data_platform")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/music_data_platform/errors.ts",
    "src/music_data_platform/identity_records.ts",
    "src/music_data_platform/identity_schema.ts",
    "src/music_data_platform/identity_write_model.ts",
    "src/music_data_platform/index.ts",
    "src/music_data_platform/material_ref_factory.ts",
    "src/music_data_platform/source_library_import.ts",
    "src/music_data_platform/source_library_records.ts",
    "src/music_data_platform/source_library_schema.ts",
], "Phase 7 formal Music Data Platform root must not grow unrelated implementations");
const activeFiles = await sourceFilesUnder(join(repositoryRoot, "src"));
const failures = [];
for (const file of activeFiles) {
    const text = await readFile(file, "utf8");
    for (const vocabulary of deletedVocabulary) {
        if (text.includes(vocabulary)) {
            failures.push(`${relative(repositoryRoot, file)} contains deleted vocabulary '${vocabulary}'`);
        }
    }
}
assert.deepEqual(failures, []);
const forbiddenRuntimeImports = [
    "../material/",
    "../providers/",
    "../storage/",
    "../memory/",
    "../effects/",
    "../collection/",
    "../knowledge/",
];
for (const root of ["src/stage_core"]) {
    const files = await sourceFilesUnder(join(repositoryRoot, root));
    const importFailures = [];
    for (const file of files) {
        const text = await readFile(file, "utf8");
        for (const forbiddenImport of forbiddenRuntimeImports) {
            if (text.includes(`from "${forbiddenImport}`) ||
                text.includes(`from '${forbiddenImport}`)) {
                importFailures.push(`${relative(repositoryRoot, file)} imports forbidden Phase 2 root '${forbiddenImport}'`);
            }
        }
    }
    assert.deepEqual(importFailures, []);
}
const serverImportFailures = [];
for (const file of await sourceFilesUnder(join(repositoryRoot, "src/server"))) {
    const text = await readFile(file, "utf8");
    for (const forbiddenImport of [
        "../material/",
        "../providers/",
        "../memory/",
        "../effects/",
        "../collection/",
        "../knowledge/",
    ]) {
        if (text.includes(`from "${forbiddenImport}`) ||
            text.includes(`from '${forbiddenImport}`)) {
            serverImportFailures.push(`${relative(repositoryRoot, file)} imports forbidden non-composition root '${forbiddenImport}'`);
        }
    }
}
assert.deepEqual(serverImportFailures, []);
const extensionImportFailures = [];
for (const file of await sourceFilesUnder(join(repositoryRoot, "src/extension"))) {
    const text = await readFile(file, "utf8");
    for (const forbiddenImport of [
        "../stage_interface/",
        "../../stage_interface/",
        "../stage_core/",
        "../../stage_core/",
        "../server/",
        "../../server/",
        "../music_data_platform/",
        "../../music_data_platform/",
        "../music_intelligence/",
        "../../music_intelligence/",
        "../music_experience/",
        "../../music_experience/",
        "../providers/",
        "../../providers/",
        "../storage/",
        "../../storage/",
        "../material/",
        "../../material/",
        "../collection/",
        "../../collection/",
        "../memory/",
        "../../memory/",
        "../effects/",
        "../../effects/",
        "../query/",
        "../../query/",
        "../materialization/",
        "../../materialization/",
        "../presentation/",
        "../../presentation/",
    ]) {
        if (text.includes(`from "${forbiddenImport}`) ||
            text.includes(`from '${forbiddenImport}`)) {
            extensionImportFailures.push(`${relative(repositoryRoot, file)} imports forbidden Extension root '${forbiddenImport}'`);
        }
    }
}
assert.deepEqual(extensionImportFailures, []);
const sourceProviderSlotText = await readFile(join(repositoryRoot, "src/extension/source_provider_slot.ts"), "utf8");
const sourceProviderSlotImportFailures = forbiddenImportHits(sourceProviderSlotText, [
    "./plugins/",
    "./plugins/ncm",
]);
assert.deepEqual(sourceProviderSlotImportFailures, [], "Source Provider Slot must not depend on a concrete provider plugin");
const ncmPluginText = await readFile(join(repositoryRoot, "src/extension/plugins/ncm.ts"), "utf8");
const ncmPluginImportFailures = forbiddenImportHits(ncmPluginText, [
    "../../stage_interface/",
    "../../music_data_platform/",
    "../../storage/",
    "../../query/",
    "../../materialization/",
    "../../presentation/",
]);
assert.deepEqual(ncmPluginImportFailures, [], "NCM plugin must stay inside Extension/provider mapping boundaries");
const extensionBarrelText = await readFile(join(repositoryRoot, "src/extension/index.ts"), "utf8");
assert.equal(extensionBarrelText.includes("searchSourceProvider"), false, "Extension public barrel must expose source-provider search through ExtensionRuntime only");
const stageInterfaceImportFailures = [];
for (const file of await sourceFilesUnder(join(repositoryRoot, "src/stage_interface"))) {
    const text = await readFile(file, "utf8");
    if (text.includes('from "../extension/') ||
        text.includes("from '../extension/") ||
        text.includes('from "../music_data_platform/') ||
        text.includes("from '../music_data_platform/")) {
        stageInterfaceImportFailures.push(`${relative(repositoryRoot, file)} imports forbidden implementation root`);
    }
}
assert.deepEqual(stageInterfaceImportFailures, []);
const musicDataPlatformImportFailures = [];
for (const file of await sourceFilesUnder(join(repositoryRoot, "src/music_data_platform"))) {
    const text = await readFile(file, "utf8");
    for (const forbiddenImport of [
        "../storage/sqlite/",
        "../stage_interface/",
        "../stage_core/",
        "../server/",
        "../extension/",
        "../providers/",
        "../material/",
        "../collection/",
        "../memory/",
        "../effects/",
    ]) {
        if (text.includes(`from "${forbiddenImport}`) ||
            text.includes(`from '${forbiddenImport}`)) {
            musicDataPlatformImportFailures.push(`${relative(repositoryRoot, file)} imports forbidden Music Data Platform dependency '${forbiddenImport}'`);
        }
    }
    for (const rawSqliteToken of ["Database" + "Sync", "node" + ":" + "sqlite"]) {
        if (!text.includes(rawSqliteToken)) {
            continue;
        }
        musicDataPlatformImportFailures.push(`${relative(repositoryRoot, file)} mentions raw SQLite primitives`);
    }
}
assert.deepEqual(musicDataPlatformImportFailures, []);
async function pathExists(path) {
    try {
        await stat(path);
        return true;
    }
    catch {
        return false;
    }
}
async function sourceFilesUnder(root) {
    const entry = await stat(root);
    if (entry.isFile()) {
        return root.endsWith(".ts") ? [root] : [];
    }
    const files = [];
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
function forbiddenImportHits(text, forbiddenImports) {
    const failures = [];
    for (const forbiddenImport of forbiddenImports) {
        if (text.includes(`from "${forbiddenImport}`) ||
            text.includes(`from '${forbiddenImport}`)) {
            failures.push(forbiddenImport);
        }
    }
    return failures;
}
