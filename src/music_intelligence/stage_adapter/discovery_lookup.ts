import type { Ref, Result, StageError } from "../../contracts/kernel.js";
import { refKey } from "../../contracts/kernel.js";
import {
  musicDiscoveryLookupInputSchema,
  musicDiscoveryLookupOutputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import {
  musicLookupItemLabel,
} from "../../contracts/public_music_description.js";
import type {
  MusicDiscoveryLookupInput,
  MusicDiscoveryLookupItem,
  MusicDiscoveryLookupItemDescription,
  MusicDiscoveryLookupOutput,
  MusicItemHandle,
  MusicScope,
  ParsedMusicScope,
  MusicTargetKind,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import { formatMusicItemHandle, formatMusicScopeHandle, parseMusicScopeHandle } from "../../contracts/stage_interface.js";
import {
  isMusicIntelligenceError,
  type RetrievalPool,
  type RetrievalQueryHit,
  type RetrievalQueryInput,
  type RetrievalQueryResult,
  type RetrievalQueryService,
} from "../index.js";
import {
  musicDiscoveryInstrument,
} from "./discovery_list_scopes.js";
import type {
  MusicProviderScopeAvailability,
  MusicScopeAvailabilityPort,
  MusicScopeAvailabilitySnapshot,
} from "./scope_availability.js";
import { scopeAvailabilityFailed } from "./scope_availability.js";

// Collection is a catalog-browse scope, not a discovery lookup source. This
// message is contract-bound — discovery.lookup never supports collection scopes.
const COLLECTION_NOT_SUPPORTED_BY_LOOKUP =
  "Collection scopes are not supported by music.discovery.lookup; use library.catalog.browse with a collection scope instead.";

export type CreateMusicDiscoveryLookupRegistrationInput = {
  retrievalQuery: RetrievalQueryService;
  scopeAvailability: MusicScopeAvailabilityPort;
};

type LookupFirstPageInput = Extract<MusicDiscoveryLookupInput, { lookupText: string }>;
type LookupCursorPageInput = Extract<MusicDiscoveryLookupInput, { cursor: string }>;

type ResolvedLookupScope = {
  pool: RetrievalPool;
  providerId?: string;
};

type LookupCursorQueryInput = Omit<RetrievalQueryInput, "cursor" | "limit" | "sessionId"> & {
  ownerScope: string;
  text: string;
  materialKind: MusicTargetKind;
  pools: {
    anyOf: readonly RetrievalPool[];
  };
  order: "text_relevance";
};

const LOOKUP_MAX_PROVIDER_CALLS_PER_TURN = 4;

export const musicDiscoveryLookupDescriptor: ToolDeclaration = {
  name: "music.discovery.lookup",
  instrumentId: musicDiscoveryInstrument.id,
  label: "Lookup Music",
  ownerArea: "music_intelligence",
  description: "Find or identify music candidates from concrete music lookup text without writing user state.",
  usage: {
    useWhen: "Use for active lookup-text-driven library, source-library, relation, or provider retrieval from title, artist, album, scene, or known-alias text chosen by the agent while doing music tasks. Use small limits for exploratory reference checks.",
    doNotUseWhen: "Do not use bare mood, genre, activity, texture, or semantic recommendation prompts as lookupText. First translate the mood into concrete likely artists, tracks, albums, scenes, or aliases, then look up those names. Pass scope handles as strings, not list_scopes result objects. Do not mix [all] with any other scope: omit scopes or use [all] alone for every available scope, or pass explicit non-[all] scopes. Do not use for browsing a scope without lookup text, save, play, favorite, import, or final recommendation workflows.",
    outputSemantics: "Returns public music item handles plus lookup descriptions; material handles are durable and candidate handles are unconfirmed, read-only, and TTL-bound.",
  },
  examples: [
    {
      prompt: "find recordings named whoo in my library",
      expects: "call",
    },
    {
      prompt: "look up provider candidates for this track title",
      expects: "call",
    },
    {
      prompt: "Kavinsky Nightcall",
      expects: "call",
    },
    {
      prompt: "The Midnight Los Angeles",
      expects: "call",
    },
    {
      prompt: "find quiet walking music",
      expects: "avoid",
      note: "mood and semantic recommendation are separate future tools",
    },
    {
      prompt: "synthwave dark synth retro analog instrumental",
      expects: "avoid",
      note: "generic genre and texture words are selection criteria, not concrete lookup text",
    },
    {
      prompt: "lookup across [all] and NetEase together",
      expects: "avoid",
      note: "[all] is exclusive; omit scopes or use [all] alone for every available scope, or choose explicit provider scopes",
    },
    {
      prompt: "browse my saved music scopes",
      expects: "avoid",
      note: "scope browsing belongs to music.discovery.list_scopes",
    },
    {
      prompt: "save this candidate",
      expects: "avoid",
      note: "save or commit tools are not shipped in this slice",
    },
    {
      prompt: "play this now",
      expects: "avoid",
      note: "playback tools are not shipped in this slice",
    },
    {
      prompt: "import my provider library",
      expects: "avoid",
      note: "library import is not lookup",
    },
  ],
  sideEffect: {
    durableUserStateWrite: false,
    ownerCurationWrite: false,
    runtimeStateWrite: true,
    externalCall: true,
  },
  invocationPolicy: {
    defaultDecision: "auto",
    impactClass: "read",
    dataEgress: "provider_account",
    readOnlyHint: true,
    destructiveHint: false,
    maxCallsPerTurn: LOOKUP_MAX_PROVIDER_CALLS_PER_TURN,
  },
  inputSchema: musicDiscoveryLookupInputSchema,
  outputSchema: musicDiscoveryLookupOutputSchema,
  errors: [
    {
      code: "invalid_input",
      retryable: false,
      suggestedFixTemplate: "Retry with concrete lookupText, optional targetKind, optional non-empty scope handle strings, and optional limit. Use [all] only by itself; cursor pages must pass only cursor and optional limit.",
    },
    {
      code: "invalid_cursor",
      retryable: true,
      suggestedFixTemplate: "Start a fresh first-page music.discovery.lookup call.",
    },
    {
      code: "unknown_scope",
      retryable: true,
      suggestedFixTemplate: "Call music.discovery.list_scopes for current library scopes before retrying lookup.",
    },
    {
      code: "unknown_provider_scope",
      retryable: true,
      suggestedFixTemplate: "Call music.discovery.list_scopes with kind provider before retrying lookup.",
    },
    {
      code: "unsupported_scope_target",
      retryable: true,
      suggestedFixTemplate: "Retry with a scope whose targetKind matches the requested targetKind, or call music.discovery.list_scopes to inspect each scope's targetKind.",
    },
    {
      code: "provider_scope_failed",
      retryable: true,
      suggestedFixTemplate: "Retry with the failed provider scope removed, or call music.discovery.list_scopes with kind provider before retrying.",
    },
    {
      code: "scope_budget_exceeded",
      retryable: true,
      suggestedFixTemplate: "Retry with explicit scopes that stay within the lookup provider call budget.",
    },
    {
      code: "result_window_expired",
      retryable: true,
      suggestedFixTemplate: "Start a fresh first-page music.discovery.lookup call.",
    },
    {
      code: "scope_availability_failed",
      retryable: true,
      suggestedFixTemplate: "Retry music.discovery.lookup later, or call music.discovery.list_scopes to inspect available scopes.",
    },
  ],
  resultSummary(result) {
    const output = result as MusicDiscoveryLookupOutput;
    const count = Array.isArray(output.items) ? output.items.length : 0;
    const hasMore = typeof output.nextCursor === "string" && output.nextCursor.length > 0;
    return `${count} item(s) returned; ${hasMore ? "more available" : "end of results"}.`;
  },
  agentResultText(result) {
    const output = result as MusicDiscoveryLookupOutput;
    const count = Array.isArray(output.items) ? output.items.length : 0;
    const hasMore = typeof output.nextCursor === "string" && output.nextCursor.length > 0;
    return [
      `${count} item(s) returned; ${hasMore ? "more available" : "end of results"}.`,
      ...output.items.map((item, index) => lookupItemLine(index, item)),
      ...(output.nextCursor === undefined ? [] : [`nextCursor: ${output.nextCursor}`]),
    ].join("\n");
  },
};

export function createMusicDiscoveryLookupRegistration(
  input: CreateMusicDiscoveryLookupRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: musicDiscoveryLookupDescriptor,
    handler: (ctx, payload) => handleMusicDiscoveryLookup(ctx, payload, {
      retrievalQuery: input.retrievalQuery,
      scopeAvailability: input.scopeAvailability,
    }),
  };
}

async function handleMusicDiscoveryLookup(
  ctx: StageToolContext,
  payload: unknown,
  ports: {
    retrievalQuery: RetrievalQueryService;
    scopeAvailability: MusicScopeAvailabilityPort;
  },
): Promise<Result<MusicDiscoveryLookupOutput>> {
  const input = payload as MusicDiscoveryLookupInput;

  if (isCursorPageInput(input)) {
    // Cursor pages accept only cursor + optional limit. The public schema no
    // longer enforces field isolation with a top-level oneOf (the Anthropic API
    // rejects top-level composition keywords), so the handler owns the guard:
    // first-page-only fields mixed into a cursor page are an invalid_input.
    if (hasFirstPageOnlyField(input)) {
      return invalidInput("music.discovery.lookup cursor pages must pass only cursor and optional limit; lookupText, targetKind, and scopes are not accepted on cursor pages.");
    }
    return handleCursorPage(ctx, input, ports);
  }

  return handleFirstPage(ctx, input, ports);
}

// First-page-only fields that must not appear on a cursor-page request. The
// lookup input is a first-page | cursor-page union; without a schema-level
// oneOf (rejected by the Anthropic API), this runtime check keeps the two
// pages from being mixed in a single call.
function hasFirstPageOnlyField(input: MusicDiscoveryLookupInput): boolean {
  return "lookupText" in input || "targetKind" in input || "scopes" in input;
}

async function handleFirstPage(
  ctx: StageToolContext,
  input: LookupFirstPageInput,
  ports: {
    retrievalQuery: RetrievalQueryService;
    scopeAvailability: MusicScopeAvailabilityPort;
  },
): Promise<Result<MusicDiscoveryLookupOutput>> {
  // lookupText is optional at the schema root (the public schema has no top-
  // level oneOf), so guard presence/emptiness here rather than relying on the
  // schema gate to reject a missing lookupText.
  const lookupText = (input.lookupText ?? "").trim();

  if (lookupText.length === 0) {
    return invalidInput("music.discovery.lookup requires non-empty lookupText on first-page calls.");
  }

  const targetKind = input.targetKind ?? "recording";
  const available = await ports.scopeAvailability.listAvailableMusicScopes({
    ownerScope: ctx.ownerScope,
  });

  if (!available.ok) {
    return scopeAvailabilityFailed();
  }

  const resolved = resolveLookupScopes({
    inputScopes: input.scopes,
    targetKind,
    availability: available.value,
    maxProviderCallsPerTurn: musicDiscoveryLookupDescriptor.invocationPolicy.maxCallsPerTurn,
  });

  if (!resolved.ok) {
    return resolved;
  }

  const queryInput: LookupCursorQueryInput = {
    ownerScope: ctx.ownerScope,
    text: lookupText,
    materialKind: targetKind,
    pools: {
      anyOf: resolved.value.scopes.map((scope) => scope.pool),
    },
    order: "text_relevance",
  };

  return runLookupQuery(ctx, {
    retrievalQuery: ports.retrievalQuery,
    queryInput,
    limit: input.limit,
    providerScopeLabels: resolved.value.providerScopeLabels,
  });
}

async function handleCursorPage(
  ctx: StageToolContext,
  input: LookupCursorPageInput,
  ports: {
    retrievalQuery: RetrievalQueryService;
  },
): Promise<Result<MusicDiscoveryLookupOutput>> {
  const resolved = await ctx.lookupCursors.resolve({
    ownerScope: ctx.ownerScope,
    cursorId: input.cursor,
  });

  if (!resolved.ok) {
    return resolved;
  }

  // The store returns queryInput as opaque JSON; re-validate its shape before
  // using it, since it round-tripped through persistence.
  if (!isLookupCursorQueryInput(resolved.value.queryInput)) {
    return invalidCursor("music.discovery.lookup cursor payload is invalid.");
  }

  return runLookupQuery(ctx, {
    retrievalQuery: ports.retrievalQuery,
    queryInput: resolved.value.queryInput,
    internalCursor: resolved.value.internalCursor,
    limit: input.limit,
    providerScopeLabels: providerScopeLabelsForQuery(resolved.value.queryInput),
  });
}

async function runLookupQuery(
  ctx: StageToolContext,
  input: {
    retrievalQuery: RetrievalQueryService;
    queryInput: LookupCursorQueryInput;
    internalCursor?: string;
    limit: number | undefined;
    providerScopeLabels: readonly string[];
  },
): Promise<Result<MusicDiscoveryLookupOutput>> {
  let result: RetrievalQueryResult;

  try {
    result = await input.retrievalQuery.query({
      ...input.queryInput,
      ...(input.internalCursor === undefined ? {} : { cursor: input.internalCursor }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      sessionId: ctx.sessionId,
    });
  } catch (error) {
    const publicFailure = translateKnownRetrievalError(error, input.providerScopeLabels);
    if (publicFailure === undefined) {
      // Unknown / invariant / unadapted-boundary errors cross to the Tool Call
      // Router, which normalizes them to stage_interface.tool_handler_failed.
      throw error;
    }
    return publicFailure;
  }

  const items: MusicDiscoveryLookupItem[] = [];

  for (const hit of result.hits) {
    items.push(await lookupItemForHit(ctx, hit));
  }

  return {
    ok: true,
    value: {
      items,
      ...(result.page.nextCursor === undefined
        ? {}
        : {
            nextCursor: await ctx.lookupCursors.register({
              ownerScope: ctx.ownerScope,
              internalCursor: result.page.nextCursor,
              queryInput: input.queryInput,
            }),
          }),
    },
  };
}

async function lookupItemForHit(
  ctx: StageToolContext,
  hit: RetrievalQueryHit,
): Promise<MusicDiscoveryLookupItem> {
  const handleKind = hit.kind === "material" ? "material" : "candidate";
  const handle: MusicItemHandle = formatMusicItemHandle({
    kind: handleKind,
    id: await ctx.handleMinting.mint({
      ownerScope: ctx.ownerScope,
      handleKind,
      internalAnchor: internalAnchorForHit(hit),
    }),
  });

  return {
    handle,
    description: descriptionForHit(handle, hit),
  };
}

function internalAnchorForHit(hit: RetrievalQueryHit): unknown {
  if (hit.kind === "material") {
    return {
      materialRef: refKey(hit.materialRef),
    };
  }

  return {
    materialCandidateRef: refKey(hit.materialCandidateRef),
  };
}

function descriptionForHit(
  handle: MusicItemHandle,
  hit: RetrievalQueryHit,
): MusicDiscoveryLookupItemDescription {
  const title = cleanDisplayText(hit.display.title);
  const artistsText = cleanDisplayText(hit.display.artistsText);
  const album = cleanDisplayText(hit.display.album);
  const versionText = cleanDisplayText(hit.display.versionText);

  return {
    label: musicLookupItemLabel({
      handle,
      ...(title === undefined ? {} : { title }),
      ...(artistsText === undefined ? {} : { artistsText }),
      ...(album === undefined ? {} : { album }),
      ...(versionText === undefined ? {} : { versionText }),
    }),
    ...(title === undefined ? {} : { title }),
    ...(artistsText === undefined ? {} : { artistsText }),
    ...(album === undefined ? {} : { album }),
    ...(versionText === undefined ? {} : { versionText }),
  };
}

function lookupItemLine(index: number, item: MusicDiscoveryLookupItem): string {
  const details = [
    optionalQuotedField("title", item.description.title),
    optionalQuotedField("artists", item.description.artistsText),
    optionalQuotedField("album", item.description.album),
    optionalQuotedField("version", item.description.versionText),
  ].filter((field): field is string => field !== undefined);
  return [
    `${index}. ${JSON.stringify(item.description.label)} ${item.handle}`,
    ...(details.length === 0 ? [] : [`   ${details.join("; ")}`]),
  ].join("\n");
}

function optionalQuotedField(label: string, value: string | undefined): string | undefined {
  return value === undefined ? undefined : `${label}: ${JSON.stringify(value)}`;
}

function resolveLookupScopes(input: {
  inputScopes: LookupFirstPageInput["scopes"];
  targetKind: MusicTargetKind;
  availability: MusicScopeAvailabilitySnapshot;
  maxProviderCallsPerTurn: number | undefined;
}): Result<{
  scopes: readonly ResolvedLookupScope[];
  providerScopeLabels: readonly string[];
}> {
  const normalized = normalizeLookupScopes(input.inputScopes);

  if (!normalized.ok) {
    return normalized;
  }

  if (normalized.value.some((scope) => scope.kind === "all")) {
    return resolveAllLookupScopes(input);
  }

  const resolved: ResolvedLookupScope[] = [];

  for (const scope of normalized.value) {
    const scopeResult = resolveConcreteLookupScope({
      scope,
      targetKind: input.targetKind,
      availability: input.availability,
    });

    if (!scopeResult.ok) {
      return scopeResult;
    }

    resolved.push(scopeResult.value);
  }

  return {
    ok: true,
    value: {
      scopes: resolved,
      providerScopeLabels: providerScopeLabelsForResolvedScopes(resolved),
    },
  };
}

function resolveAllLookupScopes(input: {
  targetKind: MusicTargetKind;
  availability: MusicScopeAvailabilitySnapshot;
  maxProviderCallsPerTurn: number | undefined;
}): Result<{
  scopes: readonly ResolvedLookupScope[];
  providerScopeLabels: readonly string[];
}> {
  const providers = input.availability.providers;
  const maxProviderCalls = input.maxProviderCallsPerTurn;

  if (maxProviderCalls !== undefined && providers.length > maxProviderCalls) {
    return scopeBudgetExceeded({
      providerCount: providers.length,
      maxProviderCalls,
      overBudgetProviders: providers.slice(maxProviderCalls).map((scope) => scope.providerId),
      survivingProviders: providers.slice(0, maxProviderCalls).map((scope) => scope.providerId),
    });
  }

  const resolved: ResolvedLookupScope[] = [libraryScope()];

  for (const provider of providers) {
    const providerScope = resolveProviderScope({
      provider,
      targetKind: input.targetKind,
    });

    if (!providerScope.ok) {
      return providerScope;
    }

    resolved.push(providerScope.value);
  }

  return {
    ok: true,
    value: {
      scopes: resolved,
      providerScopeLabels: providerScopeLabelsForResolvedScopes(resolved),
    },
  };
}

function resolveConcreteLookupScope(input: {
  scope: ParsedMusicScope;
  targetKind: MusicTargetKind;
  availability: MusicScopeAvailabilitySnapshot;
}): Result<ResolvedLookupScope> {
  const { scope } = input;

  switch (scope.kind) {
    case "library":
      return {
        ok: true,
        value: libraryScope(),
      };
    case "source_library": {
      const available = input.availability.sourceLibraries.find((candidate) => candidate.id === scope.id);

      if (available === undefined) {
        return unknownScope(scope.id);
      }

      if (available.targetKind !== input.targetKind) {
        return unsupportedScopeTarget({
          scopeKind: "source_library",
          scopeLabel: scope.id,
          targetKind: input.targetKind,
          supportedTargetKinds: [available.targetKind],
        });
      }

      return {
        ok: true,
        value: {
          pool: {
            kind: "source_library",
            ref: copyRef(available.ref),
          },
        },
      };
    }
    case "relation": {
      const available = input.availability.relations.find((candidate) => candidate.id === scope.id);

      if (available === undefined) {
        return unknownScope(scope.id);
      }

      if (available.targetKind !== input.targetKind) {
        return unsupportedScopeTarget({
          scopeKind: "relation",
          scopeLabel: scope.id,
          targetKind: input.targetKind,
          supportedTargetKinds: [available.targetKind],
        });
      }

      return {
        ok: true,
        value: {
          pool: {
            kind: "owner_relation",
            ref: copyRef(available.ref),
          },
        },
      };
    }
    case "provider": {
      const provider = input.availability.providers.find((candidate) => candidate.providerId === scope.providerId);

      if (provider === undefined) {
        return unknownProviderScope(scope.providerId);
      }

      return resolveProviderScope({
        provider,
        targetKind: input.targetKind,
      });
    }
    case "all":
      return invalidInput("The all scope must be resolved before concrete scope dispatch.");
    case "collection":
      // Collection is a catalog-browse scope (library.catalog), not a discovery
      // lookup source; discovery.lookup searches providers/relations/libraries.
      return invalidInput(COLLECTION_NOT_SUPPORTED_BY_LOOKUP);
  }
}

function resolveProviderScope(input: {
  provider: MusicProviderScopeAvailability;
  targetKind: MusicTargetKind;
}): Result<ResolvedLookupScope> {
  if (!input.provider.targetKinds.includes(input.targetKind)) {
    return unsupportedScopeTarget({
      scopeKind: "provider",
      scopeLabel: input.provider.providerId,
      targetKind: input.targetKind,
      supportedTargetKinds: input.provider.targetKinds,
    });
  }

  return {
    ok: true,
    value: {
      providerId: input.provider.providerId,
      pool: {
        kind: "provider_search",
        providerId: input.provider.providerId,
      },
    },
  };
}

function libraryScope(): ResolvedLookupScope {
  return {
    pool: {
      kind: "local_catalog",
    },
  };
}

function normalizeLookupScopes(
  inputScopes: LookupFirstPageInput["scopes"],
): Result<readonly ParsedMusicScope[]> {
  if (inputScopes !== undefined && inputScopes.length === 0) {
    return invalidInput("music.discovery.lookup scopes must be non-empty when present.");
  }

  const rawScopes = inputScopes ?? [formatMusicScopeHandle({ kind: "all" })];
  const scopesByKey = new Map<string, ParsedMusicScope>();

  for (const rawScope of rawScopes) {
    const normalized = normalizeLookupScope(rawScope);

    if (!normalized.ok) {
      return normalized;
    }

    const key = musicScopeIdentityKey(normalized.value);
    if (!scopesByKey.has(key)) {
      scopesByKey.set(key, normalized.value);
    }
  }

  const scopes = Array.from(scopesByKey.values());
  const hasAll = scopes.some((scope) => scope.kind === "all");
  if (hasAll && scopes.length > 1) {
    return invalidInput("music.discovery.lookup scope all cannot be mixed with any other scope; omit scopes or use [all] alone for every available scope, or pass explicit non-[all] scopes.");
  }

  const hasLibrary = scopes.some((scope) => scope.kind === "library");
  const hasLibraryConstituent = scopes.some((scope) =>
    scope.kind === "source_library" || scope.kind === "relation"
  );
  if (hasLibrary && hasLibraryConstituent) {
    return invalidInput("music.discovery.lookup scope library cannot be mixed with source_library or relation scopes.");
  }

  return {
    ok: true,
    value: scopes,
  };
}

function normalizeLookupScope(value: MusicScope): Result<ParsedMusicScope> {
  const parsed = parseMusicScopeHandle(value);
  switch (parsed.kind) {
    case "all":
    case "library":
      return {
        ok: true,
        value: parsed,
      };
    case "source_library":
    case "relation":
      return {
        ok: true,
        value: parsed,
      };
    case "provider":
      return {
        ok: true,
        value: parsed,
      };
    case "collection":
      return invalidInput(COLLECTION_NOT_SUPPORTED_BY_LOOKUP);
    default:
      return assertNever(parsed);
  }
}

function musicScopeIdentityKey(scope: ParsedMusicScope): string {
  switch (scope.kind) {
    case "all":
    case "library":
      return scope.kind;
    case "source_library":
    case "relation":
      return `${scope.kind}:${scope.id}`;
    case "collection":
      return `collection:${scope.id}`;
    case "provider":
      return `provider:${scope.providerId}`;
  }
}

function isCursorPageInput(input: MusicDiscoveryLookupInput): input is LookupCursorPageInput {
  return "cursor" in input;
}

function isMusicTargetKind(value: unknown): value is MusicTargetKind {
  return value === "recording" || value === "album" || value === "artist";
}

function isLookupCursorQueryInput(value: unknown): value is LookupCursorQueryInput {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.ownerScope !== "string" ||
    typeof value.text !== "string" ||
    !isMusicTargetKind(value.materialKind) ||
    value.order !== "text_relevance" ||
    !isRecord(value.pools) ||
    !Array.isArray(value.pools.anyOf)
  ) {
    return false;
  }

  return value.pools.anyOf.every(isRetrievalPool);
}

function isRetrievalPool(value: unknown): value is RetrievalPool {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "local_catalog") {
    return true;
  }

  if (value.kind === "provider_search") {
    return typeof value.providerId === "string" && value.providerId.length > 0;
  }

  if (value.kind === "source_library" || value.kind === "owner_relation") {
    return isRef(value.ref);
  }

  return false;
}

function isRef(value: unknown): value is Ref {
  return isRecord(value) &&
    typeof value.namespace === "string" &&
    typeof value.kind === "string" &&
    typeof value.id === "string";
}

// Translates a KNOWN, classified MusicIntelligenceError from Retrieval into the
// lookup tool's declared public error vocabulary. Returns undefined for unknown
// errors, non-MusicIntelligenceError throws, and the invariant / unadapted-boundary
// codes below — those must NOT be fabricated as public lookup failures; the caller
// (runLookupQuery) rethrows the ORIGINAL error so the Tool Call Router owns its
// normalization as stage_interface.tool_handler_failed. One failure channel here:
// it returns (Result, or undefined = "no public translation"); the caller owns the
// throw. This keeps the function honest about its declared `Result<never> | undefined`.
function translateKnownRetrievalError(
  error: unknown,
  providerScopeLabels: readonly string[],
): Result<never> | undefined {
  if (!isMusicIntelligenceError(error)) {
    return undefined;
  }

  switch (error.code) {
    case "music_intelligence.retrieval_cursor_invalid":
    case "music_intelligence.cursor_invalid":
    case "music_intelligence.cursor_mismatch":
      return invalidCursor("music.discovery.lookup cursor is invalid for this result window.");
    case "music_intelligence.retrieval_result_set_expired":
    case "music_intelligence.material_candidate_expired":
      return resultWindowExpired("music.discovery.lookup result window expired.");
    case "music_intelligence.provider_search_failed":
    case "music_intelligence.provider_search_result_invalid":
    case "music_intelligence.provider_search_unavailable":
      return providerScopeFailed(failedProviderScopeLabels(error, providerScopeLabels));
    // Invariant / unadapted-boundary failures: no public translation — return
    // undefined so the caller rethrows the original error (preserving code+cause).
    case "music_intelligence.provider_search_pool_invalid":
    case "music_intelligence.retrieval_query_invalid":
    case "music_intelligence.retrieval_result_invalid":
      return undefined;
    default:
      assertNeverMusicIntelligenceErrorCode(error.code);
  }
}

function assertNever(value: never): never {
  throw new Error(`music.discovery.lookup received unsupported scope: ${JSON.stringify(value)}`);
}

function assertNeverMusicIntelligenceErrorCode(code: never): never {
  throw new Error(`music.discovery.lookup received unsupported Retrieval error code: ${code}`);
}

function failedProviderScopeLabels(
  error: Error,
  providerScopeLabels: readonly string[],
): readonly string[] {
  const text = collectErrorText(error).toLowerCase();

  // Name only the provider(s) whose id appears in the error text. When no specific provider can
  // be identified, return no labels so providerScopeFailed emits a generic message instead of
  // blaming every provider scope. (A structured providerId error channel is a follow-up.)
  return providerScopeLabels.filter((label) => text.includes(label.toLowerCase()));
}

function collectErrorText(error: unknown): string {
  if (error instanceof Error) {
    return [
      error.message,
      collectErrorText(error.cause),
    ].filter((part) => part.length > 0).join(" ");
  }

  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  return "";
}

function providerScopeLabelsForResolvedScopes(scopes: readonly ResolvedLookupScope[]): readonly string[] {
  return scopes.flatMap((scope) => scope.providerId === undefined ? [] : [scope.providerId]);
}

function providerScopeLabelsForQuery(input: LookupCursorQueryInput): readonly string[] {
  return input.pools.anyOf.flatMap((pool) =>
    pool.kind === "provider_search" ? [pool.providerId] : []
  );
}

function cleanDisplayText(value: string | undefined): string | undefined {
  const cleaned = value?.trim();

  return cleaned === undefined || cleaned.length === 0 ? undefined : cleaned;
}

function copyRef(ref: Ref): Ref {
  return {
    namespace: ref.namespace,
    kind: ref.kind,
    id: ref.id,
    ...(ref.label === undefined ? {} : { label: ref.label }),
  };
}

function invalidInput(message: string): Result<never> {
  return fail({
    code: "invalid_input",
    message,
    retryable: false,
    suggestedFix: "Retry with a first-page lookupText request or a cursor-page request containing only cursor and optional limit.",
  });
}

function invalidCursor(message: string): Result<never> {
  return fail({
    code: "invalid_cursor",
    message,
    retryable: true,
    suggestedFix: "Start a fresh first-page music.discovery.lookup call.",
  });
}

function unknownScope(scopeId: string): Result<never> {
  return fail({
    code: "unknown_scope",
    message: `Music scope '${scopeId}' is unknown or unavailable.`,
    retryable: true,
    suggestedFix: "Call music.discovery.list_scopes for current library scopes before retrying lookup.",
  });
}

function unknownProviderScope(providerId: string): Result<never> {
  return fail({
    code: "unknown_provider_scope",
    message: `Provider scope '${providerId}' is unknown or unavailable.`,
    retryable: true,
    suggestedFix: "Call music.discovery.list_scopes with kind provider before retrying lookup.",
  });
}

function unsupportedScopeTarget(input: {
  scopeKind: "source_library" | "relation" | "provider";
  scopeLabel: string;
  targetKind: MusicTargetKind;
  supportedTargetKinds: readonly MusicTargetKind[];
}): Result<never> {
  return fail({
    code: "unsupported_scope_target",
    message: `${input.scopeKind} scope '${input.scopeLabel}' does not support ${input.targetKind} lookup (supports: ${input.supportedTargetKinds.join(", ")}).`,
    retryable: true,
    suggestedFix: `Retry without this scope, or choose a targetKind it supports (${input.supportedTargetKinds.join(", ")}).`,
  });
}

function providerScopeFailed(providerScopeLabels: readonly string[]): Result<never> {
  const labels = providerScopeLabels.length === 0
    ? ["requested provider scope"]
    : providerScopeLabels;
  const failed = labels.join(", ");

  return fail({
    code: "provider_scope_failed",
    message: `Provider scope failed: ${failed}.`,
    retryable: true,
    suggestedFix: `Retry music.discovery.lookup without failed provider scope: ${failed}.`,
  });
}

function scopeBudgetExceeded(input: {
  providerCount: number;
  maxProviderCalls: number;
  overBudgetProviders: readonly string[];
  survivingProviders: readonly string[];
}): Result<never> {
  return fail({
    code: "scope_budget_exceeded",
    message: `Scope all would call ${input.providerCount} provider scopes, exceeding maxCallsPerTurn ${input.maxProviderCalls}; over budget: ${input.overBudgetProviders.join(", ")}.`,
    retryable: true,
    suggestedFix: `Retry with explicit scopes such as library${input.survivingProviders.length === 0 ? "" : ` plus providers ${input.survivingProviders.join(", ")}`}.`,
  });
}

function resultWindowExpired(message: string): Result<never> {
  return fail({
    code: "result_window_expired",
    message,
    retryable: true,
    suggestedFix: "Start a fresh first-page music.discovery.lookup call.",
  });
}

function fail(input: {
  code: string;
  message: string;
  retryable: boolean;
  suggestedFix?: string;
}): Result<never> {
  const error: StageError = {
    code: input.code,
    message: input.message,
    area: "music_intelligence",
    retryable: input.retryable,
    ...(input.suggestedFix === undefined ? {} : { suggestedFix: input.suggestedFix }),
  };

  return {
    ok: false,
    error,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
