import { structuredPatch } from "diff";

import {
  renderWorkspaceContextForSystemPrompt,
  type EncodedWorkspaceContext,
} from "./workspace_context_encoder.js";

const defaultContextLineCount = 2;
const defaultMaxHunkCount = 8;
const defaultMaxChangedLineCount = 40;

export type WorkspaceContextDiffOptions = {
  contextLines?: number;
  maxHunks?: number;
  maxChangedLines?: number;
};

type WorkspaceContextDiffSection = {
  name: string;
  before: string;
  after: string;
};

type StructuredPatchHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: readonly string[];
};

export function renderWorkspaceContextDiff(input: {
  before: EncodedWorkspaceContext;
  after: EncodedWorkspaceContext;
  options?: WorkspaceContextDiffOptions;
}): string | undefined {
  const options = {
    contextLines: input.options?.contextLines ?? defaultContextLineCount,
    maxHunks: input.options?.maxHunks ?? defaultMaxHunkCount,
    maxChangedLines: input.options?.maxChangedLines ?? defaultMaxChangedLineCount,
  };
  const renderedHunks: string[] = [];
  let omittedHunks = 0;

  for (const section of workspaceContextDiffSections(input.before, input.after)) {
    if (section.before === section.after) {
      continue;
    }
    const patch = structuredPatch(
      section.name,
      section.name,
      section.before,
      section.after,
      undefined,
      undefined,
      { context: options.contextLines },
    );

    for (const hunk of patch.hunks as readonly StructuredPatchHunk[]) {
      if (renderedHunks.length >= options.maxHunks) {
        omittedHunks += 1;
        continue;
      }
      renderedHunks.push(formatDiffHunk({
        sectionName: section.name,
        hunk,
        maxChangedLines: options.maxChangedLines,
      }));
    }
  }

  if (renderedHunks.length === 0) {
    return undefined;
  }

  return [
    "Workspace Context diff after this tool result:",
    "```diff",
    ...renderedHunks,
    ...(omittedHunks === 0 ? [] : [`... ${omittedHunks} more Workspace Context hunk(s) omitted`]),
    "```",
  ].join("\n");
}

function workspaceContextDiffSections(
  before: EncodedWorkspaceContext,
  after: EncodedWorkspaceContext,
): readonly WorkspaceContextDiffSection[] {
  return [
    {
      name: "Workspace Context",
      before: renderWorkspaceContextForSystemPrompt(before),
      after: renderWorkspaceContextForSystemPrompt(after),
    },
  ];
}

function formatDiffHunk(input: {
  sectionName: string;
  hunk: StructuredPatchHunk;
  maxChangedLines: number;
}): string {
  return [
    `@@ ${input.sectionName} -${input.hunk.oldStart},${input.hunk.oldLines} +${input.hunk.newStart},${input.hunk.newLines} @@`,
    ...boundedHunkLines(input.hunk.lines, input.maxChangedLines),
  ].join("\n");
}

function boundedHunkLines(lines: readonly string[], maxChangedLines: number): readonly string[] {
  const output: string[] = [];
  let changedLineCount = 0;
  let omittedChangedLineCount = 0;
  for (const line of lines) {
    if (!isChangedHunkLine(line)) {
      output.push(line);
      continue;
    }
    if (changedLineCount < maxChangedLines) {
      output.push(line);
      changedLineCount += 1;
      continue;
    }
    omittedChangedLineCount += 1;
  }
  if (omittedChangedLineCount > 0) {
    output.push(` ... ${omittedChangedLineCount} changed line(s) omitted`);
  }
  return output;
}

function isChangedHunkLine(line: string): boolean {
  return line.startsWith("+") || line.startsWith("-");
}
