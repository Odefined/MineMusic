# Current State

## Status

MineMusic is at the Wave 7 live source-provider adapter implementation stage on
`codex/wave7-live-source-provider`.

The current implementation contains TypeScript shared contracts, public module
ports, in-memory repository infrastructure, plugin registry infrastructure, and
core domain service skeletons, Stage Kernel, instrument registry, Tool API
facade, a fixture end-to-end MVP slice, and contract/runtime tests.
Wave 6 final review found and fixed one Stage Kernel public-method robustness
issue. Wave 7 adds a read-only NetEase source provider adapter and opt-in live
smoke command. The local NetEase service is currently verified through explicit
live smoke against `http://127.0.0.1:3000`.

## Source Basis

The current docs are based on `proposal.md` only.

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
- A subagent orchestration plan now exists for implementing the MVP with
  isolated write scopes and review gates.
- Contract docs distinguish shared data contracts from public module ports.
- Stage/Instrument coordination is split into `InstrumentCatalogPort` and
  `ToolDispatchPort` to avoid a circular public-port contract.
- `StageVibe` is part of session/Handbook guidance, and Music Knowledge remains
  a thin MVP stub unless later promoted.
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
- Stage Kernel is exported from `src/stage/index.ts` with session continuity,
  Handbook compilation, `StageVibe` propagation, and material-state gating.
- Instrument registry and tool dispatch are exported from
  `src/instruments/index.ts` with stable LLM-visible tool names and dependency
  injection through public ports.
- Tool API facade is exported from `src/tool_api/index.ts` and exposes stable
  tool functions backed by `ToolDispatchPort`.
- Runtime composition is exported from `src/runtime/index.ts` and wires
  in-memory storage, fixture providers, core ports, Stage Kernel, Instrument
  dispatch, and Tool API.
- The fixture transcript runner is exported from `src/app/index.ts`.
- Fixture integration data lives in `fixtures/integration/mvp-fixture.ts`.
- Fixture end-to-end verification is documented in
  `docs/mvp/verification-report.md`.
- Wave 6 final review is documented in `docs/mvp/final-review.md`.
- Stage Kernel public methods are covered for detached public-port usage.
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

## Not Yet Implemented

- Durable storage repositories beyond in-memory infrastructure.
- Live NetEase provider success with a running local service.
- Packaged Plugin Edge providers beyond the in-repo NetEase adapter.
- Host-surface validation beyond the fixture MVP slice.

## Verification

- `npm test` passes as of Wave 7 deterministic provider implementation.
- `npm run typecheck` passes as of Wave 7 deterministic provider
  implementation.
- `npm run smoke:netease` skips successfully unless explicitly enabled.
- `MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease` passes against
  `http://127.0.0.1:3000` in this session.
- `git diff --check` passes as of Wave 7 deterministic provider
  implementation.
- Branch integration for Waves 1 through 6 is complete on `main`.

## Known Constraints

- Do not collapse source identity into canonical identity.
- Do not treat knowledge material as playable until source resolution confirms
  a usable playable link.
- Do not turn weak LLM guesses into durable memory.
- Do not treat normal link display as playback.
- Do not build heavy recommender scoring into the MVP path.
- Do not treat a `source_only_playable` event target as durable canonical
  identity.
