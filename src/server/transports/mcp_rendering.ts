// MCP tools/list rendering: maps a MineMusic ToolDeclaration to an MCP tool
// definition. Pure data transformation over the already-veil-guarded public
// descriptor surface — it stitches the mandatory ADR-0014 guidance into the
// single MCP description string, passes the generated input/output schemas
// through unchanged, and derives static MCP annotations. It imports only the
// contract TYPE (type-only), so this module has no runtime dependency on any
// Stage Interface implementation or domain root.
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
  ToolExample,
} from "../../contracts/stage_interface.js";

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
  return descriptors.map(renderMcpTool);
}

export function renderMcpTool(descriptor: ToolDeclaration): McpToolDefinition {
  const annotations = deriveMcpAnnotations(descriptor);

  return {
    name: descriptor.name,
    description: stitchToolDescription(descriptor),
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
    ...(annotations === undefined ? {} : { annotations }),
  };
}

export function stitchToolDescription(descriptor: ToolDeclaration): string {
  const lines: string[] = [descriptor.description];

  lines.push("");
  lines.push("When to use:");
  lines.push(`- ${descriptor.usage.useWhen}`);
  lines.push("When NOT to use:");
  lines.push(`- ${descriptor.usage.doNotUseWhen}`);
  lines.push("Output:");
  lines.push(`- ${descriptor.usage.outputSemantics}`);

  if (descriptor.examples.length > 0) {
    lines.push("");
    lines.push("Examples:");
    for (const example of descriptor.examples) {
      lines.push(`- ${formatExample(example)}`);
    }
  }

  return lines.join("\n");
}

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

function formatExample(example: ToolExample): string {
  const quoted = `"${example.prompt}" -> ${example.expects}`;

  if (example.note === undefined || example.note.length === 0) {
    return quoted;
  }

  return `${quoted} (${example.note})`;
}

function hasAnyHint(annotations: McpToolAnnotations): boolean {
  return annotations.readOnlyHint !== undefined ||
    annotations.destructiveHint !== undefined ||
    annotations.idempotentHint !== undefined ||
    annotations.openWorldHint !== undefined;
}
