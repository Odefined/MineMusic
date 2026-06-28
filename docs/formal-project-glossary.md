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
| Stage Interface | Agent-facing workspace boundary: instruments, tools, Handbook, schemas, outputs, and Tool Call Router. | Music facts, provider internals, domain ownership, or final music judgment. |
| Stage Core | Runtime composition and lifecycle. | Plugin semantics, music domain facts, or agent-facing tool language. |
| Agent Runtime | Embedded MineMusic agent runtime: main/radio agent actor lifecycle, agent run/message/work state, context assembly, interrupt/steering/cancellation, stale-result coordination, sanitized agent event translation, and the MineMusic-owned agent engine interface. | Music facts, Stage Interface tool contracts, playback/radio truth, recommendation judgement, Effect policy, provider semantics, process transports, or runtime graph composition. |
| Workbench Interface | Formal top-level area for the shared Web and embedded-agent workspace interaction interface: Workspace Interaction State, Workspace Protocol, public card/action views, snapshot/replay, and user action routing. | Music facts, agent thread/message/work state, Music Data Platform facts, playback/queue/radio truth, recommendation judgement, Effect decisions, provider semantics, process transports, Web component implementation, or runtime graph composition. |
| Agent Context Engineering | Agent Runtime-owned assembly model for embedded-agent context rails, including one shared Workspace Context assembler that reads area facts for `{ actor, ownerScope }`, selects the actor's declared workspace-visible sections, compresses repeated semantics, and encodes the result. | Owns workspace-visible context section selection and shared compression/encoding rules for agent context. It is not formal top-level area ownership, underlying Workbench Interface state/protocol, Stage Interface tool ownership, Music Data Platform facts, owner facts, provider state, playback/queue/radio truth, recommendation judgement, Effect policy, process transports, runtime graph composition, or a duplicated per-actor renderer. |
| Extension | Plugin System, Capability Slots, provider/plugin manifests, and adapter replaceability. | Music facts, material identity, owner facts, query/present workflow, or final presentation. |
| Music Intelligence | Retrieval and Knowledge capabilities that help the agent understand, discover, compare, and reason about music. | Long-term Memory, final recommendation judgment, material identity, and external effects. |
| Memory | Long-term user/music relationship state, taste memory, preference/rule memory, contextual preferences, and evidence-backed memory proposals. | Material identity, owner relation source-of-truth, Retrieval, Knowledge, or external effects. |
| Music Experience | Music interaction state and behavior: playback, queue, radio mode, now-playing intent, presented recommendations, play/open/skip events, feedback binding, pacing, dedupe, and listening outcomes/history. | Retrieval, Music Data Platform, long-term Memory, Workbench interaction state, agent thread/message/work state, effect execution, or effect permission policy. |
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
| `SourceEntity` | Durable normalized provider/source facts. | `kind = track | album | artist`; contains provider ids when provider-origin, source ref, explicit normalized facts, optional `providerUrl`, and optional version info. It must not store playable links. |
| `SourceRecord` | Storage record for source facts and lookup columns. | Keyed by `refKey(entity.sourceRef)`. May contain SQL/storage indexes; do not expose a separate `recordId`. |
| Scan Root | A configured Local Source Root for discovering user-owned audio files. | Multiple Scan Roots may exist; each has a stable `rootId`, while its machine-specific absolute path is runtime configuration. It is distinct from the reserved Main Local Source Root used for MineMusic-managed downloads. |
| Trusted Complete Scan | A Scan Root batch whose included directory census reached proven exhaustion without root or directory traversal failure. | It may contain per-file issues, but it is the only scan outcome allowed to delete previously scanned Local Sources that were not observed. Partial, failed, cancelled, interrupted, or root-unavailable scans are never trusted complete. |
| Audio Technical Metadata | Optional Source-level facts describing the concrete audio encoding behind a track Source. | Includes codec, bitrate in bits per second, sample rate, bit depth, and channels when known. It is not Source identity, Material identity, duplicate identity, or canonical evidence by itself. |
| `MaterialEntity` | MineMusic-owned material identity anchor. | Domain identity only; may carry canonical/source identity anchors and version info. |
| `MaterialRecord` | Storage record for material identity persistence. | Keyed by `refKey(entity.materialRef)`. Persistence shape only; do not expose a separate `recordId`. |
| `MusicMaterial` | Material Projection read model for a durable material. | Derived at read time from current bound sources and Source Preference Policy. It is not material identity and must not expose `primarySourceRef`, `sourceRefs`, or canonical refs. |
| Bound Source Set | Current Source Entities bound to one Material. | Defines eligible source facts; does not define a permanent winner. `MaterialEntity.sourceRefs` gives stable tie-break order among current bindings. |
| Source Preference Policy | Runtime policy that orders eligible bound sources by purpose. | May have a default order plus purpose-specific overrides such as descriptive metadata, source navigation, or playback. It is not stored as Material truth. |
| Preferred Source | First source selected by Source Preference Policy for a purpose. | Read-time projection choice only; not a durable source ref field. |
| `CanonicalEntity` | Cross-source identity authority. | May carry display/search aliases and version info only when canonical identity is version-specific. |
| `CanonicalRecord` | Storage record for canonical identity maintenance. | Keyed by `refKey(entity.canonicalRef)`. May carry storage indexes and evidence facts; do not expose a separate `recordId`. |

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
| `PlayableLink` | Runtime playable link value returned by a playback/link refresh capability. | Shape: `{ url, label?, requiresAccount? }`; no `sourceRef`, no `expiresAt`; not persisted inside `SourceEntity` or `SourceRecord`. |
| `SourceNavigationLink` | Material Projection link for opening a source in its native context. | Shape: `{ url, label? }`; projected from durable source navigation facts such as `providerUrl`; not a playable link. |
| `PublicDisplayLink` | Public display link. | Shape: `{ url, label? }`; no account constraint field. |
| `providerUrl` | Source/provider navigation hint. | Not a playable link and not a replacement for `Ref.url`. |
| `availabilityHint` | Source/provider-side availability hint. | Not final material availability. |
| `MaterialAvailability` | Computed availability axis. | `playable | restricted | unavailable | unknown`; computed in projection/query/present, not stored as `MaterialEntity` core state. |
| `SourceProvider.getPlayableLinks` | Explicit playback-link resolution / refresh / account re-check capability. | The provider runtime path for playable links; not persisted as `SourceEntity` facts and not the default extra provider call during ordinary present. |

## Stage, Extension, Intelligence, And Memory Vocabulary

| Term | Meaning | Formal Rule |
| --- | --- | --- |
| Stage | Product metaphor for MineMusic as an agent workspace/workbench. | Keep as naming root in `Stage Interface` and `Stage Core`; embedded-agent context is now described through Agent Context Engineering rails such as Workspace Context. Do not make `Stage` a separate top-level architecture area or catch-all bounded context. |
| Server Host | Architecture area for process and transport hosting. | Owns process startup/shutdown, MCP/HTTP/stdio or future host transports, server-level config loading, host adapter lifecycle, and holding a composed Stage Runtime. It does not own Stage Runtime composition. |
| Host Adapter | Server Host adapter that exposes the composed MineMusic runtime through a transport such as MCP, HTTP, stdio, CLI, or future Web UI. | Does not own Stage Interface tool truth, Stage Core composition, or domain facts. |
| Host Client / Integration Package | External or adjacent client package that consumes MineMusic through a host transport. | Codex skill belongs here: it consumes Stage Interface over a host transport and is not Server Host core. |
| Stage Interface | Agent/host callable boundary. | Owns Instrument Catalog, Tool Registry, tool schemas, validation, compact public outputs, Tool Call Router, session-aware tool availability, and Handbook. |
| Instrument | Agent-facing workbench section inside Stage Interface. | Groups tools and visible provider/capability descriptors for the agent. It is not a bounded context, domain service, or capability slot, and it does not need to map one-to-one to internal architecture areas. |
| Tool | Callable operation exposed through Stage Interface. | Delegates to the owning capability/context through narrow ports. A tool definition is not the business owner. |
| Tool Definition | Public Stage Interface descriptor for a callable tool. | Not the runtime handler, business service, or bounded context owner. |
| Tool Call Router | Stage Interface path that receives a tool call, finds the matching Tool Definition and runtime handler, invokes the handler, and wraps the public result. | Current code name may be `dispatch`; the domain term is Tool Call Router, not business service, runtime handler, or Effect Boundary policy engine. |
| Tool Side-Effect Declaration | Static public declaration of the kinds of state or external surfaces a Stage Interface tool can touch. | Capability truth, not approval policy, runtime policy, provider availability, or a per-call audit record. |
| Tool Invocation Policy | Public declaration of how a model-visible Stage Interface tool may be invoked by default and what data-egress posture it carries. | Carried by Stage Interface but interpreted by Effect Boundary; not the side-effect declaration, runtime policy, or provider availability. |
| Extension-native Instrument / Tool | Provider/plugin-owned agent-facing tool surface for external-native functionality that has no MineMusic internal integration yet or is intentionally provider-native. | Allowed only when clearly marked provider/plugin-owned, not used to bypass MineMusic core ownership, not writing core facts directly, and routed through Effect Boundary for external side effects. Its output enters MineMusic state only through explicit import, commit, materialize, bind, memory-adoption, or effect-result boundaries. |
| Agent Runtime | Formal top-level area for running MineMusic's embedded music agents. | Owns main/radio agent actor lifecycle, agent run/message/work state, agent context assembly, interrupt/steer/cancel semantics, stale-result coordination, sanitized agent work/events, and the MineMusic-owned agent engine interface. It is not Pi, Stage Core, Music Experience, Stage Interface, or Server Host. |
| Workbench Interface | Formal top-level area for the shared Web and embedded-agent workspace interaction interface. | Owns Workspace Interaction State, Workspace Protocol, public card/action views, snapshot/replay, and user action routing into area-owned commands. It is not a browser-only UI store, global workspace database, music fact owner, playback/queue/radio owner, agent thread/message/work owner, durable music outcome owner, Effect decision owner, or Web component implementation. |
| Workspace Interaction State | State facet of Workbench Interface. | Covers selected object, reconnectable card interaction state, workspace focus, attention posture, and interaction revision inputs used to reject stale user or agent actions. It is not a separate owner from Workbench Interface. |
| Workspace Protocol | Protocol facet of Workbench Interface. | Covers public workspace snapshots, command envelopes, event envelopes, sequence/replay, and card/action views. It is not a separate owner from Workbench Interface and does not make snapshot fields ownerless. |
| Agent Context Engineering | Agent Runtime-owned assembly model for embedded-agent model context. | Splits context into Actor Identity, Actor Instruction, Capability Context, Workspace Context, Invocation Context, Continuity Context, and Knowledge / Memory Context. It is not a single prompt blob, a top-level area, Workbench Interface state ownership, Stage Interface tool ownership, or pi transcript storage. |
| ActorDefinition | Shared Agent Runtime definition object for one embedded actor, containing `name`, structured `identity`, structured `instruction`, `declaredWorkspaceSections`, and `toolPack.stageToolNames`. | `name` identifies the actor for runtime selection and diagnostics but is not rendered into LLM context by default; `identity` sources the Actor Identity rail; `instruction` sources the Actor Instruction rail; `declaredWorkspaceSections` lists only Workspace Context section names; `toolPack.stageToolNames` stores internal Stage tool names and selects the actor's allowed Stage Interface callable surface that Agent Runtime materializes into pi tools and constrains at dispatch. Not current workspace state, invocation payload, transcript continuity, Memory, section shape/config, materialized pi tools, or a server-module inline prompt string. |
| Actor Identity | Structured actor-facing role, job, and persona, sourced from `ActorDefinition.identity`. | First shape: `role`, `job`, and `persona`. It is not `ActorDefinition.name`, a raw prompt paragraph, operational guidance, `"You are X"`, or a place for internal data-pipeline terms. |
| Actor Instruction | Structured operational actor-facing guidance for how the actor works, sourced from `ActorDefinition.instruction`. | First shape: string fields `responsibilities`, `operatingRules`, and `prohibitions`. It may reference concrete model-visible tool names in backticks for actor-specific operating guidance or scenario limits, but referenced tools must come from the actor's selected tool pack. It is not actor identity, persona, current workspace state, tool availability, invocation payload, transcript continuity, Memory, a raw prompt paragraph, or a tool schema/permission/side-effect definition. |
| Capability Context | Pi-carried callable capability context for an actor, represented by provider tools selected from Stage Interface declarations. | Agent Runtime selects and materializes tools from `ActorDefinition.toolPack.stageToolNames` and constrains bridge dispatch, but does not own Stage Interface tool contracts or assemble a separate capability prompt blob. Not Workspace Context, tool result history, transcript continuity, or user taste. |
| Continuity Context | Pi-carried conversation and execution continuity in messages. | MineMusic may persist, restore, cap, or compact the transcript, but does not assemble a separate continuity prompt blob and must not treat messages as current workspace truth. |
| Workspace Context | Agent-readable current workspace fact projection assembled by Agent Runtime from area-owned current facts and encoded by workspace-visible sections. | The current-state rail of Agent Context Engineering. Main and Radio may receive different selected sections, but section names, shapes, compression, and encoding are produced by the same assembly model. Compression removes repeated semantics and attention noise; it is not truncation. It is not invocation payload, transcript continuity, tool availability, durable taste memory, Web AG-UI serialization, internal architecture area shape, an area read-model blob such as `musicExperience`, or a second owner of playback/queue/radio truth. |
| Invocation Context | Per-run or per-turn envelope for an embedded agent invocation. | Includes the current user turn or Radio run payload such as `runId`, wake reason, suggested append count, and basis revisions. It is not current workspace truth, tool availability, transcript history, or Memory. |
| Knowledge / Memory Context | Retrieved knowledge, taste hints, durable taste memory, and reference material used for reasoning. | Phase B starts with `userTasteHint` as an input inside this rail, reusing the `library.catalog.summary` public output shape without making a Stage tool self-call or naming a separate provider concept. That hint is not durable Memory. Future inputs may include Memory, Knowledge, Handbook, docs, and search/reference material when loaded. It may influence future choices but does not rewrite current Workspace Context facts. |
| Session Context | Legacy umbrella term for the Agent Runtime-owned agent-facing context view assembled for embedded MineMusic agents. | New design and code should use the Agent Context Engineering rails instead of treating Session Context as a mixed bucket for workspace facts, invocation payload, transcript continuity, tools, and memory. It remains not a formal top-level area, underlying Workbench Interface state/protocol, long-term Memory, Music Data Platform, owner facts, provider state, playback/queue/radio truth, durable Music Experience history, presentation-only UI state, or process transport. |
| Music Lookup Text | Query text intended to match music identifiers such as title, artist, album, or known alias. | Not a mood prompt, recommendation request, full user intent, Memory summary, or semantic taste description. |
| Music Item Handle | Public agent-facing bracket-string handle for a music item reused across lookup, future list/detail, Workspace Context, and future commit-style tools: `[material:mh_<opaque>]` for durable MineMusic material items or `[candidate:<opaque-id>]` for unresolved provider candidates. Agents pass the whole string back unchanged; every public music-item output pairs it with tool-specific Public Handle Description when a description is needed, and candidate handles are cache-lifetime-bound, not cursor-bound. | A material handle is minted from an owning material anchor through the stateful public handle registry behind `HandleMintingPort`. It is not an id, identity claim, `{ kind, id }` object the agent reconstructs, tool-specific lookup output, separate per-tool item handle, provider-origin-as-candidate, result-window identity, materialRef, materialCandidateRef, sourceRef, canonicalRef, provider entity id, provider item id, provider raw id, or database key. |
| Public Handle Description | Public tool-specific description payload emitted beside every public handle output, always with required public `label`, such as lookup item label/title/artists/album/version text; may change across tools/time and may fall back to a kind-aware, non-identifying generic label when public display facts are empty. | Not handle identity, not a public `descriptor` field, not agent input, not provenance, not rank evidence, not internal `Ref.label`, not provider raw label, not handle id fallback, and not internal refs. |
| Music Abstract Scope Handle | Public bracket-string scope handle for aggregate or built-in scopes: `[all]` or the owner-visible `[library]` baseline. | Not a durable library subscope, provider search scope, source library ref, owner relation pool ref, Collection row id, public `providerId`, provider entity id, provider account id, or raw provider key. |
| Music Library Scope Handle | Public bracket-string handle for a durable owner-scoped library subscope, such as `[source_library:<opaque-id>]`, `[relation:<opaque-id>]`, or `[collection:<opaque-id>]`; its id is opaque and privately mapped by MineMusic. | Not provider scope, not the `[library]` baseline, not Retrieval pool refs, source library refs, owner relation pool refs, Collection row ids, parseable internal ref keys, or raw owner/provider keys. |
| Music Provider Scope Handle | Public bracket-string handle for a connected searchable provider as a scoped music operation target, such as `[provider:netease]`, carrying the public provider id reused across agent-facing provider-aware tools. | Not Music Abstract Scope Handle, not Music Library Scope Handle, not generic scope id, not provider entity id, provider account id, raw provider key, sourceRef, or provider library item. |
| Music Scope | Public bracket-string input reused by scoped music tools to choose `[all]`, the MineMusic `[library]` baseline, a concrete Music Library Scope Handle, or a Music Provider Scope Handle; `music.discovery.list_scopes` lists explicit selectable scopes except `[all]`, optionally filtered by listed scope kind, with Public Handle Descriptions and provider target kinds as selection metadata. | Not a `{ kind, id }` object the agent reconstructs, not Retrieval `pools`, pool algebra, raw refs, provider entity ids, description-as-identity, provider raw operation names, tool-specific scope handles, or a prompt for the user to choose execution details. |
| ListedMusicScope | Listed output shape for a Music Scope, pairing `scope: "[...]"` with required Public Handle Description and, for provider scopes, required non-empty provider target kinds; scoped tools may receive the bracket `scope` value directly, and description staleness does not change scope identity. | Not a separate scope identity, not a tool-specific scope handle, not description-as-identity, not a `{ kind, id }` pass-back object, and not Retrieval pool metadata. |
| Library Catalog | Public Agent Protocol tool family for browsing, sampling, and summarizing owner-visible MineMusic library items through reusable library-surface Music Scopes: `[library]`, `[source_library:...]`, `[relation:...]`, and `[collection:...]`. | Lives under `library.catalog.*`; list_scopes returns only catalog-usable scopes (`[library]`, `[source_library:...]`, `[relation:...]`, `[collection:...]`) with Public Handle Descriptions and never returns provider scopes or the aggregate `[all]` scope. Scope ids are opaque pass-back identifiers; relation/source-library meaning comes from Public Handle Descriptions, not from parsing ids. Browse returns compact public item handles with Public Handle Descriptions plus `nextCursor` when more items are available, supports dictionary order and time order, defaults to newest-first time order when no sort is requested, and caps its `limit` input at 100. Sample returns a caller-requested count of compact public item handles with Public Handle Descriptions, chosen from the selected owner-visible library item population by explicit caller-provided seed; the same library state, scope input, count, and seed return the same sample, while changing the seed asks for a different sample. Tools do not invent time-based seeds. Summary helps the agent quickly understand the music taste or tendency represented by the selected library surface by returning both independent catalog evidence samples and frequency/concentration signals from available catalog/projection facts. For the `[library]` baseline, the selected population is the deduplicated owner-visible baseline: active positive catalog membership included, active blocked membership excluded, provider candidates excluded. Summary evidence samples use a caller-requested sample count capped at 100, sort the population by owner catalog `recentlyAddedAt` from earliest to latest, split that timeline into four time bands (`earliest 25%`, `25-50%`, `50-75%`, `latest 25%`), distribute the requested sample count as evenly as possible across the four bands, and try to avoid repeated artist text within each band when enough distinct artists exist. For the `[library]` baseline only, summary also returns membership signals grouped by the same selectable catalog scopes returned by `library.catalog.list_scopes` excluding `[library]` itself; each membership signal carries the listed scope with its Public Handle Description, a distinct-material count, and at most five public item examples, so the agent can distinguish imported source-library membership from MineMusic relation membership without parsing scope ids. Concentration signals must be computed within material kind boundaries, counts belong to a specific signal to show how often it appears, each signal type returns at most ten signals ordered by descending count, and each signal may carry at most five public item examples. First-version signals are recording artist concentration, recording album concentration, album artist concentration, and artist-item concentration. It does not echo the input scope or return scope descriptions outside list_scopes and library-baseline membership signals. Not Music Discovery, source-library import, owner-relation editing, raw owner catalog projection rows, duplicate item display DTOs, provider search, the aggregate `all` scope, unsupported representative-item claims, final recommendation judgement, or confirmed long-term Memory preference rules. |
| Music Experience | Music interaction state and behavior. | Owns playback, queue, radio mode behavior, now-playing intent, presented recommendations, play/open/skip events, feedback binding, pacing/dedupe, external action intent, and listening outcomes/history for the active music experience. It is not Workbench interaction state, Agent Runtime state, Retrieval, Music Data Platform, Memory, Effect execution, or effect permission policy. |
| Music Experience History | Music Experience-owned structured objective history of material-anchored events that actually happened in the music experience. | May include playback/listening outcomes, recommendation-batch exposures and responses, and user or agent queue/radio operations when they land as a concrete item, batch, or session result. It is not Memory, not inferred taste, not UI cleanup, not an agent tool log, and not a debug trace. Unlanded or interrupted agent actions do not belong here. Memory may consume it later to propose taste entries, but the record itself remains music-experience history rather than long-term taste state. |
| Radio Mode | Continuous music experience mode. | Live queue/candidate/pacing state, radio motif/direction/mode, and consequential listening history all belong in Music Experience. Workbench Interface presents and routes Radio interactions but does not own Radio truth. |
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
| `MaterialIdentityStatus` | `canonical_confirmed | source_backed | unresolved_identity` | Identity anchor state only. In the Phase 5 write model it is derived from canonical/source anchors, not caller supplied by ordinary material upsert. |
| `MaterialAvailability` | `playable | restricted | unavailable | unknown` | Computed availability axis, not core material identity. |
| `CanonicalRecordStatus` | `active | provisional | merged | archived` | Canonical storage/maintenance status. `archived` replaces old rejected canonical status. |
| `owner_material_relations.status` | `active | removed | archived` | Owner relation lifecycle/adoption state; not material lifecycle or canonical status. |
| `pending_identity` | Old mixed state. | Remove from material lifecycle and relation status. |

## Collection And Owner Relation Vocabulary

| Term | Meaning | Formal Rule |
| --- | --- | --- |
| `Collection` | User-named organizing container for materials. | Owns grouping, ordering, description, and collection-local notes. |
| `collection_items` | Membership rows for user collections. | Not the source of truth for saved/favorite/blocked relations. |
| `owner_material_relations` | Material-scope owner relation facts. | Phase 9 owns `saved`, `favorite`, and `blocked` only. Signals/reactions and problem/correction facts are separate future designs. |
| `library.relation.*` | Public Agent Protocol tool family for reading and editing explicit owner relations: get/save/unsave/favorite/unfavorite/block/unblock. | Returns the item's current saved/favorite/blocked state. `get` is read-only; edit tools return state after the edit. `blocked` is mutually exclusive with saved/favorite: block clears positive relations; save/favorite clears blocked. `saved` and `favorite` are independent positive relations. Removing an already-absent relation succeeds and reports the unchanged state. Not Collection membership, not a generic set/remove API, not candidate admission, and not a provider-side save/like action. |
| `owner_material_entries` | Owner catalog projection entry. | Projection/read model, not independent command source of truth. |
| `owner_material_catalog_view` | Owner catalog read projection. | Commands must write fact tables, then rebuild/maintain projection. |

Owner-scoped facts are part of Music Data Platform. They are not a separate
top-level Owner Context in formal v1. `MaterialEntity` remains owner-neutral:
no `ownerScope`, `collectionIds`, saved/favorite/blocked state, or collection
membership on the entity core.

## MVP-To-Formal Mapping

| MVP Term | Formal Handling |
| --- | --- |
| Old MVP generic `MusicMaterial` | Delete as active identity/public-output contract. Use `MaterialEntity` for identity, current internal `MusicMaterial` for Material Projection read models, and separate public response contracts such as `MusicCard`. |
| `SourceMaterial` | Delete. Provider search returns `ProviderMaterialCandidate`. |
| `MaterialResolve*` | Delete from active contracts and public tools. |
| `PublicMaterialResolve*` | Delete from active public contracts. |
| `MaterialState` / generic `MaterialStatus` | Split into lifecycle, identity, availability, and owner relation axes. |
| `materialId` with `mat:` / `emat:` | Replace with `refKey(ref)` and explicit `{ handleKind, handle }` where needed. |
| `ephemeral material` / `emat` | Delete as material identity. Use request-scoped provider candidate relation in later query/provider phases. |
| `canonical.review.*` public tools | Remove from formal v1 public Stage Interface. Canonical maintenance may exist later behind the right boundary. |
| Provider raw payload in candidates/entities | Keep only in provider cache/debug audit storage, never in active domain/source contracts. |
| Saved/favorite/blocked as collections | Replace with owner relations; collections remain user-named containers. |
