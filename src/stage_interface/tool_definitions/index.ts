import type { ToolName } from "../../contracts/index.js";
import type {
  HandbookToolGroupContext,
} from "./handbook.js";
import {
  handbookToolDefinitions,
  handbookToolDescriptors,
  handbookToolInputSchemas,
  handbookToolNames,
} from "./handbook.js";
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
  handbookToolDefinitions,
  handbookToolDescriptors,
  handbookToolInputSchemas,
  handbookToolNames,
  libraryToolDefinitions,
  libraryToolDescriptors,
  libraryToolInputSchemas,
  libraryToolNames,
};
export type {
  HandbookToolGroupContext,
  HandbookToolName,
} from "./handbook.js";
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
  handbook: HandbookToolGroupContext;
  library: LibraryToolGroupContext;
};

export function createStageInterfaceToolDefinitionRegistry({
  handbook,
  library,
}: StageInterfaceToolDefinitionRegistryOptions): Map<ToolName, BoundStageInterfaceToolDefinition> {
  const definitions = [
    ...bindToolDefinitions({
      definitions: handbookToolDefinitions,
      context: handbook,
    }),
    ...bindToolDefinitions({
      definitions: libraryToolDefinitions,
      context: library,
    }),
  ];

  return new Map(definitions.map((definition) => [definition.name, definition]));
}
