# MineMusic Recommendation Posture PR Plan for Codex

**Document type:** staged implementation plan  
**Execution rule:** Codex must complete one PR at a time, commit it to GitHub, report the branch/PR/commit SHA and test results, then stop. The reviewer must approve before Codex starts the next PR.  
**Repository:** `Odefined/MineMusic`  
**Design basis:** `minemusic_recommendation_posture_design_final.md`

---

## Global Codex Protocol

For every PR:

1. Create a new branch with a descriptive name.
2. Implement only the PR scope.
3. Keep unrelated refactors out of the PR.
4. Run:
   ```bash
   npm run typecheck
   npm test
   ```
5. Commit all changes.
6. Push/open or update the GitHub PR.
7. Provide:
   - PR number/link
   - commit SHA
   - changed files
   - test output summary
   - any known limitations
8. Stop for review.
9. Do not proceed to the next PR until explicitly approved.

If a PR reveals that the plan is wrong, Codex must stop and report the blocker instead of improvising a larger design change.

---

# PR 1 — Resolve Diagnostics and No Ghost Materials

## Goal

Ensure `material_resolve` never manufactures fake `minemusic/material/unresolved:*` identities. Resolve should only return real Material Store-backed `MusicMaterial[]`, plus diagnostic issues when no grounded material can be produced.

## Current problem

`MusicMaterial.materialRef` is required and should remain required. The incorrect behavior is creating fake material refs for unbacked provider results. Provider results without stable `sourceRef` or `canonicalRef` are not durable materials.

## Phase 1 — Contracts

### Target

Add structured resolve diagnostics.

### Steps

1. Add `MaterialResolveIssue` to `src/contracts/index.ts`.
2. Add `issues?: MaterialResolveIssue[]` to `ResolvedCandidate`.
3. Do not add durable `candidateId`.
4. Do not make `MusicMaterial.materialRef` optional.

### Tests

- Contract typecheck.

### Acceptance

- `ResolvedCandidate` supports optional issues.
- `MusicMaterial` still requires `materialRef`.

## Phase 2 — Resolve projection change

### Target

Stop returning fake unresolved materials.

### Steps

1. Find the `projectSourceMaterial` path that returns fake unresolved material.
2. Replace fake material creation with a projection result:
   ```ts
   { material: MusicMaterial | null; issues?: MaterialResolveIssue[] }
   ```
3. Update `projectSourceMaterials` to collect:
   ```ts
   { materials: MusicMaterial[]; issues: MaterialResolveIssue[] }
   ```
4. Delete or stop using `unresolvedMaterialRef`.
5. Preserve `getOrCreateBySourceRef` when `sourceRefs[0]` exists.
6. Preserve canonical-backed behavior.

### Tests

Add or update tests:

- provider result with `sourceRef` creates `source_backed` material;
- provider result without `sourceRef` and without `canonicalRef` is dropped;
- dropped unbacked provider result emits `provider_result_missing_source_ref`;
- no returned material id starts with `unresolved:`.

### Acceptance

- No resolve output contains `materialRef.id` beginning with `unresolved:`.
- Source-backed provider results still become MaterialRecords.

## Phase 3 — Provider no-match diagnostics

### Target

No-match should inform agent retry decisions.

### Steps

1. In `resolveCandidate`, detect `sourceGrounding.ground(...)` returning empty result.
2. Add issue:
   ```ts
   code: "provider_no_match"
   retryable: true
   query: attempted SourceQuery
   ```
3. Preserve existing reason string if useful.

### Tests

- empty provider result returns `status: "unresolved"`;
- issues include `provider_no_match` and `retryable: true`.

### Acceptance

- Agent can distinguish "bad query/no provider match" from "unbacked provider result."

## Phase 4 — Query/resolve.cards compatibility

### Target

Ensure compact material tools do not produce durable cards for ghost material.

### Steps

1. Update `resolveCandidates` flattening to ignore dropped/unbacked results naturally.
2. Ensure `music.material.query` returns no durable card for unbacked provider result.
3. Ensure `music.material.resolve.cards` returns either no material card or an unresolved non-material diagnostic card without `materialId`.

### Tests

- `music.material.query` does not emit material card for unbacked provider result.
- `resolve.cards` behavior is explicit and does not create fake material id.

### Acceptance

- No agent-facing card references a non-existent Material Store material.

## Review gate

Stop after PR 1. Reviewer checks:

- no ghost material identities;
- source-backed path unchanged;
- diagnostics are visible;
- tests pass.

---

# PR 2 — Extract MaterialPolicyEvaluator and MaterialSorter

## Goal

Extract reusable policy evaluation and sorting logic out of `material_query` without changing agent-facing query behavior yet.

This PR intentionally does **not** introduce final presentation. It builds the reusable substrate.

## Phase 1 — Contracts and ports

### Target

Define policy and sorting contracts.

### Steps

1. Add:
   - `MaterialPolicyInput`
   - `MaterialFreshnessPolicy`
   - `MaterialPolicyDecision`
   - `MaterialSortPolicy`
   - relevant dropped/warning code unions
2. Add ports:
   ```ts
   interface MaterialPolicyEvaluatorPort { evaluate(...): Promise<Result<MaterialPolicyDecision>>; }
   interface MaterialSorterPort { sort(...): Promise<Result<MaterialSortOutput>>; }
   ```
3. Keep these internal/service-facing first if agent-facing exposure is not needed.

### Tests

- Typecheck.

### Acceptance

- Contracts compile and do not change existing tool output.

## Phase 2 — Implement MaterialPolicyEvaluator

### Target

Centralize deterministic allow/degrade/drop logic.

### Steps

1. Create `src/material_policy/index.ts` or `src/material_selection/index.ts`.
2. Implement evaluator:
   - materialId -> `Ref`
   - resolve redirect
   - get MaterialRecord
   - project to `MusicMaterial`
   - load material relations
   - apply relation effects:
     - material-level blocked;
     - source-level wrong_version;
     - source-level not_playable;
     - source-level blocked;
   - apply collection blocks if collection is available;
   - apply availability / identity / freshness policy.
3. Return:
   ```ts
   allow | degrade | drop
   ```

### Tests

Add evaluator tests:

- material not found -> drop;
- material-level blocked -> drop for recommendation presentation purpose;
- source-level not_playable removes/hides link or drops if no displayable source remains;
- source-level wrong_version removes source without blocking whole material;
- recent recommended/played/opened hard policies drop;
- freshness mode `off` never drops for recent activity.

### Acceptance

- Evaluator covers the policy logic now embedded in query/resolve.
- Evaluator does not sort.

## Phase 3 — Implement MaterialSorter

### Target

Centralize ordering without filtering.

### Steps

1. Implement sorter with:
   - `preserve`
   - `score`
   - `least_recently_recommended`
   - `recently_added` if enough data exists, otherwise stable fallback
   - `random` deterministic enough for tests via injected RNG if needed
2. Sorter must not drop items for policy reasons.
3. Sorter may dedupe only if explicitly requested; default should not silently drop.

### Tests

- preserve keeps order;
- score sorts descending or defined order;
- least_recently_recommended uses MaterialActivity;
- sorter does not drop blocked item by itself if input contains it.

### Acceptance

- Sorter and evaluator are separate.

## Phase 4 — Migrate query internals lightly

### Target

Make query use evaluator/sorter internally while preserving current behavior.

### Steps

1. Replace query-local recent/relation filtering with evaluator calls where practical.
2. Replace query-local ordering with sorter calls where practical.
3. Keep external `MaterialQueryInput` stable.
4. Keep query output stable.

### Tests

Existing material query tests must pass. Add regression tests:

- relation exclusion still works;
- recent hard exclusion still works;
- least_recently_recommended still works;
- query output card shape unchanged.

### Acceptance

- No behavior regression.
- Policy code no longer lives only in query.

## Review gate

Stop after PR 2. Reviewer checks:

- query behavior stable;
- evaluator/sorter are independently tested;
- sorter does not filter;
- evaluator does not sort.

---

# PR 3 — Add MaterialSelector and `music.material.select`

## Goal

Add an optional selection helper that combines evaluator + sorter + limit/diversity for any candidate materialIds, without becoming the mandatory recommendation path.

## Phase 1 — Contracts and port

### Target

Define selector input/output.

### Steps

1. Add `MaterialSelectInput`.
2. Add `MaterialSelectOutput`.
3. Add:
   ```ts
   interface MaterialSelectorPort { select(input): Promise<Result<MaterialSelectOutput>>; }
   ```
4. Output should include:
   - selected candidate cards;
   - dropped reasons;
   - warnings;
   - applied policy labels.

### Tests

- Typecheck.

### Acceptance

- Selector contract explicitly composes evaluator and sorter.

## Phase 2 — Implement selector service

### Target

Create reusable selection orchestration.

### Steps

1. For each candidate:
   - evaluate;
   - collect allow/degrade as usable;
   - collect drop as dropped reason.
2. Sort usable candidates with `MaterialSorter`.
3. Apply diversity if requested.
4. Apply limit.
5. Return compact `CandidateMaterialCard[]`.

### Tests

- select with preserve order;
- select with least_recently_recommended;
- select with relation hard drops;
- select with recent hard drops;
- select with diversity cap;
- selected cards remain compact and do not expose source/canonical internals.

### Acceptance

- Selection works independently of query.

## Phase 3 — Add `music.material.select` tool

### Target

Expose optional helper to agent.

### Steps

1. Add tool name to music tool list.
2. Add zod schema.
3. Wire `MaterialSelectorPort` through stage composition and tool context.
4. Generated handbook should expose tool after regeneration.
5. Keep this tool optional; do not require it for every recommendation.

### Tests

- tool descriptor exists;
- schema validates;
- dispatch calls selector;
- output is compact.

### Acceptance

- Agent can choose to call `music.material.select` on any materialIds.

## Phase 4 — Query/related use selector

### Target

Simplify query/related by delegating candidate filtering/sorting/cutting to selector.

### Steps

1. Let query/related build candidate materialIds.
2. Convert legacy `constraints/exclude/order/limit` into selector policy/sort/limit.
3. Preserve public query/related behavior.

### Tests

Existing query/related tests pass.

### Acceptance

- `query` no longer owns policy/sort/select implementation.

## Review gate

Stop after PR 3. Reviewer checks:

- selector is optional;
- query/related still work;
- no present behavior yet;
- no recommendation event changes yet.

---

# PR 4 — Add `stage.recommendation.present`

## Goal

Create the single final presentation boundary for user-visible recommendations.

## Phase 1 — Contracts and port

### Target

Define presentation contracts.

### Steps

1. Add:
   - `MaterialCardSnapshot`
   - `PresentedMaterialCard`
   - `RecentMaterialCard`
   - `RecommendationPresentInput`
   - `RecommendationPresentOutput`
   - `RecommendationPresentedPayload`
   - `DroppedMaterial`
   - `RecommendationPresentIssue`
   - `RecommendationPresentWarning`
2. Add:
   ```ts
   interface RecommendationPresentationPort {
     present(input: RecommendationPresentInput & { sessionId: string }): Promise<Result<RecommendationPresentOutput>>;
   }
   ```
3. Do not remove `MaterialGatePort` yet.

### Tests

- Typecheck.

### Acceptance

- New contracts compile.

## Phase 2 — Implement presenter service

### Target

Gate, snapshot, record, return cards.

### Steps

1. Create `src/recommendation_presentation/index.ts` or equivalent.
2. Inject:
   - sessionContext
   - materialStore
   - MaterialPolicyEvaluator
   - events
   - source/link projection helper if needed
   - collection if evaluator needs it
3. For each input item:
   - evaluate with purpose `recommendation_presentation`;
   - if drop, add dropped reason;
   - if allow/degrade, convert to `PresentedMaterialCard`;
   - carry agent-supplied `reason`;
   - preserve surviving input order.
4. Apply `maxCards` by cutting after preserved-order survivors.
5. If survivors < `minCards`, return `presented:false` and do not record event.
6. If enough cards survive, record typed `recommendation.presented` payload generated from cards.
7. Return `presented:true`, eventId, cards.

### Tests

- present preserves input order after drops;
- present carries agent reason through output;
- present drops blocked material;
- present hides/removes not_playable link;
- present handles wrong_version source without whole-material block;
- present fails with `presented:false` if under `minCards`;
- present records typed event if successful;
- event payload cards match returned card snapshots;
- activity updates from event materialIds.

### Acceptance

- Presenter is the only new code path that creates typed recommendation-presented event.
- Presenter does not call MaterialSelector.
- Presenter does not sort.

## Phase 3 — Add Stage Interface tool

### Target

Expose final presentation boundary.

### Steps

1. Add `stage.recommendation.present` to Stage tools.
2. Add zod schema for `RecommendationPresentInput`.
3. Wire `RecommendationPresentationPort` into Stage Interface tool context.
4. Update Stage Core composition.

### Tests

- descriptor exists;
- schema validates;
- dispatch calls presenter;
- returned cards are compact.

### Acceptance

- Agent can call `stage.recommendation.present`.

## Phase 4 — Restrict manual `recommendation.presented`

### Target

Prevent agent-written drift.

### Steps

1. In agent-facing `stage.events.record` handler, reject:
   - `recommendation.presented`
   - `recommendation_presented`
2. Error message:
   ```text
   Use stage.recommendation.present for recommendation presentation events.
   ```
3. Do not block internal `EventPort.record` calls by services.

### Tests

- stage.events.record rejects recommendation.presented from tool;
- stage.recommendation.present can still record event.

### Acceptance

- Manual payload drift is prevented.

## Phase 5 — recentCards from typed payload

### Target

Derive recentCards only from typed presentation snapshots.

### Steps

1. Update `recentCardsFromEvents`.
2. Accept new `RecommendationPresentedPayload`.
3. Add `presentedAt`.
4. Keep bounded limit.
5. Optionally retain temporary legacy compatibility for old `payload.cards` if needed, but do not support `materialStates`.

### Tests

- context returns recentCards after present;
- position is 1-based;
- eventId and presentedAt exist;
- cards preserve event order;
- no full event payload exposed.

### Acceptance

- Feedback can target recentCards reliably.

## Review gate

Stop after PR 4. Reviewer checks:

- present is strict;
- event is typed;
- order preserved;
- manual record blocked;
- recentCards reliable.

---

# PR 5 — Migrate Recommendation Workflow and Contain `stage.materials.prepare`

## Goal

Move existing recommendation transcript/app/test workflow away from `stage.materials.prepare + manual stage.events.record` and into `stage.recommendation.present`.

## Phase 1 — Update application transcript

### Target

Fix `runRecommendationTranscript`.

### Steps

1. Replace current:
   ```text
   resolve -> stage.materials.prepare -> manual stage.events.record(materialStates)
   ```
   with:
   ```text
   resolve/query -> stage.recommendation.present -> response from returned cards
   ```
2. If no cards are presented, return an honest no-grounded-recommendation response.
3. Ensure memory/effect proposal references the typed event/cards.

### Tests

- transcript records typed recommendation.presented;
- transcript response uses returned cards;
- stage.context.read after transcript contains recentCards;
- no `materialStates` recommendation payload remains.

### Acceptance

- App workflow uses new boundary.

## Phase 2 — Deprecate recommendation use of prepare

### Target

Keep prepare but stop treating it as recommendation boundary.

### Steps

1. Update tool description:
   - legacy/generic material sanitizer;
   - not for final recommendation presentation.
2. Optionally add warning if `purpose: "recommendation"` is used and `stage.recommendation.present` exists.
3. Do not remove compatibility yet.

### Tests

- existing prepare tests pass;
- optional warning test if implemented.

### Acceptance

- New docs/tool descriptions steer recommendation to present.

## Phase 3 — Update SKILL and generated handbook sources

### Target

Align agent workflow.

### Steps

1. Update `skills/minemusic/SKILL.md` Required Flow:
   ```text
   obtain materialIds from any source
   optional music.material.select
   stage.recommendation.present
   answer exactly returned cards
   memory.feedback.record for feedback
   ```
2. Update instrument descriptors/schemas so generated `HANDBOOK.md` includes new tools.
3. Regenerate handbook from schema/descriptor source, not by hand if generated.

### Tests

- handbook generation/snapshot tests if present;
- text assertions that new tools appear;
- text assertions that old manual recommendation.presented flow is absent.

### Acceptance

- Agent-facing workflow reflects final design.

## Phase 4 — Regression coverage

### Target

Ensure old drift cannot return.

### Tests

Add tests:

- manual event payload with `materialStates` is not used for recentCards;
- manual `stage.events.record(recommendation.presented)` rejected by tool;
- `stage.recommendation.present` is required for user-visible recommendation path.

### Acceptance

- Old flow cannot silently reappear.

## Review gate

Stop after PR 5. Reviewer checks:

- workflow migrated;
- docs/tool descriptors updated;
- prepare contained.

---

# PR 6 — Implement `memory.feedback.record`

## Goal

Add the feedback boundary that binds user feedback to presented recentCards and writes durable consequences.

## Phase 1 — Contracts and port

### Target

Define feedback input/output.

### Steps

1. Add `MemoryFeedbackRecordInput`.
2. Add `MemoryFeedbackRecordOutput`.
3. Add consequence output types.
4. Extend `MemoryPort`:
   ```ts
   recordFeedback(input): Promise<Result<MemoryFeedbackRecordOutput>>;
   ```
5. Add needed dependencies to MemoryService options:
   - events
   - materialStore
   - collection
   - maybe sessionContext or a recentCards resolver helper

### Tests

- Typecheck.

### Acceptance

- Contracts compile.

## Phase 2 — Target binding

### Target

Resolve feedback target reliably.

### Steps

1. Implement target forms:
   - `{ recentCardIndex }`
   - `{ eventId, position }`
   - `{ materialId }`
2. For recentCardIndex:
   - read session events;
   - derive recentCards;
   - 1-based index;
   - bind to materialId + title + eventId.
3. If target is missing:
   - may record feedback event;
   - must not write relation/collection consequence;
   - return warning.

### Tests

- recentCardIndex 1 binds first card;
- recentCardIndex 2 binds second card;
- out-of-range returns warning and no relation/collection;
- eventId+position binds exact card.

### Acceptance

- "the second one" works.

## Phase 3 — Feedback event recording

### Target

Record the user feedback fact.

### Steps

1. Record `recommendation.feedback` or equivalent typed event.
2. Include:
   - ownerScope
   - feedbackText
   - target snapshot
   - interpretation kind
   - source presented eventId if available
3. Return feedbackEventId.

### Tests

- feedback event recorded with materialId target;
- event has evidence fields.

### Acceptance

- Every feedback call has factual event unless target failure policy says otherwise.

## Phase 4 — Consequence mapping

### Target

Write relation/collection/memory consequences.

### Steps

Implement:

- `wrong_version`:
  - write source/version-scoped `MusicMaterialRelation` when sourceRef/version context is available;
  - if only materialId is available, warn and avoid whole-material block.
- `not_playable`:
  - write source-scoped `not_playable` where possible;
  - warn if source cannot be determined.
- `block material`:
  - write collection blocked or material-level blocked relation according to current collection policy.
- `block source`:
  - source-scoped blocked relation if source available.
- `like` / `dislike`:
  - weak relation.
- `remember_preference`:
  - create memory proposal only; do not accept long-term memory automatically.

### Tests

- wrong_version does not block whole material;
- not_playable hides/removes source through later evaluator;
- block material makes later query/select/present drop it;
- remember_preference creates memory proposal only;
- missing source for source-scoped consequence warns.

### Acceptance

- Feedback consequences affect later evaluator/query/present paths.

## Phase 5 — Stage Interface memory tool

### Target

Expose tool.

### Steps

1. Add `memory.feedback.record` to memory tool definitions.
2. Add zod schema.
3. Wire MemoryPort method.
4. Update handbook generation.

### Tests

- descriptor exists;
- schema validates;
- dispatch calls service;
- handbook includes tool.

### Acceptance

- Agent can call `memory.feedback.record`.

## Review gate

Stop after PR 6. Reviewer checks:

- feedback binds recent cards;
- consequences scoped correctly;
- partial failures visible;
- no blind relation writes.

---

# PR 7 — Stage Interface Typed Schema Cleanup

## Goal

Reduce future contract drift by making Stage Interface tool definitions typed from Zod schemas instead of `schemaRef + raw shape + unknown payload + readPayload<T>`.

This PR is deliberately last because earlier behavior changes should stabilize first.

## Phase 1 — Generic definition type

### Target

Add typed tool definition shape.

### Steps

1. Define:
   ```ts
   type StageInterfaceToolDefinition<TName, TContext, TInput, TOutput>
   ```
   or equivalent.
2. Use `z.ZodType<TInput>` rather than `ZodRawShape` where possible.
3. Ensure handler payload type is `TInput`, not `unknown`.

### Tests

- Typecheck.

### Acceptance

- New type exists without requiring all tools to migrate at once.

## Phase 2 — Migrate high-risk new tools first

### Target

Migrate tools added in this plan.

### Steps

1. Migrate:
   - `music.material.select`
   - `stage.recommendation.present`
   - `memory.feedback.record`
2. Keep `inputSchemaRef/outputSchemaRef` as generated handbook metadata only.
3. Remove `readPayload<T>` casts in these tools.

### Tests

- tool validation tests still pass;
- invalid payloads fail predictably;
- extra unknown fields behavior is explicit.

### Acceptance

- New recommendation boundary tools have typed handler payloads.

## Phase 3 — Optional broader migration

### Target

Migrate existing music/stage/memory tools incrementally.

### Steps

1. Migrate tools in small groups.
2. Avoid unrelated behavior changes.
3. Preserve public schemas.

### Tests

- full stage interface dispatch tests;
- handbook generation tests.

### Acceptance

- Reduced drift risk.

## Review gate

Stop after PR 7. Reviewer checks:

- typed schema cleanup did not alter behavior;
- new tools no longer rely on unsafe casts.

---

# Suggested PR Order Summary

```text
PR 1  Resolve diagnostics and no ghost materials
PR 2  MaterialPolicyEvaluator + MaterialSorter
PR 3  MaterialSelector + music.material.select + query/related migration
PR 4  stage.recommendation.present + typed event + recentCards
PR 5  workflow/doc migration + prepare containment
PR 6  memory.feedback.record
PR 7  Stage Interface typed schema cleanup
```

This ordering keeps each PR reviewable:

- PR 1 removes identity risk.
- PR 2 creates reusable deterministic policy/sort substrate.
- PR 3 exposes optional selection without presentation coupling.
- PR 4 creates the strict final presentation boundary.
- PR 5 migrates existing workflow and docs.
- PR 6 closes feedback loop.
- PR 7 reduces future schema drift.
