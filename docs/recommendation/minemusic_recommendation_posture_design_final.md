# MineMusic Recommendation Posture Final Design

**Document type:** architecture / product design  
**Status:** final implementation design for staged PR execution  
**Repository basis:** current `Odefined/MineMusic` main as reviewed in this session, plus the earlier pasted recommendation-posture consensus. The earlier document remains useful for goals and vocabulary, but this design supersedes its old `prepare -> record` workflow and `mat_*` handle assumptions.  
**Primary decision:** MineMusic recommendation remains a `StageSession.posture`, not a recommendation engine. The agent remains free to make musical judgments; MineMusic owns material identity, source grounding, policy evaluation, presentation safety, event history, activity projection, and feedback consequences.

---

## 1. Executive Summary

MineMusic should implement recommendation posture as a small set of strict boundaries around an otherwise flexible LLM-driven workflow.

The final model is:

```text
agent obtains materialIds from any source
→ optional policy/sort/select helper calls
→ stage.recommendation.present(...)
→ MineMusic gates, snapshots, records, and returns presented cards
→ agent answers with exactly those returned cards
→ user feedback binds to recent presented cards
→ memory.feedback.record writes event / relation / collection / memory-proposal consequences
```

The key architectural split is:

```text
selection is free
presentation is strict
feedback binds to presented cards
```

The user-facing recommendation flow must not depend on `query` being called first. `query`, `related`, `resolve.cards`, collections, recent context, direct link resolution, DJ logic, or prior context may all yield candidate `materialId`s.

The system must enforce strict final presentation through a single boundary:

```text
stage.recommendation.present
```

This tool is not a recommender. It is the final recommendation presentation boundary. It:

1. receives the agent's intended ordered material list;
2. resolves material redirects and reloads current material records;
3. applies final policy evaluation;
4. preserves surviving input order;
5. generates presented cards;
6. records a typed `recommendation.presented` event;
7. returns the cards the agent must show.

`stage.events.record` must no longer be the agent-facing way to create `recommendation.presented` events.

---

## 2. Goals

### 2.1 Product goals

- Allow the agent to recommend music freely using natural-language judgment.
- Prefer source-backed, material-backed, playable recommendations.
- Avoid repeated recommendations or just-played/opened materials when policy requests it.
- Preserve version-sensitive feedback semantics:
  - "not this version" should not block the whole song;
  - "this cannot play" should not block the whole material;
  - "do not recommend this again" should block the material by default.
- Keep the stage context compact but useful for follow-up references like "the second one".
- Make feedback consequences durable enough to affect later recommendations.

### 2.2 Engineering goals

- Remove ghost material identities.
- Remove duplicated policy logic from `query`, `resolve`, and future `present`.
- Separate `evaluate`, `sort`, and `select`.
- Ensure presentation event payloads are typed and mechanically produced by one service.
- Keep `MusicMaterial.materialRef` required.
- Keep `materialId` as the agent-facing material identifier and full `Ref` internal.
- Avoid introducing a recommendation engine, taste model, ranking model, DJ mode, or playback controller.

---

## 3. Current State Summary

### 3.1 Current strengths

The current repository already has much of the required substrate:

- `MusicMaterial` is store-backed through `materialRef` and `identityState`.
- `MaterialCard` is already moving toward `materialId` rather than compact `mat_*` refs.
- `StageContext.recentCards` is now material-id based.
- `MaterialStorePort` exposes material registry, redirects, source/canonical lookup, material relations, activity, session activity, source library, and confirmed canonical bindings.
- `EventService` can update material activity/session activity from events and can read `materialId` from event payloads/cards.
- `music.material.query` and `music.material.related` already return compact cards and can use recent/relation exclusions.
- `stage.materials.prepare` already accepts `materialIds` in the Stage Interface compatibility path.

### 3.2 Current gaps

#### 3.2.1 `stage.materials.prepare` is not the final presentation boundary

Current `stage.materials.prepare` still delegates to `MaterialGatePort.prepareMaterials`, which returns `MusicMaterial[]`. The current gate only:

```text
validates session
maps materials through a weak purpose-based playable-link sanitizer
records stage.materials.prepared
returns MusicMaterial[]
```

It does not:

```text
produce presented cards
record recommendation.presented
derive recentCards
apply final recommendation policy
preserve user-visible presentation facts
prevent agent-written event drift
```

Therefore it should be treated as legacy/generic material sanitization, not as the final recommendation presentation tool.

#### 3.2.2 `recommendation.presented` is still too loose

`StageEvent.payload` is still `unknown`, and `stage.events.record` accepts arbitrary event payloads. Some existing code records:

```text
type: "recommendation.presented"
payload: { materialStates: [...] }
```

instead of a `cards` snapshot. That cannot reliably feed `recentCards` or activity.

#### 3.2.3 Policy logic is embedded in query/resolve

`music.material.query` currently mixes candidate retrieval, filtering, relation exclusion, recent exclusion, preference hints, and ordering. `material_resolve` also applies relation/block filtering. This creates drift risk when presentation needs the same logic.

#### 3.2.4 Resolve may still produce unclear unresolved results

The target design is that `MusicMaterial` only means store-backed material. If a provider result has no stable `sourceRef` or `canonicalRef`, the resolver should not create a fake `minemusic/material/unresolved:*` ref. It should drop the result and emit diagnostic issues such as `provider_no_match` or `provider_result_missing_source_ref`.

#### 3.2.5 `memory.feedback.record` is missing

Current memory service supports `memory.propose` and `memory.accept`, but does not yet provide the feedback boundary that can bind recent recommendation cards and write consequence records.

---

## 4. Design Principles

### 4.1 Recommendation is a posture, not an engine

Do not add:

```text
RecommendationEngine
RecommendationService
RecommendationMode
TasteModel
IntentParser
LLM replacement ranking model
```

Recommendation posture is a stage state. LLM remains responsible for:

```text
interpreting listening context
choosing candidate materialIds
choosing order
writing user-facing reasons
explaining feedback
```

MineMusic is responsible for:

```text
material identity
source grounding
playable availability
policy evaluation
presentation safety
recent activity
feedback consequences
memory/effect boundaries
```

### 4.2 Query is optional

`music.material.query` is one way to obtain `materialId`s. It must not be hard-coded into the recommendation workflow.

Candidate materialIds may come from:

```text
music.material.query
music.material.related
music.material.resolve.cards
collections
source library
recentCards
direct URL/sourceRef resolution
previous context
agent-maintained working set
DJ/radio policy
```

### 4.3 Evaluate, sort, and select are separate

Do not collapse these:

```text
evaluate = per-material allow/degrade/drop decision
sort     = reorder list only
select   = orchestrate evaluate + sort + diversity + limit/cut
```

This separation matters because final presentation must not re-sort the agent's chosen list.

### 4.4 Presentation is strict and preserves order

`stage.recommendation.present` is the mandatory final gate for user-visible recommendations. It must:

```text
apply final policy
drop/degrade unsafe cards
preserve surviving input order
record typed recommendation.presented
return exactly the cards the agent must show
```

It must **not** call full selector logic that can rank or reorder.

### 4.5 Feedback binds to presented facts

Feedback tools must target presented recentCards, not raw query candidates or provider results. "Second song" means the second card in a typed `recommendation.presented` event.

Feedback binding data path:

1. Use `recentCards` for `eventId`, `position`, and `materialId`.
2. Read the corresponding `recommendation.presented` payload for the compact
   source/link/version snapshot that was actually shown.
3. Use Material Store for current material state and redirects, not as the only
   source of what was presented.

Consequence scoping:

- `wrong_version`: source/link scoped when feedback refers to a specific shown
  link/version; material scoped only when the user rejects the whole material.
- `not_playable`: source/link scoped by default.
- `block` / do not recommend: material scoped by default unless the user says
  only this source/version.
- `like` / `dislike`: material scoped unless source/version specificity is
  explicit.

---

## 5. Core Types

### 5.1 Material identity

Agent-facing material identity:

```ts
export type MaterialId = string;
```

Internal material identity remains:

```ts
export type Ref = {
  namespace: string;
  kind: string;
  id: string;
  label?: string;
  url?: string;
};
```

Mapping:

```ts
function materialIdToRef(materialId: string): Ref {
  return {
    namespace: "minemusic",
    kind: "material",
    id: materialId,
  };
}

function materialRefToMaterialId(ref: Ref): string {
  return ref.id;
}
```

Rules:

```text
materialId is agent-facing
Ref is internal or explicit advanced/debug shape
agent should not construct full material Ref objects
materialId must refer to Material Store-backed material
```

### 5.2 Material cards

Use one shared snapshot base.

```ts
export type MaterialCardStatus =
  | "playable"
  | "playable_unverified"
  | "found_no_link"
  | "ambiguous"
  | "blocked"
  | "unresolved";

export type MaterialCardSnapshot = {
  materialId: string;
  title: string;
  subtitle?: string;
  status: MaterialCardStatus;
};
```

Candidate card:

```ts
export type CandidateMaterialCard = MaterialCardSnapshot & {
  reason?: string;
  actions?: MaterialCardAction[];
};
```

Presented card:

```ts
export type PresentedMaterialLink = {
  label?: string;
  url: string;
  sourceRef?: Ref;
};

export type PresentedMaterialCard = MaterialCardSnapshot & {
  reason?: string; // agent-supplied user-facing reason, carried through
  links?: PresentedMaterialLink[];
  actions?: MaterialCardAction[];
  warnings?: string[];
};
```

Persisted presentation snapshot:

```ts
export type RecommendationPresentedLinkRef = {
  sourceRef: Ref;
  label?: string;
  url?: string;
};

export type RecommendationPresentedCardSnapshot = MaterialCardSnapshot & {
  linkRefs?: RecommendationPresentedLinkRef[];
};
```

Recent card:

```ts
export type RecentMaterialCard = MaterialCardSnapshot & {
  position: number; // 1-based within recommendation.presented event
  eventId: string;
  presentedAt: string;
};
```

These shapes share `MaterialCardSnapshot`, but they have different
responsibilities: `PresentedMaterialCard` is display output, the persisted
`RecommendationPresentedCardSnapshot` is the feedback-binding snapshot, and
`RecentMaterialCard` is the compact context handle.

### 5.3 Resolve diagnostics

```ts
export type MaterialResolveIssue =
  | {
      code: "provider_no_match";
      message: string;
      retryable: true;
      query?: SourceQuery;
    }
  | {
      code: "provider_result_missing_source_ref";
      message: string;
      retryable: false;
      resultLabel?: string;
    }
  | {
      code: "no_source_or_canonical_grounding";
      message: string;
      retryable: true;
      query?: SourceQuery;
    };
```

Extend:

```ts
export type ResolvedCandidate = {
  candidate: MusicCandidate;
  materials: MusicMaterial[];
  status: MaterialResolveStatus;
  canonicalRef?: Ref;
  reason?: string;
  issues?: MaterialResolveIssue[];
};
```

Do not add durable `candidateId` or `unresolvedCandidates` for MVP.

### 5.4 Policy types

```ts
export type MaterialPolicyPurpose =
  | "candidate_selection"
  | "recommendation_presentation"
  | "feedback_target";

export type MaterialFreshnessPolicy = {
  recommended?: "session" | "1h" | "24h" | "7d";
  played?: "session" | "1h" | "24h" | "7d";
  opened?: "session" | "1h" | "24h" | "7d";
  mode?: "hard" | "soft" | "off";
};

export type MaterialPolicyInput = {
  purpose: MaterialPolicyPurpose;
  availability?: "playable" | "any";
  identity?: "confirmed_only" | "allow_source_backed";
  excludeRelations?: Array<"blocked" | "wrong_version" | "not_playable" | "bad_match">;
  freshness?: MaterialFreshnessPolicy;
};
```

Policy evaluation result:

```ts
export type MaterialPolicyDecision =
  | {
      decision: "allow";
      material: MusicMaterial;
      warnings?: string[];
    }
  | {
      decision: "degrade";
      material: MusicMaterial;
      warnings: string[];
    }
  | {
      decision: "drop";
      code:
        | "material_not_found"
        | "blocked"
        | "wrong_version"
        | "not_playable"
        | "recently_recommended"
        | "recently_played"
        | "recently_opened"
        | "not_available"
        | "identity_not_confirmed";
      reason: string;
    };
```

Sort:

```ts
export type MaterialSortPolicy = {
  order:
    | "preserve"
    | "score"
    | "least_recently_recommended"
    | "recently_added"
    | "random";
};
```

Select:

```ts
export type MaterialSelectInput = {
  ownerScope?: string;
  sessionId?: string;
  candidates: Array<{
    materialId: string;
    score?: number;
    reason?: string;
  }>;
  policy?: MaterialPolicyInput;
  sort?: MaterialSortPolicy;
  limit?: number;
  diversity?: {
    maxPerArtist?: number;
    maxPerAlbum?: number;
  };
};
```

### 5.5 Recommendation presentation

Input:

```ts
export type RecommendationPresentInput = {
  ownerScope?: string;
  request?: string;

  items: Array<{
    materialId: string;
    reason?: string;
    basis?: {
      kind:
        | "query"
        | "related"
        | "collection"
        | "recent_context"
        | "direct_resolve"
        | "manual_selection"
        | "mixed";
      note?: string;
    };
  }>;

  minCards?: number;
  maxCards?: number;

  policy?: {
    freshness?: MaterialFreshnessPolicy;
  };
};
```

Output:

```ts
export type RecommendationPresentOutput =
  | {
      presented: true;
      eventId: string;
      cards: PresentedMaterialCard[];
      dropped?: DroppedMaterial[];
      warnings?: RecommendationPresentWarning[];
    }
  | {
      presented: false;
      cards: PresentedMaterialCard[];
      dropped?: DroppedMaterial[];
      issues: RecommendationPresentIssue[];
      retryable: boolean;
    };
```

Event payload:

```ts
export type RecommendationPresentedPayload = {
  ownerScope?: string;
  request?: string;
  presentedAt: string;
  cards: RecommendationPresentedCardSnapshot[];
  basis?: Array<{
    materialId: string;
    kind: string;
    note?: string;
  }>;
};
```

---

## 6. Resolve Design

### 6.1 Responsibility

`material_resolve` is responsible for grounding:

```text
candidate/source/canonical/text -> Material Store-backed MusicMaterial[]
```

It is not responsible for final recommendation display.

### 6.2 Stable source-backed behavior

If a source result has `sourceRefs[0]`, keep current behavior:

```text
sourceRef -> materialStore.getOrCreateBySourceRef -> source_backed MaterialRecord
```

This is the correct path for providers such as NetEase.

### 6.3 Canonical-backed behavior

If a candidate/result has `canonicalRef`, keep current behavior:

```text
canonicalRef -> getOrCreateByCanonicalRef / promote / merge
```

### 6.4 No ghost material identities

If a provider result has neither a stable `sourceRef` nor a `canonicalRef`, do not create:

```text
{ namespace: "minemusic", kind: "material", id: "unresolved:..." }
```

Instead:

```text
drop the unbacked provider result
emit MaterialResolveIssue
```

If provider returns no results:

```text
emit provider_no_match retryable issue
```

### 6.5 Relation projection in resolve

Resolve may retain lightweight source-level projection:

```text
not_playable source relation -> remove that playable link
wrong_version source relation -> remove that source candidate
material-level blocked -> mark state blocked
```

But final presentation must still re-evaluate policy. Resolve output is not permission to present.

---

## 7. Material Policy, Sort, and Select

### 7.1 MaterialPolicyEvaluator

This is the lowest reusable business-policy layer.

Input:

```ts
type MaterialPolicyEvaluationInput = {
  ownerScope: string;
  sessionId?: string;
  materialId: string;
  policy: MaterialPolicyInput;
};
```

Responsibilities:

```text
materialId -> current materialRef via redirect
load material record
project current material state
apply material relations
apply collection blocks
apply availability policy
apply identity policy
apply freshness policy
return allow/degrade/drop
```

It must not rank or select.

### 7.2 MaterialSorter

Sorter takes already evaluated usable materials and reorders them.

Responsibilities:

```text
preserve
score
least_recently_recommended
recently_added
random
```

It must not hard-filter blocked, wrong-version, not-playable, identity, or freshness hard exclusions. That belongs to evaluator.

### 7.3 MaterialSelector

Selector is a convenience orchestrator:

```text
evaluate candidates
sort allowed/degraded candidates
apply diversity
apply limit
return selected + dropped
```

It is suitable for:

```text
music.material.select
query/related convenience
agent optional filtering/sorting
DJ/radio pre-selection
```

It is **not** suitable for final presentation because it can reorder or select.

### 7.4 Use by other modules

```text
music.material.query:
  retrieve candidates
  optionally evaluate/sort/select for convenience
  return CandidateMaterialCard[]

music.material.related:
  derive related candidates
  optionally evaluate/sort/select
  return CandidateMaterialCard[]

stage.recommendation.present:
  call evaluator only
  preserve surviving input order
  do not call sorter or selector
```

---

## 8. Query / Related / Select Tools

### 8.1 Query

`music.material.query` remains a candidate retrieval convenience tool.

It may accept:

```text
pool
q
constraints
exclude
recent policy
order
limit
```

Internally, migrate it away from owning filtering/sorting logic:

```text
candidate retrieval -> MaterialSelector -> CandidateMaterialCard[]
```

Query is optional in the recommendation workflow.

### 8.2 Related

`music.material.related` remains a convenience wrapper:

```text
same_artist
same_album
similar
```

It should derive candidates and delegate policy/sort/select as query does.

### 8.3 Select

Add:

```text
music.material.select
```

This lets the agent apply reusable material policy to any list of materialIds it obtained from any source.

Example:

```ts
music.material.select({
  candidates: [
    { materialId: "m1", reason: "fits late night coding" },
    { materialId: "m2", reason: "same artist as previous card" }
  ],
  policy: {
    purpose: "candidate_selection",
    availability: "playable",
    identity: "allow_source_backed",
    excludeRelations: ["blocked", "wrong_version", "not_playable"],
    freshness: {
      recommended: "session",
      played: "1h",
      opened: "1h",
      mode: "hard"
    }
  },
  sort: { order: "least_recently_recommended" },
  limit: 5
})
```

---

## 9. Recommendation Presentation Boundary

### 9.1 Tool

Add:

```text
stage.recommendation.present
```

This is the only agent-facing way to create a `recommendation.presented` event.

### 9.2 Semantics

The agent calls this after it has chosen the final intended material list.

`present` then:

```text
evaluates each item with MaterialPolicyEvaluator
drops or degrades non-displayable items
preserves surviving input order
generates PresentedMaterialCard[]
records typed recommendation.presented if enough cards survive
returns the exact cards the agent must show
```

### 9.3 Order rule

Given input:

```text
[A, B, C, D]
```

If B is dropped, output must be:

```text
[A, C, D]
```

Never:

```text
[D, A, C]
```

### 9.4 Agent answer rule

If `presented: true`:

```text
agent must answer with exactly output.cards, in order
agent must not add songs not returned by present
agent must not omit returned cards
```

If `presented: false`:

```text
agent must not claim those materials were recommended
agent may retry selection or explain no grounded recommendation is available
```

### 9.5 Manual event restriction

Agent-facing `stage.events.record` must reject:

```text
recommendation.presented
recommendation_presented
```

and instruct:

```text
Use stage.recommendation.present.
```

Internal services may still call `EventPort.record`.

### 9.6 Recent cards

`stage.context.read` derives `recentCards` only from typed `RecommendationPresentedPayload`.

`recentCards` are:

```text
MaterialCardSnapshot + position + eventId + presentedAt
```

---

## 10. Legacy `stage.materials.prepare`

Do not continue expanding `stage.materials.prepare` into the recommendation final boundary.

Treat it as:

```text
legacy/generic material sanitizer
```

Keep temporarily for compatibility:

```text
conversation/material/effect preparation
old tests
old app transcript until migrated
```

Do not use it in new recommendation posture workflow.

Future rename option:

```text
stage.materials.sanitize
```

---

## 11. Feedback Boundary

### 11.1 Tool

Add:

```text
memory.feedback.record
```

Not:

```text
music.material.feedback.record
```

Feedback is semantic interpretation plus durable consequences. Memory owns the interpretation boundary; material relation and collection are consequence stores.

### 11.2 LLM responsibility

The tool is not a natural-language parser. The agent interprets user feedback:

```text
"the second one is the wrong version"
-> target recentCardIndex = 2
-> interpretation wrong_version
```

### 11.3 Input

```ts
export type MemoryFeedbackRecordInput = {
  ownerScope?: string;
  feedbackText: string;

  target:
    | { recentCardIndex: number }
    | { eventId: string; position: number }
    | { materialId: string };

  interpretation:
    | { kind: "wrong_version"; scope?: "source" | "version" }
    | { kind: "not_playable"; scope?: "source" }
    | { kind: "block"; scope?: "material" | "source" }
    | { kind: "like"; scope?: "material" }
    | { kind: "dislike"; scope?: "material" }
    | { kind: "remember_preference"; text: string; scope?: "session" | "long_term" };

  note?: string;
};
```

### 11.4 Consequence mapping

```text
wrong_version:
  source/link scoped MusicMaterialRelation when feedback names a shown version
  material-scoped only when user rejects the whole material

not_playable:
  source scoped MusicMaterialRelation
  hide/remove that source playable link
  no whole-material block

block material:
  material-level relation by default

block source:
  source-scoped blocked relation

like/dislike:
  material-scoped relation by default

remember_preference:
  memory.propose only
  do not directly accept long-term memory
```

### 11.5 Partial success

`feedback.record` should allow partial application:

```text
record feedback event
try relation / collection / memory proposal
return applied consequences + warnings
```

If target cannot be resolved:

```text
may record feedback event
must not write blind relation/collection consequence
must return warning
```

---

## 12. Stage Interface Schema Cleanup

Current Stage Interface definitions mix:

```text
inputSchemaRef string
outputSchemaRef string
zod raw shape
handler payload: unknown
readPayload<T> casts
passthrough
```

This is a drift risk, but it should be handled after the behavioral PRs stabilize.

Target model:

```ts
type StageInterfaceToolDefinition<TInput, TOutput> = {
  name: ToolName;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  handler(input: { sessionId: string; payload: TInput }): Promise<Result<TOutput>>;
};
```

`inputSchemaRef` / `outputSchemaRef` can remain generated handbook metadata, not the source of truth.

---

## 13. SKILL / HANDBOOK / Context

### 13.1 SKILL.md

SKILL is the workflow instruction source.

Update Required Flow to:

```text
1. Read stage.context.read.
2. Obtain intended materialIds from any source.
3. Optionally call music.material.select for reusable policy/sort/select.
4. Call stage.recommendation.present with the intended ordered items.
5. If presented=true, answer with exactly returned cards.
6. If presented=false, retry or explain.
7. For feedback, interpret user text and call memory.feedback.record.
```

### 13.2 HANDBOOK.md

Generated handbook should reflect tool schema and descriptors only.

Do not hand-write workflow into generated HANDBOOK.

### 13.3 StageContext

Keep compact runtime context:

```text
session
vibe
memorySummaries
recentCards
short guidance only
```

Do not insert full workflow into `StageContext.guidance`.

---

## 14. Non-goals

Do not implement in this plan:

```text
RecommendationEngine
taste model
audio embeddings
complex recommender scoring
DJ mode
playback control
playlist writeback
full Web UI
natural language parser inside feedback tool
knowledge.query as playable source
durable unresolved candidate IDs
MusicMaterial.materialRef optional
manual agent-written recommendation.presented
```

---

## 15. Final Target Flow

```text
stage.context.read
→ agent interprets user context
→ agent obtains materialIds from query / related / resolve / collection / recent / context
→ optional music.material.select for reusable policy + sort + cut
→ agent chooses final ordered intended items
→ stage.recommendation.present
   → evaluator hard/degrade/drop
   → preserve order
   → record typed recommendation.presented
   → return PresentedMaterialCard[]
→ agent answers with exactly those cards
→ later user feedback
→ memory.feedback.record
   → bind recentCardIndex/eventId/materialId
   → record feedback event
   → write relation / collection / memory proposal consequences
→ next query/select/present sees relation/activity/memory consequences
```
