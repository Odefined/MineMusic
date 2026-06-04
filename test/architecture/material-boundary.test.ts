import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import type {
  EphemeralMaterialStorePort,
  LibraryImportMaterialStorePort,
  MaterialPolicyCollectionBlockPort,
  MaterialProjectionStorePort,
  MaterialQueryCollectionReadPort,
  MaterialResolveEphemeralWritePort,
  MaterialQueryStorePort,
  MaterialResolveStorePort,
  MaterialSearchCollectionPort,
  MaterialSearchStorePort,
  RecommendationPresentationEphemeralReadPort,
  MaterialSourceMaterializerStorePort,
  SourceGroundingEvidenceStorePort,
  SourceLibraryReadStorePort,
  StageInterfaceMaterialStorePort,
} from "../../src/ports/index.js";

type IsExact<TActual, TExpected> =
  (<T>() => T extends TActual ? 1 : 2) extends
    (<T>() => T extends TExpected ? 1 : 2)
    ? (<T>() => T extends TExpected ? 1 : 2) extends
      (<T>() => T extends TActual ? 1 : 2)
      ? true
      : false
    : false;

type Assert<TCondition extends true> = TCondition;

export type MaterialProjectionStorePortKeysAreExact = Assert<IsExact<
  keyof MaterialProjectionStorePort,
  | "resolveMaterialRedirect"
  | "getMaterialRecord"
  | "getSourceEntity"
  | "getCanonical"
>>;

export type MaterialQueryStorePortKeysAreExact = Assert<IsExact<
  keyof MaterialQueryStorePort,
  | "resolveMaterialRedirect"
  | "getMaterialRecord"
  | "getSourceEntity"
  | "getCanonical"
  | "listSourceLibraryItems"
  | "listSourceEntities"
  | "getConfirmedCanonicalBinding"
>>;

export type MaterialSearchStorePortKeysAreExact = Assert<IsExact<
  keyof MaterialSearchStorePort,
  | "resolveMaterialRedirect"
  | "getMaterialRecord"
  | "getSourceEntity"
  | "getCanonical"
  | "findMaterialBySourceRef"
  | "listSourceLibraryItems"
  | "listMaterialRelations"
>>;

export type MaterialResolveStorePortKeysAreExact = Assert<IsExact<
  keyof MaterialResolveStorePort,
  | "getCanonical"
  | "findCanonicalByLabel"
  | "getConfirmedCanonicalBinding"
  | "listSourceLibraryItems"
>>;

export type EphemeralMaterialStorePortKeysAreExact = Assert<IsExact<
  keyof EphemeralMaterialStorePort,
  | "put"
  | "get"
  | "delete"
  | "cleanup"
>>;

export type MaterialResolveEphemeralWritePortKeysAreExact = Assert<IsExact<
  keyof MaterialResolveEphemeralWritePort,
  | "put"
  | "cleanup"
>>;

export type RecommendationPresentationEphemeralReadPortKeysAreExact = Assert<IsExact<
  keyof RecommendationPresentationEphemeralReadPort,
  | "get"
  | "delete"
>>;

export type MaterialQueryCollectionReadPortKeysAreExact = Assert<IsExact<
  keyof MaterialQueryCollectionReadPort,
  | "listCollections"
  | "listItems"
>>;

export type MaterialPolicyCollectionBlockPortKeysAreExact = Assert<IsExact<
  keyof MaterialPolicyCollectionBlockPort,
  | "filterBlockedMaterials"
>>;

export type MaterialSearchCollectionPortKeysAreExact = Assert<IsExact<
  keyof MaterialSearchCollectionPort,
  | "listCollections"
  | "listItems"
>>;

export type MaterialSourceMaterializerStorePortKeysAreExact = Assert<IsExact<
  keyof MaterialSourceMaterializerStorePort,
  | "resolveMaterialRedirect"
  | "getMaterialRecord"
  | "getSourceEntity"
  | "getCanonical"
  | "getConfirmedCanonicalBinding"
  | "findMaterialBySourceRef"
  | "findMaterialByCanonicalRef"
  | "getOrCreateBySourceRef"
  | "getOrCreateByCanonicalRef"
  | "attachSourceRef"
  | "promoteToCanonical"
  | "mergeMaterials"
>>;

export type SourceLibraryReadStorePortKeysAreExact = Assert<IsExact<
  keyof SourceLibraryReadStorePort,
  | "listSourceLibraryItems"
  | "getSourceEntity"
>>;

export type SourceGroundingEvidenceStorePortKeysAreExact = Assert<IsExact<
  keyof SourceGroundingEvidenceStorePort,
  | "getConfirmedCanonicalBinding"
  | "getSourceEntity"
  | "upsertSourceEntity"
>>;

export type LibraryImportMaterialStorePortKeysAreExact = Assert<IsExact<
  keyof LibraryImportMaterialStorePort,
  | "getSourceEntity"
  | "upsertSourceEntity"
  | "getSourceLibraryItem"
  | "putSourceLibraryItem"
  | "listSourceLibraryItems"
  | "getOrCreateBySourceRef"
>>;

export type StageInterfaceMaterialStorePortKeysAreExact = Assert<IsExact<
  keyof StageInterfaceMaterialStorePort,
  | "resolveMaterialRedirect"
  | "getMaterialRecord"
  | "getSourceEntity"
  | "getCanonical"
  | "listSourceLibraryItems"
>>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const materialRoots = [
  "src/material",
];

const materialPolicySelectionRoots = [
  "src/material/policy",
  "src/material/selection",
];

const materialQueryRoots = [
  "src/material/query",
];

const materialSearchRoots = [
  "src/material/search",
];

const materialResolveRoots = [
  "src/material/resolve",
];

const sourceGroundingRoots = [
  "src/source",
];

const libraryImportRoots = [
  "src/material/store/source_entity/library-import.ts",
];

const materialMaterializationRoots = [
  "src/material/materialization",
];

const materialPresentationRoots = [
  "src/material/presentation",
];

const stageInterfaceMaterialStoreNarrowingRoots = [
  "src/stage_interface/tool_definitions/stage.ts",
  "src/stage_interface/tool_definitions/music.ts",
  "src/stage_interface/tool_definitions/library.ts",
];

const stageInterfaceDispatchRoots = [
  "src/stage_interface/dispatch.ts",
];

const materialQueryProjectionFormerImportRoots = [
  "src/stage_interface/tool_definitions/stage.ts",
  "src/stage_interface/tool_definitions/music.ts",
  "src/app/index.ts",
  "src/stage/index.ts",
  "src/memory/index.ts",
];

const legacyMaterialRoots = [
  "src/material_store",
  "src/material_resolve",
  "src/material_query",
  "src/material_policy",
  "src/material_selection",
  "src/recommendation_presentation",
];

const forbiddenSourceFragments = [
  "stage_interface",
  "material_cards",
];

const forbiddenImportedNames = [
  "MaterialCard",
  "MaterialCardsPort",
  "CandidateMaterialCard",
  "PresentedMaterialCard",
  "MaterialCardSnapshot",
  "RecentMaterialCard",
  "RecommendationPresentedCardSnapshot",
  "CompactMaterialCard",
  "CompactCandidateMaterialCard",
  "CompactPresentedMaterialCard",
];

const registryMaterializationWriterNames = [
  "getOrCreateBySourceRef",
  "getOrCreateByCanonicalRef",
  "attachSourceRef",
  "promoteToCanonical",
  "mergeMaterials",
];

const forbiddenCollectionWriterNames = [
  "initializeOwnerCollections",
  "addMaterialToSystemCollection",
  "removeMaterialFromSystemCollection",
  "addMaterialToCollection",
  "removeMaterialFromCollection",
  "createCollection",
  "updateCollection",
  "removeCollection",
];

const forbiddenMaterializationImportFragments = [
  "material/query",
  "material/resolve",
  "stage_interface",
  "presentation",
  "library_import",
  "memory",
];

const forbiddenMaterialSearchImportFragments = [
  "stage_interface",
  "storage",
  "providers",
  "../source",
  "../../source",
  "material/materialization",
];

const forbiddenResolveStorageImportFragments = [
  "storage",
  "sqlite",
];

const forbiddenMaterialPolicyRecordProjectionHelpers = [
  "projectMaterialRecord",
  "sourceRefsForMaterialRecord",
  "sourceEntitiesForRefs",
  "playableLinksForSourceEntities",
  "projectedStateForMaterialRecord",
  "labelForMaterialRecord",
];

async function materialModulesDoNotImportAgentFacingOutputShapes(): Promise<void> {
  const files = await materialSourceFiles();
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      const sourceFailure = forbiddenSourceFragments.find((fragment) => importStatement.source.includes(fragment));

      if (sourceFailure !== undefined) {
        failures.push(`${relative(process.cwd(), file)} imports ${sourceFailure} via ${importStatement.source}`);
      }

      const nameFailures = forbiddenImportedNames.filter((name) =>
        new RegExp(`\\b${name}\\b`).test(importStatement.clause)
      );
      const compactNameFailures = Array.from(importStatement.clause.matchAll(/\bCompact[A-Za-z0-9_]*\b/g))
        .map((match) => match[0] ?? "");

      for (const name of new Set([...nameFailures, ...compactNameFailures])) {
        failures.push(`${relative(process.cwd(), file)} imports agent-facing output DTO ${name}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material modules must not import Stage Interface output DTOs:\n${failures.join("\n")}`,
  );
}

async function legacyMaterialRootDirectoriesAreRemoved(): Promise<void> {
  const existingLegacyRoots: string[] = [];

  for (const root of legacyMaterialRoots) {
    if (await pathExists(join(process.cwd(), root))) {
      existingLegacyRoots.push(root);
    }
  }

  assert(
    existingLegacyRoots.length === 0,
    `Material bounded context should not keep legacy root directories:\n${existingLegacyRoots.join("\n")}`,
  );
}

async function materialPolicyAndSelectionDoNotImportFullMaterialStorePort(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialPolicySelectionRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (/\bMaterialStorePort\b/.test(importStatement.clause)) {
        failures.push(`${relative(process.cwd(), file)} imports MaterialStorePort`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material policy/selection modules must use narrow material store ports:\n${failures.join("\n")}`,
  );
}

async function materialPolicyUsesMaterialProjectionForRecordProjection(): Promise<void> {
  const policyEntry = join(process.cwd(), "src/material/policy/index.ts");
  const text = await readFile(policyEntry, "utf8");
  const localProjectionHelpers = forbiddenMaterialPolicyRecordProjectionHelpers.filter((name) =>
    new RegExp(`(?:async\\s+)?function\\s+${name}\\b`).test(text)
  );

  assert(
    text.includes('from "../projection/index.js"'),
    "Material policy must import the Material Projection module for record projection.",
  );
  assert(
    localProjectionHelpers.length === 0,
    `Material policy must not reimplement MaterialRecord projection helpers:\n${localProjectionHelpers.join("\n")}`,
  );
}

async function materialQueryDoesNotImportFullMaterialStorePort(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialQueryRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (/\bMaterialStorePort\b/.test(importStatement.clause)) {
        failures.push(`${relative(process.cwd(), file)} imports MaterialStorePort`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material query modules must use narrow material query/projection store ports:\n${failures.join("\n")}`,
  );
}

async function materialQueryUsesNarrowCollectionReadPort(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialQueryRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (/\bCollectionPort\b/.test(importStatement.clause)) {
        failures.push(`${relative(process.cwd(), file)} imports CollectionPort`);
      }
    }

    for (const methodName of [
      ...forbiddenCollectionWriterNames,
      "filterBlockedMaterials",
    ]) {
      if (new RegExp(`\\b${methodName}\\b`).test(text)) {
        failures.push(`${relative(process.cwd(), file)} references ${methodName}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material query must use MaterialQueryCollectionReadPort only:\n${failures.join("\n")}`,
  );
}

async function stageInterfaceProjectionConsumersDoNotImportFullMaterialStorePort(): Promise<void> {
  const files = await sourceFilesUnderRoots(stageInterfaceMaterialStoreNarrowingRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (/\bMaterialStorePort\b/.test(importStatement.clause)) {
        failures.push(`${relative(process.cwd(), file)} imports MaterialStorePort`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Stage Interface projection/source-library tools must use narrow material store ports:\n${failures.join("\n")}`,
  );
}

async function stageInterfaceDispatchDoesNotImportFullMaterialStorePort(): Promise<void> {
  const files = await sourceFilesUnderRoots(stageInterfaceDispatchRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (/\bMaterialStorePort\b/.test(importStatement.clause)) {
        failures.push(`${relative(process.cwd(), file)} imports MaterialStorePort`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Stage Interface dispatch must use StageInterfaceMaterialStorePort instead of full MaterialStorePort:\n${failures.join("\n")}`,
  );
}

async function materialQueryDoesNotDirectlyMaterializeSourceRefs(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialQueryRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    if (/\bgetOrCreateBySourceRef\b/.test(text)) {
      failures.push(`${relative(process.cwd(), file)} references getOrCreateBySourceRef`);
    }
  }

  assert(
    failures.length === 0,
    `Material query must delegate source-library materialization:\n${failures.join("\n")}`,
  );
}

async function materialSearchUsesOnlyNarrowBoundaries(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialSearchRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      for (const portName of ["MaterialStorePort", "CollectionPort"]) {
        if (new RegExp(`\\b${portName}\\b`).test(importStatement.clause)) {
          failures.push(`${relative(process.cwd(), file)} imports ${portName}`);
        }
      }

      const fragment = forbiddenMaterialSearchImportFragments.find((candidate) =>
        importStatement.source.includes(candidate)
      );

      if (fragment !== undefined) {
        failures.push(`${relative(process.cwd(), file)} imports ${fragment} via ${importStatement.source}`);
      }
    }

    for (const writerName of registryMaterializationWriterNames) {
      if (new RegExp(`\\b${writerName}\\b`).test(text)) {
        failures.push(`${relative(process.cwd(), file)} references ${writerName}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material Search must use narrow ports and stay inside Material Flow boundaries:\n${failures.join("\n")}`,
  );
}

async function materialResolveDoesNotDirectlyUseRegistryMaterializationWriters(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialResolveRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      const fragment = forbiddenResolveStorageImportFragments.find((candidate) =>
        importStatement.source.includes(candidate)
      );

      if (fragment !== undefined) {
        failures.push(`${relative(process.cwd(), file)} imports ${fragment} via ${importStatement.source}`);
      }
    }

    for (const writerName of registryMaterializationWriterNames) {
      if (new RegExp(`\\b${writerName}\\b`).test(text)) {
        failures.push(`${relative(process.cwd(), file)} references ${writerName}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material resolve must delegate registry materialization writers:\n${failures.join("\n")}`,
  );
}

async function materialPresentationDoesNotImportFullMaterialStorePort(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialPresentationRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (/\bMaterialStorePort\b/.test(importStatement.clause)) {
        failures.push(`${relative(process.cwd(), file)} imports MaterialStorePort`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Recommendation presentation must not import full MaterialStorePort:\n${failures.join("\n")}`,
  );
}

async function materialResolveUsesPolicyInsteadOfCollectionAndRelationProjection(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialResolveRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (/\bCollectionPort\b/.test(importStatement.clause)) {
        failures.push(`${relative(process.cwd(), file)} imports CollectionPort`);
      }

      if (importStatement.source.includes("relation_projection")) {
        failures.push(`${relative(process.cwd(), file)} imports ${importStatement.source}`);
      }
    }

    for (const forbiddenName of ["filterBlockedMaterials", "projectMaterialRelations"]) {
      if (new RegExp(`\\b${forbiddenName}\\b`).test(text)) {
        failures.push(`${relative(process.cwd(), file)} references ${forbiddenName}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material resolve must route relation and collection-block policy through Material Policy:\n${failures.join("\n")}`,
  );
}

async function materialPolicyUsesNarrowCollectionBlockPort(): Promise<void> {
  const files = await sourceFilesUnderRoots(["src/material/policy"]);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (/\bCollectionPort\b/.test(importStatement.clause)) {
        failures.push(`${relative(process.cwd(), file)} imports CollectionPort`);
      }
    }

    for (const methodName of [
      ...forbiddenCollectionWriterNames,
      "listCollections",
      "listItems",
    ]) {
      if (new RegExp(`\\b${methodName}\\b`).test(text)) {
        failures.push(`${relative(process.cwd(), file)} references ${methodName}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material policy must use MaterialPolicyCollectionBlockPort only:\n${failures.join("\n")}`,
  );
}

async function sourceGroundingDoesNotUseCanonicalStoreSourceRefBoundary(): Promise<void> {
  const files = await sourceFilesUnderRoots(sourceGroundingRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (/\bCanonicalStorePort\b/.test(importStatement.clause)) {
        failures.push(`${relative(process.cwd(), file)} imports CanonicalStorePort`);
      }
    }

    for (const forbiddenName of ["resolveSourceRef", "attachSourceRef"]) {
      if (new RegExp(`\\b${forbiddenName}\\b`).test(text)) {
        failures.push(`${relative(process.cwd(), file)} references ${forbiddenName}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Source Grounding must use Source Entity Store / confirmed bindings instead of Canonical Store source-ref APIs:\n${failures.join("\n")}`,
  );
}

async function libraryImportUsesNarrowMaterialStoreBoundary(): Promise<void> {
  const files = await sourceFilesUnderRoots(libraryImportRoots);
  const failures: string[] = [];
  const forbiddenImportedPortNames = [
    "MaterialStorePort",
    "CollectionPort",
    "CanonicalStorePort",
  ];
  const forbiddenMaterialStoreMethodNames = [
    ...registryMaterializationWriterNames.filter((name) => name !== "getOrCreateBySourceRef"),
    "putConfirmedCanonicalBinding",
    "getConfirmedCanonicalBinding",
    "putMaterialRelation",
    "putMaterialActivity",
    "putMaterialSessionActivity",
  ];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      for (const portName of forbiddenImportedPortNames) {
        if (new RegExp(`\\b${portName}\\b`).test(importStatement.clause)) {
          failures.push(`${relative(process.cwd(), file)} imports ${portName}`);
        }
      }
    }

    for (const methodName of forbiddenMaterialStoreMethodNames) {
      if (new RegExp(`\\b${methodName}\\b`).test(text)) {
        failures.push(`${relative(process.cwd(), file)} references ${methodName}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Library Import must use LibraryImportMaterialStorePort and avoid unrelated Material Store/Collection/Canonical capabilities:\n${failures.join("\n")}`,
  );
}

async function movedProjectionConsumersDoNotImportMaterialQuery(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialQueryProjectionFormerImportRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (importStatement.source.includes("material/query")) {
        failures.push(`${relative(process.cwd(), file)} imports ${importStatement.source}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Moved projection/recent-card consumers must not import material/query:\n${failures.join("\n")}`,
  );
}

async function materializationBoundaryOwnsRegistryMaterialization(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialMaterializationRoots);
  const text = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  const missing = [
    "createMaterializationService",
    "materializeSourceMaterials",
    "materialForSourceLibraryItem",
    "getOrCreateBySourceRef",
  ].filter((expected) => !new RegExp(`\\b${expected}\\b`).test(text));

  assert(
    files.length > 0 && missing.length === 0,
    `Material materialization boundary must own shared materialization; missing ${missing.join(", ") || "source files"}`,
  );
}

async function materializationDoesNotImportForbiddenBoundaries(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialMaterializationRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      const fragment = forbiddenMaterializationImportFragments.find((candidate) =>
        importStatement.source.includes(candidate)
      );

      if (fragment !== undefined) {
        failures.push(`${relative(process.cwd(), file)} imports ${fragment} via ${importStatement.source}`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material materialization must not import forbidden boundaries:\n${failures.join("\n")}`,
  );
}

async function materialSourceFiles(): Promise<string[]> {
  return sourceFilesUnderRoots(materialRoots);
}

async function sourceFilesUnderRoots(roots: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const root of roots.map((folder) => join(process.cwd(), folder))) {
    if (!(await pathExists(root))) {
      continue;
    }

    files.push(...await sourceFilesUnder(root));
  }

  return files;
}

async function sourceFilesUnder(root: string): Promise<string[]> {
  const entry = await stat(root);

  if (entry.isFile()) {
    return root.endsWith(".ts") ? [root] : [];
  }

  const files: string[] = [];
  const children = await readdir(root, { withFileTypes: true });

  for (const child of children) {
    const childPath = join(root, child.name);

    if (child.isDirectory()) {
      files.push(...await sourceFilesUnder(childPath));
      continue;
    }

    if (child.isFile() && child.name.endsWith(".ts")) {
      files.push(childPath);
    }
  }

  return files;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function importStatements(text: string): Array<{ clause: string; source: string }> {
  const imports: Array<{ clause: string; source: string }> = [];
  const fromImportPattern = /\bimport\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  const sideEffectImportPattern = /\bimport\s+["']([^"']+)["']/g;

  for (const match of text.matchAll(fromImportPattern)) {
    imports.push({
      clause: match[1] ?? "",
      source: match[2] ?? "",
    });
  }

  for (const match of text.matchAll(sideEffectImportPattern)) {
    imports.push({
      clause: "",
      source: match[1] ?? "",
    });
  }

  return imports;
}

await materialModulesDoNotImportAgentFacingOutputShapes();
await legacyMaterialRootDirectoriesAreRemoved();
await materialPolicyAndSelectionDoNotImportFullMaterialStorePort();
await materialPolicyUsesMaterialProjectionForRecordProjection();
await materialQueryDoesNotImportFullMaterialStorePort();
await materialQueryUsesNarrowCollectionReadPort();
await materialPolicyUsesNarrowCollectionBlockPort();
await stageInterfaceProjectionConsumersDoNotImportFullMaterialStorePort();
await stageInterfaceDispatchDoesNotImportFullMaterialStorePort();
await materialQueryDoesNotDirectlyMaterializeSourceRefs();
await materialSearchUsesOnlyNarrowBoundaries();
await materialResolveDoesNotDirectlyUseRegistryMaterializationWriters();
await materialPresentationDoesNotImportFullMaterialStorePort();
await materialResolveUsesPolicyInsteadOfCollectionAndRelationProjection();
await sourceGroundingDoesNotUseCanonicalStoreSourceRefBoundary();
await libraryImportUsesNarrowMaterialStoreBoundary();
await movedProjectionConsumersDoNotImportMaterialQuery();
await materializationBoundaryOwnsRegistryMaterialization();
await materializationDoesNotImportForbiddenBoundaries();
