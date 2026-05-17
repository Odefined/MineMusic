import { createNetEaseSourceProvider, defaultNetEaseBaseUrl } from "../../src/providers/netease/index.js";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const liveEnabled = process.env.MINEMUSIC_LIVE_NETEASE === "1";
const baseUrl = process.env.MINEMUSIC_NETEASE_BASE_URL ?? defaultNetEaseBaseUrl;
const query = process.env.MINEMUSIC_NETEASE_QUERY ?? "coding";

if (!liveEnabled) {
  console.log("Skipping NetEase live smoke. Set MINEMUSIC_LIVE_NETEASE=1 to enable.");
} else {
  const provider = createNetEaseSourceProvider({ baseUrl });
  const result = await provider.search({ query: { text: query, limit: 1 } });

  if (!result.ok) {
    console.error(`NetEase live smoke failed: ${result.error.code} ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.value.length === 0) {
    console.error(`NetEase live smoke failed: no materials returned for query '${query}'.`);
    process.exitCode = 1;
  } else {
    const material = result.value[0];
    console.log(`NetEase live smoke returned ${result.value.length} material(s) from ${baseUrl}.`);
    console.log(`First material: ${material?.label ?? "(missing label)"} [${material?.state ?? "missing state"}]`);
  }
}
