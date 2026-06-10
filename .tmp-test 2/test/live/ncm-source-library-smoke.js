import { createServerHost } from "../../src/server/index.js";
const liveEnabled = process.env.MINEMUSIC_LIVE_NCM_LIBRARY === "1";
const baseUrl = process.env.MINEMUSIC_NCM_BASE_URL;
const kind = platformLibraryKindFromEnv(process.env.MINEMUSIC_NCM_LIBRARY_KIND);
const limit = positiveIntegerFromEnv(process.env.MINEMUSIC_NCM_LIBRARY_LIMIT) ?? 1;
if (!liveEnabled) {
    console.log("Skipping NCM source-library live smoke. Set MINEMUSIC_LIVE_NCM_LIBRARY=1 to enable.");
}
else {
    const host = createServerHost({
        config: {
            database: {
                filename: ":memory:",
            },
            plugins: {
                "minemusic.ncm": {
                    ...(baseUrl === undefined ? {} : { baseUrl }),
                },
            },
        },
    });
    const started = await host.start();
    if (!started.ok) {
        console.error(`NCM source-library smoke failed during startup: ${started.error.code} ${started.error.message}`);
        process.exitCode = 1;
    }
    else {
        const sourceLibraryImport = host.sourceLibraryImport();
        if (sourceLibraryImport === undefined) {
            console.error("NCM source-library smoke failed: import service was not wired.");
            process.exitCode = 1;
        }
        else {
            const imported = await sourceLibraryImport.startImport({
                providerId: "netease",
                libraryKind: kind,
                limit,
                maxNewItems: limit,
            });
            if (!imported.ok) {
                console.error(`NCM source-library smoke failed: ${imported.error.code} ${imported.error.message}`);
                process.exitCode = 1;
            }
            else {
                console.log(`NCM source-library smoke read ${imported.value.providerPage?.candidateCount ?? 0} candidate(s).`);
                console.log(`Batch ${imported.value.batch.batchId}: ${imported.value.batch.importedCount} imported, ${imported.value.batch.alreadyPresentCount} already present, ${imported.value.batch.failedCount} failed.`);
            }
        }
    }
    const stopped = await host.stop();
    if (!stopped.ok && process.exitCode !== 1) {
        console.error(`NCM source-library smoke failed during shutdown: ${stopped.error.code} ${stopped.error.message}`);
        process.exitCode = 1;
    }
}
function platformLibraryKindFromEnv(value) {
    if (value === "saved_source_track" ||
        value === "saved_source_album" ||
        value === "followed_source_artist") {
        return value;
    }
    return "saved_source_track";
}
function positiveIntegerFromEnv(value) {
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
