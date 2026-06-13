import assert from "node:assert/strict";

import {
  refKey,
  type Ref,
} from "../../src/contracts/index.js";
import * as musicDataPlatform from "../../src/music_data_platform/index.js";
import {
  createIdentityWriteCommands,
  createMaterialTextProjectionCommands,
  createMaterialTextProjectionRecords,
  isMusicDataPlatformError,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  type CreateMaterialTextProjectionCommandsInput,
  type CreateMaterialTextProjectionRecordsInput,
  type GetMaterialTextDocumentInput,
  type MatchMaterialTextDocumentsInput,
  type MaterialTextDocumentRecord,
  type MaterialTextMatchRecord,
  type MaterialTextProjectionCommands,
  type MaterialTextProjectionReadPort,
  type RebuildMaterialTextDocumentInput,
  type RebuildMaterialTextDocumentSummary,
  type RebuildMaterialTextDocumentsInput,
  type RebuildMaterialTextDocumentsSummary,
} from "../../src/music_data_platform/index.js";
import {
  buildMaterialTextMatchQuery,
  normalizeMaterialTextValue,
} from "../../src/music_data_platform/material_text_normalization.js";
import {
  SqliteMusicDatabase,
  type MusicDatabaseTransactionContext,
} from "../../src/storage/index.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

export type _createMaterialTextProjectionRecordsInputShape = Expect<
  Equal<keyof CreateMaterialTextProjectionRecordsInput, "db">
>;

export type _getMaterialTextDocumentInputShape = Expect<
  Equal<keyof GetMaterialTextDocumentInput, "materialRef">
>;

export type _matchMaterialTextDocumentsInputShape = Expect<
  Equal<keyof MatchMaterialTextDocumentsInput, "text" | "limit">
>;

export type _materialTextDocumentRecordShape = Expect<
  Equal<
    keyof MaterialTextDocumentRecord,
    | "materialRefKey"
    | "materialKind"
    | "titleText"
    | "artistText"
    | "albumText"
    | "versionText"
    | "aliasText"
    | "searchText"
    | "documentJson"
    | "updatedAt"
  >
>;

export type _materialTextMatchRecordShape = Expect<
  Equal<
    keyof MaterialTextMatchRecord,
    | "materialRefKey"
    | "materialKind"
    | "titleText"
    | "artistText"
    | "albumText"
    | "versionText"
    | "aliasText"
  >
>;

export type _materialTextProjectionReadPortShape = Expect<
  Equal<
    keyof MaterialTextProjectionReadPort,
    | "getMaterialTextDocument"
    | "matchMaterialTextDocuments"
  >
>;

export type _createMaterialTextProjectionCommandsInputShape = Expect<
  Equal<keyof CreateMaterialTextProjectionCommandsInput, "db" | "now">
>;

export type _rebuildMaterialTextDocumentInputShape = Expect<
  Equal<keyof RebuildMaterialTextDocumentInput, "materialRef">
>;

export type _rebuildMaterialTextDocumentsInputShape = Expect<
  Equal<keyof RebuildMaterialTextDocumentsInput, "materialRefs">
>;

export type _rebuildMaterialTextDocumentSummaryShape = Expect<
  Equal<keyof RebuildMaterialTextDocumentSummary, "materialRefKey" | "outcome">
>;

export type _rebuildMaterialTextDocumentsSummaryShape = Expect<
  Equal<
    keyof RebuildMaterialTextDocumentsSummary,
    | "processedMaterialCount"
    | "rebuiltDocumentCount"
    | "deletedDocumentCount"
    | "outcomes"
  >
>;

export type _materialTextProjectionCommandsShape = Expect<
  Equal<
    keyof MaterialTextProjectionCommands,
    | "rebuildMaterialTextDocument"
    | "rebuildMaterialTextDocuments"
  >
>;

assert.equal(
  "normalizeMaterialTextValue" in musicDataPlatform,
  false,
);
assert.equal(
  "buildMaterialTextMatchQuery" in musicDataPlatform,
  false,
);
assert.equal(
  normalizeMaterialTextValue(" Ａ\tB\nＣ "),
  "a b c",
);
assert.equal(
  normalizeMaterialTextValue("I"),
  "i",
);
assert.equal(
  buildMaterialTextMatchQuery("  Foo\tBar "),
  "\"foo\" AND \"bar\"",
);

const schemaDatabase = initializedDatabase();
assert.equal(
  schemaDatabase.context().get<{ type: string }>(
    "SELECT type FROM sqlite_schema WHERE name = 'material_text_documents'",
  )?.type,
  "table",
);
assert.equal(
  schemaDatabase.context().get<{ sql: string }>(
    "SELECT sql FROM sqlite_schema WHERE name = 'material_text_fts'",
  )?.sql.includes("USING fts5"),
  true,
);
const materialTextDocumentColumns = schemaDatabase.context().all<{ name: string; pk: number }>(
  "PRAGMA table_info(material_text_documents)",
);
assert.deepEqual(
  materialTextDocumentColumns.map((column) => column.name),
  [
    "material_ref_key",
    "material_kind",
    "title_text",
    "artist_text",
    "album_text",
    "version_text",
    "alias_text",
    "search_text",
    "document_json",
    "updated_at",
  ],
);
assert.equal(
  materialTextDocumentColumns.find((column) => column.name === "material_ref_key")?.pk,
  1,
);
assert.deepEqual(
  schemaDatabase.context().all<{ table: string; from: string; to: string }>(
    "PRAGMA foreign_key_list(material_text_documents)",
  ).map((row) => ({
    table: row.table,
    from: row.from,
    to: row.to,
  })),
  [
    {
      table: "material_records",
      from: "material_ref_key",
      to: "ref_key",
    },
  ],
);
assert.deepEqual(
  schemaDatabase.context().all<{ name: string }>(
    "PRAGMA table_info(material_text_fts)",
  ).map((column) => column.name),
  [
    "material_ref_key",
    "title_text",
    "artist_text",
    "album_text",
    "version_text",
    "alias_text",
  ],
);

schemaDatabase.transaction((db) => {
  createIdentityWriteCommands({ db, now: "2026-06-13T10:00:00.000Z" }).upsertMaterialRecord({
    materialRef: materialRef("recording", "m_schema"),
    kind: "recording",
  });

  assert.throws(
    () => db.run(
      `
        INSERT INTO material_text_documents (
          material_ref_key,
          material_kind,
          document_json,
          updated_at
        )
        VALUES (?, ?, ?, ?)
      `,
      [
        refKey(materialRef("recording", "missing")),
        "recording",
        "{\"fields\":{\"title\":[],\"artist\":[],\"album\":[],\"version\":[],\"alias\":[]}}",
        "2026-06-13T10:01:00.000Z",
      ],
    ),
  );

  assert.throws(
    () => db.run(
      `
        INSERT INTO material_text_documents (
          material_ref_key,
          material_kind,
          document_json,
          updated_at
        )
        VALUES (?, ?, ?, ?)
      `,
      [
        refKey(materialRef("recording", "m_schema")),
        "playlist",
        "{\"fields\":{\"title\":[],\"artist\":[],\"album\":[],\"version\":[],\"alias\":[]}}",
        "2026-06-13T10:02:00.000Z",
      ],
    ),
  );
});
schemaDatabase.close();

const recordingDatabase = initializedDatabase();
const plainsongMaterialRef = materialRef("recording", "m_plainsong");
const plainsongLiveMaterialRef = materialRef("recording", "m_plainsong_live");
const longOnlyMaterialRef = materialRef("recording", "m_long_only");
const seasonOnlyMaterialRef = materialRef("recording", "m_season_only");
const longSeasonMaterialRef = materialRef("recording", "m_long_season");
const plainsongCanonicalRef = canonicalRef("recording", "c_plainsong");
const primaryPlainsongSource = sourceTrack("1001", "Plainsong", {
  artistLabels: ["The Cure"],
  albumLabel: "Disintegration",
  versionInfo: {
    label: "Single Edit",
    tags: ["edit"],
  },
});
const duplicatePlainsongSource = sourceTrack("1002", "  PLAINSong  ", {
  artistLabels: ["the cure"],
  albumLabel: "DISINTEGRATION",
  versionInfo: {
    tags: ["remix"],
  },
});

recordingDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T11:00:00.000Z" });

  identity.upsertSourceRecord({ entity: primaryPlainsongSource });
  identity.upsertSourceRecord({ entity: duplicatePlainsongSource });
  identity.upsertSourceRecord({
    entity: sourceTrack("1003", "Plainsong Live", {
      artistLabels: ["The Cure"],
      albumLabel: "Show",
    }),
  });
  identity.upsertSourceRecord({
    entity: sourceTrack("1004", "Long", {
      artistLabels: ["Fishmans"],
    }),
  });
  identity.upsertSourceRecord({
    entity: sourceTrack("1005", "Season", {
      artistLabels: ["Fishmans"],
    }),
  });
  identity.upsertSourceRecord({
    entity: sourceTrack("1006", "Long Season", {
      artistLabels: ["Fishmans"],
      albumLabel: "98.12.28",
    }),
  });

  identity.upsertMaterialRecord({
    materialRef: plainsongMaterialRef,
    kind: "recording",
    versionInfo: {
      label: "2010 Remaster",
      tags: ["remaster"],
    },
  });
  identity.upsertMaterialRecord({
    materialRef: plainsongLiveMaterialRef,
    kind: "recording",
  });
  identity.upsertMaterialRecord({
    materialRef: longOnlyMaterialRef,
    kind: "recording",
  });
  identity.upsertMaterialRecord({
    materialRef: seasonOnlyMaterialRef,
    kind: "recording",
  });
  identity.upsertMaterialRecord({
    materialRef: longSeasonMaterialRef,
    kind: "recording",
  });
  identity.upsertCanonicalRecord({
    entity: {
      canonicalRef: plainsongCanonicalRef,
      kind: "recording",
      label: "Plainsong",
      aliases: ["Plain Song"],
      versionInfo: {
        label: "Album Mix",
        tags: ["demo"],
      },
    },
    status: "active",
  });

  identity.bindSourceToMaterial({
    sourceRef: primaryPlainsongSource.sourceRef,
    materialRef: plainsongMaterialRef,
    makePrimary: true,
  });
  identity.bindSourceToMaterial({
    sourceRef: duplicatePlainsongSource.sourceRef,
    materialRef: plainsongMaterialRef,
  });
  identity.bindMaterialToCanonical({
    materialRef: plainsongMaterialRef,
    canonicalRef: plainsongCanonicalRef,
  });
  identity.bindSourceToMaterial({
    sourceRef: sourceRef("track", "1003"),
    materialRef: plainsongLiveMaterialRef,
    makePrimary: true,
  });
  identity.bindSourceToMaterial({
    sourceRef: sourceRef("track", "1004"),
    materialRef: longOnlyMaterialRef,
    makePrimary: true,
  });
  identity.bindSourceToMaterial({
    sourceRef: sourceRef("track", "1005"),
    materialRef: seasonOnlyMaterialRef,
    makePrimary: true,
  });
  identity.bindSourceToMaterial({
    sourceRef: sourceRef("track", "1006"),
    materialRef: longSeasonMaterialRef,
    makePrimary: true,
  });

  const commands = createMaterialTextProjectionCommands({
    db,
    now: "2026-06-13T11:10:00.000Z",
  });
  const summary = commands.rebuildMaterialTextDocuments({
    materialRefs: [
      seasonOnlyMaterialRef,
      plainsongMaterialRef,
      plainsongLiveMaterialRef,
      longOnlyMaterialRef,
      longSeasonMaterialRef,
      plainsongMaterialRef,
    ],
  });

  assert.deepEqual(summary, {
    processedMaterialCount: 5,
    rebuiltDocumentCount: 5,
    deletedDocumentCount: 0,
    outcomes: [
      {
        materialRefKey: refKey(longOnlyMaterialRef),
        outcome: "rebuilt",
      },
      {
        materialRefKey: refKey(longSeasonMaterialRef),
        outcome: "rebuilt",
      },
      {
        materialRefKey: refKey(plainsongMaterialRef),
        outcome: "rebuilt",
      },
      {
        materialRefKey: refKey(plainsongLiveMaterialRef),
        outcome: "rebuilt",
      },
      {
        materialRefKey: refKey(seasonOnlyMaterialRef),
        outcome: "rebuilt",
      },
    ],
  });

  const repeatSummary = commands.rebuildMaterialTextDocument({
    materialRef: plainsongMaterialRef,
  });
  assert.deepEqual(repeatSummary, {
    materialRefKey: refKey(plainsongMaterialRef),
    outcome: "rebuilt",
  });
});

const recordingReadPort = createMaterialTextProjectionRecords({
  db: recordingDatabase.context(),
});
const plainsongDocument = recordingReadPort.getMaterialTextDocument({
  materialRef: plainsongMaterialRef,
});
assert.deepEqual(plainsongDocument, {
  materialRefKey: refKey(plainsongMaterialRef),
  materialKind: "recording",
  titleText: "plainsong",
  artistText: "the cure",
  albumText: "disintegration",
  versionText: "edit\nsingle edit\nremix\n2010 remaster\nremaster\nalbum mix\ndemo",
  aliasText: "plain song",
  searchText: [
    "plainsong",
    "the cure",
    "disintegration",
    "edit\nsingle edit\nremix\n2010 remaster\nremaster\nalbum mix\ndemo",
    "plain song",
  ].join("\n"),
  documentJson: JSON.stringify({
    fields: {
      title: [
        { source: "primary_source", basis: "title", value: "plainsong" },
      ],
      artist: [
        { source: "primary_source", basis: "artist", value: "the cure" },
      ],
      album: [
        { source: "primary_source", basis: "album", value: "disintegration" },
      ],
      version: [
        { source: "primary_source", basis: "version_tag", value: "edit" },
        { source: "primary_source", basis: "version_label", value: "single edit" },
        { source: "bound_source", basis: "version_tag", value: "remix" },
        { source: "material", basis: "version_label", value: "2010 remaster" },
        { source: "material", basis: "version_tag", value: "remaster" },
        { source: "canonical", basis: "version_label", value: "album mix" },
        { source: "canonical", basis: "version_tag", value: "demo" },
      ],
      alias: [
        { source: "canonical", basis: "alias", value: "plain song" },
      ],
    },
  }),
  updatedAt: "2026-06-13T11:10:00.000Z",
});
assert.equal(
  plainsongDocument?.documentJson.includes("sourceRef"),
  false,
);
assert.equal(
  plainsongDocument?.documentJson.includes("canonicalRef"),
  false,
);
assert.equal(
  plainsongDocument?.documentJson.includes("materialKind"),
  false,
);
assert.deepEqual(
  recordingReadPort.matchMaterialTextDocuments({ text: "plainsong" }).map((record) => record.materialRefKey),
  [
    refKey(plainsongMaterialRef),
    refKey(plainsongLiveMaterialRef),
  ],
);
assert.deepEqual(
  recordingReadPort.matchMaterialTextDocuments({ text: "plain song" }).map((record) => record.materialRefKey),
  [refKey(plainsongMaterialRef)],
);
assert.deepEqual(
  recordingReadPort.matchMaterialTextDocuments({ text: "show plainsong" }).map((record) => record.materialRefKey),
  [refKey(plainsongLiveMaterialRef)],
);
assert.deepEqual(
  recordingReadPort.matchMaterialTextDocuments({ text: "long season" }).map((record) => record.materialRefKey),
  [refKey(longSeasonMaterialRef)],
);
assert.equal(
  recordingDatabase.context().get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM material_text_fts WHERE material_ref_key = ?",
    [refKey(plainsongMaterialRef)],
  )?.count,
  1,
);
assert.equal(
  recordingReadPort.matchMaterialTextDocuments({ text: "plainsong", limit: 1 }).length,
  1,
);
assert.throws(
  () => recordingReadPort.matchMaterialTextDocuments({ text: "   " }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.material_text_projection_invalid",
);
assert.throws(
  () => recordingReadPort.matchMaterialTextDocuments({ text: "plainsong", limit: 0 }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.material_text_projection_invalid",
);
assert.deepEqual(
  recordingReadPort.matchMaterialTextDocuments({ text: "foo OR bar" }).map((record) => record.materialRefKey),
  [],
);
for (const text of [
  "foo AND bar",
  "foo NOT bar",
  "NEAR(foo bar)",
  "abc*",
  "-title",
  "\"quoted\"",
  "a:b",
]) {
  assert.doesNotThrow(() => {
    recordingReadPort.matchMaterialTextDocuments({ text });
  });
}
recordingDatabase.close();

const operatorDatabase = initializedDatabase();
const operatorReadPort = seedOperatorProjection(operatorDatabase);
assert.deepEqual(
  operatorReadPort.matchMaterialTextDocuments({ text: "foo OR bar" }).map((record) => record.materialRefKey),
  [refKey(materialRef("recording", "m_or"))],
);
assert.deepEqual(
  operatorReadPort.matchMaterialTextDocuments({ text: "foo AND bar" }).map((record) => record.materialRefKey),
  [refKey(materialRef("recording", "m_and"))],
);
assert.deepEqual(
  operatorReadPort.matchMaterialTextDocuments({ text: "foo NOT bar" }).map((record) => record.materialRefKey),
  [refKey(materialRef("recording", "m_not"))],
);
operatorDatabase.close();

const orderingDatabase = initializedDatabase();
const orderingMaterialRef = materialRef("recording", "m_ordering");
const orderingCanonicalRef = canonicalRef("recording", "c_ordering");
orderingDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T11:30:00.000Z" });
  identity.upsertSourceRecord({
    entity: sourceTrack("1100", "Ordering Probe"),
  });
  identity.upsertMaterialRecord({
    materialRef: orderingMaterialRef,
    kind: "recording",
  });
  identity.upsertCanonicalRecord({
    entity: {
      canonicalRef: orderingCanonicalRef,
      kind: "recording",
      label: "Ordering Probe",
      aliases: ["夜曲", "Éclair", "A Song", "あい"],
    },
    status: "active",
  });
  identity.bindSourceToMaterial({
    sourceRef: sourceRef("track", "1100"),
    materialRef: orderingMaterialRef,
    makePrimary: true,
  });
  identity.bindMaterialToCanonical({
    materialRef: orderingMaterialRef,
    canonicalRef: orderingCanonicalRef,
  });

  createMaterialTextProjectionCommands({
    db,
    now: "2026-06-13T11:31:00.000Z",
  }).rebuildMaterialTextDocument({
    materialRef: orderingMaterialRef,
  });
});
assert.deepEqual(
  createMaterialTextProjectionRecords({ db: orderingDatabase.context() }).getMaterialTextDocument({
    materialRef: orderingMaterialRef,
  }),
  {
    materialRefKey: refKey(orderingMaterialRef),
    materialKind: "recording",
    titleText: "ordering probe",
    artistText: "",
    albumText: "",
    versionText: "",
    aliasText: "a song\néclair\nあい\n夜曲",
    searchText: "ordering probe\na song\néclair\nあい\n夜曲",
    documentJson: JSON.stringify({
      fields: {
        title: [
          { source: "primary_source", basis: "title", value: "ordering probe" },
        ],
        artist: [],
        album: [],
        version: [],
        alias: [
          { source: "canonical", basis: "alias", value: "a song" },
          { source: "canonical", basis: "alias", value: "éclair" },
          { source: "canonical", basis: "alias", value: "あい" },
          { source: "canonical", basis: "alias", value: "夜曲" },
        ],
      },
    }),
    updatedAt: "2026-06-13T11:31:00.000Z",
  },
);
orderingDatabase.close();

const emptyDatabase = initializedDatabase();
const emptyMaterialRef = materialRef("recording", "m_empty");
emptyDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T12:00:00.000Z" });
  identity.upsertMaterialRecord({
    materialRef: emptyMaterialRef,
    kind: "recording",
  });

  const commands = createMaterialTextProjectionCommands({
    db,
    now: "2026-06-13T12:01:00.000Z",
  });
  assert.deepEqual(commands.rebuildMaterialTextDocument({ materialRef: emptyMaterialRef }), {
    materialRefKey: refKey(emptyMaterialRef),
    outcome: "rebuilt",
  });
});
const emptyReadPort = createMaterialTextProjectionRecords({ db: emptyDatabase.context() });
assert.deepEqual(emptyReadPort.getMaterialTextDocument({ materialRef: emptyMaterialRef }), {
  materialRefKey: refKey(emptyMaterialRef),
  materialKind: "recording",
  titleText: "",
  artistText: "",
  albumText: "",
  versionText: "",
  aliasText: "",
  searchText: "",
  documentJson: "{\"fields\":{\"title\":[],\"artist\":[],\"album\":[],\"version\":[],\"alias\":[]}}",
  updatedAt: "2026-06-13T12:01:00.000Z",
});
assert.equal(
  emptyDatabase.context().get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM material_text_fts WHERE material_ref_key = ?",
    [refKey(emptyMaterialRef)],
  )?.count,
  1,
);
emptyDatabase.transaction((db) => {
  archiveMaterialRecord(db, emptyMaterialRef, "2026-06-13T12:02:00.000Z");
  const commands = createMaterialTextProjectionCommands({
    db,
    now: "2026-06-13T12:03:00.000Z",
  });
  assert.deepEqual(commands.rebuildMaterialTextDocument({ materialRef: emptyMaterialRef }), {
    materialRefKey: refKey(emptyMaterialRef),
    outcome: "deleted",
  });
  assert.deepEqual(
    commands.rebuildMaterialTextDocument({
      materialRef: materialRef("recording", "m_missing"),
    }),
    {
      materialRefKey: refKey(materialRef("recording", "m_missing")),
      outcome: "deleted",
    },
  );
});
assert.equal(
  emptyReadPort.getMaterialTextDocument({ materialRef: emptyMaterialRef }),
  undefined,
);
assert.equal(
  emptyDatabase.context().get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM material_text_fts WHERE material_ref_key = ?",
    [refKey(emptyMaterialRef)],
  )?.count,
  0,
);
emptyDatabase.close();

const staleBindingDatabase = initializedDatabase();
const staleMaterialRef = materialRef("recording", "m_stale");
const staleSource = sourceTrack("2001", "Stale Source", {
  artistLabels: ["Ghost Artist"],
});
staleBindingDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T13:00:00.000Z" });
  identity.upsertSourceRecord({ entity: staleSource });
  identity.upsertMaterialRecord({
    materialRef: staleMaterialRef,
    kind: "recording",
  });
  overwriteMaterialEntity(db, {
    materialRef: staleMaterialRef,
    kind: "recording",
    lifecycleStatus: "active",
    identityStatus: "source_backed",
    sourceRefs: [staleSource.sourceRef],
    primarySourceRef: staleSource.sourceRef,
    updatedAt: "2026-06-13T13:01:00.000Z",
  });
  createMaterialTextProjectionCommands({
    db,
    now: "2026-06-13T13:02:00.000Z",
  }).rebuildMaterialTextDocument({
    materialRef: staleMaterialRef,
  });
});
assert.deepEqual(
  createMaterialTextProjectionRecords({ db: staleBindingDatabase.context() }).getMaterialTextDocument({
    materialRef: staleMaterialRef,
  }),
  {
    materialRefKey: refKey(staleMaterialRef),
    materialKind: "recording",
    titleText: "",
    artistText: "",
    albumText: "",
    versionText: "",
    aliasText: "",
    searchText: "",
    documentJson: "{\"fields\":{\"title\":[],\"artist\":[],\"album\":[],\"version\":[],\"alias\":[]}}",
    updatedAt: "2026-06-13T13:02:00.000Z",
  },
);
staleBindingDatabase.close();

const orphanBindingDatabase = initializedDatabase();
const orphanMaterialRef = materialRef("recording", "m_orphan_binding");
orphanBindingDatabase.transaction((db) => {
  createIdentityWriteCommands({ db, now: "2026-06-13T13:30:00.000Z" }).upsertMaterialRecord({
    materialRef: orphanMaterialRef,
    kind: "recording",
  });
});
orphanBindingDatabase.context().run("PRAGMA foreign_keys = OFF");
orphanBindingDatabase.context().run(
  `
    INSERT INTO source_material_bindings (
      source_ref_key,
      material_ref_key,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?)
  `,
  [
    refKey(sourceRef("track", "2999")),
    refKey(orphanMaterialRef),
    "2026-06-13T13:31:00.000Z",
    "2026-06-13T13:31:00.000Z",
  ],
);
orphanBindingDatabase.context().run("PRAGMA foreign_keys = ON");
orphanBindingDatabase.transaction((db) => {
  assert.throws(
    () =>
      createMaterialTextProjectionCommands({
        db,
        now: "2026-06-13T13:32:00.000Z",
      }).rebuildMaterialTextDocument({
        materialRef: orphanMaterialRef,
      }),
    (error: unknown) =>
      isMusicDataPlatformError(error) &&
      error.code === "music_data.source_not_found" &&
      error.message.includes(refKey(sourceRef("track", "2999"))),
  );
});
orphanBindingDatabase.close();

const canonicalGuardDatabase = initializedDatabase();
const sourceBackedMaterialRef = materialRef("recording", "m_source_backed");
const archivedCanonicalMaterialRef = materialRef("recording", "m_archived_canonical");
const sourceBackedCanonicalRef = canonicalRef("recording", "c_source_backed");
const archivedCanonicalRef = canonicalRef("recording", "c_archived");
canonicalGuardDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T14:00:00.000Z" });
  identity.upsertSourceRecord({
    entity: sourceTrack("3001", "Source Backed Title", {
      artistLabels: ["Test Artist"],
    }),
  });
  identity.upsertSourceRecord({
    entity: sourceTrack("3002", "Archived Canonical Title", {
      artistLabels: ["Test Artist"],
    }),
  });
  identity.upsertMaterialRecord({
    materialRef: sourceBackedMaterialRef,
    kind: "recording",
  });
  identity.upsertMaterialRecord({
    materialRef: archivedCanonicalMaterialRef,
    kind: "recording",
  });
  identity.upsertCanonicalRecord({
    entity: {
      canonicalRef: sourceBackedCanonicalRef,
      kind: "recording",
      label: "Should Stay Hidden",
      aliases: ["hidden alias"],
    },
    status: "active",
  });
  identity.upsertCanonicalRecord({
    entity: {
      canonicalRef: archivedCanonicalRef,
      kind: "recording",
      label: "Archived Canonical",
      aliases: ["archived alias"],
    },
    status: "active",
  });
  identity.bindSourceToMaterial({
    sourceRef: sourceRef("track", "3001"),
    materialRef: sourceBackedMaterialRef,
    makePrimary: true,
  });
  identity.bindSourceToMaterial({
    sourceRef: sourceRef("track", "3002"),
    materialRef: archivedCanonicalMaterialRef,
    makePrimary: true,
  });
  identity.bindMaterialToCanonical({
    materialRef: archivedCanonicalMaterialRef,
    canonicalRef: archivedCanonicalRef,
  });

  overwriteMaterialEntity(db, {
    materialRef: sourceBackedMaterialRef,
    kind: "recording",
    lifecycleStatus: "active",
    identityStatus: "source_backed",
    sourceRefs: [sourceRef("track", "3001")],
    primarySourceRef: sourceRef("track", "3001"),
    canonicalRef: sourceBackedCanonicalRef,
    updatedAt: "2026-06-13T14:01:00.000Z",
  });
  db.run(
    `
      UPDATE canonical_records
      SET status = ?, updated_at = ?
      WHERE ref_key = ?
    `,
    ["archived", "2026-06-13T14:02:00.000Z", refKey(archivedCanonicalRef)],
  );

  const commands = createMaterialTextProjectionCommands({
    db,
    now: "2026-06-13T14:03:00.000Z",
  });
  commands.rebuildMaterialTextDocuments({
    materialRefs: [sourceBackedMaterialRef, archivedCanonicalMaterialRef],
  });
});
const canonicalGuardReadPort = createMaterialTextProjectionRecords({
  db: canonicalGuardDatabase.context(),
});
assert.deepEqual(
  canonicalGuardReadPort.getMaterialTextDocument({ materialRef: sourceBackedMaterialRef }),
  {
    materialRefKey: refKey(sourceBackedMaterialRef),
    materialKind: "recording",
    titleText: "source backed title",
    artistText: "test artist",
    albumText: "",
    versionText: "",
    aliasText: "",
    searchText: "source backed title\ntest artist",
    documentJson: JSON.stringify({
      fields: {
        title: [
          { source: "primary_source", basis: "title", value: "source backed title" },
        ],
        artist: [
          { source: "primary_source", basis: "artist", value: "test artist" },
        ],
        album: [],
        version: [],
        alias: [],
      },
    }),
    updatedAt: "2026-06-13T14:03:00.000Z",
  },
);
assert.deepEqual(
  canonicalGuardReadPort.getMaterialTextDocument({ materialRef: archivedCanonicalMaterialRef }),
  {
    materialRefKey: refKey(archivedCanonicalMaterialRef),
    materialKind: "recording",
    titleText: "archived canonical title",
    artistText: "test artist",
    albumText: "",
    versionText: "",
    aliasText: "",
    searchText: "archived canonical title\ntest artist",
    documentJson: JSON.stringify({
      fields: {
        title: [
          { source: "primary_source", basis: "title", value: "archived canonical title" },
        ],
        artist: [
          { source: "primary_source", basis: "artist", value: "test artist" },
        ],
        album: [],
        version: [],
        alias: [],
      },
    }),
    updatedAt: "2026-06-13T14:03:00.000Z",
  },
);
canonicalGuardDatabase.close();

const albumArtistDatabase = initializedDatabase();
const albumMaterialRef = materialRef("album", "m_album");
const artistMaterialRef = materialRef("artist", "m_artist");
const albumCanonicalRef = canonicalRef("album", "c_album");
const artistCanonicalRef = canonicalRef("artist", "c_artist");
albumArtistDatabase.transaction((db) => {
  const identity = createIdentityWriteCommands({ db, now: "2026-06-13T15:00:00.000Z" });
  identity.upsertSourceRecord({
    entity: sourceAlbum("4001", "Kid A", {
      artistLabels: ["Radiohead"],
      versionInfo: {
        tags: ["deluxe"],
      },
    }),
  });
  identity.upsertSourceRecord({
    entity: sourceArtist("4002", "Mili", {
      aliases: ["mili project"],
    }),
  });
  identity.upsertMaterialRecord({
    materialRef: albumMaterialRef,
    kind: "album",
  });
  identity.upsertMaterialRecord({
    materialRef: artistMaterialRef,
    kind: "artist",
  });
  identity.upsertCanonicalRecord({
    entity: {
      canonicalRef: albumCanonicalRef,
      kind: "album",
      label: "Kid A",
      aliases: ["Kid A LP"],
    },
    status: "active",
  });
  identity.upsertCanonicalRecord({
    entity: {
      canonicalRef: artistCanonicalRef,
      kind: "artist",
      label: "Mili",
      aliases: ["momocashew project"],
    },
    status: "active",
  });
  identity.bindSourceToMaterial({
    sourceRef: sourceRef("album", "4001"),
    materialRef: albumMaterialRef,
    makePrimary: true,
  });
  identity.bindSourceToMaterial({
    sourceRef: sourceRef("artist", "4002"),
    materialRef: artistMaterialRef,
    makePrimary: true,
  });
  identity.bindMaterialToCanonical({
    materialRef: albumMaterialRef,
    canonicalRef: albumCanonicalRef,
  });
  identity.bindMaterialToCanonical({
    materialRef: artistMaterialRef,
    canonicalRef: artistCanonicalRef,
  });

  createMaterialTextProjectionCommands({
    db,
    now: "2026-06-13T15:01:00.000Z",
  }).rebuildMaterialTextDocuments({
    materialRefs: [albumMaterialRef, artistMaterialRef],
  });
});
const albumArtistReadPort = createMaterialTextProjectionRecords({
  db: albumArtistDatabase.context(),
});
assert.deepEqual(
  albumArtistReadPort.getMaterialTextDocument({ materialRef: albumMaterialRef }),
  {
    materialRefKey: refKey(albumMaterialRef),
    materialKind: "album",
    titleText: "kid a",
    artistText: "radiohead",
    albumText: "",
    versionText: "deluxe",
    aliasText: "kid a lp",
    searchText: "kid a\nradiohead\ndeluxe\nkid a lp",
    documentJson: JSON.stringify({
      fields: {
        title: [
          { source: "primary_source", basis: "title", value: "kid a" },
        ],
        artist: [
          { source: "primary_source", basis: "artist", value: "radiohead" },
        ],
        album: [],
        version: [
          { source: "primary_source", basis: "version_tag", value: "deluxe" },
        ],
        alias: [
          { source: "canonical", basis: "alias", value: "kid a lp" },
        ],
      },
    }),
    updatedAt: "2026-06-13T15:01:00.000Z",
  },
);
assert.deepEqual(
  albumArtistReadPort.getMaterialTextDocument({ materialRef: artistMaterialRef }),
  {
    materialRefKey: refKey(artistMaterialRef),
    materialKind: "artist",
    titleText: "",
    artistText: "mili",
    albumText: "",
    versionText: "",
    aliasText: "mili project\nmomocashew project",
    searchText: "mili\nmili project\nmomocashew project",
    documentJson: JSON.stringify({
      fields: {
        title: [],
        artist: [
          { source: "primary_source", basis: "artist", value: "mili" },
        ],
        album: [],
        version: [],
        alias: [
          { source: "primary_source", basis: "alias", value: "mili project" },
          { source: "canonical", basis: "alias", value: "momocashew project" },
        ],
      },
    }),
    updatedAt: "2026-06-13T15:01:00.000Z",
  },
);
albumArtistDatabase.close();

function initializedDatabase(): ReturnType<typeof SqliteMusicDatabase.open> {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformMaterialTextProjectionSchema,
    ],
  });

  return database;
}

function seedOperatorProjection(
  database: ReturnType<typeof SqliteMusicDatabase.open>,
): MaterialTextProjectionReadPort {
  database.transaction((db) => {
    const identity = createIdentityWriteCommands({ db, now: "2026-06-13T16:00:00.000Z" });
    const orMaterialRef = materialRef("recording", "m_or");
    const andMaterialRef = materialRef("recording", "m_and");
    const notMaterialRef = materialRef("recording", "m_not");
    const materialRefs = [
      orMaterialRef,
      andMaterialRef,
      notMaterialRef,
    ] as const;

    identity.upsertSourceRecord({ entity: sourceTrack("5001", "foo or bar") });
    identity.upsertSourceRecord({ entity: sourceTrack("5002", "foo and bar") });
    identity.upsertSourceRecord({ entity: sourceTrack("5003", "foo not bar") });

    for (const materialRefValue of materialRefs) {
      identity.upsertMaterialRecord({
        materialRef: materialRefValue,
        kind: "recording",
      });
    }

    identity.bindSourceToMaterial({
      sourceRef: sourceRef("track", "5001"),
      materialRef: orMaterialRef,
      makePrimary: true,
    });
    identity.bindSourceToMaterial({
      sourceRef: sourceRef("track", "5002"),
      materialRef: andMaterialRef,
      makePrimary: true,
    });
    identity.bindSourceToMaterial({
      sourceRef: sourceRef("track", "5003"),
      materialRef: notMaterialRef,
      makePrimary: true,
    });

    createMaterialTextProjectionCommands({
      db,
      now: "2026-06-13T16:01:00.000Z",
    }).rebuildMaterialTextDocuments({
      materialRefs,
    });
  });

  return createMaterialTextProjectionRecords({ db: database.context() });
}

function sourceTrack(
  id: string,
  title: string,
  input?: {
    artistLabels?: readonly string[];
    albumLabel?: string;
    versionInfo?: {
      label?: string;
      tags?: readonly string[];
    };
  },
): {
  kind: "track";
  sourceRef: Ref;
  providerId: string;
  providerEntityId: string;
  label: string;
  title: string;
  artistLabels?: readonly string[];
  albumLabel?: string;
  versionInfo?: {
    label?: string;
    tags?: readonly string[];
  };
} {
  return {
    kind: "track",
    sourceRef: sourceRef("track", id),
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
    ...(input?.artistLabels === undefined ? {} : { artistLabels: input.artistLabels }),
    ...(input?.albumLabel === undefined ? {} : { albumLabel: input.albumLabel }),
    ...(input?.versionInfo === undefined ? {} : { versionInfo: input.versionInfo }),
  };
}

function sourceAlbum(
  id: string,
  title: string,
  input?: {
    artistLabels?: readonly string[];
    versionInfo?: {
      label?: string;
      tags?: readonly string[];
    };
  },
): {
  kind: "album";
  sourceRef: Ref;
  providerId: string;
  providerEntityId: string;
  label: string;
  title: string;
  artistLabels?: readonly string[];
  versionInfo?: {
    label?: string;
    tags?: readonly string[];
  };
} {
  return {
    kind: "album",
    sourceRef: sourceRef("album", id),
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
    ...(input?.artistLabels === undefined ? {} : { artistLabels: input.artistLabels }),
    ...(input?.versionInfo === undefined ? {} : { versionInfo: input.versionInfo }),
  };
}

function sourceArtist(
  id: string,
  name: string,
  input?: {
    aliases?: readonly string[];
  },
): {
  kind: "artist";
  sourceRef: Ref;
  providerId: string;
  providerEntityId: string;
  label: string;
  name: string;
  aliases?: readonly string[];
} {
  return {
    kind: "artist",
    sourceRef: sourceRef("artist", id),
    providerId: "netease",
    providerEntityId: id,
    label: name,
    name,
    ...(input?.aliases === undefined ? {} : { aliases: input.aliases }),
  };
}

function sourceRef(kind: "track" | "album" | "artist", id: string): Ref {
  return {
    namespace: "source_netease",
    kind,
    id,
  };
}

function materialRef(
  kind: "recording" | "album" | "artist" | "work" | "release",
  id: string,
): Ref {
  return {
    namespace: "material",
    kind,
    id,
  };
}

function canonicalRef(
  kind: "recording" | "album" | "artist" | "work" | "release",
  id: string,
): Ref {
  return {
    namespace: "canonical_minemusic",
    kind,
    id,
  };
}

function archiveMaterialRecord(
  db: MusicDatabaseTransactionContext,
  materialRefValue: Ref,
  updatedAt: string,
): void {
  overwriteMaterialEntity(db, {
    materialRef: materialRefValue,
    kind: materialRefValue.kind as "recording" | "album" | "artist" | "work" | "release",
    lifecycleStatus: "archived",
    identityStatus: "unresolved_identity",
    sourceRefs: [],
    updatedAt,
  });
}

function overwriteMaterialEntity(
  db: MusicDatabaseTransactionContext,
  input: {
    materialRef: Ref;
    kind: "recording" | "album" | "artist" | "work" | "release";
    lifecycleStatus: "active" | "merged" | "archived";
    identityStatus: "canonical_confirmed" | "source_backed" | "unresolved_identity";
    sourceRefs: readonly Ref[];
    primarySourceRef?: Ref;
    canonicalRef?: Ref;
    updatedAt: string;
  },
): void {
  const entity = {
    materialRef: input.materialRef,
    kind: input.kind,
    lifecycleStatus: input.lifecycleStatus,
    identityStatus: input.identityStatus,
    sourceRefs: input.sourceRefs,
    ...(input.primarySourceRef === undefined ? {} : { primarySourceRef: input.primarySourceRef }),
    ...(input.canonicalRef === undefined ? {} : { canonicalRef: input.canonicalRef }),
  };

  db.run(
    `
      UPDATE material_records
      SET lifecycle_status = ?,
          identity_status = ?,
          canonical_ref_key = ?,
          primary_source_ref_key = ?,
          entity_json = ?,
          updated_at = ?
      WHERE ref_key = ?
    `,
    [
      input.lifecycleStatus,
      input.identityStatus,
      input.canonicalRef === undefined ? null : refKey(input.canonicalRef),
      input.primarySourceRef === undefined ? null : refKey(input.primarySourceRef),
      JSON.stringify(entity),
      input.updatedAt,
      refKey(input.materialRef),
    ],
  );
}
