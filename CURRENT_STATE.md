# Current State

## Status

MineMusic is at the Wave 8 Codex instruments plugin implementation stage on
`codex/wave8-codex-instruments-plugin`.

The current implementation contains TypeScript shared contracts, public module
ports, in-memory repository infrastructure, plugin registry infrastructure, and
core domain service skeletons, Stage Core runtime composition, Stage Modules
for Session Context and Material Gate, Stage Interface facade, instrument
registry, a fixture end-to-end MVP slice, a read-only NetEase provider adapter,
and contract/runtime tests.
Wave 7 adds a read-only NetEase source provider adapter and opt-in live smoke
command. The local NetEase service is currently verified through explicit live
smoke against `http://127.0.0.1:3000`. Wave 8 adds a repo-local Codex MCP plugin
surface. The Codex surface exposes MineMusic instruments, not runtime
internals, and deterministic MCP/plugin packaging tests pass. The repo-local
plugin now includes a MineMusic workflow skill, explicit MCP input schemas for
argument-bearing tools, a generated skill-local `HANDBOOK.md`, and
`minemusic.handbook.*` lookup tools. The 2026-05-23 architecture refactor
renamed the current code to Stage Core / Stage Interface / Stage Modules.
Fresh Codex app plugin visibility is not yet claimed.

## Source Basis

The current docs are based on `proposal.md` plus the vocabulary decision in
`CONTEXT.md`: Stage Core is runtime composition and lifecycle; Session Context
and Material Gate are Stage Modules; Stage Interface is the callable
host-facing and LLM-facing surface.

## Established

- The MVP user-facing chain is a grounded recommendation with playable links
  when available.
- The LLM owns musical interpretation and final recommendation.
- MineMusic owns grounding, identity anchors, source-backed links, material
  states, events, memory proposals, and effect boundaries.
- Identity, source access, memory, events, and effects are separate modules.
- Modules are expected to communicate through public ports, domain events,
  proposals, provider slots, and interface change requests.
- Plugin packages extend capability slots. They do not define core business
  boundaries.
- Stage Core means runtime composition and lifecycle. In current code this maps
  to `src/stage_core/index.ts`.
- Stage Interface means the LLM-facing and host-facing callable surface. In
  current code this is centered in `src/stage_interface/index.ts`, with
  descriptors and dispatch in `src/instruments/index.ts` and Handbook rendering
  in `src/handbook/index.ts`.
- `src/stage/index.ts` exports Stage Modules for Session Context and Material
  Gate; it is not the Stage Core.
- ADR-0001 records this naming decision so future architecture reviews do not
  reintroduce Stage Core / Stage Kernel ambiguity.
- A subagent orchestration plan now exists for implementing the MVP with
  isolated write scopes and review gates.
- Contract docs distinguish shared data contracts from public module ports.
- Stage/Instrument coordination is split into `InstrumentCatalogPort` and
  `ToolDispatchPort` to avoid a circular public-port contract.
- `StageVibe` is part of session guidance, and Music Knowledge remains a thin
  MVP stub unless later promoted.
- Wave 1 TypeScript build harness exists in `package.json` and `tsconfig.json`.
- Shared contracts are exported from `src/contracts/index.ts`.
- Public ports and repository interfaces are exported from `src/ports/index.ts`.
- Contract/type coverage exists in `test/contracts/wave1-contracts.test.ts`.
- Wave 2 runtime test harness compiles test files into `.tmp-test/`.
- In-memory repositories are exported from `src/storage/index.ts` for sessions,
  canonical records, events, memory entries, and effect proposals.
- Plugin registry infrastructure is exported from `src/plugins/index.ts` with
  slot-scoped registration, lookup, listing, and `plugin.provider_not_found`
  behavior.
- Canonical Store is exported from `src/canonical/index.ts` with get, external
  ref resolution, provisional record creation, and external ref attachment.
- Event Service is exported from `src/events/index.ts` with factual event
  recording and session event listing.
- Effect Boundary is exported from `src/effects/index.ts` with proposal and
  decision handling.
- Memory Service is exported from `src/memory/index.ts` with evidence-gated
  proposals, effect-boundary acceptance, and summaries.
- Music Knowledge is exported from `src/knowledge/index.ts` as a thin provider
  query service that strips playability claims.
- Source Resolution is exported from `src/source/index.ts` with provider search,
  playable-link refresh, canonical-ref attachment from source refs, and honest
  `confirmed_playable` / `source_only_playable` states.
- Session Context and Material Gate are exported from `src/stage/index.ts`
  through `SessionContextPort`, `MaterialGatePort`, and `StageModulesPort`,
  with session continuity, dynamic session context, `StageVibe` propagation
  through session state, and material-state gating.
- `stage.context.read` returns dynamic session context only: session state and
  memory summaries. It does not embed or point at a Handbook.
- The MineMusic Handbook is generated from current agent-visible
  `InstrumentDescriptor` / `ToolDescriptor` entries and written to
  `plugins/minemusic/skills/minemusic/HANDBOOK.md` at runtime startup.
- The `minemusic.handbook` instrument exposes `handbook.overview.read`,
  `handbook.instrument.read`, and `handbook.tool.read` for on-demand Handbook
  lookup.
- Instrument registry and tool dispatch are exported from
  `src/instruments/index.ts` with stable LLM-visible tool names and dependency
  injection through public ports.
- Stage Interface facade is exported from `src/stage_interface/index.ts` and
  exposes stable tool functions backed by `ToolDispatchPort`.
- Stage Core runtime composition is exported from `src/stage_core/index.ts` and
  wires in-memory storage, fixture providers, core ports, Session Context /
  Material Gate, Instrument dispatch, and Stage Interface.
- Stage Core also exports `createMineMusicStageCoreWithSourceProvider` for
  host surfaces that need to register a concrete source provider without
  fixture source materials.
- The fixture transcript runner is exported from `src/app/index.ts`.
- Fixture integration data lives in `fixtures/integration/mvp-fixture.ts`.
- Fixture end-to-end verification is documented in
  `docs/mvp/verification-report.md`.
- Wave 6 final review is documented in `docs/mvp/final-review.md`.
- Stage Module public methods are covered for detached public-port usage.
- The Wave 1-6 implementation branch was merged locally into `main`.
- Wave 7 live source-provider validation design is documented in
  `docs/superpowers/specs/2026-05-18-wave7-live-source-provider-design.md`.
- Wave 7 implementation plan is documented in
  `docs/superpowers/plans/2026-05-18-wave7-live-source-provider.md`.
- NetEase source provider adapter is exported from
  `src/providers/netease/index.ts`.
- NetEase provider tests cover fixture payload mapping, blocked material,
  Source Resolution plugin-slot integration, and source-ref link refresh.
- `npm run smoke:netease` provides opt-in live validation and skips unless
  `MINEMUSIC_LIVE_NETEASE=1`.
- The Wave 8 Codex instruments plugin design is documented in
  `docs/superpowers/specs/2026-05-18-wave8-codex-instruments-plugin-design.md`.
- The Wave 8 implementation plan is documented in
  `docs/superpowers/plans/2026-05-18-wave8-codex-instruments-plugin.md`.
- `stage.materials.prepare` is a stable Stage Interface / Instrument tool, so
  Material Gate behavior is Codex-visible.
- Tool Dispatch enforces current instrument availability through
  `InstrumentCatalogPort`, not by compiling a Handbook. `stage.context.read`,
  the `handbook.*` lookup tools, and `session.update` remain available for
  discovery/reference/recovery.
- The Codex-facing MCP server is exported from `src/surfaces/mcp/server.ts`.
  It prefixes tool names with `minemusic.` and delegates to
  `MineMusicStageInterface`, not provider or repository internals. Argument-bearing
  tools expose explicit input schemas rather than an empty passthrough shape.
- Repo-local Codex plugin packaging lives in `plugins/minemusic` with a local
  marketplace entry at `.agents/plugins/marketplace.json`.
- The repo-local plugin includes a workflow skill at
  `plugins/minemusic/skills/minemusic/SKILL.md`. The skill triggers on music
  requests and routes agents through the skill-local `HANDBOOK.md`,
  `handbook.tool.read`, `stage.context.read`, `music.material.resolve`, and
  `stage.materials.prepare`.
- The workflow skill now distinguishes listening context from provider search
  text. Environment terms such as writing code, study, walking, late night, or
  not too sleepy are musical context for the agent to interpret, not literal
  source-search strings.

## Not Yet Implemented

- Stage Interface can still be deepened: host schemas, tool metadata, Handbook
  rendering, and dispatch are not yet fully owned by one implementation file.
- Durable storage repositories beyond in-memory infrastructure.
- Packaged Plugin Slot adapters beyond the in-repo NetEase adapter and
  repo-local Codex MCP surface.
- More host-surface validation for Handbook refresh when plugin tool
  descriptors change outside runtime startup.
- Fresh Codex app plugin installation and interactive tool visibility in a new
  Codex session.

## Verification

- `npm test` passes as of Wave 8 deterministic MCP/plugin implementation.
- `npm run typecheck` passes as of Wave 8 deterministic MCP/plugin
  implementation.
- `npm run smoke:netease` skips successfully unless explicitly enabled.
- `MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease` passes against
  `http://127.0.0.1:3000` in this session.
- `git diff --check` passes as of Wave 8 deterministic MCP/plugin
  implementation.
- Branch integration for Waves 1 through 7 is complete on `main`.

## Known Constraints

- Do not collapse source identity into canonical identity.
- Do not treat knowledge material as playable until source resolution confirms
  a usable playable link.
- Do not turn weak LLM guesses into durable memory.
- Do not treat normal link display as playback.
- Do not build heavy recommender scoring into the MVP path.
- Do not treat a `source_only_playable` event target as durable canonical
  identity.
