const testModules = [
  "./storage/in-memory-repositories.test.js",
  "./storage/sqlite-canonical-store.test.js",
  "./plugins/plugin-registry.test.js",
  "./canonical/canonical-store.test.js",
  "./events/event-service.test.js",
  "./effects/effect-boundary.test.js",
  "./memory/memory-service.test.js",
  "./knowledge/music-knowledge.test.js",
  "./source/source-grounding.test.js",
  "./material_resolve/material-resolve.test.js",
  "./providers/netease-source-provider.test.js",
  "./plugins/plugin-packaging.test.js",
  "./stage_core/stage-core-factory.test.js",
  "./stage/stage-modules.test.js",
  "./surfaces/mcp-server.test.js",
  "./stage_interface/stage-interface-dispatch.test.js",
  "./stage_interface/stage-interface.test.js",
  "./integration/canonical-persistence.test.js",
  "./integration/mvp-slice.test.js",
];

for (const testModule of testModules) {
  await import(testModule);
}
