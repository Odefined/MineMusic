import type {
  ConcernRevisionSet,
  Result,
} from "../contracts/kernel.js";
import {
  radioSessionPauseInputSchema,
  radioSessionResumeInputSchema,
  radioSessionShutdownInputSchema,
  radioSessionStartInputSchema,
  radioSessionToolOutputSchema,
} from "../contracts/generated/stage_interface_schemas.js";
import type {
  InstrumentDescriptor,
  RadioSessionToolOutput,
  StageToolRegistration,
  ToolDeclaration,
} from "../contracts/stage_interface.js";
import { stageToolHandlerOutput } from "../contracts/stage_interface.js";

export type RadioSessionControlResult = RadioSessionToolOutput & {
  changedBasis: ConcernRevisionSet;
};

export type RadioSessionControlPort = {
  start(): Promise<Result<RadioSessionControlResult>>;
  pause(): Promise<Result<RadioSessionControlResult>>;
  shutdown(): Promise<Result<RadioSessionControlResult>>;
  resume(): Promise<Result<RadioSessionControlResult>>;
};

export const radioSessionInstrument: InstrumentDescriptor = {
  id: "stage.agent_runtime",
  label: "Agent Runtime",
  ownerArea: "agent_runtime",
};

const radioSessionErrors = [
  {
    code: "radio_session_invalid_transition",
    retryable: false,
    suggestedFixTemplate: "Use the radio session control that matches the current Radio lifecycle state.",
  },
] as const;

function radioSessionDescriptor(input: {
  name: string;
  label: string;
  description: string;
  useWhen: string;
  doNotUseWhen: string;
  inputSchema: ToolDeclaration["inputSchema"];
}): ToolDeclaration {
  return {
    name: input.name,
    instrumentId: radioSessionInstrument.id,
    label: input.label,
    ownerArea: "agent_runtime",
    description: input.description,
    usage: {
      useWhen: input.useWhen,
      doNotUseWhen: input.doNotUseWhen,
      outputSemantics: "Returns the compact Radio lifecycle state and existing-playback effect; it does not choose music or expose runtime job ids.",
    },
    examples: [
      {
        prompt: input.useWhen,
        expects: "call",
      },
      {
        prompt: "refresh the queue for the new radio direction",
        expects: "avoid",
        note: "Radio session controls only change lifecycle; queue clear, replacement, append, and play decisions belong to queue/playback tools after the agent judges the music.",
      },
    ],
    sideEffect: {
      durableUserStateWrite: false,
      runtimeStateWrite: true,
      externalCall: false,
    },
    invocationPolicy: {
      defaultDecision: "auto",
      dataEgress: "none",
      readOnlyHint: false,
      destructiveHint: false,
      maxCallsPerTurn: 1,
    },
    inputSchema: input.inputSchema,
    outputSchema: radioSessionToolOutputSchema,
    errors: radioSessionErrors,
    resultSummary(result) {
      const output = result as RadioSessionToolOutput;
      return `Radio session is ${output.state}; playback effect: ${output.playbackEffect}; wake requested: ${output.wakeRequested}.`;
    },
  };
}

export const radioSessionStartDescriptor = radioSessionDescriptor({
  name: "radio.session.start",
  label: "Start Radio Session",
  description: "Start a fresh Radio agent session from Shutdown.",
  useWhen: "Start Radio after it has been shut down.",
  doNotUseWhen: "Do not use to resume a paused Radio session, pick music, clear queue items, or edit the radio direction.",
  inputSchema: radioSessionStartInputSchema,
});

export const radioSessionPauseDescriptor = radioSessionDescriptor({
  name: "radio.session.pause",
  label: "Pause Radio Session",
  description: "Pause the current Radio agent session and keep its transcript.",
  useWhen: "Pause Radio while preserving its current session.",
  doNotUseWhen: "Do not use to shut Radio down, pick music, clear queue items, or edit the radio direction.",
  inputSchema: radioSessionPauseInputSchema,
});

export const radioSessionShutdownDescriptor = radioSessionDescriptor({
  name: "radio.session.shutdown",
  label: "Shutdown Radio Session",
  description: "Shut down Radio and rotate its active transcript out of use.",
  useWhen: "Shut Radio down so the next start creates a fresh Radio session.",
  doNotUseWhen: "Do not use to pause Radio temporarily, pick music, clear queue items, or edit the radio direction.",
  inputSchema: radioSessionShutdownInputSchema,
});

export const radioSessionResumeDescriptor = radioSessionDescriptor({
  name: "radio.session.resume",
  label: "Resume Radio Session",
  description: "Resume a paused Radio agent session.",
  useWhen: "Resume Radio after it has been paused.",
  doNotUseWhen: "Do not use to start Radio after shutdown, pick music, clear queue items, or edit the radio direction.",
  inputSchema: radioSessionResumeInputSchema,
});

export const radioSessionToolNames = [
  radioSessionStartDescriptor.name,
  radioSessionPauseDescriptor.name,
  radioSessionShutdownDescriptor.name,
  radioSessionResumeDescriptor.name,
] as const;

export function createRadioSessionToolRegistrations(
  control: RadioSessionControlPort,
): readonly StageToolRegistration[] {
  return [
    {
      descriptor: radioSessionStartDescriptor,
      handler: () => handleRadioSessionControl(control.start()),
    },
    {
      descriptor: radioSessionPauseDescriptor,
      handler: () => handleRadioSessionControl(control.pause()),
    },
    {
      descriptor: radioSessionShutdownDescriptor,
      handler: () => handleRadioSessionControl(control.shutdown()),
    },
    {
      descriptor: radioSessionResumeDescriptor,
      handler: () => handleRadioSessionControl(control.resume()),
    },
  ];
}

async function handleRadioSessionControl(
  resultPromise: Promise<Result<RadioSessionControlResult>>,
): Promise<Result<unknown>> {
  const result = await resultPromise;
  if (!result.ok) {
    return result;
  }
  const { changedBasis, ...output } = result.value;
  return {
    ok: true,
    value: stageToolHandlerOutput(output, { changedBasis }),
  };
}
