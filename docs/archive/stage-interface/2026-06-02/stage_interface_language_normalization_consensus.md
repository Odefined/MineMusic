> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/stage-interface/tool-contracts.md`
> Use only for: Historical decision record for removed public tools and public materialId language.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# Stage Interface Agent-Facing Language Normalization - Current Consensus

## Purpose

This document records the current Stage Interface language-normalization
decisions for MineMusic.

The goal is to make the Public Agent Protocol smaller, more stable, and easier
for an LLM agent to use correctly. This is protocol cleanup, not wording polish.

The ordinary public surface should not force the agent to guess between:

```text
materialId vs materialRef vs canonicalRef vs sourceRef
source vs link vs provider provenance
raw MusicMaterial vs compact public item
raw StageEvent vs domain-specific tool
provider/source fact vs material handle
```

## 1. Baseline From Pool / Source Library Cleanup

The pool/source-library/collection material-target cleanup is the baseline this
follow-up plan builds on.

Agreed baseline:

1. Ordinary public material handles use `materialId`.
2. Source Library browsing does not use `library.source.list`.
3. Ordinary Source Library browsing goes through:

```text
music.pools.list
  -> music.material.query
```

4. `library.*` public tools are management tools for import/update/status/summary
   and item-level import audit.
5. `music.pools.list` returns query-ready pool specs.
6. Public pool language uses:

```text
all
source_library
collection
related
```

7. `music.pools.list` does not need to list seed-dependent `related` pools.
8. `source_library` pool uses:

```ts
{
  kind: "source_library";
  libraryKinds: Array<
    | "saved_source_track"
    | "saved_source_release"
    | "saved_source_artist"
  >;
  providerId?: string;
  providerAccountId?: string;
  target?: "library_item" | "release_tracks";
}
```

9. Public `source_library` pool no longer uses:

```text
areas
expand
dynamic
```

10. `target: "release_tracks"` is valid only with:

```ts
{
  kind: "source_library";
  libraryKinds: ["saved_source_release"];
  target: "release_tracks";
}
```

11. Material Query may read Source Library items backed only by `sourceRef`, but
    public output must be materialized/projected into compact material items with
    `materialId`.
12. Public collection material actions use `materialId`; labels are derived
    internally from material projection.

## 2. Resolve Surface Consensus

### Delete `music.material.resolve.cards`

`music.material.resolve.cards` should be removed completely.

Required cleanup:

1. Remove the public tool.
2. Remove its Tool Definition.
3. Remove it from `ToolName`, stable tool order, MCP, Handbook, and tests.
4. Remove `ResolveSeed`, `MaterialResolveCardsInput`, and
   `MaterialResolveCardsOutput` from current public contracts.
5. Remove `MaterialQuerySupportPort.resolveCards`.
6. Remove the `resolveCards` method from Material Query.
7. Remove compact resolve-card output helpers that exist only for this tool.

This is a deletion, not a rename. Do not keep a renamed internal helper that
preserves the old arbitrary-seed behavior.

### Make `music.material.resolve` the single public resolve tool

`music.material.resolve` is the only public resolve entrypoint.

Public input uses text queries:

```ts
type PublicMaterialResolveInput = {
  queries: Array<{
    text: string;
    kind?: "recording" | "release_group" | "release" | "artist" | "work";
    reason?: string;
  }>;
  purpose?: "recommend" | "lookup" | "play";
  ownerScope?: string;
  limit?: number;
};
```

Rules:

1. `queries` must be non-empty.
2. Each `text` must remain non-empty after trimming.
3. `kind` is an optional public hint, not an arbitrary string.
4. `materialId` is not a resolve input; it is already a material handle.
5. `sourceRef` and `canonicalRef` remain internal or advanced exact anchors, not
   ordinary public resolve inputs.
6. Public resolve validation failures return `stage_interface.invalid_payload`
   before Material Resolve is called.

Public output is compact material items:

```ts
type PublicMaterialResolveOutput = {
  items: CompactMaterialItem[];
  unresolved?: Array<{
    text: string;
    reason?: string;
  }>;
  next?: {
    suggestedAction?: "present" | "ask_clarification" | "choose_one" | "retry";
    question?: string;
  };
};
```

The public schema must not advertise:

```text
materialId as a resolve query
sourceRef
canonicalRef
sourceLibraryScope
MusicCandidate
SourceQuery
raw MaterialResolveRequest
candidate
candidates
```

Internal Material Resolve may continue to use raw candidate/ref/source concepts.
Stage Interface adapts public `queries` into internal candidates and calls
`MaterialResolvePort.resolve`.

## 3. Stage Materials Prepare Consensus

Delete public `stage.materials.prepare`.

If `MaterialGatePort`, `createMaterialGate`, and the
`stage.materials.prepared` event are only used by `stage.materials.prepare`, clean
them up in the same slice.

Required cleanup:

1. Remove `stage.materials.prepare` from `stageToolNames`, `ToolName`, stable
   tool expectations, MCP, and Handbook.
2. Remove the Tool Definition and public schema references.
3. Remove `materialGate` from Stage Interface dispatch wiring and Stage Core
   composition if no stable tool uses it.
4. Remove Material Gate tests and docs that describe it as a current Stage
   Module after the production caller is gone.

Ordinary recommendation flow uses material tools and
`stage.recommendation.present`, not `stage.materials.prepare`.

## 4. Public Display Link Consensus

Use one public display-link shape:

```ts
type PublicDisplayLink = {
  label?: string;
  url: string;
};
```

### Recommendation presentation links

`stage.recommendation.present` may return links on presented cards, but those
links use `PublicDisplayLink`.

Presentation output should remove:

```text
sourceHandle
sourceRef
sourceRefs
playableLinks
```

The persisted `recommendation.presented` event may still carry internal
`linkRefs` for existing feedback binding. That event payload is not the Public
Agent Protocol.

### Link refresh output

`music.links.refresh` may return repaired display links directly:

```ts
type MusicLinksRefreshOutput = {
  materialId: string;
  status: "refreshed" | "not_available";
  links?: PublicDisplayLink[];
  message?: string;
};
```

Rules:

1. `music.links.refresh` takes `materialId`.
2. It may return display URLs.
3. It must not return raw `MusicMaterial`.
4. It must not expose `materialRef`, `sourceRefs`, `sourceRef`, or
   `playableLinks`.
5. It does not record a presentation or feedback-binding event.
6. `source.no_playable_link` maps to `status: "not_available"`; infrastructure,
   provider, storage, or material-not-found failures remain `Result` errors.

## 5. Library Import Summary Consensus

Library Import is a management surface, not a material browsing or
recommendation surface.

### Summary output

`library.import.summary` should use MineMusic import-scope language at the public
summary level, while retaining provider-area mapping only as provider metadata.

Agreed summary direction:

```ts
type LibraryImportSummaryView = {
  batchId: string;
  batchKind: LibraryImportBatchKind;
  mode?: LibraryUpdateMode;
  status: LibraryImportBatchStatus;
  providerId: string;
  ownerScope: string;
  scopes: LibraryImportScope[];
  account?: PlatformLibraryAccountIdentity;
  startedAt: string;
  completedAt?: string;
  counts: LibraryImportCounts;
  scopeReports: Array<{
    scope: LibraryImportScope;
    providerArea?: PlatformLibraryArea;
    readStatus?: PlatformLibraryReadStatus;
    count?: PlatformLibraryCount;
    issues?: PlatformLibraryIssue[];
  }>;
  progress: LibraryImportProgress;
  itemCount: number;
  absentItems?: Array<{
    label: string;
    scope: LibraryImportScope;
    providerArea?: PlatformLibraryArea;
    reason: "platform_not_returned" | string;
    baselineBatchId: string;
    currentBatchId?: string;
  }>;
  issues?: PlatformLibraryIssue[];
};
```

Rules:

1. Top-level summary output uses `scopeReports`, not `areas`.
2. A report entry uses `scope` for MineMusic intent and `providerArea` for
   provider mapping when useful.
3. Summary `absentItems` must not expose `sourceRef`.
4. Internal provider/storage/reporting code may continue to use `area` where the
   provider-area concept is precise.

### Items output

`library.import.items.list` is an explicit item-level audit/report tool. It may
expose `sourceRef` as import provenance evidence.

Allowed item-level audit shape:

```ts
{
  scope: LibraryImportScope;
  providerArea?: PlatformLibraryArea;
  sourceRef: Ref;
  itemKind: PlatformLibraryItemKind;
  sourceEntityKind: SourceEntityKind;
  label: string;
  status: LibraryImportItemStatus;
  failureCode?: string;
  retryable?: boolean;
}
```

Handbook/SKILL guidance must say:

```text
sourceRef in library.import.items.list is import provenance evidence only.
Do not use it as a material handle.
For material browsing or recommendation, use music.pools.list -> music.material.query.
```

## 6. Current Cleanup Backlog

The remaining agreed interface cleanup items are:

1. Delete `music.material.resolve.cards` completely.
2. Redesign public `music.material.resolve` around text `queries` and compact
   `items`.
3. Delete public `stage.materials.prepare` and clean up Material Gate if it has no
   other production caller.
4. Introduce `PublicDisplayLink`.
5. Remove `sourceHandle` from presentation display links.
6. Change `music.links.refresh` to return `MusicLinksRefreshOutput` with compact
   display links.
7. Compact `library.import.summary`:
   - top-level `scopeReports`
   - `providerArea` where provider mapping matters
   - compact `absentItems` without `sourceRef`
8. Keep `sourceRef` in `library.import.items.list` only as item-level import
   provenance evidence.
