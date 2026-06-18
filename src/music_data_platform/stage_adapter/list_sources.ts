import type { Result } from "../../contracts/kernel.js";
import { libraryImportLibraryKindDescription } from "../../contracts/public_music_description.js";
import {
  libraryImportListSourcesInputSchema,
  libraryImportListSourcesOutputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import type {
  InstrumentDescriptor,
  LibraryImportLibraryKind,
  LibraryImportListSourcesOutput,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";

export type PlatformLibrarySourceDescriptor = {
  providerId: string;
  label: string;
  accountRequired?: boolean;
  libraryKinds: readonly LibraryImportLibraryKind[];
};

export type PlatformLibrarySourceListingPort = {
  listPlatformLibrarySources(): readonly PlatformLibrarySourceDescriptor[];
};

export type CreateLibraryImportListSourcesRegistrationInput = {
  sourceListing: PlatformLibrarySourceListingPort;
};

export const libraryImportInstrument: InstrumentDescriptor = {
  id: "library.import",
  label: "Library Import",
  ownerArea: "music_data_platform",
};

export const libraryImportListSourcesDescriptor: ToolDeclaration = {
  name: "library.import.list_sources",
  instrumentId: libraryImportInstrument.id,
  label: "List Library Import Sources",
  ownerArea: "music_data_platform",
  description: "List provider library areas that can be imported into the owner's MineMusic library.",
  usage: {
    useWhen: "Use before starting a library import so the agent can choose a valid providerId and libraryKind from MineMusic metadata.",
    doNotUseWhen: "Do not use to test provider login, refresh cookies, read account library pages, or inspect internal source-library refs.",
    outputSemantics: "Returns provider metadata and MineMusic-owned provider-neutral library-kind descriptions only; it performs no provider read.",
  },
  examples: [
    {
      prompt: "what libraries can I import?",
      expects: "call",
    },
    {
      prompt: "import my NetEase liked songs",
      expects: "call",
      note: "call first when the agent needs the exact providerId and libraryKind before starting import",
    },
    {
      prompt: "check if my NetEase cookie is valid",
      expects: "avoid",
      note: "source listing is metadata-only and does not probe provider account state",
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
  inputSchema: libraryImportListSourcesInputSchema,
  outputSchema: libraryImportListSourcesOutputSchema,
  errors: [
    {
      code: "invalid_input",
      retryable: false,
      suggestedFixTemplate: "Call library.import.list_sources with an empty object.",
    },
  ],
  resultSummary(result) {
    const output = result as LibraryImportListSourcesOutput;
    const count = Array.isArray(output.sources) ? output.sources.length : 0;
    return `${count} library import source(s) available.`;
  },
};

export function createLibraryImportListSourcesRegistration(
  input: CreateLibraryImportListSourcesRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: libraryImportListSourcesDescriptor,
    handler: (ctx, payload) => handleLibraryImportListSources(ctx, payload, input.sourceListing),
  };
}

async function handleLibraryImportListSources(
  _ctx: StageToolContext,
  _payload: unknown,
  sourceListing: PlatformLibrarySourceListingPort,
): Promise<Result<LibraryImportListSourcesOutput>> {
  return {
    ok: true,
    value: {
      sources: sourceListing.listPlatformLibrarySources().map((source) => ({
        providerId: source.providerId,
        label: source.label,
        ...(source.accountRequired === true ? { accountRequired: true as const } : {}),
        libraryKinds: source.libraryKinds.map((kind) => ({
          kind,
          ...libraryImportLibraryKindDescription(kind),
        })),
      })),
    },
  };
}
