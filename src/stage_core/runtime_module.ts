import type { InstrumentDescriptor, StageToolRegistration, ToolDeclaration } from "../contracts/stage_interface.js";
import type { Result } from "../contracts/kernel.js";
import type { RuntimeModuleOwnerArea } from "../contracts/stage_core.js";

export type RuntimeModuleDescriptor = {
  id: string;
  ownerArea: RuntimeModuleOwnerArea;
  label?: string;
};

export type RuntimeModuleInitializeInput = Record<string, never>;

export type RuntimeModuleContribution = {
  instruments?: readonly InstrumentDescriptor[];
  tools?: readonly StageToolRegistration[];
};

export type RuntimeModule = {
  descriptor: RuntimeModuleDescriptor;
  initialize(input: RuntimeModuleInitializeInput): Promise<Result<RuntimeModuleContribution>>;
  stop?(): Promise<Result<void>>;
};

export type RuntimeModuleContributionEntry = {
  moduleId: string;
  contribution: RuntimeModuleContribution;
};

export type MergedRuntimeModuleContribution = {
  instruments: readonly InstrumentDescriptor[];
  tools: readonly ToolDeclaration[];
  registrations: readonly StageToolRegistration[];
};

const runtimeModuleIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isRuntimeModuleIdSafe(id: string): boolean {
  return runtimeModuleIdPattern.test(id) && !id.includes(":");
}

export function validateRuntimeModules(modules: readonly RuntimeModule[]): Result<void> {
  const seenModuleIds = new Set<string>();

  for (const module of modules) {
    const { id, ownerArea } = module.descriptor;

    if (!isRuntimeModuleIdSafe(id)) {
      return fail(
        "stage_core.invalid_runtime_module_id",
        `Runtime module id '${id}' must be lowercase kebab-case and must not contain ':'.`,
      );
    }

    if (seenModuleIds.has(id)) {
      return fail(
        "stage_core.duplicate_runtime_module",
        `Duplicate runtime module id '${id}'.`,
      );
    }

    seenModuleIds.add(id);

    const ownerAreaValue = ownerArea as string;

    if (ownerAreaValue === "server_host" || ownerAreaValue === "stage_interface") {
      return fail(
        "stage_core.invalid_runtime_module_owner",
        `Runtime module '${id}' cannot use owner area '${ownerArea}'.`,
      );
    }
  }

  return ok(undefined);
}

export function mergeRuntimeModuleContributions(
  entries: readonly RuntimeModuleContributionEntry[],
): Result<MergedRuntimeModuleContribution> {
  const instruments: InstrumentDescriptor[] = [];
  const tools: ToolDeclaration[] = [];
  const registrations: StageToolRegistration[] = [];
  const instrumentIds = new Set<string>();
  const toolNames = new Set<string>();

  for (const entry of entries) {
    for (const instrument of entry.contribution.instruments ?? []) {
      if (instrumentIds.has(instrument.id)) {
        return fail(
          "stage_core.duplicate_instrument",
          `Duplicate instrument id '${instrument.id}' from runtime module '${entry.moduleId}'.`,
        );
      }

      instrumentIds.add(instrument.id);
      instruments.push(instrument);
    }

    for (const registration of entry.contribution.tools ?? []) {
      const { descriptor } = registration;

      if (toolNames.has(descriptor.name)) {
        return fail(
          "stage_core.duplicate_tool",
          `Duplicate tool name '${descriptor.name}' from runtime module '${entry.moduleId}'.`,
        );
      }

      toolNames.add(descriptor.name);
      tools.push(descriptor);
      registrations.push(registration);
    }
  }

  for (const tool of tools) {
    if (!instrumentIds.has(tool.instrumentId)) {
      return fail(
        "stage_core.missing_tool_instrument",
        `Tool '${tool.name}' references missing instrument '${tool.instrumentId}'.`,
      );
    }
  }

  return ok({
    instruments,
    tools,
    registrations,
  });
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(code: string, message: string): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      area: "stage_core",
      retryable: false,
    },
  };
}
