import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Ref, Result } from "../../src/contracts/index.js";
import { createSqliteMaterialRegistryRepository } from "../../src/storage/index.js";

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

async function assertError<T>(result: Promise<Result<T>>, code: string): Promise<void> {
  const awaited = await result;
  assert(!awaited.ok, `expected ${code} but operation succeeded`);
  assert(awaited.error.code === code, `expected ${code} but received ${awaited.error.code}`);
}

async function sqliteRegistryPersistsRecordsAndIndexesAcrossReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-material-registry-"));
  const databasePath = join(directory, "material-store.sqlite");
  const sourceRef = ref("source:fixture", "track", "track-1");
  const attachedSourceRef = ref("source:fixture", "track", "track-2");
  const canonicalRef = ref("minemusic", "recording", "canonical-1");
  const survivorCanonicalRef = ref("minemusic", "recording", "canonical-2");
  let id = 0;

  try {
    const firstRepository = createSqliteMaterialRegistryRepository({
      path: databasePath,
      generateId: () => `material-${id += 1}`,
      now: () => "2026-05-30T00:00:00.000Z",
    });
    const sourceRecord = await assertOk(
      firstRepository.getOrCreateBySourceRef({
        sourceRef,
        kind: "recording",
      }),
    );
    await assertOk(
      firstRepository.attachSourceRef({
        materialRef: sourceRecord.materialRef,
        sourceRef: attachedSourceRef,
      }),
    );
    const promoted = await assertOk(
      firstRepository.promoteToCanonical({
        materialRef: sourceRecord.materialRef,
        canonicalRef,
      }),
    );
    promoted.sourceRefs.push(ref("source:fixture", "track", "mutated"));

    const survivor = await assertOk(
      firstRepository.getOrCreateByCanonicalRef({
        canonicalRef: survivorCanonicalRef,
        kind: "recording",
      }),
    );
    await assertOk(
      firstRepository.mergeMaterials({
        from: sourceRecord.materialRef,
        into: survivor.materialRef,
        reason: "same recording",
      }),
    );

    const reopenedRepository = createSqliteMaterialRegistryRepository({ path: databasePath });
    const reloadedByMaterialRef = await assertOk(
      reopenedRepository.getMaterialRecord({
        materialRef: sourceRecord.materialRef,
      }),
    );
    const reloadedBySourceRef = await assertOk(
      reopenedRepository.findMaterialBySourceRef({
        sourceRef: attachedSourceRef,
      }),
    );
    const reloadedByCanonicalRef = await assertOk(
      reopenedRepository.findMaterialByCanonicalRef({
        canonicalRef,
      }),
    );
    const repeatedSourceRecord = await assertOk(
      reopenedRepository.getOrCreateBySourceRef({
        sourceRef,
        kind: "recording",
      }),
    );
    const repeatedCanonicalRecord = await assertOk(
      reopenedRepository.getOrCreateByCanonicalRef({
        canonicalRef,
        kind: "recording",
      }),
    );
    const redirect = await assertOk(
      reopenedRepository.resolveMaterialRedirect({
        materialRef: sourceRecord.materialRef,
      }),
    );

    assert(reloadedByMaterialRef?.status === "merged", "reopened repository should persist material records");
    assert(
      reloadedByMaterialRef.sourceRefs.every((candidate) => candidate.id !== "mutated"),
      "SQLite registry should return defensive copies",
    );
    assert(
      reloadedBySourceRef?.materialRef.id === survivor.materialRef.id,
      "source ref lookup should survive repository reopen and follow redirects",
    );
    assert(
      reloadedByCanonicalRef?.materialRef.id === survivor.materialRef.id,
      "canonical ref lookup should survive repository reopen and follow redirects",
    );
    assert(
      repeatedSourceRecord.materialRef.id === survivor.materialRef.id,
      "same source ref should remain unique across repository reopen and return the survivor",
    );
    assert(
      repeatedCanonicalRecord.materialRef.id === survivor.materialRef.id,
      "same canonical ref should remain unique across repository reopen and return the survivor",
    );
    assert(redirect.id === survivor.materialRef.id, "redirect should survive repository reopen");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function sqliteRegistryEnforcesCanonicalPromotionMonotonicity(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-material-registry-"));
  const databasePath = join(directory, "material-store.sqlite");
  const sourceRef = ref("source:fixture", "track", "track-monotonic");
  const canonicalRef = ref("minemusic", "recording", "canonical-1");
  const replacementCanonicalRef = ref("minemusic", "recording", "canonical-2");
  let id = 0;

  try {
    const repository = createSqliteMaterialRegistryRepository({
      path: databasePath,
      generateId: () => `material-${id += 1}`,
      now: () => "2026-05-30T00:00:00.000Z",
    });
    const sourceRecord = await assertOk(
      repository.getOrCreateBySourceRef({
        sourceRef,
        kind: "recording",
      }),
    );
    await assertOk(
      repository.promoteToCanonical({
        materialRef: sourceRecord.materialRef,
        canonicalRef,
      }),
    );

    await assertError(
      repository.promoteToCanonical({
        materialRef: sourceRecord.materialRef,
        canonicalRef: replacementCanonicalRef,
      }),
      "material_registry.conflict",
    );

    const foundByOriginalCanonical = await assertOk(
      repository.findMaterialByCanonicalRef({
        canonicalRef,
      }),
    );
    const foundByReplacementCanonical = await assertOk(
      repository.findMaterialByCanonicalRef({
        canonicalRef: replacementCanonicalRef,
      }),
    );

    assert(
      foundByOriginalCanonical?.canonicalRef !== undefined &&
        sameRef(foundByOriginalCanonical.canonicalRef, canonicalRef),
      "original canonical binding should remain intact",
    );
    assert(foundByReplacementCanonical === null, "replacement canonical ref should not be indexed");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function sqliteRegistryRejectsSelfMerge(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-material-registry-"));
  const databasePath = join(directory, "material-store.sqlite");
  let id = 0;

  try {
    const repository = createSqliteMaterialRegistryRepository({
      path: databasePath,
      generateId: () => `material-${id += 1}`,
      now: () => "2026-05-30T00:00:00.000Z",
    });
    const sourceRecord = await assertOk(
      repository.getOrCreateBySourceRef({
        sourceRef: ref("source:fixture", "track", "track-self-merge"),
        kind: "recording",
      }),
    );

    await assertError(
      repository.mergeMaterials({
        from: sourceRecord.materialRef,
        into: sourceRecord.materialRef,
        reason: "same material",
      }),
      "material_registry.conflict",
    );

    const redirect = await assertOk(
      repository.resolveMaterialRedirect({
        materialRef: sourceRecord.materialRef,
      }),
    );
    assert(sameRef(redirect, sourceRecord.materialRef), "self-merge should not create a redirect");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

await sqliteRegistryPersistsRecordsAndIndexesAcrossReopen();
await sqliteRegistryEnforcesCanonicalPromotionMonotonicity();
await sqliteRegistryRejectsSelfMerge();
