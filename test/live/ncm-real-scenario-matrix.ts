import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { PlatformLibraryKind, SourceEntity, } from "../../src/contracts/music_data_platform.js";
import { createServerHost, } from "../../src/server/index.js";
import { DEFAULT_OWNER_SCOPE, createMusicDataPlatformSourceOfTruthWriteCommands, createOwnerRelationPoolRef, createProjectionMaintenanceRunner, createSourceLibraryRef, musicDataPlatformIdentitySchema, musicDataPlatformMaterialTextProjectionSchema, musicDataPlatformOwnerCatalogEntriesSchema, musicDataPlatformOwnerCatalogViewSchema, musicDataPlatformOwnerRelationSchema, musicDataPlatformProjectionMaintenanceSchema, musicDataPlatformRetrievalResultSetSchema, musicDataPlatformSourceLibrarySchema, } from "../../src/music_data_platform/index.js";
import type { OwnerMaterialRelationKind, SourceLibraryImportBatchRecord, } from "../../src/music_data_platform/index.js";
import type { RetrievalQueryHit, RetrievalQueryInput, RetrievalQueryResult, } from "../../src/music_intelligence/index.js";
import { type MusicDatabase } from "../../src/storage/index.js";
import { createPostgresTestSchema, openUninitializedPostgresTestMusicDatabase, postgresTestDatabaseUrl } from "../support/postgres.js";
declare const process: {
    env: Record<string, string | undefined>;
    pid: number;
    exitCode?: number;
};
type ScenarioConfig = {
    baseUrl?: string;
    providerId: string;
    libraryKind: PlatformLibraryKind;
    primaryText: string;
    secondaryText: string;
    exactText?: string;
    importMaxNewItems?: number;
    importPageLimit: number;
    updateMode: "skip" | "page" | "full";
    updateMaxCalls: number;
    providerLimit: number;
};
type PostgresDatabaseTarget = {
    url: string;
    schema: string;
};
type SourceLibraryRow = {
    library_ref_key: string;
    owner_scope: string;
    provider_id: string;
    provider_account_id: string;
    library_kind: PlatformLibraryKind;
};
type CountSnapshot = {
    sourceLibraryItems: number;
    sourceLibraryBatches: number;
    sourceLibraryOutcomes: number;
    sourceRecords: number;
    materialRecords: number;
    sourceMaterialBindings: number;
    ownerCatalogRows: number;
    ownerEntries: number;
    materialTextDocuments: number;
    materialTextFtsRows: number;
    ownerRelations: number;
    pendingProjectionTargets: number;
    failedProjectionTargets: number;
};
type QuerySummary = {
    hitCount: number;
    hitKinds: Record<string, number>;
    nextCursor?: string;
    hits: readonly {
        kind: RetrievalQueryHit["kind"];
        ref: string;
        title?: string;
        artists?: string;
        pools: readonly string[];
    }[];
};
const liveEnabled = process.env.MINEMUSIC_LIVE_NCM_SCENARIO_MATRIX === "1";
const maxReportedHits = 12;
if (!liveEnabled) {
    console.log("Skipping NCM real scenario matrix. Set MINEMUSIC_LIVE_NCM_SCENARIO_MATRIX=1 to enable.");
}
else {
    try {
        const report = await runScenarioMatrix(readConfig());
        console.log(JSON.stringify(report, null, 2));
    }
    catch (error) {
        console.error(`NCM real scenario matrix failed: ${formatError(error)}`);
        process.exitCode = 1;
    }
}
async function runScenarioMatrix(config: ScenarioConfig) {
    const database = await createDatabaseTarget("minemusic_live_ncm_scenario");
    const checks: string[] = [];
    const report: Record<string, unknown> = {
        database,
        config: {
            providerId: config.providerId,
            libraryKind: config.libraryKind,
            primaryText: config.primaryText,
            secondaryText: config.secondaryText,
            exactText: config.exactText,
            importMaxNewItems: config.importMaxNewItems,
            updateMode: config.updateMode,
        },
    };
    report.initialCounts = await readCounts(database);
    report.initialImport = await runImport({
        database,
        config,
        maxNewItems: config.importMaxNewItems ?? 500,
        continueUntilComplete: true,
    });
    report.projectionAfterInitialImport = await runProjectionMaintenance(database);
    const sourceLibrary = await requireSourceLibrary(database, config);
    report.sourceLibrary = sourceLibrary;
    const staleFixture = await createStaleSourceLibraryFixture({
        database,
        config,
        sourceLibrary,
    });
    report.staleFixtureBeforeUpdate = staleFixture;
    assertScenario(checks, staleFixture.presentBeforeUpdate, "stale fixture is present before provider update");
    let providerUpdate: Awaited<ReturnType<typeof runImport>> | undefined;
    if (config.updateMode === "page") {
        providerUpdate = await runImport({
            database,
            config,
            continueUntilComplete: false,
        });
    }
    else if (config.updateMode === "full") {
        providerUpdate = await runImport({
            database,
            config,
            continueUntilComplete: true,
        });
    }
    if (providerUpdate !== undefined) {
        report.providerUpdate = providerUpdate;
    }
    if (config.updateMode === "full") {
        assertScenario(checks, providerUpdate?.batch.status === "completed" &&
            providerUpdate.batch.completionReason === "provider_exhausted" &&
            providerUpdate.batch.failedCount === 0, "full provider update completes by provider exhaustion without item failures");
    }
    report.countsAfterProviderUpdate = await readCounts(database);
    const providerProjection = await runProjectionMaintenance(database);
    report.projectionAfterProviderUpdate = providerProjection;
    assertScenario(checks, providerProjection.pending === 0 && providerProjection.failed === 0, "projection maintenance is clean after provider update");
    report.countsAfterProviderProjection = await readCounts(database);
    const stalePresentAfterUpdate = await hasSourceLibraryItem(database, {
        libraryRefKey: sourceLibrary.library_ref_key,
        sourceRefKey: staleFixture.sourceRefKey,
    });
    report.staleFixtureAfterUpdate = {
        sourceRefKey: staleFixture.sourceRefKey,
        materialRefKey: staleFixture.materialRefKey,
        presentAfterUpdate: stalePresentAfterUpdate,
    };
    if (config.updateMode === "full") {
        assertScenario(checks, !stalePresentAfterUpdate, "full provider update removes stale source-library membership");
    }
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
    const savedRelationPoolRef = createOwnerRelationPoolRef({
        ownerScope: DEFAULT_OWNER_SCOPE,
        relationKind: "saved",
    });
    const localPrimaryBefore = await querySummary(database, config, {
        text: config.primaryText,
        pools: { anyOf: [{ kind: "local_catalog" }] },
        limit: 100,
    });
    report.localPrimaryBeforeRelations = localPrimaryBefore;
    assertScenario(checks, localPrimaryBefore.hitCount >= 4, `${config.primaryText} local_catalog has enough materials for relation scenarios`);
    const secondaryLocal = await querySummary(database, config, {
        text: config.secondaryText,
        pools: { anyOf: [{ kind: "local_catalog" }] },
        limit: 50,
    });
    report.secondaryLocal = secondaryLocal;
    if (config.exactText !== undefined) {
        const exactLocal = await querySummary(database, config, {
            text: config.exactText,
            pools: { anyOf: [{ kind: "local_catalog" }] },
            limit: 20,
        });
        report.exactLocal = exactLocal;
        assertScenario(checks, exactLocal.hitCount > 0, `${config.exactText} exact local search returns at least one hit`);
    }
    const localCursor = await runCursorScenario(database, config, {
        text: config.primaryText,
        pools: { anyOf: [{ kind: "local_catalog" }] },
        limit: 5,
    });
    report.localCursor = localCursor;
    assertScenario(checks, localCursor.second !== undefined && localCursor.overlapCount === 0, "local cursor second page has no overlap with the first page");
    const mixedPrimaryBefore = await querySummary(database, config, {
        text: config.primaryText,
        pools: {
            anyOf: [
                { kind: "local_catalog" },
                {
                    kind: "provider_search",
                    providerId: config.providerId,
                    limit: config.providerLimit,
                },
            ],
        },
        limit: 50,
        sessionId: "ncm-scenario-matrix-mixed-before",
    });
    report.mixedPrimaryBeforeRelations = mixedPrimaryBefore;
    assertScenario(checks, (mixedPrimaryBefore.hitKinds.material_candidate ?? 0) > 0, "mixed local/provider search returns provider candidates");
    assertScenario(checks, providerTitleNewlineCount(mixedPrimaryBefore) === 0, "mixed provider candidates do not put compound labels into title text");
    const mixedCursor = await runCursorScenario(database, config, {
        text: config.primaryText,
        pools: {
            anyOf: [
                { kind: "local_catalog" },
                {
                    kind: "provider_search",
                    providerId: config.providerId,
                    limit: config.providerLimit,
                },
            ],
        },
        limit: 5,
        sessionId: "ncm-scenario-matrix-mixed-cursor",
    });
    report.mixedCursor = mixedCursor;
    assertScenario(checks, mixedCursor.second !== undefined && mixedCursor.overlapCount === 0, "mixed cursor second page has no overlap with the first page");
    const relationPlan = relationScenarioPlan(localPrimaryBefore.hits);
    report.relationPlan = relationPlan.map((item) => ({
        relationKind: item.relationKind,
        materialRefKey: item.materialRefKey,
        title: item.title,
    }));
    report.relationWrites = await recordRelationScenario(database, relationPlan);
    const relationProjection = await runProjectionMaintenance(database);
    report.projectionAfterRelationWrites = relationProjection;
    assertScenario(checks, relationProjection.pending === 0 && relationProjection.failed === 0, "projection maintenance is clean after relation writes");
    report.countsAfterRelationProjection = await readCounts(database);
    const localPrimaryAfterBlock = await querySummary(database, config, {
        text: config.primaryText,
        pools: { anyOf: [{ kind: "local_catalog" }] },
        limit: 100,
    });
    report.localPrimaryAfterBlock = localPrimaryAfterBlock;
    assertScenario(checks, localPrimaryAfterBlock.hitCount === localPrimaryBefore.hitCount - 1, "blocked relation removes one matching local material from visible catalog");
    const favoritePrimary = await querySummary(database, config, {
        text: config.primaryText,
        pools: { anyOf: [{ kind: "owner_relation", ref: favoritePoolRef }] },
        limit: 20,
    });
    const savedPrimary = await querySummary(database, config, {
        text: config.primaryText,
        pools: { anyOf: [{ kind: "owner_relation", ref: savedRelationPoolRef }] },
        limit: 20,
    });
    const favoriteAndSaved = await querySummary(database, config, {
        pools: {
            allOf: [
                { kind: "owner_relation", ref: favoritePoolRef },
                { kind: "owner_relation", ref: savedRelationPoolRef },
            ],
        },
        limit: 20,
    });
    const localNoneOfFavorite = await querySummary(database, config, {
        text: config.primaryText,
        pools: {
            anyOf: [{ kind: "local_catalog" }],
            noneOf: [{ kind: "owner_relation", ref: favoritePoolRef }],
        },
        limit: 100,
    });
    const sourceLibraryAndFavorite = await querySummary(database, config, {
        text: config.primaryText,
        pools: {
            allOf: [
                { kind: "source_library", ref: savedSourceLibraryRef },
                { kind: "owner_relation", ref: favoritePoolRef },
            ],
        },
        limit: 20,
    });
    const sourceLibraryNoneOfSaved = await querySummary(database, config, {
        text: config.primaryText,
        pools: {
            anyOf: [{ kind: "source_library", ref: savedSourceLibraryRef }],
            noneOf: [{ kind: "owner_relation", ref: savedRelationPoolRef }],
        },
        limit: 100,
    });
    report.relationQueries = {
        favoritePrimary,
        savedPrimary,
        favoriteAndSaved,
        localNoneOfFavorite,
        sourceLibraryAndFavorite,
        sourceLibraryNoneOfSaved,
    };
    assertScenario(checks, favoritePrimary.hitCount === 2, "favorite pool returns two primary hits");
    assertScenario(checks, savedPrimary.hitCount === 2, "saved relation pool returns two primary hits");
    assertScenario(checks, favoriteAndSaved.hitCount === 1, "favorite and saved intersection returns one hit");
    assertScenario(checks, localNoneOfFavorite.hitCount === localPrimaryAfterBlock.hitCount - 2, "noneOf favorite excludes the two favorite primary hits");
    assertScenario(checks, sourceLibraryAndFavorite.hitCount === 2, "source-library and favorite pool intersection returns two hits");
    assertScenario(checks, sourceLibraryNoneOfSaved.hitCount === localPrimaryAfterBlock.hitCount - 2, "source-library noneOf saved excludes the two saved primary hits");
    report.providerRelationLimitAttempt = await captureQueryError(database, config, {
        text: config.primaryText,
        pools: {
            allOf: [{ kind: "owner_relation", ref: favoritePoolRef }],
            anyOf: [{
                    kind: "provider_search",
                    providerId: config.providerId,
                    limit: 5,
                }],
        },
        limit: 20,
        sessionId: "ncm-scenario-provider-relation-limit",
    });
    assertScenario(checks, (report.providerRelationLimitAttempt as {
        code?: string;
    }).code ===
        "music_intelligence.provider_search_pool_invalid", "provider_search with allOf/noneOf remains an explicit unsupported boundary");
    report.blockedPoolAttempt = await captureQueryError(database, config, {
        text: config.primaryText,
        pools: {
            anyOf: [{
                    kind: "owner_relation",
                    ref: {
                        namespace: "owner_material_relation_pool",
                        kind: "blocked",
                        id: "rp_blocked",
                    },
                }],
        },
        limit: 20,
    });
    assertScenario(checks, (report.blockedPoolAttempt as {
        code?: string;
    }).code ===
        "music_intelligence.retrieval_query_invalid", "blocked is not accepted as an owner relation pool");
    const unblocked = await removeRelationScenario(database, {
        materialRefKey: relationPlan.find((item) => item.relationKind === "blocked")?.materialRefKey,
        relationKind: "blocked",
    });
    report.blockedRelationRemoval = unblocked;
    report.projectionAfterBlockedRemoval = await runProjectionMaintenance(database);
    const localPrimaryAfterUnblock = await querySummary(database, config, {
        text: config.primaryText,
        pools: { anyOf: [{ kind: "local_catalog" }] },
        limit: 100,
    });
    report.localPrimaryAfterUnblock = localPrimaryAfterUnblock;
    assertScenario(checks, localPrimaryAfterUnblock.hitCount === localPrimaryBefore.hitCount, "removing blocked relation restores the local primary hit count");
    report.finalCounts = await readCounts(database);
    report.checks = checks;
    return report;
}
async function runImport(input: {
    database: PostgresDatabaseTarget;
    config: ScenarioConfig;
    maxNewItems?: number;
    continueUntilComplete: boolean;
}): Promise<{
    ok: true;
    calls: number;
    batch: Pick<SourceLibraryImportBatchRecord, "batchId" | "status" | "processedCount" | "importedCount" | "alreadyPresentCount" | "failedCount"> & {
        completionReason?: NonNullable<SourceLibraryImportBatchRecord["completionReason"]>;
    };
}> {
    return withHost(input.database, input.config, async (host) => {
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
        return {
            ok: true,
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
    });
}
async function withHost<Result>(database: PostgresDatabaseTarget, config: ScenarioConfig, operation: (host: ReturnType<typeof createServerHost>) => Promise<Result>): Promise<Result> {
    const host = createServerHost({
        config: {
            database: {
                url: database.url,
                schema: database.schema,
            },
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
async function queryResult(database: PostgresDatabaseTarget, config: ScenarioConfig, input: RetrievalQueryInput): Promise<RetrievalQueryResult> {
    return withHost(database, config, async (host) => {
        const retrievalQuery = host.retrievalQuery();
        if (retrievalQuery === undefined) {
            throw new Error("Retrieval query service was not wired.");
        }
        return await retrievalQuery.query(input);
    });
}
async function querySummary(database: PostgresDatabaseTarget, config: ScenarioConfig, input: RetrievalQueryInput): Promise<QuerySummary> {
    const result = await queryResult(database, config, input);
    return summarizeQuery(result);
}
function summarizeQuery(result: RetrievalQueryResult): QuerySummary {
    const hitKinds: Record<string, number> = {};
    for (const hit of result.hits) {
        hitKinds[hit.kind] = (hitKinds[hit.kind] ?? 0) + 1;
    }
    return {
        hitCount: result.hits.length,
        hitKinds,
        ...(result.page.nextCursor === undefined ? {} : { nextCursor: result.page.nextCursor }),
        hits: result.hits.slice(0, maxReportedHits).map((hit) => ({
            kind: hit.kind,
            ref: hit.kind === "material"
                ? refKey(hit.materialRef)
                : refKey(hit.materialCandidateRef),
            ...(hit.display.title === undefined ? {} : { title: hit.display.title }),
            ...(hit.display.artistsText === undefined ? {} : { artists: hit.display.artistsText }),
            pools: hit.pools.matched.map((ref) => refKey(ref)),
        })),
    };
}
async function runCursorScenario(database: PostgresDatabaseTarget, config: ScenarioConfig, input: RetrievalQueryInput) {
    const first = await querySummary(database, config, input);
    if (first.nextCursor === undefined) {
        return {
            first,
            second: undefined,
            overlapCount: 0,
        };
    }
    const second = await querySummary(database, config, {
        ...input,
        cursor: first.nextCursor,
    });
    const firstRefs = new Set(first.hits.map((hit) => hit.ref));
    const overlapCount = second.hits.filter((hit) => firstRefs.has(hit.ref)).length;
    return {
        first,
        second,
        overlapCount,
    };
}
function providerTitleNewlineCount(summary: QuerySummary): number {
    return summary.hits
        .filter((hit) => hit.kind === "material_candidate")
        .filter((hit) => hit.title?.includes("\n") === true)
        .length;
}
async function captureQueryError(database: PostgresDatabaseTarget, config: ScenarioConfig, input: RetrievalQueryInput) {
    try {
        await queryResult(database, config, input);
        return {
            ok: true,
        };
    }
    catch (error) {
        return {
            ok: false,
            name: error instanceof Error ? error.name : undefined,
            message: error instanceof Error ? error.message : String(error),
            code: errorCode(error),
        };
    }
}
async function recordRelationScenario(databaseTarget: PostgresDatabaseTarget, plan: readonly {
    materialRefKey: string;
    relationKind: OwnerMaterialRelationKind;
    note: string;
}[]) {
    const database = await openDatabase(databaseTarget);
    try {
        return await database.transaction(async (db) => {
            const commands = createMusicDataPlatformSourceOfTruthWriteCommands({
                db,
                now: new Date().toISOString(),
            }).ownerRelations;
            const records = [];
            for (const item of plan) {
                const record = await commands.recordOwnerMaterialRelation({
                    ownerScope: DEFAULT_OWNER_SCOPE,
                    materialRef: parseRefKey(item.materialRefKey),
                    relationKind: item.relationKind,
                    origin: "user_explicit",
                    note: item.note,
                });
                records.push({
                    relationKind: record.relationKind,
                    relationRefKey: record.relationRefKey,
                    materialRefKey: record.materialRefKey,
                    status: record.status,
                });
            }
            return records;
        });
    }
    finally {
        await database.close();
    }
}
async function removeRelationScenario(databaseTarget: PostgresDatabaseTarget, input: {
    materialRefKey: string | undefined;
    relationKind: OwnerMaterialRelationKind;
}) {
    if (input.materialRefKey === undefined) {
        throw new Error(`Cannot remove ${input.relationKind} relation without a material ref.`);
    }
    const materialRefKey = input.materialRefKey;
    const database = await openDatabase(databaseTarget);
    try {
        return await database.transaction(async (db) => {
            const record = await createMusicDataPlatformSourceOfTruthWriteCommands({
                db,
                now: new Date().toISOString(),
            }).ownerRelations.removeOwnerMaterialRelation({
                ownerScope: DEFAULT_OWNER_SCOPE,
                materialRef: parseRefKey(materialRefKey),
                relationKind: input.relationKind,
            });
            return {
                relationKind: record.relationKind,
                relationRefKey: record.relationRefKey,
                materialRefKey: record.materialRefKey,
                status: record.status,
            };
        });
    }
    finally {
        await database.close();
    }
}
function relationScenarioPlan(hits: QuerySummary["hits"]) {
    const materials = hits
        .filter((hit) => hit.kind === "material")
        .slice(0, 4);
    if (materials.length < 4) {
        throw new Error(`Expected at least 4 material hits, got ${materials.length}.`);
    }
    const first = materials[0];
    const second = materials[1];
    const third = materials[2];
    const fourth = materials[3];
    if (first === undefined ||
        second === undefined ||
        third === undefined ||
        fourth === undefined) {
        throw new Error("Expected four material hits after length check.");
    }
    return [
        {
            materialRefKey: first.ref,
            relationKind: "favorite" as const,
            note: "ncm scenario favorite A",
            title: first.title,
        },
        {
            materialRefKey: second.ref,
            relationKind: "favorite" as const,
            note: "ncm scenario favorite and saved intersection",
            title: second.title,
        },
        {
            materialRefKey: second.ref,
            relationKind: "saved" as const,
            note: "ncm scenario favorite and saved intersection",
            title: second.title,
        },
        {
            materialRefKey: third.ref,
            relationKind: "saved" as const,
            note: "ncm scenario saved only",
            title: third.title,
        },
        {
            materialRefKey: fourth.ref,
            relationKind: "blocked" as const,
            note: "ncm scenario blocked exclusion",
            title: fourth.title,
        },
    ];
}
async function createStaleSourceLibraryFixture(input: {
    database: PostgresDatabaseTarget;
    config: ScenarioConfig;
    sourceLibrary: SourceLibraryRow;
}) {
    const database = await openDatabase(input.database);
    const safeSuffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const sourceRef: Ref = {
        namespace: `source_${input.config.providerId}`,
        kind: "track",
        id: `scenario_stale_${safeSuffix}`,
    };
    const materialRef: Ref = {
        namespace: "material",
        kind: "recording",
        id: `m_scenario_stale_${safeSuffix}`,
    };
    const entity: SourceEntity = {
        kind: "track",
        origin: "provider",
        sourceRef,
        providerId: input.config.providerId,
        providerEntityId: `scenario_stale_${safeSuffix}`,
        label: "MineMusic scenario stale probe",
        title: "MineMusic scenario stale probe",
        artistLabels: ["MineMusic Scenario"],
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
                batchId: `scenario_stale_seed_${safeSuffix}`,
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
        presentBeforeUpdate: await hasSourceLibraryItem(input.database, {
            libraryRefKey: input.sourceLibrary.library_ref_key,
            sourceRefKey: refKey(sourceRef),
        }),
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
            }).runProjectionMaintenance({ limit: 250 });
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
            summaries,
        };
    }
    finally {
        await database.close();
    }
}
async function readCounts(databaseTarget: PostgresDatabaseTarget): Promise<CountSnapshot> {
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
async function requireSourceLibrary(databaseTarget: PostgresDatabaseTarget, config: ScenarioConfig): Promise<SourceLibraryRow> {
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
async function scalar(database: MusicDatabase, sql: string, params: readonly (string | number | null)[] = []): Promise<number> {
    return Number((await database.context().get<{
        value: number;
    }>(sql, params))?.value ?? 0);
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
function readConfig(): ScenarioConfig {
    const baseUrl = optionalEnv("MINEMUSIC_NCM_BASE_URL");
    const exactText = optionalEnv("MINEMUSIC_NCM_SCENARIO_EXACT_TEXT");
    const updateMode = updateModeFromEnv(process.env.MINEMUSIC_NCM_SCENARIO_UPDATE_MODE);
    const importMaxNewItems = optionalPositiveInteger(process.env.MINEMUSIC_NCM_SCENARIO_IMPORT_MAX_NEW) ?? 500;
    return {
        providerId: process.env.MINEMUSIC_NCM_PROVIDER_ID ?? "netease",
        libraryKind: platformLibraryKindFromEnv(process.env.MINEMUSIC_NCM_LIBRARY_KIND),
        primaryText: process.env.MINEMUSIC_NCM_SCENARIO_PRIMARY_TEXT ?? "mili",
        secondaryText: process.env.MINEMUSIC_NCM_SCENARIO_SECONDARY_TEXT ?? "whoo",
        importPageLimit: optionalPositiveInteger(process.env.MINEMUSIC_NCM_SCENARIO_IMPORT_PAGE_LIMIT) ?? 100,
        updateMode,
        updateMaxCalls: optionalPositiveInteger(process.env.MINEMUSIC_NCM_SCENARIO_UPDATE_MAX_CALLS) ?? 40,
        providerLimit: optionalPositiveInteger(process.env.MINEMUSIC_NCM_SCENARIO_PROVIDER_LIMIT) ?? 20,
        ...(baseUrl === undefined ? {} : { baseUrl }),
        ...(exactText === undefined ? {} : { exactText }),
        ...(importMaxNewItems === undefined ? {} : { importMaxNewItems }),
    };
}
async function createDatabaseTarget(prefix: string): Promise<PostgresDatabaseTarget> {
    const url = postgresTestDatabaseUrl();
    const schema = `${prefix}_${process.pid}_${Date.now()}`;
    await createPostgresTestSchema({ connectionString: url, schema });
    return { url, schema };
}
function assertScenario(checks: string[], condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(`Scenario assertion failed: ${message}`);
    }
    checks.push(message);
}
function optionalEnv(name: string): string | undefined {
    const value = process.env[name];
    return value === undefined || value.length === 0 ? undefined : value;
}
function optionalPositiveInteger(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
function updateModeFromEnv(value: string | undefined): ScenarioConfig["updateMode"] {
    if (value === "skip" || value === "page" || value === "full") {
        return value;
    }
    return "full";
}
function platformLibraryKindFromEnv(value: string | undefined): PlatformLibraryKind {
    if (value === "saved_source_track" ||
        value === "saved_source_album" ||
        value === "followed_source_artist") {
        return value;
    }
    return "saved_source_track";
}
function errorCode(error: unknown): string | undefined {
    if (typeof error === "object" && error !== null && "code" in error) {
        const code = (error as {
            code?: unknown;
        }).code;
        return typeof code === "string" ? code : undefined;
    }
    return undefined;
}
function formatError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}
