import type {
  KnowledgeProvider,
  KnowledgeResult,
  KnowledgeCanonicalContext,
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
      const invalidQuery = validateKnowledgeQuery(input.query);

      if (invalidQuery !== null) {
        return fail(invalidQuery);
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

      const canonicalContextResult = await readCanonicalContext({
        query: input.query,
        canonicalStore,
      });

      if (!canonicalContextResult.ok) {
        return canonicalContextResult;
      }

      const items: KnowledgeResult["items"] = [];
      const warnings: StageWarning[] = [];

      for (const providerId of providerIds.value) {
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
          ...input,
          ...(canonicalContextResult.value === undefined
            ? {}
            : { canonicalContext: canonicalContextResult.value }),
        });

        if (!providerKnowledge.ok) {
          return providerKnowledge;
        }

        items.push(...providerKnowledge.value.items);

        if (providerKnowledge.warnings !== undefined) {
          warnings.push(...providerKnowledge.warnings);
        }
      }

      return ok({ items }, warnings);
    },
  };
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

function validateKnowledgeQuery(query: unknown): StageError | null {
  if (typeof query !== "object" || query === null) {
    return invalidQueryError();
  }

  const queryShape = query as { text?: unknown; canonicalRef?: unknown; relationFocus?: unknown };
  const hasText = typeof queryShape.text === "string";
  const hasCanonicalRef = isRef(queryShape.canonicalRef);

  if (hasText === hasCanonicalRef) {
    return invalidQueryError();
  }

  if (!isValidRelationFocus(queryShape.relationFocus)) {
    return invalidQueryError();
  }

  return null;
}

function isValidRelationFocus(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((focus) => focus === "members"));
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
