// MCP tools/list rendering: maps a MineMusic ToolDeclaration to an MCP tool
// definition. Pure data transformation over the already-veil-guarded public
// descriptor surface — it stitches the mandatory ADR-0014 guidance into the
// single MCP description string, passes the generated input/output schemas
// through unchanged, and derives static MCP annotations. It imports only the
// Stage Interface's pure model-visible description renderer, so the MCP and
// embedded-agent tool surfaces do not fork their guidance text.
//
// Annotation source: MineMusic's invocationPolicy already declares the
// model-facing read-only and destructiveness posture, which is the
// semantically correct MCP hint (a logically read-only tool like lookup still
// writes a runtime cursor and calls a provider, so a side-effect-only
// derivation would mislabel it). openWorldHint maps to the open_world data
// egress. idempotentHint is omitted in v1: ToolSideEffect carries no
// idempotency signal today, and overclaiming it would be worse than omitting.

import type {
  JsonSchema,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import { renderModelVisibleToolDescription } from "../../stage_interface/tool_description_rendering.js";
import {
  assertUniqueProviderSafeToolNames,
  toProviderSafeToolName,
} from "../../stage_interface/provider_safe_tool_name.js";

export type McpToolAnnotations = {
  readOnlyHint?: true;
  destructiveHint?: true;
  idempotentHint?: true;
  openWorldHint?: true;
};

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations?: McpToolAnnotations;
};

export function renderMcpToolList(descriptors: readonly ToolDeclaration[]): McpToolDefinition[] {
  assertUniqueProviderSafeToolNames(descriptors);
  return descriptors.map(renderMcpTool);
}

// MCP tool names must match `^[a-zA-Z0-9_-]{1,64}$` (SEP-986, and the Anthropic
// API tool-name rule). MineMusic's internal Public Agent Protocol names use a
// dotted namespace (`music.discovery.lookup`), so the transport maps them
// through the shared provider-safe tool-name helper at the MCP boundary. The
// internal descriptor.name (and dispatch, instrumentId, formal vocabulary)
// keeps its dots; only the MCP-exposed name is provider-safe. The driver keeps
// a provider-safe-name -> descriptor lookup so a tools/call round-trips back to
// the internal dotted name for dispatch.
export function toMcpToolName(internalName: string): string {
  return toProviderSafeToolName(internalName);
}

export function renderMcpTool(descriptor: ToolDeclaration): McpToolDefinition {
  const annotations = deriveMcpAnnotations(descriptor);

  return {
    name: toMcpToolName(descriptor.name),
    description: renderModelVisibleToolDescription(descriptor),
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
    ...(annotations === undefined ? {} : { annotations }),
  };
}

export { renderModelVisibleToolDescription as stitchToolDescription };

export function deriveMcpAnnotations(descriptor: ToolDeclaration): McpToolAnnotations | undefined {
  const annotations: McpToolAnnotations = {};
  const policy = descriptor.invocationPolicy;

  if (policy.readOnlyHint) {
    annotations.readOnlyHint = true;
  }

  if (policy.destructiveHint) {
    annotations.destructiveHint = true;
  }

  if (policy.dataEgress === "open_world") {
    annotations.openWorldHint = true;
  }

  return hasAnyHint(annotations) ? annotations : undefined;
}

function hasAnyHint(annotations: McpToolAnnotations): boolean {
  return annotations.readOnlyHint !== undefined ||
    annotations.destructiveHint !== undefined ||
    annotations.idempotentHint !== undefined ||
    annotations.openWorldHint !== undefined;
}
