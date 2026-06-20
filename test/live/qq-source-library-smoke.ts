import type { PlatformLibraryKind } from "../../src/contracts/music_data_platform.js";
import { createServerHost } from "../../src/server/index.js";
import { createPostgresTestSchema, postgresTestDatabaseUrl } from "../support/postgres.js";
declare const process: {
    env: Record<string, string | undefined>;
    pid: number;
    exitCode?: number;
};
const liveEnabled = process.env.MINEMUSIC_LIVE_QQ_LIBRARY === "1";
const baseUrl = process.env.MINEMUSIC_QQ_BASE_URL;
const kind = platformLibraryKindFromEnv(process.env.MINEMUSIC_QQ_LIBRARY_KIND);
const limit = positiveIntegerFromEnv(process.env.MINEMUSIC_QQ_LIBRARY_LIMIT) ?? 1;
const maxAdvanceCalls = positiveIntegerFromEnv(process.env.MINEMUSIC_QQ_LIBRARY_MAX_ADVANCE_CALLS) ?? 1;
if (!liveEnabled) {
    console.log("Skipping QQ source-library live smoke. Set MINEMUSIC_LIVE_QQ_LIBRARY=1 to enable.");
}
else {
    const databaseUrl = postgresTestDatabaseUrl();
    const databaseSchema = `minemusic_live_qq_library_${process.pid}`;
    await createPostgresTestSchema({ connectionString: databaseUrl, schema: databaseSchema });
    const host = createServerHost({
        config: {
            database: {
                url: databaseUrl,
                schema: databaseSchema,
            },
            plugins: {
                ...(baseUrl === undefined ? {} : { "minemusic.qq": { baseUrl } }),
            },
        },
    });
    const started = await host.start();
    if (!started.ok) {
        console.error(`QQ source-library smoke failed during startup: ${started.error.code} ${started.error.message}`);
        process.exitCode = 1;
    }
    else {
        const sourceLibraryImport = host.sourceLibraryImport();
        if (sourceLibraryImport === undefined) {
            console.error("QQ source-library smoke failed: import service was not wired.");
            process.exitCode = 1;
        }
        else {
            let imported = await sourceLibraryImport.startImport({
                providerId: "qq",
                libraryKind: kind,
                limit,
                maxNewItems: limit,
            });
            let advanceCalls = 0;
            while (imported.ok && imported.value.batch.status === "running" && advanceCalls < maxAdvanceCalls) {
                advanceCalls += 1;
                imported = await sourceLibraryImport.advanceOnePage({
                    batchId: imported.value.batch.batchId,
                });
            }
            if (!imported.ok) {
                console.error(`QQ source-library smoke failed: ${imported.error.code} ${imported.error.message}`);
                process.exitCode = 1;
            }
            else {
                console.log(`Batch ${imported.value.batch.batchId}: ${imported.value.batch.status}; ${imported.value.batch.importedCount} imported, ${imported.value.batch.alreadyPresentCount} already present, ${imported.value.batch.failedCount} failed after ${advanceCalls} advance call(s).`);
            }
        }
    }
    const stopped = await host.stop();
    if (!stopped.ok && process.exitCode !== 1) {
        console.error(`QQ source-library smoke failed during shutdown: ${stopped.error.code} ${stopped.error.message}`);
        process.exitCode = 1;
    }
}
function platformLibraryKindFromEnv(value: string | undefined): PlatformLibraryKind {
    if (value === "saved_source_track" ||
        value === "saved_source_album" ||
        value === "followed_source_artist") {
        return value;
    }
    return "saved_source_track";
}
function positiveIntegerFromEnv(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
