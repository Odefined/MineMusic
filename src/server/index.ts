export {
  createServerHost,
} from "./host.js";
export type {
  CreateServerHostInput,
  ServerHost,
} from "./host.js";
export {
  createMineMusicExtensionRuntime,
} from "./config.js";
export type {
  MineMusicRuntimeConfig,
} from "./config.js";
export {
  createMusicDataPlatformRuntimeModule,
} from "./music_data_platform_runtime_module.js";
export type {
  CreateMusicDataPlatformRuntimeModuleInput,
  MusicDataPlatformRuntimeModule,
} from "./music_data_platform_runtime_module.js";
export {
  createMusicExperienceServerRuntimeModule,
} from "./music_experience_runtime_module.js";
export type {
  CreateMusicExperienceServerRuntimeModuleInput,
  MusicExperienceServerPorts,
} from "./music_experience_runtime_module.js";
export {
  createLibraryImportServerRuntimeModule,
} from "./library_import_runtime_module.js";
export type {
  CreateLibraryImportServerRuntimeModuleInput,
  LibraryImportServerPorts,
} from "./library_import_runtime_module.js";
export {
  createLibraryRelationServerRuntimeModule,
} from "./library_relation_runtime_module.js";
export type {
  CreateLibraryRelationServerRuntimeModuleInput,
  LibraryRelationServerPorts,
} from "./library_relation_runtime_module.js";
export {
  createLibraryCatalogServerRuntimeModule,
} from "./library_catalog_runtime_module.js";
export {
  createLibraryCollectionServerRuntimeModule,
} from "./library_collection_runtime_module.js";
export type {
  CreateLibraryCatalogServerRuntimeModuleInput,
  LibraryCatalogScopeServerPorts,
  LibraryCatalogServerPorts,
} from "./library_catalog_runtime_module.js";
export type {
  CreateLibraryCollectionServerRuntimeModuleInput,
  LibraryCollectionServerPorts,
} from "./library_collection_runtime_module.js";
export {
  createExtensionRuntimeRetrievalProviderSearchPort,
} from "./retrieval_provider_search_adapter.js";
export type {
  CreateExtensionRuntimeRetrievalProviderSearchPortInput,
} from "./retrieval_provider_search_adapter.js";
export {
  createStageToolContextAssembly,
} from "./stage_tool_context_assembly.js";
export type {
  CreateStageToolContextAssemblyInput,
  StageToolContextAssemblyPorts,
} from "./stage_tool_context_assembly.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const { runMineMusicMcpStdioServer } = await import("./mcp_stdio_entrypoint.js");
  await runMineMusicMcpStdioServer();
}
