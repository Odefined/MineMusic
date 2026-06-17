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
import {
  createConservativeStageToolExecutionGate,
  createMemoryStageToolAuditPort,
} from "../../src/effect_boundary/index.js";
import {
  assertSampleOutputHasNoInternalAnchors,
  createStageInterface,
  createStageInterfaceHandleMintingPort,
  createStageInterfaceHandleRegistryRecords,
  createStageToolContext,
  stageInterfaceHandleRegistrySchema,
} from "../../src/stage_interface/index.js";
import { stageRuntimeStatusDescriptor } from "../../src/stage_core/runtime_status.js";
import { SqliteMusicDatabase } from "../../src/storage/index.js";

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

assert.throws(() => assertSampleOutputHasNoInternalAnchors({
  label: "material-ref-key",
  output: {
    items: [
      {
        materialRef: "material:recording:m_internal",
      },
    ],
  },
}));
assert.throws(() => assertSampleOutputHasNoInternalAnchors({
  label: "candidate-ref-value",
  output: {
    handle: {
      kind: "candidate",
      id: "material_candidate:provider_candidate:c_internal",
    },
  },
}));
assert.throws(() => assertSampleOutputHasNoInternalAnchors({
  label: "source-ref-value",
  output: {
    debug: "source_netease:track:1901371647",
  },
}));
assert.throws(() => assertSampleOutputHasNoInternalAnchors({
  label: "result-set-key",
  output: {
    resultSetId: "rs_internal",
  },
}));
assert.throws(() => assertSampleOutputHasNoInternalAnchors({
  label: "provider-entity-id",
  output: {
    providerEntityId: "1901371647",
  },
}));
assert.throws(() => assertSampleOutputHasNoInternalAnchors({
  label: "raw-provider-key",
  output: {
    cursor: "raw_provider_key:secret",
  },
}));
assert.throws(() => assertSampleOutputHasNoInternalAnchors({
  label: "source-library-ref-key",
  output: {
    sourceLibraryRef: "opaque-source-library-id",
  },
}));
assert.throws(() => assertSampleOutputHasNoInternalAnchors({
  label: "owner-relation-pool-ref-key",
  output: {
    ownerRelationPoolRef: "opaque-relation-pool-id",
  },
}));
assert.throws(() => assertSampleOutputHasNoInternalAnchors({
  label: "source-ref-key-field",
  output: {
    sourceRefKey: "opaque-source-key",
  },
}));
assert.doesNotThrow(() => assertSampleOutputHasNoInternalAnchors({
  label: "public-provider-registry-id",
  output: {
    scope: {
      kind: "provider",
      providerId: "netease",
      description: {
        label: "NetEase",
      },
    },
  },
}));

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

assert.throws(() => createStageInterface({
  instruments: [instrument],
  registrations: [
    {
      descriptor: {
        ...descriptor,
        outputSchema: {
          type: "object",
          properties: {
            materialRef: {
              type: "string",
            },
          },
          required: ["materialRef"],
          additionalProperties: false,
        },
      },
      handler: async () => ({
        ok: true,
        value: {
          materialRef: "material:recording:m_internal",
        },
      }),
    },
  ],
}));

const handleRegistryDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
handleRegistryDatabase.initialize({
  schemas: [stageInterfaceHandleRegistrySchema],
});
const handleMinting = createStageInterfaceHandleMintingPort({
  db: handleRegistryDatabase.context(),
  clock: () => "2026-06-17T00:00:00.000Z",
  publicIdFactory: () => "mh_owner_bound_1",
});
const internalLibraryAnchor = {
  materialRef: "material:recording:m_internal",
};
const publicLibraryHandleId = await handleMinting.mint({
  ownerScope: "owner-a",
  handleKind: "library",
  internalAnchor: internalLibraryAnchor,
});

assert.equal(publicLibraryHandleId, "mh_owner_bound_1");
assert.notEqual(publicLibraryHandleId, internalLibraryAnchor.materialRef);
assert.deepEqual(
  await handleMinting.resolve({
    ownerScope: "owner-a",
    handleKind: "library",
    publicId: publicLibraryHandleId,
  }),
  internalLibraryAnchor,
);
assert.equal(
  await handleMinting.resolve({
    ownerScope: "owner-b",
    handleKind: "library",
    publicId: publicLibraryHandleId,
  }),
  undefined,
);
handleRegistryDatabase.close();

const candidateRegistryDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
candidateRegistryDatabase.initialize({
  schemas: [stageInterfaceHandleRegistrySchema],
});
const candidateHandleMinting = createStageInterfaceHandleMintingPort({
  db: candidateRegistryDatabase.context(),
  clock: () => "2026-06-17T00:00:00.000Z",
  candidateHandles: {
    async mint(candidateInput) {
      assert.equal(candidateInput.ownerScope, "owner-a");
      assert.deepEqual(candidateInput.internalAnchor, {
        materialCandidateRef: "material_candidate:provider_candidate:c_internal",
      });
      return "cand_runtime_cache_1";
    },
    async resolve(candidateInput) {
      assert.equal(candidateInput.ownerScope, "owner-a");
      assert.equal(candidateInput.publicId, "cand_runtime_cache_1");
      return {
        materialCandidateRef: "material_candidate:provider_candidate:c_internal",
      };
    },
  },
});
const candidateHandleId = await candidateHandleMinting.mint({
  ownerScope: "owner-a",
  handleKind: "candidate",
  internalAnchor: {
    materialCandidateRef: "material_candidate:provider_candidate:c_internal",
  },
});

assert.equal(candidateHandleId, "cand_runtime_cache_1");
assert.deepEqual(
  await candidateHandleMinting.resolve({
    ownerScope: "owner-a",
    handleKind: "candidate",
    publicId: candidateHandleId,
  }),
  {
    materialCandidateRef: "material_candidate:provider_candidate:c_internal",
  },
);
candidateRegistryDatabase.close();

const auditRecords: Parameters<ReturnType<typeof createMemoryStageToolAuditPort>["record"]>[0][] = [];
const audit = createMemoryStageToolAuditPort(auditRecords);
const conservativeGate = createConservativeStageToolExecutionGate({ audit });
const gateBaseInput = {
  descriptor,
  ownerScope: "local",
  sessionId: "stage-interface-test-session",
  requestId: "stage-interface-test-request",
  arguments: {},
};

assert.equal((await conservativeGate.preflight(gateBaseInput)).decision, "allow");
assert.equal((await conservativeGate.preflight({
  ...gateBaseInput,
  descriptor: {
    ...descriptor,
    invocationPolicy: {
      ...descriptor.invocationPolicy,
      defaultDecision: "ask",
    },
  },
})).decision, "ask");
assert.equal((await conservativeGate.preflight({
  ...gateBaseInput,
  descriptor: {
    ...descriptor,
    invocationPolicy: {
      ...descriptor.invocationPolicy,
      defaultDecision: "deny",
    },
  },
})).decision, "deny");
assert.equal((await conservativeGate.preflight({
  ...gateBaseInput,
  descriptor: {
    ...descriptor,
    sideEffect: {
      ...descriptor.sideEffect,
      durableUserStateWrite: true,
    },
  },
})).decision, "ask");
const qualifiedPresentDescriptor: ToolDeclaration = {
  ...descriptor,
  name: "music.experience.present",
  ownerArea: "music_experience",
  sideEffect: {
    ...descriptor.sideEffect,
    durableUserStateWrite: true,
  },
  invocationPolicy: {
    ...descriptor.invocationPolicy,
    defaultDecision: "auto",
    admissionDrivenByPresentation: true,
  },
};
const qualifiedPresentResult = await conservativeGate.preflight({
  ...gateBaseInput,
  descriptor: qualifiedPresentDescriptor,
});

assert.equal(qualifiedPresentResult.decision, "allow");
assert.equal(
  qualifiedPresentResult.internalReason,
  "auto presentation-driven admission",
);
assert.equal((await conservativeGate.preflight({
  ...gateBaseInput,
  descriptor: {
    ...qualifiedPresentDescriptor,
    invocationPolicy: {
      ...qualifiedPresentDescriptor.invocationPolicy,
      defaultDecision: "deny",
    },
  },
})).decision, "deny");
assert.equal(auditRecords.length, 6);
assert.equal(auditRecords.every((record) => record.auditLevel === "metadata"), true);
assert.equal(
  auditRecords.some((record) => (
    record.toolName === "music.experience.present" &&
    record.decision === "allow" &&
    record.internalReason === "auto presentation-driven admission"
  )),
  true,
);

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

const internalGateReasonResult = await stageInterface.dispatch(
  createStageToolContext({
    ownerScope: "local",
    sessionId: "stage-interface-test-session",
    requestId: "stage-interface-test-request",
    clock: () => "2026-06-17T00:00:00.000Z",
    executionGate: {
      async preflight() {
        return {
          decision: "ask",
          auditLevel: "metadata",
          internalReason: "internal sourceRef source_netease:track:1901371647",
        };
      },
    },
  }),
  {
    toolName: descriptor.name,
    payload: {},
  },
);

assert.equal(internalGateReasonResult.ok, false);

if (!internalGateReasonResult.ok) {
  assert.equal(internalGateReasonResult.error.code, "stage_interface.ask_required");
  assert.equal(
    JSON.stringify(internalGateReasonResult.error).includes("source_netease:track:1901371647"),
    false,
  );
}

const denyResult = await stageInterface.dispatch(testStageToolContext("deny"), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(denyResult.ok, false);

if (!denyResult.ok) {
  assert.equal(denyResult.error.code, "stage_interface.denied_by_policy");
}

let gateThrowHandlerCalled = false;
const gateThrowInterface = createStageInterface({
  instruments: [instrument],
  registrations: [
    {
      descriptor,
      handler: async () => {
        gateThrowHandlerCalled = true;
        return {
          ok: true as const,
          value: {
            ok: true,
          },
        };
      },
    },
  ],
});
const gateThrowResult = await gateThrowInterface.dispatch(
  {
    ...testStageToolContext(),
    executionGate: {
      async preflight() {
        throw new Error("gate internal meltdown referencing sourceRef xyz");
      },
    },
  },
  {
    toolName: descriptor.name,
    payload: {},
  },
);

assert.equal(gateThrowResult.ok, false);
assert.equal(gateThrowHandlerCalled, false);

if (!gateThrowResult.ok) {
  assert.equal(gateThrowResult.error.code, "stage_interface.execution_gate_failed");
  assert.equal(
    JSON.stringify(gateThrowResult.error).includes("sourceRef xyz"),
    false,
  );
}

const declaredCauseInterface = createStageInterface({
  instruments: [instrument],
  registrations: [
    {
      descriptor,
      handler: async (): Promise<Result<unknown>> => ({
        ok: false,
        error: {
          code: "invalid_input",
          message: "handler domain error",
          area: "stage_core",
          retryable: false,
          cause: {
            sourceRef: "internal-anchor",
            dbRow: 42,
          },
        },
      }),
    },
  ],
});
const declaredCauseResult = await declaredCauseInterface.dispatch(testStageToolContext(), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(declaredCauseResult.ok, false);

if (!declaredCauseResult.ok) {
  // `invalid_input` is declared, so the error is forwarded — but `cause` is stripped.
  assert.equal(declaredCauseResult.error.code, "invalid_input");
  assert.equal(declaredCauseResult.error.cause, undefined);
  assert.equal(
    JSON.stringify(declaredCauseResult.error).includes("internal-anchor"),
    false,
  );
}

const declaredNormalizationInterface = createStageInterface({
  instruments: [instrument],
  registrations: [
    {
      descriptor,
      handler: async (): Promise<Result<unknown>> => ({
        ok: false,
        error: {
          code: "invalid_input",
          message: "safe handler message",
          area: "music_intelligence",
          retryable: true,
          suggestedFix: "safe handler fix",
        },
      }),
    },
  ],
});
const declaredNormalizationResult = await declaredNormalizationInterface.dispatch(testStageToolContext(), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(declaredNormalizationResult.ok, false);

if (!declaredNormalizationResult.ok) {
  assert.equal(declaredNormalizationResult.error.code, "invalid_input");
  assert.equal(declaredNormalizationResult.error.message, "safe handler message");
  assert.equal(declaredNormalizationResult.error.area, descriptor.ownerArea);
  assert.equal(declaredNormalizationResult.error.retryable, false);
  assert.equal(declaredNormalizationResult.error.suggestedFix, "safe handler fix");
}

const declaredLeakScrubInterface = createStageInterface({
  instruments: [instrument],
  registrations: [
    {
      descriptor,
      handler: async (): Promise<Result<unknown>> => ({
        ok: false,
        error: {
          code: "invalid_input",
          message: "leaked materialRef material:recording:m_internal",
          area: "stage_core",
          retryable: false,
          suggestedFix: "retry without sourceRef source_netease:track:1901371647",
        },
      }),
    },
  ],
});
const declaredLeakScrubResult = await declaredLeakScrubInterface.dispatch(testStageToolContext(), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(declaredLeakScrubResult.ok, false);

if (!declaredLeakScrubResult.ok) {
  assert.equal(declaredLeakScrubResult.error.code, "invalid_input");
  assert.equal(
    declaredLeakScrubResult.error.message,
    "Tool 'stage.test.ping' returned declared error 'invalid_input'.",
  );
  assert.equal(
    declaredLeakScrubResult.error.suggestedFix,
    "Call this test tool with an empty object.",
  );
  assert.equal(JSON.stringify(declaredLeakScrubResult.error).includes("materialRef"), false);
  assert.equal(JSON.stringify(declaredLeakScrubResult.error).includes("sourceRef"), false);
  assert.equal(JSON.stringify(declaredLeakScrubResult.error).includes("source_netease"), false);
}

// F1: a success-path output whose VALUE carries an internal anchor is rejected by the runtime veil
// (the schema-shape check alone cannot inspect string contents).
const leakableOutputSchema = {
  type: "object",
  properties: {
    label: {
      type: "string",
    },
  },
  required: ["label"],
  additionalProperties: false,
} as const satisfies JsonSchema;
const leakableDescriptor: ToolDeclaration = {
  ...descriptor,
  name: "stage.test.leakable",
  outputSchema: leakableOutputSchema,
};
const outputLeakInterface = createStageInterface({
  instruments: [instrument],
  registrations: [
    {
      descriptor: leakableDescriptor,
      handler: async () => ({
        ok: true as const,
        value: {
          label: "resolved materialRef material:recording:m_internal",
        },
      }),
    },
  ],
});
const outputLeakResult = await outputLeakInterface.dispatch(testStageToolContext(), {
  toolName: leakableDescriptor.name,
  payload: {},
});

assert.equal(outputLeakResult.ok, false);

if (!outputLeakResult.ok) {
  assert.equal(outputLeakResult.error.code, "stage_interface.invalid_output");
  assert.equal(JSON.stringify(outputLeakResult.error).includes("material:recording:m_internal"), false);
}

// F2: the warnings channel is part of the runtime veil; an anchor in a warning message is rejected.
const warningLeakInterface = createStageInterface({
  instruments: [instrument],
  registrations: [
    {
      descriptor,
      handler: async () => ({
        ok: true as const,
        value: {
          ok: true,
        },
        warnings: [
          {
            code: "degraded",
            area: "stage_core",
            message: "partial result, see sourceRef source_netease:track:1901371647",
          },
        ],
      }),
    },
  ],
});
const warningLeakResult = await warningLeakInterface.dispatch(testStageToolContext(), {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(warningLeakResult.ok, false);

if (!warningLeakResult.ok) {
  assert.equal(warningLeakResult.error.code, "stage_interface.invalid_output");
  assert.equal(JSON.stringify(warningLeakResult.error).includes("source_netease"), false);
}

// F3: a gate publicReason carrying an internal anchor is scrubbed to the fixed public message.
const leakingPublicReasonContext = createStageToolContext({
  ownerScope: "local",
  sessionId: "stage-interface-test-session",
  requestId: "stage-interface-test-request",
  clock: () => "2026-06-17T00:00:00.000Z",
  executionGate: {
    async preflight() {
      return {
        decision: "ask" as const,
        auditLevel: "none" as const,
        publicReason: "blocked because sourceRef source_netease:track:1901371647",
      };
    },
  },
});
const publicReasonLeakResult = await stageInterface.dispatch(leakingPublicReasonContext, {
  toolName: descriptor.name,
  payload: {},
});

assert.equal(publicReasonLeakResult.ok, false);

if (!publicReasonLeakResult.ok) {
  assert.equal(publicReasonLeakResult.error.code, "stage_interface.ask_required");
  assert.equal(JSON.stringify(publicReasonLeakResult.error).includes("source_netease"), false);
  assert.equal(JSON.stringify(publicReasonLeakResult.error).includes("sourceRef"), false);
}

// F4: re-creating a binding for the same owner+kind+anchor upserts (no UNIQUE violation),
// so re-minting after a binding is replaced updates the public id instead of throwing.
const upsertDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
upsertDatabase.initialize({
  schemas: [stageInterfaceHandleRegistrySchema],
});
const upsertRecords = createStageInterfaceHandleRegistryRecords({ db: upsertDatabase.context() });
const upsertAnchorJson = JSON.stringify({ track: 1 });
const firstUpsert = upsertRecords.bindings.createBinding({
  publicId: "mh_upsert_1",
  ownerScope: "owner-a",
  handleKind: "library",
  internalAnchorJson: upsertAnchorJson,
  issuedAt: "2026-06-17T00:00:00.000Z",
});
const secondUpsert = upsertRecords.bindings.createBinding({
  publicId: "mh_upsert_2",
  ownerScope: "owner-a",
  handleKind: "library",
  internalAnchorJson: upsertAnchorJson,
  issuedAt: "2026-06-17T01:00:00.000Z",
});
assert.equal(firstUpsert.publicId, "mh_upsert_1");
assert.equal(secondUpsert.publicId, "mh_upsert_2");
assert.equal(upsertRecords.bindings.getByPublicId({ publicId: "mh_upsert_1" }), undefined);
assert.equal(
  upsertRecords.bindings.getByOwnerPublicId({
    publicId: "mh_upsert_2",
    ownerScope: "owner-a",
    handleKind: "library",
  })?.publicId,
  "mh_upsert_2",
);
upsertDatabase.close();

function compiled(schema: JsonSchema) {
  return ajv.compile(schema as AnySchema);
}

function testStageToolContext(
  decision: "allow" | "ask" | "deny" = "allow",
): StageToolContext {
  return createStageToolContext({
    ownerScope: "local",
    sessionId: "stage-interface-test-session",
    requestId: "stage-interface-test-request",
    clock: () => "2026-06-17T00:00:00.000Z",
    executionGate: {
      async preflight() {
        return {
          decision,
          auditLevel: "none",
        };
      },
    },
  });
}
