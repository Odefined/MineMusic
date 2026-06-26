import type {
  ToolDeclaration,
  ToolExample,
} from "../contracts/stage_interface.js";

export function renderModelVisibleToolDescription(descriptor: ToolDeclaration): string {
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

function formatExample(example: ToolExample): string {
  const quoted = `"${example.prompt}" -> ${example.expects}`;

  if (example.note === undefined || example.note.length === 0) {
    return quoted;
  }

  return `${quoted} (${example.note})`;
}
