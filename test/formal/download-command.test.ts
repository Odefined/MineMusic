import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { DownloadSource } from "../../src/contracts/music_data_platform.js";
import type { Ref, Result } from "../../src/contracts/kernel.js";
import { createDownloadCommands, type DownloadCommands, type DownloadJobStatus, type DownloadSourceProvider, } from "../../src/music_data_platform/download_commands.js";
import { downloadToFile, type MediaFileWriter } from "../../src/music_data_platform/download_to_file.js";
import { musicDataPlatformDownloadSchema } from "../../src/music_data_platform/download_schema.js";
import { type MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
const trackRef: Ref = { namespace: "source_netease", kind: "track", id: "1001" };
const albumRef: Ref = { namespace: "source_netease", kind: "album", id: "3001" };
function okSource(overrides: Partial<DownloadSource> = {}): DownloadSource {
    return {
        url: "http://test/audio.flac",
        container: "flac",
        bitrate: 991769,
        ...overrides,
    };
}
type MemoryFiles = {
    writer: MediaFileWriter;
    files: Map<string, Uint8Array>;
};
function createMemoryFileWriter(seeded: ReadonlyMap<string, Uint8Array> = new Map()): MemoryFiles {
    const files = new Map<string, Uint8Array>(seeded);
    const writer: MediaFileWriter = {
        exists(path) {
            return files.has(path);
        },
        ensureDir() { },
        async remove(path) {
            await files.delete(path);
        },
        openSink(path) {
            const chunks: Uint8Array[] = [];
            let closed = false;
            return {
                async append(chunk) {
                    if (closed) {
                        return;
                    }
                    chunks.push(chunk);
                },
                async close() {
                    if (closed) {
                        return;
                    }
                    closed = true;
                    const total = chunks.reduce((n, c) => n + c.length, 0);
                    const merged = new Uint8Array(total);
                    let offset = 0;
                    for (const chunk of chunks) {
                        merged.set(chunk, offset);
                        offset += chunk.length;
                    }
                    files.set(path, merged);
                },
            };
        },
    };
    return { writer, files };
}
function createFakeDownloadSourceProvider(resolve: (input: {
    providerId: string;
    sourceRef: Ref;
    preferredBitrate?: number;
}) => Result<DownloadSource>): DownloadSourceProvider & {
    calls: {
        providerId: string;
        preferredBitrate?: number;
    }[];
} {
    const calls: {
        providerId: string;
        preferredBitrate?: number;
    }[] = [];
    return {
        calls,
        async getDownloadSource(input) {
            calls.push({
                providerId: input.providerId,
                ...(input.preferredBitrate === undefined ? {} : { preferredBitrate: input.preferredBitrate }),
            });
            return resolve(input);
        },
    };
}
function ok<T>(value: T): Result<T> {
    return { ok: true, value };
}
function fail(code: string, message: string): Result<never> {
    return {
        ok: false,
        error: { code, message, area: "music_data_platform", retryable: false },
    };
}
function assertOk<T>(result: Result<T>): T {
    if (!result.ok) {
        throw new Error(result.error.message);
    }
    return result.value;
}
function assertError(result: Result<unknown>, code: string): void {
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.code, code);
        assert.equal(result.error.area, "music_data_platform");
    }
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
// The download runs as a fire-and-forget background task; tests must wait for
// the job to reach a terminal state BEFORE closing the database, otherwise the
// background write can touch a closed handle. Polling status (rather than a
// single tick) makes this deterministic regardless of microtask scheduling.
async function waitForTerminal(commands: DownloadCommands, jobId: string): Promise<DownloadJobStatus> {
    for (let i = 0; i < 100; i += 1) {
        await tick();
        const status = assertOk(await commands.status(jobId));
        if (status.state !== "running") {
            return status;
        }
    }
    throw new Error(`download job '${jobId}' did not reach a terminal state`);
}
function buildCommands(input: {
    database: MusicDatabase;
    provider: DownloadSourceProvider;
    fileWriter: MediaFileWriter;
    fetch?: typeof fetch;
    clock?: () => string;
    generateJobId?: () => string;
}): DownloadCommands {
    let time = 0;
    let idCount = 0;
    return createDownloadCommands({
        database: input.database,
        downloadSourceProvider: input.provider,
        ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        fileWriter: input.fileWriter,
        clock: input.clock ?? (() => `t${++time}`),
        generateJobId: input.generateJobId ?? (() => `job-${++idCount}`),
    });
}
async function openDatabase(): Promise<MusicDatabase> {
    const database = await openUninitializedPostgresTestMusicDatabase();
    await database.initialize({ schemas: [musicDataPlatformDownloadSchema] });
    return database;
}
// --- helper: downloadToFile returns the actual md5 even when the provider did not supply one ---
{
    const audio = new Uint8Array([8, 6, 7, 5, 3, 0, 9]);
    const audioMd5 = (await createHash("md5").update(audio)).digest("hex");
    const { writer, files } = createMemoryFileWriter();
    const downloaded = await downloadToFile({
        source: okSource({ sizeBytes: audio.length }),
        outputPath: "/staging/job-1.part",
        fetch: (async () => new Response(audio)) as typeof fetch,
        fileWriter: writer,
    });
    assert.deepEqual(downloaded, {
        ok: true,
        bytesDownloaded: audio.length,
        actualMd5: audioMd5,
    });
    assert.deepEqual(await files.get("/staging/job-1.part"), audio);
}
// --- happy path: start a track download, background fetch writes the file ---
{
    const database = await openDatabase();
    const audio = new Uint8Array([1, 2, 3, 4, 5]);
    const { writer, files } = createMemoryFileWriter();
    const audioMd5 = (await createHash("md5").update(audio)).digest("hex");
    const provider = createFakeDownloadSourceProvider(() => ok(okSource({ sizeBytes: audio.length, md5: audioMd5 })));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response(audio)) as typeof fetch,
    });
    const jobId = assertOk(await commands.start({
        sourceRef: trackRef,
        outputDir: "/out",
        filename: "song.flac",
    }));
    const status = await waitForTerminal(commands, jobId);
    assert.equal(status.state, "completed");
    assert.equal(status.outputPath, "/out/song.flac");
    assert.equal(status.bytesDownloaded, audio.length);
    assert.equal(status.container, "flac");
    assert.equal(status.md5, audioMd5);
    assert.equal(status.providerId, "netease");
    assert.deepEqual(await files.get("/out/song.flac"), audio);
    // providerId was reverse-resolved from the source namespace.
    assert.deepEqual(provider.calls, [{ providerId: "netease" }]);
    await database.close();
}
// --- a non-track sourceRef is rejected before any provider call or job ---
{
    const database = await openDatabase();
    const { writer } = createMemoryFileWriter();
    const provider = createFakeDownloadSourceProvider(() => ok(okSource()));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response(new Uint8Array())) as typeof fetch,
    });
    assertError(await commands.start({ sourceRef: albumRef, outputDir: "/out", filename: "a.flac" }), "music_data.download_no_audio_stream");
    assert.equal(provider.calls.length, 0);
    await database.close();
}
// --- a download_source failure is propagated, no orphan job ---
{
    const database = await openDatabase();
    const { writer } = createMemoryFileWriter();
    const provider = createFakeDownloadSourceProvider(() => fail("extension.ncm_no_download_source", "no url"));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response(new Uint8Array())) as typeof fetch,
    });
    const startResult = await commands.start({ sourceRef: trackRef, outputDir: "/out", filename: "a.flac" });
    assert.equal(startResult.ok, false);
    await tick();
    // No job row was created.
    assertError(await commands.status("job-1"), "music_data.download_job_not_found");
    await database.close();
}
// --- overwrite=error rejects when the output file already exists ---
{
    const database = await openDatabase();
    const existing = new Uint8Array([9, 9]);
    const { writer, files } = createMemoryFileWriter(new Map([["/out/song.flac", existing]]));
    const provider = createFakeDownloadSourceProvider(() => ok(okSource()));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response(new Uint8Array([1]))) as typeof fetch,
    });
    assertError(await commands.start({ sourceRef: trackRef, outputDir: "/out", filename: "song.flac" }), "music_data.download_output_exists");
    // existing file untouched
    assert.deepEqual(await files.get("/out/song.flac"), existing);
    await database.close();
}
// --- overwrite=skip records a completed job without re-downloading ---
{
    const database = await openDatabase();
    const existing = new Uint8Array([9, 9]);
    const { writer, files } = createMemoryFileWriter(new Map([["/out/song.flac", existing]]));
    const provider = createFakeDownloadSourceProvider(() => ok(okSource()));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response(new Uint8Array([1]))) as typeof fetch,
    });
    const jobId = assertOk(await commands.start({
        sourceRef: trackRef,
        outputDir: "/out",
        filename: "song.flac",
        overwrite: "skip",
    }));
    const status = assertOk(await commands.status(jobId));
    assert.equal(status.state, "completed");
    assert.equal(status.bytesDownloaded, 0);
    // existing file untouched, and skip decides locally — no provider call (P3-a).
    assert.equal(provider.calls.length, 0);
    assert.deepEqual(await files.get("/out/song.flac"), existing);
    await database.close();
}
// --- overwrite=overwrite replaces the existing file ---
{
    const database = await openDatabase();
    const fresh = new Uint8Array([7, 7, 7]);
    const { writer, files } = createMemoryFileWriter(new Map([["/out/song.flac", new Uint8Array([9])]]));
    const provider = createFakeDownloadSourceProvider(() => ok(okSource()));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response(fresh)) as typeof fetch,
    });
    const jobId = assertOk(await commands.start({
        sourceRef: trackRef,
        outputDir: "/out",
        filename: "song.flac",
        overwrite: "overwrite",
    }));
    const status = await waitForTerminal(commands, jobId);
    assert.equal(status.state, "completed");
    assert.equal(status.bytesDownloaded, fresh.length);
    assert.deepEqual(await files.get("/out/song.flac"), fresh);
    await database.close();
}
// --- a fetch HTTP failure marks the job failed, never disguised as success ---
{
    const database = await openDatabase();
    const { writer } = createMemoryFileWriter();
    const provider = createFakeDownloadSourceProvider(() => ok(okSource()));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response("upstream error", { status: 503 })) as typeof fetch,
    });
    const jobId = assertOk(await commands.start({
        sourceRef: trackRef,
        outputDir: "/out",
        filename: "song.flac",
    }));
    const status = await waitForTerminal(commands, jobId);
    assert.equal(status.state, "failed");
    assert.equal(status.errorCode, "music_data.download_http_failed");
    await database.close();
}
// --- preferredBitrate is forwarded to the download source provider ---
{
    const database = await openDatabase();
    const { writer } = createMemoryFileWriter();
    const provider = createFakeDownloadSourceProvider(() => ok(okSource()));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response(new Uint8Array([1]))) as typeof fetch,
    });
    const preferredJobId = assertOk(await commands.start({
        sourceRef: trackRef,
        outputDir: "/out",
        filename: "song.flac",
        preferredBitrate: 320000,
    }));
    assert.deepEqual(provider.calls, [{ providerId: "netease", preferredBitrate: 320000 }]);
    await waitForTerminal(commands, preferredJobId);
    await database.close();
}
// --- a size mismatch (truncated body) is failed, not recorded as completed ---
{
    const database = await openDatabase();
    const audio = new Uint8Array([1, 2, 3]);
    const { writer } = createMemoryFileWriter();
    const provider = createFakeDownloadSourceProvider(() => ok(okSource({ sizeBytes: 999 })));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response(audio)) as typeof fetch,
    });
    const jobId = assertOk(await commands.start({ sourceRef: trackRef, outputDir: "/out", filename: "a.flac" }));
    const status = await waitForTerminal(commands, jobId);
    assert.equal(status.state, "failed");
    assert.equal(status.errorCode, "music_data.download_size_mismatch");
    await database.close();
}
// --- an md5 mismatch (corrupt body) is failed ---
{
    const database = await openDatabase();
    const audio = new Uint8Array([1, 2, 3, 4, 5]);
    const { writer } = createMemoryFileWriter();
    const provider = createFakeDownloadSourceProvider(() => ok(okSource({ sizeBytes: audio.length, md5: "deadbeefdeadbeefdeadbeefdeadbeef" })));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response(audio)) as typeof fetch,
    });
    const jobId = assertOk(await commands.start({ sourceRef: trackRef, outputDir: "/out", filename: "a.flac" }));
    const status = await waitForTerminal(commands, jobId);
    assert.equal(status.state, "failed");
    assert.equal(status.errorCode, "music_data.download_integrity_failed");
    await database.close();
}
// --- drain() waits for in-flight downloads to settle (shutdown safety) ---
{
    const database = await openDatabase();
    const audio = new Uint8Array([1, 2, 3, 4, 5]);
    const audioMd5 = (await createHash("md5").update(audio)).digest("hex");
    const { writer } = createMemoryFileWriter();
    const provider = createFakeDownloadSourceProvider(() => ok(okSource({ sizeBytes: audio.length, md5: audioMd5 })));
    const commands = buildCommands({
        database,
        provider,
        fileWriter: writer,
        fetch: (async () => new Response(audio)) as typeof fetch,
    });
    const jobId = assertOk(await commands.start({ sourceRef: trackRef, outputDir: "/out", filename: "a.flac" }));
    // Do NOT waitForTerminal — drain() must be what settles the background task.
    await commands.drain();
    const status = assertOk(await commands.status(jobId));
    assert.equal(status.state, "completed");
    await database.close();
}
