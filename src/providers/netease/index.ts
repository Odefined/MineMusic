import type {
  InstrumentProviderDescriptor,
  MaterialEvidence,
  MusicMaterial,
  PlayableLink,
  PlatformLibraryAccountIdentity,
  PlatformLibraryArea,
  PlatformLibraryCount,
  PlatformLibraryIssue,
  PlatformLibraryItem,
  PlatformLibraryPreviewArea,
  PlatformLibrarySample,
  PlatformLibraryReadAreaResult,
  PlatformLibraryReadPageResult,
  PlatformLibraryProvider,
  Ref,
  Result,
  SourceMaterial,
  SourceProvider,
  SourceReleaseTracklistItem,
  SourceReleaseTrackPosition,
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
  cd?: unknown;
  no?: unknown;
};

type NetEaseAlbum = {
  id?: unknown;
  name?: unknown;
  artists?: unknown;
  artist?: unknown;
  publishTime?: unknown;
  subTime?: unknown;
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
      kind: "unresolved";
      issue: PlatformLibraryIssue;
    };

type NetEasePayloadResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      issue: PlatformLibraryIssue;
    };

type NetEasePreviewAreaOutcome = Omit<PlatformLibraryPreviewArea, "area">;

type NetEaseReadAreaOutcome = Omit<PlatformLibraryReadAreaResult, "area">;

type NetEaseReadPageOutcome = Omit<PlatformLibraryReadPageResult, "providerId" | "account">;

type NetEasePaginatedRead = {
  status: "complete" | "partial" | "failed";
  items: Record<string, unknown>[];
  issues?: PlatformLibraryIssue[];
};

type NetEaseAlbumContext = {
  releaseDate?: string;
  trackPositions: Map<string, SourceReleaseTrackPosition>;
  tracklist?: SourceReleaseTracklistItem[];
};

type NetEaseLikedPlaylistTrackEntry = {
  id: string;
  providerAddedAt?: string;
};

const readablePlatformLibraryAreas: PlatformLibraryArea[] = [
  "saved_source_tracks",
  "saved_source_releases",
  "saved_source_artists",
];

const unsupportedPlatformLibraryAreas: PlatformLibraryArea[] = [
  "playlists",
  "listening_history",
];

const netEasePageLimit = 100;
const netEaseSongDetailBatchSize = 1000;

export const netEaseSourceProviderDescriptor: InstrumentProviderDescriptor = {
  id: "netease",
  label: "NetEase Cloud Music",
  slot: "source",
  status: "available",
  authentication: "none",
  operations: ["search", "refresh_playable_links"],
};

export const netEasePlatformLibraryProviderDescriptor: InstrumentProviderDescriptor = {
  id: "netease",
  label: "NetEase Cloud Music",
  slot: "platform_library",
  status: "available",
  authentication: "required",
  operations: ["preview", "import", "update"],
  areas: [
    {
      id: "saved_source_tracks",
      label: "Saved songs",
      availability: "readable",
      ordering: "newest_first",
    },
    {
      id: "saved_source_releases",
      label: "Saved albums",
      availability: "readable",
      ordering: "newest_first",
    },
    {
      id: "saved_source_artists",
      label: "Followed artists",
      availability: "readable",
      ordering: "newest_first",
    },
    {
      id: "playlists",
      label: "Playlists",
      availability: "unsupported",
    },
    {
      id: "listening_history",
      label: "Listening history",
      availability: "unsupported",
    },
  ],
};

export function createNetEaseSourceProvider({
  baseUrl = defaultNetEaseBaseUrl,
  requestJson = createDefaultRequester(baseUrl),
}: NetEaseSourceProviderOptions = {}): SourceProvider {
  return {
    id: "netease",
    descriptor: netEaseSourceProviderDescriptor,

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
    descriptor: netEasePlatformLibraryProviderDescriptor,

    async preview(input) {
      const account = await resolveNetEaseAccount(requestJson, input.providerAccountId);
      const issues = account.kind === "unresolved" ? [account.issue] : [];
      const requestedAreas = requestedPreviewAreas(input.areas, input.discovery);
      const sampleLimit = normalizedSampleLimit(input.sampleLimitPerArea);
      const areas =
        account.kind === "resolved"
          ? await previewPlatformLibraryAreas(
              requestJson,
              account.account.providerAccountId,
              requestedAreas,
              sampleLimit,
            )
          : [];

      return ok({
        providerId: "netease",
        ...(account.kind === "resolved" ? { account: account.account } : {}),
        areas,
        ...(issues.length === 0 ? {} : { issues }),
      });
    },

    async readItems(input) {
      const account = await resolveNetEaseAccount(requestJson, input.providerAccountId);
      const issues = account.kind === "unresolved" ? [account.issue] : [];
      const sampleLimit = normalizedReadSampleLimit(input.sampleLimitPerArea);
      const areas =
        account.kind === "resolved"
          ? await readPlatformLibraryAreas(requestJson, account.account.providerAccountId, input.areas, sampleLimit)
          : [];

      return ok({
        providerId: "netease",
        ...(account.kind === "resolved" ? { account: account.account } : {}),
        areas,
        ...(issues.length === 0 ? {} : { issues }),
      });
    },

    async readPage(input) {
      const account = await resolveNetEaseAccount(requestJson, input.providerAccountId);
      const issues = account.kind === "unresolved" ? [account.issue] : [];
      const page =
        account.kind === "resolved"
          ? await readPlatformLibraryPage(
              requestJson,
              account.account.providerAccountId,
              input.area,
              input.pageSize,
              input.sampleLimitRemaining,
              input.providerState,
            )
          : {
              area: input.area,
              status: "unavailable" as const,
              items: [],
              hasMore: false,
              issues: [] as PlatformLibraryIssue[],
            };

      return ok({
        providerId: "netease",
        ...(account.kind === "resolved" ? { account: account.account } : {}),
        ...page,
        ...(issues.length === 0 ? {} : { issues: [...(page.issues ?? []), ...issues] }),
      });
    },
  };
}

function requestedPreviewAreas(
  areas: PlatformLibraryArea[] | undefined,
  discovery: boolean | undefined,
): PlatformLibraryArea[] {
  if (areas !== undefined) {
    return areas;
  }

  return discovery === true
    ? [...readablePlatformLibraryAreas, ...unsupportedPlatformLibraryAreas]
    : [...readablePlatformLibraryAreas];
}

async function previewPlatformLibraryAreas(
  requestJson: NetEaseRequester,
  providerAccountId: string,
  areas: PlatformLibraryArea[],
  sampleLimit: number,
): Promise<PlatformLibraryPreviewArea[]> {
  const results: PlatformLibraryPreviewArea[] = [];

  for (const area of areas) {
    if (area === "saved_source_tracks") {
      const preview = await previewSavedRecordings(requestJson, providerAccountId, sampleLimit);

      results.push({
        area,
        ...preview,
      });
    }

    if (area === "saved_source_releases") {
      const preview = await previewSavedReleases(requestJson, sampleLimit);

      results.push({
        area,
        ...preview,
      });
    }

    if (area === "saved_source_artists") {
      const preview = await previewSavedArtists(requestJson, sampleLimit);

      results.push({
        area,
        ...preview,
      });
    }

    if (unsupportedPlatformLibraryAreas.includes(area)) {
      results.push({
        area,
        availability: "unsupported",
        issues: [scopeUnsupportedIssue(area)],
      });
    }
  }

  return results;
}

function readablePreviewArea(
  count: PlatformLibraryCount,
  samples: PlatformLibrarySample[],
): NetEasePreviewAreaOutcome {
  return {
    availability: "readable",
    count,
    ...(samples.length === 0 ? {} : { samples }),
  };
}

function unavailablePreviewArea(issue: PlatformLibraryIssue): NetEasePreviewAreaOutcome {
  return {
    availability: "unavailable",
    issues: [issue],
  };
}

function platformIssue(
  code: PlatformLibraryIssue["code"],
  message: string,
  retryable: boolean,
  area?: PlatformLibraryArea,
  details?: Record<string, unknown>,
): PlatformLibraryIssue {
  return {
    code,
    message,
    retryable,
    ...(area === undefined ? {} : { area }),
    ...(details === undefined ? {} : { details }),
  };
}

function scopeUnsupportedIssue(area: PlatformLibraryArea): PlatformLibraryIssue {
  return platformIssue(
    "scope_unsupported",
    `NetEase platform-library provider does not support '${area}' in this implementation slice.`,
    false,
    area,
  );
}

function areaUnavailableIssue(area?: PlatformLibraryArea, message?: string): PlatformLibraryIssue {
  return platformIssue(
    "area_unavailable",
    message ?? "NetEase platform-library provider could not read from the local API session.",
    true,
    area,
  );
}

function partialReadIssue(area: PlatformLibraryArea): PlatformLibraryIssue {
  return platformIssue(
    "partial_read",
    `NetEase platform-library provider only read part of '${area}' before the local API stopped returning data.`,
    true,
    area,
  );
}

function loginRequiredIssue(area?: PlatformLibraryArea): PlatformLibraryIssue {
  return platformIssue(
    "login_required",
    "NetEase account identity could not be proven by the local API session.",
    true,
    area,
  );
}

function malformedResponseIssue(area?: PlatformLibraryArea, message?: string): PlatformLibraryIssue {
  return platformIssue(
    "malformed_response",
    message ?? "NetEase local API returned a malformed response.",
    false,
    area,
  );
}

function rateLimitedIssue(area?: PlatformLibraryArea, message?: string): PlatformLibraryIssue {
  return platformIssue(
    "rate_limited",
    message ?? "NetEase local API rate-limited the request.",
    true,
    area,
  );
}

function timeoutIssue(area?: PlatformLibraryArea, message?: string): PlatformLibraryIssue {
  return platformIssue(
    "timeout",
    message ?? "NetEase local API request timed out.",
    true,
    area,
  );
}

function providerUnavailableIssue(
  area?: PlatformLibraryArea,
  message?: string,
  details?: Record<string, unknown>,
): PlatformLibraryIssue {
  return platformIssue(
    "provider_unavailable",
    message ?? "NetEase local API is unavailable.",
    true,
    area,
    details,
  );
}

function issueFromStageError(error: StageError, area?: PlatformLibraryArea): PlatformLibraryIssue {
  const text = `${error.code} ${error.message}`.toLowerCase();
  const details = { sourceErrorCode: error.code };

  if (includesAny(text, ["rate_limited", "rate-limited", "too many", "429"])) {
    return rateLimitedIssue(area, error.message);
  }

  if (includesAny(text, ["timeout", "timed out", "etimedout", "408", "504"])) {
    return timeoutIssue(area, error.message);
  }

  if (includesAny(text, ["login_required", "unauthorized", "forbidden", "401", "403"])) {
    return loginRequiredIssue(area);
  }

  if (includesAny(text, ["malformed", "invalid json", "bad response"])) {
    return malformedResponseIssue(area, error.message);
  }

  if (
    includesAny(text, [
      "provider_unavailable",
      "unavailable",
      "http",
      "fetch",
      "econnrefused",
      "enotfound",
      "econnreset",
    ])
  ) {
    return providerUnavailableIssue(area, error.message, details);
  }

  return area === undefined
    ? providerUnavailableIssue(undefined, error.message, details)
    : areaUnavailableIssue(area, error.message);
}

function issueFromNetEasePayload(payload: unknown, area: PlatformLibraryArea): PlatformLibraryIssue | undefined {
  if (!isRecord(payload)) {
    return malformedResponseIssue(area);
  }

  const code = payload.code;
  const message = toNonEmptyString(payload.message ?? payload.msg);

  if (typeof code !== "number" || code === 200) {
    return undefined;
  }

  if (code === 429 || code === 405) {
    return rateLimitedIssue(area, message);
  }

  if (code === 301 || code === 401 || code === 403) {
    return loginRequiredIssue(area);
  }

  if (code === 408 || code === 504) {
    return timeoutIssue(area, message);
  }

  if (code >= 500) {
    return providerUnavailableIssue(area, message, { netEaseCode: code });
  }

  return areaUnavailableIssue(area, message);
}

function includesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function normalizedSampleLimit(sampleLimitPerArea: number | undefined): number {
  if (sampleLimitPerArea === undefined) {
    return 3;
  }

  if (!Number.isFinite(sampleLimitPerArea) || sampleLimitPerArea <= 0) {
    return 0;
  }

  return Math.floor(sampleLimitPerArea);
}

function normalizedReadSampleLimit(sampleLimitPerArea: number | undefined): number | undefined {
  if (sampleLimitPerArea === undefined) {
    return undefined;
  }

  if (!Number.isFinite(sampleLimitPerArea) || sampleLimitPerArea <= 0) {
    return 0;
  }

  return Math.floor(sampleLimitPerArea);
}

function pageOffsetFromProviderState(providerState: unknown): number {
  if (!isRecord(providerState) || typeof providerState.offset !== "number") {
    return 0;
  }

  if (!Number.isFinite(providerState.offset) || providerState.offset < 0) {
    return 0;
  }

  return Math.floor(providerState.offset);
}

async function previewSavedRecordings(
  requestJson: NetEaseRequester,
  providerAccountId: string,
  sampleLimit: number,
): Promise<NetEasePreviewAreaOutcome> {
  const liked = await readLikedPlaylistTrackEntries(requestJson, providerAccountId, "saved_source_tracks");

  if (!liked.ok) {
    return unavailablePreviewArea(liked.issue);
  }

  const samples = sampleLimit === 0
    ? []
    : await readRecordingSamples(requestJson, liked.value.entries.slice(0, sampleLimit));

  return readablePreviewArea({ certainty: "exact", value: liked.value.count }, samples);
}

async function readRecordingSamples(
  requestJson: NetEaseRequester,
  entries: NetEaseLikedPlaylistTrackEntry[],
): Promise<PlatformLibrarySample[]> {
  if (entries.length === 0) {
    return [];
  }

  const ids = entries.map((entry) => entry.id);

  const details = await requestJson({
    path: "/song/detail",
    query: { ids: ids.join(",") },
  });

  if (!details.ok) {
    return [];
  }

  const songs = extractSongsFromDetailResult(details.value, "saved_source_tracks");

  if (!songs.ok) {
    return [];
  }

  const songsById = new Map(
    songs.value
      .map((song) => {
        const songId = toStringId(song.id);
        return songId === undefined ? undefined : ([songId, song] as const);
      })
      .filter((entry): entry is readonly [string, NetEaseSong] => entry !== undefined),
  );

  return entries
    .map((entry) => {
      const song = songsById.get(entry.id);
      return song === undefined ? undefined : toSavedRecordingItem(song, undefined, entry.providerAddedAt);
    })
    .filter(isDefined)
    .map(toPreviewSample);
}

async function previewSavedReleases(
  requestJson: NetEaseRequester,
  sampleLimit: number,
): Promise<NetEasePreviewAreaOutcome> {
  const albums = await requestJson({
    path: "/album/sublist",
    query: { limit: String(Math.max(sampleLimit, 1)), offset: "0" },
  });

  if (!albums.ok) {
    return unavailablePreviewArea(issueFromStageError(albums.error, "saved_source_releases"));
  }

  const albumPayload = extractArrayPayloadResult(albums.value, ["data", "albums"], "saved_source_releases");

  if (!albumPayload.ok) {
    return unavailablePreviewArea(albumPayload.issue);
  }

  const items = albumPayload.value
    .map((album) => toSavedReleaseItem(album))
    .filter(isDefined);

  return readablePreviewArea(
    countFromPayload(albums.value, ["count"], ["data", "albums"]),
    items.slice(0, sampleLimit).map(toPreviewSample),
  );
}

async function previewSavedArtists(
  requestJson: NetEaseRequester,
  sampleLimit: number,
): Promise<NetEasePreviewAreaOutcome> {
  const artists = await requestJson({
    path: "/artist/sublist",
    query: { limit: String(Math.max(sampleLimit, 1)), offset: "0" },
  });

  if (!artists.ok) {
    return unavailablePreviewArea(issueFromStageError(artists.error, "saved_source_artists"));
  }

  const artistPayload = extractArrayPayloadResult(artists.value, ["data", "artists"], "saved_source_artists");

  if (!artistPayload.ok) {
    return unavailablePreviewArea(artistPayload.issue);
  }

  const items = artistPayload.value
    .map(toFollowedArtistItem)
    .filter(isDefined);

  return readablePreviewArea(
    countFromPayload(artists.value, ["count"], ["data", "artists"]),
    items.slice(0, sampleLimit).map(toPreviewSample),
  );
}

async function readPlatformLibraryAreas(
  requestJson: NetEaseRequester,
  providerAccountId: string,
  areas: PlatformLibraryArea[],
  sampleLimit: number | undefined,
): Promise<PlatformLibraryReadAreaResult[]> {
  const results: PlatformLibraryReadAreaResult[] = [];

  for (const area of areas) {
    if (area === "saved_source_tracks") {
      results.push({
        area,
        ...(await readSavedRecordings(requestJson, providerAccountId, sampleLimit)),
      });
    }

    if (area === "saved_source_releases") {
      results.push({
        area,
        ...(await readSavedReleases(requestJson, sampleLimit)),
      });
    }

    if (area === "saved_source_artists") {
      results.push({
        area,
        ...(await readSavedArtists(requestJson, sampleLimit)),
      });
    }

    if (unsupportedPlatformLibraryAreas.includes(area)) {
      results.push({
        area,
        status: "unavailable",
        items: [],
        issues: [scopeUnsupportedIssue(area)],
      });
    }
  }

  return results;
}

async function readPlatformLibraryPage(
  requestJson: NetEaseRequester,
  _providerAccountId: string,
  area: PlatformLibraryArea,
  pageSize: number,
  sampleLimitRemaining: number | undefined,
  providerState: unknown,
): Promise<NetEaseReadPageOutcome> {
  if (area === "saved_source_releases") {
    return readSavedReleasesPage(requestJson, area, pageSize, sampleLimitRemaining, providerState);
  }

  if (area === "saved_source_tracks") {
    return readSavedRecordingsPage(
      requestJson,
      _providerAccountId,
      area,
      pageSize,
      sampleLimitRemaining,
      providerState,
    );
  }

  if (area === "saved_source_artists") {
    return readSavedArtistsPage(requestJson, area, pageSize, sampleLimitRemaining, providerState);
  }

  if (unsupportedPlatformLibraryAreas.includes(area)) {
    return {
      area,
      status: "unavailable",
      items: [],
      hasMore: false,
      issues: [scopeUnsupportedIssue(area)],
    };
  }

  return {
    area,
    status: "unavailable",
    items: [],
    hasMore: false,
    issues: [scopeUnsupportedIssue(area)],
  };
}

async function readSavedRecordings(
  requestJson: NetEaseRequester,
  providerAccountId: string,
  sampleLimit: number | undefined,
): Promise<NetEaseReadAreaOutcome> {
  const liked = await readLikedPlaylistTrackEntries(requestJson, providerAccountId, "saved_source_tracks");

  if (!liked.ok) {
    return failedReadArea("saved_source_tracks", liked.issue);
  }

  const entriesToRead = sampleLimit === undefined
    ? liked.value.entries
    : liked.value.entries.slice(0, sampleLimit);

  if (entriesToRead.length === 0) {
    return completeReadArea([]);
  }

  const items: PlatformLibraryItem[] = [];
  const albumContexts = new Map<string, NetEaseAlbumContext | null>();

  for (const batch of chunks(entriesToRead, netEaseSongDetailBatchSize)) {
    const details = await requestJson({
      path: "/song/detail",
      query: { ids: batch.map((entry) => entry.id).join(",") },
    });

    if (!details.ok) {
      const issue = issueFromStageError(details.error, "saved_source_tracks");

      return items.length === 0
        ? failedReadArea("saved_source_tracks", issue)
        : partialReadArea("saved_source_tracks", items, issue);
    }

    const songs = extractSongsFromDetailResult(details.value, "saved_source_tracks");

    if (!songs.ok) {
      return items.length === 0
        ? failedReadArea("saved_source_tracks", songs.issue)
        : partialReadArea("saved_source_tracks", items, songs.issue);
    }

    await ensureAlbumContextsForSongs(requestJson, songs.value, albumContexts);
    const songsById = new Map(
      songs.value
        .map((song) => {
          const songId = toStringId(song.id);
          return songId === undefined ? undefined : ([songId, song] as const);
        })
        .filter((entry): entry is readonly [string, NetEaseSong] => entry !== undefined),
    );
    items.push(
      ...batch
        .map((entry) => {
          const song = songsById.get(entry.id);
          return song === undefined
            ? undefined
            : toSavedRecordingItem(song, albumContextForSong(song, albumContexts), entry.providerAddedAt);
        })
        .filter(isDefined),
    );
  }

  return completeReadArea(items);
}

async function readSavedReleases(
  requestJson: NetEaseRequester,
  sampleLimit?: number,
): Promise<NetEaseReadAreaOutcome> {
  const albums = await readPaginatedItems(
    requestJson,
    "/album/sublist",
    ["data", "albums"],
    "saved_source_releases",
    sampleLimit,
  );
  const albumContexts = new Map<string, NetEaseAlbumContext | null>();

  await ensureAlbumContextsForAlbums(requestJson, albums.items, albumContexts);

  return {
    status: albums.status,
    items: albums.items
      .map((album) => toSavedReleaseItem(album, albumContextForAlbum(album, albumContexts)))
      .filter(isDefined),
    ...(albums.issues === undefined ? {} : { issues: albums.issues }),
  };
}

async function readSavedRecordingsPage(
  requestJson: NetEaseRequester,
  providerAccountId: string,
  area: PlatformLibraryArea,
  pageSize: number,
  sampleLimitRemaining: number | undefined,
  providerState: unknown,
): Promise<NetEaseReadPageOutcome> {
  const liked = await readLikedPlaylistTrackEntries(requestJson, providerAccountId, area);

  if (!liked.ok) {
    return {
      area,
      status: "failed",
      items: [],
      hasMore: false,
      issues: [liked.issue],
    };
  }

  const offset = pageOffsetFromProviderState(providerState);
  const requestSize = Math.max(
    Math.min(
      pageSize,
      sampleLimitRemaining === undefined ? pageSize : sampleLimitRemaining,
      Math.max(liked.value.entries.length - offset, 0),
    ),
    0,
  );
  const entriesToRead = requestSize === 0 ? [] : liked.value.entries.slice(offset, offset + requestSize);

  if (entriesToRead.length === 0) {
    return {
      area,
      status: "complete",
      items: [],
      count: { certainty: "exact", value: liked.value.count },
      hasMore: false,
    };
  }

  const items: PlatformLibraryItem[] = [];
  const albumContexts = new Map<string, NetEaseAlbumContext | null>();
  let processedEntryCount = 0;

  for (const batch of chunks(entriesToRead, netEaseSongDetailBatchSize)) {
    const details = await requestJson({
      path: "/song/detail",
      query: { ids: batch.map((entry) => entry.id).join(",") },
    });

    if (!details.ok) {
      const issue = issueFromStageError(details.error, area);

      return items.length === 0
        ? {
            area,
            status: "failed",
            items: [],
            count: { certainty: "exact", value: liked.value.count },
            hasMore: false,
            issues: [issue],
          }
        : {
            area,
            status: "partial",
            items,
            count: { certainty: "exact", value: liked.value.count },
            hasMore: true,
            providerState: { offset: offset + processedEntryCount },
            issues: [partialReadIssue(area), issue],
          };
    }

    const songs = extractSongsFromDetailResult(details.value, area);

    if (!songs.ok) {
      return items.length === 0
        ? {
            area,
            status: "failed",
            items: [],
            count: { certainty: "exact", value: liked.value.count },
            hasMore: false,
            issues: [songs.issue],
          }
        : {
            area,
            status: "partial",
            items,
            count: { certainty: "exact", value: liked.value.count },
            hasMore: true,
            providerState: { offset: offset + processedEntryCount },
            issues: [partialReadIssue(area), songs.issue],
          };
    }

    await ensureAlbumContextsForSongs(requestJson, songs.value, albumContexts);
    const songsById = new Map(
      songs.value
        .map((song) => {
          const songId = toStringId(song.id);
          return songId === undefined ? undefined : ([songId, song] as const);
        })
        .filter((entry): entry is readonly [string, NetEaseSong] => entry !== undefined),
    );
    items.push(
      ...batch
        .map((entry) => {
          const song = songsById.get(entry.id);
          return song === undefined
            ? undefined
            : toSavedRecordingItem(song, albumContextForSong(song, albumContexts), entry.providerAddedAt);
        })
        .filter(isDefined),
    );
    processedEntryCount += batch.length;
  }

  const nextOffset = offset + entriesToRead.length;

  return {
    area,
    status: "complete",
    items,
    count: { certainty: "exact", value: liked.value.count },
    hasMore: nextOffset < liked.value.entries.length,
    ...(nextOffset < liked.value.entries.length ? { providerState: { offset: nextOffset } } : {}),
  };
}

async function readSavedReleasesPage(
  requestJson: NetEaseRequester,
  area: PlatformLibraryArea,
  pageSize: number,
  sampleLimitRemaining: number | undefined,
  providerState: unknown,
): Promise<NetEaseReadPageOutcome> {
  const albums = await readPaginatedItemPage(
    requestJson,
    "/album/sublist",
    ["data", "albums"],
    area,
    pageSize,
    sampleLimitRemaining,
    providerState,
  );
  const albumContexts = new Map<string, NetEaseAlbumContext | null>();

  await ensureAlbumContextsForAlbums(requestJson, albums.items, albumContexts);

  return {
    area,
    status: albums.status,
    items: albums.items
      .map((album) => toSavedReleaseItem(album, albumContextForAlbum(album, albumContexts)))
      .filter(isDefined),
    hasMore: albums.hasMore,
    ...(albums.count === undefined ? {} : { count: albums.count }),
    ...(albums.providerState === undefined ? {} : { providerState: albums.providerState }),
    ...(albums.issues === undefined ? {} : { issues: albums.issues }),
  };
}

async function readSavedArtists(
  requestJson: NetEaseRequester,
  sampleLimit?: number,
): Promise<NetEaseReadAreaOutcome> {
  const artists = await readPaginatedItems(
    requestJson,
    "/artist/sublist",
    ["data", "artists"],
    "saved_source_artists",
    sampleLimit,
  );

  return {
    status: artists.status,
    items: artists.items.map(toFollowedArtistItem).filter(isDefined),
    ...(artists.issues === undefined ? {} : { issues: artists.issues }),
  };
}

async function readSavedArtistsPage(
  requestJson: NetEaseRequester,
  area: PlatformLibraryArea,
  pageSize: number,
  sampleLimitRemaining: number | undefined,
  providerState: unknown,
): Promise<NetEaseReadPageOutcome> {
  const artists = await readPaginatedItemPage(
    requestJson,
    "/artist/sublist",
    ["data", "artists"],
    area,
    pageSize,
    sampleLimitRemaining,
    providerState,
  );

  return {
    area,
    status: artists.status,
    items: artists.items.map(toFollowedArtistItem).filter(isDefined),
    hasMore: artists.hasMore,
    ...(artists.count === undefined ? {} : { count: artists.count }),
    ...(artists.providerState === undefined ? {} : { providerState: artists.providerState }),
    ...(artists.issues === undefined ? {} : { issues: artists.issues }),
  };
}

async function readPaginatedItems(
  requestJson: NetEaseRequester,
  path: string,
  arrayKeys: string[],
  area: PlatformLibraryArea,
  sampleLimit?: number,
): Promise<NetEasePaginatedRead> {
  const items: Record<string, unknown>[] = [];
  let offset = 0;
  let expectedCount: number | undefined;

  while (true) {
    const requestLimit =
      sampleLimit === undefined
        ? netEasePageLimit
        : Math.max(Math.min(netEasePageLimit, sampleLimit - items.length), 1);
    const response = await requestJson({
      path,
      query: { limit: String(requestLimit), offset: String(offset) },
    });

    if (!response.ok) {
      const issue = issueFromStageError(response.error, area);

      return items.length === 0
        ? { status: "failed", items: [], issues: [issue] }
        : { status: "partial", items, issues: [partialReadIssue(area), issue] };
    }

    const page = extractArrayPayloadResult(response.value, arrayKeys, area);

    if (!page.ok) {
      return items.length === 0
        ? { status: "failed", items: [], issues: [page.issue] }
        : { status: "partial", items, issues: [partialReadIssue(area), page.issue] };
    }

    items.push(...page.value);

    if (sampleLimit !== undefined && items.length >= sampleLimit) {
      return { status: "complete", items: items.slice(0, sampleLimit) };
    }

    expectedCount ??= extractExactCount(response.value, ["count"]);

    if (page.value.length === 0) {
      if (expectedCount !== undefined && items.length < expectedCount) {
        return { status: "partial", items, issues: [partialReadIssue(area)] };
      }

      return { status: "complete", items };
    }

    if (expectedCount !== undefined && items.length >= expectedCount) {
      return { status: "complete", items };
    }

    if (expectedCount === undefined && page.value.length < netEasePageLimit) {
      return { status: "complete", items };
    }

    offset += netEasePageLimit;
  }
}

async function readPaginatedItemPage(
  requestJson: NetEaseRequester,
  path: string,
  arrayKeys: string[],
  area: PlatformLibraryArea,
  pageSize: number,
  sampleLimitRemaining: number | undefined,
  providerState: unknown,
): Promise<{
  status: PlatformLibraryReadAreaResult["status"];
  items: Record<string, unknown>[];
  count?: PlatformLibraryCount;
  providerState?: unknown;
  hasMore: boolean;
  issues?: PlatformLibraryIssue[];
}> {
  const offset = pageOffsetFromProviderState(providerState);
  const requestLimit = Math.max(
    Math.min(
      netEasePageLimit,
      pageSize,
      sampleLimitRemaining === undefined ? pageSize : sampleLimitRemaining,
    ),
    1,
  );
  const response = await requestJson({
    path,
    query: { limit: String(requestLimit), offset: String(offset) },
  });

  if (!response.ok) {
    return {
      status: "failed",
      items: [],
      hasMore: false,
      issues: [issueFromStageError(response.error, area)],
    };
  }

  const page = extractArrayPayloadResult(response.value, arrayKeys, area);

  if (!page.ok) {
    return {
      status: "failed",
      items: [],
      hasMore: false,
      issues: [page.issue],
    };
  }

  const exactCount = extractExactCount(response.value, ["count"]);
  const nextOffset = offset + page.value.length;
  const hasMore = exactCount !== undefined
    ? nextOffset < exactCount
    : page.value.length >= requestLimit;

  return {
    status: "complete",
    items: page.value,
    hasMore,
    ...(exactCount === undefined ? {} : { count: { certainty: "exact" as const, value: exactCount } }),
    ...(hasMore ? { providerState: { offset: nextOffset } } : {}),
  };
}

function completeReadArea(items: PlatformLibraryItem[]): NetEaseReadAreaOutcome {
  return {
    status: "complete",
    items,
  };
}

function failedReadArea(
  area: PlatformLibraryArea,
  issue: PlatformLibraryIssue = areaUnavailableIssue(area),
): NetEaseReadAreaOutcome {
  return {
    status: "failed",
    items: [],
    issues: [issue],
  };
}

function partialReadArea(
  area: PlatformLibraryArea,
  items: PlatformLibraryItem[],
  issue?: PlatformLibraryIssue,
): NetEaseReadAreaOutcome {
  return {
    status: "partial",
    items,
    issues: issue === undefined ? [partialReadIssue(area)] : [partialReadIssue(area), issue],
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
    return { kind: "unresolved", issue: issueFromStageError(response.error) };
  }

  const account = extractAccountIdentity(response.value);

  if (!account.ok) {
    return { kind: "unresolved", issue: account.issue };
  }

  if (
    requestedProviderAccountId !== undefined &&
    account.value.providerAccountId !== requestedProviderAccountId
  ) {
    return { kind: "unresolved", issue: loginRequiredIssue() };
  }

  return {
    kind: "resolved",
    account: account.value,
  };
}

function extractAccountIdentity(payload: unknown): NetEasePayloadResult<PlatformLibraryAccountIdentity> {
  if (!isRecord(payload)) {
    return { ok: false, issue: malformedResponseIssue(undefined, "NetEase login status response was not an object.") };
  }

  const data = isRecord(payload.data) ? payload.data : payload;
  const hasProfileField = Object.hasOwn(data, "profile");
  const hasAccountField = Object.hasOwn(data, "account");

  if (!hasProfileField && !hasAccountField) {
    return { ok: false, issue: malformedResponseIssue(undefined, "NetEase login status did not include account fields.") };
  }

  const profile = isRecord(data.profile) ? data.profile : undefined;
  const account = isRecord(data.account) ? data.account : undefined;
  const accountId = isAnonymousAccount(account) ? undefined : account?.id;
  const providerAccountId = toStringId(profile?.userId ?? accountId);

  if (providerAccountId === undefined) {
    return { ok: false, issue: loginRequiredIssue() };
  }

  const label = toNonEmptyString(profile?.nickname ?? account?.userName);

  return {
    ok: true,
    value: {
      providerAccountId,
      stable: true,
      ...(label === undefined ? {} : { label }),
    },
  };
}

function isAnonymousAccount(account: Record<string, unknown> | undefined): boolean {
  return account?.anonimousUser === true || account?.status === -10;
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

function extractSongsFromDetailResult(
  payload: unknown,
  area: PlatformLibraryArea,
): NetEasePayloadResult<NetEaseSong[]> {
  const issue = issueFromNetEasePayload(payload, area);

  if (issue !== undefined) {
    return { ok: false, issue };
  }

  if (!isRecord(payload) || !Array.isArray(payload.songs)) {
    return { ok: false, issue: malformedResponseIssue(area, "NetEase song detail response did not include songs.") };
  }

  return { ok: true, value: payload.songs.filter(isRecord) };
}

function extractSongsFromAlbumResult(payload: unknown): NetEasePayloadResult<NetEaseSong[]> {
  const issue = issueFromNetEasePayload(payload, "saved_source_tracks");

  if (issue !== undefined) {
    return { ok: false, issue };
  }

  if (!isRecord(payload)) {
    return { ok: false, issue: malformedResponseIssue("saved_source_tracks", "NetEase album response was not an object.") };
  }

  if (Array.isArray(payload.songs)) {
    return { ok: true, value: payload.songs.filter(isRecord) };
  }

  const album = isRecord(payload.album) ? payload.album : undefined;

  if (Array.isArray(album?.songs)) {
    return { ok: true, value: album.songs.filter(isRecord) };
  }

  return { ok: false, issue: malformedResponseIssue("saved_source_tracks", "NetEase album response did not include songs.") };
}

function extractIdListResult(
  payload: unknown,
  area: PlatformLibraryArea,
): NetEasePayloadResult<string[]> {
  const issue = issueFromNetEasePayload(payload, area);

  if (issue !== undefined) {
    return { ok: false, issue };
  }

  if (!isRecord(payload) || !Array.isArray(payload.ids)) {
    return { ok: false, issue: malformedResponseIssue(area, "NetEase liked-song response did not include ids.") };
  }

  return {
    ok: true,
    value: payload.ids.map(toStringId).filter((id): id is string => id !== undefined),
  };
}

async function readLikedPlaylistTrackEntries(
  requestJson: NetEaseRequester,
  providerAccountId: string,
  area: PlatformLibraryArea,
): Promise<NetEasePayloadResult<{ entries: NetEaseLikedPlaylistTrackEntry[]; count: number }>> {
  const playlists = await requestJson({
    path: "/user/playlist",
    query: { uid: providerAccountId },
  });

  if (!playlists.ok) {
    return { ok: false, issue: issueFromStageError(playlists.error, area) };
  }

  const likedPlaylistId = extractLikedPlaylistIdResult(playlists.value, area);

  if (!likedPlaylistId.ok) {
    return likedPlaylistId;
  }

  const detail = await requestJson({
    path: "/playlist/detail",
    query: { id: likedPlaylistId.value },
  });

  if (!detail.ok) {
    return { ok: false, issue: issueFromStageError(detail.error, area) };
  }

  return extractLikedPlaylistTrackEntriesResult(detail.value, area);
}

function extractLikedPlaylistIdResult(
  payload: unknown,
  area: PlatformLibraryArea,
): NetEasePayloadResult<string> {
  const issue = issueFromNetEasePayload(payload, area);

  if (issue !== undefined) {
    return { ok: false, issue };
  }

  if (!isRecord(payload) || !Array.isArray(payload.playlist)) {
    return {
      ok: false,
      issue: malformedResponseIssue(area, "NetEase user playlist response did not include playlists."),
    };
  }

  const likedPlaylist = payload.playlist
    .filter(isRecord)
    .find((playlist) => playlist.specialType === 5);
  const likedPlaylistId = likedPlaylist === undefined ? undefined : toStringId(likedPlaylist.id);

  return likedPlaylistId === undefined
    ? {
        ok: false,
        issue: malformedResponseIssue(area, "NetEase user playlist response did not include liked-music playlist."),
      }
    : { ok: true, value: likedPlaylistId };
}

function extractLikedPlaylistTrackEntriesResult(
  payload: unknown,
  area: PlatformLibraryArea,
): NetEasePayloadResult<{ entries: NetEaseLikedPlaylistTrackEntry[]; count: number }> {
  const issue = issueFromNetEasePayload(payload, area);

  if (issue !== undefined) {
    return { ok: false, issue };
  }

  if (!isRecord(payload) || !isRecord(payload.playlist) || !Array.isArray(payload.playlist.trackIds)) {
    return {
      ok: false,
      issue: malformedResponseIssue(area, "NetEase liked-playlist detail did not include trackIds."),
    };
  }

  const entries = payload.playlist.trackIds
    .filter(isRecord)
    .map((track) => {
      const id = toStringId(track.id);

      if (id === undefined) {
        return undefined;
      }

      const providerAddedAt = epochMillisecondsToIsoString(track.at);

      return {
        id,
        ...(providerAddedAt === undefined ? {} : { providerAddedAt }),
      };
    })
    .filter((entry): entry is NetEaseLikedPlaylistTrackEntry => entry !== undefined);

  const trackCount = payload.playlist.trackCount;
  const count =
    typeof trackCount === "number" && Number.isFinite(trackCount)
      ? Math.max(trackCount, entries.length)
      : entries.length;

  return {
    ok: true,
    value: { entries, count },
  };
}

function extractArrayPayloadResult(
  payload: unknown,
  keys: string[],
  area: PlatformLibraryArea,
): NetEasePayloadResult<Record<string, unknown>[]> {
  const issue = issueFromNetEasePayload(payload, area);

  if (issue !== undefined) {
    return { ok: false, issue };
  }

  if (!isRecord(payload)) {
    return { ok: false, issue: malformedResponseIssue(area) };
  }

  for (const key of keys) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return { ok: true, value: value.filter(isRecord) };
    }
  }

  return { ok: false, issue: malformedResponseIssue(area, "NetEase list response did not include an item array.") };
}

function countFromPayload(
  payload: unknown,
  countKeys: string[],
  arrayKeys: string[],
): PlatformLibraryCount {
  if (!isRecord(payload)) {
    return { certainty: "unknown" };
  }

  const exactCount = extractExactCount(payload, countKeys);

  if (exactCount !== undefined) {
    return { certainty: "exact", value: exactCount };
  }

  for (const key of arrayKeys) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return { certainty: "exact", value: value.length };
    }
  }

  return { certainty: "unknown" };
}

function extractExactCount(payload: unknown, countKeys: string[]): number | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  for (const key of countKeys) {
    const value = payload[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function toSavedRecordingItem(
  song: NetEaseSong,
  albumContext?: { releaseDate?: string; trackPosition?: SourceReleaseTrackPosition },
  providerAddedAt?: string,
): PlatformLibraryItem | undefined {
  const songId = toStringId(song.id);

  if (songId === undefined) {
    return undefined;
  }

  const label = toSongLabel(song);
  const artistLabels = toArtistNames(song);
  const artistSourceRefs = toArtistSourceRefs(song);
  const releaseLabel = firstAlbumName(song);
  const releaseSourceRef = firstAlbumSourceRef(song);
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
    itemKind: "saved_source_track",
    targetKind: "recording",
    label,
    ...(providerAddedAt === undefined ? {} : { providerAddedAt }),
    canonicalHints: {
      label: toNonEmptyString(song.name) ?? label,
      ...(artistLabels.length === 0 ? {} : { artistLabels }),
      ...(artistSourceRefs.length === 0 ? {} : { artistSourceRefs }),
      ...(releaseLabel === undefined ? {} : { releaseLabel }),
      ...(releaseSourceRef === undefined ? {} : { releaseSourceRef }),
      ...(albumContext?.releaseDate === undefined ? {} : { releaseDate: albumContext.releaseDate }),
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(albumContext?.trackPosition === undefined ? {} : { trackPosition: albumContext.trackPosition }),
    },
  };
}

function toSavedReleaseItem(
  album: Record<string, unknown>,
  albumContext?: NetEaseAlbumContext | null,
): PlatformLibraryItem | undefined {
  const albumId = toStringId(album.id);

  if (albumId === undefined) {
    return undefined;
  }

  const title = toNonEmptyString(album.name) ?? "Unresolved NetEase Album";
  const artistLabels = toAlbumArtistNames(album as NetEaseAlbum);
  const label = artistLabels.length === 0 ? title : `${title} - ${artistLabels.join(", ")}`;
  const providerAddedAt = epochMillisecondsToIsoString((album as NetEaseAlbum).subTime);

  return {
    providerId: "netease",
    sourceRef: {
      namespace: "source:netease",
      kind: "album",
      id: albumId,
      label,
      url: toAlbumUrl(albumId),
    },
    itemKind: "saved_source_release",
    targetKind: "release",
    label,
    ...(providerAddedAt === undefined ? {} : { providerAddedAt }),
    canonicalHints: {
      label: title,
      ...(artistLabels.length === 0 ? {} : { artistLabels }),
      ...(albumContext?.releaseDate === undefined ? {} : { releaseDate: albumContext.releaseDate }),
      ...(albumContext?.tracklist === undefined ? {} : { tracklist: albumContext.tracklist }),
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
    itemKind: "saved_source_artist",
    targetKind: "artist",
    label,
    canonicalHints: {
      label,
    },
  };
}

function toPreviewSample(item: PlatformLibraryItem): PlatformLibrarySample {
  return {
    label: item.label,
    itemKind: item.itemKind,
    targetKind: item.targetKind,
    ...(item.canonicalHints?.artistLabels === undefined ? {} : { artistLabels: item.canonicalHints.artistLabels }),
  };
}

function toMaterial(song: NetEaseSong): SourceMaterial {
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

function toArtistSourceRefs(song: NetEaseSong): Ref[] {
  const artists = Array.isArray(song.artists) ? song.artists : Array.isArray(song.ar) ? song.ar : [];

  return artists
    .filter(isRecord)
    .map((artist: NetEaseArtist): Ref | undefined => {
      const id = toStringId(artist.id);
      const label = toNonEmptyString(artist.name);

      return id === undefined
        ? undefined
        : {
            namespace: "source:netease",
            kind: "artist",
            id,
            ...(label === undefined ? {} : { label }),
            url: toArtistUrl(id),
          };
    })
    .filter((ref): ref is Ref => ref !== undefined);
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

function firstAlbumSourceRef(song: NetEaseSong): Ref | undefined {
  const album = isRecord(song.album) ? song.album : isRecord(song.al) ? song.al : undefined;

  if (album === undefined) {
    return undefined;
  }

  const id = toStringId((album as NetEaseAlbum).id);

  if (id === undefined) {
    return undefined;
  }

  const label = toNonEmptyString((album as NetEaseAlbum).name);

  return {
    namespace: "source:netease",
    kind: "album",
    id,
    ...(label === undefined ? {} : { label }),
    url: toAlbumUrl(id),
  };
}

async function ensureAlbumContextsForSongs(
  requestJson: NetEaseRequester,
  songs: NetEaseSong[],
  albumContexts: Map<string, NetEaseAlbumContext | null>,
): Promise<void> {
  const albumIds = new Set(
    songs
      .map(firstAlbumId)
      .filter((id): id is string => id !== undefined),
  );

  for (const albumId of albumIds) {
    if (albumContexts.has(albumId)) {
      continue;
    }

    albumContexts.set(albumId, await readAlbumTrackContext(requestJson, albumId));
  }
}

async function ensureAlbumContextsForAlbums(
  requestJson: NetEaseRequester,
  albums: Record<string, unknown>[],
  albumContexts: Map<string, NetEaseAlbumContext | null>,
): Promise<void> {
  for (const album of albums) {
    const albumId = toStringId(album.id);

    if (albumId === undefined || albumContexts.has(albumId)) {
      continue;
    }

    albumContexts.set(albumId, await readAlbumTrackContext(requestJson, albumId));
  }
}

async function readAlbumTrackContext(
  requestJson: NetEaseRequester,
  albumId: string,
): Promise<NetEaseAlbumContext | null> {
  const album = await requestJson({
    path: "/album",
    query: { id: albumId },
  });

  if (!album.ok) {
    return null;
  }

  const albumPayload = isRecord(album.value) && isRecord(album.value.album)
    ? album.value.album as NetEaseAlbum
    : undefined;
  const releaseDate = releaseDateFromNetEaseTime(albumPayload?.publishTime);
  const songs = extractSongsFromAlbumResult(album.value);

  if (!songs.ok || songs.value.length === 0) {
    return releaseDate === undefined ? null : { releaseDate, trackPositions: new Map() };
  }

  const trackPositions = new Map<string, SourceReleaseTrackPosition>();
  const trackCount = songs.value.length;
  const tracklist = songs.value
    .map((song, index) => tracklistItemFromAlbumSong(song, index, trackCount))
    .filter(isDefined);

  songs.value.forEach((song, index) => {
    const songId = toStringId(song.id);

    if (songId === undefined) {
      return;
    }

    const trackPosition = trackPositionFromAlbumSong(song, index, trackCount);

    if (trackPosition !== undefined) {
      trackPositions.set(songId, trackPosition);
    }
  });

  return releaseDate === undefined && trackPositions.size === 0 && tracklist.length === 0
    ? null
    : {
        ...(releaseDate === undefined ? {} : { releaseDate }),
        ...(tracklist.length === 0 ? {} : { tracklist }),
        trackPositions,
      };
}

function albumContextForSong(
  song: NetEaseSong,
  albumContexts: Map<string, NetEaseAlbumContext | null>,
): { releaseDate?: string; trackPosition?: SourceReleaseTrackPosition } | undefined {
  const songId = toStringId(song.id);
  const albumId = firstAlbumId(song);

  if (songId === undefined || albumId === undefined) {
    return undefined;
  }

  const albumContext = albumContexts.get(albumId);

  if (albumContext === undefined || albumContext === null) {
    return undefined;
  }

  const trackPosition = albumContext.trackPositions.get(songId);

  return albumContext.releaseDate === undefined && trackPosition === undefined
    ? undefined
    : {
        ...(albumContext.releaseDate === undefined ? {} : { releaseDate: albumContext.releaseDate }),
        ...(trackPosition === undefined ? {} : { trackPosition }),
      };
}

function albumContextForAlbum(
  album: Record<string, unknown>,
  albumContexts: Map<string, NetEaseAlbumContext | null>,
): NetEaseAlbumContext | null | undefined {
  const albumId = toStringId(album.id);

  return albumId === undefined ? undefined : albumContexts.get(albumId);
}

function releaseDateFromNetEaseTime(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  // NetEase stores album publishTime as a China-local release date; MusicBrainz
  // release dates are date-only values, so normalize to the same calendar day.
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

function trackPositionFromAlbumSong(
  song: NetEaseSong,
  index: number,
  trackCount: number,
): SourceReleaseTrackPosition | undefined {
  const discNumber = toOptionalString(song.cd);
  const trackNumber = toPositiveInteger(song.no) ?? index + 1;
  const position: SourceReleaseTrackPosition = {
    ...(discNumber === undefined ? {} : { discNumber }),
    trackNumber,
    trackCount,
  };

  return Object.keys(position).length === 0 ? undefined : position;
}

function tracklistItemFromAlbumSong(
  song: NetEaseSong,
  index: number,
  trackCount: number,
): SourceReleaseTracklistItem | undefined {
  const title = toNonEmptyString(song.name) ?? `Track ${index + 1}`;
  const songId = toStringId(song.id);
  const artistLabels = toArtistNames(song);
  const durationMs = typeof song.dt === "number" && Number.isFinite(song.dt) ? song.dt : undefined;
  const trackPosition = trackPositionFromAlbumSong(song, index, trackCount);

  return {
    ...(songId === undefined
      ? {}
      : {
          sourceRef: {
            namespace: "source:netease",
            kind: "track",
            id: songId,
            label: title,
            url: toSongUrl(songId),
          },
        }),
    title,
    ...(artistLabels.length === 0 ? {} : { artistLabels }),
    ...(trackPosition?.discNumber === undefined ? {} : { discNumber: trackPosition.discNumber }),
    ...(trackPosition?.trackNumber === undefined ? {} : { trackNumber: trackPosition.trackNumber }),
    ...(trackPosition?.trackCount === undefined ? {} : { trackCount: trackPosition.trackCount }),
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}

function firstAlbumId(song: NetEaseSong): string | undefined {
  const album = isRecord(song.album) ? song.album : isRecord(song.al) ? song.al : undefined;

  if (album === undefined) {
    return undefined;
  }

  return toStringId((album as NetEaseAlbum).id);
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

function epochMillisecondsToIsoString(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : undefined;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function toPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }

  return result;
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
