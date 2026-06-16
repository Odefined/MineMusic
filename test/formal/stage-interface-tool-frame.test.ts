import assert from "node:assert/strict";
import { Ajv, type AnySchema } from "ajv";

import type { Result } from "../../src/contracts/kernel.js";
import {
  musicDiscoveryLookupInputSchema,
  musicItemHandleSchema,
  musicScopeSchema,
  stageRuntimeStatusInputSchema,
} from "../../src/contracts/generated/stage_interface_schemas.js";
import type {
  InstrumentDescriptor,
  JsonSchema,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../src/contracts/stage_interface.js";
import { createStageInterface } from "../../src/stage_interface/index.js";
import { stageRuntimeStatusDescriptor } from "../../src/stage_core/runtime_status.js";

const ajv = new Ajv({ allErrors: true, strict: false });

const emptyObjectSchema = {
  type: "object",
  additionalProperties: false,
} as const satisfies JsonSchema;

const okPayloadSchema = {
  type: "object",
  properties: {
    ok: {
      type: "boolean",
    },
  },
  required: ["ok"],
  additionalProperties: false,
} as const satisfies JsonSchema;

assert.equal(Object.hasOwn(stageRuntimeStatusDescriptor, "outputPolicy"), false);
assert.equal(stageRuntimeStatusDescriptor.name, "stage.runtime.status");
assert.equal(stageRuntimeStatusDescriptor.sideEffect.durableUserStateWrite, false);
assert.equal(stageRuntimeStatusDescriptor.invocationPolicy.defaultDecision, "auto");
assert.equal(stageRuntimeStatusDescriptor.examples.some((example) => example.expects === "call"), true);
assert.equal(stageRuntimeStatusDescriptor.examples.some((example) => example.expects === "avoid"), true);
assert.equal(stageRuntimeStatusDescriptor.errors.some((error) => error.code === "invalid_input"), true);

const validateRuntimeStatusInput = compiled(stageRuntimeStatusInputSchema);
assert.equal(validateRuntimeStatusInput({}), true);
assert.equal(validateRuntimeStatusInput({ unexpected: true }), false);

const validateScope = compiled(musicScopeSchema);
assert.equal(validateScope({ kind: "library" }), true);
assert.equal(validateScope({ kind: "all" }), true);
assert.equal(validateScope({ kind: "source_library", id: "scope_1" }), true);
assert.equal(validateScope({ kind: "relation", id: "relation_1" }), true);
assert.equal(validateScope({ kind: "provider", providerId: "netease" }), true);
assert.equal(validateScope({ kind: "source_library" }), false);
assert.equal(validateScope({ kind: "provider", id: "netease" }), false);

const validateItemHandle = compiled(musicItemHandleSchema);
assert.equal(validateItemHandle({ kind: "library", id: "pub_1" }), true);
assert.equal(validateItemHandle({ kind: "candidate", id: "cand_1" }), true);
assert.equal(validateItemHandle({ kind: "material", id: "mat_1" }), false);

const validateLookupInput = compiled(musicDiscoveryLookupInputSchema);
assert.equal(validateLookupInput({ lookupText: "whoo" }), true);
assert.equal(validateLookupInput({
  lookupText: "whoo",
  targetKind: "recording",
  scopes: [
    { kind: "library" },
    { kind: "provider", providerId: "netease" },
  ],
  limit: 5,
}), true);
assert.equal(validateLookupInput({ cursor: "cursor_1", limit: 5 }), true);
assert.equal(validateLookupInput({ lookupText: "whoo", cursor: "cursor_1" }), false);

const instrument: InstrumentDescriptor = {
  id: "stage.test",
  label: "Stage Test",
  ownerArea: "stage_core",
};
const descriptor: ToolDeclaration = {
  name: "stage.test.ping",
  instrumentId: instrument.id,
  label: "Ping",
  ownerArea: "stage_core",
  description: "Ping the Stage Interface router test tool.",
  usage: {
    useWhen: "Use in Stage Interface formal tests.",
    doNotUseWhen: "Do not use for user-facing music work.",
    outputSemantics: "Returns a compact ok payload.",
  },
  examples: [
    {
      prompt: "ping stage test",
      expects: "call",
    },
    {
      prompt: "search my music",
      expects: "avoid",
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
  inputSchema: emptyObjectSchema,
  outputSchema: okPayloadSchema,
  errors: [
    {
      code: "invalid_input",
      retryable: false,
      suggestedFixTemplate: "Call this test tool with an empty object.",
    },
  ],
};

const registration: StageToolRegistration = {
  descriptor,
  handler: async () => ({
    ok: true,
    value: {
      ok: true,
    },
  }),
};
const stageInterface = createStageInterface({
  instruments: [instrument],
  registrations: [registration],
});
const dispatchResult = await stageInterface.dispatch(testStageToolContext(), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(dispatchResult.ok, true);

if (dispatchResult.ok) {
  assert.deepEqual(dispatchResult.value, {
    toolName: descriptor.name,
    result: {
      ok: true,
    },
  });
}

const leakingErrorInterface = createStageInterface({
  instruments: [instrument],
  registrations: [
    {
      descriptor,
      handler: async (): Promise<Result<unknown>> => ({
        ok: false,
        error: {
          code: "music_intelligence.internal_error",
          message: "Internal error leaked.",
          area: "music_intelligence",
          retryable: false,
        },
      }),
    },
  ],
});
const leakingError = await leakingErrorInterface.dispatch(testStageToolContext(), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(leakingError.ok, false);

if (!leakingError.ok) {
  assert.equal(leakingError.error.code, "stage_interface.undeclared_tool_error");
}

const throwingInterface = createStageInterface({
  instruments: [instrument],
  registrations: [
    {
      descriptor,
      handler: async (): Promise<Result<unknown>> => {
        throw new Error("internal failure referencing materialRef abc");
      },
    },
  ],
});
const throwingResult = await throwingInterface.dispatch(testStageToolContext(), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(throwingResult.ok, false);

if (!throwingResult.ok) {
  assert.equal(throwingResult.error.code, "stage_interface.tool_handler_failed");
  // The thrown internal detail must not cross the Tool Call Router veil.
  assert.equal(throwingResult.error.cause, undefined);
  assert.equal(
    JSON.stringify(throwingResult.error).includes("materialRef abc"),
    false,
  );
}

const invalidOutputInterface = createStageInterface({
  instruments: [instrument],
  registrations: [
    {
      descriptor,
      handler: async () => ({
        ok: true as const,
        value: {
          ok: "not-a-boolean",
        },
      }),
    },
  ],
});
const invalidOutputResult = await invalidOutputInterface.dispatch(testStageToolContext(), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(invalidOutputResult.ok, false);

if (!invalidOutputResult.ok) {
  assert.equal(invalidOutputResult.error.code, "stage_interface.invalid_output");
}

const askResult = await stageInterface.dispatch(testStageToolContext("ask"), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(askResult.ok, false);

if (!askResult.ok) {
  assert.equal(askResult.error.code, "stage_interface.ask_required");
}

const denyResult = await stageInterface.dispatch(testStageToolContext("deny"), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(denyResult.ok, false);

if (!denyResult.ok) {
  assert.equal(denyResult.error.code, "stage_interface.denied_by_policy");
}

function compiled(schema: JsonSchema) {
  return ajv.compile(schema as AnySchema);
}

function testStageToolContext(
  decision: "allow" | "ask" | "deny" = "allow",
): StageToolContext {
  return {
    ownerScope: "local",
    sessionId: "stage-interface-test-session",
    requestId: "stage-interface-test-request",
    clock: () => "2026-06-17T00:00:00.000Z",
    handleMinting: {
      async mint() {
        return "test-handle";
      },
      async resolve() {
        return undefined;
      },
    },
    providerAvailability: {
      async isProviderAvailable() {
        return false;
      },
    },
    executionGate: {
      async preflight() {
        return {
          decision,
          auditLevel: "none",
        };
      },
    },
  };
}
