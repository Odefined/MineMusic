# Phase C — Web Boundary (AG-UI) + Sounding Player Spec

> Status: Planned (C1–C3 in ADR-0036; C2/C3a/C4/C5, provenance spine, transport,
> and WebUI client architecture grilled 2026-07-01 against the post-Phase-B code
> state).
> Owner: Workbench Interface (Workspace Protocol/Events, AG-UI serializer,
> Workbench Action Adapter, A2UI surfaces, lease/liveness), Effect Boundary
> (Proposal Unit confirmation + the ADR-0038 gate), Agent Runtime (proposal
> resume, provenance stamp), Music Data Platform (PlaybackSourceResolver read
> port), Music Experience (verified playback state), Server Host (Web transport,
> local-source HTTP range endpoint), Extension (getPlayableLinks dispatch).
> Parent: `docs/formal-rebuild/agent-native-workbench-roadmap.md` (Phase C).
> Depends on: Phase A (in-process read-model seam, Music Experience queue/
> playback) and the Agent Context Engineering supersession of that seam; Phase B
> (concurrency/OCC, Radio supervisor, PB9 cascade, Main-only `radio.session.*`
> lifecycle tools).
> Authority: planning. Architecture facts live in ADR-0031/0033/0034/0036/0038,
> the Consensus doc, and CONTEXT.md (`Proposal Unit`, `Workspace Snapshot`,
> `User Signal Class`, `Speech Level`).

## Goal

Add the third actor — the human, over the AG-UI Web boundary — and a real
sounding player, layering transport, a user surface, and actual audio output on
the already-proven in-process concurrency model. This is the last mile
(ADR-0031): everything below was validated in process first. A Phase C without
a sounding player is motionless, so the player is in scope, not deferred.

## What Phase B Left That Phase C Consumes (grounding)

Phase C is greenfield on the Web side (no HTTP server, no Workbench Interface
exports, no transport beyond MCP stdio) but builds directly on the Phase B
in-process reality. Code-state facts that shape every decision below:

- Music Experience owns queue/playback/radio-direction/radio-session truth with
  per-concern OCC (PB3). `playNow` is **pure logical truth** — four fields
  (`playback_revision`, `now_playing_material_ref`, `playback_status`), no URL,
  no verification (`music_experience/records.ts`, `contracts/music_experience.ts`).
- The Radio supervisor + PB9 cascade are landed. `ConcernRevisionChange` carries
  `actor: user | main_agent | radio_agent`, runtime-derived from
  `ActorDefinition.runtimePolicy.actorKind`. **The `user` slot is empty in the
  agent path today** — every Main/Radio run stamps `main_agent`/`radio_agent`;
  `user` only appears for external dispatch. Phase C's Workbench Action Adapter
  is what populates `user`.
- Main-only `radio.session.*` lifecycle tools (`start`/`resume`/`pause`/
  `shutdown`/`status`) are the Phase B conversational entry. Phase C attaches the
  real user-button path to the same Music Experience lifecycle command boundary.
- The Effect Boundary gate is the **conservative stub**
  (`effect_boundary/stage_tool_execution_gate.ts`): single axis
  `durableUserStateWrite` + four per-scenario booleans; no impact-class, no
  trust-basis, no actor. **ADR-0038 (impact-class × trust-basis, `ownerCurationWrite`
  toggle, denylist, trust derived from run provenance) is doc-only — not landed.**
  And every durable tool today carries one of the four qualifiers, so nothing
  routes to `ask` in practice. Phase C must build the gate to a usable form.
- NCM **implements** `getPlayableLinks` (`extension/plugins/ncm.ts`) and can
  return a real audio URL from the local NCM service, but there are **zero
  runtime callers** and no `getSourceProviderPlayableLinks` dispatch. Material
  Projection reserves a `"playback"` Source Preference Purpose that is unused.

## C1–C3 — Already Decided In ADR-0036

The three Web-boundary seams were grilled and recorded in ADR-0036; this spec
does not restate them. In build terms:

- C1 — grow the Phase-A read-model seam into the full Workspace Snapshot and add
  the download-only projection under **MineMusic AG-UI Profile v1** (ADR-0031),
  using AG-UI's `StateSnapshot`/`StateDelta` primitives with the profile's own
  capability id, sequence baseline, and gap recovery. Inbound `RunAgentInput.state`
  is dropped at entry (ADR-0036).
- C2 — upstream `WorkbenchActionEnvelope` → Workbench Action Adapter → owning
  command, with a correlated `WorkbenchActionResult`; optimistic prediction is a
  temporary visual bridge; the Workbench surface owns user-action rejection
  feedback (ADR-0036). **Shape fixed below.**
- C3 — one per-workspace transport sequence; gap recovery by full resnapshot (no
  delta-replay buffer in v1); multi-tab equal-writer serialization, de-conflated
  from playback output-device authority (ADR-0036). **Transport fixed below.**

## Provenance Spine — One Stamp, Two Axes (new)

ADR-0038 derives the gate's **trust-basis** (`user-intent-backed` vs
`autonomous-within-grant`) from run provenance, and PB9 derives the cascade's
**actor** (`user > main_agent > radio_agent`) from the writer. The roadmap fixes
these as **different taxonomies** (autonomy authorization vs preemption order)
that share one root fact: the run's actor and its causal link to a user action.
Phase C introduces **one** provenance primitive so the two never diverge:

- **One per-run field:** `issuedFromUserActionId?: string` on
  `ActorRuntimeSession.run()` input. Present ⇔ the run was causally triggered by
  an inbound user action; absent ⇔ autonomous. **Bound once at run start; every
  tool call in the run inherits the same id** (TOCTOU-safe — not per-call).
- **Threaded to the gate:** `StageToolContext` and
  `StageToolExecutionGatePreflightInput` carry `issuedFromUserActionId?` (and the
  existing `actor?` is added to the preflight input). The gate derives
  trust-basis from presence (`issuedFromUserActionId !== undefined` ⇒
  user-intent-backed; absent ⇒ autonomous-within-grant).
- **`actor` stays the cascade axis, untouched.** The Workbench Action Adapter
  stamps `actor = "user"` (or `provenance: "user"` at the command input layer)
  for direct manipulation; agent runs stamp `actor` from `ActorDefinition`. This
  is what finally populates the PB9 `user` slot through the agent path.
- **Web entry stamps it.** A Web user chat message that triggers a Main run is
  the only Phase C Main-run trigger, and it stamps `issuedFromUserActionId`. A
  Radio supervisor wake does not (autonomous). Rejected: overloading the `actor`
  enum with trust (conflates the two axes the roadmap separates); a rich
  `triggerSource` object with an `origin` field that no Phase C decision reads
  (builds vocabulary early); per-call provenance (racy).

The load-bearing distinction this enables, concretely: a user typing "save this"
in chat → Main run (user-causal) → Main calls `library.relation.save` →
`actor = main_agent`, trust = user-intent-backed, toggle on ⇒ park a Proposal
Unit (an agent effect the user must confirm). The same user clicking the ❤️ on a
card → Workbench Action Adapter → relation command directly → `actor = user`,
**gate does not apply** (ADR-0038: gate constrains the agent only) ⇒ save
executes immediately, no Proposal Unit. Both are live user intent; only the
agent-interpreted path can be asked to confirm.

## C2 — Workbench Action Adapter Is A Sibling Command Caller (shape fixed)

ADR-0036 fixes the principle (envelope → adapter → owning command). Phase C
fixes the shape: **the adapter is a new caller of the owning-area command
boundary, NOT a `StageInterface.dispatch` caller, NOT a raw Stage handler
caller.**

- **Two paths to the same commands.** `StageInterface.dispatch` is the
  **agent path** (gate preflight + timeout + output veil + compact agent output).
  The Workbench Action Adapter is the **user path**: it calls owning commands
  directly and owns envelope validation, handle resolution, Signal Class
  assignment, timeout/abort, and `WorkbenchActionResult` shaping + leak
  discipline. Dispatch and the adapter share only the owning commands and the
  handle-resolution helpers. Stage handlers are dispatch-coupled implementation
  details and must not be called raw (calling a handler raw bypasses gate, veil,
  and timeout).
- **Basis only for concern-revisioned commands.** The envelope carries a
  `ConcernRevisionSet` (the client-observed revisions) **only** when the target
  command bumps a concern — Music Experience `queue`/`playback`/`radio-direction`/
  `radio-session`. Relation and Collection commands are Music Data Platform
  source-of-truth (commutative/idempotent), carry no basis, and enter no cascade.
  This refines ADR-0036's "envelope carries the area revision" to "carries it
  iff the target is concern-revisioned."
- **Handle resolution reuses the shared helpers via a thin context shim.**
  `resolveMaterialItemRef` (`music_data_platform/stage_adapter/library_handle_resolution.ts`,
  shared by collection + relation) and `resolveDurableMusicItem`
  (`music_experience/stage_adapter/durable_item_resolution.ts`, shared by queue)
  only need `handleMinting.resolve` + `ownerScope`; the adapter provides an
  equivalent context rather than a second resolver.
- **Routing** is a static `actionType → { owning command, signalClass }` map.
  Signal Class is fixed at entry (CONTEXT.md `User Signal Class`), never
  LLM-judged, so a dismiss is always cleanup and never reaches Memory as taste.

### C2a — Radio Lifecycle Buttons Are Direct User Actions

Phase C owns the real user-button entry for Radio lifecycle; Phase B defined the
semantics and exposed them through Main-only `radio.session.*` tools so the loop
could be tested in process. The Web buttons route to the **same** Music
Experience lifecycle command boundary, with `actor = "user"`:

- **Surface.** Web Radio controls expose `start`/`resume`/`pause`/`shutdown`
  per the current Radio lifecycle state from the Workspace Snapshot. Invalid
  controls are disabled/rejected by the Workbench surface; the server stays
  authoritative on rejection.
- **No agent loop.** A button press sends a typed `WorkbenchActionEnvelope` to
  the adapter, which calls the Agent Runtime Radio lifecycle control / Music
  Experience lifecycle command with `actor = "user"`. It mutates no AG-UI state,
  Radio tables, queue rows, or playback rows directly. Main's `radio.session.*`
  tools remain the Phase B conversational entry for interpreted listener intent.
- **Same semantics, no second state machine.** Queue retention, playback
  co-pause/co-start, transcript fate, session-revision bumps, wake-gate
  behavior, and abort cascade are inherited from Phase B PB10/PB9. A Web pause
  button → `transitionRadioSession(actor: "user")` → bumps `radio-session` →
  PB9 cascade aborts the in-flight Radio refill (`user > radio_agent`).

## C3 — Transport (fastify, SSE + POST + range)

- **One HTTP server in Server Host**, built on **fastify** (not hand-rolled Node
  http; the project keeps deps pragmatic, and fastify's ajv-native schema
  validation aligns with the Stage Interface schema posture). Exact version and
  plugins are plan-level.
- **SSE downstream** — Workspace Snapshot `StateSnapshot`/`StateDelta`, lease
  events, and verified playback state (C5). AG-UI-aligned; `EventSource`-style
  reconnect.
- **POST upstream** — `WorkbenchActionEnvelope` (C2), chat-trigger-Main (stamps
  `issuedFromUserActionId`), and the lease heartbeat (which also carries the
  player's `actualState` for C5 verification).
- **GET audio range endpoint** (C5) — separate route, HTTP Range / `206 Partial
  Content` for seeking/buffering, ownerScope-auth'd via a short-lived opaque
  playback token (Public Handle Veil pattern).
- **Gap recovery = full resnapshot** (ADR-0036); no delta-replay buffer in v1.

## C3a — Workspace Presence + Playback Controller Leases (fully grilled)

C3a introduces explicit liveness leases at the Web boundary — the authority that
keeps Radio and logical playback from continuing after the workspace has no
active Web surface. A grilling + adversarial pass over seven concrete races
fixed the design; six were uncovered by the named guards and are closed below,
one (`unattended-mid-refill`) was verified already-closed by PB3 CAS + the
`music_experience_state` row lock + the Postgres transaction queue + the atomic
in-transaction co-pause.

### Lease model and location

- **Workspace presence lease** `{ ownerScope, workspaceId, clientId, leaseId,
  expiresAt }`, heartbeat-refreshed; normal disconnect releases, abnormal
  disconnect expires by TTL.
- **Playback controller lease** — at most one Web client per workspace owns it;
  others observe. In Phase C this is a **liveness anchor** (its expiry without
  replacement triggers unattended), **not** an action-gating authority.
  Output-device authority (which speaker plays) and server-side per-action
  controller-token gating remain a separate follow-up; per ADR-0036 the lease is
  "the minimum Phase C contract that prevents headless Radio or logical
  playback." UI-level controller-only buttons are a client choice; the server
  treats all present tabs as equal workspace writers.
- **Location: in-memory** (Workbench Interface runtime interaction state), v1
  single Server Host process. This makes the controller-lease authority a
  process-local serialized authority (mutex + monotonic generation) so the
  compare-and-release below is provably atomic. Restart safety is covered by
  startup reconciliation as a synchronous gatekeeper (below). Multi-instance
  deployment would require a durable/shared lease authority — a deferred
  follow-up.

### Controller-lease singleton (closes stale-timer + split-brain)

The spec's named "generation/token check" is a placeholder unless the lease is a
CAS-guarded singleton at **every** transition:

- One serialized authority performs **compare-and-act atomically** for every
  grant, handoff, take, and expiry-release (process-local mutex + monotonic
  generation, e.g. `compareExchange(controllerLease, expected = capturedToken,
  desired = …)`). A stale T1 timer can release only if it is still the current
  token.
- **Granting a new lease cancels/invalidates timers for the prior token**; on
  fire, a timer re-checks under the same authority.
- **Take path is atomic** — a CAS predicate on the prior holder (`WHERE holder
  IS NULL OR holder = prev`, rows-affected == 1) or a `UNIQUE(workspaceId,
  role=controller)` partial constraint — and the take response carries an
  explicit **win/lose verdict** plus a demotion event that flips the loser to
  observer. Without this, "at most one controller" holds only by eventual TTL
  convergence.
- **ADR-0036 cross-reference:** the "No single-controller token" wording is
  explicitly scoped to **equal-workspace-writer concurrency** (multi-tab queue
  edits serializing through the owning command); it does **not** forbid this
  liveness controller-lease singleton.

### Unattended-workspace transition → Radio PAUSE

- When the last workspace presence lease expires, or the active playback
  controller lease expires without a replacement, Workbench emits a typed
  unattended-workspace event routed through owning commands.
- **Radio fate = PAUSE for all unattended triggers** (release and TTL-expiry
  alike). No close-vs-crash differentiation: a bare lease-release on unload is
  ambiguous (navigate-away / tab-close / OS-killed page all fire it), so the
  deliberate-vs-crash intent is not reliably knowable at the lease layer.
  **SHUTDOWN is reserved for an explicit user lifecycle button only.** PAUSE is
  strictly safer for v1 (retains agent instance + transcript; PB8 floor
  survives), and is the only fate compatible with the false-positive recovery
  below; SHUTDOWN-on-unattended would be catastrophic transcript loss on a
  network hiccup. PB10 makes PAUSE and SHUTDOWN OCC-equivalent on `radio-session`
  (both bump + co-pause), so mid-refill correctness is unchanged.
- **Startup reconciliation is a synchronous gatekeeper.** Server startup with no
  valid Web presence or playback-controller lease must reconcile durable Radio
  lifecycle `Running → Paused` and playback `playing → paused` through owning
  commands **to completion before any pacing-watcher or actor-turn evaluation
  may start.** Without this ordering lock, PB1a's wake gate reads pre-reconcile
  durable `Running` truth and starts a turn it never should. The PB1a exhaustion
  record being in-process (lost on restart) is a secondary wasteful-rewake
  concern, not a correctness gap.

### False-positive recovery contract (closes false-positive-expiry)

No named guard touches a heartbeat that is in-flight but delayed past TTL — the
timer fires against the still-current lease. The contract is three layers:

1. **Liveness hedge (mandatory).** Fire the unattended transition only after
   `expiresAt + grace`, with `grace ≥` the maximum expected heartbeat
   round-trip (or equivalently refresh-ahead-of-TTL). Short blips never
   interrupt.
2. **Fast-reconnect un-pause.** A controller lease re-acquired within `K`
   seconds of a just-fired unattended transition auto-issues the inverse command
   (resume Radio + un-pause playback). It applies **only to PAUSE** and never
   resurrects a deliberately-SHUTDOWN Radio (satisfied naturally: a user who
   wants Radio off presses the shutdown button = SHUTDOWN, not close-tab =
   PAUSE).
3. **Recovery floor.** When both above fail, recovery is a single manual resume
   tap (PAUSE fate guarantees a tap, not a fresh start).

### Lease-TTL invariant for the player

`lease TTL + grace ≫` audio buffer depth. Short blips the player's buffer covers
must not also trip the lease into unattended; only genuinely long disconnections
(by which point the audio buffer is also exhausted) pause the music. The two
layers must not fight.

## C4 — Proposal Unit + A2UI Cards

### Phase C must BUILD the ADR-0038 gate (not just wire it)

C4 rests on a gate decision path that does not exist in code. The conservative
stub is insufficient. Phase C builds the gate to a minimum viable ADR-0038 form:

- **Impact class declared per tool** (`read` / `local-bounded` /
  `external-or-irreversible`; unclassified ⇒ highest band).
- **`ownerCurationWrite` marker** (open, tool-declared; "changes the user's
  library curation / durable personal state").
- **Trust-basis derived at the boundary** from `issuedFromUserActionId`
  (provenance spine), never self-reported by the model.
- **The "ask before source-of-truth edits" user toggle**, which upgrades the
  `local-bounded × user-intent-backed` cell from `allow` to `ask` for tools
  declaring `ownerCurationWrite`. Strictly tightening; the dangerous reverse
  (auto-accept) is a separate opt-in mode, never this toggle.
- A separate **denylist pre-gate** for categorically forbidden actions.

The four existing per-scenario auto-pass qualifiers (ADR-0021/0022/0023 + Phase
A queue/playback) are reframed as the `local-bounded × user-intent-backed` cell.

### Producer (locked)

The first real producer of a Proposal Unit is the **`ownerCurationWrite` toggle
on existing local curation tools** (`library.relation.*`, `library.collection.*`).
With the toggle on, a Main run (user-intent-backed) calling e.g.
`library.relation.save` parks: Confirm card auto-emitted → user approves →
resume re-checks Agent Work Basis → commit or `voided_stale`. This gives C4 a
real, demoable, user-controllable closed loop and lands ADR-0038 in code.
Rejected: a provider-side external-or-irreversible action as first producer
(drags an independent provider-write scope into Phase C); mechanism-only with no
producer (builds vocabulary with no consumer); deferring C4 (contradicts the
roadmap).

### PC1 — the Confirm card is auto-emitted, not agent-authored (locked)

The Confirm Action Card is **auto-emitted from the parked Proposal Unit** —
handle + approve/reject actions + a structured description of exactly what will
execute. It keeps **both** layers with different owners: a deterministic
structured fact block projected from the frozen typed command, and a
natural-language **summary field** supplied by the agent. The agent does not
author the surface or the structured facts; it contributes only the summary. The
park → Confirm → approve/reject → `ProposalResolutionEnvelope` → resume →
basis re-check loop is the standard Effect-Boundary human-in-the-loop.
**Default presentation:** music-assistant-first — the summary is primary, the
structured facts present but collapsed by default.

### Confirm card fact groups (locked: shape + examples, enumeration in plan)

- **Derivation rule:** the structured fact block is a deterministic projection
  of the frozen command's typed fields — never hand-authored.
- **Shape every Confirm card carries:** `action verb` + `target handle → public
  description` + `owner-curation effect` + optional `scope`/`position`.
- **Examples:** `library.relation.save` → `{ action: "save", target: [material:abc] →
  "歌曲 X / 艺人 Y", effect: "加入你的收藏库" }`; `library.collection.add` →
  `{ action: "add", collection: [scope:…] → "我的歌单 Z", target: [material:abc]
  → "歌曲 X", position: 3, effect: "加入该歌单" }`.
- Per-command-type field enumeration (relation 6 + collection 7) is plan-level,
  not spec-level, so the spec is not coupled to the full command set or frozen
  field names.

### Falls out / determined by authority (no separate work)

- **Card staleness is automatic.** The Confirm card is a projection of the parked
  Proposal Unit; when its per-concern basis (PB3) goes stale, the projection
  updates and the card reflects/voids via `StateDelta`. On approve of an
  already-stale proposal, resume yields `voided_stale` and Main speaks the
  outcome (CONTEXT.md).
- A2UI rendering, Functional cards, agent-composed Action cards, and proposal
  resume/`voided_stale`/re-propose remain as ADR-0034 / CONTEXT.md fix them.

## C5 — Sounding Player (new, pulled into Phase C)

### Boundary

**PlaybackSourceResolver is a Music Data Platform read port.** Input: a
`materialRef`. It fetches the material's bound sources, ranks them with the
Source Preference Policy at **`purpose: "playback"`** (reserved today, unused by
Material Projection), and returns an ordered list of playable sources. It must
not live in Music Experience (the spec forbids folding playback/access resolution
into logical playback truth) or Extension (which owns provider dispatch, not
material/source choice). The resolver cannot infer choice from the public
`MusicMaterial` contract (which hides source preference); it consumes the
lower-level `boundSourcesForMaterialRecords` + `rankBoundSources` internals, so
it lives inside MDP behind a narrow read port.

A resolved `PlaybackSource` is a short-lived, non-persisted discriminated value:

- `{ kind: "local", sourceRef, rootId, relativePath }` — served by the Server
  Host local-source HTTP range endpoint.
- `{ kind: "provider", sourceRef, playableLink: PlayableLink }` — the player
  fetches the provider URL directly.

### Local audio serving (Server Host)

The Server Host owns a **fastify** HTTP range endpoint that serves local audio
files with `206 Partial Content` / `Accept-Ranges` for seeking and buffering. It
resolves `rootId → rootDir` via the existing `LocalSourceScanRootDirResolver`
(with the `resolveUnderRoot` containment check) and enforces ownerScope. The
client-facing URL carries a **short-lived opaque playback token** minted via the
Public Handle Veil pattern (resolves to `rootId + relativePath + ownerScope +
expiry`), so no path/root id leaks into the wire URL. Playback vs download is a
`Content-Disposition` distinction on the same endpoint.

### Provider audio (Extension dispatch + best-effort direct fetch)

Add `getSourceProviderPlayableLinks(registry, { providerId, sourceRef,
sessionId? })` to `extension/source_provider_slot.ts`, following the
`searchSourceProvider` / `getSourceProviderDownloadSource` pattern. NCM already
implements `getPlayableLinks` (hits the local NCM service `/song/url`); only the
dispatch plumbing is missing. **Scope is local + provider** — the queue is
Radio-filled from provider search, so local-only would leave most of the queue
unplayable. The player fetches the provider URL directly; if CORS or account
requirements block it, the player reports failure through the verification path
(below) and logical truth reconciles — a **server-side provider proxy is a
follow-up, not pre-built in Phase C**, surfaced by the verification layer rather
than hidden.

### Logical intent vs verified actual state (closes the unverified-claim gap)

`playNow` is pure logical intent. The spec requires the agent must not claim
audio played before the Web/player surface verifies it. Phase C splits playback
into two states:

- **Logical intent** — `playNow` sets `playback_status = "playing"` (want-to-play).
- **Verified actual state** — the Web player reports actual events
  (`playing | buffering | ended | failed` + `materialRef`) **by riding the C3a
  playback-controller lease heartbeat** (the lease is already a liveness
  heartbeat; it carries one more field, `actualState`). The owning Music
  Experience command reconciles verified truth from the heartbeat.

Workspace Context exposes the **verified** state to the agent; the agent may not
claim "now playing" until verified. A provider direct-fetch failure (CORS,
account, 404) arrives as `actualState: "failed"` → reconcile → the limitation is
visible, not silent. This is the mandatory accompaniment to "real audio output."

## WebUI Client Architecture (React on the AG-UI protocol, not CopilotKit the framework)

The WebUI is a React + TypeScript single-page client. A reuse evaluation against
the current (2026-07) CopilotKit/AG-UI/A2UI API surface fixed the shape: **reuse
the AG-UI wire-format packages and the A2UI renderer; do not adopt the CopilotKit
runtime/provider.** The reusable ~35% is the AG-UI protocol seam
(`@ag-ui/client` + `@ag-ui/encoder` + `@copilotkit/a2ui-renderer`), which is
decoupled from CopilotKit's runtime — it does not require mounting `<CopilotKit>`
or running CopilotRuntime. The ~50% custom is everything MineMusic-semantic; the
~15% fight is the queue, where `useCoAgent` is the literal anti-pattern ADR-0036
forbids.

### Reused (the AG-UI protocol seam)

- **Server** — MineMusic's fastify (C3) imports `@ag-ui/encoder` `EventEncoder` to
  emit `StateSnapshot`/`StateDelta` (RFC 6902) + AG-UI message/tool/step/interrupt
  events. ~40 lines of handler; **zero CopilotKit code server-side.**
- **Client read side** — `@ag-ui/client` `HttpAgent` pointed at the fastify
  endpoint; subscribe to `onStateSnapshotEvent`/`onStateDeltaEvent`/
  `onMessagesSnapshot`/`onToolCall*`. `agent.state`/`agent.messages` are read-only
  (the ADR-0031 download-only consumer, off-the-shelf — not hand-rolled).
- **Cards** — `@copilotkit/a2ui-renderer` + `createCatalog` with BYOC React
  components for the fixed ADR-0034 catalog. A2UI is a declarative one-way push
  model independent of the rejected `useCoAgent` reducer.
- **Proposal transport** — only the AG-UI `RunFinished.interrupt` outcome +
  `resume[]` envelope are borrowed as the park/approve transport.

### Custom (everything MineMusic-semantic)

The sounding player + `PlaybackSourceResolver` + verified-actualState (C5); the
`WorkbenchActionEnvelope` write path + per-concern OCC + optimistic rollback
(C2); multi-tab equal-writer serialization + the CAS-guarded controller-lease
singleton liveness (C3a); the ADR-0038 provenance-derived gate + basis-recheck /
`voided_stale` (C4); the Main + Radio transcript merge; Chat (built on the AG-UI
message events, not CopilotKit's `CopilotChat`, because `CopilotChat` requires
the `<CopilotKit>` provider and is single-agent-per-call — incompatible with the
no-runtime stance and the two-writer transcript).

### Fight (do not use CopilotKit here)

The queue and any contended state: `useCoAgent`/LangGraph reducer **is** the
anti-pattern ADR-0036 forbids (a merge-reducer cannot adjudicate revision
staleness or two agent loops writing concurrently). The Proposal trigger stays
provenance-derived (C4), not CopilotKit's tool-call-approval framing.

### Guardrails (the "do not" list)

- **No `<CopilotKit>` provider, no CopilotRuntime.** The supported production path
  requires the Node CopilotRuntime; pointing CopilotKit directly at the fastify
  AG-UI endpoint is `agents__unsafe_dev_only` ("not recommended for production /
  not officially supported"). MineMusic's fastify owns the transport.
- **No `useCoAgent`** (rejected bidirectional reducer state).
- **No `useFrontendTool`/`useCopilotAction` for user writes.** CopilotKit's action
  model is agent→frontend (the handler result feeds back into the agent run), with
  no typed-envelope/OCC primitive. User-direct writes (queue edits, Radio buttons,
  card ❤️) are plain `fetch` POST of `WorkbenchActionEnvelope` outside CopilotKit.
- **No `useInterrupt.render`.** The Confirm card is an A2UI card from the fixed
  catalog (PC1), not arbitrary JSX; the trigger is provenance-derived, not a
  tool-call approval.
- **`agent.state` is read-only.** Never spread/write it; never call `setState`.
  Add a forbidden-write project guard (test or frozen-projection wrapper). Pure
  `@ag-ui/client` `HttpAgent` is inherently safer (the write-back path is not
  wired).
- **Version pins.** `@ag-ui/client` 0.0.45–0.0.57 family + `@ag-ui/encoder`;
  `@copilotkit/a2ui-renderer` minor-locked against **A2UI v0.9.1**. Confirm exact
  `.d.ts` signatures against installed `node_modules` before locking.

### A2UI version pin

**A2UI v0.9.1** (stable Current on the A2UI roadmap, 2026-07), not v1.0
(Candidate; message/action semantics still changing). The MineMusic-owned card
DTO + swappable version-pinned serializer (ADR-0034) is the anti-corruption layer
that absorbs the eventual v1.0-final swap, so the pin is isolated to the
serializer.

### snapshot ↔ component binding (derived, mechanical)

| Workspace Snapshot slice | PRD component it drives |
| --- | --- |
| `queue` (+ `queueRevision`) | Queue Card (compact tile + expanded cover grid) + Music Playback "Up Next" affordance — one truth, three projections |
| `nowPlaying` + verified `actualState` | Music Playback → now-playing / scrubber / error state |
| `radioTruth` (motif / variations / lean / direction summary) | Radio Card |
| `radioSession` lifecycle state | Radio Card controls (start/resume/pause/shutdown per state) |
| `recommendationBatches` | Recommendations Card |
| `libraryCatalog` projection | Library Card |
| parked Proposal Units (C4) | Confirm Action Cards (auto-emitted, A2UI) |
| Main + Radio transcripts (AG-UI messages) | Chat (custom, merged) |
| AG-UI `TOOL_CALL_*`/`STEP_*` (Speech-Level-gated) | Agent work trace (optional, result-first) |
| `selectedObject` handle | Selected-Object-in-Chat strip |
| `playbackControllerLease` | per-tab controller/observer UI |

### Layout (Workbench — grilled)

Spatial organization is fixed at the spec level; finer details (sizing, exact
proportions, mobile-responsive breakpoints) remain implementation-level per the
PRD's "visual layout is adjustable" stance.

- **Workbench layout** — Chat (left, wide, always-present) + Functional Cards
  rail (right: compact cards + one expanded into the remaining workspace,
  preserving Chat + Playback) + Music Playback bar (bottom, always-present:
  now-playing, controls, minimal "Up Next" affordance). Chat and Music Playback
  are the co-equal always-present cores; neither is primary (PRD: "Chat must not
  become the only main experience, and Radio must not become an isolated mode").
- **Queue is a Functional Card, not a player-internal panel.** Queue is the 4th
  Functional Card (alongside Radio / Recommendations / Library): compact on the
  surface (next-cover thumbnail + count + state + "open"), expanding into a full
  cover-art grid with object actions (play / remove / reorder / send-to-Radio-
  motif). The Music Playback bar keeps a minimal queue affordance ("Up Next: N" /
  next cover, clickable → expands the Queue Card) so the PRD's "queue is part of
  Music Playback" still holds. Compact card, player affordance, and expanded grid
  all project the same queue truth (download-only); writes flow through the
  Workbench Action Adapter (C2) with per-concern OCC — unchanged by the card
  being a card (it is a view, not a writer).
- **One Functional Card expanded at a time** (PRD rule) — expanding Queue compacts
  Radio / Recommendations / Library.
- **Action Cards** (Confirm / Choose / Apply To / Open) appear in Chat or in the
  originating Functional Card.

## Handle Reuse (Web vs Agent)

The Web object reference is an opaque public handle — but for **boundary +
action-authorization** reasons (don't leak internal storage refs to the browser;
bound what a Web/A2UI action can target to validated owner-scoped handles),
**not** the agent veil (which constrains an untrusted reasoning agent and does
not apply to the user). The Public Handle is **not** an object capability:
resolution requires `ownerScope + handleKind + publicId` and validates the caller
against the owner — possession alone authorizes nothing. It is an **opaque
public object reference (`PublicObjectRef`) plus contextual authorization**.
Every action re-validates principal, owner, workspace, handle kind, allowed
operation, and lifecycle. If genuine delegation is ever needed, that is a
separately minted scoped/expiring `ActionCapabilityToken`. The same
`HandleMintingPort` serves both surfaces; workspace object handles are shared
between agent and Web DTOs (the "Web vs agent DTO split" is the wrapper, not the
value); ephemeral agent-only handles (search candidates, lookup cursors) never
reach the Web.

## Deferred / Out Of Scope

- **Memory / taste:** after Phase C.
- **Bounded delta-replay buffer** (ADR-0036): until resnapshot cost proves
  insufficient (workspace state grows large, or flaky-mobile reconnect frequency
  makes full resnapshot felt). Not pulled in by the C3a fast-reconnect path —
  fast-reconnect is agent/playback state recovery; view resync is orthogonal and
  still full-resnapshot.
- **Per-action controller-token gating / playback output-device authority:** the
  C3a controller lease is a liveness anchor only in Phase C; server-side gating
  of controller-scoped actions graduates with the output-device follow-up.
- **Provider audio server-proxy:** if browser direct-fetch of provider URLs is
  CORS/account-blocked in practice; surfaced by the verification layer, not
  pre-built.
- **Open-ended/declarative A2UI generation beyond the fixed catalog:** preserved
  by the MineMusic-owned card DTO + version-pinned A2UI serializer (ADR-0034).

## Open (implementation)

- **Per-tool impact-class assignment + the concrete denylist contents**
  (ADR-0038). The two-dimensional gate shape is fixed; the assignments are not.
- **Lease numbers:** `TTL`, `grace`, fast-reconnect window `K`, heartbeat
  cadence — constrained only by `TTL + grace ≫` audio buffer depth.
- **fastify version + plugins** (e.g. `@fastify/static` for range), route shape.
- **PlaybackSourceResolver exact read-port shape** and whether `purpose:
  "playback"` gets a `purposeOverrides` entry distinct from the default
  `local_file > netease > qq` order.
- **Verified-playback Music Experience schema columns** (a verified-state field
  / timestamp) and the exact `actualState` enum carried on the lease heartbeat.
