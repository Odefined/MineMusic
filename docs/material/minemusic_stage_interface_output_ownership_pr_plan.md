# MineMusic PR Plan: Stage Interface Output Ownership and Material Boundary Migration

**Date:** 2026-06-01  
**Audience:** Codex implementation agent  
**Goal:** Migrate MineMusic so that Stage Interface owns all agent-facing compact outputs while material core modules return domain results.

---

## 0. Global Execution Rules for Codex

Follow these rules for every PR.

1. **Start each PR from latest `main`.**
2. **Use one branch per PR.**
3. **Keep each PR narrow.** Do not mix unrelated cleanup, provider changes, or product behavior changes.
4. **Run tests before opening the PR.**
5. **Open exactly one GitHub PR after each planned PR section.**
6. **After opening the PR, stop.** Do not begin the next PR until the reviewer explicitly approves.
7. **In the PR body, include:**
   - Summary
   - Design intent
   - Files changed
   - Testing performed
   - Known compatibility notes
8. **Do not remove compatibility shims unless that PR explicitly says to remove them.**
9. **Do not move directories before dependency direction is fixed.**

Required commands for every PR:

```bash
npm run typecheck
npm test
git diff --check
```

Recommended PR branch naming:

```text
codex/stage-interface-outputs-pr1
codex/material-domain-results-pr2
codex/recommendation-presentation-domain-pr3
codex/output-boundary-tests-pr4
codex/material-bounded-context-pr5
```

After opening each PR, provide the PR URL to the reviewer and wait for approval.

---

# PR 1 — Add Stage Interface output projection modules and migrate `music.material.resolve`

## Objective

Create the Stage Interface output ownership location and use it for `music.material.resolve`. This PR should establish the projection pattern without changing all material modules yet.

The key architectural goal is:

```text
music.material.resolve handler returns core MaterialResolveResult
Stage Interface present hook compacts it before returning to the agent
```

## Phase 1.1 — Create output module scaffold

### Goal

Add `src/stage_interface/outputs/**` and define the first compact material output projections.

### Steps

1. Create:

```text
src/stage_interface/outputs/index.ts
src/stage_interface/outputs/material.ts
```

2. In `material.ts`, define Stage Interface-owned compact output types:

```ts
export type CompactMaterialCard = {
  materialId?: string;
  title: string;
  subtitle?: string;
  status: "playable" | "found_no_link" | "ambiguous" | "blocked" | "unresolved";
};

export type CompactCandidateMaterialCard = CompactMaterialCard & {
  materialId: string;
};

export type CompactResolvedCandidate = {
  candidateId: string;
  label: string;
  status: MaterialResolveStatus;
  canonicalRef?: Ref;
  reason?: string;
  issues?: MaterialResolveIssue[];
  items: CompactMaterialCard[];
};

export type CompactMaterialResolveOutput =
  | {
      kind: "single";
      result: CompactResolvedCandidate;
    }
  | {
      kind: "candidate_set";
      results: CompactResolvedCandidate[];
    };
```

3. Implement pure projection functions:

```ts
compactMaterialCard(material: MusicMaterial): CompactMaterialCard
compactCandidateMaterialCard(material: MusicMaterial): CompactCandidateMaterialCard
compactMaterialResolveOutput(result: MaterialResolveResult): CompactMaterialResolveOutput
```

4. Move or duplicate only the minimal projection logic currently in `src/material_cards/index.ts`:
   - material id from `material.materialRef.id`;
   - title from `material.label`;
   - subtitle from evidence note when safe;
   - status mapping from material state.

5. Export output functions from `src/stage_interface/outputs/index.ts`.

### Tests

Add a new test file, for example:

```text
test/stage_interface/stage-interface-outputs.test.ts
```

Test:

- `compactMaterialCard` maps playable material to `status: "playable"`;
- `compactMaterialCard` maps grounded material to `status: "found_no_link"`;
- `compactMaterialCard` maps blocked material to `status: "blocked"`;
- `compactMaterialResolveOutput` preserves candidate status, reason, issues, and canonicalRef;
- compact output does not expose raw `MusicMaterial`, `playableLinks`, `sourceRefs`, or full evidence arrays.

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- `src/stage_interface/outputs/material.ts` exists.
- All new projection functions are named `compact*`.
- New projection tests pass.
- No existing behavior is broken.
- No material core module imports `stage_interface/outputs`.

---

## Phase 1.2 — Use `present` for `music.material.resolve`

### Goal

Stop returning raw `MaterialResolveResult` to the agent from `music.material.resolve`.

### Steps

1. Update `src/stage_interface/tool_definitions/music.ts`.

2. Import:

```ts
import { compactMaterialResolveOutput } from "../outputs/material.js";
```

Adjust the relative path as needed from `tool_definitions/music.ts`.

3. Change `music.material.resolve` tool definition:

```ts
outputSchemaRef: "CompactMaterialResolveOutput",
present: compactMaterialResolveOutput,
```

4. Keep the handler unchanged:

```ts
handler({ context, sessionId, payload }) {
  return context.materialResolve.resolve(
    readPayload<MaterialResolveRequest>(payload, { sessionId }),
  );
}
```

5. Update any descriptor/schema tests that assert the old output schema ref.

6. Update docs or handbook snippets only if tests require it.

### Tests

Add or update dispatch-level test:

```text
test/stage_interface/stage-interface-dispatch.test.ts
```

Test through dispatch:

- calling `music.material.resolve` returns compact result;
- output contains `items`;
- output item contains `materialId`, `title`, `status`;
- output does not expose raw `materials: MusicMaterial[]`.

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- `music.material.resolve` no longer advertises `MaterialResolveResult` as agent-facing output.
- `music.material.resolve` uses `present`.
- Raw resolver result remains available internally through `MaterialResolvePort`.
- The PR does not modify `material_query`, `material_selection`, or `recommendation_presentation` beyond imports required for tests.

---

## PR 1 Completion Requirement

Open a GitHub PR after Phase 1.2.

PR body must state:

```text
This PR establishes Stage Interface-owned compact output projection and applies it first to music.material.resolve. It intentionally leaves material_query/material_selection/recommendation_presentation for later PRs.
```

Stop after opening the PR.

---

# PR 2 — De-card `material_selection` and `material_query`

## Objective

Make `material_selection` and `material_query` return domain results instead of `MaterialCard*`. Stage Interface should compact those results for agent-facing tools.

This PR removes the strongest current pollution path:

```text
material_query/material_selection -> MaterialCard*
```

## Phase 2.1 — Define domain result shapes

### Goal

Introduce domain output types for selection and query.

### Steps

1. In the shared contracts or an appropriate material-domain type file, add domain result types.

Suggested names:

```ts
export type MaterialSelectionItem = {
  materialId: string;
  material: MusicMaterial;
  score?: number;
  reason?: string;
};

export type MaterialSelectionResult = {
  items: MaterialSelectionItem[];
  dropped?: MaterialSelectDropped[];
  warnings?: MaterialSelectWarning[];
  applied?: string[];
};

export type MaterialQueryItem = {
  materialId: string;
  material: MusicMaterial;
  score?: number;
  reason?: string;
};

export type MaterialQueryResult = {
  basis: {
    pool: string;
    applied: string[];
  };
  items: MaterialQueryItem[];
  nextCursor?: string;
};
```

2. Update `MaterialSelectorPort.select` to return `MaterialSelectionResult`.

3. Update `MaterialQueryPort.query` and `MaterialRelatedPort.related` to return domain query/related result shapes.

4. Avoid introducing `Compact*` types into contracts used by material core.

### Tests

Run:

```bash
npm run typecheck
```

At this phase, type errors are expected until implementation is updated. Do not commit until the whole PR compiles.

### Acceptance Criteria

- Domain result types exist.
- They contain `MusicMaterial` or material refs/ids, not card DTOs.
- No `Compact*` types are used by material services.

---

## Phase 2.2 — Update `material_selection`

### Goal

Remove card projection from material selection.

### Steps

1. Update `src/material_selection/index.ts`.

2. Remove imports:

```ts
CandidateMaterialCard
toCandidateMaterialCard from "../material_cards/index.js"
```

3. Change `selectMaterials` so `items` is built as domain items:

```ts
const items = limited.map((candidate) => ({
  materialId: materialRefToMaterialId(candidate.material.materialRef),
  material: candidate.material,
  ...(candidate.score === undefined ? {} : { score: candidate.score }),
  ...(candidate.reason === undefined ? {} : { reason: candidate.reason }),
}));
```

4. Update `warningsForItems` to accept domain items, not `CandidateMaterialCard[]`.

5. Keep policy, sorting, diversity, dropped, warnings, and applied behavior unchanged.

### Tests

Update existing material selection tests or add new tests:

- selected items include `materialId`;
- selected items include domain `material`;
- selected items do not include `title` or `status` as card fields unless they are naturally inside `material`;
- dropped/warnings/applied behavior is unchanged.

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- `src/material_selection/index.ts` does not import `../material_cards/index.js`.
- `src/material_selection/index.ts` does not import `CandidateMaterialCard`.
- `MaterialSelectorPort.select` returns domain result.
- Selection tests pass.

---

## Phase 2.3 — Update `material_query`

### Goal

Remove card projection from material query and related flows.

### Steps

1. Update `src/material_query/index.ts`.

2. Remove imports:

```ts
MaterialCard
MaterialCardStatus
toMaterialCard from "../material_cards/index.js"
```

3. Update `query`:
   - call selector as before;
   - paginate domain `selected.value.items`;
   - return `MaterialQueryResult` with domain items.

4. Update `related` similarly.

5. Update or remove `MaterialCardsPort` usage from `MaterialQueryService` if it is only serving agent-facing card output.
   - Preferred: move `resolveCards` behavior to Stage Interface in this PR or mark it as temporary and remove in PR 4.
   - If kept temporarily, it must be clearly marked as transitional and must not introduce new dependencies.

6. Update helper functions whose only purpose was card projection.

### Tests

Update material query tests:

- query returns domain items;
- query preserves pagination;
- query preserves basis/applied;
- related returns domain items;
- no card DTOs are returned by direct service calls.

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- `src/material_query/index.ts` does not import `../material_cards/index.js`.
- Direct material query service calls return domain results.
- Existing public tool behavior is restored through Stage Interface projection in Phase 2.4.

---

## Phase 2.4 — Add Stage Interface projections for query/select/related

### Goal

Keep agent-facing tool output compact after core services stop returning cards.

### Steps

1. Extend `src/stage_interface/outputs/material.ts`.

Add:

```ts
compactMaterialQueryOutput(...)
compactMaterialRelatedOutput(...)
compactMaterialSelectOutput(...)
compactMaterialResolveCardsOutput(...)
```

2. Update `src/stage_interface/tool_definitions/music.ts`.

For each tool, add `present`:

```text
music.material.query
music.material.related
music.material.select
music.material.resolve.cards
```

3. Update output schema refs:

```text
CompactMaterialQueryOutput
CompactMaterialRelatedOutput
CompactMaterialSelectOutput
CompactMaterialResolveCardsOutput
```

4. Keep handler calls to core ports simple. Do not put policy or query logic into projection functions.

### Tests

Dispatch-level tests:

- `music.material.query` returns compact cards;
- `music.material.related` returns compact cards;
- `music.material.select` returns compact cards;
- direct material services return domain results;
- dispatch output does not expose raw `MusicMaterial`.

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- Agent-facing tools still return compact card-like outputs.
- Material core services no longer return `MaterialCard*`.
- Stage Interface output projection owns all query/select/related compact conversion.
- All tests pass.

---

## PR 2 Completion Requirement

Open a GitHub PR after Phase 2.4.

PR body must state:

```text
This PR converts material_query and material_selection to domain results and moves compact query/select/related tool output into Stage Interface outputs.
```

Stop after opening the PR.

---

# PR 3 — De-card `recommendation_presentation` without moving runtime policy into Stage Interface

## Objective

Remove agent-facing card projection from `recommendation_presentation` while preserving its core/runtime responsibilities.

Important rule:

> Do not move the whole recommendation presentation service into Stage Interface. Move only compact output projection.

## Phase 3.1 — Define domain presentation result

### Goal

Introduce a core/domain result for recommendation presentation.

### Steps

1. Add domain types:

```ts
export type RecommendationPresentationItem = {
  materialId: string;
  materialRef: Ref;
  material: MusicMaterial;
  reason?: string;
  basis?: RecommendationPresentItem["basis"];
  warnings: string[];
};

export type RecommendationPresentationResult =
  | {
      presented: true;
      eventId: string;
      items: RecommendationPresentationItem[];
      dropped?: DroppedMaterial[];
      warnings?: RecommendationPresentWarning[];
    }
  | {
      presented: false;
      items: RecommendationPresentationItem[];
      dropped?: DroppedMaterial[];
      issues: RecommendationPresentIssue[];
      retryable: boolean;
    };
```

2. If keeping existing `RecommendationPresentOutput` name for port compatibility, change its shape to the domain result and move card output naming to Stage Interface.

3. Define domain event payload types that do not extend `MaterialCardSnapshot`.

Suggested:

```ts
export type RecommendationPresentationEventItem = {
  materialId: string;
  materialRef: Ref;
  label: string;
  state: MaterialState;
  identityState: MusicMaterialIdentityState;
  position: number;
  presentedAt: string;
  reason?: string;
  basis?: RecommendationPresentItem["basis"];
  linkRefs?: RecommendationPresentedLinkRef[];
};
```

### Tests

Run:

```bash
npm run typecheck
```

Compile errors are expected until service code is updated.

### Acceptance Criteria

- Domain presentation result types exist.
- They are not named as cards.
- Event snapshot type is not a `MaterialCard*`.

---

## Phase 3.2 — Update `recommendation_presentation`

### Goal

Keep final policy/session/event behavior, remove card output generation.

### Steps

1. Update `src/recommendation_presentation/index.ts`.

2. Remove imports:

```ts
PresentedMaterialCard
PresentedMaterialLink
RecommendationPresentedCardSnapshot
subtitleForMaterial
toMaterialCardIdentityConfidence
toMaterialCardStatus
```

3. Preserve these behaviors:
   - `sessionContext.getSession`;
   - `materialPolicyEvaluator.evaluate`;
   - accepted/dropped/warnings calculation;
   - min/max card count semantics, renamed if necessary to min/max items internally;
   - `events.record({ type: "recommendation.presented" })`.

4. Replace `cards` with domain `items` in core output.

5. Change event payload creation to domain event snapshot, not card snapshot.

6. Keep `dropped`, `warnings`, `issues`, and `retryable` behavior equivalent.

### Tests

Update `test/recommendation_presentation/recommendation-presentation.test.ts`.

Tests must assert:

- service still records `recommendation.presented`;
- service still drops blocked/not playable materials;
- service still enforces min/max semantics;
- service output contains domain `items`, not `cards`;
- service no longer returns `PresentedMaterialCard`.

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- `src/recommendation_presentation/index.ts` does not import `../material_cards/index.js`.
- `src/recommendation_presentation/index.ts` does not import `PresentedMaterialCard`.
- Event recording remains inside core service.
- Recommendation presentation tests pass.

---

## Phase 3.3 — Add Stage Interface recommendation projection

### Goal

Make `stage.recommendation.present` return compact agent-facing cards through Stage Interface.

### Steps

1. Create or extend:

```text
src/stage_interface/outputs/recommendation.ts
```

2. Add:

```ts
compactPresentedMaterialCard(item: RecommendationPresentationItem): CompactPresentedMaterialCard
compactRecommendationPresentOutput(result: RecommendationPresentationResult): CompactRecommendationPresentOutput
```

3. Reuse material projection helpers from `outputs/material.ts` when appropriate.

4. Update `src/stage_interface/tool_definitions/stage.ts`.

For `stage.recommendation.present`, add:

```ts
outputSchemaRef: "CompactRecommendationPresentOutput",
present: compactRecommendationPresentOutput,
```

5. Keep handler unchanged except for type changes:

```ts
return presenter.value.present({ ...payload, sessionId: payload.sessionId ?? sessionId });
```

### Tests

Update dispatch tests:

- `stage.recommendation.present` returns `cards`;
- `cards` contain `materialId`, `title`, `status`, and final links when allowed;
- raw `MusicMaterial` is not exposed;
- core service tests still see domain `items`.

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- `stage.recommendation.present` remains the final recommendation presentation tool.
- Agent-facing result still has compact cards.
- Core presentation service returns domain result.
- Policy/session/event behavior remains core-owned.

---

## PR 3 Completion Requirement

Open a GitHub PR after Phase 3.3.

PR body must state:

```text
This PR removes agent-facing card projection from recommendation_presentation while preserving final policy, session validation, accepted/dropped decisions, and event recording in the core service.
```

Stop after opening the PR.

---

# PR 4 — Remove global card ownership and add boundary tests

## Objective

Finish the boundary cleanup by removing or deprecating global `MaterialCard*` ownership and enforcing import direction.

## Phase 4.1 — Move or alias `MaterialCard*` under Stage Interface

### Goal

Make it impossible for material core modules to depend on card types.

### Steps

1. Move `MaterialCardStatus`, `MaterialCardIdentityConfidence`, `MaterialCard`, `CandidateMaterialCard`, `PresentedMaterialCard`, and related card DTOs out of global core-facing contracts if feasible.

2. If immediate removal is too disruptive, use temporary compatibility aliases only under Stage Interface outputs:

```ts
// src/stage_interface/outputs/material.ts
export type MaterialCard = CompactMaterialCard;
export type CandidateMaterialCard = CompactCandidateMaterialCard;
```

3. Do not import these aliases from material modules.

4. Delete `src/material_cards/index.ts` if no longer used.

5. If deletion is too disruptive, replace it with a deprecation stub that is not used by production modules and add a TODO to remove it in a later cleanup.

### Tests

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- No production material module imports `MaterialCard*`.
- No production material module imports `src/material_cards`.
- `src/material_cards` is deleted or unused/deprecated.
- Stage Interface owns compact output types.

---

## Phase 4.2 — Add import boundary tests

### Goal

Prevent regression.

### Steps

1. Add a boundary test file, for example:

```text
test/architecture/material-boundary.test.ts
```

2. The test should scan `.ts` files under current material modules:

```text
src/material_store/**
src/material_resolve/**
src/material_query/**
src/material_policy/**
src/material_selection/**
src/recommendation_presentation/**
```

3. For those files, fail if they contain imports from:

```text
../stage_interface
../material_cards
```

4. Fail if they import these names from contracts or any module:

```text
MaterialCard
CandidateMaterialCard
PresentedMaterialCard
MaterialCardSnapshot
RecentMaterialCard
RecommendationPresentedCardSnapshot
CompactMaterialCard
CompactCandidateMaterialCard
CompactPresentedMaterialCard
```

5. Make the scanner simple and explicit. Do not add heavyweight lint infrastructure unless already present.

6. Ensure the test runner includes this test.

### Tests

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- Boundary test fails if a material module imports Stage Interface outputs.
- Boundary test fails if a material module imports card DTOs.
- Boundary test passes on current migrated code.

---

## Phase 4.3 — Update documentation

### Goal

Align docs with implemented boundaries.

### Steps

Update relevant docs:

```text
docs/mvp/module-boundaries.md
docs/mvp/interface-contracts.md
docs/stage-interface/progress.md
docs/material/progress.md
CURRENT_STATE.md
```

Required language:

```text
Material modules return domain results. Stage Interface output modules project those results into compact agent-facing outputs. MaterialCard-like DTOs are Stage Interface output types, not material service communication formats.
```

Also document that:

```text
recommendation_presentation remains a core/runtime service for final policy and event recording; only compact output projection belongs to Stage Interface.
```

### Tests

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- Docs match code behavior.
- No doc says material core owns compact card output.
- Docs explicitly state the `recommendation_presentation` split.

---

## PR 4 Completion Requirement

Open a GitHub PR after Phase 4.3.

PR body must state:

```text
This PR completes MaterialCard ownership cleanup and adds boundary tests to prevent core/material modules from importing agent-facing output DTOs.
```

Stop after opening the PR.

---

# PR 5 — Consolidate material modules into `src/material/`

## Objective

After data-shape ownership and dependency direction are correct, consolidate material-related modules under one bounded context.

This PR is structural. It must not introduce new behavior.

## Phase 5.1 — Create bounded context structure

### Goal

Create the target directory tree.

### Steps

Create:

```text
src/material/
  index.ts
  store/
  resolve/
  query/
  policy/
  selection/
  presentation/
```

Move files:

```text
src/material_store/**              -> src/material/store/**
src/material_resolve/**            -> src/material/resolve/**
src/material_query/**              -> src/material/query/**
src/material_policy/**             -> src/material/policy/**
src/material_selection/**          -> src/material/selection/**
src/recommendation_presentation/** -> src/material/presentation/**
```

Notes:

- If a full move is too large, first create wrappers/re-exports under `src/material/**`, then update production imports in the same PR.
- Do not change behavior while moving files.

### Tests

Run after import updates:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- New `src/material/**` tree exists.
- Production code can import material factories from the new bounded context.
- No behavior changes.

---

## Phase 5.2 — Update production imports

### Goal

Use the new material bounded context from Stage Core and related modules.

### Steps

1. Update `src/stage_core/compose.ts`.

Replace imports like:

```ts
import { createMaterialQueryService } from "../material_query/index.js";
import { createMaterialResolveService } from "../material_resolve/index.js";
```

With one of:

```ts
import {
  createMaterialQueryService,
  createMaterialResolveService,
  createMaterialStore,
  createMaterialPolicyEvaluator,
  createRecommendationPresentationService,
} from "../material/index.js";
```

or explicit submodule imports:

```ts
import { createMaterialQueryService } from "../material/query/index.js";
```

2. Update all other production imports to use `src/material/**`.

3. Keep root-level compatibility shims temporarily if tests or external imports still depend on them.

4. Compatibility shims must only re-export. They must not contain implementation logic.

### Tests

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- `stage_core/compose.ts` imports material services from `src/material/**`.
- Root-level material folders are either removed or compatibility-only re-export shims.
- No circular dependency is introduced.
- All tests pass.

---

## Phase 5.3 — Update boundary tests for final paths

### Goal

Make boundary tests enforce the final structure.

### Steps

1. Update the boundary test from PR 4.

2. Primary scan target should become:

```text
src/material/**
```

3. Keep legacy root-module scan only if compatibility shims remain.

4. Boundary checks remain:

```text
src/material/** must not import src/stage_interface/**
src/material/** must not import MaterialCard*
src/material/** must not import Compact*
```

### Tests

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- Boundary tests scan `src/material/**`.
- Boundary tests pass.
- A deliberate forbidden import would fail the test.

---

## Phase 5.4 — Update docs and index files

### Goal

Make the new structure discoverable.

### Steps

1. Update:

```text
INDEX.md
CURRENT_STATE.md
ARCHITECTURE.md
docs/mvp/module-boundaries.md
docs/material/progress.md
```

2. Add a short module ownership note in `src/material/index.ts` comment:

```ts
// Material bounded context public exports.
```

3. Ensure docs say directory consolidation happened after output ownership was fixed.

### Tests

Run:

```bash
npm run typecheck
npm test
git diff --check
```

### Acceptance Criteria

- Documentation matches actual paths.
- `src/material/index.ts` is the public barrel for the material bounded context.
- No stale docs instruct future code to import root-level `material_query` / `material_selection` as primary modules.

---

## PR 5 Completion Requirement

Open a GitHub PR after Phase 5.4.

PR body must state:

```text
This PR consolidates the material bounded context under src/material after Stage Interface output ownership and domain result boundaries have been corrected.
```

Stop after opening the PR.

---

# Final Acceptance Checklist for the Whole Migration

The migration is complete only when all of the following are true:

- [ ] `music.material.resolve` uses Stage Interface projection and does not expose raw `MaterialResolveResult` to the agent.
- [ ] `music.material.query` uses Stage Interface projection and core query returns domain result.
- [ ] `music.material.related` uses Stage Interface projection and core related returns domain result.
- [ ] `music.material.select` uses Stage Interface projection and core selection returns domain result.
- [ ] `stage.recommendation.present` uses Stage Interface projection and core presentation returns domain result.
- [ ] `recommendation_presentation` still owns final policy/session/event behavior.
- [ ] material core modules do not import `MaterialCard*`.
- [ ] material core modules do not import `stage_interface/outputs`.
- [ ] compact output functions are named `compact*`.
- [ ] `src/stage_interface/outputs/**` owns agent-facing output projection.
- [ ] `src/material/**` is the material bounded context.
- [ ] boundary tests enforce dependency direction.
- [ ] `npm run typecheck`, `npm test`, and `git diff --check` pass.

---

# Reviewer Handoff Instruction

After each PR is opened, send the PR URL to the reviewer with this message:

```text
Please review this PR against the Stage Interface output ownership migration plan. Do not approve the next PR until this one passes architectural review and tests.
```

Do not proceed to the next PR until approval is received.
