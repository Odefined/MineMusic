import assert from "node:assert/strict";

import type { ProviderMaterialCandidate, Result, SourceProvider, StageError } from "../../src/contracts/index.js";
import {
  createCapabilityRegistry,
  createExtensionRuntime,
  defineCapabilitySlot,
  getSourceProvider,
  isPluginIdSafe,
  registerSourceProvider,
  sourceProviderSlot,
  validatePluginManifest,
  validateSourceProviderRegistration,
  type CapabilitySlot,
  type MineMusicPlugin,
  type PluginActivationContext,
  type SourceProviderSearchResult,
  type SourceProviderRegistration,
} from "../../src/extension/index.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

export type _capabilitySlotShape = Expect<
  Equal<keyof CapabilitySlot<SourceProvider>, "id" | "cardinality" | "writePolicy">
>;

assert.equal(sourceProviderSlot.id, "source-provider");
assert.equal(sourceProviderSlot.cardinality, "many-by-id");
assert.equal(sourceProviderSlot.writePolicy, "none");

assert.equal(isPluginIdSafe("minemusic.netease"), true);
assert.equal(isPluginIdSafe("internal.fixture-source"), true);
assert.equal(isPluginIdSafe("MineMusic.Netease"), false);
assert.equal(isPluginIdSafe("bad plugin"), false);
assert.equal(isPluginIdSafe("bad:plugin"), false);

const manifestValidation = validatePluginManifest({
  manifest: plugin("manifest-valid", {
    id: "internal.manifest-valid",
  }).manifest,
  knownCapabilityIds: new Set([sourceProviderSlot.id]),
});

assert.equal(manifestValidation.ok, true);
assertErrorCode(
  validatePluginManifest({
    manifest: plugin("bad-id", {
      id: "Bad.Plugin",
    }).manifest,
    knownCapabilityIds: new Set([sourceProviderSlot.id]),
  }),
  "extension.invalid_plugin_id",
);
assertErrorCode(
  validatePluginManifest({
    manifest: {
      id: "internal.empty-capability",
      displayName: "Empty Capability",
      version: "0.0.0",
      minCoreVersion: "0.0.0",
      capabilities: [],
    },
    knownCapabilityIds: new Set([sourceProviderSlot.id]),
  }),
  "extension.invalid_plugin_manifest",
);
assertErrorCode(
  validatePluginManifest({
    manifest: plugin("unknown-capability", {
      capabilities: ["unknown-capability"],
    }).manifest,
    knownCapabilityIds: new Set([sourceProviderSlot.id]),
  }),
  "extension.unknown_capability",
);
for (const input of [
  null,
  {
    manifest: plugin("missing-known-capabilities").manifest,
  },
  {
    manifest: plugin("bad-known-capabilities").manifest,
    knownCapabilityIds: [],
  },
  {
    manifest: plugin("throwing-known-capabilities").manifest,
    knownCapabilityIds: {
      has() {
        throw new Error("known capability lookup failed");
      },
    },
  },
] as const) {
  assertErrorCode(
    validatePluginManifest(input as unknown as Parameters<typeof validatePluginManifest>[0]),
    "extension.invalid_plugin_manifest",
  );
}
for (const [manifest, code] of [
  [
    { id: "internal.missing-manifest-fields" },
    "extension.invalid_plugin_manifest",
  ],
  [
    {
      id: Symbol("bad-plugin"),
      displayName: "Bad Plugin",
      version: "0.0.0",
      minCoreVersion: "0.0.0",
      capabilities: [sourceProviderSlot.id],
    },
    "extension.invalid_plugin_id",
  ],
  [
    {
      id: "internal.non-array-capabilities",
      displayName: "Bad Plugin",
      version: "0.0.0",
      minCoreVersion: "0.0.0",
      capabilities: sourceProviderSlot.id,
    },
    "extension.invalid_plugin_manifest",
  ],
  [
    {
      id: "internal.blank-display-name",
      displayName: "   ",
      version: "0.0.0",
      minCoreVersion: "0.0.0",
      capabilities: [sourceProviderSlot.id],
    },
    "extension.invalid_plugin_manifest",
  ],
  [
    {
      id: "internal.non-string-capability",
      displayName: "Bad Plugin",
      version: "0.0.0",
      minCoreVersion: "0.0.0",
      capabilities: [Symbol("bad-capability")],
    },
    "extension.invalid_plugin_manifest",
  ],
] as const) {
  assertErrorCode(
    validatePluginManifest({
      manifest: manifest as unknown as MineMusicPlugin["manifest"],
      knownCapabilityIds: new Set([sourceProviderSlot.id]),
    }),
    code,
  );
}

const registry = createCapabilityRegistry({
  slots: [sourceProviderSlot],
});
const fixtureProvider = provider("fixture-source");

assert.equal(
  registerSourceProvider(registry, {
    pluginId: "internal.fixture-source",
    providerId: "fixture-source",
    provider: fixtureProvider,
  }).ok,
  true,
);
assert.equal(getSourceProvider(registry, "fixture-source")?.provider, fixtureProvider);
assert.deepEqual(registry.list(sourceProviderSlot).map((registration) => registration.key), [
  "fixture-source",
]);
const copiedRegistrations = registry.list(sourceProviderSlot) as unknown as unknown[];
copiedRegistrations.length = 0;
assert.deepEqual(registry.list(sourceProviderSlot).map((registration) => registration.key), [
  "fixture-source",
]);
assertErrorCode(
  registerSourceProvider(registry, {
    pluginId: "internal.fixture-source",
    providerId: "fixture-source",
    provider: fixtureProvider,
  }),
  "extension.duplicate_capability_registration",
);
assertErrorCode(
  validateSourceProviderRegistration({
    pluginId: "internal.bad-source",
    providerId: "bad:source",
    provider: provider("bad:source"),
  }),
  "extension.unsafe_provider_id",
);
assertErrorCode(
  validateSourceProviderRegistration({
    pluginId: "internal.bad-source",
    providerId: "wrong-source",
    provider: provider("actual-source"),
  }),
  "extension.provider_id_mismatch",
);
assertErrorCode(
  validateSourceProviderRegistration(null as unknown as SourceProviderRegistration),
  "extension.invalid_source_provider_registration",
);
assertErrorCode(
  validateSourceProviderRegistration({
    pluginId: "internal.bad-source",
    providerId: Symbol("bad-source") as unknown as string,
    provider: provider("bad-source"),
  }),
  "extension.unsafe_provider_id",
);
for (const badProviderId of [
  "missing-descriptor",
  "missing-label",
  "missing-capabilities",
  "string-capabilities",
  "unknown-provider-capability",
  "duplicate-provider-capability",
  "bad-search-method",
  "bad-playable-method",
] as const) {
  const badProvider = badProviderFor(badProviderId);

  assertErrorCode(
    validateSourceProviderRegistration({
      pluginId: `internal.${badProviderId}`,
      providerId: badProviderId,
      provider: badProvider,
    }),
    "extension.invalid_source_provider_descriptor",
  );
}

const unknownRegistry = createCapabilityRegistry({
  slots: [],
});
assertErrorCode(
  unknownRegistry.register(sourceProviderSlot, {
    pluginId: "internal.unknown-slot",
    key: "fixture-source",
    value: fixtureProvider,
  }),
  "extension.unknown_capability",
);

const coreOnlySlot = defineCapabilitySlot<unknown>({
  id: "core-only-test",
  cardinality: "single",
  writePolicy: "core-only",
});
const coreOnlyRegistry = createCapabilityRegistry({
  slots: [coreOnlySlot],
});
assertErrorCode(
  coreOnlyRegistry.register(coreOnlySlot, {
    pluginId: "internal.core-only",
    key: "core-only",
    value: {},
  }),
  "extension.core_only_capability_registration",
);

const orderedRuntime = createExtensionRuntime({
  plugins: [
    plugin("first", {
      registrations: [
        registrationFor("first-a", "internal.first"),
        registrationFor("first-b", "internal.first"),
      ],
    }),
    plugin("second", {
      registrations: [registrationFor("second-a", "internal.second")],
    }),
  ],
});
assert.equal((await orderedRuntime.initialize()).ok, true);
assert.deepEqual(orderedRuntime.listSourceProviders().map((registration) => registration.providerId), [
  "first-a",
  "first-b",
  "second-a",
]);
assert.equal(orderedRuntime.getSourceProvider("second-a")?.provider.descriptor.providerId, "second-a");
assert.deepEqual(orderedRuntime.snapshot(), {
  status: "ready",
  pluginIds: ["internal.first", "internal.second"],
  sourceProviderCount: 3,
});

const sourceProviderSearch = await orderedRuntime.searchSourceProvider({
  providerId: "first-a",
  query: {
    text: "coding",
    targetKinds: ["track"],
    limit: 1,
    offset: 0,
  },
  sessionId: "session-1",
});
assert.equal(sourceProviderSearch.ok, true);

if (sourceProviderSearch.ok) {
  const expected: SourceProviderSearchResult = {
    providerId: "first-a",
    query: {
      text: "coding",
      targetKinds: ["track"],
      limit: 1,
      offset: 0,
    },
    candidates: [candidateFor("first-a", "track-1", "Coding Track")],
  };

  assert.deepEqual(sourceProviderSearch.value, expected);
}

assertErrorCode(
  await orderedRuntime.searchSourceProvider({
    providerId: "missing-provider",
    query: { text: "coding" },
  }),
  "extension.source_provider_not_found",
);
assert.equal((await orderedRuntime.stop()).ok, true);
assert.equal(orderedRuntime.snapshot().status, "stopped");
assertErrorCode(
  await orderedRuntime.searchSourceProvider({
    providerId: "first-a",
    query: { text: "coding" },
  }),
  "extension.runtime_stopped",
);

const emptyRuntime = createExtensionRuntime();
assert.equal((await emptyRuntime.initialize()).ok, true);
assert.deepEqual(emptyRuntime.snapshot(), {
  status: "ready",
  pluginIds: [],
  sourceProviderCount: 0,
});

let capturedContext: PluginActivationContext | undefined;
const lateRegistrationRuntime = createExtensionRuntime({
  plugins: [
    {
      manifest: {
        id: "internal.late-registration",
        displayName: "Late Registration",
        version: "0.0.0",
        minCoreVersion: "0.0.0",
        capabilities: [sourceProviderSlot.id],
      },
      activate(ctx) {
        capturedContext = ctx;
        return ctx.registerSourceProvider(registrationFor("late-registration", "internal.late-registration"));
      },
    },
  ],
});
assert.equal((await lateRegistrationRuntime.initialize()).ok, true);
assert.equal(lateRegistrationRuntime.listSourceProviders().length, 1);
assertErrorCode(
  capturedContext?.registerSourceProvider(registrationFor("too-late", "internal.late-registration")) ??
    fail("missing_context", "missing context"),
  "extension.activation_context_closed",
);
assert.equal(lateRegistrationRuntime.listSourceProviders().length, 1);

await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [
      {
        manifest: {
          id: "internal.runtime-malformed-manifest",
        } as unknown as MineMusicPlugin["manifest"],
        activate() {
          return { ok: true, value: undefined };
        },
      },
    ],
  }),
  "extension.invalid_plugin_manifest",
);
await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [null as unknown as MineMusicPlugin],
  }),
  "extension.invalid_plugin_manifest",
);
const symbolManifestRuntime = createExtensionRuntime({
  plugins: [
    {
      manifest: {
        id: Symbol("runtime-symbol-manifest"),
        displayName: "Runtime Symbol Manifest",
        version: "0.0.0",
        minCoreVersion: "0.0.0",
        capabilities: [sourceProviderSlot.id],
      } as unknown as MineMusicPlugin["manifest"],
      activate() {
        return { ok: true, value: undefined };
      },
    },
  ],
});
await assertExtensionRuntimeError(
  symbolManifestRuntime,
  "extension.invalid_plugin_id",
);
assert.deepEqual(symbolManifestRuntime.snapshot().pluginIds, []);
await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [
      plugin("duplicate"),
      plugin("duplicate"),
    ],
  }),
  "extension.duplicate_plugin",
);
await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [
      plugin("missing-registration", {
        registrations: [],
      }),
    ],
  }),
  "extension.missing_declared_capability_registration",
);
await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [
      plugin("duplicate-provider", {
        registrations: [
          registrationFor("duplicate-provider"),
          registrationFor("duplicate-provider"),
        ],
      }),
    ],
  }),
  "extension.duplicate_capability_registration",
);
await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [
      plugin("owner-mismatch", {
        registrations: [
          {
            ...registrationFor("owner-mismatch"),
            pluginId: "internal.other-plugin",
          },
        ],
      }),
    ],
  }),
  "extension.plugin_registration_owner_mismatch",
);
await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [
      plugin("provider-mismatch", {
        registrations: [
          {
            pluginId: "internal.provider-mismatch",
            providerId: "provider-mismatch",
            provider: provider("actual-provider"),
          },
        ],
      }),
    ],
  }),
  "extension.provider_id_mismatch",
);
await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [
      plugin("bad-provider-descriptor", {
        registrations: [
          {
            pluginId: "internal.bad-provider-descriptor",
            providerId: "bad-provider-descriptor",
            provider: badProviderFor("bad-provider-descriptor"),
          },
        ],
      }),
    ],
  }),
  "extension.invalid_source_provider_descriptor",
);
await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [
      plugin("throws", {
        activateThrows: true,
      }),
    ],
  }),
  "extension.plugin_activation_failed",
);
await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [
      plugin("returns-failure", {
        activateResult: fail("extension.test_activation_failed", "test failure"),
      }),
    ],
  }),
  "extension.plugin_activation_failed",
);
await assertExtensionRuntimeError(
  createExtensionRuntime({
    plugins: [
      {
        manifest: {
          id: "internal.malformed-activation-result",
          displayName: "Malformed Activation Result",
          version: "0.0.0",
          minCoreVersion: "0.0.0",
          capabilities: [sourceProviderSlot.id],
        },
        activate() {
          return undefined as unknown as Result<void>;
        },
      },
    ],
  }),
  "extension.plugin_activation_failed",
);
const failedRuntime = createExtensionRuntime({
  plugins: [
    plugin("failed-runtime", {
      activateThrows: true,
    }),
  ],
});
await assertExtensionRuntimeError(
  failedRuntime,
  "extension.plugin_activation_failed",
);
assertErrorCode(
  await failedRuntime.searchSourceProvider({
    providerId: "failed-runtime",
    query: { text: "coding" },
  }),
  "extension.runtime_failed",
);
const failedAfterRegistrationRuntime = createExtensionRuntime({
  plugins: [
    plugin("failed-after-registration", {
      activateResult: fail("extension.test_activation_failed", "test failure"),
    }),
  ],
});
await assertExtensionRuntimeError(
  failedAfterRegistrationRuntime,
  "extension.plugin_activation_failed",
);
assert.equal(failedAfterRegistrationRuntime.listSourceProviders().length, 0);

const unsupportedSearchRuntime = createExtensionRuntime({
  plugins: [
    plugin("no-search", {
      registrations: [
        {
          pluginId: "internal.no-search",
          providerId: "no-search",
          provider: provider("no-search", {
            capabilities: [],
            search: undefined,
          }),
        },
      ],
    }),
  ],
});
assert.equal((await unsupportedSearchRuntime.initialize()).ok, true);
assertErrorCode(
  await unsupportedSearchRuntime.searchSourceProvider({
    providerId: "no-search",
    query: { text: "coding" },
  }),
  "extension.source_provider_search_unsupported",
);

assertErrorCode(
  await createExtensionRuntime({
    plugins: [plugin("not-ready")],
  }).searchSourceProvider({
    providerId: "not-ready",
    query: { text: "coding" },
  }),
  "extension.runtime_not_ready",
);

const validationRuntime = createExtensionRuntime({
  plugins: [plugin("validation")],
});
assert.equal((await validationRuntime.initialize()).ok, true);
assertErrorCode(
  await validationRuntime.searchSourceProvider({
    providerId: "validation",
    query: { text: "   " },
  }),
  "extension.invalid_source_provider_search_input",
);
assertErrorCode(
  await validationRuntime.searchSourceProvider({
    providerId: "validation",
    query: { text: "coding", limit: 51 },
  }),
  "extension.invalid_source_provider_search_input",
);
assertErrorCode(
  await validationRuntime.searchSourceProvider({
    providerId: "validation",
    query: { text: "coding", offset: -1 },
  }),
  "extension.invalid_source_provider_search_input",
);
assertErrorCode(
  await validationRuntime.searchSourceProvider({
    providerId: "validation",
    query: { text: "coding", targetKinds: [] },
  }),
  "extension.invalid_source_provider_search_input",
);
for (const malformedInput of [
  { providerId: Symbol("validation"), query: { text: "coding" } },
  { providerId: "validation" },
  { providerId: "validation", query: { text: 1 } },
  { providerId: "validation", query: { text: "coding", targetKinds: "track" } },
  { providerId: "validation", query: { text: "coding" }, sessionId: 1 },
] as const) {
  assertErrorCode(
    await validationRuntime.searchSourceProvider(
      malformedInput as unknown as Parameters<typeof validationRuntime.searchSourceProvider>[0],
    ),
    "extension.invalid_source_provider_search_input",
  );
}

for (const [providerId, candidate] of [
  ["bad-provider-id", { ...candidateFor("other-provider", "track-1", "Bad Provider") }],
  ["bad-namespace", {
    ...candidateFor("bad-namespace", "track-1", "Bad Namespace"),
    sourceEntity: {
      ...candidateFor("bad-namespace", "track-1", "Bad Namespace").sourceEntity,
      sourceRef: {
        namespace: "wrong_namespace",
        kind: "track",
        id: "track-1",
      },
    },
  }],
  ["bad-kind", {
    ...candidateFor("bad-kind", "track-1", "Bad Kind"),
    sourceEntity: {
      ...candidateFor("bad-kind", "track-1", "Bad Kind").sourceEntity,
      sourceRef: {
        namespace: "source_bad-kind",
        kind: "album",
        id: "track-1",
      },
    },
  }],
  ["bad-ref", {
    ...candidateFor("bad-ref", "bad:ref", "Bad Ref"),
  }],
  ["bad-entity-id", {
    ...candidateFor("bad-entity-id", "track-1", "Bad Entity Id"),
    sourceEntity: {
      ...candidateFor("bad-entity-id", "track-1", "Bad Entity Id").sourceEntity,
      providerEntityId: "bad:entity",
    },
  }],
  ["bad-score", {
    ...candidateFor("bad-score", "track-1", "Bad Score"),
    providerScore: 1.1,
  }],
  ["bad-target-kind", {
    ...candidateFor("bad-target-kind", "track-1", "Bad Target Kind"),
  }],
  ["malformed-candidate", {}],
  ["missing-source-ref", {
    sourceEntity: {
      providerId: "missing-source-ref",
      providerEntityId: "track-1",
      kind: "track",
    },
  }],
  ["non-string-source-ref", {
    sourceEntity: {
      providerId: "non-string-source-ref",
      providerEntityId: "track-1",
      kind: "track",
      sourceRef: {
        namespace: "source_non-string-source-ref",
        kind: "track",
        id: 1,
      },
    },
  }],
  ["non-numeric-score", {
    ...candidateFor("non-numeric-score", "track-1", "Bad Score"),
    providerScore: "1",
  }],
] as const) {
  const runtime = createExtensionRuntime({
    plugins: [
      plugin(providerId, {
        registrations: [registrationFor(providerId, `internal.${providerId}`, [
          candidate as unknown as ProviderMaterialCandidate,
        ])],
      }),
    ],
  });
  assert.equal((await runtime.initialize()).ok, true);
  assertErrorCode(
    await runtime.searchSourceProvider({
      providerId,
      query: providerId === "bad-target-kind"
        ? {
            text: "coding",
            targetKinds: ["album"],
          }
        : { text: "coding" },
    }),
    "extension.invalid_source_provider_search_output",
  );
}

const mutatingQueryRuntime = createExtensionRuntime({
  plugins: [
    plugin("mutates-query", {
      registrations: [
        {
          pluginId: "internal.mutates-query",
          providerId: "mutates-query",
          provider: provider("mutates-query", {
            search: async ({ query }) => {
              (query as unknown as { targetKinds?: string[] }).targetKinds = ["album"];

              return {
                ok: true,
                value: [
                  {
                    sourceEntity: {
                      kind: "album",
                      sourceRef: {
                        namespace: "source_mutates-query",
                        kind: "album",
                        id: "album-1",
                      },
                      providerId: "mutates-query",
                      providerEntityId: "album-1",
                      label: "Album 1",
                      title: "Album 1",
                    },
                  },
                ],
              };
            },
          }),
        },
      ],
    }),
  ],
});
const requestedMutatingQuery = {
  text: "coding",
  targetKinds: ["track"],
} as const;
assert.equal((await mutatingQueryRuntime.initialize()).ok, true);
assertErrorCode(
  await mutatingQueryRuntime.searchSourceProvider({
    providerId: "mutates-query",
    query: requestedMutatingQuery,
  }),
  "extension.invalid_source_provider_search_output",
);
assert.deepEqual(requestedMutatingQuery.targetKinds, ["track"]);

const nonArrayCandidateRuntime = createExtensionRuntime({
  plugins: [
    plugin("non-array-candidates", {
      registrations: [
        registrationFor(
          "non-array-candidates",
          "internal.non-array-candidates",
          {} as unknown as readonly ProviderMaterialCandidate[],
        ),
      ],
    }),
  ],
});
assert.equal((await nonArrayCandidateRuntime.initialize()).ok, true);
assertErrorCode(
  await nonArrayCandidateRuntime.searchSourceProvider({
    providerId: "non-array-candidates",
    query: { text: "coding" },
  }),
  "extension.invalid_source_provider_search_output",
);

const providerFailureRuntime = createExtensionRuntime({
  plugins: [
    plugin("provider-fails", {
      registrations: [
        registrationFor("provider-fails", "internal.provider-fails", [], {
          searchResult: fail("provider.failed", "provider failed"),
        }),
      ],
    }),
  ],
});
assert.equal((await providerFailureRuntime.initialize()).ok, true);
assertErrorCode(
  await providerFailureRuntime.searchSourceProvider({
    providerId: "provider-fails",
    query: { text: "coding" },
  }),
  "extension.source_provider_search_failed",
);

for (const [providerId, searchResult] of [
  ["undefined-result", undefined],
  ["missing-error", { ok: false }],
] as const) {
  const runtime = createExtensionRuntime({
    plugins: [
      plugin(providerId, {
        registrations: [
          {
            pluginId: `internal.${providerId}`,
            providerId,
            provider: provider(providerId, {
              search: async () => searchResult as unknown as Result<readonly ProviderMaterialCandidate[]>,
            }),
          },
        ],
      }),
    ],
  });
  assert.equal((await runtime.initialize()).ok, true);
  assertErrorCode(
    await runtime.searchSourceProvider({
      providerId,
      query: { text: "coding" },
    }),
    "extension.source_provider_search_failed",
  );
}

const retryableProviderFailureRuntime = createExtensionRuntime({
  plugins: [
    plugin("retryable-provider-fails", {
      registrations: [
        registrationFor("retryable-provider-fails", "internal.retryable-provider-fails", [], {
          searchResult: fail("provider.unavailable", "provider unavailable", true),
        }),
      ],
    }),
  ],
});
assert.equal((await retryableProviderFailureRuntime.initialize()).ok, true);
assertErrorCode(
  await retryableProviderFailureRuntime.searchSourceProvider({
    providerId: "retryable-provider-fails",
    query: { text: "coding" },
  }),
  "extension.source_provider_search_failed",
  true,
);

const providerThrowsRuntime = createExtensionRuntime({
  plugins: [
    plugin("provider-throws", {
      registrations: [
        {
          pluginId: "internal.provider-throws",
          providerId: "provider-throws",
          provider: provider("provider-throws", {
            search: async () => {
              throw new Error("provider threw");
            },
          }),
        },
      ],
    }),
  ],
});
assert.equal((await providerThrowsRuntime.initialize()).ok, true);
assertErrorCode(
  await providerThrowsRuntime.searchSourceProvider({
    providerId: "provider-throws",
    query: { text: "coding" },
  }),
  "extension.source_provider_search_failed",
);

function plugin(
  name: string,
  options: {
    id?: string;
    capabilities?: readonly string[];
    registrations?: readonly SourceProviderRegistration[];
    activateThrows?: boolean;
    activateResult?: Result<void>;
  } = {},
): MineMusicPlugin {
  const pluginId = options.id ?? `internal.${name}`;
  const registrations = options.registrations ?? [registrationFor(name, pluginId)];

  return {
    manifest: {
      id: pluginId,
      displayName: name,
      version: "0.0.0",
      minCoreVersion: "0.0.0",
      capabilities: options.capabilities ?? [sourceProviderSlot.id],
    },
    activate(ctx) {
      if (options.activateThrows === true) {
        throw new Error("activation threw");
      }

      for (const registration of registrations) {
        ctx.registerSourceProvider(registration);
      }

      return options.activateResult ?? { ok: true, value: undefined };
    },
  };
}

function registrationFor(
  providerId: string,
  pluginId = `internal.${providerId}`,
  candidates: readonly ProviderMaterialCandidate[] = [candidateFor(providerId, "track-1", "Coding Track")],
  options: {
    searchResult?: Result<readonly ProviderMaterialCandidate[]>;
  } = {},
): SourceProviderRegistration {
  return {
    pluginId,
    providerId,
    provider: provider(providerId, {
      search: async () => options.searchResult ?? {
        ok: true,
        value: candidates,
      },
    }),
  };
}

function provider(
  providerId: string,
  options: {
    capabilities?: readonly SourceProvider["descriptor"]["capabilities"][number][];
    search?: SourceProvider["search"];
  } = {},
): SourceProvider {
  const sourceProvider: SourceProvider = {
    descriptor: {
      providerId,
      label: providerId,
      capabilities: options.capabilities ?? ["search"],
    },
  };

  if ("search" in options) {
    if (options.search !== undefined) {
      sourceProvider.search = options.search;
    }
  } else {
    sourceProvider.search = async () => ({ ok: true, value: [] });
  }

  return sourceProvider;
}

function badProviderFor(providerId: string): SourceProvider {
  switch (providerId) {
    case "missing-descriptor":
      return {} as unknown as SourceProvider;
    case "missing-label":
      return {
        descriptor: {
          providerId,
          label: "",
          capabilities: ["search"],
        },
        search: async () => ({ ok: true, value: [] }),
      };
    case "missing-capabilities":
    case "bad-provider-descriptor":
      return {
        descriptor: {
          providerId,
          label: providerId,
        },
        search: async () => ({ ok: true, value: [] }),
      } as unknown as SourceProvider;
    case "string-capabilities":
      return {
        descriptor: {
          providerId,
          label: providerId,
          capabilities: "search",
        },
        search: async () => ({ ok: true, value: [] }),
      } as unknown as SourceProvider;
    case "unknown-provider-capability":
      return {
        descriptor: {
          providerId,
          label: providerId,
          capabilities: ["search", "stream"],
        },
        search: async () => ({ ok: true, value: [] }),
      } as unknown as SourceProvider;
    case "duplicate-provider-capability":
      return {
        descriptor: {
          providerId,
          label: providerId,
          capabilities: ["search", "search"],
        },
        search: async () => ({ ok: true, value: [] }),
      } as unknown as SourceProvider;
    case "bad-search-method":
      return {
        descriptor: {
          providerId,
          label: providerId,
          capabilities: ["search"],
        },
        search: "not-a-function",
      } as unknown as SourceProvider;
    case "bad-playable-method":
      return {
        descriptor: {
          providerId,
          label: providerId,
          capabilities: ["playable_links"],
        },
      } as unknown as SourceProvider;
  }

  return provider(providerId);
}

function candidateFor(
  providerId: string,
  providerEntityId: string,
  title: string,
): ProviderMaterialCandidate {
  return {
    sourceEntity: {
      kind: "track",
      sourceRef: {
        namespace: `source_${providerId}`,
        kind: "track",
        id: providerEntityId,
        label: title,
      },
      providerId,
      providerEntityId,
      label: title,
      title,
    },
  };
}

async function assertExtensionRuntimeError(
  runtime: ReturnType<typeof createExtensionRuntime>,
  code: string,
): Promise<void> {
  const initialized = await runtime.initialize();
  assert.equal(initialized.ok, false);
  assert.equal(runtime.snapshot().status, "failed");
  assert.equal(runtime.snapshot().error?.code, code);
  assert.equal(runtime.snapshot().error?.area, "extension");
}

function assertErrorCode(result: Result<unknown>, code: string, retryable = false): void {
  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, code);
    assert.equal(result.error.area, "extension");
    assert.equal(result.error.retryable, retryable);
  }
}

function fail(code: string, message: string, retryable = false): Result<never> {
  const error: StageError = {
    code,
    message,
    area: "extension",
    retryable,
  };

  return { ok: false, error };
}
