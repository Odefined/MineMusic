const testModules = [
  "./formal/formal-contracts.test.js",
  "./formal/active-tree.test.js",
  "./formal/stage-runtime.test.js",
];

for (const testModule of testModules) {
  await import(testModule);
}
