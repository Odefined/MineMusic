import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

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
  MusicTargetKind,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
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

export type CreateMusicDiscoveryLookupRegistrationInput = {
  retrievalQuery: RetrievalQueryService;
  scopeAvailability: MusicScopeAvailabilityPort;
  cursorKey?: Uint8Array;
  cursorTtlMs?: number;
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

type LookupCursorPayload = {
  version: 1;
  ownerScope: string;
  expiresAt: string;
  internalCursor: string;
  queryInput: LookupCursorQueryInput;
};

type LookupCursorCodec = {
  encode(input: {
    ctx: StageToolContext;
    internalCursor: string;
    queryInput: LookupCursorQueryInput;
  }): string;
  decode(input: {
    ctx: StageToolContext;
    cursor: string;
  }): Result<{
    internalCursor: string;
    queryInput: LookupCursorQueryInput;
  }>;
};

const LOOKUP_CURSOR_VERSION = "mlc1";
const LOOKUP_CURSOR_AAD = Buffer.from("music.discovery.lookup.cursor.v1", "utf8");
const DEFAULT_LOOKUP_CURSOR_TTL_MS = 30 * 60 * 1000;
const LOOKUP_MAX_PROVIDER_CALLS_PER_TURN = 4;
const LOOKUP_MAX_LIMIT = 100;

export const musicDiscoveryLookupDescriptor: ToolDeclaration = {
  name: "music.discovery.lookup",
  instrumentId: musicDiscoveryInstrument.id,
  label: "Lookup Music",
  ownerArea: "music_intelligence",
  description: "Find or identify music candidates from music lookup text without writing user state.",
  usage: {
    useWhen: "Use for active lookup-text-driven library, source-library, relation, or provider retrieval from title, artist, album, or known-alias text chosen by the agent while doing music tasks.",
    doNotUseWhen: "Do not use for mood or semantic recommendation prompts, browsing a scope without lookup text, save, play, favorite, import, or final recommendation workflows.",
    outputSemantics: "Returns public music item handles plus lookup descriptions; library handles are durable and candidate handles are unconfirmed, read-only, and TTL-bound.",
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
      prompt: "find quiet walking music",
      expects: "avoid",
      note: "mood and semantic recommendation are separate future tools",
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
    runtimeStateWrite: true,
    externalCall: true,
  },
  invocationPolicy: {
    defaultDecision: "auto",
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
      suggestedFixTemplate: "Retry with lookupText, optional targetKind, optional non-empty scopes, and optional limit; cursor pages must pass only cursor and optional limit.",
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
};

export function createMusicDiscoveryLookupRegistration(
  input: CreateMusicDiscoveryLookupRegistrationInput,
): StageToolRegistration {
  const cursorCodec = createLookupCursorCodec({
    ...(input.cursorKey === undefined ? {} : { key: input.cursorKey }),
    ...(input.cursorTtlMs === undefined ? {} : { ttlMs: input.cursorTtlMs }),
  });

  return {
    descriptor: musicDiscoveryLookupDescriptor,
    handler: (ctx, payload) => handleMusicDiscoveryLookup(ctx, payload, {
      retrievalQuery: input.retrievalQuery,
      scopeAvailability: input.scopeAvailability,
      cursorCodec,
    }),
  };
}

async function handleMusicDiscoveryLookup(
  ctx: StageToolContext,
  payload: unknown,
  ports: {
    retrievalQuery: RetrievalQueryService;
    scopeAvailability: MusicScopeAvailabilityPort;
    cursorCodec: LookupCursorCodec;
  },
): Promise<Result<MusicDiscoveryLookupOutput>> {
  const parsed = parseMusicDiscoveryLookupInput(payload);

  if (!parsed.ok) {
    return parsed;
  }

  if (isCursorPageInput(parsed.value)) {
    return handleCursorPage(ctx, parsed.value, ports);
  }

  return handleFirstPage(ctx, parsed.value, ports);
}

async function handleFirstPage(
  ctx: StageToolContext,
  input: LookupFirstPageInput,
  ports: {
    retrievalQuery: RetrievalQueryService;
    scopeAvailability: MusicScopeAvailabilityPort;
    cursorCodec: LookupCursorCodec;
  },
): Promise<Result<MusicDiscoveryLookupOutput>> {
  const lookupText = input.lookupText.trim();

  if (lookupText.length === 0) {
    return invalidInput("music.discovery.lookup requires non-empty lookupText on first-page calls.");
  }

  const limit = normalizeLookupLimit(input.limit);
  if (!limit.ok) {
    return limit;
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
    cursorCodec: ports.cursorCodec,
    queryInput,
    limit: limit.value,
    providerScopeLabels: resolved.value.providerScopeLabels,
  });
}

async function handleCursorPage(
  ctx: StageToolContext,
  input: LookupCursorPageInput,
  ports: {
    retrievalQuery: RetrievalQueryService;
    cursorCodec: LookupCursorCodec;
  },
): Promise<Result<MusicDiscoveryLookupOutput>> {
  const limit = normalizeLookupLimit(input.limit);
  if (!limit.ok) {
    return limit;
  }

  const decoded = ports.cursorCodec.decode({
    ctx,
    cursor: input.cursor,
  });

  if (!decoded.ok) {
    return decoded;
  }

  return runLookupQuery(ctx, {
    retrievalQuery: ports.retrievalQuery,
    cursorCodec: ports.cursorCodec,
    queryInput: decoded.value.queryInput,
    internalCursor: decoded.value.internalCursor,
    limit: limit.value,
    providerScopeLabels: providerScopeLabelsForQuery(decoded.value.queryInput),
  });
}

async function runLookupQuery(
  ctx: StageToolContext,
  input: {
    retrievalQuery: RetrievalQueryService;
    cursorCodec: LookupCursorCodec;
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
    return mapRetrievalError(error, input.providerScopeLabels);
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
            nextCursor: input.cursorCodec.encode({
              ctx,
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
  const handleKind = hit.kind === "material" ? "library" : "candidate";
  const handle: MusicItemHandle = {
    kind: handleKind,
    id: await ctx.handleMinting.mint({
      ownerScope: ctx.ownerScope,
      handleKind,
      internalAnchor: internalAnchorForHit(hit),
    }),
  };

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
  scope: MusicScope;
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
): Result<readonly MusicScope[]> {
  if (inputScopes !== undefined && inputScopes.length === 0) {
    return invalidInput("music.discovery.lookup scopes must be non-empty when present.");
  }

  const rawScopes = inputScopes ?? [{ kind: "library" } satisfies MusicScope];
  const scopesByKey = new Map<string, MusicScope>();

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
    return invalidInput("music.discovery.lookup scope all cannot be mixed with any other scope.");
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

function normalizeLookupScope(value: MusicScope): Result<MusicScope> {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return invalidInput("music.discovery.lookup scopes must be typed Music Scope objects.");
  }

  switch (value.kind) {
    case "all":
    case "library":
      return {
        ok: true,
        value: {
          kind: value.kind,
        },
      };
    case "source_library":
    case "relation":
      if (typeof value.id !== "string" || value.id.length === 0) {
        return invalidInput("music.discovery.lookup library scopes must carry a non-empty id.");
      }

      return {
        ok: true,
        value: {
          kind: value.kind,
          id: value.id,
        },
      };
    case "provider":
      if (typeof value.providerId !== "string" || value.providerId.length === 0) {
        return invalidInput("music.discovery.lookup provider scopes must carry a non-empty providerId.");
      }

      return {
        ok: true,
        value: {
          kind: "provider",
          providerId: value.providerId,
        },
      };
    default:
      return invalidInput("music.discovery.lookup scope kind is not supported.");
  }
}

function musicScopeIdentityKey(scope: MusicScope): string {
  switch (scope.kind) {
    case "all":
    case "library":
      return scope.kind;
    case "source_library":
    case "relation":
      return `${scope.kind}:${scope.id}`;
    case "provider":
      return `provider:${scope.providerId}`;
  }
}

function parseMusicDiscoveryLookupInput(
  payload: unknown,
): Result<MusicDiscoveryLookupInput> {
  if (!isRecord(payload)) {
    return invalidInput("music.discovery.lookup input must be an object.");
  }

  if ("cursor" in payload) {
    for (const key of Object.keys(payload)) {
      if (key !== "cursor" && key !== "limit") {
        return invalidInput("music.discovery.lookup cursor-page input accepts only cursor and optional limit.");
      }
    }

    if (typeof payload.cursor !== "string" || payload.cursor.length === 0) {
      return invalidCursor("music.discovery.lookup cursor must be a non-empty opaque string.");
    }

    return {
      ok: true,
      value: {
        cursor: payload.cursor,
        ...(payload.limit === undefined ? {} : { limit: payload.limit as number }),
      },
    };
  }

  for (const key of Object.keys(payload)) {
    if (key !== "lookupText" && key !== "targetKind" && key !== "scopes" && key !== "limit") {
      return invalidInput("music.discovery.lookup first-page input accepts lookupText, targetKind, scopes, and limit.");
    }
  }

  if (typeof payload.lookupText !== "string") {
    return invalidInput("music.discovery.lookup first-page input requires lookupText.");
  }

  if (payload.targetKind !== undefined && !isMusicTargetKind(payload.targetKind)) {
    return invalidInput("music.discovery.lookup targetKind must be recording, album, or artist.");
  }

  if (payload.scopes !== undefined && !Array.isArray(payload.scopes)) {
    return invalidInput("music.discovery.lookup scopes must be an array when present.");
  }

  const value: LookupFirstPageInput = {
    lookupText: payload.lookupText,
  };

  if (payload.targetKind !== undefined) {
    value.targetKind = payload.targetKind;
  }

  if (payload.scopes !== undefined) {
    value.scopes = payload.scopes as NonNullable<LookupFirstPageInput["scopes"]>;
  }

  if (payload.limit !== undefined) {
    value.limit = payload.limit as number;
  }

  return {
    ok: true,
    value,
  };
}

function normalizeLookupLimit(limit: number | undefined): Result<number | undefined> {
  if (limit === undefined) {
    return {
      ok: true,
      value: undefined,
    };
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > LOOKUP_MAX_LIMIT) {
    return invalidInput(`music.discovery.lookup limit must be an integer from 1 through ${LOOKUP_MAX_LIMIT}.`);
  }

  return {
    ok: true,
    value: limit,
  };
}

function isCursorPageInput(input: MusicDiscoveryLookupInput): input is LookupCursorPageInput {
  return "cursor" in input;
}

function isMusicTargetKind(value: unknown): value is MusicTargetKind {
  return value === "recording" || value === "album" || value === "artist";
}

function createLookupCursorCodec(input: {
  key?: Uint8Array;
  ttlMs?: number;
} = {}): LookupCursorCodec {
  const key = normalizeCursorKey(input.key ?? randomBytes(32));
  const ttlMs = input.ttlMs ?? DEFAULT_LOOKUP_CURSOR_TTL_MS;

  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("music.discovery.lookup cursorTtlMs must be a positive safe integer.");
  }

  return {
    encode(encodeInput) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(LOOKUP_CURSOR_AAD);

      const payload: LookupCursorPayload = {
        version: 1,
        ownerScope: encodeInput.ctx.ownerScope,
        expiresAt: expiresAtFromClock({
          now: encodeInput.ctx.clock(),
          ttlMs,
        }),
        internalCursor: encodeInput.internalCursor,
        queryInput: encodeInput.queryInput,
      };
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(payload), "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      return [
        LOOKUP_CURSOR_VERSION,
        iv.toString("base64url"),
        encrypted.toString("base64url"),
        tag.toString("base64url"),
      ].join(".");
    },
    decode(decodeInput) {
      const payload = decryptLookupCursorPayload({
        key,
        cursor: decodeInput.cursor,
      });

      if (!payload.ok) {
        return payload;
      }

      if (payload.value.ownerScope !== decodeInput.ctx.ownerScope) {
        return invalidCursor("music.discovery.lookup cursor does not belong to this owner.");
      }

      const clockNow = decodeInput.ctx.clock();
      assertComparableLookupClock(clockNow);

      if (payload.value.expiresAt <= clockNow) {
        return resultWindowExpired("music.discovery.lookup result window expired.");
      }

      return {
        ok: true,
        value: {
          internalCursor: payload.value.internalCursor,
          queryInput: payload.value.queryInput,
        },
      };
    },
  };
}

function decryptLookupCursorPayload(input: {
  key: Buffer;
  cursor: string;
}): Result<LookupCursorPayload> {
  const parts = input.cursor.split(".");
  if (parts.length !== 4 || parts[0] !== LOOKUP_CURSOR_VERSION) {
    return invalidCursor("music.discovery.lookup cursor is malformed.");
  }

  try {
    const iv = Buffer.from(parts[1]!, "base64url");
    const encrypted = Buffer.from(parts[2]!, "base64url");
    const tag = Buffer.from(parts[3]!, "base64url");

    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) {
      return invalidCursor("music.discovery.lookup cursor is malformed.");
    }

    const decipher = createDecipheriv("aes-256-gcm", input.key, iv);
    decipher.setAAD(LOOKUP_CURSOR_AAD);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(decrypted) as unknown;

    if (!isLookupCursorPayload(parsed)) {
      return invalidCursor("music.discovery.lookup cursor payload is invalid.");
    }

    return {
      ok: true,
      value: parsed,
    };
  } catch {
    return invalidCursor("music.discovery.lookup cursor could not be decrypted.");
  }
}

function isLookupCursorPayload(value: unknown): value is LookupCursorPayload {
  if (!isRecord(value)) {
    return false;
  }

  return value.version === 1 &&
    typeof value.ownerScope === "string" &&
    value.ownerScope.length > 0 &&
    typeof value.expiresAt === "string" &&
    value.expiresAt.length > 0 &&
    typeof value.internalCursor === "string" &&
    value.internalCursor.length > 0 &&
    isLookupCursorQueryInput(value.queryInput);
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

// The cursor expiry comparison relies on lexicographic ordering of fixed-width UTC ISO timestamps
// (YYYY-MM-DDTHH:mm:ss.sssZ). This mirrors the comparable-timestamp invariant enforced by
// src/stage_interface/handle_registry_records.ts and src/music_data_platform/timestamp_validation.ts;
// extracting a shared validator is tracked as follow-up cleanup.
const LOOKUP_COMPARABLE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function assertComparableLookupClock(now: string): void {
  if (!LOOKUP_COMPARABLE_TIMESTAMP_PATTERN.test(now) || Number.isNaN(Date.parse(now))) {
    throw new Error("music.discovery.lookup ctx.clock must return a fixed-width UTC ISO timestamp (YYYY-MM-DDTHH:mm:ss.sssZ).");
  }
}

function normalizeCursorKey(key: Uint8Array): Buffer {
  const buffer = Buffer.from(key);

  if (buffer.length !== 32) {
    throw new Error("music.discovery.lookup cursorKey must be 32 bytes for AES-256-GCM.");
  }

  return buffer;
}

function expiresAtFromClock(input: {
  now: string;
  ttlMs: number;
}): string {
  assertComparableLookupClock(input.now);

  return new Date(Date.parse(input.now) + input.ttlMs).toISOString();
}

function mapRetrievalError(error: unknown, providerScopeLabels: readonly string[]): Result<never> {
  if (isMusicIntelligenceError(error)) {
    switch (error.code) {
      case "music_intelligence.retrieval_cursor_invalid":
        return invalidCursor("music.discovery.lookup cursor is invalid for this result window.");
      case "music_intelligence.retrieval_result_set_expired":
      case "music_intelligence.material_candidate_expired":
        return resultWindowExpired("music.discovery.lookup result window expired.");
      case "music_intelligence.provider_search_failed":
      case "music_intelligence.provider_search_pool_invalid":
      case "music_intelligence.provider_search_result_invalid":
      case "music_intelligence.provider_search_unavailable":
        return providerScopeFailed(failedProviderScopeLabels(error, providerScopeLabels));
      case "music_intelligence.retrieval_query_invalid":
      case "music_intelligence.retrieval_result_invalid":
      case "music_intelligence.cursor_invalid":
      case "music_intelligence.cursor_mismatch":
        return invalidInput("music.discovery.lookup could not run the requested retrieval query.");
    }
  }

  if (providerScopeLabels.length > 0) {
    return providerScopeFailed([]);
  }

  return invalidInput("music.discovery.lookup could not run the requested retrieval query.");
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
