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
      reloadedBySourceRef?.materialRef.id === sourceRecord.materialRef.id,
      "source ref lookup should survive repository reopen",
    );
    assert(
      reloadedByCanonicalRef?.materialRef.id === sourceRecord.materialRef.id,
      "canonical ref lookup should survive repository reopen",
    );
    assert(
      repeatedSourceRecord.materialRef.id === sourceRecord.materialRef.id,
      "same source ref should remain unique across repository reopen",
    );
    assert(
      repeatedCanonicalRecord.materialRef.id === sourceRecord.materialRef.id,
      "same canonical ref should remain unique across repository reopen",
    );
    assert(redirect.id === survivor.materialRef.id, "redirect should survive repository reopen");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

await sqliteRegistryPersistsRecordsAndIndexesAcrossReopen();
