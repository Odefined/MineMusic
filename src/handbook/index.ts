import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  Handbook,
  HandbookInstrumentEntry,
  HandbookToolEntry,
  InstrumentDescriptor,
  Result,
  StageError,
  ToolName,
} from "../contracts/index.js";

export function buildInstrumentHandbook(instruments: InstrumentDescriptor[]): Handbook {
  const content = renderInstrumentHandbook(instruments);

  return {
    revision: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    content,
    instruments: structuredClone(instruments),
  };
}

export async function writeInstrumentHandbookFile(input: {
  path: string;
  instruments: InstrumentDescriptor[];
}): Promise<Result<Handbook>> {
  const handbook = buildInstrumentHandbook(input.instruments);

  try {
    await mkdir(dirname(input.path), { recursive: true });
    await writeFile(input.path, handbook.content, "utf8");
  } catch (cause) {
    return fail({
      code: "storage.unavailable",
      message: `Could not write MineMusic instrument handbook to '${input.path}'.`,
      module: "storage",
      retryable: true,
      cause,
    });
  }

  return ok(handbook);
}

export function readHandbookInstrument(input: {
  instruments: InstrumentDescriptor[];
  instrumentId: string;
}): Result<HandbookInstrumentEntry> {
  const instrument = input.instruments.find((candidate) => candidate.id === input.instrumentId);

  if (instrument === undefined) {
    return fail({
      code: "stage_interface.tool_not_found",
      message: `Instrument '${input.instrumentId}' is not available.`,
      module: "stage_interface",
      retryable: false,
    });
  }

  return ok({
    instrument: structuredClone(instrument),
    content: renderInstrumentSection(instrument),
  });
}

export function readHandbookTool(input: {
  instruments: InstrumentDescriptor[];
  toolName: ToolName | string;
}): Result<HandbookToolEntry> {
  for (const instrument of input.instruments) {
    const tool = instrument.tools.find((candidate) => candidate.name === input.toolName);

    if (tool !== undefined) {
      return ok({
        instrument: {
          id: instrument.id,
          label: instrument.label,
        },
        tool: structuredClone(tool),
        content: renderToolSection(tool),
      });
    }
  }

  return fail({
    code: "stage_interface.tool_not_found",
    message: `Tool '${String(input.toolName)}' is not available.`,
    module: "stage_interface",
    retryable: false,
  });
}

function renderInstrumentHandbook(instruments: InstrumentDescriptor[]): string {
  const lines = [
    "# MineMusic Instrument Handbook",
    "",
    "Generated from the current agent-visible Instrument Catalog.",
    "",
    "## Instruments",
    "",
    ...instruments.flatMap((instrument) => renderInstrumentSection(instrument).trimEnd().split("\n")),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function renderInstrumentSection(instrument: InstrumentDescriptor): string {
  return [
    `### ${instrument.label} (\`${instrument.id}\`)`,
    "",
    ...instrument.tools.flatMap((tool) => renderToolSection(tool).trimEnd().split("\n")),
    "",
  ].join("\n");
}

function renderToolSection(tool: InstrumentDescriptor["tools"][number]): string {
  const lines = [
    `#### \`${tool.name}\``,
    "",
    `Description: ${tool.description}`,
    `Input: \`${tool.inputSchemaRef}\``,
    `Output: \`${tool.outputSchemaRef}\``,
  ];

  if (tool.effectKind !== undefined) {
    lines.push(`Effect kind: \`${tool.effectKind}\``);
  }

  lines.push("");

  return lines.join("\n");
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
