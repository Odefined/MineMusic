import { Ajv, type AnySchema, type ValidateFunction } from "ajv";

import type { Result, StageError } from "../contracts/kernel.js";
import type {
  InstrumentDescriptor,
  JsonSchema,
  StageInterfaceContract,
  StageToolContext,
  StageToolExecutionGatePreflightResult,
  StageToolHandlerOutputEnvelope,
  StageToolRegistration,
  ToolCallInput,
  ToolCallOutput,
  ToolDeclaredError,
  ToolDeclaration,
} from "../contracts/stage_interface.js";
import { stageToolHandlerOutputSymbol } from "../contracts/stage_interface.js";
import type { MusicDatabaseSchemaContribution } from "../storage/index.js";
import { stageInterfaceHandleRegistrySchema } from "./handle_registry_schema.js";
import { stageInterfaceLookupCursorRegistrySchema } from "./lookup_cursor_registry_schema.js";
import {
  assertOutputSchemaHasNoInternalAnchors,
  findSampleOutputVeilViolations,
  freeTextContainsInternalAnchor,
} from "./veil_guard.js";

export const stageInterfaceSchemas: readonly MusicDatabaseSchemaContribution[] = [
  stageInterfaceHandleRegistrySchema,
  stageInterfaceLookupCursorRegistrySchema,
];

export {
  createStageToolContext,
} from "./context.js";
export type {
  CreateStageToolContextInput,
} from "./context.js";
export {
  createStageToolContextFactory,
} from "./tool_context_factory.js";
export type {
  CreateStageToolContextFactoryInput,
  CreateToolContextPerCallInput,
  StageToolContextFactory,
} from "./tool_context_factory.js";
export {
  renderModelVisibleToolDescription,
} from "./tool_description_rendering.js";
export {
  classifyStageToolFailure,
} from "./tool_failure_surface.js";
export type {
  StageToolFailureSurface,
} from "./tool_failure_surface.js";
export {
  renderPublicToolErrorText,
  renderPublicToolResultSummary,
} from "./tool_public_text.js";
export type {
  PublicToolTextRender,
} from "./tool_public_text.js";
export {
  assertUniqueProviderSafeToolNames,
  toProviderSafeToolName,
} from "./provider_safe_tool_name.js";
export {
  createStageInterfaceCandidateHandleCachePort,
  createStageInterfaceHandleMintingPort,
  createStageInterfaceHandleMintingPortFromRecords,
  createUnavailableHandleMintingPort,
  randomPublicHandleId,
  stableJsonStringify,
} from "./handle_minting.js";
export type {
  CandidateHandleBackingCachePort,
  CandidateHandleCachePort,
  CreateStageInterfaceCandidateHandleCachePortInput,
  CreateStageInterfaceHandleMintingPortFromRecordsInput,
  CreateStageInterfaceHandleMintingPortInput,
} from "./handle_minting.js";
export {
  createStageInterfaceHandleRegistryRecords,
} from "./handle_registry_records.js";
export type {
  CreateStageInterfaceHandleRegistryRecordsInput,
  StageInterfaceHandleBindingRecord,
  StageInterfaceHandleBindingRepository,
  StageInterfaceHandleKind,
  StageInterfaceHandleRegistryRecords,
} from "./handle_registry_records.js";
export {
  stageInterfaceHandleRegistrySchema,
} from "./handle_registry_schema.js";
export {
  createLookupCursorStore,
  createLookupCursorStoreFromRecords,
  createUnavailableLookupCursorStore,
  DEFAULT_LOOKUP_CURSOR_TTL_MS,
} from "./lookup_cursor_store.js";
export type {
  CreateLookupCursorStoreFromRecordsInput,
  CreateLookupCursorStoreInput,
} from "./lookup_cursor_store.js";
export {
  createStageInterfaceLookupCursorRegistryRecords,
} from "./lookup_cursor_registry_records.js";
export type {
  CreateStageInterfaceLookupCursorRegistryRecordsInput,
  StageInterfaceLookupCursorBindingRecord,
  StageInterfaceLookupCursorBindingRepository,
  StageInterfaceLookupCursorRegistryRecords,
} from "./lookup_cursor_registry_records.js";
export {
  stageInterfaceLookupCursorRegistrySchema,
} from "./lookup_cursor_registry_schema.js";
export {
  createStageInterfaceRuntimePorts,
} from "./runtime_ports.js";
export type {
  CreateStageInterfaceRuntimePortsInput,
  StageInterfaceRuntimePorts,
} from "./runtime_ports.js";
export {
  assertOutputSchemaHasNoInternalAnchors,
  assertSampleOutputHasNoInternalAnchors,
  freeTextContainsInternalAnchor,
  findOutputSchemaVeilViolations,
  findSampleOutputVeilViolations,
  INTERNAL_ANCHOR_PROPERTY_NAMES,
  textContainsInternalAnchor,
} from "./veil_guard.js";
export type {
  StageInterfaceVeilViolation,
} from "./veil_guard.js";

export type StageInterface = StageInterfaceContract & {
  dispatch(ctx: StageToolContext, input: ToolCallInput): Promise<Result<ToolCallOutput>>;
};

export type CreateStageInterfaceInput = {
  instruments: readonly InstrumentDescriptor[];
  registrations: readonly StageToolRegistration[];
  defaultToolTimeoutMs?: number;
};

export const DEFAULT_STAGE_TOOL_TIMEOUT_MS = 60_000;

type ToolValidation = {
  input: ValidateFunction;
  output: ValidateFunction;
};

export function createStageInterface(input: CreateStageInterfaceInput): StageInterface {
  const tools = input.registrations.map((registration) => registration.descriptor);
  const defaultToolTimeoutMs = input.defaultToolTimeoutMs ?? DEFAULT_STAGE_TOOL_TIMEOUT_MS;

  assertUnique(input.instruments.map((instrument) => instrument.id), "instrument id");
  assertUnique(tools.map((tool) => tool.name), "tool name");
  assertToolInstruments(tools, new Set(input.instruments.map((instrument) => instrument.id)));
  assertToolDeclarations(tools);
  assertPositiveTimeout(defaultToolTimeoutMs);

  const ajv = new Ajv({ allErrors: true, strict: false });
  const registrations = new Map<string, { registration: StageToolRegistration; validation: ToolValidation }>();

  for (const registration of input.registrations) {
    const { name } = registration.descriptor;
    assertOutputSchemaHasNoInternalAnchors({
      toolName: name,
      schema: registration.descriptor.outputSchema,
    });
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
          actorTrustBasis: ctx.actorTrustBasis,
          askBeforeSourceOfTruthEdits: ctx.askBeforeSourceOfTruthEdits,
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
          gateDecision.decision === "deny"
            ? "stage_interface.denied_by_policy"
            : "stage_interface.ask_required",
          safeGatePublicReason(gateDecision.publicReason, registration.descriptor, gateDecision.decision),
          false,
        );
      }

      let handled: Result<unknown>;

      try {
        const handlerRun = await runHandlerWithTimeout({
          ctx,
          input: call.payload,
          registration,
          timeoutMs: defaultToolTimeoutMs,
        });

        if (handlerRun.timedOut) {
          return handlerRun.result;
        }

        handled = handlerRun.result;
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

        const publicTextViolation = declaredHandlerErrorPublicTextViolation(registration.descriptor, handled.error);
        if (publicTextViolation !== undefined) {
          return publicTextViolation;
        }

        return {
          ok: false,
          error: normalizeDeclaredHandlerError(registration.descriptor, handled.error),
        };
      }

      const handlerOutput = unwrapHandlerOutput(handled.value);

      if (!validation.output(handlerOutput.output)) {
        return fail(
          "stage_interface.invalid_output",
          `Tool '${call.toolName}' output does not match its public schema: ${formatAjvErrors(validation.output)}.`,
          false,
        );
      }

      const outputVeilViolations = findSampleOutputVeilViolations(handlerOutput.output);
      const warningVeilViolations =
        handled.warnings === undefined ? [] : findSampleOutputVeilViolations(handled.warnings);

      if (outputVeilViolations.length > 0 || warningVeilViolations.length > 0) {
        return fail(
          "stage_interface.invalid_output",
          `Tool '${call.toolName}' output exposes internal anchors: ${formatVeilViolations([...outputVeilViolations, ...warningVeilViolations])}.`,
          false,
        );
      }

      return {
        ok: true,
        value: {
          toolName: registration.descriptor.name,
          result: handlerOutput.output,
          ...(handlerOutput.runtime === undefined ? {} : { runtime: handlerOutput.runtime }),
        },
        ...(handled.warnings === undefined ? {} : { warnings: handled.warnings }),
      };
    },
  };
}

function unwrapHandlerOutput(value: unknown): {
  output: unknown;
  runtime?: StageToolHandlerOutputEnvelope["runtime"];
} {
  if (isStageToolHandlerOutputEnvelope(value)) {
    return {
      output: value.output,
      ...(value.runtime === undefined ? {} : { runtime: value.runtime }),
    };
  }

  return { output: value };
}

function isStageToolHandlerOutputEnvelope(value: unknown): value is StageToolHandlerOutputEnvelope {
  return value !== null &&
    typeof value === "object" &&
    (value as Partial<StageToolHandlerOutputEnvelope>)[stageToolHandlerOutputSymbol] === true;
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
    if (!/^(music|library|stage)\.[a-z][a-z0-9_]*$/u.test(tool.instrumentId)) {
      throw new Error(`Tool '${tool.name}' uses invalid instrument namespace '${tool.instrumentId}'.`);
    }

    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(tool.name)) {
      throw new Error(`Tool '${tool.name}' uses invalid public tool name.`);
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

    if (typeof tool.resultSummary !== "function") {
      throw new Error(`Tool '${tool.name}' must declare a resultSummary renderer.`);
    }
  }
}

function declaresError(descriptor: ToolDeclaration, code: string): boolean {
  return declaredErrorFor(descriptor, code) !== undefined;
}

function declaredErrorFor(
  descriptor: ToolDeclaration,
  code: string,
): ToolDeclaredError | undefined {
  return descriptor.errors.find((error) => error.code === code);
}

function normalizeDeclaredHandlerError(
  descriptor: ToolDeclaration,
  error: StageError,
): StageError {
  const declaration = declaredErrorFor(descriptor, error.code);

  if (declaration === undefined) {
    throw new Error(`Cannot normalize undeclared error '${error.code}'.`);
  }

  const suggestedFix = error.suggestedFix ?? declaration.suggestedFixTemplate;

  return {
    code: declaration.code,
    message: error.message,
    area: descriptor.ownerArea,
    retryable: declaration.retryable,
    ...(suggestedFix === undefined ? {} : { suggestedFix }),
  };
}

function declaredHandlerErrorPublicTextViolation(
  descriptor: ToolDeclaration,
  error: StageError,
): Result<never> | undefined {
  if (!safePublicFreeText(error.message)) {
    return fail(
      "stage_interface.invalid_output",
      `Tool '${descriptor.name}' declared error '${error.code}' message exposes internal anchors.`,
      false,
    );
  }

  if (error.suggestedFix !== undefined && !safePublicFreeText(error.suggestedFix)) {
    return fail(
      "stage_interface.invalid_output",
      `Tool '${descriptor.name}' declared error '${error.code}' suggestedFix exposes internal anchors.`,
      false,
    );
  }

  return undefined;
}

function safePublicFreeText(value: string): boolean {
  return value.trim().length > 0 && !freeTextContainsInternalAnchor(value);
}

type HandlerRunResult =
  | { timedOut: false; result: Result<unknown> }
  | { timedOut: true; result: Result<never> };

async function runHandlerWithTimeout(input: {
  ctx: StageToolContext;
  input: unknown;
  registration: StageToolRegistration;
  timeoutMs: number;
}): Promise<HandlerRunResult> {
  const controller = new AbortController();
  const parentSignal = input.ctx.abortSignal;
  let parentAbortListener: (() => void) | undefined;

  if (parentSignal !== undefined) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentAbortListener = () => {
        controller.abort();
      };
      parentSignal.addEventListener("abort", parentAbortListener, { once: true });
    }
  }

  const handlerCtx: StageToolContext = {
    ...input.ctx,
    abortSignal: controller.signal,
  };
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<HandlerRunResult>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({
        timedOut: true,
        result: fail(
          "stage_interface.tool_timeout",
          `Tool '${input.registration.descriptor.name}' exceeded the Stage Core default timeout.`,
          true,
          "Retry later or narrow the request before calling the tool again.",
        ),
      });
      controller.abort();
    }, input.timeoutMs);
  });
  const handlerResult = Promise.resolve(input.registration.handler(handlerCtx, input.input))
    .then((result): HandlerRunResult => ({
      timedOut: false,
      result,
    }));

  // If the timeout wins the race and the handler rejects afterwards, that rejection would have no
  // consumer and become an unhandled rejection. Attach a no-op rejection handler so it is always
  // consumed. When the handler rejects BEFORE the timeout, Promise.race still rejects and the
  // dispatch catch maps it to stage_interface.tool_handler_failed (a router-global error that
  // correctly bypasses the per-tool declared-error gate).
  handlerResult.catch(() => {});

  try {
    return await Promise.race([
      handlerResult,
      timeoutResult,
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }

    if (parentSignal !== undefined && parentAbortListener !== undefined) {
      parentSignal.removeEventListener("abort", parentAbortListener);
    }
  }
}

function publicGateDecisionMessage(
  descriptor: ToolDeclaration,
  decision: StageToolExecutionGatePreflightResult["decision"],
): string {
  if (decision === "ask" || decision === "raise-to-conversation") {
    return `Tool '${descriptor.name}' requires approval before execution.`;
  }

  return `Tool '${descriptor.name}' was denied by policy.`;
}

function safeGatePublicReason(
  publicReason: string | undefined,
  descriptor: ToolDeclaration,
  decision: StageToolExecutionGatePreflightResult["decision"],
): string {
  if (publicReason !== undefined && safePublicFreeText(publicReason)) {
    return publicReason;
  }

  return publicGateDecisionMessage(descriptor, decision);
}

function assertPositiveTimeout(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("defaultToolTimeoutMs must be a positive safe integer.");
  }
}

function formatAjvErrors(validate: ValidateFunction): string {
  return validate.errors?.map((error) => {
    const path = error.instancePath.length === 0 ? "<root>" : error.instancePath;
    return `${path} ${error.message ?? "failed validation"}`;
  }).join("; ") ?? "schema validation failed";
}

function formatVeilViolations(violations: readonly { path: string; reason: string }[]): string {
  return violations.map((violation) => `${violation.path} (${violation.reason})`).join("; ");
}

function fail(
  code: string,
  message: string,
  retryable: boolean,
  suggestedFix?: string,
): Result<never> {
  const error: StageError = {
    code,
    message,
    area: "stage_interface",
    retryable,
    ...(suggestedFix === undefined ? {} : { suggestedFix }),
  };

  return {
    ok: false,
    error,
  };
}
