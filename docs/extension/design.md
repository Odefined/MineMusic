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
| `PlatformLibraryProviderRegistration` | Platform-library-provider-specific registration using `providerId` and `PlatformLibraryProvider`. | Extension |

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

The lookup key is meaningful only inside its slot. For `source-provider` and
`platform-library-provider`, that key is the provider id.

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

Plugin activation receives only slot-specific registration helpers. Current
helpers are source provider and platform library provider registration:

```ts
ctx.registerSourceProvider({
  pluginId: "internal.fixture-source",
  providerId: "fixture-source",
  provider,
});

ctx.registerPlatformLibraryProvider({
  pluginId: "minemusic.ncm",
  providerId: "netease",
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

`source-provider` is the concrete Extension slot for provider search and
source-side provider operations.

```text
slot id: source-provider
cardinality: many-by-id
writePolicy: none
implementation contract: SourceProvider
```

The slot owns registration and narrow operation calls against registered
providers. It does not implement NetEase, MusicBrainz, local-file providers,
provider account config, provider health, provider runtime state, or provider
HTTP details.

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
- source-provider descriptor shape is validated at registration time, including
  non-empty label, array capability list, supported capability literals, and
  declared method availability for `search`, `playable_links`, and `download_source`;
- one plugin may register multiple source providers;
- duplicate provider ids fail runtime initialization;
- `source-provider.writePolicy` is `none`;
- source providers return source facts, candidates, or links through the
  `SourceProvider` contract;
- source providers do not write durable MineMusic state;
- source providers do not write request-scoped candidate stores.

Extension Runtime exposes source-provider search through a narrow seam:

```ts
extensionRuntime.searchSourceProvider(input)
```

That seam may find a registered provider, call `SourceProvider.search(...)`,
validate source-provider search input and output integrity, and return
validated provider candidates. It must not expose the raw registry, write
Music Data Platform state, create query hits, materialize candidates, build
presentation output, or call `getPlayableLinks(...)`.

Request-scoped candidate relations, query mixing, materialization, and final
presentation belong to later owning phases.

## Platform Library Provider Slot

`platform-library-provider` is the concrete Extension slot for provider
account-library reads.

```text
slot id: platform-library-provider
cardinality: many-by-id
writePolicy: none
implementation contract: PlatformLibraryProvider
```

The slot is separate from `source-provider` because account-library import is
not text search. It reads provider-account library observations for a specific
provider, account, library kind, and cursor.

Platform-library registrations use domain language:

```ts
type PlatformLibraryProviderRegistration = {
  pluginId: string;
  providerId: string;
  provider: PlatformLibraryProvider;
};
```

Rules:

- `providerId` must be non-empty and must not contain `:`;
- `providerId` must equal `provider.descriptor.providerId`;
- descriptor shape is validated at registration time, including non-empty
  label and supported `libraryKinds`;
- the provider must expose `read(input)`;
- `platform-library-provider.writePolicy` is `none`;
- provider reads return normalized `PlatformLibraryReadResult`;
- provider reads do not write durable MineMusic state, create source library
  items, materialize candidates, build query hits, or shape presentation
  output.

Extension Runtime exposes provider-library reads through a narrow seam:

```ts
extensionRuntime.readPlatformLibraryProvider(input)
```

That seam validates input and output integrity, including provider id, library
kind, support for the requested kind in the provider descriptor, provider
account id exact ref-safety when present, limit, cursor, result provider
ownership, candidate kind, candidate source namespace, candidate count against
requested limit, optional `nextCursor`, and optional `totalCountHint`.

Music Data Platform consumes this seam through a narrow read port during
Library Import. Provider/plugin code still does not write Music Data Platform
records directly.

## Runtime Semantics

Extension runtime is a capability-registration runtime with narrow registered
provider operation seams. It is not a generic provider platform or provider
HTTP runtime.

It:

- validates static plugin manifests;
- activates plugins serially;
- records slot registrations;
- exposes source-provider search through `ExtensionRuntime.searchSourceProvider`;
- exposes platform-library-provider reads through
  `ExtensionRuntime.readPlatformLibraryProvider`;
- exposes internal Extension snapshots for Extension tests;
- can be mounted by Stage Core as runtime module `extension`;
- supports no-op stop.

It does not:

- own provider accounts, secrets, config, rate limits, or health policy;
- expose provider HTTP details, endpoint paths, raw payloads, or provider
  config through generic Extension docs or Stage Interface;
- contribute Stage Interface instruments, tools, or handlers;
- expose registry details through `stage.runtime.status`;
- support optional plugins, degraded readiness, skip-bad-plugin behavior,
  quarantine, reload, retry, plugin dependencies, or dynamic loading.

An empty Extension runtime remains valid for tests and explicit composition.
Default Server Host composition may mount a configured Extension runtime with
default plugins supplied by Server Host / composition config. Plugin-specific
details belong in plugin-specific docs, not in the generic Extension design.

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
extension.invalid_source_provider_registration
extension.invalid_source_provider_descriptor
extension.plugin_registration_owner_mismatch
extension.activation_context_closed
extension.plugin_activation_failed
extension.runtime_failed
extension.runtime_stopped
extension.runtime_not_ready
extension.source_provider_not_found
extension.source_provider_search_unsupported
extension.source_provider_search_failed
extension.invalid_source_provider_search_input
extension.invalid_source_provider_search_output
extension.invalid_platform_library_provider_registration
extension.invalid_platform_library_provider_descriptor
extension.platform_library_provider_not_found
extension.platform_library_provider_read_failed
extension.invalid_platform_library_provider_read_input
extension.invalid_platform_library_provider_read_output
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
