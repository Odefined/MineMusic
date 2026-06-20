import assert from "node:assert/strict";
import type { Result, StageError } from "../../src/contracts/kernel.js";
import type { InstrumentDescriptor, JsonSchema, StageToolContext, ToolCallInput, ToolCallOutput, ToolDeclaration, } from "../../src/contracts/stage_interface.js";
import { createStageToolContext, type StageToolContextFactory, } from "../../src/stage_interface/index.js";
import { createMcpStdioTransport, type McpStdioTransportIo, type McpStdioTransportPorts, } from "../../src/server/transports/mcp_stdio_driver.js";
import { errorResponse, parseJsonRpcLine, resultResponse, JSON_RPC_INVALID_PARAMS, JSON_RPC_INVALID_REQUEST, JSON_RPC_METHOD_NOT_FOUND, JSON_RPC_PARSE_ERROR, JSON_RPC_INTERNAL_ERROR, } from "../../src/server/transports/mcp_framing.js";
import { deriveMcpAnnotations, renderMcpTool, stitchToolDescription, } from "../../src/server/transports/mcp_rendering.js";
import { translateToolCall } from "../../src/server/transports/mcp_translation.js";
const PROTOCOL_VERSION = "2025-11-25";
const SERVER_INFO = { name: "minemusic", version: "0.0.0" };
const testInstrument: InstrumentDescriptor = {
    id: "stage.test",
    label: "Stage Test",
    ownerArea: "stage_core",
};
const okOutputSchema = {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
} as const satisfies JsonSchema;
const emptyInputSchema = {
    type: "object",
    additionalProperties: false,
} as const satisfies JsonSchema;
const readOnlyTestDescriptor: ToolDeclaration = {
    name: "stage.test.ping",
    instrumentId: testInstrument.id,
    label: "Ping",
    ownerArea: "stage_core",
    description: "Ping the transport test tool.",
    usage: {
        useWhen: "Use in MCP transport tests.",
        doNotUseWhen: "Do not use for music work.",
        outputSemantics: "Returns a compact ok payload.",
    },
    examples: [
        { prompt: "ping", expects: "call" },
        { prompt: "search music", expects: "avoid" },
    ],
    sideEffect: {
        durableUserStateWrite: false,
        runtimeStateWrite: false,
        externalCall: false,
    },
    invocationPolicy: {
        defaultDecision: "auto",
        dataEgress: "none",
        readOnlyHint: true,
        destructiveHint: false,
    },
    inputSchema: emptyInputSchema,
    outputSchema: okOutputSchema,
    errors: [
        {
            code: "invalid_input",
            retryable: false,
            suggestedFixTemplate: "Call with an empty object.",
        },
    ],
    resultSummary: (result) => `ok=${(result as {
        ok?: boolean;
    }).ok ?? false}`,
};
const writeTestDescriptor: ToolDeclaration = {
    ...readOnlyTestDescriptor,
    name: "stage.test.write",
    invocationPolicy: {
        ...readOnlyTestDescriptor.invocationPolicy,
        readOnlyHint: false,
    },
};
// ---------------------------------------------------------------------------
// framing
// ---------------------------------------------------------------------------
assert.equal(parseJsonRpcLine('{"jsonrpc":"2.0","id":1,"method":"ping"}').kind, "request");
assert.equal(parseJsonRpcLine('{"jsonrpc":"2.0","method":"notifications/initialized"}').kind, "notification");
assert.equal(parseJsonRpcLine("{not json").kind, "parseError");
assert.equal(parseJsonRpcLine('{"jsonrpc":"1.0","id":1,"method":"ping"}').kind, "invalid");
assert.equal(parseJsonRpcLine('{"jsonrpc":"2.0","id":1}').kind, "invalid");
assert.equal(parseJsonRpcLine('{"jsonrpc":"2.0","id":[],"method":"ping"}').kind, "invalid");
assert.equal(parseJsonRpcLine("[]").kind, "invalid");
assert.equal(parseJsonRpcLine('{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"x"}}').kind, "request");
{
    const parsed = parseJsonRpcLine('{"jsonrpc":"2.0","id":"abc","method":"tools/call","params":{"name":"x"}}');
    assert.equal(parsed.kind === "request" ? parsed.id : undefined, "abc");
    assert.deepEqual(parsed.kind === "request" ? parsed.params : undefined, { name: "x" });
}
assert.deepEqual(resultResponse(1, { ok: true }), {
    jsonrpc: "2.0",
    id: 1,
    result: { ok: true },
});
assert.deepEqual(errorResponse(null, JSON_RPC_PARSE_ERROR, "Invalid JSON."), {
    jsonrpc: "2.0",
    id: null,
    error: { code: -32700, message: "Invalid JSON." },
});
// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------
{
    const rendered = renderMcpTool(readOnlyTestDescriptor);
    assert.equal(rendered.name, "stage_test_ping");
    assert.equal(rendered.inputSchema, readOnlyTestDescriptor.inputSchema);
    assert.equal(rendered.outputSchema, readOnlyTestDescriptor.outputSchema);
    assert.deepEqual(rendered.annotations, { readOnlyHint: true });
    const description = stitchToolDescription(readOnlyTestDescriptor);
    assert.equal(description.includes(readOnlyTestDescriptor.description), true);
    assert.equal(description.includes("When to use:"), true);
    assert.equal(description.includes(readOnlyTestDescriptor.usage.useWhen), true);
    assert.equal(description.includes("When NOT to use:"), true);
    assert.equal(description.includes(readOnlyTestDescriptor.usage.doNotUseWhen), true);
    assert.equal(description.includes("Output:"), true);
    assert.equal(description.includes("Examples:"), true);
    assert.equal(description.includes('"ping" -> call'), true);
    assert.equal(description.includes('"search music" -> avoid'), true);
}
// A write tool with no destructive / open-world posture derives no annotations.
assert.equal(deriveMcpAnnotations(writeTestDescriptor), undefined);
// ---------------------------------------------------------------------------
// translation
// ---------------------------------------------------------------------------
function okResult(result: unknown): Result<ToolCallOutput> {
    return { ok: true, value: { toolName: "stage.test.ping", result } };
}
function errorResult(error: StageError): Result<ToolCallOutput> {
    return { ok: false, error };
}
// success -> structuredContent + content summary from resultSummary
{
    const outcome = translateToolCall({
        descriptor: readOnlyTestDescriptor,
        dispatchResult: okResult({ ok: true }),
    });
    assert.equal(outcome.kind, "toolResult");
    if (outcome.kind === "toolResult") {
        assert.deepEqual(outcome.result.structuredContent, { ok: true });
        assert.equal(outcome.result.isError, undefined);
        assert.equal(outcome.result.content.length, 1);
        assert.equal(outcome.result.content[0]?.text, "ok=true");
    }
}
// success with no resolved descriptor -> generic veil-safe fallback
{
    const outcome = translateToolCall({
        dispatchResult: okResult({ ok: true }),
    });
    assert.equal(outcome.kind, "toolResult");
    if (outcome.kind === "toolResult") {
        assert.equal(outcome.result.content[0]?.text, "Tool 'unknown' returned a result.");
    }
}
// a resultSummary that leaks an internal anchor is scrubbed to the fallback
{
    const leakyDescriptor: ToolDeclaration = {
        ...readOnlyTestDescriptor,
        resultSummary: () => "leaked material:recording:m_internal here",
    };
    const outcome = translateToolCall({
        descriptor: leakyDescriptor,
        dispatchResult: okResult({ ok: true }),
    });
    assert.equal(outcome.kind, "toolResult");
    if (outcome.kind === "toolResult") {
        assert.equal(outcome.result.content[0]?.text, "Tool 'stage.test.ping' returned a result.");
    }
}
// declared tool error (owning area) -> isError tool result
{
    const outcome = translateToolCall({
        descriptor: readOnlyTestDescriptor,
        dispatchResult: errorResult({
            code: "invalid_input",
            message: "Bad input.",
            area: "stage_core",
            retryable: false,
            suggestedFix: "Use an empty object.",
        }),
    });
    assert.equal(outcome.kind, "toolResult");
    if (outcome.kind === "toolResult") {
        assert.equal(outcome.result.isError, true);
        assert.equal(outcome.result.content[0]?.text, "Bad input.\nSuggested fix: Use an empty object.");
    }
}
// stage_interface.invalid_input / ask_required / denied_by_policy / tool_timeout
// are tool-level -> isError
for (const code of [
    "stage_interface.invalid_input",
    "stage_interface.ask_required",
    "stage_interface.denied_by_policy",
    "stage_interface.tool_timeout",
] as const) {
    const outcome = translateToolCall({
        descriptor: readOnlyTestDescriptor,
        dispatchResult: errorResult({
            code,
            message: `${code} message.`,
            area: "stage_interface",
            retryable: false,
        }),
    });
    assert.equal(outcome.kind, "toolResult", `${code} should be a tool result`);
    if (outcome.kind === "toolResult") {
        assert.equal(outcome.result.isError, true, `${code} should be isError`);
    }
}
// tool_not_found -> JSON-RPC invalid params; other router/system failures ->
// JSON-RPC internal error.
{
    const notFound = translateToolCall({
        dispatchResult: errorResult({
            code: "stage_interface.tool_not_found",
            message: "missing",
            area: "stage_interface",
            retryable: false,
        }),
    });
    assert.equal(notFound.kind, "jsonRpcError");
    if (notFound.kind === "jsonRpcError") {
        assert.equal(notFound.code, JSON_RPC_INVALID_PARAMS);
    }
}
for (const code of [
    "stage_interface.tool_handler_failed",
    "stage_interface.undeclared_tool_error",
    "stage_interface.invalid_output",
    "stage_interface.execution_gate_failed",
] as const) {
    const outcome = translateToolCall({
        descriptor: readOnlyTestDescriptor,
        dispatchResult: errorResult({
            code,
            message: "system failure",
            area: "stage_interface",
            retryable: false,
        }),
    });
    assert.equal(outcome.kind, "jsonRpcError", `${code} should be a JSON-RPC error`);
    if (outcome.kind === "jsonRpcError") {
        assert.equal(outcome.code, JSON_RPC_INTERNAL_ERROR);
    }
}
// an error message that leaks an anchor is scrubbed to the code-only line.
{
    const outcome = translateToolCall({
        descriptor: readOnlyTestDescriptor,
        dispatchResult: errorResult({
            code: "invalid_input",
            message: "leaked material:recording:m_internal",
            area: "stage_core",
            retryable: false,
        }),
    });
    assert.equal(outcome.kind, "toolResult");
    if (outcome.kind === "toolResult") {
        assert.equal(outcome.result.content[0]?.text, "Tool 'stage.test.ping' reported error 'invalid_input'.");
    }
}
// ---------------------------------------------------------------------------
// driver
// ---------------------------------------------------------------------------
type CapturedDispatch = (ctx: StageToolContext, input: ToolCallInput) => Promise<Result<ToolCallOutput>>;
function fakeIo(lines: readonly string[], options: {
    holdOpen?: boolean;
} = {}): {
    io: McpStdioTransportIo;
    written: string[];
    errors: string[];
    closeEof: () => void;
} {
    const written: string[] = [];
    const errors: string[] = [];
    let index = 0;
    let resolveEof: (() => void) | undefined;
    const heldEof = new Promise<null>((resolve) => {
        resolveEof = () => resolve(null);
    });
    return {
        io: {
            async readLine() {
                if (index < lines.length) {
                    return lines[index++] ?? null;
                }
                // holdOpen models a client that stays connected while a tools/call is
                // in flight: readLine blocks at EOF until closeEof() is called, so a
                // deferred dispatch can resolve and write its response BEFORE the
                // transport closes.
                return options.holdOpen === true ? heldEof : null;
            },
            writeLine(line: string) {
                written.push(line);
            },
            logError(message: string) {
                errors.push(message);
            },
        },
        written,
        errors,
        closeEof() {
            resolveEof?.();
        },
    };
}
function fakeFactory(): StageToolContextFactory {
    return {
        createToolContext(perCall) {
            return createStageToolContext({
                ownerScope: "local",
                sessionId: perCall.sessionId,
                requestId: perCall.requestId,
                clock: () => "2026-06-18T00:00:00.000Z",
                handleMinting: {
                    async mint() {
                        return "stub-handle";
                    },
                    async resolve() {
                        return undefined;
                    },
                },
                executionGate: {
                    async preflight() {
                        return { decision: "allow", auditLevel: "metadata" };
                    },
                },
                ...(perCall.abortSignal === undefined ? {} : { abortSignal: perCall.abortSignal }),
            });
        },
    };
}
function portsFor(tools: readonly ToolDeclaration[], dispatch: CapturedDispatch): McpStdioTransportPorts {
    return {
        dispatch,
        contextFactory: fakeFactory(),
        tools,
        serverInfo: SERVER_INFO,
        protocolVersion: PROTOCOL_VERSION,
    };
}
async function flushMicrotasks(rounds = 32): Promise<void> {
    for (let i = 0; i < rounds; i += 1) {
        await Promise.resolve();
    }
}
function line(obj: unknown): string {
    return JSON.stringify(obj);
}
// initialize / tools/list / ping / notifications are synchronous and complete
// before run() returns.
{
    const harness = fakeIo([
        line({ jsonrpc: "2.0", id: 1, method: "initialize" }),
        line({ jsonrpc: "2.0", method: "notifications/initialized" }),
        line({ jsonrpc: "2.0", id: 2, method: "ping" }),
        line({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
    ]);
    await createMcpStdioTransport({
        ports: portsFor([readOnlyTestDescriptor, writeTestDescriptor], async () => okResult({ ok: true })),
        io: harness.io,
    }).serve();
    const responses = harness.written.map((entry) => JSON.parse(entry));
    assert.equal(responses.length, 3);
    const init = responses[0];
    assert.equal(init.id, 1);
    assert.equal(init.result.protocolVersion, PROTOCOL_VERSION);
    assert.deepEqual(init.result.capabilities, { tools: {} });
    assert.deepEqual(init.result.serverInfo, SERVER_INFO);
    assert.deepEqual(responses[1], { jsonrpc: "2.0", id: 2, result: {} });
    const list = responses[2];
    assert.equal(list.id, 3);
    assert.equal(list.result.tools.length, 2);
    assert.equal(list.result.tools[0].name, "stage_test_ping");
    assert.deepEqual(list.result.tools[0].annotations, { readOnlyHint: true });
    assert.equal(list.result.tools[1].annotations, undefined);
}
// unknown method -> method not found; parse error -> null id; invalid -> echoed id.
{
    const harness = fakeIo([
        "not json",
        line({ jsonrpc: "2.0", id: 9, method: "tools/upgrade" }),
        line({ jsonrpc: "1.0", id: 10, method: "ping" }),
    ]);
    await createMcpStdioTransport({
        ports: portsFor([], async () => okResult({ ok: true })),
        io: harness.io,
    }).serve();
    const responses = harness.written.map((entry) => JSON.parse(entry));
    assert.equal(responses[0].id, null);
    assert.equal(responses[0].error.code, JSON_RPC_PARSE_ERROR);
    assert.equal(responses[1].error.code, JSON_RPC_METHOD_NOT_FOUND);
    assert.equal(responses[2].id, 10);
    assert.equal(responses[2].error.code, JSON_RPC_INVALID_REQUEST);
}
// tools/call success: a held-open connection lets the fire-and-forget call
// resolve and write its response while the transport is still open.
{
    let resolver: ((value: Result<ToolCallOutput>) => void) | undefined;
    const pending = new Promise<Result<ToolCallOutput>>((resolve) => {
        resolver = resolve;
    });
    const harness = fakeIo([
        line({
            jsonrpc: "2.0",
            id: 5,
            method: "tools/call",
            params: { name: "stage_test_ping", arguments: {} },
        }),
    ], { holdOpen: true });
    const runPromise = createMcpStdioTransport({
        ports: portsFor([readOnlyTestDescriptor], async () => pending),
        io: harness.io,
    }).serve();
    await flushMicrotasks();
    // Nothing written yet: the call awaits the deferred dispatch.
    assert.equal(harness.written.length, 0);
    resolver?.(okResult({ ok: true }));
    await flushMicrotasks();
    assert.equal(harness.written.length, 1);
    const response = JSON.parse(harness.written[0] ?? "{}");
    assert.equal(response.id, 5);
    assert.deepEqual(response.result.structuredContent, { ok: true });
    assert.equal(response.result.content[0]?.text, "ok=true");
    assert.equal(response.result.isError, undefined);
    harness.closeEof();
    await runPromise;
}
// tools/call declared error -> isError result.
{
    let resolver: ((value: Result<ToolCallOutput>) => void) | undefined;
    const pending = new Promise<Result<ToolCallOutput>>((resolve) => {
        resolver = resolve;
    });
    const harness = fakeIo([
        line({
            jsonrpc: "2.0",
            id: 6,
            method: "tools/call",
            params: { name: "stage_test_ping", arguments: {} },
        }),
    ], { holdOpen: true });
    const runPromise = createMcpStdioTransport({
        ports: portsFor([readOnlyTestDescriptor], async () => pending),
        io: harness.io,
    }).serve();
    await flushMicrotasks();
    resolver?.(errorResult({
        code: "invalid_input",
        message: "Bad input.",
        area: "stage_core",
        retryable: false,
    }));
    await flushMicrotasks();
    const response = JSON.parse(harness.written[0] ?? "{}");
    assert.equal(response.id, 6);
    assert.equal(response.result.isError, true);
    assert.equal(response.result.content[0]?.text, "Bad input.");
    harness.closeEof();
    await runPromise;
}
// tools/call unknown tool -> JSON-RPC error response.
{
    let resolver: ((value: Result<ToolCallOutput>) => void) | undefined;
    const pending = new Promise<Result<ToolCallOutput>>((resolve) => {
        resolver = resolve;
    });
    const harness = fakeIo([
        line({
            jsonrpc: "2.0",
            id: 7,
            method: "tools/call",
            params: { name: "stage_test_missing", arguments: {} },
        }),
    ], { holdOpen: true });
    const runPromise = createMcpStdioTransport({
        ports: portsFor([readOnlyTestDescriptor], async () => pending),
        io: harness.io,
    }).serve();
    await flushMicrotasks();
    resolver?.(errorResult({
        code: "stage_interface.tool_not_found",
        message: "not registered",
        area: "stage_interface",
        retryable: false,
    }));
    await flushMicrotasks();
    const response = JSON.parse(harness.written[0] ?? "{}");
    assert.equal(response.id, 7);
    assert.equal(response.error.code, JSON_RPC_INVALID_PARAMS);
    harness.closeEof();
    await runPromise;
}
// notifications/cancelled aborts the in-flight tools/call via its shared signal.
{
    let capturedSignal: AbortSignal | undefined;
    let resolver: ((value: Result<ToolCallOutput>) => void) | undefined;
    const pending = new Promise<Result<ToolCallOutput>>((resolve) => {
        resolver = resolve;
    });
    const harness = fakeIo([
        line({
            jsonrpc: "2.0",
            id: 8,
            method: "tools/call",
            params: { name: "stage_test_ping", arguments: {} },
        }),
        line({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 8 } }),
    ], { holdOpen: true });
    const runPromise = createMcpStdioTransport({
        ports: portsFor([readOnlyTestDescriptor], async (ctx) => {
            capturedSignal = ctx.abortSignal;
            return pending;
        }),
        io: harness.io,
    }).serve();
    await flushMicrotasks();
    // The cancel notification was processed; the in-flight signal is now aborted.
    // No response yet because dispatch is still pending.
    assert.equal(capturedSignal?.aborted, true);
    assert.equal(harness.written.length, 0);
    resolver?.(okResult({ ok: true }));
    await flushMicrotasks();
    // After the call completes (the cancel was a no-op for the uncooperative fake
    // dispatch), its response is written; the wiring is proven by the aborted
    // signal above.
    assert.equal(harness.written.length, 1);
    assert.equal(JSON.parse(harness.written[0] ?? "{}").id, 8);
    harness.closeEof();
    await runPromise;
}
// A cancel for an unknown or already-completed request is a silent no-op.
{
    const harness = fakeIo([
        line({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 999 } }),
    ]);
    await createMcpStdioTransport({
        ports: portsFor([], async () => okResult({ ok: true })),
        io: harness.io,
    }).serve();
    assert.equal(harness.written.length, 0);
}
// An unexpected dispatch throw becomes a JSON-RPC internal error, never success.
{
    const harness = fakeIo([
        line({
            jsonrpc: "2.0",
            id: 11,
            method: "tools/call",
            params: { name: "stage_test_ping", arguments: {} },
        }),
    ], { holdOpen: true });
    const runPromise = createMcpStdioTransport({
        ports: portsFor([readOnlyTestDescriptor], async () => {
            throw new Error("unexpected meltdown");
        }),
        io: harness.io,
    }).serve();
    await flushMicrotasks();
    assert.equal(harness.errors.length, 1);
    const response = JSON.parse(harness.written[0] ?? "{}");
    assert.equal(response.id, 11);
    assert.equal(response.error.code, JSON_RPC_INTERNAL_ERROR);
    harness.closeEof();
    await runPromise;
}
// A tools/call still in flight at EOF is aborted; its late response is dropped
// rather than written past the closed transport.
{
    let resolver: ((value: Result<ToolCallOutput>) => void) | undefined;
    const pending = new Promise<Result<ToolCallOutput>>((resolve) => {
        resolver = resolve;
    });
    const harness = fakeIo([
        line({
            jsonrpc: "2.0",
            id: 12,
            method: "tools/call",
            params: { name: "stage_test_ping", arguments: {} },
        }),
    ]);
    await createMcpStdioTransport({
        ports: portsFor([readOnlyTestDescriptor], async () => pending),
        io: harness.io,
    }).serve();
    // run() returned at EOF with the call still pending; nothing written.
    assert.equal(harness.written.length, 0);
    resolver?.(okResult({ ok: true }));
    await flushMicrotasks();
    // Late resolution after EOF is dropped: the transport is closed.
    assert.equal(harness.written.length, 0);
}
// A stdout write failure (broken pipe) on a synchronous response is absorbed by
// the transport boundary and reported to diagnostics; it never escapes run().
{
    const harness = fakeIo([
        line({ jsonrpc: "2.0", id: 13, method: "ping" }),
    ]);
    harness.io.writeLine = () => {
        throw new Error("EPIPE");
    };
    await createMcpStdioTransport({
        ports: portsFor([], async () => okResult({ ok: true })),
        io: harness.io,
    }).serve();
    assert.equal(harness.errors.length, 1);
    assert.equal(harness.errors[0]?.includes("transport write failed"), true);
}
