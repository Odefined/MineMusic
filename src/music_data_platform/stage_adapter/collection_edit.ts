import type { Ref, Result } from "../../contracts/kernel.js";
import { refKey } from "../../contracts/kernel.js";
import {
  libraryCollectionCreateInputSchema,
  libraryCollectionDeleteInputSchema,
  libraryCollectionGetInputSchema,
  libraryCollectionItemInputSchema,
  libraryCollectionMoveInputSchema,
  libraryCollectionRenameInputSchema,
  libraryCollectionStateOutputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import type {
  InstrumentDescriptor,
  LibraryCollectionCreateInput,
  LibraryCollectionDeleteInput,
  LibraryCollectionGetInput,
  LibraryCollectionItemInput,
  LibraryCollectionMoveInput,
  LibraryCollectionRenameInput,
  LibraryCollectionState,
  LibraryCollectionStateOutput,
  MusicItemHandle,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import {
  isMusicDataPlatformError,
  type CollectionKind,
  type LibraryCollectionServiceState,
} from "../index.js";
import type { LibraryCatalogScopeAvailabilityPort } from "./catalog.js";
import { collectionScopeId } from "./collection_scope.js";
import { resolveMaterialItemRef, stageEditFail } from "./library_handle_resolution.js";

// D9: the agent addresses a Collection by its catalog scope handle
// ({ kind:"collection", id }) from library.catalog.list_scopes. The handler
// resolves the scope id to a collectionRef via the scope-availability port,
// resolves item handles to materialRef via the handle-minting port, and veils
// the post-edit state (opaque scope handle, minted library item handles; no
// collectionRef/materialRef/position leaks). 24D surfaces only catalog-visible
// Collections (recording/album/artist/mixed); work/release carry no scope id.

export type LibraryCollectionControlPort = {
  getCollection(input: {
    ownerScope: string;
    collectionRef: Ref;
  }): Promise<LibraryCollectionServiceState>;
  createCollection(input: {
    ownerScope: string;
    collectionKind: CollectionKind;
    name: string;
    now: string;
  }): Promise<LibraryCollectionServiceState>;
  renameCollection(input: {
    ownerScope: string;
    collectionRef: Ref;
    name: string;
    now: string;
  }): Promise<LibraryCollectionServiceState>;
  addCollectionItem(input: {
    ownerScope: string;
    collectionRef: Ref;
    materialRef: Ref;
    now: string;
  }): Promise<LibraryCollectionServiceState>;
  removeCollectionItem(input: {
    ownerScope: string;
    collectionRef: Ref;
    materialRef: Ref;
    now: string;
  }): Promise<LibraryCollectionServiceState>;
  moveCollectionItem(input: {
    ownerScope: string;
    collectionRef: Ref;
    materialRef: Ref;
    toPosition: number;
    now: string;
  }): Promise<LibraryCollectionServiceState>;
  deleteCollection(input: {
    ownerScope: string;
    collectionRef: Ref;
    now: string;
  }): Promise<LibraryCollectionServiceState>;
};

export type CreateLibraryCollectionRegistrationInput = {
  control: LibraryCollectionControlPort;
  scopeAvailability: LibraryCatalogScopeAvailabilityPort;
};

export const libraryCollectionInstrument: InstrumentDescriptor = {
  id: "library.collection",
  label: "Library Collection",
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

const editSideEffect = {
  durableUserStateWrite: true,
  runtimeStateWrite: false,
  externalCall: false,
} as const;

// Gate posture is OPEN for write tools (mirrors the Phase-A music.experience
// write-tool gate question): collectionDrivenByUserRequest auto-allows a direct
// user request today; a future revision may require explicit approval.
const editInvocationPolicy = {
  defaultDecision: "auto",
  dataEgress: "none",
  readOnlyHint: false,
  destructiveHint: false,
  collectionDrivenByUserRequest: true,
} as const;

const getErrors = [
  {
    code: "invalid_input",
    retryable: false,
    suggestedFixTemplate: "Retry with a catalog-visible collection scope handle from library.catalog.list_scopes and a durable material item handle.",
  },
  {
    code: "collection_not_found",
    retryable: true,
    suggestedFixTemplate: "Retry with a current collection scope handle from library.catalog.list_scopes.",
  },
  {
    code: "scope_availability_failed",
    retryable: true,
    suggestedFixTemplate: "Retry later, or call library.catalog.list_scopes to inspect available collection scopes.",
  },
  {
    code: "owner_scope_unsupported",
    retryable: false,
    suggestedFixTemplate: "Retry from the supported local owner scope.",
  },
] as const;

const editErrors = [
  ...getErrors,
  {
    code: "item_not_found",
    retryable: true,
    suggestedFixTemplate: "Retry with a current library item handle, or look up and present the item again.",
  },
  {
    code: "collection_name_taken",
    retryable: false,
    suggestedFixTemplate: "Retry with a different collection name.",
  },
  {
    code: "item_not_writable",
    retryable: false,
    suggestedFixTemplate: "Retry with an active library item.",
  },
] as const;

const stateOutputSchema = { outputSchema: libraryCollectionStateOutputSchema };

function stateSummary(result: unknown): string {
  const output = result as LibraryCollectionStateOutput;
  const collection = output.collection;
  return `${collection.collection.itemCount} item(s) in collection '${collection.collection.name}'.`;
}

function readDescriptor(input: {
  name: string;
  label: string;
  description: string;
  useWhen: string;
  doNotUseWhen: string;
  outputSemantics: string;
  callPrompt: string;
  avoidPrompt: string;
  avoidNote: string;
  inputSchema: ToolDeclaration["inputSchema"];
}): ToolDeclaration {
  return {
    name: input.name,
    instrumentId: libraryCollectionInstrument.id,
    label: input.label,
    ownerArea: "music_data_platform",
    description: input.description,
    usage: {
      useWhen: input.useWhen,
      doNotUseWhen: input.doNotUseWhen,
      outputSemantics: input.outputSemantics,
    },
    examples: [
      { prompt: input.callPrompt, expects: "call" },
      { prompt: input.avoidPrompt, expects: "avoid", note: input.avoidNote },
    ],
    sideEffect: readOnlySideEffect,
    invocationPolicy: readOnlyInvocationPolicy,
    inputSchema: input.inputSchema,
    ...stateOutputSchema,
    errors: getErrors,
    resultSummary: stateSummary,
  };
}

function editDescriptor(input: {
  name: string;
  label: string;
  description: string;
  useWhen: string;
  doNotUseWhen: string;
  outputSemantics: string;
  callPrompt: string;
  avoidPrompt: string;
  avoidNote: string;
  inputSchema: ToolDeclaration["inputSchema"];
}): ToolDeclaration {
  return {
    name: input.name,
    instrumentId: libraryCollectionInstrument.id,
    label: input.label,
    ownerArea: "music_data_platform",
    description: input.description,
    usage: {
      useWhen: input.useWhen,
      doNotUseWhen: input.doNotUseWhen,
      outputSemantics: input.outputSemantics,
    },
    examples: [
      { prompt: input.callPrompt, expects: "call" },
      { prompt: input.avoidPrompt, expects: "avoid", note: input.avoidNote },
    ],
    sideEffect: editSideEffect,
    invocationPolicy: editInvocationPolicy,
    inputSchema: input.inputSchema,
    ...stateOutputSchema,
    errors: editErrors,
    resultSummary: stateSummary,
  };
}

export const libraryCollectionGetDescriptor = readDescriptor({
  name: "library.collection.get",
  label: "Get Library Collection",
  description: "Read one MineMusic library Collection's current state and members without editing it.",
  useWhen: "Use when the user or agent needs to know the name, kind, and member items of a durable library Collection.",
  doNotUseWhen: "Do not use to browse a Collection's catalog rows (use library.catalog.browse with the collection scope), edit membership, or create/rename/delete a Collection.",
  outputSemantics: "Returns the Collection's scope handle, name, kind, item count, and a position-ordered list of member item handles; it does not expose collection refs, material refs, or positions.",
  callPrompt: "what's in my Favorites collection?",
  avoidPrompt: "browse the songs in this collection",
  avoidNote: "use library.catalog.browse with the collection scope to browse catalog rows",
  inputSchema: libraryCollectionGetInputSchema,
});

export const libraryCollectionCreateDescriptor = editDescriptor({
  name: "library.collection.create",
  label: "Create Library Collection",
  description: "Create a new MineMusic library Collection with a name and a catalog-visible kind (recording, album, artist, or mixed).",
  useWhen: "Use when the user explicitly asks to create a new named Collection to organize library items.",
  doNotUseWhen: "Do not use to rename an existing Collection, edit membership, or create work/release Collections (catalog-invisible, not agent-addressable).",
  outputSemantics: "Creates the Collection and returns its post-create state (scope handle, name, kind, empty item list).",
  callPrompt: "create a collection called Favorites for recordings",
  avoidPrompt: "rename my Favorites collection",
  avoidNote: "use library.collection.rename to change a name",
  inputSchema: libraryCollectionCreateInputSchema,
});

export const libraryCollectionRenameDescriptor = editDescriptor({
  name: "library.collection.rename",
  label: "Rename Library Collection",
  description: "Rename one MineMusic library Collection.",
  useWhen: "Use when the user explicitly asks to rename a durable library Collection.",
  doNotUseWhen: "Do not use to create a new Collection, edit membership, or delete a Collection.",
  outputSemantics: "Updates the name and returns the post-rename Collection state.",
  callPrompt: "rename my Favorites collection to Top Picks",
  avoidPrompt: "create a new collection",
  avoidNote: "use library.collection.create for new Collections",
  inputSchema: libraryCollectionRenameInputSchema,
});

export const libraryCollectionAddDescriptor = editDescriptor({
  name: "library.collection.add",
  label: "Add Library Collection Item",
  description: "Add one MineMusic library item to a Collection.",
  useWhen: "Use when the user explicitly asks to add a durable material item to a named Collection.",
  doNotUseWhen: "Do not use to remove an item, reorder, or add provider items not yet admitted to the library.",
  outputSemantics: "Appends the item (kind must match the Collection, or the Collection must be mixed) and returns the post-add state.",
  callPrompt: "add this track to my Favorites collection",
  avoidPrompt: "remove this from Favorites",
  avoidNote: "use library.collection.remove to take items out",
  inputSchema: libraryCollectionItemInputSchema,
});

export const libraryCollectionRemoveDescriptor = editDescriptor({
  name: "library.collection.remove",
  label: "Remove Library Collection Item",
  description: "Remove one MineMusic library item from a Collection.",
  useWhen: "Use when the user explicitly asks to remove a durable material item from a named Collection.",
  doNotUseWhen: "Do not use to add an item, reorder, or delete the Collection.",
  outputSemantics: "Soft-removes the item if it is a member; re-removing an already-removed member is a no-op. Returns the post-remove state.",
  callPrompt: "remove this track from my Favorites collection",
  avoidPrompt: "delete the whole collection",
  avoidNote: "use library.collection.delete to remove a Collection",
  inputSchema: libraryCollectionItemInputSchema,
});

export const libraryCollectionMoveDescriptor = editDescriptor({
  name: "library.collection.move",
  label: "Move Library Collection Item",
  description: "Reorder one item within a MineMusic library Collection to a 1-based target position.",
  useWhen: "Use when the user explicitly asks to reorder an item within a named Collection.",
  doNotUseWhen: "Do not use to add or remove items, or to reorder across Collections.",
  outputSemantics: "Moves the item and rebalances positions to consecutive integers (D4); returns the post-move state ordered by position.",
  callPrompt: "move this track to position 1 in my Favorites collection",
  avoidPrompt: "add a track",
  avoidNote: "use library.collection.add to add items",
  inputSchema: libraryCollectionMoveInputSchema,
});

export const libraryCollectionDeleteDescriptor = editDescriptor({
  name: "library.collection.delete",
  label: "Delete Library Collection",
  description: "Soft-remove one MineMusic library Collection.",
  useWhen: "Use when the user explicitly asks to delete or remove a whole named Collection.",
  doNotUseWhen: "Do not use to remove a single item (use library.collection.remove), rename, or edit provider-side data.",
  outputSemantics: "Soft-removes the Collection and returns the post-delete state; its scope handle is no longer listed by library.catalog.list_scopes after deletion.",
  callPrompt: "delete my Favorites collection",
  avoidPrompt: "remove one track from Favorites",
  avoidNote: "use library.collection.remove to take a single item out",
  inputSchema: libraryCollectionDeleteInputSchema,
});

export function createLibraryCollectionGetRegistration(
  input: CreateLibraryCollectionRegistrationInput,
): StageToolRegistration {
  return { descriptor: libraryCollectionGetDescriptor, handler: (ctx, payload) => handleGet(ctx, payload, input) };
}

export function createLibraryCollectionCreateRegistration(
  input: CreateLibraryCollectionRegistrationInput,
): StageToolRegistration {
  return { descriptor: libraryCollectionCreateDescriptor, handler: (ctx, payload) => handleCreate(ctx, payload, input) };
}

export function createLibraryCollectionRenameRegistration(
  input: CreateLibraryCollectionRegistrationInput,
): StageToolRegistration {
  return { descriptor: libraryCollectionRenameDescriptor, handler: (ctx, payload) => handleRename(ctx, payload, input) };
}

export function createLibraryCollectionAddRegistration(
  input: CreateLibraryCollectionRegistrationInput,
): StageToolRegistration {
  return { descriptor: libraryCollectionAddDescriptor, handler: (ctx, payload) => handleAdd(ctx, payload, input) };
}

export function createLibraryCollectionRemoveRegistration(
  input: CreateLibraryCollectionRegistrationInput,
): StageToolRegistration {
  return { descriptor: libraryCollectionRemoveDescriptor, handler: (ctx, payload) => handleRemove(ctx, payload, input) };
}

export function createLibraryCollectionMoveRegistration(
  input: CreateLibraryCollectionRegistrationInput,
): StageToolRegistration {
  return { descriptor: libraryCollectionMoveDescriptor, handler: (ctx, payload) => handleMove(ctx, payload, input) };
}

export function createLibraryCollectionDeleteRegistration(
  input: CreateLibraryCollectionRegistrationInput,
): StageToolRegistration {
  return { descriptor: libraryCollectionDeleteDescriptor, handler: (ctx, payload) => handleDelete(ctx, payload, input) };
}

async function handleGet(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCollectionRegistrationInput,
): Promise<Result<LibraryCollectionStateOutput>> {
  const input = payload as LibraryCollectionGetInput;
  const resolved = await resolveCollectionRef(ctx, ports.scopeAvailability, input.collection.id);
  if (!resolved.ok) {
    return resolved;
  }
  return runAndVeil(ctx, () =>
    ports.control.getCollection({ ownerScope: ctx.ownerScope, collectionRef: resolved.value }),
  );
}

async function handleCreate(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCollectionRegistrationInput,
): Promise<Result<LibraryCollectionStateOutput>> {
  const input = payload as LibraryCollectionCreateInput;
  try {
    const state = await ports.control.createCollection({
      ownerScope: ctx.ownerScope,
      collectionKind: input.collectionKind,
      name: input.name,
      now: ctx.clock(),
    });
    return await veilCollectionState(ctx, state);
  } catch (error) {
    return publicCollectionError(error);
  }
}

async function handleRename(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCollectionRegistrationInput,
): Promise<Result<LibraryCollectionStateOutput>> {
  const input = payload as LibraryCollectionRenameInput;
  const resolved = await resolveCollectionRef(ctx, ports.scopeAvailability, input.collection.id);
  if (!resolved.ok) {
    return resolved;
  }
  return runAndVeil(ctx, () =>
    ports.control.renameCollection({ ownerScope: ctx.ownerScope, collectionRef: resolved.value, name: input.name, now: ctx.clock() }),
  );
}

async function handleAdd(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCollectionRegistrationInput,
): Promise<Result<LibraryCollectionStateOutput>> {
  return handleItemEdit(ctx, payload, ports, (collectionRef, materialRef, now) =>
    ports.control.addCollectionItem({ ownerScope: ctx.ownerScope, collectionRef, materialRef, now }),
  );
}

async function handleRemove(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCollectionRegistrationInput,
): Promise<Result<LibraryCollectionStateOutput>> {
  return handleItemEdit(ctx, payload, ports, (collectionRef, materialRef, now) =>
    ports.control.removeCollectionItem({ ownerScope: ctx.ownerScope, collectionRef, materialRef, now }),
  );
}

async function handleMove(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCollectionRegistrationInput,
): Promise<Result<LibraryCollectionStateOutput>> {
  const input = payload as LibraryCollectionMoveInput;
  if (!Number.isSafeInteger(input.toPosition) || input.toPosition < 1) {
    return invalidInput("Move target position must be a positive integer (1-based).");
  }
  return handleItemEdit(ctx, payload, ports, (collectionRef, materialRef, now) =>
    ports.control.moveCollectionItem({ ownerScope: ctx.ownerScope, collectionRef, materialRef, toPosition: input.toPosition, now }),
  );
}

async function handleDelete(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCollectionRegistrationInput,
): Promise<Result<LibraryCollectionStateOutput>> {
  const input = payload as LibraryCollectionDeleteInput;
  const resolved = await resolveCollectionRef(ctx, ports.scopeAvailability, input.collection.id);
  if (!resolved.ok) {
    return resolved;
  }
  return runAndVeil(ctx, () =>
    ports.control.deleteCollection({ ownerScope: ctx.ownerScope, collectionRef: resolved.value, now: ctx.clock() }),
  );
}

async function handleItemEdit(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateLibraryCollectionRegistrationInput,
  apply: (collectionRef: Ref, materialRef: Ref, now: string) => Promise<LibraryCollectionServiceState>,
): Promise<Result<LibraryCollectionStateOutput>> {
  const input = payload as LibraryCollectionItemInput;
  const resolvedCollection = await resolveCollectionRef(ctx, ports.scopeAvailability, input.collection.id);
  if (!resolvedCollection.ok) {
    return resolvedCollection;
  }
  const materialRefResult = await resolveMaterialItemRef(ctx, input.item.id, "Retry with a catalog-visible collection scope handle from library.catalog.list_scopes and a durable material item handle.");
  if (!materialRefResult.ok) {
    return materialRefResult;
  }
  return runAndVeil(ctx, () => apply(resolvedCollection.value, materialRefResult.value, ctx.clock()));
}

async function runAndVeil(
  ctx: StageToolContext,
  run: () => Promise<LibraryCollectionServiceState>,
): Promise<Result<LibraryCollectionStateOutput>> {
  try {
    const state = await run();
    return await veilCollectionState(ctx, state);
  } catch (error) {
    return publicCollectionError(error);
  }
}

async function resolveCollectionRef(
  ctx: StageToolContext,
  scopeAvailability: LibraryCatalogScopeAvailabilityPort,
  scopeId: string,
): Promise<Result<Ref>> {
  const availability = await scopeAvailability.listCatalogScopes({ ownerScope: ctx.ownerScope });
  if (!availability.ok) {
    return scopeAvailabilityFailedAsResult();
  }
  const collection = availability.value.collections.find((scope) => scope.id === scopeId);
  if (collection === undefined) {
    return stageEditFail({
      code: "collection_not_found",
      message: "Library collection scope handle was not found.",
      retryable: true,
      suggestedFix: "Retry with a current collection scope handle from library.catalog.list_scopes.",
    });
  }
  return { ok: true, value: collection.ref };
}

async function veilCollectionState(
  ctx: StageToolContext,
  state: LibraryCollectionServiceState,
): Promise<Result<LibraryCollectionStateOutput>> {
  const items: { item: Extract<MusicItemHandle, { kind: "material" }> }[] = await Promise.all(
    state.items.map(async (item) => {
      const publicId = await ctx.handleMinting.mint({
        ownerScope: ctx.ownerScope,
        handleKind: "material",
        internalAnchor: { materialRef: refKey(item.materialRef) },
      });
      return { item: { kind: "material", id: publicId } };
    }),
  );

  // The scope id is computed (not read from availability) so post-edit state is
  // veiled even for a soft-removed Collection (delete) or a catalog-invisible
  // one — the id is deterministic from the collectionRefKey.
  const collection: LibraryCollectionState = {
    collection: {
      scope: { kind: "collection", id: collectionScopeId(state.collection.collectionRefKey) },
      name: state.collection.name,
      collectionKind: libraryCollectionKind(state.collection.collectionKind),
      itemCount: state.items.length,
    },
    items,
  };

  return { ok: true, value: { collection } };
}

function libraryCollectionKind(kind: CollectionKind): LibraryCollectionState["collection"]["collectionKind"] {
  if (kind === "recording" || kind === "album" || kind === "artist" || kind === "mixed") {
    return kind;
  }
  // Work/release collections are catalog-invisible (D7) and carry no scope id,
  // so they never reach the veiled state path (the scope lookup above fails
  // first). If one somehow arrives, that is a broken invariant, not a fallback.
  throw new Error(`Catalog-invisible collection kind reached agent state output: ${kind}.`);
}

function publicCollectionError(error: unknown): Result<never> {
  if (!isMusicDataPlatformError(error)) {
    throw error;
  }
  switch (error.code) {
    case "music_data.collection_not_found":
      return stageEditFail({
        code: "collection_not_found",
        message: "Library collection was not found.",
        retryable: true,
        suggestedFix: "Retry with a current collection scope handle from library.catalog.list_scopes.",
      });
    case "music_data.collection_item_not_found":
    case "music_data.material_not_found":
      return stageEditFail({
        code: "item_not_found",
        message: "Library collection item was not found.",
        retryable: true,
        suggestedFix: "Retry with a current library item handle, or look up and present the item again.",
      });
    case "music_data.material_not_writable":
      return stageEditFail({
        code: "item_not_writable",
        message: "Library collection item cannot receive edits.",
        retryable: false,
        suggestedFix: "Retry with an active library item.",
      });
    case "music_data.collection_name_taken":
      return stageEditFail({
        code: "collection_name_taken",
        message: "Library collection name is already taken.",
        retryable: false,
        suggestedFix: "Retry with a different collection name.",
      });
    case "music_data.owner_scope_unsupported":
      return stageEditFail({
        code: "owner_scope_unsupported",
        message: "Library collection operations currently support only the local owner scope.",
        retryable: false,
        suggestedFix: "Retry from the supported local owner scope.",
      });
    case "music_data.collection_ref_invalid":
    case "music_data.collection_invalid":
    case "music_data.collection_owner_scope_mismatch":
    case "music_data.collection_kind_mismatch":
    case "music_data.owner_scope_invalid":
    case "music_data.material_ref_invalid":
      return invalidInput("Library collection request is invalid.");
    default:
      throw new Error(
        `library.collection received unsupported Music Data Platform error code: ${error.code}`,
        { cause: error },
      );
  }
}

function scopeAvailabilityFailedAsResult(): Result<never> {
  return stageEditFail({
    code: "scope_availability_failed",
    message: "Library collection scope availability could not be read.",
    retryable: true,
    suggestedFix: "Retry later, or call library.catalog.list_scopes to inspect available collection scopes.",
  });
}

function invalidInput(message: string): Result<never> {
  return stageEditFail({
    code: "invalid_input",
    message,
    retryable: false,
    suggestedFix: "Retry with a catalog-visible collection scope handle from library.catalog.list_scopes and a durable material item handle.",
  });
}
