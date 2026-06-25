# ADR-0039: The Agent Engine Is pi-agent-core Behind A Deliberately Leaky Port — Provider/Loop-Shape Neutral, Concurrency-Semantics Pinned

## Status

Accepted

## Context

CONTEXT.md already establishes that Agent Runtime owns "the MineMusic-owned agent
engine interface used by concrete engine adapters," and its `_Avoid_` list places
the "Pi adapter" outside the area body. So the *port abstraction* is settled
architecture; this ADR does not relitigate whether there is a port. What was
**not** recorded is (a) which concrete engine sits behind it and why, and (b) what
that port can and cannot actually isolate — left as an inherited premise from the
formal-rebuild source drafts, with no decision record. An external review flagged
this as the largest unrecorded load-bearing bet: the whole of Agent Runtime
(Main + Radio) rests on `@earendil-works/pi-agent-core`, a young (MIT, ~6-week-
old, high-churn) TypeScript engine, with no "why this over LangGraph / OpenAI
Agents SDK / Mastra / Vercel AI SDK."

A first-hand capability audit was then performed against the exact installed
version: `pi-agent-core-capability-audit-0.79.10.md` (read `.d.ts` + compiled
source, two runtime experiments, adversarial skeptics; `--no-save`, repo
unpolluted). That audit is the evidence base for this ADR.

Two honesty constraints shape what this ADR may claim:

- pi was **inherited from the source drafts, not selected by a head-to-head
  evaluation**. No first-hand audit of LangGraph/OpenAI SDK/Mastra/Vercel was
  done, so this ADR must **not** fabricate a comparison table asserting pi is
  superior. (Doing so would violate the project rule that only verified facts
  become spec fact.)
- The audit showed MineMusic depends on several *specific* pi concurrency
  semantics (cooperative abort, await-in-hook pause, idle-after-settle, writable
  transcript). These are not generic "every agent engine has them" behaviors, so
  the port cannot honestly claim to abstract them away cheaply.

## Decision

### 1. The engine is pi-agent-core, pinned, behind the existing Agent Runtime port

`@earendil-works/pi-agent-core` is the concrete engine adapter, using its
**low-level `Agent`** (not the `AgentHarness`), wired through the
Agent-Runtime-owned engine port. **Pin the version exactly** and re-run the
capability audit on any bump (the audit found 24 releases in ~6 weeks and an
existing `legacy-node20` split — version churn is the dominant risk, ahead of any
capability gap).

### 2. Why pi — three honest layers, not a fabricated ranking

- **Provenance (stated plainly):** pi is the inherited starting point, not the
  winner of a head-to-head evaluation. This ADR makes no claim that pi is
  *better* than LangGraph / OpenAI Agents SDK / Mastra / Vercel AI SDK; no
  first-hand audit of those was done.
- **Sufficiency (the real justification, evidenced):** pi is **audited as
  sufficient** for MineMusic's use at 0.79.10 — injectable prompt/tools/stream/
  key, real per-call `AbortSignal`, awaitable `before/afterToolCall` hooks,
  `prompt`/`continue`/`abort`/`waitForIdle`, externally writable transcript, raw
  JSON Schema usable directly as `Tool.parameters`, DeepSeek via the built-in
  `openai-completions` adapter. The burden carried is "pi is enough" (provable
  from the audit), not "pi is best" (unevidenced, not claimed).
- **Shape fit (structural, from first-hand reading — not a competitor ranking):**
  per audit §F3, pi is a complete, overridable in-process agent *loop* with a
  *skippable* harness and **no** native multi-agent primitive. That shape fits
  MineMusic's needs: it embeds in process as an engine, MineMusic skips the
  coding-shaped harness, and MineMusic builds Main↔Radio coordination itself
  anyway (ADR-0032). This is a statement about pi's own form, not a scored
  comparison.

### 3. The port is deliberately leaky — neutral where it can be, pinned where it can't

The port does **not** pretend to be a neutral engine abstraction. Honestly, it
isolates three things and deliberately leaks a fourth:

- **Neutral — provider/model access.** Injectable `streamFn` + per-call
  `getApiKey` + data-only `Model` descriptor; provider registry keyed by wire
  protocol, not brand. Swapping model/provider is genuinely a descriptor change
  (audit E1–E3). This part of the port is real.
- **Neutral — basic loop shape.** `prompt`/`continue`/`abort`/`waitForIdle` and
  the tool `execute(id, params, signal, onUpdate)` contract are conventional
  enough to restate behind the port.
- **Agent-Runtime-owned, not engine — persistence / compaction / endurance /
  coordination.** The audit proved these are **harness-only** in pi; the
  low-level `Agent` is volatile. MineMusic builds them itself (continuity floor
  per ADR-0037 over `state.messages` or a standalone `SessionRepo`; Main↔Radio
  coordination per ADR-0032). The port stays clean here precisely *because*
  MineMusic owns them — they do not cross the engine boundary at all. This
  confirms ADR-0037's floor was correctly designed not to depend on pi
  compaction.
- **Reusable, but not owning — base-helper-first pi harness reuse.** Rejecting
  the full `AgentHarness` as MineMusic's runtime owner does **not** mean
  MineMusic hand-rolls every prompt/session helper. Agent Runtime should use the
  pinned package's public `./base` harness helpers directly where they provide
  the needed semantics — especially prompt template formatting, session
  repositories, and compaction helpers — then wrap those helpers behind
  MineMusic-owned adapter/facade interfaces. This is not a default vendored
  source-tree fork: A1a should not copy pi harness directories into the repo or
  maintain a locally modified pi helper tree. MineMusic may read pi harness
  source while writing its wrappers, and may reuse algorithms or small sub-code
  shapes by close reference when a public helper needs boundary-narrowing glue,
  but the default live dependency is the pinned package helper export. Any
  future meaningful copied/modified pi source requires an explicit reason and
  provenance note. The helper reuse remains implementation substrate only: it
  does not own MineMusic's Session Context assembly, actor lifecycle,
  persistence policy, Main↔Radio coordination, Stage tool dispatch, public
  work/event semantics, or future skill selection policy. Ordinary Main/Radio/
  runtime modules depend on MineMusic-owned interfaces, not on raw pi helper
  types. The facade should expose narrow capability ports rather than one broad
  utility object; current non-skill candidates are `PromptTemplatePort`,
  `AgentTranscriptSessionPort`, and `AgentCompactionPort`. The adapter layer
  translates MineMusic-owned inputs, storage/session choices, and future source
  roots into pi helper calls; any private lower-level capabilities introduced
  for that translation must remain internal to Agent Runtime and must not leak
  as Main/Radio dependencies. Raw imports from pi's harness helper surface
  (`@earendil-works/pi-agent-core/base` or equivalent) are allowed only in Agent
  Runtime facade/adaptor modules and their adapter-focused tests. Main, Radio,
  Session Context assembly, tool bridge, and ordinary runtime modules consume
  the MineMusic ports above, not pi helper exports.
- **Pi-first adaptation, not clean-room harness construction.** MineMusic does
  not adopt the full `AgentHarness` as its runtime owner, but every
  harness-like capability should start from audited pi primitives, exported
  helpers, and observed pi semantics. A MineMusic-owned wrapper may narrow,
  rename, or constrain those primitives for Agent Runtime boundaries, but a
  clean-room replacement must record the pi behavior it cannot reuse and why.
- **Skill support is future-compatible, not Phase-A scope.** pi's skill helpers
  are part of the reusable harness surface MineMusic should keep room for, but
  Phase A does not implement a skill catalog, skill root, skill selection, or
  full-skill-body injection. When MineMusic later needs skills, that capability
  should enter through an Agent Runtime-owned facade/port that preserves pi's
  skill semantics rather than a clean-room prompt-module system. Main/Radio
  should still not load or inject skill files directly.
- **Deliberately leaked — loop concurrency semantics.** Several pi-specific
  semantics are **correctness dependencies** for MineMusic, and pretending to
  abstract them away at zero-implementation time (with only one adapter) would be
  an invented, premature abstraction. Instead they are recorded as an explicit
  **engine-semantics dependency list** — the contract a future replacement engine
  must re-satisfy, and the honest measure of switching cost:
  1. **Cooperative abort.** `abort()` flips the per-call `AbortSignal` but does
     **not** hard-kill an in-flight tool; the tool/`dispatch` must honor it
     (PB9's "abort touches only run lifecycle" holds only then).
  2. **Await-in-hook pause + manual abort race.** `before/afterToolCall` are
     awaited and can pause the loop on an external promise (PB9 cascade, the I2
     integration test) — but a paused hook does **not** auto-honor a fresh
     `abort()`; it must `Promise.race([gate, abortSignal])`.
  3. **`waitForIdle()` resolves strictly after `agent_end` + all listeners
     settle** (the deterministic test harness depends on this).
  4. **`state.messages` is an externally writable transcript** (PB8a injects
     erosion via direct assignment / `transformContext`, LLM-free).
  This list *is* the audit's capability ledger, repurposed: not "assumptions to
  verify" but "the engine semantics MineMusic is coupled to."

### 4. "Swappable" is a measured cost, not a free guarantee

The review's "the port makes it swappable, mitigating lock-in" is **partly true,
restated honestly**: provider/model and loop shape swap cheaply; persistence/
compaction/coordination never crossed the boundary; but the §3.4 concurrency
semantics are real coupling. Switching engines = writing a new adapter **plus**
re-satisfying the dependency list (and possibly touching MineMusic code that
relies on those semantics). The port converts lock-in from hidden to *auditable*,
not to zero.

## Rejected Alternatives

- **Fabricate a head-to-head comparison (pi vs LangGraph/OpenAI SDK/Mastra/
  Vercel).** Rejected — no first-hand audit of those was done; a comparison table
  asserting pi's superiority would be post-hoc rationalization, exactly the
  "guess under uncertainty" the project forbids. If a real comparison is ever
  wanted, it needs its own first-hand audit task (like the pi one), not memory.
- **Claim the port is a neutral engine abstraction (so any engine is plug-in).**
  Rejected — the audit shows MineMusic depends on specific pi concurrency
  semantics; a truly neutral port would have to re-invent an engine-neutral
  concurrency contract at zero-implementation time with one adapter — an invented,
  premature abstraction that would likely either leak pi or block capabilities pi
  needs.
- **Adopt pi's full `AgentHarness` as MineMusic's runtime harness.** Rejected —
  the harness is coding-agent-shaped and, per audit, a *parallel* layer that
  does not flow through the low-level `Agent`; MineMusic already owns
  continuity/coordination with semantics (ADR-0037/0032) the harness does not
  match. This rejection is intentionally narrow: it does **not** forbid using
  audited public harness utilities from pi's `./base` export inside
  MineMusic-owned Agent Runtime code.
- **Treat pi as a settled, audit-free premise (status quo).** Rejected — it is
  the largest load-bearing dependency; it deserves at least a recorded sufficiency
  audit, a version-pin policy, and an explicit dependency list.

## Consequences

- PR-A1a adds `@earendil-works/pi-agent-core` pinned to an exact version; the
  capability audit doc is the gate, re-run on any bump.
- PR-A1a must audit the pinned package's public exports and harness source
  before depending on any harness utility. The first accepted utility set is the
  full helper bundle MineMusic needs to avoid rebuilding a parallel harness
  vocabulary: prompt template formatting, session repositories, and compaction
  helpers. Full `AgentHarness` remains out of scope as a runtime owner; direct
  use of its public `./base` helper exports is in scope when those calls sit
  behind Agent Runtime-owned narrow ports. The facade should split its
  MineMusic-facing surface into narrow ports, so prompt/session/compaction
  helpers do not become one wide dependency. A1a should not vendor pi harness
  directories or create a copied/adapted helper tree. A1a should add a
  forbidden-import guard that permits raw pi harness helper imports only inside
  the Agent Runtime facade/adaptor layer and adapter-focused tests. If
  implementation needs to mirror a non-exported pi algorithm or copy meaningful
  sub-code, the
  implementation note must record the source file, pinned version, why the
  public helper was insufficient, and whether the MineMusic layer is boundary
  narrowing, product policy, or a pi capability gap.
- PR-A1a must not add skill runtime behavior: no `SkillCatalogPort`, no
  MineMusic skill root, no selected-skill input, no automatic skill routing, and
  no model-requested skill loading. It should only preserve the Agent Runtime
  facade/adaptor shape so a future skill port can reuse pi skill semantics
  without rewriting A1a's harness foundation.
- PR-A1a implementation notes must map each MineMusic facade port to the pi
  primitive, export, or observed source behavior it uses. The expected path is a
  wrapper around public `./base` exports; copied or locally modified pi source is
  an exception, not the default.
- The phase-A "pi Capability Ledger" is reframed (already done) as the audited
  engine-semantics dependency list of §3.4; PB8a passes; PB2's persistence is
  MineMusic-built, not pi-provided; PB9 carries the cooperative-abort + hook-race
  implementation requirements.
- A future engine swap is scoped by §3.4's list, not assumed free.
- This ADR makes no claim about pi vs other engines' relative quality; that
  remains open and would require its own first-hand evaluation.
- Dominant ongoing risk is pi version churn; mitigation is exact pinning +
  re-audit, not capability substitution.
