import type {
  Result,
  StageInterfaceContract,
  ToolCallInput,
  ToolCallOutput,
  ToolDescriptor,
  ToolHandler,
} from "../contracts/index.js";

export type StageInterface = StageInterfaceContract & {
  dispatch(input: ToolCallInput): Promise<Result<ToolCallOutput>>;
};

export type CreateStageInterfaceInput = StageInterfaceContract & {
  handlers?: ReadonlyMap<string, ToolHandler>;
};

export function createStageInterface(input: CreateStageInterfaceInput): StageInterface {
  assertUnique(input.instruments.map((instrument) => instrument.id), "instrument id");
  assertUnique(input.tools.map((tool) => tool.name), "tool name");
  assertToolInstruments(input.tools, new Set(input.instruments.map((instrument) => instrument.id)));

  const handlers = input.handlers ?? new Map<string, ToolHandler>();

  return {
    instruments: input.instruments,
    tools: input.tools,
    async dispatch(call) {
      const handler = handlers.get(call.toolName);

      if (handler === undefined) {
        return {
          ok: false,
          error: {
            code: "stage_interface.tool_not_found",
            message: `Tool '${call.toolName}' is not registered.`,
            area: "stage_interface",
            retryable: false,
          },
        };
      }

      return handler(call);
    },
  };
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: ${value}`);
    }

    seen.add(value);
  }
}

function assertToolInstruments(tools: readonly ToolDescriptor[], instrumentIds: ReadonlySet<string>): void {
  for (const tool of tools) {
    if (!instrumentIds.has(tool.instrumentId)) {
      throw new Error(`Tool '${tool.name}' references missing instrument '${tool.instrumentId}'.`);
    }
  }
}
