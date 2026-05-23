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

async function createProvisionalReusesExistingEvidence(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "same-track",
  };
  const store = createCanonicalStore({
    repository,
    idFactory: (() => {
      const ids = ["first-canonical", "duplicate-canonical"];

      return () => ids.shift() ?? "unexpected-canonical";
    })(),
  });
  const first = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "First Label",
      evidence: [sourceRef],
    }),
  );
  const second = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Different Label",
      evidence: [sourceRef],
    }),
  );
  const records = await assertOk(repository.list());

  assert(second.ref.id === first.ref.id, "same external evidence should reuse canonical identity");
  assert(records.length === 1, "reused evidence should not create duplicate provisional records");
}

async function createProvisionalReusesExistingNormalizedLabel(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const store = createCanonicalStore({
    repository,
    idFactory: (() => {
      const ids = ["first-label", "duplicate-label"];

      return () => ids.shift() ?? "unexpected-label";
    })(),
  });
  const first = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Quiet   Coding Track",
    }),
  );
  const second = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: " quiet coding track ",
    }),
  );
  const records = await assertOk(repository.list());

  assert(second.ref.id === first.ref.id, "same normalized label should reuse canonical identity");
  assert(records.length === 1, "reused label should not create duplicate provisional records");
}

async function createProvisionalReusesExistingAlias(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const canonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "alias-provisional-reuse" },
    kind: "recording",
    label: "Aruarian Dance",
    status: "active",
    aliases: ["Aruarian Dance - Nujabes"],
  };
  const store = createCanonicalStore({
    repository,
    idFactory: () => "duplicate-alias",
  });

  await assertOk(repository.put(canonical));

  const reused = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: " aruarian   dance - nujabes ",
    }),
  );
  const records = await assertOk(repository.list());

  assert(reused.ref.id === canonical.ref.id, "alias match should reuse canonical identity");
  assert(records.length === 1, "reused alias should not create duplicate provisional records");
}

async function findsCurrentRecordsByAlias(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const canonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "alias-track" },
    kind: "recording",
    label: "Aruarian Dance",
    status: "active",
    aliases: ["Aruarian Dance - Nujabes"],
  };
  const store = createCanonicalStore({ repository });

  await assertOk(repository.put(canonical));

  const matches = await assertOk(
    store.findByLabel({
      label: " aruarian   dance - nujabes ",
      kind: "recording",
    }),
  );

  assert(matches.length === 1, "alias lookup should return current canonical records");
  assert(matches[0]?.ref.id === canonical.ref.id, "alias lookup should return the aliased record");
}

async function resolveExternalRefIgnoresHistoricalRecords(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "historical-track",
  };
  const rejected: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "rejected-track" },
    kind: "recording",
    label: "Rejected Track",
    status: "rejected",
    externalKeys: [sourceRef],
  };
  const store = createCanonicalStore({ repository });

  await assertOk(repository.put(rejected));

  const resolved = await assertOk(store.resolveExternalRef({ ref: sourceRef }));

  assert(resolved === null, "historical records should not resolve as current identity");
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

async function attachesSameExternalRefIdempotently(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const canonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "idempotent" },
    kind: "recording",
    label: "Idempotent Track",
    status: "active",
  };
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "idempotent-track",
  };
  const store = createCanonicalStore({ repository });

  await assertOk(repository.put(canonical));
  await assertOk(store.attachExternalRef({ canonicalRef: canonical.ref, externalRef: sourceRef }));
  const updated = await assertOk(store.attachExternalRef({ canonicalRef: canonical.ref, externalRef: sourceRef }));

  assert(updated.externalKeys?.length === 1, "same external ref should be attached once");
}

await createsAndGetsProvisionalRecords();
await resolvesAndAttachesExternalRefsWithoutChangingAuthority();
await createProvisionalReusesExistingEvidence();
await createProvisionalReusesExistingNormalizedLabel();
await createProvisionalReusesExistingAlias();
await findsCurrentRecordsByAlias();
await resolveExternalRefIgnoresHistoricalRecords();
await rejectsExternalRefConflicts();
await attachesSameExternalRefIdempotently();
