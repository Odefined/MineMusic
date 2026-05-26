import type {
  InstrumentProviderDescriptor,
  KnowledgeCanonicalContext,
  KnowledgeNode,
  KnowledgeProvider,
  KnowledgeQuery,
  KnowledgeRelation,
  KnowledgeRelationFocus,
  Ref,
  Result,
  StageError,
  StructuredKnowledge,
} from "../../contracts/index.js";
import type { ProviderHttpCacheRepository } from "../../ports/index.js";

export const defaultMusicBrainzBaseUrl = "https://musicbrainz.org";

export type MusicBrainzRequestInput = {
  path: string;
  query: Record<string, string>;
  url: string;
  headers: Record<string, string>;
};

export type MusicBrainzHttpResponse = {
  status: number;
  json: unknown;
};

export type MusicBrainzRequester = (input: MusicBrainzRequestInput) => Promise<Result<MusicBrainzHttpResponse>>;

export type MusicBrainzRateLimiter = {
  wait(): Promise<void>;
};

export type MusicBrainzKnowledgeProviderOptions = {
  baseUrl?: string;
  cache?: ProviderHttpCacheRepository;
  clock?: () => string;
  rateLimiter?: MusicBrainzRateLimiter;
  requestJson?: MusicBrainzRequester;
  userAgent?: string;
};

type MusicBrainzRecording = {
  id?: unknown;
  title?: unknown;
  disambiguation?: unknown;
  length?: unknown;
  score?: unknown;
  isrcs?: unknown;
  "artist-credit"?: unknown;
  relations?: unknown;
  annotation?: unknown;
  genres?: unknown;
  tags?: unknown;
  rating?: unknown;
};

type MusicBrainzArtist = {
  id?: unknown;
  name?: unknown;
  "sort-name"?: unknown;
  disambiguation?: unknown;
  type?: unknown;
  country?: unknown;
  score?: unknown;
  relations?: unknown;
  annotation?: unknown;
  genres?: unknown;
  tags?: unknown;
  rating?: unknown;
};

type MusicBrainzWork = {
  id?: unknown;
  title?: unknown;
  disambiguation?: unknown;
  type?: unknown;
  iswcs?: unknown;
  score?: unknown;
  relations?: unknown;
  annotation?: unknown;
  genres?: unknown;
  tags?: unknown;
  rating?: unknown;
};

type MusicBrainzReleaseGroup = {
  id?: unknown;
  title?: unknown;
  disambiguation?: unknown;
  "artist-credit"?: unknown;
  "primary-type"?: unknown;
  "secondary-types"?: unknown;
  "first-release-date"?: unknown;
  score?: unknown;
  relations?: unknown;
  annotation?: unknown;
  genres?: unknown;
  tags?: unknown;
  rating?: unknown;
};

type MusicBrainzRelease = {
  id?: unknown;
  title?: unknown;
  disambiguation?: unknown;
  "artist-credit"?: unknown;
  date?: unknown;
  country?: unknown;
  status?: unknown;
  barcode?: unknown;
  "release-group"?: unknown;
  "label-info"?: unknown;
  media?: unknown;
  score?: unknown;
  relations?: unknown;
  annotation?: unknown;
  genres?: unknown;
  tags?: unknown;
  rating?: unknown;
};

type MusicBrainzLabel = {
  id?: unknown;
  name?: unknown;
  disambiguation?: unknown;
  type?: unknown;
  country?: unknown;
  area?: unknown;
  score?: unknown;
  relations?: unknown;
  annotation?: unknown;
  genres?: unknown;
  tags?: unknown;
  rating?: unknown;
};

type MusicBrainzMedium = {
  position?: unknown;
  format?: unknown;
  title?: unknown;
  "track-count"?: unknown;
  tracks?: unknown;
};

type MusicBrainzTrack = {
  id?: unknown;
  position?: unknown;
  number?: unknown;
  title?: unknown;
  length?: unknown;
  recording?: unknown;
};

type MusicBrainzArtistCredit = {
  name?: unknown;
  joinphrase?: unknown;
  artist?: {
    id?: unknown;
    name?: unknown;
    "sort-name"?: unknown;
    disambiguation?: unknown;
  };
};

type MusicBrainzRelation = {
  type?: unknown;
  "type-id"?: unknown;
  "target-type"?: unknown;
  direction?: unknown;
  "forward-link-phrase"?: unknown;
  "reverse-link-phrase"?: unknown;
  "long-link-phrase"?: unknown;
  begin?: unknown;
  end?: unknown;
  ended?: unknown;
  attributes?: unknown;
  artist?: unknown;
  recording?: unknown;
  release?: unknown;
  "release-group"?: unknown;
  work?: unknown;
  label?: unknown;
  url?: unknown;
};

type TextMusicBrainzQuery = KnowledgeQuery & { text: string };
type CanonicalMusicBrainzQuery = KnowledgeQuery & { canonicalRef: Ref };
type TagMusicBrainzQuery = KnowledgeQuery & { tagQuery: string[] };
type FieldMusicBrainzQuery = KnowledgeQuery & { fieldQuery: NonNullable<KnowledgeQuery["fieldQuery"]> };
type MusicBrainzRequestRuntime = {
  baseUrl: string;
  cache: ProviderHttpCacheRepository | undefined;
  clock: () => string;
  rateLimiter: MusicBrainzRateLimiter;
  requestJson: MusicBrainzRequester;
  userAgent: string;
};

export const musicBrainzKnowledgeProviderDescriptor: InstrumentProviderDescriptor = {
  id: "musicbrainz",
  label: "MusicBrainz",
  slot: "knowledge",
  status: "available",
  authentication: "none",
  operations: ["query"],
  knowledge: {
    formats: ["structured"],
    entityKinds: ["artist", "label", "recording", "release", "release_group", "work"],
    expansions: [
      "credits",
      "relations",
      "releases",
      "release_groups",
      "works",
      "release_labels",
      "tracklist",
      "identifiers",
      "urls",
      "genres",
      "tags",
      "ratings",
      "annotation",
    ],
    relationFocuses: ["members"],
    boundaryNotes: [
      "No playable links.",
      "No identity confirmation.",
      "No Canonical Store writes.",
    ],
  },
};

export function createMusicBrainzKnowledgeProvider(options: MusicBrainzKnowledgeProviderOptions = {}): KnowledgeProvider {
  const baseUrl = options.baseUrl ?? defaultMusicBrainzBaseUrl;
  const requestJson = options.requestJson ?? createDefaultRequester(baseUrl);
  const runtime: MusicBrainzRequestRuntime = {
    baseUrl,
    cache: options.cache,
    clock: options.clock ?? (() => new Date().toISOString()),
    rateLimiter: options.rateLimiter ?? (options.requestJson === undefined ? createMusicBrainzRateLimiter() : noWaitRateLimiter),
    requestJson,
    userAgent: options.userAgent ?? "MineMusic/0.0.0 (https://github.com/minemusic)",
  };

  return {
    id: "musicbrainz",
    descriptor: musicBrainzKnowledgeProviderDescriptor,

    async query({ query, canonicalContext }) {
      if (isTextQuery(query)) {
        return searchMusicBrainzText({ ...runtime, query });
      }

      if (isTagQuery(query)) {
        return searchMusicBrainzTags({ ...runtime, query });
      }

      if (isFieldQuery(query)) {
        return searchMusicBrainzFields({ ...runtime, query });
      }

      if (!isCanonicalQuery(query)) {
        return ok({ items: [] });
      }

      const ref = musicBrainzRefFromQuery(query, canonicalContext);

      if (ref === undefined) {
        return searchMusicBrainzCanonicalContext({ ...runtime, query, canonicalContext });
      }

      return lookupMusicBrainzRef({ ...runtime, query, ref });
    },
  };
}

async function searchMusicBrainzFields({
  baseUrl,
  cache,
  clock,
  rateLimiter,
  requestJson,
  userAgent,
  query,
}: MusicBrainzRequestRuntime & {
  query: FieldMusicBrainzQuery;
}): Promise<Result<{ items: StructuredKnowledge[] }>> {
  if (query.formats !== undefined && !query.formats.includes("structured")) {
    return ok({ items: [] });
  }

  const entityKinds = query.entityKinds ?? ["recording"];
  const items: StructuredKnowledge[] = [];

  for (const entityKind of entityKinds) {
    const search = searchConfigFor(entityKind);
    const searchQuery = fieldSearchQueryFor(entityKind, query.fieldQuery);

    if (search === undefined || searchQuery === undefined) {
      continue;
    }

    const response = await requestMusicBrainz({
      baseUrl,
      cache,
      clock,
      rateLimiter,
      requestJson,
      userAgent,
      path: search.path,
      query: {
        query: searchQuery,
        limit: String(fieldSearchRequestLimit(query)),
      },
    });

    if (!response.ok) {
      return response;
    }

    for (const entity of entitiesFromSearch(response.value, search.responseKey)) {
      const item = search.toKnowledge(entity);
      const followUpRef = fieldSearchFollowUpRef(entityKind, item, query);

      if (followUpRef !== undefined) {
        const followUp = await lookupMusicBrainzRef({
          baseUrl,
          cache,
          clock,
          rateLimiter,
          requestJson,
          userAgent,
          query: lookupQueryFromFieldQuery(query, followUpRef),
          ref: followUpRef,
        });

        if (!followUp.ok) {
          return followUp;
        }

        items.push(...followUp.value.items);
        continue;
      }

      items.push(...applyRootTagFilters([item], query.filters));
    }
  }

  return ok({ items: items.slice(0, normalizedSearchLimit(query.limit)) });
}

async function searchMusicBrainzTags({
  baseUrl,
  cache,
  clock,
  rateLimiter,
  requestJson,
  userAgent,
  query,
}: MusicBrainzRequestRuntime & {
  query: TagMusicBrainzQuery;
}): Promise<Result<{ items: StructuredKnowledge[] }>> {
  if (query.formats !== undefined && !query.formats.includes("structured")) {
    return ok({ items: [] });
  }

  const queryTags = normalizeTagList(query.tagQuery);

  if (queryTags.length === 0) {
    return ok({ items: [] });
  }

  const entityKinds = query.entityKinds ?? ["recording"];
  const taggedItems: Array<{ item: StructuredKnowledge; order: number }> = [];
  let order = 0;

  for (const entityKind of entityKinds) {
    const search = searchConfigFor(entityKind);

    if (search === undefined) {
      continue;
    }

    const response = await requestMusicBrainz({
      baseUrl,
      cache,
      clock,
      rateLimiter,
      requestJson,
      userAgent,
      path: search.path,
      query: {
        query: tagSearchQuery(queryTags),
        limit: String(normalizedSearchLimit(query.limit)),
      },
    });

    if (!response.ok) {
      return response;
    }

    for (const entity of entitiesFromSearch(response.value, search.responseKey)) {
      const item = search.toKnowledge(entity);
      const tagMetadata = matchRootTags(item, queryTags);

      if (tagMetadata.matchedTagCount === 0) {
        order += 1;
        continue;
      }

      const itemWithMetadata = withMetadata(item, tagMetadata);

      if (applyRootTagFilters([itemWithMetadata], query.filters).length === 0) {
        order += 1;
        continue;
      }

      taggedItems.push({ item: itemWithMetadata, order });
      order += 1;
    }
  }

  return ok({
    items: taggedItems
      .sort(compareTaggedItems)
      .slice(0, normalizedSearchLimit(query.limit))
      .map(({ item }) => item),
  });
}

async function searchMusicBrainzCanonicalContext({
  baseUrl,
  cache,
  clock,
  rateLimiter,
  requestJson,
  userAgent,
  query,
  canonicalContext,
}: MusicBrainzRequestRuntime & {
  query: CanonicalMusicBrainzQuery;
  canonicalContext: KnowledgeCanonicalContext | undefined;
}): Promise<Result<{ items: StructuredKnowledge[] }>> {
  const textQuery = textQueryFromCanonicalContext(query, canonicalContext);

  if (textQuery === undefined) {
    return ok({ items: [] });
  }

  return searchMusicBrainzText({
    baseUrl,
    cache,
    clock,
    rateLimiter,
    requestJson,
    userAgent,
    query: textQuery,
  });
}

async function searchMusicBrainzText({
  baseUrl,
  cache,
  clock,
  rateLimiter,
  requestJson,
  userAgent,
  query,
}: MusicBrainzRequestRuntime & {
  query: TextMusicBrainzQuery;
}): Promise<Result<{ items: StructuredKnowledge[] }>> {
  const entityKinds = query.entityKinds ?? ["recording"];
  const items: StructuredKnowledge[] = [];

  for (const entityKind of entityKinds) {
    const search = searchConfigFor(entityKind);

    if (search === undefined) {
      continue;
    }

    const response = await requestMusicBrainz({
      baseUrl,
      cache,
      clock,
      rateLimiter,
      requestJson,
      userAgent,
      path: search.path,
      query: {
        query: query.text,
        limit: String(normalizedSearchLimit(query.limit)),
      },
    });

    if (!response.ok) {
      return response;
    }

    for (const entity of entitiesFromSearch(response.value, search.responseKey)) {
      const followUpRef = textSearchFollowUpRef(entityKind, entity, query);

      if (followUpRef === undefined) {
        items.push(search.toKnowledge(entity));
        continue;
      }

      const followUp = await lookupMusicBrainzRef({
        baseUrl,
        cache,
        clock,
        rateLimiter,
        requestJson,
        userAgent,
        query: lookupQueryFromTextQuery(query, followUpRef),
        ref: followUpRef,
      });

      if (!followUp.ok) {
        return followUp;
      }

      items.push(...followUp.value.items);
    }
  }

  return ok({ items: applyRootTagFilters(items, query.filters) });
}

async function lookupMusicBrainzRef({
  baseUrl,
  cache,
  clock,
  rateLimiter,
  requestJson,
  userAgent,
  query,
  ref,
}: MusicBrainzRequestRuntime & {
  query: CanonicalMusicBrainzQuery;
  ref: Ref;
}): Promise<Result<{ items: StructuredKnowledge[] }>> {
  const refKind = normalizedMusicBrainzKind(ref.kind);
  const lookup = lookupConfigFor(refKind);

  if (lookup === undefined) {
    return ok({ items: [] });
  }

  const response = await requestMusicBrainz({
    baseUrl,
    cache,
    clock,
    rateLimiter,
    requestJson,
    userAgent,
    path: `/ws/2/${lookup.apiKind}/${encodeURIComponent(ref.id)}`,
    query: {
      inc: lookupIncFor(refKind, query.expand, query.relationFocus),
    },
  });

  if (!response.ok) {
    return response;
  }

  const items = [lookup.toKnowledge(filterEntityRelationsForFocus(refKind, response.value, query.relationFocus))];

  if (refKind === "release_group" && query.expand?.includes("releases") === true) {
    const browse = await requestMusicBrainz({
      baseUrl,
      cache,
      clock,
      rateLimiter,
      requestJson,
      userAgent,
      path: "/ws/2/release",
      query: {
        "release-group": ref.id,
        limit: String(normalizedBrowseLimit(query.limit)),
        inc: lookupIncFor("release", query.expand, query.relationFocus),
      },
    });

    if (!browse.ok) {
      return browse;
    }

    items.push(...entitiesFromSearch(browse.value, "releases").map(releaseToKnowledge));
  }

  if (refKind === "artist" && query.expand?.includes("release_groups") === true) {
    const browse = await requestMusicBrainz({
      baseUrl,
      cache,
      clock,
      rateLimiter,
      requestJson,
      userAgent,
      path: "/ws/2/release-group",
      query: {
        artist: ref.id,
        limit: String(normalizedBrowseLimit(query.limit)),
        inc: lookupIncFor("release_group", query.expand, query.relationFocus),
      },
    });

    if (!browse.ok) {
      return browse;
    }

    items.push(...entitiesFromSearch(browse.value, "release-groups").map(releaseGroupToKnowledge));
  }

  return ok({ items: applyRootTagFilters(items, query.filters) });
}

function musicBrainzRefFromQuery(
  query: CanonicalMusicBrainzQuery,
  canonicalContext: KnowledgeCanonicalContext | undefined,
): Ref | undefined {
  if (query.canonicalRef.namespace === "musicbrainz") {
    return query.canonicalRef;
  }

  return canonicalContext?.record.sourceRefs?.find((sourceRef) => sourceRef.namespace === "musicbrainz");
}

function isTextQuery(query: KnowledgeQuery): query is TextMusicBrainzQuery {
  return typeof (query as { text?: unknown }).text === "string";
}

function isTagQuery(query: KnowledgeQuery): query is TagMusicBrainzQuery {
  return Array.isArray((query as { tagQuery?: unknown }).tagQuery);
}

function isFieldQuery(query: KnowledgeQuery): query is FieldMusicBrainzQuery {
  return typeof (query as { fieldQuery?: unknown }).fieldQuery === "object"
    && (query as { fieldQuery?: unknown }).fieldQuery !== null
    && !Array.isArray((query as { fieldQuery?: unknown }).fieldQuery);
}

function isCanonicalQuery(query: KnowledgeQuery): query is CanonicalMusicBrainzQuery {
  return typeof (query as { canonicalRef?: unknown }).canonicalRef === "object"
    && (query as { canonicalRef?: unknown }).canonicalRef !== null;
}

function textQueryFromCanonicalContext(
  query: CanonicalMusicBrainzQuery,
  canonicalContext: KnowledgeCanonicalContext | undefined,
): TextMusicBrainzQuery | undefined {
  const entityKind = canonicalSearchEntityKind(canonicalContext?.record.kind);

  if (canonicalContext === undefined || entityKind === undefined) {
    return undefined;
  }

  const text = uniqueStrings([
    canonicalContext.record.label,
    ...(canonicalContext.record.aliases ?? []),
    ...canonicalContext.relations.flatMap((relation) => [
      relation.objectLabel,
      typeof relation.objectValue === "string" ? relation.objectValue : undefined,
    ]),
  ]).join(" ");

  if (text.length === 0) {
    return undefined;
  }

  const textQuery: TextMusicBrainzQuery = {
    text,
    entityKinds: [entityKind],
  };

  if (query.expand !== undefined) {
    textQuery.expand = query.expand;
  }

  if (query.relationFocus !== undefined) {
    textQuery.relationFocus = query.relationFocus;
  }

  if (query.formats !== undefined) {
    textQuery.formats = query.formats;
  }

  if (query.limit !== undefined) {
    textQuery.limit = query.limit;
  }

  if (query.purpose !== undefined) {
    textQuery.purpose = query.purpose;
  }

  return textQuery;
}

function textSearchFollowUpRef(
  entityKind: string,
  entity: Record<string, unknown>,
  query: TextMusicBrainzQuery,
): Ref | undefined {
  const normalizedKind = normalizedMusicBrainzKind(entityKind);

  if (lookupConfigFor(normalizedKind) === undefined) {
    return undefined;
  }

  if (!textSearchRequiresFollowUp(normalizedKind, query.expand)) {
    return undefined;
  }

  const id = stringValue(entity.id);

  if (id === undefined) {
    return undefined;
  }

  return musicBrainzRef(normalizedKind, id, stringValue(entity.name) ?? stringValue(entity.title));
}

function textSearchRequiresFollowUp(entityKind: string, expand: string[] | undefined): boolean {
  if (expand === undefined || expand.length === 0) {
    return false;
  }

  if (expand.includes("relations") || expand.includes("annotation")) {
    return true;
  }

  if (entityKind === "artist" && expand.includes("release_groups")) {
    return true;
  }

  if (entityKind === "release_group" && expand.includes("releases")) {
    return true;
  }

  if (entityKind === "release" && (expand.includes("tracklist") || expand.includes("release_labels"))) {
    return true;
  }

  if (
    entityKind === "recording"
    && (expand.includes("releases") || expand.includes("release_groups") || expand.includes("works"))
  ) {
    return true;
  }

  return false;
}

function lookupQueryFromTextQuery(query: TextMusicBrainzQuery, ref: Ref): CanonicalMusicBrainzQuery {
  return {
    canonicalRef: ref,
    ...(query.purpose === undefined ? {} : { purpose: query.purpose }),
    ...(query.formats === undefined ? {} : { formats: query.formats }),
    ...(query.entityKinds === undefined ? {} : { entityKinds: query.entityKinds }),
    ...(query.expand === undefined ? {} : { expand: query.expand }),
    ...(query.relationFocus === undefined ? {} : { relationFocus: query.relationFocus }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
  };
}

function lookupQueryFromFieldQuery(query: FieldMusicBrainzQuery, ref: Ref): CanonicalMusicBrainzQuery {
  return {
    canonicalRef: ref,
    ...(query.filters === undefined ? {} : { filters: query.filters }),
    ...(query.purpose === undefined ? {} : { purpose: query.purpose }),
    ...(query.formats === undefined ? {} : { formats: query.formats }),
    ...(query.entityKinds === undefined ? {} : { entityKinds: query.entityKinds }),
    ...(query.expand === undefined ? {} : { expand: query.expand }),
    ...(query.relationFocus === undefined ? {} : { relationFocus: query.relationFocus }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
  };
}

function fieldSearchFollowUpRef(
  entityKind: string,
  item: StructuredKnowledge,
  query: FieldMusicBrainzQuery,
): Ref | undefined {
  const root = item.nodes.find((node) => node.id === item.rootNodeId);

  if (root?.ref === undefined) {
    return undefined;
  }

  const normalizedKind = normalizedMusicBrainzKind(entityKind);

  if (
    query.filters?.tags !== undefined &&
    !rootHasTagFacts(item)
  ) {
    return root.ref;
  }

  if (textSearchRequiresFollowUp(normalizedKind, query.expand)) {
    return root.ref;
  }

  return undefined;
}

function fieldSearchRequestLimit(query: FieldMusicBrainzQuery): number {
  const limit = normalizedSearchLimit(query.limit);

  return query.filters?.tags === undefined ? limit : Math.min(limit * 5, 50);
}

function canonicalSearchEntityKind(kind: string | undefined): string | undefined {
  switch (kind) {
    case "artist":
    case "recording":
    case "release":
    case "release_group":
      return kind;
    default:
      return undefined;
  }
}

const fieldQueryKeys = [
  "title",
  "artist",
  "release",
  "label",
  "date",
  "country",
  "barcode",
  "catalogNumber",
  "type",
] as const;

type FieldQueryKey = typeof fieldQueryKeys[number];

function fieldSearchQueryFor(
  entityKind: string,
  fieldQuery: FieldMusicBrainzQuery["fieldQuery"],
): string | undefined {
  const fields = musicBrainzFieldMappings[entityKind];

  if (fields === undefined) {
    return undefined;
  }

  const clauses: string[] = [];

  for (const key of fieldQueryKeys) {
    const field = fields[key];
    const value = fieldQuery[key];

    if (field === undefined || typeof value !== "string" || value.length === 0) {
      continue;
    }

    const searchValue = key === "country" ? value.toUpperCase() : value;
    clauses.push(`${field}:${quoteMusicBrainzSearchValue(searchValue)}`);
  }

  return clauses.length === 0 ? undefined : clauses.join(" AND ");
}

const musicBrainzFieldMappings: Record<string, Partial<Record<FieldQueryKey, string>>> = {
  recording: {
    title: "recording",
    artist: "artist",
    release: "release",
    date: "date",
    country: "country",
  },
  release: {
    title: "release",
    artist: "artist",
    label: "label",
    date: "date",
    country: "country",
    barcode: "barcode",
    catalogNumber: "catno",
    type: "type",
  },
  release_group: {
    title: "releasegroup",
    artist: "artist",
    date: "firstreleasedate",
    type: "primarytype",
  },
  artist: {
    title: "artist",
    country: "country",
    type: "type",
  },
  work: {
    title: "work",
    artist: "artist",
    type: "type",
  },
  label: {
    title: "label",
    country: "country",
    type: "type",
  },
};

type MusicBrainzSearchConfig = {
  path: string;
  responseKey: string;
  toKnowledge: (entity: Record<string, unknown>) => StructuredKnowledge;
};

function searchConfigFor(entityKind: string): MusicBrainzSearchConfig | undefined {
  switch (entityKind) {
    case "artist":
      return {
        path: "/ws/2/artist",
        responseKey: "artists",
        toKnowledge: (entity) => artistToKnowledge(entity),
      };
    case "recording":
      return {
        path: "/ws/2/recording",
        responseKey: "recordings",
        toKnowledge: (entity) => recordingToKnowledge(entity),
      };
    case "label":
      return {
        path: "/ws/2/label",
        responseKey: "labels",
        toKnowledge: (entity) => labelToKnowledge(entity),
      };
    case "release":
      return {
        path: "/ws/2/release",
        responseKey: "releases",
        toKnowledge: (entity) => releaseToKnowledge(entity),
      };
    case "release_group":
      return {
        path: "/ws/2/release-group",
        responseKey: "release-groups",
        toKnowledge: (entity) => releaseGroupToKnowledge(entity),
      };
    case "work":
      return {
        path: "/ws/2/work",
        responseKey: "works",
        toKnowledge: (entity) => workToKnowledge(entity),
      };
    default:
      return undefined;
  }
}

type MusicBrainzLookupConfig = {
  apiKind: string;
  toKnowledge: (entity: unknown) => StructuredKnowledge;
};

function lookupConfigFor(entityKind: string): MusicBrainzLookupConfig | undefined {
  switch (entityKind) {
    case "artist":
      return {
        apiKind: "artist",
        toKnowledge: (entity) => artistToKnowledge(objectValue(entity)),
      };
    case "recording":
      return {
        apiKind: "recording",
        toKnowledge: (entity) => recordingToKnowledge(objectValue(entity)),
      };
    case "label":
      return {
        apiKind: "label",
        toKnowledge: (entity) => labelToKnowledge(objectValue(entity)),
      };
    case "release":
      return {
        apiKind: "release",
        toKnowledge: (entity) => releaseToKnowledge(objectValue(entity)),
      };
    case "release_group":
      return {
        apiKind: "release-group",
        toKnowledge: (entity) => releaseGroupToKnowledge(objectValue(entity)),
      };
    case "work":
      return {
        apiKind: "work",
        toKnowledge: (entity) => workToKnowledge(objectValue(entity)),
      };
    default:
      return undefined;
  }
}

function lookupIncFor(
  entityKind: string,
  expand: string[] | undefined,
  relationFocus?: KnowledgeRelationFocus[],
): string {
  const includes = new Set<string>(["genres", "ratings", "tags"]);

  switch (entityKind) {
    case "artist":
    case "work":
      includes.add("aliases");
      break;
    case "recording":
      includes.add("artist-credits");
      includes.add("isrcs");
      break;
    case "release":
      includes.add("artist-credits");
      includes.add("labels");
      includes.add("release-groups");
      break;
    case "release_group":
      includes.add("artist-credits");
      break;
  }

  if (expand?.includes("tracklist") === true && entityKind === "release") {
    includes.add("isrcs");
    includes.add("media");
    includes.add("recordings");
  }

  if (expand?.includes("works") === true) {
    if (entityKind === "recording") {
      includes.add("work-rels");
    }

    if (entityKind === "release") {
      includes.add("recording-level-rels");
      includes.add("work-level-rels");
      includes.add("work-rels");
    }
  }

  if (expand?.includes("release_groups") === true && entityKind === "recording") {
    includes.add("release-groups");
  }

  if (expand?.includes("releases") === true && entityKind === "recording") {
    includes.add("releases");
  }

  if (expand?.includes("annotation") === true) {
    includes.add("annotation");
  }

  if (expand?.includes("relations") === true) {
    const relationshipIncludes = relationshipIncludesForFocus(entityKind, relationFocus);
    relationshipIncludes.forEach((include) => includes.add(include));
  }

  return Array.from(includes).sort().join("+");
}

function relationshipIncludesForFocus(
  entityKind: string,
  relationFocus: KnowledgeRelationFocus[] | undefined,
): string[] {
  if (relationFocus?.includes("members") === true && entityKind === "artist") {
    return ["artist-rels"];
  }

  return relationshipIncludesFor(entityKind);
}

function relationshipIncludesFor(entityKind: string): string[] {
  switch (entityKind) {
    case "artist":
      return ["artist-rels", "recording-rels", "release-group-rels", "release-rels", "url-rels", "work-rels"];
    case "recording":
      return ["artist-rels", "release-rels", "url-rels", "work-rels"];
    case "release":
      return ["artist-rels", "label-rels", "recording-level-rels", "release-group-level-rels", "url-rels", "work-level-rels"];
    case "release_group":
      return ["artist-rels", "release-rels", "url-rels", "work-rels"];
    case "label":
      return ["artist-rels", "release-rels", "url-rels"];
    case "work":
      return ["artist-rels", "recording-rels", "url-rels", "work-rels"];
    default:
      return [];
  }
}

async function requestMusicBrainz({
  baseUrl,
  cache,
  clock,
  rateLimiter,
  requestJson,
  userAgent,
  path,
  query,
}: MusicBrainzRequestRuntime & {
  path: string;
  query: Record<string, string>;
}): Promise<Result<unknown>> {
  const requestQuery = {
    ...query,
    fmt: "json",
  };
  const url = buildUrl(baseUrl, path, requestQuery);
  const now = clock();

  if (cache !== undefined) {
    const cached = await cache.get({
      providerId: "musicbrainz",
      cacheKey: url,
      now,
    });

    if (!cached.ok) {
      return fail(cached.error);
    }

    if (cached.value !== null) {
      return ok(cached.value.responseJson);
    }
  }

  await rateLimiter.wait();

  const response = await requestJson({
    path,
    query: requestQuery,
    url,
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return response;
  }

  if (response.value.status < 200 || response.value.status >= 300) {
    return fail({
      code: response.value.status === 429 ? "knowledge.rate_limited" : "knowledge.provider_unavailable",
      message: `MusicBrainz request failed with status ${response.value.status}.`,
      module: "knowledge",
      retryable: response.value.status === 429 || response.value.status >= 500,
    });
  }

  if (cache !== undefined) {
    const cached = await cache.put({
      entry: {
        providerId: "musicbrainz",
        cacheKey: url,
        requestUrl: url,
        responseJson: response.value.json,
        status: response.value.status,
        fetchedAt: now,
        lastUsedAt: now,
      },
    });

    if (!cached.ok) {
      return fail(cached.error);
    }
  }

  return ok(response.value.json);
}

function entitiesFromSearch(response: unknown, responseKey: string): Record<string, unknown>[] {
  if (typeof response !== "object" || response === null) {
    return [];
  }

  const entities = (response as Record<string, unknown>)[responseKey];

  return Array.isArray(entities)
    ? entities.filter((entity): entity is Record<string, unknown> => typeof entity === "object" && entity !== null)
    : [];
}

function filterEntityRelationsForFocus(
  entityKind: string,
  entity: unknown,
  relationFocus: KnowledgeRelationFocus[] | undefined,
): unknown {
  if (relationFocus?.includes("members") !== true || entityKind !== "artist") {
    return entity;
  }

  const source = objectValue(entity);
  const relations = source.relations;

  if (!Array.isArray(relations)) {
    return source;
  }

  return {
    ...source,
    relations: relations.filter(isMemberOfBandRelation),
  };
}

function applyRootTagFilters(
  items: StructuredKnowledge[],
  filters: KnowledgeQuery["filters"],
): StructuredKnowledge[] {
  const tagFilters = filters?.tags;

  if (tagFilters === undefined) {
    return items;
  }

  const include = normalizeTagList(tagFilters.include);
  const exclude = normalizeTagList(tagFilters.exclude);

  if (include.length === 0 && exclude.length === 0) {
    return items;
  }

  return items.filter((item) => {
    const rootTags = rootTagSet(item);

    if (include.some((tag) => !rootTags.has(tag))) {
      return false;
    }

    if (exclude.some((tag) => rootTags.has(tag))) {
      return false;
    }

    return true;
  });
}

function matchRootTags(item: StructuredKnowledge, queryTags: string[]): {
  matchedTags: string[];
  matchedTagCount: number;
} {
  const rootTags = rootTagSet(item);
  const matchedTags = normalizeTagList(queryTags).filter((tag) => rootTags.has(tag));

  return {
    matchedTags,
    matchedTagCount: matchedTags.length,
  };
}

function withMetadata(
  item: StructuredKnowledge,
  metadata: Record<string, unknown>,
): StructuredKnowledge {
  return {
    ...item,
    metadata: {
      ...(item.metadata ?? {}),
      ...metadata,
    },
  };
}

function compareTaggedItems(
  left: { item: StructuredKnowledge; order: number },
  right: { item: StructuredKnowledge; order: number },
): number {
  const leftMatchedTagCount = numberValue(left.item.metadata?.matchedTagCount) ?? 0;
  const rightMatchedTagCount = numberValue(right.item.metadata?.matchedTagCount) ?? 0;

  if (leftMatchedTagCount !== rightMatchedTagCount) {
    return rightMatchedTagCount - leftMatchedTagCount;
  }

  const leftScore = left.item.retrievalScore ?? 0;
  const rightScore = right.item.retrievalScore ?? 0;

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  return left.order - right.order;
}

function tagSearchQuery(queryTags: string[]): string {
  return queryTags.map((tag) => `tag:${quoteMusicBrainzSearchValue(tag)}`).join(" OR ");
}

function quoteMusicBrainzSearchValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function rootTagSet(item: StructuredKnowledge): Set<string> {
  const root = item.nodes.find((node) => node.id === item.rootNodeId);

  if (root?.properties === undefined) {
    return new Set();
  }

  return new Set([
    ...tagNamesFromProperty(root.properties.tags),
    ...tagNamesFromProperty(root.properties.genres),
  ]);
}

function rootHasTagFacts(item: StructuredKnowledge): boolean {
  const root = item.nodes.find((node) => node.id === item.rootNodeId);

  return root?.properties?.tags !== undefined || root?.properties?.genres !== undefined;
}

function tagNamesFromProperty(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return normalizeTagList(
    value.map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      return typeof entry === "object" && entry !== null
        ? stringValue((entry as { name?: unknown }).name)
        : undefined;
    }),
  );
}

function normalizeTagList(values: Array<string | undefined> | undefined): string[] {
  if (values === undefined) {
    return [];
  }

  const normalized: string[] = [];

  for (const value of values) {
    if (value === undefined) {
      continue;
    }

    const tag = normalizeTagName(value);

    if (tag.length > 0 && !normalized.includes(tag)) {
      normalized.push(tag);
    }
  }

  return normalized;
}

function normalizeTagName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function isMemberOfBandRelation(relation: unknown): boolean {
  if (typeof relation !== "object" || relation === null) {
    return false;
  }

  const musicBrainzRelation = relation as MusicBrainzRelation;

  return stringValue(musicBrainzRelation.type)?.toLowerCase() === "member of band"
    && stringValue(musicBrainzRelation.direction) === "backward";
}

function recordingToKnowledge(recording: MusicBrainzRecording): StructuredKnowledge {
  const recordingId = stringValue(recording.id) ?? "unknown";
  const rootNodeId = `recording:${recordingId}`;
  const rootLabel = stringValue(recording.title);
  const nodes: KnowledgeNode[] = [
    {
      id: rootNodeId,
      type: "recording",
      ...(rootLabel === undefined ? {} : { label: rootLabel }),
      ref: musicBrainzRef("recording", recordingId, rootLabel),
      properties: recordingProperties(recording),
    },
  ];
  const relations: KnowledgeRelation[] = [];
  appendArtistCredits(nodes, relations, rootNodeId, recording["artist-credit"]);
  appendRelations(nodes, relations, rootNodeId, recording.relations);

  const retrievalScore = numberValue(recording.score);

  return {
    kind: "structured",
    providerId: "musicbrainz",
    source: {
      ref: musicBrainzRef("recording", recordingId, rootLabel),
    },
    rootNodeId,
    nodes,
    relations,
    ...(retrievalScore === undefined ? {} : { retrievalScore }),
  };
}

function releaseToKnowledge(release: MusicBrainzRelease): StructuredKnowledge {
  const releaseId = stringValue(release.id) ?? "unknown";
  const rootNodeId = `release:${releaseId}`;
  const rootLabel = stringValue(release.title);
  const nodes: KnowledgeNode[] = [
    {
      id: rootNodeId,
      type: "release",
      ...(rootLabel === undefined ? {} : { label: rootLabel }),
      ref: musicBrainzRef("release", releaseId, rootLabel),
      properties: releaseProperties(release),
    },
  ];
  const relations: KnowledgeRelation[] = [];
  const releaseGroup = releaseGroupValue(release["release-group"]);
  const releaseGroupId = stringValue(releaseGroup?.id);

  appendArtistCredits(nodes, relations, rootNodeId, release["artist-credit"]);

  if (releaseGroupId !== undefined) {
    const releaseGroupLabel = stringValue(releaseGroup?.title);
    const releaseGroupNodeId = `release_group:${releaseGroupId}`;
    nodes.push({
      id: releaseGroupNodeId,
      type: "release_group",
      ...(releaseGroupLabel === undefined ? {} : { label: releaseGroupLabel }),
      ref: musicBrainzRef("release_group", releaseGroupId, releaseGroupLabel),
      properties: releaseGroupProperties(releaseGroup ?? {}),
    });
    relations.push({
      type: "part_of_release_group",
      endpoints: [
        { nodeId: rootNodeId, role: "release" },
        { nodeId: releaseGroupNodeId, role: "release_group" },
      ],
    });
  }

  appendReleaseLabels(nodes, relations, rootNodeId, release["label-info"]);
  appendTracklist(nodes, relations, rootNodeId, releaseId, release.media);
  appendRelations(nodes, relations, rootNodeId, release.relations);

  const retrievalScore = numberValue(release.score);

  return {
    kind: "structured",
    providerId: "musicbrainz",
    source: {
      ref: musicBrainzRef("release", releaseId, rootLabel),
    },
    rootNodeId,
    nodes,
    relations,
    ...(retrievalScore === undefined ? {} : { retrievalScore }),
  };
}

function releaseGroupToKnowledge(releaseGroup: MusicBrainzReleaseGroup): StructuredKnowledge {
  const releaseGroupId = stringValue(releaseGroup.id) ?? "unknown";
  const rootNodeId = `release_group:${releaseGroupId}`;
  const rootLabel = stringValue(releaseGroup.title);
  const nodes: KnowledgeNode[] = [
    {
      id: rootNodeId,
      type: "release_group",
      ...(rootLabel === undefined ? {} : { label: rootLabel }),
      ref: musicBrainzRef("release_group", releaseGroupId, rootLabel),
      properties: releaseGroupProperties(releaseGroup),
    },
  ];
  const relations: KnowledgeRelation[] = [];
  appendArtistCredits(nodes, relations, rootNodeId, releaseGroup["artist-credit"]);
  appendRelations(nodes, relations, rootNodeId, releaseGroup.relations);

  const retrievalScore = numberValue(releaseGroup.score);

  return {
    kind: "structured",
    providerId: "musicbrainz",
    source: {
      ref: musicBrainzRef("release_group", releaseGroupId, rootLabel),
    },
    rootNodeId,
    nodes,
    relations,
    ...(retrievalScore === undefined ? {} : { retrievalScore }),
  };
}

function artistToKnowledge(artist: MusicBrainzArtist): StructuredKnowledge {
  const artistId = stringValue(artist.id) ?? "unknown";
  const rootNodeId = `artist:${artistId}`;
  const rootLabel = stringValue(artist.name);
  const retrievalScore = numberValue(artist.score);
  const nodes: KnowledgeNode[] = [
    {
      id: rootNodeId,
      type: "artist",
      ...(rootLabel === undefined ? {} : { label: rootLabel }),
      ref: musicBrainzRef("artist", artistId, rootLabel),
      properties: artistProperties(artist),
    },
  ];
  const relations: KnowledgeRelation[] = [];
  appendRelations(nodes, relations, rootNodeId, artist.relations);

  return {
    kind: "structured",
    providerId: "musicbrainz",
    source: {
      ref: musicBrainzRef("artist", artistId, rootLabel),
    },
    rootNodeId,
    nodes,
    relations,
    ...(retrievalScore === undefined ? {} : { retrievalScore }),
  };
}

function workToKnowledge(work: MusicBrainzWork): StructuredKnowledge {
  const workId = stringValue(work.id) ?? "unknown";
  const rootNodeId = `work:${workId}`;
  const rootLabel = stringValue(work.title);
  const retrievalScore = numberValue(work.score);
  const nodes: KnowledgeNode[] = [
    {
      id: rootNodeId,
      type: "work",
      ...(rootLabel === undefined ? {} : { label: rootLabel }),
      ref: musicBrainzRef("work", workId, rootLabel),
      properties: workProperties(work),
    },
  ];
  const relations: KnowledgeRelation[] = [];
  appendRelations(nodes, relations, rootNodeId, work.relations);

  return {
    kind: "structured",
    providerId: "musicbrainz",
    source: {
      ref: musicBrainzRef("work", workId, rootLabel),
    },
    rootNodeId,
    nodes,
    relations,
    ...(retrievalScore === undefined ? {} : { retrievalScore }),
  };
}

function labelToKnowledge(label: MusicBrainzLabel): StructuredKnowledge {
  const labelId = stringValue(label.id) ?? "unknown";
  const rootNodeId = `label:${labelId}`;
  const rootLabel = stringValue(label.name);
  const retrievalScore = numberValue(label.score);
  const nodes: KnowledgeNode[] = [
    {
      id: rootNodeId,
      type: "label",
      ...(rootLabel === undefined ? {} : { label: rootLabel }),
      ref: musicBrainzRef("label", labelId, rootLabel),
      properties: labelProperties(label),
    },
  ];
  const relations: KnowledgeRelation[] = [];
  appendRelations(nodes, relations, rootNodeId, label.relations);

  return {
    kind: "structured",
    providerId: "musicbrainz",
    source: {
      ref: musicBrainzRef("label", labelId, rootLabel),
    },
    rootNodeId,
    nodes,
    relations,
    ...(retrievalScore === undefined ? {} : { retrievalScore }),
  };
}

function releaseProperties(release: MusicBrainzRelease): Record<string, unknown> {
  return removeUndefined({
    title: stringValue(release.title),
    disambiguation: stringValue(release.disambiguation),
    artistCreditText: artistCreditText(release["artist-credit"]),
    date: stringValue(release.date),
    country: stringValue(release.country),
    status: stringValue(release.status),
    barcode: stringValue(release.barcode),
    annotation: annotationText(release.annotation),
    genres: countedNameArray(release.genres),
    tags: countedNameArray(release.tags),
    rating: ratingValue(release.rating),
  });
}

function releaseGroupProperties(releaseGroup: MusicBrainzReleaseGroup): Record<string, unknown> {
  return removeUndefined({
    title: stringValue(releaseGroup.title),
    disambiguation: stringValue(releaseGroup.disambiguation),
    artistCreditText: artistCreditText(releaseGroup["artist-credit"]),
    primaryType: stringValue(releaseGroup["primary-type"]),
    secondaryTypes: stringArray(releaseGroup["secondary-types"]),
    firstReleaseDate: stringValue(releaseGroup["first-release-date"]),
    annotation: annotationText(releaseGroup.annotation),
    genres: countedNameArray(releaseGroup.genres),
    tags: countedNameArray(releaseGroup.tags),
    rating: ratingValue(releaseGroup.rating),
  });
}

function recordingProperties(recording: MusicBrainzRecording): Record<string, unknown> {
  return removeUndefined({
    title: stringValue(recording.title),
    disambiguation: stringValue(recording.disambiguation),
    durationMs: numberValue(recording.length),
    artistCreditText: artistCreditText(recording["artist-credit"]),
    isrcs: stringArray(recording.isrcs),
    annotation: annotationText(recording.annotation),
    genres: countedNameArray(recording.genres),
    tags: countedNameArray(recording.tags),
    rating: ratingValue(recording.rating),
  });
}

function artistProperties(artist: MusicBrainzArtist): Record<string, unknown> {
  return removeUndefined({
    name: stringValue(artist.name),
    sortName: stringValue(artist["sort-name"]),
    disambiguation: stringValue(artist.disambiguation),
    type: stringValue(artist.type),
    country: stringValue(artist.country),
    annotation: annotationText(artist.annotation),
    genres: countedNameArray(artist.genres),
    tags: countedNameArray(artist.tags),
    rating: ratingValue(artist.rating),
  });
}

function workProperties(work: MusicBrainzWork): Record<string, unknown> {
  return removeUndefined({
    title: stringValue(work.title),
    disambiguation: stringValue(work.disambiguation),
    type: stringValue(work.type),
    iswcs: stringArray(work.iswcs),
    annotation: annotationText(work.annotation),
    genres: countedNameArray(work.genres),
    tags: countedNameArray(work.tags),
    rating: ratingValue(work.rating),
  });
}

function labelProperties(label: MusicBrainzLabel): Record<string, unknown> {
  return removeUndefined({
    name: stringValue(label.name),
    disambiguation: stringValue(label.disambiguation),
    type: stringValue(label.type),
    country: stringValue(label.country),
    area: areaName(label.area),
    annotation: annotationText(label.annotation),
    genres: countedNameArray(label.genres),
    tags: countedNameArray(label.tags),
    rating: ratingValue(label.rating),
  });
}

function artistCredits(value: unknown): MusicBrainzArtistCredit[] {
  return Array.isArray(value) ? value as MusicBrainzArtistCredit[] : [];
}

function appendArtistCredits(
  nodes: KnowledgeNode[],
  relations: KnowledgeRelation[],
  subjectNodeId: string,
  value: unknown,
): void {
  for (const [position, credit] of artistCredits(value).entries()) {
    const artistId = stringValue(credit.artist?.id);

    if (artistId === undefined) {
      continue;
    }

    const artistNodeId = `artist:${artistId}`;
    const artistLabel = stringValue(credit.artist?.name) ?? stringValue(credit.name);
    pushUniqueNode(nodes, {
      id: artistNodeId,
      type: "artist",
      ...(artistLabel === undefined ? {} : { label: artistLabel }),
      ref: musicBrainzRef("artist", artistId, artistLabel),
      properties: removeUndefined({
        sortName: stringValue(credit.artist?.["sort-name"]),
        disambiguation: stringValue(credit.artist?.disambiguation),
      }),
    });
    relations.push({
      type: "artist_credit",
      endpoints: [
        { nodeId: subjectNodeId, role: "credited_entity" },
        { nodeId: artistNodeId, role: "artist" },
      ],
      properties: {
        creditedName: stringValue(credit.name) ?? stringValue(credit.artist?.name),
        position,
      },
    });
  }
}

function appendRelations(
  nodes: KnowledgeNode[],
  relations: KnowledgeRelation[],
  subjectNodeId: string,
  value: unknown,
): void {
  if (!Array.isArray(value)) {
    return;
  }

  for (const relation of value as MusicBrainzRelation[]) {
    const targetType = relationTargetType(relation);
    const target = relationTarget(relation, targetType);
    const targetId = stringValue(target.id) ?? stringValue(target.resource);

    if (targetType === undefined || targetId === undefined) {
      continue;
    }

    const targetLabel = relationTargetLabel(target);
    const targetNodeId = `${targetType}:${targetId}`;
    pushUniqueNode(nodes, {
      id: targetNodeId,
      type: targetType,
      ...(targetLabel === undefined ? {} : { label: targetLabel }),
      ref: musicBrainzRef(targetType, targetId, targetLabel),
      properties: relationTargetProperties(targetType, target),
    });
    const direction = relationDirection(relation);
    const phrases = relationPhrases(relation);
    relations.push({
      type: musicBrainzRelationType(relation),
      endpoints: relationEndpoints(subjectNodeId, targetNodeId, relation, targetType),
      ...(direction === undefined ? {} : { direction }),
      ...(phrases === undefined ? {} : { phrases }),
      properties: relationProperties(relation, targetType),
    });
  }
}

function relationTargetType(relation: MusicBrainzRelation): string | undefined {
  const targetType = stringValue(relation["target-type"]);

  return targetType?.replaceAll("-", "_");
}

function relationTarget(relation: MusicBrainzRelation, targetType: string | undefined): Record<string, unknown> {
  switch (targetType) {
    case "artist":
      return objectValue(relation.artist);
    case "recording":
      return objectValue(relation.recording);
    case "release":
      return objectValue(relation.release);
    case "release_group":
      return objectValue(relation["release-group"]);
    case "work":
      return objectValue(relation.work);
    case "label":
      return objectValue(relation.label);
    case "url":
      return objectValue(relation.url);
    default:
      return {};
  }
}

function relationTargetLabel(target: Record<string, unknown>): string | undefined {
  return stringValue(target.name) ?? stringValue(target.title) ?? stringValue(target.resource);
}

function relationTargetProperties(targetType: string, target: Record<string, unknown>): Record<string, unknown> {
  switch (targetType) {
    case "artist":
      return artistProperties(target);
    case "recording":
      return recordingProperties(target);
    case "release":
      return releaseProperties(target);
    case "release_group":
      return releaseGroupProperties(target);
    case "work":
      return workProperties(target);
    case "label":
      return labelProperties(target);
    case "url":
      return removeUndefined({
        resource: stringValue(target.resource),
      });
    default:
      return {};
  }
}

function musicBrainzRelationType(relation: MusicBrainzRelation): string {
  return stringValue(relation.type) ?? "musicbrainz_relation";
}

function relationEndpoints(
  rootNodeId: string,
  targetNodeId: string,
  relation: MusicBrainzRelation,
  targetType: string,
): KnowledgeRelation["endpoints"] {
  const relationType = stringValue(relation.type)?.toLowerCase();
  const direction = stringValue(relation.direction);

  if (targetType === "artist" && relationType === "member of band") {
    if (direction === "backward") {
      return [
        { nodeId: rootNodeId, role: "group" },
        { nodeId: targetNodeId, role: "member" },
      ];
    }

    if (direction === "forward") {
      return [
        { nodeId: rootNodeId, role: "member" },
        { nodeId: targetNodeId, role: "group" },
      ];
    }
  }

  return [
    { nodeId: rootNodeId, role: nodeKindFromId(rootNodeId) ?? "lookup_entity" },
    { nodeId: targetNodeId, role: targetType },
  ];
}

function nodeKindFromId(nodeId: string): string | undefined {
  const separatorIndex = nodeId.indexOf(":");

  return separatorIndex === -1 ? undefined : nodeId.slice(0, separatorIndex);
}

function relationProperties(relation: MusicBrainzRelation, targetType: string): Record<string, unknown> {
  return removeUndefined({
    musicBrainzTypeId: stringValue(relation["type-id"]),
    targetType,
    begin: stringValue(relation.begin),
    end: stringValue(relation.end),
    ended: booleanValue(relation.ended),
    attributes: stringArray(relation.attributes),
  });
}

function relationDirection(relation: MusicBrainzRelation): KnowledgeRelation["direction"] {
  return stringValue(relation.direction) as KnowledgeRelation["direction"];
}

function relationPhrases(relation: MusicBrainzRelation): KnowledgeRelation["phrases"] | undefined {
  const phrases = removeUndefined({
    forward: stringValue(relation["forward-link-phrase"]),
    reverse: stringValue(relation["reverse-link-phrase"]),
    long: stringValue(relation["long-link-phrase"]),
  }) as NonNullable<KnowledgeRelation["phrases"]>;

  return Object.keys(phrases).length === 0 ? undefined : phrases;
}

function artistCreditText(value: unknown): string | undefined {
  const credits = artistCredits(value);
  const text = credits
    .map((credit) => {
      const name = stringValue(credit.name) ?? stringValue(credit.artist?.name);

      return name === undefined ? undefined : `${name}${stringValue(credit.joinphrase) ?? ""}`;
    })
    .filter((name): name is string => name !== undefined)
    .join("");

  return text.length === 0 ? undefined : text;
}

function releaseGroupValue(value: unknown): MusicBrainzReleaseGroup | undefined {
  return typeof value === "object" && value !== null
    ? value as MusicBrainzReleaseGroup
    : undefined;
}

function appendReleaseLabels(
  nodes: KnowledgeNode[],
  relations: KnowledgeRelation[],
  releaseNodeId: string,
  value: unknown,
): void {
  if (!Array.isArray(value)) {
    return;
  }

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const labelInfo = entry as {
      "catalog-number"?: unknown;
      label?: {
        id?: unknown;
        name?: unknown;
        disambiguation?: unknown;
        type?: unknown;
      };
    };
    const labelId = stringValue(labelInfo.label?.id);

    if (labelId === undefined) {
      continue;
    }

    const labelNodeId = `label:${labelId}`;
    const labelName = stringValue(labelInfo.label?.name);
    pushUniqueNode(nodes, {
      id: labelNodeId,
      type: "label",
      ...(labelName === undefined ? {} : { label: labelName }),
      ref: musicBrainzRef("label", labelId, labelName),
      properties: removeUndefined({
        name: labelName,
        disambiguation: stringValue(labelInfo.label?.disambiguation),
        type: stringValue(labelInfo.label?.type),
      }),
    });
    relations.push({
      type: "published_by_label",
      endpoints: [
        { nodeId: releaseNodeId, role: "release" },
        { nodeId: labelNodeId, role: "label" },
      ],
      properties: removeUndefined({
        catalogNumber: stringValue(labelInfo["catalog-number"]),
      }),
    });
  }
}

function appendTracklist(
  nodes: KnowledgeNode[],
  relations: KnowledgeRelation[],
  releaseNodeId: string,
  releaseId: string,
  value: unknown,
): void {
  if (!Array.isArray(value)) {
    return;
  }

  for (const [mediumIndex, medium] of (value as MusicBrainzMedium[]).entries()) {
    const mediumPosition = numberValue(medium.position) ?? mediumIndex + 1;
    const mediumNodeId = `medium:${releaseId}:${mediumPosition}`;
    pushUniqueNode(nodes, {
      id: mediumNodeId,
      type: "medium",
      properties: removeUndefined({
        position: mediumPosition,
        format: stringValue(medium.format),
        title: stringValue(medium.title),
        trackCount: numberValue(medium["track-count"]),
      }),
    });
    relations.push({
      type: "has_medium",
      endpoints: [
        { nodeId: releaseNodeId, role: "release" },
        { nodeId: mediumNodeId, role: "medium" },
      ],
    });

    if (!Array.isArray(medium.tracks)) {
      continue;
    }

    for (const [trackIndex, track] of (medium.tracks as MusicBrainzTrack[]).entries()) {
      const trackId = stringValue(track.id);
      const trackPosition = numberValue(track.position) ?? trackIndex + 1;
      const trackNodeId = trackId === undefined
        ? `track:${releaseId}:${mediumPosition}:${trackPosition}`
        : `track:${trackId}`;
      const trackTitle = stringValue(track.title);
      pushUniqueNode(nodes, {
        id: trackNodeId,
        type: "track",
        ...(trackTitle === undefined ? {} : { label: trackTitle }),
        ...(trackId === undefined ? {} : { ref: musicBrainzRef("track", trackId, trackTitle) }),
        properties: removeUndefined({
          position: trackPosition,
          number: stringValue(track.number),
          title: trackTitle,
          lengthMs: numberValue(track.length),
        }),
      });
      relations.push({
        type: "has_track",
        endpoints: [
          { nodeId: mediumNodeId, role: "medium" },
          { nodeId: trackNodeId, role: "track" },
        ],
      });

      const recording = objectValue(track.recording);
      const recordingId = stringValue(recording.id);

      if (recordingId === undefined) {
        continue;
      }

      const recordingNodeId = `recording:${recordingId}`;
      const recordingTitle = stringValue(recording.title);
      pushUniqueNode(nodes, {
        id: recordingNodeId,
        type: "recording",
        ...(recordingTitle === undefined ? {} : { label: recordingTitle }),
        ref: musicBrainzRef("recording", recordingId, recordingTitle),
        properties: recordingProperties(recording),
      });
      appendArtistCredits(nodes, relations, recordingNodeId, recording["artist-credit"]);
      relations.push({
        type: "represents_recording",
        endpoints: [
          { nodeId: trackNodeId, role: "track" },
          { nodeId: recordingNodeId, role: "recording" },
        ],
      });
    }
  }
}

function pushUniqueNode(nodes: KnowledgeNode[], node: KnowledgeNode): void {
  if (!nodes.some((existing) => existing.id === node.id)) {
    nodes.push(node);
  }
}

function countedNameArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return undefined;
      }

      const candidate = entry as { id?: unknown; name?: unknown; count?: unknown; disambiguation?: unknown };
      const name = stringValue(candidate.name);

      if (name === undefined) {
        return undefined;
      }

      return removeUndefined({
        id: stringValue(candidate.id),
        name,
        count: numberValue(candidate.count),
        disambiguation: stringValue(candidate.disambiguation),
      });
    })
    .filter((entry): entry is Record<string, unknown> => entry !== undefined);
}

function ratingValue(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const rating = value as { value?: unknown; "votes-count"?: unknown; votesCount?: unknown };

  return removeUndefined({
    value: numberValue(rating.value),
    votesCount: numberValue(rating["votes-count"]) ?? numberValue(rating.votesCount),
  });
}

function annotationText(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const annotation = value as { text?: unknown; content?: unknown };

  return stringValue(annotation.text) ?? stringValue(annotation.content);
}

function areaName(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return typeof value === "object" && value !== null
    ? stringValue((value as { name?: unknown }).name)
    : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.filter((entry): entry is string => typeof entry === "string");

  return values.length === 0 ? undefined : values;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.length > 0))];
}

function normalizedSearchLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 5, 1), 50);
}

function normalizedBrowseLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 25, 1), 100);
}

function buildUrl(baseUrl: string, path: string, query: Record<string, string>): string {
  const url = new URL(path, baseUrl);

  for (const key of Object.keys(query).sort()) {
    url.searchParams.set(key, query[key] ?? "");
  }

  return url.toString();
}

function musicBrainzRef(kind: string, id: string, label: string | undefined): Ref {
  const normalizedKind = normalizedMusicBrainzKind(kind);

  return {
    namespace: "musicbrainz",
    kind: normalizedKind,
    id,
    ...(label === undefined ? {} : { label }),
    url: `${defaultMusicBrainzBaseUrl}/${musicBrainzUrlKind(normalizedKind)}/${encodeURIComponent(id)}`,
  };
}

function normalizedMusicBrainzKind(kind: string): string {
  return kind.replaceAll("-", "_");
}

function musicBrainzUrlKind(kind: string): string {
  return kind === "release_group" ? "release-group" : kind;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function removeUndefined<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function createDefaultRequester(baseUrl: string): MusicBrainzRequester {
  return async ({ path, query, headers }) => {
    try {
      const response = await fetch(buildUrl(baseUrl, path, query), { headers });
      const json = await response.json() as unknown;

      return ok({
        status: response.status,
        json,
      });
    } catch (cause) {
      return fail({
        code: "knowledge.provider_unavailable",
        message: "MusicBrainz request failed.",
        module: "knowledge",
        retryable: true,
        cause,
      });
    }
  };
}

const noWaitRateLimiter: MusicBrainzRateLimiter = {
  wait: async () => {},
};

function createMusicBrainzRateLimiter(intervalMs = 1000): MusicBrainzRateLimiter {
  let nextAvailableAt = 0;

  return {
    async wait() {
      const now = Date.now();
      const delayMs = Math.max(nextAvailableAt - now, 0);
      nextAvailableAt = Math.max(nextAvailableAt, now) + intervalMs;

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    },
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
