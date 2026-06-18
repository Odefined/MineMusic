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
    exportName: "libraryImportContinueInputSchema",
    typeName: "LibraryImportContinueInput",
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

// The TS source declares `limit?: number`, which the generator faithfully transcribes as
// { type: "number" }. Lookup and library-import handlers enforce integer 1..100, so
// surface that bound in the agent-facing schemas by overlaying every relevant `limit`.
function applyToolLimitOverlay(schema) {
  if (schema === null || typeof schema !== "object") {
    return;
  }
  if (Array.isArray(schema)) {
    for (const node of schema) {
      applyToolLimitOverlay(node);
    }
    return;
  }
  if (
    schema.properties !== undefined &&
    typeof schema.properties.limit === "object" &&
    schema.properties.limit !== null &&
    schema.properties.limit.type === "number"
  ) {
    schema.properties.limit = { ...TOOL_LIMIT_CONSTRAINT };
  }
  for (const child of Object.values(schema)) {
    applyToolLimitOverlay(child);
  }
}

const NON_EMPTY_SCOPE_DEFINITIONS = new Set([
  "MusicLibraryScopeHandle",
  "MusicProviderScopeHandle",
  "MusicItemHandle",
  "ListedMusicScope",
]);
const NON_EMPTY_LIBRARY_IMPORT_BATCH_ID_DEFINITIONS = new Set([
  "LibraryImportContinueInput",
  "LibraryImportStatusInput",
]);

// Continue/status batch ids are structural input handles for an existing batch.
// Keep the non-empty check at the schema gate so handlers do not need to
// duplicate shape validation before reading the batch.
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

// The TS source declares scope-handle `id`/`providerId` as bare `string`, which the
// generator transcribes as { type: "string" } with no minLength. An empty-string scope
// handle would pass the AJV gate and reach resolution as a bogus empty-key scope
// ("source_library:" / "provider:"). Surface non-empty at the STRUCTURAL layer (the
// owner of shape validity) by tightening the id/providerId of the scope-handle
// definitions. Scoped to the named definitions so unrelated `id` props (e.g.
// StageRuntimeStatusInput.modules[].id) are untouched.
function applyScopeHandleNonEmptyOverlay(schema) {
  const definitions = schema?.definitions;
  if (definitions === null || typeof definitions !== "object") {
    return;
  }
  for (const [name, def] of Object.entries(definitions)) {
    if (NON_EMPTY_SCOPE_DEFINITIONS.has(name)) {
      tightenNonEmptyStringProperties(def);
    }
  }
}

function tightenNonEmptyStringProperties(def) {
  if (def === null || typeof def !== "object") {
    return;
  }
  // Handle both anyOf-wrapped variants (MusicLibraryScopeHandle, ListedMusicScope)
  // and flat object definitions (MusicProviderScopeHandle).
  const variants = Array.isArray(def.anyOf) ? def.anyOf : [def];
  for (const variant of variants) {
    if (
      variant === null ||
      typeof variant !== "object" ||
      variant.properties === undefined
    ) {
      continue;
    }
    for (const field of ["id", "providerId"]) {
      const prop = variant.properties[field];
      if (
        prop !== null &&
        typeof prop === "object" &&
        prop.type === "string" &&
        prop.minLength === undefined
      ) {
        variant.properties[field] = { ...NON_EMPTY_STRING_CONSTRAINT };
      }
    }
  }
}

// The present output item is a library MusicItemHandle inlined under
// properties.item (not a $ref to the MusicItemHandle definition), so the
// scope-handle overlay above does not reach it. An empty-string item.id would
// pass the AJV gate while the handle registry would reject it, leaving the
// public output contract looser than the handle contract. Tighten it here so
// the structural layer enforces non-empty parity with the input handle.
function applyPresentOutputHandleNonEmptyOverlay(schema) {
  const def = schema?.definitions?.MusicExperiencePresentOutput;
  if (def === null || typeof def !== "object" || def.properties === undefined) {
    return;
  }
  const item = def.properties.item;
  if (item === null || typeof item !== "object" || item.properties === undefined) {
    return;
  }
  const id = item.properties.id;
  if (
    id !== null &&
    typeof id === "object" &&
    id.type === "string" &&
    id.minLength === undefined
  ) {
    item.properties.id = { ...NON_EMPTY_STRING_CONSTRAINT };
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
    target.exportName === "libraryImportContinueInputSchema"
  ) {
    applyToolLimitOverlay(schema);
  }
  if (target.exportName === "musicDiscoveryLookupInputSchema") {
    applyMusicDiscoveryLookupObjectRootOverlay(schema);
  }
  if (
    target.exportName === "libraryImportContinueInputSchema" ||
    target.exportName === "libraryImportStatusInputSchema"
  ) {
    applyLibraryImportBatchIdNonEmptyOverlay(schema);
  }
  // Scope-handle definitions are inlined under multiple exports, so apply the
  // non-empty overlay to every target.
  applyScopeHandleNonEmptyOverlay(schema);
  if (target.exportName === "musicExperiencePresentOutputSchema") {
    applyPresentOutputHandleNonEmptyOverlay(schema);
  }
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
