import type { ToolName } from "../../contracts/index.js";
import type {
  LibraryToolGroupContext,
} from "./library.js";
import {
  libraryToolDefinitions,
  libraryToolDescriptors,
  libraryToolInputSchemas,
  libraryToolNames,
} from "./library.js";
import type {
  BoundStageInterfaceToolDefinition,
} from "./types.js";
import {
  bindToolDefinitions,
} from "./types.js";

export {
  libraryToolDefinitions,
  libraryToolDescriptors,
  libraryToolInputSchemas,
  libraryToolNames,
};
export type {
  LibraryToolGroupContext,
  LibraryToolName,
} from "./library.js";
export type {
  BoundStageInterfaceToolDefinition,
  StageInterfaceToolAvailability,
  StageInterfaceToolDefinition,
  StageInterfaceToolHandlerInput,
  StageInterfaceToolInputSchema,
} from "./types.js";

export type StageInterfaceToolDefinitionRegistryOptions = {
  library: LibraryToolGroupContext;
};

export function createStageInterfaceToolDefinitionRegistry({
  library,
}: StageInterfaceToolDefinitionRegistryOptions): Map<ToolName, BoundStageInterfaceToolDefinition> {
  const definitions = bindToolDefinitions({
    definitions: libraryToolDefinitions,
    context: library,
  });

  return new Map(definitions.map((definition) => [definition.name, definition]));
}
