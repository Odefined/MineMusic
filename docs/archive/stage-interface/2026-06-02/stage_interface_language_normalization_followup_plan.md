> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/stage-interface/progress.md`, `docs/stage-interface/tool-contracts.md`
> Use only for: Historical follow-up implementation sequence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# Stage Interface Agent-Facing Language Normalization - Follow-Up Implementation Plan

## 1. Goal

Complete the remaining Stage Interface language-normalization cleanup after the
pool/source-library/collection cleanup baseline.

This plan is split into phase-gated slices. Each slice has its own bounded
context, allowed capabilities, expected files, guards, and acceptance criteria.

The plan covers only:

1. Resolve surface cleanup.
2. Deleting `stage.materials.prepare` and unused Material Gate code.
3. Public display-link output for presentation and link refresh.
4. Library Import summary/audit language.
5. Handbook, MCP, guards, and state documentation for those changes.

## 2. Shared Protocol Decisions

### Public Agent Protocol

The Public Agent Protocol is the ordinary LLM-facing and host-facing Stage
Interface contract: stable tools, public schemas, Handbook guidance, MCP
exposure, and compact outputs an agent can use directly.

Internal domain records, provider audit shapes, persisted event payloads, source
refs, canonical refs, and material refs are not public handles just because they
exist in TypeScript contracts or storage.

### Public display links

Use one display-link shape wherever a public tool returns user-displayable links:

```ts
type PublicDisplayLink = {
  label?: string;
  url: string;
};
```

Public display links must not expose source refs, material refs, playable-link
records, or provider provenance.

### Public material handles

`materialId` is the ordinary public material handle.

`materialId` is not a resolve input. A caller that already has a `materialId`
should pass it to the consumer tool, such as `stage.recommendation.present`,
`music.material.context.brief`, `music.collection.save`, or
`music.links.refresh`.

## 3. Execution Order

Recommended order:

```text
A. Resolve surface cleanup
B. Delete stage.materials.prepare and unused Material Gate code
C. Public display links for presentation and link refresh
D. Library Import summary/audit compacting
E. Handbook, MCP, guards, state docs, and full verification
```

Each slice should be accepted before moving to the next one.

---

## Slice A - Resolve Surface Cleanup

### Goal

Remove `music.material.resolve.cards` completely and make
`music.material.resolve` the single public resolve tool.

Public resolve turns text queries into compact material items. It does not accept
`materialId`, source refs, canonical refs, raw candidates, or Source Query
objects.

### Non-goals

- Do not change `music.material.query`, `music.material.related`, or
  `music.pools.list` behavior.
- Do not remove Material Query's own use of `MaterialResolvePort` for collection,
  related, or Source Library query semantics.
- Do not add a public material-id-to-item lookup tool in this slice.
- Do not expose source/canonical exact-anchor resolution through the Public Agent
  Protocol.

### Owned bounded context

- Stage Interface owns the public tool schema, payload validation, dispatch
  adapter, and compact output projection.
- Material Resolve owns candidate-to-material resolution.
- Material Query does not own public resolve.

### Allowed read capabilities

- Stage Interface may call `MaterialResolvePort.resolve`.
- Stage Interface should not read Material Store or Source Library directly for
  public resolve.

### Allowed write capabilities

- Stage Interface has no write capability in this slice.
- Existing Material Resolve internals may keep their current materialization
  behavior behind their existing ports.

### Public interface

Input:

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

Output:

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

Validation:

- `queries` must be non-empty.
- `text` must remain non-empty after trimming.
- `kind` must be one of the public enum values.
- Unknown public resolve fields may remain passthrough if the project keeps
  passthrough validation, but the schema must not advertise internal fields.
- Malformed required shape returns `stage_interface.invalid_payload` before
  `MaterialResolvePort.resolve` is called.

### Allowed imports

- `src/stage_interface/tool_definitions/music.ts` may import Stage Interface
  output helpers and `MaterialResolvePort`.
- Stage Interface output helpers may import public/domain output types needed for
  compact projection.
- Material Resolve imports remain owned by the Material Resolve module.

### Forbidden imports

- Do not import Material Query into the public resolve handler.
- Do not import Stage Interface output DTOs into Material Resolve or Material
  Query.
- Do not pass `MaterialQuerySupportPort` to resolve only to preserve old
  `resolveCards` behavior.

### Expected files to change

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `src/stage_interface/tool_definitions/music.ts`
- `src/stage_interface/outputs/material.ts`
- `src/material/query/index.ts`
- `src/stage_core/types.ts`
- `src/stage_interface/dispatch.ts`
- Stage Interface, MCP, Material Query, and contract tests that mention
  `resolve.cards`
- Handbook/SKILL snapshots or generated guidance sources
- Module status docs that describe `music.material.resolve.cards`

### Guards and tests

Add or update:

1. `stableToolNames` does not include `music.material.resolve.cards`.
2. MCP does not expose `minemusic.music.material.resolve.cards`.
3. Handbook does not list `music.material.resolve.cards`.
4. `ToolName` does not include `music.material.resolve.cards`.
5. Public `music.material.resolve` schema exposes `queries`.
6. Public `music.material.resolve` schema does not advertise:
   - `materialId`
   - `sourceRef`
   - `canonicalRef`
   - `sourceLibraryScope`
   - `candidate`
   - `candidates`
   - `SourceQuery`
7. Empty `queries`, empty `text`, and invalid `kind` fail with
   `stage_interface.invalid_payload` before handler dependencies are called.
8. Resolve by `text` returns compact material `items`.
9. Unresolved public text queries appear in `unresolved`.
10. Existing `music.material.query` source-library, collection, all-material, and
    related tests still pass after `resolveCards` deletion.

### Acceptance criteria

1. There is exactly one public resolve tool: `music.material.resolve`.
2. Public resolve input is text-query based.
3. Public resolve output is compact material items.
4. The old `resolveCards` public and support-port path is gone.
5. Material Query behavior is unchanged except for removal of its old support
   method.

---

## Slice B - Delete `stage.materials.prepare` And Material Gate

### Goal

Remove legacy material preparation from the Public Agent Protocol and delete the
Material Gate module if `stage.materials.prepare` is its only production caller.

### Non-goals

- Do not change `stage.recommendation.present` recommendation policy or
  presentation behavior.
- Do not move playable-link exposure policy into a new broad gate.
- Do not redesign Session Context or the remaining Stage Interface tool groups.

### Owned bounded context

- Stage Interface owns removal of the public tool and dispatch surface.
- Stage Core owns removal of runtime composition wiring.
- Stage Modules documentation owns removal of Material Gate as a current Stage
  Module if no production caller remains.

### Allowed read capabilities

- No new read capabilities.

### Allowed write capabilities

- No new write capabilities.

### Public interface

Remove:

```text
stage.materials.prepare
StageMaterialsPrepareInput
MusicMaterial[] output for prepare
```

If there is no producer after deletion, remove the event name:

```text
stage.materials.prepared
```

### Allowed imports

- Remaining Stage Interface stage tools may import only the ports they still use:
  Session Context, Recommendation Presentation, Event Service, and Effect
  Boundary.

### Forbidden imports

- Do not keep `MaterialGatePort` in Stage Interface or Stage Core composition when
  no production caller remains.
- Do not keep `createMaterialGate` as a dead Stage Module.

### Expected files to change

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `src/stage/index.ts`
- `src/stage_core/compose.ts`
- `src/stage_core/types.ts`
- `src/stage_interface/dispatch.ts`
- `src/stage_interface/tool_definitions/stage.ts`
- Stage module tests
- Stage Interface dispatch tests
- MCP and server MCP tests
- Contract tests
- `CONTEXT.md`
- `docs/adr/0001-stage-core-runtime-composition.md`
- root/module state docs that list Material Gate or `stage.materials.prepare`

### Guards and tests

Add or update:

1. `stableToolNames` does not include `stage.materials.prepare`.
2. MCP does not expose `minemusic.stage.materials.prepare`.
3. Handbook does not list `stage.materials.prepare`.
4. `ToolName` does not include `stage.materials.prepare`.
5. Production `src/**` has no `MaterialGatePort`, `createMaterialGate`,
   `materialGate`, or `prepareMaterials` references after deletion.
6. `stage.recommendation.present` tests still pass.

### Acceptance criteria

1. Ordinary agents cannot call `stage.materials.prepare`.
2. Material Gate is gone if it has no other production caller.
3. Stage Core composition and Stage Interface dispatch no longer receive
   Material Gate.
4. Documentation no longer describes Material Gate as a current Stage Module.

---

## Slice C - Public Display Links

### Goal

Use `PublicDisplayLink` for public display links returned by recommendation
presentation and link refresh.

`stage.recommendation.present` remains the recommendation presentation boundary.
`music.links.refresh` may return repaired display links for the requested
material, but does not record a presentation or feedback-binding event.

### Non-goals

- Do not change persisted `recommendation.presented` internal `linkRefs`
  behavior.
- Do not change Recommendation Presentation selection, min/max, or event-recording
  policy.
- Do not turn `music.links.refresh` into a recommendation presentation.

### Owned bounded context

- Stage Interface owns public link output projection.
- Source Grounding owns link refresh and source-backed link persistence.
- Recommendation Presentation owns typed recommendation presentation events.

### Allowed read capabilities

- `music.links.refresh` may read a material by `materialId` through the existing
  Stage Interface material projection read capability.
- `music.links.refresh` may call `SourceGroundingPort.refreshPlayableLinks`.

### Allowed write capabilities

- Source Grounding may persist refreshed source evidence through its existing
  writer capability.
- Stage Interface must not record a presentation event for `music.links.refresh`.

### Public interfaces

Shared display link:

```ts
type PublicDisplayLink = {
  label?: string;
  url: string;
};
```

Link refresh output:

```ts
type MusicLinksRefreshOutput = {
  materialId: string;
  status: "refreshed" | "not_available";
  links?: PublicDisplayLink[];
  message?: string;
};
```

Presentation card links:

```ts
links?: PublicDisplayLink[];
```

Status mapping:

- Successful `SourceGroundingPort.refreshPlayableLinks` with display links returns
  `status: "refreshed"` and `links`.
- `source.no_playable_link` returns `status: "not_available"` and no links.
- Material-not-found, provider, storage, and other infrastructure failures remain
  `Result` errors.

### Allowed imports

- Stage Interface music tool definitions may import `SourceGroundingPort` and
  Stage Interface output helpers.
- Stage Interface output modules may import the domain presentation output type
  needed for projection.

### Forbidden imports

- Do not expose `MusicMaterial`, `PlayableLink`, `sourceRef`, `sourceRefs`,
  `materialRef`, or `playableLinks` in public display-link output.
- Do not make `music.links.refresh` depend on Event Service.
- Do not make Source Grounding import Stage Interface output DTOs.

### Expected files to change

- `src/contracts/index.ts`
- `src/stage_interface/tool_definitions/music.ts`
- `src/stage_interface/outputs/recommendation.ts`
- Stage Interface output tests
- Stage Interface dispatch tests
- MCP schema tests
- Source/refresh behavior tests if needed for status mapping
- Handbook/SKILL guidance
- Module status docs that describe link refresh output

### Guards and tests

Add or update:

1. `stage.recommendation.present` returned links include only `label?` and `url`.
2. `stage.recommendation.present` returned links do not expose:
   - `sourceHandle`
   - `sourceRef`
   - `sourceRefs`
   - `playableLinks`
3. `music.links.refresh` schema accepts `materialId`.
4. `music.links.refresh` output exposes `status` and optional `links`.
5. `music.links.refresh` output links include only `label?` and `url`.
6. `music.links.refresh` output does not expose:
   - raw `MusicMaterial`
   - `materialRef`
   - `sourceRef`
   - `sourceRefs`
   - `playableLinks`
7. `source.no_playable_link` maps to `status: "not_available"`.
8. Non-availability infrastructure errors remain `Result` errors.

### Acceptance criteria

1. Public display-link shape is shared by presentation and link refresh.
2. `sourceHandle` is gone from public presentation links.
3. `music.links.refresh` can return display links without exposing internal source
   objects.
4. Link refresh does not create a recommendation presentation event.

---

## Slice D - Library Import Summary And Audit Split

### Goal

Make `library.import.summary` a compact management summary while preserving
item-level import provenance in `library.import.items.list`.

### Non-goals

- Do not rename provider/internal/storage `area` concepts where provider area is
  the precise domain term.
- Do not make Library Import a material browsing surface.
- Do not change import/update execution behavior.
- Do not change Source Library browsing; material browsing remains
  `music.pools.list -> music.material.query`.

### Owned bounded context

- Source Entity Store / Library Import owns import reports, provider-area reads,
  item provenance, snapshots, and absences.
- Stage Interface owns public compact summary projection and public tool guidance.

### Allowed read capabilities

- Stage Interface may call `LibraryImportPort.getSummary`.
- Stage Interface may call `LibraryImportPort.listItems`.

### Allowed write capabilities

- No new write capabilities.

### Public interfaces

Summary:

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

Item audit:

```ts
type LibraryImportItemReport = {
  scope: LibraryImportScope;
  providerArea?: PlatformLibraryArea;
  sourceRef: Ref;
  itemKind: PlatformLibraryItemKind;
  sourceEntityKind: SourceEntityKind;
  label: string;
  status: LibraryImportItemStatus;
  failureCode?: string;
  retryable?: boolean;
};
```

### Allowed imports

- Stage Interface library tool definitions may import Library Import output
  projection helpers.
- Stage Interface output projection may import public Library Import contract
  types.

### Forbidden imports

- Do not expose `sourceRef` in `library.import.summary`.
- Do not use `library.import.items.list.sourceRef` as a material handle in
  Handbook/SKILL guidance.
- Do not make material browsing depend on Library Import item reports.

### Expected files to change

- `src/contracts/index.ts`
- `src/stage_interface/outputs.ts`
- `src/stage_interface/tool_definitions/library.ts` if schema refs/descriptions
  need updates
- Contract tests
- Library Import service tests
- Stage Interface dispatch tests
- MCP schema tests
- Handbook/SKILL guidance
- Library Import and Stage Interface status docs

### Guards and tests

Add or update:

1. `library.import.summary` output has top-level `scopeReports`.
2. `scopeReports[]` uses `scope` and optional `providerArea`.
3. `library.import.summary` output has no top-level `areas`.
4. `library.import.summary.absentItems[]` has no `sourceRef`.
5. `library.import.items.list` may expose `sourceRef`.
6. Handbook/SKILL says `items.list.sourceRef` is provenance evidence only.

### Acceptance criteria

1. Summary output is compact management output.
2. Item-level audit output preserves provenance.
3. The difference is documented and tested.

---

## Slice E - Handbook, MCP, Guards, State Docs, And Verification

### Goal

Make all public guidance and generated/adapter surfaces match the normalized
protocol from slices A-D.

### Non-goals

- Do not add new product capabilities.
- Do not broaden the cleanup into placeholder or future tools.
- Do not update unrelated historical design documents unless they are presented
  as current guidance.

### Owned bounded context

- Stage Interface owns Tool Definitions, descriptors, input schemas, compact
  output projection, and Handbook source data.
- MCP remains an adapter over Stage Interface definitions.
- Module-local progress/status docs own current implementation state.

### Allowed read capabilities

- No runtime capability changes.

### Allowed write capabilities

- No runtime capability changes.

### Expected files to change

- `src/stage_interface/tool_definitions/**`
- `src/stage_interface/outputs*.ts`
- `src/server/**` only if MCP adapter expectations need schema fixture updates
- `src/handbook/**`
- `test/stage_interface/**`
- `test/surfaces/**`
- `test/server/**`
- `test/contracts/**`
- `docs/stage-interface/progress.md`
- module-local status docs for changed modules
- root routing/status docs only where they summarize current state

### Guards and tests

Run or update focused checks:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/stage_interface/stage-interface-outputs.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
```

Run broader checks before the slice is complete:

```bash
npm test
git diff --check
git diff --name-only
```

### State sync gate

Before final completion, record the state-sync answer:

- `INDEX.md`: updated, or not needed with a concrete reason.
- `CURRENT_STATE.md`: updated, or not needed with a concrete reason.
- `ARCHITECTURE.md`: updated, or not needed with a concrete reason.
- `PROGRESS.md`: updated, or not needed with a concrete reason.
- Module-local progress/status docs: updated, or not needed with a concrete
  reason.

### Final acceptance criteria

This follow-up is complete when:

1. `music.material.resolve.cards` is gone.
2. Public `music.material.resolve` uses text `queries` and returns compact
   `items`.
3. `stage.materials.prepare` is gone.
4. Material Gate is gone if it has no other production caller.
5. Public presentation links use `PublicDisplayLink`.
6. `sourceHandle` is gone from presentation output.
7. `music.links.refresh` returns `MusicLinksRefreshOutput` with optional
   `PublicDisplayLink[]`.
8. `library.import.summary` uses `scopeReports` and compact `absentItems`.
9. `library.import.items.list` can expose `sourceRef` only as item-level
   provenance evidence.
10. Handbook/SKILL and MCP schemas match the normalized protocol.
11. Guard tests prevent the old public language from returning.
