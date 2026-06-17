import assert from "node:assert/strict";

import type { Ref } from "../../src/contracts/kernel.js";
import {
  createStageInterface,
} from "../../src/stage_interface/index.js";
import type {
  StageToolContext,
} from "../../src/contracts/stage_interface.js";
import {
  createInMemoryMusicScopeAvailabilityPort,
  createMusicDiscoveryListScopesRegistration,
  createMusicDiscoveryRuntimeModule,
  musicDiscoveryInstrument,
} from "../../src/music_intelligence/stage_adapter/index.js";

let providerAvailabilityCalls = 0;
const scopeAvailability = createInMemoryMusicScopeAvailabilityPort({
  sourceLibraries: [
    {
      id: "scope_saved_recording",
      ref: ref("source_library", "saved_source_track", "l_saved_recording"),
      providerName: "NetEase Cloud Music",
      relationName: "saved",
      targetKind: "recording",
    },
  ],
  relations: [
    {
      id: "scope_favorite_recording",
      ref: ref("owner_material_relation_pool", "favorite", "rp_favorite_recording"),
      relationName: "favorite",
      targetKind: "recording",
    },
  ],
  providers: [
    {
      providerId: "netease",
      providerName: "NetEase Cloud Music",
      targetKinds: ["recording", "album"],
    },
  ],
});
const registration = createMusicDiscoveryListScopesRegistration({
  scopeAvailability,
});
const stageInterface = createStageInterface({
  instruments: [musicDiscoveryInstrument],
  registrations: [registration],
});
const allScopes = await stageInterface.dispatch(testStageToolContext(), {
  toolName: "music.discovery.list_scopes",
  payload: {},
});

assert.equal(allScopes.ok, true);
assert.equal(providerAvailabilityCalls, 0);

if (allScopes.ok) {
  assert.deepEqual(allScopes.value, {
    toolName: "music.discovery.list_scopes",
    result: {
      scopes: [
        {
          kind: "library",
          description: {
            label: "Library",
          },
        },
        {
          kind: "source_library",
          id: "scope_saved_recording",
          description: {
            label: "NetEase Cloud Music saved recording",
            targetKind: "recording",
          },
        },
        {
          kind: "relation",
          id: "scope_favorite_recording",
          description: {
            label: "favorite recording",
            targetKind: "recording",
          },
        },
        {
          kind: "provider",
          providerId: "netease",
          description: {
            label: "NetEase Cloud Music",
          },
          targetKinds: ["recording", "album"],
        },
      ],
    },
  });
  assertNoInternalScopeLeak(allScopes.value.result);
}

const providerScopes = await stageInterface.dispatch(testStageToolContext(), {
  toolName: "music.discovery.list_scopes",
  payload: {
    kind: "provider",
  },
});

assert.equal(providerScopes.ok, true);

if (providerScopes.ok) {
  assert.deepEqual(providerScopes.value.result, {
    scopes: [
      {
        kind: "provider",
        providerId: "netease",
        description: {
          label: "NetEase Cloud Music",
        },
        targetKinds: ["recording", "album"],
      },
    ],
  });
}

const noProviderInterface = createStageInterface({
  instruments: [musicDiscoveryInstrument],
  registrations: [
    createMusicDiscoveryListScopesRegistration({
      scopeAvailability: createInMemoryMusicScopeAvailabilityPort({
        sourceLibraries: [],
        relations: [],
        providers: [],
      }),
    }),
  ],
});
const noProviders = await noProviderInterface.dispatch(testStageToolContext(), {
  toolName: "music.discovery.list_scopes",
  payload: {
    kind: "provider",
  },
});

assert.equal(noProviders.ok, true);

if (noProviders.ok) {
  assert.deepEqual(noProviders.value.result, {
    scopes: [],
  });
}

const invalidKind = await stageInterface.dispatch(testStageToolContext(), {
  toolName: "music.discovery.list_scopes",
  payload: {
    kind: "all",
  },
});

assert.equal(invalidKind.ok, false);

if (!invalidKind.ok) {
  // An unrecognized kind is rejected by the router input-schema enum (router-global code).
  assert.equal(invalidKind.error.code, "stage_interface.invalid_input");
  assert.equal(invalidKind.error.area, "stage_interface");
}

const failingAvailabilityInterface = createStageInterface({
  instruments: [musicDiscoveryInstrument],
  registrations: [
    createMusicDiscoveryListScopesRegistration({
      scopeAvailability: {
        listAvailableMusicScopes() {
          return {
            ok: false,
            error: {
              code: "music_data_platform.scope_read_failed",
              message: "scope read failed",
              area: "music_data_platform",
              retryable: true,
            },
          };
        },
      },
    }),
  ],
});
const failingAvailabilityResult = await failingAvailabilityInterface.dispatch(testStageToolContext(), {
  toolName: "music.discovery.list_scopes",
  payload: {},
});

assert.equal(failingAvailabilityResult.ok, false);
if (!failingAvailabilityResult.ok) {
  assert.equal(failingAvailabilityResult.error.code, "scope_availability_failed");
  assert.equal(failingAvailabilityResult.error.retryable, true);
}

const runtimeModule = createMusicDiscoveryRuntimeModule({
  scopeAvailability,
});
const initialized = await runtimeModule.initialize({});

assert.equal(initialized.ok, true);

if (initialized.ok) {
  assert.deepEqual(initialized.value.instruments, [musicDiscoveryInstrument]);
  assert.equal(initialized.value.tools?.[0]?.descriptor.ownerArea, "music_intelligence");
  assert.equal(initialized.value.tools?.[0]?.descriptor.name, "music.discovery.list_scopes");
}

function testStageToolContext(): StageToolContext {
  return {
    ownerScope: "local",
    sessionId: "music-discovery-test-session",
    requestId: "music-discovery-test-request",
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
        providerAvailabilityCalls += 1;
        return true;
      },
    },
    executionGate: {
      async preflight() {
        return {
          decision: "allow",
          auditLevel: "none",
        };
      },
    },
  };
}

function assertNoInternalScopeLeak(value: unknown): void {
  const text = JSON.stringify(value);

  for (const forbidden of [
    "source_library:saved_source_track",
    "owner_material_relation_pool",
    "providerAccountId",
    "sourceLibraryRef",
    "relationPoolRef",
    "account-",
    "raw",
  ]) {
    assert.equal(
      text.includes(forbidden),
      false,
      `list_scopes output leaked internal token '${forbidden}'`,
    );
  }
}

function ref(namespace: string, kind: string, id: string): Ref {
  return {
    namespace,
    kind,
    id,
  };
}
