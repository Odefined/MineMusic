# Phase C — Web Wire Contract (Frontend↔Backend Interface Specification)

> Status: **Owning container; Parts 1–2 frozen** — Part 1: downstream event
> envelope (state slices + message/activity event streams), shared types,
> UI-neutrality corrections, and the workspace-scoped library query endpoint.
> Part 2: upstream envelope family, POST response + `action.result` channel,
> `actionType` registry (32 names), and per-action payload shapes (§5.6).
> Envelope structure, result channel, actionType names, and all 32 payloads
> are frozen. **Part 3 (audio GET, §6) frozen 2026-07-02**; **Part 4 (connection,
> §7) frozen 2026-07-02**; **Part 5 (shared enums + outcome mapping, §8) frozen
> 2026-07-02**. §1.4/§2.8/§3.5/§5.8 revised 2026-07-02: transcripts are per-run
> (no wire-level merge, no per-message `actor`); transport C — the Main run rides
> the chat POST response, the Radio run + state + `action.result` ride the
> workspace persistent stream. §5.6/§5.8 also revised 2026-07-02: `main.abort`
> termination — the aborted run's POST response ends with `TEXT_MESSAGE_END`
> (any in-flight message) + `RUN_ERROR(code:"aborted")`. §2.2/§2.11/§5.6/§7 +
> boundary-spec C3a revised 2026-07-02: **controller lease cut** (presence-only,
> §2.11/§7); audio is not backend-arbitrated — single-tab assumed, follows
> logical; play/pause/resume/skip promoted to logical actions (registry 29→32);
> unattended stops playback, Radio untouched.
> Authority: The owning container for the Phase C frontend↔backend wire
> contract. Only completed parts marked frozen are implementation-ready contract
> truth; pending parts are placeholders until their sections are completed.
> Boundary decisions live in
> [`phase-C-web-boundary-spec.md`](phase-C-web-boundary-spec.md); this document
> fixes their concrete interface shape part by part. Every frozen field here is
> the contract WebUI implements against and the backend freezes first, fully
> decoupled from WebUI visual/layout/component design.
> Principle: **UI-shape-neutral** — overturning the WebUI's visual, layout, or
> component design must require zero backend contract changes. Every field is
> derivable from owning-area truth, operation semantics, or agent context —
> never from "how the UI presents this." A voice-first surface and a flat CLI
> both consume the identical contract.

## 0. General

- **Transport scope of this document**: downstream — two channels (§1.4,
  transport C): the workspace persistent SSE stream (`StateSnapshot`/`StateDelta`
  + `action.result` + Radio-run messages) and the chat POST response (the Main
  run's AG-UI stream). Upstream POST (Part 2) is frozen; audio GET is Part 3
  (§6, frozen); the connection protocol is Part 4 (§7, frozen).
- **Encoding**: AG-UI `StateSnapshot`/`StateDelta` (RFC 6902 JSON Patch scoped
  to the changed area subtree) over a MineMusic-owned DTO (anti-corruption
  layer isolating the `@ag-ui/encoder` pin and the future A2UI v1.0 swap).
- **Identity**: `ownerScope` + Workbench Interface-owned `PublicObjectRef`.
  Possession of a handle authorizes nothing — resolution validates `ownerScope
  + handleKind + publicId + caller`. Material refs may reuse the existing Stage
  material handle registry; `scope`/`batch`/`proposal` are not Stage
  `MusicItemHandleKind`s and must not make Stage Interface the Web object
  registry owner.
- **Sequence**: one per-workspace transport sequence, distinct from per-area
  OCC revisions. Gap recovery = full resnapshot (no delta-replay buffer in v1).
- **Multi-owner invariant**: every slice traces to exactly one owning area.
  Enforced by the PC4 slice-origin guard (§3.8) — no field may exist without an
  owning-area origin.

## 1. Shared types

### 1.1 `WireMaterialProjection`

The wire-facing material projection. Reused wherever a slice refers to a
material: queue items, `nowPlaying`, radio `motif`/`activeVariations`/`lean`
(of kind `material`), recommendation MusicCards, libraryCatalog
recentImports, parked-Proposal targets, and `selectedObject` focus.

**Definition**: `MusicMaterial`
(`src/contracts/music_data_platform.ts`, `MusicRecording | MusicAlbum |
MusicArtist`) with two mechanical transforms:

1. `materialRef` → public `handle` (via the Workbench `PublicObjectRef`
   adapter, reusing `HandleMintingPort` for material refs where applicable).
2. remove `sourceNavigationLinks` (a presentation resource — see §1.3).

Fields by kind (after transform):

- recording: `{ handle, kind: "recording", title, artistLabels, albumLabel?, trackPosition?, durationMs?, availability, versionInfo? }`
- album: `{ handle, kind: "album", title, artistLabels?, releaseDate?, availability, versionInfo? }`
- artist: `{ handle, kind: "artist", name, aliases?, availability }`

**Owner**: Music Data Platform (material identity). The existing narrow
`MusicExperienceWorkspaceItemSummary` (`src/contracts/music_experience.ts`) is
superseded by this full projection; PC0 lifts it to a shared contract and PC4
switches `MusicExperienceWorkspaceProjection` and the catalog path to emit it
instead of the narrow summary.

**Explicitly not in `WireMaterialProjection`**: cover/picture URL, lyrics,
navigation URLs (presentation resources — §1.3); internal identity keys
(isrc/mbid — MDP-internal dedup, not agent/UI-facing); scan-root audio
technical metadata. Future library-management attributes (import source,
quality, dupe state, tags) also do **not** belong here — they ride a future
management-detail projection so the common projection stays clean.

### 1.2 `PublicObjectRef`

Opaque handle, format per kind. **Object kinds**: `material`/`batch`/`proposal`
= `[kind:publicId]`. **Scope kinds** (1:1 with live `formatMusicScopeHandle`):
`library`=`[library]`, `source_library`/`relation`/`collection`=`[kind:id]`.
Open-kind set — adding a kind later does not break the contract.
Resolution requires `ownerScope + handleKind + publicId + caller` validation;
possession alone authorizes nothing (not an object capability).

**Owner**: Workbench Interface. `PublicObjectRef` is the Web/Workbench object
reference wrapper. A `material` ref may wrap/reuse the existing Stage
`[material:...]` handle binding; `scope`, `batch`, and `proposal` refs are
resolved by the Workbench Interface / owning-slice adapter and are not added to
Stage Interface's `MusicItemHandleKind`. This keeps Stage Interface as the
agent-facing handle veil instead of turning it into the Web object registry.

### 1.3 Presentation-resource channel (independent, never in slices)

`cover`/picture URL (`SourceProvider.getEntityPictureUrl`), lyrics
(`getSongLyrics`), and `sourceNavigationLinks` are **runtime presentation
resources**: time-sensitive (provider URLs expire), multi-source, on-demand.
They do not enter snapshot slices. The frontend resolves them by material
handle through dedicated batch endpoints; voice/CLI surfaces never fetch them.

Rationale: these are runtime-fetched resources, not durable material facts. MDP
already separates them from `MusicMaterial` (the picture/lyrics capability
ports vs the identity projection). Putting them in a slice would either cache
expiring URLs (broken images) or force MDP to store a stable picture identity
it does not have today (a schema change). The slice fields are governed by
owning-area truth and operation semantics, not by UI display needs.

### 1.4 Downstream event envelope (frozen: state + messages + action.result)

Downstream delivery uses **two transport channels** (transport C):

1. **Chat POST response** — when a `ChatMessageEnvelope` (§5.8) triggers a Main
   run, that run's AG-UI event stream is the HTTP response body of the POST:
   `RUN_STARTED` … `transcript.*` / `activity.*` … `RUN_FINISHED`. It is
   consumed by `@ag-ui/client`'s `HttpAgent` + `verifyEvents` (the standard
   one-POST-one-run fit — the response *is* this run's stream). This channel
   carries **only the Main run** (the only chat-triggered run).
2. **Workspace persistent stream** (SSE GET, long-lived) — carries everything
   that is not the Main run's live output: `workspace.snapshot` /
   `workspace.delta` (state), `action.result` (CUSTOM, §5.3), and the **Radio
   run's** `transcript.*` / `activity.*`. Radio is autonomous (supervisor-wake,
   no user POST), so it has no POST-response channel and rides this stream. It
   is consumed by a self-built SSE consumer (`parseSSEStream` + a hand-written
   reducer + `applyPatch`), **not** `HttpAgent` / `verifyEvents`.

The envelope below is the **workspace persistent stream** event family. The
event *types* are AG-UI-standard; `transcript.*` / `activity.*` appear on this
stream only for the Radio run — the Main run emits the same event types inside
its chat POST response (§5.8), not on this stream. MineMusic logical names map
to AG-UI EventType literals at the serializer seam — the encoder does **not**
rewrite `type`, so the server must emit the literal AG-UI EventType.

```
WorkbenchDownstreamEventEnvelope:            // workspace persistent stream only
  eventId: string
  workspaceId: string
  sequence: number                         // per-workspace transport sequence; shared across this stream's families
  emittedAt: string
  event:
    | { type: "workspace.snapshot", snapshot: WorkspaceSnapshot }                       → STATE_SNAPSHOT
    | { type: "workspace.delta", baseSequence: number, patch: JsonPatchOperation[] }   → STATE_DELTA
    | { type: "transcript.message_start", messageId, role? }                            → TEXT_MESSAGE_START   (Radio run only, on this stream)
    | { type: "transcript.message_content", messageId, delta: string }                 → TEXT_MESSAGE_CONTENT
    | { type: "transcript.message_end", messageId }                                    → TEXT_MESSAGE_END
    | { type: "transcript.messages_snapshot", messages: TranscriptMessage[] }          → MESSAGES_SNAPSHOT (Radio resync)
    | { type: "activity.snapshot", messageId, activityType, content, replace? }        → ACTIVITY_SNAPSHOT
    | { type: "activity.delta", messageId, activityType, patch }                      → ACTIVITY_DELTA
    | { type: "action.result", correlationId, outcome, reason? }                      → CUSTOM (name:"workbench.action_result", §5.3)
```

- **Two event families** (ADR-0031): **state** (`workspace.*` — the §2 slice
  union, RFC 6902 patch) and **messages** (`transcript.*` assistant message
  lifecycle + `activity.*` agent work). `activity.*` is **not** a separate family — AG-UI
  activity is a `role:"activity"` message, so `activity.*` rides the messages
  family alongside `transcript.*`. `transcripts` and activity are **not** state
  slices; they ride their own AG-UI message event streams, not
  `workspace.snapshot`.
- **Routing is by carrying channel, not runId** (transport C): Main-run
  `transcript.*` / `activity.*` arrive on the chat POST response → Chat;
  Radio-run `transcript.*` / `activity.*` arrive on the workspace persistent
  stream → Radio panel. The channel the event arrived on *is* the route — no
  per-message `actor` field and no runId dispatch (§2.8). Main and Radio are
  still independent runs with distinct `runId`, but the frontend does not
  inspect `runId` to route — it inspects which stream carried the event.
- **Streaming**: `transcript.message_*` carries the assistant message lifecycle
  (pi-agent-core `message_*` → AG-UI TEXT_MESSAGE_*); the frontend concatenates
  `message_content.delta` by `messageId`. `message_start` carries only
  `messageId` (+`role`), `message_end` only `messageId` — content arrives via
  `message_content`. `messages_snapshot` resyncs that run's thread
  (reconnect/compact). `activity.snapshot` updates the `role:"activity"`
  message for the current run (`replace` swaps content).
- **Sequence (workspace persistent stream only)**: transport ordering/gap
  detection, shared across that stream's families. Assigned by a per-workspace
  emit serializer (process-local mutex, single Server Host v1) —
  sequence-then-write is atomic, so concurrent slice commits cannot tear the
  sequence. Distinct from `ConcernRevisionSet`, never OCC. The chat POST
  response carries **no** MineMusic transport sequence — it is a one-shot AG-UI
  run stream; a broken Main-run response is recovered by transcript resync
  (§5.8), not by sequence gap-replay.
- **Gap recovery (workspace persistent stream, client-pull, self-built)**: the
  consumer tracks `lastAppliedSequence`; on a `workspace.delta` whose
  `baseSequence` ≠ `lastAppliedSequence`, or on an `applyPatch` failure (the
  client does not throw — it silently `console.warn`s), the client POSTs a
  resync and receives a fresh `workspace.snapshot` + the Radio-run
  `transcript.messages_snapshot`. `@ag-ui/client`'s `defaultApplyEvents` does
  **not** read `baseSequence` — gap detection is MineMusic's, on the self-built
  consumer.
- **No business-event truth for state**: queue/radio/proposal/playback/library
  changes become state in `workspace.snapshot` + RFC 6902 deltas; the frontend
  must not reconstruct workspace state by replaying events. (The message and
  activity streams ARE event logs by nature — appended, not state-patched.)

## 2. Snapshot slice union (Part 1)

The **state** slice union — 9 slices (§2.1–§2.7, §2.10–§2.11), the
`workspace.snapshot` payload. §2.8 `transcripts` and §2.9 `activity` are
listed under §2 for proximity but are **not state slices** — they ride AG-UI
message event streams (`transcript.*` / `activity.*`, §1.4). Every slice below records
fields, owning area, source (durable vs in-memory), Phase C increment,
UI-neutrality, and code provenance. `StateDelta` carries RFC 6902 patches scoped
to the changed slice subtree.

### 2.1 `queue`

```
queue slice:
  queueRevision: ConcernRevision
  items: Array<WireMaterialProjection & {
    position: number                                            // dense
    provenance: "main_agent" | "user" | "radio_agent"
  }>
```

- **Owner**: Music Experience.
- **Source**: durable (`music_experience` queue rows).
- **Phase C increment**: queue truth is existing; the wire projection shape is
  PC4 work. Live code currently exposes the queue through the narrow
  `MusicExperienceWorkspaceItemSummary`, so PC4 must switch the snapshot
  projector to `WireMaterialProjection` while preserving the existing
  revision/position/provenance truth.
- **UI-neutrality**: sliced by owning area, not by "Queue Card"; carries zero
  player chrome. Voice reads "next 3 queued"; CLI prints the list.
- **Provenance**: `MusicExperienceWorkspaceQueueEntry`
(`src/contracts/music_experience.ts`) for position/provenance/revision; PC4
upgrades the material payload. Cap `MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH` (100)
bounds the slice.

### 2.2 `nowPlaying`

```
nowPlaying slice:
  logicalIntent: {
    status: "playing" | "paused"                                // playNow logical truth
    material: WireMaterialProjection?                           // current target
  }
  verifiedActualState?: {                                       // PC11; absent until a Web player heartbeats
    state: "playing" | "buffering" | "ended" | "failed"
    material: PublicObjectRef?                                  // handle only; full projection stays in logicalIntent
  }
```

- **Owner**: Music Experience.
- **Source**: durable (logical) + reconciled from the active tab's `actualState`
  on the presence heartbeat (verified — single-source, §2.11; the controller-era
  "lease heartbeat" is gone).
- **Phase C increment**: `verifiedActualState` is new (PC11). Existing
  projection lacks even `logicalIntent.status` on the workspace slice; PC4
  adds it.
- **Two-layer split**: logical intent (want-to-play) vs verified actual (really
  playing). Agent may not claim "now playing" until `verifiedActualState`
  arrives (PC11 gate). `failed` means the player exhausted every source in
  the ordered `PlaybackSource` list (§6.4) — a single source failing is the
  expected fallback path, not `failed`; only when all sources are exhausted is
  it visible (provider CORS/account/404 → reconcile → surfaced to agent, not
  silenced).
- **Verified material = handle only**: to avoid projecting the same material
  twice; the full projection stays in `logicalIntent.material`. The verified
  handle covers the rare boundary where the player is still on the previous
  track at the instant `playNow` flips logical intent.
- **UI-neutrality**: both layers are backend-correctness contracts for any
  surface with audio output.
- **Provenance**: `MusicExperiencePlaybackSnapshot`
(`src/contracts/music_experience.ts`); PC11 schema for verified columns.

### 2.3 `radioTruth`

```
radioTruth slice:
  directionRevision: ConcernRevision
  direction: {
    motif?: RadioDirectionValue
    activeVariations: RadioDirectionValue[]
  }
  posture: {
    lean: RadioDirectionValue[]
    commandedRevisionStamp?: ConcernRevision
    stale: boolean
  }

RadioDirectionValue =
  | { kind: "text", text: string }
  | { kind: "material", material: WireMaterialProjection }
  | { kind: "scope", scope: RadioDirectionScopeValue }          // all | library | source_library | relation | collection | provider
```

- **Owner**: Music Experience.
- **Source**: durable (radio direction + posture rows).
- **Phase C increment**: material variant uses `WireMaterialProjection`
  (replaces narrow `ItemSummary`).
- **`direction-summary` is stripped** (§3.1) — it was a leak. The slice carries
  only `motif + activeVariations + posture`, which is exactly the landed
  contract shape.
- **UI-neutrality**: motif/variations/lean drive PB9 cascade, OCC, and agent
  steering independent of any card.
- **Provenance**: `MusicExperienceRadioTruthSnapshot`
(`src/contracts/music_experience.ts`).

### 2.4 `radioSession`

```
radioSession slice:
  radioSessionRevision: ConcernRevision
  lifecycle: "Running" | "Paused" | "Shutdown"
```

- **Owner**: Music Experience.
- **Source**: durable — **after PC6 persists it**. Today `lifecycle` is not
  durable; it lives only in supervisor memory
  (`src/agent_runtime/radio_supervisor.ts`, `wakeGateState`, defaults
  `"Running"`), and `radio_session` has only the revision column
  (`src/music_experience/schema.ts`). PC6 adds the lifecycle column, has
  `transitionRadioSession` write it, and has the supervisor read
  `initialWakeGateState` from durable truth. This persistence is the
  prerequisite for the C3a startup-reconciliation gatekeeper.
- **Phase C increment**: lifecycle column + projection (PC6); the slice exposes
  it (PC4).
- **No `mode` field** (Autoplay/Preview): the two behaviors are already covered
  — Autoplay = Radio refill (Phase B), Preview = `recommendationBatches` +
  queue actions. User intent emerges from interaction; a session-level mode
  toggle is a GUI concept that fails the voice/CLI overturn test.
- **UI-neutrality**: PB9/PB10/wake-gate/C2a buttons/C3a unattended-PAUSE all
  depend on lifecycle; a headless Radio needs it with no Radio Card.
- **Provenance**: `MusicExperienceRadioSessionOperation`
(`src/contracts/music_experience.ts`).

### 2.5 `recommendationBatches`

```
recommendationBatches slice:
  batches: Array<{
    handle: [batch:publicId]
    sourceTag: "chat" | "radio" | "motif" | "variation" | "correction"
    directionRevisionStamp: ConcernRevision
    staleMark?: "previous_direction" | "before_variation_change"
    items: Array<{
      material: WireMaterialProjection
      reason: string                                            // agent-authored NL (independent reasoning)
    }>
  }>
```

- **Owner**: Music Experience.
- **Source**: durable append-only (greenfield — zero persistence today; PC14
  builds it).
- **Phase C increment**: entire slice is new (PC14). The field shape is frozen;
  PC14 builds the durable append-only store, stale-basis append prevention, and
  the `dismiss`/`clear` action routing.
- **Append-only**: batches accumulate, never replace. `sourceTag` drives agent
  reasoning; `directionRevisionStamp` + `staleMark` mark older batches when
  direction/variations change; the agent must not keep expanding a stale
  batch (stale-basis append prevention, the `voided_stale` analog).
- **`reason` is agent-authored NL** (an emission, like `parkedProposalUnits
  .agentSummary`) — it is independent reasoning that cannot be derived from
  material facts, so it must be stored. This is distinct from the stripped
  `direction-summary` (§3.1), which was a derivable rendering.
- **batch `handle`**: enables `dismiss`/`clear` actions (cleanup signal class).
  PRD "fold" is pure UI, never crosses the wire.
- **UI-neutrality**: source tag / stamp / stale-mark are agent-steering facts,
  independent of a Recommendations Card.

### 2.6 `libraryCatalog`

```
libraryCatalog slice:
  libraryStatus: {
    scale: { recordings: number, albums: number, artists: number }
    recentImports: WireMaterialProjection[]                    // top-N by recentlyAddedAt
  }
  // PC16 adds importStatus + savedFavoriteOverview (additive fields, shaped when PC16 lands)
  visibleScopes: Array<{
    handle: PublicObjectRef                                    // scope kind (§1.2): [library] | [source_library:id] | [relation:id] | [collection:id]
    kind: "library" | "source_library" | "relation" | "collection"
    label: string
    detailText?: string
    materialKind?: "recording" | "album" | "artist"            // collection may be mixed (omitted)
    itemCount: number
  }>
  // selectable materials do NOT enter the slice — query endpoint (§4)
```

- **Owner**: Music Data Platform.
- **Source**: durable projection. `visibleScopes` reuses the existing
  `LibraryCatalogScopeAvailabilityPort.listCatalogScopes`
  (`src/music_data_platform/stage_adapter/catalog.ts`) for scope identity /
  name / kind / detailText; `itemCount` is computed separately — the port does
  not return membership counts today, so PC16 derives them via the
  membership-signals path.
  `libraryStatus` fields are status/overview facts (`recentImports` reuses
  `recentlyAddedAt`). PC16 adds `importStatus` + `savedFavoriteOverview`.
- **Phase C increment**: PC16 builds the projection (catalog exists today only
  as an agent-pulled Stage Tool, not a pushed slice). Part 1 freezes
  `visibleScopes` + `libraryStatus` (`scale`, `recentImports`); PC16 adds
  `importStatus` + `savedFavoriteOverview` as additive fields (shaped when PC16
  lands, not frozen now).
- **Materials are not in the slice**: the library is unbounded; items ride the
  workspace-scoped library query endpoint (§4). This mirrors §1.3
  (large/on-demand content stays off the slice). Queue (cap 100) is in-slice;
  library items are not.
- **UI-neutrality**: every field is MDP owning-area truth the agent consumes as
  working context; the Library Card is one view over it.

### 2.7 `parkedProposalUnits`

```
parkedProposalUnits slice:
  units: Array<{
    handle: [proposal:publicId]
    effectKind: "library.relation.save" | "library.collection.add" | ...   // = actionType; TYPED, never a localized string
    structuredFacts: discriminated-by-effectKind {              // deterministic projection of the frozen command
      // library.relation.save:   { verb: "save", target: WireMaterialProjection, ... }
      // library.collection.add:  { verb: "add", collection: scope PublicObjectRef, target: WireMaterialProjection, position?, ... }
      // per-command field enumeration is PC8 plan-level
    }
    agentSummary: string                                        // agent-authored NL (emission)
    basis: ConcernRevisionSet                                   // Agent Work Basis for staleness
    state: "pending" | "confirmed" | "rejected" | "expired" | "voided_stale"
    stale: boolean                                              // basis expired? (approve-when-stale => voided_stale)
  }>
```

- **Owner**: Effect Boundary.
- **Source**: durable (greenfield — the Effect Boundary today is only the
  conservative stub `src/effect_boundary/stage_tool_execution_gate.ts`; PC8
  builds the parked-unit store and the ask→park conversion).
- **Phase C increment**: entire slice is new (PC8).
- **`effectKind` is typed, not localized** (§3.3): the wire carries
  `library.relation.save`/`library.collection.add`, never `"加入你的收藏库"`. The localized
  phrase is produced at the WebUI i18n boundary from `effectKind + locale`.
- **`agentSummary` is agent-authored NL** (an emission) — distinct from the
  typed `effectKind`. It may be localized because the agent authored it.
- **`structuredFacts` = deterministic projection** of the frozen typed command
  (spec PC1: never hand-authored); discriminated by `effectKind`, field
  enumeration settled in the PC8 plan.
- **Confirm card = slice render, not a separate channel** (§3.4): the frontend
  renders Confirm cards from this slice; new park / state changes flow as
  `StateDelta`. No transport-level "card channel."
- **UI-neutrality**: a typed pending-decision state; surface-neutral.
- **Provenance**: ADR-0034 (card = fixed-now agent-generated, MineMusic-owned DTO
  shape — why the slice, not an A2UI live surface) / ADR-0038 (effect boundary
  ask policy, impact class, `ownerCurationWrite` marker). The
  "`structuredFacts` = deterministic projection, never hand-authored" rule is a
  PC1 spec decision consistent with ADR-0034's DTO ownership, not a decision
  ADR-0034 itself establishes.

### 2.8 `transcripts` — per-run AG-UI message stream (not a state slice)

Transcripts are **per-run** — one AG-UI message thread per run, carried by
`transcript.*` events (§1.4: TEXT_MESSAGE_START/CONTENT/END + MESSAGES_SNAPSHOT),
**not** by `workspace.snapshot`, and **not merged across runs**. The Main run
and the Radio run are independent AG-UI threads (distinct `runId`); activity is
per-run the same way (§2.9). The assistant message lifecycle streams live
(pi-agent-core `message_*` → AG-UI TEXT_MESSAGE_*); a full
`transcript.messages_snapshot` resyncs **that run's** thread on reconnect/compact.

```
TranscriptMessage = {
  messageId: string                                          // AG-UI id; threads start/content/end
  role: "user" | "assistant"                                 // AG-UI standard
  content: string
  timestamp: string
}
```

- **Owner**: Agent Runtime.
- **Source**: durable (PB2 PG transcript store) + streamed live (pi `message_*`).
- **Per-run, not merged**: each run is its own AG-UI thread with its own
  `MESSAGES_SNAPSHOT`. The wire never merges Main + Radio messages into one
  stream. A merged Chat view is a WebUI consumption choice (§3.5), not a wire
  shape — the same UI-neutrality rule as activity's per-run isolation (§2.9
  "independent runs never share a messages array").
- **No per-message `actor` field**: run membership is the actor. Under transport
  C (§1.4), the Main run rides its chat POST response and the Radio run rides
  the workspace stream — the carrying channel tells Main from Radio, so no
  MineMusic extension field is needed on each message. (The prior
  `actor: "main_agent"|"radio_agent"` carried via the AG-UI `name` field is
  dropped: it existed only to disambiguate writers inside a merged stream, which
  no longer exists.)
- **Message vs activity split (PC13 gate)**: user messages + agent assistant
  messages enter `transcripts`; agent `Notify`-level activity flows to
  `activity.*` (§2.9); `Silent`-level is dropped before emit. SpeechLevel is a
  backend activity-filter (Silent/Notify, live `agent_runtime.ts`), not a wire
  field and not applied to messages; its value set settles in PC13.
- **No association metadata**: messages stay AG-UI-standard. "Agent recommended
  these → Recommendations Card updated" is aligned by time + content, not by
  embedding a batch/proposal handle.
- **Name is `transcripts`, not "Chat"** (§3.5).
- **UI-neutrality**: agent-owned messages; a voice surface speaks them, a log
  viewer dumps them.

### 2.9 `activity` — AG-UI activity message (role:"activity", in the messages family)

Agent work activity rides `activity.*` events (§1.4: ACTIVITY_SNAPSHOT /
ACTIVITY_DELTA), which are AG-UI messages with `role:"activity"` — **not** a
separate slice, **not** a separate stream family. Activity and transcripts
(§2.8) together form the messages family. There is no `workTrace` slice and no
MineMusic-specific activity-log type: AG-UI activity messages are the activity
truth, resynced by `MESSAGES_SNAPSHOT` (which carries `role:"activity"` messages
alongside text messages).

```
ACTIVITY_SNAPSHOT fields (AG-UI standard; no MineMusic extension type):
  messageId: string                 // = MineMusic activityId; the activity's own message id
  activityType: string              // = MineMusic statusKind (typed enum, value set PC13)
  content: Record<string, any>      // activity payload (e.g. lookup text, batch size)
  replace?: boolean                 // default true — swap content vs accumulate
ACTIVITY_DELTA: messageId + activityType + patch (RFC 6902 on the activity message)
```

- **Owner**: Agent Runtime.
- **Main vs Radio — separated by carrying channel** (transport C, §1.4):
  Main-run `ACTIVITY_*` ride the chat POST response → Chat (folded, expandable
  cards); Radio-run `ACTIVITY_*` ride the workspace persistent stream → Radio
  panel. The frontend routes by which stream carried the event, not by runId.
  Radio activity does **not** enter the Main chat — Main and Radio are
  independent runs that never share a messages array (§2.8).
- **`statusKind` (→ `activityType`) is typed, never a raw tool name**:
  pi-agent-core `tool_execution_*` is translated to `statusKind` at the adapter;
  raw tool names ride a debug/developer endpoint (PRD), not this message. The
  frontend i18n-maps `statusKind` to "搜索资料库" etc. PC13 settles the value set.
- **Speech-Level filter is backend-internal, not on the wire**: `Silent`-level
  activity is dropped by the backend before emit; only `Notify`-level activity
  becomes an `ACTIVITY_*` message. There is no `speechLevel` field on the wire
  (same rule as the §5.5 Signal Class exclusion — backend filtering policy is
  not user-visible music-experience info).
- **PRD "Chat should not become a full tool log"**: this holds because what
  enters the chat is the **abstract `statusKind` card** (folded, expandable),
  not a raw tool-call log. Raw tool names stay off the wire.
- **UI-neutrality**: Main chat shows folded activity cards; a Radio panel shows
  Radio-run activity; both consume the same `ACTIVITY_*` message type.

### 2.10 `selectedObject`

```
selectedObject slice:
  currentFocusHandle?: PublicObjectRef                          // agent default discussion focus; undefined = general chat
```

- **Owner**: Workbench Interface.
- **Source**: interaction-state projection (greenfield — zero storage today;
  PC15 builds it).
- **Phase C increment**: entire slice is new (PC15), including the assembler
  extension that flows the focus handle into the agent run (PRD-AWF-002:
  selected object as default discussion focus for pronoun/reference
  resolution — "play THIS").
- **`currentFocusHandle` only** (§3.2): the agent-facing focus pointer, kept
  backend. All strip-state (collapsed/expanded/pinned/visible) and the
  "Selected-Object-in-Chat strip" presentation binding are ADR-0036
  single-owner interaction state, WebUI-scoped, and never cross the wire.
- **Open `PublicObjectRef` kind**: the focus can be a material, a scope, a
  batch, or a proposal — any public object the user can "select to discuss."
- **UI-neutrality**: a voice user says "this one", a CLI user points at a row,
  a Card user clicks — all set the same focus handle; the agent scopes
  identically.
- **Provenance**: CONTEXT.md partition (§3.2) — agent-facing interaction facts
  (selected handle, interaction revision for stale-action rejection) vs
  presentation-adjacent posture (workspace focus, attention posture,
  visible/dismissed card state).

### 2.11 `workspacePresence`

```
workspacePresence slice:                         // presence-only; no controller concept (single-tab assumption)
  workspacePresent: boolean
  thisClient?: {
    clientId: string
    presenceLeaseId: string
    expiresAt: string
  }
```

- **Owner**: Workbench Interface (in-memory presence authority).
- **Source**: **in-memory** (not durable). v1 single Server Host process. This
  differs from the other ten slices — it is session/liveness truth, not
  persistent area truth. Restart loses all presence; the backstop is simply
  that a restart with no connected tab leaves playback paused (no one is
  present to play).
- **Phase C increment**: PC3 (presence heartbeat + tab-close detection) + PC6
  (unattended → stop playback, Radio untouched).
- **No full presence table on the wire**: the server may keep full presence
  internals, but the frozen wire contract exposes only aggregate workspace
  presence plus the current client's lease view. This prevents UI code from
  depending on the internal multi-tab table shape.
- **No controller concept (single-tab assumption)**: audio output is **not**
  arbitrated by the backend. Whichever tab the user plays in is the tab that
  makes sound. Audio **follows logical** — when a tab's `play` is superseded by
  a newer `play` from another tab (logical `nowPlaying` changes), that tab
  stops its own audio on the next `workspace.delta`. So at any moment only the
  tab that issued the current logical `play` is actually playing. `actualState`
  is therefore single-source (only that tab reports); last-write-wins is the
  backstop for a misbehaving client. Multi-tab simultaneous play is the user's
  responsibility (single-tab is the assumed norm); the backend neither
  serializes nor de-duplicates audio output.
- **Unattended = no presence, not controller expiry**: when the last presence
  lease expires (every tab gone), playback is stopped (logical status →
  paused, `verifiedActualState` cleared). Radio is **not** paused — audio has
  stopped, so the queue stops draining, and Radio's wake gate (queue-low /
  direction-change triggers) does not fire (boundary-spec C3a). Radio session
  stays `Running` until the user explicitly pauses/shuts it down.
- **UI-neutrality**: a headless harness or single-window native app still needs
  presence to gate the unattended transition. "Which tab is playing" is a
  client / user concern, not wire truth.

## 3. UI-shape-neutrality corrections (affecting the slices)

These are the leak fixes from the UI-neutrality audit, already applied to the
slice shapes above. Recorded here so a future reader does not reintroduce them.

- **3.1 `radioTruth` `direction-summary` stripped.** The spec wording
  (`phase-C-web-boundary-spec.md` binding table) listed a fourth "direction
  summary" sub-field; the landed contract
  (`MusicExperienceRadioTruthSnapshot`) already lacks it. The NL summary is a
  derivable rendering — it is either an agent assistant message (Radio agent
  states its understanding, flowing into `transcripts`) or a WebUI client-side
  render from `motif + activeVariations`
  (the commanded direction; `lean` is evolved posture, §2.3). It is not a
  backend slice field.
- **3.2 `selectedObject` split.** Keep `currentFocusHandle` backend (agent
  context). Strip strip-state + the "Selected-Object-in-Chat strip" binding to
  WebUI. Partition CONTEXT.md's Workbench Interaction State into (i)
  agent-facing interaction facts surviving UI overturn (selected handle,
  interaction revision) vs (ii) presentation-adjacent posture (workspace focus,
  attention posture, visible/dismissed card state).
- **3.3 `parkedProposalUnits.effectKind` typed.** The spec examples showed the
  effect as a localized string. The wire field carries a typed `effectKind`
  (discriminated union of command effect classes); the localized phrase is
  produced at the A2UI serializer / WebUI i18n boundary.
- **3.4 No transport-level "card channel".** Confirm cards render from the
  `parkedProposalUnits` slice; changes flow as `StateDelta`. A dedicated card
  channel is a WebUI-sink concept, not a transport primitive. (If a dedicated
  event stream is ever introduced, name it by source — "proposal channel" /
  "confirmation-request channel" — not by the WebUI sink.)
- **3.5 `transcripts` renamed from "Chat", and per-run (not merged).** The
  stream is the agent-owned message transcript — one thread per run, never
  merged across runs on the wire (§2.8). The "Chat (custom, merged)" framing is
  a WebUI consumption note only: a Chat component may choose to render messages
  from the Main run and the Radio run together, but that is the component's
  choice, not the wire shape. The prior "two-writer merge semantic is kept" is
  retracted — there is no wire-level merge.
- **3.6 `libraryCatalog` "selectable" wording removed.** Materials ride the
  workspace-scoped library query endpoint (§4); the slice carries
  `visibleScopes` (area-truth wording) and status.
- **3.7 Binding-table relabel.** Row "selectedObject → Selected-Object-in-Chat
  strip" → "WebUI selected-object affordance (any surface)"; row
  "workspacePresence → per-tab controller/observer UI" → "workspace presence"
  (no controller concept; audio output is not wire-arbitrated, §2.11). Add a
  header note: the binding table is a WebUI consumption guide; every slice is
  owned by its named area.
- **3.8 Guards (PC4).** (a) Slice-origin test: each snapshot slice traces to a
  named owning area / contract type; slice fields with no owning-area origin
  fail the build (catches a future "cardNeedsThis" field). (b)
  StateDelta path test: RFC 6902 paths start with a known owning-area slice name
  and never a presentation-state segment (`expanded`/`dismissed`/`pinned`/
  `visible`).

## 4. Library query endpoint (query-channel reservation)

A dedicated on-demand channel for library content (the slice carries only
overview + scope entries; §2.6). Phase C implements browse; the input is an
extensible query-parameter object so search/filter (follow-up) add as optional
fields without breaking the contract.

```
GET /workspaces/:workspaceId/library/query
  input: {
    scope: scope PublicObjectRef                               // Phase C
    sort?: "time" | "dictionary" | ...                          // Phase C, open enum
    limit?: number
    cursor?: string                                             // Phase C pagination
    // reserved (Phase C does not implement; optional, additive):
    // query?: string                                           // keyword search (follow-up)
    // filter?: { artist?, album?, kind?, tag?, ... }          // faceted filter (follow-up)
  }
  output: {
    items: WireMaterialProjection[]
    nextCursor?: string
  }
```

- **Phase C**: browse — `scope + sort + pagination`, reusing
  `LibraryCatalogReadPort.listCatalogItems`.
- **Workspace-scoped authorization**: `workspaceId`, caller principal, and
  ownerScope come from the Workbench Web session / local owner binding. `scope`
  is only the target reference; it is never sufficient authority by possession.
  The backend revalidates `workspaceId + ownerScope + caller + scope` before
  reading.
- **Extensibility**: `query`/`filter` are reserved optional fields; adding them
  is additive. Output uses full `WireMaterialProjection`, natively supporting
  future full-preview and management views.
- **Operations ride the envelope action map (Part 2)**: Phase C Web actions on
  library content are `library.relation.*`, `library.collection.add`, and
  `library.import.start` (see §5.6 registry). `library.import.cancel` is **not**
  Phase C — the live import surface has only `start`/`status`/`list_sources` and
  no cancel owner command; it is deferred to PC16 (§5.6 follow-up). Future
  library management (`library.material.edit`/`delete`,
  `library.collection.create`/`remove`/`move`/`delete`/`rename`,
  `library.scope.organize`, `library.merge`/`dedupe`) is additive map entries,
  not a contract change.
- **`scope.kind` open enum**: the four kinds in §2.6 can grow
  (`playlist`/`smart_collection`/`folder`/`tag_group`) without breaking.
- **Management attributes**: import source / quality / dupe state / tags do not
  enter `WireMaterialProjection`; they ride a future management-detail
  projection so the common projection stays clean.

## 5. Upstream Envelope (Part 2 — frozen: envelope + result channel + actionType registry + all 32 payloads, §5.6)

The upstream POST family. Two envelope types carry user-initiated semantics;
the lease heartbeat is connection-layer (Part 4), not an envelope here.

### 5.1 Envelope family

- **`WorkbenchActionEnvelope`** — user action (button / card). Adapter → owning
  command / Effect Boundary resume. Response: sync adapter receipt (`ack`) +
  async `action.result` carrying the `outcome` (§5.3). Every envelope —
  including instant actions — receives a correlated `action.result` (ADR-0036).
- **`ChatMessageEnvelope`** — user chat message. Triggers a Main run, stamps
  `issuedFromUserActionId`. Response: `{actionId}` (run started, not completed;
  the pi-internal run id is not exposed); run output flows as
  slice deltas (§5.8).

Merged or excluded from the wire family:

- `StageToolRequestEnvelope` / `A2UISurfaceEnvelope` (consensus taxonomy) = agent
  path / in-process card emission; not Web POSTs. `StageToolRequestEnvelope` is
  already served by `StageInterface.dispatch` + `StageToolHandlerOutputEnvelope`;
  PC1 Confirm card is a parked-unit projection, not an agent surface request.
- `ProposalResolutionEnvelope` (consensus) merges into `WorkbenchActionEnvelope`
  as `proposal.confirm`/`.reject` — wire shape is identical
  (`workspaceId + actionId + payload`); the routing difference (Effect Boundary
  resume vs direct command) is backend-internal (§5.7).
- Lease heartbeat = liveness signal, not a user action → Part 4 (§5 of the
  former pending list).

### 5.2 `WorkbenchActionEnvelope`

```
WorkbenchActionEnvelope {
  workspaceId: string
  actionId: string              // client-generated idempotency key
  actionType: string            // routing map key, flat verb (§5.5)
  basis?: ConcernRevisionSet    // only concern-revisioned targets
  payload: <per actionType — shapes in §5.6 registry>
}
```

- **`actionId` is client-generated**. Upstream actions must be retry-safe
  (network blips routine); the client mints `actionId` as an idempotency key
  and the backend dedupes short-term (to `action.result` emission + TTL — this
  prevents duplicate command execution). A retry sends the same `actionId`; the
  backend returns the existing `ack` without re-routing. The `action.result`
  itself is **not** re-emitted on retry (best-effort, §5.4); the client reads
  the outcome from resynced state. Mandatory for non-idempotent actions
  (`playback.queue.append`); `playback.queue.move` happens to be idempotent but
  must not rely on coincidence. Long-running actions (`library.import.start`)
  cannot rely on the short-term `actionId` dedup alone — their owning command
  (`LibraryImportStartCommand`) is itself idempotent beyond the TTL by reusing
  an already-running batch (`findRunningBatch`), so a post-TTL retry resumes the
  same batch instead of starting a duplicate.
- **`basis` only for concern-revisioned targets** (C2): `queue` /
  `radio-direction` / `radio-session`. The client carries the area revision it
  last observed; the owning command accepts or rejects on stale basis.
  `playback.play`, Relation, Collection, import, selection, abort, and proposal
  carry none — `playback.play` is a now-playing intent (last-writer-wins), not
  an OCC-guarded write.
- **Adapter-injected, never client-written**: `caller` / `ownerScope` (auth),
  `clientId` (lease association), `actor` (a Web envelope is always `"user"` — a
  constant, not a field), `issuedFromUserActionId` (run-level provenance; only
  chat-trigger-Main produces it, stamped onto the run input, not an envelope
  field).

### 5.3 POST response + downstream `action.result` (split channel)

The action result is split across a sync POST receipt (adapter stage) and an
async downstream `action.result` event (command stage). The business outcome
never blocks the POST, and — per ADR-0036 — every `WorkbenchActionEnvelope`
receives a correlated result.

**POST sync response** (adapter-stage receipt, ms-level):

```
{ actionId, ack: "accepted" | "rejected", reason?: ... }
```

- `ack.accepted` = envelope passed routing + handle resolve + basis presence +
  structural validation and was routed to the owning command. This is **adapter
  receipt only** — it never means the command succeeded. The command business
  outcome rides the downstream `action.result` (`outcome.committed`).
- `ack.rejected` reasons (`unknown_action_type` / `unresolvable_handle` /
  `missing_basis` / `malformed`) are a **closed** 4-value enum (§8.1). Basis rejection
  splits across the two channels by a crisp boundary: `missing_basis` is
  adapter-stage (the envelope lacks a required `basis` field entirely — a
  structural validation failure); a present-but-stale `basis` is command-stage
  and surfaces only as `action.result(outcome: voided_stale)` — never as
  `ack.rejected`. (Live `voided_stale` error code, `commands.ts`; basis stale
  at commit. Wire `voided_stale` is the 1:1 pass-through of that live code, not
  a proposal-only outcome — queue/radio/proposal all use it.)

**Downstream `action.result` event** (command-stage outcome, async; the client
correlates by `correlationId`):

```
{ type: "action.result", correlationId, outcome: "committed" | "rejected" | "voided_stale" | "noop", reason?: string }
```

- `correlationId` = the envelope's `actionId` (§5.2). ADR-0036 names the result
  field `correlationId`; the envelope field stays `actionId` (its
  idempotency-key semantic is stronger).
- **AG-UI mapping**: `action.result` is the last variant in the §1.4 envelope
  union and maps to an AG-UI **CUSTOM** event (`name: "workbench.action_result"`,
  `value: {correlationId, outcome, reason}`) at the serializer seam — **not**
  `RunFinished.interrupt`. `RunFinished` is the chat-run terminal
  (`RunFinishedOutcome` is `success | interrupt`, requires `threadId`+`runId`,
  and `verifyEvents` rejects any event after it); per-action outcomes
  (`committed`/`rejected`/`voided_stale`/`noop`) have no place in that union and would
  terminate the SSE run on every action. CUSTOM is AG-UI's pass-through slot
  for domain events — `onCustomEvent` does not touch the run state machine.
- Aligns with ADR-0036 `WorkbenchActionResult(correlationId, outcome:
  committed | rejected, reason)`; **wire adds `voided_stale` and `noop`**.
  `voided_stale` is the 1:1 pass-through of the live `voided_stale` error code
  (`commands.ts`), applying to **all** concern-revisioned actions (queue/radio/
  proposal alike). `noop` is the 1:1 pass-through of the live `*_noop` codes
  (`queue_noop` / `playback_noop` / `radio_truth_noop`, `records.ts`) —
  idempotent operations whose result equals the current state; it stays out of
  `rejected` so `rejected` carries only real business refusals the user should
  act on, not idempotent no-ops (§8.2 rationale). The adapter maps live
  `error.code` → wire `outcome` by code literal, no owning-command branching.
  ADR-0036 currently pins `outcome` to `committed | rejected` (closed), so
  adopting `voided_stale` + `noop` requires amending ADR-0036 (tracked as one
  Phase C follow-up). **Retry vs give-up is read from
  slice state, not outcome**: queue/radio stale → resync shows target still in
  slice → retry; proposal stale → `parkedProposalUnits` unit `.state=
  voided_stale`/removed → give up confirm.
- **Every actionType emits `action.result`, including instant actions.** An
  instant action's command runs synchronously, so its `action.result` follows
  the POST immediately (no async gap) — but the model is uniform: `ack` is
  always adapter receipt, `outcome` is always command business result. This
  dissolves the double-`accepted` overload (adapter receipt vs command success)
  — the two layers never share a value.

**Why split (over sync-block or async-only)**: slow actions
(`library.import.start`, radio cascade) must not block HTTP; fast and slow
actions share one outcome channel so the frontend has a single correlation
path. The sync layer covers only adapter-front validation
(routing/resolve/basis-presence/structure); the command business outcome
(`committed` / `rejected` / `voided_stale` / `noop`) is async.

### 5.4 `action.result` ⊥ `StateDelta`

A successful `playback.queue.move` emits **two** downstream events: a `StateDelta` (queue
slice, queueRevision bump) and an `action.result`(correlationId, committed).
They are orthogonal:

- `action.result` carries the **outcome** (did my action commit / is it stale).
- `StateDelta` carries the **state change** (what the workspace looks like now).

`action.result` carries **no state pointer** (no `affectedRevision` / sequence).
The frontend optimistically updates local state, confirms on `committed`, and
lets authoritative `StateDelta` overwrite.

`action.result` is a **best-effort real-time notification** — fire-and-forget,
not redelivered on client reconnect. If the client misses it (disconnect
between POST and SSE delivery), it resyncs state (§0 gap recovery) and reads
whether the action took effect from the slice (state changed → committed;
state unchanged → failed → retry/give-up per the rule above). `state` is the
authority; `action.result` is the timely signal, not a redeliverable truth. Area revision is OCC-driven, not
action-scoped; under multi-tab interleaving a "pointer" would not be unique
anyway. On `outcome: voided_stale` the frontend's local state is stale;
it triggers a full resnapshot (§0 gap recovery) to fetch the current revision
before retrying. This resnapshot-then-retry is bounded: under multi-tab
equal-writer contention a client must back off after a small fixed number of
consecutive `basis_stale` rejections (exact bound/backoff is PC plan-level),
not retry in a tight loop.

### 5.5 `actionType` — flat verb, open enum, backend-internal Signal Class

- **Flat (one actionType per command operation)**. The radio session command has
  `start`/`pause`/`resume`/`shutdown` operations → four actionType
  (`radio.session.start`/`.pause`/`.resume`/`.shutdown`), not one
  `radio.session.transition` + `operation` field. actionType is the frontend
  intent verb ("I want to pause"), not the domain operation ("transition
  session"); payload carries data parameters only, never routing fields.
- **Naming**: Web actionType aligns with the existing Stage tool vocabulary
  (the agent path) — the same operation has the same name whether invoked by
  the agent or by a Web button, so the frontend and the tool registry share one
  set. Aligned to live descriptor names: `radio.session.*` / `radio.motif.*` /
  `radio.variations.*` (plural, per descriptor) / `playback.queue.*` /
  `playback.play` / `library.relation.*` /
  `library.collection.*` / `library.import.*`. Web-only actions with no Stage
  tool yet (greenfield PC8/PC15) use the same area-then-entity convention:
  `selection.set` / `main.abort` / `proposal.confirm`/`.reject`. Adding the
  agent-path tool later reuses the Web
  actionType verbatim (no second vocabulary).
- **Open enum**: adding an actionType is an additive routing-map entry, never a
  contract change (§4 reserves the same extensibility).
- **Signal Class is NOT on the wire**. The backend resolves
  `{owning command, signalClass}` from a static map (C2); the client sends only
  `actionType`. Signal Class (CONTEXT.md `User Signal Class`: cleanup /
  playback-queue / session-steering / explicit-preference) and the
  `translate-before-command` invariant are adapter-internal and do not appear in
  this wire contract.

### 5.6 actionType registry (Phase C: 32)

| actionType | landed | basis | result |
|---|---|---|---|
| `radio.session.start`/`.pause`/`.resume`/`.shutdown` | yes (`transitionRadioSession`) | radioSession | `action.result` |
| `radio.motif.set`/`.clear` | yes | radioDirection | `action.result` |
| `radio.variations.add`/`.remove`/`.replace`/`.move`/`.clear` | yes | radioDirection | `action.result` |
| `playback.queue.append`/`.remove`/`.replace`/`.move`/`.clear` | yes (`MusicExperienceQueuePlaybackCommand`) | queue | `action.result` |
| `playback.play` | yes (`MusicExperienceQueuePlaybackCommand.playNow`) | — | `action.result` |
| `playback.pause`/`.resume` | yes (`MusicExperienceQueuePlaybackCommand`) | — | `action.result` (logical status → paused/playing) |
| `playback.skip` | yes (`MusicExperienceQueuePlaybackCommand`) | — | `action.result` (logical → queue next; current position PC plan-level) |
| `library.relation.save`/`.unsave`/`.favorite`/`.unfavorite`/`.block`/`.unblock` | yes | — | `action.result` |
| `library.collection.add` | yes (`CollectionCommands.addCollectionItem`) | — | `action.result` |
| `library.import.start` | yes (`LibraryImportStartCommand`) | — | `action.result`; committed on batch+first-job submitted (progress via `libraryCatalog.libraryStatus.importStatus` slice, PC16) |
| `selection.set` | PC15 | — | `action.result` (instant — command synchronous) |
| `main.abort` | yes (`AgentRuntimeUserTurnController.abort`) | — | `action.result` (instant — command synchronous) |
| `proposal.confirm`/`.reject` | PC8 (Effect Boundary resume) | — (basis is on the frozen parked unit) | `action.result` (instant; committed on success / voided_stale on confirm-resume) |

- **`radio.lean.*` is excluded from the registry** — it is not a user action.
  The live descriptor (`src/music_experience/stage_adapter/radio_truth.ts:290`)
  marks lean as Radio-owned evolved posture (`useWhen: "Radio is updating its
  evolved posture beneath the current commanded direction"`; `doNotUseWhen`
  forbids using it to change motif/variations). It is a Radio-agent tool; on
  the wire lean is read-only — it appears in the `radioTruth.posture.lean` slice
  (§2.3) but is not writable from a `WorkbenchActionEnvelope`. Frontend changes
  to user intent go through `radio.motif.*` / `radio.variations.*` (commanded
  direction).
- **Playback actions are logical; player-local is audio-only.**
  `playback.play` / `.pause` / `.resume` / `.skip` are logical actions (POST) —
  they change logical intent (`nowPlaying.material` or `.status`, §2.2) and sync
  to every tab + the agent. Only **seek position / volume / mute** are
  player-local: they affect only the local `<audio>` element, never cross the
  wire, are not synchronized. `actualState` (`playing`/`buffering`/`ended`/
  `failed`) is the verified layer, reported by whichever tab is actually
  playing — single source, because audio follows logical (a tab whose `play`
  lost to a newer `play` stops its own audio on the next `workspace.delta`);
  last-write-wins is the backstop for a misbehaving client. (The earlier
  "`play` is the only playback actionType; play/pause/skip flow back via
  heartbeat" framing was a controller-era artifact.)
- **`main.abort` carries no payload** — the live controller `abort()` is
  parameterless (`src/agent_runtime/agent_user_turn_trigger.ts:39`) and targets
  the workspace's active Main turn. The pi-internal run id
  (`session.run({ runId })`, line 49) is not exposed on
  `AgentRuntimeUserTurnResult`, so the Web action cannot target a specific run
  id; it aborts the workspace's active Main turn unconditionally. The abort's
  effect on the run's POST response is defined in §5.8 (Run termination:
  `RUN_ERROR` with `code:"aborted"`, preceded by `TEXT_MESSAGE_END` on any
  in-flight message). `action.result(committed)` for the abort itself rides the
  workspace stream as for any instant action; the two events travel separate
  channels and do not conflict.
- **`library.import.start` is dual-path** (agent tool + Web action, share
  `LibraryImportStartCommand`): determinate parameterized operations with long
  progress benefit from a Web entry (tap-through beats typing; progress
  visible). Effect gate does not apply to the Web path (actor = user,
  ADR-0038 constrains the agent only). The remaining import tools
  (`library.import.status`, `library.import.list_sources`) are agent-only and
  not on the Web action map: status rides the `libraryCatalog.libraryStatus`
  slice; list_sources rides the libraryCatalog slice / query endpoint. There is
  no `library.import.continue` — chained self-driving background jobs replaced
  caller-driven advancement (ADR-0029), leaving a `start`/`status` surface.
- **Instant actions** (`selection.set`, `main.abort`, `proposal.reject`) execute their
  command synchronously, so their `action.result` follows the POST immediately
  (no async gap). The model is still uniform (§5.3): `ack` = adapter receipt,
  `outcome` = command result. State change flows as `StateDelta` as usual.

Follow-up actionType (additive, not in Part 2 frozen 32; later PC increments shape them): `library.import.cancel` (PC16 must
define owner command + payload + result semantics — live import has only
`start`/`status`/`list_sources`, no cancel); `recommendation.batch.dismiss`/
`.clear` (PC14 must define dismiss-vs-clear semantics, payload, and whether
`clear` is user-initiated or system cleanup); `library.collection.create`/
`.remove`/`.move`/`.delete`/`.rename` (live descriptors, not yet Web actions);
`library.material.edit`/`.delete`, `library.scope.organize`,
`library.merge`/`.dedupe`.

#### Payload shapes (frozen incrementally per group)

Per-`actionType` payloads are grilled/frozen group by group. Field names align
1:1 with the live agent tool `inputSchema` — same name whether the operation is
invoked by the agent or a Web button. Position fields come in exactly three
semantics, shared across the queue and radio groups: `index` locates an
existing item (remove/replace); `at` is the insert position for new items
(append, variations.add); `from`/`to` is a move source/target (move). All
`index`/`at`/`from`/`to` values are the dense `position` of the owning slice
(§2.1 queue; §2.3 radio direction variations). Material refs in a payload are
always `PublicObjectRef` handles (§1.2) — the slice's `WireMaterialProjection`
is the down-stream projection, never the up-stream reference. `basis` rides
the envelope top-level (§5.2), never the payload.

**Queue group — frozen:**

```
playback.queue.append    { items: PublicObjectRef[], at?: number }
                         // at omit = append to end; present = insert at <at>
                         // (items at/after <at> shift down; same <at> axis as variations.add)
playback.queue.remove    { index: number }
playback.queue.replace   { index: number, item: PublicObjectRef }
playback.queue.move      { from: number, to: number }
playback.queue.clear     {}
playback.play            { item: PublicObjectRef }        // no basis — intent, not OCC
playback.pause           {}                                // logical status → paused (§2.2)
playback.resume          {}                                // logical status → playing
playback.skip            {}                                // logical → queue next (current position tracked server-side, PC plan-level)
```

**Radio group — frozen:**

```
radio.session.start/.pause/.resume/.shutdown   {}            // lifecycle transition, no params
radio.motif.set     { value: RadioDirectionValue }
radio.motif.clear   {}
radio.variations.add      { value: RadioDirectionValue, at?: number }
radio.variations.remove   { index: number }
radio.variations.replace  { index: number, value: RadioDirectionValue }
radio.variations.move     { from: number, to: number }
radio.variations.clear    {}
```

`value` = §2.3 `RadioDirectionValue`: `{kind:"text", text}` |
`{kind:"material", item: PublicObjectRef}` | `{kind:"scope", scope}`. The
`item` field name follows the live agent `inputSchema`; the down-stream slice
(§2.3) spells the same material kind as `material: WireMaterialProjection` —
handle up, projection down.

**Library group — frozen:**

```
library.relation.save/.unsave/.favorite/.unfavorite/.block/.unblock   { item: PublicObjectRef }
library.collection.add    { collection: PublicObjectRef, item: PublicObjectRef }
```

The six `library.relation.*` verbs share one payload (the agent uses one shared
`inputSchema`); only the `actionType` differs. `collection` is a scope-kind
`PublicObjectRef` (§2.6 `visibleScopes` handle); `item` is material-kind. No
position field on `collection.add` — it appends (the live `inputSchema` defines
none; positioned insert is a follow-up, not invented here). `collection.move`
(follow-up, not in Part 2 frozen 32) uses 1-based `toPosition`, distinct from the
queue/radio dense `at`/`index` axis — frozen when it lands.

**Import group — frozen:**

```
library.import.start    { providerId: string, libraryKind: enum, limit?: number }
                        // libraryKind = saved_source_track | saved_source_album | followed_source_artist
                        // limit 1-100 (adapter maps to the command's maxNewItems)
                        // providerId is sourced from the libraryCatalog slice (§5.6 dual-path note)
```

**Selection group — frozen (greenfield — no live `inputSchema`, shaped here):**

```
selection.set    { focus: PublicObjectRef | null }    // handle = set focus; null = clear (back to general chat, §2.10)
```

`playback.queue.append.at?` is the one Phase C addition over the live agent
append `inputSchema` (which today appends to end only); the agent descriptor
gains the same optional `at` for dual-path parity with `variations.add` (PC
implementation). All 32 Phase C actionType payloads are now frozen; `main.abort`
carries no payload (§5.6) and `proposal.confirm`/`.reject` is shaped in §5.7.

### 5.7 `proposal.confirm`/`.reject` (Effect Boundary resume)

```
proposal.confirm | proposal.reject   payload: { proposalHandle: [proposal:publicId] }
```

Routing target = Effect Boundary (resume / discard the frozen parked unit), not
a direct owning command. The wire shape is identical to any other actionType;
the routing difference is backend-internal.

- **No `basis` in the envelope**: the parked unit carries its own frozen
  `ConcernRevisionSet` (Agent Work Basis); on confirm the Effect Boundary
  re-checks that basis, not one the client supplies.
- **confirm → `action.result`**: `outcome: committed` (basis still valid, frozen
  command executed) or `voided_stale` (basis expired; CONTEXT.md Proposal Unit).
- **reject → `action.result`**: `outcome: committed` (unit discarded; the
  synchronous Effect Boundary discard is the command). The unit's state change
  (pending → rejected / removed) also flows as a `parkedProposalUnits` slice
  delta. (Earlier `ProposalResolutionEnvelope` / (R)-(S) split dissolved: reject
  is a `WorkbenchActionEnvelope` action whose command happens to be synchronous;
  it emits `action.result(committed)` like any instant action, §5.3.)
- **`voided_stale` vs CONTEXT.md `expired`**: the Proposal Unit lifecycle
  (`pending → confirmed | rejected | expired | voided_stale`) has four terminal
  states, but `action.result.outcome` carries only `committed | rejected |
  voided_stale`. `expired` (proposal timeout, no user action correlated to it)
  is **not** an `action.result` outcome — it surfaces only as a
  `parkedProposalUnits` slice `StateDelta` (§2.7), because no
  `WorkbenchActionEnvelope` correlates to a timeout.

### 5.8 `ChatMessageEnvelope`

```
ChatMessageEnvelope {
  workspaceId: string
  actionId: string            // client-generated, idempotency (same rule as §5.2)
  messageContent: string
}
```

- Triggers a Main run; the adapter stamps `issuedFromUserActionId` on the run
  input (provenance spine). This is the **only** Phase C Main-run trigger.
- **Response model differs from `WorkbenchActionEnvelope`** (transport C): the
  POST response body **is** the Main run's AG-UI event stream —
  `RUN_STARTED(threadId: workspaceId, runId: <pi-internal>)` … `transcript.*` /
  `activity.*` … `RUN_FINISHED(success)` — consumed by `@ag-ui/client`'s
  `HttpAgent` + `verifyEvents` (one-POST-one-run; §1.4 channel 1). `{actionId}`
  is returned as the POST ack; there is no separate "fetch the run" step and no
  runId to match — the response *is* this run. The pi-internal `runId` rides
  `RUN_STARTED.runId` for bracketing/logging only; it is **not** an action
  target (`main.abort` targets the workspace's active Main turn unconditionally,
  §5.6).
- **Run output vs state side-effects split across channels**: the run's
  `transcript.*` + `activity.*` ride the POST response (this run, this tab);
  the run's **state side-effects** (parked proposals, queue/radio commits) ride
  the **workspace persistent stream** as `workspace.delta` (§1.4 channel 2) so
  every tab sees them. The POST response carries no `workspace.delta`.
- **Run termination — three outcomes on the POST response**: the run ends in
  exactly one of (a) `RUN_FINISHED` with `outcome:"success"` (normal
  completion); (b) `RUN_ERROR` with `code:"aborted"` (user `main.abort`, §5.6 —
  the adapter first emits `TEXT_MESSAGE_END` for any in-flight assistant message
  to close it cleanly, retaining the partial content already streamed, then
  `RUN_ERROR`); (c) `RUN_ERROR` with another `code`/`message` (pi error,
  unadapted boundary failure). AG-UI `RunFinishedOutcome` has only
  `success`|`interrupt`; `interrupt` is the AG-UI HITL slot (whether Phase C
  proposal resume reuses it is a PC8 decision, boundary-spec), and abort is not
  it in any case — so abort rides `RUN_ERROR`, and the frontend distinguishes
  "user cancelled" (`code:"aborted"`, no error UI, just stop the stream) from a
  real failure (other `code`, surface the error). This is the adapter's 1:1
  mapping of the session-layer `aborted` outcome
  (`src/agent_runtime/actor_runtime_session.ts:45`); the `skipped` outcome
  (cascade jump) is a separate termination, not grilled here.
- **Broken-response recovery** (AG-UI standard `MESSAGES_SNAPSHOT` resync): the
  POST response is a one-shot stream with no MineMusic transport sequence; a
  drop mid-run is **not** recovered by continuing the live stream — it is
  recovered by reconnecting and pulling a fresh transcript snapshot
  (`MESSAGES_SNAPSHOT`, AG-UI's standard resync primitive) over the PB2
  transcript store, served by a `GET /workspaces/:id/transcript` route (Server
  Host, C3). The run's already-streamed partial assistant message and its final
  message both live in the transcript; resync surfaces them, and the presence of
  the final message is how the client knows the run ended — no separate
  `workbench.run_ended` signal. This is the same full-resnapshot philosophy as
  the workspace-stream gap recovery (§0), not a new mechanism, and not a
  sequence gap-replay. The run's state side-effects (parked proposals,
  queue/radio commits) never rode this channel — they rode the workspace
  persistent stream and are unaffected by a chat-response drop.
- **Why not `chat.send` under `WorkbenchActionEnvelope`**: chat's response
  contract (a continuous run-output stream) is fundamentally different from the
  adapter-receipt + `action.result` model. Folding chat in would make
  `WorkbenchActionEnvelope`'s response contract non-uniform.

## 6. Audio GET endpoint (Part 3 — frozen)

On-demand audio delivery for a material. Two endpoints: a workspace-scoped
**source resolver** (returns ordered `PlaybackSource`s for a material) and a
**capability-based audio stream** (serves bytes for a local-source token).
Provider audio is fetched directly by the player and never touches the Server
Host audio route.

**`PlaybackSource`** (returned by §6.1, tried in order by the client per §6.4):

```
PlaybackSource =
  | { kind: "local",    url: string }   // url = GET /audio/:token (§6.2), minted at resolve time
  | { kind: "provider", url: string }   // url = the provider's playableLink (player fetches directly)
```

`kind` drives fallback (a provider source may CORS/account-fail, a local source
will not). No `sourceRef` on the wire — it is MDP-internal; the client only
needs `kind + url`. The shared `url` field lets the player treat both kinds
uniformly (`fetch` / `<audio src>`).

### 6.1 `GET /workspaces/:workspaceId/materials/:handle/playback-source`

```
GET /workspaces/:workspaceId/materials/:handle/playback-source
  → { sources: PlaybackSource[] }      // ordered; client tries in order (§6.4)
```

- **Owner**: Music Data Platform (`PlaybackSourceResolver` read port — greenfield,
  built in Phase C). Resolves the material's bound sources, ranks them with the
  Source Preference Policy at `purpose:"playback"`, returns the ordered list.
  Server Host (C3) hosts the route and calls the port; it does not rank sources.
- **Workspace-scoped authorization**: same model as §4 —
  `workspaceId + ownerScope + caller + handle` revalidated before reading.
- **On-demand, not in slice**: the audio URL and provider `playableLink` are
  time-sensitive (short-lived token, expiring provider URL) — they stay off the
  snapshot slice by the same rule as §1.3 presentation resources. The client
  fetches a source at play time, not before.

### 6.2 `GET /audio/:token` (capability-based, not workspace-scoped)

```
GET /audio/:token                  → 206 Partial Content, Content-Disposition: inline (play)
GET /audio/:token?mode=download    → 206, Content-Disposition: attachment (download)
```

- **Capability, not workspace lookup**: the token resolves (Public Handle Veil)
  to `{ rootId, relativePath, ownerScope, expiry }`; authorization is the token
  itself, so the route carries no `workspaceId` — the audio endpoint's essential
  difference from the workspace-scoped routes (§4, §6.1).
- **token in path, not header**: `<audio src>` / `<video src>` browser media
  elements fetch the URL directly and **cannot inject an `Authorization`
  header**, so the token must ride the URL. The token is **opaque — a random
  string, not a JWT**, so it leaks no `relativePath` / `ownerScope` if logged;
  resolution is server-side only.
- **Range is standard HTTP**: `Accept-Ranges: bytes`; `Range` → `206 Partial
  Content` + `Content-Range: bytes start-end/total`; no `Range` → `200`. Nothing
  MineMusic-specific.
- **play vs download = `Content-Disposition`**: default `inline`;
  `?mode=download` → `attachment; filename="<title>.<ext>"`. Same endpoint, same
  token, same ownerScope — response-header only.
- **Server resolves then serves**: `token → {rootId, relativePath, ownerScope,
  expiry}` → expiry check → `LocalSourceScanRootDirResolver.resolveRootId(rootId)`
  → `resolveUnderRoot(rootDir, relativePath)` containment → stream with range.
  `ownerScope` comes from the token, never the request.

### 6.3 token — opaque, short-lived, in-memory (v1)

- **Opaque + stateful** (Public Handle Veil, same pattern family as
  `HandleMintingPort`): a random token string server-side-mapped to `{rootId,
  relativePath, ownerScope, expiry}`. Not a self-contained JWT — a lookup, which
  keeps `relativePath` / `ownerScope` out of the wire string.
- **Short-lived** (exact TTL is PC plan-level): a stale token → `410 Gone`.
- **In-memory store, v1 single Server Host process** — same liveness tier as
  `workspacePresence` (§2.11): restart drops all tokens, the client
  re-resolves a fresh source on next play. Multi-instance would need a
  shared/durable token store — deferred follow-up, same boundary as the lease
  authority (boundary-spec C3a).

### 6.4 Source fallback — `actualState:"failed"` only when exhausted

- The client tries `sources[]` in order. A single source failing (provider CORS
  / 404 / account) is the **expected** path — it tries the next source.
- `nowPlaying.verifiedActualState.state:"failed"` (§2.2) is raised only when the
  list is **exhausted**, not on a single-source failure. This refines §2.2's
  "failed must be visible": the failure that surfaces is "no playable source at
  all," not "the first source didn't load."
- Provider audio never touches the Server Host audio endpoint — the player
  fetches `kind:"provider".url` directly; a CORS/account/404 failure there is
  reported through the lease heartbeat `actualState` (C5 / Part 4) and
  reconciled, never silently swallowed.

### 6.5 Phase C scope vs follow-ups

- **In Phase C**: local audio serving (fastify range endpoint + token +
  `resolveUnderRoot`), provider direct-fetch + `actualState` reconciliation, the
  `playback-source` resolver route, the `PlaybackSource` shape.
- **Follow-ups (not Part 3)**: a server-side provider proxy (if browser
  direct-fetch is CORS/account-blocked in practice — surfaced by verification,
  not pre-built, boundary-spec C5); backend arbitration of audio output / which
  tab makes sound (§2.11 — not done in Phase C, single-tab assumed); multi-
  instance durable token store (§6.3).

## 7. Connection protocol (Part 4 — frozen)

Workspace connection lifecycle. Presence-only — no controller (§2.11).

### 7.1 `GET /workspaces/:workspaceId/stream` (SSE downstream)

Long-lived SSE GET; the workspace persistent stream (§1.4 channel 2). First
event is `workspace.snapshot` (sequence baseline, §0). The connecting client's
`workspacePresence.thisClient` (`clientId` + `presenceLeaseId` + `expiresAt`)
rides that snapshot's §2.11 slice — presence is minted at connect, not by a
separate call. Reconnect = standard EventSource + full resnapshot on gap (§0).

### 7.2 `POST /workspaces/:workspaceId/heartbeat` (presence upstream)

```
POST /workspaces/:workspaceId/heartbeat
  body:  { clientId, actualState?: { state, material: PublicObjectRef? } }
  → 200: { expiresAt }
```

Refreshes the presence lease. `actualState` rides the heartbeat (§2.2 verified
layer): only the active tab — the one whose `playback.play` is the current
logical intent — reports (others stopped their audio, §2.11). Single-source;
last-write-wins backstop. Cadence / TTL / grace are PC plan-level (boundary-spec
C3a; `TTL + grace ≫` heartbeat round-trip).

### 7.3 Unattended → stop playback (Radio untouched)

Last presence lease expires (after `expiresAt + grace`): logical
`nowPlaying.status` → `paused`, `verifiedActualState` cleared. **Radio session
stays `Running`** — audio stopped → queue stops draining → wake gate does not
fire → Radio naturally does not run (boundary-spec C3a). A returning tab issues
`playback.play` to resume; no fast-reconnect un-pause machinery.

### 7.4 Multi-tab equal-writer (no controller)

Every connected tab is an equal workspace writer: writes go through owning
commands with per-concern OCC (ADR-0036); no single-controller write token, no
audio-output arbitration. Audio follows logical (§2.11); multi-tab simultaneous
play is the user's responsibility (single-tab assumed).

## 8. Shared enums and outcome mapping (Part 5 — frozen 2026-07-02)

Part 5 collects the typed enums defined inline across §2/§5 and freezes the
`action.result` outcome mapping. Two value sets are explicitly **not** frozen
here — they settle in the PC plans that own the behavior.

### 8.1 Frozen enums (collected)

| enum | values | defined at |
|---|---|---|
| `nowPlaying.logicalIntent.status` | `playing` \| `paused` | §2.2 |
| `nowPlaying.verifiedActualState.state` | `playing` \| `buffering` \| `ended` \| `failed` | §2.2 |
| `radioSession.lifecycle` | `Running` \| `Paused` \| `Shutdown` | §2.4 |
| `parkedProposalUnits[].state` | `pending` \| `confirmed` \| `rejected` \| `expired` \| `voided_stale` | §2.7 |
| `parkedProposalUnits[].effectKind` | = `actionType` (typed, never localized) | §2.7, §5.5 |
| `ack.rejected.reason` (**closed**) | `unknown_action_type` \| `unresolvable_handle` \| `missing_basis` \| `malformed` | §5.3 |
| `WorkbenchActionResult.outcome` | `committed` \| `rejected` \| `voided_stale` \| `noop` | §5.3, §8.2 |

Excluded from the wire (backend-internal): **Signal Class**
(translate-before-command, §5.5), **speechLevel** (activity Notify/Silent
filter, §2.9), raw tool names (translated to `statusKind`, §2.9).

### 8.2 `WorkbenchActionResult` outcome mapping (frozen)

The downstream `action.result` event (§5.3) carries `correlationId`,
`outcome`, optional `reason`. The adapter maps the live command result to wire
`outcome` **by code literal, no owning-command branching**:

| live command result | wire `outcome` | `reason` |
|---|---|---|
| `Result.ok` | `committed` | absent |
| `code: "*_noop"` (`queue_noop` / `playback_noop` / `radio_truth_noop`) | `noop` | the code literal (open) |
| `code: "voided_stale"` | `voided_stale` | `"basis_stale"` |
| any other `Result.err` code | `rejected` | the code literal (open) |

- **`reason` is an open string; its value set is NOT frozen on the wire** — it
  passes the live `error.code` through verbatim (same pass-through strategy as
  `voided_stale` and the §5.5 `actionType` open enum). The frontend does NOT
  branch on `reason`: `rejected` is handled uniformly (surface + resync).
- **`ack` vs `action.result` reason sets differ by producer**: `ack.rejected
  .reason` is a **closed** 4-value enum (adapter-produced: routing / handle /
  basis-presence / structure); `action.result.reason` is an **open** string
  (command-produced code pass-through). The adapter owns the closed set; the
  command layer owns the open one.
- **`*_noop` codes (`queue_noop` / `playback_noop` / `radio_truth_noop`) lift
  to a fourth outcome `noop`** — same `error.code` → `outcome` promotion as
  `voided_stale` (the adapter maps by code literal), not a backend-semantics
  flip. Noop fires when the operation's result equals the current state (queue
  move to the same index / replace with identical content / radio direction at
  its current value / playback at the current material / clear with no editable
  items — `records.ts`): idempotent, neither a success-with-change nor a
  refusal. Keeping noop out of `rejected` preserves `rejected`'s UX purity:
  `rejected` carries only real business refusals (`queue_full` /
  `queue_index_invalid` / ...) the user should see and act on; folding noop
  into `rejected` would force a dilemma — either surface a spurious "failed"
  toast for an idempotent move-to-same-index, or swallow real refusals
  silently. `noop` is its own outcome so each path renders honestly.
- **Frontend handling**: `noop` → idempotent acknowledgement, **skip resync**
  (the backend guarantees no state changed, so re-fetching the snapshot is
  wasted work); `rejected` → surface + resync. `noop`'s `reason` still rides
  the open string (which `*_noop` code) for debug visibility. ADR-0036's
  `committed | rejected` becomes `committed | rejected | voided_stale | noop`;
  amending ADR-0036 for `voided_stale` + `noop` is one Phase C follow-up.
- **`action.result` is best-effort, not redelivered** (§5.4): a missed result
  (disconnect between POST and SSE delivery) is recovered by §0 gap-resync,
  not by replaying the outcome.

### 8.3 Deferred to PC plans (NOT frozen in Part 5)

| value set | deferred to | why |
|---|---|---|
| `activity.statusKind` (→ `activityType`) value set | PC13 | the enum is frozen (typed, never a raw tool name); the value list settles when activity emission lands |
| `parkedProposalUnits[].structuredFacts` per-`effectKind` fields | PC8 | discriminated-by-`effectKind` is frozen; per-command field enumeration settles in the Effect Boundary build |

## 9. Phase C implementation provenance (slice / event-stream → PC)

| slice | owner | source | builds in |
|---|---|---|---|
| queue | Music Experience | durable | truth existing; wire projection PC4 |
| nowPlaying | Music Experience | durable + heartbeat | PC4 (status), PC11 (verified) |
| radioTruth | Music Experience | durable | PC4 (full projection) |
| radioSession | Music Experience | durable (after PC6) | PC6 (persist lifecycle), PC4 (expose) |
| recommendationBatches | Music Experience | durable (new) | PC14 |
| libraryCatalog | Music Data Platform | durable (new projection) | PC16 |
| parkedProposalUnits | Effect Boundary | durable (new) | PC8 |
| transcripts | Agent Runtime | durable (PB2) | PC9/PC13 (AG-UI surface, per-run) |
| activity | Agent Runtime | runtime emission (new) | PC13 |
| selectedObject | Workbench Interface | interaction-state (new) | PC15 |
| workspacePresence | Workbench Interface | in-memory (new) | PC3 (presence) + PC6 (unattended → stop playback) |

Shared types build in PC0 (`WireMaterialProjection`, `PublicObjectRef` resolve
signature, two-envelope wire family — `WorkbenchActionEnvelope` +
`ChatMessageEnvelope`). Downstream snapshot/delta envelope is Part 1.
`transcripts`/`activity` are AG-UI message event streams (§1.4), not state
slices — their PC build (PC9/PC13) emits `transcript.*`/`activity.*` events
(`ACTIVITY_*` are `role:"activity"` messages), not slice projections.
Slice-origin + StateDelta-path guards build in PC4.
