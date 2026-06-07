import assert from "node:assert/strict";

import { createMineMusicExtensionRuntime, createServerHost } from "../../src/server/index.js";

const host = createServerHost();

assert.equal(host.snapshot().status, "created");
assert.equal(host.snapshot().interfaceContract.tools.length, 0);
assert.deepEqual(host.snapshot().modules.map((module) => module.id), [
  "extension",
  "runtime-status",
]);

const started = await host.start();

assert.equal(started.ok, true);
assert.equal(host.snapshot().status, "ready");
assert.deepEqual(host.snapshot().modules.map(({ id, ownerArea, status }) => ({
  id,
  ownerArea,
  status,
})), [
  {
    id: "extension",
    ownerArea: "extension",
    status: "initialized",
  },
  {
    id: "runtime-status",
    ownerArea: "stage_core",
    status: "initialized",
  },
]);
assert.equal(host.snapshot().interfaceContract.tools[0]?.name, "stage.runtime.status");

const stopped = await host.stop();

assert.equal(stopped.ok, true);
assert.equal(host.snapshot().status, "stopped");
assert.deepEqual(host.snapshot().modules.map(({ id, ownerArea, status }) => ({
  id,
  ownerArea,
  status,
})), [
  {
    id: "extension",
    ownerArea: "extension",
    status: "stopped",
  },
  {
    id: "runtime-status",
    ownerArea: "stage_core",
    status: "stopped",
  },
]);

const stoppedAgain = await host.stop();

assert.equal(stoppedAgain.ok, true);
assert.equal(host.snapshot().status, "stopped");

let probedNcm = false;
const configuredExtensionRuntime = createMineMusicExtensionRuntime({
  plugins: {
    "minemusic.ncm": {
      baseUrl: "http://unavailable.ncm.test",
      fetch: async () => {
        probedNcm = true;
        throw new Error("NCM should not be probed during initialization.");
      },
    },
  },
});
const configuredExtensionStarted = await configuredExtensionRuntime.initialize();

assert.equal(configuredExtensionStarted.ok, true);
assert.equal(probedNcm, false);
assert.deepEqual(configuredExtensionRuntime.listSourceProviders().map((provider) => provider.providerId), [
  "netease",
]);
