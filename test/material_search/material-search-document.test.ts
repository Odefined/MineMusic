import type {
  CanonicalRecord,
  MaterialRecord,
  MaterialSearchDocument,
  MusicMaterialRelation,
  Ref,
  Result,
  SourceEntity,
  SourceLibraryItem,
} from "../../src/contracts/index.js";
import type { MaterialSearchStorePort } from "../../src/ports/index.js";
import { createMaterialSearchDocumentProvider } from "../../src/material/index.js";

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

async function buildsOwnerNeutralDocumentFromCanonicalAndAllSourceRefs(): Promise<void> {
  const canonicalRef = ref("minemusic", "recording", "canonical-blue-train");
  const materialRef = ref("minemusic", "material", "recording-blue-train");
  const primarySourceRef = ref("source:fixture", "track", "track-primary");
  const alternateSourceRef = ref("source:fixture", "track", "track-alternate");
  const store = new FakeMaterialSearchStore();
  store.putCanonical({
    ref: canonicalRef,
    kind: "recording",
    label: "Blue Train",
    aliases: ["Blue Train alternate", "blue train alternate"],
    status: "active",
  });
  store.putMaterial({
    materialRef,
    kind: "recording",
    identityState: "canonical_confirmed",
    canonicalRef,
    primarySourceRef,
    sourceRefs: [alternateSourceRef],
    status: "active",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });
  store.putSource({
    kind: "track",
    sourceRef: primarySourceRef,
    providerId: "fixture",
    label: "Provider Blue Train",
    title: "Provider Blue Train",
    artistLabels: ["John Coltrane"],
    releaseLabel: "Blue Train",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });
  store.putSource({
    kind: "track",
    sourceRef: alternateSourceRef,
    providerId: "fixture",
    label: "Alternate Blue Train",
    title: "Alternate Blue Train",
    artistLabels: ["John Coltrane", "John Coltrane"],
    releaseLabel: "Blue Train Deluxe",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });

  const provider = createMaterialSearchDocumentProvider({ materialStore: store });
  const document = await assertOk(provider.buildSearchDocument({ materialRef }));

  assert(document !== null, "active material should build a SearchDocument");
  assert(document.materialRef.id === materialRef.id, "document should be keyed by materialRef");
  assert(document.kind === "recording", "document should normalize material kind");
  assert(document.canonicalLabel === "Blue Train", "canonical label should be indexed");
  assert(document.canonicalAliases?.length === 1, "canonical aliases should be deduped");
  assert(document.sourceTitle?.includes("Provider Blue Train"), "primary source title should be indexed");
  assert(document.sourceTitle?.includes("Alternate Blue Train"), "attached source title should be indexed");
  assert(document.sourceArtistLabels?.length === 1, "recording artist labels should be deduped");
  assert(document.sourceReleaseLabel?.includes("Blue Train Deluxe"), "recording release context should be indexed");
  assert(document.sourceArtistAliases === undefined, "recording artist aliases should not be indexed in v1");
  assertNoCoarseTextFields(document);
}

async function buildsKindSpecificSourceFields(): Promise<void> {
  const releaseRef = ref("minemusic", "material", "release-kind");
  const artistRef = ref("minemusic", "material", "artist-kind");
  const sourceReleaseRef = ref("source:fixture", "release", "release-source");
  const sourceArtistRef = ref("source:fixture", "artist", "artist-source");
  const store = new FakeMaterialSearchStore();
  store.putMaterial(activeMaterial(releaseRef, "release", [sourceReleaseRef]));
  store.putMaterial(activeMaterial(artistRef, "artist", [sourceArtistRef]));
  store.putSource({
    kind: "release",
    sourceRef: sourceReleaseRef,
    providerId: "fixture",
    label: "Fixture Release",
    title: "Fixture Release Title",
    artistLabels: ["Fixture Artist"],
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });
  store.putSource({
    kind: "artist",
    sourceRef: sourceArtistRef,
    providerId: "fixture",
    label: "Fixture Artist",
    name: "Fixture Artist Name",
    aliases: ["Fixture Alias"],
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });

  const provider = createMaterialSearchDocumentProvider({ materialStore: store });
  const releaseDocument = await assertOk(provider.buildSearchDocument({ materialRef: releaseRef }));
  const artistDocument = await assertOk(provider.buildSearchDocument({ materialRef: artistRef }));

  assert(releaseDocument?.sourceTitle?.includes("Fixture Release Title"), "release title belongs in source_title");
  assert(releaseDocument?.sourceArtistLabels?.includes("Fixture Artist"), "release artist labels should be indexed");
  assert(releaseDocument?.sourceReleaseLabel === undefined, "release materials should not use source_release_label");
  assert(artistDocument?.sourceTitle?.includes("Fixture Artist Name"), "artist name belongs in source_title");
  assert(artistDocument?.sourceArtistAliases?.includes("Fixture Alias"), "artist aliases should be indexed");
}

async function buildAllCollectsDurableActiveCurrentDocuments(): Promise<void> {
  const activeRef = ref("minemusic", "material", "active-recording");
  const rejectedRef = ref("minemusic", "material", "rejected-recording");
  const sourceRef = ref("source:fixture", "track", "active-source");
  const store = new FakeMaterialSearchStore();
  store.putMaterial(activeMaterial(activeRef, "recording", [sourceRef]));
  store.putMaterial({
    ...activeMaterial(rejectedRef, "recording", []),
    status: "rejected",
  });
  store.putSource({
    kind: "track",
    sourceRef,
    providerId: "fixture",
    label: "Active Source",
    title: "Active Source",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });
  store.putLibraryItem({
    id: "library-active",
    ownerScope: "local_profile:default",
    providerId: "fixture",
    providerAccountId: "acct",
    sourceRef,
    sourceKind: "track",
    libraryKind: "saved_source_track",
    label: "Source Library label must not enter document text",
    lastSeenAt: "2026-06-04T00:00:00.000Z",
    status: "present",
  });
  store.putRelation(relation(activeRef, "saved"));
  store.putRelation(relation(rejectedRef, "saved"));

  const provider = createMaterialSearchDocumentProvider({ materialStore: store });
  const documents = await assertOk(provider.buildAllSearchDocuments());

  assert(documents.length === 1, "buildAll should dedupe and skip non-active material records");
  assert(documents[0]?.materialRef.id === activeRef.id, "buildAll should include active current documents");
  assert(
    !(documents[0]?.sourceTitle ?? []).includes("Source Library label must not enter document text"),
    "Source Library labels must not become SearchDocument text",
  );
}

class FakeMaterialSearchStore implements MaterialSearchStorePort {
  private readonly records = new Map<string, MaterialRecord>();
  private readonly canonicals = new Map<string, CanonicalRecord>();
  private readonly sources = new Map<string, SourceEntity>();
  private readonly libraryItems: SourceLibraryItem[] = [];
  private readonly relations: MusicMaterialRelation[] = [];
  private readonly redirects = new Map<string, Ref>();

  putMaterial(record: MaterialRecord): void {
    this.records.set(refKey(record.materialRef), structuredClone(record));
  }

  putCanonical(record: CanonicalRecord): void {
    this.canonicals.set(refKey(record.ref), structuredClone(record));
  }

  putSource(entity: SourceEntity): void {
    this.sources.set(refKey(entity.sourceRef), structuredClone(entity));
  }

  putLibraryItem(item: SourceLibraryItem): void {
    this.libraryItems.push(structuredClone(item));
  }

  putRelation(relation: MusicMaterialRelation): void {
    this.relations.push(structuredClone(relation));
  }

  putRedirect(from: Ref, to: Ref): void {
    this.redirects.set(refKey(from), structuredClone(to));
  }

  async resolveMaterialRedirect({ materialRef }: { materialRef: Ref }): Promise<Result<Ref>> {
    return ok(structuredClone(this.redirects.get(refKey(materialRef)) ?? materialRef));
  }

  async getMaterialRecord({ materialRef }: { materialRef: Ref }): Promise<Result<MaterialRecord | null>> {
    const record = this.records.get(refKey(materialRef));
    return ok(record === undefined ? null : structuredClone(record));
  }

  async getSourceEntity({ sourceRef }: { sourceRef: Ref }): Promise<Result<SourceEntity | null>> {
    const entity = this.sources.get(refKey(sourceRef));
    return ok(entity === undefined ? null : structuredClone(entity));
  }

  async getCanonical({ ref }: { ref: Ref }): Promise<Result<CanonicalRecord | null>> {
    const record = this.canonicals.get(refKey(ref));
    return ok(record === undefined ? null : structuredClone(record));
  }

  async findMaterialBySourceRef({ sourceRef }: { sourceRef: Ref }): Promise<Result<MaterialRecord | null>> {
    const found = [...this.records.values()].find((record) =>
      [record.primarySourceRef, ...record.sourceRefs]
        .filter((candidate): candidate is Ref => candidate !== undefined)
        .some((candidate) => refKey(candidate) === refKey(sourceRef))
    );

    return ok(found === undefined ? null : structuredClone(found));
  }

  async listSourceLibraryItems(query: {
    status?: SourceLibraryItem["status"];
  }): Promise<Result<SourceLibraryItem[]>> {
    return ok(
      this.libraryItems
        .filter((item) => query.status === undefined || item.status === query.status)
        .map((item) => structuredClone(item)),
    );
  }

  async listMaterialRelations(query: {
    status?: MusicMaterialRelation["status"];
  }): Promise<Result<MusicMaterialRelation[]>> {
    return ok(
      this.relations
        .filter((item) => query.status === undefined || item.status === query.status)
        .map((item) => structuredClone(item)),
    );
  }
}

function activeMaterial(materialRef: Ref, kind: string, sourceRefs: Ref[]): MaterialRecord {
  return {
    materialRef,
    kind,
    identityState: "source_backed",
    sourceRefs,
    status: "active",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function relation(materialRef: Ref, relationKind: MusicMaterialRelation["relationKind"]): MusicMaterialRelation {
  return {
    id: `relation-${relationKind}-${materialRef.id}`,
    ownerScope: "local_profile:default",
    materialRef,
    relationKind,
    scope: { level: "material" },
    source: "user_explicit",
    status: "active",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function assertNoCoarseTextFields(document: MaterialSearchDocument): void {
  const fields = document as Record<string, unknown>;
  assert(fields.source_text === undefined, "source_text must not be a SearchDocument field");
  assert(fields.context_text === undefined, "context_text must not be a SearchDocument field");
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

await buildsOwnerNeutralDocumentFromCanonicalAndAllSourceRefs();
await buildsKindSpecificSourceFields();
await buildAllCollectsDurableActiveCurrentDocuments();
