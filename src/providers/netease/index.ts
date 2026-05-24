import type {
  MaterialEvidence,
  MusicMaterial,
  PlayableLink,
  PlatformLibraryAccountIdentity,
  PlatformLibraryArea,
  PlatformLibraryIssue,
  PlatformLibraryItem,
  PlatformLibraryReadAreaResult,
  PlatformLibraryProvider,
  Ref,
  Result,
  SourceProvider,
  StageError,
} from "../../contracts/index.js";

export const defaultNetEaseBaseUrl = "http://127.0.0.1:3000";

export type NetEaseRequestInput = {
  path: string;
  query: Record<string, string>;
};

export type NetEaseRequester = (input: NetEaseRequestInput) => Promise<Result<unknown>>;

export type NetEaseProviderOptions = {
  baseUrl?: string;
  requestJson?: NetEaseRequester;
};

export type NetEaseSourceProviderOptions = NetEaseProviderOptions;

export type NetEasePlatformLibraryProviderOptions = NetEaseProviderOptions;

type NetEaseSong = {
  id?: unknown;
  name?: unknown;
  artists?: unknown;
  ar?: unknown;
  album?: unknown;
  al?: unknown;
  fee?: unknown;
  noCopyrightRcmd?: unknown;
  dt?: unknown;
};

type NetEaseAlbum = {
  id?: unknown;
  name?: unknown;
  artists?: unknown;
  artist?: unknown;
};

type NetEaseArtist = {
  id?: unknown;
  name?: unknown;
};

type NetEaseAccountResolution =
  | {
      kind: "resolved";
      account: PlatformLibraryAccountIdentity;
    }
  | {
      kind: "login_required";
    };

export function createNetEaseSourceProvider({
  baseUrl = defaultNetEaseBaseUrl,
  requestJson = createDefaultRequester(baseUrl),
}: NetEaseSourceProviderOptions = {}): SourceProvider {
  return {
    id: "netease",

    async search({ query }) {
      const keywords = query.text?.trim();

      if (keywords === undefined || keywords.length === 0) {
        return ok([]);
      }

      const response = await requestJson({
        path: "/search",
        query: {
          keywords,
          limit: String(query.limit ?? 10),
        },
      });

      if (!response.ok) {
        return response;
      }

      const songsResult = extractSongs(response.value);

      if (!songsResult.ok) {
        return songsResult;
      }

      return ok(songsResult.value.map(toMaterial));
    },

    async getPlayableLinks({ material }) {
      if (material.state === "blocked") {
        return ok([]);
      }

      const existingLinks = (material.playableLinks ?? []).filter(isNetEasePlayableLink);

      if (existingLinks.length > 0) {
        return ok(existingLinks);
      }

      const sourceRef = findNetEaseTrackRef(material.sourceRefs ?? []);

      if (sourceRef === undefined) {
        return ok([]);
      }

      return ok([toPlayableLink(sourceRef, false)]);
    },
  };
}

export function createNetEasePlatformLibraryProvider({
  baseUrl = defaultNetEaseBaseUrl,
  requestJson = createDefaultRequester(baseUrl),
}: NetEasePlatformLibraryProviderOptions = {}): PlatformLibraryProvider {
  return {
    id: "netease",

    async preview(input) {
      const account = await resolveNetEaseAccount(requestJson, input.providerAccountId);
      const issues = account.kind === "login_required" ? [loginRequiredIssue()] : [];

      return ok({
        providerId: "netease",
        ...(account.kind === "resolved" ? { account: account.account } : {}),
        areas: [],
        ...(issues.length === 0 ? {} : { issues }),
      });
    },

    async readItems(input) {
      const account = await resolveNetEaseAccount(requestJson, input.providerAccountId);
      const issues = account.kind === "login_required" ? [loginRequiredIssue()] : [];
      const areas =
        account.kind === "resolved"
          ? await readPlatformLibraryAreas(requestJson, account.account.providerAccountId, input.areas)
          : [];

      return ok({
        providerId: "netease",
        ...(account.kind === "resolved" ? { account: account.account } : {}),
        areas,
        ...(issues.length === 0 ? {} : { issues }),
      });
    },
  };
}

async function readPlatformLibraryAreas(
  requestJson: NetEaseRequester,
  providerAccountId: string,
  areas: PlatformLibraryArea[],
): Promise<PlatformLibraryReadAreaResult[]> {
  const results: PlatformLibraryReadAreaResult[] = [];

  for (const area of areas) {
    if (area === "saved_recordings") {
      results.push({
        area,
        status: "complete",
        items: await readSavedRecordings(requestJson, providerAccountId),
      });
    }

    if (area === "saved_releases") {
      results.push({
        area,
        status: "complete",
        items: await readSavedReleases(requestJson),
      });
    }

    if (area === "saved_artists") {
      results.push({
        area,
        status: "complete",
        items: await readSavedArtists(requestJson),
      });
    }
  }

  return results;
}

async function readSavedRecordings(
  requestJson: NetEaseRequester,
  providerAccountId: string,
): Promise<PlatformLibraryItem[]> {
  const liked = await requestJson({
    path: "/likelist",
    query: { uid: providerAccountId },
  });

  if (!liked.ok) {
    return [];
  }

  const ids = extractIdList(liked.value);

  if (ids.length === 0) {
    return [];
  }

  const details = await requestJson({
    path: "/song/detail",
    query: { ids: ids.join(",") },
  });

  if (!details.ok) {
    return [];
  }

  return extractSongsFromDetail(details.value)
    .map(toSavedRecordingItem)
    .filter(isDefined);
}

async function readSavedReleases(requestJson: NetEaseRequester): Promise<PlatformLibraryItem[]> {
  const albums = await requestJson({
    path: "/album/sublist",
    query: {},
  });

  if (!albums.ok) {
    return [];
  }

  return extractArrayPayload(albums.value, ["data", "albums"])
    .map(toSavedReleaseItem)
    .filter(isDefined);
}

async function readSavedArtists(requestJson: NetEaseRequester): Promise<PlatformLibraryItem[]> {
  const artists = await requestJson({
    path: "/artist/sublist",
    query: {},
  });

  if (!artists.ok) {
    return [];
  }

  return extractArrayPayload(artists.value, ["data", "artists"])
    .map(toFollowedArtistItem)
    .filter(isDefined);
}

function loginRequiredIssue(): PlatformLibraryIssue {
  return {
    code: "login_required",
    message: "NetEase account identity could not be proven by the local API session.",
    retryable: true,
  };
}

async function resolveNetEaseAccount(
  requestJson: NetEaseRequester,
  requestedProviderAccountId?: string,
): Promise<NetEaseAccountResolution> {
  const response = await requestJson({
    path: "/login/status",
    query: {},
  });

  if (!response.ok) {
    return { kind: "login_required" };
  }

  const account = extractAccountIdentity(response.value);

  if (account === undefined) {
    return { kind: "login_required" };
  }

  if (
    requestedProviderAccountId !== undefined &&
    account.providerAccountId !== requestedProviderAccountId
  ) {
    return { kind: "login_required" };
  }

  return {
    kind: "resolved",
    account,
  };
}

function extractAccountIdentity(payload: unknown): PlatformLibraryAccountIdentity | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const data = isRecord(payload.data) ? payload.data : payload;
  const profile = isRecord(data.profile) ? data.profile : undefined;
  const account = isRecord(data.account) ? data.account : undefined;
  const providerAccountId = toStringId(profile?.userId ?? account?.id);

  if (providerAccountId === undefined) {
    return undefined;
  }

  const label = toNonEmptyString(profile?.nickname ?? account?.userName);

  return {
    providerAccountId,
    stable: true,
    ...(label === undefined ? {} : { label }),
  };
}

function createDefaultRequester(baseUrl: string): NetEaseRequester {
  return async ({ path, query }) => {
    const url = new URL(path, normalizedBaseUrl(baseUrl));

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    try {
      const response = await fetch(url);

      if (!response.ok) {
        return fail({
          code: "source.provider_unavailable",
          message: `NetEase provider returned HTTP ${response.status}.`,
          module: "source",
          retryable: true,
        });
      }

      return ok(await response.json());
    } catch (cause) {
      return fail({
        code: "source.provider_unavailable",
        message: `NetEase provider is unavailable at ${url.origin}.`,
        module: "source",
        retryable: true,
        cause,
      });
    }
  };
}

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function extractSongs(payload: unknown): Result<NetEaseSong[]> {
  if (!isRecord(payload)) {
    return unresolved("NetEase response was not an object.");
  }

  const result = payload.result;

  if (!isRecord(result) || !Array.isArray(result.songs)) {
    return unresolved("NetEase response did not include result.songs.");
  }

  return ok(result.songs.filter(isRecord));
}

function extractSongsFromDetail(payload: unknown): NetEaseSong[] {
  if (!isRecord(payload) || !Array.isArray(payload.songs)) {
    return [];
  }

  return payload.songs.filter(isRecord);
}

function extractIdList(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.ids)) {
    return [];
  }

  return payload.ids.map(toStringId).filter((id): id is string => id !== undefined);
}

function extractArrayPayload(payload: unknown, keys: string[]): Record<string, unknown>[] {
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of keys) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [];
}

function toSavedRecordingItem(song: NetEaseSong): PlatformLibraryItem | undefined {
  const songId = toStringId(song.id);

  if (songId === undefined) {
    return undefined;
  }

  const label = toSongLabel(song);
  const artistLabels = toArtistNames(song);
  const releaseLabel = firstAlbumName(song);
  const durationMs = typeof song.dt === "number" && Number.isFinite(song.dt) ? song.dt : undefined;

  return {
    providerId: "netease",
    sourceRef: {
      namespace: "source:netease",
      kind: "track",
      id: songId,
      label,
      url: toSongUrl(songId),
    },
    itemKind: "saved_recording",
    targetKind: "recording",
    label,
    canonicalHints: {
      label: toNonEmptyString(song.name) ?? label,
      ...(artistLabels.length === 0 ? {} : { artistLabels }),
      ...(releaseLabel === undefined ? {} : { releaseLabel }),
      ...(durationMs === undefined ? {} : { durationMs }),
    },
  };
}

function toSavedReleaseItem(album: Record<string, unknown>): PlatformLibraryItem | undefined {
  const albumId = toStringId(album.id);

  if (albumId === undefined) {
    return undefined;
  }

  const title = toNonEmptyString(album.name) ?? "Unresolved NetEase Album";
  const artistLabels = toAlbumArtistNames(album as NetEaseAlbum);
  const label = artistLabels.length === 0 ? title : `${title} - ${artistLabels.join(", ")}`;

  return {
    providerId: "netease",
    sourceRef: {
      namespace: "source:netease",
      kind: "album",
      id: albumId,
      label,
      url: toAlbumUrl(albumId),
    },
    itemKind: "saved_release",
    targetKind: "release",
    label,
    canonicalHints: {
      label: title,
      ...(artistLabels.length === 0 ? {} : { artistLabels }),
    },
  };
}

function toFollowedArtistItem(artist: Record<string, unknown>): PlatformLibraryItem | undefined {
  const artistId = toStringId(artist.id);

  if (artistId === undefined) {
    return undefined;
  }

  const label = toNonEmptyString(artist.name) ?? "Unresolved NetEase Artist";

  return {
    providerId: "netease",
    sourceRef: {
      namespace: "source:netease",
      kind: "artist",
      id: artistId,
      label,
      url: toArtistUrl(artistId),
    },
    itemKind: "followed_artist",
    targetKind: "artist",
    label,
    canonicalHints: {
      label,
    },
  };
}

function toMaterial(song: NetEaseSong): MusicMaterial {
  const sourceRef = toSourceRef(song);

  if (sourceRef === undefined) {
    return {
      id: "netease:track:unresolved",
      kind: "recording",
      label: toSongLabel(song),
      state: "unresolved",
      notes: "NetEase search result did not include a usable song id.",
    };
  }

  const blocked = song.noCopyrightRcmd !== undefined && song.noCopyrightRcmd !== null;
  const playableLinks = blocked ? [] : [toPlayableLink(sourceRef, requiresAccount(song))];
  const evidence = toEvidence(sourceRef, song);

  return {
    id: `netease:track:${sourceRef.id}`,
    kind: "recording",
    label: sourceRef.label ?? sourceRef.id,
    state: blocked ? "blocked" : "grounded",
    sourceRefs: [sourceRef],
    ...(playableLinks.length === 0 ? {} : { playableLinks }),
    evidence: [evidence],
  };
}

function toSourceRef(song: NetEaseSong): Ref | undefined {
  const songId = toStringId(song.id);

  if (songId === undefined) {
    return undefined;
  }

  return {
    namespace: "source:netease",
    kind: "track",
    id: songId,
    label: toSongLabel(song),
    url: toSongUrl(songId),
  };
}

function toPlayableLink(sourceRef: Ref, requiresAccount: boolean): PlayableLink {
  return {
    url: sourceRef.url ?? toSongUrl(sourceRef.id),
    label: "NetEase Cloud Music",
    sourceRef,
    ...(requiresAccount ? { requiresAccount: true } : {}),
  };
}

function toEvidence(sourceRef: Ref, song: NetEaseSong): MaterialEvidence {
  const albumName = firstAlbumName(song);

  return {
    kind: "provider.search_result",
    source: sourceRef,
    ...(albumName === undefined ? {} : { note: `Album: ${albumName}` }),
  };
}

function toSongLabel(song: NetEaseSong): string {
  const title = typeof song.name === "string" && song.name.length > 0 ? song.name : "Unresolved NetEase Track";
  const artistNames = toArtistNames(song);

  if (artistNames.length === 0) {
    return title;
  }

  return `${title} - ${artistNames.join(", ")}`;
}

function toArtistNames(song: NetEaseSong): string[] {
  const artists = Array.isArray(song.artists) ? song.artists : Array.isArray(song.ar) ? song.ar : [];

  return artists
    .filter(isRecord)
    .map((artist: NetEaseArtist) => artist.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

function toAlbumArtistNames(album: NetEaseAlbum): string[] {
  const artists = Array.isArray(album.artists)
    ? album.artists
    : isRecord(album.artist)
      ? [album.artist]
      : [];

  return artists
    .filter(isRecord)
    .map((artist: NetEaseArtist) => artist.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

function firstAlbumName(song: NetEaseSong): string | undefined {
  const album = isRecord(song.album) ? song.album : isRecord(song.al) ? song.al : undefined;

  if (album === undefined) {
    return undefined;
  }

  const { name } = album as NetEaseAlbum;

  return typeof name === "string" && name.length > 0 ? name : undefined;
}

function requiresAccount(song: NetEaseSong): boolean {
  return typeof song.fee === "number" && song.fee !== 0;
}

function toStringId(id: unknown): string | undefined {
  if (typeof id === "number" && Number.isFinite(id)) {
    return String(id);
  }

  if (typeof id === "string" && id.length > 0) {
    return id;
  }

  return undefined;
}

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function findNetEaseTrackRef(refs: Ref[]): Ref | undefined {
  return refs.find((ref) => ref.namespace === "source:netease" && ref.kind === "track");
}

function isNetEasePlayableLink(link: PlayableLink): boolean {
  return link.sourceRef.namespace === "source:netease" && link.sourceRef.kind === "track";
}

function toSongUrl(songId: string): string {
  return `https://music.163.com/#/song?id=${encodeURIComponent(songId)}`;
}

function toAlbumUrl(albumId: string): string {
  return `https://music.163.com/#/album?id=${encodeURIComponent(albumId)}`;
}

function toArtistUrl(artistId: string): string {
  return `https://music.163.com/#/artist?id=${encodeURIComponent(artistId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function unresolved(message: string): Result<never> {
  return fail({
    code: "source.unresolved_match",
    message,
    module: "source",
    retryable: false,
  });
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
