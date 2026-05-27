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
    ...renderInstrumentGuidance(instrument),
    ...renderProviderSection(instrument),
    ...instrument.tools.flatMap((tool) => renderToolSection(tool).trimEnd().split("\n")),
    "",
  ].join("\n");
}

function renderInstrumentGuidance(instrument: InstrumentDescriptor): string[] {
  if (instrument.id !== "minemusic.canonical_review") {
    return [];
  }

  return [
    "Sequence: enter `canonical_review` posture, read `stage.context.read`, list provisional recordings with small pages and no cursor until no items remain, use summary inspect by default, request detail only for release appearances or selected release track positions, then apply `update` with `selectedProviderRefToken` and a short reason or `defer` with a short reason.",
    "List defaults to reviewed-subject suppression for the current session; pass `excludeReviewed: false` only when you need explicit cursor pagination over all provisional recordings.",
    "Detail requires the latest `inspectionId` plus a selected `recordingRefToken`. `releaseAppearances` returns release tokens; `releaseTrackPositions` requires `releaseRefTokens` from that current inspection.",
    "Inspect returns compact facts, not recommendations. Do not request raw/full inspection output.",
    "",
  ];
}

function renderProviderSection(instrument: InstrumentDescriptor): string[] {
  if (instrument.providers === undefined || instrument.providers.length === 0) {
    return [];
  }

  const lines = [
    "#### Providers",
    "",
  ];

  for (const provider of instrument.providers) {
    lines.push(`- ${provider.label} (\`${provider.id}\`, slot \`${provider.slot}\`)`);
    lines.push(`  Status: \`${provider.status}\``);

    if (provider.authentication !== undefined) {
      lines.push(`  Authentication: \`${provider.authentication}\``);
    }

    if (provider.operations !== undefined && provider.operations.length > 0) {
      lines.push(`  Operations: ${provider.operations.map((operation) => `\`${operation}\``).join(", ")}`);
    }

    if (provider.areas !== undefined && provider.areas.length > 0) {
      lines.push("  Areas:");

      for (const area of provider.areas) {
        const description = area.description === undefined ? "" : ` - ${area.description}`;
        lines.push(`  - ${area.label} (\`${area.id}\`): \`${area.availability}\`${description}`);
      }
    }

    if (provider.knowledge !== undefined) {
      const { formats, entityKinds, expansions, relationFocuses, boundaryNotes } = provider.knowledge;

      if (formats !== undefined && formats.length > 0) {
        lines.push(`  Formats: ${formats.map((format) => `\`${format}\``).join(", ")}`);
      }

      if (entityKinds !== undefined && entityKinds.length > 0) {
        lines.push(`  Entity kinds: ${entityKinds.map((kind) => `\`${kind}\``).join(", ")}`);
      }

      if (expansions !== undefined && expansions.length > 0) {
        lines.push(`  Expansions: ${expansions.map((expansion) => `\`${expansion}\``).join(", ")}`);
      }

      if (relationFocuses !== undefined && relationFocuses.length > 0) {
        lines.push(`  Relation focus: ${relationFocuses.map((focus) => `\`${focus}\``).join(", ")}`);
      }

      lines.push("  Query entries: `text`, `canonicalRef`, `providerRef`, `tagQuery`, `fieldQuery`");
      lines.push("  Tag filters: `filters.tags.include`, `filters.tags.exclude`");
      lines.push("  Continuation: pass `cursor` from `KnowledgeResult.nextCursor`");

      if (boundaryNotes !== undefined && boundaryNotes.length > 0) {
        lines.push(`  Boundaries: ${boundaryNotes.join(" ")}`);
      }
    }

    if (provider.notes !== undefined && provider.notes.length > 0) {
      lines.push(`  Notes: ${provider.notes.join(" ")}`);
    }
  }

  lines.push("");

  return lines;
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
