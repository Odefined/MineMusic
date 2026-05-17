import type { CanonicalRecord, Ref } from "../../src/contracts/index.js";
import { createCanonicalStore } from "../../src/canonical/index.js";
import { createInMemoryCanonicalRecordRepository } from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, "expected Result.ok");
  return awaited.value;
}

async function createsAndGetsProvisionalRecords(): Promise<void> {
  const store = createCanonicalStore({
    repository: createInMemoryCanonicalRecordRepository(),
    idFactory: () => "canonical-1",
  });
  const evidence: Ref = {
    namespace: "source:ncm",
    kind: "track",
    id: "188888",
  };

  const created = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Quiet Track",
      evidence: [evidence],
    }),
  );
  const loaded = await assertOk(store.get({ ref: created.ref }));

  assert(created.status === "provisional", "created record should be provisional");
  assert(created.ref.namespace === "minemusic", "canonical refs should be MineMusic-owned");
  assert(created.externalKeys?.[0]?.id === evidence.id, "source refs should be attached as evidence");
  assert(loaded?.ref.id === created.ref.id, "created record should be retrievable");
}

async function resolvesAndAttachesExternalRefsWithoutChangingAuthority(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const canonicalRef: Ref = {
    namespace: "minemusic",
    kind: "recording",
    id: "canonical-2",
  };
  const record: CanonicalRecord = {
    ref: canonicalRef,
    kind: "recording",
    label: "MineMusic Recording",
    status: "active",
  };
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "fixture-track",
  };
  const store = createCanonicalStore({ repository });

  await assertOk(repository.put(record));
  const updated = await assertOk(
    store.attachExternalRef({
      canonicalRef,
      externalRef: sourceRef,
    }),
  );
  const resolved = await assertOk(store.resolveExternalRef({ ref: sourceRef }));

  assert(updated.ref.id === canonicalRef.id, "external refs must not replace canonical identity");
  assert(updated.externalKeys?.[0]?.id === sourceRef.id, "external ref should be stored as evidence");
  assert(resolved?.ref.id === canonicalRef.id, "external ref should resolve to canonical record");
}

async function rejectsExternalRefConflicts(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const externalRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "shared-track",
  };
  const first: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "first" },
    kind: "recording",
    label: "First",
    status: "active",
    externalKeys: [externalRef],
  };
  const second: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "second" },
    kind: "recording",
    label: "Second",
    status: "active",
  };
  const store = createCanonicalStore({ repository });

  await assertOk(repository.put(first));
  await assertOk(repository.put(second));
  const result = await store.attachExternalRef({
    canonicalRef: second.ref,
    externalRef,
  });

  assert(!result.ok, "conflicting external refs should be rejected");
  assert(result.error.code === "canonical.external_ref_conflict", "conflict should use stable error code");
}

await createsAndGetsProvisionalRecords();
await resolvesAndAttachesExternalRefsWithoutChangingAuthority();
await rejectsExternalRefConflicts();
