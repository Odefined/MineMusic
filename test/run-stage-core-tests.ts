const testModules = [
  "./formal/formal-contracts.test.js",
  "./formal/stage-interface-tool-frame.test.js",
  "./formal/music-discovery-list-scopes.test.js",
  "./formal/music-discovery-lookup.test.js",
  "./formal/active-tree.test.js",
  "./formal/extension-capability-slot.test.js",
  "./formal/ncm-plugin.test.js",
  "./formal/music-database.test.js",
  "./formal/music-data-platform-identity.test.js",
  "./formal/music-data-platform-source-library.test.js",
  "./formal/music-data-platform-owner-relations.test.js",
  "./formal/music-data-platform-owner-catalog.test.js",
  "./formal/music-data-platform-material-text-projection.test.js",
  "./formal/music-data-platform-ref-validation.test.js",
  "./formal/music-data-platform-projection-maintenance.test.js",
  "./formal/music-data-platform-retrieval-result-set.test.js",
  "./formal/music-data-platform-mixed-retrieval.test.js",
  "./formal/music-data-platform-retrieval-read-model.test.js",
  "./formal/music-intelligence-retrieval.test.js",
  "./formal/server-projection-maintenance-scheduler.test.js",
  "./formal/server-music-data-platform-runtime-module.test.js",
  "./formal/server-entrypoint.test.js",
  "./formal/stage-runtime.test.js",
  "./formal/server-host.test.js",
];

for (const testModule of testModules) {
  await import(testModule);
}
