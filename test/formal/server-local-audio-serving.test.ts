import assert from "node:assert/strict";

import {
  createInMemoryLocalAudioTokenStore,
  createLocalAudioFileResolver,
  createLocalAudioRootDirResolver,
  planByteRange,
} from "../../src/server/local_audio_serving.js";
import { resolveUnderRoot } from "../../src/server/local_source_path_resolver.js";

{
  let now = "2026-07-02T00:00:00.000Z";
  let tokenCounter = 0;
  const store = createInMemoryLocalAudioTokenStore({
    ttlMs: 1000,
    clock: () => now,
    tokenFactory: () => `token-${++tokenCounter}`,
  });

  const minted = await store.mint({
    ownerScope: "owner-a",
    rootId: "main",
    relativePath: "tracks/a.mp3",
  });

  assert.deepEqual(minted, {
    token: "token-1",
    expiresAt: "2026-07-02T00:00:01.000Z",
  });
  assert.deepEqual(await store.resolve({ token: minted.token }), {
    kind: "resolved",
    anchor: {
      ownerScope: "owner-a",
      rootId: "main",
      relativePath: "tracks/a.mp3",
      expiresAt: "2026-07-02T00:00:01.000Z",
    },
  });

  now = "2026-07-02T00:00:01.000Z";
  assert.deepEqual(await store.resolve({ token: minted.token }), { kind: "expired" });
  assert.deepEqual(await store.resolve({ token: minted.token }), { kind: "not_found" });
}

{
  const resolveRootDir = createLocalAudioRootDirResolver({
    mainRootDir: "/music/main",
    scanRoots: [{ rootId: "scan-a", rootDir: "/music/scan-a" }],
  });
  assert.equal(resolveRootDir("main"), "/music/main");
  assert.equal(resolveRootDir("scan-a"), "/music/scan-a");
  assert.equal(resolveRootDir("missing"), undefined);

  const resolver = createLocalAudioFileResolver({
    resolveRootDir,
  });

  assert.deepEqual(resolver.resolve({
    rootId: "main",
    relativePath: "tracks/a.mp3",
  }), {
    ok: true,
    value: {
      absolutePath: "/music/main/tracks/a.mp3",
    },
  });
  assert.deepEqual(resolver.resolve({
    rootId: "scan-a",
    relativePath: "tracks/a.mp3",
  }), {
    ok: true,
    value: {
      absolutePath: "/music/scan-a/tracks/a.mp3",
    },
  });

  const missing = resolver.resolve({
    rootId: "missing",
    relativePath: "tracks/a.mp3",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "server_host.local_audio_root_unavailable");
    assert.equal(missing.error.area, "server_host");
    assert.equal(missing.error.retryable, true);
  }

  assert.throws(() => resolver.resolve({
    rootId: "main",
    relativePath: "../escape.mp3",
  }), /relativePath must not escape its root/u);
  assert.throws(() => resolveUnderRoot("/music/root", "../escape.mp3"), /resolves outside root/u);
}

{
  assert.deepEqual(planByteRange({ sizeBytes: 100 }), {
    kind: "full",
    status: 200,
    start: 0,
    end: 99,
    contentLength: 100,
  });
  assert.deepEqual(planByteRange({ sizeBytes: 100, rangeHeader: "bytes=10-19" }), {
    kind: "partial",
    status: 206,
    start: 10,
    end: 19,
    contentLength: 10,
    contentRange: "bytes 10-19/100",
  });
  assert.deepEqual(planByteRange({ sizeBytes: 100, rangeHeader: "bytes=90-" }), {
    kind: "partial",
    status: 206,
    start: 90,
    end: 99,
    contentLength: 10,
    contentRange: "bytes 90-99/100",
  });
  assert.deepEqual(planByteRange({ sizeBytes: 100, rangeHeader: "bytes=-10" }), {
    kind: "partial",
    status: 206,
    start: 90,
    end: 99,
    contentLength: 10,
    contentRange: "bytes 90-99/100",
  });
  assert.deepEqual(planByteRange({ sizeBytes: 100, rangeHeader: "bytes=100-200" }), {
    kind: "unsatisfiable",
    status: 416,
    contentRange: "bytes */100",
  });
  assert.deepEqual(planByteRange({ sizeBytes: 100, rangeHeader: "items=0-1" }), {
    kind: "unsatisfiable",
    status: 416,
    contentRange: "bytes */100",
  });
}
