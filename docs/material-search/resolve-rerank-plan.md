# Resolve Rerank Implementation Plan

This is an implementation plan, not current implementation state. Current
design authority lives in `docs/material-search/design.md`. Current
implementation state lives in `docs/material-search/progress.md`.

## Goal

Add a separate `MaterialSearchPort.rerank(...)` method for Material Resolve.

Resolve should stop choosing between separately ranked local and provider
result sets. It should assemble one request-scoped material corpus, ask Material
Search to rerank that corpus, then apply Resolve-owned projection,
policy/status, and output assembly.

## Non-Goals

- Do not change ordinary `MaterialSearchPort.search(...)` behavior.
- Do not add a public `music.material.search` or rerank tool.
- Do not move provider/source search into Material Search.
- Do not let Material Search allocate `emat:*` handles.
- Do not let Material Search materialize durable `MaterialRecord`s.
- Do not let Material Search call `MaterialPolicyEvaluator`.
- Do not expose Search score, evidence, provenance, or cursor in ordinary
  Stage Interface outputs.
- Do not add an in-memory or hand-written scorer.
- Do not add cursor support for Resolve rerank.

## Ownership And Boundaries

Owned bounded context: Material Flow / Material Search plus Material Resolve.

Allowed Resolve reads:

- projection reads;
- identity keys already present on provider `SourceMaterial` values;
- exact durable lookup by provider-provided `canonicalRef`;
- exact durable lookup by provider-provided `sourceRefs` and
  `playableLinks[].sourceRef`.

Allowed Resolve writes:

- process-local ephemeral store `put` / bounded cleanup only.

Allowed Material Search reads for rerank:

- projection reads already available to `MaterialSearchStorePort`;
- source/canonical facts needed to build request-scoped search documents.

Allowed Material Search writes for rerank:

- transient SQLite request-corpus writes only.

Forbidden inside `rerank()`:

- provider/source grounding calls;
- durable identity lookup for provider results;
- ephemeral-store writes;
- registry materialization writes;
- Material Policy / Selector calls;
- Stage Interface compact output projection.

## Proposed Contracts

Keep `search()` unchanged and add a second method:

```ts
export interface MaterialSearchPort {
  search(input: MaterialSearchInput): Promise<Result<MaterialSearchOutput>>;
  rerank(input: MaterialSearchRerankInput): Promise<Result<MaterialSearchRerankOutput>>;
}
```

Rerank input:

```ts
export type MaterialSearchRerankInput = {
  text: string;
  targetKind?: MaterialSearchTargetKind;
  materials: MusicMaterial[];
  limit?: number;
};
```

Rerank output is separate from ordinary Search output because rerank has no
cursor:

```ts
export type MaterialSearchRerankOutput = {
  hits: MaterialSearchHit[];
  warnings?: MaterialSearchWarning[];
};
```

`MaterialSearchHit` keeps the existing hit shape:

```ts
export type MaterialSearchHit = {
  materialRef: Ref;
  score?: number;
  evidence?: MaterialSearchEvidence[];
  provenance?: MaterialSearchProvenance[];
};
```

`materials` is request-scoped. It may contain durable `mat:*` domain materials
and process-local `emat:*` domain materials. Resolve owns provider expansion,
durable lookup, and corpus preparation before calling `rerank()`.

`rerank()` input intentionally does not include:

- `ownerScope`, because rerank does not enforce owner visibility, relation
  policy, or session policy;
- `cursor`, because Resolve performs one provider expansion and one
  request-scoped rerank per query;
- `scopes`, because Resolve, not Search, owns the request corpus.

## Resolve Flow

For each `MaterialResolveQuery`:

1. Call `MaterialSearch.search(...)` for local durable recall with a bounded
   recall window.
2. Project durable Search hits into `MusicMaterial` values.
3. Call Source Grounding for provider expansion.
4. For every provider `SourceMaterial`:
   - read only the identity keys already present on the `SourceMaterial`:
     `canonicalRef`, `sourceRefs`, and `playableLinks[].sourceRef`;
   - do not mutate the `SourceMaterial` identity;
   - do not attach or infer a `canonicalRef`;
   - if an existing durable material matches by those existing identity keys,
     use the durable projected `MusicMaterial`;
   - otherwise store the original `SourceMaterial` in the process-local
     ephemeral store and wrap it as `emat:*`;
   - dedupe provider-expanded candidates as part of this expansion step.
5. Assemble local durable candidates plus provider-expanded candidates into the
   request corpus. This should only need defensive `materialRef`-level
   merge/assertion; identity-level dedupe by `canonicalRef` or source-ref
   overlap belongs to provider expansion, not to `rerank()`.
6. Call `MaterialSearch.rerank(...)` with the prepared corpus.
7. Map returned hits back to durable projections or request-scoped snapshots.
8. Apply `MaterialPolicyEvaluator` with `purpose: "material_resolution"`.
9. Build `MaterialResolvedQuery` status, reason, and issues.

Resolve must not call durable materialization writers. Only final
Recommendation Presentation may materialize selected `emat:*` items.

## Rerank Behavior

`rerank()` builds a transient request-scoped SQLite FTS corpus from the supplied
materials and returns ranked `MaterialSearchHit` values.

Rules:

- `text` is normalized with the same text normalization used by Search.
- `targetKind` is a hard material-kind filter.
- `limit` means final rerank hits, not transient raw rows.
- scoring and evidence use SQLite-backed Search behavior, not a custom
  in-memory scorer;
- stable ties fall back to `materialRef` order;
- provenance may be omitted for `emat:*` inputs and preserved for durable
  inputs only when supplied by the caller or reconstructable without new broad
  dependencies.

Request-scoped Search documents should reuse the same field vocabulary as
durable Search when possible:

- `canonical_label`;
- `canonical_aliases`;
- `source_title`;
- `source_artist_labels`;
- `source_release_label`;
- `source_artist_aliases`.

Durable candidates may use existing document-building logic. Ephemeral
candidates should be built from the supplied `MusicMaterial` snapshot and
read-only source/canonical facts if their refs are available. Missing optional
fields should reduce evidence richness, not fail the whole rerank.

## Slice 1: Contracts, Ports, And Guards

Expected files:

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `src/material/search/index.ts`
- `test/architecture/material-boundary.test.ts`
- `docs/material-search/design.md`
- `docs/material/ports.md`

Tasks:

- Add `MaterialSearchRerankInput`.
- Extend `MaterialSearchPort` with `rerank(...)`.
- Keep `MaterialSearchInput` and `search(...)` behavior unchanged.
- Add port key-set guard coverage for the new method.
- Update forbidden-import guards if the transient rerank implementation needs a
  narrow helper boundary.

Acceptance criteria:

- `search()` callers compile without behavior or schema changes.
- `rerank()` is available to Material Resolve through `MaterialSearchPort`.
- Search still cannot import provider/source grounding, Stage Interface output
  modules, broad store/collection ports, registry writers, or ephemeral-store
  writers.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/architecture/material-boundary.test.js
```

## Slice 2: Transient SQLite Rerank

Expected files:

- `src/material/search/index.ts`
- `src/storage/sqlite/material-search-index.ts`
- `test/material_search/material-search-rerank.test.ts`
- `test/storage/sqlite-material-search-index.test.ts`

Tasks:

- Add a request-scoped document builder for `MusicMaterial` candidates.
- Add transient SQLite corpus support for rerank.
- Reuse Search evidence field names and score behavior.
- Return `MaterialSearchHit[]` with durable or ephemeral `materialRef` values.
- Omit cursor from rerank output.

Acceptance criteria:

- Durable and ephemeral candidates are ranked in one request-scoped corpus.
- No Map-based or hand-written scorer is introduced.
- `targetKind` filters before ranking.
- Missing optional source/canonical facts do not fail the whole rerank.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/material_search/material-search-rerank.test.js
node .tmp-test/test/storage/sqlite-material-search-index.test.js
```

## Slice 3: Resolve Flow Refactor

Expected files:

- `src/material/resolve/index.ts`
- `test/material_resolve/material-resolve.test.ts`
- `test/material_resolve/material-relation-filtering.test.ts`

Tasks:

- Replace the local/provider result-set choice with one request corpus.
- Preserve existing query-based public contract.
- Keep durable lookup before `emat:*` allocation.
- Dedupe local durable and provider-expanded candidates before rerank.
- Call `MaterialSearch.rerank(...)`.
- Map rerank hits back to durable projections or request snapshots.
- Apply `MaterialPolicyEvaluator` after rerank.
- Preserve blocked, wrong-version, not-playable, source-only, and unresolved
  status behavior.
- Preserve ephemeral lifecycle: later Resolve calls must not invalidate earlier
  returned `emat:*` handles before presentation.

Acceptance criteria:

- Resolve no longer has separate local/provider ranking and final
  `chooseResolvedMaterialSet(...)` behavior.
- Provider results cannot create duplicate `emat:*` candidates when a durable
  identity already exists.
- Resolve still does not receive durable materialization writers.
- Public `music.material.resolve` schema remains query-based.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/material_resolve/material-resolve.test.js
node .tmp-test/test/material_resolve/material-relation-filtering.test.js
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
```

## Slice 4: Docs And Broad Gate

Expected files:

- `docs/material-search/design.md`
- `docs/material-search/progress.md`
- `docs/material/design.md`
- `docs/material/ports.md`
- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`

Tasks:

- Update Material Search progress with implemented rerank behavior.
- Update Material Flow ports once the port key set changes in code.
- Update root state docs only where implementation state changed.
- Confirm `INDEX.md` does not need a new entry because this plan is not current
  authority.

Verification:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
node .tmp-test/test/architecture/material-boundary.test.js
git diff --check
git diff --name-only
```

## Final Acceptance Criteria

- `MaterialSearchPort.search(...)` remains local durable retrieval.
- `MaterialSearchPort.rerank(...)` ranks Resolve-provided request materials.
- Resolve owns provider expansion, durable identity lookup, provider-expanded
  candidate identity handling, `emat:*` allocation, and resolve policy/status.
- Rerank returns `MaterialSearchHit[]`, not `MusicMaterial[]`.
- Rerank uses SQLite/transient FTS scoring, not a custom scorer.
- Presentation remains the only durable materialization boundary for selected
  `emat:*` results.
