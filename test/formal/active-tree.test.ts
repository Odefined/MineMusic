import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
const trackedArtifactFailures = gitTrackedFiles().filter((file) => {
    const pathParts = file.split("/");
    return pathParts.some((part) => part.startsWith(".tmp")) ||
        file.endsWith(".tsbuildinfo") ||
        file.endsWith(".js") ||
        file.endsWith(".d.ts") ||
        file.endsWith(".js.map");
});
assert.deepEqual(trackedArtifactFailures, [], "tracked build artifacts must not enter the active repository tree");
for (const root of removedRuntimeRoots) {
    assert.equal(await pathExists(join(repositoryRoot, root)), false, `pre-formal runtime root must not remain active: ${root}`);
}
assert.equal(await pathExists(join(repositoryRoot, "src/extension")), true, "formal Extension root must exist in active source after Phase 3");
assert.equal(await pathExists(join(repositoryRoot, "src/storage")), true, "formal Storage root must exist in active source after Phase 4");
assert.equal(await pathExists(join(repositoryRoot, "src/music_data_platform")), true, "formal Music Data Platform root must exist in active source after Phase 5");
assert.equal(await pathExists(join(repositoryRoot, "src/music_intelligence")), true, "formal Music Intelligence root must exist in active source after Phase 12C");
assert.equal(await pathExists(join(repositoryRoot, "src/music_experience")), true, "formal Music Experience root must exist once music.experience.present lands");
assert.equal(await pathExists(join(repositoryRoot, "src/effect_boundary")), true, "formal Effect Boundary root must exist once StageToolExecutionGate implementation lands");
assert.equal(await pathExists(join(repositoryRoot, "src/background_work")), true, "formal Background Work runtime infrastructure root must exist once Phase 21 queue backend lands");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/background_work")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/background_work/backend.ts",
    "src/background_work/index.ts",
    "src/background_work/pg_boss_backend.ts",
], "formal Background Work root must stay focused on the MineMusic port and concrete backend adapter");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/storage")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/storage/database.ts",
    "src/storage/index.ts",
    "src/storage/postgres/database.ts",
    "src/storage/postgres/schema.ts",
], "formal Storage root must not grow unrelated storage implementations");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/server")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/server/config.ts",
    "src/server/host.ts",
    "src/server/index.ts",
    "src/server/library_catalog_runtime_module.ts",
    "src/server/library_collection_runtime_module.ts",
    "src/server/library_import_runtime_module.ts",
    "src/server/library_relation_runtime_module.ts",
    "src/server/local_source_scan_config.ts",
    "src/server/local_source_scan_filesystem_adapter.ts",
    "src/server/mcp_stdio_entrypoint.ts",
    "src/server/music_data_platform_runtime_module.ts",
    "src/server/music_experience_runtime_module.ts",
    "src/server/retrieval_provider_search_adapter.ts",
    "src/server/stage_tool_context_assembly.ts",
    "src/server/transports/mcp_framing.ts",
    "src/server/transports/mcp_rendering.ts",
    "src/server/transports/mcp_stdio_driver.ts",
    "src/server/transports/mcp_translation.ts",
], "formal Server Host root must stay inside the Phase 13 runtime-orchestration boundary");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/effect_boundary")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/effect_boundary/index.ts",
    "src/effect_boundary/stage_tool_execution_gate.ts",
], "formal Effect Boundary root must stay focused on StageToolExecutionGate policy/audit seams");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/music_data_platform")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/music_data_platform/audio_technical_metadata.ts",
    "src/music_data_platform/candidate_commit_command.ts",
    "src/music_data_platform/collection_commands.ts",
    "src/music_data_platform/collection_records.ts",
    "src/music_data_platform/collection_ref.ts",
    "src/music_data_platform/collection_schema.ts",
    "src/music_data_platform/collection_service.ts",
    "src/music_data_platform/download_commands.ts",
    "src/music_data_platform/download_file_writer.ts",
    "src/music_data_platform/download_records.ts",
    "src/music_data_platform/download_schema.ts",
    "src/music_data_platform/download_to_file.ts",
    "src/music_data_platform/errors.ts",
    "src/music_data_platform/identity_read_model.ts",
    "src/music_data_platform/identity_records.ts",
    "src/music_data_platform/identity_schema.ts",
    "src/music_data_platform/identity_write_model.ts",
    "src/music_data_platform/index.ts",
    "src/music_data_platform/library_catalog_read.ts",
    "src/music_data_platform/library_import_commands.ts",
    "src/music_data_platform/library_import_job.ts",
    "src/music_data_platform/local_source_commands.ts",
    "src/music_data_platform/local_source_path.ts",
    "src/music_data_platform/local_source_ref.ts",
    "src/music_data_platform/local_source_scan_advance_commands.ts",
    "src/music_data_platform/local_source_scan_commands.ts",
    "src/music_data_platform/local_source_scan_filesystem_port.ts",
    "src/music_data_platform/local_source_scan_job.ts",
    "src/music_data_platform/local_source_scan_policy.ts",
    "src/music_data_platform/local_source_scan_read_model.ts",
    "src/music_data_platform/local_source_scan_records.ts",
    "src/music_data_platform/local_source_scan_schema.ts",
    "src/music_data_platform/local_source_scan_service.ts",
    "src/music_data_platform/local_source_scan_state.ts",
    "src/music_data_platform/local_source_scan_write_commands.ts",
    "src/music_data_platform/localize_provider_source_commands.ts",
    "src/music_data_platform/localize_provider_source_job.ts",
    "src/music_data_platform/material_candidate_ref.ts",
    "src/music_data_platform/material_projection.ts",
    "src/music_data_platform/material_records_read.ts",
    "src/music_data_platform/material_ref.ts",
    "src/music_data_platform/material_ref_factory.ts",
    "src/music_data_platform/metadata_lookup_normalization.ts",
    "src/music_data_platform/metadata_lookup_search_workspace.ts",
    "src/music_data_platform/owner_catalog_projection.ts",
    "src/music_data_platform/owner_catalog_records.ts",
    "src/music_data_platform/owner_catalog_schema.ts",
    "src/music_data_platform/owner_material_relation_commands.ts",
    "src/music_data_platform/owner_material_relation_records.ts",
    "src/music_data_platform/owner_material_relation_ref.ts",
    "src/music_data_platform/owner_material_relation_schema.ts",
    "src/music_data_platform/owner_material_relation_service.ts",
    "src/music_data_platform/owner_scope.ts",
    "src/music_data_platform/projection_maintenance_commands.ts",
    "src/music_data_platform/projection_maintenance_dispatcher.ts",
    "src/music_data_platform/projection_maintenance_job.ts",
    "src/music_data_platform/projection_maintenance_records.ts",
    "src/music_data_platform/projection_maintenance_runner.ts",
    "src/music_data_platform/projection_maintenance_schema.ts",
    "src/music_data_platform/ref_digest.ts",
    "src/music_data_platform/ref_validation.ts",
    "src/music_data_platform/retrieval_result_set_records.ts",
    "src/music_data_platform/retrieval_result_set_schema.ts",
    "src/music_data_platform/retrieval_shared.ts",
    "src/music_data_platform/search_metadata_document_builder.ts",
    "src/music_data_platform/search_metadata_normalization.ts",
    "src/music_data_platform/search_metadata_projection_commands.ts",
    "src/music_data_platform/search_metadata_projection_records.ts",
    "src/music_data_platform/search_metadata_projection_schema.ts",
    "src/music_data_platform/search_result_set_schema.ts",
    "src/music_data_platform/source_library_commands.ts",
    "src/music_data_platform/source_library_import.ts",
    "src/music_data_platform/source_library_read_model.ts",
    "src/music_data_platform/source_library_records.ts",
    "src/music_data_platform/source_library_ref.ts",
    "src/music_data_platform/source_library_schema.ts",
    "src/music_data_platform/source_of_truth_write_commands.ts",
    "src/music_data_platform/stage_adapter/catalog.ts",
    "src/music_data_platform/stage_adapter/collection_edit.ts",
    "src/music_data_platform/stage_adapter/collection_scope.ts",
    "src/music_data_platform/stage_adapter/import_control.ts",
    "src/music_data_platform/stage_adapter/index.ts",
    "src/music_data_platform/stage_adapter/library_handle_resolution.ts",
    "src/music_data_platform/stage_adapter/list_sources.ts",
    "src/music_data_platform/stage_adapter/relation_edit.ts",
    "src/music_data_platform/stage_adapter/source_library_scope.ts",
    "src/music_data_platform/timestamp_validation.ts",
], "formal Music Data Platform root must not grow unrelated implementations");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/music_intelligence")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/music_intelligence/core/retrieval/contracts.ts",
    "src/music_intelligence/core/retrieval/cursor.ts",
    "src/music_intelligence/core/retrieval/index.ts",
    "src/music_intelligence/core/retrieval/query_normalization.ts",
    "src/music_intelligence/core/search/index.ts",
    "src/music_intelligence/core/search/metadata_lookup_retrieval_adapter.ts",
    "src/music_intelligence/errors.ts",
    "src/music_intelligence/index.ts",
    "src/music_intelligence/stage_adapter/discovery_list_scopes.ts",
    "src/music_intelligence/stage_adapter/discovery_lookup.ts",
    "src/music_intelligence/stage_adapter/index.ts",
    "src/music_intelligence/stage_adapter/scope_availability.ts",
], "formal Music Intelligence root must keep Retrieval core separate from Stage Interface adapters");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/music_experience")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/music_experience/stage_adapter/index.ts",
    "src/music_experience/stage_adapter/present.ts",
], "formal Music Experience root must stay inside the Phase 17C presentation adapter boundary");
// ADR-0013: contracts DAG guard (Phase 2).
// The contracts barrel is deleted; symbols are imported from the per-area
// files behind a shared leaf kernel. This guard machine-checks the
// one-directional DAG.
// Three import forms, in order: `from "spec"` clauses (covers type, value,
// and namespace imports), dynamic `import("spec")` calls, and bare side-effect
// `import "spec"` statements. All three are relative-edge vectors the DAG
// guard must see; the side-effect form has no `from` keyword and would slip a
// forbidden edge past a `from`-only regex.
const contractsImportSpecifierPattern = /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']/gu;
const contractsDagAllowlist: Readonly<Record<string, readonly string[]>> = {
    "src/contracts/kernel.ts": [],
    "src/contracts/music_data_platform.ts": ["./kernel.js"],
    "src/contracts/storage.ts": ["./kernel.js", "./music_data_platform.js"],
    "src/contracts/public_music_description.ts": ["./music_data_platform.js", "./stage_interface.js"],
    "src/contracts/stage_interface.ts": ["./kernel.js"],
    "src/contracts/stage_core.ts": ["./kernel.js", "./stage_interface.js"],
    "src/contracts/generated/stage_interface_schemas.ts": ["../stage_interface.js"],
};
const contractsDagFailures: string[] = [];
for (const [contractFile, allowed] of Object.entries(contractsDagAllowlist)) {
    const text = await readFile(join(repositoryRoot, contractFile), "utf8");
    const relativeSpecifiers: string[] = [];
    for (const match of text.matchAll(contractsImportSpecifierPattern)) {
        const specifier = match[1] ?? match[2] ?? match[3];
        if (typeof specifier === "string" && specifier.startsWith(".")) {
            relativeSpecifiers.push(specifier);
        }
    }
    for (const specifier of relativeSpecifiers) {
        if (!allowed.includes(specifier)) {
            contractsDagFailures.push(`${contractFile} imports forbidden contract specifier '${specifier}'`);
        }
    }
}
assert.deepEqual(contractsDagFailures, [], "contracts files must follow the one-directional DAG (kernel leaf; storage/stage_core read downward; no reverse edges)");
async function pathExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    }
    catch {
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
function gitTrackedFiles(): string[] {
    return execFileSync("git", ["ls-files"], {
        cwd: repositoryRoot,
        encoding: "utf8",
    }).split(/\r?\n/).filter(Boolean);
}
