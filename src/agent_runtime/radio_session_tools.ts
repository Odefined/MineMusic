import type {
  ConcernRevisionSet,
  Result,
} from "../contracts/kernel.js";
import {
  radioSessionPauseInputSchema,
  radioSessionResumeInputSchema,
  radioSessionShutdownInputSchema,
  radioSessionStartInputSchema,
  radioSessionStatusInputSchema,
  radioSessionStatusOutputSchema,
  radioSessionToolOutputSchema,
} from "../contracts/generated/stage_interface_schemas.js";
import type {
  InstrumentDescriptor,
  StageToolContext,
  RadioSessionStatusOutput,
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
  status(): Promise<Result<RadioSessionStatusOutput>>;
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
  {
    code: "radio_session_actor_not_allowed",
    retryable: false,
    suggestedFixTemplate: "Call Radio session controls only from the Main agent.",
  },
  {
    code: "radio_session_runtime_failed",
    retryable: true,
    suggestedFixTemplate: "Retry the Radio session control if it is still desired.",
  },
] as const;

const radioSessionReadErrors = [
  {
    code: "radio_session_actor_not_allowed",
    retryable: false,
    suggestedFixTemplate: "Call Radio session controls only from the Main agent.",
  },
] as const;

function radioSessionDescriptor(input: {
  name: string;
  label: string;
  description: string;
  useWhen: string;
  doNotUseWhen: string;
  inputSchema: ToolDeclaration["inputSchema"];
  examples?: readonly ToolDeclaration["examples"][number][];
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
      ...(input.examples ?? []),
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
  description: "Start a fresh Radio agent session from Shutdown so Radio can autonomously keep the listening flow alive under the current direction.",
  useWhen: "Use when Radio is shut down and the listener grants continuing-flow control: take over the next stretch of listening, keep the vibe going, continue playing around a mood, or stop making them choose one track at a time.",
  doNotUseWhen: "Do not use for a one-shot recommendation, a finite queue edit, a direction-only change, or a paused Radio session; set or adjust the radio direction before starting when the listener gives a new mood.",
  examples: [
    {
      prompt: "take over the next half hour and keep this neon late-night coding mood going",
      expects: "call",
    },
    {
      prompt: "just find me one track for this mood and stop",
      expects: "avoid",
      note: "This is a bounded recommendation, not continuing-flow control.",
    },
  ],
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

export const radioSessionStatusDescriptor: ToolDeclaration = {
  name: "radio.session.status",
  instrumentId: radioSessionInstrument.id,
  label: "Radio Session Status",
  ownerArea: "agent_runtime",
  description: "Read the current Radio agent session lifecycle state.",
  usage: {
    useWhen: "Use when you need to know whether Radio is running, paused, or shut down before choosing a Radio lifecycle control.",
    doNotUseWhen: "Do not use to change Radio state, pick music, edit the queue, or change the radio direction.",
    outputSemantics: "Returns the compact current Radio lifecycle state and no command-basis changes.",
  },
  examples: [
    {
      prompt: "is Radio already running?",
      expects: "call",
    },
    {
      prompt: "start Radio for this mood",
      expects: "avoid",
      note: "Use a lifecycle control after setting the direction when the listener wants Radio to change state.",
    },
  ],
  sideEffect: {
    durableUserStateWrite: false,
    runtimeStateWrite: false,
    externalCall: false,
  },
  invocationPolicy: {
    defaultDecision: "auto",
    dataEgress: "none",
    readOnlyHint: true,
    destructiveHint: false,
    maxCallsPerTurn: 1,
  },
  inputSchema: radioSessionStatusInputSchema,
  outputSchema: radioSessionStatusOutputSchema,
  errors: radioSessionReadErrors,
  resultSummary(result) {
    const output = result as RadioSessionStatusOutput;
    return `Radio session is ${output.state}.`;
  },
};

export const radioSessionToolNames = [
  radioSessionStartDescriptor.name,
  radioSessionPauseDescriptor.name,
  radioSessionShutdownDescriptor.name,
  radioSessionResumeDescriptor.name,
  radioSessionStatusDescriptor.name,
] as const;

export function createRadioSessionToolRegistrations(
  control: RadioSessionControlPort,
): readonly StageToolRegistration[] {
  return [
    {
      descriptor: radioSessionStartDescriptor,
      handler: (ctx) => handleRadioSessionControl(ctx, () => control.start()),
    },
    {
      descriptor: radioSessionPauseDescriptor,
      handler: (ctx) => handleRadioSessionControl(ctx, () => control.pause()),
    },
    {
      descriptor: radioSessionShutdownDescriptor,
      handler: (ctx) => handleRadioSessionControl(ctx, () => control.shutdown()),
    },
    {
      descriptor: radioSessionResumeDescriptor,
      handler: (ctx) => handleRadioSessionControl(ctx, () => control.resume()),
    },
    {
      descriptor: radioSessionStatusDescriptor,
      handler: (ctx) => handleRadioSessionStatus(ctx, () => control.status()),
    },
  ];
}

async function handleRadioSessionControl(
  ctx: StageToolContext,
  run: () => Promise<Result<RadioSessionControlResult>>,
): Promise<Result<unknown>> {
  if (ctx.actor !== "main_agent") {
    return radioSessionActorNotAllowed();
  }
  const result = await run();
  if (!result.ok) {
    return result;
  }
  const { changedBasis, ...output } = result.value;
  return {
    ok: true,
    value: stageToolHandlerOutput(output, { changedBasis }),
    ...(result.warnings === undefined ? {} : { warnings: result.warnings }),
  };
}

async function handleRadioSessionStatus(
  ctx: StageToolContext,
  run: () => Promise<Result<RadioSessionStatusOutput>>,
): Promise<Result<unknown>> {
  if (ctx.actor !== "main_agent") {
    return radioSessionActorNotAllowed();
  }
  return await run();
}

function radioSessionActorNotAllowed(): Result<never> {
  return {
    ok: false,
    error: {
      code: "radio_session_actor_not_allowed",
      message: "Only the Main agent may change or read the Radio session lifecycle.",
      area: "agent_runtime",
      retryable: false,
      suggestedFix: "Call Radio session controls only from the Main agent.",
    },
  };
}
