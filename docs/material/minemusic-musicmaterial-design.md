# MineMusic MusicMaterial-Centered Material Design

**Status:** design proposal  
**Language:** English  
**Primary subject:** `MusicMaterial` as MineMusic's product-level material target, material retrieval, compact agent-facing material tools, and refactoring guidance.  
**Repository reviewed:** `Odefined/MineMusic`, default branch `main`, freshly fetched during this review.  

---

## 1. Executive Summary

MineMusic already separates musical judgment from grounding, identity, source access, memory, events, and effect boundaries. That separation is correct. The current product-level problem is not that Source Entities and Canonical Records coexist; they must coexist. The problem is that downstream flows still need to reason directly about `sourceRef` versus `canonicalRef`, while `MusicMaterial`, Source Entities, Canonical Records, Collections, Events, Memory, and Effects each carry pieces of the same music object.

This design makes `MusicMaterial` the product-level material projection and makes `materialRef` the only stable product-level target for recommendation, event, memory, collection, feedback, and effect flows.

The design deliberately does **not** introduce a new `MaterialSubject` concept. It also avoids an `anchor` abstraction and avoids `occurrenceId`. The project already has enough vocabulary. The missing pieces are:

1. A persistent Material Registry inside Material Store.
2. `MusicMaterial.materialRef` and `MusicMaterial.identityState`.
3. A clear fact-ownership model so source facts, canonical facts, user relations, activity, and display projections do not duplicate each other ambiguously.
4. A compact agent-facing material card layer.
5. Three material operations with distinct responsibilities:
   - `music.material.resolve`: turn seeds into material cards.
   - `music.material.query`: retrieve material cards from a specified pool with constraints, exclusions, and dedupe.
   - `music.material.related`: convenience wrapper over query for same-artist, same-album, and similar-material flows.
6. A material relation layer for blocked, wrong-version, not-playable, liked/disliked, saved/favorite, and bad-match facts.
7. A material activity projection for recent recommendation/open/play dedupe.

The design keeps the existing MineMusic architecture terms: MineMusic Server, Stage Core, Stage Interface, Stage Modules, Material Store, Source Entity Store, Canonical Store, Collection Service, Material Resolve, Source Grounding, Music Knowledge, Event Service, Memory Service, Effect Boundary, Plugin Slots, and Storage.

---

## 2. Repository Basis Reviewed

This design is based on the current repository implementation and docs, including:

- `README.md`
- `CONTEXT.md`
- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `docs/mvp/interface-contracts.md`
- `docs/platform-library-provider/design.md`
- `docs/knowledge-slot/design.md`
- `docs/collection-service/design.md`
- `src/contracts/index.ts`
- `src/ports/index.ts`
- `src/material_store/index.ts`
- `src/material_store/source_entity/library-import.ts`
- `src/material_resolve/index.ts`
- `src/source/index.ts`
- `src/stage/index.ts`
- `src/stage_interface/tool_definitions/music.ts`
- `src/stage_interface/tool_definitions/library.ts`
- `src/stage_interface/tool_definitions/knowledge.ts`
- `src/stage_interface/outputs.ts`
- `src/storage/sqlite/source-entity-schema.ts`
- `src/storage/sqlite/source-entity-repository.ts`
- `src/providers/netease/index.ts`
- `src/events/index.ts`
- `src/memory/index.ts`
- `src/effects/index.ts`
- `src/stage_core/compose.ts`
- `src/stage_core/types.ts`

Key current-state facts:

- `MusicMaterial` currently has `id`, `kind`, `label`, `state`, optional `canonicalRef`, optional `sourceRefs`, optional `playableLinks`, optional `notes`, and optional `evidence`.
- `SourceEntity` now exists as `SourceTrack | SourceRelease | SourceArtist`, with source-side labels, artist/release facts, provider URLs, provider facts, and release tracklists.
- Source Entity Store owns Source Track/Release/Artist records, Source Library, Library Import/Update state, import history, and Confirmed Canonical Bindings.
- Canonical Store remains the canonical identity subdomain inside Material Store.
- Collection Service is still canonical-only: `CollectionItem` stores `canonicalRef`; blocked filtering only receives `canonicalRefs`.
- `StageEvent.target`, `MemoryEntry.target`, and `DomainEvent.target` are still plain `Ref` targets.
- `EffectProposal.target` is currently `Ref | MusicMaterial | MusicMaterial[]`.
- Stage Interface Tool Definitions now own descriptors, schemas, handlers, runtime validation, and compact presentation rules.
- `library.source.list` already returns compact Source Library short cards and hides raw provider payloads, account identity fields, internal item ids, and full release tracklists.
- `knowledge.query` is a provider-attributed knowledge query interface. It must not return playable material or become canonical authority.

---

## 3. Problem Statement

### 3.1 The current pain

MineMusic has three object layers that are all legitimate:

1. **Source Entity**: a provider-origin track, release, or artist.
2. **Canonical Record**: MineMusic's accepted or provisional identity for a recording, release, release group, artist, work, etc.
3. **MusicMaterial**: the resolved material returned for recommendation or presentation.

The current system still leaks the source/canonical split downstream. Recommendation, event recording, memory proposals, collection actions, effect proposals, and feedback handling must decide whether to target `sourceRef`, `canonicalRef`, or `MusicMaterial`. This creates several failure modes:

- Source-only material can be recommended and played, but cannot participate cleanly in blocked/favorite/save/wrong-version flows.
- Collection-level block only applies when material has canonical identity.
- Event targets can imply canonical certainty when the material was actually source-only.
- Memory targets are currently `Ref`, which forces source-vs-canonical decisions too early.
- Effects accept `Ref | MusicMaterial | MusicMaterial[]`, which mixes target semantics.
- Agent-facing results can become verbose if internal refs, evidence, bindings, and raw source/canonical data are exposed directly.
- Song, artist, and album facts can be duplicated across `MusicMaterial.label`, `Ref.label`, Source Entity facts, and Canonical Records without a clear owner.

### 3.2 Why not canonicalize everything?

Not every source item can or should be immediately bound to a canonical record. Platform data can be incomplete, ambiguous, unavailable, provider-specific, or version-sensitive. Forcing every source item through canonical identity before it can participate in product behavior would block the product's first value: grounded, playable, source-backed recommendation.

The correct strategy is:

```text
source-first availability, canonical-when-consequential
```

Source-backed material can be recommended, played/opened, recorded, and given scoped feedback. Canonical identity should be used for stronger cross-source identity behavior, long-term collection behavior, cross-source dedupe, and stable wrong-version handling when it exists.

---

## 4. Design Goals

1. **Unify product targets.**  
   Every recommendation, event, memory, collection, relation, and effect flow should target a `materialRef`, not a raw `sourceRef` or `canonicalRef`.

2. **Preserve existing architectural boundaries.**  
   Source Entity Store continues to own provider-origin facts. Canonical Store continues to own accepted canonical identity. Music Knowledge continues to return provider-attributed knowledge. Source Grounding continues to own availability and playable links.

3. **Do not introduce unnecessary vocabulary.**  
   Do not introduce `MaterialSubject`, `anchor`, or `occurrenceId`. Use `MusicMaterial`, `materialRef`, `sourceRef`, `canonicalRef`, `eventId`, and relation `scope`.

4. **Keep agent-facing output compact.**  
   Agent-facing material tools should return only what the agent needs for the next step: `ref`, `title`, `subtitle`, `status`, optional `basis`, optional `reason`, and allowed `actions`.

5. **Make scripts deterministic.**  
   Scripts and services should not be responsible for natural-language understanding. The LLM agent translates user language into a structured query plan; MineMusic executes it.

6. **Support pool-restricted material retrieval.**  
   Users must be able to request recommendations from specific pools: saved tracks, saved albums expanded into tracks, followed artists, user collections, related material, or all available material.

7. **Support recent-content dedupe.**  
   The system must exclude or downrank recently recommended, opened, or played material based on structured query parameters.

8. **Keep historical truth stable.**  
   Event snapshots should not be rewritten when source items later gain canonical identity.

---

## 5. Non-Goals

This proposal does not introduce:

- autoplay;
- queue mutation;
- source writeback;
- autonomous DJ behavior;
- a full player runtime;
- a heavy recommender scoring engine;
- a full music intelligence pipeline;
- user-visible canonical review as a default recommendation flow.

It also does not make Music Knowledge an identity authority or a playable material provider.

---

## 6. Core Model: `MusicMaterial`

### 6.1 Current shape

The current `MusicMaterial` contract is:

```ts
export type MusicMaterial = {
  id: string;
  kind: string;
  label: string;
  state: MaterialState;
  canonicalRef?: Ref;
  sourceRefs?: Ref[];
  playableLinks?: PlayableLink[];
  notes?: string;
  evidence?: MaterialEvidence[];
};
```

This should be extended, not replaced.

### 6.2 Proposed internal shape

```ts
export type MaterialIdentityState =
  | "canonical_confirmed"
  | "source_backed"
  | "ambiguous"
  | "unresolved";

export type MusicMaterial = {
  /**
   * Existing material result id. May remain provider-derived, fixture-derived,
   * or occurrence-like. It is not the stable product target.
   */
  id: string;

  /**
   * Stable MineMusic product-level material target.
   * All product behaviors should target this.
   */
  materialRef: Ref;

  /**
   * Product/material kind. User-facing "song" or "track" normalizes to recording.
   */
  kind: "recording" | "release" | "release_group" | "artist" | "work" | (string & {});

  /**
   * Resolved display label for the current projection.
   * Not authoritative metadata.
   */
  label: string;

  /**
   * Current material state for presentation and playability.
   */
  state: MaterialState;

  /**
   * Identity certainty of this material projection.
   */
  identityState: MaterialIdentityState;

  /**
   * Current canonical identity if known.
   * Identity pointer, not product target.
   */
  canonicalRef?: Ref;

  /**
   * Source pointers supporting this material.
   * Source pointers, not product targets.
   */
  sourceRefs?: Ref[];

  playableLinks?: PlayableLink[];
  notes?: string;
  evidence?: MaterialEvidence[];
};
```

### 6.3 Required semantics

- `materialRef` is the stable product-level target.
- `canonicalRef` and `sourceRefs` are supporting identity/source pointers.
- `label` is a display projection. It is not the authoritative song, artist, or album title.
- `state` tells whether the material is currently playable, grounded, blocked, unresolved, etc.
- `identityState` tells how stable the object identity is.

### 6.4 Track vs recording

`track` should remain a source-layer concept.

- Source layer: `SourceTrack`, `sourceRef.kind = "track"`.
- Product/material layer: user-facing "track" or "song" normalizes to `kind = "recording"`.
- Canonical layer: `CanonicalKind = "recording"`.
- Release tracklist position is not a product kind; it is release/source tracklist context.

Recommended normalization:

```ts
export type AgentSeedKind =
  | "song"
  | "track"
  | "recording"
  | "artist"
  | "album"
  | "release"
  | "release_group"
  | "work";

export type MaterialKind =
  | "recording"
  | "release"
  | "release_group"
  | "artist"
  | "work";

export function normalizeSeedKind(kind?: AgentSeedKind): MaterialKind | undefined {
  switch (kind) {
    case "song":
    case "track":
    case "recording":
      return "recording";
    case "album":
      return "release_group";
    case "release":
      return "release";
    case "release_group":
      return "release_group";
    case "artist":
      return "artist";
    case "work":
      return "work";
    default:
      return undefined;
  }
}
```

---

## 7. Fact Ownership

The design must prevent fact duplication. The rule is:

```text
Each fact has one authoritative owner.
MusicMaterial may carry display projections and snapshots, but not canonical truth or source truth.
Ref.label and Ref.url are hints only.
```

### 7.1 Fact ownership table

| Fact | Authoritative owner | May appear in `MusicMaterial`? | Notes |
| --- | --- | --- | --- |
| Provider track id | Source Entity Store | as `sourceRefs[]` | `sourceRef` is pointer |
| Provider track title | SourceTrack | as display label snapshot | not authoritative in `MusicMaterial` |
| Provider artist names | SourceTrack / SourceArtist | as subtitle/evidence summary | source-side fact |
| Provider album title | SourceTrack / SourceRelease | as subtitle/evidence summary | source-side fact |
| Provider URL | SourceEntity / Source Provider | as playable link or hint | playability is source-owned |
| Playable URL | Source Grounding / Source Provider | yes | not canonical fact |
| Requires account | PlayableLink / Source Provider | yes | availability fact |
| Canonical title | Canonical Store | as display label snapshot | canonical fact |
| Canonical artist/release relation | Canonical Store | as compact display summary | canonical relation |
| Source library membership | Source Library | as pool membership basis | owner-scoped platform fact |
| `providerAddedAt` | Source Library / import provenance | as optional basis summary | not canonical fact |
| Saved/favorite/blocked | Material Relation / Collection view | as state/action result | user relation |
| Wrong version / not playable | Material Relation | as filtering/warning | scoped user relation |
| Recommendation reason | Recommendation layer / event | as optional reason | not identity fact |
| Event-time material display | Event snapshot | yes, snapshot | historical fact |
| Knowledge tags/relations | Music Knowledge | as hint/basis | provider-attributed only |

### 7.2 `Ref` rule

The current `Ref` shape allows `label` and `url`. Keep this shape, but clarify the contract:

```ts
export type Ref = {
  namespace: string;
  kind: string;
  id: string;

  /** Non-authoritative display hint only. */
  label?: string;

  /** Non-authoritative navigation hint only. Playability must come from PlayableLink. */
  url?: string;
};
```

### 7.3 MusicMaterial as projection

`MusicMaterial` is a projection assembled by Material Resolve and Material Store. It can duplicate display data for presentation and event snapshots, but it is not the owner of source-side or canonical-side metadata.

---

## 8. Material Registry

### 8.1 Purpose

A Material Registry must be added inside Material Store. It is the durable bridge between product-level material targets and the existing source/canonical identity layers.

It answers:

```text
Which product-level materialRef is represented by these source refs and/or canonical refs?
```

It does not answer:

```text
Is this playable right now?
Should this be recommended?
What does the user like?
Which canonical identity is correct?
```

### 8.2 Proposed record

```ts
export type MaterialRecordStatus = "active" | "merged" | "rejected";

export type MaterialRecord = {
  materialRef: Ref;
  kind: "recording" | "release" | "release_group" | "artist" | "work" | (string & {});
  identityState: MaterialIdentityState;
  canonicalRef?: Ref;
  sourceRefs: Ref[];
  primarySourceRef?: Ref;
  status: MaterialRecordStatus;
  mergedIntoMaterialRef?: Ref;
  createdAt: string;
  updatedAt: string;
};
```

### 8.3 Required indexes

At minimum:

```text
sourceRef -> materialRef
canonicalRef -> materialRef
materialRef -> MaterialRecord
materialRef redirect -> current materialRef
```

Public lookup and get-or-create operations should follow `materialRef`
redirects and return the current survivor record. Raw merged records remain
available by direct `getMaterialRecord` for audit or inspection workflows.
`promoteToCanonical` is a one-way transition from source-backed material to a
canonical-confirmed material; it must reject attempts to replace an existing
different canonical ref. `mergeMaterials` must reject self-merge before writing
a redirect.

### 8.4 Storage proposal

SQLite tables:

```sql
CREATE TABLE material_records (
  material_namespace TEXT NOT NULL,
  material_kind TEXT NOT NULL,
  material_id TEXT NOT NULL,
  material_ref_json TEXT NOT NULL,
  kind TEXT NOT NULL,
  identity_state TEXT NOT NULL,
  canonical_ref_json TEXT,
  primary_source_ref_json TEXT,
  status TEXT NOT NULL,
  merged_into_material_ref_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  record_json TEXT NOT NULL,
  PRIMARY KEY (material_namespace, material_kind, material_id)
);

CREATE TABLE material_source_refs (
  source_namespace TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  material_namespace TEXT NOT NULL,
  material_kind TEXT NOT NULL,
  material_id TEXT NOT NULL,
  source_ref_json TEXT NOT NULL,
  material_ref_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_namespace, source_kind, source_id)
);

CREATE TABLE material_canonical_refs (
  canonical_namespace TEXT NOT NULL,
  canonical_kind TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  material_namespace TEXT NOT NULL,
  material_kind TEXT NOT NULL,
  material_id TEXT NOT NULL,
  canonical_ref_json TEXT NOT NULL,
  material_ref_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (canonical_namespace, canonical_kind, canonical_id)
);

CREATE TABLE material_redirects (
  from_namespace TEXT NOT NULL,
  from_kind TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_namespace TEXT NOT NULL,
  to_kind TEXT NOT NULL,
  to_id TEXT NOT NULL,
  from_ref_json TEXT NOT NULL,
  to_ref_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (from_namespace, from_kind, from_id)
);
```

### 8.5 MaterialRegistry port

```ts
export interface MaterialRegistryPort {
  getMaterialRecord(input: { materialRef: Ref }): Promise<Result<MaterialRecord | null>>;
  findMaterialBySourceRef(input: { sourceRef: Ref }): Promise<Result<MaterialRecord | null>>;
  findMaterialByCanonicalRef(input: { canonicalRef: Ref }): Promise<Result<MaterialRecord | null>>;

  getOrCreateBySourceRef(input: {
    sourceRef: Ref;
    kind: MaterialRecord["kind"];
    primarySourceRef?: Ref;
  }): Promise<Result<MaterialRecord>>;

  getOrCreateByCanonicalRef(input: {
    canonicalRef: Ref;
    kind: MaterialRecord["kind"];
    sourceRefs?: Ref[];
  }): Promise<Result<MaterialRecord>>;

  attachSourceRef(input: { materialRef: Ref; sourceRef: Ref }): Promise<Result<MaterialRecord>>;
  promoteToCanonical(input: { materialRef: Ref; canonicalRef: Ref }): Promise<Result<MaterialRecord>>;

  mergeMaterials(input: {
    fromMaterialRef: Ref;
    toMaterialRef: Ref;
    reason: string;
  }): Promise<Result<MaterialRecord>>;

  resolveMaterialRedirect(input: { materialRef: Ref }): Promise<Result<Ref>>;
}
```

### 8.6 Composition changes

`createMaterialStore` should receive a Material Registry repository and expose Material Registry methods through `MaterialStorePort`. Stage Core repository selection must initialize the Material Registry storage from the same `materialStoreDatabasePath` that currently backs canonical/source-entity storage.

Current `composeMineMusicStageCore` assembles Canonical Store, Material Store, Collection, Source Grounding, Knowledge, Material Resolve, Library Import, Events, Memory, and Effects. The Material Registry should be assembled inside the Material Store boundary and then passed to Material Resolve via `MaterialStorePort`.

---

## 9. Material Relations

### 9.1 Purpose

`MusicMaterialRelation` records user- or system-owned relationships to a material. It replaces the need for separate source feedback stores, canonical-only block filters, and ambiguous memory targets.

It answers:

```text
What relationship does this owner have to this material, and at what scope?
```

### 9.2 Relation scope

Use `eventId` for event-scoped feedback. Do not introduce `occurrenceId`.

```ts
export type MusicMaterialRelationScope =
  | { level: "material" }
  | { level: "source"; sourceRef: Ref }
  | { level: "version"; note?: string }
  | { level: "event"; eventId: string };
```

Meaning:

- `material`: applies to the whole material.
- `source`: applies only to a source item/link/result.
- `version`: applies to a version-level preference not yet represented by precise canonical identity.
- `event`: applies only to a recommendation/open/play event context.

### 9.3 Relation kinds

```ts
export type MusicMaterialRelationKind =
  | "saved"
  | "favorite"
  | "blocked"
  | "wrong_version"
  | "not_playable"
  | "bad_match"
  | "liked"
  | "disliked"
  | "memory_preference";
```

### 9.4 Proposed relation record

```ts
export type MusicMaterialRelation = {
  id: string;
  ownerScope: string;
  materialRef: Ref;
  relationKind: MusicMaterialRelationKind;
  scope: MusicMaterialRelationScope;
  source: "user_explicit" | "event_derived" | "imported" | "system";
  evidenceEventIds?: string[];
  status: "active" | "pending_identity" | "removed" | "rejected";
  createdAt: string;
  updatedAt: string;
};
```

### 9.5 Filtering semantics

| Relation | Scope | Behavior |
| --- | --- | --- |
| `blocked` | `material` | material state becomes `blocked` or is excluded by query |
| `blocked` | `source` | matching source is excluded or downranked |
| `not_playable` | `source` | source playable link is removed |
| `wrong_version` | `source` | matching source is filtered or strongly downranked |
| `wrong_version` | `version` | version-related candidates are filtered when version hints match |
| `bad_match` | `event` | not a global block; use as ranking/activity signal |
| `liked` | `material` | positive ranking/memory signal |
| `disliked` | `material` or `event` | downranking, depending on scope |
| `saved` | `material` | pool membership / collection view |
| `favorite` | `material` | stronger positive preference |

### 9.6 Collection migration

Current Collection is canonical-only. This design proposes that Collection Service should become a view over material relations and/or store material-ref-backed collection items.

Proposed `CollectionItem` migration shape:

```ts
export type CollectionItem = {
  id: string;
  collectionId: string;
  materialRef: Ref;
  materialSnapshot: MusicMaterialSnapshot;
  relationScope: MusicMaterialRelationScope;
  identityRequirement: "none" | "source_backed" | "canonical_confirmed";
  status: "active" | "pending_identity" | "removed";
  label: string;
  description?: string;
  position?: number;
  createdAt: string;
  removedAt?: string;

  /** compatibility only */
  canonicalRef?: Ref;
};
```

System relation policies:

| Relation | Identity requirement | Source-only behavior |
| --- | --- | --- |
| `saved` | canonical preferred | `pending_identity` allowed |
| `favorite` | canonical preferred | `pending_identity` or reject by policy |
| `blocked` | none | active allowed |
| custom collection | configurable, default canonical preferred | pending allowed only if product wants it |

This solves the current problem where source-only recommendations cannot be blocked through Collection Service.

---

## 10. Material Activity

### 10.1 Purpose

Recent recommendation/open/play dedupe should not require scanning raw events on every query. Events remain the factual source. Material Activity is a query projection.

### 10.2 Proposed record

```ts
export type MaterialActivity = {
  ownerScope: string;
  materialRef: Ref;
  lastRecommendedAt?: string;
  lastOpenedAt?: string;
  lastPlayedAt?: string;
  lastSkippedAt?: string;
  recommendedCountSession?: number;
  openedCountSession?: number;
  playedCountSession?: number;
  updatedAt: string;
};
```

### 10.3 Event-driven updates

Update activity on events such as:

- `recommendation.presented`
- `material.opened`
- `material.played`
- `material.skipped`
- `effect.approved` with `open_source_link` / `play_source_link`

Current NetEase does not support platform listening history; therefore `recentlyPlayed` initially means MineMusic-observed open/play events. Platform listening history can be added later via provider support.

---

## 11. Event, Memory, and Effect Targets

### 11.1 Material snapshot

```ts
export type MusicMaterialSnapshot = {
  materialRef: Ref;
  id: string;
  kind: string;
  label: string;
  state: MaterialState;
  identityState: MaterialIdentityState;
  canonicalRef?: Ref;
  sourceRefs?: Ref[];
  playableLinks?: PlayableLink[];
};
```

### 11.2 StageEvent target

Replace plain `target?: Ref` with:

```ts
export type StageEventTarget = {
  materialRef: Ref;
  snapshot?: MusicMaterialSnapshot;
};

export type StageEvent = {
  id: string;
  time: string;
  sessionId: string;
  actor: "user" | "llm" | "stage" | "instrument" | "plugin";
  type: string;
  target?: StageEventTarget;
  payload: unknown;
};
```

Compatibility path:

- Keep accepting old `target?: Ref` in payload validation for one migration window.
- Internally normalize to `StageEventTarget` when possible.

### 11.3 Memory target

```ts
export type MemoryTarget =
  | {
      kind: "material";
      materialRef: Ref;
      scope: MusicMaterialRelationScope;
    }
  | {
      kind: "pattern";
      text: string;
      scope: "session" | "long_term";
    };
```

`MemoryEntry.target?: Ref` should be replaced by `target?: MemoryTarget`, while preserving the existing evidence-gated proposal behavior.

### 11.4 Effect target

```ts
export type MusicMaterialActionScope =
  | "open_source_link"
  | "play_source_link"
  | "save_material"
  | "block_material"
  | "block_source"
  | "remember_preference"
  | "review_identity";

export type MusicMaterialActionTarget = {
  materialRef: Ref;
  snapshot?: MusicMaterialSnapshot;
  actionScope: MusicMaterialActionScope;
};

export type EffectProposal = {
  id: string;
  kind: string;
  target?: MusicMaterialActionTarget | MusicMaterialActionTarget[];
  preview?: string;
  reason?: string;
  requiresConfirmation: boolean;
  reversible?: boolean;
};
```

This replaces the current `Ref | MusicMaterial | MusicMaterial[]` ambiguity.

---

## 12. Agent-Facing Material Cards

Agent-facing output should not mirror the internal model. The agent does not need raw source refs, canonical refs, bindings, provider account ids, raw evidence, full tracklists, or knowledge graphs by default.

### 12.1 MaterialCard

```ts
export type MaterialCardStatus =
  | "playable"
  | "playable_unverified"
  | "found_no_link"
  | "ambiguous"
  | "blocked"
  | "unresolved";

export type MaterialCardAction =
  | "open"
  | "more_like_this"
  | "same_artist"
  | "same_album"
  | "not_this_version"
  | "block"
  | "remember";

export type MaterialCard = {
  /** Opaque material handle. Agent passes this back. */
  ref: string;
  title: string;
  subtitle?: string;
  status: MaterialCardStatus;
  reason?: string;
  actions?: MaterialCardAction[];
};
```

### 12.2 Ref encoding

Agent-facing `ref` should be an opaque encoded `materialRef`, for example:

```text
mat_<opaque-id>
```

The agent must never construct it. It only receives it from MineMusic outputs and passes it back into MineMusic tools.

### 12.3 Status mapping

| Internal material state | Identity state | Card status |
| --- | --- | --- |
| `confirmed_playable` | `canonical_confirmed` | `playable` |
| `confirmed_playable` | `source_backed` | `playable_unverified` |
| `source_only_playable` | any non-confirmed | `playable_unverified` |
| `grounded` | any | `found_no_link` |
| `blocked` | any | `blocked` |
| `unresolved` / `exploration` / `verbal_only` | any | `unresolved` |
| multiple likely identities | `ambiguous` | `ambiguous` |

### 12.4 Actions

Generate actions from current material properties:

- `open`: material has presentable playable link.
- `same_artist`: material context has source or canonical artist basis.
- `same_album`: material context has source or canonical release/release-group basis.
- `not_this_version`: source-backed or version-sensitive material.
- `block`: any material with materialRef.
- `remember`: user feedback can become evidence-backed memory.

---

## 13. Resolve

### 13.1 Responsibility

`resolve` turns a seed into resolved material cards.

It should answer:

```text
What material does this seed correspond to, and what can the agent safely present or do next?
```

It should not answer:

```text
What should the final recommendation be?
What does the user generally like?
Should identity be canonically confirmed?
```

### 13.2 Agent-facing seed

The current `MusicCandidate` can remain internally. Agent-facing language should use `seed`.

```ts
export type ResolveSeed = {
  ref?: string;
  text?: string;
  kind?: AgentSeedKind;

  /** advanced/internal */
  sourceRef?: Ref;
  canonicalRef?: Ref;

  reason?: string;
};
```

### 13.3 Agent-facing input

```ts
export type MaterialResolveCardsInput = {
  seeds: ResolveSeed[];
  purpose?: "recommend" | "lookup" | "play" | "memory" | "effect";
  ownerScope?: string;
  limit?: number;
};
```

### 13.4 Agent-facing output

```ts
export type MaterialResolveCardsOutput = {
  items: MaterialCard[];
  next?: {
    suggestedAction?: "present" | "ask_clarification" | "choose_one" | "retry";
    question?: string;
  };
};
```

### 13.5 Internal algorithm

```ts
async function resolveSeeds(input: {
  seeds: ResolveSeed[];
  ownerScope: string;
  purpose: "recommend" | "lookup" | "play" | "memory" | "effect";
  limit?: number;
}): Promise<MusicMaterial[]> {
  const materials: MusicMaterial[] = [];

  for (const seed of input.seeds) {
    materials.push(...await resolveOneSeed(seed, input));
  }

  const redirected = await resolveRedirects(materials);
  const deduped = dedupeByMaterialRef(redirected);
  const relationApplied = await applyMaterialRelations(deduped, input.ownerScope, input.purpose);
  const ranked = rankResolvedMaterials(relationApplied, input);

  return ranked.slice(0, input.limit ?? ranked.length);
}
```

### 13.6 Seed paths

```ts
async function resolveOneSeed(seed: ResolveSeed, ctx): Promise<MusicMaterial[]> {
  if (seed.ref) return [await materialFromMaterialRef(seed.ref, ctx)];
  if (seed.canonicalRef) return [await materialFromCanonicalRef(seed.canonicalRef, ctx)];
  if (seed.sourceRef) return [await materialFromSourceRef(seed.sourceRef, ctx)];
  if (seed.text) return await materialsFromTextSeed(seed, ctx);
  return [unresolvedMaterial(seed)];
}
```

### 13.7 Source ref path

```text
sourceRef
  -> get or fetch SourceEntity
  -> check ConfirmedCanonicalBinding
  -> get/create MaterialRecord
  -> project MusicMaterial
```

### 13.8 Canonical ref path

```text
canonicalRef
  -> get CanonicalRecord
  -> list bound sourceRefs
  -> get/create MaterialRecord
  -> project MusicMaterial
```

### 13.9 Text seed path

```text
text
  -> canonical lookup by label/alias/kind
  -> source provider search
  -> optional knowledge lookup for disambiguation/hints
  -> materialize each hit
  -> dedupe/rank
```

Knowledge is never returned directly as playable material. Knowledge facts may generate seeds or improve disambiguation.

### 13.10 Projection

```ts
async function projectMaterial(record: MaterialRecord, ctx): Promise<MusicMaterial> {
  const canonical = record.canonicalRef
    ? await canonicalStore.get(record.canonicalRef)
    : undefined;

  const sourceEntities = await sourceEntityStore.list(record.sourceRefs);
  const display = chooseDisplay({ canonical, sourceEntities, purpose: ctx.purpose });
  const playableLinks = await resolvePlayableLinks({ record, sourceEntities, purpose: ctx.purpose });
  const relations = await relationStore.listForMaterial(ctx.ownerScope, record.materialRef);
  const state = computeMaterialState({ record, playableLinks, relations });

  return {
    id: display.id,
    materialRef: record.materialRef,
    kind: record.kind,
    label: display.label,
    state,
    identityState: record.identityState,
    ...(record.canonicalRef ? { canonicalRef: record.canonicalRef } : {}),
    ...(record.sourceRefs.length ? { sourceRefs: record.sourceRefs } : {}),
    ...(playableLinks.length ? { playableLinks } : {}),
    ...(display.evidence.length ? { evidence: display.evidence } : {})
  };
}
```

### 13.11 Source-to-canonical binding merge

When a source ref later gains a confirmed canonical binding, Material Registry must reconcile existing source-backed and canonical-backed material records.

```ts
async function bindSourceToCanonical(sourceRef: Ref, canonicalRef: Ref): Promise<MaterialRecord> {
  const sourceMaterial = await registry.findMaterialBySourceRef({ sourceRef });
  const canonicalMaterial = await registry.findMaterialByCanonicalRef({ canonicalRef });

  if (!sourceMaterial && !canonicalMaterial) {
    return registry.getOrCreateByCanonicalRef({ canonicalRef, kind: inferKind(canonicalRef), sourceRefs: [sourceRef] });
  }

  if (sourceMaterial && !canonicalMaterial) {
    return registry.promoteToCanonical({ materialRef: sourceMaterial.materialRef, canonicalRef });
  }

  if (!sourceMaterial && canonicalMaterial) {
    return registry.attachSourceRef({ materialRef: canonicalMaterial.materialRef, sourceRef });
  }

  if (sameRef(sourceMaterial.materialRef, canonicalMaterial.materialRef)) {
    return registry.promoteToCanonical({ materialRef: sourceMaterial.materialRef, canonicalRef });
  }

  return registry.mergeMaterials({
    fromMaterialRef: chooseMergeLoser(sourceMaterial, canonicalMaterial),
    toMaterialRef: chooseMergeSurvivor(sourceMaterial, canonicalMaterial),
    reason: "confirmed_source_canonical_binding"
  });
}
```

Survivor rules:

1. Preserve the material with stronger user relations if only one has them.
2. If both have relations, preserve the older material.
3. If neither has relations, prefer the canonical material.
4. Always write redirect for the loser.

---

## 14. Material Query

### 14.1 Why query is required

`resolve` and `related` are not enough. MineMusic needs a material retrieval interface analogous in spirit to `knowledge.query`, but for resolved material cards rather than provider-attributed knowledge facts.

`material.query` answers:

```text
Within this material pool, find material matching these structured constraints and exclusions.
```

### 14.2 Natural-language boundary

Scripts do **not** understand natural language.

The LLM agent translates user language into a structured query plan. MineMusic executes the plan.

Example user request:

```text
From my saved albums, recommend a few tracks for writing, not sleepy, and don't repeat what you just recommended.
```

Agent translates into:

```ts
{
  returnKind: "recording",
  pool: { kind: "source_library", areas: ["saved_albums"], expand: "tracks" },
  constraints: { availability: "playable", identity: "allow_source_backed" },
  preferenceHints: {
    activity: "writing",
    prefer: ["calm", "steady_motion", "instrumental"],
    avoid: ["sleepy", "vocal_heavy"]
  },
  exclude: {
    relations: ["blocked", "wrong_version", "not_playable"],
    recent: { recommended: "session", mode: "hard" }
  },
  limit: 5
}
```

### 14.3 Input

```ts
export type MaterialPoolSpec =
  | { kind: "all" }
  | {
      kind: "source_library";
      areas?: Array<"saved_tracks" | "saved_albums" | "followed_artists">;
      providerId?: string;
      expand?: "none" | "tracks";
    }
  | {
      kind: "collection";
      ref?: string;
      label?: string;
      relation?: "saved" | "favorite" | "custom" | "blocked";
      expand?: "none" | "tracks";
    }
  | {
      kind: "related";
      ref: string;
      relation: "same_artist" | "same_album" | "same_release" | "same_release_group" | "similar";
    };

export type MaterialQueryInput = {
  returnKind?: "recording" | "artist" | "album" | "release" | "release_group";
  pool?: MaterialPoolSpec;
  constraints?: {
    availability?: "playable" | "any";
    identity?: "confirmed_only" | "allow_source_backed";
  };
  preferenceHints?: {
    activity?: string;
    mood?: string[];
    energy?: "low" | "medium_low" | "medium" | "high";
    vocal?: "avoid" | "allow" | "prefer";
    prefer?: string[];
    avoid?: string[];
  };
  exclude?: {
    refs?: string[];
    relations?: Array<"blocked" | "wrong_version" | "not_playable" | "bad_match">;
    recent?: {
      recommended?: "session" | "1h" | "24h" | "7d";
      played?: "session" | "1h" | "24h" | "7d";
      opened?: "session" | "1h" | "24h" | "7d";
      mode?: "hard" | "soft";
    };
  };
  order?: "relevance" | "recently_added" | "least_recently_recommended" | "random" | "library_order";
  limit?: number;
  cursor?: string;
};
```

### 14.4 Output

```ts
export type MaterialQueryOutput = {
  basis?: {
    pool?: string;
    applied?: string[];
  };
  items: MaterialCard[];
  nextCursor?: string;
};
```

### 14.5 Execution plan

```text
1. Resolve pool into candidate material refs.
2. Expand pool if needed, e.g. saved albums -> tracklist -> recordings.
3. Project material refs into MusicMaterial.
4. Apply constraints: kind, availability, identity certainty.
5. Apply relation exclusions: blocked, wrong_version, not_playable, bad_match.
6. Apply recent exclusions/penalties: recommended, opened, played.
7. Dedupe by current materialRef and weak title/artist signature.
8. Rank by order and preference hints.
9. Return compact MaterialCard[] only.
```

### 14.6 Pool adapters

#### Source Library pool

```text
SourceLibraryItem
  -> sourceRef
  -> MaterialRegistry.getOrCreateBySourceRef
  -> materialRef
```

`areas` mapping:

| Agent area | Current platform area |
| --- | --- |
| `saved_tracks` | `saved_source_tracks` |
| `saved_albums` | `saved_source_releases` |
| `followed_artists` | `saved_source_artists` |

If `expand: "tracks"` on saved albums, use `SourceRelease.tracklist` when available.

#### Collection pool

If Collection has migrated to material refs, use collection item material refs directly. During migration, resolve canonical refs through Material Registry.

#### Related pool

Delegates to Related Service seed generation, then resolves seeds.

#### All pool

Combines canonical lookup, source search, Source Library, and optional Knowledge-derived seeds, subject to constraints.

### 14.7 Recent dedupe

Hard exclusion removes material from result. Soft mode downranks.

Default policy:

- session recommended: hard exclude;
- explicit `played`/`opened` window: hard or soft according to input;
- blocked/wrong-version/not-playable: hard exclude by default;
- `bad_match`: soft signal unless input makes it hard.

### 14.8 Example: saved tracks only

```ts
music.material.query({
  returnKind: "recording",
  pool: { kind: "source_library", areas: ["saved_tracks"] },
  constraints: { availability: "playable", identity: "allow_source_backed" },
  preferenceHints: { activity: "writing", prefer: ["calm", "steady_motion"], avoid: ["sleepy"] },
  exclude: {
    relations: ["blocked", "wrong_version", "not_playable"],
    recent: { recommended: "session", mode: "hard" }
  },
  order: "least_recently_recommended",
  limit: 5
})
```

### 14.9 Example: saved albums expanded to tracks

```ts
music.material.query({
  returnKind: "recording",
  pool: { kind: "source_library", areas: ["saved_albums"], expand: "tracks" },
  constraints: { availability: "playable" },
  exclude: {
    relations: ["blocked", "wrong_version", "not_playable"],
    recent: { recommended: "7d", played: "24h", mode: "hard" }
  },
  limit: 5
})
```

---

## 15. Related

### 15.1 Responsibility

`related` is a convenience wrapper over `material.query` for a seed material.

It answers:

```text
Given this material, find material related by this relation.
```

It should not expose source/canonical internals to the agent.

### 15.2 Input

```ts
export type RelatedInput = {
  ref: string;
  relation: "same_artist" | "same_album" | "same_release" | "same_release_group" | "similar";
  ownerScope?: string;
  limit?: number;
  libraryScope?: "any" | "in_library" | "outside_library";
  explorationLevel?: "low" | "medium" | "high";
  exclude?: MaterialQueryInput["exclude"];
};
```

### 15.3 Output

```ts
export type RelatedCardsOutput = {
  basis:
    | "confirmed_artist"
    | "source_artist"
    | "confirmed_album"
    | "source_album"
    | "knowledge_similarity"
    | "library_similarity"
    | "fallback_text";
  basisLabel?: string;
  items: MaterialCard[];
  warning?: string;
};
```

### 15.4 Algorithm

```ts
async function findRelated(input: RelatedInput): Promise<RelatedCardsOutput> {
  const seed = await materialFromAgentRef(input.ref, { purpose: "lookup" });
  const context = await buildRelatedContext(seed);
  const target = chooseRelationTarget(context, input.relation);

  if (!target) {
    return { basis: "fallback_text", items: [], warning: "No reliable relation basis found." };
  }

  const queryInput = relatedTargetToMaterialQuery(seed, target, input);
  const queryOutput = await materialQuery(queryInput);

  return {
    basis: target.basis,
    basisLabel: target.label,
    items: queryOutput.items,
    ...(queryOutput.items.length === 0 ? { warning: "No related playable material found." } : {})
  };
}
```

### 15.5 Same artist target selection

Priority:

```text
canonical artist
> source artist
> knowledge artist
> label fallback
```

### 15.6 Same album target selection

Priority:

```text
canonical release_group
> canonical release
> source release
> label fallback
```

Ordinary user wording "album" defaults to `release_group` when canonical identity exists. Source-backed flows use source release.

### 15.7 Similarity

`similar` combines several pools:

1. same artist;
2. same album/release-group neighbors;
3. Knowledge tags/genres/relations;
4. user's Source Library adjacency;
5. source search using artist/style hints.

Every generated seed must go back through `resolve`.

---

## 16. Material Brief / Context

Most agent flows should use query/resolve/related, not full context. A compact brief tool is still useful for factual questions.

### 16.1 Input

```ts
export type MaterialBriefInput = {
  ref: string;
  fields?: Array<"artist" | "album" | "version" | "source" | "status">;
};
```

### 16.2 Output

```ts
export type MaterialBriefOutput = {
  ref: string;
  title: string;
  subtitle?: string;
  artist?: { name: string; confidence: "confirmed" | "source" | "uncertain" };
  album?: { title: string; confidence: "confirmed" | "source" | "uncertain" };
  version?: { label?: string; confidence: "confirmed" | "source" | "uncertain" };
  warnings?: string[];
};
```

No raw canonical/source objects by default.

---

## 17. Stage Interface Tool Set

### 17.1 New tools

Add to `ToolName`:

```ts
| "music.material.cards"
| "music.material.query"
| "music.material.related"
| "music.material.brief"
```

Alternative names if preserving current naming style:

```ts
| "music.material.resolve.cards"
| "music.material.query"
| "music.material.related.find"
| "music.material.brief.read"
```

### 17.2 Keep raw tools

Keep `music.material.resolve` as a raw/internal/debug-compatible tool during migration. It remains useful for tests and lower-level integration.

### 17.3 Agent-facing defaults

Agent-facing documentation should prefer:

- `music.material.query` for pool-restricted retrieval;
- `music.material.related` for same-artist/same-album/similar flows;
- `music.material.cards` for text/ref seed resolution;
- `music.material.brief` for fact questions.

### 17.4 Existing tool groups

These tools belong in the existing `minemusic.music` instrument, because they are material-facing music tools. They should be implemented in `src/stage_interface/tool_definitions/music.ts` or split into a new file under the same tool group if the file becomes too large.

### 17.5 Presentation rules

Stage Interface Tool Definitions should own compact presentation, consistent with the current Stage Interface direction. Do not push compacting into MCP surface.

---

## 18. Refactoring Plan

### Phase 1: Contracts

Modify `src/contracts/index.ts`:

1. Add `MaterialIdentityState`.
2. Add `materialRef` and `identityState` to `MusicMaterial`.
3. Add `MusicMaterialSnapshot`.
4. Add `MusicMaterialRelationScope`, `MusicMaterialRelationKind`, `MusicMaterialRelation`.
5. Add `MaterialCard`, `MaterialCardStatus`, `MaterialCardAction`.
6. Add `ResolveSeed`, `MaterialResolveCardsInput`, `MaterialResolveCardsOutput`.
7. Add `MaterialQueryInput`, `MaterialQueryOutput`, `MaterialPoolSpec`.
8. Add `RelatedInput`, `RelatedCardsOutput`.
9. Add `MaterialBriefInput`, `MaterialBriefOutput`.
10. Replace or extend target types for Events, Memory, and Effects through a migration-compatible union.

### Phase 2: Ports

Modify `src/ports/index.ts`:

1. Add `MaterialRegistryPort`.
2. Add `MusicMaterialRelationRepository` or `MusicMaterialRelationPort`.
3. Add `MaterialActivityRepository`.
4. Extend `MaterialStorePort` with Material Registry methods.
5. Extend `MaterialResolvePort` or add a new `MaterialQueryPort` / `MaterialCardsPort`.

Recommended separation:

```ts
export interface MaterialResolvePort {
  resolve(input: MaterialResolveRequest): Promise<Result<MaterialResolveResult>>;
  resolveCards(input: MaterialResolveCardsInput): Promise<Result<MaterialResolveCardsOutput>>;
}

export interface MaterialQueryPort {
  query(input: MaterialQueryInput): Promise<Result<MaterialQueryOutput>>;
  related(input: RelatedInput): Promise<Result<RelatedCardsOutput>>;
  brief(input: MaterialBriefInput): Promise<Result<MaterialBriefOutput>>;
}
```

Or add these methods to `MaterialResolvePort` only if keeping the number of ports small is preferred.

### Phase 3: Storage

Add:

- `src/storage/sqlite/material-registry-schema.ts`
- `src/storage/sqlite/material-registry-repository.ts`
- `src/storage/sqlite/material-relation-schema.ts`
- `src/storage/sqlite/material-relation-repository.ts`
- `src/storage/sqlite/material-activity-schema.ts`
- `src/storage/sqlite/material-activity-repository.ts`

Wire these into `src/stage_core/repositories.ts` and `src/stage_core/compose.ts` through Material Store.

### Phase 4: Material Store

Modify `src/material_store/index.ts`:

- Accept and expose Material Registry.
- Keep Canonical Store and Source Entity Store responsibilities intact.
- Do not make Material Store a playable-link cache.

### Phase 5: Material Resolve

Refactor `src/material_resolve/index.ts`:

1. Rename internal `MusicCandidate` language to seed where possible, while keeping contract compatibility.
2. Replace direct source/canonical outputs with Material Registry materialization.
3. Project `MusicMaterial` through Material Records.
4. Apply material relation filtering, not only canonical Collection blocking.
5. Keep raw `resolve` behavior compatible where possible.
6. Add compact card outputs through a presenter.

### Phase 6: Source Grounding

Modify `src/source/index.ts`:

- Source providers may continue returning source-backed `MusicMaterial` for compatibility.
- Source Grounding should preserve/attach `materialRef` when Material Resolve has already materialized the source.
- Long-term target: providers return source facts or source-backed materials that are materialized by Material Resolve, not treated as durable material identity directly.

### Phase 7: Stage Interface

Modify `src/stage_interface/tool_definitions/music.ts`:

- Add compact material card tools.
- Add runtime validation for compact tools.
- Add `present` functions returning `MaterialCard` output.
- Keep `music.material.resolve` for compatibility.

Modify `src/stage_interface/outputs.ts`:

- Add `compactMaterialCard`, `compactMaterialQueryOutput`, `compactRelatedOutput`, and `compactMaterialBrief`.
- Update `compactSourceLibraryList` to eventually include agent-facing material `ref` rather than raw `sourceRef` by default.

### Phase 8: Events, Memory, Effects

- `EventService`: record material targets and snapshots.
- `MemoryService`: accept material-targeted memory proposals and keep evidence-gating.
- `EffectBoundary`: accept material action targets.
- Add activity projection updates from relevant events.

### Phase 9: Collection

- Migrate `CollectionItem` to `materialRef` while retaining `canonicalRef` compatibility.
- Change blocked filtering from `filterBlocked({ canonicalRefs })` to a material relation query.
- Treat Collection as user-visible management over material relations.

---

## 19. Compatibility Strategy

### 19.1 Raw resolve compatibility

Keep current `music.material.resolve` input and output while adding `materialRef` and `identityState` to returned `MusicMaterial`.

### 19.2 Ref compatibility

`Ref.label` and `Ref.url` remain optional but non-authoritative.

### 19.3 Collection compatibility

Keep `canonicalRef` in `CollectionItem` during migration. Add `materialRef` and `materialSnapshot` fields. New writes should prefer `materialRef`; legacy reads can derive `materialRef` from `canonicalRef` through Material Registry.

### 19.4 Event compatibility

Allow old `target?: Ref` payloads to be recorded, but new code should record material target snapshots.

---

## 20. Usage Scenarios

### 20.1 First recommendation from natural-language user request

1. User: "Recommend quiet but not sleepy writing music."
2. Agent translates intent into structured seeds or material query:
   - If no explicit pool: use `music.material.cards` with LLM-generated seeds.
   - If user says "from my saved songs": use `music.material.query` with Source Library pool.
3. MineMusic returns compact cards.
4. Agent presents 3 cards.
5. Stage Interface records `recommendation.presented` with material snapshots.

### 20.2 User says "the first one is too sleepy"

1. Agent resolves "first one" from recent cards in session context or event payload.
2. Record event with `materialRef` target.
3. Write `MusicMaterialRelation`:

```ts
{
  relationKind: "bad_match",
  scope: { level: "event", eventId }
}
```

4. Optionally propose memory only if feedback is explicit enough.

### 20.3 User says "do not recommend this song again"

Write:

```ts
{
  relationKind: "blocked",
  scope: { level: "material" }
}
```

This works even if the material is only source-backed.

### 20.4 User says "this NetEase version is wrong"

Write:

```ts
{
  relationKind: "wrong_version",
  scope: { level: "source", sourceRef }
}
```

Do not block the whole material unless the user explicitly asks.

### 20.5 Same-artist recommendation

Agent calls:

```ts
music.material.related({
  ref: "mat_123",
  relation: "same_artist",
  exclude: { recent: { recommended: "session", mode: "hard" } },
  limit: 5
})
```

MineMusic internally chooses canonical artist if confirmed, otherwise source artist, then generates seeds, resolves them, filters them, and returns cards.

### 20.6 Saved-album pool recommendation

Agent calls:

```ts
music.material.query({
  returnKind: "recording",
  pool: { kind: "source_library", areas: ["saved_albums"], expand: "tracks" },
  constraints: { availability: "playable" },
  exclude: {
    relations: ["blocked", "wrong_version", "not_playable"],
    recent: { recommended: "7d", played: "24h", mode: "hard" }
  },
  limit: 5
})
```

MineMusic expands saved source releases through stored SourceRelease tracklists when available.

---

## 21. Testing Plan

### 21.1 Contract tests

- `MusicMaterial` requires `materialRef` and `identityState` in new outputs.
- `MaterialCard` output does not expose raw source/canonical refs.
- `Ref.label` remains optional and non-authoritative.

### 21.2 Material Registry tests

- Same sourceRef maps to same materialRef.
- Same canonicalRef maps to same materialRef.
- Source-only material later promoted to canonical keeps materialRef when possible.
- Source material and canonical material merge writes redirect.
- Redirect resolution is idempotent.

### 21.3 Resolve tests

- Resolve by sourceRef creates source-backed material.
- Resolve by canonicalRef creates canonical-confirmed material.
- Text seed dedupes source and canonical hits.
- Source-backed material with playable link returns `playable_unverified` card.
- Canonical-confirmed playable material returns `playable` card.
- Not-playable source relation removes source playable link.
- Material-level block returns `blocked` or excludes based on query purpose.

### 21.4 Query tests

- Source Library saved tracks pool returns only saved source tracks.
- Saved albums with `expand: "tracks"` returns tracks from SourceRelease tracklists.
- Relation exclusions filter blocked/wrong-version/not-playable material.
- Recent recommended hard exclusion removes session recommendations.
- Recent recommended soft mode downranks but does not remove.
- Weak duplicate signature dedupes repeated unbound source hits in presentation only.

### 21.5 Related tests

- Same artist prefers canonical artist when available.
- Same artist falls back to source artist when canonical missing.
- Same album prefers release group when canonical available.
- Source album uses SourceRelease tracklist.
- Related results always go through resolve and return MaterialCard.

### 21.6 Stage Interface tests

- New compact tools enforce active instrument availability.
- New compact tools validate payloads.
- New compact tools present compact output only.
- Raw `music.material.resolve` remains compatible.

### 21.7 Event/Memory/Effect tests

- Recommendation presented events store material target snapshots.
- Activity projection updates from recommendation/open/play events.
- Memory proposal accepts material target and still requires explicit/evidence-backed support.
- Effect proposal target is material action target.

---

## 22. Implementation Notes by File Area

### `src/contracts/index.ts`

Add new types near existing material/event/memory/effect contracts. Keep existing types until migration completes.

### `src/ports/index.ts`

Add Material Registry / Material Relation / Material Activity ports. Extend `MaterialStorePort`. Add compact query/related/brief ports or methods.

### `src/material_store/**`

Add Material Registry inside Material Store, next to Canonical Store and Source Entity Store. Do not put playable-link caching here.

### `src/storage/sqlite/**`

Add material registry, material relation, and activity schemas/repositories. Reuse ref-key decomposition style from `source-entity-schema.ts`.

### `src/material_resolve/index.ts`

Refactor into smaller units:

```text
src/material_resolve/resolve.ts
src/material_resolve/project.ts
src/material_resolve/query.ts
src/material_resolve/related.ts
src/material_resolve/cards.ts
src/material_resolve/relations.ts
```

The current file already mixes candidate resolution, source-library matching, canonical lookup, source grounding, canonical attachment, block filtering, state/status computation, and kind normalization. Split it while keeping public exports stable.

### `src/source/index.ts`

Keep source availability normalization. Over time, remove dependency on Canonical Store from Source Grounding and let Material Resolve/Material Registry own source-to-canonical projection. In the interim, preserve behavior for compatibility.

### `src/stage_interface/tool_definitions/music.ts`

Add compact tools and presenters. Keep raw resolve and collection tools for compatibility during migration.

### `src/stage_interface/outputs.ts`

Add material card compacting. Update Source Library compact output after material refs are available.

### `src/collection/**`

Move toward material-ref-backed items and material-relation-backed system collections. Keep canonical compatibility fields temporarily.

### `src/events/index.ts`

Record material target snapshots and publish/update Material Activity projection.

### `src/memory/index.ts`

Allow `MemoryTarget` material/pattern union while keeping evidence gating.

### `src/effects/index.ts`

Accept `MusicMaterialActionTarget` and keep proposal/decision boundary unchanged.

### `src/stage_core/compose.ts`

Wire new repositories and ports through composition. Keep Stage Core as assembly only.

---

## 23. Open Questions

1. Should `saved` for source-backed material be allowed as `pending_identity`, or should the product expose only `like` until canonical identity is confirmed?
2. How much weak duplicate detection should query perform before canonical binding exists?
3. Should `bad_match` ever become a long-term negative signal automatically, or only through user confirmation?
4. Should `material.query` support provider-specific pools, or should provider selection remain hidden behind Source Library and Source Grounding?
5. Should `music.material.brief` expose release vs release group distinctions by default, or only when user asks about versions/editions?
6. How should material refs be encoded for agent-facing `ref` strings: direct Ref JSON token, short opaque id, or server-side handle?

---

## 24. Final Design Principle

MineMusic should not try to eliminate Source Entities or Canonical Records. They solve different problems. Instead, MineMusic should stop exposing that split to every product behavior.

The central principle is:

```text
MusicMaterial is the product-level material projection.
materialRef is the only product-level target.
sourceRef and canonicalRef are internal supporting pointers.
SourceEntity owns provider facts.
CanonicalRecord owns accepted identity facts.
MusicMaterialRelation owns user/material relationships.
MaterialActivity owns query-time recentness projection.
MaterialCard is the compact agent-facing view.
```

This gives MineMusic a stable foundation for library-aware recommendation, version-sensitive feedback, source-backed playback, evidence-backed memory, scoped actions, and pool-restricted material retrieval without turning the agent interface into an internal data dump.
