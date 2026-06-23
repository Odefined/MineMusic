# ADR-0038: Effect Boundary `ask` Policy Is A Two-Dimensional Impact-Class × Actor-Trust Decision, With deny As A Separate Pre-Gate

## Status

Accepted

## Context

Through Phase 23 the Effect Boundary gate is conservative-by-default: an
unqualified durable-write tool routes to `ask`, and each usable write was
unlocked by a narrow per-scenario auto-pass qualifier — presentation admission
(ADR-0021), library intake (ADR-0022), owner-relation edits (ADR-0023). Those
ADRs all auto-pass for the same reasons ("local-only," "bounded to one resolved
item," "driven by explicit user intent," "no external effect") and all note the
same cause: `ask` was unusable because no user-facing approval loop existed yet,
so routing to `ask` would only make the tool dead.

Phase C is the first time the approval loop exists: the Proposal Unit park flow
plus the auto-emitted Confirm card (ADR-0034 / phase-C PC1). `ask` becomes a real
action, not a dead end. This forces the question the per-scenario booleans never
answered head-on: *which commands are high-impact enough to park a Proposal
Unit, and which auto-pass* — and stops the booleans accreting into an unbounded
OR of one-off qualifiers.

Mature agent systems (coding agents such as Claude Code / Cursor / Aider) gate
tools on a recurring structure: a **static risk class** of the tool (read vs
write; reversibility / blast radius; external side effect or data egress) ×️ a
**runtime trust mode** (per-call confirm / auto-accept / plan-only), with
user-accumulated allow/deny overrides. MineMusic differs in one load-bearing
way: its PRD is "agent proposes" — the agent acts on the user's behalf
autonomously most of the time, so confirmation is a *scarce interruption*, not a
per-step IDE checkpoint. That makes "positively define high-impact" (not "ask
whenever unsure") the right posture; otherwise the product degrades into
step-by-step confirmation and contradicts the PRD.

## Decision

The gate decision is two-dimensional: **tool static impact class × actor trust
basis → allow | ask(park) | raise-to-conversation | (deny handled separately)**.
This generalizes ADR-0021/0022/0023: those three booleans are the
`local-bounded × user-intent-backed` cell, not independent rules.

### Axis 1 — Impact class (static, declared per tool; three bands)

A natural generalization of the existing auto-pass ADRs' shared reasons plus the
industry reversibility axis. Unclassified ⇒ highest band (safe default).

- **read** — no durable write / no external effect (e.g. `lookup`,
  `list_scopes`, `catalog.browse`). Baseline pass.
- **local-bounded** — local, bounded to a resolved object, durable write (the
  existing four auto-passes: presentation admission, library intake, relation
  edits, queue/playback).
- **external-or-irreversible** — external side effect / outward-irrevocable /
  large blast radius (provider-side save/like/block, spend, send, delete-scale).
  `irreversible` may later split out of this band when a double-confirm / payment
  surface needs it; not built now.

### Axis 2 — Actor trust basis (is the action backed by present user intent?)

This is **not** the cascade intent-priority (ADR-0037/PB9 `user > Main > Radio`,
which is a preemption order). Trust is an autonomy-authorization semantics: who
originated the action, and is there in-the-moment user intent behind it.

- **user-intent-backed** — Main acting within a run causally triggered by a real
  inbound user message. The user is present.
- **autonomous-within-grant** — Radio (or any actor) acting on standing
  authority with no immediate user request. Autoplay refill is Radio's granted
  job.

**Trust basis is derived at the boundary, never self-reported by the agent.**
The trust value is **not** a tool-call parameter the model fills in — if it
were, an autonomous run could label itself `user-intent-backed` and skip `ask`
on a high-impact effect. Instead the Effect Boundary derives it from the
*actor + run provenance* it already holds: a Main run carries an unforgeable
causal link to the inbound user message that triggered it (an
`issuedFromUserActionId`-style provenance the runtime stamps, not the model);
a Radio run has no such trigger and is autonomous by construction. The agent
cannot promote itself. (This is the one load-bearing element borrowed from a
proposed fuller authorization model — see the note in Consequences — taken in
its minimal causal-provenance form, not as a full grant object.)

### Decision table (6 cells)

| impact ＼ trust | user-intent-backed | autonomous-within-grant |
| --- | --- | --- |
| **read** | allow | allow |
| **local-bounded** | allow | allow |
| **external-or-irreversible** | **ask** (park as Proposal Unit; user present, confirm now) | **raise-to-conversation** (park as Proposal Unit handed to the conversation side; the autonomous actor never blocks) |

- `local-bounded × autonomous → allow` is Radio's refill path: its granted job,
  not parked (parking it would deadlock the background loop, violating CONTEXT.md
  "its loop contains no blocking human-approval step").
- The two right-hand cells use the **same mechanism** (Proposal Unit); they
  differ only in *who triggers* and *confirmation timing*: user-intent-backed
  parks for immediate confirmation; autonomous raises to the conversation side
  and the originating actor keeps working (CONTEXT.md: Radio's high-impact
  confirmations "are raised as Proposal Units to the conversation side").

### deny is a separate pre-gate, not a table cell

Hard prohibitions (forbidden for any actor in any mode — e.g. deleting the user's
whole library, unauthorized spend) are an orthogonal denylist that short-circuits
*before* the impact × trust table. The table only yields allow / ask /
raise-to-conversation. This matches the industry allow/deny override layer and
keeps "what is categorically forbidden" inspectable apart from "what needs
confirmation."

### The gate constrains the agent only; user direct manipulation does not pass through it

The Effect Boundary exists to constrain an **untrusted reasoning agent**; it does
**not** apply to the user (the same rationale the Public Handle Veil records,
phase-C). A user's direct manipulation (a Workbench action) is therefore *not*
routed through the impact × trust table:

- **Danger is a frontend responsibility.** A genuinely dangerous direct action is
  either not offered by the UI at all, or guarded by a UI-side secondary
  confirmation. It is not the agent effect-gate's job to second-guess the user.
- **Concurrency staleness is OCC, not "rejection."** A direct action that loses a
  race fails as `voided_stale` and the client rolls back to authoritative state
  (ADR-0036 optimistic-UI seam) — this is concurrency coordination, not a
  security/permission denial.

So there is **no** "user action denied by the gate, then escalated" path. The
two right-hand cells (`ask`, `raise-to-conversation`) are reached only by an
**agent** effect.

### User override: "ask before source-of-truth edits" (the allow/deny override layer)

The industry allow/deny override layer (named in Context, but missing from the
table) lands as a single user setting: **ask before source-of-truth edits**.
When on, it **upgrades** the `local-bounded × user-intent-backed` cell from
`allow` to `ask` for tools that change the user's library curation. It is
strictly a *tightening* control — it can only make the gate ask **more**, never
less. The dangerous opposite direction (auto-accept / "YOLO" — turning `ask`
cells into `allow`) is **not** this setting; if ever built it is a separate,
explicitly opt-in advanced mode (ADR-0038 already rejects auto-pass-by-default),
so one toggle can never *remove* a safety stop.

Its scope is defined by a tool self-declared marker, **`ownerCurationWrite`** —
"changes the user's library curation / durable personal state" (saved / favorite
/ blocked / collection membership; open to future tools such as rating or
playlist edits, which declare the marker themselves). This is *not* the existing
coarse `durableUserStateWrite` side-effect bit: `present` writes durable
**material identity** but does **not** curate the library (ADR-0040), so it does
**not** carry `ownerCurationWrite`; neither do queue `append` (runtime state) nor
playback. Only curation writes fall under the toggle. The marker is an open,
tool-declared classification consumed at the boundary — same pattern as the
per-tool impact class — so a new curation tool opts in by declaring it, with no
change to the toggle logic. (Because the gate constrains the agent only, this
toggle governs **the agent's** curation writes — "ask me before the agent
changes my library," not before the user changes their own.)

### One Proposal Unit lifecycle, regardless of entry path

`raise-to-conversation` is **not a new mechanism**: it is exactly CONTEXT.md's
existing conversation-side Proposal Unit ("high-impact confirmations are raised as
Proposal Units to the conversation side," ADR-0032). A Proposal Unit has exactly
**two** sources, both **agent** effects — (1) `ask` park (user-intent-backed),
(2) `raise-to-conversation` (autonomous) — producing the **same** unit with the
**same** lifecycle, owned by the **Effect Boundary**: `pending → confirmed |
rejected | expired | voided_stale`, with basis re-check on resume (CONTEXT.md
`Proposal Unit`; phase-C PC1). Entry path affects only the trigger and
confirmation timing, never the unit's shape or owner.

A user's **failed direct manipulation is not a third source.** Failure/rejection
and pending-approval are different lifecycles (a rejected user action is not a
parked command awaiting agent confirmation), and — per "the gate constrains the
agent only" above — a user action never passes through the gate to be rejected by
it in the first place. A user direct action that fails is an OCC rollback owned by
the Workbench surface (ADR-0036), not a Proposal Unit. A user action whose *content*
is high-impact (e.g. a spend the user themselves initiates) is handled by the
frontend's own secondary-confirmation, not by minting an agent Proposal Unit. This
de-conflates ADR-0038 from ADR-0036: the earlier "rejection that escalates"
wording is withdrawn.

This park → human-confirm → resume-with-precondition-recheck loop is the
established **human-in-the-loop interrupt** pattern (LangGraph `interrupt()` +
checkpoint resume; durable-execution human tasks à la Temporal signals — the
*pattern*, not the engine, which phase-21 declined). MineMusic builds it rather
than adopting a framework for two deliberate reasons, both differences worth
recording: what parks is an **owning-area command plus its Agent Work Basis** (not
a graph node), and the confirmer lives on the **AG-UI Web boundary / conversation
side** (ADR-0031/0036), not in the agent graph. The resume-time precondition
check is exactly OCC-on-resume (ADR-0033), so the novel part is only *where* the
unit lives and *who* confirms, not the interrupt loop itself.

## Rejected Alternatives

- **Keep default-`ask` + accrete per-scenario booleans (status quo, "A").**
  Rejected — never positively defines high-impact; booleans grow unbounded; each
  new tool author guesses which qualifier to attach.
- **Reverse to default-auto-pass + flag high-impact ("B").** Rejected — unsafe
  default; a forgotten flag silently executes a dangerous tool. In industry this
  is the opt-in "YOLO / auto-accept" *mode*, never the default policy. Conflicts
  with the conservative write-boundary posture (ADR-0023 keeps unqualified writes
  on `ask`).
- **Reuse cascade priority `user > Main > Radio` as the trust axis.** Rejected —
  type error: priority is preemption ("who interrupts whom"); trust is autonomy
  authorization ("whose action may skip asking"). Treating Radio's lowest
  priority as lowest trust would make its own refill hit `ask` — but Radio has no
  confirmer (the user is not watching the background), deadlocking it.
- **A two-band read/write impact axis.** Rejected — discards the reversibility /
  blast-radius axis, overloading the trust axis with work it should not do.
- **A distinct lightweight "authorization request" channel for Radio's
  high-impact intent (instead of a Proposal Unit).** Rejected — the
  raise-to-conversation path already lands in the same Proposal Unit machinery;
  a second channel duplicates the confirm/resume/basis-recheck loop.
- **Trust basis as a self-reported tool-call parameter.** Rejected — an
  autonomous run could label itself `user-intent-backed` to skip `ask`; trust
  must be derived at the boundary from unforgeable run provenance.
- **A failed user direct action escalating into a Proposal Unit.** Rejected —
  failure/rejection and pending-approval are different lifecycles, and the gate
  does not apply to the user at all (danger → frontend, staleness → OCC
  rollback). Folding them into one unit conflated ADR-0036 and ADR-0038.

## Consequences

- Each Stage tool declares an impact class (Invocation Policy, the ADR-0015
  side-effect-vs-policy split holds: impact class is policy, not side-effect
  truth). Unclassified ⇒ external-or-irreversible (safe default).
- The four existing auto-pass qualifiers (ADR-0021/0022/0023, plus the Phase-A
  queue/playback widening) are reframed as the `local-bounded × user-intent-backed`
  cell rather than independent booleans; the gate maps the impact-class +
  trust-basis declarations instead of OR-ing one-off flags.
- Radio's `external-or-irreversible` intents never block Radio; they raise a
  Proposal Unit to the conversation side and Radio continues (CONTEXT.md
  "no blocking human-approval step" upheld). Speech Level (ADR-0037 note / PB7)
  governs how that raise surfaces.
- deny lives in a separate pre-gate denylist; the impact × trust table never
  emits deny.
- Phase C's "Effect Boundary `ask` policy" open item is resolved in principle;
  what remains implementation-level is the per-tool impact-class assignment and
  the concrete denylist contents.
- The `external` / `irreversible` split and any per-tool double-confirm are
  deferred until a concrete need (consistent with the project's "don't build the
  full vocabulary early" posture).
- Trust basis is derived at the boundary from actor + run provenance (an
  `issuedFromUserActionId`-style stamp), never a self-reported tool parameter, so
  an autonomous run cannot promote itself to `user-intent-backed`.
- A user setting **ask before source-of-truth edits** upgrades the
  `local-bounded × user-intent-backed` cell to `ask` for tools declaring the
  open, tool-self-declared **`ownerCurationWrite`** marker (library curation /
  durable personal state). It only tightens. `present` (material identity, not
  curation — ADR-0040), `append` (runtime state), and playback do not carry the
  marker; `present`'s coarse `durableUserStateWrite` bit is re-examined under
  ADR-0040 / issue #113.
- The Effect Boundary constrains the agent only. User direct manipulation is not
  gated: danger is a frontend responsibility (no-offer / UI secondary confirm),
  staleness is OCC rollback (ADR-0036). A Proposal Unit has exactly two sources
  (`ask` park, `raise-to-conversation`), both agent effects; the earlier
  "user rejection escalates to a Proposal Unit" path is withdrawn.
- A fuller authorization model (a structured `EffectDescriptor` over
  state-effect / resource-scope / reversibility / data-egress / destructiveness /
  monetary cost, combined with a first-class `AuthorizationGrant` carrying
  principal, allowed effects, scope, limits, provenance, and expiry) was proposed
  in review. It is **not** built now — it is the opposite of this ADR's
  "don't build the full vocabulary early" posture — but is recorded as the
  graduation path if per-tool obligations outgrow the 3×2 heuristic. Only its
  unforgeable causal-provenance idea is adopted now (the trust-basis derivation
  above).
