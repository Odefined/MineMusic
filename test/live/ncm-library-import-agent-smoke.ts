import type { LibraryImportDriveOutput, LibraryImportLibraryKind, LibraryImportListSourcesOutput, LibraryImportStatusOutput, MusicDiscoveryLookupOutput, MusicListScopesOutput, MusicScope, MusicTargetKind, ToolCallOutput, } from "../../src/contracts/stage_interface.js";
import type { createServerHost as createServerHostFn, } from "../../src/server/index.js";
import type { createStageToolContext as createStageToolContextFn, } from "../../src/stage_interface/index.js";
import { createPostgresTestSchema, postgresTestDatabaseUrl } from "../support/postgres.js";
declare const process: {
    env: Record<string, string | undefined>;
    pid: number;
    exitCode?: number;
};
const liveEnabled = process.env.MINEMUSIC_LIVE_NCM_LIBRARY_IMPORT === "1";
const baseUrl = process.env.MINEMUSIC_NCM_BASE_URL;
const kind = libraryKindFromEnv(process.env.MINEMUSIC_NCM_LIBRARY_IMPORT_KIND);
const limit = positiveIntegerFromEnv(process.env.MINEMUSIC_NCM_LIBRARY_IMPORT_LIMIT) ?? 100;
const maxPages = nonNegativeIntegerFromEnv(process.env.MINEMUSIC_NCM_LIBRARY_IMPORT_MAX_PAGES);
const lookupText = process.env.MINEMUSIC_NCM_LIBRARY_IMPORT_LOOKUP_TEXT;
const projectionWaitMs = positiveIntegerFromEnv(process.env.MINEMUSIC_NCM_LIBRARY_IMPORT_PROJECTION_WAIT_MS) ?? 1500;
type SmokeServerHost = ReturnType<typeof createServerHostFn>;
type SmokeStageToolContext = ReturnType<typeof createStageToolContextFn>;
if (!liveEnabled) {
    console.log("Skipping NCM library-import agent-path smoke. Set MINEMUSIC_LIVE_NCM_LIBRARY_IMPORT=1 to enable.");
}
else {
    const { createServerHost } = await import("../../src/server/index.js");
    const { createStageToolContext } = await import("../../src/stage_interface/index.js");
    const databaseUrl = postgresTestDatabaseUrl();
    const databaseSchema = `minemusic_live_ncm_library_import_${process.pid}`;
    await createPostgresTestSchema({ connectionString: databaseUrl, schema: databaseSchema });
    const host = createServerHost({
        config: {
            database: {
                url: databaseUrl,
                schema: databaseSchema,
            },
            sourceLibraryImport: {
                defaultLimit: limit,
            },
            plugins: {
                "minemusic.ncm": {
                    ...(baseUrl === undefined ? {} : { baseUrl }),
                },
            },
        },
    });
    const ctx = createStageToolContext({
        ownerScope: "local",
        sessionId: "ncm-library-import-agent-smoke",
        requestId: "ncm-library-import-agent-smoke-request",
    });
    const started = await host.start();
    if (!started.ok) {
        console.error(`NCM library-import agent smoke failed during startup: ${started.error.code} ${started.error.message}`);
        process.exitCode = 1;
    }
    else {
        const listed = await dispatch<LibraryImportListSourcesOutput>(host, ctx, "library.import.list_sources", {});
        const ncmSource = await listed?.sources.find((source) => source.providerId === "netease" &&
            source.libraryKinds.some((sourceKind) => sourceKind.kind === kind));
        if (ncmSource === undefined) {
            console.error(`NCM library-import agent smoke failed: netease ${kind} source was not listed.`);
            process.exitCode = 1;
        }
        else {
            const drive = await dispatch<LibraryImportDriveOutput>(host, ctx, "library.import.start", {
                providerId: "netease",
                libraryKind: kind,
                limit,
            });
            let status: LibraryImportStatusOutput | undefined;
            let polls = 0;
            while (process.exitCode !== 1 &&
                drive !== undefined &&
                (maxPages === undefined || polls < maxPages)) {
                status = await dispatch<LibraryImportStatusOutput>(host, ctx, "library.import.status", {
                    batchId: drive.batchId,
                });
                polls += 1;
                if (status === undefined || !status.hasMore) {
                    break;
                }
                await sleep(3500);
            }
            if (drive !== undefined && process.exitCode !== 1) {
                if (status !== undefined) {
                    console.log(`NCM library-import agent smoke observed ${polls} status poll(s).`);
                    console.log(`Batch ${status.batchId}: ${status.status}; imported=${status.totals.imported}, alreadyPresent=${status.totals.alreadyPresent}, failed=${status.totals.failed}.`);
                    if (status.hasMore) {
                        console.log("Batch still has more pages; increase MINEMUSIC_NCM_LIBRARY_IMPORT_MAX_PAGES or unset it to drive to exhaustion.");
                    }
                    else if (status.sourceLibraryScope === undefined) {
                        console.error("NCM library-import agent smoke failed: completed batch did not return a sourceLibraryScope.");
                        process.exitCode = 1;
                    }
                    else {
                        await sleep(projectionWaitMs);
                        await verifyScopeListing(host, ctx, status.sourceLibraryScope);
                        if (lookupText === undefined || lookupText.trim().length === 0) {
                            console.log("Skipping lookup assertion. Set MINEMUSIC_NCM_LIBRARY_IMPORT_LOOKUP_TEXT to verify music.discovery.lookup over the imported sourceLibraryScope.");
                        }
                        else {
                            await verifyLookup(host, ctx, status.sourceLibraryScope, lookupText, targetKindForLibraryKind(kind));
                        }
                    }
                }
            }
        }
    }
    const stopped = await host.stop();
    if (!stopped.ok && process.exitCode !== 1) {
        console.error(`NCM library-import agent smoke failed during shutdown: ${stopped.error.code} ${stopped.error.message}`);
        process.exitCode = 1;
    }
}
async function dispatch<T>(host: SmokeServerHost, ctx: SmokeStageToolContext, toolName: string, payload: unknown): Promise<T | undefined> {
    const result = await host.dispatch(ctx, {
        toolName,
        payload,
    });
    if (!result.ok) {
        console.error(`NCM library-import agent smoke failed in ${toolName}: ${result.error.code} ${result.error.message}`);
        process.exitCode = 1;
        return undefined;
    }
    return toolResult<T>(result.value, toolName);
}
async function verifyScopeListing(host: SmokeServerHost, ctx: SmokeStageToolContext, sourceLibraryScope: Extract<MusicScope, {
    kind: "source_library";
}>): Promise<void> {
    const listed = await dispatch<MusicListScopesOutput>(host, ctx, "music.discovery.list_scopes", {
        kind: "source_library",
    });
    const found = listed?.scopes.some((scope) => scope.kind === "source_library" && scope.id === sourceLibraryScope.id) ?? false;
    if (!found) {
        console.error("NCM library-import agent smoke failed: imported sourceLibraryScope was not listed by music.discovery.list_scopes.");
        process.exitCode = 1;
    }
}
async function verifyLookup(host: SmokeServerHost, ctx: SmokeStageToolContext, sourceLibraryScope: Extract<MusicScope, {
    kind: "source_library";
}>, text: string, targetKind: MusicTargetKind): Promise<void> {
    const lookup = await dispatch<MusicDiscoveryLookupOutput>(host, ctx, "music.discovery.lookup", {
        lookupText: text,
        targetKind,
        scopes: [sourceLibraryScope],
        limit: 5,
    });
    if (lookup !== undefined && lookup.items.length === 0) {
        console.error(`NCM library-import agent smoke failed: lookup '${text}' returned no imported sourceLibraryScope hits.`);
        process.exitCode = 1;
    }
    else if (lookup !== undefined) {
        console.log(`Lookup '${text}' returned ${lookup.items.length} imported sourceLibraryScope hit(s).`);
    }
}
function toolResult<T>(output: ToolCallOutput, expectedToolName: string): T | undefined {
    if (output.toolName !== expectedToolName) {
        console.error(`NCM library-import agent smoke failed: expected ${expectedToolName}, got ${output.toolName}.`);
        process.exitCode = 1;
        return undefined;
    }
    return output.result as T;
}
function libraryKindFromEnv(value: string | undefined): LibraryImportLibraryKind {
    if (value === "saved_source_track" ||
        value === "saved_source_album" ||
        value === "followed_source_artist") {
        return value;
    }
    return "saved_source_track";
}
function targetKindForLibraryKind(kind: LibraryImportLibraryKind): MusicTargetKind {
    switch (kind) {
        case "saved_source_track":
            return "recording";
        case "saved_source_album":
            return "album";
        case "followed_source_artist":
            return "artist";
    }
}
function positiveIntegerFromEnv(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
function nonNegativeIntegerFromEnv(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
