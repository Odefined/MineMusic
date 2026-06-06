# Formal Project Glossary

> Status: Formal target glossary
> Scope: Formal rebuild vocabulary and MVP-to-formal term mapping
> Not status authority: This document describes target language. It does not
> claim that the current code has already implemented every term.

This glossary records the formal MineMusic vocabulary agreed during the formal
rebuild audit. It exists so Phase 0/1 work can use stable language without
patching old MVP concepts into new names.

Old MVP docs and old MVP code are reference evidence, deletion inventory, and
migration input. They are not formal authority and should not be preserved by
compatibility layers.

## Core Rule

The formal model separates these objects:

| Object | Owns | Does Not Own |
| --- | --- | --- |
| Server Host | Process, transport, server-level config loading, startup/shutdown, and keeping one composed Stage Runtime alive. | Runtime graph composition, tool semantics, domain facts, provider semantics, or final music judgment. |
| Stage Interface | Agent-facing workspace boundary: instruments, tools, Handbook, schemas, outputs, and dispatch. | Music facts, provider internals, domain ownership, or final music judgment. |
| Stage Core | Runtime composition and lifecycle. | Plugin semantics, music domain facts, or agent-facing tool language. |
| Extension | Plugin System, Capability Slots, provider/plugin manifests, and adapter replaceability. | Music facts, material identity, owner facts, query/present workflow, or final presentation. |
| Music Intelligence | Retrieval and Knowledge capabilities that help the agent understand, discover, compare, and reason about music. | Long-term Memory, final recommendation judgment, material identity, and external effects. |
| Memory | Long-term user/music relationship state, taste memory, preference/rule memory, contextual preferences, and evidence-backed memory proposals. | Material identity, owner relation source-of-truth, Retrieval, Knowledge, or external effects. |
| Music Experience | Music interaction state and behavior: radio mode, queue/now-playing intent, presented recommendations, play/open/skip events, feedback binding, pacing, and dedupe. | Retrieval, Music Data Platform, long-term Memory, effect execution, or effect permission policy. |
| `SourceEntity` | Normalized provider/source facts. | Material identity, owner relations, public output, raw provider payload. |
| `MaterialEntity` | MineMusic material identity anchor. | Links, availability, query score, presentation seed, owner policy. |
| `CanonicalEntity` | Cross-source identity authority. | Source refs, material refs, playable links, owner facts. |
| Music Data Platform | Source/material/canonical identity, storage records, bindings, owner-scoped fact families, and projections. | Provider integration, plugin semantics, agent-facing tool schemas, query/present workflow orchestration. |
| Library Import / Update | Music Data Platform persistence flow that turns external account-library observations into durable source records, source library items, material bindings, import batches, update baselines, and projections. | Provider integration or external account-library reads. |
| Canonical Maintenance | Music Data Platform capability for canonical evidence, review/apply, merge/split, and identity graph maintenance. | Not a separate top-level bounded context; does not own Stage Interface tools, provider adapters, owner facts, query/present workflow, or `MaterialCard`. |
| `*Record` | Storage shape, SQL keys, lookup/index columns. | Public/domain entity shape. |
| Query hit/result | Evidence for the agent/query caller's next decision. | Final presentation card. |
| `MaterialCard` | Final Stage Interface presentation output. | Query engine internal state or provider candidate shape. |

## Reference And Handle Vocabulary

| Term | Meaning | Formal Rule |
| --- | --- | --- |
| `Ref` | Opaque identity reference with `{ namespace, kind, id, label? }`. | Keep one shape. Do not split into separate structural `SourceRef` / `MaterialRef` / `CanonicalRef` types. Use field names for semantic role. |
| `label` | Non-authoritative display/debug hint on `Ref`. | Must not be used as identity authority. |
| `Ref.url` | Old mixed navigation/link field. | Remove. Links belong to source-owned link facts. |
| `refKey(ref)` | Canonical public string helper for refs. | `namespace`, `kind`, and `id` must not contain `:`. Do not hand-roll ref key strings. |
| `PublicRefKey` | Public string handle produced by `refKey(ref)`. | Plain string in formal v1, not a branded type. |
| `mat:` / `emat:` | Old public material/ephemeral material codec. | Remove from active public contracts. |
| `{ handleKind, handle }` | Public handle wrapper when multiple handle domains are possible. | Use instead of overloaded `mat:` / `emat:` prefixes. |

## Entity Vocabulary

| Term | Meaning | Formal Rule |
| --- | --- | --- |
| `SourceEntity` | Durable normalized provider-side facts. | `kind = track | album | artist`; contains provider ids, source ref, explicit normalized facts, optional links, optional version info. |
| `SourceRecord` | Storage record for source facts and lookup columns. | May contain SQL/storage keys and indexes; not exposed as domain/source contract. |
| `MaterialEntity` | MineMusic-owned material identity anchor. | Domain identity only; may carry canonical/source identity anchors and version info. |
| `MaterialRecord` | Storage record for material identity persistence. | Persistence shape only; may differ from `MaterialEntity`. |
| `CanonicalEntity` | Cross-source identity authority. | May carry display/search aliases and version info only when canonical identity is version-specific. |
| `CanonicalRecord` | Storage record for canonical identity maintenance. | May carry storage keys, provider identity indexes, and evidence facts. |

## Kind Vocabulary

| Term | Layer | Formal Rule |
| --- | --- | --- |
| `track` | Source side only. | Provider song/track entries use `SourceEntity.kind = "track"`. |
| `recording` | Material/canonical identity. | Ordinary provider track materialization maps to `MaterialEntity.kind = "recording"`. |
| `album` | Source/material/canonical default album identity. | Ordinary provider album materialization maps to `album`, not `release` or `release_group`. |
| `artist` | Source/material/canonical identity. | Allowed across source and identity layers. |
| `work` | Material/canonical identity graph. | Not ordinary provider song materialization; recording-work relation belongs to identity graph/canonical maintenance. |
| `release` | Material/canonical concrete edition. | Reserved for concrete edition, pressing, version, or record-collection workflows. |
| `release_group` | Reserved future identity vocabulary. | Not deleted, but not enabled as ordinary formal v1 query target or public output kind. |

## Version Vocabulary

| Term | Meaning | Formal Rule |
| --- | --- | --- |
| `VersionInfo` | First-class version information. | Not presentation-only title text. Must be indexable/projectable later. |
| `VersionInfo.label` | Provider/user-readable version wording. | Preserves wording such as remastered, live, remix, unplugged, radio edit, extended, acoustic, demo, deluxe. |
| `VersionInfo.tags` | Normalized version categories. | Used for structured comparison and wrong-version feedback. |
| `SourceEntity.versionInfo` | Source/provider version fact. | Records what the provider/source says. |
| `MaterialEntity.versionInfo` | MineMusic material identity version judgement. | Used when version affects material identity. |
| `CanonicalEntity.versionInfo` | Canonical identity version fact. | Present only when the canonical identity itself is version-specific. |
| recording-work relation | Relation between recording and work identity. | Not `VersionInfo`; not Phase 1 core material field. |

## Link And Availability Vocabulary

| Term | Meaning | Formal Rule |
| --- | --- | --- |
| `PlayableLink` | Source-owned internal playable link value. | Shape: `{ url, label?, requiresAccount? }`; no `sourceRef`, no `expiresAt`. |
| `PublicDisplayLink` | Public display link. | Shape: `{ url, label? }`; no account constraint field. |
| `providerUrl` | Source/provider navigation hint. | Not a playable link and not a replacement for `Ref.url`. |
| `availabilityHint` | Source/provider-side availability hint. | Not final material availability. |
| `MaterialAvailability` | Computed availability axis. | `playable | restricted | unavailable | unknown`; computed in projection/query/present, not stored as `MaterialEntity` core state. |
| `SourceProvider.getPlayableLinks` | Explicit refresh/repair/account re-check capability. | Not the default extra provider call during ordinary present. |

## Stage, Extension, Intelligence, And Memory Vocabulary

| Term | Meaning | Formal Rule |
| --- | --- | --- |
| Stage | Product metaphor for MineMusic as an agent workspace/workbench. | Keep as naming root in `Stage Interface`, `Stage Core`, and `Session Context`, but do not make `Stage` a separate top-level architecture area or catch-all bounded context. |
| Server Host | Architecture area for process and transport hosting. | Owns process startup/shutdown, MCP/HTTP/stdio or future host transports, server-level config loading, host adapter lifecycle, and holding a composed Stage Runtime. It does not own Stage Runtime composition. |
| Host Adapter | Server Host adapter that exposes the composed MineMusic runtime through a transport such as MCP, HTTP, stdio, CLI, or future Web UI. | Does not own Stage Interface tool truth, Stage Core composition, or domain facts. |
| Host Client / Integration Package | External or adjacent client package that consumes MineMusic through a host transport. | Codex skill belongs here: it consumes Stage Interface over a host transport and is not Server Host core. |
| Stage Interface | Agent/host callable boundary. | Owns Instrument Catalog, Tool Registry, tool schemas, validation, compact public outputs, dispatch, session-aware tool availability, and Handbook. |
| Instrument | Agent-facing workbench section inside Stage Interface. | Groups tools and visible provider/capability descriptors for the agent. It is not a bounded context, domain service, or capability slot, and it does not need to map one-to-one to internal architecture areas. |
| Tool | Callable operation exposed through Stage Interface. | Delegates to the owning capability/context through narrow ports. A tool definition is not the business owner. |
| Extension-native Instrument / Tool | Provider/plugin-owned agent-facing tool surface for external-native functionality that has no MineMusic internal integration yet or is intentionally provider-native. | Allowed only when clearly marked provider/plugin-owned, not used to bypass MineMusic core ownership, not writing core facts directly, and routed through Effect Boundary for external side effects. Its output enters MineMusic state only through explicit import, commit, materialize, bind, memory-adoption, or effect-result boundaries. |
| Session Context | Workspace state for the current session. | Owns current task/posture, active instruments, current listening mode, session-local decision context, constraints, recent choices, and exclusions. It is not long-term Memory, Music Data Platform, owner facts, or provider state. |
| Music Experience | Music interaction state and behavior. | Owns radio mode behavior, queue/now-playing intent, presented recommendations, play/open/skip events, feedback binding, pacing/dedupe, and external action intent for the active music experience. It is not Retrieval, Music Data Platform, Memory, Effect execution, or effect permission policy. |
| Radio Mode | Continuous music experience mode. | Live queue/candidate/pacing state belongs in Session Context; consequential listening session history, presented recommendation events, play/open/skip events, and feedback bindings belong in Music Experience durable state. |
| Music Intelligence | Architecture area containing Retrieval and Knowledge. | Provides evidence and reasoning support to the agent; does not own long-term Memory, final recommendation judgement, durable facts, or presentation. |
| Retrieval | Music Intelligence capability for candidate discovery, query planning, ranking evidence assembly, and query result evidence. | Reads Music Data Platform projections and provider candidates; does not own durable facts or durable writes. |
| Knowledge | Music Intelligence capability for read-oriented, provider-attributed music knowledge search/lookup/evidence. | May supply evidence to the agent or Canonical Maintenance; does not write canonical identity, material identity, owner facts, or presentation output. |
| Memory | Independent architecture area for long-term user/music relationship state. | Not a sub-area of Music Intelligence. It may target material/source/version refs and be informed by events/owner relations, but it does not replace owner_material_relations as factual owner relation source-of-truth. |
| Extension | Architecture area for replaceability and capability declaration. | Contains Plugin System, Capability Slots, provider/plugin manifests, and adapter lifecycle metadata. Runtime composition belongs to Stage Core. |
| Plugin System | Registration, lifecycle, manifest, and replaceability layer for external or swappable capabilities. | Owns plugin discovery/registration and capability manifest routing. It does not own music facts, material identity, owner facts, query orchestration, or final presentation. |
| Stage Core | Runtime composition and lifecycle layer. | Owns Stage Runtime graph assembly, capability wiring, repository/provider/plugin wiring, initialization, and readiness. It uses Plugin System to assemble enabled adapters and shared runtime dependencies; it does not own process/transport hosting, plugin semantics, or music domain facts. |
| Capability Slot | A category of capability contract under the Plugin System. | Examples include Source Provider, Platform Library Provider, Knowledge Provider, Playback Provider, Effect Provider, and Storage Provider. |
| Provider Adapter | A plugin implementation registered into one or more capability slots. | A provider adapter is not assumed to be full-featured; it declares supported operations, areas, auth, limits, and restrictions through its manifest. |
| Source Provider | Capability slot for provider-side source search, source lookup, and source link refresh contracts. | A Source Provider may support only some operations. It produces normalized source facts/candidates but does not own durable `SourceEntity` persistence, source-to-material binding, or `MaterialEntity` identity. |
| Platform Library Provider | Capability slot for provider account/library reads. | Separate from Source Provider because account library import/update is not ordinary source search. It returns external account-library observations; it does not own MineMusic import/update persistence. |
| Knowledge Provider | Capability slot for provider-attributed knowledge lookup/search. | Does not own canonical writes or material identity. |
| Effect Provider | Capability slot for external side-effect execution adapters. | Declares executable external actions, but does not decide permission, approval, or execution policy. |
| Effect Boundary | Architecture area for permission, approval, effect proposal/decision, side-effect audit, and execution policy. | Consumes Effect Provider capabilities only after approval/policy checks. |
| Event Log / Evidence Log | Shared append-only evidence/audit substrate. | Records events with correlation/causality/timeline support, but does not own business truth. Event business meaning belongs to the area that emitted it. Do not create a top-level Events bounded context. |
| Storage Layer | Infrastructure persistence implementation behind area-owned ports. | Does not own business truth. Area semantics own persistence meaning; storage backend replacement can be exposed through Extension Storage Provider capability. |
| Storage Provider | Extension capability slot for replaceable storage backend/adapters. | Does not own Music Data Platform, Memory, Effect Boundary, or Music Experience persistence semantics. |
| Provider output | Evidence/source facts returned by a provider adapter. | Not durable state by itself. Persistence goes through Music Data Platform writer/materializer boundaries. |

## Candidate, Query, And Presentation Vocabulary

| Term | Meaning | Formal Rule |
| --- | --- | --- |
| `ProviderMaterialCandidate` | Provider/search candidate wrapper around source facts. | Shape: `{ sourceEntity: SourceEntity, providerScore?: number }`. |
| `providerScore` | Provider-native score. | Candidate/cache/query scoring input only; not persisted into `SourceEntity`. |
| query hit/result | Query output for agent decision-making. | Belongs to query/output phase, not Phase 1 contract reset. |
| `MaterialCard` | Final recommendation presentation card. | Only Stage Interface presentation output; not query engine result or provider candidate. |
| `displayLinks` | Final/public display links. | Belongs to presentation/query output design, not `MaterialEntity` core. |

## Status Vocabulary

| Term | Values | Formal Rule |
| --- | --- | --- |
| `MaterialLifecycleStatus` | `active | merged | archived` | Material lifecycle only. |
| `MaterialIdentityStatus` | `canonical_confirmed | source_backed | unresolved_identity` | Identity anchor state only. |
| `MaterialAvailability` | `playable | restricted | unavailable | unknown` | Computed availability axis, not core material identity. |
| `CanonicalRecordStatus` | `active | provisional | merged | archived` | Canonical storage/maintenance status. `archived` replaces old rejected canonical status. |
| `owner_material_relations.status` | `active | removed | rejected` | Owner relation adoption/rejection state; not material lifecycle or canonical status. |
| `pending_identity` | Old mixed state. | Remove from material lifecycle and relation status. |

## Collection And Owner Relation Vocabulary

| Term | Meaning | Formal Rule |
| --- | --- | --- |
| `Collection` | User-named organizing container for materials. | Owns grouping, ordering, description, and collection-local notes. |
| `collection_items` | Membership rows for user collections. | Not the source of truth for saved/favorite/blocked relations. |
| `owner_material_relations` | Owner-scoped relation and feedback facts. | Owns saved, favorite, blocked, wrong_version, not_playable, bad_match, liked/disliked, and preference-like facts. |
| `owner_material_entries` | Owner catalog projection entry. | Projection/read model, not independent command source of truth. |
| `owner_material_catalog_view` | Owner catalog read projection. | Commands must write fact tables, then rebuild/maintain projection. |

Owner-scoped facts are part of Music Data Platform. They are not a separate
top-level Owner Context in formal v1. `MaterialEntity` remains owner-neutral:
no `ownerScope`, `collectionIds`, saved/favorite/blocked state, or collection
membership on the entity core.

## MVP-To-Formal Mapping

| MVP Term | Formal Handling |
| --- | --- |
| `MusicMaterial` | Delete as active contract. Replace with `MaterialEntity` for identity and separate output/query contracts for public responses. |
| `SourceMaterial` | Delete. Provider search returns `ProviderMaterialCandidate`. |
| `MaterialResolve*` | Delete from active contracts and public tools. |
| `PublicMaterialResolve*` | Delete from active public contracts. |
| `MaterialState` / generic `MaterialStatus` | Split into lifecycle, identity, availability, and owner relation axes. |
| `materialId` with `mat:` / `emat:` | Replace with `refKey(ref)` and explicit `{ handleKind, handle }` where needed. |
| `ephemeral material` / `emat` | Delete as material identity. Use request-scoped provider candidate relation in later query/provider phases. |
| `canonical.review.*` public tools | Remove from formal v1 public Stage Interface. Canonical maintenance may exist later behind the right boundary. |
| Provider raw payload in candidates/entities | Keep only in provider cache/debug audit storage, never in active domain/source contracts. |
| Saved/favorite/blocked as collections | Replace with owner relations; collections remain user-named containers. |
