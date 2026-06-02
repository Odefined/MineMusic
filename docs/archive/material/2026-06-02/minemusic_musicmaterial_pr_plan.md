> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/material/design.md`, `docs/material/progress.md`
> Use only for: Historical MusicMaterial implementation planning evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# MineMusic MusicMaterial Refactor PR Plan

**Purpose:** staged implementation plan for Codex-driven PRs  
**Target branch:** `main`  
**Review model:** each PR is implemented by Codex, reviewed for acceptance, merged into `main`, and only then the next PR starts from updated `main`.  
**Primary design document:** `minemusic-musicmaterial-design.md`  
**Scope:** upgrade MineMusic around `MusicMaterial` as the product-layer material object, with compact agent-facing material retrieval.

---

## 0. Operating rules for Codex

### 0.1 Branching

Each PR must branch from current `main` after the previous PR has been merged.

Recommended branch names:

```text
codex/material-01-registry
codex/material-02-resolve-projection
codex/material-03-relations-activity
codex/material-04-query-related-tools
codex/material-05-downstream-migration
```

Do not stack unmerged branches unless explicitly asked.

### 0.2 PR discipline

Each PR must include:

1. implementation changes;
2. unit/integration tests;
3. updated docs or comments when public behavior changes;
4. a PR summary with:
   - files changed;
   - behavior changed;
   - tests run;
   - known risks;
   - intentionally deferred items.

### 0.3 Required local checks

Every PR must pass:

```bash
npm run typecheck
npm test
```

`npm test` currently runs `npm run typecheck` and `npm run test:stage-core`; `npm run test:stage-core` builds test output and runs the stage-core test runner.

Run this as optional non-blocking smoke unless the PR touches NetEase provider behavior directly:

```bash
npm run smoke:netease
```

It skips by default unless live NetEase smoke is enabled.

### 0.4 Hard rules

Codex must not:

- introduce `MaterialSubject`;
- introduce `anchor` as a new public model;
- introduce `occurrenceId`;
- let source providers generate `materialRef`;
- let agent-facing tools expose raw source/canonical/evidence graphs by default;
- make scripts interpret natural language beyond structured fields and lightweight text hints;
- migrate Collection/Memory/Effect before `materialRef` and resolve projection are stable;
- remove legacy tool names before compatibility is explicitly approved.

Codex must preserve:

- existing module vocabulary: Stage Core, Stage Interface, Stage Modules, Core Capabilities, Material Store, Material Resolve, Source Grounding, Music Knowledge, Collection Service, Event Service, Memory Service, Effect Boundary;
- public-port pattern: single-object input and `Promise<Result<T>>`;
- Stage Interface Tool Definitions as the source of truth for LLM-facing tools;
- source/canonical fact ownership.

---

## 1. PR overview

| PR | Name | Primary goal | Merge gate |
|---|---|---|---|
| PR 1 | Material identity contracts and registry foundation | Add material identity types, registry ports, repositories, and storage without changing runtime resolution behavior | registry tests pass; no agent behavior change |
| PR 2 | Resolve projection integration | Make Material Resolve materialize stable `materialRef` and `identityState`; update provider/source boundary | every resolved material has materialRef/identityState |
| PR 3 | Material relations and activity | Add material-scoped relations and recent activity projection; apply relation filtering in resolve | source-only block / wrong-version / not-playable works |
| PR 4 | Material query, related, and compact tools | Add `material.query`, `material.related`, compact cards, context brief, pool list, recentCards | agent-facing output is compact and query/related works |
| PR 5 | Downstream migration and cleanup | Migrate Collection/Memory/Effect toward materialRef targets; tighten docs and compatibility | source-only feedback and material-targeted consequences work without raw target leakage |

If PR 5 becomes too large, split it into:

```text
PR 5A: Collection migration
PR 5B: Memory/Effect cleanup and legacy tightening
```

Keep the same milestone acceptance criteria.

---

# PR 1 — Material identity contracts and registry foundation

## Goal

Create the durable identity foundation for `materialRef` without changing current recommendation behavior yet.

This PR should be mostly additive. Its job is to establish types, ports, repositories, storage schema, and tests for the Material Registry.

## Why this PR comes first

All later PRs depend on stable material identity. Query, related, relations, activity, Collection migration, Memory, and Effect should not invent their own temporary target model.

## Scope

### Files likely touched

```text
src/contracts/index.ts
src/ports/index.ts
src/material_store/index.ts
src/material_store/material_registry/index.ts        # new
src/storage/index.ts
src/storage/in-memory/**                             # new or extended
src/storage/sqlite/material-schema.ts                # new
src/storage/sqlite/material-repository.ts            # new
src/storage/sqlite/index.ts
test/material_store/material-registry.test.ts        # new
test/storage/sqlite-material-registry.test.ts        # new
```

If the storage organization prefers extending existing source-entity schema files, keep material registry tables in the Material Store database path, but do not bury Material Registry logic inside source entity behavior.

## Contract changes

Add these types.

```ts
export type MusicMaterialIdentityState =
  | "canonical_confirmed"
  | "source_backed"
  | "ambiguous"
  | "unresolved";
```

Add a temporary base/resolved split to keep this PR low-risk:

```ts
export type MusicMaterialBase = {
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

export type ResolvedMusicMaterial = MusicMaterialBase & {
  materialRef: Ref;
  identityState: MusicMaterialIdentityState;
};
```

For PR 1 only, keep existing `MusicMaterial` behavior compatible. Either:

```ts
export type MusicMaterial = MusicMaterialBase;
```

or retain the current shape and add `ResolvedMusicMaterial` beside it. PR 2 will make resolved material fields real.

Add:

```ts
export type MaterialRecordStatus =
  | "active"
  | "merged"
  | "rejected";

export type MaterialRecord = {
  materialRef: Ref;
  kind: CanonicalKind | "recording" | "release" | "release_group" | "artist" | "work" | string;
  identityState: MusicMaterialIdentityState;
  canonicalRef?: Ref;
  sourceRefs: Ref[];
  primarySourceRef?: Ref;
  status: MaterialRecordStatus;
  mergedIntoMaterialRef?: Ref;
  createdAt: string;
  updatedAt: string;
};
```

Add comments to `Ref`:

```ts
export type Ref = {
  namespace: string;
  kind: string;
  id: string;

  /**
   * Non-authoritative display hint only.
   * Do not use as source of truth for music metadata.
   */
  label?: string;

  /**
   * Non-authoritative convenience URL only.
   * Playability must come from Source Grounding / PlayableLink.
   */
  url?: string;
};
```

## Port changes

Add:

```ts
export interface MaterialRegistryPort {
  getMaterialRecord(input: {
    materialRef: Ref;
  }): Promise<Result<MaterialRecord | null>>;

  resolveMaterialRedirect(input: {
    materialRef: Ref;
  }): Promise<Result<Ref>>;

  findMaterialBySourceRef(input: {
    sourceRef: Ref;
  }): Promise<Result<MaterialRecord | null>>;

  findMaterialByCanonicalRef(input: {
    canonicalRef: Ref;
  }): Promise<Result<MaterialRecord | null>>;

  getOrCreateBySourceRef(input: {
    sourceRef: Ref;
    kind: string;
    primarySourceRef?: Ref;
  }): Promise<Result<MaterialRecord>>;

  getOrCreateByCanonicalRef(input: {
    canonicalRef: Ref;
    kind: string;
    sourceRefs?: Ref[];
  }): Promise<Result<MaterialRecord>>;

  attachSourceRef(input: {
    materialRef: Ref;
    sourceRef: Ref;
  }): Promise<Result<MaterialRecord>>;

  promoteToCanonical(input: {
    materialRef: Ref;
    canonicalRef: Ref;
  }): Promise<Result<MaterialRecord>>;

  mergeMaterials(input: {
    from: Ref;
    into: Ref;
    reason: string;
  }): Promise<Result<MaterialRecord>>;
}
```

Material Registry belongs under Material Store. It should not live under Collection, Source Grounding, Stage Interface, or provider code.

## Storage schema

Add SQLite tables:

```sql
CREATE TABLE IF NOT EXISTS material_records (
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
  PRIMARY KEY (material_namespace, material_kind, material_id),
  CHECK (identity_state IN ('canonical_confirmed', 'source_backed', 'ambiguous', 'unresolved')),
  CHECK (status IN ('active', 'merged', 'rejected'))
);

CREATE TABLE IF NOT EXISTS material_source_refs (
  source_namespace TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_ref_json TEXT NOT NULL,
  material_namespace TEXT NOT NULL,
  material_kind TEXT NOT NULL,
  material_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_namespace, source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS material_source_refs_material_idx
  ON material_source_refs(material_namespace, material_kind, material_id);

CREATE TABLE IF NOT EXISTS material_canonical_refs (
  canonical_namespace TEXT NOT NULL,
  canonical_kind TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  canonical_ref_json TEXT NOT NULL,
  material_namespace TEXT NOT NULL,
  material_kind TEXT NOT NULL,
  material_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (canonical_namespace, canonical_kind, canonical_id)
);

CREATE INDEX IF NOT EXISTS material_canonical_refs_material_idx
  ON material_canonical_refs(material_namespace, material_kind, material_id);

CREATE TABLE IF NOT EXISTS material_redirects (
  from_material_namespace TEXT NOT NULL,
  from_material_kind TEXT NOT NULL,
  from_material_id TEXT NOT NULL,
  from_material_ref_json TEXT NOT NULL,
  to_material_ref_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (from_material_namespace, from_material_kind, from_material_id)
);
```

`materialRef` namespace/kind recommendation:

```text
namespace = "minemusic"
kind = "material"
id = registry-generated id
```

Do not derive public material ids directly from source/canonical refs. Unique indexes should use source/canonical refs, but the material id should remain opaque.

## Implementation steps

1. Add contract types and comments.
2. Add `MaterialRegistryPort`.
3. Implement in-memory Material Registry repository/service.
4. Implement SQLite Material Registry repository/service.
5. Add Material Store composition function support.
6. Export factories through `src/storage/index.ts` and `src/material_store/index.ts`.
7. Wire Stage Core repositories minimally if needed, but do not alter Material Resolve behavior yet.
8. Add tests.

## Tests

Add tests for:

1. same source ref returns same material record;
2. same canonical ref returns same material record;
3. source-backed material has `identityState = "source_backed"`;
4. canonical material has `identityState = "canonical_confirmed"`;
5. `attachSourceRef` attaches source to existing material;
6. `promoteToCanonical` updates identity state;
7. `mergeMaterials` writes redirect;
8. `resolveMaterialRedirect` follows redirect;
9. SQLite repository persists records across reopen;
10. source/canonical unique lookup works after reopen.

Run:

```bash
npm run typecheck
npm test
```

## Acceptance criteria

- No existing user-facing tool output changes.
- All registry APIs return defensive copies, not mutable stored references.
- No source provider imports Material Registry.
- No Stage Interface tool is added yet.
- `materialRef` is not generated by the agent or provider.
- Tests prove registry idempotency and redirect behavior.

## Reviewer checklist

- Is registry inside Material Store, not Source Grounding?
- Are source/canonical refs still pointers, not metadata owners?
- Does SQLite schema share the Material Store DB path?
- Are ids stable across repository reopen?
- Is the PR additive enough to review safely?

---

# PR 2 — Resolve projection integration

## Goal

Make Material Resolve return materials with stable `materialRef` and `identityState`.

After this PR, every material returned by `music.material.resolve` must have a product-layer material target.

## Why this PR comes second

`materialRef` must become real before relations, query, related, collection migration, memory, or effects can target it.

## Scope

### Files likely touched

```text
src/contracts/index.ts
src/ports/index.ts
src/material_resolve/index.ts
src/material_store/index.ts
src/source/index.ts
src/providers/netease/index.ts
src/fixtures/source_provider.ts
fixtures/integration/**
src/stage/index.ts
src/app/index.ts
test/integration/**
test/providers/**
test/source/**
```

## Contract changes

Complete the transition started in PR 1.

Define a source/provider intermediate shape so providers do not own `materialRef`:

```ts
export type SourceMaterial = MusicMaterialBase;
```

Change:

```ts
export type MusicMaterial = ResolvedMusicMaterial;
```

Update provider/source ports:

```ts
export interface SourceProvider {
  search(input: {
    query: SourceQuery;
    sessionId?: string;
  }): Promise<Result<SourceMaterial[]>>;

  getPlayableLinks(input: {
    material: MusicMaterial;
    sessionId?: string;
  }): Promise<Result<PlayableLink[]>>;
}

export interface SourceGroundingPort {
  ground(input: {
    query: SourceQuery;
    sessionId?: string;
  }): Promise<Result<SourceMaterial[]>>;

  refreshPlayableLinks(input: {
    material: MusicMaterial;
    sessionId?: string;
  }): Promise<Result<MusicMaterial>>;
}
```

If TypeScript churn is too high, an intermediate `UnmaterializedMusicMaterial` name is acceptable, but do not require providers to create `materialRef`.

## Projection helper

Add a Material Resolve projection helper.

Suggested internal functions:

```ts
resolveSourceMaterialToRecord(sourceMaterial, context): Promise<Result<MaterialRecord>>
projectMaterialRecord(record, context): Promise<Result<MusicMaterial>>
projectSourceMaterial(sourceMaterial, context): Promise<Result<MusicMaterial>>
toMusicMaterialIdentityState(record): MusicMaterialIdentityState
```

Projection rule:

```text
canonicalRef present / record canonical confirmed -> canonical_confirmed
sourceRefs present without canonical -> source_backed
multiple unresolved candidates -> ambiguous
no stable source/canonical -> unresolved
```

Display rule:

```text
canonical_confirmed -> canonical label
source_backed -> SourceEntity title/name/label or source material label
unresolved -> seed/source fallback label
```

## Material Resolve behavior

Refactor `resolveCandidate` so final returned materials are materialized.

Current behavior:

```text
candidate
  -> canonical lookup
  -> optional source library lookup
  -> source grounding
  -> attach canonical refs
  -> collection blocked filtering
  -> MusicMaterial[]
```

Target behavior:

```text
candidate
  -> canonical/source/text lookup
  -> source grounding/source library result
  -> MaterialRegistry materialize
  -> projection
  -> blocked filtering compatibility
  -> MusicMaterial[] with materialRef + identityState
```

Keep current `MaterialResolveRequest` and `MusicCandidate` compatibility.

Do not add query/related yet.

## Source Grounding alignment

Source Grounding can still normalize playability, but it must not own material identity.

Current `SourceGroundingService` uses Canonical Store to normalize `confirmed_playable` vs `source_only_playable`. This is acceptable during transition, but Material Resolve must still be the place that finalizes `materialRef` and `identityState`.

If practical in this PR, remove Canonical Store from Source Grounding and let Material Resolve handle confirmed binding. If that makes the PR too large, leave Source Grounding as-is and document follow-up cleanup.

## NetEase changes

NetEase source provider should return `SourceMaterial`, not `MusicMaterial`.

Its current `toMaterial(song)` can remain mostly the same, but it should not create `materialRef` or `identityState`.

Material Resolve will materialize the returned source material.

## Tests

Update existing tests and add:

1. NetEase source search still returns provider source material.
2. Material Resolve returns `materialRef` and `identityState` for:
   - canonical-confirmed result;
   - source-only playable result;
   - source library result;
   - unresolved result if represented as material.
3. `stage.materials.prepare` preserves `materialRef` and `identityState`.
4. Fixture MVP still returns playable links correctly.
5. Canonical persistence integration still proves:
   - known source becomes `confirmed_playable`;
   - unknown source-only material remains `source_only_playable`.
6. `track`/`song` seed kind normalizes to `recording`; `album` normalizes to `release_group`.

Run:

```bash
npm run typecheck
npm test
npm run smoke:netease
```

`smoke:netease` may skip unless live env is enabled.

## Acceptance criteria

- Every `MusicMaterial` returned from Material Resolve has `materialRef`.
- Every `MusicMaterial` returned from Material Resolve has `identityState`.
- Source providers do not create or guess `materialRef`.
- Existing raw `music.material.resolve` remains available.
- Existing integration MVP behavior still works.
- Material Gate does not drop `materialRef` or `identityState`.

## Reviewer checklist

- Are material ids opaque?
- Does Material Resolve, not provider code, own materialization?
- Are source-only materials stable across repeated resolve calls?
- Is `SourceMaterial` used only before materialization?
- Did this PR avoid adding query/related/tool surface too early?

---

# PR 3 — Material relations and activity

## Goal

Add material-scoped user relations and recent activity projection, then make Material Resolve respect them.

This PR solves the immediate product pain: source-only materials can be blocked, wrong-versioned, and marked not playable without needing canonical identity.

## Why this PR comes third

Relations need stable `materialRef`. Activity also needs stable material targets.

## Scope

### Files likely touched

```text
src/contracts/index.ts
src/ports/index.ts
src/material_store/**
src/material_resolve/index.ts
src/events/index.ts
src/storage/index.ts
src/storage/sqlite/**
test/material_store/material-relations.test.ts
test/material_resolve/material-relation-filtering.test.ts
test/events/material-activity.test.ts
```

## Contract changes

Add:

```ts
export type MusicMaterialRelationScope =
  | { level: "material" }
  | { level: "source"; sourceRef: Ref }
  | { level: "version"; note?: string }
  | { level: "event"; eventId: string };

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

Add:

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

## Ports

Add:

```ts
export interface MusicMaterialRelationRepository {
  putRelation(input: { relation: MusicMaterialRelation }): Promise<Result<MusicMaterialRelation>>;
  listRelations(input: {
    ownerScope?: string;
    materialRef?: Ref;
    relationKind?: MusicMaterialRelationKind;
    status?: MusicMaterialRelation["status"];
  }): Promise<Result<MusicMaterialRelation[]>>;
}

export interface MaterialActivityRepository {
  getActivity(input: {
    ownerScope: string;
    materialRef: Ref;
  }): Promise<Result<MaterialActivity | null>>;

  putActivity(input: {
    activity: MaterialActivity;
  }): Promise<Result<MaterialActivity>>;

  listActivity(input: {
    ownerScope?: string;
    since?: string;
    limit?: number;
  }): Promise<Result<MaterialActivity[]>>;
}
```

## Storage

Add SQLite tables:

```sql
CREATE TABLE IF NOT EXISTS music_material_relations (
  id TEXT PRIMARY KEY,
  owner_scope TEXT NOT NULL,
  material_namespace TEXT NOT NULL,
  material_kind TEXT NOT NULL,
  material_id TEXT NOT NULL,
  material_ref_json TEXT NOT NULL,
  relation_kind TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  source TEXT NOT NULL,
  evidence_event_ids_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS music_material_relations_owner_material_idx
  ON music_material_relations(owner_scope, material_namespace, material_kind, material_id, relation_kind, status);

CREATE TABLE IF NOT EXISTS material_activity (
  owner_scope TEXT NOT NULL,
  material_namespace TEXT NOT NULL,
  material_kind TEXT NOT NULL,
  material_id TEXT NOT NULL,
  material_ref_json TEXT NOT NULL,
  activity_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_scope, material_namespace, material_kind, material_id)
);
```

## Resolve filtering

Integrate relation filtering into Material Resolve projection.

Rules:

| Relation | Scope | Behavior |
|---|---|---|
| `blocked` | `material` | return `state: "blocked"` or exclude in query later |
| `blocked` | `source` | ignore matching source link/result |
| `not_playable` | `source` | remove playable link from that source |
| `wrong_version` | `source` | filter/penalize matching source |
| `wrong_version` | `version` | keep as warning/penalty unless version matching is implemented |
| `bad_match` | `event` | no hard filtering; ranking signal only |
| `liked` / `disliked` | any | ranking signal later |

For raw `music.material.resolve`, blocked materials should remain visible as `state: "blocked"` when the requested seed directly resolves to a blocked material. Query can later exclude them by default.

## Activity projection

Add helper to update activity when relevant events are recorded.

Minimum event mappings:

```text
recommendation.presented -> lastRecommendedAt / recommendedCountSession
material.opened or link.opened -> lastOpenedAt
material.played -> lastPlayedAt
material.skipped -> lastSkippedAt
```

If event type does not include material snapshot yet, this PR may add support for reading `payload.cards`.

Do not replace Event Service. Activity is a projection.

## Tests

Add tests for:

1. material-level block marks material as blocked;
2. source-level block filters only that source;
3. source-level `not_playable` removes playable link but does not block whole material;
4. source-level `wrong_version` filters or penalizes matching source;
5. source-only material can be blocked without canonicalRef;
6. activity updates from recommendation event payload cards;
7. activity is stored by ownerScope + materialRef;
8. existing canonical Collection blocked filtering still works during migration.

Run:

```bash
npm run typecheck
npm test
```

## Acceptance criteria

- Source-only blocked material no longer requires canonical identity.
- Material Resolve reads material relations.
- Existing Collection `filterBlocked` compatibility remains.
- Activity projection exists but does not replace event history.
- No query/related public tool is added yet unless needed only for tests.

## Reviewer checklist

- Are relations keyed by materialRef?
- Does scope prevent over-generalization?
- Are event-scoped bad matches non-destructive?
- Is not-playable source-specific?
- Are events still factual records?

---

# PR 4 — Material query, related, and compact tools

## Goal

Expose compact, agent-safe material retrieval.

This PR introduces material query and related retrieval while keeping internal source/canonical complexity behind MineMusic.

## Why this PR comes fourth

Query/related require stable material refs and relation/activity filters.

## Scope

### Files likely touched

```text
src/contracts/index.ts
src/ports/index.ts
src/material_query/index.ts                         # new
src/material_related/index.ts                       # new
src/material_resolve/**                             # shared helpers
src/stage_interface/tool_definitions/music.ts
src/stage_interface/tool_definitions/library.ts
src/stage_interface/outputs.ts
src/stage_interface/tools.ts
src/stage_interface/instruments.ts
src/stage/index.ts
src/stage_core/compose.ts
src/stage_core/types.ts
skills/minemusic/HANDBOOK.md                       # regenerated if repo tracks it
test/material_query/**
test/material_related/**
test/stage_interface/**
test/surfaces/mcp-server.test.ts                   # if tool list affected
```

## Contract changes

Add compact agent-facing types.

```ts
export type MaterialCardStatus =
  | "playable"
  | "found_no_link"
  | "ambiguous"
  | "blocked"
  | "unresolved";

export type MaterialCardIdentityConfidence =
  | "canonical_confirmed"
  | "source_backed"
  | "ambiguous"
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
  ref: string;
  title: string;
  subtitle?: string;
  status: MaterialCardStatus;
  identityConfidence?: MaterialCardIdentityConfidence;
  reason?: string;
  actions?: MaterialCardAction[];
};
```

Add resolve cards input/output:

```ts
export type ResolveSeed = {
  ref?: string;
  text?: string;
  kind?: "song" | "track" | "recording" | "artist" | "album" | "release" | "release_group" | "work" | string;
  sourceRef?: Ref;
  canonicalRef?: Ref;
  reason?: string;
};

export type MaterialResolveCardsInput = {
  seeds: ResolveSeed[];
  purpose?: "recommend" | "lookup" | "play";
  ownerScope?: string;
  limit?: number;
};

export type MaterialResolveCardsOutput = {
  items: MaterialCard[];
  next?: {
    suggestedAction?: "present" | "ask_clarification" | "choose_one" | "retry";
    question?: string;
  };
};
```

Add query:

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
  q?: string;
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
  ownerScope?: string;
  limit?: number;
  cursor?: string;
};

export type MaterialQueryOutput = {
  basis?: {
    pool?: string;
    applied?: string[];
  };
  items: MaterialCard[];
  nextCursor?: string;
};
```

Add related:

```ts
export type MaterialRelatedInput = {
  ref: string;
  relation: "same_artist" | "same_album" | "same_release" | "same_release_group" | "similar";
  exclude?: MaterialQueryInput["exclude"];
  constraints?: MaterialQueryInput["constraints"];
  preferenceHints?: MaterialQueryInput["preferenceHints"];
  ownerScope?: string;
  limit?: number;
};

export type MaterialRelatedOutput = {
  basis:
    | "confirmed_artist"
    | "source_artist"
    | "confirmed_album"
    | "source_album"
    | "knowledge_similarity"
    | "library_similarity"
    | "fallback_text";
  basisLabel?: string;
  warning?: string;
  items: MaterialCard[];
};
```

Add context brief and pools list if included in this PR:

```ts
export type MaterialContextBriefInput = {
  ref: string;
  fields: Array<"artist" | "album" | "version" | "status">;
};

export type MaterialContextBriefOutput = {
  ref: string;
  title: string;
  artist?: { name: string; confidence: "confirmed" | "source" | "uncertain" };
  album?: { title: string; confidence: "confirmed" | "source" | "uncertain" };
  version?: { label?: string; confidence: "confirmed" | "source" | "uncertain" };
  warnings?: string[];
};

export type MaterialPoolsListInput = {
  kinds?: Array<"source_library" | "collection" | "dynamic">;
  ownerScope?: string;
};

export type MaterialPoolsListOutput = {
  pools: Array<{
    ref: string;
    label: string;
    type: "source_library" | "collection" | "dynamic";
    returnKinds: string[];
    count?: number;
  }>;
};
```

## Ports

Add:

```ts
export interface MaterialQueryPort {
  query(input: MaterialQueryInput): Promise<Result<MaterialQueryOutput>>;
}

export interface MaterialRelatedPort {
  related(input: MaterialRelatedInput): Promise<Result<MaterialRelatedOutput>>;
}

export interface MaterialCardsPort {
  resolveCards(input: MaterialResolveCardsInput): Promise<Result<MaterialResolveCardsOutput>>;
  contextBrief?(input: MaterialContextBriefInput): Promise<Result<MaterialContextBriefOutput>>;
  listPools?(input: MaterialPoolsListInput): Promise<Result<MaterialPoolsListOutput>>;
}
```

The exact grouping can differ, but keep query/related separate from raw Material Resolve.

## Implementation

### Query

Implement `material.query` execution plan:

```text
1. compile pool
2. read pool refs/source refs
3. expand pool when requested
4. project through Material Resolve / Material Registry
5. apply constraints
6. apply relation exclusions
7. apply recent exclusions
8. dedupe
9. rank
10. return MaterialCard[]
```

Minimum pools for this PR:

1. `source_library.saved_tracks`
2. `source_library.saved_albums` with `expand: "tracks"`
3. `collection` compatibility through canonicalRef if not migrated
4. `related` as delegation if related implemented first

### Related

Implement as query wrapper where practical.

`same_artist` target order:

```text
canonical artist > source artist > knowledge artist > label fallback
```

`same_album` target order:

```text
canonical release_group > canonical release > source release
```

`similar` candidate pools:

```text
same artist
same album
knowledge tags/genres
library adjacency
source search fallback
```

All related candidates must pass through resolve/projection.

### Compact cards

Add a presenter in `src/stage_interface/outputs.ts` or a material-specific presenter module:

```ts
toMaterialCard(material: MusicMaterial): MaterialCard
toMaterialCardStatus(material): MaterialCardStatus
toMaterialCardActions(material): MaterialCardAction[]
```

Do not expose raw refs in `MaterialCard` except opaque `ref`.

### Agent-facing tool names

Add stable tools:

```text
music.material.resolve.cards
music.material.query
music.material.related
music.material.context.brief
music.pools.list
```

If tool count must be reduced, keep at minimum:

```text
music.material.query
music.material.related
music.material.context.brief
```

But `resolve.cards` is recommended for compact resolve output.

Update `ToolName` union and `musicToolNames`.

## Stage context recent cards

Extend `StageContext`:

```ts
recentCards?: Array<{
  ref: string;
  title: string;
  subtitle?: string;
  position?: number;
  eventId: string;
  status: MaterialCardStatus;
}>;
```

Session Context should derive this from recent recommendation presentation events or material activity. Keep it bounded.

Do not return raw event payloads.

## Tests

Add tests for:

1. query saved tracks returns only saved track materials;
2. query saved albums with `expand: "tracks"` returns recording cards;
3. explicit pool does not fallback outside pool;
4. relation exclusions remove blocked/wrong_version/not_playable;
5. recent recommended hard exclude works;
6. recent opened/played soft penalty or hard exclude works according to input;
7. related same artist uses canonical artist when available;
8. related same artist falls back to source artist;
9. related same album uses source release tracklist when canonical is missing;
10. similar excludes seed material;
11. compact cards do not expose `canonicalRef`, `sourceRefs`, raw evidence, provider account, or tracklist;
12. Stage Interface schemas expose new tools;
13. MCP tool list includes new prefixed tool names;
14. `stage.context.read` returns bounded recent cards.

Run:

```bash
npm run typecheck
npm test
```

## Acceptance criteria

- Agent-facing material outputs are compact.
- Query can restrict to saved tracks.
- Query can restrict to saved albums expanded to tracks.
- Query can exclude recently recommended materials.
- Related does not bypass resolve.
- Knowledge is used only as source of hints; it does not return playable material.
- `stage.context.read` does not pollute context with full history.

## Reviewer checklist

- Does query obey explicit pool boundaries?
- Does related call/flow through resolve?
- Is natural language handled by agent/structured hints, not scripts?
- Are `sourceRef`/`canonicalRef` hidden in default card output?
- Are recent exclusions server-side, not agent-side?

---

# PR 5 — Downstream migration and cleanup

## Goal

Migrate downstream consequence-bearing modules to materialRef-backed targets and remove or mark legacy behavior.

This PR may be split into PR 5A and PR 5B if too large.

## Why this PR comes last

Collection, Memory, and Effect are consequence boundaries. They should not move until material identity, relations, query, and related are stable.

---

## PR 5A — Collection migration

### Scope

```text
src/contracts/index.ts
src/ports/index.ts
src/collection/index.ts
src/storage/sqlite/collection-schema.ts
src/storage/sqlite/collection-repository.ts
src/storage/in-memory/**
src/stage_interface/tool_definitions/music.ts
test/collection/**
test/integration/**
```

### Target behavior

Current `CollectionItem` is canonicalRef-based. Add materialRef compatibility:

```ts
export type CollectionItem = {
  id: string;
  collectionId: string;

  materialRef?: Ref;
  materialSnapshot?: MusicMaterialSnapshot;
  relationScope?: MusicMaterialRelationScope;
  identityRequirement?: "none" | "source_backed" | "canonical_confirmed";
  status?: "active" | "pending_identity" | "removed";

  canonicalRef?: Ref; // legacy / derived
  label: string;
  description?: string;
  position?: number;
  createdAt: string;
  removedAt?: string;
};
```

Add new APIs while keeping old canonical APIs:

```ts
addMaterialToSystemCollection(input)
removeMaterialFromSystemCollection(input)
addMaterialToCollection(input)
removeMaterialFromCollection(input)
filterBlockedMaterials(input)
```

Policy:

| Relation | Requirement | Source-backed behavior |
|---|---|---|
| blocked | none | active immediately |
| saved | canonical preferred | pending_identity if source-backed |
| favorite | canonical preferred | pending_identity or reject according to implementation choice |
| custom | configurable | default canonical, may allow source-backed |

### Steps

1. Add optional material fields to CollectionItem.
2. Add repository schema columns.
3. Backfill materialRef for existing canonicalRef items via Material Registry.
4. Add materialRef-based service methods.
5. Keep canonicalRef methods as adapters.
6. Update Stage Interface collection tools or add new compact material-based tools.
7. Update Material Resolve blocked filtering to prefer material relations / materialRef, with canonical collection fallback during migration.
8. Add tests.

### Tests

1. existing canonical collection tests still pass;
2. materialRef block works for source-only material;
3. canonicalRef legacy item can be listed with materialRef after backfill;
4. saved source-backed item gets pending identity if that policy is chosen;
5. blocked material is mutually exclusive with saved/favorite where applicable;
6. custom collection can list material items.

### Acceptance criteria

- Source-only material can be blocked via Collection or relation layer.
- Legacy canonical collection behavior still works.
- Collection no longer requires source-only feedback to wait for canonical identity.
- No raw sourceRef collection identity is introduced.

---

## PR 5B — Memory, Effect, Event target cleanup

### Scope

```text
src/contracts/index.ts
src/events/index.ts
src/memory/index.ts
src/effects/index.ts
src/stage_interface/tool_definitions/stage.ts
src/stage_interface/tool_definitions/memory.ts
test/events/**
test/memory/**
test/effects/**
test/integration/**
```

### Event target

Add material target support:

```ts
export type MaterialEventTarget = {
  kind: "material";
  materialRef: Ref;
  snapshot: MusicMaterialSnapshot;
};

export type StageEvent = {
  id: string;
  time: string;
  sessionId: string;
  actor: "user" | "llm" | "stage" | "instrument" | "plugin";
  type: string;
  target?: Ref | MaterialEventTarget; // migration
  payload: unknown;
};
```

Recommendation events should include compact cards:

```ts
payload: {
  cards: MaterialCard[];
}
```

### Memory target

Add structured material memory target while preserving old `target?: Ref` during migration:

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

Add to `MemoryEntry`:

```ts
structuredTarget?: MemoryTarget;
```

Keep evidence-gating unchanged:

```text
explicit_rule OR evidenceEventIds required
```

### Effect target

Add compact material action target:

```ts
export type MusicMaterialActionTarget = {
  kind: "material";
  ref: string;
  actionScope:
    | "open_source_link"
    | "play_source_link"
    | "save_material"
    | "block_material"
    | "block_source"
    | "remember_preference"
    | "review_identity";
};

export type EffectProposal = {
  id: string;
  kind: string;
  target?: Ref | MusicMaterial | MusicMaterial[] | MusicMaterialActionTarget | MusicMaterialActionTarget[];
  preview?: string;
  reason?: string;
  requiresConfirmation: boolean;
  reversible?: boolean;
};
```

Later cleanup can remove raw target variants after call sites migrate.

### Tests

1. event can store material snapshot target;
2. old Ref target still works during migration;
3. recommendation presented event records cards;
4. memory proposal with material structuredTarget requires evidence or explicit rule;
5. memory proposal without evidence still fails;
6. effect proposal accepts compact material action target;
7. existing MVP transcript still passes.

### Acceptance criteria

- Consequence-bearing modules can target materialRef.
- Evidence-gated memory behavior remains intact.
- Effects still require confirmation for durable/external actions.
- Legacy target compatibility remains until explicit cleanup.

---

## Final cleanup inside PR 5 or follow-up

Only after all tests pass:

1. update docs:
   - `CONTEXT.md`
   - `ARCHITECTURE.md`
   - `docs/mvp/interface-contracts.md`
   - `docs/collection-service/design.md`
   - `skills/minemusic/HANDBOOK.md`
2. mark legacy `canonicalRef` collection APIs as compatibility adapters;
3. mark raw `music.material.resolve` as raw/internal or compatibility;
4. ensure compact tools are preferred by Codex skill guidance;
5. ensure MaterialCard is default agent-facing output.

## PR 5 acceptance criteria

- Collection, Memory, Event, and Effect can all target materialRef.
- Source-only material feedback works end-to-end.
- Existing old flows still pass compatibility tests.
- Codex skill guidance points to compact material tools, not raw internal outputs.
- No new public concept named `MaterialSubject`, `anchor`, or `occurrenceId`.

---

# Global review checklist for every PR

Ask these questions before accepting:

1. Does this PR preserve source/canonical fact ownership?
2. Does it avoid exposing raw provider/canonical internals to the agent by default?
3. Does it keep Stage Interface as the callable surface?
4. Does it keep source providers from owning `materialRef`?
5. Does it avoid natural-language interpretation in scripts?
6. Does it include tests for the behavior it changes?
7. Does it leave existing MVP path working?
8. Does it avoid changing future PR scopes prematurely?
9. Does it document compatibility vs target behavior?
10. Does it pass `npm run typecheck` and `npm test`?

---

# Suggested Codex task prompt template

For each PR, give Codex a prompt like:

```text
Implement PR <N> from docs/material/musicmaterial-pr-plan.md.

Constraints:
- Only implement PR <N> scope.
- Do not implement future PRs.
- Preserve existing tests unless the PR explicitly changes a contract.
- Add tests listed under PR <N>.
- Run npm run typecheck and npm test.
- Summarize changed files, behavior changes, tests run, and deferred work.
```

---

# Merge protocol

1. Codex opens PR.
2. Human/assistant reviews against this plan.
3. If accepted, merge to `main`.
4. Pull fresh `main`.
5. Start next PR branch from fresh `main`.

Do not start the next PR from an unmerged previous branch.

---

# Milestones

## Milestone 1 — Material identity stabilized

Completed after PR 2.

Required state:

```text
MusicMaterial returned by resolve has materialRef and identityState.
Source-only materials have stable materialRef.
Providers do not own materialRef.
```

## Milestone 2 — Feedback and recent control work

Completed after PR 3.

Required state:

```text
source-only block works
wrong-version source feedback works
not-playable source filtering works
recent material activity projection exists
```

## Milestone 3 — Material retrieval works

Completed after PR 4.

Required state:

```text
query saved tracks
query saved albums expanded to tracks
related same artist
related same album
recent dedupe
compact MaterialCard outputs
```

## Milestone 4 — Consequence boundaries migrated

Completed after PR 5.

Required state:

```text
Collection / Event / Memory / Effect can target materialRef.
Legacy APIs remain as compatibility adapters.
Compact tools are the agent-default surface.
```
