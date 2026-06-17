# Phase 17 Candidate Commit and First Consumption Tool Implementation Plan

> Status: Phase 17 spec and execution plan; implemented (PR 17A/17B/17D/17C merged).
> Spec authority: this document plus ADR-0011 (Candidate Commit boundary), ADR-0021
> (Effect Boundary auto-pass for presentation-driven admission), ADR-0008
> (command-owned write boundaries), ADR-0012 (Music Discovery seam), ADR-0015
> (side-effect vs invocation policy), ADR-0017 (router owns toolName).
> Owning bounded contexts: Music Data Platform (Candidate Commit command, Material
> Projection), Music Experience (`music.experience.present` handler + stage_adapter),
> Effect Boundary (gate auto-pass widening), Stage Interface (HandleMintingPort
> resolution, MusicCard output contract).

## Goal

Sanction Phase 17 as the first durable-write phase and implement it as four PRs.
Phase 16 closed the read-only Music Discovery loop (`lookup` returns
`candidate` / `library` handles); Phase 17 closes the consumption loop by letting
a presented `candidate` become a durable library item, and ships the first
concrete Material Projection so the presentation has a stable domain object to
render.

```text
PR 17A: Material Projection (MDP read-side: materialRef -> MusicMaterial)
PR 17B: Candidate Commit command (MDP owning command: materialCandidateRef -> materialRef)
PR 17D: Effect Boundary auto-pass widening for presentation-driven admission (ADR-0021)
PR 17C: music.experience.present (first consumption tool: candidate|library -> library handle + MusicCard)
```

The consumption path after Phase 17:

```text
music.experience.present(candidate handle)
  -> HandleMintingPort.resolve(candidate) -> internal materialCandidateRef
  -> read candidate SourceEntity facts from runtime candidate cache
  -> Candidate Commit command: findMaterialForSource(sourceRef) dedupe;
       miss -> upsertSource + createMaterialRef + upsertMaterial + bindSourceToMaterial + projection invalidation
       hit  -> reuse existing materialRef (idempotent)
  -> HandleMintingPort.mint(library, materialRef) -> library publicId
  -> Material Projection: materialRef + binding -> MusicMaterial
  -> present handler maps MusicMaterial -> MusicCard (Public Agent Protocol)
  -> return { library handle, MusicCard }
```

Candidate Commit is an internal owning command, never an agent-facing tool
(ADR-0011). The agent never calls commit directly; `present` is the only caller
in Phase 17 and the act of presenting a candidate is the act of admitting it.

## Non-Goals

- Do not expose Candidate Commit as an agent-facing tool (ADR-0011 forbids it;
  commit is internal, called by consumption actions).
- Do not create a Canonical Record on commit; materialization stops at
  source + material + binding. Canonical identity is left to later Canonical
  Maintenance.
- Do not build presented recommendation history, play/open/skip events, or any
  Music Experience durable state beyond the `present` handler. History is a
  later Music Experience concern.
- Do not implement play, queue, favorite, or save tools. Only `present` ships.
  The first action tool that would need the Playback Provider Slot is out of
  scope (Playback Slot is greenfield).
- Do not implement full Effect Boundary enforcement, approval persistence, or a
  user-facing `ask` loop. Only the narrow auto-pass widening for
  presentation-driven admission (ADR-0021); `ask` and `deny` paths are
  unchanged from the 16B stub.
- Do not route the existing `music.discovery.lookup` description through
  Material Projection (unchanged gap; only `present` consumes the projection).
- Do not edit `CONTEXT.md` as part of this phase (glossary already refreshed
  with `MusicCard` and the clarified `Candidate Commit` entry; further glossary
  work needs an explicit user request per formal-rebuild rules).

## Ownership And Boundaries

Music Data Platform owns:

- the Candidate Commit owning command (materialization, idempotency, projection
  invalidation), under the existing source-of-truth write boundary;
- Material Projection (read-side: `materialRef` + source binding -> `MusicMaterial`),
  including label selection and source-ref ordering rules;
- the `MusicMaterial` domain type.

Music Experience owns:

- the `music.experience.present` handler and its `stage_adapter` registration;
- the `src/music_experience/` area skeleton (this is the first Music Experience
  code; it is registered as a runtime module contributing the `present` tool).

Effect Boundary owns:

- the auto-pass widening of `StageToolExecutionGate` for presentation-driven
  admission durable writes (ADR-0021), with audit metadata.

Stage Interface owns:

- `HandleMintingPort.resolve` / `mint` usage by the present handler (no new
  port; the 16B port is already bidirectional);
- the `MusicCard` Public Agent Protocol output type and its output-schema
  codegen;
- output veil guards extended to reject any internal anchor in `MusicCard`.

Imports forbidden:

- `src/music_data_platform/**` core must not import Stage Interface contracts
  or `MusicCard` (the present handler maps `MusicMaterial` -> `MusicCard` on the
  Music Experience side; Material Projection returns the domain `MusicMaterial`).
- `src/music_experience/**` must not import retrieval internals, provider
  plugins, or write repositories directly; it calls the commit command and
  Material Projection through narrow ports and resolves/mints handles through
  `HandleMintingPort`.

## PR 17A: Material Projection

> Depends on: nothing (first PR; read-side over existing identity records).
> Shippable standalone: yes — Material Projection is reachable from tests but
> has no agent caller until PR 17C.

### Goal

Land the first Material Projection so a `materialRef` resolves to a stable
domain `MusicMaterial`. This is the formal target described in CONTEXT
(382-394) and ARCHITECTURE (366) that the active tree never implemented.

### What lands

- `src/contracts/music_data_platform.ts`: kind-discriminated `MusicMaterial`
  domain type, projected from the **primary** source's `SourceEntity` (decided
  in the Phase 17 design grill: kind-discriminated shape, full-primary
  aggregation, primary written by commit not reselected at projection time,
  kind-specific display name `title`/`name` rather than a unified `label`):
  - `MusicRecording`: `{ kind: "recording", materialRef, primarySourceRef,
    title, artistLabels, albumLabel?, trackPosition?, durationMs?,
    playableLinks, availability, versionInfo? }`.
  - `MusicAlbum`: `{ kind: "album", materialRef, primarySourceRef, title,
    artistLabels?, releaseDate?, playableLinks, availability, versionInfo? }`.
  - `MusicArtist`: `{ kind: "artist", materialRef, primarySourceRef, name,
    aliases?, playableLinks, availability }`.
  - `MusicMaterial = MusicRecording | MusicAlbum | MusicArtist` for Phase 17;
    `work` / `release` variants are deferred to the canonical layer.
- `src/music_data_platform/material_projection.ts`:
  - `projectMusicMaterial(input: { materialRef: Ref }): MusicMaterial | undefined`.
  - Primary source: read the material's **already-written** `primarySourceRef`
    (set by commit via `bindSourceToMaterial(makePrimary: true)` or
    `upsertMaterialRecord({ primarySourceRef })`). Material Projection does NOT
    reselect a primary at projection time; it applies the written primary.
  - Multi-source aggregation is **full-primary**: only the primary source's
    facts populate the projection; secondary sources are ignored (no link
    merge, no widest-availability). Multi-source playable-link merge is a
    later concern.
  - Material-kind normalization: `track -> recording`, `album -> album`,
    `artist -> artist` (mechanical `SourceEntityKind` -> variant mapping).
  - Merge-current: if `MaterialRecord.mergedIntoMaterialRef` is set, project
    the surviving material instead.
  - Availability mapping: `SourceAvailabilityHint -> MaterialAvailability`.
  - Fallback: missing material, or a material with no `primarySourceRef`,
    returns `undefined` — an incomplete material is not projectable; there is
    no fallback to the first source.
- `src/music_data_platform/identity_read_model.ts`: **no new read port**.
  `listSourcesForMaterial({ materialRef })` already exists; full-primary
  projection needs only `MaterialRecord.primarySourceRef` + the primary
  `SourceRecord`, and uses `listSourcesForMaterial` only for merge-current and
  integrity checks.

### Guards

- Active-tree guard: `src/music_data_platform/` core must not import
  `src/contracts/stage_interface.ts` or `MusicCard`.
- Unit tests: single-source projection (commit output) across
  recording/album/artist; multi-source material projects only the primary
  source (secondary ignored); merge-current follows `mergedIntoMaterialRef`;
  material with no `primarySourceRef` returns `undefined`; missing material
  returns `undefined`; track metadata (`trackPosition`/`durationMs`) present on
  `MusicRecording`.

### Verification

`npm run typecheck`; new unit tests under `test/`; active-tree guard green.

### Acceptance

`projectMusicMaterial` returns the kind-correct `MusicMaterial` variant for any
material with a written `primarySourceRef`, projects only the primary source's
facts (full-primary, no secondary merge), follows `mergedIntoMaterialRef`, and
returns `undefined` for unknown or primary-less material.

## PR 17B: Candidate Commit Command

> Depends on: nothing (can run in parallel with 17A).
> Shippable standalone: yes — command is exercised by tests; no agent caller
> until PR 17C.

### Goal

Land the Candidate Commit owning command (ADR-0011): turn an unconfirmed
Material Candidate into a durable material, idempotent on source ref.

### What lands

- `src/music_data_platform/candidate_commit_command.ts`:
  - `commitCandidate(input: { materialCandidateRef: Ref }): Result<{ materialRef: Ref, created: boolean }>`
    inside a single root Music Data Platform transaction.
  - Resolve the candidate ref to its cached `SourceEntity` facts (read from the
    runtime material-candidate cache by `materialCandidateRefKey`).
  - Idempotency: `findMaterialForSource({ sourceRef })` (identity_read_model);
    hit -> return existing `materialRef` with `created: false`; miss -> proceed.
  - Miss path: `upsertSourceRecord(SourceEntity)` -> `createMaterialRef(kind)`
    (non-deterministic; dedupe is by query, not factory) ->
    `upsertMaterialRecord` -> `bindSourceToMaterial(makePrimary: true)` ->
    projection invalidation (owner catalog + material text), composed through
    the source-of-truth write commands (`upsertSourceRecord` /
    `upsertMaterialRecord` / `bindSourceToMaterial` each mark projection
    invalidated) rather than a direct `markProjectionInvalidated` call.
  - No `upsertCanonicalRecord`; canonical identity is explicitly out of scope.
  - Single failure channel: `Result<T>` for expected failures (expired/missing
    candidate); throw only for broken invariants / unadapted boundary failures.
- Reuse the existing `createMusicDataPlatformSourceOfTruthWriteCommands`
  workflow-facing boundary (owner-scope guard already enforced there); the
  commit command composes `identity` + `projectionInvalidation` commands.

### Guards

- Active-tree guard: commit command lives in `src/music_data_platform/`, imports
  only identity/source commands + candidate-cache read + projection
  invalidation; must not import Stage Interface, Music Intelligence, or
  Extension.
- Write-boundary guard: direct table writes only inside the commit command and
  the existing write-command modules it calls (ADR-0008).
- Tests: idempotent commit of the same candidate returns the same `materialRef`
  with `created: false`; expired/missing candidate ref -> `Result` failure, not
  an empty success or a throw.

### Verification

`npm run typecheck`; unit tests with an in-memory Music Database fixture
candidate; write-boundary and active-tree guards green.

### Acceptance

Committing the same candidate twice yields one durable material and one
`materialRef`; the material has exactly one source binding and no canonical
record; projection invalidation is recorded.

## PR 17D: Effect Boundary Auto-Pass Widening

> Depends on: nothing (independent Effect Boundary change).
> Shippable standalone: yes — gate behavior change covered by unit tests; no
> tool uses it until PR 17C declares `durableUserStateWrite: true` with
> `defaultDecision: "auto"`.

### Goal

Widen the 16B conservative `StageToolExecutionGate` auto-pass path per
ADR-0021: `defaultDecision="auto"` passes for
`durableUserStateWrite=true` when the tool qualifies as a presentation-driven
admission.

### What lands

- `src/effect_boundary/stage_tool_execution_gate.ts`:
  - auto-pass now also applies when `durableUserStateWrite=true` AND the tool
    declaration carries a presentation-driven-admission qualifier
    (`invocationPolicy.admissionDrivenByPresentation === true`, a new narrow
    flag).
  - `deny` still denies; unqualified auto durable writes and all other
    unhandled postures still route to `ask` (conservative default preserved
    outside the qualifier).
  - Audit metadata records `internalReason: "auto presentation-driven
    admission"` for every widened auto-pass.

### Guards

- Unit tests: unqualified auto durable write still routes to `ask`;
  qualified `present` auto-passes; `deny` denies; audit metadata present.

### Verification

`npm run typecheck`; gate unit tests; ADR-0021 referenced in the test
descriptions.

### Acceptance

A tool with `defaultDecision: "auto"`, `durableUserStateWrite: true`, and
`admissionDrivenByPresentation: true` auto-passes with audit; the same tool
without the qualifier still routes to `ask`.

## PR 17C: music.experience.present

> Depends on: PR 17A (Material Projection), PR 17B (commit command), PR 17D
> (gate widening).
> Shippable standalone: yes — first end-to-end consumption tool.

### Goal

Ship the first consumption tool. Present a candidate or library handle, admit a
candidate to the library via the commit command, and return a `library` handle
plus a `MusicCard`.

### What lands

- `src/music_experience/stage_adapter/present.ts`:
  - `music.experience.present` descriptor + handler factory.
  - Input: `{ item: MusicItemHandle }` (candidate | library).
  - Candidate path: `ctx.handleMinting.resolve({ kind: "candidate", publicId })`
    -> `materialCandidateRef` -> commit command (PR 17B) ->
    `materialRef` -> `ctx.handleMinting.mint({ kind: "library", internalAnchor:
    materialRef })` -> library publicId.
  - Library path: `ctx.handleMinting.resolve({ kind: "library", publicId })` ->
    `materialRef` (no commit).
  - Both paths: `projectMusicMaterial(materialRef)` (PR 17A) -> discriminated
    `MusicMaterial` -> flatten to the unified `MusicCard` via a pure helper in
    `src/contracts/public_music_description.ts`. Mapping: `label` = title
    (recording/album) or name (artist); `artistsText` = artistLabels joined
    (recording/album); `albumLabel` from recording; `displayLinks` from
    `playableLinks` converted to `PublicDisplayLink` (strip `requiresAccount`);
    `versionLabel` from `versionInfo.label`; strip `materialRef` and
    `primarySourceRef` (internal anchors, must not cross the veil);
    `trackPosition` / `durationMs` are NOT carried into `MusicCard`.
  - Output: `{ item: MusicItemHandle (library), card: MusicCard }`.
  - Declared errors (ADR-0020): `candidate_expired`, `candidate_not_found`,
    `material_not_found`, `invalid_input`; never an internal code.
  - Side-effect declaration: `durableUserStateWrite: true`. Invocation policy:
    `defaultDecision: "auto"`, `admissionDrivenByPresentation: true` (PR 17D).
- `src/music_experience/stage_adapter/index.ts`: Music Experience runtime
  module contributing the `present` registration.
- `src/contracts/stage_interface.ts`: `MusicCard` unified Public Agent Protocol
  output type — `{ kind: recording|album|artist, label, artistsText?,
  albumLabel?, displayLinks: readonly PublicDisplayLink[], availability:
  MusicAvailability, versionLabel? }` (decided in grill: unified agent-facing
  shape parallel to the Public Handle Description style, NOT discriminated like
  `MusicMaterial`; no `trackPosition`/`durationMs`). Plus the `present` input
  type; codegen adds `MusicExperiencePresentInput` /
  `MusicExperiencePresentOutput` schemas.
- `src/server/music_experience_runtime_module.ts`: Server Host composition
  wiring Music Experience into the runtime (commit command, Material
  Projection, HandleMintingPort already on ctx).
- Output veil guard (Stage Interface) extended to reject internal anchors in
  `MusicCard` sample/schema.

### Guards

- Active-tree guard: `src/music_experience/` imports Stage Interface contracts
  + MDP narrow ports (commit command, Material Projection) + HandleMintingPort;
  must not import retrieval internals, provider plugins, or write repositories.
- Veil test: candidate-path and library-path outputs contain no
  `materialRef` / `materialCandidateRef` / `sourceRef` / `resultSetId` / raw
  provider keys.
- Idempotency test: presenting the same candidate twice returns the same
  library handle; the second present reports `created: false` internally and
  the same library publicId publicly.
- Declared-error test: expired candidate -> `candidate_expired`; missing ->
  `candidate_not_found`; no internal code leaks.

### Verification

`npm run typecheck`; `npm run generate:stage-interface-schemas`; unit tests
for candidate/library paths, idempotency, veil, declared errors; active-tree
guard green; default Server Host wiring smoke.

### Acceptance

`music.experience.present` admits a candidate to the library, returns a stable
`library` handle and a leak-free `MusicCard`, auto-passes the gate with audit,
and is idempotent across repeated presents of the same candidate.

## Stopping Condition

Phase 17 is complete when all four PRs are merged, `music.experience.present`
admits a candidate end-to-end with a leak-free `MusicCard`, Candidate Commit is
idempotent and canonical-free, Material Projection resolves any bound material,
and the Effect Boundary gate auto-passes only for the qualified admission
posture. Play, queue, favorite, save, presented history, Canonical Maintenance,
and full Effect Boundary enforcement remain explicitly out of scope.

## Open Items For Later Phases

- Presented recommendation history and play/open/skip events (Music Experience
  durable state).
- Play / queue / favorite / save action tools (the latter two reach the Phase 9
  owner-relation commands) and the Playback Provider Slot they need.
- Canonical Maintenance to review/promote any provisional identity (Phase 17
  creates none, so there is nothing to promote yet, but later admission paths
  may).
- Routing `music.discovery.lookup` description through Material Projection
  (tracked gap, unchanged by Phase 17).
- Full Effect Boundary enforcement, approval persistence, and user-facing
  `ask` loop.
