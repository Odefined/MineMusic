# Phase C — Web Wire Contract (Frontend↔Backend Interface Specification)

> Status: **Owning container; Parts 1–2 frozen** — Part 1: downstream event
> envelope, snapshot slice layer (downstream SSE payload), shared types,
> UI-neutrality corrections, and the workspace-scoped library query endpoint.
> Part 2: upstream envelope family, POST response + `action.result` channel,
> `actionType` taxonomy. Parts 3–5 pending (audio GET, connection protocol,
> shared enums/errors).
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

- **Transport scope of this document**: downstream SSE — the Workspace Snapshot
  `StateSnapshot`/`StateDelta` payload. Upstream POST, audio GET, and the
  connection protocol are Parts 2–4 (pending).
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

Opaque handle, format `[kind:publicId]`. Kinds: `material`, `scope`, `batch`,
`proposal`. Open-kind set — adding a kind later does not break the contract.
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

### 1.4 Downstream event envelope (Parts 1–2 frozen)

The downstream SSE stream sends a Workbench-owned event envelope. The
`workspace.snapshot` / `workspace.delta` family is Part 1; the `action.result`
family is Part 2 (§5.3). Both are frozen in the union below.

```
WorkbenchDownstreamEventEnvelope:
  eventId: string
  workspaceId: string
  sequence: number                         // per-workspace transport sequence
  emittedAt: string
  event:
    | { type: "workspace.snapshot", snapshot: WorkspaceSnapshot }                       // Part 1
    | { type: "workspace.delta", baseSequence: number, patch: JsonPatchOperation[] }   // Part 1
    | { type: "action.result", correlationId: string, outcome: "committed"|"rejected"|"voided_stale", reason?: string }  // Part 2 (§5.3)
```

- **Sequence**: transport ordering/gap detection only. It is distinct from
  `ConcernRevisionSet` and never participates in OCC.
- **Gap recovery**: if a client detects a sequence gap, it requests or receives
  a fresh `workspace.snapshot` with a new baseline; Part 1 does not add a delta
  replay buffer.
- **No business-event truth**: queue, radio, proposal, playback, and library
  changes become new snapshot state plus RFC 6902 deltas. The frontend must not
  reconstruct workspace truth by replaying domain-style events.

## 2. Snapshot slice union (Part 1)

Every slice below records fields, owning area, source (durable vs in-memory),
Phase C increment, UI-neutrality, and code provenance. The slice union is the
`StateSnapshot` payload; `StateDelta` carries RFC 6902 patches scoped to the
changed slice subtree.

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
- **Source**: durable (logical) + reconciled from lease heartbeat (verified).
- **Phase C increment**: `verifiedActualState` is new (PC11). Existing
  projection lacks even `logicalIntent.status` on the workspace slice; PC4
  adds it.
- **Two-layer split**: logical intent (want-to-play) vs verified actual (really
  playing). Agent may not claim "now playing" until `verifiedActualState`
  arrives (PC11 gate). `failed` must be visible (provider CORS/account/404 →
  reconcile → surfaced to agent, not silenced).
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
    importStatus: ...                                          // PC16 source_library_import status summary
    scale: { recordings: number, albums: number, artists: number }
    recentImports: WireMaterialProjection[]                    // top-N by recentlyAddedAt
    savedFavoriteOverview: ...                                  // PC16 from relation scope
  }
  visibleScopes: Array<{
    handle: scope PublicObjectRef                               // [library] | [source_library:id] | [relation:id] | [collection:id]
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
  (`src/music_data_platform/stage_adapter/catalog.ts`) + membership counts.
  `libraryStatus` fields are PC16 status/overview facts (`recentImports` reuses
  `recentlyAddedAt`; `savedFavoriteOverview` reuses relation scope).
- **Phase C increment**: PC16 builds the projection (catalog exists today only
  as an agent-pulled Stage Tool, not a pushed slice). Part 1 freezes
  `visibleScopes` + the four `libraryStatus` fields; concrete sub-shapes
  (`importStatus` enum, `savedFavoriteOverview` fields) are PC16 plan-level.
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
    effectCategory: "ownerCurationWrite"
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
- **Provenance**: ADR-0034/ADR-0038.

### 2.8 `transcripts`

```
transcripts slice:
  messages: Array<{
    id: string                                                  // AG-UI message id
    role: "user" | "assistant"                                  // AG-UI standard
    actor?: "main_agent" | "radio_agent"                        // MineMusic extension: which agent wrote it (assistant only)
    content: string
    timestamp: string
  }>
```

- **Owner**: Agent Runtime.
- **Source**: durable (PB2 PG transcript store).
- **Phase C increment**: surface as AG-UI messages; add `actor`.
- **`Speak` level only (PC13 gate)**: user messages plus agent `Speak`-level
  messages enter `transcripts`. Agent `Silent`/`Notify` activity does not — it
  flows to `workTrace` and UI-state surfaces. The SpeechLevel value set is
  settled in PC13; the filter rule is frozen here.
- **No association metadata**: messages stay AG-UI-standard. "Agent recommended
  these → Recommendations Card updated" is aligned by time + content, not by
  embedding a batch/proposal handle in the message.
- **Slice name is `transcripts`, not "Chat"** (§3.5). The two-writer merge
  semantic is kept; the "Chat" component framing is a WebUI consumption note.
- **UI-neutrality**: agent-owned messages; a voice surface speaks them, a log
  viewer dumps them.

### 2.9 `workTrace`

```
workTrace slice:
  events: Array<{
    id: string
    kind: "tool_call_start" | "tool_call_end" | "step_start" | "step_end" | ...   // AG-UI standard
    actor: "main_agent" | "radio_agent"
    statusKind: "searching_library" | "building_radio_batch" | "checking_playable_options" | "analyzing_selection" | ...
    speechLevel: "Silent" | "Notify"
    timestamp: string
  }>
```

- **Owner**: Agent Runtime.
- **Source**: runtime emission from the dispatch/agent loop (greenfield — Phase
  B left only a stub: `speech_level.ts` is one hard-coded helper,
  `main_radio_channel` is fire-and-forget with no consumer, and zero AG-UI
  ToolCall/Step emission exists; PC13 builds it).
- **Phase C increment**: entire slice is new (PC13), including the
  producer→surfacer chain (Radio produces work events + severity; Main
  consumes the channel and owns interrupt-now; high-impact raise has a Notify
  floor Main cannot suppress).
- **`Silent`/`Notify` only** (the complement of `transcripts`): agent `Speak`
  goes to `transcripts`. PRD "Chat should not become a full tool log" — tool
  calls do not enter transcripts. The SpeechLevel value set is PC13 plan-level;
  the split rule is frozen here.
- **`statusKind` is typed, not localized, and never a raw tool name**: PRD
  places raw tool names in debug/developer views, not the default experience.
  The frontend i18n-maps `statusKind` to "搜索资料库" etc. Raw tool names ride
  a developer/debug endpoint, not this slice.
- **Semantics**: active + recent work events (sliding window, not unbounded
  history); exact window size is PC13 plan-level.
- **UI-neutrality**: an optional agent-facing layer governed by Speech-Level
  policy; any surface consumes the same trace.

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

### 2.11 `playbackControllerLease`

```
playbackControllerLease slice:
  workspacePresent: boolean
  thisClient?: {
    clientId: string
    presenceLeaseId: string
    expiresAt: string
    controller: boolean
    controllerLeaseId?: string
    controllerGeneration?: number
  }
```

- **Owner**: Workbench Interface (in-memory lease authority).
- **Source**: **in-memory** (not durable). v1 single Server Host process. This
  differs from the other ten slices — it is session/liveness truth, not
  persistent area truth. Restart loses all leases; PC6 startup reconciliation
  (durable Radio `Running → Paused`) is the backstop.
- **Phase C increment**: PC3 (CAS-guarded singleton primitive + 7-race suite)
  + PC6 (unattended→PAUSE lifecycle + startup reconciliation gatekeeper).
- **No full lease table on the wire**: the server may keep full
  `presenceLeases` / `controllerLease` internals, but the frozen wire contract
  exposes only aggregate workspace liveness plus the current client's lease
  view. This prevents UI code from depending on the internal multi-tab lease
  table shape.
- **`controllerLease` is a liveness anchor, not action-gating**: its
  expiry-without-replacement triggers unattended → Radio PAUSE (PC6). Phase C
  does **not** use it to gate which tab may act — concurrent tabs serialize
  through owning commands as equal writers (ADR-0036). Output-device authority
  and per-action controller-token gating are follow-ups, not in this slice.
- **`controllerGeneration`**: current-client view of the monotonic CAS counter
  (PC3 singleton's stale-timer / split-brain protection), present only when this
  client owns the controller lease.
- **UI-neutrality**: a headless harness or single-window native app still needs
  the lease to gate the unattended transition. The "per-tab
  controller/observer UI" is a WebUI projection of this truth, not the truth.

## 3. UI-shape-neutrality corrections (affecting the slices)

These are the leak fixes from the UI-neutrality audit, already applied to the
slice shapes above. Recorded here so a future reader does not reintroduce them.

- **3.1 `radioTruth` `direction-summary` stripped.** The spec wording
  (`phase-C-web-boundary-spec.md` binding table) listed a fourth "direction
  summary" sub-field; the landed contract
  (`MusicExperienceRadioTruthSnapshot`) already lacks it. The NL summary is a
  derivable rendering — it is either an agent `Speak` emission (Radio agent
  states its understanding under Speech Level Notify/Speak, flowing into
  `transcripts`) or a WebUI client-side render from `motif + lean`. It is not a
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
- **3.5 `transcripts` renamed from "Chat".** The slice is the agent-owned
  message transcript; the "Chat (custom, merged)" framing is a WebUI
  consumption note. The two-writer merge semantic is kept.
- **3.6 `libraryCatalog` "selectable" wording removed.** Materials ride the
  workspace-scoped library query endpoint (§4); the slice carries
  `visibleScopes` (area-truth wording) and status.
- **3.7 Binding-table relabel.** Row "selectedObject → Selected-Object-in-Chat
  strip" → "WebUI selected-object affordance (any surface)"; row
  "playbackControllerLease → per-tab controller/observer UI" → "workspace
  presence + playback liveness". Add a header note: the binding table is a
  WebUI consumption guide; every slice is owned by its named area.
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
- **Operations ride the envelope action map (Part 2)**: Phase C exposes
  `library.import.cancel` only. Future library management
  (`library.material.edit`/`delete`, `library.collection.create`/`add`/
  `remove`/`reorder`, `library.scope.organize`, `library.merge`/`dedupe`) is
  additive map entries, not a contract change.
- **`scope.kind` open enum**: the four kinds in §2.6 can grow
  (`playlist`/`smart_collection`/`folder`/`tag_group`) without breaking.
- **Management attributes**: import source / quality / dupe state / tags do not
  enter `WireMaterialProjection`; they ride a future management-detail
  projection so the common projection stays clean.

## 5. Upstream Envelope (Part 2 frozen)

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
  payload: <per actionType>
}
```

- **`actionId` is client-generated**. Upstream actions must be retry-safe
  (network blips routine); the client mints `actionId` as an idempotency key
  and the backend dedupes short-term (to `action.result` emission + TTL). A
  retry sends the same `actionId`; the backend returns the existing `ack`
  without re-routing. Mandatory for non-idempotent actions
  (`playback.queue.append`); `playback.queue.move` happens to be idempotent but
  must not rely on coincidence.
- **`basis` only for concern-revisioned targets** (C2): `queue` / `playback` /
  `radio-direction` / `radio-session`. The client carries the area revision it
  last observed; the owning command accepts or rejects on stale basis.
  Relation / Collection / import / selection / abort / proposal carry none.
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
  `missing_basis` / `malformed`) are Part 5 shared-enum detail.

**Downstream `action.result` event** (command-stage outcome, async; the client
correlates by `correlationId`):

```
{ type: "action.result", correlationId, outcome: "committed" | "rejected" | "voided_stale", reason?: "basis_stale" | ... }
```

- `correlationId` = the envelope's `actionId` (§5.2). ADR-0036 names the result
  field `correlationId`; the envelope field stays `actionId` (its
  idempotency-key semantic is stronger).
- In the `WorkbenchDownstreamEventEnvelope.event` union (§1.4, third variant).
  Aligns with ADR-0036 `WorkbenchActionResult(correlationId, outcome:
  committed | rejected, reason)`; `voided_stale` is a Phase C extension for
  proposal-resume (§5.7), not an ADR violation.
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
(`committed` / `rejected` / `voided_stale`) is async.

### 5.4 `action.result` ⊥ `StateDelta`

A successful `playback.queue.move` emits **two** downstream events: a `StateDelta` (queue
slice, queueRevision bump) and an `action.result`(correlationId, committed).
They are orthogonal:

- `action.result` carries the **outcome** (did my action commit / is it stale).
- `StateDelta` carries the **state change** (what the workspace looks like now).

`action.result` carries **no state pointer** (no `affectedRevision` / sequence).
The frontend optimistically updates local state, confirms on `committed`, and
lets authoritative `StateDelta` overwrite. Area revision is OCC-driven, not
action-scoped; under multi-tab interleaving a "pointer" would not be unique
anyway. On `outcome: rejected`(basis_stale) the frontend's local state is stale;
it triggers a full resnapshot (§0 gap recovery) to fetch the current revision
before retrying.

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
  `music.experience.playback.play` / `library.relation.*` /
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

### 5.6 actionType registry (Phase C: 29)

| area | actionType | landed | basis | result channel |
|---|---|---|---|---|
| radio.session | `.start`/`.pause`/`.resume`/`.shutdown` | yes (`transitionRadioSession`) | radioSession | `action.result` |
| radio.motif | `.set`/`.clear` | yes | radioDirection | `action.result` |
| radio.variations | `.add`/`.remove`/`.replace`/`.move`/`.clear` | yes | radioDirection | `action.result` |
| playback.queue | `.append`/`.remove`/`.replace`/`.move`/`.clear` | yes (`MusicExperienceQueuePlaybackCommand`) | queue | `action.result` |
| music.experience.playback | `.play` | yes (`MusicExperiencePlaybackPlayCommand`) | playback | `action.result` |
| library.relation | `.save`/`.unsave`/`.favorite`/`.unfavorite`/`.block`/`.unblock` | yes | — | `action.result` |
| library.collection | `.add` | yes (`AddCollectionItem`) | — | `action.result` |
| library.import | `.start` | yes (`LibraryImportStartCommand`) | — | `action.result`; committed on batch+first-job submitted (progress via `libraryCatalog.libraryStatus.importStatus` slice) |
| selection | `.set` | PC15 | — | instant |
| main | `.abort` | yes (`AgentRuntimeUserTurnController.abort`) | — | instant |
| proposal | `.confirm`/`.reject` | PC8 (Effect Boundary resume) | — (basis is on the frozen parked unit) | `action.result`(committed on success / voided_stale on confirm-resume) |

- **`radio.lean.*` is excluded from the registry** — it is not a user action.
  The live descriptor (`src/music_experience/stage_adapter/radio_truth.ts:290`)
  marks lean as Radio-owned evolved posture (`useWhen: "Radio is updating its
  evolved posture beneath the current commanded direction"`; `doNotUseWhen`
  forbids using it to change motif/variations). It is a Radio-agent tool; on
  the wire lean is read-only — it appears in the `radioTruth.posture.lean` slice
  (§2.3) but is not writable from a `WorkbenchActionEnvelope`. Frontend changes
  to user intent go through `radio.motif.*` / `radio.variations.*` (commanded
  direction).
- **`music.experience.playback.play` is the only playback actionType.** play/pause/skip are
  player-local controls; verified actual state flows back via the lease
  heartbeat `actualState` (C5 / Part 4), not an upstream action.
- **`main.abort` carries no payload** — the live controller `abort()` is
  parameterless (`src/agent_runtime/agent_user_turn_trigger.ts:39`) and targets
  the workspace's active Main turn. The pi-internal run id
  (`session.run({ runId })`, line 49) is not exposed on
  `AgentRuntimeUserTurnResult`, so the Web action cannot target a specific run
  id; it aborts the workspace's active Main turn unconditionally.
- **`library.import.start` is dual-path** (agent tool + Web action, share
  `LibraryImportStartCommand`): determinate parameterized operations with long
  progress benefit from a Web entry (tap-through beats typing; progress
  visible). Effect gate does not apply to the Web path (actor = user,
  ADR-0038 constrains the agent only). `library.import.continue`/`.status`/
  `.list_sources` remain agent-only (continue auto-runs as background chained
  job, ADR-0029; status rides the slice; list_sources rides libraryCatalog slice
  / query endpoint).
- **Instant actions** (`selection.set`, `main.abort`, `proposal.reject`) execute their
  command synchronously, so their `action.result` follows the POST immediately
  (no async gap). The model is still uniform (§5.3): `ack` = adapter receipt,
  `outcome` = command result. State change flows as `StateDelta` as usual.

Follow-up actionType (additive, not Phase C): `library.import.cancel` (PC16 must
define owner command + payload + result semantics — live import has only
`start`/`status`/`list_sources`, no cancel); `recommendation.batch.dismiss`/
`.clear` (PC14 must define dismiss-vs-clear semantics, payload, and whether
`clear` is user-initiated or system cleanup); `library.collection.remove`/
`.reorder`/`.create`; `library.material.edit`/`.delete`, `library.scope.organize`,
`library.merge`/`.dedupe`; server-side `playback.play`/`.pause`/`.skip` if ever
introduced.

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
- **Response model differs from `WorkbenchActionEnvelope`**: POST returns
  `{actionId}` (run started, not completed — the pi-internal run id is not
  exposed on `AgentRuntimeUserTurnResult`). The run's output is not a single
  `action.result`; it flows as slice deltas across `transcripts` / `workTrace` /
  `parkedProposalUnits`. Chat has **no `action.result` event and no `runId`** —
  the client correlates run output by the per-workspace transport sequence and
  slice content, not by a run id.
- **Why not `chat.send` under `WorkbenchActionEnvelope`**: chat's response
  contract (a continuous run-output stream) is fundamentally different from the
  adapter-receipt + `action.result` model. Folding chat in would make
  `WorkbenchActionEnvelope`'s response contract non-uniform.

## 6. Pending parts

- **Part 3 — Audio GET**: range endpoint URL shape + Public-Handle-Veil opaque
  playback token (resolves to `rootId + relativePath + ownerScope + expiry`;
  possession ≠ capability) + `206 Partial Content` / `Accept-Ranges` /
  `Content-Disposition` (play vs download).
- **Part 4 — Connection protocol**: AG-UI Profile v1 handshake (capability id,
  sequence baseline, gap-recovery = full resnapshot, unsupported-profile
  rejection); workspace-presence + playback-controller lease heartbeat (carries
  `actualState`); reconnect; multi-tab equal-writer serialization through
  owning commands (no single-controller write token).
- **Part 5 — Shared enums/errors**: `actualState`, `radioSession lifecycle`,
  Signal Class, action verb, card/`effectKind`, `statusKind`; the typed
  `WorkbenchActionResult`; reject/`voided_stale`/gap outcomes.

## 7. Phase C implementation provenance (slice → PC)

| slice | owner | source | builds in |
|---|---|---|---|
| queue | Music Experience | durable | truth existing; wire projection PC4 |
| nowPlaying | Music Experience | durable + heartbeat | PC4 (status), PC11 (verified) |
| radioTruth | Music Experience | durable | PC4 (full projection) |
| radioSession | Music Experience | durable (after PC6) | PC6 (persist lifecycle), PC4 (expose) |
| recommendationBatches | Music Experience | durable (new) | PC14 |
| libraryCatalog | Music Data Platform | durable (new projection) | PC16 |
| parkedProposalUnits | Effect Boundary | durable (new) | PC8 |
| transcripts | Agent Runtime | durable (PB2) | PC9/PC13 (AG-UI surface + actor) |
| workTrace | Agent Runtime | runtime emission (new) | PC13 |
| selectedObject | Workbench Interface | interaction-state (new) | PC15 |
| playbackControllerLease | Workbench Interface | in-memory (new) | PC3 + PC6; current-client view only |

Shared types build in PC0 (`WireMaterialProjection`, `PublicObjectRef` resolve
signature, two-envelope wire family — `WorkbenchActionEnvelope` +
`ChatMessageEnvelope`). Downstream snapshot/delta envelope is Part 1. Slice-origin
+ StateDelta-path guards build in PC4.
