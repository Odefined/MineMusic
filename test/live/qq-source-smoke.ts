import { createMineMusicExtensionRuntime } from "../../src/server/index.js";
declare const process: {
    env: Record<string, string | undefined>;
    exitCode?: number;
};
const liveEnabled = process.env.MINEMUSIC_LIVE_QQ === "1";
const baseUrl = process.env.MINEMUSIC_QQ_BASE_URL;
const query = process.env.MINEMUSIC_QQ_QUERY ?? "周杰伦 晴天";
if (!liveEnabled) {
    console.log("Skipping QQ live smoke. Set MINEMUSIC_LIVE_QQ=1 to enable.");
}
else {
    const runtime = createMineMusicExtensionRuntime({
        plugins: {
            ...(baseUrl === undefined ? {} : { "minemusic.qq": { baseUrl } }),
        },
    });
    const initialized = await runtime.initialize();
    if (!initialized.ok) {
        console.error(`QQ live smoke failed during initialization: ${initialized.error.code} ${initialized.error.message}`);
        process.exitCode = 1;
    }
    else {
        const result = await runtime.searchSourceProvider({
            providerId: "qq",
            query: {
                text: query,
                targetKinds: ["track"],
                limit: 1,
            },
        });
        if (!result.ok) {
            console.error(`QQ live smoke failed: ${result.error.code} ${result.error.message}`);
            process.exitCode = 1;
        }
        else if (result.value.candidates.length === 0) {
            console.error(`QQ live smoke failed: no source candidates returned for query '${query}'.`);
            process.exitCode = 1;
        }
        else {
            const first = result.value.candidates[0]?.sourceEntity;
            if (first?.sourceRef.namespace !== "source_qq") {
                console.error(`QQ live smoke failed: expected source_qq namespace, got '${first?.sourceRef.namespace}'.`);
                process.exitCode = 1;
            }
            else {
                console.log(`QQ live smoke returned ${result.value.candidates.length} candidate(s).`);
                console.log(`First candidate: ${first.label} [${first.sourceRef.kind}:${first.sourceRef.id}]`);
            }
        }
    }
}
