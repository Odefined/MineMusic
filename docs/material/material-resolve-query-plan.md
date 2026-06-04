# Material Resolve Query Contract Plan

This is an implementation plan, not current implementation status. Current
authority lives in `CONTEXT.md`, `ARCHITECTURE.md`, `docs/material/design.md`,
`docs/material/ports.md`, `docs/material/projection-materialization.md`, and
`docs/stage-interface/tool-contracts.md`.

Implementation state must live in `docs/material/progress.md` and
`docs/stage-interface/progress.md` after the work lands. Do not use this plan
as a live status ledger after completion.

## Goal

Replace candidate-shaped Material Resolve with a text-query contract and stop
creating durable `MaterialRecord`s for intermediate provider/source candidates.

Resolve should accept text queries, use Material Search for local durable
candidate retrieval, call Source Grounding only when local confidence is
insufficient, return existing durable materials when provider evidence matches
one, and otherwise return `MusicMaterial` values whose `materialRef.kind` is
`"ephemeral_material"`.

Only `stage.recommendation.present` may turn an `ephemeral_material` selected
for final display into a durable `MaterialRecord`. Resolve must not do durable
materialization directly or indirectly.

## Non-Goals

- No `MusicCandidate` or `ResolvedCandidate` compatibility layer.
- No `single` / `candidate_set` request or result modes.
- No `sourceRef`, `canonicalRef`, `materialRef`, or exact-anchor Resolve input.
- No `sourceLibraryScope` on Material Resolve.
- No public or internal `purpose` field for Resolve.
- No public or domain-result `providerLookup` option.
- No durable `MaterialRecord` writes from Resolve, including indirect writes
  through the source materializer.
- No database table for ephemeral materials in the MVP. The first
  implementation is an in-memory store with TTL / size cleanup.
- No explicit prepare/materialization public boundary between Resolve and
  Present.
- No durable relation policy evaluation for `ephemeral_material` handles.
- No public confidence, Search evidence, provenance, or provider payloads in
  ordinary Resolve output.
- No public `music.material.search` tool.
- No unrelated Query, Selector, Collection, Source Grounding, or provider
  cleanup.

## Accepted Contract Shape

```ts
export type MaterialResolveQuery = {
  id?: string;
  text: string;
  targetKind?: "recording" | "release" | "release_group" | "artist" | "work";
  reason?: string;
};

export type MaterialResolveRequest = {
  sessionId?: string;
  ownerScope?: string;
  limit?: number;
  queries: MaterialResolveQuery[];
};

export type MaterialResolvedQuery = {
  query: MaterialResolveQuery;
  materials: MusicMaterial[];
  status: MaterialResolveStatus;
  reason?: string;
  issues?: MaterialResolveIssue[];
};

export type MaterialResolveResult = {
  results: MaterialResolvedQuery[];
};
```

`limit` is a per-query material limit. `id` is caller correlation only and is
preserved inside the echoed `query`; it is not MineMusic identity.

`MaterialResolveStatus` should keep the existing `source_only` meaning for
provider/source-backed results that are usable but not durable. Do not add a
new status whose meaning is "materialization is still needed".

`MusicMaterial.materialRef` may be either:

- `{ namespace: "minemusic", kind: "material", id }` for durable records.
- `{ namespace: "minemusic", kind: "ephemeral_material", id }` for in-memory
  provider/source-backed results that have not been selected for presentation.

Public `materialId` must preserve that distinction. This plan uses opaque
handles with explicit prefixes:

- `mat:<id>` decodes to `{ namespace: "minemusic", kind: "material", id }`.
- `emat:<id>` decodes to `{ namespace: "minemusic", kind: "ephemeral_material", id }`.

The raw `id` portion may be the same in both refs without collision because the
full key is `namespace + kind + id`, and the public handle preserves `kind`.

## Ownership And Boundaries

- Owned bounded context: Material Flow / Material Resolve.
- Public schema and compact public output owner: Stage Interface.
- Public `materialId` encoding/decoding owner: Material Projection.
- Existing durable material projection owner: Material Projection.
- Provider evidence owner: Source Grounding.
- Ephemeral provider/source-backed material owner: Material Flow ephemeral
  material store.
- Final `ephemeral_material` consumption owner: Recommendation Presentation.
- Durable registry writes owner: Material Materialization, called only from the
  final presentation boundary for selected ephemeral items.
- Source Library constrained retrieval owner: Material Query plus Material
  Search, not Material Resolve.
- Relation, collection-block, wrong-version, and not-playable policy over
  durable materials owner: Material Policy.

Allowed Resolve reads:

- `MaterialSearchPort.search`.
- projection reads through `MaterialProjectionStorePort`.
- read-only existing-material lookup for provider evidence source/canonical
  refs.
- `SourceGroundingPort.ground`.
- `MaterialPolicyEvaluatorPort.evaluate` only for durable material results.

Allowed Resolve writes:

- `EphemeralMaterialStorePort.put` for provider/source-backed results that do
  not already have a durable `MaterialRecord`.
- No durable `MaterialRecord`, canonical, collection, event, or relation
  writes.

Allowed Recommendation Presentation reads/writes:

- Existing `SessionContextPort` and `EventPort`.
- Existing `MaterialPolicyEvaluatorPort.evaluate` for durable `mat:*` handles.
- `EphemeralMaterialStorePort.get` / `delete` for `emat:*` handles.
- A narrow materialization capability for turning selected ephemeral source
  facts into durable `MaterialRecord`s.

Forbidden inside Material Resolve:

- broad `MaterialStorePort`;
- `findCanonicalByLabel`;
- `listSourceLibraryItems`;
- `sourceLibraryScope`;
- direct registry writer methods such as `getOrCreateBySourceRef`;
- `MaterialSourceMaterializerPort`;
- `materializeSourceMaterial` or `materializeSourceMaterials`;
- `attachKnownCanonicalRefs`;
- direct Collection reads or writes;
- Stage Interface compact output DTOs;
- Search evidence/provenance in ordinary returned results.

## Ephemeral Material Lifecycle

The MVP store is in memory. It is not a database table and is not durable across
process restarts.

An ephemeral entry must contain the source/provider facts needed to:

- return a `MusicMaterial` with `materialRef.kind === "ephemeral_material"`;
- validate that the final presentation item is still usable;
- materialize the selected item into a durable `MaterialRecord`.

Cleanup rules:

- Delete selected ephemeral entries after they are successfully consumed by
  `stage.recommendation.present`.
- Delete or overwrite stale entries for the same session when a new Resolve run
  replaces them.
- Add engineering cleanup by `createdAt` / `expiresAt` and a per-session max
  entry count so abandoned Resolve runs do not grow memory forever.
- Process exit naturally drops all ephemeral entries.

Cleanup is not product semantics. It only prevents memory growth. A missing or
expired `emat:*` during presentation should produce a retryable dropped item or
presentation issue; it should not silently create a durable record.

## Policy Placement

Durable and ephemeral handles are routed by decoded `materialId` / `Ref.kind`.
Do not implement "try MaterialRecord, then try ephemeral" fallback.

For `mat:*` presentation items:

- use the existing presentation policy evaluator before accepting the item;
- preserve current handling of blocked, wrong-version, not-playable, freshness,
  warnings, min-card, max-card, and event recording behavior.

For `emat:*` presentation items:

- load the in-memory ephemeral entry by exact ref;
- do not run durable material relation policy, because there is no durable
  `MaterialRecord` relation state yet;
- perform only minimal validity checks, such as entry exists, source facts are
  sufficient, label/kind are present, and a playable link or playable source
  fact exists;
- keep the item in the ordered accepted list if it passes those checks.

After durable items pass policy and ephemeral items pass minimal validity,
apply the existing `maxCards` / `minCards` presentation rules. Only selected
`emat:*` items that survive those rules are materialized into durable
`MaterialRecord`s. Dropped `emat:*` items are not materialized.

The `recommendation.presented` event and final output must use durable
`mat:*` handles for all selected items.

## Branch And Commit Protocol

Execution must start from a feature branch:

```bash
git switch -c codex/material-resolve-query-contract
```

If that branch already exists, continue there only after checking
`git status --short --branch` and preserving unrelated user changes.

Each phase below must be committed once after its verification passes. Use
small commits with messages matching the phase goal. Do not batch multiple
phases into one commit.

After the final phase, review the full diff, run the verification gate, then
open a pull request only if the review finds no blockers.

## Phase 0: Start Documentation Sync

Objective: make current authority docs describe the intended boundary before
code edits.

Expected files:

- `CONTEXT.md`
- `ARCHITECTURE.md`
- `docs/material/design.md`
- `docs/material/ports.md`
- `docs/material/projection-materialization.md`
- `docs/stage-interface/tool-contracts.md`
- `docs/stage-interface/ports.md`
- `docs/material/material-resolve-query-plan.md`

Tasks:

- Describe Material Resolve as text-query grounding, not candidate-to-material
  or exact-anchor lookup.
- State that Resolve may return `ephemeral_material` refs for provider-backed
  non-durable results, but must not create durable `MaterialRecord`s.
- Move Source Library constrained retrieval language to Material Query /
  Material Search.
- State that `materialId` / `materialRef`, `sourceRef`, and `canonicalRef`
  belong to Projection or Materialization paths, not Resolve input.
- Document the public `materialId` encoding distinction between `mat:*` and
  `emat:*`.
- Update Stage Interface contract docs so public `music.material.resolve` uses
  `targetKind`, not `kind`, and does not expose `purpose`.
- Update Material Flow port docs to anticipate Resolve consuming Material
  Search and ephemeral-store writes instead of canonical-label, Source Library,
  or durable materialization writes.

Acceptance criteria:

- Authority docs no longer describe Resolve as `MusicCandidate`-based.
- Authority docs no longer describe source/canonical exact anchors as Resolve
  inputs.
- Authority docs no longer describe Source Library scoped Resolve.
- Authority docs do not describe a separate public preparation/materialization
  step between Resolve and Present.
- The plan records the branch, per-phase commit, final review, and PR gate.

Verification:

```bash
rg -n "MusicCandidate|ResolvedCandidate|candidate_set|sourceLibraryScope" CONTEXT.md ARCHITECTURE.md docs/material docs/stage-interface -g '!docs/material/material-resolve-query-plan.md'
git diff --check
```

Commit:

```bash
git add CONTEXT.md ARCHITECTURE.md docs/material/design.md docs/material/ports.md docs/material/projection-materialization.md docs/stage-interface/tool-contracts.md docs/stage-interface/ports.md docs/material/material-resolve-query-plan.md
git commit -m "docs: align material resolve ephemeral boundary"
```

## Phase 1: Contracts, Public Schema Names, And Material Handles

Objective: replace candidate-shaped shared contracts with query-shaped Resolve
contracts and make public `materialId` handles preserve ref kind.

Expected files:

- `src/contracts/index.ts`
- `src/material/projection/index.ts`
- `src/stage_interface/outputs/material.ts`
- `src/stage_interface/tool_definitions/music.ts`
- `test/contracts/wave1-contracts.test.ts`
- `test/stage_interface/stage-interface-outputs.test.ts`
- `test/stage_interface/stage-interface.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`

Tasks:

- Add `MaterialResolveQuery`, `MaterialResolvedQuery`, and the unified
  `MaterialResolveResult`.
- Replace `MaterialResolveRequest` with `queries`, per-query `limit`, optional
  `ownerScope`, and optional `sessionId`.
- Delete `MusicCandidate`, `ResolvedCandidate`, `single`, and `candidate_set`
  from Resolve contracts.
- Rename public resolve query `kind` to `targetKind`.
- Delete public resolve `purpose`.
- Keep `PublicMaterialResolveInput` only if it adds public-boundary value; if it
  remains, it must mirror the same `queries`, `targetKind`, `ownerScope`, and
  `limit` language.
- Update `materialRefToMaterialId` and `materialIdToRef` so public handles
  preserve `Ref.kind` using `mat:*` and `emat:*`.
- Update Stage Interface compact output to call the Material Projection helper
  instead of returning `material.materialRef.id` directly.
- Update tests to reject `kind`, `purpose`, `sourceLibraryScope`, `sourceRef`,
  `canonicalRef`, and candidate-shaped inputs.
- Add tests proving `mat:same-id` and `emat:same-id` decode to different refs
  and do not overwrite each other in compact output.

Acceptance criteria:

- No exported Resolve contract references `MusicCandidate` or
  `ResolvedCandidate`.
- Public and internal Resolve language both use `targetKind`.
- Public resolve schema rejects `kind` and `purpose`.
- A single query and multiple queries use the same result shape.
- Public `materialId` does not lose `Ref.kind`.
- Stage Interface remains the only owner of compact public output shape.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/contracts/wave1-contracts.test.js
node .tmp-test/test/stage_interface/stage-interface-outputs.test.js
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
```

Commit:

```bash
git add src/contracts/index.ts src/material/projection/index.ts src/stage_interface/outputs/material.ts src/stage_interface/tool_definitions/music.ts test/contracts/wave1-contracts.test.ts test/stage_interface/stage-interface-outputs.test.ts test/stage_interface/stage-interface.test.ts test/stage_interface/stage-interface-dispatch.test.ts
git commit -m "contracts: reshape material resolve queries"
```

## Phase 2: Ephemeral Store Ports And Architecture Guards

Objective: add the smallest internal ephemeral material capability needed by
Resolve and Recommendation Presentation.

Expected files:

- `src/ports/index.ts`
- `src/material/index.ts`
- `src/material/ephemeral/**` or an existing Material Flow file if it already
  owns in-memory transient state
- `src/stage_core/compose.ts`
- `test/architecture/material-boundary.test.ts`
- `test/material_ephemeral/material-ephemeral.test.ts`
- `docs/material/ports.md`

Tasks:

- Add an internal `EphemeralMaterialStorePort` with narrow methods for:
  - putting an ephemeral material entry from provider/source facts;
  - getting an entry by exact `ephemeral_material` ref;
  - deleting consumed entries;
  - cleaning expired / oversized session entries.
- Implement the MVP store in memory.
- Key entries by full ref identity, not raw `id` only.
- Include owner/session metadata and creation/expiry timestamps in entries.
- Export the store factory through the Material Flow barrel only if Stage Core
  needs it for composition.
- Wire one shared store instance into Resolve and Recommendation Presentation.
- Add port key-set assertions so Resolve cannot receive durable registry
  writer capabilities through the ephemeral store.
- Add architecture guards that fail if `src/material/resolve/**` references
  durable materialization writers or a database-backed ephemeral table.

Acceptance criteria:

- Ephemeral state is process-local memory in the MVP.
- Resolve can write ephemeral entries but cannot create or update
  `MaterialRecord`s.
- Presentation can consume ephemeral entries but cannot use a broad material
  store directly.
- `mat:*` and `emat:*` routing is exact and does not fall back by raw id.
- Expired or missing ephemeral refs are explicit failures, not implicit durable
  material creation.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/material_ephemeral/material-ephemeral.test.js
node .tmp-test/test/architecture/material-boundary.test.js
```

Commit:

```bash
git add src/ports/index.ts src/material/index.ts src/material/ephemeral test/material_ephemeral/material-ephemeral.test.ts src/stage_core/compose.ts test/architecture/material-boundary.test.ts docs/material/ports.md
git commit -m "material: add ephemeral material store"
```

Omit files from `git add` when they were not changed.

## Phase 3: Resolve Ports And Implementation

Objective: implement query-shaped text grounding without durable
materialization or public provider evidence.

Expected files:

- `src/material/resolve/index.ts`
- `src/ports/index.ts`
- `src/stage_core/compose.ts`
- `test/material_resolve/material-resolve.test.ts`
- `test/material_resolve/material-relation-filtering.test.ts`
- `test/architecture/material-boundary.test.ts`
- `docs/material/ports.md`

Tasks:

- Inject `MaterialSearchPort` into `createMaterialResolveService`.
- Replace `MaterialResolveStorePort` with projection reads plus exact
  read-only existing-material lookup needed to match provider evidence to
  already durable records.
- Remove Resolve access to `findCanonicalByLabel` and
  `listSourceLibraryItems`.
- Remove `MaterialSourceMaterializerPort` from Resolve service options.
- Update Stage Core composition order so Material Search and the ephemeral
  store are available before Resolve.
- Iterate over `input.queries`; return `{ results }`.
- For each query, call Material Search with `text`, `targetKind`, `ownerScope`,
  and per-query `limit`.
- Project local Search hits through Material Projection.
- Compute internal resolve confidence separately from Material Search score.
- High-confidence local durable results go through existing
  `material_resolution` policy and status folding without provider lookup.
- Low-confidence, ambiguous, or empty local results call
  `SourceGroundingPort.ground`.
- Treat provider results as source/provider facts:
  - if source/canonical evidence matches an existing durable material, return
    the durable `MusicMaterial`;
  - otherwise put an ephemeral entry and return a `MusicMaterial` with
    `materialRef.kind === "ephemeral_material"`.
- Return `source_only` for usable provider/source-backed ephemeral results.
- Return `unresolved` only when there is no useful local or provider evidence,
  or all evidence is unusable before it can produce a material.
- Preserve `provider_no_match`,
  `provider_result_missing_source_ref`, and
  `no_source_or_canonical_grounding` semantics where still applicable.
- Keep confidence, Search evidence, provenance, and provider evidence out of
  ordinary `MaterialResolvedQuery`.

Acceptance criteria:

- Resolve no longer calls local canonical-label lookup.
- Resolve no longer scans Source Library rows.
- Local text hit presence alone does not imply `resolved`.
- Provider lookup is skipped for high-confidence local durable results.
- Provider lookup still happens for low-confidence or no local results.
- Provider evidence without an existing durable material does not create a
  `MaterialRecord`.
- Provider evidence without an existing durable material is returned as
  `source_only` with an `ephemeral_material` ref, not mislabeled
  `unresolved`.
- Resolve service options do not include `MaterialSourceMaterializerPort`.
- Durable `blocked`, `wrong_version`, and `not_playable` behavior remains
  covered through `MaterialPolicyEvaluatorPort` for durable results.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/material_resolve/material-resolve.test.js
node .tmp-test/test/material_resolve/material-relation-filtering.test.js
node .tmp-test/test/architecture/material-boundary.test.js
```

Commit:

```bash
git add src/material/resolve/index.ts src/ports/index.ts src/stage_core/compose.ts test/material_resolve/material-resolve.test.ts test/material_resolve/material-relation-filtering.test.ts test/architecture/material-boundary.test.ts docs/material/ports.md
git commit -m "material: resolve text queries through ephemeral refs"
```

## Phase 4: Query And Related Source-Anchor Callers

Objective: remove `MusicCandidate` source-anchor usage from Material Query and
Related paths without materializing intermediate source-backed rows.

Expected files:

- `src/material/query/index.ts`
- `src/ports/index.ts`
- `src/stage_core/compose.ts`
- `test/material_query/material-query.test.ts`
- `test/material_related/material-related.test.ts`
- `test/architecture/material-boundary.test.ts`
- `docs/material/design.md`
- `docs/material/projection-materialization.md`
- `docs/material/ports.md`

Tasks:

- Convert text-only Query/Related fallback paths to call
  `MaterialResolvePort.resolve` with `MaterialResolveQuery[]`.
- Stop building `MusicCandidate` objects for release tracklist entries.
- For `source_library target: "release_tracks"` and source-album related
  tracks, do not route sourceRef candidates through Resolve and do not create
  durable `MaterialRecord`s merely because the rows are listed.
- When a source-backed track row already has a durable material, project and
  return the durable material.
- When a source-backed track row has no durable material and still needs a
  material handle in Query/Related output, allocate an `ephemeral_material`
  through the same in-memory store.
- Preserve the existing Query rule that ordinary `all`, ordinary
  `source_library`, and `collection` pools retrieve through Material Search and
  do not materialize rows during retrieval.
- Add exact key-set guards for any new narrow Query ephemeral/material lookup
  port.

Acceptance criteria:

- `src/material/query/**` does not reference `MusicCandidate`.
- Source-backed tracklist expansion no longer goes through Resolve.
- Query release-track listing does not create durable `MaterialRecord`s for
  intermediate rows.
- Query still cannot reference registry writer methods directly.
- Ordinary Query retrieval remains Search-backed and read-only.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/material_related/material-related.test.js
node .tmp-test/test/architecture/material-boundary.test.js
```

Commit:

```bash
git add src/material/query/index.ts src/ports/index.ts src/stage_core/compose.ts test/material_query/material-query.test.ts test/material_related/material-related.test.ts test/architecture/material-boundary.test.ts docs/material/design.md docs/material/projection-materialization.md docs/material/ports.md
git commit -m "material: stop query source anchors materializing through resolve"
```

## Phase 5: Recommendation Presentation Consumption

Objective: materialize only selected `ephemeral_material` items at the final
presentation boundary.

Expected files:

- `src/material/presentation/index.ts`
- `src/ports/index.ts`
- `src/stage_core/compose.ts`
- `test/recommendation_presentation/recommendation-presentation.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/architecture/material-boundary.test.ts`
- `docs/material/design.md`
- `docs/material/ports.md`
- `docs/stage-interface/tool-contracts.md`

Tasks:

- Decode each input `materialId` with `materialIdToRef`.
- Route by decoded `Ref.kind`.
- For `material` refs, preserve the existing `MaterialPolicyEvaluatorPort`
  presentation policy flow.
- For `ephemeral_material` refs:
  - get the exact in-memory entry;
  - fail/drop explicitly if missing or expired;
  - check only minimal validity needed for presentation, not durable relation
    policy;
  - keep the item in input order if valid.
- Apply existing `maxCards` / `minCards` rules after durable policy acceptance
  and ephemeral minimal validity.
- Materialize only selected `ephemeral_material` items that survive card limits.
- Convert selected ephemeral items to durable `mat:*` ids before constructing
  `RecommendationPresentationItem`, public output, and the
  `recommendation.presented` event payload.
- Delete consumed ephemeral entries after successful presentation.
- Do not materialize expired, invalid, policy-dropped durable, or max-card
  dropped ephemeral entries.

Acceptance criteria:

- `stage.recommendation.present` can accept both `mat:*` and `emat:*`.
- Existing durable presentation policy behavior remains unchanged for `mat:*`.
- `emat:*` does not run durable relation policy before materialization.
- Only selected `emat:*` entries are materialized.
- Event payload cards use durable `mat:*` handles and durable `materialRef`s.
- Missing/expired `emat:*` is reported as a dropped item or retryable issue,
  not silently ignored or materialized.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/recommendation_presentation/recommendation-presentation.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/architecture/material-boundary.test.js
```

Commit:

```bash
git add src/material/presentation/index.ts src/ports/index.ts src/stage_core/compose.ts test/recommendation_presentation/recommendation-presentation.test.ts test/stage_interface/stage-interface-dispatch.test.ts test/architecture/material-boundary.test.ts docs/material/design.md docs/material/ports.md docs/stage-interface/tool-contracts.md
git commit -m "material: materialize ephemeral selections at presentation"
```

## Phase 6: Stage Interface Output And MCP Surface

Objective: keep public output compact while adapting to query-keyed Resolve
results and encoded material handles.

Expected files:

- `src/stage_interface/outputs/material.ts`
- `src/stage_interface/tool_definitions/music.ts`
- `test/stage_interface/stage-interface-outputs.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/surfaces/mcp-server.test.ts`
- `src/handbook/index.ts` if live Handbook generation depends on static
  descriptors

Tasks:

- Project `MaterialResolvedQuery` to compact public resolve output.
- Echo unresolved query text and optional `id` only as caller correlation or
  diagnostics, not as material identity.
- Ensure compact output uses encoded `materialId` handles and does not expose
  raw `materialRef`.
- Ensure public output does not expose `sourceRef`, `canonicalRef`, raw
  `MusicMaterial`, confidence, Search evidence, provenance, or provider
  payloads.
- Ensure MCP schema parity exposes `targetKind`, not `kind`, and no `purpose`.
- Regenerate or update Handbook-derived artifacts only through the repo's
  normal generation path if the implementation requires it. Do not hand-edit
  generated snapshots.

Acceptance criteria:

- `music.material.resolve` public schema matches the accepted query contract.
- Resolve output may include `emat:*` material handles, but no internal refs.
- Compact public resolve output remains Stage Interface-owned.
- MCP and Stage Interface schemas are in parity.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface-outputs.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
```

Commit:

```bash
git add src/stage_interface/outputs/material.ts src/stage_interface/tool_definitions/music.ts test/stage_interface/stage-interface-outputs.test.ts test/stage_interface/stage-interface-dispatch.test.ts test/surfaces/mcp-server.test.ts src/handbook/index.ts
git commit -m "stage-interface: expose resolve targetKind handles"
```

Omit files from `git add` when they were not changed.

## Phase 7: Final Documentation Sync

Objective: make current authority and progress docs describe the finished
implementation.

Expected files:

- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `docs/material/design.md`
- `docs/material/ports.md`
- `docs/material/projection-materialization.md`
- `docs/material/progress.md`
- `docs/stage-interface/tool-contracts.md`
- `docs/stage-interface/ports.md`
- `docs/stage-interface/progress.md`
- `docs/material/material-resolve-query-plan.md` only if execution learnings
  need correction

Tasks:

- Update current implementation language from planned to implemented.
- Record that Material Resolve now consumes text queries and Material Search.
- Record that provider/source-backed non-durable results use
  `ephemeral_material` refs backed by in-memory state.
- Record that only selected presentation items become durable
  `MaterialRecord`s.
- Record public `music.material.resolve` schema language: `queries[].text`,
  `queries[].targetKind`, no `kind`, no `purpose`.
- Record public `materialId` handle encoding for `mat:*` and `emat:*`.
- Update progress docs with verification evidence and date.
- Run the State Sync Gate and explicitly decide whether `INDEX.md` needs an
  update. This plan file is not current authority, so `INDEX.md` should usually
  remain unchanged unless a new current authority document is introduced.

Acceptance criteria:

- Current docs no longer describe candidate-shaped Resolve behavior.
- Current docs no longer say release-track expansion resolves sourceRef
  candidates through Resolve.
- Current docs no longer describe a separate public preparation/materialization
  step between Resolve and Present.
- Progress docs include the actual verification commands run.
- `INDEX.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`, and `PROGRESS.md` status is
  recorded for the final report.

Verification:

```bash
rg -n "MusicCandidate|ResolvedCandidate|candidate_set|sourceLibraryScope|purpose|queries\\[\\]\\.kind|query kind" src/contracts/index.ts src/material/resolve src/stage_interface/tool_definitions/music.ts docs/material docs/stage-interface -g '!docs/material/material-resolve-query-plan.md'
git diff --check
git diff --name-only
```

Commit:

```bash
git add ARCHITECTURE.md CURRENT_STATE.md PROGRESS.md docs/material/design.md docs/material/ports.md docs/material/projection-materialization.md docs/material/progress.md docs/stage-interface/tool-contracts.md docs/stage-interface/ports.md docs/stage-interface/progress.md docs/material/material-resolve-query-plan.md
git commit -m "docs: sync material resolve query implementation"
```

Omit files from `git add` when they were not changed.

## Final Review And PR Gate

Run the full verification gate:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git status --short
git log --oneline --decorate --max-count=12
```

Then review:

- `git diff main...HEAD --stat`
- `git diff main...HEAD -- src/contracts/index.ts src/material/resolve/index.ts src/material/query/index.ts src/material/presentation/index.ts src/material/projection/index.ts src/ports/index.ts src/stage_interface/tool_definitions/music.ts src/stage_interface/outputs/material.ts`
- all docs changed in Phase 0 and Phase 7

Block PR creation if any of these remain:

- `MusicCandidate` or `ResolvedCandidate` exported from contracts;
- public resolve accepts `kind`, `purpose`, `sourceLibraryScope`, `sourceRef`,
  `canonicalRef`, or `materialRef`;
- public `materialId` loses `Ref.kind`;
- Resolve reads Source Library rows or canonical labels directly;
- Resolve calls materialization or creates durable `MaterialRecord`s;
- provider-backed actionable evidence is returned as plain `unresolved`;
- unselected `emat:*` entries are materialized;
- `emat:*` entries run durable relation policy before materialization;
- Query release-track/sourceRef expansion calls Resolve;
- confidence/evidence/provenance appears in ordinary public Resolve output;
- docs disagree with implementation.

If review passes:

```bash
git push -u origin codex/material-resolve-query-contract
gh pr create --title "Reshape material resolve around ephemeral query results" --body-file <prepared-pr-body>
```

The PR body must include:

- goal and non-goals;
- phase-by-phase commit list;
- changed public contract;
- materialId encoding;
- ephemeral lifecycle;
- presentation materialization boundary;
- architecture boundary changes;
- verification commands and outcomes;
- State Sync Gate results for `INDEX.md`, `CURRENT_STATE.md`,
  `ARCHITECTURE.md`, and `PROGRESS.md`.
