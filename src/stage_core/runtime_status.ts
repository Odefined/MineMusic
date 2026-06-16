import type { RuntimeErrorSummary, RuntimeModuleSnapshot, StageRuntimeSnapshot, StageRuntimeStatus } from "../contracts/stage_core.js";
import type { InstrumentDescriptor, StageToolRegistration, ToolDeclaration } from "../contracts/stage_interface.js";
import {
  runtimeStatusToolOutputSchema,
  stageRuntimeStatusInputSchema,
} from "../contracts/generated/stage_interface_schemas.js";
import type { RuntimeModule } from "./runtime_module.js";

export type RuntimeStatusReader = () => StageRuntimeSnapshot;

export type StageRuntimeStatusInput = Record<string, never>;

export type RuntimeStatusToolOutput = {
  status: StageRuntimeStatus;
  modules: readonly Pick<RuntimeModuleSnapshot, "id" | "ownerArea" | "status">[];
  interface: {
    instrumentCount: number;
    toolCount: number;
  };
  error?: RuntimeErrorSummary;
  cleanupErrorCount?: number;
};

export const stageRuntimeInstrument: InstrumentDescriptor = {
  id: "stage.runtime",
  label: "Runtime",
  ownerArea: "stage_core",
};

export const stageRuntimeStatusDescriptor: ToolDeclaration = {
  name: "stage.runtime.status",
  instrumentId: stageRuntimeInstrument.id,
  label: "Runtime Status",
  ownerArea: "stage_core",
  description: "Read the current Stage Runtime lifecycle and compact module status.",
  usage: {
    useWhen: "Use when the caller needs to inspect whether the local Stage Runtime is ready, failed, stopped, or missing a module contribution.",
    doNotUseWhen: "Do not use for provider diagnostics, music retrieval, library import, or user music facts.",
    outputSemantics: "Returns compact runtime status, module ids with lifecycle status, and Stage Interface instrument/tool counts.",
  },
  examples: [
    {
      prompt: "is the MineMusic stage runtime ready?",
      expects: "call",
    },
    {
      prompt: "find songs named whoo",
      expects: "avoid",
      note: "music lookup belongs to a music discovery tool, not runtime status",
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
  },
  inputSchema: stageRuntimeStatusInputSchema,
  outputSchema: runtimeStatusToolOutputSchema,
  errors: [
    {
      code: "invalid_input",
      retryable: false,
      suggestedFixTemplate: "Call stage.runtime.status with an empty object.",
    },
  ],
};

export function createRuntimeStatusModule({
  readSnapshot,
}: {
  readSnapshot: RuntimeStatusReader;
}): RuntimeModule {
  return {
    descriptor: {
      id: "runtime-status",
      ownerArea: "stage_core",
      label: "Runtime Status",
    },
    async initialize() {
      return {
        ok: true,
        value: {
          instruments: [stageRuntimeInstrument],
          tools: [createRuntimeStatusRegistration({ readSnapshot })],
        },
      };
    },
  };
}

export function createRuntimeStatusRegistration({
  readSnapshot,
}: {
  readSnapshot: RuntimeStatusReader;
}): StageToolRegistration {
  return {
    descriptor: stageRuntimeStatusDescriptor,
    handler: async () => ({
      ok: true,
      value: toRuntimeStatusToolOutput(readSnapshot()),
    }),
  };
}

export function toRuntimeStatusToolOutput(snapshot: StageRuntimeSnapshot): RuntimeStatusToolOutput {
  return {
    status: snapshot.status,
    modules: snapshot.modules.map(({ id, ownerArea, status }) => ({
      id,
      ownerArea,
      status,
    })),
    interface: {
      instrumentCount: snapshot.interfaceContract.instruments.length,
      toolCount: snapshot.interfaceContract.tools.length,
    },
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
    ...(snapshot.cleanupErrors === undefined || snapshot.cleanupErrors.length === 0
      ? {}
      : { cleanupErrorCount: snapshot.cleanupErrors.length }),
  };
}
