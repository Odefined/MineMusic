// Live smoke: drive the real NCM provider through the new download command
// end-to-end — search a track, resolve a download source, fetch + write the
// file, verify md5 against what the provider returned.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createExtensionRuntime } from "../../src/extension/index.js";
import { createNcmPlugin } from "../../src/extension/plugins/index.js";
import { createDownloadCommands } from "../../src/music_data_platform/download_commands.js";
import { createNodeMediaFileWriter } from "../../src/music_data_platform/download_file_writer.js";
import { musicDataPlatformDownloadSchema } from "../../src/music_data_platform/download_schema.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
const BASE_URL = process.env.NCM_BASE_URL ?? "http://127.0.0.1:3000";
const runtime = createExtensionRuntime({ plugins: [createNcmPlugin({ baseUrl: BASE_URL })] });
const init = await runtime.initialize();
if (!init.ok) {
    console.error("runtime init failed:", init.error.message);
    process.exit(1);
}
const search = await runtime.searchSourceProvider({
    providerId: "netease",
    query: { text: "河北墨麒麟", targetKinds: ["track"], limit: 1 },
});
if (!search.ok) {
    console.error("search failed:", search.error.message);
    process.exit(1);
}
const track = search.value.candidates[0]?.sourceEntity;
if (track === undefined) {
    console.error("no track found");
    process.exit(1);
}
console.log("track:", track.label, "| sourceRef:", track.sourceRef.namespace, track.sourceRef.kind, track.sourceRef.id);
const db = await openUninitializedPostgresTestMusicDatabase();
await db.initialize({ schemas: [musicDataPlatformDownloadSchema] });
const commands = createDownloadCommands({
    database: db,
    downloadSourceProvider: {
        async getDownloadSource(input) {
            const result = await runtime.getSourceProviderDownloadSource({
                providerId: input.providerId,
                sourceRef: input.sourceRef,
                ...(input.preferredBitrate === undefined ? {} : { preferredBitrate: input.preferredBitrate }),
            });
            return result.ok ? { ok: true, value: result.value.downloadSource } : result;
        },
    },
    fileWriter: createNodeMediaFileWriter(),
    clock: () => new Date().toISOString(),
    generateJobId: () => `smoke-${Math.random().toString(36).slice(2, 10)}`,
});
const probe = await runtime.getSourceProviderDownloadSource({
    providerId: "netease",
    sourceRef: track.sourceRef,
});
if (!probe.ok) {
    console.error("probe failed:", probe.error.message);
    process.exit(1);
}
const container = probe.value.downloadSource.container;
const filename = `minemusic-${track.sourceRef.id}.${container}`;
console.log("resolved source:", container, "| bitrate:", probe.value.downloadSource.bitrate, "| size:", probe.value.downloadSource.sizeBytes);
const start = await commands.start({
    sourceRef: track.sourceRef,
    outputDir: "/tmp",
    filename,
    overwrite: "overwrite",
});
if (!start.ok) {
    console.error("start failed:", start.error.message);
    process.exit(1);
}
console.log("job started:", start.value);
let status = await commands.status(start.value);
if (!status.ok) {
    console.error("status failed:", status.error.message);
    process.exit(1);
}
for (let i = 0; i < 400 && status.value.state === "running"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    status = await commands.status(start.value);
    if (!status.ok) {
        console.error("status failed:", status.error.message);
        process.exit(1);
    }
}
console.log("final status:", JSON.stringify(status.value, null, 2));
if (status.value.state === "completed") {
    const path = status.value.outputPath;
    if (existsSync(path)) {
        const md5 = (await createHash("md5").update(readFileSync(path))).digest("hex");
        console.log("file:", path, "| size:", statSync(path).size, "| actual md5:", md5);
        console.log("provider md5:", status.value.md5, "| match:", md5 === status.value.md5);
    }
    else {
        console.error("completed but file missing:", path);
        process.exit(1);
    }
}
else {
    console.error("download did not complete:", status.value.state, status.value.errorCode, status.value.errorMessage);
    process.exit(1);
}
await db.close();
