import { createHash } from "node:crypto";

import { parseRefKey, refKey, type Ref, type Result } from "../../contracts/kernel.js";
import {
  libraryCatalogBrowseInputSchema,
  libraryCatalogBrowseOutputSchema,
  libraryCatalogListScopesInputSchema,
  libraryCatalogListScopesOutputSchema,
  libraryCatalogSampleInputSchema,
  libraryCatalogSampleOutputSchema,
  libraryCatalogSummaryInputSchema,
  libraryCatalogSummaryOutputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import {
  libraryMusicScopeDescription,
  relationMusicScopeDescription,
  sourceLibraryMusicScopeDescription,
} from "../../contracts/public_music_description.js";
import type {
  InstrumentDescriptor,
  LibraryCatalogBrowseInput,
  LibraryCatalogBrowseOutput,
  LibraryCatalogBrowseSort,
  LibraryCatalogConcentrationSignal,
  LibraryCatalogItem,
  LibraryCatalogListScopesInput,
  LibraryCatalogListScopesOutput,
  LibraryCatalogMembershipSignal,
  LibraryCatalogSampleInput,
  LibraryCatalogSampleOutput,
  LibraryCatalogScopeInput,
  LibraryCatalogSummaryInput,
  LibraryCatalogSummaryOutput,
  LibraryCatalogSummarySampleBand,
  LibraryCatalogSummaryTimeBand,
  ListedLibraryCatalogScope,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import type {
  LibraryCatalogMaterialKind,
  LibraryCatalogReadPort,
  LibraryCatalogRecord,
  LibraryCatalogScope as InternalLibraryCatalogScope,
} from "../library_catalog_read.js";

export type LibraryCatalogSourceLibraryScopeAvailability = {
  id: string;
  ref: Ref;
  providerName?: string;
  relationName: string;
  targetKind: LibraryCatalogMaterialKind;
  detailText?: string;
};

export type LibraryCatalogRelationScopeAvailability = {
  id: string;
  ref: Ref;
  relationName: string;
  targetKind: LibraryCatalogMaterialKind;
  detailText?: string;
};

export type LibraryCatalogScopeAvailabilitySnapshot = {
  sourceLibraries: readonly LibraryCatalogSourceLibraryScopeAvailability[];
  relations: readonly LibraryCatalogRelationScopeAvailability[];
};

export type LibraryCatalogScopeAvailabilityPort = {
  listCatalogScopes(input: {
    ownerScope: string;
  }): Promise<Result<LibraryCatalogScopeAvailabilitySnapshot>> | Result<LibraryCatalogScopeAvailabilitySnapshot>;
};

export type CreateLibraryCatalogRegistrationInput = {
  catalog: LibraryCatalogReadPort;
  scopeAvailability: LibraryCatalogScopeAvailabilityPort;
};

type ResolvedCatalogScope =
  | { kind: "library"; readScope: InternalLibraryCatalogScope }
  | {
    kind: "source_library";
    readScope: InternalLibraryCatalogScope;
    listed: Exclude<ListedLibraryCatalogScope, { kind: "library" }>;
  }
  | {
    kind: "relation";
    readScope: InternalLibraryCatalogScope;
    listed: Exclude<ListedLibraryCatalogScope, { kind: "library" }>;
  };

type CatalogBrowseCursorPayload = {
  tool: "library.catalog.browse";
  scope: CatalogCursorScope;
  sort: LibraryCatalogBrowseSort;
};

type CatalogCursorScope =
  | { kind: "library" }
  | { kind: "source_library"; refKey: string }
  | { kind: "relation"; refKey: string; materialKind: LibraryCatalogMaterialKind };

const DEFAULT_BROWSE_LIMIT = 25;
const MAX_PUBLIC_ITEMS = 100;
const CONCENTRATION_SIGNAL_LIMIT = 10;
const SIGNAL_EXAMPLE_LIMIT = 5;

export const libraryCatalogInstrument: InstrumentDescriptor = {
  id: "library.catalog",
  label: "Library Catalog",
  ownerArea: "music_data_platform",
};

const readOnlySideEffect = {
  durableUserStateWrite: false,
  runtimeStateWrite: false,
  externalCall: false,
} as const;

const cursorReadSideEffect = {
  durableUserStateWrite: false,
  runtimeStateWrite: true,
  externalCall: false,
} as const;

const readOnlyInvocationPolicy = {
  defaultDecision: "auto",
  dataEgress: "none",
  readOnlyHint: true,
  destructiveHint: false,
} as const;

const listScopeErrors = [
  {
    code: "invalid_input",
    retryable: false,
    suggestedFixTemplate: "Retry with no filter or kind library, source_library, or relation.",
  },
  {
    code: "scope_availability_failed",
    retryable: true,
    suggestedFixTemplate: "Retry library.catalog.list_scopes later.",
  },
] as const;

const scopedReadErrors = [
  {
    code: "invalid_input",
    retryable: false,
    suggestedFixTemplate: "Retry with a catalog scope from library.catalog.list_scopes and public numeric limits within 1..100.",
  },
  {
    code: "unknown_scope",
    retryable: true,
    suggestedFixTemplate: "Call library.catalog.list_scopes and retry with a current catalog scope.",
  },
  {
    code: "scope_availability_failed",
    retryable: true,
    suggestedFixTemplate: "Retry library.catalog.list_scopes later, then retry the catalog call.",
  },
] as const;

export const libraryCatalogListScopesDescriptor: ToolDeclaration = {
  name: "library.catalog.list_scopes",
  instrumentId: libraryCatalogInstrument.id,
  label: "List Library Catalog Scopes",
  ownerArea: "music_data_platform",
  description: "List the catalog-usable MineMusic library scopes for browsing, sampling, or summarizing owner-visible library items.",
  usage: {
    useWhen: "Use before library.catalog.browse, library.catalog.sample, or library.catalog.summary when the agent needs the exact catalog scope to inspect.",
    doNotUseWhen: "Do not use for provider search scopes, the aggregate all scope, importable provider libraries, lookup text search, or owner relation edits.",
    outputSemantics: "Returns only catalog scopes: library, source_library, and relation. Scope ids are opaque pass-back values; descriptions explain saved/favorite/source-library meaning.",
  },
  examples: [
    {
      prompt: "what parts of my library can you summarize?",
      expects: "call",
    },
    {
      prompt: "search NetEase for this song",
      expects: "avoid",
      note: "provider search scopes are not catalog scopes",
    },
  ],
  sideEffect: readOnlySideEffect,
  invocationPolicy: readOnlyInvocationPolicy,
  inputSchema: libraryCatalogListScopesInputSchema,
  outputSchema: libraryCatalogListScopesOutputSchema,
  errors: listScopeErrors,
  resultSummary(result) {
    const output = result as LibraryCatalogListScopesOutput;
    return `${output.scopes.length} catalog scope(s) returned.`;
  },
};

export const libraryCatalogBrowseDescriptor: ToolDeclaration = {
  name: "library.catalog.browse",
  instrumentId: libraryCatalogInstrument.id,
  label: "Browse Library Catalog",
  ownerArea: "music_data_platform",
  description: "Browse owner-visible MineMusic library items from a catalog scope without lookup text or provider calls.",
  usage: {
    useWhen: "Use when the agent needs to page through a library, source-library, or relation catalog scope.",
    doNotUseWhen: "Do not use for text lookup, provider search, import, relation edits, playback, or recommendations.",
    outputSemantics: "Returns library item handles with compact descriptions and an opaque nextCursor when more catalog items are available; it does not echo scopes or expose catalog rows.",
  },
  examples: [
    {
      prompt: "show me my favorite albums",
      expects: "call",
    },
    {
      prompt: "find songs like this",
      expects: "avoid",
      note: "semantic discovery is not catalog browsing",
    },
  ],
  sideEffect: cursorReadSideEffect,
  invocationPolicy: readOnlyInvocationPolicy,
  inputSchema: libraryCatalogBrowseInputSchema,
  outputSchema: libraryCatalogBrowseOutputSchema,
  errors: [
    ...scopedReadErrors,
    {
      code: "invalid_cursor",
      retryable: true,
      suggestedFixTemplate: "Start a fresh library.catalog.browse call.",
    },
  ],
  resultSummary(result) {
    const output = result as LibraryCatalogBrowseOutput;
    return `${output.items.length} catalog item(s) returned; ${output.nextCursor === undefined ? "end of results" : "more available"}.`;
  },
};

export const libraryCatalogSampleDescriptor: ToolDeclaration = {
  name: "library.catalog.sample",
  instrumentId: libraryCatalogInstrument.id,
  label: "Sample Library Catalog",
  ownerArea: "music_data_platform",
  description: "Return a deterministic seeded sample from one owner-visible MineMusic catalog scope.",
  usage: {
    useWhen: "Use when the agent needs a repeatable sample of library items from a known catalog scope.",
    doNotUseWhen: "Do not use for summary time-band evidence, provider search, relation edits, import, or final recommendation judgement.",
    outputSemantics: "Returns only sampled library item handles with descriptions. The caller-provided seed controls deterministic selection; the tool does not invent time-based seeds.",
  },
  examples: [
    {
      prompt: "sample 30 items from my library with this seed",
      expects: "call",
    },
    {
      prompt: "summarize my taste",
      expects: "avoid",
      note: "use library.catalog.summary for summary evidence and signals",
    },
  ],
  sideEffect: readOnlySideEffect,
  invocationPolicy: readOnlyInvocationPolicy,
  inputSchema: libraryCatalogSampleInputSchema,
  outputSchema: libraryCatalogSampleOutputSchema,
  errors: scopedReadErrors,
  resultSummary(result) {
    const output = result as LibraryCatalogSampleOutput;
    return `${output.items.length} sampled catalog item(s) returned.`;
  },
};

export const libraryCatalogSummaryDescriptor: ToolDeclaration = {
  name: "library.catalog.summary",
  instrumentId: libraryCatalogInstrument.id,
  label: "Summarize Library Catalog",
  ownerArea: "music_data_platform",
  description: "Summarize one owner-visible MineMusic catalog scope with timeline-spread evidence samples and catalog concentration signals.",
  usage: {
    useWhen: "Use when the agent needs compact evidence about the music taste or tendency represented by a library, source-library, or relation catalog scope.",
    doNotUseWhen: "Do not use for provider search, genre/style/mood inference, Memory preference claims, relation edits, import, or final recommendation judgement.",
    outputSemantics: "Returns catalog evidence samples and kind-separated count signals computed from available catalog/projection facts. Library baseline summaries also include membership signals for selectable source-library/relation scopes.",
  },
  examples: [
    {
      prompt: "summarize my library so you understand what I like",
      expects: "call",
    },
    {
      prompt: "recommend a song now",
      expects: "avoid",
      note: "summary is evidence, not final recommendation judgement",
    },
  ],
  sideEffect: readOnlySideEffect,
  invocationPolicy: readOnlyInvocationPolicy,
  inputSchema: libraryCatalogSummaryInputSchema,
  outputSchema: libraryCatalogSummaryOutputSchema,
  errors: scopedReadErrors,
  resultSummary(result) {
    const output = result as LibraryCatalogSummaryOutput;
    const sampleCount = output.samples.reduce((sum, band) => sum + band.items.length, 0);
    return `${sampleCount} evidence sample item(s) and catalog concentration signals returned.`;
  },
};

export function createLibraryCatalogListScopesRegistration(
  input: CreateLibraryCatalogRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryCatalogListScopesDescriptor,
    handler: (ctx, payload) => handleListScopes(ctx, payload, input.scopeAvailability),
  };
}

export function createLibraryCatalogBrowseRegistration(
  input: CreateLibraryCatalogRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryCatalogBrowseDescriptor,
    handler: (ctx, payload) => handleBrowse(ctx, payload, input),
  };
}

export function createLibraryCatalogSampleRegistration(
  input: CreateLibraryCatalogRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryCatalogSampleDescriptor,
    handler: (ctx, payload) => handleSample(ctx, payload, input),
  };
}

export function createLibraryCatalogSummaryRegistration(
  input: CreateLibraryCatalogRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryCatalogSummaryDescriptor,
    handler: (ctx, payload) => handleSummary(ctx, payload, input),
  };
}

async function handleListScopes(
  ctx: StageToolContext,
  payload: unknown,
  scopeAvailability: LibraryCatalogScopeAvailabilityPort,
): Promise<Result<LibraryCatalogListScopesOutput>> {
  const input = payload as LibraryCatalogListScopesInput;
  const available = await scopeAvailability.listCatalogScopes({
    ownerScope: ctx.ownerScope,
  });

  if (!available.ok) {
    return scopeAvailabilityFailed();
  }

  return {
    ok: true,
    value: {
      scopes: listedCatalogScopes(available.value, input.kind),
    },
  };
}

async function handleBrowse(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCatalogRegistrationInput,
): Promise<Result<LibraryCatalogBrowseOutput>> {
  const input = payload as LibraryCatalogBrowseInput;
  const limit = input.limit ?? DEFAULT_BROWSE_LIMIT;

  if (input.cursor !== undefined) {
    if (input.scope !== undefined || input.sort !== undefined) {
      return invalidInput("library.catalog.browse cursor pages accept only cursor and optional limit.");
    }
    return handleBrowseCursorPage(ctx, input.cursor, limit, ports.catalog);
  }

  const resolved = await resolveCatalogScope(ctx, input.scope, ports.scopeAvailability);
  if (!resolved.ok) {
    return resolved;
  }

  const sort = input.sort ?? "time";
  const records = sortCatalogRecords(
    await ports.catalog.listCatalogItems({
      ownerScope: ctx.ownerScope,
      scope: resolved.value.readScope,
    }),
    sort,
  );

  return browsePage(ctx, {
    records,
    sort,
    scope: resolved.value.readScope,
    offset: 0,
    limit,
  });
}

async function handleBrowseCursorPage(
  ctx: StageToolContext,
  cursor: string,
  limit: number,
  catalog: LibraryCatalogReadPort,
): Promise<Result<LibraryCatalogBrowseOutput>> {
  const resolved = await ctx.lookupCursors.resolve({
    ownerScope: ctx.ownerScope,
    cursorId: cursor,
  });

  if (!resolved.ok) {
    return invalidCursor("library.catalog.browse cursor is unknown or expired.");
  }

  const cursorPayload = catalogBrowseCursorPayload(resolved.value.queryInput);
  const offset = Number.parseInt(resolved.value.internalCursor, 10);
  if (cursorPayload === undefined || !Number.isSafeInteger(offset) || offset < 0) {
    return invalidCursor("library.catalog.browse cursor payload is invalid.");
  }

  const records = sortCatalogRecords(
    await catalog.listCatalogItems({
      ownerScope: ctx.ownerScope,
      scope: readScopeFromCursor(cursorPayload.scope),
    }),
    cursorPayload.sort,
  );

  return browsePage(ctx, {
    records,
    sort: cursorPayload.sort,
    scope: readScopeFromCursor(cursorPayload.scope),
    offset,
    limit,
  });
}

async function browsePage(
  ctx: StageToolContext,
  input: {
    records: readonly LibraryCatalogRecord[];
    sort: LibraryCatalogBrowseSort;
    scope: InternalLibraryCatalogScope;
    offset: number;
    limit: number;
  },
): Promise<Result<LibraryCatalogBrowseOutput>> {
  const page = input.records.slice(input.offset, input.offset + input.limit);
  const nextOffset = input.offset + page.length;
  const nextCursor = nextOffset >= input.records.length
    ? undefined
    : await ctx.lookupCursors.register({
      ownerScope: ctx.ownerScope,
      internalCursor: String(nextOffset),
      queryInput: {
        tool: "library.catalog.browse",
        scope: cursorScopeFromReadScope(input.scope),
        sort: input.sort,
      } satisfies CatalogBrowseCursorPayload,
    });

  return {
    ok: true,
    value: {
      items: await itemsForRecords(ctx, page),
      ...(nextCursor === undefined ? {} : { nextCursor }),
    },
  };
}

async function handleSample(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCatalogRegistrationInput,
): Promise<Result<LibraryCatalogSampleOutput>> {
  const input = payload as LibraryCatalogSampleInput;
  const resolved = await resolveCatalogScope(ctx, input.scope, ports.scopeAvailability);
  if (!resolved.ok) {
    return resolved;
  }

  const records = await ports.catalog.listCatalogItems({
    ownerScope: ctx.ownerScope,
    scope: resolved.value.readScope,
  });
  const sampled = seededSample(records, input.seed, input.count);

  return {
    ok: true,
    value: {
      items: await itemsForRecords(ctx, sampled),
    },
  };
}

async function handleSummary(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCatalogRegistrationInput,
): Promise<Result<LibraryCatalogSummaryOutput>> {
  const input = payload as LibraryCatalogSummaryInput;
  const resolved = await resolveCatalogScope(ctx, input.scope, ports.scopeAvailability);
  if (!resolved.ok) {
    return resolved;
  }

  const records = await ports.catalog.listCatalogItems({
    ownerScope: ctx.ownerScope,
    scope: resolved.value.readScope,
  });

  const samples = await summarySamples(ctx, records, input.sampleCount);
  const membershipSignals = resolved.value.kind === "library"
    ? await libraryMembershipSignals(ctx, ports, records)
    : undefined;

  return {
    ok: true,
    value: {
      samples,
      ...(membershipSignals === undefined ? {} : { membershipSignals }),
      concentrationSignals: await concentrationSignals(ctx, records),
    },
  };
}

async function resolveCatalogScope(
  ctx: StageToolContext,
  scopeInput: LibraryCatalogScopeInput | undefined,
  scopeAvailability: LibraryCatalogScopeAvailabilityPort,
): Promise<Result<ResolvedCatalogScope>> {
  const normalized = normalizeScopeInput(scopeInput);
  if (!normalized.ok) {
    return normalized;
  }

  if (normalized.value.kind === "library") {
    return {
      ok: true,
      value: {
        kind: "library",
        readScope: { kind: "library" },
      },
    };
  }

  const available = await scopeAvailability.listCatalogScopes({
    ownerScope: ctx.ownerScope,
  });
  if (!available.ok) {
    return scopeAvailabilityFailed();
  }

  if (normalized.value.kind === "source_library") {
    const found = available.value.sourceLibraries.find((scope) => scope.id === normalized.value.id);
    if (found === undefined) {
      return unknownScope(normalized.value.id);
    }

    return {
      ok: true,
      value: {
        kind: "source_library",
        readScope: {
          kind: "source_library",
          ref: copyRef(found.ref),
        },
        listed: listedSourceLibraryScope(found),
      },
    };
  }

  const found = available.value.relations.find((scope) => scope.id === normalized.value.id);
  if (found === undefined) {
    return unknownScope(normalized.value.id);
  }

  return {
    ok: true,
    value: {
      kind: "relation",
      readScope: {
        kind: "relation",
        ref: copyRef(found.ref),
        materialKind: found.targetKind,
      },
      listed: listedRelationScope(found),
    },
  };
}

function normalizeScopeInput(
  scope: LibraryCatalogScopeInput | undefined,
): Result<{ kind: "library" } | { kind: "source_library"; id: string } | { kind: "relation"; id: string }> {
  if (scope === undefined || scope.kind === "library") {
    return {
      ok: true,
      value: { kind: "library" },
    };
  }

  if (scope.kind === "source_library" || scope.kind === "relation") {
    return {
      ok: true,
      value: {
        kind: scope.kind,
        id: scope.id,
      },
    };
  }

  return invalidInput("library.catalog scope must be library, source_library, or relation.");
}

function listedCatalogScopes(
  snapshot: LibraryCatalogScopeAvailabilitySnapshot,
  kind: LibraryCatalogListScopesInput["kind"],
): readonly ListedLibraryCatalogScope[] {
  const scopes: ListedLibraryCatalogScope[] = [];

  if (kind === undefined || kind === "library") {
    scopes.push({
      kind: "library",
      description: libraryMusicScopeDescription(),
    });
  }

  if (kind === undefined || kind === "source_library") {
    scopes.push(...snapshot.sourceLibraries.map(listedSourceLibraryScope));
  }

  if (kind === undefined || kind === "relation") {
    scopes.push(...snapshot.relations.map(listedRelationScope));
  }

  return scopes;
}

function listedSourceLibraryScope(
  scope: LibraryCatalogSourceLibraryScopeAvailability,
): ListedLibraryCatalogScope {
  return {
    kind: "source_library",
    id: scope.id,
    description: sourceLibraryMusicScopeDescription({
      ...(scope.providerName === undefined ? {} : { providerName: scope.providerName }),
      relationName: scope.relationName,
      targetKind: scope.targetKind,
      ...(scope.detailText === undefined ? {} : { detailText: scope.detailText }),
    }),
  };
}

function listedRelationScope(
  scope: LibraryCatalogRelationScopeAvailability,
): ListedLibraryCatalogScope {
  return {
    kind: "relation",
    id: scope.id,
    description: relationMusicScopeDescription({
      relationName: scope.relationName,
      targetKind: scope.targetKind,
      ...(scope.detailText === undefined ? {} : { detailText: scope.detailText }),
    }),
  };
}

function sortCatalogRecords(
  records: readonly LibraryCatalogRecord[],
  sort: LibraryCatalogBrowseSort,
): readonly LibraryCatalogRecord[] {
  return [...records].sort((left, right) => {
    const primary = sort === "time"
      ? compareDescending(left.recentlyAddedAt, right.recentlyAddedAt)
      : compareText(left.descriptionLabel, right.descriptionLabel);

    return primary === 0 ? compareText(left.materialRefKey, right.materialRefKey) : primary;
  });
}

function seededSample(
  records: readonly LibraryCatalogRecord[],
  seed: string,
  count: number,
): readonly LibraryCatalogRecord[] {
  return [...records]
    .sort((left, right) => {
      const primary = compareText(
        sampleKey(seed, left.materialRefKey),
        sampleKey(seed, right.materialRefKey),
      );

      return primary === 0 ? compareText(left.materialRefKey, right.materialRefKey) : primary;
    })
    .slice(0, count);
}

function sampleKey(seed: string, materialRefKey: string): string {
  return createHash("sha256").update(`${seed}\u0000${materialRefKey}`).digest("hex");
}

async function summarySamples(
  ctx: StageToolContext,
  records: readonly LibraryCatalogRecord[],
  sampleCount: number,
): Promise<readonly LibraryCatalogSummarySampleBand[]> {
  const sorted = [...records].sort((left, right) => {
    const primary = compareText(left.recentlyAddedAt, right.recentlyAddedAt);

    return primary === 0 ? compareText(left.materialRefKey, right.materialRefKey) : primary;
  });
  const bands = splitIntoTimeBands(sorted);
  const quotas = evenQuotas(sampleCount, bands.length);
  const bandNames: readonly LibraryCatalogSummaryTimeBand[] = [
    "earliest_25",
    "25_50",
    "50_75",
    "latest_25",
  ];
  const output: LibraryCatalogSummarySampleBand[] = [];

  for (let index = 0; index < bands.length; index += 1) {
    output.push({
      band: bandNames[index]!,
      items: await itemsForRecords(ctx, selectDistinctArtistFirst(bands[index]!, quotas[index]!)),
    });
  }

  return output;
}

function splitIntoTimeBands(
  sorted: readonly LibraryCatalogRecord[],
): readonly (readonly LibraryCatalogRecord[])[] {
  const bands: LibraryCatalogRecord[][] = [[], [], [], []];

  sorted.forEach((record, index) => {
    const band = sorted.length === 0 ? 0 : Math.min(3, Math.floor((index * 4) / sorted.length));
    bands[band]!.push(record);
  });

  return bands;
}

function evenQuotas(total: number, bucketCount: number): readonly number[] {
  const base = Math.floor(total / bucketCount);
  const remainder = total % bucketCount;

  return Array.from({ length: bucketCount }, (_unused, index) => base + (index < remainder ? 1 : 0));
}

function selectDistinctArtistFirst(
  records: readonly LibraryCatalogRecord[],
  count: number,
): readonly LibraryCatalogRecord[] {
  if (count <= 0 || records.length === 0) {
    return [];
  }

  const selected: LibraryCatalogRecord[] = [];
  const usedArtists = new Set<string>();

  for (const record of records) {
    const artist = primaryArtistKey(record);
    if (artist === undefined || usedArtists.has(artist)) {
      continue;
    }

    selected.push(record);
    usedArtists.add(artist);

    if (selected.length >= count) {
      return selected;
    }
  }

  for (const record of records) {
    if (selected.some((selectedRecord) => selectedRecord.materialRefKey === record.materialRefKey)) {
      continue;
    }

    selected.push(record);

    if (selected.length >= count) {
      return selected;
    }
  }

  return selected;
}

async function libraryMembershipSignals(
  ctx: StageToolContext,
  ports: CreateLibraryCatalogRegistrationInput,
  libraryRecords: readonly LibraryCatalogRecord[],
): Promise<readonly LibraryCatalogMembershipSignal[]> {
  const available = await ports.scopeAvailability.listCatalogScopes({
    ownerScope: ctx.ownerScope,
  });
  if (!available.ok) {
    throw new Error("library catalog summary could not read membership scopes after library scope resolved.");
  }

  const sourceSignals = await Promise.all(
    available.value.sourceLibraries.map(async (scope) =>
      membershipSignal(ctx, ports.catalog, listedSourceLibraryScope(scope), {
        kind: "source_library",
        ref: scope.ref,
      }, libraryRecords)
    ),
  );
  const relationSignals = await Promise.all(
    available.value.relations.map(async (scope) =>
      membershipSignal(ctx, ports.catalog, listedRelationScope(scope), {
        kind: "relation",
        ref: scope.ref,
        materialKind: scope.targetKind,
      }, libraryRecords)
    ),
  );

  return [...sourceSignals, ...relationSignals]
    .filter((signal) => signal.count > 0)
    .sort((left, right) => {
      const primary = compareDescendingNumber(left.count, right.count);

      return primary === 0
        ? compareText(left.scope.description.label, right.scope.description.label)
        : primary;
    });
}

async function membershipSignal(
  ctx: StageToolContext,
  catalog: LibraryCatalogReadPort,
  scope: Exclude<ListedLibraryCatalogScope, { kind: "library" }>,
  readScope: InternalLibraryCatalogScope,
  libraryRecords: readonly LibraryCatalogRecord[],
): Promise<LibraryCatalogMembershipSignal> {
  const materialKeys = new Set(libraryRecords.map((record) => record.materialRefKey));
  const records = (await catalog.listCatalogItems({
    ownerScope: ctx.ownerScope,
    scope: readScope,
  })).filter((record) => materialKeys.has(record.materialRefKey));

  return {
    scope,
    count: records.length,
    examples: await itemsForRecords(ctx, sortCatalogRecords(records, "time").slice(0, SIGNAL_EXAMPLE_LIMIT)),
  };
}

async function concentrationSignals(
  ctx: StageToolContext,
  records: readonly LibraryCatalogRecord[],
): Promise<LibraryCatalogSummaryOutput["concentrationSignals"]> {
  return {
    recordingArtists: await concentrationSignalList(ctx, records, {
      materialKind: "recording",
      values: (record) => textLines(record.artistText),
    }),
    recordingAlbums: await concentrationSignalList(ctx, records, {
      materialKind: "recording",
      values: (record) => textLines(record.albumText),
    }),
    albumArtists: await concentrationSignalList(ctx, records, {
      materialKind: "album",
      values: (record) => textLines(record.artistText),
    }),
    artistItems: await concentrationSignalList(ctx, records, {
      materialKind: "artist",
      values: (record) => [record.descriptionLabel],
    }),
  };
}

async function concentrationSignalList(
  ctx: StageToolContext,
  records: readonly LibraryCatalogRecord[],
  input: {
    materialKind: LibraryCatalogMaterialKind;
    values: (record: LibraryCatalogRecord) => readonly string[];
  },
): Promise<readonly LibraryCatalogConcentrationSignal[]> {
  const groups = new Map<string, LibraryCatalogRecord[]>();

  for (const record of records) {
    if (record.materialKind !== input.materialKind) {
      continue;
    }

    const seenValuesForRecord = new Set<string>();
    for (const value of input.values(record)) {
      const cleaned = value.trim();
      if (cleaned.length === 0 || seenValuesForRecord.has(cleaned)) {
        continue;
      }

      seenValuesForRecord.add(cleaned);
      groups.set(cleaned, [...groups.get(cleaned) ?? [], record]);
    }
  }

  const signals = await Promise.all(
    [...groups.entries()]
      .map(([label, groupRecords]) => ({
        label,
        records: groupRecords,
      }))
      .sort((left, right) => {
        const primary = compareDescendingNumber(left.records.length, right.records.length);

        return primary === 0 ? compareText(left.label, right.label) : primary;
      })
      .slice(0, CONCENTRATION_SIGNAL_LIMIT)
      .map(async (group): Promise<LibraryCatalogConcentrationSignal> => ({
        description: { label: group.label },
        count: group.records.length,
        examples: await itemsForRecords(
          ctx,
          sortCatalogRecords(group.records, "time").slice(0, SIGNAL_EXAMPLE_LIMIT),
        ),
      })),
  );

  return signals;
}

async function itemsForRecords(
  ctx: StageToolContext,
  records: readonly LibraryCatalogRecord[],
): Promise<readonly LibraryCatalogItem[]> {
  return Promise.all(records.map((record) => itemForRecord(ctx, record)));
}

async function itemForRecord(
  ctx: StageToolContext,
  record: LibraryCatalogRecord,
): Promise<LibraryCatalogItem> {
  return {
    item: {
      kind: "library",
      id: await ctx.handleMinting.mint({
        ownerScope: ctx.ownerScope,
        handleKind: "library",
        internalAnchor: {
          materialRef: record.materialRefKey,
        },
      }),
    },
    description: {
      label: record.descriptionLabel,
    },
  };
}

function cursorScopeFromReadScope(scope: InternalLibraryCatalogScope): CatalogCursorScope {
  switch (scope.kind) {
    case "library":
      return { kind: "library" };
    case "source_library":
      return {
        kind: "source_library",
        refKey: refKey(scope.ref),
      };
    case "relation":
      return {
        kind: "relation",
        refKey: refKey(scope.ref),
        materialKind: scope.materialKind,
      };
  }
}

function readScopeFromCursor(scope: CatalogCursorScope): InternalLibraryCatalogScope {
  switch (scope.kind) {
    case "library":
      return { kind: "library" };
    case "source_library":
      return {
        kind: "source_library",
        ref: refFromCursorKey(scope.refKey),
      };
    case "relation":
      return {
        kind: "relation",
        ref: refFromCursorKey(scope.refKey),
        materialKind: scope.materialKind,
      };
  }
}

function refFromCursorKey(refKeyValue: string): Ref {
  const ref = parseRefKey(refKeyValue);
  if (ref === undefined) {
    throw new Error("library.catalog.browse cursor stored invalid ref key.");
  }

  return ref;
}

function catalogBrowseCursorPayload(value: unknown): CatalogBrowseCursorPayload | undefined {
  if (!isRecord(value) || value.tool !== "library.catalog.browse" || !isRecord(value.scope)) {
    return undefined;
  }
  if (value.sort !== "time" && value.sort !== "dictionary") {
    return undefined;
  }

  const scope = value.scope;
  if (scope.kind === "library") {
    return {
      tool: "library.catalog.browse",
      scope: { kind: "library" },
      sort: value.sort,
    };
  }

  if (
    scope.kind === "source_library" &&
    typeof scope.refKey === "string"
  ) {
    return {
      tool: "library.catalog.browse",
      scope: {
        kind: "source_library",
        refKey: scope.refKey,
      },
      sort: value.sort,
    };
  }

  if (
    scope.kind === "relation" &&
    typeof scope.refKey === "string" &&
    isLibraryCatalogMaterialKind(scope.materialKind)
  ) {
    return {
      tool: "library.catalog.browse",
      scope: {
        kind: "relation",
        refKey: scope.refKey,
        materialKind: scope.materialKind,
      },
      sort: value.sort,
    };
  }

  return undefined;
}

function isLibraryCatalogMaterialKind(value: unknown): value is LibraryCatalogMaterialKind {
  return value === "recording" || value === "album" || value === "artist";
}

function primaryArtistKey(record: LibraryCatalogRecord): string | undefined {
  return textLines(record.artistText)[0];
}

function textLines(value: string): readonly string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareDescending(left: string, right: string): number {
  return compareText(right, left);
}

function compareDescendingNumber(left: number, right: number): number {
  return right - left;
}

function copyRef(ref: Ref): Ref {
  return { ...ref };
}

function invalidInput(message: string): Result<never> {
  return fail({
    code: "invalid_input",
    message,
    retryable: false,
    suggestedFix: "Retry with a catalog scope from library.catalog.list_scopes and public numeric limits within 1..100.",
  });
}

function unknownScope(scopeId: string): Result<never> {
  return fail({
    code: "unknown_scope",
    message: `Library catalog scope '${scopeId}' is not currently available.`,
    retryable: true,
    suggestedFix: "Call library.catalog.list_scopes and retry with a current catalog scope.",
  });
}

function invalidCursor(message: string): Result<never> {
  return fail({
    code: "invalid_cursor",
    message,
    retryable: true,
    suggestedFix: "Start a fresh library.catalog.browse call.",
  });
}

function scopeAvailabilityFailed(): Result<never> {
  return fail({
    code: "scope_availability_failed",
    message: "Library catalog scope availability could not be read.",
    retryable: true,
    suggestedFix: "Retry library.catalog.list_scopes later.",
  });
}

function fail(input: {
  code: string;
  message: string;
  retryable: boolean;
  suggestedFix: string;
}): Result<never> {
  return {
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      area: "music_data_platform",
      retryable: input.retryable,
      suggestedFix: input.suggestedFix,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
