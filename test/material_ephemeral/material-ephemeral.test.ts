import type {
  Ref,
  Result,
  SourceMaterial,
} from "../../src/contracts/index.js";
import { createInMemoryEphemeralMaterialStore } from "../../src/material/ephemeral/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

function sourceMaterial(label: string, sourceRef: Ref): SourceMaterial {
  return {
    id: `source:${sourceRef.id}`,
    kind: "recording",
    label,
    state: "source_only_playable",
    sourceRefs: [sourceRef],
    playableLinks: [{
      url: `https://example.test/${sourceRef.id}`,
      sourceRef,
    }],
  };
}

async function storeKeysEntriesByFullRefIdentity(): Promise<void> {
  let currentTime = "2026-06-04T00:00:00.000Z";
  const store = createInMemoryEphemeralMaterialStore({
    now: () => currentTime,
    ttlMs: 60_000,
    maxEntriesPerSession: 5,
  });
  const ephemeralRef = ref("minemusic", "ephemeral_material", "shared-id");

  await assertOk(
    store.put({
      materialRef: ephemeralRef,
      ownerScope: "local_profile:default",
      sessionId: "session-a",
      material: sourceMaterial("Shared Track", ref("source:fixture", "track", "shared-track")),
    }),
  );

  const stored = await assertOk(store.get({ materialRef: ephemeralRef }));
  const durableMiss = await assertOk(store.get({ materialRef: ref("minemusic", "material", "shared-id") }));
  const namespaceMiss = await assertOk(store.get({ materialRef: ref("other", "ephemeral_material", "shared-id") }));

  assert(stored?.material.label === "Shared Track", "store should return the exact ephemeral entry");
  assert(durableMiss === null, "store should not fall back from mat:* raw ids to emat:* entries");
  assert(namespaceMiss === null, "store should key entries by full ref identity, not raw id alone");
}

async function storeCleansExpiredAndOversizedSessionEntries(): Promise<void> {
  let currentTime = "2026-06-04T00:00:00.000Z";
  const store = createInMemoryEphemeralMaterialStore({
    now: () => currentTime,
    ttlMs: 5 * 60_000,
    maxEntriesPerSession: 2,
  });
  const session = { ownerScope: "local_profile:default", sessionId: "session-b" };
  const firstRef = ref("minemusic", "ephemeral_material", "first");
  const secondRef = ref("minemusic", "ephemeral_material", "second");
  const thirdRef = ref("minemusic", "ephemeral_material", "third");

  await assertOk(store.put({
    materialRef: firstRef,
    ...session,
    material: sourceMaterial("First", ref("source:fixture", "track", "first")),
  }));
  currentTime = "2026-06-04T00:01:00.000Z";
  await assertOk(store.put({
    materialRef: secondRef,
    ...session,
    material: sourceMaterial("Second", ref("source:fixture", "track", "second")),
  }));
  currentTime = "2026-06-04T00:02:00.000Z";
  await assertOk(store.put({
    materialRef: thirdRef,
    ...session,
    material: sourceMaterial("Third", ref("source:fixture", "track", "third")),
  }));

  const firstMissing = await assertOk(store.get({ materialRef: firstRef }));
  const secondStored = await assertOk(store.get({ materialRef: secondRef }));
  const thirdStored = await assertOk(store.get({ materialRef: thirdRef }));

  assert(firstMissing === null, "per-session cleanup should evict the oldest entry beyond the size cap");
  assert(secondStored?.material.label === "Second", "cleanup should keep newer session entries");
  assert(thirdStored?.material.label === "Third", "cleanup should keep the newest session entry");

  currentTime = "2026-06-04T00:03:00.000Z";
  const replaced = await assertOk(store.cleanup({
    ...session,
    keepMaterialRefs: [thirdRef],
  }));
  const secondAfterReplace = await assertOk(store.get({ materialRef: secondRef }));
  const thirdAfterReplace = await assertOk(store.get({ materialRef: thirdRef }));

  assert(replaced === 1, "session replacement cleanup should remove stale entries outside the keep set");
  assert(secondAfterReplace === null, "cleanup should drop stale session entries not kept");
  assert(thirdAfterReplace?.material.label === "Third", "cleanup should preserve kept entries");
}

async function storeDropsExpiredEntriesOnReadAndDelete(): Promise<void> {
  let currentTime = "2026-06-04T00:00:00.000Z";
  const store = createInMemoryEphemeralMaterialStore({
    now: () => currentTime,
    ttlMs: 60_000,
  });
  const expiringRef = ref("minemusic", "ephemeral_material", "expiring");

  await assertOk(store.put({
    materialRef: expiringRef,
    ownerScope: "local_profile:default",
    sessionId: "session-c",
    material: sourceMaterial("Expiring", ref("source:fixture", "track", "expiring")),
  }));

  currentTime = "2026-06-04T00:02:00.000Z";
  const expired = await assertOk(store.get({ materialRef: expiringRef }));
  const deleted = await assertOk(store.delete({ materialRef: expiringRef }));

  assert(expired === null, "expired entries should disappear instead of surviving by raw id");
  assert(deleted === false, "expired entries should already be removed before delete");
}

await storeKeysEntriesByFullRefIdentity();
await storeCleansExpiredAndOversizedSessionEntries();
await storeDropsExpiredEntriesOnReadAndDelete();
