# Progress

## 2026-05-17

- Created a fresh MVP documentation pack from `proposal.md`.
- Added project entrypoint and document index.
- Added MVP architecture, interface contracts, module boundaries, workstreams,
  agent collaboration protocol, phase plan, and current state file.
- Added explicit module port specifications and cross-module communication
  protocols for parallel human/agent implementation.
- Added `plan/subagent_mvp_master_plan.md` to define coordinator-led subagent
  waves, write scopes, review gates, and completion criteria.
- Repaired pre-execution contract drift: public ports now consistently use
  single-object arguments plus `Result<T>`, Stage/Instrument dependencies are
  split into catalog and dispatch ports, `StageVibe` is explicit, Music
  Knowledge is marked as a thin stub, and source-only event targets are bounded.
- Marked implementation as not yet started.
- Entered Wave 1 on branch `codex/wave1-foundation`.
- Added the TypeScript build/typecheck harness in `package.json` and
  `tsconfig.json`.
- Added shared MVP contracts in `src/contracts/index.ts`, including
  `Result<T>`, `StageError`, `StageWarning`, `DomainEvent`, material states,
  providers, instrument descriptors, proposals, and stable error-code
  definitions.
- Added public module ports and repository interfaces in `src/ports/index.ts`,
  including separate `InstrumentCatalogPort` and `ToolDispatchPort`.
- Added contract/type tests in `test/contracts/wave1-contracts.test.ts`.
- Verified Wave 1 with `npm test` and `npm run typecheck`.
- Entered Wave 2 for storage and plugin registry foundations.
- Switched the TypeScript test harness to NodeNext ESM imports and added
  `tsconfig.test.json` for compiled runtime tests.
- Added in-memory repositories in `src/storage/index.ts` for sessions,
  canonical records, events, memory entries, and effect proposals.
- Added repository runtime tests in
  `test/storage/in-memory-repositories.test.ts`, including instance isolation
  and returned-copy checks.
- Added plugin registry infrastructure in `src/plugins/index.ts` with
  slot-scoped provider registration, provider listing, provider lookup, and
  stable `plugin.provider_not_found` errors.
- Added plugin registry runtime tests in `test/plugins/plugin-registry.test.ts`.
- Verified Wave 2 with `npm test`.
- Entered Wave 3 for core domain modules.
- Added Canonical Store in `src/canonical/index.ts` with provisional records,
  external ref resolution, external ref attachment, and conflict rejection.
- Added Event Service in `src/events/index.ts` with factual event recording and
  session-scoped listing.
- Added Effect Boundary in `src/effects/index.ts` with proposal and decision
  handling.
- Added Memory Service in `src/memory/index.ts` with evidence-gated proposals,
  effect-boundary acceptance, and text summaries.
- Added Music Knowledge thin service in `src/knowledge/index.ts`, keeping
  provider output grounded and stripping playable-link claims.
- Added Source Resolution in `src/source/index.ts` with provider search,
  playable-link refresh, canonical-ref attachment, and `confirmed_playable`
  versus `source_only_playable` distinction.
- Added runtime tests for every Wave 3 module and consolidated runtime execution
  through `test/run-runtime-tests.ts`.
- Verified Wave 3 with `npm test`.
- Entered Wave 4 for Stage Kernel and Instruments.
- Added Stage Kernel in `src/stage/index.ts` with session get/update,
  Handbook compilation, `StageVibe` propagation, memory summaries, instrument
  listing, and material-state gating for LLM-facing use.
- Added instrument catalog and tool dispatch in `src/instruments/index.ts` with
  stable public tool names and dispatch through injected public ports.
- Added Tool API facade in `src/tool_api/index.ts` exposing stable tool
  functions backed by `ToolDispatchPort`.
- Added runtime tests for Stage Kernel, Instrument Registry, and Tool API.
- Verified Wave 4 with `npm test`.
- Entered Wave 5 for composition and the fixture end-to-end MVP slice.
- Added runtime composition in `src/runtime/index.ts`, wiring in-memory storage,
  fixture source provider registration, core domain ports, Stage Kernel,
  Instrument dispatch, and Tool API.
- Added fixture transcript runner in `src/app/index.ts`.
- Added integration fixture data in `fixtures/integration/mvp-fixture.ts`.
- Added end-to-end integration coverage in `test/integration/mvp-slice.test.ts`.
- Added `docs/mvp/verification-report.md` documenting verified behavior, thin
  stubs, commands, and remaining work.
- Verified Wave 5 with `npm test`.
- Entered Wave 6 final review and documentation sync.
- Found and fixed a Stage Kernel public-port robustness issue: detached
  `compileHandbook` / `prepareMaterials` calls no longer depend on `this`.
- Added regression coverage for detached Stage Kernel public methods in
  `test/stage/stage-kernel.test.ts`.
- Added `docs/mvp/final-review.md` with spec review, code-quality review,
  accepted constraints, verification commands, and residual risk.
- Updated verification and state docs to distinguish the fixture MVP slice from
  live provider or durable-storage completion.
- Verified Wave 6 with `npm test`, `npm run typecheck`, and `git diff --check`.
- Merged `codex/wave1-foundation` locally into `main` after Wave 6
  verification.

## 2026-05-18

- Entered Wave 7 planning on branch `codex/wave7-live-source-provider`.
- Added the Wave 7 live source-provider design spec at
  `docs/superpowers/specs/2026-05-18-wave7-live-source-provider-design.md`.
- Updated current state and verification notes to remove the stale branch
  integration blocker.
- Corrected the local NetEase Cloud Music API endpoint to default to
  `http://127.0.0.1:3000` after live endpoint confirmation.
- Added Wave 7 implementation plan at
  `docs/superpowers/plans/2026-05-18-wave7-live-source-provider.md`.
- Added read-only NetEase source provider adapter in
  `src/providers/netease/index.ts`.
- Added deterministic provider tests in
  `test/providers/netease-source-provider.test.ts` for NetEase response
  mapping, blocked material, Source Resolution plugin-slot integration, and
  source-ref link refresh.
- Added `npm run smoke:netease` with opt-in live validation. Default smoke
  skips unless `MINEMUSIC_LIVE_NETEASE=1`.
- Explicit live smoke against `http://127.0.0.1:3000` passes, so live NetEase
  search-link validation is claimed for the current local service.
- Merged `codex/wave7-live-source-provider` locally back to `main`.
- Entered Wave 8 on branch `codex/wave8-codex-instruments-plugin`.
- Added the Wave 8 Codex instruments plugin design spec at
  `docs/superpowers/specs/2026-05-18-wave8-codex-instruments-plugin-design.md`.
- Added the Wave 8 implementation plan at
  `docs/superpowers/plans/2026-05-18-wave8-codex-instruments-plugin.md`.
- Added `stage.materials.prepare` as a stable instrument/tool API entry and
  routed the fixture transcript through the tool-visible Stage Kernel gate.
- Added initial instrument enforcement in Tool Dispatch while keeping
  `stage.context.read` available for discovery and `session.update` available
  for recovery.
- Added `createMineMusicRuntimeWithSourceProvider(...)` for host surfaces that
  need a concrete source provider runtime.
- Added a Codex-facing MCP server in `src/surfaces/mcp/server.ts` with
  `minemusic.*` tool names derived from MineMusic instrument descriptors.
- Added repo-local Codex plugin packaging under `plugins/minemusic` and a local
  marketplace entry at `.agents/plugins/marketplace.json`.
- Added deterministic tests for instrument enforcement, source-provider runtime
  composition, MCP tool definitions/handlers, and plugin packaging.
- Added a repo-local MineMusic workflow skill under
  `plugins/minemusic/skills/minemusic/SKILL.md`, and updated the plugin
  manifest to expose `./skills/`.
- Replaced the generic MCP passthrough input schema with explicit schemas for
  argument-bearing MineMusic tools.
- Corrected the MineMusic workflow skill so listening environments such as
  writing code are treated as agent interpretation context, not as literal song
  title/provider-search text.
- Split dynamic Stage context from the Handbook surface. `stage.context.read`
  now returns session state, memory summaries, and a session-scoped
  `handbookRef`; `stage.handbook.read` reads the static session Handbook
  markdown document on demand.
- Added a file-backed session Handbook store under `src/stage/` and ignored the
  runtime `.minemusic/` handbook directory.
- Updated Tool Dispatch to check instrument availability through
  `InstrumentCatalogPort` instead of compiling a Handbook as a side effect.

## Next

- Verify the repo-local plugin in a fresh Codex plugin session before claiming
  live Codex tool and skill visibility.
- Define explicit refresh semantics for already-created session Handbooks when
  plugin, tool, or policy guidance changes.
- Decide whether to merge `codex/wave8-codex-instruments-plugin` back to
  `main`, push a PR, keep the branch, or discard the branch.
- Later implementation should target durable storage and richer host-surface
  validation without moving recommendation logic into host adapters.
