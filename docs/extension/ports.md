# Extension Ports

> Status: Current boundary authority
> Scope: Extension-provided and Extension-consumed capabilities

Extension's ports are deliberately narrow. Current work proves registration,
runtime mounting, Source Provider Slot search, and Platform Library Provider
reads through Extension Runtime seams. It does not expose query, storage,
durable writes, or public Stage Interface tools.

## Provides

| Port | Provided to | Capabilities | Code |
| --- | --- | --- | --- |
| Extension runtime factory | Stage Core adapter | Create static capability-registration runtime, initialize plugins, stop no-op, expose internal test snapshot. | `src/extension/plugin_runtime.ts` |
| Capability slot factory | Extension source and tests | Define typed plain-object slots with id, cardinality, and write policy. | `src/extension/capability_slot.ts` |
| Capability registry | Extension runtime and tests | Register/list/get typed slot registrations. | `src/extension/capability_registry.ts` |
| Plugin manifest validation | Extension runtime and tests | Validate plugin id, required fields, non-empty known capabilities. | `src/extension/plugin_manifest.ts` |
| Source-provider slot registration helper | Plugin activation context and tests | Register `SourceProvider` implementations with provider-id validation. | `src/extension/source_provider_slot.ts` |
| Source-provider search seam | Extension runtime consumers | Search one registered source provider and return validated provider candidates. | `src/extension/plugin_runtime.ts`, `src/extension/source_provider_slot.ts` |
| Platform-library-provider slot registration helper | Plugin activation context and tests | Register `PlatformLibraryProvider` implementations with provider-id validation. | `src/extension/platform_library_provider_slot.ts` |
| Platform-library-provider read seam | Extension runtime consumers, including Music Data Platform composition port | Read one registered provider account-library page and return validated candidates. | `src/extension/plugin_runtime.ts`, `src/extension/platform_library_provider_slot.ts` |

## Consumes

| Consumed port | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| Formal result/error contracts | Contracts | Return `Result<T>` and `StageError` with `area = "extension"`. | Read shared type vocabulary. | None. |
| `SourceProvider` contract | Contracts | Type the `source-provider` implementation shape. | Read descriptor, capabilities, and provider operation shape. | None. |
| `PlatformLibraryProvider` contract | Contracts | Type the `platform-library-provider` implementation shape. | Read descriptor, supported library kinds, and provider read shape. | None. |
| `isRefComponentSafe` | Contracts | Validate source-provider `providerId`. | Read validation helper. | None. |

## Method-Level Capabilities

| Capability | Method(s) | Read/Write | Allowed consumer | Notes |
| --- | --- | --- | --- | --- |
| Define slot | `defineCapabilitySlot` | Read/declare only | Extension source | Throws on invalid slot id; slots are plain objects. |
| Register capability | `CapabilityRegistry.register` | Registration only | Extension runtime/tests | No durable MineMusic write. Rejects unknown, duplicate, and core-only registrations. |
| List capability registrations | `CapabilityRegistry.list` | Read | Extension runtime/tests | Deterministic order: plugin array order, then registration order. |
| Lookup capability registration | `CapabilityRegistry.get` | Read | Extension runtime/tests | Lookup is typed-slot scoped; no naked global lookup. |
| Register source provider | `registerSourceProvider` / `ctx.registerSourceProvider` | Registration only | Plugin activation context/tests | Uses `providerId`; validates ref safety, descriptor shape, descriptor match, and declared method availability. |
| Search source provider | `ExtensionRuntime.searchSourceProvider` | Read/external call through provider contract | Extension runtime consumers/tests | Calls one registered provider's `search`; validates input and output integrity; no durable writes. |
| Register platform library provider | `registerPlatformLibraryProvider` / `ctx.registerPlatformLibraryProvider` | Registration only | Plugin activation context/tests | Uses `providerId`; validates ref safety, descriptor shape, supported library kinds, and read method. |
| Read platform library provider | `ExtensionRuntime.readPlatformLibraryProvider` | Read/external call through provider contract | Extension runtime consumers/tests and Music Data Platform composition port | Calls one registered provider's `read`; validates input/output integrity; no durable writes. |
| Initialize Extension runtime | `ExtensionRuntime.initialize` | Registration only | Stage Core adapter/tests | Serial plugin activation; fail-fast. |
| Stop Extension runtime | `ExtensionRuntime.stop` | No-op lifecycle | Stage Core adapter/tests | No plugin deactivate hook in current baseline. |

## Write Policy

`source-provider.writePolicy = "none"`.

`platform-library-provider.writePolicy = "none"`.

Current Extension registration does not write durable MineMusic state, owner
facts, source records, material records, source library items, import batches,
query candidate stores, public output, memory, or effects.

Future slots with write-like semantics must name the write boundary explicitly
and must not hide writer capability behind read/query/support names.

## Forbidden Dependencies

| Forbidden dependency | Reason |
| --- | --- |
| Extension -> Stage Interface | Extension must not shape agent-facing DTOs or public tools. |
| Extension -> Stage Core | Extension is mounted by Stage Core adapter; Extension does not become a runtime module by importing Stage Core. |
| Extension -> Server Host | Host lifecycle and transports are not Extension responsibilities. |
| Extension -> Music Data Platform implementation roots | Plugins cannot write source/material/canonical/owner facts directly. |
| Extension -> storage/material/collection/memory/effects roots | Those areas own their state and side effects. |
| Stage Interface -> Extension | Capability discovery is not a public tool surface in the current baseline. |
| Plugin activation context -> raw `CapabilityRegistry` | Plugins may register themselves through narrow helpers only. |
| Plugin activation context -> http/secrets/config/database/runtime | Activation is registration only; provider-specific HTTP/config details stay inside plugin implementation and composition config. |
| `src/plugins/**` | Pre-formal plugin root must not return. |
| `src/providers/**` | Pre-formal provider root must not return. |

## Composition

Default composition:

```text
Server Host
  -> createStageRuntime([
       createMusicDataPlatformRuntimeModule(...)
       createExtensionRuntimeModule(configured Extension runtime)
     ])
  -> runtime-status module
  -> Stage Interface
```

Server Host owns default composition, storage adapter selection, and overall
runtime config. Extension owns plugin activation and slot semantics.
Plugin-specific docs own concrete provider mapping/config details.

The Stage Core composition adapter lives in
`src/stage_core/extension_runtime_module.ts`. It imports the Extension runtime
factory and adapts it into `RuntimeModule`. Extension source does not import
Stage Core.

## Guards

Current guards live in formal tests:

| Guard | Code |
| --- | --- |
| `src/extension/**` is allowed and present. | `test/formal/active-tree.test.ts` |
| `src/plugins/**` and `src/providers/**` remain absent. | `test/formal/active-tree.test.ts` |
| Extension does not import Stage Interface, Stage Core, Server Host, or domain implementation roots. | `test/formal/active-tree.test.ts` |
| Stage Interface does not import Extension. | `test/formal/active-tree.test.ts` |
| Capability slot shape stays `id/cardinality/writePolicy`. | `test/formal/extension-capability-slot.test.ts` |
| Source-provider slot uses `many-by-id` and `writePolicy = none`. | `test/formal/extension-capability-slot.test.ts` |
| Source-provider registration validates malformed registrations and provider descriptors. | `test/formal/extension-capability-slot.test.ts` |
| Source-provider search validates input and output integrity. | `test/formal/extension-capability-slot.test.ts` |
| Platform-library-provider slot uses `many-by-id` and `writePolicy = none`. | `test/formal/extension-capability-slot.test.ts` |
| Platform-library-provider registration validates malformed registrations and provider descriptors. | `test/formal/extension-capability-slot.test.ts` |
| Platform-library-provider read validates input and output integrity. | `test/formal/extension-capability-slot.test.ts` |
| Manifest validation and activation failure codes use `area = extension`. | `test/formal/extension-capability-slot.test.ts` |
| Default Server Host mounts configured Extension runtime without probing provider HTTP during startup. | `test/formal/server-host.test.ts` |
| Runtime status includes module lifecycle but omits registry internals. | `test/formal/stage-runtime.test.ts` |

## Out Of Scope

- Generic provider platform/runtime.
- Provider account flow, secrets, auth, reauth, migration, health, rate
  limits, or cache.
- Dynamic plugin loading, marketplace behavior, signing, sandboxing, process
  isolation, or plugin dependencies.
- Query, request-scoped candidate tables, materialization, storage, or
  presentation.
- Stage Interface capability discovery tools.
