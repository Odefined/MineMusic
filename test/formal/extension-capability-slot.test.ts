import assert from "node:assert/strict";

import type { Result, SourceProvider, StageError } from "../../src/contracts/index.js";
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
assert.equal((await orderedRuntime.stop()).ok, true);
assert.equal(orderedRuntime.snapshot().status, "stopped");

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

function registrationFor(providerId: string, pluginId = `internal.${providerId}`): SourceProviderRegistration {
  return {
    pluginId,
    providerId,
    provider: provider(providerId),
  };
}

function provider(providerId: string): SourceProvider {
  return {
    descriptor: {
      providerId,
      label: providerId,
      capabilities: ["search"],
    },
    async search() {
      return {
        ok: true,
        value: [],
      };
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

function assertErrorCode(result: Result<unknown>, code: string): void {
  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, code);
    assert.equal(result.error.area, "extension");
  }
}

function fail(code: string, message: string): Result<never> {
  const error: StageError = {
    code,
    message,
    area: "extension",
    retryable: false,
  };

  return { ok: false, error };
}
