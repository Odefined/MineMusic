import type { Result } from "../../contracts/kernel.js";
import {
  libraryMusicScopeDescription,
  providerMusicScopeDescription,
  relationMusicScopeDescription,
  sourceLibraryMusicScopeDescription,
} from "../../contracts/public_music_description.js";
import {
  musicListScopesInputSchema,
  musicListScopesOutputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import type {
  InstrumentDescriptor,
  ListedMusicScope,
  MusicListScopesInput,
  MusicListScopesOutput,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import { formatMusicScopeHandle } from "../../contracts/stage_interface.js";
import type {
  MusicProviderScopeAvailability,
  MusicRelationScopeAvailability,
  MusicScopeAvailabilityPort,
  MusicSourceLibraryScopeAvailability,
} from "./scope_availability.js";
import { scopeAvailabilityFailed } from "./scope_availability.js";

export type CreateMusicDiscoveryListScopesRegistrationInput = {
  scopeAvailability: MusicScopeAvailabilityPort;
};

export const musicDiscoveryInstrument: InstrumentDescriptor = {
  id: "music.discovery",
  label: "Music Discovery",
  ownerArea: "music_intelligence",
};

export const musicDiscoveryListScopesDescriptor: ToolDeclaration = {
  name: "music.discovery.list_scopes",
  instrumentId: musicDiscoveryInstrument.id,
  label: "List Music Scopes",
  ownerArea: "music_intelligence",
  description: "List the explicit public Music Scopes the agent may pass to scoped music tools such as Music Discovery lookup.",
  usage: {
    useWhen: "Use before scoped retrieval when the agent needs available library baseline, source-library handles, relation handles, or provider scopes.",
    doNotUseWhen: "Do not use to inspect internal pools, provider raw ids, Collection internals, or to refresh provider account availability.",
    outputSemantics: "Returns explicit reusable public Music Scopes and excludes the aggregate all shortcut; descriptions are display metadata, not identity.",
  },
  examples: [
    {
      prompt: "what music scopes can I search?",
      expects: "call",
    },
    {
      prompt: "list my available saved-music scopes",
      expects: "call",
    },
    {
      prompt: "give me the source library ref",
      expects: "avoid",
      note: "internal refs never cross the veil",
    },
    {
      prompt: "dump collection rows",
      expects: "avoid",
      note: "collection internals are not a scope-listing concern",
    },
  ],
  sideEffect: {
    durableUserStateWrite: false,
    runtimeStateWrite: false,
    externalCall: false,
  },
  invocationPolicy: {
    defaultDecision: "auto",
    dataEgress: "none",
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: musicListScopesInputSchema,
  outputSchema: musicListScopesOutputSchema,
  errors: [
    {
      code: "invalid_input",
      retryable: false,
      suggestedFixTemplate: "Call music.discovery.list_scopes with an optional kind of library, source_library, relation, or provider.",
    },
    {
      code: "scope_availability_failed",
      retryable: true,
      suggestedFixTemplate: "Retry music.discovery.list_scopes later to inspect available scopes.",
    },
  ],
  resultSummary(result) {
    const output = result as MusicListScopesOutput;
    const count = Array.isArray(output.scopes) ? output.scopes.length : 0;
    return `${count} selectable music scope(s) returned.`;
  },
};

export function createMusicDiscoveryListScopesRegistration(
  input: CreateMusicDiscoveryListScopesRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: musicDiscoveryListScopesDescriptor,
    handler: (ctx, payload) => handleMusicDiscoveryListScopes(ctx, payload, input.scopeAvailability),
  };
}

async function handleMusicDiscoveryListScopes(
  ctx: StageToolContext,
  payload: unknown,
  scopeAvailability: MusicScopeAvailabilityPort,
): Promise<Result<MusicListScopesOutput>> {
  const input = payload as MusicListScopesInput;
  const availability = await scopeAvailability.listAvailableMusicScopes({
    ownerScope: ctx.ownerScope,
  });

  if (!availability.ok) {
    return scopeAvailabilityFailed();
  }

  const { kind } = input;
  const scopes: ListedMusicScope[] = [];

  if (kind === undefined || kind === "library") {
    scopes.push({
      scope: formatMusicScopeHandle({ kind: "library" }),
      description: libraryMusicScopeDescription(),
    });
  }

  if (kind === undefined || kind === "source_library") {
    scopes.push(...availability.value.sourceLibraries.map(listSourceLibraryScope));
  }

  if (kind === undefined || kind === "relation") {
    scopes.push(...availability.value.relations.map(listRelationScope));
  }

  if (kind === undefined || kind === "provider") {
    scopes.push(...availability.value.providers.map(listProviderScope));
  }

  return {
    ok: true,
    value: {
      scopes,
    },
  };
}

function listSourceLibraryScope(scope: MusicSourceLibraryScopeAvailability): ListedMusicScope {
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

function listRelationScope(scope: MusicRelationScopeAvailability): ListedMusicScope {
  return {
    scope: formatMusicScopeHandle({ kind: "relation", id: scope.id }),
    description: relationMusicScopeDescription({
      relationName: scope.relationName,
      targetKind: scope.targetKind,
      ...(scope.detailText === undefined ? {} : { detailText: scope.detailText }),
    }),
  };
}

function listProviderScope(scope: MusicProviderScopeAvailability): ListedMusicScope {
  return {
    scope: formatMusicScopeHandle({ kind: "provider", providerId: scope.providerId }),
    description: providerMusicScopeDescription({
      ...(scope.providerName === undefined ? {} : { providerName: scope.providerName }),
      ...(scope.detailText === undefined ? {} : { detailText: scope.detailText }),
    }),
    targetKinds: scope.targetKinds,
  };
}
