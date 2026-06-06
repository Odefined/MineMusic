# Extension Design

> Status: Current design authority
> Scope: Extension-owned plugin system and capability slot design
> Not status ledger: Current implementation state lives in `progress.md`.

Extension is the formal area that lets MineMusic grow replaceable integrations
without letting integrations rewrite core semantics. It owns plugin
declaration, capability slot registration, and adapter replaceability
metadata.

Extension does not own runtime graph composition, Stage Interface public
tools, Music Data Platform facts, query, materialization, Memory, Effect
execution, or final presentation.

## Core Concepts

| Concept | Meaning | Owner |
| --- | --- | --- |
| `CapabilitySlot<T>` | MineMusic-defined typed extension point. | Extension |
| `CapabilityRegistry` | Internal registry for slot-scoped registration, list, and get-by-id. | Extension |
| `CapabilityRegistration<T>` | Generic internal registration record for one slot implementation. | Extension |
| `MineMusicPluginManifest` | Light static declaration of plugin id, display name, version metadata, and declared capabilities. | Extension |
| `MineMusicPlugin` | Manifest plus activation function that registers allowed capabilities. | Extension |
| `PluginActivationContext` | Narrow activation boundary exposed to plugin code. | Extension |
| `SourceProviderRegistration` | Source-provider-specific registration using `providerId` and `SourceProvider`. | Extension |

`RuntimeModule` is not a plugin. It is a Stage Core composition unit. Stage
Core may mount Extension through runtime module `extension`, but Extension does
not own Stage Core lifecycle semantics.

## Capability Slot Rules

Capability slots are typed plain objects created through
`defineCapabilitySlot(...)`.

Each slot states:

- stable slot id;
- cardinality: `single`, `many`, or `many-by-id`;
- write policy: `none`, `request-scoped-only`,
  `application-service-command-only`, or `core-only`;
- implementation type through TypeScript generics.

Extension does not introduce a `CapabilitySlot` class and does not introduce
`CapabilityRef`. The typed slot object is the lookup reference.

Registry lookup is always scoped by typed slot:

```ts
registry.get(sourceProviderSlot, "netease");
registry.list(sourceProviderSlot);
```

Naked global lookup is forbidden:

```ts
registry.get("netease");
```

The lookup key is meaningful only inside its slot. For `source-provider`, that
key is the provider id.

## Plugin Manifest Rules

Phase 3 uses a light static manifest:

```ts
type MineMusicPluginManifest = {
  id: string;
  displayName: string;
  version: string;
  minCoreVersion: string;
  capabilities: readonly string[];
};
```

Rules:

- plugin id uses lowercase dotted/kebab segments, such as
  `minemusic.netease` or `internal.fixture-source`;
- `displayName`, `version`, and `minCoreVersion` are required non-empty
  strings;
- `capabilities` is non-empty and references known slot ids;
- every declared capability must register at least one implementation during
  activation;
- plugins may register more than one implementation for the same declared
  capability when slot cardinality allows it;
- plugin activation is serial in static plugin array order;
- registry list order is plugin array order, then registration order inside
  each plugin activation.

Phase 3 does not define plugin kind, activation events, config schema,
secrets, dependencies, permissions, provider account, trust/origin fields,
dynamic loading, version-range compatibility, or semver rejection.

## Activation Context

Plugin activation receives only slot-specific registration helpers. For the
current source-provider slot:

```ts
ctx.registerSourceProvider({
  pluginId: "internal.fixture-source",
  providerId: "fixture-source",
  provider,
});
```

Activation context must not expose:

- raw `CapabilityRegistry`;
- source-provider sub-registry;
- logger;
- http client;
- secrets;
- clock;
- config;
- database;
- Stage Interface;
- Stage Runtime.

The activation boundary lets a plugin register itself. It does not let a plugin
inspect, rank, replace, or manage other provider registrations.

## Source Provider Slot

`source-provider` is the only concrete slot currently defined in Extension.

```text
slot id: source-provider
cardinality: many-by-id
writePolicy: none
implementation contract: SourceProvider
```

The slot is contract-only. It does not implement NetEase, MusicBrainz,
local-file providers, provider account config, provider health, provider
execution context, or external API calls.

Source-provider registrations use domain language:

```ts
type SourceProviderRegistration = {
  pluginId: string;
  providerId: string;
  provider: SourceProvider;
};
```

Rules:

- `providerId` must be non-empty and must not contain `:`;
- `providerId` must equal `provider.descriptor.providerId`;
- one plugin may register multiple source providers;
- duplicate provider ids fail runtime initialization;
- `source-provider.writePolicy` is `none`;
- source providers return source facts, candidates, or links through the
  `SourceProvider` contract;
- source providers do not write durable MineMusic state;
- source providers do not write request-scoped candidate stores.

Request-scoped candidate relations, query mixing, materialization, and final
presentation belong to later owning phases.

## Runtime Semantics

Extension runtime is a capability-registration runtime, not a provider
execution runtime.

It:

- validates static plugin manifests;
- activates plugins serially;
- records slot registrations;
- exposes internal Extension snapshots for Extension tests;
- can be mounted by Stage Core as runtime module `extension`;
- supports no-op stop.

It does not:

- execute external provider calls;
- own provider accounts, secrets, config, rate limits, or health policy;
- contribute Stage Interface instruments, tools, or handlers;
- expose registry details through `stage.runtime.status`;
- support optional plugins, degraded readiness, skip-bad-plugin behavior,
  quarantine, reload, retry, plugin dependencies, or dynamic loading.

An empty Extension runtime is valid. Default Server Host composition mounts an
empty Extension runtime module so the runtime boundary is present without
pretending real providers exist.

## Failure Semantics

Extension is required and fail-fast. Any manifest, activation, or registration
error fails Extension initialization and therefore fails Stage Runtime
initialization.

Extension validation errors use `StageError.area = "extension"`.

Minimum stable error codes:

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

Tests should assert code and area, not long diagnostic messages.

## Public Surface

Extension has no direct agent-facing public tool in the current baseline.

`stage.runtime.status` may show that runtime module `extension` is initialized.
It must not show plugin ids, provider ids, slot ids, registration details,
registry counts, or fixture provider data.

Future capability discovery for agents, if needed, belongs to a later Stage
Interface phase and must define a compact public output shape before exposing
any Extension detail.
