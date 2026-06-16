import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const output = execFileSync(
  process.execPath,
  [join(process.cwd(), ".tmp-test/src/server/index.js")],
  {
    encoding: "utf8",
    timeout: 3000,
  },
);

const snapshot = JSON.parse(output) as {
  status?: unknown;
  modules?: unknown;
  interfaceContract?: {
    tools?: readonly {
      name?: unknown;
    }[];
  };
};

assert.equal(snapshot.status, "ready");
assert.deepEqual(
  Array.isArray(snapshot.modules)
    ? snapshot.modules.map((module) =>
      typeof module === "object" && module !== null && "id" in module
        ? module.id
        : undefined
    )
    : [],
  [
    "music-data-platform",
    "extension",
    "music-discovery",
    "runtime-status",
  ],
);
assert.equal(snapshot.interfaceContract?.tools?.[0]?.name, "music.discovery.list_scopes");
assert.equal(snapshot.interfaceContract?.tools?.[1]?.name, "stage.runtime.status");
