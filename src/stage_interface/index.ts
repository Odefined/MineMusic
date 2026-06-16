import { Ajv, type AnySchema, type ValidateFunction } from "ajv";

import type { Result, StageError } from "../contracts/kernel.js";
import type {
  InstrumentDescriptor,
  JsonSchema,
  StageInterfaceContract,
  StageToolContext,
  StageToolExecutionGatePreflightResult,
  StageToolRegistration,
  ToolCallInput,
  ToolCallOutput,
  ToolDeclaration,
} from "../contracts/stage_interface.js";

export type StageInterface = StageInterfaceContract & {
  dispatch(ctx: StageToolContext, input: ToolCallInput): Promise<Result<ToolCallOutput>>;
};

export type CreateStageInterfaceInput = {
  instruments: readonly InstrumentDescriptor[];
  registrations: readonly StageToolRegistration[];
};

type ToolValidation = {
  input: ValidateFunction;
  output: ValidateFunction;
};

export function createStageInterface(input: CreateStageInterfaceInput): StageInterface {
  const tools = input.registrations.map((registration) => registration.descriptor);

  assertUnique(input.instruments.map((instrument) => instrument.id), "instrument id");
  assertUnique(tools.map((tool) => tool.name), "tool name");
  assertToolInstruments(tools, new Set(input.instruments.map((instrument) => instrument.id)));
  assertToolDeclarations(tools);

  const ajv = new Ajv({ allErrors: true, strict: false });
  const registrations = new Map<string, { registration: StageToolRegistration; validation: ToolValidation }>();

  for (const registration of input.registrations) {
    const { name } = registration.descriptor;
    registrations.set(name, {
      registration,
      validation: {
        input: compileSchema(ajv, registration.descriptor.inputSchema, `${name} inputSchema`),
        output: compileSchema(ajv, registration.descriptor.outputSchema, `${name} outputSchema`),
      },
    });
  }

  return {
    instruments: input.instruments,
    tools,
    async dispatch(ctx, call) {
      const entry = registrations.get(call.toolName);

      if (entry === undefined) {
        return fail(
          "stage_interface.tool_not_found",
          `Tool '${call.toolName}' is not registered.`,
          false,
        );
      }

      const { registration, validation } = entry;

      if (!validation.input(call.payload)) {
        return fail(
          "stage_interface.invalid_input",
          `Tool '${call.toolName}' input does not match its public schema: ${formatAjvErrors(validation.input)}.`,
          false,
          "Retry with an input that matches the tool's inputSchema.",
        );
      }

      let gateDecision: StageToolExecutionGatePreflightResult;

      try {
        gateDecision = await ctx.executionGate.preflight({
          descriptor: registration.descriptor,
          ownerScope: ctx.ownerScope,
          sessionId: ctx.sessionId,
          requestId: ctx.requestId,
          arguments: call.payload,
        });
      } catch {
        // The execution gate is a cross-context seam; a throw must not escape dispatch.
        return fail(
          "stage_interface.execution_gate_failed",
          `Tool '${call.toolName}' could not be authorized by the execution gate.`,
          false,
        );
      }

      if (gateDecision.decision !== "allow") {
        return fail(
          gateDecision.decision === "ask"
            ? "stage_interface.ask_required"
            : "stage_interface.denied_by_policy",
          gateDecision.reason ?? `Tool '${call.toolName}' was not allowed by the execution gate.`,
          false,
        );
      }

      let handled: Result<unknown>;

      try {
        handled = await registration.handler(ctx, call.payload);
      } catch {
        // The thrown error is internal detail and must not cross the veil.
        // PR 16B records it to ctx.audit once the audit port is wired.
        return fail(
          "stage_interface.tool_handler_failed",
          `Tool '${call.toolName}' handler threw across the Tool Call Router boundary.`,
          false,
        );
      }

      if (!handled.ok) {
        if (!declaresError(registration.descriptor, handled.error.code)) {
          return fail(
            "stage_interface.undeclared_tool_error",
            `Tool '${call.toolName}' emitted an error it did not declare in its public error vocabulary.`,
            false,
          );
        }

        // `cause` is internal detail; strip it before a declared handler error
        // crosses the veil. PR 16B normalizes the full payload (retryable/area)
        // against the declaration.
        return {
          ok: false,
          error: {
            code: handled.error.code,
            message: handled.error.message,
            area: handled.error.area,
            retryable: handled.error.retryable,
            ...(handled.error.suggestedFix === undefined ? {} : { suggestedFix: handled.error.suggestedFix }),
          },
        };
      }

      if (!validation.output(handled.value)) {
        return fail(
          "stage_interface.invalid_output",
          `Tool '${call.toolName}' output does not match its public schema: ${formatAjvErrors(validation.output)}.`,
          false,
        );
      }

      return {
        ok: true,
        value: {
          toolName: registration.descriptor.name,
          result: handled.value,
        },
        ...(handled.warnings === undefined ? {} : { warnings: handled.warnings }),
      };
    },
  };
}

function compileSchema(ajv: Ajv, schema: JsonSchema, label: string): ValidateFunction {
  try {
    return ajv.compile(schema as AnySchema);
  } catch (cause) {
    throw new Error(`Invalid ${label}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: ${value}`);
    }

    seen.add(value);
  }
}

function assertToolInstruments(
  tools: readonly ToolDeclaration[],
  instrumentIds: ReadonlySet<string>,
): void {
  for (const tool of tools) {
    if (!instrumentIds.has(tool.instrumentId)) {
      throw new Error(`Tool '${tool.name}' references missing instrument '${tool.instrumentId}'.`);
    }
  }
}

function assertToolDeclarations(tools: readonly ToolDeclaration[]): void {
  for (const tool of tools) {
    if (!/^(music|stage)\.[a-z][a-z0-9_]*$/u.test(tool.instrumentId)) {
      throw new Error(`Tool '${tool.name}' uses invalid instrument namespace '${tool.instrumentId}'.`);
    }

    if (!tool.name.startsWith(`${tool.instrumentId}.`)) {
      throw new Error(`Tool '${tool.name}' must be named '${tool.instrumentId}.<action>'.`);
    }

    const action = tool.name.slice(tool.instrumentId.length + 1);

    if (!/^[a-z][a-z0-9_]*$/u.test(action)) {
      throw new Error(`Tool '${tool.name}' uses invalid action '${action}'.`);
    }

    if (tool.description.trim().length === 0) {
      throw new Error(`Tool '${tool.name}' must declare description.`);
    }

    for (const [field, value] of [
      ["usage.useWhen", tool.usage.useWhen],
      ["usage.doNotUseWhen", tool.usage.doNotUseWhen],
      ["usage.outputSemantics", tool.usage.outputSemantics],
    ] as const) {
      if (value.trim().length === 0) {
        throw new Error(`Tool '${tool.name}' must declare ${field}.`);
      }
    }

    if (!tool.examples.some((example) => example.expects === "call")) {
      throw new Error(`Tool '${tool.name}' must include at least one call example.`);
    }

    if (!tool.examples.some((example) => example.expects === "avoid")) {
      throw new Error(`Tool '${tool.name}' must include at least one avoid example.`);
    }

    if (tool.errors.length === 0) {
      throw new Error(`Tool '${tool.name}' must declare public errors.`);
    }
  }
}

function declaresError(descriptor: ToolDeclaration, code: string): boolean {
  return descriptor.errors.some((error) => error.code === code);
}

function formatAjvErrors(validate: ValidateFunction): string {
  return validate.errors?.map((error) => {
    const path = error.instancePath.length === 0 ? "<root>" : error.instancePath;
    return `${path} ${error.message ?? "failed validation"}`;
  }).join("; ") ?? "schema validation failed";
}

function fail(
  code: string,
  message: string,
  retryable: boolean,
  suggestedFix?: string,
  cause?: unknown,
): Result<never> {
  const error: StageError = {
    code,
    message,
    area: "stage_interface",
    retryable,
    ...(suggestedFix === undefined ? {} : { suggestedFix }),
    ...(cause === undefined ? {} : { cause }),
  };

  return {
    ok: false,
    error,
  };
}
