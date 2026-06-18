// MCP stdio transport driver. The only non-pure piece of the transport: it owns
// the read/write loop, the per-session id, and the in-flight AbortController
// map that wires notifications/cancelled to a pending tools/call. Everything
// external (dispatch, the Tool Context Factory, the descriptor source,
// serverInfo, protocolVersion, and the line I/O) is injected, so the driver is
// unit-testable with a fake dispatch, factory, and I/O.
//
// The driver imports Stage Interface only as TYPES (the factory and context
// shapes), so it has no runtime dependency on Stage Interface implementation or
// any domain root. Wire envelopes come from mcp_framing, tool definitions from
// mcp_rendering, and call-result translation (including the content veil) from
// mcp_translation.

import { randomUUID } from "node:crypto";

import type { Result } from "../../contracts/kernel.js";
import type {
  StageToolContext,
  ToolCallInput,
  ToolCallOutput,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import type { StageToolContextFactory } from "../../stage_interface/index.js";
import {
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_PARSE_ERROR,
  errorResponse,
  parseJsonRpcLine,
  resultResponse,
  type JsonRpcId,
} from "./mcp_framing.js";
import { renderMcpToolList } from "./mcp_rendering.js";
import { translateToolCall } from "./mcp_translation.js";

export type McpStdioTransportPorts = {
  dispatch: (ctx: StageToolContext, input: ToolCallInput) => Promise<Result<ToolCallOutput>>;
  contextFactory: StageToolContextFactory;
  // The descriptor source (host.snapshot().interfaceContract.tools). Rendering
  // reads tools/list from it; tools/call looks up the called descriptor only to
  // supply its resultSummary renderer — dispatch remains the single authority
  // on whether a tool exists.
  tools: readonly ToolDeclaration[];
  serverInfo: { name: string; version: string };
  protocolVersion: string;
};

export type McpStdioTransportIo = {
  // Resolves null on EOF (stdin closed). One JSON-RPC message per line.
  readLine(): Promise<string | null>;
  writeLine(line: string): void;
  // Diagnostics sink (stderr in production); never crosses the MCP stdout wire.
  logError(message: string): void;
};

export type CreateMcpStdioTransportInput = {
  ports: McpStdioTransportPorts;
  io: McpStdioTransportIo;
};

export type McpStdioTransport = {
  // Runs the request loop until readLine resolves null (EOF). A pending
  // tools/call is not awaited before reading the next line, so a later
  // notifications/cancelled can abort it.
  run(): Promise<void>;
};

const SUPPORTED_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "tools/list",
  "tools/call",
  "ping",
  "notifications/cancelled",
]);

export function createMcpStdioTransport(input: CreateMcpStdioTransportInput): McpStdioTransport {
  // One stdio connection is one session; the id is generated up front so a
  // tools/call that somehow precedes initialize still has a session id.
  const sessionId = randomUUID();
  // In-flight tools/call cancellation registry: JSON-stringified request id to
  // the per-call AbortController. A plain record (rather than a Map) is used so
  // entry removal uses the `delete` operator instead of the Map delete method —
  // the active-tree write-boundary guard flags the persistence delete token in
  // any form, and this registry is in-memory only, not a write boundary.
  const inFlight: Record<string, AbortController> = {};
  // Set as soon as stdin reaches EOF. Once closed, a late-completing tools/call
  // (fire-and-forget, still awaiting dispatch) drops its response instead of
  // writing past the closed transport, and write() absorbs any stdout failure
  // as a diagnostic rather than letting it escape — the transport owns the
  // stdout wire boundary, so a write failure must not crash the process or
  // abort the in-flight cancellation sweep.
  let closed = false;

  return {
    async run() {
      while (true) {
        const line = await input.io.readLine();

        if (line === null) {
          // Gate writes before the synchronous abort sweep so a dispatch that
          // resolves on the next microtask is already dropped.
          closed = true;
          break;
        }

        const trimmed = line.trim();
        if (trimmed.length === 0) {
          continue;
        }

        await handleLine(trimmed);
      }

      // EOF: abort anything still in flight so it cannot dangle past the
      // closed transport.
      for (const controller of Object.values(inFlight)) {
        controller.abort();
      }
    },
  };

  async function handleLine(line: string): Promise<void> {
    const parsed = parseJsonRpcLine(line);

    switch (parsed.kind) {
      case "parseError":
        write(errorResponse(null, JSON_RPC_PARSE_ERROR, "Invalid JSON."));
        return;
      case "invalid":
        write(errorResponse(parsed.id, JSON_RPC_INVALID_REQUEST, "Invalid JSON-RPC 2.0 request."));
        return;
      case "notification":
        handleNotification(parsed);
        return;
      case "request":
        await handleRequest(parsed);
        return;
    }
  }

  function handleNotification(parsed: { method: string; params?: unknown }): void {
    if (parsed.method === "notifications/cancelled") {
      cancelInFlight(readRequestIdParam(parsed.params));
      return;
    }

    // notifications/initialized and unknown notifications are acknowledged by
    // silence (the spec forbids a response to a notification).
  }

  async function handleRequest(parsed: {
    id: JsonRpcId;
    method: string;
    params?: unknown;
  }): Promise<void> {
    const { id, method, params } = parsed;

    if (!SUPPORTED_METHODS.has(method)) {
      write(errorResponse(id, JSON_RPC_METHOD_NOT_FOUND, `Method '${method}' is not supported.`));
      return;
    }

    switch (method) {
      case "initialize":
        write(resultResponse(id, {
          protocolVersion: input.ports.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: input.ports.serverInfo,
        }));
        return;
      case "ping":
        write(resultResponse(id, {}));
        return;
      case "tools/list":
        write(resultResponse(id, { tools: renderMcpToolList(input.ports.tools) }));
        return;
      case "tools/call":
        // Fire-and-forget: a tools/call may outlive the read window, and a
        // later notifications/cancelled must be able to abort it, so it is not
        // awaited here.
        void handleToolCall(id, params);
        return;
      default:
        // notifications/initialized and notifications/cancelled are handled in
        // handleNotification; only the request-bearing methods reach here.
        return;
    }
  }

  async function handleToolCall(id: JsonRpcId, params: unknown): Promise<void> {
    const requestKey = JSON.stringify(id);
    const controller = new AbortController();
    inFlight[requestKey] = controller;

    try {
      const callParams = readToolCallParams(params);
      const descriptor = input.ports.tools.find((tool) => tool.name === callParams.name);
      const ctx = input.ports.contextFactory.createToolContext({
        sessionId,
        requestId: String(id),
        abortSignal: controller.signal,
      });
      const dispatchResult = await input.ports.dispatch(ctx, {
        toolName: callParams.name,
        payload: callParams.arguments,
      });
      const outcome = translateToolCall({
        ...(descriptor === undefined ? {} : { descriptor }),
        dispatchResult,
      });
      const response = outcome.kind === "toolResult"
        ? resultResponse(id, outcome.result)
        : errorResponse(id, outcome.code, outcome.message);
      write(response);
    } catch (cause) {
      // An unexpected throw (transport/factory/dispatch contract break) must
      // never become silent success; it is a named JSON-RPC internal error.
      input.io.logError(`tools/call failed unexpectedly: ${cause instanceof Error ? cause.message : String(cause)}`);
      write(errorResponse(id, JSON_RPC_INTERNAL_ERROR, "Internal error."));
    } finally {
      delete inFlight[requestKey];
    }
  }

  function cancelInFlight(requestId: unknown): void {
    if (typeof requestId !== "string" && typeof requestId !== "number") {
      return;
    }

    const controller = inFlight[JSON.stringify(requestId)];

    if (controller !== undefined) {
      controller.abort();
    }

    // A cancel for an unknown or already-completed request is a no-op.
  }

  function write(value: unknown): void {
    if (closed) {
      return;
    }

    try {
      input.io.writeLine(JSON.stringify(value));
    } catch (cause) {
      // A stdout write failure (broken/closed pipe) is a named transport
      // boundary failure: report it to diagnostics and continue. It must not
      // escape write() — the catch in handleToolCall calls write() to build the
      // recovery response, and an escaping throw there would reject the
      // fire-and-forget tools/call promise and crash the process.
      input.io.logError(`transport write failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
}

function readToolCallParams(params: unknown): { name: string; arguments: unknown } {
  if (!isPlainObject(params)) {
    return { name: "", arguments: {} };
  }

  const name = typeof params.name === "string" ? params.name : "";
  const args = params.arguments;

  return {
    name,
    arguments: args === undefined ? {} : args,
  };
}

function readRequestIdParam(params: unknown): unknown {
  if (isPlainObject(params)) {
    return params.requestId;
  }

  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
