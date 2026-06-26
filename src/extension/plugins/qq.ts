// QQ Music provider plugin. Same shape as ncm.ts (factory + two slots + bridge
// HTTP helper), talking to a sibling L-1124/QQMusicApi FastAPI bridge
// (default http://127.0.0.1:8080). The bridge holds the login credential
// (accounts.toml + global-default config); the plugin is stateless, mirroring
// the NCM/ncmapi split.
//
// This commit lands the skeleton + search (anonymous, verified against the live
// bridge). Audio/download/library/lyrics/picture are stubbed with honest
// empty/failure results and tracked as follow-ups — see TODOs below.
import { isRecord } from "../type_guards.js";
import { isRefComponentSafe, type Ref, type Result, type StageError } from "../../contracts/kernel.js";
import type {
  DownloadSource,
  PlayableLink,
  PlatformLibraryCandidate,
  PlatformLibraryProvider,
  PlatformLibraryReadInput,
  PlatformLibraryReadResult,
  ProviderMaterialCandidate,
  SongLyrics,
  SourceAlbum,
  SourceArtist,
  SourceEntityKind,
  SourceProvider,
  SourceTrack,
} from "../../contracts/music_data_platform.js";
import { failExtension, ok } from "../errors.js";
import type { MineMusicPlugin } from "../plugin_runtime.js";
import { platformLibraryProviderSlot } from "../platform_library_provider_slot.js";
import { sourceProviderSlot } from "../source_provider_slot.js";
import { qrcDecrypt } from "./qq_qrc_decrypt.js";
import { extractVersionInfo } from "./version_extraction.js";
import {
  fetchWithTimeout,
  isFetchImpl,
  providerUnavailable,
  readBoundedJson,
  resolveProviderHttpBounds,
  type ProviderHttpProfile,
} from "./provider_http.js";

export const qqPluginId = "minemusic.qq";
export const qqProviderId = "qq";
export const defaultQqBaseUrl = "http://127.0.0.1:8080";

export type QqPluginConfig = {
  baseUrl?: string;
  fetch?: typeof fetch;
  /**
   * Per-request timeout in milliseconds. Defaults to defaultProviderRequestTimeoutMs();
   * a hung or unresponsive QQ bridge is aborted and surfaced as
   * extension.qq_provider_unavailable (retryable). (#88)
   */
  requestTimeoutMs?: number;
  /**
   * Per-response byte bound. Defaults to defaultProviderMaxResponseBytes(); a
   * response body that exceeds it is streamed-cancelled and surfaced as
   * extension.qq_malformed_response so a misbehaving bridge cannot OOM the
   * process. (#88)
   */
  maxResponseBytes?: number;
};

const QQ_NAMESPACE = "source_qq";
const QQ_SEARCH_LIMIT = 10;

// QQ search/search_by_type uses search_type 0/1/2 (song/singer/album).
type QqSearchTarget = { kind: SourceEntityKind; type: "0" | "1" | "2" };

const qqSearchTargets: Record<SourceEntityKind, QqSearchTarget> = {
  track: { kind: "track", type: "0" },
  artist: { kind: "artist", type: "1" },
  album: { kind: "album", type: "2" },
};

// Loose shapes for QQ API payloads (every field optional; the plugin reads
// defensively and fails loudly on structurally malformed responses).
type QqSinger = { id?: unknown; mid?: unknown; name?: unknown; title?: unknown; pmid?: unknown };
type QqAlbum = { id?: unknown; mid?: unknown; name?: unknown; title?: unknown; time_public?: unknown; pubtime?: unknown; pmid?: unknown; singer_list?: unknown; v_singer?: unknown };
type QqSong = { id?: unknown; mid?: unknown; name?: unknown; title?: unknown; singer?: unknown; album?: unknown; interval?: unknown };

export function createQqPlugin(config: QqPluginConfig = {}): MineMusicPlugin {
  const sourceProvider = createQqSourceProvider(config);
  const platformLibraryProvider = createQqPlatformLibraryProvider(config);

  return {
    manifest: {
      id: qqPluginId,
      displayName: "QQ Music",
      version: "0.1.0",
      minCoreVersion: "0.1.0",
      capabilities: [sourceProviderSlot.id, platformLibraryProviderSlot.id],
    },
    activate(ctx) {
      const sourceRegistration = ctx.register(sourceProviderSlot, {
        key: qqProviderId,
        value: sourceProvider,
      });

      if (!sourceRegistration.ok) {
        return sourceRegistration;
      }

      return ctx.register(platformLibraryProviderSlot, {
        key: qqProviderId,
        value: platformLibraryProvider,
      });
    },
  };
}

function createQqSourceProvider(config: unknown): SourceProvider {
  return {
    descriptor: {
      providerId: qqProviderId,
      label: "QQ Music",
      capabilities: ["search", "playable_links", "download_source", "entity_picture_url", "song_lyrics"],
    },
    async search({ query }) {
      return searchQq(config, query);
    },
    async getPlayableLinks({ sourceRef }) {
      return readQqPlayableLinks(config, sourceRef);
    },
    async getDownloadSource({ sourceRef }) {
      return readQqDownloadSource(config, sourceRef);
    },
    async getEntityPictureUrl({ sourceRef }) {
      return readQqEntityPictureUrl(config, sourceRef);
    },
    async getSongLyrics({ sourceRef }) {
      return readQqSongLyrics(config, sourceRef);
    },
  };
}

function createQqPlatformLibraryProvider(config: unknown): PlatformLibraryProvider {
  return {
    descriptor: {
      providerId: qqProviderId,
      label: "QQ Music",
      libraryKinds: [
        "saved_source_track",
        "saved_source_album",
        "followed_source_artist",
      ],
      accountRequired: true,
    },
    async read(input: PlatformLibraryReadInput): Promise<Result<PlatformLibraryReadResult>> {
      switch (input.kind) {
        case "saved_source_track":
          return readQqSavedTracks(config, input);
        case "saved_source_album":
          return readQqSavedAlbums(config, input);
        case "followed_source_artist":
          return readQqFollowedArtists(config, input);
      }
    },
  };
}

// --- search ----------------------------------------------------------------

async function searchQq(
  config: unknown,
  query: { text: string; targetKinds?: readonly SourceEntityKind[]; limit?: number; offset?: number },
): Promise<Result<readonly ProviderMaterialCandidate[]>> {
  const resolved = resolveSingleSearchTarget(query.targetKinds);

  if (!resolved.ok) {
    return resolved;
  }

  const kind = resolved.value;
  const num = query.limit ?? QQ_SEARCH_LIMIT;

  if (num <= 0) {
    return ok([]);
  }

  const target = qqSearchTargets[kind];
  const page = Math.floor((query.offset ?? 0) / num) + 1;
  const searched = await requestQqPath(config, "/search/search_by_type", {
    keyword: query.text.trim(),
    search_type: target.type,
    page: String(page),
    num: String(num),
    // QQ highlights matched terms with <em>... by default; we want plain text.
    highlight: "false",
  });

  if (!searched.ok) {
    return searched;
  }

  return mapQqSearchPayload(kind, searched.value);
}

function mapQqSearchPayload(
  kind: SourceEntityKind,
  payload: unknown,
): Result<readonly ProviderMaterialCandidate[]> {
  const issue = issueFromQqPayload(payload);

  if (issue !== undefined) {
    return issue;
  }

  const data = isRecord(payload) ? payload.data : undefined;

  if (!isRecord(data)) {
    return failExtension(
      "extension.qq_malformed_response",
      "QQ provider search response did not include data.",
    );
  }

  switch (kind) {
    case "track":
      return mapQqPayloadArray(data.song, "data.song", toQqTrackSearchCandidate);
    case "album":
      return mapQqPayloadArray(data.album, "data.album", toQqAlbumSearchCandidate);
    case "artist":
      return mapQqPayloadArray(data.singer, "data.singer", toQqArtistSearchCandidate);
  }
}

function mapQqPayloadArray<T extends Record<string, unknown>, C>(
  value: unknown,
  path: string,
  mapper: (value: T, path: string) => Result<C | undefined>,
): Result<readonly C[]> {
  if (!Array.isArray(value)) {
    return failExtension(
      "extension.qq_malformed_response",
      `QQ provider response did not include ${path}.`,
    );
  }

  const candidates: C[] = [];

  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;

    if (!isRecord(item)) {
      return failExtension(
        "extension.qq_malformed_response",
        `QQ provider response ${itemPath} was not an object.`,
      );
    }

    const mapped = mapper(item as T, itemPath);

    if (!mapped.ok) {
      return mapped;
    }

    if (mapped.value !== undefined) {
      candidates.push(mapped.value);
    }
  }

  return ok(candidates);
}

function toQqTrackSearchCandidate(song: QqSong, path: string): Result<ProviderMaterialCandidate | undefined> {
  if (toNonEmptyString(song.mid) === undefined) {
    return ok(undefined);
  }

  if (toNonEmptyString(song.name) === undefined) {
    return failExtension(
      "extension.qq_malformed_response",
      `QQ provider response ${path} did not include a usable track title.`,
    );
  }

  return ok(toQqTrackCandidate(song));
}

function toQqAlbumSearchCandidate(album: QqAlbum, path: string): Result<ProviderMaterialCandidate | undefined> {
  if (toNonEmptyString(album.mid) === undefined) {
    return ok(undefined);
  }

  if (toNonEmptyString(album.name) === undefined) {
    return failExtension(
      "extension.qq_malformed_response",
      `QQ provider response ${path} did not include a usable album title.`,
    );
  }

  return ok(toQqAlbumCandidate(album));
}

function toQqArtistSearchCandidate(singer: QqSinger, path: string): Result<ProviderMaterialCandidate | undefined> {
  const mid = toNonEmptyString(singer.mid);
  const name = toNonEmptyString(singer.name) ?? toNonEmptyString(singer.title);

  if (mid === undefined) {
    return ok(undefined);
  }

  if (name === undefined) {
    return failExtension(
      "extension.qq_malformed_response",
      `QQ provider response ${path} did not include a usable artist name.`,
    );
  }

  return ok(toQqArtistCandidate(singer));
}

function toQqTrackCandidate(song: QqSong): ProviderMaterialCandidate | undefined {
  const mid = toNonEmptyString(song.mid);
  const title = toNonEmptyString(song.name);

  if (mid === undefined || title === undefined) {
    return undefined;
  }

  const artists = qqArtists(song.singer);
  const album = isRecord(song.album) ? (song.album as QqAlbum) : undefined;
  const albumRef = album === undefined ? undefined : qqAlbumSourceRef(album);
  const albumLabel = album === undefined ? undefined : toNonEmptyString(album.name);
  const label = labelWithArtists(title, artists.labels);
  const duration = qqDurationMs(song.interval);
  const versionInfo = extractVersionInfo([song.name, song.title]);
  const sourceEntity: SourceTrack = {
    kind: "track",
    sourceRef: {
      namespace: QQ_NAMESPACE,
      kind: "track",
      id: mid,
      label,
    },
    origin: "provider",
    providerId: qqProviderId,
    providerEntityId: mid,
    label,
    title,
    ...(artists.labels.length === 0 ? {} : { artistLabels: artists.labels }),
    ...(artists.refs.length === 0 ? {} : { artistSourceRefs: artists.refs }),
    ...(albumLabel === undefined ? {} : { albumLabel }),
    ...(albumRef === undefined ? {} : { albumSourceRef: albumRef }),
    ...(duration === undefined ? {} : { durationMs: duration }),
    ...(versionInfo === undefined ? {} : { versionInfo }),
    providerUrl: qqTrackUrl(mid),
    availabilityHint: "playable",
  };

  return { sourceEntity };
}

function toQqAlbumCandidate(album: QqAlbum): ProviderMaterialCandidate | undefined {
  const mid = toNonEmptyString(album.mid);
  const title = toNonEmptyString(album.name);

  if (mid === undefined || title === undefined) {
    return undefined;
  }

  const artists = qqArtists(album.singer_list);
  const label = labelWithArtists(title, artists.labels);
  const releaseDate = toNonEmptyString(album.time_public);
  const versionInfo = extractVersionInfo([album.name, album.title]);
  const sourceEntity: SourceAlbum = {
    kind: "album",
    sourceRef: {
      namespace: QQ_NAMESPACE,
      kind: "album",
      id: mid,
      label,
    },
    origin: "provider",
    providerId: qqProviderId,
    providerEntityId: mid,
    label,
    title,
    ...(artists.labels.length === 0 ? {} : { artistLabels: artists.labels }),
    ...(artists.refs.length === 0 ? {} : { artistSourceRefs: artists.refs }),
    ...(releaseDate === undefined ? {} : { releaseDate }),
    ...(versionInfo === undefined ? {} : { versionInfo }),
    providerUrl: qqAlbumUrl(mid),
    availabilityHint: "unknown",
  };

  return { sourceEntity };
}

function toQqArtistCandidate(singer: QqSinger): ProviderMaterialCandidate | undefined {
  const mid = toNonEmptyString(singer.mid);
  const name = toNonEmptyString(singer.name) ?? toNonEmptyString(singer.title);

  if (mid === undefined || name === undefined) {
    return undefined;
  }

  const sourceEntity: SourceArtist = {
    kind: "artist",
    sourceRef: {
      namespace: QQ_NAMESPACE,
      kind: "artist",
      id: mid,
      label: name,
    },
    origin: "provider",
    providerId: qqProviderId,
    providerEntityId: mid,
    label: name,
    name,
    providerUrl: qqArtistUrl(mid),
    availabilityHint: "unknown",
  };

  return { sourceEntity };
}

function qqArtists(singerValue: unknown): { labels: string[]; refs: Ref[] } {
  const labels: string[] = [];
  const refs: Ref[] = [];

  if (!Array.isArray(singerValue)) {
    return { labels, refs };
  }

  for (const item of singerValue) {
    if (!isRecord(item)) {
      continue;
    }

    const name = toNonEmptyString(item.name) ?? toNonEmptyString(item.title);

    if (name === undefined) {
      continue;
    }

    labels.push(name);

    const mid = toNonEmptyString(item.mid);

    if (mid !== undefined && isRefComponentSafe(mid)) {
      refs.push({ namespace: QQ_NAMESPACE, kind: "artist", id: mid, label: name });
    }
  }

  return { labels, refs };
}

function qqAlbumSourceRef(album: QqAlbum): Ref | undefined {
  const mid = toNonEmptyString(album.mid);
  const name = toNonEmptyString(album.name);

  if (mid === undefined || name === undefined || !isRefComponentSafe(mid)) {
    return undefined;
  }

  return { namespace: QQ_NAMESPACE, kind: "album", id: mid, label: name };
}

function qqDurationMs(interval: unknown): number | undefined {
  if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0) {
    return undefined;
  }

  // QQ reports track length in seconds.
  return Math.round(interval * 1000);
}

function labelWithArtists(title: string, artists: readonly string[]): string {
  return artists.length === 0 ? title : `${title} — ${artists.join(", ")}`;
}

function qqTrackUrl(mid: string): string {
  return `https://y.qq.com/n/ryqq/songDetail/${mid}`;
}

function qqAlbumUrl(mid: string): string {
  return `https://y.qq.com/n/ryqq/albumDetail/${mid}`;
}

function qqArtistUrl(mid: string): string {
  return `https://y.qq.com/n/ryqq/singer/${mid}`;
}

// --- bridge HTTP helper ----------------------------------------------------

// #88 HTTP bounds (timeout + response size cap) for the QQ bridge. The generic
// bound/abort/parse mechanics live in ./provider_http.ts; this profile only fixes
// the QQ error codes and label so timeouts/oversized responses map onto the
// existing extension.qq_* codes (no new codes).
const qqHttpProfile = {
  providerLabel: "QQ",
  invalidConfigCode: "extension.qq_invalid_config",
  malformedCode: "extension.qq_malformed_response",
  providerUnavailableCode: "extension.qq_provider_unavailable",
} as const satisfies ProviderHttpProfile;

async function requestQqPath(
  config: unknown,
  path: string,
  params: Record<string, string>,
): Promise<Result<unknown>> {
  if (!isRecord(config)) {
    return failExtension(
      "extension.qq_invalid_config",
      "QQ plugin config must be an object.",
    );
  }

  const bounds = resolveProviderHttpBounds(config, qqHttpProfile);

  if (!bounds.ok) {
    return bounds;
  }

  const configuredFetch = config.fetch;
  const baseUrl = config.baseUrl ?? defaultQqBaseUrl;
  const urlResult = qqPathUrl(baseUrl, path);

  if (!urlResult.ok) {
    return urlResult;
  }

  if (configuredFetch !== undefined && !isFetchImpl(configuredFetch)) {
    return failExtension(
      "extension.qq_invalid_config",
      "QQ plugin fetch config must be a function.",
    );
  }

  const fetchJson: typeof fetch = configuredFetch ?? fetch;

  const url = urlResult.value;

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;

  try {
    response = await fetchWithTimeout(fetchJson, url, bounds.value.timeoutMs);
  } catch (error) {
    return providerUnavailable(url.origin, error, qqHttpProfile);
  }

  if (!response.ok) {
    if (response.status === 401) {
      return failExtension(
        "extension.qq_account_unresolved",
        "QQ provider returned HTTP 401 (no login credential available).",
        undefined,
        true,
      );
    }

    return failExtension(
      "extension.qq_provider_unavailable",
      `QQ provider returned HTTP ${response.status}.`,
      undefined,
      true,
    );
  }

  const payload = await readBoundedJson(response, bounds.value.maxBytes, qqHttpProfile, url.origin);

  if (!payload.ok) {
    return payload;
  }

  const issue = issueFromQqPayload(payload.value);

  return issue ?? ok(payload.value);
}

function qqPathUrl(baseUrl: unknown, path: string): Result<URL> {
  if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
    return failExtension(
      "extension.qq_invalid_config",
      "QQ plugin baseUrl config must be a non-empty URL string.",
    );
  }

  try {
    return ok(new URL(path, baseUrl));
  } catch {
    return failExtension(
      "extension.qq_invalid_config",
      "QQ plugin baseUrl config must be a valid URL.",
    );
  }
}

// L-1124 bridge wraps every response in { code: 0|-1, msg, data }. code !== 0
// is a provider-level error; an unreachable/invalid payload is malformed.
function issueFromQqPayload(payload: unknown): Result<never> | undefined {
  if (!isRecord(payload)) {
    return failExtension(
      "extension.qq_malformed_response",
      "QQ provider response was not an object.",
    );
  }

  const code = payload.code;

  if (typeof code === "number" && code !== 0) {
    const msg = toNonEmptyString(payload.msg);
    return failExtension(
      "extension.qq_provider_response_error",
      msg ?? `QQ provider returned code ${code}.`,
    );
  }

  return undefined;
}

// --- audio: playable_links + download_source -------------------------------
//
// QQ serves audio as a relative path (purl, e.g. "M500xxx.mp3?vkey=...") that
// must be joined with a CDN sip root from /song/get_cdn_dispatch. The purl
// prefix (M500/M800/F000/...) names the quality tier and dictates container,
// bitrate, and which size_N field of /song/query_song carries the byte length.
// No md5 is returned by QQ; size is filled from query_song (verified to match
// the CDN Content-Length byte-for-byte).

type QqAudioTier = {
  container: string;
  bitrate?: number;
  sizeField: "size_128mp3" | "size_320mp3" | "size_flac";
};

type QqResolvedAudio = {
  url: string;
  tier: QqAudioTier;
};

const QQ_SIP_FALLBACK = "https://isure.stream.qqmusic.qq.com/";

async function readQqPlayableLinks(
  config: unknown,
  sourceRef: Ref,
): Promise<Result<readonly PlayableLink[]>> {
  if (sourceRef.kind !== "track") {
    return ok([]);
  }

  const resolved = await resolveQqAudio(config, sourceRef.id);

  if (!resolved.ok) {
    return resolved;
  }

  if (resolved.value === undefined) {
    return ok([]);
  }

  return ok([{ url: resolved.value.url, label: "QQ Music" }]);
}

async function readQqDownloadSource(
  config: unknown,
  sourceRef: Ref,
): Promise<Result<DownloadSource>> {
  if (sourceRef.kind !== "track") {
    return failExtension(
      "extension.qq_no_audio_stream",
      "QQ provider can only resolve a download source for tracks.",
    );
  }

  const resolved = await resolveQqAudio(config, sourceRef.id);

  if (!resolved.ok) {
    return resolved;
  }

  if (resolved.value === undefined) {
    return failExtension(
      "extension.qq_no_download_source",
      "QQ provider could not resolve a downloadable file URL for this track (no copyright or credential unavailable).",
      undefined,
      true,
    );
  }

  // Best-effort size from query_song; a missing/unreadable size is not fatal
  // (the download pipeline treats sizeBytes as optional).
  const sizeBytesResult = await readQqFileSize(config, sourceRef.id, resolved.value.tier.sizeField);
  const sizeBytes = sizeBytesResult.ok ? sizeBytesResult.value : undefined;

  const tier = resolved.value.tier;

  return ok({
    url: resolved.value.url,
    container: tier.container,
    ...(tier.bitrate === undefined ? {} : { bitrate: tier.bitrate }),
    ...(sizeBytes === undefined ? {} : { sizeBytes }),
  });
}

async function resolveQqAudio(
  config: unknown,
  mid: string,
): Promise<Result<QqResolvedAudio | undefined>> {
  const urlPayload = await requestQqPath(config, `/song/${mid}/url`, {});

  if (!urlPayload.ok) {
    return urlPayload;
  }

  const data = isRecord(urlPayload.value) ? urlPayload.value.data : undefined;
  const items = isRecord(data) ? data.midurlinfo : undefined;
  const entry = Array.isArray(items)
    ? items.find(
        (item): item is Record<string, unknown> =>
          isRecord(item) && typeof item.purl === "string" && item.purl !== "",
      )
    : undefined;

  if (entry === undefined) {
    // result != 0 (no permission / VIP-only) or empty purl across all entries
    // is the honest "no stream" signal — mirrors ncm's readNcmSongUrl discipline.
    return ok(undefined);
  }

  const purl = entry.purl as string;
  const sip = await resolveQqSip(config);

  return ok({
    url: `${sip}${purl}`,
    tier: qqTierFromPurl(purl),
  });
}

async function resolveQqSip(config: unknown): Promise<string> {
  const dispatchPayload = await requestQqPath(config, "/song/get_cdn_dispatch", {});

  if (dispatchPayload.ok && isRecord(dispatchPayload.value)) {
    const dispatchData = dispatchPayload.value.data;
    const sips = isRecord(dispatchData) ? dispatchData.sip : undefined;

    if (Array.isArray(sips)) {
      const first = sips.find((item): item is string => typeof item === "string" && item.length > 0);

      if (first !== undefined) {
        return first.endsWith("/") ? first : `${first}/`;
      }
    }
  }

  // dispatch failed: fall back to the documented backup CDN root.
  return QQ_SIP_FALLBACK;
}

async function readQqFileSize(
  config: unknown,
  mid: string,
  sizeField: QqAudioTier["sizeField"],
): Promise<Result<number | undefined>> {
  const payload = await requestQqPath(config, "/song/query_song", { value: mid });

  if (!payload.ok) {
    return payload;
  }

  const data = isRecord(payload.value) ? payload.value.data : undefined;
  const tracks = isRecord(data) ? data.tracks : undefined;
  const track = Array.isArray(tracks)
    ? tracks.find((item): item is Record<string, unknown> => isRecord(item))
    : undefined;
  const file = track === undefined ? undefined : (isRecord(track.file) ? track.file : undefined);
  const size = file === undefined ? undefined : file[sizeField];

  if (typeof size === "number" && Number.isInteger(size) && size >= 0) {
    return ok(size);
  }

  return ok(undefined);
}

function qqTierFromPurl(purl: string): QqAudioTier {
  if (purl.startsWith("M500")) {
    return { container: "mp3", bitrate: 128000, sizeField: "size_128mp3" };
  }

  if (purl.startsWith("M800")) {
    return { container: "mp3", bitrate: 320000, sizeField: "size_320mp3" };
  }

  if (purl.startsWith("F000")) {
    return { container: "flac", sizeField: "size_flac" };
  }

  // Unknown tier: derive container from the purl extension, default size field.
  const withoutQuery = purl.split("?")[0] ?? purl;
  const ext = withoutQuery.split(".").pop();

  return { container: ext ?? "mp3", sizeField: "size_128mp3" };
}

// --- picture + lyrics ------------------------------------------------------
//
// QQ covers are predictable static URLs (no bridge call for album/artist); a
// track's cover needs its album.mid via query_song first. Lyrics come back as
// encrypted QRC (crypt != 0) and are decrypted in-process via qrcDecrypt.

function qqCoverUrl(kind: "T001" | "T002", mid: string): string {
  return `https://y.gtimg.cn/music/photo_new/${kind}R300x300M000${mid}.jpg`;
}

async function readQqEntityPictureUrl(
  config: unknown,
  sourceRef: Ref,
): Promise<Result<string | undefined>> {
  if (sourceRef.kind === "album") {
    return ok(qqCoverUrl("T002", sourceRef.id));
  }

  if (sourceRef.kind === "artist") {
    return ok(qqCoverUrl("T001", sourceRef.id));
  }

  if (sourceRef.kind !== "track") {
    return ok(undefined);
  }

  const albumMid = await readQqAlbumMid(config, sourceRef.id);

  if (!albumMid.ok) {
    return albumMid;
  }

  return ok(albumMid.value === undefined ? undefined : qqCoverUrl("T002", albumMid.value));
}

async function readQqAlbumMid(
  config: unknown,
  songMid: string,
): Promise<Result<string | undefined>> {
  const payload = await requestQqPath(config, "/song/query_song", { value: songMid });

  if (!payload.ok) {
    return payload;
  }

  const data = isRecord(payload.value) ? payload.value.data : undefined;
  const tracks = isRecord(data) ? data.tracks : undefined;
  const track = Array.isArray(tracks)
    ? tracks.find((item): item is Record<string, unknown> => isRecord(item))
    : undefined;
  const album = track === undefined ? undefined : (isRecord(track.album) ? track.album : undefined);

  return ok(album === undefined ? undefined : toNonEmptyString(album.mid));
}

async function readQqSongLyrics(
  config: unknown,
  sourceRef: Ref,
): Promise<Result<SongLyrics | undefined>> {
  if (sourceRef.kind !== "track") {
    return ok(undefined);
  }

  const payload = await requestQqPath(config, `/song/${sourceRef.id}/lyric`, {
    qrc: "true",
    trans: "true",
    roma: "true",
  });

  if (!payload.ok) {
    return payload;
  }

  const data = isRecord(payload.value) ? payload.value.data : undefined;

  if (!isRecord(data)) {
    return failExtension(
      "extension.qq_malformed_response",
      "QQ provider /lyric response did not include data.",
    );
  }

  const crypt = typeof data.crypt === "number" ? data.crypt : 0;
  const mainRaw = toNonEmptyString(data.lyric);

  if (mainRaw === undefined) {
    return ok(undefined);
  }

  const main = crypt !== 0 ? decryptQrcOrEmpty(mainRaw) : mainRaw;

  if (main === undefined) {
    return ok(undefined);
  }

  const transRaw = toNonEmptyString(data.trans);
  const romaRaw = toNonEmptyString(data.roma);
  const trans = transRaw === undefined ? undefined : (crypt !== 0 ? decryptQrcOrEmpty(transRaw) : transRaw);
  const roma = romaRaw === undefined ? undefined : (crypt !== 0 ? decryptQrcOrEmpty(romaRaw) : romaRaw);

  return ok({
    lyrics: main,
    ...(trans === undefined ? {} : { translation: trans }),
    ...(roma === undefined ? {} : { romanization: roma }),
  });
}

function decryptQrcOrEmpty(encrypted: string): string | undefined {
  try {
    return qrcDecrypt(encrypted);
  } catch {
    // Malformed/undecryptable payload: honest "no usable lyric".
    return undefined;
  }
}

// --- platform library: saved tracks / albums / followed artists ------------
//
// All personal-library endpoints live under /user/{euin}/... where euin is the
// logged-in account's encrypt_uin (fetched from /login/refresh_credential).
// Pagination is 1-based page numbers; hasmore/HasMore signals another page.

const QQ_LIBRARY_LIMIT = 10;

async function readQqSavedTracks(
  config: unknown,
  input: PlatformLibraryReadInput,
): Promise<Result<PlatformLibraryReadResult>> {
  return readQqLibraryPage(
    config,
    input,
    "saved_source_track",
    "fav/songs",
    "songlist",
    toSavedTrackEntityEntry,
    (data) => data.hasmore === 1 || data.hasmore === true,
    (data) => qqTotalCount(data.total_song_num),
  );
}

async function readQqSavedAlbums(
  config: unknown,
  input: PlatformLibraryReadInput,
): Promise<Result<PlatformLibraryReadResult>> {
  return readQqLibraryPage(
    config,
    input,
    "saved_source_album",
    "fav/albums",
    "albums",
    toSavedAlbumEntityEntry,
    (data) => data.hasmore === 1 || data.hasmore === true,
    (data) => qqTotalCount(data.total),
  );
}

async function readQqFollowedArtists(
  config: unknown,
  input: PlatformLibraryReadInput,
): Promise<Result<PlatformLibraryReadResult>> {
  return readQqLibraryPage(
    config,
    input,
    "followed_source_artist",
    "follow/singers",
    "users",
    toFollowedArtistEntityEntry,
    // follow/singers uses a capitalized HasMore flag.
    (data) => data.HasMore === true,
    (data) => qqTotalCount(data.Total),
  );
}

type QqLibraryEntity = SourceTrack | SourceAlbum | SourceArtist;
type QqLibraryEntityMapper = (value: Record<string, unknown>, path: string) => Result<QqLibraryEntity | undefined>;

async function readQqLibraryPage(
  config: unknown,
  input: PlatformLibraryReadInput,
  kind: PlatformLibraryReadInput["kind"],
  path: string,
  listKey: string,
  entityMapper: QqLibraryEntityMapper,
  hasMore: (data: Record<string, unknown>) => boolean,
  totalHint: (data: Record<string, unknown>) => { totalCountHint?: number },
): Promise<Result<PlatformLibraryReadResult>> {
  const page = qqPageCursor(input.cursor);

  if (!page.ok) {
    return page;
  }

  const euin = await resolveQqProviderAccountId(config, input.providerAccountId);

  if (!euin.ok) {
    return euin;
  }

  const limit = input.limit ?? QQ_LIBRARY_LIMIT;
  const payload = await requestQqPath(config, `/user/${euin.value}/${path}`, {
    page: String(page.value),
    num: String(limit),
  });

  if (!payload.ok) {
    return payload;
  }

  const data = isRecord(payload.value) ? payload.value.data : undefined;

  if (!isRecord(data)) {
    return failExtension(
      "extension.qq_malformed_response",
      `QQ provider /user/{euin}/${path} response did not include data.`,
    );
  }

  const entitiesResult = mapQqPayloadArray<Record<string, unknown>, QqLibraryEntity>(data[listKey], `data.${listKey}`, entityMapper);

  if (!entitiesResult.ok) {
    return entitiesResult;
  }

  const candidates: PlatformLibraryCandidate[] = entitiesResult.value.map((entity) => ({
    sourceEntity: entity,
    libraryKind: kind,
  }));

  return ok({
    origin: "provider",
    providerId: qqProviderId,
    providerAccountId: euin.value,
    kind,
    candidates,
    ...(hasMore(data) ? { nextCursor: String(page.value + 1) } : {}),
    ...totalHint(data),
  });
}

async function resolveQqProviderAccountId(
  config: unknown,
  providerAccountId: string | undefined,
): Promise<Result<string>> {
  const payload = await requestQqPath(config, "/login/refresh_credential", {});

  if (!payload.ok) {
    return payload;
  }

  const data = isRecord(payload.value) ? payload.value.data : undefined;

  if (!isRecord(data)) {
    return failExtension(
      "extension.qq_malformed_response",
      "QQ provider /login/refresh_credential response did not include data.",
    );
  }

  const euin = toNonEmptyString(data.encryptUin) ?? toNonEmptyString(data.encrypt_uin);

  if (euin === undefined) {
    return failExtension(
      "extension.qq_account_unresolved",
      "QQ provider could not resolve the logged-in account encrypt_uin.",
      undefined,
      true,
    );
  }

  if (!isRefComponentSafe(euin)) {
    return failExtension(
      "extension.qq_invalid_provider_account_id",
      "QQ provider encrypt_uin is not a usable account id.",
    );
  }

  if (providerAccountId !== undefined && providerAccountId !== euin) {
    return failExtension(
      "extension.qq_account_mismatch",
      `QQ provider account mismatch: requested ${providerAccountId} but logged in as ${euin}.`,
      undefined,
      true,
    );
  }

  return ok(euin);
}

function qqPageCursor(cursor: string | undefined): Result<number> {
  if (cursor === undefined) {
    return ok(1);
  }

  if (!/^(0|[1-9]\d*)$/.test(cursor)) {
    return failExtension(
      "extension.qq_invalid_cursor",
      "QQ provider library cursor must be a non-negative integer page number.",
    );
  }

  return ok(Number(cursor));
}

function toSavedTrackEntity(song: QqSong): QqLibraryEntity | undefined {
  return toQqTrackCandidate(song)?.sourceEntity;
}

function toSavedTrackEntityEntry(value: Record<string, unknown>, _path: string): Result<QqLibraryEntity | undefined> {
  return ok(toSavedTrackEntity(value as QqSong));
}

function toSavedAlbumEntity(album: QqAlbum): SourceAlbum | undefined {
  const mid = toNonEmptyString(album.mid);
  const title = toNonEmptyString(album.name);

  if (mid === undefined || title === undefined) {
    return undefined;
  }

  const artists = qqArtists(album.v_singer);
  const label = labelWithArtists(title, artists.labels);
  const releaseDate = qqReleaseDate(album.pubtime, album.time_public);
  const versionInfo = extractVersionInfo([album.name, album.title]);
  const sourceEntity: SourceAlbum = {
    kind: "album",
    sourceRef: { namespace: QQ_NAMESPACE, kind: "album", id: mid, label },
    origin: "provider",
    providerId: qqProviderId,
    providerEntityId: mid,
    label,
    title,
    ...(artists.labels.length === 0 ? {} : { artistLabels: artists.labels }),
    ...(artists.refs.length === 0 ? {} : { artistSourceRefs: artists.refs }),
    ...(releaseDate === undefined ? {} : { releaseDate }),
    ...(versionInfo === undefined ? {} : { versionInfo }),
    providerUrl: qqAlbumUrl(mid),
    availabilityHint: "unknown",
  };

  return sourceEntity;
}

function toSavedAlbumEntityEntry(value: Record<string, unknown>, _path: string): Result<QqLibraryEntity | undefined> {
  return ok(toSavedAlbumEntity(value as QqAlbum));
}

function toFollowedArtistEntity(user: Record<string, unknown>): SourceArtist | undefined {
  // follow/singers uses capitalized fields: MID, Name.
  const mid = toNonEmptyString(user.MID);
  const name = toNonEmptyString(user.Name);

  if (mid === undefined || name === undefined) {
    return undefined;
  }

  const sourceEntity: SourceArtist = {
    kind: "artist",
    sourceRef: { namespace: QQ_NAMESPACE, kind: "artist", id: mid, label: name },
    origin: "provider",
    providerId: qqProviderId,
    providerEntityId: mid,
    label: name,
    name,
    providerUrl: qqArtistUrl(mid),
    availabilityHint: "unknown",
  };

  return sourceEntity;
}

function toFollowedArtistEntityEntry(value: Record<string, unknown>, _path: string): Result<QqLibraryEntity | undefined> {
  return ok(toFollowedArtistEntity(value));
}

function qqTotalCount(value: unknown): { totalCountHint?: number } {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return { totalCountHint: value };
  }

  return {};
}

function qqReleaseDate(pubtime: unknown, timePublic: unknown): string | undefined {
  const tp = toNonEmptyString(timePublic);

  if (tp !== undefined) {
    return tp;
  }

  if (typeof pubtime === "number" && pubtime > 0) {
    const d = new Date(pubtime * 1000);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
  }

  return undefined;
}

// --- small shared helpers --------------------------------------------------

// QQ search is single-kind only: an omitted/empty targetKinds defaults to
// track (aligned with the NCM plugin); more than one distinct kind is rejected
// loudly rather than silently narrowed, because the retrieval layer always
// requests one kind per provider-search pool and multi-kind coordination would
// be dead weight.
function resolveSingleSearchTarget(
  targetKinds: readonly SourceEntityKind[] | undefined,
): Result<SourceEntityKind> {
  let first: SourceEntityKind = "track";
  const seen = new Set<SourceEntityKind>();
  let distinctCount = 0;

  for (const kind of targetKinds ?? []) {
    if (seen.has(kind)) {
      continue;
    }
    seen.add(kind);
    distinctCount += 1;

    if (distinctCount > 1) {
      return failExtension(
        "extension.qq_multi_kind_unsupported",
        "QQ provider search supports only a single target kind; multiple distinct target kinds are rejected instead of silently narrowing.",
      );
    }

    first = kind;
  }

  return ok(first);
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
