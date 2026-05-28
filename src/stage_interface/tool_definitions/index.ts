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
  MusicToolGroupContext,
} from "./music.js";
import {
  musicToolDefinitions,
  musicToolDescriptors,
  musicToolInputSchemas,
  musicToolNames,
} from "./music.js";
import type {
  StageToolGroupContext,
} from "./stage.js";
import {
  stageToolDefinitions,
  stageToolDescriptors,
  stageToolInputSchemas,
  stageToolNames,
} from "./stage.js";
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
  musicToolDefinitions,
  musicToolDescriptors,
  musicToolInputSchemas,
  musicToolNames,
  stageToolDefinitions,
  stageToolDescriptors,
  stageToolInputSchemas,
  stageToolNames,
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
  MusicToolGroupContext,
  MusicToolName,
} from "./music.js";
export type {
  StageToolGroupContext,
  StageToolName,
} from "./stage.js";
export type {
  BoundStageInterfaceToolDefinition,
  StageInterfaceToolAvailability,
  StageInterfaceToolDefinition,
  StageInterfaceToolHandlerInput,
  StageInterfaceToolInputSchema,
} from "./types.js";

export type StageInterfaceToolDefinitionRegistryOptions = {
  stage: StageToolGroupContext;
  handbook: HandbookToolGroupContext;
  music: MusicToolGroupContext;
  library: LibraryToolGroupContext;
};

export function createStageInterfaceToolDefinitionRegistry({
  stage,
  handbook,
  music,
  library,
}: StageInterfaceToolDefinitionRegistryOptions): Map<ToolName, BoundStageInterfaceToolDefinition> {
  const definitions = [
    ...bindToolDefinitions({
      definitions: stageToolDefinitions,
      context: stage,
    }),
    ...bindToolDefinitions({
      definitions: handbookToolDefinitions,
      context: handbook,
    }),
    ...bindToolDefinitions({
      definitions: musicToolDefinitions,
      context: music,
    }),
    ...bindToolDefinitions({
      definitions: libraryToolDefinitions,
      context: library,
    }),
  ];

  return new Map(definitions.map((definition) => [definition.name, definition]));
}
