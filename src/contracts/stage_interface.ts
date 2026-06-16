// Stage Interface contract surface — agent-facing instrument and tool
// descriptors. Reads only the shared kernel. The contracts DAG guard forbids
// importing stage_core (stage_core assembles Stage Interface contributions,
// not the reverse).

import type { FormalArea, Result } from "./kernel.js";

export type InstrumentDescriptor = {
  id: string;
  label: string;
  ownerArea: FormalArea;
};

export type ToolDescriptor = {
  name: string;
  instrumentId: string;
  label: string;
  ownerArea: FormalArea;
  outputPolicy: "compact_public";
};

export type ToolCallInput = {
  toolName: string;
  payload: unknown;
  sessionId?: string;
};

export type ToolCallOutput = {
  toolName: string;
  result: unknown;
};

export type ToolHandler = (input: ToolCallInput) => Promise<Result<ToolCallOutput>>;

export type StageInterfaceContract = {
  instruments: readonly InstrumentDescriptor[];
  tools: readonly ToolDescriptor[];
};
