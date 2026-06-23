import { refKey, type Ref } from "../contracts/kernel.js";
import type { SourceEntity } from "../contracts/music_data_platform.js";
import type { CanonicalRecord, MaterialRecord } from "../contracts/storage.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { createIdentityRepositories } from "./identity_records.js";
import { assertMaterialRef } from "./material_ref.js";
import { buildSearchMetadataDocument } from "./search_metadata_document_builder.js";

export type CreateSearchMetadataProjectionCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
};

export type RebuildSearchMetadataDocumentInput = {
  materialRef: Ref;
};

export type RebuildSearchMetadataDocumentsInput = {
  materialRefs: readonly Ref[];
};

export type RebuildSearchMetadataDocumentSummary = {
  materialRefKey: string;
  outcome: "rebuilt" | "deleted";
};

export type RebuildSearchMetadataDocumentsSummary = {
  processedMaterialCount: number;
  rebuiltDocumentCount: number;
  deletedDocumentCount: number;
  outcomes: readonly RebuildSearchMetadataDocumentSummary[];
};

export type SearchMetadataProjectionCommands = {
  rebuildSearchMetadataDocument(
    input: RebuildSearchMetadataDocumentInput,
  ): Promise<RebuildSearchMetadataDocumentSummary>;
  rebuildSearchMetadataDocuments(
    input: RebuildSearchMetadataDocumentsInput,
  ): Promise<RebuildSearchMetadataDocumentsSummary>;
};

export function createSearchMetadataProjectionCommands(
  input: CreateSearchMetadataProjectionCommandsInput,
): SearchMetadataProjectionCommands {
  const repositories = createIdentityRepositories({ db: input.db });

  return {
    async rebuildSearchMetadataDocument(commandInput) {
      return rebuildSingleSearchMetadataDocument({
        db: input.db,
        now: input.now,
        repositories,
        materialRef: commandInput.materialRef,
      });
    },
    async rebuildSearchMetadataDocuments(commandInput) {
      const materialRefsByKey = new Map<string, Ref>();

      for (const materialRef of commandInput.materialRefs) {
        assertMaterialRef(materialRef);
        materialRefsByKey.set(refKey(materialRef), materialRef);
      }

      const orderedMaterialRefs = [...materialRefsByKey.entries()]
        .sort(([left], [right]) => compareStableText(left, right))
        .map(([, materialRef]) => materialRef);

      const outcomes: RebuildSearchMetadataDocumentSummary[] = [];
      for (const materialRef of orderedMaterialRefs) {
        outcomes.push(await rebuildSingleSearchMetadataDocument({
          db: input.db,
          now: input.now,
          repositories,
          materialRef,
        }));
      }

      return {
        processedMaterialCount: orderedMaterialRefs.length,
        rebuiltDocumentCount: outcomes.filter((outcome) => outcome.outcome === "rebuilt").length,
        deletedDocumentCount: outcomes.filter((outcome) => outcome.outcome === "deleted").length,
        outcomes,
      };
    },
  };
}

async function rebuildSingleSearchMetadataDocument(input: {
  db: MusicDatabaseTransactionContext;
  now: string;
  repositories: ReturnType<typeof createIdentityRepositories>;
  materialRef: Ref;
}): Promise<RebuildSearchMetadataDocumentSummary> {
  assertMaterialRef(input.materialRef);
  const materialRefKey = refKey(input.materialRef);
  const materialRecord = await input.repositories.materialRecords.get({
    materialRef: input.materialRef,
  });

  if (materialRecord === undefined || materialRecord.entity.lifecycleStatus !== "active") {
    await deleteSearchMetadataRows(input.db, materialRefKey);
    return {
      materialRefKey,
      outcome: "deleted",
    };
  }

  const sourceRecords = await boundSourceRecordsForMaterial({
    materialRecord,
    repositories: input.repositories,
  });
  const canonicalRecord = await confirmedActiveCanonicalRecordForMaterial({
    materialRecord,
    repositories: input.repositories,
  });
  const document = buildSearchMetadataDocument({
    materialRecord,
    sourceRecords,
    canonicalRecord,
    updatedAt: input.now,
  });

  await input.db.run(
    `
      INSERT INTO search_metadata_documents (
        material_ref_key,
        material_kind,
        fields_json,
        title_text,
        artist_text,
        album_text,
        version_text,
        alias_text,
        search_text,
        search_vector,
        updated_at
      )
      SELECT
        row.material_ref_key,
        row.material_kind,
        row.fields_json,
        row.title_text,
        row.artist_text,
        row.album_text,
        row.version_text,
        row.alias_text,
        row.search_text,
        ${searchMetadataVectorSql("row")},
        row.updated_at
      FROM (
        VALUES (?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)
      ) AS row(
        material_ref_key,
        material_kind,
        fields_json,
        title_text,
        artist_text,
        album_text,
        version_text,
        alias_text,
        search_text,
        updated_at
      )
      ON CONFLICT(material_ref_key) DO UPDATE SET
        material_kind = excluded.material_kind,
        fields_json = excluded.fields_json,
        title_text = excluded.title_text,
        artist_text = excluded.artist_text,
        album_text = excluded.album_text,
        version_text = excluded.version_text,
        alias_text = excluded.alias_text,
        search_text = excluded.search_text,
        search_vector = excluded.search_vector,
        updated_at = excluded.updated_at
    `,
    [
      document.materialRefKey,
      document.materialKind,
      document.fieldsJson,
      document.titleText,
      document.artistText,
      document.albumText,
      document.versionText,
      document.aliasText,
      document.searchText,
      document.updatedAt,
    ],
  );

  return {
    materialRefKey,
    outcome: "rebuilt",
  };
}

function searchMetadataVectorSql(alias: string): string {
  return `
    setweight(to_tsvector('simple', COALESCE(${alias}.title_text, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(${alias}.artist_text, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(${alias}.album_text, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(${alias}.version_text, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(${alias}.alias_text, '')), 'D')
  `;
}

async function deleteSearchMetadataRows(
  db: MusicDatabaseTransactionContext,
  materialRefKey: string,
): Promise<void> {
  await db.run(
    "DELETE FROM search_metadata_documents WHERE material_ref_key = ?",
    [materialRefKey],
  );
}

async function boundSourceRecordsForMaterial(input: {
  materialRecord: MaterialRecord;
  repositories: ReturnType<typeof createIdentityRepositories>;
}): Promise<readonly SourceEntity[]> {
  const bindings = await input.repositories.sourceMaterialBindings.listSourcesForMaterial({
    materialRef: input.materialRecord.entity.materialRef,
  });

  const sources: SourceEntity[] = [];
  for (const binding of bindings) {
    const sourceRecord = await input.repositories.sourceRecords.get({
      sourceRef: binding.sourceRef,
    });

    if (sourceRecord === undefined) {
      throw new MusicDataPlatformError({
        code: "music_data.source_not_found",
        message: `Current source-material binding is missing a source record: ${refKey(binding.sourceRef)}`,
      });
    }

    sources.push(sourceRecord.entity);
  }

  return sources;
}

async function confirmedActiveCanonicalRecordForMaterial(input: {
  materialRecord: MaterialRecord;
  repositories: ReturnType<typeof createIdentityRepositories>;
}): Promise<CanonicalRecord | undefined> {
  const canonicalRef = input.materialRecord.entity.canonicalRef;

  if (
    input.materialRecord.entity.identityStatus !== "canonical_confirmed" ||
    canonicalRef === undefined
  ) {
    return undefined;
  }

  const canonicalRecord = await input.repositories.canonicalRecords.get({
    canonicalRef,
  });

  if (canonicalRecord === undefined || canonicalRecord.status !== "active") {
    return undefined;
  }

  return canonicalRecord;
}

function compareStableText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
