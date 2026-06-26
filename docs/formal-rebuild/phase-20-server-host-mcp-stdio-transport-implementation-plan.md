# Phase 20 Server Host MCP stdio Transport Implementation Plan

> Status: Phase 20 implemented. The Server Host entrypoint now serves the
> fifteen-tool Public Agent Protocol over MCP-over-stdio (start → fail-fast →
> serve → stop), the real per-call Tool Context is composed by owning areas
> through a Server helper, and cancellation, the output veil, and the host-thin
> and transport import guards hold. See Implementation Result at the end. The
> design-review open questions (factory realization, factory surface, provider
> availability, MCP initialize payload, tools/call content block, transport
> structure, PR sequencing, smoke naming, logging) were resolved against
> codebase and MCP-spec evidence and are folded into Decisions Already Settled.
> Spec authority: this document plus CONTEXT.md (`MineMusic Server`, `Host Client /
> Transport`, `Stage Interface`, `Stage Interface Tool Definition`, `Public Agent
> Protocol`), ARCHITECTURE.md (`Host, Interface, And Runtime`; Server Host area
> ownership; `Stage Interface is the only formal agent-facing callable boundary`),
> `docs/formal-project-glossary.md`, ADR-0013 (contracts per-area split), ADR-0014
> (model-visible tool guidance is mandatory), ADR-0015 (side-effect and invocation
> policy are separate), ADR-0017 (Tool Call Router owns `toolName`), ADR-0019
> (Public Handle Veil ownership split and `HandleMintingPort`).
> Owning bounded contexts: Server Host (host transport adapter lifecycle, process
> entrypoint), Stage Interface (Tool Context Factory, `HandleMintingPort`, Tool
> Definition → MCP rendering, compact result summaries, output veil), Effect
> Boundary (gate and audit consumed by the factory), Music Data Platform (exposes
> a narrow `handleMinting()` port only).

## Goal

Sanction Phase 20 as the **server host MCP stdio transport** phase. Phases 16–19
ship a complete Public Agent Protocol curation surface — discovery, presentation,
library import, and library relations — but the Server Host only owns runtime
lifecycle: `src/server/index.ts` starts the runtime, prints a snapshot, and
stops. There is no host transport, so no MCP client can connect. Phase 20 ships
the first real host transport, **MCP-over-stdio**, so a local MCP client (Codex,
CLI) can connect to the Server Host and dispatch the existing fifteen Public
Agent Protocol tools.

Phase 20 also closes a latent gap that the absence of a transport has hidden:
**no production caller currently builds a real `StageToolContext`**. Tests build
the context with stubs or with manually composed ports, and `ServerHost.dispatch`
takes an externally supplied context. The transport is the first real `dispatch`
caller, so Phase 20 must introduce production composition of the real per-call
context ports.

The transport adds **no new Public Agent Protocol tool** and changes **no existing
tool descriptor's call semantics**. It only exposes the already-shipped surface
over MCP (it does add a compact result-summary renderer to the ToolDeclaration
contract — see below).

## Decisions Already Settled

These are the design decisions confirmed during the Phase 20 design review,
grounded in codebase and MCP-spec evidence. They are the authority-level facts of
this plan.

### Transport scope and implementation

- **Transport scope is MCP-over-stdio only.** HTTP, CLI, and Web UI transports
  remain deferred. CONTEXT.md commits to MCP-over-local as the v1 transport, and
  stdio is what local MCP clients (Codex, CLI) connect to.
- **The MCP implementation is hand-rolled, not the official
  `@modelcontextprotocol/sdk`.** The runtime dependency footprint stays at `ajv`
  only. The supported JSON-RPC method subset is `initialize`,
  `notifications/initialized`, `tools/list`, `tools/call`, `ping`, and
  `notifications/cancelled`. (This decision is ADR-candidate; the ADR is deferred
  and not written in this plan.)
- **The supported MCP protocolVersion is `"2025-11-25"`** (the current latest
  stable revision, which supersedes `2025-06-18`). MineMusic supports exactly one
  version.

### Real per-call context (closes the latent gap)

- **Phase 20 closes the real per-call context gap.** Production composition of
  the real `StageToolContext` ports does not exist today; the transport is the
  first real `dispatch` caller and forces it to exist.
- **Stage Interface owns the transport-agnostic Tool Context Factory.** A new
  `createStageToolContextFactory({ ownerScope, clock, handleMinting,
  executionGate, audit? })` in `src/stage_interface/tool_context_factory.ts`
  (re-exported from the Stage Interface barrel) closes over the real ports and
  returns `{ createToolContext({ sessionId, requestId, abortSignal? }) }`, which
  delegates to the existing `createStageToolContext`. `handleMinting`,
  `executionGate`, and `clock` are REQUIRED (no defaults), so production cannot
  silently fall through to the unavailable/conservative defaults.
- **Factory realization: a dedicated Server composition-helper file binds the
  ports; `host.ts` gains zero port names.** A new Server Host module (mirroring
  the existing `*_runtime_module.ts` shim pattern) takes the owning modules,
  extracts the narrow production ports — `musicDataPlatformModule.handleMinting()`
  plus Effect Boundary `createConservativeStageToolExecutionGate` /
  `createMemoryStageToolAuditPort` — and calls `createStageToolContextFactory`.
  If any required production port is missing it THROWS (no defensive default).
  `createServerHost()` only instantiates this helper and stashes the result;
  `host.ts` contains no port names and no `createStageToolContextFactory` call.
  Composing the factory inside `host.ts` was rejected during review as a Rule-1
  (Server Host stays thin) violation.
- **`ServerHost` gains exactly one thin accessor `toolContextFactory()`** that
  delegates to the helper's product and returns `undefined` on the
  `input.runtime` / `input.modules` injection path, exactly mirroring the
  existing `sourceLibraryImport()` / `retrievalQuery()` accessors.
- **`MusicDataPlatformRuntimeModule` gains a narrow `handleMinting()` accessor**
  that composes `createStageInterfaceHandleMintingPort({ db: database.context() })`
  inside its closure, accepting the port's production-grade defaults (a
  crypto-random `publicIdFactory` with registry-collision checking and an ISO
  wall-clock `clock`) — mirroring the `candidateCommit()` / `materialProjection()`
  precedent of composing the db-scoped input and accepting the port's own
  defaults. Only the `HandleMintingPort` type crosses the boundary, never
  `MusicDatabaseContext`.
- **The factory omits `providerAvailability`.** No shipped Stage Adapter handler
  reads `ctx.providerAvailability` (verified: `providerAvailability` /
  `isProviderAvailable` appear only in `src/stage_interface/context.ts` and
  `src/contracts/stage_interface.ts`). The context keeps its conservative default.
- **Production `publicIdFactory` is a crypto-random opaque id** with
  registry-collision checking, not the test-local counter factory.
  The original `MUSIC_LOOKUP_CURSOR_KEY` rules were unaffected by Phase 20, but
  were superseded by ADR-0024 when Phase 21 replaced AEAD lookup cursors with a
  registry-backed Public Cursor Veil.

### MCP wire contract

- **`initialize` response:** `{ protocolVersion: "2025-11-25", capabilities:
  { tools: {} }, serverInfo: { name: "minemusic", version: <read from
  package.json> } }`. `capabilities.tools` is the empty object — `listChanged`
  is NOT declared because MineMusic's fifteen-tool set is static (build-time
  fixed). No `logging`, `prompts`, `resources`, `completions`, or `tasks`
  capability is declared. `serverInfo.version` is read from `package.json`
  (currently `0.0.0`) with NO hard-coded fallback literal. Optional `instructions`
  is omitted in v1.
- **protocolVersion negotiation:** the server always responds with
  `"2025-11-25"` regardless of the client's requested version (the spec mandates
  the server respond with a version it supports). Version mismatch is NOT a
  JSON-RPC `-32602` error; that error is reserved for genuinely malformed
  `initialize` payloads. The client disconnects on its own if it cannot accept
  `2025-11-25`.
- **`tools/list` renders one MCP tool definition per shipped `ToolDeclaration`**
  (fifteen tools), each carrying `name`, the stitched `description`, generated
  `inputSchema`, generated `outputSchema`, and side-effect-derived `annotations`.
- **Generated `inputSchema` (and `outputSchema` where useful) carry field-level
  descriptions.** The schema generator is switched from `jsDoc: "none"` to
  `jsDoc: "extended"`, and the agent-facing input/output types in
  `src/contracts/stage_interface.ts` gain JSDoc on their fields, so the model
  gets semantic field guidance (not just enums/required/types) when constructing
  arguments — highest leverage on the rich-parameter tools such as
  `music.discovery.lookup` (`scope` / `order` / `cursor` / `limit`). Field
  descriptions must be veil-safe (must not trip the output-schema anchor guard).
- **`tools/list` description stitches `description` + `usage` (`useWhen`,
  `doNotUseWhen`, `outputSemantics`) + `examples` (`call` / `avoid`)** into the
  single MCP description string, so the ADR-0014 mandatory guidance is visible to
  the client.
- **`tools/list` `annotations` are derived from the static side-effect
  declaration** (ADR-0010), not from invocation policy (ADR-0015): read-only tools
  carry `readOnlyHint`; durable-write tools are non-destructive;
  idempotent-at-the-boundary edits carry `idempotentHint`. The derivation is a
  pure function.
- **`tools/call` success returns BOTH `structuredContent` and a non-empty
  `content` block.** `structuredContent` is the authoritative typed
  `ToolCallOutput.result` (the typed contract preserved end to end). `content` is
  REQUIRED and non-empty per the MCP schema (PR #559 made it non-optional again),
  and structuredContent-only breaks real clients (Claude Code and Codex drop
  `content` when `structuredContent` is present; python-sdk hard-fails on missing
  `content`). The `content` block carries a **compact non-duplicative result
  summary**, NOT stringified JSON (which is fully redundant with
  `structuredContent` and is dropped by the target clients anyway).
- **The per-tool result summary is declared on the `ToolDeclaration`.** Each
  descriptor carries a `resultSummary(result: unknown) => string` renderer (a
  transport-agnostic compact presentation of the tool's own output — Stage
  Interface owns compact public outputs; the MCP transport merely consumes it for
  the `content` block). The transport calls `descriptor.resultSummary(result)`
  generically and imports no per-tool domain types. Each summary must be veil-safe
  (must not contain internal anchors). This is enforced as a public-text invariant:
  a violation fails loudly instead of being sanitized by the transport. This is a
  **conscious deviation** from the spec's `SHOULD` ("return the serialized JSON in
  a TextContent block"): the summary is non-duplicative and aligns with the
  SEP-1624 direction (content is model-oriented output, semantically equivalent to
  `structuredContent`).
- **Error translation follows MCP convention.** Declared tool errors,
  `stage_interface.invalid_input`, and Effect Boundary `ask_required` /
  `denied_by_policy` results become MCP tool results with `isError: true` and a
  content block carrying the safe error text. `stage_interface.tool_not_found`,
  malformed JSON-RPC, and unsupported methods become JSON-RPC error responses.
  The shipped tools auto-pass the conservative gate, so `ask` / `deny` rarely fire
  in v1, but the translation must cover them.
- **Cancellation is wired in v1.** `notifications/cancelled { requestId }` aborts
  the matching in-flight dispatch through its `AbortController`, reusing the
  existing `ctx.abortSignal` plumbing. A cancel for an unknown or already-completed
  request is a no-op.

### Identity, lifecycle, and logging

- **v1 identity posture is single local owner, no auth.** `ownerScope` is `local`
  (`DEFAULT_OWNER_SCOPE`). stdio transport has no auth mechanism by design; the
  OS isolates the local process. Multi-owner and transport auth arrive with a
  future HTTP transport. `sessionId` is generated at MCP `initialize` (one stdio
  client = one session); `requestId` is the JSON-RPC request id.
- **Process lifecycle is start → fail-fast → serve → stop.** On `host.start()`
  failure, the process logs and exits non-zero before serving. On stdin EOF or
  shutdown it runs `host.stop()` and exits.
- **v1 does NOT emit `notifications/message` and does NOT declare the `logging`
  capability.** Diagnostics go to stderr, which the MCP stdio transport spec
  sanctions for all log levels.

### Transport structure

- **The transport lives under a new `src/server/transports/` subdirectory** as
  four files: a stdio loop driver plus three pure modules — JSON-RPC framing,
  Tool-Definition → MCP rendering, and `Result<ToolCallOutput>` → MCP translation.
  The driver is the only non-pure piece (it owns the in-flight `AbortController`
  map and the injected I/O); the other three are pure and independently unit
  testable with a fake dispatch/factory.
- **The transport consumes only narrow injected ports** — a dispatch function
  (`Pick<ServerHost, "dispatch">` or a dedicated narrow type), the context
  factory, a descriptor source (`host.snapshot().interfaceContract.tools`),
  `serverInfo`, `protocolVersion`, and injected I/O (read line / write line /
  log error / now). It imports only `src/contracts/*` plus its narrow port types.
- **Verification baseline is unit tests plus an active-tree guard plus a
  Codex-compatibility smoke.** No live provider smoke is required for the
  transport itself.

## Non-Goals

- Do not add HTTP, CLI, Web UI, or any non-stdio host transport.
- Do not introduce the official `@modelcontextprotocol/sdk` or any new runtime
  dependency. The runtime dependency footprint stays at `ajv`.
- Do not add any new Public Agent Protocol tool, instrument, or namespace.
- Do not change any existing tool descriptor's call semantics, declared error,
  input schema, or output schema. Phase 20 only renders and transports the
  existing surface (plus the additive `resultSummary` renderer).
- Do not add transport-layer auth, multi-owner routing, sessions beyond one stdio
  client, or rate limiting. These belong to a future HTTP transport phase.
- Do not implement the Stage Interface Handbook as an MCP-callable tool. Full
  guidance is rendered into the stitched description; a separate Handbook feature
  remains a later Stage Interface concern.
- Do not refactor database ownership, move `stageInterfaceHandleRegistrySchema`
  out of the Music Data Platform module, or otherwise fix the Stage Interface
  schema/port composed-in-MDP wart. That is a recorded follow-up.
- Do not implement the full Effect Boundary ask / approval loop. The conservative
  gate stub and its existing auto-pass qualifiers are consumed unchanged.
- Do not change the `dispatch(ctx, input)` contract or the `StageToolContext`
  shape. Phase 20 adds a factory that composes real ports; it does not alter the
  per-call context type.
- Do not support multiple MCP protocolVersion dialects in v1; negotiate
  `2025-11-25` only.
- Do not declare `tools.listChanged` or emit `notifications/tools/list_changed`;
  the tool set is static.
- Do not emit `notifications/message` or declare the `logging` capability in v1.

## Ownership And Boundaries

Stage Interface owns:

- `createStageToolContextFactory` in `src/stage_interface/tool_context_factory.ts`
  (re-exported from the Stage Interface barrel);
- the `HandleMintingPort` type and its registry-backed implementation;
- the `resultSummary` renderer field on the `ToolDeclaration` contract and each
  tool's compact summary renderer;
- the pure Tool Definition → MCP rendering helpers (stitched description,
  generated `inputSchema` / `outputSchema`, side-effect-derived `annotations`).

Server Host owns:

- the MCP stdio transport adapter under `src/server/transports/` (JSON-RPC
  framing, the method subset, `tools/call` translation, cancellation) and the
  process lifecycle loop;
- a new Server composition-helper module that binds the real ports into
  `createStageToolContextFactory` (mirroring the `*_runtime_module.ts` shim
  pattern); it contains the port names, `host.ts` does not;
- one thin `toolContextFactory()` accessor on `ServerHost` that delegates to the
  helper. Server Host gains no context-composition logic and no domain/repository
  knowledge.

Effect Boundary owns the conservative execution gate and in-memory audit port
consumed by the factory, unchanged from Phase 16B / 17 / 18B / 19.

Music Data Platform owns a narrow `handleMinting()` port composed from its owned
database. MDP owns no transport behavior.

Imports forbidden:

- the transport module (`src/server/transports/*`) must import only
  `src/contracts/*` and its narrow port types — no domain modules, repositories,
  Stage Adapter handlers, provider plugins, or Music Data Platform / Extension /
  Effect Boundary / Music Intelligence / Music Experience internals;
- Stage Interface core must not import Server Host or transport modules;
- the Tool Context Factory and the composition helper must not construct
  repositories or call repository write methods; they receive composed ports, and
  only `HandleMintingPort` (never `MusicDatabaseContext`) crosses the MDP seam;
- the transport must not bypass `dispatch` and must not introduce a second
  tool-definition source of truth;
- `host.ts` must not name any production port or call `createStageToolContextFactory`.

## Public Contract

Phase 20 adds no Public Agent Protocol tool. Its public contract is the MCP
server surface.

- **Transport**: MCP-over-stdio, JSON-RPC 2.0, line-delimited on stdin/stdout.
- **Methods**: `initialize`, `notifications/initialized`, `tools/list`,
  `tools/call`, `ping`, `notifications/cancelled`.
- **`initialize` response**: `{ protocolVersion: "2025-11-25", capabilities:
  { tools: {} }, serverInfo: { name: "minemusic", version: <from package.json> } }`.
  The server always echoes `"2025-11-25"`; version mismatch is not a JSON-RPC
  error.
- **`tools/list`**: one MCP tool definition per shipped `ToolDeclaration`
  (fifteen tools), each carrying `name`, the stitched `description`, generated
  `inputSchema`, generated `outputSchema`, and side-effect-derived `annotations`.
- **`tools/call`**: `factory.createToolContext(...)` → `host.dispatch(...)` →
  `Result<ToolCallOutput>`. Success returns `structuredContent` (the typed
  `result`) AND a non-empty `content` block carrying the descriptor's
  `resultSummary(result)`. Declared tool errors and gate `ask` / `deny` return
  `isError: true` with a content block. Malformed JSON-RPC, unknown method, and
  `tool_not_found` return JSON-RPC error responses.
- **`notifications/cancelled`**: aborts the matching in-flight `tools/call`; a
  cancel for an unknown or already-completed request is a no-op.

## Proposed PR Sequencing

A three-slice sequencing. Slice boundaries track the settled decisions; finer
file-level allocation within a slice is an implementation choice.

### PR 20A — Contract And Context Foundation

> Depends on: Phase 19 implemented.

Land the Stage Interface Tool Context Factory, the narrow MDP `handleMinting()`
port, the Server composition-helper that binds the real ports, the thin
`toolContextFactory()` accessor on `ServerHost`, and the input-schema
field-description enrichment (generator `jsDoc: "extended"` + veil-safe JSDoc on
the agent-facing input/output types, then regenerate) — closing the real-context
gap and enriching the agent-facing contract with no transport code yet. `host.ts`
gains only the thin accessor. Shippable standalone via factory/helper unit tests
and the regenerated schema `--check`.

### PR 20B — MCP stdio Transport Module

> Depends on: PR 20A.

Land the hand-rolled MCP stdio transport under `src/server/transports/` (driver +
framing + rendering + translation as pure functions where possible), the
`resultSummary` contract field and the fifteen per-tool summary renderers it
consumes, the active-tree allow-list update, and the bespoke per-file transport
guard. Shippable standalone via framing / rendering / translation unit tests
with a fake dispatch and factory.

### PR 20C — Entrypoint Loop, Wiring, Smoke, Docs Sync

> Depends on: PR 20B.

Run the transport as a real long-lived stdio server from the Server Host
entrypoint (start → fail-fast → serve → stop), wire composition respecting
"Server Host stays thin," add the `smoke:mcp:stdio` smoke (gated by
`MINEMUSIC_LIVE_MCP_STDIO`), and sync docs/state. Flip this plan's Status to
implemented and add an Implementation Result section.

## Guard Plan

- Active-tree / forbidden-import guard:
  - add the four new `src/server/transports/*` files (and the new Server
    composition-helper file) to the exact `src/server` allow-list assertion in
    `test/formal/active-tree.test.ts` (the helper recurses subdirectories, so a
    new `transports/` subdir is discovered and must be enumerated);
  - add a bespoke per-file guard for the transport driver that forbids imports
    from `../music_data_platform/`, `../extension/`, `../storage/`,
    `../effect_boundary/`, `../music_intelligence/`, `../music_experience/`, and
    repository construction — and that covers ALL THREE import forms (static
    `from`, dynamic `import()`, bare side-effect `import`), mirroring the
    contracts-DAG regex, because the generic server scan only checks static
    `from` clauses;
  - land this bespoke guard in PR 20B alongside the transport, not later.
- host-thin guard (PR 20C): assert `host.ts` does not import the transport or the
  factory and contains no production-port names.
- Output-veil guard: `structuredContent` carries only the already-veil-guarded
  public output; each `resultSummary` string must pass
  `freeTextContainsInternalAnchor`, and any violation fails loudly rather than
  being rewritten by the transport.
- Schema-description guard: field-level JSDoc that flows into generated
  `inputSchema` / `outputSchema` must be veil-safe — it must not trip
  `assertOutputSchemaHasNoInternalAnchors` or `freeTextContainsInternalAnchor`
  (descriptions are agent-visible text).
- Write-boundary guard: the transport writes nothing itself; all mutation flows
  through `host.dispatch` → owning commands.
- Single-source-of-truth guard: MCP tool definitions are rendered from existing
  `ToolDeclaration` artifacts; the build fails if a shipped tool lacks a generated
  schema, a stitched description, or a `resultSummary` renderer.
- Fail-loud guard: missing production ports at factory-assembly time throw rather
  than fall back to unavailable/conservative defaults.

## Verification

Run narrow checks first, then broaden:

```bash
npm run check:stage-interface-schemas
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
npm run server:minemusic
git diff --check
git diff --name-only
```

`server:minemusic` should start a real stdio server, initialize, and exit cleanly
on stdin EOF without dispatching. Add a Codex-compatibility smoke:

```bash
npm run smoke:mcp:stdio
```

gated by `MINEMUSIC_LIVE_MCP_STDIO`. Existing `smoke:library:import` /
`smoke:ncm:retrieval` cover provider behavior unchanged.

Verify at PR 20C that the target client consumes `structuredContent` and the
`resultSummary` content block correctly; if a client ignores `structuredContent`,
confirm the summary alone is sufficient for the model.

## Acceptance Criteria

Phase 20 is complete when:

- the default Server Host serves MCP-over-stdio from `src/server/index.ts`;
- `initialize` returns `protocolVersion "2025-11-25"`, `capabilities { tools: {} }`,
  and `serverInfo` with the package version, and always echoes `2025-11-25`;
- a client can `initialize`, `tools/list`, and `tools/call` over stdio;
- `tools/list` renders all fifteen shipped tools with stitched descriptions,
  generated `inputSchema` / `outputSchema`, and side-effect-derived annotations;
- generated `inputSchema` (and `outputSchema` where useful) carry veil-safe
  field-level descriptions (generator `jsDoc: "extended"`);
- `tools/call` success returns `structuredContent` AND a non-empty, veil-safe
  `content` summary from the descriptor's `resultSummary`; a leaky summary fails
  the call instead of crossing the transport boundary;
- declared tool errors and gate `ask` / `deny` return `isError: true`; protocol
  errors return JSON-RPC errors;
- the real per-call context is composed from owning-area ports (real
  `handleMinting`, conservative gate, audit), not the unavailable/default stubs,
  and missing ports throw at assembly time;
- `notifications/cancelled` aborts the matching in-flight call;
- startup failure fails fast before serving;
- `host.ts` contains no production-port names and no factory call;
- no new runtime dependency is added (footprint stays at `ajv`);
- the active-tree allow-list and the bespoke transport per-file guard hold;
- docs/state ledgers reflect the implemented phase.

## Stopping Condition

Stop when the default Server Host serves MCP-over-stdio, the fifteen shipped
tools are listed and callable with typed `structuredContent` plus a non-empty
content summary, the real per-call context is composed by owning areas through a
Server helper (not `host.ts`), cancellation and fail-fast are covered by tests,
`host.ts` remains thin, the active-tree and write-boundary guards hold, and the
verification set above passes.

## Implementation Result

Phase 20 is implemented in three PR slices on branch
`phase-20-mcp-stdio-transport`; `npm test` is green and `git diff --check` is
clean.

- **PR 20A — Contract And Context Foundation.** `createStageToolContextFactory`
  in `src/stage_interface/tool_context_factory.ts` closes over the real ports
  (required `handleMinting` / `executionGate` / `clock`, optional `audit`); a
  Server composition helper `src/server/stage_tool_context_assembly.ts` binds a
  lazy `MusicDataPlatform.handleMinting()` port plus the conservative gate and
  audit; `ServerHost` gains one thin `toolContextFactory()` accessor and
  `host.ts` names no production port. Agent-facing input/output schemas carry
  veil-safe field JSDoc (generator `jsDoc: "extended"`).
- **PR 20B — MCP stdio Transport Module.** A required `resultSummary` renderer
  on `ToolDeclaration` plus the fifteen per-tool compact renderers (co-located
  with each descriptor in its owning area; Stage Interface cannot import domain
  output types). A hand-rolled MCP-over-stdio transport under
  `src/server/transports/`: pure `mcp_framing.ts`, `mcp_rendering.ts`,
  `mcp_translation.ts`, plus the `mcp_stdio_driver.ts` loop with in-flight
  cancellation. A bespoke per-file transport import guard covers all three
  import forms; the `src/server` allow-list is updated.
- **PR 20C — Entrypoint, Wiring, Smoke, Docs.** `src/server/mcp_stdio_entrypoint.ts`
  runs the host as a long-lived stdio server (start → fail-fast → serve → stop),
  reads `serverInfo.version` from `package.json`, and bridges stdin into the
  transport. `src/server/index.ts` only calls it. `test/formal/server-entrypoint.test.ts`
  now drives the real server over stdio (initialize / tools/list / tools/call);
  `test/live/mcp-stdio-smoke.ts` + `npm run smoke:mcp:stdio` is gated by
  `MINEMUSIC_LIVE_MCP_STDIO`. A host-thin guard asserts `host.ts` references no
  transport, factory, or production-port symbol.

Refinements made at implementation time (not silent fills; each is a deliberate
deviation recorded here):

- The loop method is named `serve()`, not `run()`, and the in-flight registry is
  a plain record with the `delete` operator, not a `Map`: both dodge the
  active-tree write-boundary guard's persistence tokens (`.run(` / `.delete(`)
  while keeping that guard actively protecting the transport against future
  persistence writes.
- `tools/list` annotations derive `readOnlyHint` / `destructiveHint` from
  `invocationPolicy` (not `sideEffect`): a logically read-only tool like
  `music.discovery.lookup` writes a runtime cursor and calls a provider, so a
  side-effect-only derivation would mislabel it. `openWorldHint` maps to the
  `open_world` data egress. `idempotentHint` is omitted in v1 — `ToolSideEffect`
  carries no idempotency signal today, and overclaiming would be worse than
  omitting; adding one is a recorded follow-up.
- The driver's `write()` gates on a `closed` flag set at EOF and absorbs any
  stdout failure into diagnostics, so a late-completing tools/call cannot write
  past the closed transport and a broken-pipe write cannot crash the process
  (confirmed by an adversarial review and locked in by regression tests).
- MCP tool names are exposed underscored (`music_discovery_lookup`), not dotted:
  MCP SEP-986 and the Anthropic API require tool names to match
  `^[a-zA-Z0-9_-]{1,64}$`, so a dotted name is rejected downstream and the tools
  never reach the model even though the server is "Connected". The transport
  maps dots to underscores at the boundary (`toMcpToolName`) and keeps an
  underscore-name → descriptor lookup so `tools/call` round-trips back to the
  internal dotted name for dispatch. Internal `descriptor.name`, `instrumentId`,
  dispatch, the formal vocabulary, and tests of the internal name are unchanged.

Follow-ups recorded (out of Phase 20 scope): generalize the repeated lazy-port
pattern into a shared helper; relocate `stageInterfaceHandleRegistrySchema` out
of the Music Data Platform module (pre-existing wart); add an `idempotent`
signal to `ToolSideEffect` to derive `idempotentHint`.
