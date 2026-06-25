# Music Experience History Spec

> Status: Design (grilled + detail-polished 2026-06-26); pre-implementation. Music
> Experience History is deferred to the post-C Memory phase (roadmap
> "Cross-Cutting / Later"; phase-B PB8 deferred the play-history /
> listening-outcome record to be "designed whole in the Memory phase"). This spec
> fixes the **domain model and the write/read shape** of that record. It does not
> specify the Memory consumer's proposal logic, the taste artifact, or a build plan.
> Owner: Music Experience.
> Parent: `docs/formal-rebuild/agent-native-workbench-roadmap.md`
> ("Cross-Cutting / Later" — Memory).
> Depends on: Phase B (Music Experience queue/playback truth + command,
> per-concern OCC); Phase C (Workbench Action Adapter, Signal Class at entry).
> Authority: design. Taste philosophy is fixed by **ADR-0041**; the term boundary
> by `CONTEXT.md` (`Music Experience History`).

## Goal

Define what Music Experience History stores, how it is written, and how it is
read — the behavioral signal substrate the later Memory phase consumes for
taste proposals. This fills the design gap PB8 deferred and resolves the
"richer signal substrate" question ADR-0041 left open.

## What It Is

Music Experience-owned, material-anchored, structured objective history of
events that **actually happened** in the music experience. It is the behavioral
signal substrate beneath the editable taste layer; it is **not** Memory, not
inferred taste, not UI cleanup, not an agent tool log, not a debug trace. See
`CONTEXT.md` (`Music Experience History`) for the term boundary.

## Three Purposes (these drive every other decision)

1. **Summaries (历史总结)** — time-window aggregates (daily/monthly/yearly) by
   material (→ artist/genre/source joined from Material Store): counts,
   outcomes, cumulative duration. The consumer is **Main agent** (reads History,
   aggregates, answers in conversation) — see Read Model.
2. **Dedup (排序去重)** — "was this material recently played / exposed?" point
   lookups by material + recency window. Two scopes: **played-dedup** (over
   partial/complete records, longer window) and **exposure-dedup** (over exposed
   records = card presentations, shorter window).
3. **Taste proposal evidence (口味 proposal 证据)** — Memory reads History to
   detect behavioral patterns and **propose** taste entries the user confirms
   (ADR-0041 decision 3). History is **not** a taste score and Memory never
   derives taste from it directly; behavior becomes taste only through confirmed
   proposals.

## Stored Facts (the minimal set)

- **engagementId** — correlation key (see Unit).
- **materialRef** — internal anchor; characteristics (artist/genre/source) are
  **not** stored — joined from Material Store at read time.
- **time** — when the event landed.
- **outcome** — two fields (see Outcome Model).
- **triggerSource** — which path placed the material on the surface (see
  Trigger-Source).
- **magnitude** — **conditional**: only populated for `(partial, user-skip)` and
  `(partial, user-remove)` — the seconds heard before a user-initiated cut of a
  playing track. Absent for complete / system-cut / exposed. Complete's heard
  time is derived from Material Store duration.

No session / radio-direction anchor: none of the three purposes needs one (all
are time-window queries).

## Outcome Model — two fields, five valid combinations

`progress` (how far the user got):

- `exposed` — **present-only**: a MusicCard was shown and the user has not
  played it. Only an agent `present` opens an engagement here.
- `partial` — playback occurred (became now-playing, some audio played). The
  playback path opens here and **never passes through `exposed`**.
- `complete` — played to natural end.

`terminal` (how it ended):

- `natural-end` | `user-skip` | `user-remove` | `system-cut`.

(`passive` is folded out: every close has a specific cause — a track leaves the
surface only by being played, removed by the user, or displaced/ended by the
system. FIFO queue advancement plays the next-up track; it does not skip it.)

| progress | terminal | taste | magnitude |
|---|---|---|---|
| complete | natural-end | + | — (derive from Material Store duration) |
| partial | user-skip | − | seconds heard before skip |
| partial | user-remove | − | seconds heard before remove |
| partial | system-cut | ~ | — |
| exposed | system-cut | no signal | — |

Constraints:

- `progress = exposed` ⟹ `triggerSource = agent` (only `present` opens exposed).
- An `exposed` engagement either advances to `partial` (the user plays the card)
  or terminates as `system-cut` (never played, displaced/session-ended). There is
  no `(exposed, user-skip)` (skip is a playback action) and no
  `(exposed, user-remove)` (card dismiss is UI cleanup, not a History event).
- `magnitude` is written only at a user-initiated cut of a playing track.

Taste guard: signal keys off **whether the user engaged (playback) and actively
cut**, not off who cut. `exposed` (never engaged) carries no signal regardless of
terminal; `complete` = +; `user-skip` / `user-remove` = −; `system-cut` = ~. This
matches ADR-0041 (cleanup is never a taste source; behavior reaches taste only
through proposals).

## Exposure

An **exposure** means a material became **now-playing** or was **presented to
the user as a MusicCard** via `music.experience.present` — two UI-independent
domain events. Merely being queued, or selected into a candidate batch, is **not**
an exposure; being queued but not yet now-playing is not an exposure either.

"Visible next-up" is deliberately **not** exposure: it couples to UI
(viewport / scroll / panel size), and History is Music-Experience domain state,
not rendering state. The cost (losing dedup for tracks glimpsed in a next-up list
but never played) is acceptable — the user never engaged them.

`progress = exposed` arises only from the present (MusicCard) path. The playback
(now-playing) path opens at `partial` and never passes through `exposed`.

Card-dismiss is UI cleanup, **not** a History event (`CONTEXT.md` _Avoid_;
Signal Class assigns dismiss to cleanup at entry). It neither writes nor closes
the engagement; the engagement closes on playback or session/process end.

## Unit = Engagement

One record = one **engagement**: a material presented once, advancing to a
terminal.

- **Opens**:
  - present path → `progress = exposed`, `triggerSource = agent`.
  - playback path → `progress = partial` (became now-playing), `triggerSource ∈
    {user, radio}`.
- **Closes** at a terminal event (`natural-end` / `user-skip` / `user-remove` /
  `system-cut`).
- **Re-presentation after close = a new engagement** (new id). Same material
  played 3 times = 3 records. Repeat and cross-session replay are new
  engagements.
- **engagementId** is minted at open and carried through — the playback engine's
  play-attempt and user skip/remove actions target the current id, so
  progress/terminal updates attach to the right record.
- **triggerSource is set at open and immutable** (see Trigger-Source).
- **Dangling engagements** (process crash / session end before any terminal) are
  swept to `system-cut` at session/process end. `system-cut` carries no
  `magnitude`, so **no playback-position recovery is needed**.
- **Resume vs restart** of a paused track follows the playback engine's
  play-attempt contract (deferred — a separate product decision).

### 切歌 (user switching tracks)

User cutting the **now-playing** (`partial`) track to play another:

- **Cut track**: `terminal = user-skip`, `magnitude = seconds heard so far`
  (written at the cut). Engagement closes.
- **Switched-to track**: a new engagement. Its `triggerSource` distinguishes the
  cut kind — user jumped to a specific track / pressed previous → `user`; user
  only pressed next and Radio's queue supplied it → `radio`.
- **Not 切歌**: auto-advance on natural completion → the advanced-from track
  `terminal = natural-end`. Removing a not-now-playing item (next-up / card) is a
  queue edit or cleanup, **not** a History event; only removing the now-playing
  track is `user-remove` (with `magnitude`).

History records `user-skip` as a **fact**; it does **not** judge whether a skip
means dislike. "Move-on" skips are noise that Memory's pattern-level proposal
gate (ADR-0041) handles downstream — a single skip never silently becomes taste.

## Write Model (C) — side-effect of state-transition commands

History engagement writes are a **mandatory side-effect of the Music Experience
state-transition commands** (became-now-playing / playback-terminal / skip /
remove / queue-replaced / session-end-sweep), in the **same command transaction**
as the state change. No separate History write surface; no event-sourcing /
projection infrastructure. Rationale: "actually happened" is enforced at the
command level — state cannot change without the history being recorded, so
History cannot diverge from reality. The CLAUDE.md write-boundary rule holds
(writes go through the owning Music Experience command).

`magnitude` is written once, at the user-cut moment (skip/remove), from the
playback position current state holds at that moment. There is no per-second
write and no flush-at-close for non-cut terminals — live playback progress stays
in current playback state, not History.

OCC: History writes **ride the state-transition command's** per-concern basis
(Phase B queue/playback revisions); there is no separate OCC on engagement rows.

Rejected alternatives:

- **(A) Projection from a Music Experience event stream** — most faithful by
  construction, but Music Experience is not event-sourced today (Phase B is
  OCC-state, not an event log); (A) requires adding event emission first.
- **(B) Separate "record engagement" command surface** — explicit, but creates
  double-truth: a path that forgets to call it leaves History diverged from
  reality.

## Read Model — one face, raw records

History exposes **one read face**: raw engagement records filtered by dimension
(material / time-window / terminal / progress). Consumers aggregate and join
themselves:

- **Dedup** (Radio): point lookup on `(materialRef, time)` over partial/complete
  records (played-dedup) and over exposed records (exposure-dedup).
- **Summaries**: Main agent does a time-window scan + group, joining Material
  Store for characteristics and deriving complete-track duration. No dedicated
  summary service or stats page in v1 (MineMusic is agent-native; summaries are
  answered in conversation).
- **Memory**: time-window scan + pattern detection over terminal / magnitude /
  triggerSource (join Material Store for characteristics).

History does **not** compute taste scores or summary statistics, and serves no
materialized per-consumer projection in v1. Characteristics are the consumer's
to join from Material Store, never History's to store. This keeps History from
drifting from "objective history" toward "serving derived taste / summaries." A
projection is added later only if a consumer's query becomes a hotspot.

## Trigger-Source — path-based, immutable, not intent-based

`triggerSource ∈ { user, radio, agent }`, determined at **engagement open** by
**which path placed the material on the surface** (a deterministic fact at the
command boundary), **not** by interpreting conversational intent. **Set once at
open; immutable.**

- `user` — direct UI selection (clicked/tapped a specific track; or jumped to /
  pressed previous on a specific track, even one Radio had queued).
- `radio` — Radio autoplay advanced it (user pressed next and the queue supplied
  it; user did not select this specific material).
- `agent` — Main agent's `music.experience.present` placed it (also the only
  path that opens at `exposed`).

Chat-originated requests ("play Take Five", "play some jazz") all flow through
`present` and are recorded as `agent`; History does **not** try to distinguish
"user named it in chat" from "agent picked it" — that is an LLM judgment and
violates the User Signal Class principle (CONTEXT: product facts are fixed at
entry, not LLM-judged). The strong user-choice signal is `user` (direct
selection) only. Consumers may collapse `radio` + `agent` → `system` if they do
not need the distinction.

## Retention

Durable; **no automatic pruning**. Summaries need yearly spans and taste needs
long-term trends; pruning destroys that value. Volume is bounded (one record per
presentation) and Postgres-sustainable. Only user-initiated deletion removes
records.

## Open / Deferred

- **Memory consumer & taste artifact** — proposal detection logic, editable
  taste structure, scene partitioning: the items ADR-0041 reserves for the
  Memory phase. Out of scope here.
- **Resume vs restart** of a re-selected paused track — follows the playback
  engine's play-attempt contract (a separate product decision).
- **Agent self-report flag** ("I followed a user-named item vs I picked freely")
  — the only non-LLM way to refine `agent`; agent-owned, not History-owned. Not
  built unless a purpose needs it.
- **Per-consumer read projections** — only if a read becomes a hotspot.
- **Exact write timing per transition** — settled at build time against the
  Phase B command / OCC apparatus.
