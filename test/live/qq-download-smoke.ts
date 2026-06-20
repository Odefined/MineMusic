// Live smoke: drive the real QQ provider through the download command end-to-end
// — search a track, resolve a download source, fetch + write the file. QQ does
// not return md5, so integrity is checked via sizeBytes only (the pipeline skips
// md5 when the provider omits it).
import { existsSync, statSync } from "node:fs";
import { createExtensionRuntime } from "../../src/extension/index.js";
import { createQqPlugin } from "../../src/extension/plugins/index.js";
import { createDownloadCommands } from "../../src/music_data_platform/download_commands.js";
import { createNodeMediaFileWriter } from "../../src/music_data_platform/download_file_writer.js";
import { musicDataPlatformDownloadSchema } from "../../src/music_data_platform/download_schema.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
declare const process: {
    env: Record<string, string | undefined>;
    exit(code?: number): never;
};
const baseUrl = process.env.MINEMUSIC_QQ_BASE_URL ?? "http://127.0.0.1:8080";
const query = process.env.MINEMUSIC_QQ_QUERY ?? "周杰伦 晴天";
const runtime = createExtensionRuntime({ plugins: [createQqPlugin({ baseUrl })] });
const init = await runtime.initialize();
if (!init.ok) {
    console.error("runtime init failed:", init.error.message);
    process.exit(1);
}
const search = await runtime.searchSourceProvider({
    providerId: "qq",
    query: { text: query, targetKinds: ["track"], limit: 1 },
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
    generateJobId: () => `qq-smoke-${Math.random().toString(36).slice(2, 10)}`,
});
const probe = await runtime.getSourceProviderDownloadSource({
    providerId: "qq",
    sourceRef: track.sourceRef,
});
if (!probe.ok) {
    console.error("probe failed:", probe.error.message);
    process.exit(1);
}
const container = probe.value.downloadSource.container;
const filename = `minemusic-qq-${track.sourceRef.id}.${container}`;
console.log("resolved source:", container, "| bitrate:", probe.value.downloadSource.bitrate, "| size:", probe.value.downloadSource.sizeBytes, "| md5:", probe.value.downloadSource.md5 ?? "(none — QQ does not return md5)");
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
        console.log("file:", path, "| size:", statSync(path).size, "| provider sizeBytes:", status.value.sizeBytes, "| match:", statSync(path).size === status.value.sizeBytes);
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
