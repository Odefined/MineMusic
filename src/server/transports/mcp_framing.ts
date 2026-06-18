// MCP JSON-RPC 2.0 framing for the line-delimited stdio transport. Pure: it
// parses one inbound line into a typed message and serializes outbound
// responses. It owns no I/O and no mutable state — the stdio driver owns the
// line stream and the in-flight cancellation map.
//
// Only the JSON-RPC envelope lives here (request / notification / response /
// error). MCP tool-definition and call-result shapes live in the rendering and
// translation modules. This module imports nothing else.

export const JSON_RPC_VERSION = "2.0" as const;

// Standard JSON-RPC 2.0 error codes. Parse/invalid errors carry a null id
// (the request id could not be trusted); the rest echo the request id.
export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_INTERNAL_ERROR = -32603;

export type JsonRpcId = number | string;

export type JsonRpcRequest = {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: typeof JSON_RPC_VERSION;
  method: string;
  params?: unknown;
};

export type JsonRpcResponseResult = {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcResponseError = {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId | null;
  error: { code: number; message: string; data?: unknown };
};

// A parsed inbound line. `request` carries an id and expects a response;
// `notification` carries no id and expects none. `parseError` means the line
// was not valid JSON; `invalid` means it was JSON but not a well-formed 2.0
// request/notification. Both error kinds require a JSON-RPC error response,
// using null id for parse errors and the parsed id (when trustworthy) for
// invalid requests.
export type ParsedJsonRpc =
  | { kind: "request"; id: JsonRpcId; method: string; params?: unknown }
  | { kind: "notification"; method: string; params?: unknown }
  | { kind: "parseError" }
  | { kind: "invalid"; id: JsonRpcId | null };

export function parseJsonRpcLine(line: string): ParsedJsonRpc {
  let parsed: unknown;

  try {
    parsed = JSON.parse(line);
  } catch {
    return { kind: "parseError" };
  }

  if (!isPlainObject(parsed)) {
    return { kind: "invalid", id: null };
  }

  // A well-formed 2.0 request/notification must declare the version and a
  // non-empty method. The id (when present) must be a number or string;
  // null/array/object ids are treated as invalid rather than trusted.
  if (parsed.jsonrpc !== JSON_RPC_VERSION) {
    return { kind: "invalid", id: readIdOrNull(parsed.id) };
  }

  if (typeof parsed.method !== "string" || parsed.method.length === 0) {
    return { kind: "invalid", id: readIdOrNull(parsed.id) };
  }

  const hasId = Object.prototype.hasOwnProperty.call(parsed, "id");

  if (!hasId) {
    return notification(parsed.method, parsed.params);
  }

  const id = parsed.id;
  if (typeof id !== "number" && typeof id !== "string") {
    return { kind: "invalid", id: null };
  }

  return { kind: "request", id, method: parsed.method, ...(parsed.params === undefined ? {} : { params: parsed.params }) };
}

export function resultResponse(id: JsonRpcId, result: unknown): JsonRpcResponseResult {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    result,
  };
}

export function errorResponse(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponseError {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function notification(method: string, params: unknown): ParsedJsonRpc {
  return {
    kind: "notification",
    method,
    ...(params === undefined ? {} : { params }),
  };
}

function readIdOrNull(id: unknown): JsonRpcId | null {
  if (typeof id === "number" || typeof id === "string") {
    return id;
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
