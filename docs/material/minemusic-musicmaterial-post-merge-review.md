# MineMusic MusicMaterial Post-Merge Code Review

**Review date:** 2026-05-31  
**Repository:** `Odefined/MineMusic`  
**Reviewed branch:** `main` after the MusicMaterial PR 1–5 sequence was reported as merged  
**Review focus:** design drift, runtime semantic holes, public API overexposure, persistence/redirect invariants, and the two open GitHub issues related to the MusicMaterial work.

---

## 1. Executive assessment

The MusicMaterial refactor has landed the core architectural direction correctly:

- `MusicMaterial` is now the resolved product-layer material object.
- `materialRef` and `identityState` are required on resolved `MusicMaterial`.
- `SourceMaterial` remains the pre-materialized provider/source shape.
- `MaterialRegistry` owns product-level source/canonical/material mapping.
- `MaterialStore.mergeMaterials` migrates material relations and activity.
- `material.query`, `material.related`, compact `MaterialCard`, `context.brief`, and pool listing are present.
- Collection, Event, Memory, and Effect now accept material-backed or structured material targets.

The current implementation is usable as a first integrated slice, but it still has several correctness holes. The most important risk is not type-level incompleteness; it is **semantic mismatch between public tool contracts and the deterministic behavior actually implemented behind them**.

The biggest remaining issues are:

1. `MaterialActivity` uses session counters without a session dimension.
2. GitHub issue #8 is still valid: Source Library `addedAt` ignores provider-side `providerAddedAt`.
3. GitHub issue #9 is still valid: public schemas expose unsupported or weakly-defined options.
4. Collection blocking and relation blocking are not fully unified in `material.query`.
5. Compact `ref` collection writes can misclassify non-recording materials because Collection cannot infer material kind from the record.
6. Some advanced internal fields remain visible in LLM-facing collection schemas.

These are fixable without changing the main design. I recommend a short hardening sequence before building more product features.

---

## 2. Review baseline

### 2.1 Intended design invariants

The intended MusicMaterial design established these invariants:

1. **Product target invariant**  
   Product behavior should target `MusicMaterial.materialRef`, not `sourceRef` or `canonicalRef`.

2. **Source/canonical ownership invariant**  
   Source facts remain in Source Entity. Canonical facts remain in Canonical Store. `MusicMaterial` is a projection, not a metadata owner.

3. **Agent boundary invariant**  
   LLM-facing tools should use compact material card refs such as `mat_*`, not raw `Ref` graphs.

4. **Material merge invariant**  
   Feedback, activity, collection state, and future material lookup should survive material redirects and merges.

5. **Structured field invariant**  
   If a field is exposed in the public Stage Interface schema, it must have deterministic runtime behavior or be explicitly hidden.

The implementation largely respects the first two invariants. The remaining problems are mostly around invariants 3–5.

---

## 3. What is aligned

### 3.1 `MusicMaterial` shape is now product-layer resolved

The contract is now in the expected shape:

```ts
export type ResolvedMusicMaterial = MusicMaterialBase & {
  materialRef: Ref;
  identityState: MusicMaterialIdentityState;
};

export type SourceMaterial = MusicMaterialBase;
export type MusicMaterial = ResolvedMusicMaterial;
```

This is correct. It separates provider/source output from product-layer resolved material.

### 3.2 `Ref.label` and `Ref.url` are correctly documented as non-authoritative

The code now comments that `Ref.label` is a display hint and `Ref.url` is not playability truth. This aligns with the design that `SourceEntity`, `CanonicalRecord`, and `PlayableLink` own real facts.

### 3.3 Material merge now migrates relation and activity state

`MaterialStore.mergeMaterials` delegates identity merge to the registry, then migrates loser material relations and material activity to the survivor. This fixes the most important merge-survival problem identified during PR review.

### 3.4 Collection is now material-backed while preserving canonical compatibility

`CollectionItem` now supports:

- `materialRef`
- `materialSnapshot`
- `relationScope`
- `identityRequirement`
- `status`
- optional legacy `canonicalRef`

This is directionally correct. The code also supports material-based system and custom collection operations.

### 3.5 Public collection tools now support compact `ref`

The Stage Interface collection tools now accept `ref?: string` and decode it via `cardRefToMaterialRef`. This preserves the compact-agent boundary for normal usage.

### 3.6 `context.brief.fields` now controls output

The implementation uses `input.fields` to decide whether to emit artist, album, status warning, and version warning. This fixes the earlier public-schema mismatch.

---

## 4. Findings

## Finding 1 — High: `MaterialActivity` session counters are not session-scoped

### Problem

`MaterialActivity` has fields such as:

```ts
recommendedCountSession?: number;
openedCountSession?: number;
playedCountSession?: number;
```

But the activity record is keyed only by:

```ts
ownerScope
materialRef
```

There is no `sessionId` in the contract or repository key.

At query time, `recent: { recommended: "session" }` is implemented as:

```ts
return (sessionCount ?? 0) > 0;
```

This means once an item is recommended once for an owner, the session counter can cause it to be treated as "recommended in this session" in later unrelated sessions. The name `recommendedCountSession` is therefore misleading and semantically wrong.

### Impact

This can silently over-filter recommendations across sessions.

Example failure:

1. Session A recommends material M.
2. `recommendedCountSession` becomes 1.
3. Session B starts later.
4. `material.query({ exclude: { recent: { recommended: "session", mode: "hard" }}})` excludes M even though it was not recommended in Session B.

This damages recommendation diversity and makes session-level user intent unreliable.

### Recommended fix

Add real session-aware activity.

Preferred option:

```ts
export type MaterialActivity = {
  ownerScope: string;
  materialRef: Ref;
  lastRecommendedAt?: string;
  lastOpenedAt?: string;
  lastPlayedAt?: string;
  lastSkippedAt?: string;
  updatedAt: string;
};

export type MaterialSessionActivity = {
  ownerScope: string;
  sessionId: string;
  materialRef: Ref;
  recommendedCount: number;
  openedCount: number;
  playedCount: number;
  skippedCount: number;
  updatedAt: string;
};
```

Then update:

```ts
MaterialQueryInput {
  sessionId?: string;
}
```

Stage Interface should inject the current `sessionId` into `material.query` and `material.related` unless explicitly supplied.

For session recent filtering:

```ts
if (window === "session") {
  require sessionId;
  check MaterialSessionActivity(ownerScope, sessionId, materialRef);
}
```

If no `sessionId` is available, return a warning or fall back to timestamp-based windows only. Do not use owner-global counters as session counters.

### Tests

Add tests:

1. Session A recommends M; Session B query with `recommended: "session"` should not exclude M.
2. Session A query with `recommended: "session"` should exclude M.
3. Timestamp windows such as `"1h"` and `"24h"` should still use aggregate `lastRecommendedAt`.
4. Merge M1 -> M2 should migrate both aggregate activity and session activity.

---

## Finding 2 — High: GitHub issue #8 is still valid; Source Library `addedAt` ignores provider `providerAddedAt`

### Problem

`PlatformLibraryItem` has:

```ts
providerAddedAt?: string;
```

But Library Import currently writes:

```ts
addedAt: existingLibraryItem.value?.addedAt ?? seenAt,
```

That means a first import of an existing provider library uses import observation time instead of the provider's saved/favorited time.

### Impact

`material.query({ order: "recently_added" })` sorts by `SourceLibraryItem.addedAt`, falling back to `lastSeenAt` and material creation time. If first import uses the same `seenAt` for many items, `recently_added` degenerates into tie-break ordering instead of reflecting the user's actual library chronology.

This is exactly the bug tracked in GitHub issue #8.

### Recommended fix

Change import normalization:

```ts
const normalizedAddedAt =
  existingLibraryItem.value?.addedAt ??
  item.providerAddedAt ??
  seenAt;

const sourceLibraryItem: SourceLibraryItem = {
  ...
  addedAt: normalizedAddedAt,
  ...
};
```

Keep the preservation rule:

```text
existing SourceLibraryItem.addedAt wins
providerAddedAt is used only for first creation
seenAt is the final fallback
```

### Tests

Add a Library Import regression test:

1. Import A and B in the same batch with identical `seenAt`.
2. A has `providerAddedAt = "2024-01-01T00:00:00.000Z"`.
3. B has `providerAddedAt = "2026-01-01T00:00:00.000Z"`.
4. Verify stored `SourceLibraryItem.addedAt` uses those provider timestamps.
5. Verify `material.query({ order: "recently_added" })` returns B before A.
6. Re-import with a newer `providerAddedAt` and verify the original `addedAt` is preserved.

---

## Finding 3 — High: GitHub issue #9 is still valid; public schemas expose unsupported structured options

### Problem A: `same_release` / `same_release_group`

The public contract and Stage Interface schema expose:

```ts
"same_artist" | "same_album" | "same_release" | "same_release_group" | "similar"
```

The current implementation has differentiated behavior for:

- `same_artist`
- `same_album`
- `similar`

But `same_release` and `same_release_group` fall through to the same source-album path. This overstates the semantics.

### Problem B: `library_order`

The public query order exposes:

```ts
"relevance" | "recently_added" | "least_recently_recommended" | "random" | "library_order"
```

`orderMaterials()` has specific branches for:

- `random`
- `recently_added`
- `least_recently_recommended`
- hint-based relevance

There is no explicit `library_order` branch. It falls through to deduped upstream order, which is not documented as provider library order.

### Impact

This breaks the structured field invariant: if a field is LLM-visible, it must mean what it says. Otherwise the agent will plan using options that are weaker than advertised.

### Recommended fix

For the next cleanup PR, hide unsupported options from the public Stage Interface schema:

```ts
// Stage Interface only
relation: z.enum(["same_artist", "same_album", "similar"])

order: z.enum([
  "relevance",
  "recently_added",
  "least_recently_recommended",
  "random"
])
```

Keep broader TypeScript internal contracts if needed, but do not expose unsupported options to the LLM/MCP surface.

Alternative, if you want to keep them public:

- Implement `same_release`.
- Implement `same_release_group`.
- Implement `library_order`.
- Add deterministic tests and handbook text for each.

Given current implementation maturity, hiding is the better option.

### Tests

1. Stage Interface schema for `music.material.related` must not expose `same_release` or `same_release_group`.
2. Stage Interface schema for `music.material.query` must not expose `library_order`.
3. Handbook/tool descriptors must not mention removed options.
4. Existing internal service tests can remain if internal callers still use wider types.

---

## Finding 4 — High: Collection-blocked materials can leak through `material.query` relation exclusions

### Problem

Material Resolve applies Collection block by setting material state to `"blocked"`.

But `material.query` relation exclusion checks only `MusicMaterialRelation`:

```ts
const relations = await materialStore.listMaterialRelations({
  ownerScope,
  materialRef: material.materialRef,
  status: "active",
});
```

It does not check:

```ts
material.state === "blocked"
```

Therefore, if a material is blocked through Collection but not through `MusicMaterialRelation`, then:

```ts
material.query({
  exclude: { relations: ["blocked"] }
})
```

can still return the material as a blocked card.

### Impact

The user-visible system has two ways to express block state:

1. Collection blocked membership.
2. `MusicMaterialRelation` blocked relation.

The query layer only understands the second. This can cause blocked materials to appear in recommendations when the agent reasonably supplies `exclude.relations: ["blocked"]`.

### Recommended fix

In `filterMaterials()`:

```ts
if (
  material.state === "blocked" &&
  exclude?.relations?.includes("blocked")
) {
  continue;
}
```

Also consider making blocked hard-excluded by default for `purpose: "recommend"` or `material.query`, unless a debug flag asks to include blocked cards.

### Longer-term design decision

Choose one of these strategies:

#### Strategy A — Projection only

Collection block remains a Collection fact. Material Resolve projects it as `state: "blocked"`. Query respects blocked state.

This is simplest.

#### Strategy B — Relation projection

Collection writes create or update a `MusicMaterialRelation` with:

```ts
relationKind: "blocked"
source: "system"
scope: { level: "material" }
```

Then query can rely on relation filtering.

This makes relation and collection more unified but creates a synchronization obligation.

I recommend Strategy A for now, with an explicit test.

### Tests

1. Add a material to the blocked Collection.
2. Run `material.query` with `exclude.relations: ["blocked"]`.
3. Verify the blocked material is not returned.
4. Verify `material.query` without this exclusion either returns a blocked card or follows the product policy chosen by the team.

---

## Finding 5 — Medium/High: Compact collection writes cannot infer material kind from a material record

### Problem

Collection tools now allow compact `ref?: string`. This is correct. But if the agent calls:

```ts
music.collection.favorite({
  ref: "mat_artist_..."
})
```

and does not provide `collectionKind`, `canonicalRef`, or `materialSnapshot`, the Collection service defaults to:

```ts
return "recording";
```

This is in `collectionKindForMaterialInput`.

The service dependency only includes:

```ts
getOrCreateByCanonicalRef
resolveMaterialRedirect
```

It does not include `getMaterialRecord`, so it cannot infer the current material's kind from the registry.

### Impact

A compact ref for an artist, release, or release group can be stored in a recording collection by default. Blocking still works because `filterBlockedMaterials` scans all blocked collections, but saved/favorite/custom semantics become wrong.

This is a product-level identity leak: the public compact ref does not carry kind, but Collection still needs kind to choose the correct system collection.

### Recommended fix

Extend Collection service material-store dependency:

```ts
materialStore?: Pick<
  MaterialStorePort,
  "getOrCreateByCanonicalRef" |
  "resolveMaterialRedirect" |
  "getMaterialRecord"
>;
```

Update `collectionKindForMaterialInput` to resolve kind in this order:

```text
explicit collectionKind
canonicalRef.kind
materialSnapshot.kind
current MaterialRecord.kind
fallback recording
```

Make the fallback only for legacy compatibility; when using compact `ref`, prefer failing with `collection.kind_unknown` if no material record is available.

### Tests

1. Create an artist material record.
2. Call `music.collection.favorite({ ref: mat_artist, label })`.
3. Verify it goes to the favorite artists collection, not favorite recordings.
4. Create a release material record.
5. Verify save/favorite goes to the correct release collection when no explicit `collectionKind` is supplied.
6. Unknown compact ref should either fail clearly or require explicit `collectionKind`.

---

## Finding 6 — Medium: Public Collection schemas still expose advanced internal object fields

### Problem

The public Collection tool schemas expose:

```ts
materialRef?: Ref
materialSnapshot?: object passthrough
relationScope?: object passthrough
identityRequirement?: ...
```

Compact `ref` is now supported, which fixes the main agent boundary. But these advanced fields remain visible in LLM-facing schemas.

### Impact

The agent can now pass internal implementation structures that should normally be owned by MineMusic. This increases context complexity and invites invalid internal shapes.

`materialSnapshot` and `relationScope` are particularly risky because their schema is currently `z.object({}).passthrough()`, which accepts anything.

### Recommended fix

Split public and internal inputs:

#### Public Stage Interface schema

Expose only:

```ts
{
  ref?: string;
  canonicalRef?: Ref; // optional legacy/advanced
  collectionKind?: CollectionKind; // optional only when needed
  label: string;
  description?: string;
}
```

For removal:

```ts
{
  ref?: string;
  canonicalRef?: Ref;
  collectionKind?: CollectionKind;
}
```

#### Internal service input

Keep full material shape:

```ts
materialRef
materialSnapshot
relationScope
identityRequirement
```

Stage Interface should not expose passthrough object schemas for these fields by default.

### Tests

1. Public schemas do not include `materialSnapshot` or `relationScope`.
2. Public schemas still accept compact `ref`.
3. Internal service unit tests still cover snapshots and relation scope.

---

## Finding 7 — Medium: Internal `preferenceHints` remains in contracts and service, but public schema hides it

### Current state

The Stage Interface no longer exposes `preferenceHints` for `material.query` or `material.related`. That is correct because the store has no authoritative tag, genre, mood, energy, vocal, audio-feature, or embedding data.

However, `MaterialQueryInput` still includes:

```ts
preferenceHints?: {
  activity?: string;
  mood?: string[];
  energy?: ...
  vocal?: ...
  prefer?: string[];
  avoid?: string[];
}
```

The service still implements lightweight text matching over label/notes/evidence.

### Impact

This is acceptable as an internal experiment, but it should remain explicitly internal. Otherwise future contributors may assume MineMusic has semantic preference data when it does not.

### Recommended fix

Add a contract comment:

```ts
/**
 * Internal-only lightweight text hints.
 * Not exposed to LLM-facing schemas until MineMusic has real tag/genre/audio-feature support.
 */
preferenceHints?: ...
```

Also consider renaming internally:

```ts
textPreferenceHints
```

No urgent runtime fix is required if it stays hidden from public schemas.

---

## Finding 8 — Medium: `MaterialCard.ref` encoding only preserves material id

### Problem

The compact card ref uses:

```ts
mat_${encodeURIComponent(materialRef.id)}
```

and decodes to:

```ts
{ namespace: "minemusic", kind: "material", id }
```

This is acceptable only because `MaterialRegistry` always creates material refs with:

```ts
namespace = "minemusic"
kind = "material"
```

### Impact

The compact ref cannot represent any future non-default material namespace or kind. That is acceptable for the current product but should be documented.

### Recommended fix

Add a comment near `materialRefToCardRef` and `cardRefToMaterialRef`:

```ts
// Compact card refs intentionally encode only the opaque MineMusic material id.
```

If future namespaces are needed, use a versioned format:

```text
mat_v1:<base64url(JSON Ref)>
```

No immediate code change is needed.

---

## Finding 9 — Medium: `resolveCards({ seeds: [{ ref }] })` re-resolves through Material Resolve instead of directly projecting the MaterialRecord

### Current behavior

When resolving a compact material ref, the service:

1. Decodes `mat_*` to `materialRef`.
2. Loads the current `MaterialRecord`.
3. Builds a `MusicCandidate`.
4. Calls `materialResolve.resolve`.
5. Falls back to a simple card if no material is returned.

This works, but it is a roundabout projection path.

### Risk

For canonical-only records without source material, this may still return a fallback `found_no_link` card rather than a richer canonical material projection. This is acceptable for the current MVP but remains a design gap: `resolve(materialRef)` should eventually be a direct projection path.

### Recommended fix

Add a `MaterialProjectionPort` or internal helper:

```ts
projectMaterialRecord(record, { ownerScope, purpose }): Promise<MusicMaterial>
```

Then:

```ts
resolveCards(ref) -> get record -> project -> card
```

This avoids re-searching source providers when the material record is already known.

---

## Finding 10 — Medium: Collection material items may remain visibly stored under old material refs

### Current state

Collection filtering and removal are redirect-aware. This is good.

But collection item rows are not migrated on material merge. Items stored under a loser ref remain stored under that old `materialRef`. The lookup path resolves redirects dynamically.

### Impact

This is acceptable for correctness, but it can produce confusing list output: a collection item may display an old material ref even though operations with the survivor ref work.

### Recommended fix

Add a maintenance helper:

```ts
collection.rewriteMaterialRedirects(ownerScope?)
```

or include Collection in a later material merge maintenance pass:

```text
for each collection item with materialRef:
  current = resolveMaterialRedirect(materialRef)
  if current != materialRef:
    update item.materialRef = current
```

Keep historical events unchanged.

This is not urgent because redirect-aware filtering/removal works.

---

## Finding 11 — Low/Medium: `same_artist` only works through source artist refs and source entities

### Current behavior

`same_artist` starts from source entities and source artist refs. It can use confirmed bindings from source artist refs to canonical artist refs, then scans source tracks.

### Impact

This is acceptable for source-library MVP, but it means canonical relations are not yet the primary related-data source. If a material is canonical-confirmed but lacks source refs, `same_artist` will likely fall back.

### Recommended fix

Add canonical relation-based candidate generation later:

```text
recording --performed_by--> artist
artist -> recordings/releases
```

Do not implement this until canonical relation quality is high enough.

---

## 5. Recommended implementation plan

## PR A — Public-schema and Library Import correctness

### Goal

Close GitHub issues #8 and #9, and fix Collection-blocked leakage in query.

### Tasks

1. Fix Source Library `addedAt` normalization:
   - Use `existing.addedAt ?? item.providerAddedAt ?? seenAt`.
   - Preserve existing `addedAt`.

2. Hide unsupported public schema options:
   - Remove `same_release` and `same_release_group` from Stage Interface schema for `music.material.related`.
   - Remove `library_order` from Stage Interface schema for `music.material.query`.
   - Update handbook/tool descriptions.

3. Keep broader TypeScript internal unions only if needed.
   - Add comments that they are not public-stage supported yet.

4. Fix blocked Collection leakage:
   - In `filterMaterials`, if `exclude.relations` includes `"blocked"` and `material.state === "blocked"`, exclude it.

### Tests

- Library import providerAddedAt test.
- Query `recently_added` order test after import.
- Existing `addedAt` preservation test.
- Schema tests for hidden unsupported options.
- Query test proving Collection-blocked material is excluded by `exclude.relations: ["blocked"]`.

### Acceptance criteria

- Issues #8 and #9 can be closed.
- LLM-facing schemas no longer advertise unsupported structured options.
- Collection block does not leak through query relation exclusion.

---

## PR B — Session-correct MaterialActivity

### Goal

Make `recent: { recommended/opened/played: "session" }` actually session-scoped.

### Tasks

1. Introduce `MaterialSessionActivity` or add session dimension to activity storage.
2. Update `EventService` to project session activity using `event.sessionId`.
3. Add `sessionId?: string` to `MaterialQueryInput`.
4. Stage Interface should inject the current session id into query/related calls.
5. Keep aggregate timestamps for `"1h"`, `"24h"`, `"7d"` windows.

### Tests

- Same material recommended in Session A should not be session-excluded in Session B.
- Same material should be excluded in Session A.
- Merge migration carries session activity.
- Existing timestamp-window recent filtering still works.

### Acceptance criteria

- No owner-global session counters.
- `"session"` windows require a session identity.
- Query results are stable across sessions.

---

## PR C — Collection target hardening

### Goal

Make compact collection writes fully product-safe.

### Tasks

1. Extend Collection service dependency to include `getMaterialRecord`.
2. Infer collection kind from current `MaterialRecord.kind` when the public input only provides compact `ref`.
3. Fail clearly for unknown compact refs when kind cannot be inferred and no explicit `collectionKind` is supplied.
4. Hide advanced object fields from public schemas:
   - `materialSnapshot`
   - `relationScope`
   - raw `materialRef` if the team wants a strict compact surface
5. Keep advanced fields service-internal.

### Tests

- `favorite({ ref: mat_artist })` writes to favorite artists.
- `save({ ref: mat_release })` writes to saved releases.
- Unknown `ref` without `collectionKind` fails clearly.
- Public tool schemas expose compact `ref`, not passthrough snapshot/scope objects.

### Acceptance criteria

- Public Collection tools no longer require or invite raw material internals.
- Compact refs can route non-recording materials correctly.

---

## PR D — Optional direct material projection

### Goal

Reduce re-resolution and support richer material-ref lookup.

### Tasks

1. Add internal `projectMaterialRecord`.
2. Use it in:
   - `resolve.cards({ ref })`
   - `context.brief`
   - collection material snapshot refresh if needed
3. Support canonical-only material cards without requiring source provider search.

### Tests

- Canonical-only material ref returns canonical label and `found_no_link`.
- Source-backed material ref returns source label and playable status when source link exists.
- Merged material ref returns survivor card.

### Acceptance criteria

- Compact ref round-trip is deterministic and does not depend on source search.

---

## 6. Suggested Codex prompt for the next cleanup PR

```text
Implement PR A from the MusicMaterial post-merge review.

Scope:
- Fix GitHub issue #8: Library Import should set SourceLibraryItem.addedAt to existing addedAt, else PlatformLibraryItem.providerAddedAt, else seenAt.
- Fix GitHub issue #9: hide unsupported LLM-facing schema options same_release, same_release_group, and library_order.
- Fix material.query blocked leakage: when exclude.relations includes blocked, materials already projected as state=blocked must be excluded.

Do not implement session-scoped MaterialActivity in this PR.
Do not implement new canonical relation related logic.
Do not add tag/genre/audio-feature storage.
Do not migrate Collection/Memory/Effect further.

Add tests:
- providerAddedAt import and recently_added query order.
- existing SourceLibraryItem.addedAt is preserved.
- public Stage Interface schemas do not expose same_release, same_release_group, or library_order.
- collection-blocked material is excluded by material.query with exclude.relations=['blocked'].

Run:
npm run typecheck
npm test
git diff --check

Return changed files, tests, and deferred work.
```

---

## 7. Final judgment

The MusicMaterial refactor is architecturally on track. The remaining issues are not signs that the core direction is wrong. They are mostly boundary hardening problems:

- public schema should not overpromise;
- session-level behavior must actually be session-level;
- provider timestamps should be normalized at import;
- Collection block state and relation block state need consistent query behavior;
- compact refs should stay compact all the way through public tools.

I would not build new product features on top of this until PR A and PR B are done. PR C is also important if the Collection tools will be used heavily by the LLM agent.
