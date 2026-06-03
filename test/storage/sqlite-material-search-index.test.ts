import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  MaterialSearchDocument,
  Ref,
  Result,
} from "../../src/contracts/index.js";
import type { MaterialSearchDocumentProviderPort } from "../../src/ports/index.js";
import { createSqliteMaterialSearchIndex } from "../../src/storage/index.js";

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

class MutableSearchDocuments implements MaterialSearchDocumentProviderPort {
  readonly documents = new Map<string, MaterialSearchDocument>();
  buildAllCount = 0;
  buildOneCount = 0;

  constructor(documents: MaterialSearchDocument[]) {
    for (const document of documents) {
      this.documents.set(refKey(document.materialRef), structuredClone(document));
    }
  }

  async buildSearchDocument({ materialRef }: { materialRef: Ref }): Promise<Result<MaterialSearchDocument | null>> {
    this.buildOneCount += 1;
    const document = this.documents.get(refKey(materialRef));
    return ok(document === undefined ? null : structuredClone(document));
  }

  async buildAllSearchDocuments(): Promise<Result<MaterialSearchDocument[]>> {
    this.buildAllCount += 1;
    return ok([...this.documents.values()].map((document) => structuredClone(document)));
  }
}

async function sqliteSearchIndexBootstrapsAndSearchesOnlyCandidateRefs(): Promise<void> {
  const blue = materialRef("blue-train");
  const red = materialRef("red-clay");
  const documents = new MutableSearchDocuments([
    {
      materialRef: blue,
      kind: "recording",
      canonicalLabel: "Midnight Blue",
      sourceTitle: ["Midnight Blue"],
      sourceArtistLabels: ["Kenny Burrell"],
    },
    {
      materialRef: red,
      kind: "recording",
      canonicalLabel: "Red Clay",
      sourceTitle: ["Red Clay"],
      sourceArtistLabels: ["Freddie Hubbard"],
    },
  ]);
  const index = createSqliteMaterialSearchIndex({ documents });

  const firstSearch = await assertOk(index.search({
    text: "Midnight",
    candidateMaterialRefs: [blue, red],
    limit: 10,
  }));
  const scopedOut = await assertOk(index.search({
    text: "Midnight",
    candidateMaterialRefs: [red],
    limit: 10,
  }));

  assert(documents.buildAllCount === 1, "empty SearchIndex should bootstrap through rebuildAll");
  assert(firstSearch.hits.length === 1, "text search should find indexed material");
  assert(firstSearch.hits[0]?.materialRef.id === blue.id, "search should return the matching material ref");
  assert(scopedOut.hits.length === 0, "search must not return hits outside candidateMaterialRefs");
}

async function sqliteSearchIndexReturnsFieldSpecificEvidence(): Promise<void> {
  const blue = materialRef("blue-train");
  const cjk = materialRef("cjk-title");
  const documents = new MutableSearchDocuments([
    {
      materialRef: blue,
      kind: "recording",
      canonicalLabel: "Blue Train",
      canonicalAliases: ["Blue Train alternate"],
      sourceTitle: ["Blue Train"],
      sourceArtistLabels: ["John Coltrane"],
      sourceReleaseLabel: ["Blue Train"],
    },
    {
      materialRef: cjk,
      kind: "recording",
      sourceTitle: ["青い列車"],
      sourceArtistLabels: ["Fixture Artist"],
    },
  ]);
  const index = createSqliteMaterialSearchIndex({ documents });

  const artistSearch = await assertOk(index.search({
    text: "Coltrane",
    candidateMaterialRefs: [blue, cjk],
    limit: 10,
  }));
  const cjkSearch = await assertOk(index.search({
    text: "青い",
    candidateMaterialRefs: [blue, cjk],
    limit: 10,
  }));
  const evidenceFields = (artistSearch.hits[0]?.evidence ?? []).map((evidence) => evidence.field);
  const evidenceFieldNames = evidenceFields.map((field) => String(field));
  const cjkEvidence = cjkSearch.hits[0]?.evidence ?? [];

  assert(artistSearch.hits[0]?.materialRef.id === blue.id, "artist label should recall the recording");
  assert(
    evidenceFields.includes("source_artist_labels"),
    "evidence should use field-specific source_artist_labels",
  );
  assert(
    !evidenceFieldNames.some((field) => field === "source_text" || field === "context_text"),
    "coarse source_text/context_text evidence fields must not exist",
  );
  assert(cjkSearch.hits[0]?.materialRef.id === cjk.id, "substring search should support CJK-like text");
  assert(
    cjkEvidence.some((evidence) => evidence.field === "source_title" && evidence.matchKind === "substring"),
    "CJK substring evidence should remain field-specific",
  );
}

async function sqliteSearchIndexRefreshesDirtyDocumentsAndDeletesMissingOnes(): Promise<void> {
  const material = materialRef("dirty-recording");
  const documents = new MutableSearchDocuments([
    {
      materialRef: material,
      kind: "recording",
      canonicalLabel: "Old Name",
    },
  ]);
  const index = createSqliteMaterialSearchIndex({ documents });

  await assertOk(index.rebuildAll());
  assert(
    (await assertOk(index.search({ text: "Old", candidateMaterialRefs: [material] }))).hits.length === 1,
    "initial rebuild should index the original document",
  );

  documents.documents.set(refKey(material), {
    materialRef: material,
    kind: "recording",
    canonicalLabel: "New Name",
  });
  await assertOk(index.markDirty({ materialRef: material }));
  await assertOk(index.refreshDirty({ materialRefs: [material] }));

  assert(
    (await assertOk(index.search({ text: "Old", candidateMaterialRefs: [material] }))).hits.length === 0,
    "dirty refresh should remove old text",
  );
  assert(
    (await assertOk(index.search({ text: "New", candidateMaterialRefs: [material] }))).hits.length === 1,
    "dirty refresh should index updated text",
  );

  documents.documents.delete(refKey(material));
  await assertOk(index.markDirty({ materialRef: material }));
  await assertOk(index.refreshDirty({ materialRefs: [material] }));

  assert(
    (await assertOk(index.search({ text: "New", candidateMaterialRefs: [material] }))).hits.length === 0,
    "dirty refresh should delete documents that no longer build",
  );
}

async function sqliteSearchIndexPersistsDirtyRowsAcrossReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-material-search-"));
  const databasePath = join(directory, "material-search.sqlite");
  const material = materialRef("persisted-dirty-recording");

  try {
    const firstDocuments = new MutableSearchDocuments([
      {
        materialRef: material,
        kind: "recording",
        canonicalLabel: "Persisted Old",
      },
    ]);
    const firstIndex = createSqliteMaterialSearchIndex({
      path: databasePath,
      documents: firstDocuments,
      now: () => "2026-06-04T00:00:00.000Z",
    });
    await assertOk(firstIndex.rebuildAll());
    await assertOk(firstIndex.markDirty({ materialRef: material }));

    const secondDocuments = new MutableSearchDocuments([
      {
        materialRef: material,
        kind: "recording",
        canonicalLabel: "Persisted Fresh",
      },
    ]);
    const secondIndex = createSqliteMaterialSearchIndex({
      path: databasePath,
      documents: secondDocuments,
    });
    await assertOk(secondIndex.refreshDirty({ materialRefs: [material] }));
    const search = await assertOk(secondIndex.search({
      text: "Fresh",
      candidateMaterialRefs: [material],
      limit: 10,
    }));

    assert(secondDocuments.buildOneCount === 1, "dirty rows should survive SearchIndex reopen");
    assert(search.hits.length === 1, "reopened SearchIndex should refresh persisted dirty rows");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function materialRef(id: string): Ref {
  return {
    namespace: "minemusic",
    kind: "material",
    id,
  };
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

await sqliteSearchIndexBootstrapsAndSearchesOnlyCandidateRefs();
await sqliteSearchIndexReturnsFieldSpecificEvidence();
await sqliteSearchIndexRefreshesDirtyDocumentsAndDeletesMissingOnes();
await sqliteSearchIndexPersistsDirtyRowsAcrossReopen();
