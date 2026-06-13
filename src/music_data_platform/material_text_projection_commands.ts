import {
  refKey,
  type CanonicalEntity,
  type CanonicalRecord,
  type MaterialEntityKind,
  type MaterialRecord,
  type Ref,
  type SourceAlbum,
  type SourceArtist,
  type SourceEntity,
  type SourceTrack,
  type VersionInfo,
} from "../contracts/index.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { createIdentityRepositories, type SourceToMaterialBindingRecord } from "./identity_records.js";
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
  ): RebuildMaterialTextDocumentSummary;
  rebuildMaterialTextDocuments(
    input: RebuildMaterialTextDocumentsInput,
  ): RebuildMaterialTextDocumentsSummary;
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
    rebuildMaterialTextDocument(commandInput) {
      return rebuildSingleMaterialTextDocument({
        db: input.db,
        now: input.now,
        repositories,
        materialRef: commandInput.materialRef,
      });
    },
    rebuildMaterialTextDocuments(commandInput) {
      const materialRefsByKey = new Map<string, Ref>();

      for (const materialRef of commandInput.materialRefs) {
        materialRefsByKey.set(refKey(materialRef), materialRef);
      }

      const orderedMaterialRefs = [...materialRefsByKey.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, materialRef]) => materialRef);

      const outcomes = orderedMaterialRefs.map((materialRef) =>
        rebuildSingleMaterialTextDocument({
          db: input.db,
          now: input.now,
          repositories,
          materialRef,
        })
      );

      return {
        processedMaterialCount: orderedMaterialRefs.length,
        rebuiltDocumentCount: outcomes.filter((outcome) => outcome.outcome === "rebuilt").length,
        deletedDocumentCount: outcomes.filter((outcome) => outcome.outcome === "deleted").length,
        outcomes,
      };
    },
  };
}

function rebuildSingleMaterialTextDocument(input: {
  db: MusicDatabaseTransactionContext;
  now: string;
  repositories: ReturnType<typeof createIdentityRepositories>;
  materialRef: Ref;
}): RebuildMaterialTextDocumentSummary {
  const materialRefKey = refKey(input.materialRef);
  const materialRecord = input.repositories.materialRecords.get({ materialRef: input.materialRef });

  if (materialRecord === undefined || materialRecord.entity.lifecycleStatus !== "active") {
    deleteMaterialTextRows(input.db, materialRefKey);
    return {
      materialRefKey,
      outcome: "deleted",
    };
  }

  const sourceRecords = boundSourceRecordsForMaterial({
    materialRecord,
    repositories: input.repositories,
  });
  const canonicalRecord = confirmedActiveCanonicalRecordForMaterial({
    materialRecord,
    repositories: input.repositories,
  });
  const document = buildMaterialTextDocument({
    materialRecord,
    sourceRecords,
    canonicalRecord,
    updatedAt: input.now,
  });

  input.db.run(
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

  input.db.run(
    "DELETE FROM material_text_fts WHERE material_ref_key = ?",
    [materialRefKey],
  );
  input.db.run(
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

  return {
    materialRefKey,
    outcome: "rebuilt",
  };
}

function deleteMaterialTextRows(
  db: MusicDatabaseTransactionContext,
  materialRefKey: string,
): void {
  db.run("DELETE FROM material_text_documents WHERE material_ref_key = ?", [materialRefKey]);
  db.run("DELETE FROM material_text_fts WHERE material_ref_key = ?", [materialRefKey]);
}

function boundSourceRecordsForMaterial(input: {
  materialRecord: MaterialRecord;
  repositories: ReturnType<typeof createIdentityRepositories>;
}): readonly { source: SourceEntity; contributionSource: MaterialTextContributionSource }[] {
  const primaryRefKey = input.materialRecord.entity.primarySourceRef === undefined
    ? undefined
    : refKey(input.materialRecord.entity.primarySourceRef);

  return input.repositories.sourceMaterialBindings.listSourcesForMaterial({
    materialRef: input.materialRecord.entity.materialRef,
  }).map((binding) => {
    const sourceRecord = input.repositories.sourceRecords.get({ sourceRef: binding.sourceRef });

    if (sourceRecord === undefined) {
      throw new Error(
        `Current source-material binding is missing a source record: ${refKey(binding.sourceRef)}`,
      );
    }

    return {
      source: sourceRecord.entity,
      contributionSource: primaryRefKey !== undefined && primaryRefKey === refKey(binding.sourceRef)
        ? "primary_source"
        : "bound_source",
    } satisfies {
      source: SourceEntity;
      contributionSource: MaterialTextContributionSource;
    };
  });
}

function confirmedActiveCanonicalRecordForMaterial(input: {
  materialRecord: MaterialRecord;
  repositories: ReturnType<typeof createIdentityRepositories>;
}): CanonicalRecord | undefined {
  const canonicalRef = input.materialRecord.entity.canonicalRef;

  if (
    input.materialRecord.entity.identityStatus !== "canonical_confirmed" ||
    canonicalRef === undefined
  ) {
    return undefined;
  }

  const canonicalRecord = input.repositories.canonicalRecords.get({ canonicalRef });

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
