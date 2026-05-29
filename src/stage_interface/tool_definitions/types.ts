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

export type StageInterfaceToolHandlerInput<TContext> = {
  context: TContext;
  sessionId: string;
  payload: unknown;
};

export type StageInterfaceToolDefinition<TName extends ToolName, TContext> = {
  name: TName;
  description: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  effectKind?: string;
  inputSchema: StageInterfaceToolInputSchema;
  availability: StageInterfaceToolAvailability;
  handler(
    input: StageInterfaceToolHandlerInput<TContext>,
  ): Promise<Result<unknown>> | Result<unknown>;
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
