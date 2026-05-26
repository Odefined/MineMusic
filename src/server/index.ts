import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { createMineMusicMcpServer } from "../surfaces/mcp/server.js";
import {
  createDefaultMineMusicServerRuntime,
  type MineMusicServerRuntime,
} from "./runtime.js";

export type MineMusicServerOptions = {
  host?: string;
  port?: number;
  path?: string;
  runtime?: MineMusicServerRuntime;
};

export type RunningMineMusicServer = {
  endpointUrl: string;
  host: string;
  port: number;
  path: string;
  runtime: MineMusicServerRuntime;
  close: () => Promise<void>;
};

const defaultHost = "127.0.0.1";
const defaultPort = 37373;
const defaultPath = "/mcp";

export async function runMineMusicServer(options: MineMusicServerOptions = {}): Promise<RunningMineMusicServer> {
  const runtime = options.runtime ?? createDefaultMineMusicServerRuntime();
  const host = options.host ?? process.env.MINEMUSIC_SERVER_HOST ?? defaultHost;
  const port = options.port ?? parseServerPort(process.env.MINEMUSIC_SERVER_PORT);
  const path = normalizePath(options.path ?? process.env.MINEMUSIC_MCP_PATH ?? defaultPath);

  await runtime.ready;

  const httpServer = createServer(async (request, response) => {
    try {
      await handleRequest({ request, response, runtime, path });
    } catch (error) {
      console.error(error);
      writeJsonRpcError(response, 500, -32603, "Internal server error");
    }
  });

  await listen(httpServer, port, host);

  const boundPort = resolveBoundPort(httpServer);

  return {
    endpointUrl: `http://${host}:${boundPort}${path}`,
    host,
    port: boundPort,
    path,
    runtime,
    close: async () => {
      await closeHttpServer(httpServer);
    },
  };
}

type RequestContext = {
  request: IncomingMessage;
  response: ServerResponse;
  runtime: MineMusicServerRuntime;
  path: string;
};

async function handleRequest(context: RequestContext): Promise<void> {
  const { request, response, path } = context;
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname !== path) {
    writeJson(response, 404, { error: "not_found" });
    return;
  }

  if (request.method === "POST") {
    await handleMcpPost(context);
    return;
  }

  if (request.method === "GET" || request.method === "DELETE") {
    await handleMcpSessionRequest(context);
    return;
  }

  writeJson(response, 405, { error: "method_not_allowed" });
}

async function handleMcpPost({ request, response, runtime }: RequestContext): Promise<void> {
  const body = await readJsonBody(request);
  const transport = new StreamableHTTPServerTransport();
  const mcpServer = createMineMusicMcpServer(runtime);
  let closed = false;
  const closeMcpRequest = async () => {
    if (closed) {
      return;
    }

    closed = true;
    await transport.close().catch(() => {});
    await mcpServer.close().catch(() => {});
  };

  response.once("close", () => {
    void closeMcpRequest();
  });

  try {
    await mcpServer.connect(transport as Transport);
    await transport.handleRequest(request, response, body);
  } catch (error) {
    await closeMcpRequest();
    throw error;
  }
}

async function handleMcpSessionRequest({ response }: RequestContext): Promise<void> {
  writeJsonRpcError(response, 405, -32000, "Method not allowed.");
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  return raw.length === 0 ? undefined : JSON.parse(raw);
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  if (response.headersSent) {
    return;
  }

  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function writeJsonRpcError(
  response: ServerResponse,
  statusCode: number,
  code: number,
  message: string,
): void {
  writeJson(response, statusCode, {
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

function parseServerPort(raw: string | undefined): number {
  if (raw === undefined) {
    return defaultPort;
  }

  const port = Number.parseInt(raw, 10);

  return Number.isFinite(port) && port >= 0 ? port : defaultPort;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function listen(httpServer: HttpServer, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
}

function closeHttpServer(httpServer: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

function resolveBoundPort(httpServer: HttpServer): number {
  const address = httpServer.address();

  if (typeof address === "object" && address !== null) {
    return address.port;
  }

  return defaultPort;
}

if (isDirectRun()) {
  runMineMusicServer()
    .then((server) => {
      console.error(`MineMusic server listening at ${server.endpointUrl}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];

  if (entrypoint === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(entrypoint).href;
}
