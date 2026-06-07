import { createMineMusicExtensionRuntime } from "../../src/server/index.js";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const liveEnabled = process.env.MINEMUSIC_LIVE_NCM === "1";
const baseUrl = process.env.MINEMUSIC_NCM_BASE_URL;
const query = process.env.MINEMUSIC_NCM_QUERY ?? "coding";

if (!liveEnabled) {
  console.log("Skipping NCM live smoke. Set MINEMUSIC_LIVE_NCM=1 to enable.");
} else {
  const runtime = createMineMusicExtensionRuntime({
    plugins: {
      "minemusic.ncm": {
        ...(baseUrl === undefined ? {} : { baseUrl }),
      },
    },
  });
  const initialized = await runtime.initialize();

  if (!initialized.ok) {
    console.error(`NCM live smoke failed during initialization: ${initialized.error.code} ${initialized.error.message}`);
    process.exitCode = 1;
  } else {
    const result = await runtime.searchSourceProvider({
      providerId: "netease",
      query: {
        text: query,
        targetKinds: ["track"],
        limit: 1,
      },
    });

    if (!result.ok) {
      console.error(`NCM live smoke failed: ${result.error.code} ${result.error.message}`);
      process.exitCode = 1;
    } else if (result.value.candidates.length === 0) {
      console.error(`NCM live smoke failed: no source candidates returned for query '${query}'.`);
      process.exitCode = 1;
    } else {
      const first = result.value.candidates[0]?.sourceEntity;

      if (first?.sourceRef.namespace !== "source_netease") {
        console.error(`NCM live smoke failed: expected source_netease namespace, got '${first?.sourceRef.namespace}'.`);
        process.exitCode = 1;
      } else {
        console.log(`NCM live smoke returned ${result.value.candidates.length} candidate(s).`);
        console.log(`First candidate: ${first.label} [${first.sourceRef.kind}:${first.sourceRef.id}]`);
      }
    }
  }
}
