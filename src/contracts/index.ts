// Contracts barrel — a transitional re-export shim over the per-area contract
// files. Phase 1 of the contracts split (ADR-0013): this file defines nothing
// of its own. Phase 2 repoints importers to the narrow paths and deletes it.
//
// Definition sites (see ADR-0013 for the DAG):
//   kernel.ts             leaf, imports nothing
//   music_data_platform   imports kernel
//   storage               imports kernel, music_data_platform
//   stage_interface       imports kernel
//   stage_core            imports kernel, stage_interface

export * from "./kernel.js";
export * from "./music_data_platform.js";
export * from "./storage.js";
export * from "./stage_interface.js";
export * from "./stage_core.js";
