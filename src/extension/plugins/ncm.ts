import {
  isRefComponentSafe,
  type PlayableLink,
  type ProviderMaterialCandidate,
  type Ref,
  type Result,
  type SourceAlbum,
  type SourceArtist,
  type SourceEntityKind,
  type SourceProvider,
  type SourceTrack,
  type SourceTrackPosition,
  type VersionInfo,
  type VersionTag,
} from "../../contracts/index.js";
import { failExtension, ok } from "../errors.js";
import type { MineMusicPlugin } from "../plugin_runtime.js";
import { sourceProviderSlot } from "../source_provider_slot.js";

export const ncmPluginId = "minemusic.ncm";
export const ncmProviderId = "netease";
export const defaultNcmBaseUrl = "http://127.0.0.1:3000";

export type NcmPluginConfig = {
  baseUrl?: string;
  fetch?: typeof fetch;
};

type NcmSearchType = "1" | "10" | "100";

type NcmArtist = {
  id?: unknown;
  name?: unknown;
  alias?: unknown;
  alia?: unknown;
  trans?: unknown;
  transNames?: unknown;
};

type NcmAlbum = {
  id?: unknown;
  name?: unknown;
  size?: unknown;
  artists?: unknown;
  artist?: unknown;
  publishTime?: unknown;
  alias?: unknown;
  alia?: unknown;
  transNames?: unknown;
};

type NcmSong = {
  id?: unknown;
  name?: unknown;
  artists?: unknown;
  ar?: unknown;
  album?: unknown;
  al?: unknown;
  fee?: unknown;
  noCopyrightRcmd?: unknown;
  duration?: unknown;
  dt?: unknown;
  cd?: unknown;
  no?: unknown;
  alias?: unknown;
  alia?: unknown;
  transNames?: unknown;
};

type NcmSearchTarget = {
  kind: SourceEntityKind;
  type: NcmSearchType;
};

const ncmSearchTargets: Record<SourceEntityKind, NcmSearchTarget> = {
  track: { kind: "track", type: "1" },
  album: { kind: "album", type: "10" },
  artist: { kind: "artist", type: "100" },
};

export function createNcmPlugin(config: NcmPluginConfig = {}): MineMusicPlugin {
  const provider = createNcmSourceProvider(config);

  return {
    manifest: {
      id: ncmPluginId,
      displayName: "NetEase Cloud Music",
      version: "0.1.0",
      minCoreVersion: "0.1.0",
      capabilities: [sourceProviderSlot.id],
    },
    activate(ctx) {
      return ctx.registerSourceProvider({
        pluginId: ctx.pluginId,
        providerId: ncmProviderId,
        provider,
      });
    },
  };
}

function createNcmSourceProvider(config: unknown): SourceProvider {
  return {
    descriptor: {
      providerId: ncmProviderId,
      label: "NetEase Cloud Music",
      capabilities: ["search"],
    },
    async search({ query }) {
      const text = query.text.trim();
      const targets = normalizedTargets(query.targetKinds);
      const offset = query.offset ?? 0;

      if (targets.length === 0) {
        return ok([]);
      }

      if (targets.length > 1 && offset > 0) {
        return failExtension(
          "extension.ncm_multi_kind_offset_unsupported",
          "NCM source search does not support offset for multi-kind search.",
        );
      }

      const limits = splitLimit(query.limit, targets.length);
      const candidates: ProviderMaterialCandidate[] = [];

      for (const [index, target] of targets.entries()) {
        const limit = limits[index] ?? defaultNcmSearchLimit();

        if (limit <= 0) {
          continue;
        }

        const searched = await requestNcmSearch(config, {
          text,
          limit,
          offset: targets.length === 1 ? offset : 0,
          type: target.type,
        });

        if (!searched.ok) {
          return searched;
        }

        const mapped = mapSearchPayload(target.kind, searched.value);

        if (!mapped.ok) {
          return mapped;
        }

        candidates.push(...mapped.value);
      }

      return ok(query.limit === undefined ? candidates : candidates.slice(0, query.limit));
    },
  };
}

async function requestNcmSearch(
  config: unknown,
  input: {
    text: string;
    limit: number;
    offset: number;
    type: NcmSearchType;
  },
): Promise<Result<unknown>> {
  if (!isRecord(config)) {
    return failExtension(
      "extension.ncm_invalid_config",
      "NCM plugin config must be an object.",
    );
  }

  const fetchJson = config.fetch ?? fetch;
  const urlResult = ncmSearchUrl(config.baseUrl ?? defaultNcmBaseUrl);

  if (!urlResult.ok) {
    return urlResult;
  }

  if (typeof fetchJson !== "function") {
    return failExtension(
      "extension.ncm_invalid_config",
      "NCM plugin fetch config must be a function.",
    );
  }

  const url = urlResult.value;

  url.searchParams.set("keywords", input.text);
  url.searchParams.set("limit", String(input.limit));
  url.searchParams.set("offset", String(input.offset));
  url.searchParams.set("type", input.type);

  let response: Response;

  try {
    response = await fetchJson(url);
  } catch {
    return failExtension(
      "extension.ncm_provider_unavailable",
      `NCM provider is unavailable at ${url.origin}.`,
      undefined,
      true,
    );
  }

  if (!response.ok) {
    return failExtension(
      "extension.ncm_provider_unavailable",
      `NCM provider returned HTTP ${response.status}.`,
      undefined,
      true,
    );
  }

  try {
    return ok(await response.json());
  } catch {
    return failExtension(
      "extension.ncm_malformed_response",
      "NCM provider returned malformed JSON.",
    );
  }
}

function ncmSearchUrl(baseUrl: unknown): Result<URL> {
  if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
    return failExtension(
      "extension.ncm_invalid_config",
      "NCM plugin baseUrl config must be a non-empty URL string.",
    );
  }

  try {
    return ok(new URL("/search", normalizedBaseUrl(baseUrl.trim())));
  } catch {
    return failExtension(
      "extension.ncm_invalid_config",
      "NCM plugin baseUrl config must be a valid URL.",
    );
  }
}

function mapSearchPayload(
  kind: SourceEntityKind,
  payload: unknown,
): Result<readonly ProviderMaterialCandidate[]> {
  const payloadIssue = issueFromNcmPayload(payload);

  if (payloadIssue !== undefined) {
    return payloadIssue;
  }

  const result = isRecord(payload) ? payload.result : undefined;

  if (!isRecord(result)) {
    return failExtension(
      "extension.ncm_malformed_response",
      "NCM provider response did not include result.",
    );
  }

  switch (kind) {
    case "track":
      return mapPayloadArray(result.songs, "result.songs", toTrackCandidate);
    case "album":
      return mapPayloadArray(result.albums, "result.albums", toAlbumCandidate);
    case "artist":
      return mapPayloadArray(result.artists, "result.artists", toArtistCandidate);
  }
}

function mapPayloadArray<T extends Record<string, unknown>>(
  value: unknown,
  path: string,
  mapper: (value: T) => ProviderMaterialCandidate | undefined,
): Result<readonly ProviderMaterialCandidate[]> {
  if (!Array.isArray(value)) {
    return failExtension(
      "extension.ncm_malformed_response",
      `NCM provider response did not include ${path}.`,
    );
  }

  return ok(value.filter(isRecord).map((item) => mapper(item as T)).filter(isDefined));
}

function toTrackCandidate(song: NcmSong): ProviderMaterialCandidate | undefined {
  const id = toUsableProviderId(song.id);
  const title = toNonEmptyString(song.name);

  if (id === undefined || title === undefined) {
    return undefined;
  }

  const artists = artistFacts(artistRecords(song.artists, song.ar));
  const album = albumRecord(song.album, song.al);
  const albumRef = album === undefined ? undefined : toAlbumSourceRef(album);
  const albumLabel = album === undefined ? undefined : toNonEmptyString(album.name);
  const label = labelWithArtists(title, artists.labels);
  const unavailable = song.noCopyrightRcmd !== undefined && song.noCopyrightRcmd !== null;
  const restricted = !unavailable && typeof song.fee === "number" && song.fee !== 0;
  const links = unavailable ? [] : [trackLink(id, restricted)];
  const versionInfo = extractVersionInfo([
    song.name,
    ...stringArray(song.alias),
    ...stringArray(song.alia),
    ...stringArray(song.transNames),
    album?.name,
  ]);
  const trackPosition = toTrackPosition(song, album);
  const duration = durationMs(song);
  const sourceEntity: SourceTrack = {
    kind: "track",
    sourceRef: {
      namespace: "source_netease",
      kind: "track",
      id,
      label,
    },
    providerId: ncmProviderId,
    providerEntityId: id,
    label,
    title,
    ...(artists.labels.length === 0 ? {} : { artistLabels: artists.labels }),
    ...(artists.refs.length === 0 ? {} : { artistSourceRefs: artists.refs }),
    ...(albumLabel === undefined ? {} : { albumLabel }),
    ...(albumRef === undefined ? {} : { albumSourceRef: albumRef }),
    ...(trackPosition === undefined ? {} : { trackPosition }),
    ...(duration === undefined ? {} : { durationMs: duration }),
    ...(versionInfo === undefined ? {} : { versionInfo }),
    providerUrl: songUrl(id),
    ...(links.length === 0 ? {} : { links }),
    availabilityHint: unavailable ? "unavailable" : restricted ? "restricted" : "playable",
  };

  return { sourceEntity };
}

function toAlbumCandidate(album: NcmAlbum): ProviderMaterialCandidate | undefined {
  const id = toUsableProviderId(album.id);
  const title = toNonEmptyString(album.name);

  if (id === undefined || title === undefined) {
    return undefined;
  }

  const artists = artistFacts(albumArtistRecords(album));
  const label = labelWithArtists(title, artists.labels);
  const releaseDate = releaseDateFromNcmTime(album.publishTime);
  const versionInfo = extractVersionInfo([
    album.name,
    ...stringArray(album.alias),
    ...stringArray(album.alia),
    ...stringArray(album.transNames),
  ]);
  const sourceEntity: SourceAlbum = {
    kind: "album",
    sourceRef: {
      namespace: "source_netease",
      kind: "album",
      id,
      label,
    },
    providerId: ncmProviderId,
    providerEntityId: id,
    label,
    title,
    ...(artists.labels.length === 0 ? {} : { artistLabels: artists.labels }),
    ...(artists.refs.length === 0 ? {} : { artistSourceRefs: artists.refs }),
    ...(releaseDate === undefined ? {} : { releaseDate }),
    ...(versionInfo === undefined ? {} : { versionInfo }),
    providerUrl: albumUrl(id),
    availabilityHint: "unknown",
  };

  return { sourceEntity };
}

function toArtistCandidate(artist: NcmArtist): ProviderMaterialCandidate | undefined {
  const id = toUsableProviderId(artist.id);
  const name = toNonEmptyString(artist.name);

  if (id === undefined || name === undefined) {
    return undefined;
  }

  const aliases = uniqueStrings([
    ...stringArray(artist.alias),
    ...stringArray(artist.alia),
    ...stringArray(artist.trans),
    ...stringArray(artist.transNames),
  ]).filter((alias) => alias !== name);
  const sourceEntity: SourceArtist = {
    kind: "artist",
    sourceRef: {
      namespace: "source_netease",
      kind: "artist",
      id,
      label: name,
    },
    providerId: ncmProviderId,
    providerEntityId: id,
    label: name,
    name,
    ...(aliases.length === 0 ? {} : { aliases }),
    providerUrl: artistUrl(id),
    availabilityHint: "unknown",
  };

  return { sourceEntity };
}

function issueFromNcmPayload(payload: unknown): Result<never> | undefined {
  if (!isRecord(payload)) {
    return failExtension(
      "extension.ncm_malformed_response",
      "NCM provider response was not an object.",
    );
  }

  const code = payload.code;

  if (typeof code !== "number" || code === 200) {
    return undefined;
  }

  const message = toNonEmptyString(payload.message ?? payload.msg) ?? `NCM provider returned code ${code}.`;

  return failExtension(
    "extension.ncm_provider_response_error",
    message,
  );
}

function normalizedTargets(targetKinds: readonly SourceEntityKind[] | undefined): readonly NcmSearchTarget[] {
  const requested = targetKinds ?? ["track"];
  const seen = new Set<SourceEntityKind>();
  const targets: NcmSearchTarget[] = [];

  for (const kind of requested) {
    if (seen.has(kind)) {
      continue;
    }

    seen.add(kind);
    targets.push(ncmSearchTargets[kind]);
  }

  return targets;
}

function splitLimit(limit: number | undefined, partCount: number): number[] {
  if (limit === undefined) {
    return Array.from({ length: partCount }, () => defaultNcmSearchLimit());
  }

  const base = Math.floor(limit / partCount);
  let remainder = limit % partCount;

  return Array.from({ length: partCount }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    remainder -= 1;
    return value;
  });
}

function defaultNcmSearchLimit(): number {
  return 10;
}

function artistFacts(artists: readonly NcmArtist[]): { labels: string[]; refs: Ref[] } {
  const labels: string[] = [];
  const refs: Ref[] = [];
  const seenLabels = new Set<string>();
  const seenRefs = new Set<string>();

  for (const artist of artists) {
    const name = toNonEmptyString(artist.name);

    if (name !== undefined && !seenLabels.has(name)) {
      labels.push(name);
      seenLabels.add(name);
    }

    const id = toUsableProviderId(artist.id);

    if (id === undefined || name === undefined || seenRefs.has(id)) {
      continue;
    }

    refs.push({
      namespace: "source_netease",
      kind: "artist",
      id,
      label: name,
    });
    seenRefs.add(id);
  }

  return { labels, refs };
}

function artistRecords(primary: unknown, fallback?: unknown): NcmArtist[] {
  const primaryRecords = arrayRecords(primary) as NcmArtist[];
  const fallbackRecords = arrayRecords(fallback) as NcmArtist[];

  if (fallbackRecords.length === 0) {
    return primaryRecords;
  }

  if (primaryRecords.length === 0) {
    return fallbackRecords;
  }

  return hasStableIdsForNamedArtists(primaryRecords) && fallbackRecords.length <= primaryRecords.length
    ? primaryRecords
    : [...primaryRecords, ...fallbackRecords];
}

function albumArtistRecords(album: NcmAlbum): NcmArtist[] {
  return artistRecords(album.artists, isRecord(album.artist) ? [album.artist] : undefined);
}

function albumRecord(primary: unknown, fallback: unknown): NcmAlbum | undefined {
  const primaryAlbum = isRecord(primary) ? primary as NcmAlbum : undefined;
  const fallbackAlbum = isRecord(fallback) ? fallback as NcmAlbum : undefined;

  if (isCompleteAlbumRecord(primaryAlbum)) {
    return primaryAlbum;
  }

  if (isCompleteAlbumRecord(fallbackAlbum)) {
    return fallbackAlbum;
  }

  return primaryAlbum ?? fallbackAlbum;
}

function toAlbumSourceRef(album: NcmAlbum): Ref | undefined {
  const id = toUsableProviderId(album.id);
  const label = toNonEmptyString(album.name);

  if (id === undefined) {
    return undefined;
  }

  return {
    namespace: "source_netease",
    kind: "album",
    id,
    ...(label === undefined ? {} : { label }),
  };
}

function toTrackPosition(song: NcmSong, album: NcmAlbum | undefined): SourceTrackPosition | undefined {
  const discNumber = toOptionalString(song.cd);
  const trackNumber = toPositiveInteger(song.no);
  const trackCount = toPositiveInteger(album?.size);
  const position: SourceTrackPosition = {
    ...(discNumber === undefined ? {} : { discNumber }),
    ...(trackNumber === undefined ? {} : { trackNumber }),
    ...(trackCount === undefined ? {} : { trackCount }),
  };

  return Object.keys(position).length === 0 ? undefined : position;
}

function durationMs(song: NcmSong): number | undefined {
  return toPositiveInteger(song.duration) ?? toPositiveInteger(song.dt);
}

function trackLink(id: string, requiresAccount: boolean): PlayableLink {
  return {
    url: songUrl(id),
    label: "NetEase Cloud Music",
    ...(requiresAccount ? { requiresAccount: true } : {}),
  };
}

function extractVersionInfo(values: readonly unknown[]): VersionInfo | undefined {
  const phrases = values.flatMap((value) => explicitVersionPhrases(toNonEmptyString(value)));
  const tags: VersionTag[] = [];

  for (const phrase of phrases) {
    for (const tag of versionTagsForPhrase(phrase)) {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }

  if (tags.length === 0) {
    return undefined;
  }

  const label = phrases.find((phrase) => versionTagsForPhrase(phrase).length > 0);

  return {
    ...(label === undefined ? {} : { label }),
    tags,
  };
}

function explicitVersionPhrases(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  const phrases: string[] = [];
  const bracketPattern = /(?:\(([^)]+)\)|\[([^\]]+)\]|（([^）]+)）|【([^】]+)】)/g;
  let match: RegExpExecArray | null;

  while ((match = bracketPattern.exec(value)) !== null) {
    const phrase = [match[1], match[2], match[3], match[4]].find((part) => part !== undefined);

    if (phrase !== undefined) {
      phrases.push(phrase.trim());
    }
  }

  const suffix = /(?:\s[-–—]\s|\s)([^-–—()[\]（）【】]*(?:remaster|remastered|remastering|remix|live version|unplugged|acoustic|radio edit|extended|demo|deluxe|explicit|instrumental|现场|不插电|混音|伴奏|原声)[^-–—()[\]（）【】]*)$/i.exec(value);

  if (suffix?.[1] !== undefined && suffix[1].trim() !== value.trim()) {
    phrases.push(suffix[1].trim());
  }

  return uniqueStrings(phrases).filter((phrase) => phrase.length > 0);
}

function versionTagsForPhrase(phrase: string): VersionTag[] {
  const normalized = phrase.toLowerCase();
  const tags: VersionTag[] = [];

  if (includesAny(normalized, ["remaster", "remastered", "remastering"])) {
    tags.push("remaster");
  }

  if (includesAny(normalized, ["radio edit"])) {
    tags.push("radio_edit");
  } else if (/\bedit\b/.test(normalized)) {
    tags.push("edit");
  }

  if (includesAny(normalized, ["extended", "expanded"])) {
    tags.push("extended");
  }

  if (includesAny(normalized, ["remix", " mix", "混音"])) {
    tags.push("remix");
  }

  if (includesAny(normalized, ["live", "live version", "concert", "现场"])) {
    tags.push("live");
  }

  if (includesAny(normalized, ["unplugged", "不插电"])) {
    tags.push("unplugged");
  }

  if (includesAny(normalized, ["acoustic", "原声"])) {
    tags.push("acoustic");
  }

  if (includesAny(normalized, ["demo"])) {
    tags.push("demo");
  }

  if (includesAny(normalized, ["deluxe"])) {
    tags.push("deluxe");
  }

  if (includesAny(normalized, ["explicit"])) {
    tags.push("explicit");
  }

  if (includesAny(normalized, ["instrumental", "伴奏"])) {
    tags.push("instrumental");
  }

  return tags;
}

function releaseDateFromNcmTime(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year === undefined || month === undefined || day === undefined
    ? undefined
    : `${year}-${month}-${day}`;
}

function labelWithArtists(title: string, artists: readonly string[]): string {
  return artists.length === 0 ? title : `${title} - ${artists.join(", ")}`;
}

function toUsableProviderId(value: unknown): string | undefined {
  const id = toOptionalString(value);

  if (id === undefined || id === "0" || !isRefComponentSafe(id)) {
    return undefined;
  }

  return id;
}

function toPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(toNonEmptyString).filter(isDefined);
  }

  const single = toNonEmptyString(value);

  return single === undefined ? [] : [single];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function includesAny(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function songUrl(id: string): string {
  return `https://music.163.com/#/song?id=${encodeURIComponent(id)}`;
}

function albumUrl(id: string): string {
  return `https://music.163.com/#/album?id=${encodeURIComponent(id)}`;
}

function artistUrl(id: string): string {
  return `https://music.163.com/#/artist?id=${encodeURIComponent(id)}`;
}

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasUsableArtistId(artist: NcmArtist): boolean {
  return toUsableProviderId(artist.id) !== undefined;
}

function hasStableIdsForNamedArtists(artists: readonly NcmArtist[]): boolean {
  return artists.every((artist) => toNonEmptyString(artist.name) === undefined || hasUsableArtistId(artist));
}

function isCompleteAlbumRecord(album: NcmAlbum | undefined): boolean {
  return album !== undefined &&
    toUsableProviderId(album.id) !== undefined &&
    toNonEmptyString(album.name) !== undefined;
}
