# Phase 3: Extension Capability Slot Baseline

> Status: Implemented
> Phase owner: Extension
> Output type: Extension-owned plugin and capability-slot contracts,
> registry/runtime skeleton, Stage Core mounting adapter, tests, and matching
> docs updates

Phase 3 establishes the formal Extension boundary. It should not restore the
old provider runtime, old plugin directory, old NetEase adapter, old query
path, or old materialization flow. The purpose is to make extension points
explicit before any provider, query, storage, or presentation behavior is
rebuilt.

The most important rule for this phase is:

```text
Capability Slot = Extension/core-defined typed extension point.
Plugin = declaration plus implementation that registers allowed capabilities.
Provider = one possible capability implementation, not a top-level platform.
```

Phase 3 should prove that MineMusic can expose a narrow, testable extension
point without letting plugins import the core internals they are meant to
extend.

The Stage Core runtime module id for this boundary is `extension`.

## Implementation Status

Implemented on 2026-06-06:

- `src/extension/**` now owns the formal Extension root.
- `src/extension/capability_slot.ts` defines plain-object capability slots
  created through `defineCapabilitySlot(...)`.
- `src/extension/capability_registry.ts` implements typed-slot registration,
  list, and get-by-id behavior with deterministic ordering.
- `src/extension/plugin_manifest.ts` validates light plugin manifests.
- `src/extension/plugin_runtime.ts` implements the static
  capability-registration runtime.
- `src/extension/source_provider_slot.ts` defines the only Phase 3 concrete
  slot, `source-provider`, and exposes `registerSourceProvider(...)`.
- `src/stage_core/extension_runtime_module.ts` adapts Extension runtime into
  Stage Core runtime module `extension`.
- `src/server/host.ts` mounts an empty Extension runtime by default.
- Stage Runtime initializes caller-provided modules before the internal
  `runtime-status` module, so default runtime status lists `extension` before
  `runtime-status`.
- Tests cover Extension contracts, manifest validation, registration failure
  modes, architecture import guards, runtime mounting, compact runtime status,
  and default Server Host composition.

Phase 3 deliberately does not implement real provider execution, NetEase,
provider config flow, query, storage, materialization, or presentation cards.

## Relationship To Phase 2

Phase 2 introduced a Stage Core `RuntimeModule` contribution boundary. That
boundary is not the plugin system.

Phase 3 must keep these meanings separate:

| Concept | Owner | Meaning |
| --- | --- | --- |
| `RuntimeModule` | Stage Core | Runtime assembly unit that contributes Stage Interface instruments, tools, and handlers. |
| `CapabilitySlot` | Extension | Typed extension point declared by MineMusic. |
| `CapabilityRegistration` | Extension | Plugin-owned registration of an implementation for one declared slot. |
| `MineMusicPlugin` | Extension | Manifest plus activation function that registers allowed capabilities. |

Stage Core must mount Extension through a runtime module adapter. Extension does
not become Stage Core, and Stage Core does not own plugin semantics.

## Relationship To External Plugin-System Advice

Two design suggestions reviewed before this plan are useful as planning
evidence, not direct implementation authority.

Accepted from the suggestions:

- use typed capability slots instead of free-form plugin hooks;
- use declared plugin manifests instead of implicit internal imports;
- make slot cardinality explicit: `single`, `many`, or `many-by-id`;
- make write permission explicit through slot-level write policy;
- keep provider outputs as candidate, evidence, or action result;
- prevent provider/plugin code from returning `MaterialRecord`, material
  identity, or final `MaterialCard`;
- prefer a static plugin runtime first. Dynamic loading, marketplace behavior,
  signing, sandboxing, and external distribution can wait;
- add architecture guards and contract tests in the same phase as the boundary.

Deferred from the suggestions:

- NetEase implementation rewrite;
- provider conformance against live APIs;
- provider account config flow, reauth, secrets, and migration;
- provider instance cache, connection pool, rate limit, or health interpretation;
- mixed catalog/provider query;
- request-scoped TEMP tables or TEMP FTS;
- materialization on present/save/feedback/collection boundaries;
- final query-hit or `MaterialCard` shape.

Rejected for Phase 3:

- generic `src/plugins/**` as the active root name;
- plugin-defined ad hoc slots;
- query hooks such as `onBeforeCatalogQuery`, `onAfterMaterialHydrate`,
  `onMergeMaterial`, or raw database write hooks;
- plugins receiving full aggregate stores, Stage Interface DTOs, or direct
  database writers;
- provider search returning durable material identity or presentation output.

## Goal

Define and implement the Extension capability-slot baseline:

- `src/extension/**` as the formal active Extension area root;
- typed `CapabilitySlot`;
- typed `CapabilityRegistration`;
- `CapabilityRegistry` with deterministic registration, lookup, and validation;
- minimal `MineMusicPlugin` manifest and activation model;
- source-provider slot registration as a contract-only example using the Phase
  1 `SourceProvider` type;
- Stage Core mounting adapter for the Extension runtime module;
- tests that prove invalid plugins/slots are rejected and architecture
  boundaries are guarded.

The end-to-end proof should be:

```text
Server Host
  -> Stage Runtime initialize
  -> Stage Core mounts Extension runtime module
  -> Extension activates declared static plugins
  -> CapabilityRegistry stores typed registrations
  -> Stage runtime status shows Extension module readiness
```

Phase 3 must not expose a new music/provider/extension Stage Interface tool.
Runtime status is sufficient to prove mounting. Capability behavior is verified
through Extension contract tests.

The Extension runtime module should contribute no instruments, tools, or
handlers. Its public runtime proof is its module snapshot in the existing
`stage.runtime.status` output.

## Non-Goals

- Do not implement NetEase, MusicBrainz, local-file, or any other provider
  adapter.
- Do not create active `src/providers/**` or `src/plugins/**` roots.
- Do not implement Provider Config Flow.
- Do not implement provider account instances, secrets, OAuth/cookie handling,
  reauth, migration, rate limits, or provider health interpretation.
- Do not implement storage provider behavior or database schemas.
- Do not implement Music Data Platform commands, materialization, binding,
  identity merge, owner catalog, or source-library import.
- Do not implement query engine behavior, provider/local result mixing, or
  query-to-present.
- Do not implement `MaterialCard`.
- Do not expose provider candidates through Stage Interface.
- Do not add Handbook, music-domain tools, recommendation tools, radio tools,
  memory tools, or effect tools.
- Do not add dynamic plugin loading, package discovery, marketplace behavior,
  signing, sandboxing, or plugin process isolation.
- Do not edit `CONTEXT.md`.

## Owning Context

Extension owns Phase 3.

Stage Core participates only through a mounting adapter that turns the
Extension runtime into a Stage Core `RuntimeModule`. Stage Interface
participates only through existing runtime status visibility.

Music Data Platform, Music Intelligence, Music Experience, Memory, Effect
Boundary, provider implementations, query, storage, and presentation are out
of scope.

## Allowed Reads

- `src/contracts/index.ts`
- `src/stage_core/runtime.ts`
- `src/stage_core/runtime_module.ts`
- `src/stage_core/runtime_status.ts`
- `src/server/host.ts`
- Formal Phase 1 and Phase 2 tests
- `ARCHITECTURE.md`
- `docs/formal-project-glossary.md`
- Accepted formal ADRs

## Allowed Writes

- `src/extension/**`
- a Stage Core adapter file that mounts Extension as a `RuntimeModule`
- `src/stage_core/index.ts` exports needed for the adapter
- `src/server/**` composition only if needed to include the Extension runtime
  module
- `src/contracts/index.ts` only if the existing Phase 1 contracts cannot be
  referenced without a minimal shared type adjustment
- `test/formal/**` contract and architecture tests
- `docs/formal-rebuild/**`, `INDEX.md`, `CURRENT_STATE.md`, `PROGRESS.md`, or
  `ARCHITECTURE.md` only as required by the state-sync gate

## Forbidden Writes

- `src/plugins/**`
- `src/providers/**`
- `src/source/**`
- `src/storage/**`
- `src/material/**`
- `src/collection/**`
- `src/memory/**`
- `src/effects/**`
- active provider docs or provider area docs outside the Phase 3 plan
- compatibility aliases or bridges for old MVP plugin/provider roots
- `CONTEXT.md`

## Accepted Decisions

### Extension Root Uses `src/extension`

The active formal root for plugin-system work is:

```text
src/extension/**
```

Do not restore the old active root:

```text
src/plugins/**
```

`src/plugins/**` remains pre-formal vocabulary and should stay blocked by the
active-tree guard. Future plugin implementation files live under Extension
unless a later ADR accepts a narrower sub-area.

### Slot And Registry Types Belong To Extension

`CapabilitySlot`, `CapabilityRegistration`, `CapabilityRegistry`,
`MineMusicPlugin`, `PluginActivationContext`, and concrete slot declarations
belong under `src/extension/**`.

Do not place the plugin-system mechanism itself in `src/contracts/index.ts`.
Formal contracts may still own implementation shapes that slots reference,
such as `SourceProvider`, `ProviderMaterialCandidate`, and `SourceEntity`.

This keeps `src/contracts/index.ts` as cross-area contract vocabulary rather
than a dumping ground for Extension runtime mechanics.

### Owner Area Stays On Runtime Module

Phase 3 uses `ownerArea: "extension"` only on the Stage Core runtime module
descriptor and resulting module snapshot.

Do not add `ownerArea` to plugin manifests, capability slots, or source-provider
registrations. Those objects already live under the Extension boundary and do
not need a second ownership field.

### CapabilitySlot Is Not Service Locator

`CapabilitySlot` is a MineMusic-defined extension point. It is not a generic
string-to-any registry.

Minimum contract:

```ts
type CapabilityCardinality = "single" | "many" | "many-by-id";

type CapabilityWritePolicy =
  | "none"
  | "request-scoped-only"
  | "application-service-command-only"
  | "core-only";

type CapabilitySlot<T> = {
  id: string;
  cardinality: CapabilityCardinality;
  writePolicy: CapabilityWritePolicy;
};
```

Slots are plain objects created through a factory such as
`defineCapabilitySlot(...)`. Do not introduce a `CapabilitySlot` class in Phase
3. The expected long-term direction is also plain object plus factory; a later
phase may add a lightweight object brand for type-safety if needed, but slot
behavior belongs in registry/runtime, not in a slot class.

Rules:

- slots are defined by MineMusic, not invented by plugins at activation time;
- slot ids are stable public extension ids;
- each slot has typed implementation shape;
- each slot states how many implementations are allowed;
- each slot states write policy even if no writer exists yet;
- the registry rejects duplicate or invalid registrations deterministically;
- plugin activation cannot obtain arbitrary core internals through the registry.
- registry list ordering is deterministic: plugin array order, then
  registration order inside each plugin activation.
- Phase 3 does not add priority, weight, provider ranking, or replacement
  ordering.

Registry lookup is always scoped by typed slot. The registry may support:

```ts
registry.list(sourceProviderSlot);
registry.get(sourceProviderSlot, "netease");
```

It must not support naked global lookup such as:

```ts
registry.get("netease");
```

The lookup key is meaningful only inside its slot. For example, `netease` may
identify a source-provider registration, not a global runtime service.

### CapabilityRegistration Is Plugin-Scoped

Minimum contract:

```ts
type CapabilityRegistration<T> = {
  pluginId: string;
  key: string;
  value: T;
};
```

Rules:

- `pluginId` identifies the contributing plugin;
- `key` identifies this implementation inside the slot;
- `many-by-id` slots use `key` as the lookup key;
- registration keys must be stable and ref-safe;
- duplicate keys in the same slot fail activation;
- a plugin may only register slots declared by its manifest.
- a plugin may register more than one implementation for the same declared
  capability when the slot cardinality allows it.

### Registry Name Is CapabilityRegistry

The registry that stores slot registrations is `CapabilityRegistry`, not
`ExtensionRegistry`.

`CapabilityRegistry` is intentionally narrow: register/list/get for declared
capability slots. It must not become a container for plugin manifests, config,
provider account state, runtime lifecycle, or Stage Interface metadata.

`CapabilityRegistry` is an Extension-internal mechanism. Plugins do not receive
it through activation context, and Stage Core does not receive it through the
runtime module boundary.

### Plugin Manifest Comes Before Activation

Phase 3 uses a light manifest:

```ts
type MineMusicPluginManifest = {
  id: string;
  displayName: string;
  version: string;
  minCoreVersion: string;
  capabilities: readonly string[];
};

type MineMusicPlugin = {
  manifest: MineMusicPluginManifest;
  activate(ctx: PluginActivationContext): Result<void> | Promise<Result<void>>;
};
```

Rules:

- manifest validation happens before activation;
- plugin id is stable, unique, and uses lowercase dotted/kebab segments such
  as `minemusic.netease` or `internal.fixture-source`;
- plugin capabilities are non-empty and reference known slot ids;
- plugin capability declarations, not top-level plugin kind, control what a
  plugin may register;
- activation receives a narrow context, not Stage Core, Stage Interface,
  database, provider SDK registry, or full stores;
- a plugin that registers an undeclared capability fails activation.
- a plugin that declares a capability but registers nothing for that
  capability fails activation.
- Phase 3 activation context exposes slot-specific registration helpers only,
  such as `registerSourceProvider(...)`.
- Phase 3 activation context must not expose logger, http client, secrets,
  clock, config, database, Stage Interface, Stage Runtime, or the raw
  CapabilityRegistry. Those runtime capabilities belong to later
  provider/config/runtime phases.

Phase 3 must not add manifest fields for plugin kind, activation events,
config schema, secrets, dependencies, permissions, provider account, or config
flow. Those belong to later phases when provider/config/runtime lifecycle is in
scope.

Phase 3 does not support plugin dependencies. There is no topological sort,
optional dependency, version constraint, dependency cycle detection, or plugin
load graph. Static plugin array order is the only activation order.

`version` and `minCoreVersion` are required non-empty manifest strings in
Phase 3. Do not add semver parsing, current-core-version comparison,
compatibility rejection, or version-range semantics in this phase.

Phase 3 does not distinguish internal, external, trusted, or untrusted plugins
as manifest fields. Static plugin array composition is the only source model.
Plugin origin may be implied by id naming conventions such as
`internal.fixture-source`, but there is no origin or trust policy in this
phase.

Plugin activation may be asynchronous, but Extension runtime activates plugins
serially in the plugin array order. Phase 3 does not parallelize activation.
Async support is signature flexibility only; it does not imply external
provider execution capability.

### Static Runtime First

Phase 3 should use static plugin registration:

```ts
createExtensionRuntime({
  plugins: [internalPlugin],
});
```

Static runtime is enough to validate boundaries. Dynamic import, package
discovery, marketplace rules, external plugin signing, and process isolation
are future concerns.

Phase 3 plugin runtime is a capability-registration runtime, not a provider
execution runtime. Plugins may activate and register already-constructed
capability implementations. Phase 3 does not give plugins the runtime service
bundle needed to execute real external providers, such as http, secrets,
config, logger, account context, or rate-limit state.

### Extension Runtime Is Required And Fail-Fast

Phase 3 keeps the Phase 2 runtime rule that all modules are required.

Extension initialization failure makes the whole Stage Runtime fail. This
includes:

- invalid plugin manifest;
- duplicate plugin id;
- registration to an undeclared slot;
- registration to an unknown slot;
- registration to a `core-only` slot by a plugin;
- duplicate source-provider `providerId`;
- unsafe source-provider `providerId`;
- source-provider `providerId` mismatch with
  `provider.descriptor.providerId`;
- plugin activation throwing or returning a failed result.

Extension/plugin/registry validation errors use `StageError.area =
"extension"`. Stage Core receives the module initialization failure and marks
the runtime failed, but it does not relabel Extension validation errors as
Stage Core errors.

Minimum Extension error codes:

```text
extension.invalid_plugin_manifest
extension.invalid_plugin_id
extension.duplicate_plugin
extension.unknown_capability
extension.invalid_capability_registration_key
extension.undeclared_capability_registration
extension.missing_declared_capability_registration
extension.core_only_capability_registration
extension.duplicate_capability_registration
extension.unsafe_provider_id
extension.provider_id_mismatch
extension.plugin_registration_owner_mismatch
extension.activation_context_closed
extension.plugin_activation_failed
```

Phase 3 tests should assert `code` and `area`, not long diagnostic messages.

Phase 3 does not support optional plugins, degraded readiness, skipping bad
plugins, plugin quarantine, lazy retry, reload, or partial ready status.

### Extension Stop Is No-Op In Phase 3

The Extension runtime module should implement `stop()` so Stage Core lifecycle
can call it normally. In Phase 3, stop is a no-op that returns success.

Do not add plugin `deactivate`, provider close hooks, deregistration side
effects, connection cleanup, or async teardown semantics in this phase.
Provider execution lifecycle belongs to later provider/runtime phases.

### Empty Extension Runtime Is Valid

An Extension runtime with no plugins is valid in Phase 3.

The default Server Host composition should mount an empty Extension runtime.
That proves the required module boundary without pretending MineMusic has an
active provider integration.

Tests should use fixture plugins and fixture source providers to prove
manifest validation, registration, lookup, and failure behavior. Fixture
providers must not appear in the default server output or become active
provider implementation roots.

The default server command should therefore report an initialized Extension
module in the runtime module list, alongside the existing internal runtime
status module, while still omitting provider/plugin/slot details.

The module snapshot should use:

```json
{ "id": "extension", "ownerArea": "extension", "status": "initialized" }
```

Extension runtime may expose an internal snapshot for Extension tests, such as
plugin ids or registration counts. That snapshot must not be embedded in
`StageRuntimeSnapshot`, returned by `stage.runtime.status`, or printed by the
default server command.

### Source Provider Is A Slot, Not A Provider Platform

Phase 3 must define the `source-provider` slot using the existing Phase 1
`SourceProvider` contract:

```text
slot id: source-provider
cardinality: many-by-id
writePolicy: none
implementation contract: SourceProvider
```

This is contract-only. It does not implement NetEase or call external
providers.

`source-provider.writePolicy` is fixed to `none` in Phase 3. Source providers
return candidates, source facts, or links. They do not write durable MineMusic
state and do not write request-scoped candidate stores. Request-scoped
candidate relations belong to a future query/application-service phase.

Tests may register a fixture source-provider registration to prove activation,
registration, lookup, and boundary validation. That fixture is test-only. It
must not become a runtime public tool, query source, presentation source, or
provider implementation root.

For the `source-provider` slot, use domain language at the slot boundary:

```ts
type SourceProviderRegistration = {
  pluginId: string;
  providerId: string;
  provider: SourceProvider;
};
```

`providerId` must match `provider.descriptor.providerId`. The generic registry
may internally treat that value as the registration key, but source-provider
callers should not need to use the generic name.

One plugin may register multiple source providers as long as each `providerId`
is unique and matches its provider descriptor. Plugin and provider are not
one-to-one concepts.

`providerId` uses Phase 1 ref-component safety: it must be non-empty and must
not contain `:`. Phase 3 should not add a stricter lowercase-kebab rule for
provider ids.

Phase 3 should expose a source-provider registration helper in domain language:

```ts
registerSourceProvider({
  pluginId: "fixture-source-plugin",
  providerId: "fixture-source",
  provider,
});
```

Do not require source-provider callers to construct a raw
`CapabilityRegistration<SourceProvider>` with `key` and `value` fields.

Plugin activation receives this helper through the activation context. It must
not receive the raw registry or a source-provider sub-registry:

```ts
ctx.registerSourceProvider(...); // allowed
ctx.registry; // forbidden
ctx.sourceProviders; // forbidden
```

During activation, a plugin may register itself. It may not inspect, replace,
rank, query, or otherwise manage other provider registrations.

The existing `SourceProviderCapability` type in `src/contracts/index.ts`
describes provider operations such as search, lookup, and playable links. It
is not the same concept as `CapabilitySlot`.

Phase 3 should not reopen the `SourceProvider` or
`ProviderMaterialCandidate` contract. It should reference the existing Phase 1
contracts and validate only Extension-owned registration rules, such as
`providerId === provider.descriptor.providerId`.

### Provider Output Does Not Become Material Output

Provider-capability implementations return normalized source facts,
candidates, or action results. They do not return:

- `MaterialRecord`;
- `MaterialEntity` as a write result;
- query result DTOs;
- `MaterialCard`;
- Stage Interface output DTOs;
- raw provider payloads as public output.

Durable material identity, owner facts, source-library state, query output,
and final presentation belong to later owning areas.

### Write Policy Is Metadata And Guardrail In Phase 3

Phase 3 has no Music Data Platform writer. Write policy is still required
because it prevents future slot design from hiding writes behind vague read
ports.

Policy meanings:

| Policy | Meaning |
| --- | --- |
| `none` | implementation must not write MineMusic state. |
| `request-scoped-only` | implementation may return request/session-scoped data but not durable writes. |
| `application-service-command-only` | durable write is only allowed through a named application-service command boundary. |
| `core-only` | not registerable by external/provider plugins. |

Phase 3 should include tests proving provider/plugin registrations cannot
register `core-only` slots.

### Extension Does Not Import Stage Interface Or Domain Areas

Extension owns plugin semantics. It should not import Stage Interface DTOs,
Music Data Platform implementations, provider implementations, storage,
memory, effects, or presentation helpers.

Allowed direction:

```text
Stage Core adapter -> Extension public runtime factory
Extension -> contracts
Extension -> no Stage Interface DTOs
Extension -> no domain implementation roots
```

Stage Core must import Extension only through the mounting adapter needed to
create the Extension runtime module. Extension must not import Stage Core just
to become a module; the Stage Core adapter owns that translation.

## Expected Implementation Shape

Likely files:

```text
src/extension/capability_slot.ts
src/extension/capability_registry.ts
src/extension/plugin_manifest.ts
src/extension/plugin_runtime.ts
src/extension/source_provider_slot.ts
src/extension/index.ts
src/stage_core/extension_runtime_module.ts
```

Phase 3 should define only one concrete slot in code: `source-provider`.
Other future slots named in global architecture, such as playback provider,
storage provider, stage tool, effect provider, knowledge provider, or
provider-config-flow, stay as future architecture direction only. They should
not be implemented, stubbed, or tested in Phase 3.

Possible tests:

```text
test/formal/extension-capability-slot.test.ts
test/formal/extension-plugin-runtime.test.ts
test/formal/stage-runtime.test.ts
test/formal/active-tree.test.ts
```

The exact file list may be adjusted during implementation, but the owner
boundary and non-goals must not change without updating this plan first.

## Execution Plan

Implement Phase 3 in boundary-first order:

1. Update architecture/active-tree tests.
   - Allow the new formal `src/extension/**` root.
   - Keep `src/plugins/**` and `src/providers/**` absent.
   - Guard that Extension does not import Stage Interface or domain
     implementation roots.
   - Guard that Stage Interface does not import Extension.
2. Add Extension contract tests.
   - Manifest validation.
   - Duplicate plugin id failure.
   - Registration to undeclared or unknown slot failure.
   - Duplicate source-provider `providerId` failure.
   - Source-provider `providerId` mismatch failure.
   - Plugin registration to `core-only` slot failure.
   - Typed-slot `list` and `get` behavior for `source-provider`.
3. Implement `src/extension/**`.
4. Implement the Stage Core adapter that mounts Extension as runtime module
   `extension`.
5. Wire default Server Host composition to mount an empty Extension runtime.
6. Update Stage Core runtime composition so caller-provided required modules,
   including `extension`, initialize before the internal `runtime-status`
   module.
7. Update runtime/status tests to prove compact status output includes the
   `extension` module and excludes registry internals.
8. Add new Extension tests to the project test runner.
9. Update docs and run the verification gate.

## Architecture Guards

Phase 3 is incomplete unless tests or type-level checks guard the new boundary.

Required guards:

- `src/extension/**` exists as the formal Extension root;
- `src/plugins/**` remains absent from the active tree;
- `src/providers/**` remains absent from the active tree;
- Extension code does not import `src/stage_interface/**`;
- Extension code does not import Music Data Platform, storage, material,
  collection, memory, or effects roots;
- Stage Interface code does not import `src/extension/**`;
- provider/search/query/presentation vocabulary does not leak into Extension
  registry tests as durable material or final card output;
- `source-provider` slot uses `SourceProvider` as implementation contract and
  does not produce `MaterialRecord` or `MaterialCard`.

Required contract tests:

- manifest ids are validated and unique;
- plugin activation fails before mutation when manifest is invalid;
- plugin activation fails when contributing to undeclared slots;
- registry rejects unknown slots;
- registry rejects duplicate `single` and duplicate `many-by-id`
  registrations;
- registry preserves deterministic list ordering;
- plugin registrations cannot register `core-only` slots;
- Extension runtime can be mounted as a required Stage Core runtime module;
- Stage Runtime status reports the Extension module without exposing registry
  internals.
- runtime status includes Extension module lifecycle only and does not include
  plugin ids, provider ids, slot ids, registration details, registry counts, or
  fixture provider data.

## Verification

Implementation should run:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```

Run the targeted formal test command before the broad gate:

```bash
npm run test:stage-core
```

If Phase 3 adds a more specific Extension test script, use that script first
and keep `npm run test:stage-core` as the broader formal runtime gate.

## Acceptance Criteria

Phase 3 is accepted when:

- Extension root exists under `src/extension/**`;
- no active `src/plugins/**` or `src/providers/**` root is restored;
- `CapabilitySlot`, `CapabilityRegistration`, `CapabilityRegistry`, plugin
  manifest, and plugin activation context exist with tests;
- a contract-only `source-provider` slot is registered against the Phase 1
  `SourceProvider` shape;
- write policy exists and blocks plugin registration into `core-only` slots;
- Stage Core mounts Extension through a runtime module adapter;
- the mounted runtime module id is `extension`;
- runtime initialization succeeds with Extension mounted;
- default Server Host composition mounts an empty Extension module;
- Stage Runtime status remains compact and does not expose registry internals;
- architecture tests guard import direction and deleted roots;
- docs record that NetEase/provider/query/materialization/presentation remain
  out of scope.

## Stopping Condition

Stop Phase 3 once the Extension capability-slot baseline is implemented,
mounted, tested, and documented.

Do not continue into provider implementation, Provider Config Flow, query,
database, materialization, Stage Interface music tools, or presentation cards
inside the same phase.
