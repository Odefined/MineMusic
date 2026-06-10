const runtimeModuleIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export function isRuntimeModuleIdSafe(id) {
    return runtimeModuleIdPattern.test(id) && !id.includes(":");
}
export function validateRuntimeModules(modules) {
    const seenModuleIds = new Set();
    for (const module of modules) {
        const { id, ownerArea } = module.descriptor;
        if (!isRuntimeModuleIdSafe(id)) {
            return fail("stage_core.invalid_runtime_module_id", `Runtime module id '${id}' must be lowercase kebab-case and must not contain ':'.`);
        }
        if (seenModuleIds.has(id)) {
            return fail("stage_core.duplicate_runtime_module", `Duplicate runtime module id '${id}'.`);
        }
        seenModuleIds.add(id);
        const ownerAreaValue = ownerArea;
        if (ownerAreaValue === "server_host" || ownerAreaValue === "stage_interface") {
            return fail("stage_core.invalid_runtime_module_owner", `Runtime module '${id}' cannot use owner area '${ownerArea}'.`);
        }
    }
    return ok(undefined);
}
export function mergeRuntimeModuleContributions(entries) {
    const instruments = [];
    const tools = [];
    const handlers = new Map();
    const instrumentIds = new Set();
    const toolNames = new Set();
    for (const entry of entries) {
        for (const instrument of entry.contribution.instruments ?? []) {
            if (instrumentIds.has(instrument.id)) {
                return fail("stage_core.duplicate_instrument", `Duplicate instrument id '${instrument.id}' from runtime module '${entry.moduleId}'.`);
            }
            instrumentIds.add(instrument.id);
            instruments.push(instrument);
        }
        for (const tool of entry.contribution.tools ?? []) {
            if (toolNames.has(tool.name)) {
                return fail("stage_core.duplicate_tool", `Duplicate tool name '${tool.name}' from runtime module '${entry.moduleId}'.`);
            }
            toolNames.add(tool.name);
            tools.push(tool);
        }
        for (const [toolName, handler] of Object.entries(entry.contribution.handlers ?? {})) {
            if (handlers.has(toolName)) {
                return fail("stage_core.duplicate_tool_handler", `Duplicate handler for tool '${toolName}' from runtime module '${entry.moduleId}'.`);
            }
            handlers.set(toolName, handler);
        }
    }
    for (const tool of tools) {
        if (!instrumentIds.has(tool.instrumentId)) {
            return fail("stage_core.missing_tool_instrument", `Tool '${tool.name}' references missing instrument '${tool.instrumentId}'.`);
        }
        if (!handlers.has(tool.name)) {
            return fail("stage_core.missing_tool_handler", `Tool '${tool.name}' does not have a registered handler.`);
        }
    }
    for (const handlerName of handlers.keys()) {
        if (!toolNames.has(handlerName)) {
            return fail("stage_core.orphan_tool_handler", `Handler '${handlerName}' does not have a matching tool descriptor.`);
        }
    }
    return ok({
        instruments,
        tools,
        handlers,
    });
}
function ok(value) {
    return { ok: true, value };
}
function fail(code, message) {
    return {
        ok: false,
        error: {
            code,
            message,
            area: "stage_core",
            retryable: false,
        },
    };
}
