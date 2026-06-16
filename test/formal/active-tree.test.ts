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

const trackedArtifactFailures = gitTrackedFiles().filter((file) => {
  const pathParts = file.split("/");

  return pathParts.some((part) => part.startsWith(".tmp")) ||
    file.endsWith(".tsbuildinfo") ||
    file.endsWith(".js") ||
    file.endsWith(".d.ts") ||
    file.endsWith(".js.map");
});
assert.deepEqual(
  trackedArtifactFailures,
  [],
  "tracked build artifacts must not enter the active repository tree",
);

for (const root of removedRuntimeRoots) {
  assert.equal(
    await pathExists(join(repositoryRoot, root)),
    false,
    `pre-formal runtime root must not remain active: ${root}`,
  );
}

assert.equal(
  await pathExists(join(repositoryRoot, "src/extension")),
  true,
  "formal Extension root must exist in active source after Phase 3",
);
assert.equal(
  await pathExists(join(repositoryRoot, "src/storage")),
  true,
  "formal Storage root must exist in active source after Phase 4",
);
assert.equal(
  await pathExists(join(repositoryRoot, "src/music_data_platform")),
  true,
  "formal Music Data Platform root must exist in active source after Phase 5",
);
assert.equal(
  await pathExists(join(repositoryRoot, "src/music_intelligence")),
  true,
  "formal Music Intelligence root must exist in active source after Phase 12C",
);
assert.equal(
  await pathExists(join(repositoryRoot, "src/effect_boundary")),
  true,
  "formal Effect Boundary root must exist once StageToolExecutionGate implementation lands",
);

assert.deepEqual(
  (await sourceFilesUnder(join(repositoryRoot, "src/storage")))
    .map((file) => relative(repositoryRoot, file))
    .sort(),
  [
    "src/storage/database.ts",
    "src/storage/index.ts",
    "src/storage/sqlite/database.ts",
    "src/storage/sqlite/schema.ts",
  ],
  "Phase 4 formal Storage root must not grow unrelated storage implementations",
);

assert.deepEqual(
  (await sourceFilesUnder(join(repositoryRoot, "src/server")))
    .map((file) => relative(repositoryRoot, file))
    .sort(),
  [
    "src/server/config.ts",
    "src/server/host.ts",
    "src/server/index.ts",
    "src/server/music_data_platform_runtime_module.ts",
    "src/server/projection_maintenance_scheduler.ts",
    "src/server/retrieval_provider_search_adapter.ts",
  ],
  "formal Server Host root must stay inside the Phase 13 runtime-orchestration boundary",
);

assert.deepEqual(
  (await sourceFilesUnder(join(repositoryRoot, "src/effect_boundary")))
    .map((file) => relative(repositoryRoot, file))
    .sort(),
  [
    "src/effect_boundary/index.ts",
    "src/effect_boundary/stage_tool_execution_gate.ts",
  ],
  "formal Effect Boundary root must stay focused on StageToolExecutionGate policy/audit seams",
);

assert.deepEqual(
  (await sourceFilesUnder(join(repositoryRoot, "src/music_data_platform")))
    .map((file) => relative(repositoryRoot, file))
    .sort(),
  [
    "src/music_data_platform/errors.ts",
    "src/music_data_platform/identity_read_model.ts",
    "src/music_data_platform/identity_records.ts",
    "src/music_data_platform/identity_schema.ts",
    "src/music_data_platform/identity_write_model.ts",
    "src/music_data_platform/index.ts",
    "src/music_data_platform/material_candidate_ref.ts",
    "src/music_data_platform/material_ref.ts",
    "src/music_data_platform/material_ref_factory.ts",
    "src/music_data_platform/material_text_normalization.ts",
    "src/music_data_platform/material_text_projection_commands.ts",
    "src/music_data_platform/material_text_projection_records.ts",
    "src/music_data_platform/material_text_projection_schema.ts",
    "src/music_data_platform/material_text_ranking.ts",
    "src/music_data_platform/owner_catalog_projection.ts",
    "src/music_data_platform/owner_catalog_records.ts",
    "src/music_data_platform/owner_catalog_schema.ts",
    "src/music_data_platform/owner_material_relation_commands.ts",
    "src/music_data_platform/owner_material_relation_records.ts",
    "src/music_data_platform/owner_material_relation_ref.ts",
    "src/music_data_platform/owner_material_relation_schema.ts",
    "src/music_data_platform/owner_scope.ts",
    "src/music_data_platform/projection_maintenance_commands.ts",
    "src/music_data_platform/projection_maintenance_records.ts",
    "src/music_data_platform/projection_maintenance_runner.ts",
    "src/music_data_platform/projection_maintenance_schema.ts",
    "src/music_data_platform/ref_digest.ts",
    "src/music_data_platform/ref_validation.ts",
    "src/music_data_platform/retrieval_mixed_workspace.ts",
    "src/music_data_platform/retrieval_read_model.ts",
    "src/music_data_platform/retrieval_result_set_records.ts",
    "src/music_data_platform/retrieval_result_set_schema.ts",
    "src/music_data_platform/source_library_commands.ts",
    "src/music_data_platform/source_library_import.ts",
    "src/music_data_platform/source_library_read_model.ts",
    "src/music_data_platform/source_library_records.ts",
    "src/music_data_platform/source_library_ref.ts",
    "src/music_data_platform/source_library_schema.ts",
    "src/music_data_platform/source_of_truth_write_commands.ts",
    "src/music_data_platform/timestamp_validation.ts",
  ],
  "formal Music Data Platform root must not grow unrelated implementations",
);

assert.deepEqual(
  (await sourceFilesUnder(join(repositoryRoot, "src/music_intelligence")))
    .map((file) => relative(repositoryRoot, file))
    .sort(),
  [
    "src/music_intelligence/core/retrieval/contracts.ts",
    "src/music_intelligence/core/retrieval/cursor.ts",
    "src/music_intelligence/core/retrieval/index.ts",
    "src/music_intelligence/core/retrieval/query_normalization.ts",
    "src/music_intelligence/core/retrieval/query_service.ts",
    "src/music_intelligence/errors.ts",
    "src/music_intelligence/index.ts",
    "src/music_intelligence/stage_adapter/index.ts",
  ],
  "formal Music Intelligence root must keep Retrieval core separate from Stage Interface adapters",
);

const musicIntelligencePublicBarrelExportFailures: string[] = [];
for (const publicBarrel of [
  "src/music_intelligence/index.ts",
  "src/music_intelligence/core/retrieval/index.ts",
]) {
  const text = await readFile(join(repositoryRoot, publicBarrel), "utf8");

  for (const forbiddenExport of [
    "decodeRetrievalCursor",
    "encodeRetrievalCursor",
    "fingerprintForRetrievalQuery",
    "normalizeRetrievalQueryInput",
    "normalizeRetrievalQueryText",
    "RetrievalCursorPayload",
  ]) {
    if (exportsName(text, forbiddenExport)) {
      musicIntelligencePublicBarrelExportFailures.push(
        `${publicBarrel} exports Retrieval internal '${forbiddenExport}'`,
      );
    }
  }
}
assert.deepEqual(
  musicIntelligencePublicBarrelExportFailures,
  [],
  "Music Intelligence public barrels must not expose opaque cursor or query-normalization internals",
);

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
  const importFailures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const forbiddenImport of forbiddenRuntimeImports) {
      if (
        text.includes(`from "${forbiddenImport}`) ||
        text.includes(`from '${forbiddenImport}`)
      ) {
        importFailures.push(`${relative(repositoryRoot, file)} imports forbidden Phase 2 root '${forbiddenImport}'`);
      }
    }
  }

  assert.deepEqual(importFailures, []);
}

const serverImportFailures: string[] = [];
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
    if (
      text.includes(`from "${forbiddenImport}`) ||
      text.includes(`from '${forbiddenImport}`)
    ) {
      serverImportFailures.push(`${relative(repositoryRoot, file)} imports forbidden non-composition root '${forbiddenImport}'`);
    }
  }
}
assert.deepEqual(serverImportFailures, []);

const projectionMaintenanceSchedulerText = await readFile(
  join(repositoryRoot, "src/server/projection_maintenance_scheduler.ts"),
  "utf8",
);
const projectionMaintenanceSchedulerImportFailures: string[] = [];
const projectionMaintenanceSchedulerAllowedMdpImports = new Set([
  "createProjectionMaintenanceRunner",
  "ProjectionMaintenanceRunSummary",
]);

for (const forbiddenImport of [
  "../music_data_platform/",
  "../storage/",
]) {
  if (
    (projectionMaintenanceSchedulerText.includes(`from "${forbiddenImport}`)
      || projectionMaintenanceSchedulerText.includes(`from '${forbiddenImport}`))
    && !projectionMaintenanceSchedulerText.includes(
      `from "${forbiddenImport === "../music_data_platform/" ? "../music_data_platform/index.js" : "../storage/index.js"}"`,
    )
    && !projectionMaintenanceSchedulerText.includes(
      `from '${forbiddenImport === "../music_data_platform/" ? "../music_data_platform/index.js" : "../storage/index.js"}'`,
    )
  ) {
    projectionMaintenanceSchedulerImportFailures.push(
      `src/server/projection_maintenance_scheduler.ts imports forbidden internal boundary '${forbiddenImport}'`,
    );
  }
}

for (const importedName of musicDataPlatformIndexImportNames(projectionMaintenanceSchedulerText)) {
  if (!projectionMaintenanceSchedulerAllowedMdpImports.has(importedName)) {
    projectionMaintenanceSchedulerImportFailures.push(
      `src/server/projection_maintenance_scheduler.ts imports disallowed Music Data Platform index symbol '${importedName}'`,
    );
  }
}

if (hasMusicDataPlatformIndexNamespaceImport(projectionMaintenanceSchedulerText)) {
  projectionMaintenanceSchedulerImportFailures.push(
    "src/server/projection_maintenance_scheduler.ts imports Music Data Platform index through a namespace import",
  );
}

for (const forbiddenImport of [
  "../music_data_platform/projection_maintenance_",
  "../music_data_platform/owner_catalog_",
  "../music_data_platform/material_text_",
  "../storage/sqlite/",
]) {
  if (
    projectionMaintenanceSchedulerText.includes(`from "${forbiddenImport}`)
    || projectionMaintenanceSchedulerText.includes(`from '${forbiddenImport}`)
  ) {
    projectionMaintenanceSchedulerImportFailures.push(
      `src/server/projection_maintenance_scheduler.ts imports forbidden implementation root '${forbiddenImport}'`,
    );
  }
}

assert.deepEqual(
  projectionMaintenanceSchedulerImportFailures,
  [],
  "Projection Maintenance scheduler helper must depend only on Server Host policy, Music Data Platform public runner access, and Storage public database types",
);

const musicDataPlatformRuntimeModuleText = await readFile(
  join(repositoryRoot, "src/server/music_data_platform_runtime_module.ts"),
  "utf8",
);
assert.equal(
  musicDataPlatformRuntimeModuleText.includes("createProjectionMaintenanceRunner"),
  false,
  "Music Data Platform runtime module must compose the scheduler helper and must not reference the Projection Maintenance runner directly",
);
assert.equal(
  musicDataPlatformRuntimeModuleText.includes('from "./projection_maintenance_scheduler.js"')
    || musicDataPlatformRuntimeModuleText.includes("from './projection_maintenance_scheduler.js'"),
  true,
  "Music Data Platform runtime module must compose the Projection Maintenance scheduler helper through the local Server Host boundary",
);

const extensionImportFailures: string[] = [];
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
    if (
      text.includes(`from "${forbiddenImport}`) ||
      text.includes(`from '${forbiddenImport}`)
    ) {
      extensionImportFailures.push(`${relative(repositoryRoot, file)} imports forbidden Extension root '${forbiddenImport}'`);
    }
  }
}
assert.deepEqual(extensionImportFailures, []);

const sourceProviderSlotText = await readFile(
  join(repositoryRoot, "src/extension/source_provider_slot.ts"),
  "utf8",
);
const sourceProviderSlotImportFailures = forbiddenImportHits(sourceProviderSlotText, [
  "./plugins/",
  "./plugins/ncm",
]);
assert.deepEqual(
  sourceProviderSlotImportFailures,
  [],
  "Source Provider Slot must not depend on a concrete provider plugin",
);

const ncmPluginText = await readFile(
  join(repositoryRoot, "src/extension/plugins/ncm.ts"),
  "utf8",
);
const ncmPluginImportFailures = forbiddenImportHits(ncmPluginText, [
  "../../stage_interface/",
  "../../music_data_platform/",
  "../../storage/",
  "../../query/",
  "../../materialization/",
  "../../presentation/",
]);
assert.deepEqual(
  ncmPluginImportFailures,
  [],
  "NCM plugin must stay inside Extension/provider mapping boundaries",
);

const sourceProviderPluginImportFailures: string[] = [];
for (const file of await sourceFilesUnder(join(repositoryRoot, "src/extension/plugins"))) {
  const text = await readFile(file, "utf8");

  for (const forbiddenImport of forbiddenRelativeRootImportHits(text, [
    "music_data_platform",
    "storage",
    "server",
    "stage_interface",
    "query",
    "materialization",
    "presentation",
  ])) {
    sourceProviderPluginImportFailures.push(
      `${relative(repositoryRoot, file)} imports forbidden provider implementation dependency '${forbiddenImport}'`,
    );
  }
}
assert.deepEqual(
  sourceProviderPluginImportFailures,
  [],
  "Source provider plugins must not import Music Data Platform write/storage modules or presentation/runtime boundaries",
);
assert.deepEqual(
  forbiddenRelativeRootImportHits(
    `
      import type { MusicDatabase } from "../../../storage/index.js";
      import type { SourceEntity } from "../../contracts/music_data_platform.js";
    `,
    ["storage"],
  ),
  ["../../../storage/index.js"],
  "Source provider plugin guard must catch forbidden imports from nested plugin directories",
);

const extensionBarrelText = await readFile(
  join(repositoryRoot, "src/extension/index.ts"),
  "utf8",
);
assert.equal(
  extensionBarrelText.includes("searchSourceProvider"),
  false,
  "Extension public barrel must expose source-provider search through ExtensionRuntime only",
);

const effectBoundaryImportFailures: string[] = [];
for (const file of await sourceFilesUnder(join(repositoryRoot, "src/effect_boundary"))) {
  const text = await readFile(file, "utf8");

  for (const forbiddenImport of [
    "../stage_interface/",
    "../stage_core/",
    "../server/",
    "../storage/",
    "../music_data_platform/",
    "../music_intelligence/",
    "../extension/",
  ]) {
    if (
      text.includes(`from "${forbiddenImport}`) ||
      text.includes(`from '${forbiddenImport}`)
    ) {
      effectBoundaryImportFailures.push(
        `${relative(repositoryRoot, file)} imports forbidden Effect Boundary dependency '${forbiddenImport}'`,
      );
    }
  }
}
assert.deepEqual(
  effectBoundaryImportFailures,
  [],
  "Effect Boundary gate implementation must depend only on contracts and local policy helpers",
);

const stageInterfaceImportFailures: string[] = [];
for (const file of await sourceFilesUnder(join(repositoryRoot, "src/stage_interface"))) {
  const text = await readFile(file, "utf8");

  if (
    text.includes('from "../extension/') ||
    text.includes("from '../extension/") ||
    text.includes('from "../music_data_platform/') ||
    text.includes("from '../music_data_platform/")
  ) {
    stageInterfaceImportFailures.push(`${relative(repositoryRoot, file)} imports forbidden implementation root`);
  }
}
assert.deepEqual(stageInterfaceImportFailures, []);

const musicDataPlatformImportFailures: string[] = [];
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
    "../music_intelligence/",
    "../music_experience/",
    "../query/",
    "../retrieval/",
    "../presentation/",
  ]) {
    if (
      text.includes(`from "${forbiddenImport}`) ||
      text.includes(`from '${forbiddenImport}`)
    ) {
      musicDataPlatformImportFailures.push(
        `${relative(repositoryRoot, file)} imports forbidden Music Data Platform dependency '${forbiddenImport}'`,
      );
    }
  }

  for (const rawSqliteToken of ["Database" + "Sync", "node" + ":" + "sqlite"]) {
    if (!text.includes(rawSqliteToken)) {
      continue;
    }

    musicDataPlatformImportFailures.push(
      `${relative(repositoryRoot, file)} mentions raw SQLite primitives`,
    );
  }
}
assert.deepEqual(musicDataPlatformImportFailures, []);

const musicIntelligenceImportFailures: string[] = [];
const musicIntelligenceAllowedMdpImports = new Set([
  "MixedRetrievalCursorPosition",
  "MusicDataPlatformMixedRetrievalPage",
  "MusicDataPlatformMixedRetrievalRow",
  "MusicDataPlatformRetrievalMaterialRow",
  "MusicDataPlatformRetrievalReadPort",
  "MusicDataPlatformRetrievalSearchInput",
  "MusicDataPlatformRetrievalWorkspace",
  "RetrievalFreshness",
  "RetrievalMatchedTextTokenEvidence",
  "RetrievalOrder",
  "RetrievalReadCursorPosition",
  "RetrievalTextField",
]);
for (const file of await sourceFilesUnder(join(repositoryRoot, "src/music_intelligence"))) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  for (const forbiddenImport of [
    "../stage_interface/",
    "../../stage_interface/",
    "../../../stage_interface/",
    "../stage_core/",
    "../../stage_core/",
    "../../../stage_core/",
    "../server/",
    "../../server/",
    "../../../server/",
    "../extension/",
    "../../extension/",
    "../../../extension/",
    "../storage/",
    "../../storage/",
    "../../../storage/",
    "../storage/sqlite/",
    "../../storage/sqlite/",
    "../../../storage/sqlite/",
    "../providers/",
    "../../providers/",
    "../../../providers/",
    "../material/",
    "../../material/",
    "../../../material/",
    "../collection/",
    "../../collection/",
    "../../../collection/",
    "../memory/",
    "../../memory/",
    "../../../memory/",
    "../effects/",
    "../../effects/",
    "../../../effects/",
    "../music_experience/",
    "../../music_experience/",
    "../../../music_experience/",
    "../query/",
    "../../query/",
    "../../../query/",
    "../presentation/",
    "../../presentation/",
    "../../../presentation/",
  ]) {
    if (
      text.includes(`from "${forbiddenImport}`) ||
      text.includes(`from '${forbiddenImport}`)
    ) {
      musicIntelligenceImportFailures.push(
        `${relativeFile} imports forbidden Music Intelligence dependency '${forbiddenImport}'`,
      );
    }
  }

  for (const mdpImport of [
    "../music_data_platform/",
    "../../music_data_platform/",
    "../../../music_data_platform/",
  ]) {
    if (
      (text.includes(`from "${mdpImport}`) || text.includes(`from '${mdpImport}`)) &&
      !(text.includes(`from "${mdpImport}index.js"`) || text.includes(`from '${mdpImport}index.js'`))
    ) {
      musicIntelligenceImportFailures.push(
        `${relativeFile} imports Music Data Platform internals instead of the public retrieval read-port boundary`,
      );
    }
  }

  for (const importedName of musicDataPlatformIndexImportNames(text)) {
    if (!musicIntelligenceAllowedMdpImports.has(importedName)) {
      musicIntelligenceImportFailures.push(
        `${relativeFile} imports disallowed Music Data Platform index symbol '${importedName}'`,
      );
    }
  }

  if (hasMusicDataPlatformIndexNamespaceImport(text)) {
    musicIntelligenceImportFailures.push(
      `${relativeFile} imports Music Data Platform index through a namespace import`,
    );
  }

  for (const forbiddenMdpSymbol of [
    "createIdentity",
    "createSourceLibrary",
    "createOwnerCatalog",
    "createOwnerMaterialRelation",
    "createMaterialText",
    "createProjectionMaintenance",
    "createRetrievalResultSetRecords",
    "createMusicDataPlatformSourceOfTruthWriteCommands",
    "SourceLibraryRecord",
    "SourceLibraryItemRecord",
    "OwnerCatalogMaterialRecord",
    "OwnerMaterialEntryRecord",
    "MaterialTextDocumentRecord",
    "ProjectionMaintenanceTargetRecord",
  ]) {
    if (text.includes(forbiddenMdpSymbol)) {
      musicIntelligenceImportFailures.push(
        `${relativeFile} mentions forbidden Music Data Platform symbol '${forbiddenMdpSymbol}'`,
      );
    }
  }

  for (const sqlToken of [
    "SELECT ",
    " JOIN ",
    " ORDER BY ",
    " WHERE ",
    " LIMIT ",
  ]) {
    if (text.includes(sqlToken)) {
      musicIntelligenceImportFailures.push(
        `${relativeFile} contains SQL token '${sqlToken.trim()}' outside Music Data Platform ownership`,
      );
    }
  }
}
assert.deepEqual(musicIntelligenceImportFailures, []);

const musicIntelligenceCoreStageImportFailures: string[] = [];
for (const file of await sourceFilesUnder(join(repositoryRoot, "src/music_intelligence/core"))) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  for (const forbiddenImport of [
    "contracts/stage_interface",
    "contracts/public_music_description",
  ]) {
    if (text.includes(forbiddenImport)) {
      musicIntelligenceCoreStageImportFailures.push(
        `${relativeFile} imports forbidden Stage Interface contract surface '${forbiddenImport}'`,
      );
    }
  }
}
assert.deepEqual(
  musicIntelligenceCoreStageImportFailures,
  [],
  "Music Intelligence core must not import Stage Interface contracts or public description helpers; stage_adapter owns that boundary",
);

const musicIntelligenceRuntimeResultSetFailures: string[] = [];
for (const file of await sourceFilesUnder(join(repositoryRoot, "src/music_intelligence"))) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  for (const forbiddenRuntimeTable of [
    "retrieval_result_sets",
    "retrieval_result_rows",
    "retrieval_result_text_fts",
    "material_candidate_cache",
    "material_candidate_ref_key",
  ]) {
    if (text.includes(forbiddenRuntimeTable)) {
      musicIntelligenceRuntimeResultSetFailures.push(
        `${relativeFile} mentions runtime result-set/cache table '${forbiddenRuntimeTable}'`,
      );
    }
  }
}
assert.deepEqual(
  musicIntelligenceRuntimeResultSetFailures,
  [],
  "Music Intelligence must not write or shape SQL around Music Data Platform runtime result-set/cache tables",
);

const retrievalServiceText = await readFile(
  join(repositoryRoot, "src/music_intelligence/core/retrieval/query_service.ts"),
  "utf8",
);
assert.equal(
  retrievalServiceText.includes(".sort("),
  false,
  "Retrieval query service must preserve Music Data Platform row order instead of sorting hits",
);

const retrievalMixedWorkspaceText = await readFile(
  join(repositoryRoot, "src/music_data_platform/retrieval_mixed_workspace.ts"),
  "utf8",
);
assert.equal(
  retrievalMixedWorkspaceText.includes(".sort("),
  false,
  "Mixed retrieval workspace must use SQL ranking/keyset pagination instead of TypeScript sorting",
);

const retrievalReadModelText = await readFile(
  join(repositoryRoot, "src/music_data_platform/retrieval_read_model.ts"),
  "utf8",
);
assert.equal(
  retrievalReadModelText.includes("provider_search"),
  false,
  "Music Data Platform local retrieval read model must not accept provider_search typed pools in Phase 15A",
);
assert.equal(
  retrievalReadModelText.includes("RetrievalPool"),
  false,
  "Music Data Platform local retrieval read model must not depend on Music Intelligence typed pool objects",
);
assert.equal(
  retrievalReadModelText.includes("retrieval_result_sets") ||
    retrievalReadModelText.includes("material_candidate"),
  false,
  "Music Data Platform local retrieval read model must stay local-only and must not gain runtime mixed result-set/candidate behavior",
);

const musicDataPlatformRawRefAssertFailures: string[] = [];
const rawRefPrimitiveAllowedFiles = new Set([
  "src/music_data_platform/ref_validation.ts",
  "src/music_data_platform/source_library_import.ts",
]);

for (const file of await sourceFilesUnder(join(repositoryRoot, "src/music_data_platform"))) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  if (
    text.includes("assertRefSafe") &&
    !rawRefPrimitiveAllowedFiles.has(relativeFile)
  ) {
    musicDataPlatformRawRefAssertFailures.push(
      `${relativeFile} imports or calls contracts assertRefSafe outside ref_validation ownership`,
    );
  }

  if (
    text.includes("isRefComponentSafe") &&
    !rawRefPrimitiveAllowedFiles.has(relativeFile)
  ) {
    musicDataPlatformRawRefAssertFailures.push(
      `${relativeFile} imports or calls contracts isRefComponentSafe outside allowed low-level ownership`,
    );
  }
}
assert.deepEqual(musicDataPlatformRawRefAssertFailures, []);

const musicDataPlatformBarrelText = await readFile(
  join(repositoryRoot, "src/music_data_platform/index.ts"),
  "utf8",
);
for (const forbiddenBarrelExport of [
  "createIdentityRepositories",
  "createSourceLibraryRepositories",
  "sourceLibraryItemKey",
  "createIdentityWriteCommands",
  "createSourceLibraryCommands",
  "createOwnerMaterialRelationCommands",
  "createRetrievalResultSetRecords",
]) {
  assert.equal(
    musicDataPlatformBarrelText.includes(forbiddenBarrelExport),
    false,
    `Music Data Platform public barrel must not expose low-level persistence helper '${forbiddenBarrelExport}'`,
  );
}

const repositoryFactoryUsageAllowedFiles = new Set([
  "src/music_data_platform/identity_read_model.ts",
  "src/music_data_platform/identity_records.ts",
  "src/music_data_platform/identity_write_model.ts",
  "src/music_data_platform/material_text_projection_commands.ts",
  "src/music_data_platform/source_library_commands.ts",
  "src/music_data_platform/source_library_read_model.ts",
  "src/music_data_platform/source_library_records.ts",
]);
const repositoryFactoryFailures: string[] = [];

for (const file of activeFiles) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  for (const factoryCall of [
    "createIdentityRepositories(",
    "createSourceLibraryRepositories(",
  ]) {
    if (
      text.includes(factoryCall) &&
      !repositoryFactoryUsageAllowedFiles.has(relativeFile)
    ) {
      repositoryFactoryFailures.push(
        `${relativeFile} calls low-level repository factory '${factoryCall}' outside an owning command/read/projection boundary`,
      );
    }
  }
}
assert.deepEqual(repositoryFactoryFailures, []);

const lowLevelWriteFactoryAllowedFiles = new Set([
  "src/music_data_platform/identity_write_model.ts",
  "src/music_data_platform/source_library_commands.ts",
  "src/music_data_platform/owner_material_relation_commands.ts",
  "src/music_data_platform/source_of_truth_write_commands.ts",
]);
const lowLevelWriteFactoryFailures: string[] = [];

for (const file of activeFiles) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  for (const factoryCall of [
    "createIdentityWriteCommands(",
    "createSourceLibraryCommands(",
    "createOwnerMaterialRelationCommands(",
  ]) {
    if (
      text.includes(factoryCall) &&
      !lowLevelWriteFactoryAllowedFiles.has(relativeFile)
    ) {
      lowLevelWriteFactoryFailures.push(
        `${relativeFile} calls low-level source-of-truth write factory '${factoryCall}' outside the owning write module or top-level facade`,
      );
    }
  }
}
assert.deepEqual(lowLevelWriteFactoryFailures, []);

const projectionInvalidationCallAllowedFiles = new Set([
  "src/music_data_platform/identity_write_model.ts",
  "src/music_data_platform/source_library_commands.ts",
  "src/music_data_platform/owner_material_relation_commands.ts",
  "src/music_data_platform/source_of_truth_write_commands.ts",
]);
const projectionInvalidationCallFailures: string[] = [];

for (const file of activeFiles) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  if (
    text.includes(".markProjectionInvalidated(") &&
    !projectionInvalidationCallAllowedFiles.has(relativeFile)
  ) {
    projectionInvalidationCallFailures.push(
      `${relativeFile} calls markProjectionInvalidated outside the owning write boundary`,
    );
  }
}
assert.deepEqual(projectionInvalidationCallFailures, []);

const projectionTargetDirtyCallAllowedFiles = new Set<string>([]);
const projectionTargetDirtyCallFailures: string[] = [];

for (const file of activeFiles) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  if (
    text.includes(".markProjectionTargetDirty(") &&
    !projectionTargetDirtyCallAllowedFiles.has(relativeFile)
  ) {
    projectionTargetDirtyCallFailures.push(
      `${relativeFile} calls markProjectionTargetDirty outside Projection Maintenance ownership`,
    );
  }
}
assert.deepEqual(projectionTargetDirtyCallFailures, []);

const projectionRebuildCallAllowedFiles = new Set([
  "src/music_data_platform/projection_maintenance_runner.ts",
]);
const projectionRebuildCallFailures: string[] = [];

for (const file of activeFiles) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  for (const rebuildCall of [
    ".rebuildSourceLibraryEntriesForLibrary(",
    ".rebuildSourceLibraryEntriesForMaterial(",
    ".rebuildOwnerRelationEntries(",
    ".rebuildMaterialTextDocument(",
    ".rebuildMaterialTextDocuments(",
  ]) {
    if (
      text.includes(rebuildCall) &&
      !projectionRebuildCallAllowedFiles.has(relativeFile)
    ) {
      projectionRebuildCallFailures.push(
        `${relativeFile} calls projection rebuild command '${rebuildCall}' outside Projection Maintenance runner ownership`,
      );
    }
  }
}
assert.deepEqual(projectionRebuildCallFailures, []);

const projectionMaintenanceRunnerFactoryAllowedFiles = new Set([
  "src/music_data_platform/index.ts",
  "src/music_data_platform/projection_maintenance_runner.ts",
  "src/server/projection_maintenance_scheduler.ts",
]);
const projectionMaintenanceRunnerFactoryFailures: string[] = [];

for (const file of activeFiles) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  if (
    text.includes("createProjectionMaintenanceRunner")
    && !projectionMaintenanceRunnerFactoryAllowedFiles.has(relativeFile)
  ) {
    projectionMaintenanceRunnerFactoryFailures.push(
      `${relativeFile} mentions Projection Maintenance runner factory outside the allowed runtime orchestration boundary`,
    );
  }
}
assert.deepEqual(projectionMaintenanceRunnerFactoryFailures, []);

const directWriteAllowedFiles = new Set([
  "src/music_data_platform/identity_records.ts",
  "src/music_data_platform/identity_schema.ts",
  "src/music_data_platform/identity_write_model.ts",
  "src/music_data_platform/material_text_projection_commands.ts",
  "src/music_data_platform/material_text_projection_schema.ts",
  "src/music_data_platform/owner_catalog_projection.ts",
  "src/music_data_platform/owner_catalog_schema.ts",
  "src/music_data_platform/owner_material_relation_commands.ts",
  "src/music_data_platform/owner_material_relation_schema.ts",
  "src/music_data_platform/projection_maintenance_commands.ts",
  "src/music_data_platform/projection_maintenance_schema.ts",
  "src/music_data_platform/retrieval_mixed_workspace.ts",
  "src/music_data_platform/retrieval_result_set_records.ts",
  "src/music_data_platform/retrieval_result_set_schema.ts",
  "src/music_data_platform/source_library_commands.ts",
  "src/music_data_platform/source_library_records.ts",
  "src/music_data_platform/source_library_schema.ts",
  "src/stage_interface/handle_registry_records.ts",
  "src/stage_interface/handle_registry_schema.ts",
  "src/storage/sqlite/database.ts",
  "src/storage/sqlite/schema.ts",
]);
const directWriteFailures: string[] = [];

for (const file of activeFiles) {
  const relativeFile = relative(repositoryRoot, file);
  const text = await readFile(file, "utf8");

  for (const writeToken of [
    ".run(",
    ".insert(",
    ".upsert(",
    ".delete(",
  ]) {
    if (
      text.includes(writeToken) &&
      !directWriteAllowedFiles.has(relativeFile)
    ) {
      directWriteFailures.push(
        `${relativeFile} contains write token '${writeToken}' outside an owning write boundary`,
      );
    }
  }
}
assert.deepEqual(directWriteFailures, []);

const schemaDestructiveResetFailures: string[] = [];
for (const file of activeFiles) {
  const relativeFile = relative(repositoryRoot, file);

  if (!relativeFile.endsWith("_schema.ts")) {
    continue;
  }

  const text = await readFile(file, "utf8");

  if (text.toUpperCase().includes("DROP TABLE")) {
    schemaDestructiveResetFailures.push(
      `${relativeFile} contains destructive schema initialization SQL 'DROP TABLE'`,
    );
  }
}
assert.deepEqual(
  schemaDestructiveResetFailures,
  [],
  "schema initialization must not hide destructive table resets",
);

// ADR-0013: contracts DAG, kernel-export, and ref-origin guards (Phase 2).
// The contracts barrel is deleted; symbols are imported from the per-area
// files behind a shared leaf kernel. These guards machine-check the
// one-directional DAG, that the kernel exports only cross-cutting primitives,
// and that ref primitives are sourced from contracts/kernel.js.

// Three import forms, in order: `from "spec"` clauses (covers type, value,
// and namespace imports), dynamic `import("spec")` calls, and bare side-effect
// `import "spec"` statements. All three are relative-edge vectors the DAG
// guard must see; the side-effect form has no `from` keyword and would slip a
// forbidden edge past a `from`-only regex.
const contractsImportSpecifierPattern =
  /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']/gu;

const contractsDagAllowlist: Readonly<Record<string, readonly string[]>> = {
  "src/contracts/kernel.ts": [],
  "src/contracts/music_data_platform.ts": ["./kernel.js"],
  "src/contracts/storage.ts": ["./kernel.js", "./music_data_platform.js"],
  "src/contracts/public_music_description.ts": ["./stage_interface.js"],
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
      contractsDagFailures.push(
        `${contractFile} imports forbidden contract specifier '${specifier}'`,
      );
    }
  }
}
assert.deepEqual(
  contractsDagFailures,
  [],
  "contracts files must follow the one-directional DAG (kernel leaf; storage/stage_core read downward; no reverse edges)",
);

// G2 (kernel-export allow-list): rather than scan for an ever-incomplete
// deny-list of area-specific identifiers, assert kernel.ts exports ONLY the
// cross-cutting primitives. This is additive-safe — any future area type placed
// in the kernel is flagged immediately, without the author having to extend a
// deny-list. The set below is the kernel surface named in ADR-0013.
const kernelLeakFailures: string[] = [];
const kernelLeakText = await readFile(
  join(repositoryRoot, "src/contracts/kernel.ts"),
  "utf8",
);
const kernelExportPattern =
  /\bexport\s+(?:type|interface|function|const|class|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gu;
const kernelExports = new Set(
  [...kernelLeakText.matchAll(kernelExportPattern)]
    .map((match) => match[1])
    .filter((name): name is string => typeof name === "string"),
);
const kernelAllowedExports = new Set([
  "Result",
  "StageError",
  "StageWarning",
  "FormalArea",
  "Ref",
  "isRefComponentSafe",
  "assertRefSafe",
  "refKey",
]);
for (const exportedName of kernelExports) {
  if (!kernelAllowedExports.has(exportedName)) {
    kernelLeakFailures.push(
      `src/contracts/kernel.ts exports non-kernel identifier '${exportedName}' (kernel must hold only cross-cutting primitives)`,
    );
  }
}
for (const expectedKernelExport of kernelAllowedExports) {
  if (!kernelExports.has(expectedKernelExport)) {
    kernelLeakFailures.push(
      `src/contracts/kernel.ts is missing expected kernel export '${expectedKernelExport}'`,
    );
  }
}
assert.deepEqual(
  kernelLeakFailures,
  [],
  "src/contracts/kernel.ts must export only the cross-cutting kernel primitives: Result, StageError, StageWarning, FormalArea, Ref, isRefComponentSafe, assertRefSafe, refKey",
);

// G3 (ref-origin, Phase 2): the contracts barrel is gone, so assert the ref
// primitives (isRefComponentSafe, assertRefSafe, refKey) are imported ONLY from
// contracts/kernel.js. This anchors ref handling to the shared leaf kernel and
// stops a future area file from re-exporting the primitives indirectly.
const refPrimitives = ["isRefComponentSafe", "assertRefSafe", "refKey"] as const;
const refOriginFailures: string[] = [];
const refOriginSourceFiles = [
  ...(await sourceFilesUnder(join(repositoryRoot, "src"))),
  ...(await sourceFilesUnder(join(repositoryRoot, "test"))),
];
for (const sourceFile of refOriginSourceFiles) {
  const text = await readFile(sourceFile, "utf8");
  for (const refPrimitive of refPrimitives) {
    const refImportPattern = new RegExp(
      `\\bimport(?:\\s+type)?\\s*\\{[^}]*\\b${refPrimitive}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`,
      "gu",
    );
    for (const match of text.matchAll(refImportPattern)) {
      const specifier = match[1];
      if (
        typeof specifier === "string" &&
        !/contracts\/kernel\.js$/u.test(specifier)
      ) {
        refOriginFailures.push(
          `${relative(repositoryRoot, sourceFile)} imports '${refPrimitive}' from '${specifier}' (ref primitives must come from contracts/kernel.js)`,
        );
      }
    }
  }
}
assert.deepEqual(
  refOriginFailures,
  [],
  "ref primitives (isRefComponentSafe, assertRefSafe, refKey) must be imported only from contracts/kernel.js",
);

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

function gitTrackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).split(/\r?\n/).filter(Boolean);
}

function forbiddenImportHits(text: string, forbiddenImports: readonly string[]): string[] {
  const failures: string[] = [];

  for (const forbiddenImport of forbiddenImports) {
    if (
      text.includes(`from "${forbiddenImport}`) ||
      text.includes(`from '${forbiddenImport}`)
    ) {
      failures.push(forbiddenImport);
    }
  }

  return failures;
}

function forbiddenRelativeRootImportHits(text: string, forbiddenRoots: readonly string[]): string[] {
  const failures = new Set<string>();
  const importPattern = /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;

  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier === undefined) {
      continue;
    }

    const root = relativeImportRoot(specifier);
    if (root !== undefined && forbiddenRoots.includes(root)) {
      failures.add(specifier);
    }
  }

  return [...failures].sort();
}

function relativeImportRoot(specifier: string): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const segments = specifier.split("/").filter((segment) => segment.length > 0 && segment !== ".");

  while (segments[0] === "..") {
    segments.shift();
  }

  return segments[0];
}

function musicDataPlatformIndexImportNames(text: string): string[] {
  const names: string[] = [];
  const importPattern =
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](?:\.\.\/){1,3}music_data_platform\/index\.js["'];/g;

  for (const match of text.matchAll(importPattern)) {
    const importBody = match[1];

    if (importBody === undefined) {
      continue;
    }

    for (const rawName of importBody.split(",")) {
      const importedName = rawName.trim().replace(/^type\s+/, "").split(/\s+as\s+/u)[0]?.trim();

      if (importedName !== undefined && importedName.length > 0) {
        names.push(importedName);
      }
    }
  }

  return names;
}

function hasMusicDataPlatformIndexNamespaceImport(text: string): boolean {
  return /import\s+(?:type\s+)?\*\s+as\s+\w+\s+from\s+["'](?:\.\.\/){1,3}music_data_platform\/index\.js["'];/u
    .test(text);
}

function exportsName(text: string, name: string): boolean {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

  return new RegExp(
    `export\\s+(?:type\\s+)?\\{[^}]*\\b${escapedName}\\b[^}]*\\}`,
    "su",
  ).test(text);
}
