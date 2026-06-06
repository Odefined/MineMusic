const testModules = [
  "./formal/formal-contracts.test.js",
  "./formal/active-tree.test.js",
  "./formal/extension-capability-slot.test.js",
  "./formal/stage-runtime.test.js",
  "./formal/server-host.test.js",
];

for (const testModule of testModules) {
  await import(testModule);
}
