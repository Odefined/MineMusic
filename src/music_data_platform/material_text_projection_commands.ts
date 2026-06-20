import { refKey, type Ref } from "../contracts/kernel.js";
import type { CanonicalEntity, MaterialEntityKind, SourceAlbum, SourceArtist, SourceEntity, SourceTrack, VersionInfo } from "../contracts/music_data_platform.js";
import type { CanonicalRecord, MaterialRecord } from "../contracts/storage.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { createIdentityRepositories, type SourceToMaterialBindingRecord } from "./identity_records.js";
import { assertMaterialRef } from "./material_ref.js";
import {
  buildMaterialTextFieldState,
  buildMaterialTextSearchText,
  type MaterialTextContribution,
  type MaterialTextContributionBasis,
  type MaterialTextContributionSource,
} from "./material_text_normalization.js";

export type CreateMaterialTextProjectionCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
};

export type RebuildMaterialTextDocumentInput = {
  materialRef: Ref;
};

export type RebuildMaterialTextDocumentsInput = {
  materialRefs: readonly Ref[];
};

export type RebuildMaterialTextDocumentSummary = {
  materialRefKey: string;
  outcome: "rebuilt" | "deleted";
};

export type RebuildMaterialTextDocumentsSummary = {
  processedMaterialCount: number;
  rebuiltDocumentCount: number;
  deletedDocumentCount: number;
  outcomes: readonly RebuildMaterialTextDocumentSummary[];
};

export type MaterialTextProjectionCommands = {
  rebuildMaterialTextDocument(
    input: RebuildMaterialTextDocumentInput,
  ): Promise<RebuildMaterialTextDocumentSummary>;
  rebuildMaterialTextDocuments(
    input: RebuildMaterialTextDocumentsInput,
  ): Promise<RebuildMaterialTextDocumentsSummary>;
};

type MaterialTextFieldName =
  | "title"
  | "artist"
  | "album"
  | "version"
  | "alias";

type MaterialTextDocumentValue = {
  materialRefKey: string;
  materialKind: MaterialEntityKind;
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
  aliasText: string;
  searchText: string;
  documentJson: string;
  updatedAt: string;
};

export function createMaterialTextProjectionCommands(
  input: CreateMaterialTextProjectionCommandsInput,
): MaterialTextProjectionCommands {
  const repositories = createIdentityRepositories({ db: input.db });

  return {
    async rebuildMaterialTextDocument(commandInput) {
      return rebuildSingleMaterialTextDocument({
        db: input.db,
        now: input.now,
        repositories,
        materialRef: commandInput.materialRef,
      });
    },
    async rebuildMaterialTextDocuments(commandInput) {
      const materialRefsByKey = new Map<string, Ref>();

      for (const materialRef of commandInput.materialRefs) {
        assertMaterialRef(materialRef);
        materialRefsByKey.set(refKey(materialRef), materialRef);
      }

      const orderedMaterialRefs = [...materialRefsByKey.entries()]
        .sort(([left], [right]) => compareStableText(left, right))
        .map(([, materialRef]) => materialRef);

      const outcomes: RebuildMaterialTextDocumentSummary[] = [];
      for (const materialRef of orderedMaterialRefs) {
        outcomes.push(await rebuildSingleMaterialTextDocument({
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

function compareStableText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

async function rebuildSingleMaterialTextDocument(input: {
  db: MusicDatabaseTransactionContext;
  now: string;
  repositories: ReturnType<typeof createIdentityRepositories>;
  materialRef: Ref;
}): Promise<RebuildMaterialTextDocumentSummary> {
  assertMaterialRef(input.materialRef);
  const materialRefKey = refKey(input.materialRef);
  const materialRecord = await input.repositories.materialRecords.get({ materialRef: input.materialRef });

  if (materialRecord === undefined || materialRecord.entity.lifecycleStatus !== "active") {
    await deleteMaterialTextRows(input.db, materialRefKey);
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
  const document = buildMaterialTextDocument({
    materialRecord,
    sourceRecords,
    canonicalRecord,
    updatedAt: input.now,
  });

  await input.db.run(
    `
      INSERT INTO material_text_documents (
        material_ref_key,
        material_kind,
        title_text,
        artist_text,
        album_text,
        version_text,
        alias_text,
        search_text,
        document_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(material_ref_key) DO UPDATE SET
        material_kind = excluded.material_kind,
        title_text = excluded.title_text,
        artist_text = excluded.artist_text,
        album_text = excluded.album_text,
        version_text = excluded.version_text,
        alias_text = excluded.alias_text,
        search_text = excluded.search_text,
        document_json = excluded.document_json,
        updated_at = excluded.updated_at
    `,
    [
      document.materialRefKey,
      document.materialKind,
      document.titleText,
      document.artistText,
      document.albumText,
      document.versionText,
      document.aliasText,
      document.searchText,
      document.documentJson,
      document.updatedAt,
    ],
  );

  await input.db.run(
    "DELETE FROM material_text_fts WHERE material_ref_key = ?",
    [materialRefKey],
  );
  await input.db.run(
    `
      INSERT INTO material_text_fts (
        material_ref_key,
        title_text,
        artist_text,
        album_text,
        version_text,
        alias_text
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      document.materialRefKey,
      document.titleText,
      document.artistText,
      document.albumText,
      document.versionText,
      document.aliasText,
    ],
  );
  await input.db.run(
    `
      UPDATE material_text_fts
      SET search_vector = to_tsvector(
        'simple',
        concat_ws(' ', title_text, artist_text, album_text, version_text, alias_text)
      )
      WHERE material_ref_key = ?
    `,
    [materialRefKey],
  );

  return {
    materialRefKey,
    outcome: "rebuilt",
  };
}

async function deleteMaterialTextRows(
  db: MusicDatabaseTransactionContext,
  materialRefKey: string,
): Promise<void> {
  await db.run("DELETE FROM material_text_fts WHERE material_ref_key = ?", [materialRefKey]);
  await db.run("DELETE FROM material_text_documents WHERE material_ref_key = ?", [materialRefKey]);
}

async function boundSourceRecordsForMaterial(input: {
  materialRecord: MaterialRecord;
  repositories: ReturnType<typeof createIdentityRepositories>;
}): Promise<readonly { source: SourceEntity; contributionSource: MaterialTextContributionSource }[]> {
  const primaryRefKey = input.materialRecord.entity.primarySourceRef === undefined
    ? undefined
    : refKey(input.materialRecord.entity.primarySourceRef);

  const bindings = await input.repositories.sourceMaterialBindings.listSourcesForMaterial({
    materialRef: input.materialRecord.entity.materialRef,
  });

  const sources: { source: SourceEntity; contributionSource: MaterialTextContributionSource }[] = [];
  for (const binding of bindings) {
    const sourceRecord = await input.repositories.sourceRecords.get({ sourceRef: binding.sourceRef });

    if (sourceRecord === undefined) {
      throw new MusicDataPlatformError({
        code: "music_data.source_not_found",
        message: `Current source-material binding is missing a source record: ${refKey(binding.sourceRef)}`,
      });
    }

    sources.push({
      source: sourceRecord.entity,
      contributionSource: primaryRefKey !== undefined && primaryRefKey === refKey(binding.sourceRef)
        ? "primary_source"
        : "bound_source",
    });
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

  const canonicalRecord = await input.repositories.canonicalRecords.get({ canonicalRef });

  if (canonicalRecord === undefined || canonicalRecord.status !== "active") {
    return undefined;
  }

  return canonicalRecord;
}

function buildMaterialTextDocument(input: {
  materialRecord: MaterialRecord;
  sourceRecords: readonly { source: SourceEntity; contributionSource: MaterialTextContributionSource }[];
  canonicalRecord: CanonicalRecord | undefined;
  updatedAt: string;
}): MaterialTextDocumentValue {
  const titleContributions: MaterialTextContribution[] = [];
  const artistContributions: MaterialTextContribution[] = [];
  const albumContributions: MaterialTextContribution[] = [];
  const versionContributions: MaterialTextContribution[] = [];
  const aliasContributions: MaterialTextContribution[] = [];
  const materialKind = input.materialRecord.entity.kind;

  appendMaterialVersionContributions(versionContributions, input.materialRecord.entity.versionInfo);

  for (const sourceRecord of input.sourceRecords) {
    appendSourceContributions({
      kind: materialKind,
      source: sourceRecord.source,
      contributionSource: sourceRecord.contributionSource,
      titleContributions,
      artistContributions,
      albumContributions,
      versionContributions,
      aliasContributions,
    });
  }

  if (input.canonicalRecord !== undefined) {
    appendCanonicalContributions({
      kind: materialKind,
      canonical: input.canonicalRecord.entity,
      titleContributions,
      artistContributions,
      albumContributions,
      versionContributions,
      aliasContributions,
    });
  }

  const titleField = buildMaterialTextFieldState(titleContributions);
  const artistField = buildMaterialTextFieldState(artistContributions);
  const albumField = buildMaterialTextFieldState(albumContributions);
  const versionField = buildMaterialTextFieldState(versionContributions);
  const aliasField = buildMaterialTextFieldState(aliasContributions);

  return {
    materialRefKey: refKey(input.materialRecord.entity.materialRef),
    materialKind,
    titleText: titleField.text,
    artistText: artistField.text,
    albumText: albumField.text,
    versionText: versionField.text,
    aliasText: aliasField.text,
    searchText: buildMaterialTextSearchText({
      titleText: titleField.text,
      artistText: artistField.text,
      albumText: albumField.text,
      versionText: versionField.text,
      aliasText: aliasField.text,
    }),
    documentJson: JSON.stringify({
      fields: {
        title: titleField.contributions,
        artist: artistField.contributions,
        album: albumField.contributions,
        version: versionField.contributions,
        alias: aliasField.contributions,
      },
    }),
    updatedAt: input.updatedAt,
  };
}

function appendMaterialVersionContributions(
  target: MaterialTextContribution[],
  versionInfo: VersionInfo | undefined,
): void {
  appendVersionInfoContributions(target, "material", versionInfo);
}

function appendSourceContributions(input: {
  kind: MaterialEntityKind;
  source: SourceEntity;
  contributionSource: MaterialTextContributionSource;
  titleContributions: MaterialTextContribution[];
  artistContributions: MaterialTextContribution[];
  albumContributions: MaterialTextContribution[];
  versionContributions: MaterialTextContribution[];
  aliasContributions: MaterialTextContribution[];
}): void {
  appendVersionInfoContributions(
    input.versionContributions,
    input.contributionSource,
    input.source.versionInfo,
  );

  switch (input.kind) {
    case "recording":
      if (input.source.kind === "track") {
        pushContribution(input.titleContributions, input.contributionSource, "title", input.source.title);
        for (const artistLabel of input.source.artistLabels ?? []) {
          pushContribution(input.artistContributions, input.contributionSource, "artist", artistLabel);
        }
        if (input.source.albumLabel !== undefined) {
          pushContribution(input.albumContributions, input.contributionSource, "album", input.source.albumLabel);
        }
      }
      return;
    case "album":
      if (input.source.kind === "album") {
        pushContribution(input.titleContributions, input.contributionSource, "title", input.source.title);
        for (const artistLabel of input.source.artistLabels ?? []) {
          pushContribution(input.artistContributions, input.contributionSource, "artist", artistLabel);
        }
      }
      return;
    case "artist":
      if (input.source.kind === "artist") {
        pushContribution(input.artistContributions, input.contributionSource, "artist", input.source.name);
        for (const alias of input.source.aliases ?? []) {
          pushContribution(input.aliasContributions, input.contributionSource, "alias", alias);
        }
      }
      return;
    case "work":
    case "release":
      appendFallbackSourceContributions(input);
      return;
  }
}

function appendFallbackSourceContributions(input: {
  source: SourceEntity;
  contributionSource: MaterialTextContributionSource;
  titleContributions: MaterialTextContribution[];
  artistContributions: MaterialTextContribution[];
  albumContributions: MaterialTextContribution[];
  aliasContributions: MaterialTextContribution[];
}): void {
  switch (input.source.kind) {
    case "track":
      pushContribution(input.titleContributions, input.contributionSource, "title", input.source.title);
      for (const artistLabel of input.source.artistLabels ?? []) {
        pushContribution(input.artistContributions, input.contributionSource, "artist", artistLabel);
      }
      if (input.source.albumLabel !== undefined) {
        pushContribution(input.albumContributions, input.contributionSource, "album", input.source.albumLabel);
      }
      return;
    case "album":
      pushContribution(input.titleContributions, input.contributionSource, "title", input.source.title);
      for (const artistLabel of input.source.artistLabels ?? []) {
        pushContribution(input.artistContributions, input.contributionSource, "artist", artistLabel);
      }
      return;
    case "artist":
      pushContribution(input.artistContributions, input.contributionSource, "artist", input.source.name);
      for (const alias of input.source.aliases ?? []) {
        pushContribution(input.aliasContributions, input.contributionSource, "alias", alias);
      }
      return;
  }
}

function appendCanonicalContributions(input: {
  kind: MaterialEntityKind;
  canonical: CanonicalEntity;
  titleContributions: MaterialTextContribution[];
  artistContributions: MaterialTextContribution[];
  albumContributions: MaterialTextContribution[];
  versionContributions: MaterialTextContribution[];
  aliasContributions: MaterialTextContribution[];
}): void {
  appendVersionInfoContributions(input.versionContributions, "canonical", input.canonical.versionInfo);

  switch (input.kind) {
    case "recording":
      pushContribution(input.titleContributions, "canonical", "title", input.canonical.label);
      for (const alias of input.canonical.aliases ?? []) {
        pushContribution(input.aliasContributions, "canonical", "alias", alias);
      }
      return;
    case "album":
      pushContribution(input.titleContributions, "canonical", "title", input.canonical.label);
      for (const alias of input.canonical.aliases ?? []) {
        pushContribution(input.aliasContributions, "canonical", "alias", alias);
      }
      return;
    case "artist":
      pushContribution(input.artistContributions, "canonical", "artist", input.canonical.label);
      for (const alias of input.canonical.aliases ?? []) {
        pushContribution(input.aliasContributions, "canonical", "alias", alias);
      }
      return;
    case "work":
    case "release":
      pushContribution(input.titleContributions, "canonical", "title", input.canonical.label);
      for (const alias of input.canonical.aliases ?? []) {
        pushContribution(input.aliasContributions, "canonical", "alias", alias);
      }
      return;
  }
}

function appendVersionInfoContributions(
  target: MaterialTextContribution[],
  source: MaterialTextContributionSource,
  versionInfo: VersionInfo | undefined,
): void {
  if (versionInfo?.label !== undefined) {
    pushContribution(target, source, "version_label", versionInfo.label);
  }

  for (const tag of versionInfo?.tags ?? []) {
    pushContribution(target, source, "version_tag", tag);
  }
}

function pushContribution(
  target: MaterialTextContribution[],
  source: MaterialTextContributionSource,
  basis: MaterialTextContributionBasis,
  value: string,
): void {
  target.push({
    source,
    basis,
    value,
  });
}
