import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  repositoryRoot,
  "src/contracts/generated/stage_interface_schemas.ts",
);
const checkMode = process.argv.includes("--check");
const musicExperienceContractSource = await readFile(
  resolve(repositoryRoot, "src/contracts/music_experience.ts"),
  "utf8",
);
const agentRuntimeContractSource = await readFile(
  resolve(repositoryRoot, "src/contracts/agent_runtime.ts"),
  "utf8",
);

function readNumericExport(source, sourcePath, name) {
  const match = new RegExp(`export const ${name} = (\\d+);`).exec(source);
  if (match === null) {
    throw new Error(`Could not read numeric export ${name} from ${sourcePath}.`);
  }
  return Number.parseInt(match[1], 10);
}

const schemaTargets = [
  {
    exportName: "stageRuntimeStatusInputSchema",
    typeName: "StageRuntimeStatusInput",
    sourcePath: "src/stage_core/runtime_status.ts",
  },
  {
    exportName: "runtimeStatusToolOutputSchema",
    typeName: "RuntimeStatusToolOutput",
    sourcePath: "src/stage_core/runtime_status.ts",
  },
  {
    exportName: "musicScopeSchema",
    typeName: "MusicScope",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "musicItemHandleSchema",
    typeName: "MusicItemHandle",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "musicCardSchema",
    typeName: "MusicCard",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "musicExperiencePresentInputSchema",
    typeName: "MusicExperiencePresentInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "musicExperiencePresentOutputSchema",
    typeName: "MusicExperiencePresentOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "playbackQueueAppendInputSchema",
    typeName: "PlaybackQueueAppendInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "playbackQueueAppendOutputSchema",
    typeName: "PlaybackQueueAppendOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "playbackQueueRemoveInputSchema",
    typeName: "PlaybackQueueRemoveInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "playbackQueueReplaceInputSchema",
    typeName: "PlaybackQueueReplaceInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "playbackQueueMoveInputSchema",
    typeName: "PlaybackQueueMoveInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "playbackQueueClearInputSchema",
    typeName: "PlaybackQueueClearInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "playbackQueueEditOutputSchema",
    typeName: "PlaybackQueueEditOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "playbackQueueReplaceOutputSchema",
    typeName: "PlaybackQueueReplaceOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioMotifSetInputSchema",
    typeName: "RadioMotifSetInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioMotifClearInputSchema",
    typeName: "RadioMotifClearInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioVariationsAddInputSchema",
    typeName: "RadioVariationsAddInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioVariationsRemoveInputSchema",
    typeName: "RadioVariationsRemoveInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioVariationsReplaceInputSchema",
    typeName: "RadioVariationsReplaceInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioVariationsMoveInputSchema",
    typeName: "RadioVariationsMoveInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioVariationsClearInputSchema",
    typeName: "RadioVariationsClearInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioLeanAddInputSchema",
    typeName: "RadioLeanAddInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioLeanRemoveInputSchema",
    typeName: "RadioLeanRemoveInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioLeanReplaceInputSchema",
    typeName: "RadioLeanReplaceInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioLeanMoveInputSchema",
    typeName: "RadioLeanMoveInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioLeanClearInputSchema",
    typeName: "RadioLeanClearInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioDirectionToolOutputSchema",
    typeName: "RadioDirectionToolOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioLeanToolOutputSchema",
    typeName: "RadioLeanToolOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "musicExperiencePlaybackPlayInputSchema",
    typeName: "MusicExperiencePlaybackPlayInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "musicExperiencePlaybackPlayOutputSchema",
    typeName: "MusicExperiencePlaybackPlayOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioSessionStartInputSchema",
    typeName: "RadioSessionStartInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioSessionPauseInputSchema",
    typeName: "RadioSessionPauseInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioSessionShutdownInputSchema",
    typeName: "RadioSessionShutdownInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioSessionResumeInputSchema",
    typeName: "RadioSessionResumeInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioSessionToolOutputSchema",
    typeName: "RadioSessionToolOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "radioRunFinishInputSchema",
    typeName: "RadioRunFinishInput",
    sourcePath: "src/contracts/agent_runtime.ts",
  },
  {
    exportName: "radioRunFinishOutputSchema",
    typeName: "RadioRunFinishOutput",
    sourcePath: "src/contracts/agent_runtime.ts",
  },
  {
    exportName: "musicDiscoveryLookupInputSchema",
    typeName: "MusicDiscoveryLookupInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "musicListScopesInputSchema",
    typeName: "MusicListScopesInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "musicListScopesOutputSchema",
    typeName: "MusicListScopesOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCatalogListScopesInputSchema",
    typeName: "LibraryCatalogListScopesInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCatalogListScopesOutputSchema",
    typeName: "LibraryCatalogListScopesOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCatalogBrowseInputSchema",
    typeName: "LibraryCatalogBrowseInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCatalogBrowseOutputSchema",
    typeName: "LibraryCatalogBrowseOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCatalogSampleInputSchema",
    typeName: "LibraryCatalogSampleInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCatalogSampleOutputSchema",
    typeName: "LibraryCatalogSampleOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCatalogSummaryInputSchema",
    typeName: "LibraryCatalogSummaryInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCatalogSummaryOutputSchema",
    typeName: "LibraryCatalogSummaryOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryImportListSourcesInputSchema",
    typeName: "LibraryImportListSourcesInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryImportListSourcesOutputSchema",
    typeName: "LibraryImportListSourcesOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryImportStartInputSchema",
    typeName: "LibraryImportStartInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryImportStatusInputSchema",
    typeName: "LibraryImportStatusInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryImportDriveOutputSchema",
    typeName: "LibraryImportDriveOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryImportStatusOutputSchema",
    typeName: "LibraryImportStatusOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryRelationItemInputSchema",
    typeName: "LibraryRelationItemInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryRelationStateOutputSchema",
    typeName: "LibraryRelationStateOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCollectionCreateInputSchema",
    typeName: "LibraryCollectionCreateInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCollectionGetInputSchema",
    typeName: "LibraryCollectionGetInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCollectionRenameInputSchema",
    typeName: "LibraryCollectionRenameInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCollectionItemInputSchema",
    typeName: "LibraryCollectionItemInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCollectionMoveInputSchema",
    typeName: "LibraryCollectionMoveInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCollectionDeleteInputSchema",
    typeName: "LibraryCollectionDeleteInput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "libraryCollectionStateOutputSchema",
    typeName: "LibraryCollectionStateOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
  {
    exportName: "musicDiscoveryLookupOutputSchema",
    typeName: "MusicDiscoveryLookupOutput",
    sourcePath: "src/contracts/stage_interface.ts",
  },
];

const generators = new Map();

function generatorFor(sourcePath) {
  let generator = generators.get(sourcePath);
  if (generator === undefined) {
    generator = createGenerator({
      path: resolve(repositoryRoot, sourcePath),
      tsconfig: resolve(repositoryRoot, "tsconfig.json"),
      expose: "export",
      topRef: true,
      jsDoc: "extended",
      sortProps: true,
      additionalProperties: false,
      skipTypeCheck: false,
    });
    generators.set(sourcePath, generator);
  }
  return generator;
}

const TOOL_LIMIT_CONSTRAINT = { type: "integer", minimum: 1, maximum: 100 };
const NON_EMPTY_STRING_CONSTRAINT = { type: "string", minLength: 1 };
const RADIO_ACTIVE_VARIATION_ITEMS_MAX = readNumericExport(
  musicExperienceContractSource,
  "src/contracts/music_experience.ts",
  "MAX_RADIO_ACTIVE_VARIATION_ITEMS",
);
const RADIO_POSTURE_LEAN_ITEMS_MAX = readNumericExport(
  musicExperienceContractSource,
  "src/contracts/music_experience.ts",
  "MAX_RADIO_POSTURE_LEAN_ITEMS",
);
const RADIO_DIRECTION_TEXT_MAX_LENGTH = readNumericExport(
  musicExperienceContractSource,
  "src/contracts/music_experience.ts",
  "MAX_RADIO_DIRECTION_TEXT_LENGTH",
);
const MUSIC_EXPERIENCE_QUEUE_LENGTH_MAX = readNumericExport(
  musicExperienceContractSource,
  "src/contracts/music_experience.ts",
  "MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH",
);
const RADIO_TERMINAL_DECLARATION_TEXT_MAX_LENGTH = readNumericExport(
  agentRuntimeContractSource,
  "src/contracts/agent_runtime.ts",
  "RADIO_TERMINAL_DECLARATION_TEXT_MAX_LENGTH",
);
const MATERIAL_MUSIC_ITEM_HANDLE_CONSTRAINT = {
  type: "string",
  pattern: "^\\[material:[^\\]\\r\\n]+\\]$",
};
const CANDIDATE_MUSIC_ITEM_HANDLE_CONSTRAINT = {
  type: "string",
  pattern: "^\\[candidate:[^\\]\\r\\n]+\\]$",
};
const MUSIC_ABSTRACT_SCOPE_HANDLE_CONSTRAINT = {
  enum: ["[all]", "[library]"],
};
const MUSIC_LIBRARY_SCOPE_HANDLE_CONSTRAINT = {
  type: "string",
  pattern: "^\\[(source_library|relation|collection):[^\\]\\r\\n]+\\]$",
};
const MUSIC_PROVIDER_SCOPE_HANDLE_CONSTRAINT = {
  type: "string",
  pattern: "^\\[provider:[^\\]\\r\\n]+\\]$",
};
const LIBRARY_CATALOG_SCOPE_CONSTRAINT = {
  type: "string",
  pattern: "^\\[(library|source_library:[^\\]\\r\\n]+|relation:[^\\]\\r\\n]+|collection:[^\\]\\r\\n]+)\\]$",
};
const LIBRARY_COLLECTION_SCOPE_HANDLE_CONSTRAINT = {
  type: "string",
  pattern: "^\\[collection:[^\\]\\r\\n]+\\]$",
};

// The TS source declares `limit?: number`, which the generator faithfully transcribes as
// { type: "number" }. Lookup and library-import handlers enforce integer 1..100, so
// surface that bound in the agent-facing schemas by overlaying every relevant `limit`.
function applyToolLimitOverlay(schema) {
  applyNumericPropertyOverlay(schema, "limit");
}

// Recurses every node in the schema and, where `properties[propertyName]`
// matches, replaces it with `mutate(current)`. Shared by the numeric/integer/
// non-empty-string overlays so the traversal cannot drift between them.
function overlayProperty(schema, propertyName, matches, mutate) {
  if (schema === null || typeof schema !== "object") {
    return;
  }
  if (Array.isArray(schema)) {
    for (const node of schema) {
      overlayProperty(node, propertyName, matches, mutate);
    }
    return;
  }
  const current = schema.properties === undefined ? undefined : schema.properties[propertyName];
  if (current !== undefined && typeof current === "object" && current !== null && matches(current)) {
    schema.properties[propertyName] = mutate(current);
  }
  for (const child of Object.values(schema)) {
    overlayProperty(child, propertyName, matches, mutate);
  }
}

function applyNumericPropertyOverlay(schema, propertyName) {
  overlayProperty(
    schema,
    propertyName,
    (node) => node.type === "number",
    () => ({ ...TOOL_LIMIT_CONSTRAINT }),
  );
}

function applyIntegerPropertyOverlay(schema, propertyName) {
  overlayProperty(
    schema,
    propertyName,
    (node) => node.type === "number",
    (node) => ({ ...node, type: "integer" }),
  );
}

function applyQueueIndexIntegerOverlay(schema, propertyName) {
  overlayProperty(
    schema,
    propertyName,
    (node) => node.type === "number",
    (node) => ({
      ...node,
      type: "integer",
      minimum: 0,
      maximum: MUSIC_EXPERIENCE_QUEUE_LENGTH_MAX - 1,
    }),
  );
}

function applyRadioIndexIntegerOverlays(schema) {
  applyIntegerPropertyOverlay(schema, "at");
  applyIntegerPropertyOverlay(schema, "index");
  applyIntegerPropertyOverlay(schema, "from");
  applyIntegerPropertyOverlay(schema, "to");
}

function applyQueueIndexIntegerOverlays(schema) {
  applyQueueIndexIntegerOverlay(schema, "index");
  applyQueueIndexIntegerOverlay(schema, "from");
  applyQueueIndexIntegerOverlay(schema, "to");
}

function applyNonEmptyStringPropertyOverlay(schema, propertyName) {
  overlayProperty(
    schema,
    propertyName,
    (node) => node.type === "string" && node.minLength === undefined,
    () => ({ ...NON_EMPTY_STRING_CONSTRAINT }),
  );
}

function applyMaxLengthStringPropertyOverlay(schema, propertyName, maxLength) {
  overlayProperty(
    schema,
    propertyName,
    (node) => node.type === "string",
    (node) => ({ ...node, maxLength }),
  );
}

function applyMaxItemsPropertyOverlay(schema, propertyName, maxItems) {
  overlayProperty(
    schema,
    propertyName,
    (node) => node.type === "array",
    (node) => ({ ...node, maxItems }),
  );
}

function applyRadioDirectionBoundOverlays(schema) {
  applyMaxLengthStringPropertyOverlay(schema, "text", RADIO_DIRECTION_TEXT_MAX_LENGTH);
  applyMaxItemsPropertyOverlay(schema, "activeVariations", RADIO_ACTIVE_VARIATION_ITEMS_MAX);
  applyMaxItemsPropertyOverlay(schema, "lean", RADIO_POSTURE_LEAN_ITEMS_MAX);
}

function applyRadioRunFinishBoundOverlays(schema) {
  applyMaxLengthStringPropertyOverlay(schema, "summary", RADIO_TERMINAL_DECLARATION_TEXT_MAX_LENGTH);
  applyMaxLengthStringPropertyOverlay(schema, "rationale", RADIO_TERMINAL_DECLARATION_TEXT_MAX_LENGTH);
}

const NON_EMPTY_LIBRARY_IMPORT_BATCH_ID_DEFINITIONS = new Set([
  "LibraryImportStatusInput",
]);

// Status batch ids are structural input handles for an existing batch. Keep the
// non-empty check at the schema gate so handlers do not need to duplicate shape
// validation before reading the batch.
function applyLibraryImportBatchIdNonEmptyOverlay(schema) {
  const definitions = schema?.definitions;
  if (definitions === null || typeof definitions !== "object") {
    return;
  }
  for (const [name, def] of Object.entries(definitions)) {
    if (
      !NON_EMPTY_LIBRARY_IMPORT_BATCH_ID_DEFINITIONS.has(name) ||
      def === null ||
      typeof def !== "object" ||
      def.properties === undefined
    ) {
      continue;
    }
    const batchId = def.properties.batchId;
    if (
      batchId !== null &&
      typeof batchId === "object" &&
      batchId.type === "string" &&
      batchId.minLength === undefined
    ) {
      def.properties.batchId = { ...NON_EMPTY_STRING_CONSTRAINT };
    }
  }
}

function applyMusicItemHandlePatternOverlay(schema) {
  const definitions = schema?.definitions;
  if (definitions === null || typeof definitions !== "object") {
    return;
  }
  if (definitions.MaterialMusicItemHandle !== undefined) {
    definitions.MaterialMusicItemHandle = {
      ...MATERIAL_MUSIC_ITEM_HANDLE_CONSTRAINT,
      description: 'Durable material item handle. Pass the whole bracket string unchanged, e.g. "[material:mh_...]".',
    };
  }
  if (definitions.CandidateMusicItemHandle !== undefined) {
    definitions.CandidateMusicItemHandle = {
      ...CANDIDATE_MUSIC_ITEM_HANDLE_CONSTRAINT,
      description: 'Provider candidate item handle. Pass the whole bracket string unchanged, e.g. "[candidate:...]".',
    };
  }
}

function applyMusicScopeHandlePatternOverlay(schema) {
  const definitions = schema?.definitions;
  if (definitions === null || typeof definitions !== "object") {
    return;
  }
  if (definitions.MusicAbstractScopeHandle !== undefined) {
    definitions.MusicAbstractScopeHandle = {
      ...MUSIC_ABSTRACT_SCOPE_HANDLE_CONSTRAINT,
      description: 'Abstract music scope handle. Pass the whole bracket string unchanged: "[all]" or "[library]".',
    };
  }
  if (definitions.MusicLibraryScopeHandle !== undefined) {
    definitions.MusicLibraryScopeHandle = {
      ...MUSIC_LIBRARY_SCOPE_HANDLE_CONSTRAINT,
      description: 'Library-backed music scope handle. Pass the whole bracket string unchanged, e.g. "[source_library:...]", "[relation:...]", or "[collection:...]".',
    };
  }
  if (definitions.MusicProviderScopeHandle !== undefined) {
    definitions.MusicProviderScopeHandle = {
      ...MUSIC_PROVIDER_SCOPE_HANDLE_CONSTRAINT,
      description: 'Provider music scope handle. Pass the whole bracket string unchanged, e.g. "[provider:netease]".',
    };
  }
  if (definitions.LibraryCatalogScope !== undefined) {
    definitions.LibraryCatalogScope = {
      ...LIBRARY_CATALOG_SCOPE_CONSTRAINT,
      description: 'Catalog scope handle. Pass the whole bracket string unchanged, e.g. "[library]", "[source_library:...]", "[relation:...]", or "[collection:...]".',
    };
  }
  if (definitions.LibraryCatalogScopeInput !== undefined) {
    definitions.LibraryCatalogScopeInput = {
      $ref: "#/definitions/LibraryCatalogScope",
    };
  }
  if (definitions.LibraryCollectionScopeHandle !== undefined) {
    definitions.LibraryCollectionScopeHandle = {
      ...LIBRARY_COLLECTION_SCOPE_HANDLE_CONSTRAINT,
      description: 'Collection scope handle. Pass the whole bracket string unchanged, e.g. "[collection:...]".',
    };
  }
}

// MCP and OpenAI-style function tools require the exposed input schema root to
// be a JSON Schema object, and the Anthropic API rejects top-level composition
// keywords (oneOf/anyOf/allOf). `MusicDiscoveryLookupInput` is a TS union of
// two object inputs (first-page vs cursor-page); the generator emits that as a
// top-level anyOf, which is valid JSON Schema but has no root `type`. Hoist
// the union's branch properties into a single object-root schema. The mutually
// exclusive first-page vs cursor-page contract is intentionally NOT expressed
// with a top-level oneOf here (the Anthropic API would reject it, and does not
// enforce composition keywords anyway); the lookup handler owns that field-
// isolation guard instead.
function applyMusicDiscoveryLookupObjectRootOverlay(schema) {
  const definitions = schema?.definitions;
  const def = definitions?.MusicDiscoveryLookupInput;
  if (definitions === null || typeof definitions !== "object" || def === null || typeof def !== "object") {
    throw new Error("MusicDiscoveryLookupInput schema definition is missing.");
  }
  if (!Array.isArray(def.anyOf)) {
    throw new Error("MusicDiscoveryLookupInput is expected to be generated as an anyOf union.");
  }

  const firstPage = findObjectUnionBranch(def.anyOf, "lookupText");
  const cursorPage = findObjectUnionBranch(def.anyOf, "cursor");

  const properties = {
    lookupText: requireGeneratedProperty(firstPage, "lookupText"),
    targetKind: requireGeneratedProperty(firstPage, "targetKind"),
    scopes: requireGeneratedProperty(firstPage, "scopes"),
    cursor: requireGeneratedProperty(cursorPage, "cursor"),
    limit: requireGeneratedProperty(firstPage, "limit"),
  };

  delete definitions.MusicDiscoveryLookupInput;

  const schemaUri = schema.$schema;
  for (const key of Object.keys(schema)) {
    delete schema[key];
  }

  Object.assign(schema, {
    "$schema": schemaUri,
    type: "object",
    properties,
    additionalProperties: false,
    definitions,
  });
}

function findObjectUnionBranch(branches, requiredProperty) {
  const branch = branches.find((candidate) =>
    candidate !== null &&
    typeof candidate === "object" &&
    candidate.type === "object" &&
    candidate.properties !== undefined &&
    candidate.properties[requiredProperty] !== undefined
  );

  if (branch === undefined) {
    throw new Error(`MusicDiscoveryLookupInput schema branch with ${requiredProperty} is missing.`);
  }

  return branch;
}

function requireGeneratedProperty(branch, propertyName) {
  const property = branch.properties?.[propertyName];
  if (property === undefined) {
    throw new Error(`MusicDiscoveryLookupInput generated property ${propertyName} is missing.`);
  }
  return property;
}

// MCP and OpenAI-style function-tool clients require BOTH the input and output
// schema roots to be JSON Schema objects (MCP: an outputSchema must carry a
// top-level `type: "object"`). For non-union types, ts-json-schema-generator
// emits a root `$ref` to an object definition; keep the generated definition as
// the source of truth, then hoist that object shape to the exposed root so the
// public root carries `type: "object"` instead of a bare `$ref`.
function applyObjectSchemaRootOverlay(schema, typeName) {
  if (schema === null || typeof schema !== "object") {
    throw new Error(`${typeName} schema is not an object.`);
  }
  if (schema.type === "object") {
    return;
  }
  if (schema.$ref !== `#/definitions/${typeName}`) {
    throw new Error(`${typeName} schema root must be an object or a $ref to its generated definition.`);
  }

  const definitions = schema.definitions;
  const def = definitions?.[typeName];
  if (definitions === null || typeof definitions !== "object" || def === null || typeof def !== "object") {
    throw new Error(`${typeName} schema definition is missing.`);
  }
  if (def.type !== "object") {
    throw new Error(`${typeName} schema definition must be an object before root hoisting.`);
  }

  delete definitions[typeName];

  const schemaUri = schema.$schema;
  const root = {
    "$schema": schemaUri,
    ...def,
    ...(Object.keys(definitions).length === 0 ? {} : { definitions }),
  };

  for (const key of Object.keys(schema)) {
    delete schema[key];
  }

  Object.assign(schema, root);
}

const generatedSchemas = schemaTargets.map((target) => {
  const schema = generatorFor(target.sourcePath).createSchema(target.typeName);
  if (
    target.exportName === "musicDiscoveryLookupInputSchema" ||
    target.exportName === "libraryImportStartInputSchema" ||
    target.exportName === "libraryCatalogBrowseInputSchema"
  ) {
    applyToolLimitOverlay(schema);
  }
  if (target.exportName === "libraryCatalogSampleInputSchema") {
    applyNumericPropertyOverlay(schema, "count");
    applyNonEmptyStringPropertyOverlay(schema, "seed");
  }
  if (target.exportName === "libraryCatalogSummaryInputSchema") {
    applyNumericPropertyOverlay(schema, "sampleCount");
  }
  if (target.exportName === "libraryCatalogBrowseInputSchema") {
    applyNonEmptyStringPropertyOverlay(schema, "cursor");
  }
  if (
    target.exportName === "libraryCatalogBrowseOutputSchema" ||
    target.exportName === "libraryCatalogSampleOutputSchema" ||
    target.exportName === "libraryCatalogSummaryOutputSchema"
  ) {
    applyNonEmptyStringPropertyOverlay(schema, "id");
  }
  if (target.exportName === "musicDiscoveryLookupInputSchema") {
    applyMusicDiscoveryLookupObjectRootOverlay(schema);
  }
  if (
    target.exportName === "libraryImportStatusInputSchema"
  ) {
    applyLibraryImportBatchIdNonEmptyOverlay(schema);
  }
  if (
    target.exportName.startsWith("radioVariations") ||
    target.exportName.startsWith("radioLean")
  ) {
    applyRadioIndexIntegerOverlays(schema);
  }
  if (
    target.exportName === "playbackQueueRemoveInputSchema" ||
    target.exportName === "playbackQueueReplaceInputSchema" ||
    target.exportName === "playbackQueueMoveInputSchema"
  ) {
    applyQueueIndexIntegerOverlays(schema);
  }
  if (
    target.exportName.startsWith("radioMotif") ||
    target.exportName.startsWith("radioVariations") ||
    target.exportName.startsWith("radioLean") ||
    target.exportName === "radioDirectionToolOutputSchema" ||
    target.exportName === "radioLeanToolOutputSchema"
  ) {
    applyRadioDirectionBoundOverlays(schema);
  }
  if (
    target.exportName === "radioRunFinishInputSchema" ||
    target.exportName === "radioRunFinishOutputSchema"
  ) {
    applyRadioRunFinishBoundOverlays(schema);
  }
  applyMusicItemHandlePatternOverlay(schema);
  applyMusicScopeHandlePatternOverlay(schema);
  if (
    target.exportName.endsWith("InputSchema") ||
    target.exportName.endsWith("OutputSchema")
  ) {
    applyObjectSchemaRootOverlay(schema, target.typeName);
  }
  return { ...target, schema };
});

const lines = [
  "// Generated by scripts/generate-stage-interface-schemas.mjs.",
  "// Do not edit by hand.",
  "",
  'import type { JsonSchema } from "../stage_interface.js";',
  "",
];

for (const target of generatedSchemas) {
  lines.push(
    `export const ${target.exportName} = ${JSON.stringify(target.schema, null, 2)} as const satisfies JsonSchema;`,
    "",
  );
}

const output = `${lines.join("\n")}\n`;
const outputLabel = relative(repositoryRoot, outputPath);

if (checkMode) {
  let current = "";
  try {
    current = await readFile(outputPath, "utf8");
  } catch (cause) {
    if (cause && cause.code === "ENOENT") {
      console.error(`Stage Interface schemas missing at ${outputLabel}; run \`npm run generate:stage-interface-schemas\`.`);
      process.exit(1);
    }
    throw cause;
  }
  if (current !== output) {
    console.error(`Stage Interface schemas are out of date at ${outputLabel}; run \`npm run generate:stage-interface-schemas\` and commit the result.`);
    process.exit(1);
  }
  console.log(`Stage Interface schemas are up to date at ${outputLabel}.`);
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  console.log(`Generated ${generatedSchemas.length} Stage Interface schemas at ${outputLabel}.`);
}
