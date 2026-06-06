# Phase 0: Formal Source-Of-Truth Reset

> Status: Accepted spec and plan
> Phase owner: Documentation governance
> Output type: Docs, ADRs, glossary, root status reset, and archive notices only

Phase 0 freezes the same-repo formal rebuild direction before code or contract
changes begin. It separates old MVP evidence from formal v1 authority so later
phases do not keep patching around stale terms like resolve, ephemeral
material, or provisional canonical review.

## Spec

### Goal

Reset the project source-of-truth documents for a same-repo formal rebuild.

Phase 0 must establish that the old MVP code and documents are evidence, donor
material, and migration input. They are not the formal architecture base, and
they do not require compatibility layers unless a later phase explicitly
accepts such an exception.

Phase 0 is not complete if it only moves files around. It must state the
accepted formal architecture decisions that root authority documents will be
rebuilt from.

### Architecture Reference Inputs

Rebuild formal architecture from these inputs, in this order:

1. Accepted formal rebuild decisions listed in this Phase 0 spec.
2. Accepted vocabulary in `docs/formal-project-glossary.md`.
3. Accepted ADRs created during Phase 0.
4. `docs/maintenance/documentation-architecture.md` for documentation roles,
   archive rules, and current-authority structure.
5. `AGENTS.md` for repository operating rules and architecture discipline.
6. `MineMusic_Formal_Project_Architecture_Audit_v3.md` as planning evidence
   and decision trace only.
7. Old MVP docs and old MVP code only as evidence for what existed, what must
   be deleted, and what donor ideas may be re-expressed in the formal model.

Do not rebuild `ARCHITECTURE.md` by polishing old `ARCHITECTURE.md` wording.
Do not rebuild formal docs by editing old MVP area docs into almost-formal
documents. Do not treat current code structure as the target architecture just
because it compiles.

### Accepted Formal Architecture Decisions

Phase 0 root authority docs and ADRs must encode the decisions below. If a
Phase 0 output omits these decisions, it is not an acceptable Phase 0 result.

#### Rebuild Posture

- The project stays in the same repository.
- This is a formal rebuild, not a new blank project and not an MVP patching
  pass.
- Old MVP docs and old MVP code are reference evidence, deletion inventory, and
  migration input only.
- Do not add compatibility layers, adapters, aliases, or temporary bridges to
  keep old MVP flows alive.
- Old code is preserved through git history, and optionally a pre-formal
  snapshot tag or branch. Do not copy old code into `src/archive`, `legacy`,
  `old`, or docs archive folders.
- The active tree after formal phases should contain formal v1 code only. If
  old code has useful donor logic, re-express the idea in the formal module
  boundary instead of keeping the old module alive.

#### Source-Of-Truth Roles

- `ARCHITECTURE.md` is rebuilt as the formal global architecture authority.
- `CURRENT_STATE.md` is rebuilt as formal rebuild current state, explicitly
  distinguishing formal target decisions from code that has not migrated yet.
- `PROGRESS.md` is rebuilt as the formal rebuild milestone index, not a
  fine-grained execution ledger.
- `INDEX.md` is updated in place as the current authority map.
- `docs/formal-project-glossary.md` owns formal target vocabulary and
  MVP-to-formal term mapping.
- `CONTEXT.md`, if updated later by explicit user request, is stable glossary
  only. It must not carry migration status, temporary plan detail, or old
  implementation explanations.
- Old root `ARCHITECTURE.md`, `CURRENT_STATE.md`, and `PROGRESS.md` are
  archived as pre-formal snapshots, not updated into formal authority.
- Area docs that still describe MVP resolve, ephemeral material, public
  canonical review, or old query paths get archive/superseded notices in Phase
  0. They are rewritten later only in the phase that owns the corresponding
  code boundary.
- Each top-level architecture area should eventually have current authority
  docs when it has independent ownership, ports, and progress risk. Phase 0
  must not batch-create empty area directories or empty `design.md` / `ports.md`
  / `progress.md` files. Create or rewrite area docs only when the owning phase
  needs them.

#### Architecture Areas And Boundary Model

- Formal top-level architecture areas are Server Host, Stage Interface, Stage
  Core, Extension, Music Data Platform, Music Intelligence, Music Experience,
  Memory, and Effect Boundary.
- Do not introduce `Stage` as a separate top-level architecture area. `Stage`
  remains the product metaphor and naming root for MineMusic as an agent
  workspace/workbench, but it must not become a catch-all bounded context.
- Server Host owns process startup/shutdown, MCP/HTTP/stdio or future host
  transports, server-level config loading, host adapter lifecycle, and keeping
  one composed Stage Runtime alive. It does not own Stage Runtime graph
  composition, tool semantics, domain facts, provider semantics, or final music
  judgment.
- MCP server, HTTP, stdio, CLI, and future Web UI transports are Server Host
  adapters. Codex skill is a host client / integration package that consumes
  Stage Interface through a host transport; it is not Server Host core.
- Session Context is workspace state for the current session: current
  task/posture, active instruments, current listening mode, session-local
  decision context, constraints, recent choices, and exclusions. It is not
  long-term Memory, Music Data Platform, owner facts, or provider state.
- Music Experience is the architecture area for music interaction state and
  behavior: radio mode behavior, queue/now-playing intent, presented
  recommendations, play/open/skip events, feedback binding, and pacing/dedupe
  for the active music experience. It may create external action intent, but it
  is not Retrieval, Music Data Platform, long-term Memory, Effect execution, or
  effect permission policy.
- Radio Mode uses two state levels: live queue/candidate/pacing state belongs
  in Session Context, while consequential listening session history, presented
  recommendation events, play/open/skip events, and feedback bindings belong in
  Music Experience durable state.
- Stage Interface owns Instrument Catalog, Tool Registry, agent-facing tool
  schemas, validation, compact public output, dispatch glue, session-aware tool
  availability, and Handbook.
- Instrument is an agent-facing workbench section inside Stage Interface. It
  groups tools and visible provider/capability descriptors; it is not a bounded
  context, domain service, or capability slot. Instrument grouping is formal
  Stage workspace organization, not a mirror of old code structure and not a
  one-to-one map to internal architecture areas.
- Tool is a callable operation exposed through Stage Interface. A tool
  definition delegates to the owning capability/context through narrow ports
  and does not own business responsibility.
- Provider/plugin-owned extension-native instruments/tools are allowed for
  external-native functionality that has no MineMusic internal integration yet
  or is intentionally provider-native. They must be clearly marked
  provider/plugin-owned, must not bypass MineMusic core ownership, must not
  write core facts directly, must not pretend their output is `MaterialEntity`,
  Memory, owner facts, or final `MaterialCard`, and any external side effect
  must still go through Effect Boundary.
- Extension-native outputs may enter later MineMusic flows only through
  explicit import, commit, materialize, bind, memory-adoption, or effect-result
  boundaries. They must not automatically masquerade as internal entities,
  relations, memories, events, or cards.
- Music Intelligence groups Retrieval and Knowledge capabilities. It helps the
  agent understand, discover, compare, and reason about music, but it does not
  own long-term Memory, final recommendation judgment, material identity, or
  external effects.
- Retrieval is a Music Intelligence capability. It owns candidate discovery,
  query planning, ranking evidence assembly, and query result evidence. It reads
  Music Data Platform projections and provider candidates, but it does not own
  durable facts or durable writes.
- Knowledge is a Music Intelligence capability for read-oriented,
  provider-attributed music knowledge search/lookup/evidence. It may supply
  evidence to the agent or Canonical Maintenance, but it does not write
  canonical identity, material identity, owner facts, or presentation output.
- Memory is an independent architecture area for long-term user/music
  relationship state, taste memory, preference/rule memory, and evidence-backed
  memory proposals. It is not a sub-area of Music Intelligence and does not
  replace `owner_material_relations` as factual owner relation source-of-truth.
- Memory may target material/source/version refs and may be informed by events
  and owner relations. Explicit facts such as saved, favorite, blocked,
  wrong_version, not_playable, and bad_match remain owner relation facts first;
  Memory may summarize or generalize them only as relationship/taste memory.
- Domain modules must not depend on Stage Interface DTOs, presentation helpers,
  tool definitions, or agent-output modules.
- Stage Core is the composition boundary. Ordinary domain services should
  receive narrow capability ports, not broad aggregate stores.
- Stage Core uses Plugin System to assemble runtime: enabled adapters, shared
  provider dependencies, config, auth, cache, rate limits, storage handles, and
  capability ports. Stage Core does not own plugin semantics.
- Stage Core owns Stage Runtime graph assembly, capability wiring,
  repository/provider/plugin wiring, initialization, and readiness. Server Host
  owns process/transport hosting around the composed runtime.
- Extension owns replaceability and capability declaration: Plugin System,
  Capability Slots, provider/plugin manifests, and adapter lifecycle metadata.
  Runtime composition belongs to Stage Core, not Extension.
- Writer capabilities must be explicit. Side-effecting operations such as
  create, upsert, materialize, merge, attach, promote, record, and delete must
  not hide behind vague read/query/support ports.
- Providers own provider integration and normalized source facts. Providers do
  not own MineMusic material identity or final public presentation output.
- Provider adapter output is evidence/source facts, not durable state by
  itself.
- Durable `SourceEntity` / `SourceRecord` persistence, source-to-material
  binding, and source/material/canonical transaction boundaries belong to
  Music Data Platform writer/materializer capabilities.
- Canonical Maintenance is a Music Data Platform capability for canonical
  evidence, review/apply, merge/split, and identity graph maintenance. It is
  not a separate top-level bounded context.
- Source Providers must not write `source_records` directly and must not create
  `MaterialEntity` identity.
- Plugin System owns plugin registration, lifecycle, capability manifests, and
  replaceability.
- Plugin System is not a hidden implementation detail inside Stage Core. It
  defines plug-in semantics and capability declaration; Stage Core composes it
  into the running MineMusic runtime.
- Capability Slots are typed capability contracts under Plugin System, such as
  Source Provider, Platform Library Provider, Knowledge Provider, Playback
  Provider, Effect Provider, and Storage Provider.
- Source Provider is a capability slot, not a top-level bounded context and not
  a generic all-provider platform. A Source Provider may support source search,
  lookup, link refresh, or only a subset of those operations through its
  manifest.
- Provider adapters must declare supported operations, areas, auth, limits, and
  restrictions. A provider adapter is not assumed to implement every provider
  capability.
- Platform Library Provider remains a separate capability slot because account
  library import/update is not ordinary source search.
- Library Import / Update is a Music Data Platform persistence flow. Platform
  Library Providers read external account-library observations; Music Data
  Platform owns durable source records, source library items, material bindings,
  import batches, update baselines, and projections created from those
  observations.
- Effect Provider is an Extension capability slot for external side-effect
  execution adapters. It declares executable external actions, but it does not
  decide permission, approval, or execution policy.
- Effect Boundary owns permission, approval, effect proposal/decision,
  side-effect audit, and execution policy. It consumes Effect Provider
  capabilities only after approval/policy checks.
- Event Log / Evidence Log is a shared append-only evidence/audit substrate for
  correlation, causality, timeline query, audit evidence, and projection
  triggers. It is not a top-level Events bounded context and does not own
  business truth; event business meaning belongs to the area that emitted it.
- Storage Layer is infrastructure behind area-owned ports, not a top-level
  bounded context. Area semantics own persistence meaning; Storage Provider is
  an Extension capability slot for replaceable storage backends/adapters.
- Music Experience must route external playback, queue, playlist edit, save, or
  other external side-effect intents through Effect Boundary. Effect Providers
  execute only after Effect Boundary permits the action.
- Storage records and domain entities are different objects. SQL keys and
  denormalized lookup columns belong to records, not public/domain entity
  contracts.

#### Deleted Formal v1 Surfaces

- Delete Material Resolve as a formal v1 public/domain surface.
- Delete Ephemeral Material and `emat` material identity.
- Delete public `canonical.review.*` tools from formal v1.
- Delete public `mat:` / `emat:` material id codecs.
- Delete active `MusicMaterial` and `SourceMaterial` vocabulary in favor of
  formal entity/candidate contracts.
- Do not preserve these names through compatibility aliases.

#### Formal Object Vocabulary

- Use `Ref = { namespace, kind, id, label? }`; delete `Ref.url`.
- Use one canonical `refKey(ref)` helper and ban `:` in `namespace`, `kind`,
  and `id`.
- Use field names such as `sourceRef`, `materialRef`, and `canonicalRef`; do
  not introduce separate structural ref shapes.
- Split domain entities from storage records:
  - `SourceEntity` / `SourceRecord`
  - `MaterialEntity` / `MaterialRecord`
  - `CanonicalEntity` / `CanonicalRecord`
- `SourceEntity.kind = track | album | artist`.
- `MaterialEntity.kind` and `CanonicalEntity.kind` use
  `recording | album | artist | work | release`.
- Ordinary provider track materialization maps to `recording`.
- Ordinary provider album materialization maps to `album`.
- `release` is reserved for concrete edition/pressing/version workflows.
- `release_group` is preserved as future identity vocabulary, but not enabled
  as ordinary formal v1 query target or public output kind.
- `VersionInfo` is first-class identity/source information, not
  presentation-only title text.
- Recording-to-work relation belongs to identity graph/canonical maintenance,
  not `VersionInfo` and not Phase 1 material core fields.
- `PlayableLink` is source-owned and shaped as `{ url, label?,
  requiresAccount? }`; it does not contain `sourceRef` or `expiresAt`.
- `MaterialEntity` does not own playable links, public display links,
  availability, query score, basis/provenance, provider raw payload, owner
  scope, collection membership, aliases, notes, or presentation seed fields.

#### Query, Candidate, And Presentation Direction

- Provider search produces provider candidates backed by normalized
  `SourceEntity` facts. It does not produce material identity.
- Formal provider candidate contract target is
  `{ sourceEntity: SourceEntity, providerScore?: number }`.
- Provider search uses request/session-scoped candidate relation or cache. It
  does not durable-materialize by default.
- Durable materialization happens only at explicit commit boundaries such as
  save, present commit, feedback, add-to-collection, or other accepted write
  commands.
- Query output is query result/hit information for the agent's next decision.
- `MaterialCard` is final Stage Interface presentation output. It is not a
  provider candidate, not a query-engine internal result, and not
  `MaterialEntity`.
- Phase 0/1 do not decide the exact public query hit shape, exact
  query-to-present flow, or final `MaterialCard` key set.

#### Owner Facts, Collection, And Relation Direction

- Owner-scoped facts belong inside Music Data Platform as fact families and
  projections, not in a separate top-level Owner Context.
- `MaterialEntity` core remains owner-neutral: no `ownerScope`, collection ids,
  saved/favorite/blocked state, owner policy, or collection membership.
- `Collection` remains a user-named organizing container for material refs,
  ordering, grouping, and collection-local notes.
- Saved, favorite, blocked, wrong-version, not-playable, bad-match, liked,
  disliked, and preference-like facts belong to owner-scoped relations, not
  system collections.
- Rename `material_relations` to `owner_material_relations` in formal target
  vocabulary.
- Owner catalog entries/views are projections/read models. Commands write fact
  tables and maintain projections; they do not treat projections as independent
  source-of-truth.

#### Database And Query Infrastructure Direction

- Formal storage work should move toward a unified SQLite database gateway and
  explicit transaction boundary.
- Ordinary query paths should not receive writer capability unless the query
  responsibility explicitly includes a named materialization/write boundary.
- Provider candidates may participate in request/session-scoped ranking without
  becoming durable material records.
- Query pool composition uses explicit any/all/none semantics.

### Decisions Not Yet Accepted For Phase 0

Phase 0 must not invent these details:

- request/session candidate cache TTL and handle expiry policy;
- exact `ProviderCandidate -> SourceRecord/MaterialRecord` command schema;
- exact `command_audit` schema;
- exact Stage Core module graph registration shape;
- exact public `MaterialCard` key set;
- exact public query hit output shape;
- exact effect boundary and provider-call permission model;
- recording-to-work relation schema;
- owner relation schema for wrong-version details.

### Non-Goals

- No business code changes.
- No TypeScript contract changes.
- No provider implementation changes.
- No Stage Interface tool schema or runtime wiring changes.
- No query engine, presentation, collection, relation, feedback, source
  library, canonical maintenance, or database implementation changes.
- No full rewrite of area documents such as `docs/material/**`,
  `docs/material-search/**`, or `docs/stage-interface/**`.
- No `CONTEXT.md` edit during Phase 0.

### Owning Context

Documentation governance owns Phase 0.

The phase may read current architecture and area documents, but it only writes
documentation, ADRs, archive notices, and docs-guard metadata if the guard needs
to recognize the new document layout.

### Allowed Reads

- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`
- `README.md`
- `docs/maintenance/documentation-architecture.md`
- Existing area current-authority documents only as needed to identify
  obviously superseded MVP language.
- The formal architecture audit as planning evidence.

### Allowed Writes

- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`
- `docs/formal-project-glossary.md`
- `docs/adr/**`
- `docs/archive/root/**`
- Selected area documents only for explicit archived or superseded notices.
- Docs-guard metadata only if required for the new formal/archive structure.

### Forbidden Writes

- `src/**`
- `test/**`
- Provider code
- Stage Interface tool definitions
- Runtime composition
- Database schemas
- Generated runtime artifacts
- `CONTEXT.md` in Phase 0

### Required Decisions To Record

Phase 0 must record all accepted decisions in the "Accepted Formal Architecture
Decisions" section above into the correct authority documents:

- global architecture and boundary decisions go to `ARCHITECTURE.md`;
- durable trade-offs go to ADRs;
- vocabulary and MVP-to-formal mappings go to
  `docs/formal-project-glossary.md`;
- current migrated/not-yet-migrated status goes to `CURRENT_STATE.md`;
- milestone sequencing goes to `PROGRESS.md`;
- navigation goes to `INDEX.md`;
- historical evidence goes to archive notices.

### ADRs Required

- Same-repo formal rebuild instead of new blank repo or MVP patching.
- No MVP compatibility layers.
- Delete Material Resolve and Ephemeral Material from formal v1.
- Provider search uses request-scoped candidate relation, not default durable
  materialization.
- Durable materialization occurs only at explicit commit boundaries.
- Domain Entity naming and storage Record naming.
- Public handle policy uses `refKey(ref)` and bans `:` in ref components.
- Collection and owner relation source-of-truth split.
- Formal top-level architecture areas: Server Host, Stage Interface, Stage
  Core, Extension, Music Data Platform, Music Intelligence, Music Experience,
  Memory, and Effect Boundary.

Phase 0 may create only the ADRs whose decisions are already accepted. ADRs
whose details still belong to later phases must be listed as pending instead of
being filled with invented implementation policy.

## Plan

### Step 0 - Preflight

- Run `git status --short`.
- Run `git diff --name-only`.
- Confirm unrelated user changes are preserved.
- Confirm the phase is docs-only before editing.

### Step 1 - Archive Pre-Formal Root Snapshots

- Archive existing root `ARCHITECTURE.md`, `CURRENT_STATE.md`, and
  `PROGRESS.md` under a formal rebuild root archive folder, for example:
  `docs/archive/root/formal-rebuild-2026-06-06/`.
- Add required archive notices.
- Update `docs/archive/root/README.md` if the new archive folder is added.
- Do not archive `INDEX.md`; update it in place later in the phase.

### Step 2 - Recreate Root Formal Authority

- Recreate `ARCHITECTURE.md` as the concise formal global authority:
  ownership, layer model, import direction, public-surface rules, provider
  boundary, material identity boundary, owner facts, and query/present
  separation.
- `ARCHITECTURE.md` must explicitly say what it is rebuilt from:
  accepted formal decisions, glossary, ADRs, documentation architecture rules,
  and audit evidence. It must also say old MVP code/docs are evidence only.
- `ARCHITECTURE.md` must include the accepted decisions above at architecture
  level, especially deleted formal v1 surfaces, entity/record split,
  provider-candidate boundary, source-owned links, query/present separation,
  collection/relation split, and no MVP compatibility layers.
- `ARCHITECTURE.md` must include the 9-area architecture map, each area's
  owns/does-not-own boundary, global import-direction principles,
  public-surface principles, deleted MVP surfaces, old code/docs evidence-only
  policy, and pointers to glossary and ADRs.
- `ARCHITECTURE.md` must not include method-level ports, exact table schemas,
  query hit fields, exact `MaterialCard` shape, or detailed module-by-module
  rewrite plans. Those belong to area `ports.md`, later phase specs, ADRs, or
  implementation plans.
- `ARCHITECTURE.md` must not describe old resolve, ephemeral material,
  canonical review, `mat:`/`emat:`, or old `MusicMaterial`/`SourceMaterial`
  paths as active formal architecture.
- Recreate `CURRENT_STATE.md` as a formal rebuild state summary. It must not
  reuse old MVP status as target truth.
- `CURRENT_STATE.md` must distinguish:
  - formal decisions already accepted;
  - code not yet migrated;
  - old MVP modules that remain only as deletion/migration inventory until
    later phases remove them.
- Recreate `PROGRESS.md` as a formal rebuild milestone index. It must not be a
  fine-grained phase task ledger.
- Keep detailed area progress in area-local `progress.md` files after the
  owning phase rewrites those areas.

### Step 3 - Add Formal Glossary

- Create `docs/formal-project-glossary.md`.
- Include formal target terms and MVP-to-formal term mapping.
- Include the accepted split between:
  - `SourceEntity`
  - `MaterialEntity`
  - `CanonicalEntity`
  - storage `*Record`
  - `Collection`
  - owner relations
  - query hits
  - final presentation cards
- Include the old-code archival policy: old code is preserved by git history or
  explicit snapshot tag/branch, not copied into active-tree archive folders.
- Do not use the glossary to record mutable implementation status.

### Step 4 - Write Accepted ADRs

- Add ADRs only for decisions that are already accepted.
- Each ADR must state rejected alternatives and the boundary consequence.
- Do not fill future-phase details such as query output fields, command audit
  schema, or exact public card shape.

### Step 5 - Mark Superseded Area Documents

- Add selected archived or superseded notices where an existing area document
  describes old MVP resolve, ephemeral material, public canonical review, or old
  query paths as current authority.
- Point readers to root formal authority, the formal glossary, accepted ADRs,
  and formal rebuild status documents.
- Do not fully rewrite area docs in Phase 0. Rewrite each area in its owning
  later phase.

### Step 6 - Sync Navigation And Status

- Update `INDEX.md` in place.
- Ensure `INDEX.md` routes readers to:
  - formal `ARCHITECTURE.md`
  - formal `CURRENT_STATE.md`
  - formal `PROGRESS.md`
  - formal glossary
  - accepted ADRs
  - archived pre-formal root snapshots
- Keep `INDEX.md` as a current authority map, not a complete file inventory.

### Step 7 - Verification

- Run `git diff --check`.
- Run `git diff --name-only`.
- Run a targeted check for corrupted citation placeholders in edited docs.
- If a docs guard exists, run it. If not, record the manual equivalent:
  Markdown inventory, archive notice checks, `git diff --check`, and full git
  status.

## Acceptance Criteria

- The project documents state same-repo formal rebuild, not new repo and not
  MVP patching.
- The documents state no MVP compatibility layers by default.
- The documents state old MVP docs and old MVP code are evidence, deletion
  inventory, and migration input only.
- The documents state old code is preserved through git history or a snapshot
  tag/branch, not copied into `src/archive`, `legacy`, `old`, or docs archive.
- Old root architecture/state/progress files are preserved as pre-formal
  snapshots, not active authority.
- Root `ARCHITECTURE.md`, `CURRENT_STATE.md`, and `PROGRESS.md` are recreated
  for formal rebuild authority/status.
- Root `ARCHITECTURE.md` states its architecture reference inputs and encodes
  the accepted formal decisions in this spec.
- Root `ARCHITECTURE.md` does not preserve old resolve, ephemeral material,
  canonical review, `mat:`/`emat:`, `MusicMaterial`, or `SourceMaterial` as
  active formal architecture.
- `INDEX.md` points to formal authority and archived snapshots.
- `docs/formal-project-glossary.md` exists and owns formal vocabulary/migration
  term mapping.
- Accepted ADRs exist or are explicitly listed as pending with no invented
  details.
- Phase 0 does not change source code, tests, provider code, tool schemas,
  runtime wiring, or database schemas.
- Area docs are only marked superseded/archived where needed; they are not
  fully rewritten in Phase 0.
- No edited document contains corrupted citation placeholders.

## Stopping Condition

Stop Phase 0 after the root docs, glossary, accepted ADRs, archive notices, and
navigation map make the formal rebuild direction unambiguous, while code and
contracts remain untouched.

Anything requiring contract changes, provider behavior, query output design,
presentation card shape, source library facts, collection/relation writes, or
canonical maintenance belongs to later phases.
