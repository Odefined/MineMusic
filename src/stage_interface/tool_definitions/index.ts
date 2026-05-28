import type { ToolName } from "../../contracts/index.js";
import type {
  CanonicalReviewToolGroupContext,
} from "./canonical_review.js";
import {
  canonicalReviewToolDefinitions,
  canonicalReviewToolDescriptors,
  canonicalReviewToolInputSchemas,
  canonicalReviewToolNames,
} from "./canonical_review.js";
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
  KnowledgeToolGroupContext,
} from "./knowledge.js";
import {
  knowledgeToolDefinitions,
  knowledgeToolDescriptors,
  knowledgeToolInputSchemas,
  knowledgeToolNames,
} from "./knowledge.js";
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
  MemoryToolGroupContext,
} from "./memory.js";
import {
  memoryToolDefinitions,
  memoryToolDescriptors,
  memoryToolInputSchemas,
  memoryToolNames,
} from "./memory.js";
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
  canonicalReviewToolDefinitions,
  canonicalReviewToolDescriptors,
  canonicalReviewToolInputSchemas,
  canonicalReviewToolNames,
  handbookToolDefinitions,
  handbookToolDescriptors,
  handbookToolInputSchemas,
  handbookToolNames,
  knowledgeToolDefinitions,
  knowledgeToolDescriptors,
  knowledgeToolInputSchemas,
  knowledgeToolNames,
  libraryToolDefinitions,
  libraryToolDescriptors,
  libraryToolInputSchemas,
  libraryToolNames,
  memoryToolDefinitions,
  memoryToolDescriptors,
  memoryToolInputSchemas,
  memoryToolNames,
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
  CanonicalReviewToolGroupContext,
  CanonicalReviewToolName,
} from "./canonical_review.js";
export type {
  HandbookToolGroupContext,
  HandbookToolName,
} from "./handbook.js";
export type {
  KnowledgeToolGroupContext,
  KnowledgeToolName,
} from "./knowledge.js";
export type {
  LibraryToolGroupContext,
  LibraryToolName,
} from "./library.js";
export type {
  MemoryToolGroupContext,
  MemoryToolName,
} from "./memory.js";
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
  knowledge: KnowledgeToolGroupContext;
  library: LibraryToolGroupContext;
  canonicalReview: CanonicalReviewToolGroupContext;
  memory: MemoryToolGroupContext;
};

export function createStageInterfaceToolDefinitionRegistry({
  stage,
  handbook,
  music,
  knowledge,
  library,
  canonicalReview,
  memory,
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
      definitions: knowledgeToolDefinitions,
      context: knowledge,
    }),
    ...bindToolDefinitions({
      definitions: libraryToolDefinitions,
      context: library,
    }),
    ...bindToolDefinitions({
      definitions: canonicalReviewToolDefinitions,
      context: canonicalReview,
    }),
    ...bindToolDefinitions({
      definitions: memoryToolDefinitions,
      context: memory,
    }),
  ];

  return new Map(definitions.map((definition) => [definition.name, definition]));
}
