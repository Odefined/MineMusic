import { createServerHost } from "../../src/server/index.js";
import { createPostgresTestSchema, postgresTestDatabaseUrl } from "../support/postgres.js";
declare const process: {
    env: Record<string, string | undefined>;
    pid: number;
    exitCode?: number;
};
const liveEnabled = process.env.MINEMUSIC_LIVE_NCM_RETRIEVAL === "1";
const baseUrl = process.env.MINEMUSIC_NCM_BASE_URL;
const query = process.env.MINEMUSIC_NCM_QUERY ?? "coding";
const limit = positiveIntegerFromEnv(process.env.MINEMUSIC_NCM_RETRIEVAL_LIMIT) ?? 1;
if (!liveEnabled) {
    console.log("Skipping NCM mixed-retrieval live smoke. Set MINEMUSIC_LIVE_NCM_RETRIEVAL=1 to enable.");
}
else {
    const databaseUrl = postgresTestDatabaseUrl();
    const databaseSchema = `minemusic_live_ncm_retrieval_${process.pid}`;
    await createPostgresTestSchema({ connectionString: databaseUrl, schema: databaseSchema });
    const host = createServerHost({
        config: {
            database: {
                url: databaseUrl,
                schema: databaseSchema,
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
        console.error(`NCM mixed-retrieval smoke failed during startup: ${started.error.code} ${started.error.message}`);
        process.exitCode = 1;
    }
    else {
        const retrievalQuery = host.retrievalQuery();
        if (retrievalQuery === undefined) {
            console.error("NCM mixed-retrieval smoke failed: retrieval query service was not wired.");
            process.exitCode = 1;
        }
        else {
            try {
                const result = await retrievalQuery.query({
                    text: query,
                    pools: {
                        anyOf: [
                            { kind: "local_catalog" },
                            {
                                kind: "provider_search",
                                providerId: "netease",
                                limit,
                            },
                        ],
                    },
                    limit,
                });
                if (result.hits.length === 0) {
                    console.error(`NCM mixed-retrieval smoke failed: no hits returned for query '${query}'.`);
                    process.exitCode = 1;
                }
                else {
                    const first = result.hits[0];
                    console.log(`NCM mixed-retrieval smoke returned ${result.hits.length} hit(s).`);
                    console.log(`First hit: ${first?.kind ?? "unknown"} ${first?.display.title ?? "(untitled)"}`);
                }
            }
            catch (error) {
                console.error(`NCM mixed-retrieval smoke failed: ${error instanceof Error ? error.message : String(error)}`);
                process.exitCode = 1;
            }
        }
    }
    const stopped = await host.stop();
    if (!stopped.ok && process.exitCode !== 1) {
        console.error(`NCM mixed-retrieval smoke failed during shutdown: ${stopped.error.code} ${stopped.error.message}`);
        process.exitCode = 1;
    }
}
function positiveIntegerFromEnv(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
