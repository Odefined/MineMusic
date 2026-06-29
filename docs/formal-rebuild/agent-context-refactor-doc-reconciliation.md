# Agent Context Engineering Refactor — Doc Reconciliation Handoff

> Status: handoff / work spec for a doc fixer (human or agent).
> Source of truth: `docs/formal-rebuild/agent-context-engineering-spec.md` (current authority, already updated to the seven-rail model + Phase B Actor Definitions).
> Audit method: 29 living design docs audited against the refactor, each finding adversarially verified against the real doc text. (Archive docs excluded as historical/frozen.)

## 0. How to use this

This document is the complete, executable output of the refactor-impact audit. For each doc it states: the stale/contradicted text (with location), the required change, and constraints. Work top-to-bottom by severity. Do **not** re-audit — the findings here are already verified.

**Branch:** the spec is already updated on `main` (uncommitted) / carried on `docs/agent-context-seven-rail-reconciliation`. The fixes below are doc-only unless a file is explicitly flagged as code.

---

## 1. Headline answer (does the refactor change design?)

**No ratified ADR's load-bearing decision is reversed.** The refactor is a *convergence*, not a reversal. The impact is "real but bounded":

- **One genuine ADR-DECISION-level conflict:** ADR-0031's agent-facing clause ("agent-facing view = Session Context, a projection of the Workbench-composed read model"). Needs reconciliation (gating — see §3).
- **Two planning specs need re-specing** (Phase A Main context path; Phase B Radio context-loading) — design-change edits, not ADR reversals.
- **Several stale-terminology refreshes** (the old "Session Context" label).
- Area-ownership, concurrency, transport, topology, pi-fidelity ADRs are all **untouched**.

---

## 2. The refactor (the lens — what changed vs what survived)

**Seven rails** mapped onto pi `systemPrompt` / `messages` / `tools` only:
1. Actor Identity · 2. Actor Instruction · 3. Capability Context · 4. Workspace Context · 5. Invocation Context · 6. Continuity Context · 7. Knowledge / Memory Context.

**Retired (must not appear as living design):**
- "Session Context" as a mixed agent-facing bucket (workspace facts + invocation + transcript + tools + memory).
- The `musicExperience` blob as an agent context source; `WorkspaceReadModel`; `WorkspaceReadModelReader`; `readWorkspace`; `createWorkspaceReadModelComposer`; `WorkbenchMusicExperienceReadPort` *as an agent composition seam*; the `session_context.ts` pass-through; per-agent renderers (`renderAgentSessionContextForSystemPrompt`, `renderRadioRunSystemPrompt`); the **"Radio Run Floor" prompt pattern** (Radio hand-writing direction/posture/queueLength into its own system prompt).

**New model:**
- One Agent-Runtime-owned **Workspace Context assembler**, fed by **complementary** sources: area-owned projections (domain facts) **AND** Workbench Interface (interaction-state facts). Neither displaces the other. **Workbench is NOT removed from the agent path** — only its re-bundling of another area's domain facts into a blob is retired.
- One **section-agnostic projection port per area**; the area does not know about sections; the assembler owns the section vocabulary (`listening`, `radio`).
- One **`ActorDefinition`** per actor: `identity{role,job,persona}` / `instruction{responsibilities,operatingRules,prohibitions}` / `declaredWorkspaceSections` / `toolPack{stageToolNames}`. Identity is not scattered across server modules.
- Radio gets **queue item identity** (handles/labels), not only `queueLength`. Radio **Invocation = JSON** (`runId`/`wakeReason`/`suggestedAppendCount` only; command basis is runtime-only AgentHarness state). `userTasteHint` reuses `library.catalog.summary`.

**Preserved (do not break these):** pi fidelity (one long-lived Agent, transcript in `messages`, run-start refresh before snapshot, no invented pi methods); Workbench owns interaction state; Music Experience owns queue/now-playing/radio truth; Stage Interface sole callable boundary; ADR-0030 top-level-area ownership; ADR-0031 Web/AG-UI serialization + never-wire-format; ADR-0037 durable radio-truth floor.

---

## 3. CRITICAL constraints — read before editing anything

1. **ADRs are amended/superseded in place when wrong.** Verified forms in this repo (Read ADR-0001 / 0032 / 0029): (a) a header blockquote marking whole-file supersession and naming the superseding ADR (ADR-0001 → `0005-formal-top-level-architecture-areas`); (b) editing the `## Status` section to "Amended. …", marking superseded passages inline, and appending a `## Refinements (later ADRs / phase specs)` section (ADR-0032); (c) a blockquote `Amended by ADR-XXXX:` after the Status/Decision stating what is overtaken and the corrected position (ADR-0029). The original decision text is not silently rewritten to pretend it always said the new thing — the reversal is marked overtly. A dedicated new superseding ADR is one option (as 0001→0005), not the only one (0032 amended inline with no new ADR).
2. **"floor" ambiguity — do not conflate.** ADR-0037's durable radio-truth **"floor"** (commanded direction vs evolved posture, durable state) is a **different concept** from the forbidden **"Radio Run Floor"** (the prompt pattern). Verified: ADR-0037 contains zero system-prompt/render/renderer references. Do not flag ADR-0037 as conflicting on "floor."
3. **Phase B PR1 / PR2 / PR3 are already LANDED** (PR1 `08588893`/PR#128, PR2 `6ee1c8e8`/PR#129, PR3 `d10eb9ad` + follow-ups `e006a562`/`95c60ba5`/`f846fc9a`/`382c9d03`/`cac18fe9`/`c5cadd8f`). The PR3.1/PR3.2/PR3.3 refactor migrates that landed substrate; after the refactor, `session_context.ts` and the old Workbench agent-composition seam are deleted. **Do not restructure PR3 in the plan** — see §6.
4. Preserve every correct fact (pi fidelity, area ownership, queue bounds, etc.). Edits are surgical terminology/framing changes unless a section is flagged for re-authoring.

---

## 4. Docs to update — the checklist

### HIGH severity

#### `docs/adr/0031-workspace-snapshot-in-process-read-model-ag-ui-web-boundary.md` — ADR amendment (GATING)
- **Stale (Decision lines ~43-45; Consequences ~70):** "Their agent-facing view is Session Context, a projection of the same read model" and "Session Context must be defined over the in-process read model."
- **Change:** Add an Amendment/Status note: the agent-facing in-process Workspace Context assembler is ceded to Agent Runtime (cite `agent-context-engineering-spec.md` + ADR-0030 lines 56-58); "Session Context" agent-facing framing is retired. Reframe the agent-facing projection as "Workspace Context (one of seven rails)." Reword the Consequences line to: "the agent-facing Workspace Context is assembled by Agent Runtime from area-owned projections + Workbench interaction-state, never over the AG-UI wire format." **Keep intact:** multi-owner projection model, Web/AG-UI serialization boundary, never-wire-format invariant. Amend in place per §3 #1 (do not silently rewrite the Decision body).
- **Constraint:** amend ADR-0031 in place per §3 #1 (edit `## Status` → "Amended", inline-mark the agent-face clause, append a Refinements section / amendment blockquote pointing to `agent-context-engineering-spec.md`). The original decision text is marked superseded, not silently rewritten.

#### `docs/formal-rebuild/phase-B-radio-concurrency-spec.md` — re-author PB5 + PB3 carrier
- **Stale (PB5 lines ~390-391):** supervisor "refreshes the system prompt / prompt content with the read-model slice" (the forbidden Radio hand-re-render seam).
- **Change:** Radio's motif/variations/direction enter context via the **shared Agent-Runtime Workspace Context assembler (radio section)**, NOT supervisor hand-rendering a read-model slice into Radio's system prompt. Revisions stay runtime command/harness metadata, not agent-facing Workspace Context. Install the shared AgentHarness turn state before `Agent.prompt(...)`, because pi snapshots provider context before `agent_start`. Runtime command basis comes from the same workspace assembly as harness-only `commandBasis`; it is injected as Stage `preconditionBasis`, not moved into Invocation Context.
- **Stale (PB3 line ~357):** "Agent Work Basis … carried in Session Context."
- **Change:** carrier → runtime-only AgentHarness command basis (`commandBasis` from workspace assembly, projected into Stage `preconditionBasis`, advanced from `changedBasis`); do not move it into Invocation Context. **Stale (line ~11 Depends-on):** drop "Session Context"; replace with the pi-carried rails assembled by the Agent-Runtime assembler. Add a cross-reference to `agent-context-engineering-spec.md`.

#### `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md` — repoint PR2/PR3 + INSERT refactor (see §6)
- **Stale (PR2 line ~94):** "extend `readMusicExperience` to return radio direction + posture + stamp" (the retired blob as Radio's run-start read).
- **Change:** Music Experience exposes a **section-agnostic projection port** consumed by the shared assembler — NOT extending `readMusicExperience`/`WorkbenchMusicExperienceReadPort`. The direction/posture/stamp + queue-internal dedup reads stay Music-Experience-owned; they mount on the new port.
- **Stale (PR3 line ~127 + line ~148 stopping condition):** "PB5 read-model motif injection" at `agent_start`.
- **Change:** → "Workspace Context assembler refresh" (so an engineer does not build the forbidden re-render path). PB8 posture-stamp carry/clear stays (ADR-0037 durable floor).
- **PLUS:** insert the refactor as **PR3.1 / PR3.2 / PR3.3** after landed PR3, before PR4 — full content in §6.

#### `docs/formal-rebuild/phase-A-in-process-agent-native-loop-spec.md` — re-spec A2
- **Stale (frontmatter owner; A2 increment; A2 Deep Dive lines ~95-127, ~331-385, ~693-713):** "Session Context over the Workbench read-model seam"; "assembly is identity / no-op for slice 1."
- **Change:** Re-spec A2 onto seven rails: Actor Identity/Instruction from a **Main `ActorDefinition`**; Workspace Context from the Agent-Runtime assembler over area projections + Workbench (NOT a composed blob, NOT the retired seam); Capability from `toolPack`; Invocation as the user-turn prompt; Continuity in pi `messages`. Even Phase A must emit the encoded `listening` section with material handles/labels (drop the "no-op" claim). Stop grounding A2 on ADR-0031 as live authority (lines ~97-100, ~110-111, ~333-337, ~379-385). Add a cross-reference to `agent-context-engineering-spec.md` (currently zero either direction).

#### `CURRENT_STATE.md` / `PROGRESS.md` — rewrite A4 bullet + rail enum
- **Stale (lines 800-804, the A4 bullet):** "each user turn captures Session Context through the Workbench read-model seam."
- **Change:** Describe the active Main-Agent context path in seven-rail vocabulary; **mark A4 as pre-refactor landed state to migrate** (or add a forward migration note — spec Acceptance Criteria require Main on the shared path). **Keep** the pi-fidelity facts (long-lived agent, `prompt()`-driven runs, Pi idle/abort coordination, run-start `systemPrompt` refresh, turn messages + status return).
- **Stale (lines 781-786):** rail enumeration omits Actor Identity; "shared in-process read model" echoes the retired blob.
- **Change:** add Actor Identity as the first rail; reword to the multi-source assembler.
- **Also stale (line 814):** "Phase B PR3 Radio runtime substrate is **in progress**" — PR3 has landed. Update to landed.
- **Also stale (`PROGRESS.md` 2026-06-28 section):** "six rails" omits Actor Identity; A4 still says fresh Session Context through the A2 seam. Update with the same seven-rail / pre-refactor migration wording.

#### `docs/product/MineMusic_Pi_WebUI_Architecture_Research_agent_runtime_revised.md` — supersession + corrections
- **Stale (header line ~9):** misattributes ADR-0030 as *establishing* Session Context as a top-level area (ADR-0030 actually REJECTS it — Decision lines 56-62, 82-84, 108-109).
- **Stale (ownership block ~373-374; responsibilities table ~679):** asserts "Session Context owns live queue/candidate/pacing context" — inverts ADR-0030's "Music Experience owns live queue … Session Context does not own it."
- **Stale (AgentContextAssembler DTO list ~865-878):** single context DTO.
- **Change:** Add a supersession header (Session Context area model retired; `agent-context-engineering-spec.md` is authority). Correct the ADR-0030 misattribution. Rewrite the ownership block + responsibilities table to seven rails (Workspace Context listening/radio sections; Invocation Context for run envelope; runtime command basis is harness-only). Split the DTO list into seven rails. Research-only — does not block code.

### MEDIUM severity

#### `docs/product/MineMusic_Agent_Native_Workbench_Consensus.md` — rewrite Session Context sections
- **Stale ("### Session Context" ~175-194; "### Workspace Protocol And Session Context" ~195-224 incl. ASCII flow):** presents "Session Context" as a named agent-readable assembly surface built on the retired seam; "Workspace Snapshot → Agent Runtime context assembly → Session Context" flow.
- **Change:** Drop "Session Context" as a named surface; replace with a pointer to the seven-rail model in `agent-context-engineering-spec.md`. **PRESERVE** the "Agent Runtime owns assembly, not Workbench Interface" ownership claim and the Workbench-as-interaction-state-source claim (both consistent). Re-express the Music Experience projection (~450-469) in `listening`/`radio` section vocabulary; move run-precondition revisions to Invocation Context.

#### `ARCHITECTURE.md` — rail enumeration
- **Stale (lines ~128-131):** enumerates six rails (Actor Instruction, Capability, Workspace, Invocation, Continuity, Knowledge/Memory), omitting Actor Identity.
- **Change:** Seven rails with **Actor Identity first**: "Actor Identity, Actor Instruction, Capability Context, Workspace Context, Invocation Context, Continuity Context, and Knowledge / Memory Context." Optionally note Actor Identity is structured `{role, job, persona}` from `ActorDefinition.identity`, not a raw prompt string. (Doc edit — cited ADRs do not govern rail structure.)

#### `CONTEXT.md` — rail enumeration
- **Stale (Agent Context Engineering entry ~164-180):** context list omits Actor Identity.
- **Change:** list all seven rails, Actor Identity first; add a short `ActorDefinition` note. The "Session Context" entry (~210-218) already labels it "Legacy umbrella term" — leave.

#### `docs/formal-rebuild/README.md` — supersession marker
- **Stale (line ~63, phase-A spec row):** describes the landed Phase-A "Session Context seam" without flagging it superseded.
- **Also stale (line ~61, spec row):** rail enumeration omits Actor Identity.
- **Change:** update the spec row to seven rails with Actor Identity first, and append a supersession marker to the Phase-A row: "(agent-context model superseded for new design by `agent-context-engineering-spec.md` — Session Context and the Workbench read-model seam are retired)."

### LOW severity (defer until the owning doc is next touched, or until ADR-0031 is superseded)

- **`docs/adr/0030-agent-runtime-and-workbench-interface-are-top-level-areas.md`** — amend in place per §3 #1: only the historical "Session Context" term is deprecated by the seven-rail model; the Decision (two top-level areas, ownership, "Session Context is NOT a top-level area") is reaffirmed.
- **`docs/adr/0041-memory-taste-is-user-editable-backdrop-grown-by-confirmed-proposals.md`** — Consequences (~90-92) stale "Session Context" carrier → maps to the Knowledge/Memory Context rail. Status note; leave the three numbered decisions untouched.
- **`docs/adr/0044-music-experience-queue-is-bounded-runtime-state.md`** — stale "Session Context" surface name → "Agent Runtime Workspace Context." Status note; queue-bounding decision untouched.
- **`docs/formal-rebuild/phase-24-collection-foundation.md` + implementation plan** — Invariant 7 (~294-297) + plan line ~93: replace "Session Context's read-model aggregation (ADR-0031)" with "Collection facts enter agent context only through the shared Agent-Runtime Workspace Context assembler reading the Collection area's section-agnostic projection port." Preserve owner-separation. No scope change to Phase 24's four slices.
- **`docs/formal-rebuild/agent-native-workbench-roadmap.md`** — A2 bullet (~69-72): re-cast to seven-rail vocabulary (the seam becomes the assembler). The ADR-0031 reference can stay with a note that its Session-Context framing predates the seven-rail split and its in-process/never-wire invariant is preserved. **Sequencing unchanged.**
- **`INDEX.md`** + **`docs/adr/0001`/`0039`** + **`docs/formal-rebuild/phase-C-web-boundary-spec.md`** + **`docs/formal-rebuild/pi-harness-reuse-conclusions.md`** + **`docs/product/MineMusic_agent_native_arch_product_review_2026-06-26.md`** — stale-terminology refreshes only (replace "Session Context" with seven-rail/Workspace-Context vocabulary where it appears as a live label). The product review predates the spec (2026-06-26 vs 2026-06-29) — add a predates-spec note.

---

## 5. Confirmed UNAFFECTED — do not touch

- **ADR-0030** substantive decision (Agent Runtime + Workbench top-level areas; Agent-Runtime-owned assembly; Music Experience owns live queue/now-playing/radio truth). Reaffirmed — only the term deprecated.
- **ADR-0031** Web/AG-UI serialization decision + multi-owner projection model + never-wire-format invariant. Survives (only the agent-facing Session-Context half retires).
- **ADR-0037** durable radio-truth floor (commanded vs evolved posture). Consistent — **distinct from the forbidden Run Floor prompt pattern.**
- **ADR-0032 / 0033 / 0034 / 0036 / 0038 / 0039 / 0044 / 0045** — all consistent; none reversed or refined. (ADR-0039 pi-engine-behind-leaky-port reaffirmed; ADR-0044 queue bound untouched.)
- **pi fidelity** (long-lived Agent, transcript in `messages`, run-start refresh, no invented pi methods, MineMusic-owned persistence).
- **Workspace ownership:** Workbench remains an interaction-state source; Stage Interface sole callable boundary; Music Experience owns queue/now-playing/radio truth.
- **PB3 OCC mechanism, PB4/PB6 queue-item handle identity, PB8/ADR-0037 durable-floor rebuild** — consistent.
- **Phase 24 (Collection)** deliverables — none touch the agent context path.
- **ADR-0001** (historical; superseded by ADR-0005; "Session Context" there is a module/port name, not the bucket).
- **Music Experience History read model, MDP runtime-module ownership redraw, `formal-project-glossary.md`** entries (Workspace Context, Session Context-as-legacy, ActorDefinition, Knowledge rail) — already consistent.

---

## 6. Phase B refactor insertion (PR3.1 / PR3.2 / PR3.3)

> The user's explicit instruction. **Phase B PR1/PR2/PR3 are landed; the refactor is NEW work on top of landed PR3.** Insert as three new PRs numbered **PR3.1 / PR3.2 / PR3.3**, placed **after the existing PR3 section and before PR4** in `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md`. **Do NOT restructure or rename PR3** (it is a landed unit). Update the dependency diagram + PB→PR map + the "Recommended count" intro accordingly.

Content (spec-driven, traces to `agent-context-engineering-spec.md`, not to PBs):

**PR3.1 — Agent Context core: ActorDefinition + Workspace Context assembler + Music Experience projection port**
- Build the shared substrate both actors consume, **alongside** the existing (soon-retired) Workbench seam (do NOT delete the old seam yet — deletion is PR3.3).
- Files (new): `src/agent_runtime/actor_definition.ts` (type + `mainDefinition`/`radioDefinition` verbatim from the spec); `src/agent_runtime/workspace_context_assembler.ts` (receives `{actor, ownerScope}`, reads declared sections from area projection ports + Workbench interaction-state, emits encoded Workspace Context); `src/agent_runtime/workspace_context_encoder.ts` (`listening` queue lines carry `[material:mh_<opaque>]` handles + labels not only length; `radio` direction/posture only, with revisions kept in runtime command metadata). Re-home the existing slice as a section-agnostic `MusicExperienceWorkspaceProjectionPort` in `contracts/music_experience.ts`.
- Dependencies: PR2 (radio-truth + queue/now-playing reads).
- Guards: assembler emits listening (identity) + radio; `declaredWorkspaceSections` selects sections; `ActorDefinition` tool-name validation (backticked instruction tokens resolve to `toolPack.stageToolNames` after dotted→model-visible mapping, fail fast on mismatch); identity guard is structural (one definition, separated rails, field shape), not a forbidden-string or keyword-list check; exactly one assembler path.

**PR3.2 — Radio consumes the shared assembler (retire the Run Floor)**
- Delete `renderRadioRunSystemPrompt` (the "Radio Run Floor"). Radio uses the same shared AgentHarness adapter as Main: assemble `radio` + `listening` Workspace Context and harness-only `commandBasis`, install `state.systemPrompt` / `state.tools` before `Agent.prompt(...)`, and refresh same-run provider context through pi `prepareNextTurn` after tool results with `changedBasis`. Replace the prose Invocation (`Radio refill run: …`) with JSON `{run:{kind:"radio_refill",runId,wakeReason,suggestedAppendCount}}` via `agent.prompt(...)`. Wire `radioDefinition`. **Keep** PB8 posture-stamp carry/clear (ADR-0037 durable floor) as a pre-assembly domain hook. Replaces the **landed** PR3 Run Floor.
- Files: `src/agent_runtime/agent_background_refill_trigger.ts`; `src/server/agent_runtime_radio_module.ts` (drop `radioBaseSystemPrompt` const); `src/contracts/agent_runtime.ts` (JSON invocation shape).
- Dependencies: PR3.1, PR2.
- Guards (anti-regression, spec Acceptance Criteria): Radio run-start systemPrompt == shared assembler output (no Radio-only renderer); Radio sees queue handles/labels; Invocation is JSON; timing preserved.

**PR3.3 — Main consumes the shared assembler (retire the Workbench seam + delete dead path)**
- Remove `renderAgentSessionContextForSystemPrompt` + the `session_context.ts` pass-through. Main's per-turn refresh drives the shared assembler + `mainDefinition` into `state.systemPrompt`. Now that both actors migrated, **delete** `WorkspaceReadModel`/`WorkspaceReadModelReader`/`readWorkspace`/`createWorkspaceReadModelComposer`/`WorkbenchMusicExperienceReadPort` (agent-seam sense). Workbench keeps its interaction-state read for Web/future.
- Files: `src/agent_runtime/agent_user_turn_trigger.ts`; **delete** `src/agent_runtime/session_context.ts`; `src/workbench_interface/read_model.ts`; `src/contracts/workbench_interface.ts`; `test/formal/agent-runtime-user-turn-trigger.test.ts`.
- Dependencies: PR3.1, PR3.2.
- Guards: forbidden-import/usage test (no agent path uses the retired seam/renderers); Main systemPrompt == assembler output; Main turn behavior regression unchanged apart from context source.
- **Note:** placing Main-context migration in Phase B is a conscious decision overriding the audit's "Main belongs to Phase A" recommendation.

**Existing PR3 (Radio actor runtime) — leave as-is**; only update its run-start bullet (line ~127) to remove "PB5 read-model motif injection" and point to the PR3.2 assembler, and add PR3.1/PR3.2 to its Dependencies. PR4/PR5/PR6 are not renumbered.

---

## 7. Recommended execution order

1. **GATING — amend ADR-0031** (§4 HIGH, via the §3 #1 convention) to reverse the agent-face clause. Unblocks Phase A/B re-spec; until landed the refactor contradicts an Accepted ADR.
2. **Phase B plan:** repoint PR2/PR3 + insert PR3.1/3.2/3.3 (§6).
3. **Phase B spec:** PB5/PB3 re-author (§4 HIGH).
4. **Phase A spec:** A2 re-spec (§4 HIGH).
5. **CURRENT_STATE / PROGRESS:** A4 bullet + rail enum + PR3-landed correction (§4 HIGH).
6. **Two product research docs** (§4 HIGH/MEDIUM).
7. **Rail enumerations:** ARCHITECTURE / CONTEXT / README (§4 MEDIUM).
8. **Defer** the LOW staleness refreshes (§4 LOW) until ADR-0031 is superseded or the owning doc is next touched.
9. **Do NOT:** silently rewrite ratified ADR decision bodies; flag ADR-0037's durable floor as the Run Floor pattern; restructure the landed PR3; or treat already-superseded research drafts as live contradictions.

---

## 8. Provenance & blind spots

- Audited: 29 living docs (5 root-state, 10 ADRs, 11 formal-rebuild specs/roadmap, 3 product reviews + glossary). Archive excluded.
- Two ADRs hit transient API rate-limits during dedicated audit (`PROGRESS.md`, `ADR-0032`) but were covered: ADR-0032 confirmed unaffected via the first run (peer-actor topology, orthogonal); `PROGRESS.md` is a state doc — treat like `CURRENT_STATE` (Session Context → seven rails; confirm Phase B landing wording).
- Every HIGH/MEDIUM finding was adversarially verified against the real doc text (a second agent re-read the quoted location and re-graded severity).
- The refactor's own authority doc (`agent-context-engineering-spec.md`) is already updated and is the lens for all changes above.
