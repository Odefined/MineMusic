# Phase A — In-Process Agent-Native Loop (slice 1) Spec

> Status: Planned
> Owner: Agent Runtime (new area: pi adapter, Main Agent loop, Session Context),
> a minimal Workbench Interface (in-process Workspace read-model composition seam
> only), Music Experience extension (queue/playback truth + command), and Server
> Host composition. No Stage Interface schema changes for A1.
> Parent: `docs/formal-rebuild/agent-native-workbench-roadmap.md` (Phase A).
> Authority: planning. Architecture facts live in ADR-0030/0031/0033 and the
> Consensus doc. Contract/field names below marked _(proposed)_ are not yet
> locked.

## Goal

Prove the agent-native loop end-to-end in process, with a single writer:

```text
user message -> Main Agent (pi) -> existing tool via in-process dispatch
            -> minimal Music Experience play/queue command -> observable outcome
```

No Web, no Radio, no concurrency, no Effect proposals. Success = a deterministic
in-process harness drives a user turn and observes the queue/playback truth
change through the owning command.

## Why This Slice Is Shaped This Way

- In-process dispatch is already first-class: `StageInterface.dispatch(ctx,
  input)` is the single tool-invocation authority, and the MCP-stdio driver
  consumes it only as an injected port. The embedded agent calls `dispatch`
  directly; there is no MCP loopback (roadmap P2).
- `StageToolContext` today carries no agent-principal / run-id / Agent Work Basis
  field; those are Phase B/C concurrency additions. A1 reuses
  `createStageToolContext` with a synthetic agent session and adds no context
  fields.
- Music Experience currently contributes only `music.experience.present`.
  Queue/playback truth and its command are greenfield and land in A3.

## Non-Goals (deferred)

- Radio Agent, Main↔Radio coordination, cross-actor cancellation → Phase B.
- Per-area Agent Work Basis / commit-time OCC → Phase B.
- Workbench Interface beyond the in-process read-model composition seam:
  Workspace Protocol/Events, AG-UI Web boundary + Snapshot serialization,
  Workbench Action Adapter, optimistic rollback, transport resync → Phase C. (The
  minimal read-model composition seam itself is in Phase A; see A2.)
- Proposal Unit parking, A2UI cards → Phase C.
- Memory / taste → after C.
- Recommendation batch depth beyond reuse of existing tools.

## Increments

### A1 — pi spine against an existing read-only tool

Goal: embed the Main Agent as a single pi-agent-core loop and complete one
round trip `pi tool call -> dispatch -> music.discovery.lookup -> result back to
pi`, with zero new domain code.

PR A1a has landed the first spine slice: `src/agent_runtime` contains the
MineMusic-owned pi `Agent` factory and Stage-tool bridge; the bridge consumes an
injected `ToolDeclaration[]`, injected `dispatch`, and an injected
Stage-tool-context factory, maps internal dotted tool names to provider-safe pi
tool names, keeps provider and Stage session ids separate, and has no Server
Host, Stage Core, domain, storage, or presentation imports.

PR A1b has landed the guard slice over that spine: the MineMusic pi adapter
rejects pi `beforeToolCall` / `afterToolCall` hooks at the facade boundary, so
tool admission remains owned by `StageInterface.dispatch` and its
`executionGate`, and tool-result text cannot be post-processed around the Stage
veil. The deterministic harness now proves Stage `ask` decisions come from
dispatch, do not call the handler, and still use the synthetic Stage session id
instead of pi's provider-session hint.

- Owner: Agent Runtime (new). Owns the pinned pi-agent-core dependency in
  `package.json`.
- New code: pi engine adapter; a minimal embedded-agent `StageToolContext`
  (synthetic agent `sessionId`/`requestId`, `ownerScope`); wiring that feeds pi
  tool-call requests into `dispatch` and tool results back into the loop.
- Allowed imports: Stage Interface `dispatch` + context factory as ports;
  contracts; and narrow Stage Interface public pure helpers for model-visible
  tool description rendering, tool failure surface classification, and public
  text invariant / provider-safe tool-name rendering. Forbidden: Agent Runtime must not import
  presentation, runtime assembly internals, Tool Call Router internals, or
  area-internal command modules directly (it reaches tools only through
  `dispatch`).
- Design points (resolved concretely in "A1 Deep Dive" below, grounded in the
  pi type definitions): pi embedding choice, the Stage-tool→pi-tool bridge, the
  double-gate resolution, schema-validation duplication, the Result↔throw error
  channel, and the two distinct session ids.
- Guards: forbidden-import test for Agent Runtime; a test asserting the
  in-process path goes through `dispatch` (not a private tool call).
- Verification: harness test — pi loop issues a `lookup` call, receives veiled
  result, terminates.

### A2 — minimal in-process read-model seam + Session Context over it

Goal: establish the in-process Workspace read-model composition seam that
ADR-0031 requires Session Context to be defined over, wired with one area slice
in slice 1, and assemble the Main Agent's Session Context from it — never from an
AG-UI wire format.

- Read-model seam: introduce a minimal **Workbench Interface** whose sole Phase-A
  responsibility is composing the in-process Workspace read model from
  owning-area public projections. In slice 1 it composes exactly one slice — the
  A3 queue/now-playing projection. It does **not** include Workspace
  Protocol/Events, AG-UI serialization, or the Workbench Action Adapter — those
  are Phase C. This is the seam Phase C grows (more areas + protocol +
  serialization), so Session Context never needs re-pointing.
- Session Context: Agent Runtime-owned (per Consensus; not a formal top-level
  area). Assembled over the read-model seam, never over a wire format
  (ADR-0031). Minimal field set for a single-writer turn: current queue +
  now-playing, carrying the queue per-area revision (the Agent Work Basis field
  is present for contract stability; staleness enforcement is Phase B). Deferred
  as empty/static in slice 1: task/posture, listening mode, session-local
  constraints, recent choices/exclusions, workspace focus. Active instruments are
  not duplicated here (the agent's tools are already supplied to pi via the A1
  bridge).
- Allowed imports: the read-model seam reads area-owned public projections
  (Music Experience); Session Context reads the seam. Forbidden: Session Context
  or the seam importing durable area internals; defining either over any wire
  format.
- Guards: forbidden-import test for the minimal Workbench Interface (no
  presentation/serialization/transport); a test asserting Session Context is
  built from the in-process read-model seam only (no AG-UI/serialized input type
  reachable); exact read-port key-set assertion for the composed slice.
- Verification: harness asserts the agent's Session Context reflects a queue
  change made by A3's command, observed through the seam.

### A3 — minimal Music Experience queue/playback truth + owning command

Goal: stand up the smallest real queue/playback truth behind an owning command,
satisfying the write-boundary hard rule (no direct writes outside the command).

- Owner: Music Experience (extends the existing `music_experience` area /
  RuntimeModule).
- New code _(landed in A3)_: Postgres-backed queue/playback truth store; owning
  commands for the two slice-1 concerns — queue mutation and
  logical playback selection (e.g. `append` / `playNow`) — that own the write
  boundary without collapsing the concerns into one mixed command
  (commit-time CAS serialization is Phase B — see A3 deep dive);
  a public projection exposing current queue + now-playing; agent-facing
  tool registrations (e.g. `music.experience.queue.append`,
  `music.experience.playback.play`) contributed through
  `createMusicExperienceRuntimeModule`.
- Write boundary: all mutation goes through the owning command. Orchestration,
  Stage handlers, and the agent must not construct the repository or call write
  methods directly.
- Effect Boundary: the new write tools pass through the execution gate as
  runtime-state writes with `defaultDecision: "auto"` for the in-process
  single-writer slice, consistent with the A3 deep-dive decision. Revisited
  under Effect proposals in C.
- Guards: writer-capability guard (only the command writes queue/playback);
  exact-port assertion for the projection; output-leak test on the agent-facing
  tools (compact, no raw storage shape).
- Verification: command-level test (append/playNow mutate truth + bump
  projection); tool-level test through `dispatch`.

### A4 — wire the agent to the play/queue outcome

Goal: close the loop — a user turn drives the Main Agent to find music (existing
`lookup` / candidate-commit / `present`) and enact it via the A3 command.

- Owner: Agent Runtime (loop behavior), reaching Music Experience tools through
  `dispatch`.
- New code: agent turn wiring that takes a user message, runs the pi loop with
  Session Context, and lets it call the find + append/play tools.
- Verification: end-to-end harness — given a user message ("play something
  upbeat"), the loop reaches a `lookup`/present then an append/playNow, and the
  queue/playback projection reflects the result. This is the Phase A exit
  criterion.

## A1 Deep Dive: pi Embedding Surface

The engine choice (pi behind the deliberately leaky Agent Runtime port) is
recorded in **ADR-0039**, backed by the first-hand audit
`pi-agent-core-capability-audit-0.80.2.md`. The resolutions below follow from
that audit (a single stateful `Agent` loop with a tool-execution step and
`before/afterToolCall` hooks). The exact version pin is a PR-A1a task; re-run the
audit on any bump (version churn is the dominant risk per ADR-0039). The package
name is scoped (`@earendil-works/pi-agent-core`).

- **Embedding choice: low-level `Agent` as the engine; full `AgentHarness` not
  adopted as runtime owner.** pi ships a low-level `Agent` (owns transcript,
  emits lifecycle events, executes tools, exposes `steer`/`followUp`/`abort`) and
  a separate `AgentHarness` that imports `runAgentLoop` directly — an
  *alternative* stateful layer over the same stateless loop, not a wrapper over
  `Agent`, shaped around an `ExecutionEnv` (filesystem + shell). MineMusic uses
  the low-level `Agent` as the Main/Radio engine and does **not** adopt
  `AgentHarness` as its runtime owner (the `ExecutionEnv` + harness-owned
  session/skill/compaction runtime does not fit a music agent). This is *not* a
  rejection of pi's harness capabilities — those are reused root-export-helper-first
  (next bullet); it is a rejection of letting the unmodified `AgentHarness` own
  MineMusic's runtime.

- **Harness utility reuse — root-export-helper-first, no full `AgentHarness`
  ownership.** A1a should audit and use pi's root-exported harness helpers from
  `@earendil-works/pi-agent-core` for prompt template formatting, session
  repositories, and compaction helpers. Do not interpret "reuse" as vendoring pi
  harness directories into MineMusic: A1a should not copy a pi helper tree or
  maintain locally modified pi source. MineMusic still owns Session Context assembly,
  transcript persistence policy, compaction policy, actor lifecycle, Stage tool
  dispatch, and Main↔Radio coordination. This avoids building a parallel
  prompt/session/compaction vocabulary while keeping the runtime harness
  MineMusic-shaped rather than letting unmodified `AgentHarness` own the
  runtime. Main/Radio runtime modules consume MineMusic-owned interfaces exposed
  by the Agent Runtime facade. That facade may read pi source while being
  written and may mirror small algorithms or sub-code shapes when needed, but
  the expected live dependency is the pinned public helper export. The
  MineMusic-facing surface is split into narrow non-skill ports such as
  `PromptTemplatePort`, `AgentTranscriptSessionPort`, and `AgentCompactionPort`
  — not a single broad `PiHarnessUtilityPort`. A1a should include a
  forbidden-import guard so raw pi helper imports stay inside the Agent Runtime
  adapter/facade layer and adapter-focused tests. Main, Radio, Session Context
  assembly, tool bridge, and ordinary runtime modules must consume the
  MineMusic facade ports rather than importing pi harness helpers directly.

  If one of the four areas cannot use a public root-exported helper directly and must
  mirror a non-exported algorithm or copy meaningful sub-code, the implementation
  note must record the pinned pi version, source file, why the public helper was
  insufficient, and whether the MineMusic layer is boundary narrowing, product
  policy, or a pi capability gap. That is an exception path, not the A1a default.

- **Pi-first adaptation rule.** A1a must not build a clean-room MineMusic harness
  for capabilities pi already provides. Each Agent Runtime facade port should
  map to the pinned pi primitive, public export, or observed source behavior it
  uses
  (prompt-template helpers, session repositories, compaction helpers, etc.).
  MineMusic-owned code may narrow or constrain pi behavior for product/runtime
  boundaries through wrapper/adaptor code, but copied or locally modified pi
  source is not the default integration mechanism.

- **Skill support is reserved, not implemented in Phase A.** A1a should leave
  enough Agent Runtime facade space for future pi-style skill support, but it
  does not add `SkillCatalogPort`, a MineMusic skill root, skill selection,
  skill catalog injection, or full `SKILL.md` body injection. If a later phase
  needs skills, the capability should enter through Agent Runtime-owned ports
  that preserve pi's skill semantics rather than a new MineMusic prompt-module
  system. Main/Radio and ordinary runtime modules should not load or inject
  skill files directly.

- **Tool bridge: Stage tool → pi tool.** pi tools live in `agent.state.tools`;
  pi validates arguments against each tool's schema, then calls its
  `execute(toolCallId, params, signal)` returning a tool result. A1 wraps each
  Stage tool as a pi tool whose `execute` calls `StageInterface.dispatch(ctx,
  { toolName, payload: params })` and maps the `ToolCallOutput` to pi's tool
  result. pi's per-call `signal` is wired into `StageToolContext.abortSignal` so
  dispatch honors cancellation (the plumbing Phase B's cross-actor cancel builds
  on). The pi-facing tool name is provider-safe (`.` and any other non
  `[a-zA-Z0-9_-]` character mapped to `_`); dispatch still receives the internal
  dotted Stage tool name.

- **Tool catalog source — same port as MCP, not pulled from StageInterface.**
  `StageInterface` exposes only `dispatch`; the tool *catalog* (the
  `ToolDeclaration[]` the agent sees) is a separate port the host injects at
  assembly, sourced from `host.snapshot().interfaceContract.tools` — exactly the
  port the MCP stdio transport already consumes (`McpStdioTransportPorts.tools`).
  A1's bridge takes this same injected array, so Agent Runtime imports neither
  host assembly internals nor a "list tools" method on StageInterface. Phase A
  bridges the catalog **in full** (no slice filter), matching the MCP transport:
  the slice-1 boundary is enforced by the system-prompt steer (A4), not by the
  tool layer. A call to a non-slice tool that hits a non-`auto` executionGate
  flows through the error channel below (thrown agent-facing error); a call to
  an `auto`-pass tool runs. This keeps A1 zero-special-case relative to MCP.

- **Double-gate resolution (the core A1 concern).** Two admission points exist:
  pi's `beforeToolCall` hook (can block a call) plus pi arg-validation, and the
  Stage `executionGate` (Effect Boundary `allow|ask|deny`) plus Stage validation
  inside `dispatch`. Resolution: **the Stage `executionGate` is the single
  domain-admission authority.** pi's `beforeToolCall` makes no music-domain
  allow/deny decision (left unset, or used only for pi-runtime concerns such as
  abort honoring). This follows the single-failure-channel rule and avoids two
  competing gates. Confirm read-only `music.discovery.lookup` resolves to
  `allow`.

- **Schema validation — no in-path duplication.** The model must see the real
  Stage tool schema to call correctly, so the pi tool's parameter schema is
  derived from the single Stage descriptor schema (one schema source). pi
  validates at the LLM edge and Stage validates at the dispatch boundary — two
  transport edges (pi-facing and the dispatch shared with MCP), not a redundant
  third check. The bridge adds no extra MineMusic-side arg validation. Stage
  keeps its own validation because dispatch is shared with the non-pi MCP
  transport. _Open: the JSON-Schema (Stage) → pi-schema conversion mechanics._

- **Error channel: the bridge is the owned translation boundary.** pi's tool
  `execute` contract is "throw on failure" (pi renders the throw as an error
  tool result; its plain tool result carries no error flag). MineMusic's
  `dispatch` returns `Result<ToolCallOutput>` (declared expected failures as
  `Result`). The bridge translates: `Result.ok` → pi tool result; a declared
  `Result.err` (expected agent-facing failure, e.g. denied/not-found) → `throw`
  so pi shows an error tool result; a dispatch `throw` (system failure)
  propagates. This is the sanctioned "Tool Call Router / Stage handler may
  normalize declared `Result` failures into agent-facing errors at its owned
  boundary." In slice 1 an `executionGate` `ask` should not arise (read-only
  `lookup` → `allow`; A3 write tools → auto-pass); if it does, the bridge maps
  `ask`/`deny` to a thrown agent-facing error (no human-confirm path before C).

- **Two distinct session ids — do not conflate.** pi's `Agent.sessionId` is a
  provider cache hint forwarded to the model backend. MineMusic's
  `StageToolContext.sessionId` is the workspace/agent session for
  handle/cursor/owner-scope isolation. A1 keeps them separate; the embedded
  context's `sessionId` is MineMusic's, never pi's provider hint.

- **LLM wiring.** pi delegates the model call to a stream function plus an
  API-key resolver. Phase-A authority locks only the **openai-compatible
  stream-function seam**: a `Model` descriptor behind pi's built-in
  `openai-completions` path, plus runtime-provided `baseUrl`/key resolution.
  Audit E3 confirms **DeepSeek is mechanically valid as an A1a implementation
  candidate** (`compat.thinkingFormat: 'deepseek'`, no new adapter), but
  Phase A does **not** canonize DeepSeek as the roadmap/spec default model.
  The model stays swappable behind the stream function; a switch is a
  descriptor/wiring change, not a boundary change. Pick the first concrete
  implementation candidate and exact model id at A1a implementation time; if
  tool-call/JSON-schema adherence is poor, swap candidates without reopening
  Phase-A architecture.

- **Confirmed not in A1's path.** pi's model is a single `Agent` loop with
  `steer`/`followUp`/`abort`/hooks and no subagent/fork/dispatch primitive.
  ADR-0032 peer-actor coordination and cross-actor cancellation are
  MineMusic-built in Phase B; A1's single Main Agent uses pi natively and needs
  none of it.

## A2 Deep Dive: Read-Model Composition Seam + Session Context

Grounded in ADR-0031 (Session Context defined over the in-process read model,
never a wire format) and the Consensus four-layer boundary (owning areas →
public projections → Workspace Protocol/Snapshot → Agent Runtime context
assembly → Session Context). Phase A builds the first in-process layers of that
chain, both deliberately thin.

- **Two artifacts, two owners — even in slice 1.** The "read-model seam" is two
  ownership-distinct artifacts, not one: (1) a minimal **Workspace read-model
  composition** owned by Workbench Interface — composes owning-area projections
  into an in-process read model (slice 1: only the A3 queue/now-playing
  projection); (2) a minimal **Session Context** owned by Agent Runtime — the
  agent-facing reading surface assembled over that read model. Phase A builds
  both now despite a single area slice, to pin ownership and the import
  direction (Agent Runtime → Workbench Interface seam → area projections)
  before Phase C grows them. Same contract-stability philosophy as the queue
  revision column (present now, enforced in B).

- **Slice-1 Session Context is a pass-through; assembly is identity.** With one
  area slice Session Context has nothing to select/compress/phrase (the
  Consensus-defined essence of assembly). Its shape equals the composed read
  model's for slice 1; assembly is a no-op, deferred to B/C. The artifact exists
  in A to own the boundary, not to transform.

- **Snapshot, not live.** Session Context is captured once at turn start as an
  immutable snapshot; it does not reflect mid-turn mutations. An agent that
  appends reads the effect from the tool's compact return value (`queue.append`
  returns queue length/position), not from Session Context. Mid-turn live
  updates are a Phase B concern (concurrent writers racing the queue);
  single-writer Phase A has no consumer for them.

- **Session Context reaches the agent via the system prompt.** pi's low-level
  `Agent` exposes no structured workspace-context field (audit-confirmed: it
  takes system prompt / tools / stream / persistence), so Session Context is
  serialized into the turn's system prompt text — the agent observes current
  queue/now-playing with no extra tool round-trip. (Content must be
  text-serializable — trivially true for slice 1; revisited if a later slice
  pressures prompt size.)

- **What this commits Phase C to.** Phase C grows the composition artifact (more
  slices → Workspace Snapshot + Protocol/Events + AG-UI serialization) and may
  begin real assembly. Because the two artifacts and the snapshot-via-prompt
  contract are already split in A, Phase C adds slices to the composition side
  without re-pointing Session Context or rewiring the agent — the
  no-re-pointing property ADR-0031 requires.

- **Guards sharpened by the above.** forbidden-import for the Workbench
  Interface composition (no presentation/serialization/transport — those are C);
  forbidden-import that Session Context (Agent Runtime) imports the seam only,
  not area internals; a test that Session Context is built from the in-process
  seam only (no AG-UI/serialized type reachable); and a test that the agent's
  system prompt at turn start reflects a queue change made through A3's command,
  observed through the seam — i.e. the read→compose→assemble→inject chain is
  live, not paper.

## A3 Deep Dive: Queue/Playback Truth + Owning Command

Grounded in the existing storage and command patterns: owning commands take a
`MusicDatabase` and write through `database.transaction(...)`; areas add tables
via a `MusicDatabaseSchemaContribution { id, apply(ctx) }`; repositories run SQL
through `MusicDatabaseContext { run, all, get }`. Storage is Postgres-backed
since Phase 21.

- **Command boundary.** Queue/playback mutations go through an owning
  `MusicExperienceQueueCommand` with the slice-1 command set **{`append`,
  `playNow`}**, where `append` takes an items list (slice 1 passes batch-of-1;
  Phase B PB6 widens to batch-of-N) — `removeFromQueue` is deferred: no slice-1 exit criterion needs
  removal, and it returns when Radio re-sequence (Phase B) or a Workbench action
  (Phase C) needs it. It does **not** use Music Data Platform's
  `runSourceOfTruthWrite` facade — that facade is for source-of-truth writes that
  trigger material/catalog projection invalidation. Queue/playback is Music
  Experience runtime state on a separate write path. This keeps the two areas'
  write boundaries distinct.

  A `database.transaction` makes each command *atomic*; it does **not** by itself
  *serialize* concurrent commands (two concurrent transactions can each read
  revision N and each write N+1). Serialization of contended writers is the
  commit-time concern, handled in Phase B by a compare-and-swap on the per-concern
  revision (`UPDATE ... SET <concern>_revision = <concern>_revision + 1 WHERE
  <concern>_revision = :basis`; zero rows ⇒ `voided_stale`; see PB3). A3 has a
  single writer, so the CAS is latent — but the command is shaped for it now (the
  revision column lands in A3, below), so Phase B adds the predicate without a
  rewrite. A3 does not claim "the transaction serializes writers."

  **Phase B carry-forward:** do not treat the Postgres adapter's
  `transactionActive` process-local guard as a queue/playback concurrency
  mechanism. PB3/PB6 must add the per-concern CAS predicate and an explicit
  position-generation strategy for contended appends.

- **Truth store + write boundary.** A new schema contribution adds **two
  tables**, not one mixed row-store and not a larger family of micro-tables:
  one single-row-per-owner/workspace `music_experience_state` table for logical
  playback + concern revisions, and one ordered `music_experience_queue_items`
  table for queue membership rows. This matches the repo's existing
  state-and-items table habit and keeps the slice-1 shape minimal while still
  separating list membership from single-row state. A narrow repository over
  `MusicDatabaseContext` is the only place that issues queue/playback writes,
  called solely from the owning command. The agent, Stage handlers, and Session
  Context never construct the repository or write directly (write-boundary hard
  rule).

  The minimum intended row split is:

  - `music_experience_state`: owner/workspace key, `queue_revision`,
    `playback_revision`, logical `now_playing_material_ref_key`,
    logical `playback_status`, timestamps.
  - `music_experience_queue_items`: owner/workspace key, ordered `position`,
    durable `material_ref_key`, `material_ref_json`, `provenance`, timestamps.

  Slice 1 stores `playback_revision` and may return it from
  `music.experience.playback.play`, but the Workbench read-model seam exposes
  only the slice's single `revision` until PB3/PB6 define the per-concern
  revision exposure contract. Do not infer that playback has no concern
  revision; it is intentionally latent at the read seam in A3.

  Phase A does **not** need a third dedicated playback-history/device-output
  table. Those belong to later phases once playback leaves the logical layer.

- **Storage backing — decided: reuse Postgres.** Use the existing
  `MusicDatabase` (Postgres), not an in-memory store. Reasons: the storage layer
  is already the project norm; runtime state that must survive transport should
  not live in memory (it will need to survive reconnect in Phase C); queue needs
  a per-area revision (Phase B) and reconnect survival (Phase C) that a persisted
  table makes natural; it avoids a known-future rewrite. In-memory's only gain is
  slice-1 simplicity, outweighed because Postgres is already wired. The truth
  stays behind the repository port either way, so the eventual durability policy
  (Consensus "state durability policy" follow-up) can be revisited without
  touching the command or agent path.

  **"Durable" is used in two senses — no contradiction with ADR-0036.** ADR-0036
  says the queue is "not durably persisted" in the **source-of-truth** sense: the
  queue is *contended runtime state*, not an authoritative fact source to be
  reconstructed from, and that argument ("split by contention, not durability") is
  about why it still needs command/OCC authority. Storing it in Postgres here is
  durability in the **process/transport-survival** sense: it survives a reconnect
  (Phase C) and carries a revision column without a later rewrite. A field can be
  "not a durable source of truth" (ADR-0036) yet "persisted so it survives
  transport" (here) at once. The open Consensus "state durability policy" is about
  *retention/lifecycle* (how long, when cleared), which the repository port leaves
  revisable — it is not in tension with choosing Postgres as the backing store.

- **Per-area revision now, enforcement later.** The queue/playback truth carries
  a per-area revision that bumps on each mutation (ADR-0033: concurrently
  mutated read-model fields must carry per-area revisions readable as an Agent
  Work Basis). A3 adds the revision column; commit-time staleness *enforcement*
  is Phase B. Adding it now avoids a later migration.

- **Queue keys on material ref.** A queue item is stored keyed by a durable
  material ref with a provenance tag, not by a transient handle. In slice 1
  `queue.append` accepts a list of candidate-or-`material` `MusicItemHandle`s
  (ADR-0040; resolved to material via the shared `ResolveDurableMusicItem`
  capability) and resolves each
  to its material ref (slice 1 passes batch-of-1); Phase B (PB4) adds
  radio/transient provenance and the candidate→material
  append path. This avoids a later queue-key migration. See
  `phase-B-radio-concurrency-spec.md` PB4.
- **Playback truth is logical, not audio.** Slice-1 playback truth is a logical
  now-playing pointer + status (e.g. playing/paused), not real audio output.
  Browser/device audio authority is the separate Phase C "browser playback
  authority" follow-up. The future `PlaybackSourceResolver` lives there: it
  resolves a Music Experience logical now-playing `materialRef` through current
  survivor resolution and playback policy into a short-lived playback source for
  the Web/player controller. A3/A4 must not pretend that setting
  `playback.play` has resolved playable links, opened a local file/provider URL,
  selected a device, or started audible playback. The harness observes the
  pointer/status change.
  Material Projection remains a display/read-model projection: it may use
  `local_file` sources for descriptive metadata, but it must not become the
  owner of playback source resolution or leak local path/root locators/playable
  URLs into agent-facing display output.
  **This does not eliminate the playback concern.** Phase A keeps
  `music.experience.playback.play` as a separate command/tool even though it only
  updates logical playback truth. `queue.append` means "place this item in the
  queue"; `playback.play` means "make this the current logical now-playing
  selection." Keeping them separate preserves Music Experience concern
  boundaries now and avoids a later split when Web/player authority lands.
  `playback.play` does **not** require its target to be a queue member —
  now-playing is an independent concern from queue membership, so the two
  commands stay decoupled even though the slice-1 agent flow happens to call
  `queue.append` before `play`.

- **Projection.** A public queue/now-playing read port exposes current queue +
  now-playing for Session Context (A2). It is a direct read of queue/playback
  truth, not routed through the material projection-maintenance machinery.

- **Agent-facing tools.** `music.experience.queue.append` and
  `music.experience.playback.play` _(proposed)_ register under the existing
  `music.experience` instrument through `createMusicExperienceRuntimeModule`.
  They are intentionally distinct tools, not one "queue-and-play" surface.
  Output is compact (opaque item ids, queue length/position) — no raw row shape
  (agent-facing-output rule).

- **Effect gate posture — decided: auto-pass.** The new queue/playback write
  tools pass the Stage `executionGate`. In ADR-0038's later framing these are the
  `local-bounded × user-intent-backed` cell (Phase A's single writer is the user
  via Main), which auto-passes — i.e. they are not a new independent qualifier but
  an instance of the impact-class × trust model. For Phase A, landing them as an
  ADR-0021/0022-style widening is acceptable; it need not wait on ADR-0038, but it
  should be recorded as the same `local-bounded` band rather than yet another
  one-off boolean. Slice-1 single-writer, low-impact, no external effect.
  Revisited under Effect proposals in Phase C.

- **Descriptor declaration shape — decided.** Until issue #115 lands, the
  queue/playback tool descriptors should declare
  `sideEffect: { durableUserStateWrite: false, runtimeStateWrite: true, externalCall: false }`
  with `invocationPolicy.defaultDecision: "auto"`. When the ADR-0038 contract
  migration lands, these same tools should additionally declare
  `sideEffect.ownerCurationWrite: false` and
  `invocationPolicy.impactClass: "local-bounded"`. They are runtime-state
  writes, not library-curation writes and not external/irreversible effects.

## A4 Deep Dive: Agent Turn Wiring + Tool Composition

Grounded in the existing `music.experience.present` tool: it takes a
`MusicItemHandle` (candidate or material), resolves the public handle via
`ctx.handleMinting.resolve`, durable-materializes a candidate (ADR-0040:
`present` writes a durable material identity, not a saved/library relation), and
returns a **`material` handle** plus a `MusicCard`. Its descriptor explicitly
punts
playback ("play this now" → avoid; "external playback is a future Effect
Boundary-routed workflow") — exactly the gap A3/A4 fill.

- **Tool-composition seam.** The slice-1 agent flow is `music.discovery.lookup`
  → `music.experience.present` (durable-materializes the candidate and yields a
  `material` handle) → `music.experience.queue.append([material handle])` →
  `music.experience.playback.play`. `queue.append` accepts a
  **candidate-or-`material`** `MusicItemHandle` list (slice 1: batch-of-1;
  ADR-0040) and resolves each via the shared `ResolveDurableMusicItem`
  capability (candidate → idempotent `commitCandidate` → `material` ref —
  extracted from `present` now that `queue.append` is its second caller in
  Phase A, ADR-0040/issue #113), the same veil pattern `present` uses — so the
  Public Handle Veil is preserved across the seam (no internal anchor crosses to
  the agent).
  The two downstream tools are not redundant: `queue.append` mutates queue truth,
  while `playback.play` mutates logical now-playing truth. Slice 1 may call both
  in sequence for a "play this" user turn, but the contract boundary remains two
  owned concerns, not one fused action.
- **Candidate→material is a shared capability, not duplicated.** Both `present`
  and `queue.append` resolve candidate-or-`material` handles to a durable
  material ref through the same `ResolveDurableMusicItem` capability (candidate
  → idempotent `commitCandidate` → material; extracted in Phase A once
  `queue.append` is its second caller — ADR-0040/issue #113). `present` uses it
  to materialize *and* yield a `MusicCard`; `queue.append` uses it for silent
  entry. Slice 1's Main Agent reaches the queue through `present` (it wants the
  card); the silent candidate-entry path is exercised and tested in Phase A,
  and is what Phase B Radio's refill uses.
  Any future write path that persists material-scoped Music Experience state
  must keep routing material handles through Material Projection /
  `ResolveDurableMusicItem` before writing. The handle registry anchor is only a
  private veil anchor, not current domain truth; this is the ADR-0019 survivor
  discipline carried into queue/playback and later playback/radio writes.
- **Turn driving (harness).** A user turn is `agent.prompt(userMessage)` then
  `agent.waitForIdle()`; the harness then reads the queue/now-playing projection
  **through the A2 read-model seam** and asserts the outcome. The agent's tools
  are the A1-bridged Stage tools (`lookup`, `present`, `queue.append`,
  `playback.play`). A4 must capture the Session Context once at the start of
  each user turn and inject that snapshot into the agent prompt for that turn;
  do not reuse a single adapter/system-prompt instance across turns without a
  refresh path.
- **Speech Level deferred.** The agent produces a normal harness-visible text
  response; Speech Level (Silent/Notify/Speak) as an Agent-Runtime policy is not
  enforced in slice 1 (no UI to be silent toward; the harness reads the
  response).
- **System prompt.** A minimal music-agent system prompt naming the available
  instruments and the play/queue intent. Content, not a boundary — refined in
  implementation.

## pi Capability Ledger (audited against 0.80.2)

A dependency map: every pi-agent-core behavior the Phase A/B design leans on, and
which decision it backs. **Audited 2026 against `@earendil-works/pi-agent-core@0.80.2`
by reading first-party `.d.ts`/source + fresh runtime checks** (see
`pi-agent-core-capability-audit-0.80.2.md`). Status reflects that audit, not an
open question. **Re-run the audit on any version bump** — pi shipped 26 versions
in about 7 weeks (0.74→0.80) and has done one Node-compat split, so **pin the version
exactly**; version drift is the real risk, not capability gaps.

| pi behavior | Status @0.80.2 | Decision it backs |
| --- | --- | --- |
| Low-level `Agent` separate from harness (own prompt/tools/stream) | ✅ — three layers: `runAgentLoop` (stateless) < `Agent` (in-memory stateful) < `AgentHarness` (session/compaction/skills); the harness `import`s `runAgentLoop` directly and does **not** flow through `Agent` (so harness is an alternative, not an upgrade path from `Agent`) | A1 embedding choice (use low-level `Agent`) — correct |
| `new Agent({})` works; empty default system prompt; no baked coding/skill content | ✅ | A1 embedding choice (low-level `Agent` as engine; `AgentHarness` not runtime owner) |
| Tools `execute(toolCallId, params, signal?, onUpdate?)`; params schema is TypeBox = JSON Schema, passed to provider verbatim | ✅ (raw JSON Schema usable directly) | A1 bridge; **resolves the JSON-Schema→pi-schema open question — near-zero conversion** |
| Per-tool-call `AbortSignal` provided; `abort()` flips it into in-flight tools | ✅ — but **cooperative**: pi forwards the signal, does not hard-kill; the tool/dispatch must honor it | A1 `abortSignal` wiring; **PB9** (see correction below) |
| `prompt`/`continue`/`abort` + `waitForIdle()` loop control | ✅ | PB1/PB2 discrete runs; A4 turn driving; harness `waitForIdle` |
| `before/afterToolCall` hooks are async and awaited; can pause the loop on an external promise | ✅ (experiment) — but **a paused hook does not auto-honor `abort()`; the hook must `Promise.race` the signal itself** | A1 double-gate; **I2 integration-layer loop pause**; PB9 |
| Persistence / compaction / endurance | ◑ **only in the harness; low-level `Agent` has none** (`reset()` clears memory; `sessionId` is just a provider cache hint) | **D-row correction below**: MineMusic builds continuity itself (ADR-0037), it is *not* inherited from pi at our chosen layer |
| Transcript externally readable/truncatable (`agent.state.messages` is a public writable accessor) | ✅ (experiment: `slice()` truncates, no harness/LLM) | **PB8a injected-compaction test — gate PASSES, no fall-back to after-B.** Use the direct-assignment / `transformContext` path for the deterministic LLM-free test; the full `compact()` API needs an LLM + `SessionTreeEntry[]`, so it is **not** the path for a deterministic test. Compaction is manual-only (no token-threshold auto-trigger). |
| Injectable stream fn + per-call API-key resolver; provider registry keyed by protocol (`Api`), not brand; built-in `openai-completions` compat covers DeepSeek | ✅ | A1 model wiring; **resolves the openai-compatible adapter mechanics question — DeepSeek is a valid first candidate with no new adapter** |
| Single `Agent` loop; no subagent/fork/dispatch/parent-child primitive | ✅ (exhaustively shown; re-verified at 0.80.2) | Confirms Main↔Radio coordination is MineMusic-built (ADR-0032/PB) |

### Corrections forced by the audit

- **Persistence is NOT native at our layer (the one decision change).** The
  earlier ledger row "transcript persists and is reloadable across runs
  (compaction is native)" is **false** for the low-level `Agent` MineMusic uses:
  it is volatile (compaction + persistence live only in the harness). PB2's
  "transcript persists (compacted) and is reloaded" is therefore **not a pi
  behavior at our layer** — MineMusic must own cross-run persistence policy
  itself, over `state.messages` and/or an Agent-Runtime-owned adapter over pi's
  public `SessionRepo` utilities. This does
  **not** weaken ADR-0037: continuity was already designed as a MineMusic-owned
  floor that does *not* depend on pi compaction — the audit confirms that was the
  right call, and removes the illusion that pi hands us persistence for free. See
  PB2 note.
- **Abort is cooperative (PB9 implementation requirement).** PB9's "abort touches
  only pi run lifecycle" holds *only if the tool/dispatch honors the forwarded
  signal*. dispatch must propagate and check `abortSignal`; pi will not hard-kill
  a tool. Record as a PB9 implementation requirement.
- **A paused hook must race the abort signal (PB9 / I2 requirement).** A
  `beforeToolCall` hook that awaits an external gate does **not** auto-cancel on
  `abort()`; it must `Promise.race(externalGate, abortSignal)`. Otherwise an
  abort during a gate-pause is ineffective — directly affects the PB9 cascade and
  the I2 integration-layer test.
- **PB8a upgraded.** From "prerequisite-gated, may fall back to after-B" to **gate
  passed**: `state.messages` truncation gives the deterministic
  transcript-erosion injection PB8a needs, LLM-free.

## PR Split

- PR A1a: **implemented** — pi dependency + exact version pin, engine adapter
  skeleton, Stage tool bridge, provider-safe pi tool names, distinct provider
  and Stage session ids, dispatch-only tool path, signal forwarding, and
  deterministic pi-loop success/error harness.
- PR A1b: **implemented** — pi tool-call hooks rejected at the Agent Runtime
  facade, Stage `executionGate` verified as the single domain-admission path,
  tool-result veil cannot be bypassed by pi `afterToolCall`, and synthetic
  Stage-tool session ids remain separate from pi provider-session ids.
- PR A2: **implemented** — minimal Workbench Interface in-process read-model
  seam over an injected Music Experience projection port, Agent Runtime Session
  Context capture/identity assembly over that seam, system-prompt rendering, and
  guards proving no AG-UI/web/transport or area-internal imports. A3 supplies
  the real queue/playback truth behind the projection port.
- PR A3a: queue/playback truth + owning command + projection (command tests).
- PR A3b: agent-facing queue/play tool registrations + gate posture + guards.
- PR A4: agent turn wiring + end-to-end harness.

## Exit Criteria

- A deterministic in-process harness drives a full user turn to a queue/playback
  change through the owning command.
- Guards in place: Agent Runtime forbidden-imports, dispatch-only tool access,
  Session-Context-over-read-model, queue write-capability, tool output leak.
- No Web, Radio, concurrency, proposal, Memory, or skill-runtime code
  introduced.

## Open Questions Carried Into Implementation

- pi version pin: the engine is audited and pinned at 0.80.2 (ADR-0039 +
  `pi-agent-core-capability-audit-0.80.2.md`); PR-A1a re-runs the audit on any
  bump — landing the audit's runtime experiments
  (abort/signal forwarding with dispatch honoring it, a paused hook racing the
  abort signal, tool-error → throw → pi `isError` result) as an automated
  conformance test so a bump is blocked by CI, not only by a manual re-read of
  the audit doc. The embedding surface is resolved in "A1 Deep Dive" and the pi
  Capability Ledger.
- Stage JSON-Schema → pi tool-schema: **resolved by audit (B2)** — raw JSON Schema
  satisfies pi's `TSchema` and is read verbatim by providers, so it maps to
  `Tool.parameters` with a field rename, near-zero conversion. (Optional TypeBox
  rebuild only if a future provider needs the `Symbol` decorations.)
- Exact column names, indexes, status enum values, and queue/now-playing
  read-port key set for the decided two-table A3 shape. The structure is
  settled: `music_experience_state` + `music_experience_queue_items`, with the
  per-concern revision columns defined against a single shared
  `ConcernRevision` shape — see roadmap cross-cutting.
- First concrete A1a model/provider candidate and exact model id. Audit E3
  confirms DeepSeek is mechanically viable through the built-in
  `openai-completions` adapter, but Phase A does not bless any provider/model as
  spec-default; choose the first candidate at implementation time and replace it
  if tool-call/JSON-schema adherence proves weak.
