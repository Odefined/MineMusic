import assert from "node:assert/strict";
import { assertRefSafe, refKey } from "../../src/contracts/index.js";
const sourceRef = {
    namespace: "source_netease",
    kind: "track",
    id: "1901371647",
};
const canonicalRef = {
    namespace: "canonical_minemusic",
    kind: "recording",
    id: "canonical-1",
};
assert.equal(refKey(sourceRef), "source_netease:track:1901371647");
assert.equal(refKey(canonicalRef), "canonical_minemusic:recording:canonical-1");
assert.doesNotThrow(() => assertRefSafe(sourceRef));
assert.doesNotThrow(() => assertRefSafe(canonicalRef));
assert.throws(() => refKey({ namespace: "source:netease", kind: "track", id: "1" }));
assert.throws(() => refKey({ namespace: "source_netease", kind: "", id: "1" }));
