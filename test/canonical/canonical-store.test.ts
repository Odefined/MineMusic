import type { CanonicalRecord, Ref } from "../../src/contracts/index.js";
import { createCanonicalStore } from "../../src/material_store/canonical/index.js";
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
  assert(created.sourceRefs?.[0]?.id === evidence.id, "source refs should be attached as evidence");
  assert(loaded?.ref.id === created.ref.id, "created record should be retrievable");
}

async function resolvesAndAttachesSourceRefsWithoutChangingAuthority(): Promise<void> {
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
    store.attachSourceRef({
      canonicalRef,
      sourceRef: sourceRef,
    }),
  );
  const resolved = await assertOk(store.resolveSourceRef({ ref: sourceRef }));

  assert(updated.ref.id === canonicalRef.id, "source refs must not replace canonical identity");
  assert(updated.sourceRefs?.[0]?.id === sourceRef.id, "source ref should be stored as evidence");
  assert(resolved?.ref.id === canonicalRef.id, "source ref should resolve to canonical record");
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

  assert(second.ref.id === first.ref.id, "same source-ref evidence should reuse canonical identity");
  assert(records.length === 1, "reused evidence should not create duplicate provisional records");
}

async function createProvisionalDoesNotReuseByNormalizedLabelOnly(): Promise<void> {
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
      evidence: [
        {
          namespace: "source:fixture",
          kind: "track",
          id: "first-track",
        },
      ],
    }),
  );
  const second = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: " quiet coding track ",
      evidence: [
        {
          namespace: "source:fixture",
          kind: "track",
          id: "second-track",
        },
      ],
    }),
  );
  const records = await assertOk(repository.list());

  assert(second.ref.id !== first.ref.id, "same normalized label alone should not prove canonical identity");
  assert(records.length === 2, "label-only matches should remain separate provisional records");
}

async function createProvisionalDoesNotReuseByAliasOnly(): Promise<void> {
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
      evidence: [
        {
          namespace: "source:fixture",
          kind: "track",
          id: "different-track",
        },
      ],
    }),
  );
  const records = await assertOk(repository.list());

  assert(reused.ref.id !== canonical.ref.id, "alias match alone should not prove canonical identity");
  assert(records.length === 2, "alias-only matches should remain separate provisional records");
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

async function resolveSourceRefIgnoresHistoricalRecords(): Promise<void> {
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
    sourceRefs: [sourceRef],
  };
  const store = createCanonicalStore({ repository });

  await assertOk(repository.put(rejected));

  const resolved = await assertOk(store.resolveSourceRef({ ref: sourceRef }));

  assert(resolved === null, "historical records should not resolve as current identity");
}

async function rejectsSourceRefConflicts(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "shared-track",
  };
  const first: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "first" },
    kind: "recording",
    label: "First",
    status: "active",
    sourceRefs: [sourceRef],
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
  const result = await store.attachSourceRef({
    canonicalRef: second.ref,
    sourceRef,
  });

  assert(!result.ok, "conflicting source refs should be rejected");
  assert(result.error.code === "canonical.source_ref_conflict", "conflict should use stable error code");
}

async function attachesSameSourceRefIdempotently(): Promise<void> {
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
  await assertOk(store.attachSourceRef({ canonicalRef: canonical.ref, sourceRef: sourceRef }));
  const updated = await assertOk(store.attachSourceRef({ canonicalRef: canonical.ref, sourceRef: sourceRef }));

  assert(updated.sourceRefs?.length === 1, "same source ref should be attached once");
}

async function recordsAndListsProvisionalRelations(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "relation-track",
  };
  const store = createCanonicalStore({
    repository,
    idFactory: () => "relation-canonical",
    clock: () => "2026-05-25T00:00:00.000Z",
  });
  const created = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Relation Track",
      evidence: [sourceRef],
    }),
  );

  const relations = await assertOk(
    store.recordProvisionalRelations({
      subjectRef: created.ref,
      sourceRef,
      providerId: "fixture",
      batchId: "batch-1",
      relations: [
        {
          predicate: "performed_by",
          objectKind: "artist",
          objectLabel: "Fixture Artist",
        },
        {
          predicate: "has_duration_ms",
          objectKind: "duration_ms",
          objectValue: 123456,
        },
      ],
    }),
  );
  const listed = await assertOk(store.listRelations({ subjectRef: created.ref }));
  const performedBy = await assertOk(
    store.listRelations({
      subjectRef: created.ref,
      predicate: "performed_by",
    }),
  );

  assert(relations.length === 2, "provisional relation recording should return stored relations");
  assert(listed.length === 2, "provisional relations should be listed by subject");
  assert(performedBy[0]?.objectLabel === "Fixture Artist", "relation lookup should keep object labels");
  assert(performedBy[0]?.status === "provisional", "new relations should be provisional");
}

async function recordsAndListsProvisionalHintsForRecordings(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "hint-track",
  };
  const store = createCanonicalStore({
    repository,
    idFactory: () => "hint-canonical",
    clock: (() => {
      const times = [
        "2026-05-25T00:00:00.000Z",
        "2026-05-25T00:01:00.000Z",
      ];

      return () => times.shift() ?? "2026-05-25T00:02:00.000Z";
    })(),
  });
  const created = await assertOk(
    store.createProvisional({
      kind: "recording",
      label: "Hint Track",
      evidence: [sourceRef],
    }),
  );

  const hints = await assertOk(
    store.recordProvisionalHints({
      subjectRef: created.ref,
      sourceRef,
      providerId: "fixture",
      batchId: "batch-1",
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Hint Track",
            artistLabels: ["Fixture Artist"],
            releaseLabel: "Fixture Release",
            durationMs: 123456,
            trackPosition: {
              discNumber: "1",
              trackNumber: 2,
              trackCount: 10,
            },
          },
        },
      ],
    }),
  );
  const updated = await assertOk(
    store.recordProvisionalHints({
      subjectRef: created.ref,
      sourceRef,
      providerId: "fixture",
      batchId: "batch-2",
      hints: [
        {
          kind: "source_recording_context",
          facts: {
            title: "Hint Track",
            durationMs: 123456,
            trackPosition: {
              discNumber: "1",
              trackNumber: 2,
              trackCount: 12,
            },
          },
        },
      ],
    }),
  );
  const listed = await assertOk(store.listProvisionalHints({ subjectRef: created.ref }));
  const filtered = await assertOk(
    store.listProvisionalHints({
      sourceRef,
      kind: "source_recording_context",
    }),
  );

  assert(hints.length === 1, "provisional hint recording should return stored hints");
  assert(listed.length === 1, "provisional hints should upsert by subject/source/kind");
  assert(filtered[0]?.facts.trackPosition?.trackCount === 12, "updated hints should replace facts");
  assert(updated[0]?.createdAt === "2026-05-25T00:00:00.000Z", "hint upserts should preserve createdAt");
  assert(updated[0]?.updatedAt === "2026-05-25T00:01:00.000Z", "hint upserts should update updatedAt");
}

async function rejectsProvisionalHintsForMissingOrNonProvisionalSubjects(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "invalid-hint-track",
  };
  const activeRecord: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "active-hint-recording" },
    kind: "recording",
    label: "Active Hint Recording",
    status: "active",
    sourceRefs: [sourceRef],
  };
  const store = createCanonicalStore({ repository });

  await assertOk(repository.put(activeRecord));

  const missing = await store.recordProvisionalHints({
    subjectRef: { namespace: "minemusic", kind: "recording", id: "missing-hint-recording" },
    sourceRef,
    hints: [{ kind: "source_recording_context", facts: { title: "Missing" } }],
  });
  const active = await store.recordProvisionalHints({
    subjectRef: activeRecord.ref,
    sourceRef,
    hints: [{ kind: "source_recording_context", facts: { title: "Active" } }],
  });

  assert(!missing.ok, "missing hint subject should be rejected");
  assert(missing.error.code === "canonical.not_found", "missing subjects should use canonical.not_found");
  assert(!active.ok, "active records should not accept provisional hints");
  assert(
    active.error.code === "canonical.provisional_hint_invalid_subject",
    "non-provisional hint subjects should use a stable canonical error code",
  );
}

async function rejectsRecordingContextHintsForNonRecordingSubjects(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "artist",
    id: "hint-artist",
  };
  const store = createCanonicalStore({
    repository,
    idFactory: () => "hint-artist-canonical",
  });
  const created = await assertOk(
    store.createProvisional({
      kind: "artist",
      label: "Hint Artist",
      evidence: [sourceRef],
    }),
  );

  const result = await store.recordProvisionalHints({
    subjectRef: created.ref,
    sourceRef,
    hints: [{ kind: "source_recording_context", facts: { title: "Not A Recording" } }],
  });

  assert(!result.ok, "recording context hints should reject non-recording subjects");
  assert(
    result.error.code === "canonical.provisional_hint_invalid_subject",
    "non-recording subjects should use a stable canonical error code",
  );
}

await createsAndGetsProvisionalRecords();
await resolvesAndAttachesSourceRefsWithoutChangingAuthority();
await createProvisionalReusesExistingEvidence();
await createProvisionalDoesNotReuseByNormalizedLabelOnly();
await createProvisionalDoesNotReuseByAliasOnly();
await findsCurrentRecordsByAlias();
await resolveSourceRefIgnoresHistoricalRecords();
await rejectsSourceRefConflicts();
await attachesSameSourceRefIdempotently();
await recordsAndListsProvisionalRelations();
await recordsAndListsProvisionalHintsForRecordings();
await rejectsProvisionalHintsForMissingOrNonProvisionalSubjects();
await rejectsRecordingContextHintsForNonRecordingSubjects();
