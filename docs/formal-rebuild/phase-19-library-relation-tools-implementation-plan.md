# Phase 19 Library Relation Tools Implementation Plan

> Status: Phase 19 spec and execution plan; implemented in the current tree.
> Spec authority: this document plus CONTEXT.md (`Library Relation Tools`),
> `docs/formal-project-glossary.md` (`library.relation.*` and
> `owner_material_relations`), ARCHITECTURE.md (Owner Facts And Collections),
> ADR-0008 (command-owned write boundaries), ADR-0014 (model-visible tool
> guidance is mandatory), ADR-0015 (side-effect and invocation policy are
> separate), ADR-0017 (router owns toolName), ADR-0019 (Public Handle Veil
> ownership split), ADR-0020 (declared error vocabulary), and ADR-0023 for
> owner-relation auto-pass.
> Owning bounded contexts: Music Data Platform (`library.relation.*`
> stage_adapter, owner-relation command orchestration, current relation state
> read), Effect Boundary (owner-relation auto-pass qualifier), Stage Interface
> (tool descriptors, schemas, declared errors, output veil), Server Host
> (composition shim only).

## Goal

Sanction Phase 19 as the **library relation tools** phase. Phase 17 lets a
single candidate become a durable library item through presentation. Phase 18
lets an agent import bulk source-library facts. Phase 19 exposes the existing
Music Data Platform owner-relation fact family as explicit Public Agent
Protocol tools so an agent can read, save, unsave, favorite, unfavorite, block,
and unblock one durable library item.

```text
PR 19A: contract/docs skeleton for `library.relation.*` explicit tools
PR 19B: Effect Boundary owner-relation auto-pass qualifier + ADR-0023
PR 19C: Music Data Platform relation edit stage_adapter + unit/formal tests
PR 19D: Server Host wiring + agent-path tests + docs/state sync
```

The public relation path after Phase 19:

```text
library.relation.get({ item: library handle })
  -> HandleMintingPort.resolve(library) -> internal materialRef
  -> relation read port:
       read current active saved/favorite/blocked state for that material
  -> output { relations: { saved, favorite, blocked } }

library.relation.save({ item: library handle })
  -> HandleMintingPort.resolve(library) -> internal materialRef
  -> relation read/edit port:
       save/favorite: clear blocked, record requested positive relation
       block: clear saved/favorite, record blocked
       unsave/unfavorite/unblock: remove requested relation if present
       read current active saved/favorite/blocked state for that material
  -> output { relations: { saved, favorite, blocked } }

library.relation.favorite({ item: library handle })
  -> same path, with favorite independent from saved

library.relation.block({ item: library handle })
  -> same path, with blocked mutually exclusive with saved/favorite
```

The output reports the current relation state at read time or after the edit.
It does not echo the input item handle and does not expose internal relation
records.

## Decisions Already Settled

- Ship explicit tools, not a generic `library.relation.set` API:
  `library.relation.get`, `library.relation.save`, `library.relation.unsave`,
  `library.relation.favorite`, `library.relation.unfavorite`,
  `library.relation.block`, and `library.relation.unblock`.
- The tools accept only durable `library` `MusicItemHandle`s. Candidate handles
  must first be admitted through `music.experience.present`.
- Add a dedicated Effect Boundary qualifier:
  `ownerRelationDrivenByUserRequest?: boolean`. Do not reuse
  `intakeDrivenByUserRequest`. The qualifier applies only to edit tools, not
  to `library.relation.get`.
- `library.relation.get` is read-only:

```ts
sideEffect: {
  durableUserStateWrite: false,
  runtimeStateWrite: false,
  externalCall: false,
},
invocationPolicy: {
  defaultDecision: "auto",
  dataEgress: "none",
  readOnlyHint: true,
  destructiveHint: false,
}
```

- Relation edits are durable user-state writes, external-call-free, and not
  destructive:

```ts
sideEffect: {
  durableUserStateWrite: true,
  runtimeStateWrite: false,
  externalCall: false,
},
invocationPolicy: {
  defaultDecision: "auto",
  dataEgress: "none",
  readOnlyHint: false,
  destructiveHint: false,
  ownerRelationDrivenByUserRequest: true,
}
```

- All relation tools return the same compact current state:

```ts
type LibraryRelationStateOutput = {
  relations: {
    saved: boolean;
    favorite: boolean;
    blocked: boolean;
  };
};
```

- `blocked` is mutually exclusive with positive owner relations:
  - `block` clears `saved` and `favorite`, then sets `blocked`.
  - `save` clears `blocked`, then sets `saved`.
  - `favorite` clears `blocked`, then sets `favorite`.
- `saved` and `favorite` are independent positive relations:
  `favorite` does not imply `saved`, and `save` does not imply `favorite`.
- `unsave`, `unfavorite`, and `unblock` are idempotent at the Public Agent
  Protocol boundary. Removing an already-absent relation succeeds and returns
  the unchanged current relation state.
- The edit tools' public declared error vocabulary is:
  `invalid_input`, `item_not_found`, `item_not_writable`,
  `owner_scope_unsupported`.
- `library.relation.get` declares `invalid_input`, `item_not_found`, and
  `owner_scope_unsupported`; it does not declare `item_not_writable` because it
  does not write.

## Non-Goals

- Do not expose a generic relation setter.
- Do not expose relation notes, reasons, feedback text, Memory preference
  updates, or Collection-local notes. Phase 19 edits relation facts only.
- Do not call provider-side save/like/block APIs. These tools mutate MineMusic
  owner relations only.
- Do not admit candidates. Candidate admission remains
  `music.experience.present`.
- Do not expose `relationRef`, `relationRefKey`, `ownerScope`, `materialRef`,
  `origin`, `status`, timestamps, projection rows, or storage shape.
- Do not create a `blocked` relation scope. Existing scope availability exposes
  active `saved` and `favorite` positive relation pools only; `blocked` remains
  a catalog-visibility exclusion fact.
- Do not implement Collection writes, Library Update baselines, feedback/
  correction facts, Memory, or provider account runtime behavior.
- Do not implement the full Effect Boundary ask/approval loop. Phase 19 only
  adds the owner-relation auto-pass qualifier to the conservative gate stub.

## Ownership And Boundaries

Music Data Platform owns:

- the `library.relation.*` stage_adapter descriptors and handler factories;
- a narrow relation-edit port over existing owner-relation command/read
  behavior;
- orchestration that preserves public semantics: relation mutual exclusion,
  idempotent removals, and final relation-state read;
- translation from MDP errors to the tool's declared public errors.

Effect Boundary owns:

- the `ownerRelationDrivenByUserRequest` qualifier and audit reason, recorded in
  ADR-0023;
- conservative gate behavior:
  `defaultDecision="auto"`, `durableUserStateWrite=true`, and
  `ownerRelationDrivenByUserRequest=true` allow with metadata audit.

Stage Interface owns:

- `LibraryRelationItemInput` and `LibraryRelationStateOutput` Public Agent
  Protocol types;
- schema generation and validation;
- declared error enforcement and output veil checks;
- the rule that handlers return payloads only and the Tool Call Router wraps
  `toolName`.

Server Host owns:

- composition only: wire the relation read/edit ports from Music Data Platform
  into the MDP stage_adapter runtime module. It must not own relation semantics.

Imports forbidden:

- MDP core relation commands/read records must not import Stage Interface
  contracts.
- Stage adapters must not construct repositories or write projection rows
  directly.
- Server Host must not encode relation mutual-exclusion semantics.
- Music Intelligence and Music Experience must not write owner-relation facts
  directly.

## Public Contract

### Instrument

Use one instrument:

```text
library.relation
```

Owner area: `music_data_platform`.

### Input

All seven tools use the same input:

```ts
type LibraryRelationItemInput = {
  item: Extract<MusicItemHandle, { kind: "library" }>;
};
```

The schema rejects `candidate` handles. A candidate path should recover by
calling `music.experience.present` first, then retrying with the returned
library handle.

### Output

All seven tools use the same output:

```ts
type LibraryRelationStateOutput = {
  relations: {
    saved: boolean;
    favorite: boolean;
    blocked: boolean;
  };
};
```

`library.relation.get` reports current state at read time. Edit tools report
current state after the edit. The output intentionally does not include the
input item, public relation scope handles, internal refs, internal record
fields, or timestamps. If the agent needs a relation scope, it should call
`music.discovery.list_scopes`.

### Declared Errors

All seven tools declare:

| Public code | Meaning | Suggested recovery |
| --- | --- | --- |
| `invalid_input` | Input is not a valid library item handle, including candidate-handle input. | Present candidate items first with `music.experience.present`, then retry with the returned library handle. |
| `item_not_found` | The library handle cannot be resolved or the backing material is missing. | Retry with a current library handle or run lookup/present again. |
| `owner_scope_unsupported` | Workflow-facing relation operations currently support only the local owner scope. | Retry from the supported local owner scope. |

Edit tools also declare:

| Public code | Meaning | Suggested recovery |
| --- | --- | --- |
| `item_not_writable` | The material exists but cannot receive owner relation edits. | Retry with an active library item. |

`owner_material_relation_not_found` is not public. Removal tools are idempotent
and should read current state first; missing relation state is a successful
unchanged result.

## Edit Semantics

```text
save:
  remove blocked if active
  record saved(user_explicit)
  keep favorite as-is

unsave:
  remove saved if active
  keep favorite and blocked as-is

favorite:
  remove blocked if active
  record favorite(user_explicit)
  keep saved as-is

unfavorite:
  remove favorite if active
  keep saved and blocked as-is

block:
  remove saved if active
  remove favorite if active
  record blocked(user_explicit)

unblock:
  remove blocked if active
  keep saved and favorite as-is
```

All tools then read current active relations for the item and return the
boolean state.

## PR 19A: Contract And Stage Adapter Skeleton

> Depends on: Phase 18 implemented.
> Shippable standalone: yes, descriptor tests only; no server-exposed behavior
> until PR 19C/19D.

### Goal

Land the public contract shell and static descriptors without relation write
behavior.

### What lands

- `src/contracts/stage_interface.ts`:
  - `LibraryRelationItemInput`;
  - `LibraryRelationStateOutput`;
  - output relation-state type if useful for reuse.
- Generated schemas for relation edit input/output.
- `src/music_data_platform/stage_adapter/relation_edit.ts`:
  - `libraryRelationInstrument`;
  - seven descriptors with `usage`, examples, side-effect/invocation policy, and
    declared errors;
  - handler factories may throw if wired before PR 19C or use test-local stub
    ports only.
- `src/music_data_platform/stage_adapter/index.ts` exports relation edit
  registration helpers.

### Tests

- Descriptor tests for all seven tool names and shared instrument.
- Schema tests rejecting candidate handles and unknown fields.
- Output-schema veil test for relation-state-only output.
- Active-tree guard update allowing the new MDP stage_adapter file.

## PR 19B: Effect Boundary Owner-Relation Auto-Pass

> Depends on: PR 19A or independent contract change.
> Shippable standalone: yes.

### Goal

Add the narrow durable-write auto-pass qualifier for explicit user-driven owner
relation edits.

### What lands

- ADR-0023: Effect Boundary auto-pass for owner-relation edits.
- `src/contracts/stage_interface.ts`:
  - `ToolInvocationPolicy.ownerRelationDrivenByUserRequest?: boolean`.
- `src/effect_boundary/stage_tool_execution_gate.ts`:
  - allow when default decision is auto, durable user state write is true, and
    owner-relation qualifier is true;
  - audit metadata internal reason:
    `auto owner-scoped relation edit`.
- `docs/formal-rebuild/stage-interface-tool-frame.md` updates the interim
  conservative gate rule.

### Tests

- Qualified owner-relation durable write auto-passes with audit.
- Same durable write without qualifier routes to `ask`.
- Presentation and intake qualifiers keep their existing behavior.
- `deny` still denies.

## PR 19C: MDP Relation Read/Edit Port And Public Semantics

> Depends on: PR 19A and PR 19B.
> Shippable standalone: yes, through direct Stage Interface tests.

### Goal

Implement relation edit semantics through the owning Music Data Platform
write/read boundary.

### What lands

- A narrow relation read/edit port in the MDP stage_adapter boundary. It may be a
  small adapter over:
  - `createMusicDataPlatformSourceOfTruthWriteCommands(...).ownerRelations`;
  - `createOwnerMaterialRelationRecords({ db })` for current-state reads;
  - existing material validation via the owner-relation commands.
- Handler logic:
  - resolve public library handle to material ref through `HandleMintingPort`;
  - for `get`, read current active saved/favorite/blocked state only;
  - perform the requested edit semantics;
  - read final active saved/favorite/blocked state;
  - return `LibraryRelationStateOutput`.
- Public error translation:
  - schema/router failures remain `stage_interface.invalid_input`;
  - bad handle shape or candidate handle is `invalid_input`;
  - missing library handle/material is `item_not_found`;
  - non-active material is `item_not_writable`;
  - unsupported owner scope is `owner_scope_unsupported`.

### Tests

- Each tool returns final relation state.
- Save/favorite clear blocked.
- Block clears saved/favorite.
- Favorite does not imply saved; save does not imply favorite.
- Unsave/unfavorite/unblock are idempotent when relation is already absent.
- Output does not include input item, internal refs, status, origin, timestamps,
  owner scope, or projection rows.
- Candidate input is rejected with public recovery guidance.
- Missing library handle and non-active material map to declared errors.
- Undeclared MDP errors fail through the Stage Interface declared-error guard.

## PR 19D: Server Host Wiring And State Sync

> Depends on: PR 19C.
> Shippable standalone: yes, end-to-end through default host dispatch.

### Goal

Expose `library.relation.*` in the default Server Host composition and sync
current authority docs.

### What lands

- Server Host MDP runtime module wires relation read/edit ports into the
  `library.relation` runtime module contribution.
- Default Host tool list includes all seven relation tools alongside
  `library.import.*`, `music.discovery.*`, `music.experience.present`, and
  `stage.runtime.status`.
- Agent-path test:
  - lookup/present or direct minted library handle -> save/favorite/block paths;
  - final relation state visible through owner relation reads and catalog
    visibility where applicable;
  - `music.discovery.list_scopes` remains the source for public relation scopes.
- Docs/state sync:
  - `ARCHITECTURE.md`;
  - `CURRENT_STATE.md`;
  - `INDEX.md`;
  - `PROGRESS.md`;
  - `docs/formal-rebuild/README.md`;
  - `docs/music-data-platform/design.md`;
  - `docs/music-data-platform/ports.md`;
  - `docs/music-data-platform/progress.md`.

## Guard Plan

- Forbidden-import/active-tree guard:
  - MDP core relation command/read modules do not import Stage Interface;
  - Server Host does not own relation semantics;
  - Music Intelligence/Music Experience do not write owner relations.
- Descriptor guard:
  - all seven tools declare model-visible guidance, side effects, invocation
    policy, schemas, and public errors.
- Output leak guard:
  - relation edit outputs contain only the boolean relation state.
- Write-boundary guard:
  - relation writes flow through MDP source-of-truth/owner-relation command
    boundary, not direct repository writes from handlers or Server Host.
- Effect Boundary guard:
  - durable relation writes auto-pass only with the owner-relation qualifier.

## Verification

Run narrow checks first, then broaden:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```

If PR 19D changes default Server Host composition, also run:

```bash
npm run server:minemusic
```

No live provider smoke is required: relation edits are local MineMusic owner
facts and do not call provider APIs.

## Acceptance Criteria

Phase 19 is complete when:

- all seven `library.relation.*` tools are exposed by the default Server Host;
- each tool accepts only durable library item handles;
- `library.relation.get` returns the current saved/favorite/blocked boolean
  state without writing;
- each edit tool returns the current saved/favorite/blocked boolean state after
  the edit;
- block/save/favorite mutual-exclusion rules are enforced;
- saved/favorite independence is enforced;
- removal tools are idempotent for already-absent relations;
- public errors are declared and no internal MDP error codes leak;
- owner-relation writes go through the MDP command boundary;
- docs/state ledgers reflect the implemented phase.

## Implementation Result

Phase 19 is implemented by:

- `LibraryRelationItemInput` and `LibraryRelationStateOutput` in
  `src/contracts/stage_interface.ts`, with generated schemas;
- `ownerRelationDrivenByUserRequest` in `ToolInvocationPolicy` and the
  conservative Effect Boundary gate audit reason
  `auto owner-scoped relation edit`;
- `createLibraryRelationService(...)` in Music Data Platform, which reads
  current saved/favorite/blocked state and applies save/favorite/block/remove
  semantics through source-of-truth owner-relation commands;
- `src/music_data_platform/stage_adapter/relation_edit.ts`, which declares and
  registers all seven `library.relation.*` tools, resolves durable library
  handles, translates MDP errors to public declared errors, and returns only
  `{ relations }`;
- `src/server/library_relation_runtime_module.ts` and default Host wiring,
  exposing the tools through the default runtime.

Verification is covered by formal contract tests, Effect Boundary gate tests,
`library-relation-control`, `library-relation-agent-path`, Server Host/
entrypoint tool-list tests, active-tree guards, and `npm run test:stage-core`.

## Stopping Condition

Stop after Phase 19D when the default Server Host exposes and dispatches all
seven relation tools, the relation-state output and public error vocabulary are
guarded by tests, docs/state sync is complete, and the verification set above
passes.
