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

type NetEasePaginatedRead = {
  status: "complete" | "partial" | "failed";
  items: Record<string, unknown>[];
  issues?: PlatformLibraryIssue[];
};

const readablePlatformLibraryAreas: PlatformLibraryArea[] = [
  "saved_recordings",
  "saved_releases",
  "saved_artists",
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
      id: "saved_recordings",
      label: "Saved songs",
      availability: "readable",
    },
    {
      id: "saved_releases",
      label: "Saved albums",
      availability: "readable",
    },
    {
      id: "saved_artists",
      label: "Followed artists",
      availability: "readable",
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
    if (area === "saved_recordings") {
      const preview = await previewSavedRecordings(requestJson, providerAccountId, sampleLimit);

      results.push({
        area,
        ...preview,
      });
    }

    if (area === "saved_releases") {
      const preview = await previewSavedReleases(requestJson, sampleLimit);

      results.push({
        area,
        ...preview,
      });
    }

    if (area === "saved_artists") {
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

async function previewSavedRecordings(
  requestJson: NetEaseRequester,
  providerAccountId: string,
  sampleLimit: number,
): Promise<NetEasePreviewAreaOutcome> {
  const liked = await requestJson({
    path: "/likelist",
    query: { uid: providerAccountId },
  });

  if (!liked.ok) {
    return unavailablePreviewArea(issueFromStageError(liked.error, "saved_recordings"));
  }

  const ids = extractIdListResult(liked.value, "saved_recordings");

  if (!ids.ok) {
    return unavailablePreviewArea(ids.issue);
  }

  const samples = sampleLimit === 0 ? [] : await readRecordingSamples(requestJson, ids.value.slice(0, sampleLimit));

  return readablePreviewArea({ certainty: "exact", value: ids.value.length }, samples);
}

async function readRecordingSamples(
  requestJson: NetEaseRequester,
  ids: string[],
): Promise<PlatformLibrarySample[]> {
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

  const songs = extractSongsFromDetailResult(details.value, "saved_recordings");

  if (!songs.ok) {
    return [];
  }

  return songs.value
    .map(toSavedRecordingItem)
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
    return unavailablePreviewArea(issueFromStageError(albums.error, "saved_releases"));
  }

  const albumPayload = extractArrayPayloadResult(albums.value, ["data", "albums"], "saved_releases");

  if (!albumPayload.ok) {
    return unavailablePreviewArea(albumPayload.issue);
  }

  const items = albumPayload.value
    .map(toSavedReleaseItem)
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
    return unavailablePreviewArea(issueFromStageError(artists.error, "saved_artists"));
  }

  const artistPayload = extractArrayPayloadResult(artists.value, ["data", "artists"], "saved_artists");

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
): Promise<PlatformLibraryReadAreaResult[]> {
  const results: PlatformLibraryReadAreaResult[] = [];

  for (const area of areas) {
    if (area === "saved_recordings") {
      results.push({
        area,
        ...(await readSavedRecordings(requestJson, providerAccountId)),
      });
    }

    if (area === "saved_releases") {
      results.push({
        area,
        ...(await readSavedReleases(requestJson)),
      });
    }

    if (area === "saved_artists") {
      results.push({
        area,
        ...(await readSavedArtists(requestJson)),
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

async function readSavedRecordings(
  requestJson: NetEaseRequester,
  providerAccountId: string,
): Promise<NetEaseReadAreaOutcome> {
  const liked = await requestJson({
    path: "/likelist",
    query: { uid: providerAccountId },
  });

  if (!liked.ok) {
    return failedReadArea("saved_recordings", issueFromStageError(liked.error, "saved_recordings"));
  }

  const ids = extractIdListResult(liked.value, "saved_recordings");

  if (!ids.ok) {
    return failedReadArea("saved_recordings", ids.issue);
  }

  if (ids.value.length === 0) {
    return completeReadArea([]);
  }

  const items: PlatformLibraryItem[] = [];

  for (const batch of chunks(ids.value, netEaseSongDetailBatchSize)) {
    const details = await requestJson({
      path: "/song/detail",
      query: { ids: batch.join(",") },
    });

    if (!details.ok) {
      const issue = issueFromStageError(details.error, "saved_recordings");

      return items.length === 0
        ? failedReadArea("saved_recordings", issue)
        : partialReadArea("saved_recordings", items, issue);
    }

    const songs = extractSongsFromDetailResult(details.value, "saved_recordings");

    if (!songs.ok) {
      return items.length === 0
        ? failedReadArea("saved_recordings", songs.issue)
        : partialReadArea("saved_recordings", items, songs.issue);
    }

    items.push(...songs.value.map(toSavedRecordingItem).filter(isDefined));
  }

  return completeReadArea(items);
}

async function readSavedReleases(requestJson: NetEaseRequester): Promise<NetEaseReadAreaOutcome> {
  const albums = await readPaginatedItems(requestJson, "/album/sublist", ["data", "albums"], "saved_releases");

  return {
    status: albums.status,
    items: albums.items.map(toSavedReleaseItem).filter(isDefined),
    ...(albums.issues === undefined ? {} : { issues: albums.issues }),
  };
}

async function readSavedArtists(requestJson: NetEaseRequester): Promise<NetEaseReadAreaOutcome> {
  const artists = await readPaginatedItems(requestJson, "/artist/sublist", ["data", "artists"], "saved_artists");

  return {
    status: artists.status,
    items: artists.items.map(toFollowedArtistItem).filter(isDefined),
    ...(artists.issues === undefined ? {} : { issues: artists.issues }),
  };
}

async function readPaginatedItems(
  requestJson: NetEaseRequester,
  path: string,
  arrayKeys: string[],
  area: PlatformLibraryArea,
): Promise<NetEasePaginatedRead> {
  const items: Record<string, unknown>[] = [];
  let offset = 0;
  let expectedCount: number | undefined;

  while (true) {
    const response = await requestJson({
      path,
      query: { limit: String(netEasePageLimit), offset: String(offset) },
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

function toSavedRecordingItem(song: NetEaseSong): PlatformLibraryItem | undefined {
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
    itemKind: "saved_recording",
    targetKind: "recording",
    label,
    canonicalHints: {
      label: toNonEmptyString(song.name) ?? label,
      ...(artistLabels.length === 0 ? {} : { artistLabels }),
      ...(artistSourceRefs.length === 0 ? {} : { artistSourceRefs }),
      ...(releaseLabel === undefined ? {} : { releaseLabel }),
      ...(releaseSourceRef === undefined ? {} : { releaseSourceRef }),
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

function toPreviewSample(item: PlatformLibraryItem): PlatformLibrarySample {
  return {
    label: item.label,
    itemKind: item.itemKind,
    targetKind: item.targetKind,
    ...(item.canonicalHints?.artistLabels === undefined ? {} : { artistLabels: item.canonicalHints.artistLabels }),
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
