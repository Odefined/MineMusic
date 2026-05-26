import type {
  KnowledgeProvider,
  KnowledgeQuery,
  KnowledgeQueryBase,
  KnowledgeResult,
  KnowledgeCanonicalContext,
  KnowledgeFieldQuery,
  KnowledgeFilters,
  Ref,
  Result,
  StageError,
  StageWarning,
} from "../contracts/index.js";
import type {
  CanonicalStorePort,
  MusicKnowledgePort,
  PluginRegistryPort,
} from "../ports/index.js";

type MusicKnowledgeServiceOptions = {
  pluginRegistry: PluginRegistryPort;
  canonicalStore?: CanonicalStorePort;
};

export function createMusicKnowledgeService({
  pluginRegistry,
  canonicalStore,
}: MusicKnowledgeServiceOptions): MusicKnowledgePort {
  return {
    async query(input) {
      const normalizedQuery = normalizeKnowledgeQuery(input.query);

      if (!normalizedQuery.ok) {
        return normalizedQuery;
      }

      const providerIds = await pluginRegistry.listProviders({ slot: "knowledge" });

      if (!providerIds.ok) {
        return providerIds;
      }

      if (providerIds.value.length === 0) {
        return fail({
          code: "knowledge.no_provider",
          message: "No knowledge providers are registered.",
          module: "knowledge",
          retryable: false,
        });
      }

      const continuation = readContinuationCursor(normalizedQuery.value, providerIds.value);

      if (!continuation.ok) {
        return continuation;
      }

      const canonicalContextResult = await readCanonicalContext({
        query: normalizedQuery.value,
        canonicalStore,
      });

      if (!canonicalContextResult.ok) {
        return canonicalContextResult;
      }

      const items: KnowledgeResult["items"] = [];
      const warnings: StageWarning[] = [];
      const nextProviderCursors: Record<string, string> = {};

      for (const providerId of providerIds.value) {
        const providerCursor = continuation.value?.providerCursors[providerId];

        if (continuation.value !== undefined && providerCursor === undefined) {
          continue;
        }

        const providerResult = await pluginRegistry.getProvider({
          slot: "knowledge",
          providerId,
        });

        if (!providerResult.ok) {
          return providerResult;
        }

        if (!isKnowledgeProvider(providerResult.value)) {
          continue;
        }

        const providerKnowledge = await providerResult.value.query({
          query: queryForProvider(normalizedQuery.value, providerCursor),
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
          ...(canonicalContextResult.value === undefined
            ? {}
            : { canonicalContext: canonicalContextResult.value }),
        });

        if (!providerKnowledge.ok) {
          return providerKnowledge;
        }

        items.push(...providerKnowledge.value.items);

        if (providerKnowledge.value.nextCursor !== undefined) {
          nextProviderCursors[providerId] = providerKnowledge.value.nextCursor;
        }

        if (providerKnowledge.warnings !== undefined) {
          warnings.push(...providerKnowledge.warnings);
        }
      }

      const result: KnowledgeResult = { items };

      if (Object.keys(nextProviderCursors).length > 0) {
        result.nextCursor = encodeContinuationCursor({
          queryKey: continuationQueryKey(normalizedQuery.value),
          providerIds: providerIds.value,
          providerCursors: nextProviderCursors,
        });
      }

      return ok(result, warnings);
    },
  };
}

type KnowledgeContinuationCursor = {
  queryKey: string;
  providerIds: string[];
  providerCursors: Record<string, string>;
};

function readContinuationCursor(
  query: KnowledgeQuery,
  providerIds: string[],
): Result<KnowledgeContinuationCursor | undefined> {
  if (query.cursor === undefined) {
    return ok(undefined);
  }

  const decoded = decodeContinuationCursor(query.cursor);

  if (!decoded.ok) {
    return decoded;
  }

  if (
    decoded.value.queryKey !== continuationQueryKey(query) ||
    decoded.value.providerIds.join("\n") !== providerIds.join("\n")
  ) {
    return fail(invalidQueryError());
  }

  return decoded;
}

function queryForProvider(query: KnowledgeQuery, providerCursor: string | undefined): KnowledgeQuery {
  const { cursor: _cursor, ...queryWithoutCursor } = query;

  return providerCursor === undefined
    ? queryWithoutCursor as KnowledgeQuery
    : { ...queryWithoutCursor, cursor: providerCursor } as KnowledgeQuery;
}

function encodeContinuationCursor(cursor: KnowledgeContinuationCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeContinuationCursor(cursor: string): Result<KnowledgeContinuationCursor> {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;

    if (!isKnowledgeContinuationCursor(decoded)) {
      return fail(invalidQueryError());
    }

    return ok(decoded);
  } catch {
    return fail(invalidQueryError());
  }
}

function isKnowledgeContinuationCursor(value: unknown): value is KnowledgeContinuationCursor {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as KnowledgeContinuationCursor;

  return (
    typeof candidate.queryKey === "string" &&
    Array.isArray(candidate.providerIds) &&
    candidate.providerIds.every((providerId) => typeof providerId === "string") &&
    typeof candidate.providerCursors === "object" &&
    candidate.providerCursors !== null &&
    Object.values(candidate.providerCursors).every((providerCursor) => typeof providerCursor === "string")
  );
}

function continuationQueryKey(query: KnowledgeQuery): string {
  const { cursor: _cursor, limit: _limit, ...queryShape } = query;

  return stableStringify(queryShape);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
    ).join(",")}}`;
  }

  return JSON.stringify(value);
}

async function readCanonicalContext({
  query,
  canonicalStore,
}: {
  query: unknown;
  canonicalStore: CanonicalStorePort | undefined;
}): Promise<Result<KnowledgeCanonicalContext | undefined>> {
  const canonicalRef = (query as { canonicalRef?: unknown }).canonicalRef;

  if (!isRef(canonicalRef)) {
    return ok(undefined);
  }

  if (canonicalStore === undefined) {
    return fail({
      code: "knowledge.provider_unavailable",
      message: "Canonical Store is required for canonicalRef knowledge queries.",
      module: "knowledge",
      retryable: false,
    });
  }

  const record = await canonicalStore.get({ ref: canonicalRef });

  if (!record.ok) {
    return record;
  }

  if (record.value === null) {
    return fail({
      code: "canonical.not_found",
      message: `Canonical record '${canonicalRef.id}' was not found.`,
      module: "canonical",
      retryable: false,
    });
  }

  const relations = await canonicalStore.listRelations({ subjectRef: canonicalRef });

  if (!relations.ok) {
    return relations;
  }

  return ok({
    record: record.value,
    relations: relations.value,
  });
}

function normalizeKnowledgeQuery(query: unknown): Result<KnowledgeQuery> {
  if (typeof query !== "object" || query === null) {
    return fail(invalidQueryError());
  }

  const queryShape = query as Record<string, unknown>;
  const hasText = typeof queryShape.text === "string";
  const hasCanonicalRef = isRef(queryShape.canonicalRef);
  const tagQuery = normalizeOptionalTagArray(queryShape.tagQuery);
  const fieldQuery = normalizeFieldQuery(queryShape.fieldQuery);
  const filters = normalizeFilters(queryShape.filters);

  if (!tagQuery.ok) {
    return tagQuery;
  }

  if (!fieldQuery.ok) {
    return fieldQuery;
  }

  if (!filters.ok) {
    return filters;
  }

  if (!isValidRelationFocus(queryShape.relationFocus) || !isValidCursor(queryShape.cursor)) {
    return fail(invalidQueryError());
  }

  const queryEntryCount = [
    hasText,
    hasCanonicalRef,
    tagQuery.value !== undefined,
    fieldQuery.value !== undefined,
  ].filter(Boolean).length;

  if (queryEntryCount !== 1) {
    return fail(invalidQueryError());
  }

  if (
    tagQuery.value !== undefined &&
    filters.value?.tags?.exclude !== undefined &&
    tagQuery.value.some((tag) => filters.value?.tags?.exclude?.includes(tag) === true)
  ) {
    return fail(invalidQueryError());
  }

  const base = knowledgeQueryBase(queryShape, filters.value);

  if (hasText) {
    return ok({
      ...base,
      text: queryShape.text as string,
    });
  }

  if (hasCanonicalRef) {
    return ok({
      ...base,
      canonicalRef: queryShape.canonicalRef as Ref,
    });
  }

  if (tagQuery.value !== undefined) {
    return ok({
      ...base,
      tagQuery: tagQuery.value,
    });
  }

  return ok({
    ...base,
    fieldQuery: fieldQuery.value as KnowledgeFieldQuery,
  });
}

function knowledgeQueryBase(
  queryShape: Record<string, unknown>,
  filters: KnowledgeFilters | undefined,
): KnowledgeQueryBase {
  const base: KnowledgeQueryBase = {};

  if (filters !== undefined) {
    base.filters = filters;
  }

  if (queryShape.purpose !== undefined) {
    base.purpose = queryShape.purpose as NonNullable<KnowledgeQueryBase["purpose"]>;
  }

  if (queryShape.formats !== undefined) {
    base.formats = queryShape.formats as NonNullable<KnowledgeQueryBase["formats"]>;
  }

  if (queryShape.entityKinds !== undefined) {
    base.entityKinds = queryShape.entityKinds as string[];
  }

  if (queryShape.expand !== undefined) {
    base.expand = queryShape.expand as string[];
  }

  if (queryShape.relationFocus !== undefined) {
    base.relationFocus = queryShape.relationFocus as NonNullable<KnowledgeQueryBase["relationFocus"]>;
  }

  if (queryShape.limit !== undefined) {
    base.limit = queryShape.limit as number;
  }

  if (queryShape.cursor !== undefined) {
    base.cursor = queryShape.cursor as string;
  }

  return base;
}

function normalizeOptionalTagArray(value: unknown): Result<string[] | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (!Array.isArray(value) || value.length === 0) {
    return fail(invalidQueryError());
  }

  const tags: string[] = [];

  for (const tag of value) {
    if (typeof tag !== "string") {
      return fail(invalidQueryError());
    }

    const normalizedTag = normalizeTag(tag);

    if (normalizedTag.length === 0) {
      return fail(invalidQueryError());
    }

    if (!tags.includes(normalizedTag)) {
      tags.push(normalizedTag);
    }
  }

  return ok(tags);
}

function normalizeFilters(value: unknown): Result<KnowledgeFilters | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(invalidQueryError());
  }

  const tagsValue = (value as { tags?: unknown }).tags;

  if (tagsValue === undefined) {
    return ok(undefined);
  }

  if (typeof tagsValue !== "object" || tagsValue === null || Array.isArray(tagsValue)) {
    return fail(invalidQueryError());
  }

  const include = normalizeOptionalTagArray((tagsValue as { include?: unknown }).include);
  const exclude = normalizeOptionalTagArray((tagsValue as { exclude?: unknown }).exclude);

  if (!include.ok) {
    return include;
  }

  if (!exclude.ok) {
    return exclude;
  }

  if (
    include.value !== undefined &&
    exclude.value !== undefined &&
    include.value.some((tag) => exclude.value?.includes(tag) === true)
  ) {
    return fail(invalidQueryError());
  }

  return ok({
    tags: {
      ...(include.value === undefined ? {} : { include: include.value }),
      ...(exclude.value === undefined ? {} : { exclude: exclude.value }),
    },
  });
}

const knowledgeFieldQueryKeys = [
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

function normalizeFieldQuery(value: unknown): Result<KnowledgeFieldQuery | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(invalidQueryError());
  }

  const source = value as Record<string, unknown>;
  const fields: KnowledgeFieldQuery = {};

  for (const key of knowledgeFieldQueryKeys) {
    const fieldValue = source[key];

    if (fieldValue === undefined) {
      continue;
    }

    if (typeof fieldValue !== "string") {
      return fail(invalidQueryError());
    }

    const normalizedValue = normalizeFieldValue(fieldValue);

    if (normalizedValue.length === 0) {
      return fail(invalidQueryError());
    }

    fields[key] = normalizedValue;
  }

  if (Object.keys(fields).length === 0) {
    return fail(invalidQueryError());
  }

  return ok(fields);
}

function normalizeTag(value: string): string {
  return normalizeFieldValue(value).toLowerCase();
}

function normalizeFieldValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function isValidRelationFocus(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((focus) => focus === "members"));
}

function isValidCursor(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isRef(value: unknown): value is Ref {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { namespace?: unknown }).namespace === "string" &&
    typeof (value as { kind?: unknown }).kind === "string" &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

function invalidQueryError(): StageError {
  return {
    code: "knowledge.invalid_query",
    message: "Knowledge query must provide exactly one of text or canonicalRef.",
    module: "knowledge",
    retryable: false,
  };
}

function isKnowledgeProvider(provider: unknown): provider is KnowledgeProvider {
  return (
    typeof provider === "object" &&
    provider !== null &&
    "query" in provider &&
    typeof provider.query === "function"
  );
}

function ok<T>(value: T, warnings: StageWarning[] = []): Result<T> {
  if (warnings.length === 0) {
    return { ok: true, value };
  }

  return { ok: true, value, warnings };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
