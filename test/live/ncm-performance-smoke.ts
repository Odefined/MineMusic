import { performance } from "node:perf_hooks";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { PlatformLibraryKind, SourceEntity, } from "../../src/contracts/music_data_platform.js";
import { createServerHost, } from "../../src/server/index.js";
import { DEFAULT_OWNER_SCOPE, createMusicDataPlatformSourceOfTruthWriteCommands, createOwnerRelationPoolRef, createProjectionMaintenanceRunner, createSourceLibraryRef, musicDataPlatformIdentitySchema, musicDataPlatformMaterialTextProjectionSchema, musicDataPlatformOwnerCatalogEntriesSchema, musicDataPlatformOwnerCatalogViewSchema, musicDataPlatformOwnerRelationSchema, musicDataPlatformProjectionMaintenanceSchema, musicDataPlatformRetrievalResultSetSchema, musicDataPlatformSourceLibrarySchema, } from "../../src/music_data_platform/index.js";
import type { OwnerMaterialRelationKind, SourceLibraryImportBatchRecord, } from "../../src/music_data_platform/index.js";
import type { RetrievalPoolFilter, RetrievalQueryInput, RetrievalQueryResult, } from "../../src/music_intelligence/index.js";
import { type MusicDatabase } from "../../src/storage/index.js";
import { createPostgresTestSchema, openUninitializedPostgresTestMusicDatabase, postgresTestDatabaseUrl } from "../support/postgres.js";
declare const process: {
    env: Record<string, string | undefined>;
    pid: number;
    exitCode?: number;
};
type PerfConfig = {
    baseUrl?: string;
    providerId: string;
    libraryKind: PlatformLibraryKind;
    primaryText: string;
    secondaryText: string;
    exactText?: string;
    importMaxNewItems: number;
    importPageLimit: number;
    updateMaxCalls: number;
    providerLimit: number;
    localIterations: number;
    mixedIterations: number;
};
type PostgresDatabaseTarget = {
    url: string;
    schema: string;
};
type Measurement = {
    name: string;
    ms: number;
    details?: Record<string, unknown>;
};
type QueryMeasurement = {
    name: string;
    ms: number;
    hitCount: number;
    hitKinds: Record<string, number>;
    nextCursorPresent: boolean;
};
type SourceLibraryRow = {
    library_ref_key: string;
    owner_scope: string;
    provider_id: string;
    provider_account_id: string;
    library_kind: PlatformLibraryKind;
};
const liveEnabled = process.env.MINEMUSIC_LIVE_NCM_PERF === "1";
if (!liveEnabled) {
    console.log("Skipping NCM performance smoke. Set MINEMUSIC_LIVE_NCM_PERF=1 to enable.");
}
else {
    try {
        console.log(JSON.stringify(await runPerfSmoke(readConfig()), null, 2));
    }
    catch (error) {
        console.error(`NCM performance smoke failed: ${formatError(error)}`);
        process.exitCode = 1;
    }
}
async function runPerfSmoke(config: PerfConfig) {
    const database = await createDatabaseTarget("minemusic_live_ncm_perf");
    const measurements: Measurement[] = [];
    const report: Record<string, unknown> = {
        database,
        config: {
            providerId: config.providerId,
            libraryKind: config.libraryKind,
            primaryText: config.primaryText,
            secondaryText: config.secondaryText,
            exactText: config.exactText,
            importPageLimit: config.importPageLimit,
            localIterations: config.localIterations,
            mixedIterations: config.mixedIterations,
        },
        initialCounts: await readCounts(database),
    };
    const initialImport = await measureAsync("initial_import", () => runImport({
        database,
        config,
        maxNewItems: config.importMaxNewItems,
        continueUntilComplete: true,
    }));
    measurements.push(initialImport.measurement);
    report.initialImport = initialImport.value;
    const initialProjection = await measureAsync("projection_after_initial_import", () => runProjectionMaintenance(database));
    measurements.push(initialProjection.measurement);
    report.projectionAfterInitialImport = initialProjection.value;
    const sourceLibrary = await requireSourceLibrary(database, config);
    report.sourceLibrary = sourceLibrary;
    const staleFixture = await createStaleSourceLibraryFixture({
        database,
        config,
        sourceLibrary,
    });
    report.staleFixture = staleFixture;
    const update = await measureAsync("full_provider_update", () => runImport({
        database,
        config,
        continueUntilComplete: true,
    }));
    measurements.push(update.measurement);
    report.providerUpdate = update.value;
    assertCondition(update.value.batch.status === "completed" &&
        update.value.batch.completionReason === "provider_exhausted" &&
        update.value.batch.failedCount === 0, "full provider update must complete without item failures");
    const updateProjection = await measureAsync("projection_after_update", () => runProjectionMaintenance(database));
    measurements.push(updateProjection.measurement);
    report.projectionAfterUpdate = updateProjection.value;
    assertCondition(updateProjection.value.pending === 0 && updateProjection.value.failed === 0, "projection maintenance must be clean after update");
    report.countsAfterUpdateProjection = await readCounts(database);
    report.stalePresentAfterUpdate = await hasSourceLibraryItem(database, {
        libraryRefKey: sourceLibrary.library_ref_key,
        sourceRefKey: staleFixture.sourceRefKey,
    });
    const savedSourceLibraryRef = createSourceLibraryRef({
        ownerScope: sourceLibrary.owner_scope,
        providerId: sourceLibrary.provider_id,
        providerAccountId: sourceLibrary.provider_account_id,
        libraryKind: sourceLibrary.library_kind,
    });
    const favoritePoolRef = createOwnerRelationPoolRef({
        ownerScope: DEFAULT_OWNER_SCOPE,
        relationKind: "favorite",
    });
    const savedPoolRef = createOwnerRelationPoolRef({
        ownerScope: DEFAULT_OWNER_SCOPE,
        relationKind: "saved",
    });
    const queryReport = await measureQueries({
        database,
        config,
        savedSourceLibraryRef,
        favoritePoolRef,
        savedPoolRef,
    });
    report.queryMeasurements = queryReport.measurements;
    report.querySummary = queryReport.summary;
    const relationMaterials = queryReport.primaryMaterialRefs.slice(0, 4);
    if (relationMaterials.length < 4) {
        throw new Error(`Expected at least 4 primary local materials, got ${relationMaterials.length}.`);
    }
    const relationWrite = await measureAsync("relation_write_5_records", () => recordRelationScenario(database, relationMaterials));
    measurements.push(relationWrite.measurement);
    report.relationWrite = relationWrite.value;
    const relationProjection = await measureAsync("projection_after_relation_write", () => runProjectionMaintenance(database));
    measurements.push(relationProjection.measurement);
    report.projectionAfterRelationWrite = relationProjection.value;
    assertCondition(relationProjection.value.pending === 0 && relationProjection.value.failed === 0, "projection maintenance must be clean after relation writes");
    const relationQueries = await measureRelationQueries({
        database,
        config,
        favoritePoolRef,
        savedPoolRef,
        savedSourceLibraryRef,
    });
    report.relationQueryMeasurements = relationQueries;
    report.finalCounts = await readCounts(database);
    report.stageMeasurements = measurements;
    return report;
}
async function measureQueries(input: {
    database: PostgresDatabaseTarget;
    config: PerfConfig;
    savedSourceLibraryRef: Ref;
    favoritePoolRef: Ref;
    savedPoolRef: Ref;
}) {
    return withStartedHost(input.database, input.config, async (host) => {
        const retrievalQuery = host.retrievalQuery();
        if (retrievalQuery === undefined) {
            throw new Error("Retrieval query service was not wired.");
        }
        const measurements: QueryMeasurement[] = [];
        const localPrimarySamples: number[] = [];
        const mixedPrimaryWarmSamples: number[] = [];
        const localPrimary = await measureQuery("local_primary_limit_100", async () => await retrievalQuery.query({
            text: input.config.primaryText,
            pools: { anyOf: [{ kind: "local_catalog" }] },
            limit: 100,
        }));
        measurements.push(localPrimary.measurement);
        const primaryMaterialRefs = materialRefKeys(localPrimary.value);
        measurements.push((await measureQuery("local_secondary_limit_50", async () => await retrievalQuery.query({
            text: input.config.secondaryText,
            pools: { anyOf: [{ kind: "local_catalog" }] },
            limit: 50,
        }))).measurement);
        if (input.config.exactText !== undefined) {
            const exactText = input.config.exactText;
            measurements.push((await measureQuery("local_exact_limit_20", async () => await retrievalQuery.query({
                text: exactText,
                pools: { anyOf: [{ kind: "local_catalog" }] },
                limit: 20,
            }))).measurement);
        }
        const localCursorPageOne = await measureQuery("local_cursor_page_1", async () => await retrievalQuery.query({
            text: input.config.primaryText,
            pools: { anyOf: [{ kind: "local_catalog" }] },
            limit: 5,
        }));
        measurements.push(localCursorPageOne.measurement);
        if (localCursorPageOne.value.page.nextCursor !== undefined) {
            const cursor = localCursorPageOne.value.page.nextCursor;
            measurements.push((await measureQuery("local_cursor_page_2", async () => await retrievalQuery.query({
                text: input.config.primaryText,
                pools: { anyOf: [{ kind: "local_catalog" }] },
                limit: 5,
                cursor,
            }))).measurement);
        }
        const mixedInput: RetrievalQueryInput = {
            text: input.config.primaryText,
            pools: {
                anyOf: [
                    { kind: "local_catalog" },
                    {
                        kind: "provider_search",
                        providerId: input.config.providerId,
                        limit: input.config.providerLimit,
                    },
                ],
            },
            limit: 50,
            sessionId: "ncm-performance-mixed-primary",
        };
        const mixedPrimary = await measureQuery("mixed_primary_limit_50", async () => await retrievalQuery.query(mixedInput));
        measurements.push(mixedPrimary.measurement);
        const mixedCursorPageOne = await measureQuery("mixed_cursor_page_1", async () => await retrievalQuery.query({
            ...mixedInput,
            limit: 5,
            sessionId: "ncm-performance-mixed-cursor",
        }));
        measurements.push(mixedCursorPageOne.measurement);
        if (mixedCursorPageOne.value.page.nextCursor !== undefined) {
            const cursor = mixedCursorPageOne.value.page.nextCursor;
            measurements.push((await measureQuery("mixed_cursor_page_2", async () => await retrievalQuery.query({
                ...mixedInput,
                limit: 5,
                cursor,
                sessionId: "ncm-performance-mixed-cursor",
            }))).measurement);
        }
        for (let index = 0; index < input.config.localIterations; index += 1) {
            const sample = await measureQuery(`local_primary_sample_${index + 1}`, async () => await retrievalQuery.query({
                text: input.config.primaryText,
                pools: { anyOf: [{ kind: "local_catalog" }] },
                limit: 20,
            }));
            localPrimarySamples.push(sample.measurement.ms);
        }
        for (let index = 0; index < input.config.mixedIterations; index += 1) {
            const sample = await measureQuery(`mixed_primary_warm_sample_${index + 1}`, async () => await retrievalQuery.query({
                ...mixedInput,
                limit: 20,
                sessionId: `ncm-performance-mixed-sample-${index + 1}`,
            }));
            mixedPrimaryWarmSamples.push(sample.measurement.ms);
        }
        return {
            measurements,
            primaryMaterialRefs,
            summary: {
                localPrimaryLimit100: summarizeResult(localPrimary.value),
                mixedPrimaryLimit50: summarizeResult(mixedPrimary.value),
                localPrimarySamples: summarizeDurations(localPrimarySamples),
                mixedPrimaryWarmSamples: summarizeDurations(mixedPrimaryWarmSamples),
            },
        };
    });
}
async function measureRelationQueries(input: {
    database: PostgresDatabaseTarget;
    config: PerfConfig;
    favoritePoolRef: Ref;
    savedPoolRef: Ref;
    savedSourceLibraryRef: Ref;
}) {
    return withStartedHost(input.database, input.config, async (host) => {
        const retrievalQuery = host.retrievalQuery();
        if (retrievalQuery === undefined) {
            throw new Error("Retrieval query service was not wired.");
        }
        const queries: readonly [
            string,
            RetrievalPoolFilter
        ][] = [
            [
                "relation_favorite_primary",
                { anyOf: [{ kind: "owner_relation", ref: input.favoritePoolRef }] },
            ],
            [
                "relation_saved_primary",
                { anyOf: [{ kind: "owner_relation", ref: input.savedPoolRef }] },
            ],
            [
                "relation_favorite_and_saved",
                {
                    allOf: [
                        { kind: "owner_relation", ref: input.favoritePoolRef },
                        { kind: "owner_relation", ref: input.savedPoolRef },
                    ],
                },
            ],
            [
                "source_library_none_of_saved",
                {
                    anyOf: [{ kind: "source_library", ref: input.savedSourceLibraryRef }],
                    noneOf: [{ kind: "owner_relation", ref: input.savedPoolRef }],
                },
            ],
        ];
        const measurements: QueryMeasurement[] = [];
        for (const [name, pools] of queries) {
            measurements.push((await measureQuery(name, async () => await retrievalQuery.query({
                pools,
                limit: 50,
                ...(name === "relation_favorite_and_saved"
                    ? {}
                    : { text: input.config.primaryText }),
            }))).measurement);
        }
        return measurements;
    });
}
async function runImport(input: {
    database: PostgresDatabaseTarget;
    config: PerfConfig;
    maxNewItems?: number;
    continueUntilComplete: boolean;
}) {
    return withStartedHost(input.database, input.config, async (host) => {
        const sourceLibraryImport = host.sourceLibraryImport();
        if (sourceLibraryImport === undefined) {
            throw new Error("Source library import service was not wired.");
        }
        let calls = 1;
        let result = await sourceLibraryImport.startImport({
            providerId: input.config.providerId,
            libraryKind: input.config.libraryKind,
            limit: input.config.importPageLimit,
            ...(input.maxNewItems === undefined ? {} : { maxNewItems: input.maxNewItems }),
        });
        if (!result.ok) {
            throw new Error(`${result.error.code}: ${result.error.message}`);
        }
        let value = result.value;
        while (input.continueUntilComplete &&
            value.batch.status === "running" &&
            calls < input.config.updateMaxCalls) {
            calls += 1;
            result = await sourceLibraryImport.advanceOnePage({
                batchId: value.batch.batchId,
            });
            if (!result.ok) {
                throw new Error(`${result.error.code}: ${result.error.message}`);
            }
            value = result.value;
        }
        if (input.continueUntilComplete && value.batch.status === "running") {
            throw new Error(`Import batch '${value.batch.batchId}' was still running after ${calls} calls.`);
        }
        return compactImportResult(value, calls);
    });
}
async function withStartedHost<Result>(database: PostgresDatabaseTarget, config: PerfConfig, operation: (host: ReturnType<typeof createServerHost>) => Promise<Result>): Promise<Result> {
    const host = createServerHost({
        config: {
            database: {
                url: database.url,
                schema: database.schema,
            },
            projectionMaintenance: { enabled: false },
            plugins: {
                "minemusic.ncm": {
                    ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
                },
            },
        },
    });
    const started = await host.start();
    if (!started.ok) {
        throw new Error(`${started.error.code}: ${started.error.message}`);
    }
    try {
        return await operation(host);
    }
    finally {
        const stopped = await host.stop();
        if (!stopped.ok) {
            throw new Error(`${stopped.error.code}: ${stopped.error.message}`);
        }
    }
}
function compactImportResult(value: { batch: SourceLibraryImportBatchRecord }, calls: number) {
    return {
        calls,
        batch: {
            batchId: value.batch.batchId,
            status: value.batch.status,
            processedCount: value.batch.processedCount,
            importedCount: value.batch.importedCount,
            alreadyPresentCount: value.batch.alreadyPresentCount,
            failedCount: value.batch.failedCount,
            ...(value.batch.completionReason === undefined
                ? {}
                : { completionReason: value.batch.completionReason }),
        },
    };
}
async function recordRelationScenario(databaseTarget: PostgresDatabaseTarget, materialRefKeys: readonly string[]) {
    const [first, second, third, fourth] = materialRefKeys;
    if (first === undefined ||
        second === undefined ||
        third === undefined ||
        fourth === undefined) {
        throw new Error("Expected four material refs for relation scenario.");
    }
    const plan: readonly {
        materialRefKey: string;
        relationKind: OwnerMaterialRelationKind;
    }[] = [
        { materialRefKey: first, relationKind: "favorite" },
        { materialRefKey: second, relationKind: "favorite" },
        { materialRefKey: second, relationKind: "saved" },
        { materialRefKey: third, relationKind: "saved" },
        { materialRefKey: fourth, relationKind: "blocked" },
    ];
    const database = await openDatabase(databaseTarget);
    try {
        return await database.transaction(async (db) => {
            const commands = createMusicDataPlatformSourceOfTruthWriteCommands({
                db,
                now: new Date().toISOString(),
            }).ownerRelations;
            for (const item of plan) {
                await commands.recordOwnerMaterialRelation({
                    ownerScope: DEFAULT_OWNER_SCOPE,
                    materialRef: parseRefKey(item.materialRefKey),
                    relationKind: item.relationKind,
                    origin: "user_explicit",
                    note: "ncm performance smoke",
                });
            }
            return {
                relationCount: plan.length,
            };
        });
    }
    finally {
        await database.close();
    }
}
async function createStaleSourceLibraryFixture(input: {
    database: PostgresDatabaseTarget;
    config: PerfConfig;
    sourceLibrary: SourceLibraryRow;
}) {
    const database = await openDatabase(input.database);
    const safeSuffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const sourceRef: Ref = {
        namespace: `source_${input.config.providerId}`,
        kind: "track",
        id: `perf_stale_${safeSuffix}`,
    };
    const materialRef: Ref = {
        namespace: "material",
        kind: "recording",
        id: `m_perf_stale_${safeSuffix}`,
    };
    const entity: SourceEntity = {
        kind: "track",
        sourceRef,
        origin: "provider",
        providerId: input.config.providerId,
        providerEntityId: `perf_stale_${safeSuffix}`,
        label: "MineMusic perf stale probe",
        title: "MineMusic perf stale probe",
        artistLabels: ["MineMusic Perf"],
    };
    try {
        await database.transaction(async (db) => {
            const commands = createMusicDataPlatformSourceOfTruthWriteCommands({
                db,
                now: new Date().toISOString(),
            });
            await commands.identity.upsertSourceRecord({ entity });
            await commands.identity.upsertMaterialRecord({
                materialRef,
                kind: "recording",
            });
            await commands.identity.bindSourceToMaterial({
                sourceRef,
                materialRef,
            });
            const batch = await commands.sourceLibrary.createImportBatch({
                batchId: `perf_stale_seed_${safeSuffix}`,
                ownerScope: DEFAULT_OWNER_SCOPE,
                providerId: input.config.providerId,
                providerAccountId: input.sourceLibrary.provider_account_id,
                libraryKind: input.config.libraryKind,
            });
            const scopedBatch = await commands.sourceLibrary.resolveImportBatchLibraryScope({
                batch,
                providerAccountId: input.sourceLibrary.provider_account_id,
            });
            await commands.sourceLibrary.recordImportItem({
                batch: scopedBatch,
                sourceRef,
                providerId: input.config.providerId,
                providerEntityId: entity.providerEntityId!,
                materialRef,
            });
        });
    }
    finally {
        await database.close();
    }
    return {
        sourceRefKey: refKey(sourceRef),
        materialRefKey: refKey(materialRef),
    };
}
async function runProjectionMaintenance(databaseTarget: PostgresDatabaseTarget) {
    const database = await openDatabase(databaseTarget);
    const summaries = [];
    try {
        for (let round = 0; round < 80; round += 1) {
            const summary = await createProjectionMaintenanceRunner({
                database,
                now: new Date().toISOString(),
            }).runProjectionMaintenance({ limit: 500 });
            summaries.push(summary);
            if (summary.selectedCount === 0) {
                break;
            }
        }
        return {
            rounds: summaries.length,
            rebuiltCount: summaries.reduce((sum, summary) => sum + summary.rebuiltCount, 0),
            failedCount: summaries.reduce((sum, summary) => sum + summary.failedCount, 0),
            pending: await scalar(database, "select count(*) as value from projection_maintenance_targets where status = 'dirty'"),
            failed: await scalar(database, "select count(*) as value from projection_maintenance_targets where status = 'failed'"),
        };
    }
    finally {
        await database.close();
    }
}
async function readCounts(databaseTarget: PostgresDatabaseTarget) {
    const database = await openDatabase(databaseTarget);
    try {
        return {
            sourceLibraryItems: await scalar(database, "select count(*) as value from source_library_items"),
            sourceLibraryBatches: await scalar(database, "select count(*) as value from source_library_import_batches"),
            sourceLibraryOutcomes: await scalar(database, "select count(*) as value from source_library_import_item_outcomes"),
            sourceRecords: await scalar(database, "select count(*) as value from source_records"),
            materialRecords: await scalar(database, "select count(*) as value from material_records"),
            sourceMaterialBindings: await scalar(database, "select count(*) as value from source_material_bindings"),
            ownerCatalogRows: await scalar(database, "select count(*) as value from owner_material_catalog_view"),
            ownerEntries: await scalar(database, "select count(*) as value from owner_material_entries"),
            materialTextDocuments: await scalar(database, "select count(*) as value from material_text_documents"),
            materialTextFtsRows: await scalar(database, "select count(*) as value from material_text_fts"),
            ownerRelations: await scalar(database, "select count(*) as value from owner_material_relations"),
            pendingProjectionTargets: await scalar(database, "select count(*) as value from projection_maintenance_targets where status = 'dirty'"),
            failedProjectionTargets: await scalar(database, "select count(*) as value from projection_maintenance_targets where status = 'failed'"),
        };
    }
    finally {
        await database.close();
    }
}
async function requireSourceLibrary(databaseTarget: PostgresDatabaseTarget, config: PerfConfig): Promise<SourceLibraryRow> {
    const database = await openDatabase(databaseTarget);
    try {
        const row = await database.context().get<SourceLibraryRow>(`
        SELECT
          library_ref_key,
          owner_scope,
          provider_id,
          provider_account_id,
          library_kind
        FROM source_libraries
        WHERE provider_id = ?
          AND library_kind = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `, [config.providerId, config.libraryKind]);
        if (row === undefined) {
            throw new Error(`No source library found for ${config.providerId}/${config.libraryKind}.`);
        }
        return row;
    }
    finally {
        await database.close();
    }
}
async function hasSourceLibraryItem(databaseTarget: PostgresDatabaseTarget, input: {
    libraryRefKey: string;
    sourceRefKey: string;
}): Promise<boolean> {
    const database = await openDatabase(databaseTarget);
    try {
        return (await scalar(database, "select count(*) as value from source_library_items where library_ref_key = ? and source_ref_key = ?", [input.libraryRefKey, input.sourceRefKey])) > 0;
    }
    finally {
        await database.close();
    }
}
async function openDatabase(databaseTarget: PostgresDatabaseTarget): Promise<MusicDatabase> {
    const database = await openUninitializedPostgresTestMusicDatabase({
        connectionString: databaseTarget.url,
        schema: databaseTarget.schema,
        reset: false,
    });
    await database.initialize({
        schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformSourceLibrarySchema,
            musicDataPlatformOwnerCatalogEntriesSchema,
            musicDataPlatformOwnerRelationSchema,
            musicDataPlatformOwnerCatalogViewSchema,
            musicDataPlatformMaterialTextProjectionSchema,
            musicDataPlatformProjectionMaintenanceSchema,
            musicDataPlatformRetrievalResultSetSchema,
        ],
    });
    return database;
}
function parseRefKey(value: string): Ref {
    const [namespace, kind, id] = value.split(":");
    if (namespace === undefined || kind === undefined || id === undefined) {
        throw new Error(`Invalid ref key: ${value}`);
    }
    return { namespace, kind, id };
}
async function scalar(database: MusicDatabase, sql: string, params: readonly (string | number | null)[] = []): Promise<number> {
    return Number((await database.context().get<{
        value: number;
    }>(sql, params))?.value ?? 0);
}
async function measureAsync<Result>(name: string, operation: () => Promise<Result>): Promise<{
    measurement: Measurement;
    value: Result;
}> {
    const start = performance.now();
    const value = await operation();
    const ms = roundMs(performance.now() - start);
    return {
        measurement: {
            name,
            ms,
            ...(isRecord(value) ? { details: value } : {}),
        },
        value,
    };
}
async function measureQuery(name: string, operation: () => Promise<RetrievalQueryResult>): Promise<{
    measurement: QueryMeasurement;
    value: RetrievalQueryResult;
}> {
    const start = performance.now();
    const value = await operation();
    const summary = summarizeResult(value);
    return {
        measurement: {
            name,
            ms: roundMs(performance.now() - start),
            hitCount: summary.hitCount,
            hitKinds: summary.hitKinds,
            nextCursorPresent: value.page.nextCursor !== undefined,
        },
        value,
    };
}
function summarizeResult(result: RetrievalQueryResult) {
    const hitKinds: Record<string, number> = {};
    for (const hit of result.hits) {
        hitKinds[hit.kind] = (hitKinds[hit.kind] ?? 0) + 1;
    }
    return {
        hitCount: result.hits.length,
        hitKinds,
    };
}
function materialRefKeys(result: RetrievalQueryResult): readonly string[] {
    return result.hits
        .filter((hit) => hit.kind === "material")
        .map((hit) => hit.kind === "material" ? refKey(hit.materialRef) : "");
}
function summarizeDurations(samples: readonly number[]) {
    const sorted = [...samples].sort((left, right) => left - right);
    const sum = sorted.reduce((total, value) => total + value, 0);
    return {
        count: sorted.length,
        minMs: sorted.length === 0 ? undefined : roundMs(sorted[0] ?? 0),
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        maxMs: sorted.length === 0 ? undefined : roundMs(sorted[sorted.length - 1] ?? 0),
        avgMs: sorted.length === 0 ? undefined : roundMs(sum / sorted.length),
        samplesMs: sorted.map(roundMs),
    };
}
function percentile(sorted: readonly number[], p: number): number | undefined {
    if (sorted.length === 0) {
        return undefined;
    }
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return roundMs(sorted[index] ?? 0);
}
function roundMs(value: number): number {
    return Math.round(value * 1000) / 1000;
}
function assertCondition(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(`Performance smoke assertion failed: ${message}`);
    }
}
function readConfig(): PerfConfig {
    const baseUrl = optionalEnv("MINEMUSIC_NCM_BASE_URL");
    const exactText = optionalEnv("MINEMUSIC_NCM_PERF_EXACT_TEXT");
    return {
        providerId: process.env.MINEMUSIC_NCM_PROVIDER_ID ?? "netease",
        libraryKind: platformLibraryKindFromEnv(process.env.MINEMUSIC_NCM_LIBRARY_KIND),
        primaryText: process.env.MINEMUSIC_NCM_PERF_PRIMARY_TEXT ?? "mili",
        secondaryText: process.env.MINEMUSIC_NCM_PERF_SECONDARY_TEXT ?? "whoo",
        importMaxNewItems: positiveIntegerFromEnv(process.env.MINEMUSIC_NCM_PERF_IMPORT_MAX_NEW) ?? 500,
        importPageLimit: positiveIntegerFromEnv(process.env.MINEMUSIC_NCM_PERF_IMPORT_PAGE_LIMIT) ?? 100,
        updateMaxCalls: positiveIntegerFromEnv(process.env.MINEMUSIC_NCM_PERF_UPDATE_MAX_CALLS) ?? 40,
        providerLimit: positiveIntegerFromEnv(process.env.MINEMUSIC_NCM_PERF_PROVIDER_LIMIT) ?? 20,
        localIterations: positiveIntegerFromEnv(process.env.MINEMUSIC_NCM_PERF_LOCAL_ITERATIONS) ?? 8,
        mixedIterations: positiveIntegerFromEnv(process.env.MINEMUSIC_NCM_PERF_MIXED_ITERATIONS) ?? 3,
        ...(baseUrl === undefined ? {} : { baseUrl }),
        ...(exactText === undefined ? {} : { exactText }),
    };
}
async function createDatabaseTarget(prefix: string): Promise<PostgresDatabaseTarget> {
    const url = postgresTestDatabaseUrl();
    const schema = `${prefix}_${process.pid}_${Date.now()}`;
    await createPostgresTestSchema({ connectionString: url, schema });
    return { url, schema };
}
function optionalEnv(name: string): string | undefined {
    const value = process.env[name];
    return value === undefined || value.length === 0 ? undefined : value;
}
function positiveIntegerFromEnv(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
function platformLibraryKindFromEnv(value: string | undefined): PlatformLibraryKind {
    if (value === "saved_source_track" ||
        value === "saved_source_album" ||
        value === "followed_source_artist") {
        return value;
    }
    return "saved_source_track";
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function formatError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}
