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

- Owner: Agent Runtime (new). Introduces pi-agent-core as a dependency (not yet
  in `package.json`).
- New code: pi engine adapter; a minimal embedded-agent `StageToolContext`
  (synthetic agent `sessionId`/`requestId`, `ownerScope`); wiring that feeds pi
  tool-call requests into `dispatch` and tool results back into the loop.
- Allowed imports: Stage Interface `dispatch` + context factory as ports;
  contracts. Forbidden: Agent Runtime must not import presentation, runtime
  assembly internals, or area-internal command modules directly (it reaches
  tools only through `dispatch`).
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
- New code _(proposed names)_: queue/playback truth store (in-memory or minimal
  SQLite); an owning command (e.g. `enqueue` / `playNow`) that serializes writes;
  a public projection exposing current queue + now-playing; agent-facing
  tool registrations (e.g. `music.experience.queue.add`,
  `music.experience.playback.play`) contributed through
  `createMusicExperienceRuntimeModule`.
- Write boundary: all mutation goes through the owning command. Orchestration,
  Stage handlers, and the agent must not construct the repository or call write
  methods directly.
- Effect Boundary: the new write tools pass through the execution gate. A1's
  read-only allowance widens here to a slice-1 write posture (auto-pass for the
  in-process single-writer slice, consistent with the existing auto-pass
  widenings; revisited under Effect proposals in C). _Open: confirm gate
  decision for these tools._
- Guards: writer-capability guard (only the command writes queue/playback);
  exact-port assertion for the projection; output-leak test on the agent-facing
  tools (compact, no raw storage shape).
- Verification: command-level test (enqueue/playNow mutate truth + bump
  projection); tool-level test through `dispatch`.

### A4 — wire the agent to the play/queue outcome

Goal: close the loop — a user turn drives the Main Agent to find music (existing
`lookup` / candidate-commit / `present`) and enact it via the A3 command.

- Owner: Agent Runtime (loop behavior), reaching Music Experience tools through
  `dispatch`.
- New code: agent turn wiring that takes a user message, runs the pi loop with
  Session Context, and lets it call the find + enqueue/play tools.
- Verification: end-to-end harness — given a user message ("play something
  upbeat"), the loop reaches a `lookup`/present then an enqueue/playNow, and the
  queue/playback projection reflects the result. This is the Phase A exit
  criterion.

## A1 Deep Dive: pi Embedding Surface

The engine choice (pi behind the deliberately leaky Agent Runtime port) is
recorded in **ADR-0039**, backed by the first-hand audit
`pi-agent-core-capability-audit-0.79.10.md`. The resolutions below follow from
that audit (a single stateful `Agent` loop with a tool-execution step and
`before/afterToolCall` hooks). The exact version pin is a PR-A1a task; re-run the
audit on any bump (version churn is the dominant risk per ADR-0039). The package
name is scoped (`@earendil-works/pi-agent-core`).

- **Embedding choice: low-level `Agent`, not the harness.** pi ships a low-level
  `Agent` (owns transcript, emits lifecycle events, executes tools, exposes
  `steer`/`followUp`/`abort`) and a separate higher-level harness (on-disk
  sessions, skills, compaction, coding-agent prompts). A1 uses the low-level
  `Agent` and supplies MineMusic's own system prompt, tools, stream function, and
  persistence. The harness is coding-agent-shaped and would impose session/skill
  opinions MineMusic's runtime already owns.

- **Tool bridge: Stage tool → pi tool.** pi tools live in `agent.state.tools`;
  pi validates arguments against each tool's schema, then calls its
  `execute(toolCallId, params, signal)` returning a tool result. A1 wraps each
  Stage tool as a pi tool whose `execute` calls `StageInterface.dispatch(ctx,
  { toolName, arguments: params })` and maps the `ToolCallOutput` to pi's tool
  result. pi's per-call `signal` is wired into `StageToolContext.abortSignal` so
  dispatch honors cancellation (the plumbing Phase B's cross-actor cancel builds
  on).

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
  API-key resolver. A1 wires a **DeepSeek model** (a `Model` descriptor with
  `api: 'openai-completions'`, DeepSeek `baseUrl`, `compat.thinkingFormat:
  'deepseek'` — audit E3 confirms no new adapter is needed) through these; the key
  resolver reads it from env/secrets. **DeepSeek is a tentative default, not a
  grilled decision** — it is not in the Locked Sequencing Decisions and carries no
  recorded rationale vs alternatives; since tool-call/JSON-schema adherence is
  model-sensitive (it is the whole A1 bridge), revisit/grill the model choice if
  A1 shows adherence problems. The model stays swappable behind the stream
  function; a switch is a descriptor/wiring change, not a boundary change. (Pick
  the exact model id — e.g. `deepseek-chat` — at implementation; "DeepSeek Pro
  API" was a non-standard name.)

- **Confirmed not in A1's path.** pi's model is a single `Agent` loop with
  `steer`/`followUp`/`abort`/hooks and no subagent/fork/dispatch primitive.
  ADR-0032 peer-actor coordination and cross-actor cancellation are
  MineMusic-built in Phase B; A1's single Main Agent uses pi natively and needs
  none of it.

## A3 Deep Dive: Queue/Playback Truth + Owning Command

Grounded in the existing storage and command patterns: owning commands take a
`MusicDatabase` and write through `database.transaction(...)`; areas add tables
via a `MusicDatabaseSchemaContribution { id, apply(ctx) }`; repositories run SQL
through `MusicDatabaseContext { run, all, get }`. Storage is Postgres-backed
since Phase 21.

- **Command boundary.** Queue/playback mutations go through an owning
  `MusicExperienceQueueCommand` _(proposed: `enqueue`, `playNow`,
  `removeFromQueue`)_ that serializes writes via `database.transaction`. It does
  **not** use Music Data Platform's `runSourceOfTruthWrite` facade — that facade
  is for source-of-truth writes that trigger material/catalog projection
  invalidation. Queue/playback is Music Experience runtime state on a separate
  write path. This keeps the two areas' write boundaries distinct.

- **Truth store + write boundary.** A new schema contribution adds the
  queue/playback tables; a narrow repository over `MusicDatabaseContext` is the
  only place that issues queue/playback writes, called solely from the owning
  command. The agent, Stage handlers, and Session Context never construct the
  repository or write directly (write-boundary hard rule).

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
  `queue.add` accepts a library `MusicItemHandle` and resolves it to its material
  ref; Phase B (PB4) adds radio/transient provenance and the candidate→material
  append path. This avoids a later queue-key migration. See
  `phase-B-radio-concurrency-spec.md` PB4.
- **Playback truth is logical, not audio.** Slice-1 playback truth is a logical
  now-playing pointer + status (e.g. playing/paused), not real audio output.
  Browser/device audio authority is the separate Phase C "browser playback
  authority" follow-up. The harness observes the pointer/status change.

- **Projection.** A public queue/now-playing read port exposes current queue +
  now-playing for Session Context (A2). It is a direct read of queue/playback
  truth, not routed through the material projection-maintenance machinery.

- **Agent-facing tools.** `music.experience.queue.add` and
  `music.experience.playback.play` _(proposed)_ register under the existing
  `music.experience` instrument through `createMusicExperienceRuntimeModule`.
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

## A4 Deep Dive: Agent Turn Wiring + Tool Composition

Grounded in the existing `music.experience.present` tool: it takes a
`MusicItemHandle` (candidate or library), resolves the public handle via
`ctx.handleMinting.resolve`, commits a candidate to the library, and returns a
**library item handle** plus a `MusicCard`. Its descriptor explicitly punts
playback ("play this now" → avoid; "external playback is a future Effect
Boundary-routed workflow") — exactly the gap A3/A4 fill.

- **Tool-composition seam.** The slice-1 agent flow is `music.discovery.lookup`
  → `music.experience.present` (admits the candidate and yields a library item
  handle) → `music.experience.queue.add(library handle)` →
  `music.experience.playback.play`. `queue.add` accepts a **library**
  `MusicItemHandle` and resolves it via `ctx.handleMinting.resolve({ handleKind:
  "library", ... })`, the same veil pattern `present` uses — so the Public Handle
  Veil is preserved across the seam (no internal anchor crosses to the agent).
- **Admission boundary stays in present.** `queue.add` takes library handles
  only; candidate admission stays in `present`/candidate-commit and is not
  duplicated into the queue tool. Silent queueing of a candidate without
  presentation (so a track can enter the queue without a card) is **deferred to
  Phase B**, where Radio's refill needs exactly that — slice 1's Main Agent
  reaches the queue through `present`.
- **Turn driving (harness).** A user turn is `agent.prompt(userMessage)` then
  `agent.waitForIdle()`; the harness then reads the queue/now-playing projection
  **through the A2 read-model seam** and asserts the outcome. The agent's tools
  are the A1-bridged Stage tools (`lookup`, `present`, `queue.add`,
  `playback.play`).
- **Speech Level deferred.** The agent produces a normal harness-visible text
  response; Speech Level (Silent/Notify/Speak) as an Agent-Runtime policy is not
  enforced in slice 1 (no UI to be silent toward; the harness reads the
  response).
- **System prompt.** A minimal music-agent system prompt naming the available
  instruments and the play/queue intent. Content, not a boundary — refined in
  implementation.

## pi Capability Ledger (audited against 0.79.10)

A dependency map: every pi-agent-core behavior the Phase A/B design leans on, and
which decision it backs. **Audited 2026 against `@earendil-works/pi-agent-core@0.79.10`
by reading first-party `.d.ts`/source + two runtime experiments** (see
`pi-agent-core-capability-audit-0.79.10.md`). Status reflects that audit, not an
open question. **Re-run the audit on any version bump** — pi shipped 24 versions
in 6 weeks (0.74→0.79) and has done one Node-compat split, so **pin the version
exactly**; version drift is the real risk, not capability gaps.

| pi behavior | Status @0.79.10 | Decision it backs |
| --- | --- | --- |
| Low-level `Agent` separate from harness (own prompt/tools/stream) | ✅ — three layers: `runAgentLoop` (stateless) < `Agent` (in-memory stateful) < `AgentHarness` (session/compaction/skills); the harness `import`s `runAgentLoop` directly and does **not** flow through `Agent` (so harness is an alternative, not an upgrade path from `Agent`) | A1 embedding choice (use low-level `Agent`) — correct |
| `new Agent({})` works; empty default system prompt; no baked coding/skill content | ✅ | A1 "engine only, not the opinionated harness" |
| Tools `execute(toolCallId, params, signal?, onUpdate?)`; params schema is TypeBox = JSON Schema, passed to provider verbatim | ✅ (raw JSON Schema usable directly) | A1 bridge; **resolves the JSON-Schema→pi-schema open question — near-zero conversion** |
| Per-tool-call `AbortSignal` provided; `abort()` flips it into in-flight tools | ✅ — but **cooperative**: pi forwards the signal, does not hard-kill; the tool/dispatch must honor it | A1 `abortSignal` wiring; **PB9** (see correction below) |
| `prompt`/`continue`/`abort` + `waitForIdle()` loop control | ✅ | PB1/PB2 discrete runs; A4 turn driving; harness `waitForIdle` |
| `before/afterToolCall` hooks are async and awaited; can pause the loop on an external promise | ✅ (experiment) — but **a paused hook does not auto-honor `abort()`; the hook must `Promise.race` the signal itself** | A1 double-gate; **I2 integration-layer loop pause**; PB9 |
| Persistence / compaction / endurance | ◑ **only in the harness; low-level `Agent` has none** (`reset()` clears memory; `sessionId` is just a provider cache hint) | **D-row correction below**: MineMusic builds continuity itself (ADR-0037), it is *not* inherited from pi at our chosen layer |
| Transcript externally readable/truncatable (`agent.state.messages` is a public writable accessor) | ✅ (experiment: `slice()` truncates, no harness/LLM) | **PB8a injected-compaction test — gate PASSES, no fall-back to after-B.** Use the direct-assignment / `transformContext` path for the deterministic LLM-free test; the full `compact()` API needs an LLM + `SessionTreeEntry[]`, so it is **not** the path for a deterministic test. Compaction is manual-only (no token-threshold auto-trigger). |
| Injectable stream fn + per-call API-key resolver; provider registry keyed by protocol (`Api`), not brand; built-in `openai-completions` compat covers DeepSeek | ✅ | A1 model wiring; **resolves the DeepSeek open question — no new adapter** |
| Single `Agent` loop; no subagent/fork/dispatch/parent-child primitive | ✅ (exhaustively shown; re-verified at 0.79.10) | Confirms Main↔Radio coordination is MineMusic-built (ADR-0032/PB) |

### Corrections forced by the audit

- **Persistence is NOT native at our layer (the one decision change).** The
  earlier ledger row "transcript persists and is reloadable across runs
  (compaction is native)" is **false** for the low-level `Agent` MineMusic uses:
  it is volatile (compaction + persistence live only in the harness). PB2's
  "transcript persists (compacted) and is reloaded" is therefore **not a pi
  behavior at our layer** — MineMusic must build cross-run persistence itself, on
  `state.messages` (or by independently importing pi's `SessionRepo`). This does
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

## PR Split (proposed)

- PR A1a: pi dependency + engine adapter skeleton + embedded context, lookup
  round trip (harness).
- PR A1b: double-gate / veil / synthetic-session resolution + guards.
- PR A2: minimal Workbench Interface read-model seam (one area slice) + Session
  Context over it + guards.
- PR A3a: queue/playback truth + owning command + projection (command tests).
- PR A3b: agent-facing queue/play tool registrations + gate posture + guards.
- PR A4: agent turn wiring + end-to-end harness.

## Exit Criteria

- A deterministic in-process harness drives a full user turn to a queue/playback
  change through the owning command.
- Guards in place: Agent Runtime forbidden-imports, dispatch-only tool access,
  Session-Context-over-read-model, queue write-capability, tool output leak.
- No Web, Radio, concurrency, proposal, or Memory code introduced.

## Open Questions Carried Into Implementation

- pi version pin: the engine is audited at 0.79.10 (ADR-0039 +
  `pi-agent-core-capability-audit-0.79.10.md`); PR-A1a pins the exact version and
  re-runs the audit on any bump. The embedding surface is resolved in "A1 Deep
  Dive" and the pi Capability Ledger.
- Stage JSON-Schema → pi tool-schema: **resolved by audit (B2)** — raw JSON Schema
  satisfies pi's `TSchema` and is read verbatim by providers, so it maps to
  `Tool.parameters` with a field rename, near-zero conversion. (Optional TypeBox
  rebuild only if a future provider needs the `Symbol` decorations.)
- Exact queue/playback table shape (material-ref-keyed with a provenance
  column), revision column, and the queue/now-playing projection read-port key
  set. (Define the per-concern revision column against a single shared
  `ConcernRevision` shape — see roadmap cross-cutting.)
- Decided: queue/playback write tools auto-pass via a gate widening (ADR-0021/0022
  precedent), recorded as ADR-0038's `local-bounded × user-intent-backed` cell,
  not a new one-off qualifier. Open: the exact declaration mechanics.
- DeepSeek is a **tentative default, not grilled** (no Locked-Sequencing row, no
  recorded rationale vs alternatives). Audit E3 confirms the *mechanics* (built-in
  `openai-completions` adapter, `compat.thinkingFormat: 'deepseek'`, `baseUrl` +
  env key — no new adapter). Open/revisit: whether DeepSeek is the right model
  (tool-call/JSON-schema adherence is model-sensitive), and the exact model id
  (e.g. `deepseek-chat`).
