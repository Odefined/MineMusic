import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type {
  BackgroundWorkBackend,
  BackgroundWorkSubmitInput,
} from "../../src/background_work/index.js";
import {
  refKey,
  type Ref,
  type Result,
} from "../../src/contracts/kernel.js";
import type {
  DownloadSource,
  SourceTrack,
} from "../../src/contracts/music_data_platform.js";
import type { DownloadSourceProvider } from "../../src/music_data_platform/download_commands.js";
import { MusicDataPlatformError } from "../../src/music_data_platform/errors.js";
import { createIdentityReadPort } from "../../src/music_data_platform/identity_read_model.js";
import { createIdentityRepositories } from "../../src/music_data_platform/identity_records.js";
import {
  createLocalSourceCommand,
  type CreateLocalSourceInput,
  type LocalSourceCommand,
} from "../../src/music_data_platform/local_source_commands.js";
import {
  createLocalizeProviderSourceCommand,
  localizeProviderSourceIdempotencyKey,
} from "../../src/music_data_platform/localize_provider_source_commands.js";
import {
  createLocalizeProviderSourceJobHandler,
  LOCALIZE_PROVIDER_SOURCE_JOB_TYPE,
  LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION,
  type LocalizeProviderSourceFileStore,
  type LocalizeProviderSourceJobPayload,
} from "../../src/music_data_platform/localize_provider_source_job.js";
import {
  createMaterialRefFactory,
  createLocalSourceRef,
  createMusicDataPlatformSourceOfTruthWriteCommands,
  MAIN_LOCAL_SOURCE_ROOT_ID,
  musicDataPlatformIdentitySchema,
  musicDataPlatformProjectionMaintenanceSchema,
} from "../../src/music_data_platform/index.js";
import type {
  MusicDatabase,
  MusicDatabaseContext,
} from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";

const now = "2026-06-20T12:00:00.000Z";
const trackRef: Ref = { namespace: "source_netease", kind: "track", id: "1001" };
const albumRef: Ref = { namespace: "source_netease", kind: "album", id: "3001" };
const localRoot = "/mine/local-sources";

type MemoryLocalizeFileStore = {
  fileStore: LocalizeProviderSourceFileStore;
  files: Map<string, Uint8Array>;
  directories: string[];
};

function createMemoryLocalizeFileStore(
  seeded: ReadonlyMap<string, Uint8Array> = new Map(),
): MemoryLocalizeFileStore {
  const files = new Map<string, Uint8Array>(seeded);
  const directories: string[] = [];
  const fileStore: LocalizeProviderSourceFileStore = {
    exists(path) {
      return files.has(path);
    },
    ensureDir(dir) {
      directories.push(dir);
    },
    remove(path) {
      files.delete(path);
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
          const total = chunks.reduce((n, chunk) => n + chunk.length, 0);
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
    md5(path) {
      const file = files.get(path);
      if (file === undefined) {
        throw new Error(`missing file '${path}'`);
      }
      return md5(file);
    },
    move(fromPath, toPath) {
      const file = files.get(fromPath);
      if (file === undefined) {
        throw new Error(`missing staged file '${fromPath}'`);
      }
      if (files.has(toPath)) {
        throw new Error(`target file '${toPath}' already exists`);
      }
      files.set(toPath, file);
      files.delete(fromPath);
    },
  };

  return { fileStore, files, directories };
}

type FakeBackgroundWork = Pick<BackgroundWorkBackend, "submit"> & {
  calls: BackgroundWorkSubmitInput<LocalizeProviderSourceJobPayload>[];
};

function createFakeBackgroundWork(submission: "created" | "deduplicated" = "created"): FakeBackgroundWork {
  const calls: BackgroundWorkSubmitInput<LocalizeProviderSourceJobPayload>[] = [];
  return {
    calls,
    async submit(input) {
      calls.push(input as BackgroundWorkSubmitInput<LocalizeProviderSourceJobPayload>);
      return {
        jobId: "queued-localize-job",
        submission,
      };
    },
  };
}

function createFakeDownloadSourceProvider(resolve: (input: {
  providerId: string;
  sourceRef: Ref;
  preferredBitrate?: number;
}) => Result<DownloadSource>): DownloadSourceProvider & {
  calls: {
    providerId: string;
    sourceRef: Ref;
    preferredBitrate?: number;
  }[];
} {
  const calls: {
    providerId: string;
    sourceRef: Ref;
    preferredBitrate?: number;
  }[] = [];

  return {
    calls,
    async getDownloadSource(input) {
      calls.push({
        providerId: input.providerId,
        sourceRef: input.sourceRef,
        ...(input.preferredBitrate === undefined ? {} : { preferredBitrate: input.preferredBitrate }),
      });
      return resolve(input);
    },
  };
}

function createFakeLocalSourceCommand(resolve: (input: CreateLocalSourceInput) => Result<{ materialRef: Ref; created: boolean }>): Pick<LocalSourceCommand, "createLocalSource"> & {
  calls: CreateLocalSourceInput[];
} {
  const calls: CreateLocalSourceInput[] = [];
  return {
    calls,
    async createLocalSource(input) {
      calls.push(input);
      return resolve(input);
    },
  };
}

async function initializedDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformProjectionMaintenanceSchema,
    ],
  });
  return database;
}

async function seedProviderMaterial(database: MusicDatabase, sourceRef: Ref): Promise<Ref> {
  return await database.transaction(async (db) => {
    const providerSource: SourceTrack = {
      origin: "provider",
      sourceRef,
      providerId: "netease",
      providerEntityId: sourceRef.id,
      kind: "track",
      label: `NetEase ${sourceRef.id}`,
      title: `NetEase ${sourceRef.id}`,
      artistLabels: ["Provider Artist", "Featured Artist"],
      artistSourceRefs: [
        { namespace: "source_netease", kind: "artist", id: "artist_1" },
        { namespace: "source_netease", kind: "artist", id: "artist_2" },
      ],
      albumLabel: "Provider Album",
      albumSourceRef: { namespace: "source_netease", kind: "album", id: "album_1" },
      trackPosition: {
        discNumber: "1",
        trackNumber: 7,
        trackCount: 12,
      },
      durationMs: 243000,
      versionInfo: {
        label: "Provider Version",
        tags: ["remastered"],
      },
      providerUrl: "https://music.example/provider-track",
      availabilityHint: "restricted",
    };
    const writes = createMusicDataPlatformSourceOfTruthWriteCommands({ db, now });
    await writes.identity.upsertSourceRecord({ entity: providerSource });
    const materialRef = await createMaterialRefFactory({ nextOpaqueId: () => `provider_${sourceRef.id}` })
      .createMaterialRef("recording");
    await writes.identity.upsertMaterialRecord({ materialRef, kind: "recording" });
    await writes.identity.bindSourceToMaterial({
      sourceRef,
      materialRef,
    });
    return materialRef;
  });
}

async function tableCount(context: MusicDatabaseContext, table: string): Promise<number> {
  return (await context.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`))?.count ?? 0;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(code: string, message: string): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      area: "music_data_platform",
      retryable: false,
    },
  };
}

function assertOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function md5(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

function okSource(bytes: Uint8Array, overrides: Partial<DownloadSource> = {}): DownloadSource {
  return {
    url: "http://test.local/audio.flac",
    container: "flac",
    sizeBytes: bytes.length,
    md5: md5(bytes),
    ...overrides,
  };
}

function sourceKeyForPath(sourceRef: Ref): string {
  return refKey(sourceRef).replace(/:/gu, "-");
}

function relativeTrackPathFor(sourceRef: Ref, ext = "flac"): string {
  const sourceKey = sourceKeyForPath(sourceRef);
  return `downloads/Provider Artist/Provider Album/07 - NetEase ${sourceRef.id} [${sourceKey}].${ext}`;
}

function finalTrackPath(rootDir: string, sourceRef: Ref = trackRef, ext = "flac"): string {
  return `${rootDir}/${relativeTrackPathFor(sourceRef, ext)}`;
}

function fallbackRelativeTrackPath(sourceRef: Ref, ext = "flac"): string {
  const sourceKey = sourceKeyForPath(sourceRef);
  return `downloads/Unknown Artist/Unknown Album/00 - ${sourceKey} [${sourceKey}].${ext}`;
}

function unknownAlbumRelativeTrackPath(sourceRef: Ref, title: string, ext = "flac"): string {
  return `downloads/Unknown Artist/Unknown Album/00 - ${title} [${sourceKeyForPath(sourceRef)}].${ext}`;
}

function localizeJob(input: {
  jobId?: string;
  sourceRef?: Ref;
  preferredBitrate?: number;
} = {}) {
  return {
    jobId: input.jobId ?? "job-1",
    jobType: LOCALIZE_PROVIDER_SOURCE_JOB_TYPE,
    payload: {
      sourceRef: input.sourceRef ?? trackRef,
      targetPolicyVersion: LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION,
      ...(input.preferredBitrate === undefined ? {} : { preferredBitrate: input.preferredBitrate }),
    },
    signal: new AbortController().signal,
  };
}

function expectMusicDataPlatformError(code: string): (error: unknown) => boolean {
  return (error): boolean => error instanceof MusicDataPlatformError && error.code === code;
}

// --- submit command: payload identity stays compact and idempotency key includes policy facts ---
{
  const backgroundWork = createFakeBackgroundWork();
  const command = createLocalizeProviderSourceCommand({ backgroundWork });
  const runAfter = new Date("2026-06-20T13:00:00.000Z");
  const submitted = assertOk(await command.submit({
    sourceRef: {
      ...trackRef,
      label: "display label should not enter job payload",
    },
    preferredBitrate: 320000,
    runAfter,
  }));

  assert.deepEqual(submitted, {
    jobId: "queued-localize-job",
    submission: "created",
    jobType: LOCALIZE_PROVIDER_SOURCE_JOB_TYPE,
    targetPolicyVersion: LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION,
  });
  assert.deepEqual(backgroundWork.calls, [
    {
      jobType: LOCALIZE_PROVIDER_SOURCE_JOB_TYPE,
      payload: {
        sourceRef: trackRef,
        targetPolicyVersion: LOCALIZE_PROVIDER_SOURCE_TARGET_POLICY_VERSION,
        preferredBitrate: 320000,
      },
      idempotencyKey: "source:source_netease:track:1001|bitrate:320000|targetPolicy:1",
      runAfter,
    },
  ]);
  assert.equal(localizeProviderSourceIdempotencyKey({ sourceRef: trackRef }), "source:source_netease:track:1001|bitrate:provider_default|targetPolicy:1");
}

// --- submit command rejects non-provider or non-track sourceRefs before queue submission ---
{
  const backgroundWork = createFakeBackgroundWork();
  const command = createLocalizeProviderSourceCommand({ backgroundWork });

  const album = await command.submit({ sourceRef: albumRef });
  assert.equal(album.ok, false);
  if (!album.ok) {
    assert.equal(album.error.code, "music_data.localize_no_audio_stream");
  }

  const local = await command.submit({
    sourceRef: { namespace: "source_local", kind: "track", id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  });
  assert.equal(local.ok, false);
  if (!local.ok) {
    assert.equal(local.error.code, "music_data.localize_provider_unresolved");
  }

  assert.equal(backgroundWork.calls.length, 0);
}

// --- handler: provider source -> staged download -> root/path Local Source bound to material ---
{
  const database = await initializedDatabase();
  const materialRef = await seedProviderMaterial(database, trackRef);
  const audio = new Uint8Array([1, 2, 3, 5, 8, 13]);
  const expectedRelativePath = relativeTrackPathFor(trackRef);
  const expectedFinalPath = finalTrackPath(localRoot, trackRef);
  const files = createMemoryLocalizeFileStore();
  const provider = createFakeDownloadSourceProvider(() => ok(okSource(audio)));
  const handler = createLocalizeProviderSourceJobHandler({
    identityRead: createIdentityReadPort({ db: database.context() }),
    downloadSourceProvider: provider,
    localSourceCommand: createLocalSourceCommand({
      database,
      materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => "unused" }),
      now: () => now,
    }),
    localSourcesRootDir: localRoot,
    fileStore: files.fileStore,
    fetch: (async () => new Response(audio)) as typeof fetch,
  });

  await handler(localizeJob({ preferredBitrate: 320000 }));

  assert.deepEqual(provider.calls, [
    {
      providerId: "netease",
      sourceRef: trackRef,
      preferredBitrate: 320000,
    },
  ]);
  assert.deepEqual(files.files.get(expectedFinalPath), audio);
  assert.equal(expectedFinalPath.includes(md5(audio)), false);
  assert.deepEqual([...files.files.keys()].filter((path) => path.includes("/.staging/")), []);

  const repositories = createIdentityRepositories({ db: database.context() });
  const localSourceRef = createLocalSourceRef({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: expectedRelativePath,
    kind: "track",
  });
  const localSourceRecord = await repositories.sourceRecords.get({ sourceRef: localSourceRef });
  assert.equal(localSourceRecord?.entity.origin, "local_file");
  if (localSourceRecord?.entity.origin !== "local_file") {
    throw new Error("expected local file source");
  }
  if (localSourceRecord.entity.kind !== "track") {
    throw new Error("expected local track source");
  }
  assert.equal(localSourceRecord.entity.rootId, MAIN_LOCAL_SOURCE_ROOT_ID);
  assert.equal(localSourceRecord.entity.relativePath, expectedRelativePath);
  assert.equal(localSourceRecord.entity.contentMd5, md5(audio));
  assert.equal(localSourceRecord.entity.label, "NetEase 1001");
  assert.equal(localSourceRecord.entity.title, "NetEase 1001");
  assert.deepEqual(localSourceRecord.entity.artistLabels, ["Provider Artist", "Featured Artist"]);
  assert.deepEqual(localSourceRecord.entity.artistSourceRefs?.map(refKey), [
    "source_netease:artist:artist_1",
    "source_netease:artist:artist_2",
  ]);
  assert.equal(localSourceRecord.entity.albumLabel, "Provider Album");
  assert.equal(localSourceRecord.entity.albumSourceRef === undefined ? undefined : refKey(localSourceRecord.entity.albumSourceRef), "source_netease:album:album_1");
  assert.deepEqual(localSourceRecord.entity.trackPosition, {
    discNumber: "1",
    trackNumber: 7,
    trackCount: 12,
  });
  assert.equal(localSourceRecord.entity.durationMs, 243000);
  assert.deepEqual(localSourceRecord.entity.versionInfo, {
    label: "Provider Version",
    tags: ["remastered"],
  });
  assert.equal(localSourceRecord.entity.providerUrl, undefined);
  assert.equal(localSourceRecord.entity.availabilityHint, undefined);

  const localBinding = await repositories.sourceMaterialBindings.findMaterialForSource({
    sourceRef: localSourceRef,
  });
  assert.equal(localBinding === undefined ? undefined : refKey(localBinding.materialRef), refKey(materialRef));

  const materialRecord = await repositories.materialRecords.get({ materialRef });
  assert.deepEqual(materialRecord?.entity.sourceRefs.map(refKey).sort(), [
    refKey(localSourceRef),
    refKey(trackRef),
  ].sort());

  await handler(localizeJob({ jobId: "job-2" }));
  assert.deepEqual(files.files.get(expectedFinalPath), audio);
  assert.deepEqual([...files.files.keys()].filter((path) => path.includes("/.staging/")), []);
  assert.equal(await tableCount(database.context(), "source_records"), 2);
  assert.equal(await tableCount(database.context(), "source_material_bindings"), 2);

  await database.close();
}

// --- handler rejects corrupt provider source metadata before download/local registration ---
{
  const materialRef: Ref = { namespace: "material", kind: "recording", id: "m_corrupt_source" };
  const provider = createFakeDownloadSourceProvider(() => ok(okSource(new Uint8Array([8, 8, 8]))));
  const localSource = createFakeLocalSourceCommand(() => ok({ materialRef, created: true }));
  const handler = createLocalizeProviderSourceJobHandler({
    identityRead: {
      async findMaterialForSource() {
        return {
          sourceRef: trackRef,
          materialRef,
          createdAt: now,
          updatedAt: now,
        };
      },
      async getSourceRecord() {
        return {
          entity: {
            origin: "provider",
            sourceRef: trackRef,
            providerId: "netease",
            providerEntityId: trackRef.id,
            kind: "track",
            label: "",
          } as unknown as SourceTrack,
          lookup: {
            origin: "provider",
            providerId: "netease",
            providerEntityId: trackRef.id,
            kind: "track",
          },
          createdAt: now,
          updatedAt: now,
        };
      },
    },
    downloadSourceProvider: provider,
    localSourceCommand: localSource,
    localSourcesRootDir: localRoot,
    fileStore: createMemoryLocalizeFileStore().fileStore,
    fetch: (async () => new Response(new Uint8Array([8, 8, 8]))) as typeof fetch,
  });

  await assert.rejects(
    () => handler(localizeJob()),
    expectMusicDataPlatformError("music_data.record_kind_mismatch"),
  );
  assert.equal(provider.calls.length, 0);
  assert.equal(localSource.calls.length, 0);
}

// --- handler refuses an existing unregistered final path regardless of content ---
{
  const database = await initializedDatabase();
  await seedProviderMaterial(database, trackRef);
  const audio = new Uint8Array([21, 34, 55]);
  const finalPath = finalTrackPath(localRoot, trackRef);
  const files = createMemoryLocalizeFileStore(new Map([
    [finalPath, audio],
  ]));
  const provider = createFakeDownloadSourceProvider(() => ok(okSource(audio)));
  const handler = createLocalizeProviderSourceJobHandler({
    identityRead: createIdentityReadPort({ db: database.context() }),
    downloadSourceProvider: provider,
    localSourceCommand: createLocalSourceCommand({
      database,
      materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => "unused" }),
      now: () => now,
    }),
    localSourcesRootDir: localRoot,
    fileStore: files.fileStore,
    fetch: (async () => new Response(audio)) as typeof fetch,
  });

  await assert.rejects(
    () => handler(localizeJob()),
    expectMusicDataPlatformError("music_data.localize_final_path_collision"),
  );
  assert.deepEqual(files.files.get(finalPath), audio);
  assert.deepEqual([...files.files.keys()].filter((path) => path.includes("/.staging/")), []);
  assert.equal(await tableCount(database.context(), "source_records"), 1);

  await database.close();
}

// --- handler removes its final candidate when createLocalSource returns a declared failure ---
{
  const materialRef: Ref = { namespace: "material", kind: "recording", id: "m_fake" };
  const audio = new Uint8Array([3, 1, 4, 1, 5]);
  const expectedRelativePath = unknownAlbumRelativeTrackPath(trackRef, "Provider Track");
  const finalPath = `${localRoot}/${expectedRelativePath}`;
  const files = createMemoryLocalizeFileStore();
  const provider = createFakeDownloadSourceProvider(() => ok(okSource(audio)));
  const localSource = createFakeLocalSourceCommand(() =>
    fail("music_data.material_not_found", "missing material"));
  const handler = createLocalizeProviderSourceJobHandler({
    identityRead: {
      async findMaterialForSource() {
        return {
          sourceRef: trackRef,
          materialRef,
          createdAt: now,
          updatedAt: now,
        };
      },
      async getSourceRecord() {
        return {
          entity: {
            origin: "provider",
            sourceRef: trackRef,
            providerId: "netease",
            providerEntityId: trackRef.id,
            kind: "track",
            label: "Provider Track",
            title: "Provider Track",
          },
          lookup: {
            origin: "provider",
            providerId: "netease",
            providerEntityId: trackRef.id,
            kind: "track",
          },
          createdAt: now,
          updatedAt: now,
        };
      },
    },
    downloadSourceProvider: provider,
    localSourceCommand: localSource,
    localSourcesRootDir: localRoot,
    fileStore: files.fileStore,
    fetch: (async () => new Response(audio)) as typeof fetch,
  });

  await assert.rejects(
    () => handler(localizeJob()),
    expectMusicDataPlatformError("music_data.localize_local_source_registration_failed"),
  );
  assert.equal(localSource.calls.length, 1);
  assert.deepEqual(localSource.calls[0], {
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: expectedRelativePath,
    contentMd5: md5(audio),
    kind: "track",
    materialRef,
    descriptiveMetadata: {
      label: "Provider Track",
      title: "Provider Track",
    },
  });
  assert.equal(files.files.has(finalPath), false);
  assert.deepEqual([...files.files.keys()].filter((path) => path.includes("/.staging/")), []);
}

// --- handler uses explicit path fallbacks for missing artist/album/title facts ---
{
  const materialRef: Ref = { namespace: "material", kind: "recording", id: "m_fallbacks" };
  const audio = new Uint8Array([6, 2, 6]);
  const expectedRelativePath = fallbackRelativeTrackPath(trackRef);
  const expectedFinalPath = `${localRoot}/${expectedRelativePath}`;
  const files = createMemoryLocalizeFileStore();
  const provider = createFakeDownloadSourceProvider(() => ok(okSource(audio)));
  const localSource = createFakeLocalSourceCommand(() => ok({ materialRef, created: true }));
  const handler = createLocalizeProviderSourceJobHandler({
    identityRead: {
      async findMaterialForSource() {
        return {
          sourceRef: trackRef,
          materialRef,
          createdAt: now,
          updatedAt: now,
        };
      },
      async getSourceRecord() {
        return {
          entity: {
            origin: "provider",
            sourceRef: trackRef,
            providerId: "netease",
            providerEntityId: trackRef.id,
            kind: "track",
            label: "Provider Track",
          } as SourceTrack,
          lookup: {
            origin: "provider",
            providerId: "netease",
            providerEntityId: trackRef.id,
            kind: "track",
          },
          createdAt: now,
          updatedAt: now,
        };
      },
    },
    downloadSourceProvider: provider,
    localSourceCommand: localSource,
    localSourcesRootDir: localRoot,
    fileStore: files.fileStore,
    fetch: (async () => new Response(audio)) as typeof fetch,
  });

  await handler(localizeJob());
  assert.deepEqual(files.files.get(expectedFinalPath), audio);
  assert.equal(localSource.calls[0]?.relativePath, expectedRelativePath);
  assert.equal(localSource.calls[0]?.descriptiveMetadata?.title, sourceKeyForPath(trackRef));
}

// --- handler treats missing Local Source root config as a declared localize config error ---
{
  assert.throws(() => createLocalizeProviderSourceJobHandler({
    identityRead: {
      async findMaterialForSource() {
        return undefined;
      },
      async getSourceRecord() {
        return undefined;
      },
    },
    downloadSourceProvider: createFakeDownloadSourceProvider(() => fail("unused", "unused")),
    localSourceCommand: createFakeLocalSourceCommand(() => fail("unused", "unused")),
    localSourcesRootDir: "",
    fileStore: createMemoryLocalizeFileStore().fileStore,
    fetch: (async () => new Response(new Uint8Array())) as typeof fetch,
  }), expectMusicDataPlatformError("music_data.localize_config_missing"));
}
