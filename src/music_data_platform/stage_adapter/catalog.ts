import { createHash } from "node:crypto";

import type { Ref, Result, StageError } from "../../contracts/kernel.js";
import { parseRefKey, refKey } from "../../contracts/kernel.js";
import {
  collectionMusicScopeDescription,
  libraryMusicScopeDescription,
  musicLookupItemLabel,
  relationMusicScopeDescription,
  sourceLibraryMusicScopeDescription,
} from "../../contracts/public_music_description.js";
import type { MusicMaterial } from "../../contracts/music_data_platform.js";
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
  MusicTargetKind,
  PublicHandleDescription,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import { formatMusicItemHandle, formatMusicScopeHandle, parseMusicScopeHandle } from "../../contracts/stage_interface.js";
import type {
  LibraryCatalogMaterialKind,
  LibraryCatalogReadPort,
  LibraryCatalogRecord,
  LibraryCatalogReadScope,
} from "../library_catalog_read.js";
import type { MaterialProjection } from "../material_projection.js";

export type LibraryCatalogSourceLibraryScopeAvailability = {
  id: string;
  ref: Ref;
  providerName?: string;
  relationName: string;
  targetKind: MusicTargetKind;
  detailText?: string;
};

export type LibraryCatalogRelationScopeAvailability = {
  id: string;
  ref: Ref;
  relationName: string;
  targetKind: MusicTargetKind;
  detailText?: string;
};

export type LibraryCatalogCollectionScopeAvailability = {
  id: string;
  ref: Ref;
  collectionName: string;
  targetKind?: MusicTargetKind;
  detailText?: string;
};

export type LibraryCatalogScopeAvailabilitySnapshot = {
  sourceLibraries: readonly LibraryCatalogSourceLibraryScopeAvailability[];
  relations: readonly LibraryCatalogRelationScopeAvailability[];
  collections: readonly LibraryCatalogCollectionScopeAvailability[];
};

export type LibraryCatalogScopeAvailabilityPort = {
  listCatalogScopes(input: {
    ownerScope: string;
  }): Promise<Result<LibraryCatalogScopeAvailabilitySnapshot>> | Result<LibraryCatalogScopeAvailabilitySnapshot>;
};

export type CreateLibraryCatalogRegistrationInput = {
  catalog: LibraryCatalogReadPort;
  materialProjection: MaterialProjection;
  scopeAvailability: LibraryCatalogScopeAvailabilityPort;
};

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

const readOnlyInvocationPolicy = {
  defaultDecision: "auto",
  dataEgress: "none",
  readOnlyHint: true,
  destructiveHint: false,
} as const;

const commonScopeErrors = [
  {
    code: "invalid_input",
    retryable: false,
    suggestedFixTemplate: "Retry with a catalog scope returned by library.catalog.list_scopes.",
  },
  {
    code: "scope_availability_failed",
    retryable: true,
    suggestedFixTemplate: "Retry library.catalog.list_scopes later to inspect available catalog scopes.",
  },
  {
    code: "scope_not_found",
    retryable: true,
    suggestedFixTemplate: "Call library.catalog.list_scopes again and pass back one returned scope id unchanged.",
  },
] as const;

export const libraryCatalogListScopesDescriptor: ToolDeclaration = {
  name: "library.catalog.list_scopes",
  instrumentId: libraryCatalogInstrument.id,
  label: "List Library Catalog Scopes",
  ownerArea: "music_data_platform",
  description: "List catalog-usable library scopes for browsing, sampling, and summary.",
  usage: {
    useWhen: "Use before library catalog browse, sample, or summary when the agent needs the MineMusic library baseline, imported source-library scopes, or owner-relation scopes.",
    doNotUseWhen: "Do not use for provider search scopes, the aggregate all shortcut, provider raw ids, or internal catalog rows.",
    outputSemantics: "Returns pass-back catalog scope handles and descriptions; ids are opaque and descriptions explain whether a scope is imported source-library membership or a MineMusic relation.",
  },
  examples: [
    {
      prompt: "what library catalog scopes can I inspect?",
      expects: "call",
    },
    {
      prompt: "search NetEase for songs",
      expects: "avoid",
      note: "provider search scopes belong to music.discovery.list_scopes",
    },
  ],
  sideEffect: readOnlySideEffect,
  invocationPolicy: readOnlyInvocationPolicy,
  inputSchema: libraryCatalogListScopesInputSchema,
  outputSchema: libraryCatalogListScopesOutputSchema,
  errors: [
    {
      code: "invalid_input",
      retryable: false,
      suggestedFixTemplate: "Call library.catalog.list_scopes with an optional kind of library, source_library, or relation.",
    },
    {
      code: "scope_availability_failed",
      retryable: true,
      suggestedFixTemplate: "Retry library.catalog.list_scopes later to inspect available catalog scopes.",
    },
  ],
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
  description: "Browse compact items from a MineMusic catalog scope.",
  usage: {
    useWhen: "Use when the agent needs ordered concrete examples from the MineMusic library baseline, a source-library scope, or a relation scope.",
    doNotUseWhen: "Do not use for provider search, semantic recommendation, raw rows, or editing saved/favorite state.",
    outputSemantics: "Returns compact [material:...] item handles and public descriptions plus an opaque cursor; no internal refs, entry rows, provider payloads, or relation facts are exposed.",
  },
  examples: [
    {
      prompt: "show me my favorite recordings",
      expects: "call",
    },
    {
      prompt: "why do I like these?",
      expects: "avoid",
      note: "use library.catalog.summary for catalog evidence instead of browsing pages",
    },
  ],
  sideEffect: readOnlySideEffect,
  invocationPolicy: readOnlyInvocationPolicy,
  inputSchema: libraryCatalogBrowseInputSchema,
  outputSchema: libraryCatalogBrowseOutputSchema,
  errors: [
    ...commonScopeErrors,
    {
      code: "invalid_cursor",
      retryable: true,
      suggestedFixTemplate: "Start a fresh first-page library.catalog.browse call.",
    },
    {
      code: "result_window_expired",
      retryable: true,
      suggestedFixTemplate: "Start a fresh first-page library.catalog.browse call.",
    },
  ],
  resultSummary(result) {
    const output = result as LibraryCatalogBrowseOutput;
    return `${output.items.length} catalog item(s) returned${output.nextCursor === undefined ? "." : " with more available."}`;
  },
};

export const libraryCatalogSampleDescriptor: ToolDeclaration = {
  name: "library.catalog.sample",
  instrumentId: libraryCatalogInstrument.id,
  label: "Sample Library Catalog",
  ownerArea: "music_data_platform",
  description: "Return a deterministic seed-based sample from a MineMusic catalog scope.",
  usage: {
    useWhen: "Use when the agent needs a reproducible random-looking sample from one catalog scope and can provide an explicit seed.",
    doNotUseWhen: "Do not use for summary timeline evidence, provider search, or sampling without a caller-provided seed.",
    outputSemantics: "Same owner library state, scope, count, and seed return the same [material:...] item handles and descriptions.",
  },
  examples: [
    {
      prompt: "sample 40 items from my library with seed taste-audit-1",
      expects: "call",
    },
    {
      prompt: "summarize my taste",
      expects: "avoid",
      note: "summary owns timeline evidence sampling",
    },
  ],
  sideEffect: readOnlySideEffect,
  invocationPolicy: readOnlyInvocationPolicy,
  inputSchema: libraryCatalogSampleInputSchema,
  outputSchema: libraryCatalogSampleOutputSchema,
  errors: commonScopeErrors,
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
  description: "Summarize a MineMusic catalog scope with time-band evidence, membership signals, and kind-separated concentration signals.",
  usage: {
    useWhen: "Use when the agent needs compact evidence about the user's catalog contents or music taste before answering or planning recommendations.",
    doNotUseWhen: "Do not use for provider search, genre/style inference, memory facts, raw inventory dumps, or editing relation state.",
    outputSemantics: "Returns public evidence only: four time-band samples, kind-separated concentration signals with counts/examples, and library-baseline membership signals that distinguish source-library membership from MineMusic relations.",
  },
  examples: [
    {
      prompt: "summarize my music library taste with 80 evidence items",
      expects: "call",
    },
    {
      prompt: "favorite this song",
      expects: "avoid",
      note: "library.relation.favorite owns relation edits",
    },
  ],
  sideEffect: readOnlySideEffect,
  invocationPolicy: readOnlyInvocationPolicy,
  inputSchema: libraryCatalogSummaryInputSchema,
  outputSchema: libraryCatalogSummaryOutputSchema,
  errors: commonScopeErrors,
  resultSummary(result) {
    const output = result as LibraryCatalogSummaryOutput;
    const sampleCount = output.sampleBands.reduce((count, band) => count + band.items.length, 0);
    const membershipSuffix = output.membershipSignals === undefined
      ? ""
      : ` and ${output.membershipSignals.length} membership signal(s)`;
    return `${sampleCount} summary sample item(s), ${output.concentrationSignals.length} concentration signal(s)${membershipSuffix}.`;
  },
};

export function createLibraryCatalogListScopesRegistration(
  input: CreateLibraryCatalogRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryCatalogListScopesDescriptor,
    handler: (ctx, payload) => handleLibraryCatalogListScopes(ctx, payload, input.scopeAvailability),
  };
}

export function createLibraryCatalogBrowseRegistration(
  input: CreateLibraryCatalogRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryCatalogBrowseDescriptor,
    handler: (ctx, payload) => handleLibraryCatalogBrowse(ctx, payload, input),
  };
}

export function createLibraryCatalogSampleRegistration(
  input: CreateLibraryCatalogRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryCatalogSampleDescriptor,
    handler: (ctx, payload) => handleLibraryCatalogSample(ctx, payload, input),
  };
}

export function createLibraryCatalogSummaryRegistration(
  input: CreateLibraryCatalogRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryCatalogSummaryDescriptor,
    handler: (ctx, payload) => handleLibraryCatalogSummary(ctx, payload, input),
  };
}

async function handleLibraryCatalogListScopes(
  ctx: StageToolContext,
  payload: unknown,
  scopeAvailability: LibraryCatalogScopeAvailabilityPort,
): Promise<Result<LibraryCatalogListScopesOutput>> {
  const input = payload as LibraryCatalogListScopesInput;
  const availability = await scopeAvailability.listCatalogScopes({
    ownerScope: ctx.ownerScope,
  });

  if (!availability.ok) {
    return scopeAvailabilityFailed();
  }

  const scopes: ListedLibraryCatalogScope[] = [];
  if (input.kind === undefined || input.kind === "library") {
    scopes.push(listLibraryScope());
  }
  if (input.kind === undefined || input.kind === "source_library") {
    scopes.push(...availability.value.sourceLibraries.map(listSourceLibraryScope));
  }
  if (input.kind === undefined || input.kind === "relation") {
    scopes.push(...availability.value.relations.map(listRelationScope));
  }
  if (input.kind === undefined || input.kind === "collection") {
    scopes.push(...availability.value.collections.map(listCollectionScope));
  }

  return {
    ok: true,
    value: { scopes },
  };
}

async function handleLibraryCatalogBrowse(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCatalogRegistrationInput,
): Promise<Result<LibraryCatalogBrowseOutput>> {
  const input = payload as LibraryCatalogBrowseInput;
  const limit = input.limit ?? 25;
  const resolved = await resolveBrowseRequest(ctx, input, ports.scopeAvailability);

  if (!resolved.ok) {
    return resolved;
  }

  const records = await ports.catalog.listCatalogItems({
    ownerScope: ctx.ownerScope,
    scope: resolved.value.scope,
  });
  // D4: a Collection's native order is its item position (catalogSql already
  // ORDER BY ci.position); browse preserves it instead of re-sorting by
  // recently_added_at like the library/relation baselines.
  const timeOrderedRecords = resolved.value.scope.kind === "collection"
    ? records
    : sortCatalogRecords(records, "time");
  const projectedRecords = resolved.value.sort === "dictionary"
    ? sortProjectedCatalogRecords(
        await projectCatalogRecords(records, ports.materialProjection),
      )
    : await projectCatalogRecords(
        timeOrderedRecords
          .slice(resolved.value.offset, resolved.value.offset + limit),
        ports.materialProjection,
      );
  const page = resolved.value.sort === "dictionary"
    ? projectedRecords.slice(resolved.value.offset, resolved.value.offset + limit)
    : projectedRecords;
  const totalLength = resolved.value.sort === "dictionary"
    ? projectedRecords.length
    : records.length;
  const nextOffset = resolved.value.offset + page.length;
  const output: LibraryCatalogBrowseOutput = {
    items: await publicItems(ctx, page),
    ...(nextOffset < totalLength
      ? {
          nextCursor: await ctx.lookupCursors.register({
            ownerScope: ctx.ownerScope,
            internalCursor: String(nextOffset),
            queryInput: {
              tool: "library.catalog.browse",
              scope: serializableScope(resolved.value.scope),
              sort: resolved.value.sort,
            },
          }),
        }
      : {}),
  };

  return {
    ok: true,
    value: output,
  };
}

async function handleLibraryCatalogSample(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCatalogRegistrationInput,
): Promise<Result<LibraryCatalogSampleOutput>> {
  const input = payload as LibraryCatalogSampleInput;
  const resolved = await resolveFreshScope(ctx, input.scope, ports.scopeAvailability);

  if (!resolved.ok) {
    return resolved;
  }

  const records = await ports.catalog.listCatalogItems({
    ownerScope: ctx.ownerScope,
    scope: resolved.value.scope,
  });
  const sampled = [...records]
    .sort((left, right) => compareStableText(sampleKey(input.seed, left), sampleKey(input.seed, right)))
    .slice(0, input.count);

  return {
    ok: true,
    value: {
      items: await publicItems(ctx, await projectCatalogRecords(sampled, ports.materialProjection)),
    },
  };
}

async function handleLibraryCatalogSummary(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCatalogRegistrationInput,
): Promise<Result<LibraryCatalogSummaryOutput>> {
  const input = payload as LibraryCatalogSummaryInput;
  const resolved = await resolveFreshScope(ctx, input.scope, ports.scopeAvailability);

  if (!resolved.ok) {
    return resolved;
  }

  const records = sortCatalogRecords(
    await ports.catalog.listCatalogItems({
      ownerScope: ctx.ownerScope,
      scope: resolved.value.scope,
    }),
    "time_ascending",
  );
  const projectedRecords = await projectCatalogRecords(records, ports.materialProjection);
  const sampleBands = await summarySampleBands(ctx, projectedRecords, input.sampleCount);
  const output: LibraryCatalogSummaryOutput = {
    sampleBands,
    concentrationSignals: await concentrationSignals(ctx, projectedRecords),
    ...(resolved.value.listed.scope === "[library]"
      ? {
          membershipSignals: await membershipSignals(ctx, ports, resolved.value.availability),
        }
      : {}),
  };

  return {
    ok: true,
    value: output,
  };
}

async function resolveFreshScope(
  ctx: StageToolContext,
  scopeInput: LibraryCatalogScopeInput | undefined,
  scopeAvailability: LibraryCatalogScopeAvailabilityPort,
): Promise<Result<{
  scope: LibraryCatalogReadScope;
  listed: ListedLibraryCatalogScope;
  availability: LibraryCatalogScopeAvailabilitySnapshot;
}>> {
  const availability = await scopeAvailability.listCatalogScopes({
    ownerScope: ctx.ownerScope,
  });

  if (!availability.ok) {
    return scopeAvailabilityFailed();
  }

  const scope = scopeInput ?? formatMusicScopeHandle({ kind: "library" });
  const resolved = resolveListedScope(scope, availability.value);

  if (!resolved.ok) {
    return resolved;
  }

  return {
    ok: true,
    value: {
      ...resolved.value,
      availability: availability.value,
    },
  };
}

async function resolveBrowseRequest(
  ctx: StageToolContext,
  input: LibraryCatalogBrowseInput,
  scopeAvailability: LibraryCatalogScopeAvailabilityPort,
): Promise<Result<{
  scope: LibraryCatalogReadScope;
  sort: LibraryCatalogBrowseSort | "time_ascending";
  offset: number;
}>> {
  if (input.cursor !== undefined) {
    if (input.scope !== undefined || input.sort !== undefined) {
      return invalidInput("A cursor page must not also pass scope or sort.");
    }

    const resolved = await ctx.lookupCursors.resolve({
      ownerScope: ctx.ownerScope,
      cursorId: input.cursor,
    });

    if (!resolved.ok) {
      return cursorFailure(resolved.error);
    }

    return deserializeBrowseCursor(resolved.value.internalCursor, resolved.value.queryInput);
  }

  const resolved = await resolveFreshScope(ctx, input.scope, scopeAvailability);
  if (!resolved.ok) {
    return resolved;
  }

  return {
    ok: true,
    value: {
      scope: resolved.value.scope,
      sort: input.sort ?? "time",
      offset: 0,
    },
  };
}

function resolveListedScope(
  input: LibraryCatalogScopeInput,
  availability: LibraryCatalogScopeAvailabilitySnapshot,
): Result<{
  scope: LibraryCatalogReadScope;
  listed: ListedLibraryCatalogScope;
}> {
  const parsed = parseMusicScopeHandle(input);
  switch (parsed.kind) {
    case "library":
      return {
        ok: true,
        value: {
          scope: { kind: "library" },
          listed: listLibraryScope(),
        },
      };
    case "source_library": {
      const sourceLibrary = availability.sourceLibraries.find((scope) => scope.id === parsed.id);
      if (sourceLibrary === undefined) {
        return scopeNotFound("Source-library catalog scope id was not found.");
      }
      return {
        ok: true,
        value: {
          scope: {
            kind: "source_library",
            ref: sourceLibrary.ref,
            materialKind: sourceLibrary.targetKind,
          },
          listed: listSourceLibraryScope(sourceLibrary),
        },
      };
    }
    case "relation": {
      const relation = availability.relations.find((scope) => scope.id === parsed.id);
      if (relation === undefined) {
        return scopeNotFound("Relation catalog scope id was not found.");
      }
      return {
        ok: true,
        value: {
          scope: {
            kind: "relation",
            ref: relation.ref,
            materialKind: relation.targetKind,
          },
          listed: listRelationScope(relation),
        },
      };
    }
    case "collection": {
      const collection = availability.collections.find((scope) => scope.id === parsed.id);
      if (collection === undefined) {
        return scopeNotFound("Collection catalog scope id was not found.");
      }
      return {
        ok: true,
        value: {
          scope: {
            kind: "collection",
            ref: collection.ref,
            ...(collection.targetKind === undefined ? {} : { targetKind: collection.targetKind }),
          },
          listed: listCollectionScope(collection),
        },
      };
    }
    case "all":
    case "provider":
      return scopeNotFound("Catalog scope id was not found.");
  }
}

function listLibraryScope(): ListedLibraryCatalogScope {
  return {
    scope: formatMusicScopeHandle({ kind: "library" }),
    description: libraryMusicScopeDescription(),
  };
}

function listSourceLibraryScope(
  scope: LibraryCatalogSourceLibraryScopeAvailability,
): ListedLibraryCatalogScope {
  return {
    scope: formatMusicScopeHandle({ kind: "source_library", id: scope.id }),
    description: sourceLibraryMusicScopeDescription({
      ...(scope.providerName === undefined ? {} : { providerName: scope.providerName }),
      relationName: scope.relationName,
      targetKind: scope.targetKind,
      ...(scope.detailText === undefined ? {} : { detailText: scope.detailText }),
    }),
  };
}

function listRelationScope(
  scope: LibraryCatalogRelationScopeAvailability,
): ListedLibraryCatalogScope {
  return {
    scope: formatMusicScopeHandle({ kind: "relation", id: scope.id }),
    description: relationMusicScopeDescription({
      relationName: scope.relationName,
      targetKind: scope.targetKind,
      ...(scope.detailText === undefined ? {} : { detailText: scope.detailText }),
    }),
  };
}

function listCollectionScope(
  scope: LibraryCatalogCollectionScopeAvailability,
): ListedLibraryCatalogScope {
  return {
    scope: formatMusicScopeHandle({ kind: "collection", id: scope.id }),
    description: collectionMusicScopeDescription({
      collectionName: scope.collectionName,
      ...(scope.targetKind === undefined ? {} : { targetKind: scope.targetKind }),
      ...(scope.detailText === undefined ? {} : { detailText: scope.detailText }),
    }),
  };
}

function serializableScope(scope: LibraryCatalogReadScope): SerializableCatalogScope {
  switch (scope.kind) {
    case "library":
      return { kind: "library" };
    case "source_library":
      return {
        kind: "source_library",
        refKey: refKey(scope.ref),
        materialKind: scope.materialKind,
      };
    case "relation":
      return {
        kind: "relation",
        refKey: refKey(scope.ref),
        materialKind: scope.materialKind,
      };
    case "collection":
      return {
        kind: "collection",
        refKey: refKey(scope.ref),
        ...(scope.targetKind === undefined ? {} : { targetKind: scope.targetKind }),
      };
    case "scan_root":
      // scan_root is an internal-only catalog scope (D23) never exposed through
      // Stage Interface scope schemas or availability. Reaching the Stage Adapter
      // serialization path with one is a boundary violation; fail loudly rather
      // than fabricate a serializable form.
      throw new Error("Internal scan_root catalog scope is not serializable for Stage Interface.");
  }
}

type SerializableCatalogScope =
  | { kind: "library" }
  | { kind: "source_library"; refKey: string; materialKind: LibraryCatalogMaterialKind }
  | { kind: "relation"; refKey: string; materialKind: LibraryCatalogMaterialKind }
  | { kind: "collection"; refKey: string; targetKind?: LibraryCatalogMaterialKind };

function deserializeBrowseCursor(
  internalCursor: string,
  queryInput: unknown,
): Result<{
  scope: LibraryCatalogReadScope;
  sort: LibraryCatalogBrowseSort;
  offset: number;
}> {
  const offset = Number(internalCursor);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return invalidCursor("Library catalog browse cursor offset is invalid.");
  }

  if (!isBrowseCursorPayload(queryInput)) {
    return invalidCursor("Library catalog browse cursor payload is invalid.");
  }

  const scope = deserializeScope(queryInput.scope);
  if (!scope.ok) {
    return scope;
  }

  return {
    ok: true,
    value: {
      scope: scope.value,
      sort: queryInput.sort,
      offset,
    },
  };
}

function isBrowseCursorPayload(value: unknown): value is {
  tool: "library.catalog.browse";
  scope: SerializableCatalogScope;
  sort: LibraryCatalogBrowseSort;
} {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.tool === "library.catalog.browse" &&
    isSerializableScope(record.scope) &&
    (record.sort === "time" || record.sort === "dictionary");
}

function isSerializableScope(value: unknown): value is SerializableCatalogScope {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "library") {
    return true;
  }
  if (record.kind === "source_library") {
    return typeof record.refKey === "string" &&
      isLibraryCatalogMaterialKind(record.materialKind);
  }
  if (record.kind === "collection") {
    return typeof record.refKey === "string" &&
      (record.targetKind === undefined || isLibraryCatalogMaterialKind(record.targetKind));
  }
  return record.kind === "relation" &&
    typeof record.refKey === "string" &&
    isLibraryCatalogMaterialKind(record.materialKind);
}

function deserializeScope(scope: SerializableCatalogScope): Result<LibraryCatalogReadScope> {
  switch (scope.kind) {
    case "library":
      return { ok: true, value: { kind: "library" } };
    case "source_library": {
      const ref = parseRefKey(scope.refKey);
      if (ref === undefined) {
        return invalidCursor("Source-library catalog cursor scope is invalid.");
      }
      return {
        ok: true,
        value: {
          kind: "source_library",
          ref,
          materialKind: scope.materialKind,
        },
      };
    }
    case "relation": {
      const ref = parseRefKey(scope.refKey);
      if (ref === undefined) {
        return invalidCursor("Relation catalog cursor scope is invalid.");
      }
      return {
        ok: true,
        value: {
          kind: "relation",
          ref,
          materialKind: scope.materialKind,
        },
      };
    }
    case "collection": {
      const ref = parseRefKey(scope.refKey);
      if (ref === undefined) {
        return invalidCursor("Collection catalog cursor scope is invalid.");
      }
      return {
        ok: true,
        value: {
          kind: "collection",
          ref,
          ...(scope.targetKind === undefined ? {} : { targetKind: scope.targetKind }),
        },
      };
    }
  }
}

function sortCatalogRecords(
  records: readonly LibraryCatalogRecord[],
  sort: Exclude<LibraryCatalogBrowseSort, "dictionary"> | "time_ascending",
): readonly LibraryCatalogRecord[] {
  return [...records].sort((left, right) => {
    switch (sort) {
      case "time":
        return compareStableText(right.recentlyAddedAt, left.recentlyAddedAt) ||
          compareStableText(left.materialRefKey, right.materialRefKey);
      case "time_ascending":
        return compareStableText(left.recentlyAddedAt, right.recentlyAddedAt) ||
          compareStableText(left.materialRefKey, right.materialRefKey);
    }
  });
}

type ProjectedLibraryCatalogRecord = LibraryCatalogRecord & {
  material: MusicMaterial;
  description: PublicHandleDescription;
};

async function projectCatalogRecords(
  records: readonly LibraryCatalogRecord[],
  materialProjection: MaterialProjection,
): Promise<readonly ProjectedLibraryCatalogRecord[]> {
  const projectedMaterials = await materialProjection.projectMusicMaterials({
    materialRefs: records.map((record) => record.materialRef),
  });

  return records.map((record) => {
    const material = projectedMaterials.get(record.materialRefKey);
    if (material === undefined) {
      throw new Error(`Library catalog material cannot be projected: ${record.materialRefKey}.`);
    }
    if (material.kind !== record.materialKind) {
      throw new Error("Library catalog material kind does not match projected material kind.");
    }

    return {
      ...record,
      material,
      description: publicDescriptionFromMaterial(material),
    };
  });
}

function sortProjectedCatalogRecords(
  records: readonly ProjectedLibraryCatalogRecord[],
): readonly ProjectedLibraryCatalogRecord[] {
  return [...records].sort((left, right) =>
    compareStableText(left.description.label, right.description.label) ||
    compareStableText(left.materialRefKey, right.materialRefKey));
}

async function summarySampleBands(
  ctx: StageToolContext,
  records: readonly ProjectedLibraryCatalogRecord[],
  sampleCount: number,
): Promise<readonly LibraryCatalogSummarySampleBand[]> {
  const slices = summaryBandSlices(records);
  const quotas = evenAvailableQuotas(
    slices.map((slice) => slice.records.length),
    Math.min(sampleCount, records.length),
  );
  const selectedArtists = new Set<string>();
  const bands: LibraryCatalogSummarySampleBand[] = [];

  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index];
    const quota = quotas[index];
    if (slice === undefined || quota === undefined) {
      throw new Error("Summary band quota invariant failed.");
    }
    bands.push({
      band: slice.band,
      items: await publicItems(ctx, stratifiedArtistSample(slice.records, quota, selectedArtists)),
    });
  }

  return bands;
}

type SummaryBandSlice = {
  band: LibraryCatalogSummaryTimeBand;
  records: readonly ProjectedLibraryCatalogRecord[];
};

function summaryBandSlices(
  records: readonly ProjectedLibraryCatalogRecord[],
): readonly SummaryBandSlice[] {
  return SUMMARY_BANDS.map((band, index) => {
    const start = Math.floor((records.length * index) / SUMMARY_BANDS.length);
    const end = Math.floor((records.length * (index + 1)) / SUMMARY_BANDS.length);

    return {
      band,
      records: records.slice(start, end),
    };
  });
}

const SUMMARY_BANDS: readonly LibraryCatalogSummaryTimeBand[] = [
  "earliest_25",
  "25_50",
  "50_75",
  "latest_25",
];

function evenAvailableQuotas(
  capacities: readonly number[],
  total: number,
): readonly number[] {
  const quotas = capacities.map(() => 0);
  const target = Math.min(total, capacities.reduce((sum, capacity) => sum + capacity, 0));

  for (let assigned = 0; assigned < target; assigned += 1) {
    let selectedIndex: number | undefined;
    for (let index = 0; index < capacities.length; index += 1) {
      if ((quotas[index] ?? 0) >= (capacities[index] ?? 0)) {
        continue;
      }
      if (selectedIndex === undefined || (quotas[index] ?? 0) < (quotas[selectedIndex] ?? 0)) {
        selectedIndex = index;
      }
    }
    if (selectedIndex === undefined) {
      throw new Error("Summary band quota capacity invariant failed.");
    }
    quotas[selectedIndex] = (quotas[selectedIndex] ?? 0) + 1;
  }

  return quotas;
}

function stratifiedArtistSample(
  records: readonly ProjectedLibraryCatalogRecord[],
  count: number,
  selectedArtists: Set<string>,
): readonly ProjectedLibraryCatalogRecord[] {
  if (count <= 0 || records.length === 0) {
    return [];
  }
  if (count >= records.length) {
    for (const record of records) {
      rememberArtist(record, selectedArtists);
    }
    return records;
  }

  const selected: ProjectedLibraryCatalogRecord[] = [];

  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((records.length * index) / count);
    const end = Math.max(start + 1, Math.floor((records.length * (index + 1)) / count));
    const candidates = records.slice(start, end);
    const preferred = candidates.find((record) => {
      const key = artistDedupeKey(record);
      return key === undefined || !selectedArtists.has(key);
    }) ?? candidates[0];
    if (preferred === undefined) {
      throw new Error("Summary stratified sample candidate invariant failed.");
    }

    selected.push(preferred);
    rememberArtist(preferred, selectedArtists);
  }

  return selected;
}

async function concentrationSignals(
  ctx: StageToolContext,
  records: readonly ProjectedLibraryCatalogRecord[],
): Promise<readonly LibraryCatalogConcentrationSignal[]> {
  const groups = [
    buildSignalGroups(records, {
      signalKind: "recording_artist",
      materialKind: "recording",
      values: (record) => record.material.kind === "recording"
        ? labelValues(record.material.artistLabels)
        : [],
    }),
    buildSignalGroups(records, {
      signalKind: "recording_album",
      materialKind: "recording",
      values: (record) => record.material.kind === "recording"
        ? optionalLabelValues(record.material.albumLabel)
        : [],
    }),
    buildSignalGroups(records, {
      signalKind: "album_artist",
      materialKind: "album",
      values: (record) => record.material.kind === "album"
        ? labelValues(record.material.artistLabels)
        : [],
    }),
    buildSignalGroups(records, {
      signalKind: "artist_item",
      materialKind: "artist",
      values: (record) => record.material.kind === "artist"
        ? [record.material.name]
        : [],
    }),
  ];

  const signals: LibraryCatalogConcentrationSignal[] = [];
  for (const group of groups) {
    for (const signal of group.slice(0, 10)) {
      signals.push({
        signalKind: signal.signalKind,
        materialKind: signal.materialKind,
        label: signal.label,
        count: signal.records.length,
        examples: await publicItems(ctx, signal.records.slice(0, 5)),
      });
    }
  }

  return signals;
}

type SignalGroup = {
  signalKind: LibraryCatalogConcentrationSignal["signalKind"];
  materialKind: LibraryCatalogMaterialKind;
  label: string;
  records: readonly ProjectedLibraryCatalogRecord[];
};

function buildSignalGroups(inputRecords: readonly ProjectedLibraryCatalogRecord[], input: {
  signalKind: LibraryCatalogConcentrationSignal["signalKind"];
  materialKind: LibraryCatalogMaterialKind;
  values(record: ProjectedLibraryCatalogRecord): readonly string[];
}): readonly SignalGroup[] {
  const byLabel = new Map<string, ProjectedLibraryCatalogRecord[]>();

  for (const record of inputRecords) {
    if (record.material.kind !== input.materialKind) {
      continue;
    }
    for (const value of input.values(record)) {
      const records = byLabel.get(value) ?? [];
      records.push(record);
      byLabel.set(value, records);
    }
  }

  return [...byLabel.entries()]
    .map(([label, records]) => ({
      signalKind: input.signalKind,
      materialKind: input.materialKind,
      label,
      records: [...records].sort((left, right) =>
        compareStableText(right.recentlyAddedAt, left.recentlyAddedAt) ||
        compareStableText(left.materialRefKey, right.materialRefKey)),
    }))
    .sort((left, right) =>
      right.records.length - left.records.length ||
      compareStableText(left.label, right.label));
}

async function membershipSignals(
  ctx: StageToolContext,
  ports: CreateLibraryCatalogRegistrationInput,
  availability: LibraryCatalogScopeAvailabilitySnapshot,
): Promise<readonly LibraryCatalogMembershipSignal[]> {
  const signals: LibraryCatalogMembershipSignal[] = [];
  const scopes: readonly {
    listed: Exclude<ListedLibraryCatalogScope, { scope: "[library]" }>;
    readScope: LibraryCatalogReadScope;
  }[] = [
    ...availability.sourceLibraries.map((scope) => ({
      listed: listSourceLibraryScope(scope) as Exclude<ListedLibraryCatalogScope, { scope: "[library]" }>,
      readScope: {
        kind: "source_library" as const,
        ref: scope.ref,
        materialKind: scope.targetKind,
      },
    })),
    ...availability.relations.map((scope) => ({
      listed: listRelationScope(scope) as Exclude<ListedLibraryCatalogScope, { scope: "[library]" }>,
      readScope: {
        kind: "relation" as const,
        ref: scope.ref,
        materialKind: scope.targetKind,
      },
    })),
    ...availability.collections.map((scope) => ({
      listed: listCollectionScope(scope) as Exclude<ListedLibraryCatalogScope, { scope: "[library]" }>,
      readScope: {
        kind: "collection" as const,
        ref: scope.ref,
        ...(scope.targetKind === undefined ? {} : { targetKind: scope.targetKind }),
      },
    })),
  ];

  for (const scope of scopes) {
    const records = await ports.catalog.listCatalogItems({
      ownerScope: ctx.ownerScope,
      scope: scope.readScope,
    });
    signals.push({
      scope: scope.listed,
      count: new Set(records.map((record) => record.materialRefKey)).size,
      examples: await publicItems(
        ctx,
        await projectCatalogRecords(records.slice(0, 5), ports.materialProjection),
      ),
    });
  }

  return signals;
}

async function publicItems(
  ctx: StageToolContext,
  records: readonly ProjectedLibraryCatalogRecord[],
): Promise<readonly LibraryCatalogItem[]> {
  const items: LibraryCatalogItem[] = [];

  for (const record of records) {
    items.push({
      item: formatMusicItemHandle({
        kind: "material",
        id: await ctx.handleMinting.mint({
          ownerScope: ctx.ownerScope,
          handleKind: "material",
          internalAnchor: {
            materialRef: refKey(record.material.materialRef),
          },
        }),
      }),
      description: record.description,
    });
  }

  return items;
}

function publicDescriptionFromMaterial(material: MusicMaterial): PublicHandleDescription {
  switch (material.kind) {
    case "recording": {
      const artistsText = artistsTextForLabels(material.artistLabels);
      return {
        label: musicLookupItemLabel({
          handle: { kind: "material" },
          title: material.title,
          ...(artistsText === undefined ? {} : { artistsText }),
          ...(material.albumLabel === undefined ? {} : { album: material.albumLabel }),
          ...(material.versionInfo?.label === undefined ? {} : { versionText: material.versionInfo.label }),
        }),
      };
    }
    case "album": {
      const artistsText = artistsTextForLabels(material.artistLabels);
      return {
        label: musicLookupItemLabel({
          handle: { kind: "material" },
          title: material.title,
          ...(artistsText === undefined ? {} : { artistsText }),
          ...(material.versionInfo?.label === undefined ? {} : { versionText: material.versionInfo.label }),
        }),
      };
    }
    case "artist":
      return {
        label: musicLookupItemLabel({
          handle: { kind: "material" },
          title: material.name,
        }),
      };
  }
}

function sampleKey(seed: string, record: LibraryCatalogRecord): string {
  return createHash("sha256")
    .update(seed)
    .update("\0")
    .update(record.materialRefKey)
    .digest("base64url");
}

function labelValues(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0))];
}

function optionalLabelValues(value: string | undefined): readonly string[] {
  return labelValues(value === undefined ? [] : [value]);
}

function artistsTextForLabels(labels: readonly string[] | undefined): string | undefined {
  const values = labelValues(labels);

  return values.length === 0 ? undefined : values.join(", ");
}

function rememberArtist(record: ProjectedLibraryCatalogRecord, selectedArtists: Set<string>): void {
  const artistKey = artistDedupeKey(record);
  if (artistKey !== undefined) {
    selectedArtists.add(artistKey);
  }
}

function artistDedupeKey(record: ProjectedLibraryCatalogRecord): string | undefined {
  switch (record.material.kind) {
    case "recording":
    case "album":
      return labelValues(record.material.artistLabels)[0];
    case "artist":
      return record.material.name;
  }
}

function compareStableText(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function isLibraryCatalogMaterialKind(value: unknown): value is LibraryCatalogMaterialKind {
  return value === "recording" || value === "album" || value === "artist";
}

function invalidInput(message: string): Result<never> {
  return fail({
    code: "invalid_input",
    message,
    retryable: false,
    suggestedFix: "Retry with a catalog scope returned by library.catalog.list_scopes.",
  });
}

function scopeAvailabilityFailed(): Result<never> {
  return fail({
    code: "scope_availability_failed",
    message: "Library catalog scope availability could not be read.",
    retryable: true,
    suggestedFix: "Retry later, or call library.catalog.list_scopes again.",
  });
}

function scopeNotFound(message: string): Result<never> {
  return fail({
    code: "scope_not_found",
    message,
    retryable: true,
    suggestedFix: "Call library.catalog.list_scopes again and pass back one returned scope id unchanged.",
  });
}

function invalidCursor(message: string): Result<never> {
  return fail({
    code: "invalid_cursor",
    message,
    retryable: true,
    suggestedFix: "Start a fresh first-page library.catalog.browse call.",
  });
}

function cursorFailure(error: StageError): Result<never> {
  if (error.code === "result_window_expired") {
    return fail({
      code: "result_window_expired",
      message: "Library catalog browse result window expired.",
      retryable: true,
      suggestedFix: "Start a fresh first-page library.catalog.browse call.",
    });
  }

  return invalidCursor("Library catalog browse cursor is invalid.");
}

function fail(input: {
  code: string;
  message: string;
  retryable: boolean;
  suggestedFix?: string;
}): Result<never> {
  return {
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      area: "music_data_platform",
      retryable: input.retryable,
      ...(input.suggestedFix === undefined ? {} : { suggestedFix: input.suggestedFix }),
    },
  };
}
