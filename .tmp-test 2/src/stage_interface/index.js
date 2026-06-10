export function createStageInterface(input) {
    assertUnique(input.instruments.map((instrument) => instrument.id), "instrument id");
    assertUnique(input.tools.map((tool) => tool.name), "tool name");
    assertToolInstruments(input.tools, new Set(input.instruments.map((instrument) => instrument.id)));
    const handlers = input.handlers ?? new Map();
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
function assertUnique(values, label) {
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) {
            throw new Error(`Duplicate ${label}: ${value}`);
        }
        seen.add(value);
    }
}
function assertToolInstruments(tools, instrumentIds) {
    for (const tool of tools) {
        if (!instrumentIds.has(tool.instrumentId)) {
            throw new Error(`Tool '${tool.name}' references missing instrument '${tool.instrumentId}'.`);
        }
    }
}
