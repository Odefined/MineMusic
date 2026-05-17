import type {
  MaterialEvidence,
  MusicMaterial,
  PlayableLink,
  Ref,
  Result,
  SourceProvider,
  StageError,
} from "../../contracts/index.js";

export const defaultNetEaseBaseUrl = "http://127.0.0.1:1300";

export type NetEaseRequestInput = {
  path: string;
  query: Record<string, string>;
};

export type NetEaseSourceProviderOptions = {
  baseUrl?: string;
  requestJson?: (input: NetEaseRequestInput) => Promise<Result<unknown>>;
};

type NetEaseSong = {
  id?: unknown;
  name?: unknown;
  artists?: unknown;
  ar?: unknown;
  album?: unknown;
  al?: unknown;
  fee?: unknown;
  noCopyrightRcmd?: unknown;
};

type NetEaseAlbum = {
  name?: unknown;
};

type NetEaseArtist = {
  name?: unknown;
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

function createDefaultRequester(baseUrl: string): (input: NetEaseRequestInput) => Promise<Result<unknown>> {
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

function findNetEaseTrackRef(refs: Ref[]): Ref | undefined {
  return refs.find((ref) => ref.namespace === "source:netease" && ref.kind === "track");
}

function isNetEasePlayableLink(link: PlayableLink): boolean {
  return link.sourceRef.namespace === "source:netease" && link.sourceRef.kind === "track";
}

function toSongUrl(songId: string): string {
  return `https://music.163.com/#/song?id=${encodeURIComponent(songId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
