import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import * as musicDataPlatform from "../../src/music_data_platform/index.js";
import { createMaterialTextProjectionCommands, createMaterialTextProjectionRecords, isMusicDataPlatformError, musicDataPlatformIdentitySchema, musicDataPlatformMaterialTextProjectionSchema, type CreateMaterialTextProjectionCommandsInput, type CreateMaterialTextProjectionRecordsInput, type GetMaterialTextDocumentInput, type MatchMaterialTextDocumentsInput, type MaterialTextDocumentRecord, type MaterialTextMatchRecord, type MaterialTextProjectionCommands, type MaterialTextProjectionReadPort, type RebuildMaterialTextDocumentInput, type RebuildMaterialTextDocumentSummary, type RebuildMaterialTextDocumentsInput, type RebuildMaterialTextDocumentsSummary, } from "../../src/music_data_platform/index.js";
import { buildMaterialTextMatchQuery, normalizeMaterialTextValue, } from "../../src/music_data_platform/material_text_normalization.js";
import { type MusicDatabase, type MusicDatabaseTransactionContext } from "../../src/storage/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { foreignKeyColumns, indexExists, primaryKeyColumns, relationKind, tableColumns } from "./helpers/postgres-introspection.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
function createIdentityTestCommands(db: Parameters<typeof createIdentityWriteCommands>[0]["db"], now: string) {
    return createIdentityWriteCommands({
        db,
        now,
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
}
type Expect<Check extends true> = Check;
export type _createMaterialTextProjectionRecordsInputShape = Expect<Equal<keyof CreateMaterialTextProjectionRecordsInput, "db">>;
export type _getMaterialTextDocumentInputShape = Expect<Equal<keyof GetMaterialTextDocumentInput, "materialRef">>;
export type _matchMaterialTextDocumentsInputShape = Expect<Equal<keyof MatchMaterialTextDocumentsInput, "text" | "limit">>;
export type _materialTextDocumentRecordShape = Expect<Equal<keyof MaterialTextDocumentRecord, "materialRefKey" | "materialKind" | "titleText" | "artistText" | "albumText" | "versionText" | "aliasText" | "searchText" | "documentJson" | "updatedAt">>;
export type _materialTextMatchRecordShape = Expect<Equal<keyof MaterialTextMatchRecord, "materialRefKey" | "materialKind" | "titleText" | "artistText" | "albumText" | "versionText" | "aliasText">>;
export type _materialTextProjectionReadPortShape = Expect<Equal<keyof MaterialTextProjectionReadPort, "getMaterialTextDocument" | "matchMaterialTextDocuments">>;
export type _createMaterialTextProjectionCommandsInputShape = Expect<Equal<keyof CreateMaterialTextProjectionCommandsInput, "db" | "now">>;
export type _rebuildMaterialTextDocumentInputShape = Expect<Equal<keyof RebuildMaterialTextDocumentInput, "materialRef">>;
export type _rebuildMaterialTextDocumentsInputShape = Expect<Equal<keyof RebuildMaterialTextDocumentsInput, "materialRefs">>;
export type _rebuildMaterialTextDocumentSummaryShape = Expect<Equal<keyof RebuildMaterialTextDocumentSummary, "materialRefKey" | "outcome">>;
export type _rebuildMaterialTextDocumentsSummaryShape = Expect<Equal<keyof RebuildMaterialTextDocumentsSummary, "processedMaterialCount" | "rebuiltDocumentCount" | "deletedDocumentCount" | "outcomes">>;
export type _materialTextProjectionCommandsShape = Expect<Equal<keyof MaterialTextProjectionCommands, "rebuildMaterialTextDocument" | "rebuildMaterialTextDocuments">>;
assert.equal("normalizeMaterialTextValue" in musicDataPlatform, false);
assert.equal("buildMaterialTextMatchQuery" in musicDataPlatform, false);
assert.equal(normalizeMaterialTextValue(" Ａ\tB\nＣ "), "a b c");
assert.equal(normalizeMaterialTextValue("I"), "i");
assert.equal(normalizeMaterialTextValue(" café naïve "), "cafe naive");
assert.equal(buildMaterialTextMatchQuery("  Foo\tBar "), "'foo' & 'bar'");
const schemaDatabase = await initializedDatabase();
assert.equal(await relationKind(schemaDatabase, "material_text_documents"), "table");
assert.equal(await relationKind(schemaDatabase, "material_text_fts"), "table");
assert.equal(await indexExists(schemaDatabase, "material_text_fts_search_vector_idx"), true);
assert.deepEqual(await tableColumns(schemaDatabase, "material_text_documents"), [
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
]);
assert.deepEqual(await primaryKeyColumns(schemaDatabase, "material_text_documents"), ["material_ref_key"]);
assert.deepEqual(await foreignKeyColumns(schemaDatabase, "material_text_documents"), [
    {
        table: "material_records",
        from: "material_ref_key",
        to: "ref_key",
    },
]);
assert.deepEqual(await tableColumns(schemaDatabase, "material_text_fts"), [
    "material_ref_key",
    "title_text",
    "artist_text",
    "album_text",
    "version_text",
    "alias_text",
    "search_vector",
]);
await schemaDatabase.transaction(async (db) => {
    await createIdentityTestCommands(db, "2026-06-13T10:00:00.000Z").upsertMaterialRecord({
        materialRef: materialRef("recording", "m_schema"),
        kind: "recording",
    });
    await assert.rejects(async () => await db.run(`
        INSERT INTO material_text_documents (
          material_ref_key,
          material_kind,
          document_json,
          updated_at
        )
        VALUES (?, ?, ?, ?)
      `, [
        refKey(materialRef("recording", "missing")),
        "recording",
        "{\"fields\":{\"title\":[],\"artist\":[],\"album\":[],\"version\":[],\"alias\":[]}}",
        "2026-06-13T10:01:00.000Z",
    ]));
    await assert.rejects(async () => await db.run(`
        INSERT INTO material_text_documents (
          material_ref_key,
          material_kind,
          document_json,
          updated_at
        )
        VALUES (?, ?, ?, ?)
      `, [
        refKey(materialRef("recording", "m_schema")),
        "playlist",
        "{\"fields\":{\"title\":[],\"artist\":[],\"album\":[],\"version\":[],\"alias\":[]}}",
        "2026-06-13T10:02:00.000Z",
    ]));
});
await schemaDatabase.close();
const recordingDatabase = await initializedDatabase();
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
await recordingDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T11:00:00.000Z");
    await identity.upsertSourceRecord({ entity: primaryPlainsongSource });
    await identity.upsertSourceRecord({ entity: duplicatePlainsongSource });
    await identity.upsertSourceRecord({
        entity: sourceTrack("1003", "Plainsong Live", {
            artistLabels: ["The Cure"],
            albumLabel: "Show",
        }),
    });
    await identity.upsertSourceRecord({
        entity: sourceTrack("1004", "Long", {
            artistLabels: ["Fishmans"],
        }),
    });
    await identity.upsertSourceRecord({
        entity: sourceTrack("1005", "Season", {
            artistLabels: ["Fishmans"],
        }),
    });
    await identity.upsertSourceRecord({
        entity: sourceTrack("1006", "Long Season", {
            artistLabels: ["Fishmans"],
            albumLabel: "98.12.28",
        }),
    });
    await identity.upsertMaterialRecord({
        materialRef: plainsongMaterialRef,
        kind: "recording",
        versionInfo: {
            label: "2010 Remaster",
            tags: ["remaster"],
        },
    });
    await identity.upsertMaterialRecord({
        materialRef: plainsongLiveMaterialRef,
        kind: "recording",
    });
    await identity.upsertMaterialRecord({
        materialRef: longOnlyMaterialRef,
        kind: "recording",
    });
    await identity.upsertMaterialRecord({
        materialRef: seasonOnlyMaterialRef,
        kind: "recording",
    });
    await identity.upsertMaterialRecord({
        materialRef: longSeasonMaterialRef,
        kind: "recording",
    });
    await identity.upsertCanonicalRecord({
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
    await identity.bindSourceToMaterial({
        sourceRef: primaryPlainsongSource.sourceRef,
        materialRef: plainsongMaterialRef,
        makePrimary: true,
    });
    await identity.bindSourceToMaterial({
        sourceRef: duplicatePlainsongSource.sourceRef,
        materialRef: plainsongMaterialRef,
    });
    await identity.bindMaterialToCanonical({
        materialRef: plainsongMaterialRef,
        canonicalRef: plainsongCanonicalRef,
    });
    await identity.bindSourceToMaterial({
        sourceRef: sourceRef("track", "1003"),
        materialRef: plainsongLiveMaterialRef,
        makePrimary: true,
    });
    await identity.bindSourceToMaterial({
        sourceRef: sourceRef("track", "1004"),
        materialRef: longOnlyMaterialRef,
        makePrimary: true,
    });
    await identity.bindSourceToMaterial({
        sourceRef: sourceRef("track", "1005"),
        materialRef: seasonOnlyMaterialRef,
        makePrimary: true,
    });
    await identity.bindSourceToMaterial({
        sourceRef: sourceRef("track", "1006"),
        materialRef: longSeasonMaterialRef,
        makePrimary: true,
    });
    const commands = createMaterialTextProjectionCommands({
        db,
        now: "2026-06-13T11:10:00.000Z",
    });
    const summary = await commands.rebuildMaterialTextDocuments({
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
    const repeatSummary = await commands.rebuildMaterialTextDocument({
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
const plainsongDocument = await recordingReadPort.getMaterialTextDocument({
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
assert.equal(plainsongDocument?.documentJson.includes("sourceRef"), false);
assert.equal(plainsongDocument?.documentJson.includes("canonicalRef"), false);
assert.equal(plainsongDocument?.documentJson.includes("materialKind"), false);
assert.deepEqual((await recordingReadPort.matchMaterialTextDocuments({ text: "plainsong" })).map((record) => record.materialRefKey), [
    refKey(plainsongMaterialRef),
    refKey(plainsongLiveMaterialRef),
]);
assert.deepEqual((await recordingReadPort.matchMaterialTextDocuments({ text: "plain song" })).map((record) => record.materialRefKey), [refKey(plainsongMaterialRef)]);
assert.deepEqual((await recordingReadPort.matchMaterialTextDocuments({ text: "show plainsong" })).map((record) => record.materialRefKey), [refKey(plainsongLiveMaterialRef)]);
assert.deepEqual((await recordingReadPort.matchMaterialTextDocuments({ text: "long season" })).map((record) => record.materialRefKey), [refKey(longSeasonMaterialRef)]);
assert.equal((await recordingDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM material_text_fts WHERE material_ref_key = ?", [refKey(plainsongMaterialRef)]))?.count, 1);
assert.equal((await recordingReadPort.matchMaterialTextDocuments({ text: "plainsong", limit: 1 })).length, 1);
await assert.rejects(async () => await recordingReadPort.matchMaterialTextDocuments({ text: "   " }), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.material_text_projection_invalid");
await assert.rejects(async () => await recordingReadPort.matchMaterialTextDocuments({ text: "plainsong", limit: 0 }), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.material_text_projection_invalid");
assert.deepEqual((await recordingReadPort.matchMaterialTextDocuments({ text: "foo OR bar" })).map((record) => record.materialRefKey), []);
for (const text of [
    "foo AND bar",
    "foo NOT bar",
    "NEAR(foo bar)",
    "abc*",
    "-title",
    "\"quoted\"",
    "a:b",
]) {
    await recordingReadPort.matchMaterialTextDocuments({ text });
}
await recordingDatabase.close();
const operatorDatabase = await initializedDatabase();
const operatorReadPort = await seedOperatorProjection(operatorDatabase);
assert.deepEqual((await operatorReadPort.matchMaterialTextDocuments({ text: "foo OR bar" })).map((record) => record.materialRefKey), [refKey(materialRef("recording", "m_or"))]);
assert.deepEqual((await operatorReadPort.matchMaterialTextDocuments({ text: "foo AND bar" })).map((record) => record.materialRefKey), [refKey(materialRef("recording", "m_and"))]);
assert.deepEqual((await operatorReadPort.matchMaterialTextDocuments({ text: "foo NOT bar" })).map((record) => record.materialRefKey), [refKey(materialRef("recording", "m_not"))]);
await operatorDatabase.close();
const orderingDatabase = await initializedDatabase();
const orderingMaterialRef = materialRef("recording", "m_ordering");
const orderingCanonicalRef = canonicalRef("recording", "c_ordering");
await orderingDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T11:30:00.000Z");
    await identity.upsertSourceRecord({
        entity: sourceTrack("1100", "Ordering Probe"),
    });
    await identity.upsertMaterialRecord({
        materialRef: orderingMaterialRef,
        kind: "recording",
    });
    await identity.upsertCanonicalRecord({
        entity: {
            canonicalRef: orderingCanonicalRef,
            kind: "recording",
            label: "Ordering Probe",
            aliases: ["夜曲", "Éclair", "A Song", "あい"],
        },
        status: "active",
    });
    await identity.bindSourceToMaterial({
        sourceRef: sourceRef("track", "1100"),
        materialRef: orderingMaterialRef,
        makePrimary: true,
    });
    await identity.bindMaterialToCanonical({
        materialRef: orderingMaterialRef,
        canonicalRef: orderingCanonicalRef,
    });
    await createMaterialTextProjectionCommands({
        db,
        now: "2026-06-13T11:31:00.000Z",
    }).rebuildMaterialTextDocument({
        materialRef: orderingMaterialRef,
    });
});
assert.deepEqual(await createMaterialTextProjectionRecords({ db: orderingDatabase.context() }).getMaterialTextDocument({
    materialRef: orderingMaterialRef,
}), {
    materialRefKey: refKey(orderingMaterialRef),
    materialKind: "recording",
    titleText: "ordering probe",
    artistText: "",
    albumText: "",
    versionText: "",
    aliasText: "a song\neclair\nあい\n夜曲",
    searchText: "ordering probe\na song\neclair\nあい\n夜曲",
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
                { source: "canonical", basis: "alias", value: "eclair" },
                { source: "canonical", basis: "alias", value: "あい" },
                { source: "canonical", basis: "alias", value: "夜曲" },
            ],
        },
    }),
    updatedAt: "2026-06-13T11:31:00.000Z",
});
await orderingDatabase.close();
const batchOrderingDatabase = await initializedDatabase();
const batchOrderingRefs = [
    materialRef("recording", "z"),
    materialRef("recording", "é"),
    materialRef("recording", "a"),
    materialRef("recording", "あ"),
    materialRef("recording", "夜"),
] as const;
await batchOrderingDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T11:40:00.000Z");
    for (const materialRefValue of batchOrderingRefs) {
        await identity.upsertMaterialRecord({
            materialRef: materialRefValue,
            kind: "recording",
        });
    }
    const summary = await createMaterialTextProjectionCommands({
        db,
        now: "2026-06-13T11:41:00.000Z",
    }).rebuildMaterialTextDocuments({
        materialRefs: [
            batchOrderingRefs[0],
            batchOrderingRefs[1],
            batchOrderingRefs[2],
            batchOrderingRefs[3],
            batchOrderingRefs[4],
            batchOrderingRefs[2],
        ],
    });
    assert.deepEqual(summary.outcomes.map((outcome) => outcome.materialRefKey), [
        refKey(materialRef("recording", "a")),
        refKey(materialRef("recording", "z")),
        refKey(materialRef("recording", "é")),
        refKey(materialRef("recording", "あ")),
        refKey(materialRef("recording", "夜")),
    ]);
    assert.equal(summary.processedMaterialCount, 5);
});
await batchOrderingDatabase.close();
const emptyDatabase = await initializedDatabase();
const emptyMaterialRef = materialRef("recording", "m_empty");
await emptyDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T12:00:00.000Z");
    await identity.upsertMaterialRecord({
        materialRef: emptyMaterialRef,
        kind: "recording",
    });
    const commands = createMaterialTextProjectionCommands({
        db,
        now: "2026-06-13T12:01:00.000Z",
    });
    assert.deepEqual(await commands.rebuildMaterialTextDocument({ materialRef: emptyMaterialRef }), {
        materialRefKey: refKey(emptyMaterialRef),
        outcome: "rebuilt",
    });
});
const emptyReadPort = createMaterialTextProjectionRecords({ db: emptyDatabase.context() });
assert.deepEqual(await emptyReadPort.getMaterialTextDocument({ materialRef: emptyMaterialRef }), {
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
assert.equal((await emptyDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM material_text_fts WHERE material_ref_key = ?", [refKey(emptyMaterialRef)]))?.count, 1);
await emptyDatabase.transaction(async (db) => {
    await archiveMaterialRecord(db, emptyMaterialRef, "2026-06-13T12:02:00.000Z");
    const commands = createMaterialTextProjectionCommands({
        db,
        now: "2026-06-13T12:03:00.000Z",
    });
    assert.deepEqual(await commands.rebuildMaterialTextDocument({ materialRef: emptyMaterialRef }), {
        materialRefKey: refKey(emptyMaterialRef),
        outcome: "deleted",
    });
    assert.deepEqual(await commands.rebuildMaterialTextDocument({
        materialRef: materialRef("recording", "m_missing"),
    }), {
        materialRefKey: refKey(materialRef("recording", "m_missing")),
        outcome: "deleted",
    });
});
assert.equal(await emptyReadPort.getMaterialTextDocument({ materialRef: emptyMaterialRef }), undefined);
assert.equal((await emptyDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM material_text_fts WHERE material_ref_key = ?", [refKey(emptyMaterialRef)]))?.count, 0);
await emptyDatabase.close();
const staleBindingDatabase = await initializedDatabase();
const staleMaterialRef = materialRef("recording", "m_stale");
const staleSource = sourceTrack("2001", "Stale Source", {
    artistLabels: ["Ghost Artist"],
});
await staleBindingDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T13:00:00.000Z");
    await identity.upsertSourceRecord({ entity: staleSource });
    await identity.upsertMaterialRecord({
        materialRef: staleMaterialRef,
        kind: "recording",
    });
    await overwriteMaterialEntity(db, {
        materialRef: staleMaterialRef,
        kind: "recording",
        lifecycleStatus: "active",
        identityStatus: "source_backed",
        sourceRefs: [staleSource.sourceRef],
        primarySourceRef: staleSource.sourceRef,
        updatedAt: "2026-06-13T13:01:00.000Z",
    });
    await createMaterialTextProjectionCommands({
        db,
        now: "2026-06-13T13:02:00.000Z",
    }).rebuildMaterialTextDocument({
        materialRef: staleMaterialRef,
    });
});
assert.deepEqual(await createMaterialTextProjectionRecords({ db: staleBindingDatabase.context() }).getMaterialTextDocument({
    materialRef: staleMaterialRef,
}), {
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
});
await staleBindingDatabase.close();
const orphanBindingDatabase = await initializedDatabase();
const orphanMaterialRef = materialRef("recording", "m_orphan_binding");
await orphanBindingDatabase.transaction(async (db) => {
    await createIdentityTestCommands(db, "2026-06-13T13:30:00.000Z").upsertMaterialRecord({
        materialRef: orphanMaterialRef,
        kind: "recording",
    });
});
await orphanBindingDatabase.context().run("ALTER TABLE source_material_bindings DISABLE TRIGGER ALL");
try {
    await orphanBindingDatabase.context().run(`
        INSERT INTO source_material_bindings (
          source_ref_key,
          material_ref_key,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?)
      `, [
        refKey(sourceRef("track", "2999")),
        refKey(orphanMaterialRef),
        "2026-06-13T13:31:00.000Z",
        "2026-06-13T13:31:00.000Z",
    ]);
}
finally {
    await orphanBindingDatabase.context().run("ALTER TABLE source_material_bindings ENABLE TRIGGER ALL");
}
await orphanBindingDatabase.transaction(async (db) => {
    await assert.rejects(async () => await createMaterialTextProjectionCommands({
        db,
        now: "2026-06-13T13:32:00.000Z",
    }).rebuildMaterialTextDocument({
        materialRef: orphanMaterialRef,
    }), (error: unknown) => isMusicDataPlatformError(error) &&
        error.code === "music_data.source_not_found" &&
        error.message.includes(refKey(sourceRef("track", "2999"))));
});
await orphanBindingDatabase.close();
const canonicalGuardDatabase = await initializedDatabase();
const sourceBackedMaterialRef = materialRef("recording", "m_source_backed");
const archivedCanonicalMaterialRef = materialRef("recording", "m_archived_canonical");
const sourceBackedCanonicalRef = canonicalRef("recording", "c_source_backed");
const archivedCanonicalRef = canonicalRef("recording", "c_archived");
await canonicalGuardDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T14:00:00.000Z");
    await identity.upsertSourceRecord({
        entity: sourceTrack("3001", "Source Backed Title", {
            artistLabels: ["Test Artist"],
        }),
    });
    await identity.upsertSourceRecord({
        entity: sourceTrack("3002", "Archived Canonical Title", {
            artistLabels: ["Test Artist"],
        }),
    });
    await identity.upsertMaterialRecord({
        materialRef: sourceBackedMaterialRef,
        kind: "recording",
    });
    await identity.upsertMaterialRecord({
        materialRef: archivedCanonicalMaterialRef,
        kind: "recording",
    });
    await identity.upsertCanonicalRecord({
        entity: {
            canonicalRef: sourceBackedCanonicalRef,
            kind: "recording",
            label: "Should Stay Hidden",
            aliases: ["hidden alias"],
        },
        status: "active",
    });
    await identity.upsertCanonicalRecord({
        entity: {
            canonicalRef: archivedCanonicalRef,
            kind: "recording",
            label: "Archived Canonical",
            aliases: ["archived alias"],
        },
        status: "active",
    });
    await identity.bindSourceToMaterial({
        sourceRef: sourceRef("track", "3001"),
        materialRef: sourceBackedMaterialRef,
        makePrimary: true,
    });
    await identity.bindSourceToMaterial({
        sourceRef: sourceRef("track", "3002"),
        materialRef: archivedCanonicalMaterialRef,
        makePrimary: true,
    });
    await identity.bindMaterialToCanonical({
        materialRef: archivedCanonicalMaterialRef,
        canonicalRef: archivedCanonicalRef,
    });
    await overwriteMaterialEntity(db, {
        materialRef: sourceBackedMaterialRef,
        kind: "recording",
        lifecycleStatus: "active",
        identityStatus: "source_backed",
        sourceRefs: [sourceRef("track", "3001")],
        primarySourceRef: sourceRef("track", "3001"),
        canonicalRef: sourceBackedCanonicalRef,
        updatedAt: "2026-06-13T14:01:00.000Z",
    });
    await db.run(`
      UPDATE canonical_records
      SET status = ?, updated_at = ?
      WHERE ref_key = ?
    `, ["archived", "2026-06-13T14:02:00.000Z", refKey(archivedCanonicalRef)]);
    const commands = createMaterialTextProjectionCommands({
        db,
        now: "2026-06-13T14:03:00.000Z",
    });
    await commands.rebuildMaterialTextDocuments({
        materialRefs: [sourceBackedMaterialRef, archivedCanonicalMaterialRef],
    });
});
const canonicalGuardReadPort = createMaterialTextProjectionRecords({
    db: canonicalGuardDatabase.context(),
});
assert.deepEqual(await canonicalGuardReadPort.getMaterialTextDocument({ materialRef: sourceBackedMaterialRef }), {
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
});
assert.deepEqual(await canonicalGuardReadPort.getMaterialTextDocument({ materialRef: archivedCanonicalMaterialRef }), {
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
});
await canonicalGuardDatabase.close();
const albumArtistDatabase = await initializedDatabase();
const albumMaterialRef = materialRef("album", "m_album");
const artistMaterialRef = materialRef("artist", "m_artist");
const albumCanonicalRef = canonicalRef("album", "c_album");
const artistCanonicalRef = canonicalRef("artist", "c_artist");
await albumArtistDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T15:00:00.000Z");
    await identity.upsertSourceRecord({
        entity: sourceAlbum("4001", "Kid A", {
            artistLabels: ["Radiohead"],
            versionInfo: {
                tags: ["deluxe"],
            },
        }),
    });
    await identity.upsertSourceRecord({
        entity: sourceArtist("4002", "Mili", {
            aliases: ["mili project"],
        }),
    });
    await identity.upsertMaterialRecord({
        materialRef: albumMaterialRef,
        kind: "album",
    });
    await identity.upsertMaterialRecord({
        materialRef: artistMaterialRef,
        kind: "artist",
    });
    await identity.upsertCanonicalRecord({
        entity: {
            canonicalRef: albumCanonicalRef,
            kind: "album",
            label: "Kid A",
            aliases: ["Kid A LP"],
        },
        status: "active",
    });
    await identity.upsertCanonicalRecord({
        entity: {
            canonicalRef: artistCanonicalRef,
            kind: "artist",
            label: "Mili",
            aliases: ["momocashew project"],
        },
        status: "active",
    });
    await identity.bindSourceToMaterial({
        sourceRef: sourceRef("album", "4001"),
        materialRef: albumMaterialRef,
        makePrimary: true,
    });
    await identity.bindSourceToMaterial({
        sourceRef: sourceRef("artist", "4002"),
        materialRef: artistMaterialRef,
        makePrimary: true,
    });
    await identity.bindMaterialToCanonical({
        materialRef: albumMaterialRef,
        canonicalRef: albumCanonicalRef,
    });
    await identity.bindMaterialToCanonical({
        materialRef: artistMaterialRef,
        canonicalRef: artistCanonicalRef,
    });
    await createMaterialTextProjectionCommands({
        db,
        now: "2026-06-13T15:01:00.000Z",
    }).rebuildMaterialTextDocuments({
        materialRefs: [albumMaterialRef, artistMaterialRef],
    });
});
const albumArtistReadPort = createMaterialTextProjectionRecords({
    db: albumArtistDatabase.context(),
});
assert.deepEqual(await albumArtistReadPort.getMaterialTextDocument({ materialRef: albumMaterialRef }), {
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
});
assert.deepEqual(await albumArtistReadPort.getMaterialTextDocument({ materialRef: artistMaterialRef }), {
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
});
await albumArtistDatabase.close();
async function initializedDatabase(): Promise<MusicDatabase> {
    const database = await openUninitializedPostgresTestMusicDatabase();
    await database.initialize({
        schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformMaterialTextProjectionSchema,
        ],
    });
    return database;
}
async function seedOperatorProjection(database: MusicDatabase): Promise<MaterialTextProjectionReadPort> {
    await database.transaction(async (db) => {
        const identity = createIdentityTestCommands(db, "2026-06-13T16:00:00.000Z");
        const orMaterialRef = materialRef("recording", "m_or");
        const andMaterialRef = materialRef("recording", "m_and");
        const notMaterialRef = materialRef("recording", "m_not");
        const materialRefs = [
            orMaterialRef,
            andMaterialRef,
            notMaterialRef,
        ] as const;
        await identity.upsertSourceRecord({ entity: sourceTrack("5001", "foo or bar") });
        await identity.upsertSourceRecord({ entity: sourceTrack("5002", "foo and bar") });
        await identity.upsertSourceRecord({ entity: sourceTrack("5003", "foo not bar") });
        for (const materialRefValue of materialRefs) {
            await identity.upsertMaterialRecord({
                materialRef: materialRefValue,
                kind: "recording",
            });
        }
        await identity.bindSourceToMaterial({
            sourceRef: sourceRef("track", "5001"),
            materialRef: orMaterialRef,
            makePrimary: true,
        });
        await identity.bindSourceToMaterial({
            sourceRef: sourceRef("track", "5002"),
            materialRef: andMaterialRef,
            makePrimary: true,
        });
        await identity.bindSourceToMaterial({
            sourceRef: sourceRef("track", "5003"),
            materialRef: notMaterialRef,
            makePrimary: true,
        });
        await createMaterialTextProjectionCommands({
            db,
            now: "2026-06-13T16:01:00.000Z",
        }).rebuildMaterialTextDocuments({
            materialRefs,
        });
    });
    return createMaterialTextProjectionRecords({ db: database.context() });
}
function sourceTrack(id: string, title: string, input?: {
    artistLabels?: readonly string[];
    albumLabel?: string;
    versionInfo?: {
        label?: string;
        tags?: readonly string[];
    };
}): {
    kind: "track";
    sourceRef: Ref;
    origin: "provider";
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
        origin: "provider",
        providerId: "netease",
        providerEntityId: id,
        label: title,
        title,
        ...(input?.artistLabels === undefined ? {} : { artistLabels: input.artistLabels }),
        ...(input?.albumLabel === undefined ? {} : { albumLabel: input.albumLabel }),
        ...(input?.versionInfo === undefined ? {} : { versionInfo: input.versionInfo }),
    };
}
function sourceAlbum(id: string, title: string, input?: {
    artistLabels?: readonly string[];
    versionInfo?: {
        label?: string;
        tags?: readonly string[];
    };
}): {
    kind: "album";
    sourceRef: Ref;
    origin: "provider";
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
        origin: "provider",
        providerId: "netease",
        providerEntityId: id,
        label: title,
        title,
        ...(input?.artistLabels === undefined ? {} : { artistLabels: input.artistLabels }),
        ...(input?.versionInfo === undefined ? {} : { versionInfo: input.versionInfo }),
    };
}
function sourceArtist(id: string, name: string, input?: {
    aliases?: readonly string[];
}): {
    kind: "artist";
    sourceRef: Ref;
    origin: "provider";
    providerId: string;
    providerEntityId: string;
    label: string;
    name: string;
    aliases?: readonly string[];
} {
    return {
        kind: "artist",
        sourceRef: sourceRef("artist", id),
        origin: "provider",
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
function materialRef(kind: "recording" | "album" | "artist" | "work" | "release", id: string): Ref {
    return {
        namespace: "material",
        kind,
        id,
    };
}
function canonicalRef(kind: "recording" | "album" | "artist" | "work" | "release", id: string): Ref {
    return {
        namespace: "canonical_minemusic",
        kind,
        id,
    };
}
async function archiveMaterialRecord(db: MusicDatabaseTransactionContext, materialRefValue: Ref, updatedAt: string): Promise<void> {
    await overwriteMaterialEntity(db, {
        materialRef: materialRefValue,
        kind: materialRefValue.kind as "recording" | "album" | "artist" | "work" | "release",
        lifecycleStatus: "archived",
        identityStatus: "unresolved_identity",
        sourceRefs: [],
        updatedAt,
    });
}
async function overwriteMaterialEntity(db: MusicDatabaseTransactionContext, input: {
    materialRef: Ref;
    kind: "recording" | "album" | "artist" | "work" | "release";
    lifecycleStatus: "active" | "merged" | "archived";
    identityStatus: "canonical_confirmed" | "source_backed" | "unresolved_identity";
    sourceRefs: readonly Ref[];
    primarySourceRef?: Ref;
    canonicalRef?: Ref;
    updatedAt: string;
}): Promise<void> {
    const entity = {
        materialRef: input.materialRef,
        kind: input.kind,
        lifecycleStatus: input.lifecycleStatus,
        identityStatus: input.identityStatus,
        sourceRefs: input.sourceRefs,
        ...(input.primarySourceRef === undefined ? {} : { primarySourceRef: input.primarySourceRef }),
        ...(input.canonicalRef === undefined ? {} : { canonicalRef: input.canonicalRef }),
    };
    await db.run(`
      UPDATE material_records
      SET lifecycle_status = ?,
          identity_status = ?,
          canonical_ref_key = ?,
          primary_source_ref_key = ?,
          entity_json = ?,
          updated_at = ?
      WHERE ref_key = ?
    `, [
        input.lifecycleStatus,
        input.identityStatus,
        input.canonicalRef === undefined ? null : refKey(input.canonicalRef),
        input.primarySourceRef === undefined ? null : refKey(input.primarySourceRef),
        JSON.stringify(entity),
        input.updatedAt,
        refKey(input.materialRef),
    ]);
}
