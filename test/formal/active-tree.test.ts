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
  ],
  "formal Server Host root must stay inside the Phase 13 runtime-orchestration boundary",
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
    "src/music_data_platform/material_ref.ts",
    "src/music_data_platform/material_ref_factory.ts",
    "src/music_data_platform/material_text_normalization.ts",
    "src/music_data_platform/material_text_projection_commands.ts",
    "src/music_data_platform/material_text_projection_records.ts",
    "src/music_data_platform/material_text_projection_schema.ts",
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
    "src/music_data_platform/retrieval_read_model.ts",
    "src/music_data_platform/source_library_commands.ts",
    "src/music_data_platform/source_library_import.ts",
    "src/music_data_platform/source_library_read_model.ts",
    "src/music_data_platform/source_library_records.ts",
    "src/music_data_platform/source_library_ref.ts",
    "src/music_data_platform/source_library_schema.ts",
    "src/music_data_platform/source_of_truth_write_commands.ts",
  ],
  "formal Music Data Platform root must not grow unrelated implementations",
);

assert.deepEqual(
  (await sourceFilesUnder(join(repositoryRoot, "src/music_intelligence")))
    .map((file) => relative(repositoryRoot, file))
    .sort(),
  [
    "src/music_intelligence/errors.ts",
    "src/music_intelligence/index.ts",
    "src/music_intelligence/retrieval/contracts.ts",
    "src/music_intelligence/retrieval/cursor.ts",
    "src/music_intelligence/retrieval/index.ts",
    "src/music_intelligence/retrieval/query_normalization.ts",
    "src/music_intelligence/retrieval/query_service.ts",
  ],
  "formal Music Intelligence root must stay inside the Phase 12C Retrieval boundary",
);

const musicIntelligencePublicBarrelExportFailures: string[] = [];
for (const publicBarrel of [
  "src/music_intelligence/index.ts",
  "src/music_intelligence/retrieval/index.ts",
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

const extensionBarrelText = await readFile(
  join(repositoryRoot, "src/extension/index.ts"),
  "utf8",
);
assert.equal(
  extensionBarrelText.includes("searchSourceProvider"),
  false,
  "Extension public barrel must expose source-provider search through ExtensionRuntime only",
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
  "MusicDataPlatformRetrievalMaterialRow",
  "MusicDataPlatformRetrievalReadPort",
  "MusicDataPlatformRetrievalSearchInput",
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
    "../stage_core/",
    "../../stage_core/",
    "../server/",
    "../../server/",
    "../extension/",
    "../../extension/",
    "../storage/",
    "../../storage/",
    "../storage/sqlite/",
    "../../storage/sqlite/",
    "../providers/",
    "../../providers/",
    "../material/",
    "../../material/",
    "../collection/",
    "../../collection/",
    "../memory/",
    "../../memory/",
    "../effects/",
    "../../effects/",
    "../music_experience/",
    "../../music_experience/",
    "../query/",
    "../../query/",
    "../presentation/",
    "../../presentation/",
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

const retrievalServiceText = await readFile(
  join(repositoryRoot, "src/music_intelligence/retrieval/query_service.ts"),
  "utf8",
);
assert.equal(
  retrievalServiceText.includes(".sort("),
  false,
  "Retrieval query service must preserve Music Data Platform row order instead of sorting hits",
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
  "src/music_data_platform/source_library_commands.ts",
  "src/music_data_platform/source_library_records.ts",
  "src/music_data_platform/source_library_schema.ts",
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

function musicDataPlatformIndexImportNames(text: string): string[] {
  const names: string[] = [];
  const importPattern =
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](?:\.\.\/){1,2}music_data_platform\/index\.js["'];/g;

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
  return /import\s+(?:type\s+)?\*\s+as\s+\w+\s+from\s+["'](?:\.\.\/){1,2}music_data_platform\/index\.js["'];/u
    .test(text);
}

function exportsName(text: string, name: string): boolean {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

  return new RegExp(
    `export\\s+(?:type\\s+)?\\{[^}]*\\b${escapedName}\\b[^}]*\\}`,
    "su",
  ).test(text);
}
