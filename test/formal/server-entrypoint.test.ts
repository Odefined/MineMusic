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
    "library-import",
    "library-relation",
    "music-discovery",
    "music-experience",
    "runtime-status",
  ],
);
assert.deepEqual(
  snapshot.interfaceContract?.tools?.map((tool) => tool.name),
  [
    "library.import.list_sources",
    "library.import.start",
    "library.import.continue",
    "library.import.status",
    "library.relation.get",
    "library.relation.save",
    "library.relation.unsave",
    "library.relation.favorite",
    "library.relation.unfavorite",
    "library.relation.block",
    "library.relation.unblock",
    "music.discovery.list_scopes",
    "music.discovery.lookup",
    "music.experience.present",
    "stage.runtime.status",
  ],
);
