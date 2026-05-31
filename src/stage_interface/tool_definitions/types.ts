import type { z } from "zod/v4";

import type {
  Result,
  ToolDescriptor,
  ToolName,
} from "../../contracts/index.js";

export type StageInterfaceToolInputSchema = z.ZodRawShape;

export type StageInterfaceToolAvailability =
  | "always_available"
  | "requires_active_instrument";

export type StageInterfaceToolHandlerInput<TContext, TInput = unknown> = {
  context: TContext;
  sessionId: string;
  payload: TInput;
};

export type StageInterfaceToolDefinition<
  TName extends ToolName,
  TContext,
  TInput = unknown,
  TOutput = unknown,
> = {
  name: TName;
  description: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  effectKind?: string;
  inputSchema: StageInterfaceToolInputSchema;
  inputParser?: z.ZodType<TInput>;
  availability: StageInterfaceToolAvailability;
  handler(
    input: StageInterfaceToolHandlerInput<TContext, TInput>,
  ): Promise<Result<TOutput>> | Result<TOutput>;
  validatePayload?: (payload: unknown) => Result<unknown>;
  present?: (value: unknown) => unknown;
};

export type BoundStageInterfaceToolDefinition<TName extends ToolName = ToolName> =
  Omit<StageInterfaceToolDefinition<TName, unknown>, "handler"> & {
    handler(input: {
      sessionId: string;
      payload: unknown;
    }): Promise<Result<unknown>> | Result<unknown>;
  };

export function bindToolDefinitions<TName extends ToolName, TContext>({
  definitions,
  context,
}: {
  definitions: readonly StageInterfaceToolDefinition<TName, TContext>[];
  context: TContext;
}): BoundStageInterfaceToolDefinition<TName>[] {
  return definitions.map((definition) => ({
    ...definition,
    handler(input) {
      return definition.handler({
        ...input,
        context,
      });
    },
  }));
}

export function defineStageInterfaceTool<
  TName extends ToolName,
  TContext,
  TInput,
  TOutput = unknown,
>(
  definition: StageInterfaceToolDefinition<TName, TContext, TInput, TOutput>,
): StageInterfaceToolDefinition<TName, TContext, TInput, TOutput> {
  return definition;
}

export function descriptorForToolDefinition<TName extends ToolName>(
  definition: Pick<
    StageInterfaceToolDefinition<TName, unknown>,
    "name" | "description" | "inputSchemaRef" | "outputSchemaRef" | "effectKind"
  >,
): ToolDescriptor & { name: TName } {
  return {
    name: definition.name,
    description: definition.description,
    inputSchemaRef: definition.inputSchemaRef,
    outputSchemaRef: definition.outputSchemaRef,
    ...(definition.effectKind === undefined ? {} : { effectKind: definition.effectKind }),
  };
}
