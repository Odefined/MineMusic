import type { Ref, Result } from "../../contracts/kernel.js";
import { parseRefKey } from "../../contracts/kernel.js";
import {
  libraryRelationItemInputSchema,
  libraryRelationStateOutputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import type {
  InstrumentDescriptor,
  LibraryRelationItemInput,
  LibraryRelationState,
  LibraryRelationStateOutput,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import {
  isMusicDataPlatformError,
  type LibraryRelationEdit,
} from "../index.js";

export type LibraryRelationControlPort = {
  getRelationState(input: {
    ownerScope: string;
    materialRef: Ref;
  }): LibraryRelationState;
  editRelation(input: {
    ownerScope: string;
    materialRef: Ref;
    edit: LibraryRelationEdit;
    now: string;
  }): LibraryRelationState;
};

export type CreateLibraryRelationRegistrationInput = {
  control: LibraryRelationControlPort;
};

export const libraryRelationInstrument: InstrumentDescriptor = {
  id: "library.relation",
  label: "Library Relation",
  ownerArea: "music_data_platform",
};

const editSideEffect = {
  durableUserStateWrite: true,
  runtimeStateWrite: false,
  externalCall: false,
} as const;

const editInvocationPolicy = {
  defaultDecision: "auto",
  dataEgress: "none",
  readOnlyHint: false,
  destructiveHint: false,
  ownerRelationDrivenByUserRequest: true,
} as const;

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

const commonInputOutput = {
  inputSchema: libraryRelationItemInputSchema,
  outputSchema: libraryRelationStateOutputSchema,
};

const readErrors = [
  {
    code: "invalid_input",
    retryable: false,
    suggestedFixTemplate: "Retry with item as a durable library MusicItemHandle. Present candidate items first with music.experience.present.",
  },
  {
    code: "item_not_found",
    retryable: true,
    suggestedFixTemplate: "Retry with a current library item handle, or look up and present the item again.",
  },
  {
    code: "owner_scope_unsupported",
    retryable: false,
    suggestedFixTemplate: "Retry from the supported local owner scope.",
  },
] as const;

const editErrors = [
  ...readErrors,
  {
    code: "item_not_writable",
    retryable: false,
    suggestedFixTemplate: "Retry with an active library item.",
  },
] as const;

export const libraryRelationGetDescriptor: ToolDeclaration = {
  name: "library.relation.get",
  instrumentId: libraryRelationInstrument.id,
  label: "Get Library Relations",
  ownerArea: "music_data_platform",
  description: "Read the current saved, favorite, and blocked relation state for one MineMusic library item.",
  usage: {
    useWhen: "Use when the user or agent needs to know whether a durable library item is currently saved, favorite, or blocked without editing it.",
    doNotUseWhen: "Do not use for lookup, presentation, provider-side saves, collection membership, candidate admission, or changing relation state.",
    outputSemantics: "Returns only the current saved/favorite/blocked booleans for the item; it does not expose relation records, material refs, timestamps, or scope handles.",
  },
  examples: [
    {
      prompt: "is this track saved or blocked?",
      expects: "call",
    },
    {
      prompt: "save this track",
      expects: "avoid",
      note: "use library.relation.save to edit relation state",
    },
  ],
  sideEffect: readOnlySideEffect,
  invocationPolicy: readOnlyInvocationPolicy,
  ...commonInputOutput,
  errors: readErrors,
};

export const libraryRelationSaveDescriptor = editDescriptor({
  action: "save",
  label: "Save Library Item",
  description: "Mark one MineMusic library item as saved.",
  useWhen: "Use when the user explicitly asks to save or keep one durable library item in MineMusic.",
  doNotUseWhen: "Do not use for provider-side liking, candidate admission, collection membership, or simply checking whether an item is saved.",
  outputSemantics: "Clears blocked, marks saved active, leaves favorite unchanged, and returns the current saved/favorite/blocked booleans.",
  callPrompt: "save this track",
  avoidPrompt: "is this track already saved?",
  avoidNote: "use library.relation.get to read relation state",
});

export const libraryRelationUnsaveDescriptor = editDescriptor({
  action: "unsave",
  label: "Unsave Library Item",
  description: "Remove the saved relation from one MineMusic library item.",
  useWhen: "Use when the user explicitly asks to remove the saved relation from one durable library item.",
  doNotUseWhen: "Do not use to delete material identity, remove source-library facts, unlike a provider item, or edit favorite/blocked state.",
  outputSemantics: "Removes saved if active, leaves favorite and blocked unchanged, and returns the current saved/favorite/blocked booleans.",
  callPrompt: "unsave this track",
  avoidPrompt: "delete this track from NetEase",
  avoidNote: "provider-side or destructive deletes are not library relation edits",
});

export const libraryRelationFavoriteDescriptor = editDescriptor({
  action: "favorite",
  label: "Favorite Library Item",
  description: "Mark one MineMusic library item as favorite.",
  useWhen: "Use when the user explicitly asks to favorite one durable library item in MineMusic.",
  doNotUseWhen: "Do not use for provider-side likes, candidate admission, collection membership, or saving without favorite intent.",
  outputSemantics: "Clears blocked, marks favorite active, leaves saved unchanged, and returns the current saved/favorite/blocked booleans.",
  callPrompt: "favorite this album",
  avoidPrompt: "save this track",
  avoidNote: "save and favorite are independent relations",
});

export const libraryRelationUnfavoriteDescriptor = editDescriptor({
  action: "unfavorite",
  label: "Unfavorite Library Item",
  description: "Remove the favorite relation from one MineMusic library item.",
  useWhen: "Use when the user explicitly asks to remove the favorite relation from one durable library item.",
  doNotUseWhen: "Do not use to unsave, unblock, delete identity, or edit provider-side likes.",
  outputSemantics: "Removes favorite if active, leaves saved and blocked unchanged, and returns the current saved/favorite/blocked booleans.",
  callPrompt: "unfavorite this artist",
  avoidPrompt: "remove this from my saved songs",
  avoidNote: "unsave owns saved relation removal",
});

export const libraryRelationBlockDescriptor = editDescriptor({
  action: "block",
  label: "Block Library Item",
  description: "Mark one MineMusic library item as blocked.",
  useWhen: "Use when the user explicitly asks to block, hide, or exclude one durable library item from ordinary catalog visibility.",
  doNotUseWhen: "Do not use for temporary filtering, provider-side blocking, candidate admission, or deleting the item.",
  outputSemantics: "Clears saved and favorite, marks blocked active, and returns the current saved/favorite/blocked booleans.",
  callPrompt: "block this version",
  avoidPrompt: "skip this for now",
  avoidNote: "temporary listening choices are not durable library relation edits",
});

export const libraryRelationUnblockDescriptor = editDescriptor({
  action: "unblock",
  label: "Unblock Library Item",
  description: "Remove the blocked relation from one MineMusic library item.",
  useWhen: "Use when the user explicitly asks to unblock or allow one durable library item again.",
  doNotUseWhen: "Do not use to save, favorite, restore provider state, or inspect relation state without editing.",
  outputSemantics: "Removes blocked if active, leaves saved and favorite unchanged, and returns the current saved/favorite/blocked booleans.",
  callPrompt: "unblock this track",
  avoidPrompt: "is this blocked?",
  avoidNote: "use library.relation.get to read relation state",
});

export function createLibraryRelationGetRegistration(
  input: CreateLibraryRelationRegistrationInput,
): StageToolRegistration {
  return registration(libraryRelationGetDescriptor, "get", input.control);
}

export function createLibraryRelationSaveRegistration(
  input: CreateLibraryRelationRegistrationInput,
): StageToolRegistration {
  return registration(libraryRelationSaveDescriptor, "save", input.control);
}

export function createLibraryRelationUnsaveRegistration(
  input: CreateLibraryRelationRegistrationInput,
): StageToolRegistration {
  return registration(libraryRelationUnsaveDescriptor, "unsave", input.control);
}

export function createLibraryRelationFavoriteRegistration(
  input: CreateLibraryRelationRegistrationInput,
): StageToolRegistration {
  return registration(libraryRelationFavoriteDescriptor, "favorite", input.control);
}

export function createLibraryRelationUnfavoriteRegistration(
  input: CreateLibraryRelationRegistrationInput,
): StageToolRegistration {
  return registration(libraryRelationUnfavoriteDescriptor, "unfavorite", input.control);
}

export function createLibraryRelationBlockRegistration(
  input: CreateLibraryRelationRegistrationInput,
): StageToolRegistration {
  return registration(libraryRelationBlockDescriptor, "block", input.control);
}

export function createLibraryRelationUnblockRegistration(
  input: CreateLibraryRelationRegistrationInput,
): StageToolRegistration {
  return registration(libraryRelationUnblockDescriptor, "unblock", input.control);
}

function editDescriptor(input: {
  action: LibraryRelationEdit;
  label: string;
  description: string;
  useWhen: string;
  doNotUseWhen: string;
  outputSemantics: string;
  callPrompt: string;
  avoidPrompt: string;
  avoidNote: string;
}): ToolDeclaration {
  return {
    name: `library.relation.${input.action}`,
    instrumentId: libraryRelationInstrument.id,
    label: input.label,
    ownerArea: "music_data_platform",
    description: input.description,
    usage: {
      useWhen: input.useWhen,
      doNotUseWhen: input.doNotUseWhen,
      outputSemantics: input.outputSemantics,
    },
    examples: [
      {
        prompt: input.callPrompt,
        expects: "call",
      },
      {
        prompt: input.avoidPrompt,
        expects: "avoid",
        note: input.avoidNote,
      },
    ],
    sideEffect: editSideEffect,
    invocationPolicy: editInvocationPolicy,
    ...commonInputOutput,
    errors: editErrors,
  };
}

function registration(
  descriptor: ToolDeclaration,
  edit: LibraryRelationEdit | "get",
  control: LibraryRelationControlPort,
): StageToolRegistration {
  return {
    descriptor,
    handler: (ctx, payload) => handleLibraryRelation(ctx, payload, edit, control),
  };
}

async function handleLibraryRelation(
  ctx: StageToolContext,
  payload: unknown,
  edit: LibraryRelationEdit | "get",
  control: LibraryRelationControlPort,
): Promise<Result<LibraryRelationStateOutput>> {
  const input = payload as LibraryRelationItemInput;
  const materialRefResult = await materialRefFromLibraryHandle(ctx, input.item.id);

  if (!materialRefResult.ok) {
    return materialRefResult;
  }

  try {
    const relations = edit === "get"
      ? control.getRelationState({
        ownerScope: ctx.ownerScope,
        materialRef: materialRefResult.value,
      })
      : control.editRelation({
        ownerScope: ctx.ownerScope,
        materialRef: materialRefResult.value,
        edit,
        now: ctx.clock(),
      });

    return {
      ok: true,
      value: { relations },
    };
  } catch (error) {
    if (isMusicDataPlatformError(error)) {
      return publicRelationError(error, edit);
    }
    throw error;
  }
}

async function materialRefFromLibraryHandle(
  ctx: StageToolContext,
  publicId: string,
): Promise<Result<Ref>> {
  const resolved = await ctx.handleMinting.resolve({
    ownerScope: ctx.ownerScope,
    handleKind: "library",
    publicId,
  });

  if (resolved === undefined) {
    return fail({
      code: "item_not_found",
      message: "Library item handle is unknown or no longer available.",
      retryable: true,
      suggestedFix: "Retry with a current library item handle, or look up and present the item again.",
    });
  }

  const materialRef = refFromResolvedAnchor(resolved);

  if (materialRef === undefined || !isLibraryMaterialRef(materialRef)) {
    return invalidInput("Library item handle did not resolve to a valid library material.");
  }

  return {
    ok: true,
    value: materialRef,
  };
}

function refFromResolvedAnchor(anchor: unknown): Ref | undefined {
  if (!isRecord(anchor)) {
    return undefined;
  }

  const value = anchor.materialRef;
  if (typeof value !== "string") {
    return undefined;
  }

  return parseRefKey(value);
}

function isLibraryMaterialRef(ref: Ref): boolean {
  return ref.namespace === "material" &&
    (
      ref.kind === "recording" ||
      ref.kind === "album" ||
      ref.kind === "artist"
    );
}

function publicRelationError(
  error: { code: string },
  edit: LibraryRelationEdit | "get",
): Result<never> {
  switch (error.code) {
    case "music_data.material_not_found":
      return fail({
        code: "item_not_found",
        message: "Library relation item was not found.",
        retryable: true,
        suggestedFix: "Retry with a current library item handle, or look up and present the item again.",
      });
    case "music_data.material_not_writable":
      if (edit === "get") {
        return fail({
          code: "item_not_found",
          message: "Library relation item was not found.",
          retryable: true,
          suggestedFix: "Retry with a current library item handle, or look up and present the item again.",
        });
      }

      return fail({
        code: "item_not_writable",
        message: "Library relation item cannot receive relation edits.",
        retryable: false,
        suggestedFix: "Retry with an active library item.",
      });
    case "music_data.owner_scope_unsupported":
      return fail({
        code: "owner_scope_unsupported",
        message: "Library relation operations currently support only the local owner scope.",
        retryable: false,
        suggestedFix: "Retry from the supported local owner scope.",
      });
    case "music_data.material_ref_invalid":
    case "music_data.owner_scope_invalid":
    case "music_data.owner_material_relation_invalid":
      return invalidInput("Library relation request is invalid.");
    default:
      throw new Error(`library.relation received unsupported Music Data Platform error code: ${error.code}`);
  }
}

function invalidInput(message: string): Result<never> {
  return fail({
    code: "invalid_input",
    message,
    retryable: false,
    suggestedFix: "Retry with item as a durable library MusicItemHandle. Present candidate items first with music.experience.present.",
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
