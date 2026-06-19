import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type {
  PlatformLibraryKind,
  SourceEntity,
} from "../../src/contracts/music_data_platform.js";
import {
  createServerHost,
} from "../../src/server/index.js";
import {
  DEFAULT_OWNER_SCOPE,
  createMusicDataPlatformSourceOfTruthWriteCommands,
  createOwnerRelationPoolRef,
  createProjectionMaintenanceRunner,
  createSourceLibraryRef,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformRetrievalResultSetSchema,
  musicDataPlatformSourceLibrarySchema,
} from "../../src/music_data_platform/index.js";
import type {
  OwnerMaterialRelationKind,
  SourceLibraryImportResult,
} from "../../src/music_data_platform/index.js";
import type {
  RetrievalQueryHit,
  RetrievalQueryInput,
  RetrievalQueryResult,
} from "../../src/music_intelligence/index.js";
import {
  SqliteMusicDatabase,
  type MusicDatabase,
} from "../../src/storage/index.js";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

type ScenarioConfig = {
  baseUrl?: string;
  seedDb?: string;
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
  console.log(
    "Skipping NCM real scenario matrix. Set MINEMUSIC_LIVE_NCM_SCENARIO_MATRIX=1 to enable.",
  );
} else {
  try {
    const report = await runScenarioMatrix(readConfig());
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`NCM real scenario matrix failed: ${formatError(error)}`);
    process.exitCode = 1;
  }
}

async function runScenarioMatrix(config: ScenarioConfig) {
  const tempDir = mkdtempSync(join(tmpdir(), "minemusic-ncm-scenario-matrix-"));
  const dbPath = join(tempDir, "music.sqlite");
  const checks: string[] = [];

  if (config.seedDb !== undefined) {
    if (!existsSync(config.seedDb)) {
      throw new Error(`Seed database does not exist: ${config.seedDb}`);
    }
    copyFileSync(config.seedDb, dbPath);
  }

  const report: Record<string, unknown> = {
    tempDir,
    dbPath,
    config: {
      seedDb: config.seedDb,
      providerId: config.providerId,
      libraryKind: config.libraryKind,
      primaryText: config.primaryText,
      secondaryText: config.secondaryText,
      exactText: config.exactText,
      importMaxNewItems: config.importMaxNewItems,
      updateMode: config.updateMode,
    },
  };

  report.initialCounts = readCounts(dbPath);

  if (config.seedDb === undefined || config.importMaxNewItems !== undefined) {
    report.initialImport = await runImport({
      dbPath,
      config,
      maxNewItems: config.importMaxNewItems ?? 500,
      continueUntilComplete: true,
    });
    report.projectionAfterInitialImport = runProjectionMaintenance(dbPath);
  }

  const sourceLibrary = requireSourceLibrary(dbPath, config);
  report.sourceLibrary = sourceLibrary;

  const staleFixture = createStaleSourceLibraryFixture({
    dbPath,
    config,
    sourceLibrary,
  });
  report.staleFixtureBeforeUpdate = staleFixture;
  assertScenario(
    checks,
    staleFixture.presentBeforeUpdate,
    "stale fixture is present before provider update",
  );

  let providerUpdate: Awaited<ReturnType<typeof runImport>> | undefined;

  if (config.updateMode === "page") {
    providerUpdate = await runImport({
      dbPath,
      config,
      continueUntilComplete: false,
    });
  } else if (config.updateMode === "full") {
    providerUpdate = await runImport({
      dbPath,
      config,
      continueUntilComplete: true,
    });
  }

  if (providerUpdate !== undefined) {
    report.providerUpdate = providerUpdate;
  }

  if (config.updateMode === "full") {
    assertScenario(
      checks,
      providerUpdate?.batch.status === "completed" &&
        providerUpdate.batch.completionReason === "provider_exhausted" &&
        providerUpdate.batch.failedCount === 0,
      "full provider update completes by provider exhaustion without item failures",
    );
  }

  report.countsAfterProviderUpdate = readCounts(dbPath);
  const providerProjection = runProjectionMaintenance(dbPath);
  report.projectionAfterProviderUpdate = providerProjection;
  assertScenario(
    checks,
    providerProjection.pending === 0 && providerProjection.failed === 0,
    "projection maintenance is clean after provider update",
  );
  report.countsAfterProviderProjection = readCounts(dbPath);

  const stalePresentAfterUpdate = hasSourceLibraryItem(dbPath, {
    libraryRefKey: sourceLibrary.library_ref_key,
    sourceRefKey: staleFixture.sourceRefKey,
  });
  report.staleFixtureAfterUpdate = {
    sourceRefKey: staleFixture.sourceRefKey,
    materialRefKey: staleFixture.materialRefKey,
    presentAfterUpdate: stalePresentAfterUpdate,
  };
  if (config.updateMode === "full") {
    assertScenario(
      checks,
      !stalePresentAfterUpdate,
      "full provider update removes stale source-library membership",
    );
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

  const localPrimaryBefore = await querySummary(dbPath, config, {
    text: config.primaryText,
    pools: { anyOf: [{ kind: "local_catalog" }] },
    limit: 100,
  });
  report.localPrimaryBeforeRelations = localPrimaryBefore;
  assertScenario(
    checks,
    localPrimaryBefore.hitCount >= 4,
    `${config.primaryText} local_catalog has enough materials for relation scenarios`,
  );

  const secondaryLocal = await querySummary(dbPath, config, {
    text: config.secondaryText,
    pools: { anyOf: [{ kind: "local_catalog" }] },
    limit: 50,
  });
  report.secondaryLocal = secondaryLocal;

  if (config.exactText !== undefined) {
    const exactLocal = await querySummary(dbPath, config, {
      text: config.exactText,
      pools: { anyOf: [{ kind: "local_catalog" }] },
      limit: 20,
    });
    report.exactLocal = exactLocal;
    assertScenario(
      checks,
      exactLocal.hitCount > 0,
      `${config.exactText} exact local search returns at least one hit`,
    );
  }

  const localCursor = await runCursorScenario(dbPath, config, {
    text: config.primaryText,
    pools: { anyOf: [{ kind: "local_catalog" }] },
    limit: 5,
  });
  report.localCursor = localCursor;
  assertScenario(
    checks,
    localCursor.second !== undefined && localCursor.overlapCount === 0,
    "local cursor second page has no overlap with the first page",
  );

  const mixedPrimaryBefore = await querySummary(dbPath, config, {
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
  assertScenario(
    checks,
    (mixedPrimaryBefore.hitKinds.material_candidate ?? 0) > 0,
    "mixed local/provider search returns provider candidates",
  );
  assertScenario(
    checks,
    providerTitleNewlineCount(mixedPrimaryBefore) === 0,
    "mixed provider candidates do not put compound labels into title text",
  );

  const mixedCursor = await runCursorScenario(dbPath, config, {
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
  assertScenario(
    checks,
    mixedCursor.second !== undefined && mixedCursor.overlapCount === 0,
    "mixed cursor second page has no overlap with the first page",
  );

  const relationPlan = relationScenarioPlan(localPrimaryBefore.hits);
  report.relationPlan = relationPlan.map((item) => ({
    relationKind: item.relationKind,
    materialRefKey: item.materialRefKey,
    title: item.title,
  }));
  report.relationWrites = recordRelationScenario(dbPath, relationPlan);
  const relationProjection = runProjectionMaintenance(dbPath);
  report.projectionAfterRelationWrites = relationProjection;
  assertScenario(
    checks,
    relationProjection.pending === 0 && relationProjection.failed === 0,
    "projection maintenance is clean after relation writes",
  );
  report.countsAfterRelationProjection = readCounts(dbPath);

  const localPrimaryAfterBlock = await querySummary(dbPath, config, {
    text: config.primaryText,
    pools: { anyOf: [{ kind: "local_catalog" }] },
    limit: 100,
  });
  report.localPrimaryAfterBlock = localPrimaryAfterBlock;
  assertScenario(
    checks,
    localPrimaryAfterBlock.hitCount === localPrimaryBefore.hitCount - 1,
    "blocked relation removes one matching local material from visible catalog",
  );

  const favoritePrimary = await querySummary(dbPath, config, {
    text: config.primaryText,
    pools: { anyOf: [{ kind: "owner_relation", ref: favoritePoolRef }] },
    limit: 20,
  });
  const savedPrimary = await querySummary(dbPath, config, {
    text: config.primaryText,
    pools: { anyOf: [{ kind: "owner_relation", ref: savedRelationPoolRef }] },
    limit: 20,
  });
  const favoriteAndSaved = await querySummary(dbPath, config, {
    pools: {
      allOf: [
        { kind: "owner_relation", ref: favoritePoolRef },
        { kind: "owner_relation", ref: savedRelationPoolRef },
      ],
    },
    limit: 20,
  });
  const localNoneOfFavorite = await querySummary(dbPath, config, {
    text: config.primaryText,
    pools: {
      anyOf: [{ kind: "local_catalog" }],
      noneOf: [{ kind: "owner_relation", ref: favoritePoolRef }],
    },
    limit: 100,
  });
  const sourceLibraryAndFavorite = await querySummary(dbPath, config, {
    text: config.primaryText,
    pools: {
      allOf: [
        { kind: "source_library", ref: savedSourceLibraryRef },
        { kind: "owner_relation", ref: favoritePoolRef },
      ],
    },
    limit: 20,
  });
  const sourceLibraryNoneOfSaved = await querySummary(dbPath, config, {
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
  assertScenario(
    checks,
    localNoneOfFavorite.hitCount === localPrimaryAfterBlock.hitCount - 2,
    "noneOf favorite excludes the two favorite primary hits",
  );
  assertScenario(
    checks,
    sourceLibraryAndFavorite.hitCount === 2,
    "source-library and favorite pool intersection returns two hits",
  );
  assertScenario(
    checks,
    sourceLibraryNoneOfSaved.hitCount === localPrimaryAfterBlock.hitCount - 2,
    "source-library noneOf saved excludes the two saved primary hits",
  );

  report.providerRelationLimitAttempt = await captureQueryError(dbPath, config, {
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
  assertScenario(
    checks,
    (report.providerRelationLimitAttempt as { code?: string }).code ===
      "music_intelligence.provider_search_pool_invalid",
    "provider_search with allOf/noneOf remains an explicit unsupported boundary",
  );

  report.blockedPoolAttempt = await captureQueryError(dbPath, config, {
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
  assertScenario(
    checks,
    (report.blockedPoolAttempt as { code?: string }).code ===
      "music_intelligence.retrieval_query_invalid",
    "blocked is not accepted as an owner relation pool",
  );

  const unblocked = removeRelationScenario(dbPath, {
    materialRefKey: relationPlan.find((item) => item.relationKind === "blocked")?.materialRefKey,
    relationKind: "blocked",
  });
  report.blockedRelationRemoval = unblocked;
  report.projectionAfterBlockedRemoval = runProjectionMaintenance(dbPath);
  const localPrimaryAfterUnblock = await querySummary(dbPath, config, {
    text: config.primaryText,
    pools: { anyOf: [{ kind: "local_catalog" }] },
    limit: 100,
  });
  report.localPrimaryAfterUnblock = localPrimaryAfterUnblock;
  assertScenario(
    checks,
    localPrimaryAfterUnblock.hitCount === localPrimaryBefore.hitCount,
    "removing blocked relation restores the local primary hit count",
  );

  report.finalCounts = readCounts(dbPath);
  report.checks = checks;
  return report;
}

async function runImport(input: {
  dbPath: string;
  config: ScenarioConfig;
  maxNewItems?: number;
  continueUntilComplete: boolean;
}): Promise<{
  ok: true;
  calls: number;
  batch: Pick<
    SourceLibraryImportResult["batch"],
    | "batchId"
    | "status"
    | "processedCount"
    | "importedCount"
    | "alreadyPresentCount"
    | "failedCount"
  > & {
    completionReason?: NonNullable<SourceLibraryImportResult["batch"]["completionReason"]>;
  };
  lastPage?: SourceLibraryImportResult["providerPage"];
}> {
  return withHost(input.dbPath, input.config, async (host) => {
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

    while (
      input.continueUntilComplete &&
      value.batch.status === "running" &&
      calls < input.config.updateMaxCalls
    ) {
      calls += 1;
      result = await sourceLibraryImport.continueImport({
        batchId: value.batch.batchId,
        limit: input.config.importPageLimit,
      });

      if (!result.ok) {
        throw new Error(`${result.error.code}: ${result.error.message}`);
      }

      value = result.value;
    }

    if (input.continueUntilComplete && value.batch.status === "running") {
      throw new Error(
        `Import batch '${value.batch.batchId}' was still running after ${calls} calls.`,
      );
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
      ...(value.providerPage === undefined ? {} : { lastPage: value.providerPage }),
    };
  });
}

async function withHost<Result>(
  dbPath: string,
  config: ScenarioConfig,
  operation: (host: ReturnType<typeof createServerHost>) => Promise<Result>,
): Promise<Result> {
  const host = createServerHost({
    config: {
      database: { filename: dbPath },
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
  } finally {
    const stopped = await host.stop();

    if (!stopped.ok) {
      throw new Error(`${stopped.error.code}: ${stopped.error.message}`);
    }
  }
}

async function queryResult(
  dbPath: string,
  config: ScenarioConfig,
  input: RetrievalQueryInput,
): Promise<RetrievalQueryResult> {
  return withHost(dbPath, config, async (host) => {
    const retrievalQuery = host.retrievalQuery();

    if (retrievalQuery === undefined) {
      throw new Error("Retrieval query service was not wired.");
    }

    return retrievalQuery.query(input);
  });
}

async function querySummary(
  dbPath: string,
  config: ScenarioConfig,
  input: RetrievalQueryInput,
): Promise<QuerySummary> {
  const result = await queryResult(dbPath, config, input);
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

async function runCursorScenario(
  dbPath: string,
  config: ScenarioConfig,
  input: RetrievalQueryInput,
) {
  const first = await querySummary(dbPath, config, input);

  if (first.nextCursor === undefined) {
    return {
      first,
      second: undefined,
      overlapCount: 0,
    };
  }

  const second = await querySummary(dbPath, config, {
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

async function captureQueryError(
  dbPath: string,
  config: ScenarioConfig,
  input: RetrievalQueryInput,
) {
  try {
    await queryResult(dbPath, config, input);
    return {
      ok: true,
    };
  } catch (error) {
    return {
      ok: false,
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
      code: errorCode(error),
    };
  }
}

function recordRelationScenario(
  dbPath: string,
  plan: readonly {
    materialRefKey: string;
    relationKind: OwnerMaterialRelationKind;
    note: string;
  }[],
) {
  const database = openDatabase(dbPath);

  try {
    return database.transaction((db) => {
      const commands = createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: new Date().toISOString(),
      }).ownerRelations;

      return plan.map((item) => {
        const record = commands.recordOwnerMaterialRelation({
          ownerScope: DEFAULT_OWNER_SCOPE,
          materialRef: parseRefKey(item.materialRefKey),
          relationKind: item.relationKind,
          origin: "user_explicit",
          note: item.note,
        });

        return {
          relationKind: record.relationKind,
          relationRefKey: record.relationRefKey,
          materialRefKey: record.materialRefKey,
          status: record.status,
        };
      });
    });
  } finally {
    database.close();
  }
}

function removeRelationScenario(
  dbPath: string,
  input: {
    materialRefKey: string | undefined;
    relationKind: OwnerMaterialRelationKind;
  },
) {
  if (input.materialRefKey === undefined) {
    throw new Error(`Cannot remove ${input.relationKind} relation without a material ref.`);
  }

  const materialRefKey = input.materialRefKey;
  const database = openDatabase(dbPath);

  try {
    return database.transaction((db) => {
      const record = createMusicDataPlatformSourceOfTruthWriteCommands({
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
  } finally {
    database.close();
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

  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined
  ) {
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

function createStaleSourceLibraryFixture(input: {
  dbPath: string;
  config: ScenarioConfig;
  sourceLibrary: SourceLibraryRow;
}) {
  const database = openDatabase(input.dbPath);
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
    database.transaction((db) => {
      const commands = createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: new Date().toISOString(),
      });
      commands.identity.upsertSourceRecord({ entity });
      commands.identity.upsertMaterialRecord({
        materialRef,
        kind: "recording",
      });
      commands.identity.bindSourceToMaterial({
        sourceRef,
        materialRef,
        makePrimary: true,
      });
      const batch = commands.sourceLibrary.createImportBatch({
        batchId: `scenario_stale_seed_${safeSuffix}`,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: input.config.providerId,
        providerAccountId: input.sourceLibrary.provider_account_id,
        libraryKind: input.config.libraryKind,
      });
      const scopedBatch = commands.sourceLibrary.resolveImportBatchLibraryScope({
        batch,
        providerAccountId: input.sourceLibrary.provider_account_id,
      });
      commands.sourceLibrary.recordImportItem({
        batch: scopedBatch,
        sourceRef,
        providerId: input.config.providerId,
        providerEntityId: entity.providerEntityId!,
        materialRef,
      });
    });
  } finally {
    database.close();
  }

  return {
    sourceRefKey: refKey(sourceRef),
    materialRefKey: refKey(materialRef),
    presentBeforeUpdate: hasSourceLibraryItem(input.dbPath, {
      libraryRefKey: input.sourceLibrary.library_ref_key,
      sourceRefKey: refKey(sourceRef),
    }),
  };
}

function runProjectionMaintenance(dbPath: string) {
  const database = openDatabase(dbPath);
  const summaries = [];

  try {
    for (let round = 0; round < 80; round += 1) {
      const summary = createProjectionMaintenanceRunner({
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
      pending: scalar(database, "select count(*) as value from projection_maintenance_targets where status = 'dirty'"),
      failed: scalar(database, "select count(*) as value from projection_maintenance_targets where status = 'failed'"),
      summaries,
    };
  } finally {
    database.close();
  }
}

function readCounts(dbPath: string): CountSnapshot {
  const database = openDatabase(dbPath);

  try {
    return {
      sourceLibraryItems: scalar(database, "select count(*) as value from source_library_items"),
      sourceLibraryBatches: scalar(database, "select count(*) as value from source_library_import_batches"),
      sourceLibraryOutcomes: scalar(database, "select count(*) as value from source_library_import_item_outcomes"),
      sourceRecords: scalar(database, "select count(*) as value from source_records"),
      materialRecords: scalar(database, "select count(*) as value from material_records"),
      sourceMaterialBindings: scalar(database, "select count(*) as value from source_material_bindings"),
      ownerCatalogRows: scalar(database, "select count(*) as value from owner_material_catalog_view"),
      ownerEntries: scalar(database, "select count(*) as value from owner_material_entries"),
      materialTextDocuments: scalar(database, "select count(*) as value from material_text_documents"),
      materialTextFtsRows: scalar(database, "select count(*) as value from material_text_fts"),
      ownerRelations: scalar(database, "select count(*) as value from owner_material_relations"),
      pendingProjectionTargets: scalar(database, "select count(*) as value from projection_maintenance_targets where status = 'dirty'"),
      failedProjectionTargets: scalar(database, "select count(*) as value from projection_maintenance_targets where status = 'failed'"),
    };
  } finally {
    database.close();
  }
}

function requireSourceLibrary(
  dbPath: string,
  config: ScenarioConfig,
): SourceLibraryRow {
  const database = openDatabase(dbPath);

  try {
    const row = database.context().get<SourceLibraryRow>(
      `
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
      `,
      [config.providerId, config.libraryKind],
    );

    if (row === undefined) {
      throw new Error(
        `No source library found for ${config.providerId}/${config.libraryKind}.`,
      );
    }

    return row;
  } finally {
    database.close();
  }
}

function hasSourceLibraryItem(
  dbPath: string,
  input: {
    libraryRefKey: string;
    sourceRefKey: string;
  },
): boolean {
  const database = openDatabase(dbPath);

  try {
    return scalar(
      database,
      "select count(*) as value from source_library_items where library_ref_key = ? and source_ref_key = ?",
      [input.libraryRefKey, input.sourceRefKey],
    ) > 0;
  } finally {
    database.close();
  }
}

function scalar(
  database: MusicDatabase,
  sql: string,
  params: readonly (string | number | null)[] = [],
): number {
  return Number(database.context().get<{ value: number }>(sql, params)?.value ?? 0);
}

function openDatabase(dbPath: string): MusicDatabase {
  const database = SqliteMusicDatabase.open({ filename: dbPath });
  database.initialize({
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
  const seedDb = optionalEnv("MINEMUSIC_NCM_SCENARIO_SEED_DB");
  const baseUrl = optionalEnv("MINEMUSIC_NCM_BASE_URL");
  const exactText = optionalEnv("MINEMUSIC_NCM_SCENARIO_EXACT_TEXT");
  const updateMode = updateModeFromEnv(process.env.MINEMUSIC_NCM_SCENARIO_UPDATE_MODE);
  const importMaxNewItems = optionalPositiveInteger(
    process.env.MINEMUSIC_NCM_SCENARIO_IMPORT_MAX_NEW,
  ) ?? (seedDb === undefined ? 500 : undefined);

  return {
    providerId: process.env.MINEMUSIC_NCM_PROVIDER_ID ?? "netease",
    libraryKind: platformLibraryKindFromEnv(process.env.MINEMUSIC_NCM_LIBRARY_KIND),
    primaryText: process.env.MINEMUSIC_NCM_SCENARIO_PRIMARY_TEXT ?? "mili",
    secondaryText: process.env.MINEMUSIC_NCM_SCENARIO_SECONDARY_TEXT ?? "whoo",
    importPageLimit: optionalPositiveInteger(
      process.env.MINEMUSIC_NCM_SCENARIO_IMPORT_PAGE_LIMIT,
    ) ?? 100,
    updateMode,
    updateMaxCalls: optionalPositiveInteger(
      process.env.MINEMUSIC_NCM_SCENARIO_UPDATE_MAX_CALLS,
    ) ?? 40,
    providerLimit: optionalPositiveInteger(
      process.env.MINEMUSIC_NCM_SCENARIO_PROVIDER_LIMIT,
    ) ?? 20,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(seedDb === undefined ? {} : { seedDb }),
    ...(exactText === undefined ? {} : { exactText }),
    ...(importMaxNewItems === undefined ? {} : { importMaxNewItems }),
  };
}

function assertScenario(
  checks: string[],
  condition: boolean,
  message: string,
): void {
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
  if (
    value === "saved_source_track" ||
    value === "saved_source_album" ||
    value === "followed_source_artist"
  ) {
    return value;
  }

  return "saved_source_track";
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
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
