import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { buildArchitectureImportGraph, isUnderPath, type ArchitectureImportEdge } from "./helpers/architecture-import-graph.js";
const repositoryRoot = process.cwd();
const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
};
const packageLock = JSON.parse(await readFile(join(repositoryRoot, "package-lock.json"), "utf8")) as {
    packages?: Record<string, { version?: string; dependencies?: Record<string, string> }>;
};
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
assert.equal(await pathExists(join(repositoryRoot, "src/agent_runtime")), true, "formal Agent Runtime root must exist once Phase A1a pi spine lands");
assert.equal(await pathExists(join(repositoryRoot, "src/workbench_interface")), true, "formal Workbench Interface root must exist for workspace interaction-state contracts");
const piAgentCoreVersion = packageJson.dependencies?.["@earendil-works/pi-agent-core"];
assert.equal(typeof piAgentCoreVersion, "string", "pi-agent-core must be a direct dependency while Agent Runtime uses pi");
assert.match(piAgentCoreVersion ?? "", /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, "pi-agent-core must be exact-pinned, not a semver range");
assert.equal(packageLock.packages?.[""]?.dependencies?.["@earendil-works/pi-agent-core"], piAgentCoreVersion, "package-lock root dependency must match package.json pi pin");
assert.equal(packageLock.packages?.["node_modules/@earendil-works/pi-agent-core"]?.version, piAgentCoreVersion, "package-lock installed pi version must match package.json pi pin");
assert.equal(await pathExists(join(repositoryRoot, `docs/formal-rebuild/pi-agent-core-capability-audit-${piAgentCoreVersion}.md`)), true, "each pi-agent-core pin must have a same-version capability audit doc");
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
    "src/server/agent_runtime_radio_module.ts",
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
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/agent_runtime")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/agent_runtime/actor_definition.ts",
    "src/agent_runtime/actor_runtime_session.ts",
    "src/agent_runtime/agent_background_refill_trigger.ts",
    "src/agent_runtime/agent_harness.ts",
    "src/agent_runtime/agent_message_helpers.ts",
    "src/agent_runtime/agent_run_cascade.ts",
    "src/agent_runtime/agent_transcript_store.ts",
    "src/agent_runtime/agent_user_turn_trigger.ts",
    "src/agent_runtime/command_basis_tracker.ts",
    "src/agent_runtime/index.ts",
    "src/agent_runtime/main_radio_channel.ts",
    "src/agent_runtime/pi_engine.ts",
    "src/agent_runtime/radio_run_finish_tool.ts",
    "src/agent_runtime/radio_run_result_recorder.ts",
    "src/agent_runtime/radio_session_tools.ts",
    "src/agent_runtime/radio_supervisor.ts",
    "src/agent_runtime/schema.ts",
    "src/agent_runtime/speech_level.ts",
    "src/agent_runtime/stage_tool_bridge.ts",
    "src/agent_runtime/workspace_context_assembler.ts",
    "src/agent_runtime/workspace_context_diff.ts",
    "src/agent_runtime/workspace_context_encoder.ts",
], "formal Agent Runtime root must stay focused on actor definitions, shared ActorRuntimeSession, shared Workspace Context assembly, the pi engine facade, Stage tool bridge, and Phase B trigger/runtime substrate");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/workbench_interface")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/workbench_interface/index.ts",
], "formal Workbench Interface root must stay focused on Workbench-owned workspace interaction-state contracts");
assert.deepEqual((await sourceFilesUnder(join(repositoryRoot, "src/music_experience")))
    .map((file) => relative(repositoryRoot, file))
    .sort(), [
    "src/music_experience/commands.ts",
    "src/music_experience/index.ts",
    "src/music_experience/read_model.ts",
    "src/music_experience/records.ts",
    "src/music_experience/schema.ts",
    "src/music_experience/stage_adapter/durable_item_resolution.ts",
    "src/music_experience/stage_adapter/index.ts",
    "src/music_experience/stage_adapter/present.ts",
    "src/music_experience/stage_adapter/queue_playback.ts",
    "src/music_experience/stage_adapter/radio_truth.ts",
], "formal Music Experience root must stay inside the owned command/read projection and Stage adapter boundary");
assert.deepEqual(await sourceFilesContaining(
    await sourceFilesUnder(join(repositoryRoot, "src")),
    /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+music_experience_/u,
), [
    "src/music_experience/records.ts",
    "src/music_experience/schema.ts",
], "Music Experience queue/playback table writes must stay behind the records repository called by the owning command, except schema-owned migrations/backfills");
const architectureGraph = await buildArchitectureImportGraph(repositoryRoot, await sourceFilesUnder(join(repositoryRoot, "src")));
assert.deepEqual(architectureGraph.unresolvedRelativeSpecifiers.map(formatEdge).sort(), [], "source-relative imports must resolve to active source files");
// ADR-0013: contracts DAG guard (Phase 2).
// The contracts barrel is deleted; symbols are imported from the per-area
// files behind a shared leaf kernel. This guard machine-checks the
// one-directional DAG.
const contractsDagAllowlist: Readonly<Record<string, readonly string[]>> = {
    "src/contracts/kernel.ts": [],
    "src/contracts/agent_runtime.ts": ["./kernel.js", "./music_experience.js"],
    "src/contracts/music_experience.ts": ["./kernel.js"],
    "src/contracts/music_data_platform.ts": ["./kernel.js"],
    "src/contracts/storage.ts": ["./kernel.js", "./music_data_platform.js"],
    "src/contracts/public_music_description.ts": ["./music_data_platform.js", "./stage_interface.js"],
    "src/contracts/stage_interface.ts": ["./kernel.js"],
    "src/contracts/stage_core.ts": ["./kernel.js", "./stage_interface.js"],
    "src/contracts/workbench_interface.ts": [],
    "src/contracts/generated/stage_interface_schemas.ts": ["../stage_interface.js"],
};
const musicIntelligenceAllowedMusicDataPlatformBarrelImports = new Set([
    "MetadataLookupSearchCursorPosition",
    "MixedRetrievalCursorPosition",
    "MusicDataPlatformMetadataLookupMaterialCandidateRow",
    "MusicDataPlatformMetadataLookupMaterialRow",
    "MusicDataPlatformMetadataLookupSearchInput",
    "MusicDataPlatformMetadataLookupSearchPage",
    "MusicDataPlatformMetadataLookupSearchRow",
    "MusicDataPlatformMetadataLookupSearchWorkspace",
    "MusicDataPlatformRetrievalSearchInput",
    "RetrievalFreshness",
    "RetrievalMatchedTextTokenEvidence",
    "RetrievalOrder",
    "RetrievalReadCursorPosition",
    "RetrievalTextField",
    "createMusicDataPlatformMetadataLookupSearchWorkspace",
]);
const serverRuntimeModuleForbiddenSchemaImports = new Set([
    "musicDataPlatformSchemas",
    "musicDataPlatformIdentitySchema",
    "musicDataPlatformSourceLibrarySchema",
    "musicDataPlatformOwnerCatalogEntriesSchema",
    "musicDataPlatformOwnerCatalogViewSchema",
    "musicDataPlatformOwnerRelationSchema",
    "musicDataPlatformCollectionSchema",
    "musicDataPlatformSearchMetadataProjectionSchema",
    "musicDataPlatformProjectionMaintenanceSchema",
    "musicDataPlatformLocalSourceScanSchema",
    "musicDataPlatformRetrievalResultSetSchema",
    "musicDataPlatformSearchResultSetSchema",
    "musicDataPlatformDownloadSchema",
    "musicExperienceSchemas",
    "musicExperienceQueuePlaybackSchema",
    "stageInterfaceSchemas",
    "stageInterfaceHandleRegistrySchema",
    "stageInterfaceLookupCursorRegistrySchema",
]);
const agentRuntimeAllowedStageInterfacePureHelpers = new Set([
    "src/stage_interface/provider_safe_tool_name.ts",
    "src/stage_interface/tool_description_rendering.ts",
    "src/stage_interface/tool_failure_surface.ts",
    "src/stage_interface/tool_public_text.ts",
]);
const agentRuntimeForbiddenRootPiImports = new Set([
    "AgentHarness",
    "AgentHarnessError",
    "JsonlSessionRepository",
    "MemorySessionRepository",
]);
const actorExecutionOwner = "src/agent_runtime/actor_runtime_session.ts";
const actorExecutionInternals = new Set([
    "src/agent_runtime/agent_harness.ts",
    "src/agent_runtime/pi_engine.ts",
]);
const actorTriggerFiles = new Set([
    "src/agent_runtime/agent_background_refill_trigger.ts",
    "src/agent_runtime/agent_user_turn_trigger.ts",
]);
const actorTriggerForbiddenInternals = new Set([
    ...actorExecutionInternals,
    "src/agent_runtime/agent_transcript_store.ts",
    "src/agent_runtime/stage_tool_bridge.ts",
]);
const actorExecutionOwnershipFailures: string[] = [];
for (const edge of architectureGraph.edges) {
    if (edge.toFile !== undefined && actorExecutionInternals.has(edge.toFile) && edge.fromFile !== actorExecutionOwner && !edge.isTypeOnly) {
        actorExecutionOwnershipFailures.push(`Only ActorRuntimeSession may import actor execution internals: ${formatEdge(edge)}`);
    }
    if (actorTriggerFiles.has(edge.fromFile) && edge.toFile !== undefined && actorTriggerForbiddenInternals.has(edge.toFile)) {
        actorExecutionOwnershipFailures.push(`Actor triggers must call ActorRuntimeSession instead of importing execution internals: ${formatEdge(edge)}`);
    }
}
const triggersUsingSharedSession = new Set(
    architectureGraph.edges
        .filter((edge) => actorTriggerFiles.has(edge.fromFile) && edge.toFile === actorExecutionOwner)
        .map((edge) => edge.fromFile),
);
for (const triggerFile of actorTriggerFiles) {
    if (!triggersUsingSharedSession.has(triggerFile)) {
        actorExecutionOwnershipFailures.push(`Actor trigger does not import the shared ActorRuntimeSession: ${triggerFile}`);
    }
}
assert.deepEqual(actorExecutionOwnershipFailures.sort(), [], "Main and Radio triggers must share one ActorRuntimeSession execution owner");
const contractsDagFailures: string[] = [];
for (const [contractFile, allowed] of Object.entries(contractsDagAllowlist)) {
    for (const edge of architectureGraph.edges.filter((candidate) => candidate.fromFile === contractFile && candidate.specifier.startsWith("."))) {
        if (!allowed.includes(edge.specifier)) {
            contractsDagFailures.push(`${contractFile} imports forbidden contract specifier '${edge.specifier}'`);
        }
    }
}
assert.deepEqual(contractsDagFailures, [], "contracts files must follow the one-directional DAG (kernel leaf; storage/stage_core read downward; no reverse edges)");
const sourceBoundaryFailures = architectureGraph.edges.flatMap((edge) => {
    const failure = sourceBoundaryFailure(edge);
    return failure === undefined ? [] : [failure];
}).sort();
assert.deepEqual(sourceBoundaryFailures, [], "source imports must follow owner-area and stage_adapter boundaries");
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
async function sourceFilesContaining(files: readonly string[], pattern: RegExp): Promise<string[]> {
    const matches: string[] = [];
    for (const file of files) {
        const text = await readFile(file, "utf8");
        if (pattern.test(text)) {
            matches.push(relative(repositoryRoot, file));
        }
    }
    return matches.sort();
}
function gitTrackedFiles(): string[] {
    return execFileSync("git", ["ls-files"], {
        cwd: repositoryRoot,
        encoding: "utf8",
    }).split(/\r?\n/).filter(Boolean);
}
function sourceBoundaryFailure(edge: ArchitectureImportEdge): string | undefined {
    const externalFailure = externalPackageBoundaryFailure(edge);
    if (externalFailure !== undefined) {
        return externalFailure;
    }
    if (edge.toFile === undefined) {
        return undefined;
    }
    if (edge.toFile === "src/agent_runtime/pi_engine.ts" && edge.fromArea !== "agent_runtime") {
        return `Only Agent Runtime internals may import the raw pi adapter factory: ${formatEdge(edge)}`;
    }
    if (edge.fromArea === "server") {
        return serverBoundaryFailure(edge);
    }
    if (edge.fromArea === "music_data_platform") {
        return musicDataPlatformBoundaryFailure(edge);
    }
    if (edge.fromArea === "music_intelligence") {
        return musicIntelligenceBoundaryFailure(edge);
    }
    if (edge.fromArea === "music_experience") {
        return musicExperienceBoundaryFailure(edge);
    }
    if (edge.fromArea === "agent_runtime") {
        return agentRuntimeBoundaryFailure(edge);
    }
    if (edge.fromArea === "workbench_interface") {
        return workbenchInterfaceBoundaryFailure(edge);
    }
    return undefined;
}
function externalPackageBoundaryFailure(edge: ArchitectureImportEdge): string | undefined {
    if (edge.specifier === "pg" && !isUnderPath(edge.fromFile, "src/storage/postgres")) {
        return `Only the Storage Postgres adapter may import pg directly: ${formatEdge(edge)}`;
    }
    if (edge.specifier === "pg-boss" && edge.fromFile !== "src/background_work/pg_boss_backend.ts") {
        return `Only the Background Work pg-boss adapter may import pg-boss directly: ${formatEdge(edge)}`;
    }
    if (edge.specifier.startsWith("@earendil-works/pi-agent-core/dist/harness/") && !isPiHarnessImportAllowed(edge.fromFile)) {
        return `Raw pi harness helper imports are limited to Agent Runtime transcript facades and adapter tests: ${formatEdge(edge)}`;
    }
    if (edge.specifier === "@earendil-works/pi-agent-core") {
        if (!isUnderPath(edge.fromFile, "src/agent_runtime")) {
            return `Only Agent Runtime may import pi-agent-core directly: ${formatEdge(edge)}`;
        }
        const forbiddenRootImports = edge.importedNames.filter((name) => agentRuntimeForbiddenRootPiImports.has(name));
        if (forbiddenRootImports.length > 0) {
            return `Agent Runtime must use low-level pi Agent APIs, not root-exported harness/session helpers: ${formatEdge(edge)} symbols=[${forbiddenRootImports.join(", ")}]`;
        }
    }
    return undefined;
}
function isPiHarnessImportAllowed(file: string): boolean {
    return file.startsWith("src/agent_runtime/agent_transcript_store") ||
        file.startsWith("test/formal/agent-runtime-") ||
        file === "test/formal/radio-endurance.test.ts";
}
function serverBoundaryFailure(edge: ArchitectureImportEdge): string | undefined {
    if (edge.toArea === "storage" && (isUnderPath(edge.toFile, "src/storage/postgres") || edge.importedNames.includes("PostgresMusicDatabase") || edge.importedNames.includes("*"))) {
        return `Server Host must create music databases through the Storage lifecycle factory, not the concrete Postgres adapter: ${formatEdge(edge)} symbols=[${edge.importedNames.join(", ")}]`;
    }
    if (isServerRuntimeModuleFile(edge.fromFile)) {
        if (edge.toArea !== undefined && ["music_data_platform", "music_experience", "stage_interface"].includes(edge.toArea) && (edge.importedNames.includes("*") || edge.importedNames.length === 0)) {
            return `Server runtime modules must use named imports from area barrels so schema ownership guards cannot be bypassed: ${formatEdge(edge)} symbols=[${edge.importedNames.join(", ")}]`;
        }
        const schemaImports = edge.importedNames.filter((name) => serverRuntimeModuleForbiddenSchemaImports.has(name));
        if (schemaImports.length > 0) {
            return `Server runtime modules must not import area-owned schema symbols; Server Host composes schema arrays: ${formatEdge(edge)} symbols=[${schemaImports.join(", ")}]`;
        }
    }
    return undefined;
}
function musicDataPlatformBoundaryFailure(edge: ArchitectureImportEdge): string | undefined {
    if (isStageAdapterPublicProjectionImport(edge, "music_data_platform")) {
        return undefined;
    }
    if (edge.toArea === "stage_interface" || edge.toFile === "src/contracts/stage_interface.ts" || edge.toFile === "src/contracts/public_music_description.ts" || isUnderPath(edge.toFile, "src/contracts/generated")) {
        return `Music Data Platform non-adapter modules must not import Stage Interface or public presentation helpers: ${formatEdge(edge)}`;
    }
    if (edge.toArea === "stage_core" || edge.toArea === "server" || edge.toArea === "effect_boundary" || edge.toArea === "music_intelligence" || edge.toArea === "music_experience" || edge.toArea === "extension") {
        return `Music Data Platform non-adapter modules must not import ${edge.toArea}: ${formatEdge(edge)}`;
    }
    if (isUnderPath(edge.toFile, "src/storage/postgres")) {
        return `Music Data Platform must not import concrete storage adapter internals: ${formatEdge(edge)}`;
    }
    return undefined;
}
function agentRuntimeBoundaryFailure(edge: ArchitectureImportEdge): string | undefined {
    if (edge.fromFile === "src/agent_runtime/radio_supervisor.ts" && edge.toFile === "src/background_work/index.ts") {
        const allowedNames = new Set([
            "BackgroundWorkAwaitTerminalInput",
            "BackgroundWorkSubmitInput",
            "BackgroundWorkSubmitResult",
            "BackgroundWorkTerminalState",
            "RegisterBackgroundWorkHandlerInput",
        ]);
        const forbiddenNames = edge.importedNames.filter((name) => !allowedNames.has(name));
        return forbiddenNames.length === 0 && edge.importedNames.length > 0
            ? undefined
            : `Agent Runtime may import only the narrow Background Work terminal-observation port types for Radio supervisor: ${formatEdge(edge)} symbols=[${edge.importedNames.join(", ")}]`;
    }
    if (edge.toArea === "storage") {
        const storageTypeOnlyFiles = new Set([
            "src/agent_runtime/index.ts",
            "src/agent_runtime/agent_transcript_store.ts",
            "src/agent_runtime/schema.ts",
        ]);
        if (storageTypeOnlyFiles.has(edge.fromFile) && (
            edge.toFile === "src/storage/index.ts" ||
            edge.toFile === "src/storage/database.ts"
        )) {
            return undefined;
        }
    }
    if (edge.toArea === "stage_interface") {
        return agentRuntimeAllowedStageInterfacePureHelpers.has(edge.toFile ?? "")
            ? undefined
            : `Agent Runtime may import only Stage Interface public pure helper modules, not arbitrary Stage Interface internals: ${formatEdge(edge)}`;
    }
    if (edge.toArea === "workbench_interface") {
        return `Agent Runtime must read Workbench-owned interaction-state facts through explicit contracts/ports, not import the Workbench composition root: ${formatEdge(edge)}`;
    }
    if (edge.toArea === "server" || edge.toArea === "stage_core" || edge.toArea === "music_data_platform" || edge.toArea === "music_intelligence" || edge.toArea === "music_experience" || edge.toArea === "extension" || edge.toArea === "storage" || edge.toArea === "background_work" || edge.toArea === "effect_boundary") {
        return `Agent Runtime must not import ${edge.toArea}; compose Stage tools through injected descriptors, context factory, and dispatch ports: ${formatEdge(edge)}`;
    }
    return undefined;
}
function workbenchInterfaceBoundaryFailure(edge: ArchitectureImportEdge): string | undefined {
    if (edge.toArea === "server" || edge.toArea === "stage_core" || edge.toArea === "stage_interface" || edge.toArea === "agent_runtime" || edge.toArea === "music_data_platform" || edge.toArea === "music_intelligence" || edge.toArea === "music_experience" || edge.toArea === "extension" || edge.toArea === "storage" || edge.toArea === "background_work" || edge.toArea === "effect_boundary" || edge.toArea === "memory") {
        return `Workbench Interface must expose its own workspace interaction-state contracts without importing ${edge.toArea}: ${formatEdge(edge)}`;
    }
    return undefined;
}
function musicIntelligenceBoundaryFailure(edge: ArchitectureImportEdge): string | undefined {
    if (isStageAdapterPublicProjectionImport(edge, "music_intelligence")) {
        return undefined;
    }
    if (edge.toArea === "stage_interface" || edge.toFile === "src/contracts/stage_interface.ts" || edge.toFile === "src/contracts/public_music_description.ts" || isUnderPath(edge.toFile, "src/contracts/generated")) {
        return `Music Intelligence core/non-adapter modules must not import Stage Interface or public presentation helpers: ${formatEdge(edge)}`;
    }
    if (edge.toArea === "stage_core" || edge.toArea === "server" || edge.toArea === "effect_boundary" || edge.toArea === "music_experience" || edge.toArea === "extension" || edge.toArea === "storage") {
        return `Music Intelligence core/non-adapter modules must not import ${edge.toArea}: ${formatEdge(edge)}`;
    }
    if (edge.toArea === "music_data_platform" && edge.toFile !== "src/music_data_platform/index.ts") {
        return `Music Intelligence may import only the Music Data Platform public metadata lookup workspace barrel: ${formatEdge(edge)}`;
    }
    if (edge.toFile === "src/music_data_platform/index.ts") {
        const forbiddenNames = edge.importedNames.filter((name) => !musicIntelligenceAllowedMusicDataPlatformBarrelImports.has(name));
        if (forbiddenNames.length > 0 || edge.importedNames.length === 0) {
            return `Music Intelligence may import only metadata lookup/retrieval contract symbols from the Music Data Platform barrel: ${formatEdge(edge)} symbols=[${edge.importedNames.join(", ")}]`;
        }
    }
    return undefined;
}
function musicExperienceBoundaryFailure(edge: ArchitectureImportEdge): string | undefined {
    if (isStageAdapterPublicProjectionImport(edge, "music_experience")) {
        return undefined;
    }
    if (edge.toArea === "stage_interface" || edge.toFile === "src/contracts/stage_interface.ts" || edge.toFile === "src/contracts/public_music_description.ts" || isUnderPath(edge.toFile, "src/contracts/generated")) {
        return `Music Experience non-adapter modules must not import Stage Interface or public presentation helpers: ${formatEdge(edge)}`;
    }
    if (edge.toArea === "stage_core" || edge.toArea === "server" || edge.toArea === "effect_boundary" || edge.toArea === "music_intelligence" || edge.toArea === "extension") {
        return `Music Experience non-adapter modules must not import ${edge.toArea}: ${formatEdge(edge)}`;
    }
    if (edge.toArea === "music_data_platform" && edge.toFile !== "src/music_data_platform/index.ts") {
        return `Music Experience may import Music Data Platform only through its public barrel: ${formatEdge(edge)}`;
    }
    return undefined;
}
function isStageAdapterPublicProjectionImport(edge: ArchitectureImportEdge, area: string): boolean {
    return isUnderPath(edge.fromFile, `src/${area}/stage_adapter`) &&
        (edge.toArea === "stage_interface" ||
            edge.toArea === "stage_core" ||
            edge.toFile === "src/contracts/stage_interface.ts" ||
            edge.toFile === "src/contracts/public_music_description.ts" ||
            isUnderPath(edge.toFile, "src/contracts/generated"));
}
function isServerRuntimeModuleFile(file: string): boolean {
    return /^src\/server\/(?:.+\/)?[a-z0-9_]+_runtime_module\.ts$/u.test(file);
}
function formatEdge(edge: ArchitectureImportEdge): string {
    return `${edge.fromFile} imports ${edge.specifier}${edge.toFile === undefined ? "" : ` resolved to ${edge.toFile}`}`;
}
