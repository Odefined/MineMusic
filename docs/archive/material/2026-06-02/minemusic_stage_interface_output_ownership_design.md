> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/material/design.md`, `docs/stage-interface/design.md`, `docs/stage-interface/tool-contracts.md`
> Use only for: Historical Stage Interface output ownership and material boundary evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# MineMusic Stage Interface Output Ownership and Material Boundary Design

**Date:** 2026-06-01  
**Boundary:** Stage Interface owns compact output projection; Material domain modules live under `src/material/**`.
**Scope:** Stage Interface output ownership, Material domain boundaries, `MaterialCard*` containment, and phased migration from the former root-level `material_*` modules.

---

## 1. Executive Summary

The boundary issue is not primarily the file location of `MaterialCard`. The deeper issue is that **Stage Interface owns the tool entry points and must consistently own the external output shape**.

Before this migration, tools such as `music.material.resolve`, `music.material.query`, `music.material.related`, `music.material.select`, and `stage.recommendation.present` were registered through Stage Interface, but several handlers returned core/domain results or core-generated card shapes directly. As a result, `MaterialCard`, `CandidateMaterialCard`, and `PresentedMaterialCard` leaked into core material services and were used as internal communication formats.

The target boundary is:

> **Material domain owns what music material is, how it is resolved, found, filtered, selected, and finally accepted/dropped. Stage Interface owns how those domain results are compacted and exposed to the agent.**

This design keeps the MVP simple while restoring a clean dependency direction:

```text
core/material domain result
  -> stage_interface/outputs compact projection
  -> agent-facing tool output
```

It explicitly avoids moving all recommendation presentation behavior into Stage Interface. Material Presentation under `src/material/presentation` performs final policy checks, session validation, accepted/dropped decisions, and event recording. Those are runtime/domain responsibilities. Only the card/output projection belongs in Stage Interface.

---

## 2. Pre-Migration State

### 2.1 Stage Interface has a projection hook but many tools do not use it

`StageInterfaceToolDefinition` already supports:

```ts
present?: (value: unknown) => unknown;
```

`dispatch` calls the handler first, then returns the raw result if `present` is absent. This means the architecture already has a place for Stage Interface output projection, but it is not used consistently.

Current behavior:

```text
MCP / host adapter
  -> Stage Interface facade
  -> Tool Dispatch
  -> Tool Definition handler
  -> core port call
  -> raw domain/core result returned to agent
```

Pre-migration example: `music.material.resolve` declared `outputSchemaRef: "MaterialResolveResult"` and directly returned `context.materialResolve.resolve(...)`.

### 2.2 `MaterialCard*` was a global/core-visible shape

`src/material_cards/index.ts` is a top-level module that projects `MusicMaterial` into `MaterialCard` and `CandidateMaterialCard`.

Core material modules import it:

- `src/material_query/index.ts`
- `src/material_selection/index.ts`
- `src/recommendation_presentation/index.ts`

This makes `MaterialCard*` effectively an internal service format rather than an agent-facing DTO.

### 2.3 `material_query` and `material_selection` return cards instead of domain results

`material_selection` imported `CandidateMaterialCard`, imported `toCandidateMaterialCard`, and returned `MaterialSelectOutput.items` as cards.

`material_query` calls `materialSelector.select(...)`, slices `selected.value.items`, and returns those items as query output. Since selector output is already card-shaped, query output also becomes card-shaped.

This creates the wrong ownership:

```text
material_query / material_selection
  own compact card output shape
```

The desired ownership is:

```text
material_query / material_selection
  own domain result

stage_interface/outputs
  owns compact card output shape
```

### 2.4 `recommendation_presentation` mixes two different responsibilities

`src/recommendation_presentation/index.ts` did legitimate core/runtime work:

- reads the session;
- evaluates final presentation policy;
- computes accepted/dropped/warnings;
- records `recommendation.presented` events.

It also builds `PresentedMaterialCard` and `RecommendationPresentedCardSnapshot`.

The card-building part should move to Stage Interface. The policy/session/event responsibilities should remain in the core/runtime service.

### 2.5 Material bounded context is physically scattered

Material-related modules were root-level peers:

```text
src/material_store/
src/material_resolve/
src/material_query/
src/material_policy/
src/material_selection/
src/material_cards/
src/recommendation_presentation/
```

This is not the first thing to fix. If directories are moved before data-shape ownership is fixed, the same boundary violation will simply be moved into a nicer folder tree.

Directory consolidation should happen only after the dependency direction is corrected.

---

## 3. Design Goals

1. **Stage Interface owns agent-facing output.**  
   Any compact card or agent-facing DTO must be created in `src/stage_interface/outputs/**`.

2. **Material domain owns domain results only.**  
   Material services may return `MusicMaterial`, `MaterialRecord`, `Ref`, policy decisions, selection results, query results, and presentation decisions. They must not return `MaterialCard*`.

3. **No core dependency on Stage Interface.**  
   `src/material/**` must not import `src/stage_interface/**`.

4. **No material core dependency on `MaterialCard*`.**  
   `MaterialCard`, `CandidateMaterialCard`, `PresentedMaterialCard`, and related compact DTOs must not be imported by material domain modules.

5. **Use `compact*` naming for agent-facing projection functions.**  
   Examples:
   - `compactMaterialCard`
   - `compactCandidateMaterialCard`
   - `compactMaterialResolveOutput`
   - `compactMaterialQueryOutput`
   - `compactMaterialSelectOutput`
   - `compactPresentedMaterialCard`
   - `compactRecommendationPresentOutput`

6. **Do not move runtime policy into Stage Interface.**  
   Stage Interface should not own recommendation policy, session validation, event recording, or material filtering. It should only project already-computed domain results into agent-facing output.

7. **Delay directory reorganization until imports and result shapes are clean.**

---

## 4. Non-Goals

This migration must not attempt to solve unrelated product or provider work.

Non-goals:

- changing MusicBrainz / NetEase provider behavior;
- adding new recommendation algorithms;
- changing canonical identity semantics;
- changing collection behavior;
- changing memory derivation;
- changing MCP host protocol behavior;
- replacing the whole contracts system;
- performing a large rewrite of Stage Core;
- removing all compatibility shims in the first PR.

---

## 5. Target Module Ownership

### 5.1 Material bounded context

Final target:

```text
src/material/
  index.ts
  store/
    index.ts
    material_registry/
    canonical/
    source_entity/
  resolve/
    index.ts
  query/
    index.ts
  policy/
    index.ts
    relation_projection.ts
  selection/
    index.ts
  presentation/
    index.ts
```

Responsibilities:

| Module | Owns | Must not own |
|---|---|---|
| `material/store` | material registry, material relations, material activity, canonical/source bridging exposed through material store | agent output, cards |
| `material/resolve` | canonical-first candidate-to-material resolution | compact card output |
| `material/query` | retrieving materials from pools, collections, source library, related pools | compact card output |
| `material/policy` | availability, identity, freshness, relation filtering decisions | tool output shape |
| `material/selection` | policy application, sorting, diversity, limits | card projection |
| `material/presentation` | final recommendation presentation policy, accepted/dropped/warnings, event payload domain facts | agent card projection |

After consolidation, production imports should use `src/material/**`. If a future
compatibility shim is needed, it must only re-export from `src/material/**` and
must not become a primary implementation location.

### 5.2 Stage Interface outputs

Target:

```text
src/stage_interface/
  outputs/
    index.ts
    material.ts
    recommendation.ts
    library.ts
    canonical_review.ts
  tool_definitions/
    music.ts
    stage.ts
    library.ts
    canonical_review.ts
```

Responsibilities:

| File | Owns |
|---|---|
| `outputs/material.ts` | compact material card projection, compact resolve/query/related/select outputs |
| `outputs/recommendation.ts` | compact final recommendation output, `PresentedMaterialCard` projection |
| `outputs/library.ts` | compact library-import-facing output projection, if needed |
| `outputs/canonical_review.ts` | compact canonical review output projection, if needed |

Rules:

- `outputs/**` may import shared domain contracts.
- `outputs/**` may not call providers, repositories, or storage directly.
- `outputs/**` should be pure projection except for trivial normalization.
- projection functions must be named `compact*`.

---

## 6. Target Data Flow

### 6.1 `music.material.resolve`

Current:

```text
music.material.resolve
  -> context.materialResolve.resolve(...)
  -> MaterialResolveResult returned to agent
```

Target:

```text
music.material.resolve
  -> context.materialResolve.resolve(...)
  -> MaterialResolveResult domain result
  -> compactMaterialResolveOutput(...)
  -> compact agent-facing result
```

The core resolver can continue returning `MaterialResolveResult`. The tool output should not expose raw `MusicMaterial` unless the tool explicitly exists for internal/debug use.

Suggested external shape:

```ts
export type CompactMaterialResolveOutput =
  | {
      kind: "single";
      result: CompactResolvedCandidate;
    }
  | {
      kind: "candidate_set";
      results: CompactResolvedCandidate[];
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
```

### 6.2 `music.material.query` and `music.material.related`

Core target:

```ts
export type MaterialQueryItem = {
  materialId: string;
  material: MusicMaterial;
  score?: number;
  reason?: string;
  basis?: string;
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

Stage Interface target:

```ts
export type CompactMaterialQueryOutput = {
  basis: {
    pool: string;
    applied: string[];
  };
  items: CompactCandidateMaterialCard[];
  nextCursor?: string;
};
```

### 6.3 `music.material.select`

Core target:

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
```

Stage Interface target:

```ts
export type CompactMaterialSelectOutput = {
  items: CompactCandidateMaterialCard[];
  dropped?: MaterialSelectDropped[];
  warnings?: MaterialSelectWarning[];
  applied?: string[];
};
```

### 6.4 `stage.recommendation.present`

Core target:

```ts
export type RecommendationPresentationItem = {
  materialId: string;
  materialRef: Ref;
  label: string;
  material: MusicMaterial;
  reason?: string;
  basis?: RecommendationPresentItem["basis"];
  warnings: string[];
  playableLinks?: PlayableLink[];
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

Stage Interface target:

```ts
export type CompactRecommendationPresentOutput =
  | {
      presented: true;
      eventId: string;
      cards: CompactPresentedMaterialCard[];
      dropped?: DroppedMaterial[];
      warnings?: RecommendationPresentWarning[];
    }
  | {
      presented: false;
      cards: CompactPresentedMaterialCard[];
      dropped?: DroppedMaterial[];
      issues: RecommendationPresentIssue[];
      retryable: boolean;
    };
```

The service may still record a domain event payload, but that payload should not be typed as `MaterialCardSnapshot`. It should be a recommendation presentation event snapshot, for example:

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

---

## 7. Type Ownership Rules

### 7.1 Domain types

Domain/shared contracts may include:

- `Ref`
- `MusicMaterial`
- `MusicMaterialSnapshot`
- `MaterialRecord`
- `MaterialPolicyDecision`
- `MaterialSortCandidate`
- `MaterialSelectionItem`
- `MaterialSelectionResult`
- `MaterialQueryItem`
- `MaterialQueryResult`
- `RecommendationPresentationItem`
- `RecommendationPresentationResult`
- event payload domain snapshots

### 7.2 Stage Interface output types

Stage Interface owns:

- `CompactMaterialCard`
- `CompactCandidateMaterialCard`
- `CompactPresentedMaterialCard`
- `CompactMaterialResolveOutput`
- `CompactMaterialQueryOutput`
- `CompactMaterialRelatedOutput`
- `CompactMaterialSelectOutput`
- `CompactRecommendationPresentOutput`

If legacy names are temporarily kept for API compatibility, they must be aliases in `src/stage_interface/outputs/**`, not core-owned types.

Example temporary compatibility pattern:

```ts
// src/stage_interface/outputs/material.ts
export type MaterialCard = CompactMaterialCard;
export type CandidateMaterialCard = CompactCandidateMaterialCard;
```

This compatibility must not be imported by material core modules.

---

## 8. Dependency Rules

Final enforced rules:

```text
src/material/** must not import src/stage_interface/**
src/material/** must not import src/material_cards/**
src/material/** must not import MaterialCard*
src/material/** must not import PresentedMaterialCard
src/material/** must not import Compact*
```

Before consolidation, the same rule applied to the former root-level material modules:

```text
src/material_store/**
src/material_resolve/**
src/material_query/**
src/material_policy/**
src/material_selection/**
src/recommendation_presentation/**
```

Allowed dependency direction:

```text
stage_core
  -> material module factories
  -> stage_interface factory

stage_interface/tool_definitions
  -> public ports
  -> stage_interface/outputs

stage_interface/outputs
  -> shared domain contracts

material/*
  -> shared domain contracts
  -> public ports
  -> other material submodules through public exports only
```

Forbidden dependency direction:

```text
material/*
  -> stage_interface/*

material/*
  -> agent-facing compact DTOs

core service
  -> host adapter
```

---

## 9. Migration Strategy

The migration should be additive first, then contract-changing, then structural.

### Step 1: Add output projection modules

Create:

```text
src/stage_interface/outputs/index.ts
src/stage_interface/outputs/material.ts
src/stage_interface/outputs/recommendation.ts
```

Add `compact*` functions and tests. Use these projections in tool definitions through `present`.

### Step 2: De-card material selection and query

Change `material_selection` and `material_query` to return domain results. Stage Interface becomes responsible for compact output for:

- `music.material.query`
- `music.material.related`
- `music.material.select`
- `music.material.resolve.cards`

### Step 3: De-card recommendation presentation

Keep policy/session/event responsibilities in core `recommendation_presentation`. Change its return result and event payload to domain presentation facts. Stage Interface projects final agent cards.

### Step 4: Remove global card ownership

Remove or deprecate `src/material_cards`. Remove `MaterialCard*` from global contracts if possible. Keep compatibility aliases only under Stage Interface output modules.

### Step 5: Move material modules under `src/material/`

After imports and data shapes are correct, consolidate the material bounded context.

---

## 10. Testing Strategy

### 10.1 Existing tests must continue passing

Every PR must run:

```bash
npm run typecheck
npm test
```

Given current scripts, `npm test` runs typecheck and stage-core tests.

### 10.2 Add projection tests

Add tests for:

- `compactMaterialCard`
- `compactCandidateMaterialCard`
- `compactMaterialResolveOutput`
- `compactMaterialQueryOutput`
- `compactMaterialSelectOutput`
- `compactPresentedMaterialCard`
- `compactRecommendationPresentOutput`

These tests should verify:

- no raw `MusicMaterial` is exposed in compact output;
- `materialId` is preserved;
- title/subtitle/state behavior matches domain behavior where intended;
- warnings/dropped/issues are preserved;
- playable links are only exposed in final presentation output when allowed.

### 10.3 Add boundary tests

Add a lightweight import boundary test that scans `.ts` files.

Suggested checks:

```text
src/material/** must not import stage_interface/**
src/material/** must not import material_cards/**
src/material/** must not import MaterialCard, CandidateMaterialCard, PresentedMaterialCard, or Compact*
legacy root material directories must not remain as implementation locations
```

### 10.4 Add tool dispatch behavior tests

For each migrated tool, test through dispatch rather than direct service calls:

- `music.material.resolve`
- `music.material.query`
- `music.material.related`
- `music.material.select`
- `stage.recommendation.present`

The test should assert that agent-facing output is compact and does not expose raw `MusicMaterial`.

---

## 11. Acceptance Criteria

The migration is complete when:

1. `music.material.resolve` no longer returns raw `MaterialResolveResult` to the agent.
2. `material_query` does not import `MaterialCard*` or `material_cards`.
3. `material_selection` does not import `MaterialCard*` or `material_cards`.
4. `recommendation_presentation` does not import `material_cards`.
5. core material modules return domain results, not agent cards.
6. Stage Interface output modules contain all compact card projection logic.
7. `stage.recommendation.present` still records recommendation events through the core service.
8. directory consolidation into `src/material/**` happens only after data-shape ownership is corrected.
9. boundary tests enforce the import direction.
10. all existing tests and new boundary/projection tests pass.

---

## 12. Final Principle

The stable rule for future development is:

> Material modules decide what the material is and whether it should be used. Stage Interface decides how that result is shown to the agent.

This protects the long-term extensibility of MineMusic without over-engineering the MVP.
