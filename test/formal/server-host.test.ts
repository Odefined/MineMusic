import assert from "node:assert/strict";

import { createServerHost } from "../../src/server/index.js";

const host = createServerHost();

assert.equal(host.snapshot().status, "created");
assert.equal(host.snapshot().interfaceContract.tools.length, 0);

const started = await host.start();

assert.equal(started.ok, true);
assert.equal(host.snapshot().status, "ready");
assert.equal(host.snapshot().interfaceContract.tools[0]?.name, "stage.runtime.status");

const stopped = await host.stop();

assert.equal(stopped.ok, true);
assert.equal(host.snapshot().status, "stopped");

const stoppedAgain = await host.stop();

assert.equal(stoppedAgain.ok, true);
assert.equal(host.snapshot().status, "stopped");
