# Issue 115 Effect Boundary ADR-0038 Gate Contract Implementation Plan

> Status: Planned implementation
> Scope: GitHub issue #115; ADR-0038 follow-up from ADR-0040 / PR #114
> Task class: contract/workflow/runtime
> Authority: ADR-0038 owns the policy decision. This plan sequences the code
> migration and does not replace ADR-0038, ADR-0040, root architecture docs, or
> source contracts after implementation lands.

## Goal

Migrate the Effect Boundary gate contract from the current coarse durable-write
plus per-scenario auto-pass booleans to ADR-0038's two-dimensional policy:

```text
tool impact class x actor trust basis -> allow | ask | raise-to-conversation
```

The migration lands the `ownerCurationWrite` marker so tools can distinguish
"writes durable material identity" from "changes the user's library curation."
After the slice:

- `music.experience.present` still declares `durableUserStateWrite: true`.
- `music.experience.present` declares `ownerCurationWrite: false`.
- owner library curation writes declare `ownerCurationWrite: true`.
- the gate no longer ORs one-off policy booleans such as
  `admissionDrivenByPresentation`, `intakeDrivenByUserRequest`,
  `ownerRelationDrivenByUserRequest`, or `collectionDrivenByUserRequest`.
- the "ask before source-of-truth edits" setting exists as a tightening input to
  the Effect Boundary gate and is testable with default `false`.

## Non-Goals

- Do not implement Proposal Unit persistence, resume, expiry, or OCC-on-resume.
- Do not implement the Confirm card or AG-UI Web projection.
- Do not build a durable user settings store or UI for the tightening setting.
- Do not change `present` handler behavior or candidate commit semantics.
- Do not change Music Data Platform relation, collection, or import command
  behavior.
- Do not add model-supplied trust parameters to tool schemas.
- Do not broaden provider-side external writes or invent new high-impact tools.

## Owning Contexts

- Stage Interface owns tool descriptor contract shape, preflight input/result
  types, dispatch integration, and public error normalization.
- Effect Boundary owns gate policy, audit records, decision reasons, and the
  policy table.
- Server Host / Stage context assembly owns current default runtime values for
  gate provenance until Agent Runtime exists.
- Music Experience and Music Data Platform own their descriptor declarations
  only; their domain write behavior is not in scope.

## Required Reads

- `AGENTS.md`
- `docs/agents/task-classes.md`
- `docs/adr/0038-effect-boundary-ask-policy-impact-class-by-actor-trust.md`
- `docs/adr/0040-item-handle-currency-is-material-retire-library-item-kind.md`
- `docs/formal-rebuild/stage-interface-tool-frame.md`
- `docs/formal-rebuild/phase-C-web-boundary-spec.md`
- `src/contracts/stage_interface.ts`
- `src/effect_boundary/stage_tool_execution_gate.ts`
- existing descriptor files under:
  - `src/music_experience/stage_adapter/`
  - `src/music_data_platform/stage_adapter/`
  - `src/music_intelligence/stage_adapter/`
  - `src/stage_core/runtime_status.ts`
- existing formal tests for Stage Interface, Effect Boundary, present, import,
  relation, collection, and context factory behavior.

Stop reading once the descriptor set, gate inputs, and public error surface are
clear.

## Allowed Writes

- `src/contracts/stage_interface.ts`
- `src/effect_boundary/stage_tool_execution_gate.ts`
- `src/stage_interface/context.ts`
- `src/stage_interface/tool_context_factory.ts`
- `src/server/stage_tool_context_assembly.ts`
- descriptor declarations that need the new contract fields.
- formal tests that pin the contract and gate behavior.
- generated Stage Interface schemas if the generator reports drift.
- docs that describe the current Stage Interface / Effect Boundary contract.
- root state docs only if state sync shows they need update.

## Forbidden Writes And Imports

- Do not import Stage Interface, presentation, runtime assembly, or tool schema
  modules into domain services.
- Do not make ordinary domain modules depend on the Effect Boundary.
- Do not let the model provide `actorTrustBasis`, user-setting values, or policy
  overrides through tool input schemas.
- Do not inspect tool names inside the gate to infer policy. Tool meaning belongs
  in descriptor declarations.
- Do not add catch-all fallback behavior for gate decisions.
- Do not turn gate failures into empty success results.
- Do not add compatibility branches for old descriptor booleans after migration.
- Do not build Proposal Unit storage in this slice.

## Contract Shape

Add policy vocabulary:

```ts
export type ToolImpactClass =
  | "read"
  | "local-bounded"
  | "external-or-irreversible";

export type ActorTrustBasis =
  | "user-intent-backed"
  | "autonomous-within-grant";
```

Change `ToolSideEffect`:

```ts
export type ToolSideEffect = {
  durableUserStateWrite: boolean;
  ownerCurationWrite: boolean;
  runtimeStateWrite: boolean;
  externalCall: boolean;
};
```

Change `ToolInvocationPolicy`:

```ts
export type ToolInvocationPolicy = {
  defaultDecision: "auto" | "ask" | "deny";
  impactClass: ToolImpactClass;
  dataEgress: "none" | "provider_account" | "open_world";
  readOnlyHint: boolean;
  destructiveHint: boolean;
  maxCallsPerTurn?: number;
};
```

Remove the old scenario booleans from `ToolInvocationPolicy`:

- `admissionDrivenByPresentation`
- `intakeDrivenByUserRequest`
- `ownerRelationDrivenByUserRequest`
- `collectionDrivenByUserRequest`

Extend `StageToolExecutionGatePreflightInput` with boundary-derived inputs:

```ts
actorTrustBasis: ActorTrustBasis;
askBeforeSourceOfTruthEdits: boolean;
```

Extend the gate result decision set:

```ts
decision: "allow" | "ask" | "raise-to-conversation" | "deny";
```

If Stage Interface dispatch cannot yet materialize a Proposal Unit for
`raise-to-conversation`, it should treat the result as non-allow and return a
public gate-required error without leaking internal policy detail. The Effect
Boundary unit test should still assert the distinct decision.

## Gate Algorithm

The gate must be table-driven and name the boundary owner in audit reasons.

1. If `defaultDecision === "deny"`, return `deny`.
2. If `defaultDecision === "ask"`, return `ask`.
3. If `defaultDecision === "auto"`, derive the ADR-0038 table decision:

| impact class | user-intent-backed | autonomous-within-grant |
| --- | --- | --- |
| `read` | `allow` | `allow` |
| `local-bounded` | `allow` | `allow` |
| `external-or-irreversible` | `ask` | `raise-to-conversation` |

4. Apply the tightening setting before returning an `allow`:

```text
if decision == allow
and impactClass == local-bounded
and actorTrustBasis == user-intent-backed
and askBeforeSourceOfTruthEdits == true
and sideEffect.ownerCurationWrite == true
then ask
```

The setting only tightens. It must never turn `ask` or `raise-to-conversation`
into `allow`.

## Runtime Defaults

Until Agent Runtime provenance exists:

- current MCP / Server Host tool contexts provide
  `actorTrustBasis: "user-intent-backed"`;
- current MCP / Server Host tool contexts provide
  `askBeforeSourceOfTruthEdits: false`.

Future Radio integration must supply `autonomous-within-grant` from
Agent-Runtime-owned provenance. This value is never model-reported.

## Descriptor Assignment

### Read Tools

These tools declare `impactClass: "read"` and `ownerCurationWrite: false`:

- `stage.runtime.status`
- `music.discovery.list_scopes`
- `music.discovery.lookup`
- `library.import.list_sources`
- `library.import.status`
- `library.catalog.list_scopes`
- `library.catalog.browse`
- `library.catalog.sample`
- `library.catalog.summary`
- `library.relation.get`
- `library.collection.get`

### Local Bounded Non-Curation Write

This tool declares `impactClass: "local-bounded"` and
`ownerCurationWrite: false`:

- `music.experience.present`

It keeps `durableUserStateWrite: true` because candidate presentation can commit
durable material identity. The marker is false because it does not change saved,
favorite, blocked, collection, or imported library curation state.

### Local Bounded Curation Writes

These tools declare `impactClass: "local-bounded"` and
`ownerCurationWrite: true`:

- `library.import.start`
- `library.relation.save`
- `library.relation.unsave`
- `library.relation.favorite`
- `library.relation.unfavorite`
- `library.relation.block`
- `library.relation.unblock`
- `library.collection.create`
- `library.collection.rename`
- `library.collection.add`
- `library.collection.remove`
- `library.collection.move`
- `library.collection.delete`

No shipped tool should declare `impactClass: "external-or-irreversible"` in this
slice unless code inspection finds an already-shipped provider-side or
irreversible effect. Use test fixtures to cover that table band.

## Implementation Sequence

### Step 1: Contract vocabulary

- Add `ToolImpactClass` and `ActorTrustBasis`.
- Add `ownerCurationWrite` to `ToolSideEffect`.
- Add `impactClass` to `ToolInvocationPolicy`.
- Remove the old per-scenario boolean fields.
- Extend gate preflight input with `actorTrustBasis` and
  `askBeforeSourceOfTruthEdits`.
- Extend gate result decisions with `raise-to-conversation`.
- Update type-level contract tests.

### Step 2: Runtime defaults

- Thread `actorTrustBasis` and `askBeforeSourceOfTruthEdits` through
  `createStageToolContext`, `createStageToolContextFactory`, and Server Host
  context assembly.
- Default to `user-intent-backed` and `false`.
- Keep the values owned by context assembly / runtime input, not tool payload.
- Update context-factory tests.

### Step 3: Gate policy

- Rewrite `decide()` in `stage_tool_execution_gate.ts` around the ADR-0038
  table.
- Preserve deny as a pre-gate.
- Preserve declared `defaultDecision: "ask"`.
- Add audit reasons for:
  - table allow;
  - table ask;
  - table raise-to-conversation;
  - tightening setting upgrade.
- Remove all checks of old per-scenario booleans.

### Step 4: Descriptor migration

- Update every shipped descriptor with `ownerCurationWrite` and `impactClass`.
- Remove old scenario booleans from descriptors.
- Keep existing `durableUserStateWrite` truth unchanged unless a descriptor is
  already factually wrong for another reason. This issue does not flip
  `present` to `false`.
- Keep read-only hints and data-egress declarations intact.

### Step 5: Tests and guards

- Replace old auto-pass tests with table tests.
- Add toggle tests for curation vs non-curation writes.
- Add descriptor tests for the curation marker and impact class.
- Add exact key-set assertions so the old boolean fields cannot quietly return.
- Keep public error veil tests for gate failures.

### Step 6: Docs and state sync

- Update `docs/formal-rebuild/stage-interface-tool-frame.md` so the current tool
  frame no longer documents the old one-off booleans as the active mechanism.
- Update root state docs only where the current-state wording changes.
- Run `git diff --name-only` and report whether each root state doc was updated
  or not needed:
  - `INDEX.md`
  - `CURRENT_STATE.md`
  - `ARCHITECTURE.md`
  - `PROGRESS.md`

## Guard And Test Plan

Required guards:

- Type key-set guard for `ToolSideEffect`.
- Type key-set guard for `ToolInvocationPolicy`.
- Gate table tests for all six ADR-0038 cells.
- Toggle tests:
  - curation local-bounded write + toggle off -> allow;
  - curation local-bounded write + toggle on -> ask;
  - `present` shape + toggle on -> allow;
  - read tool + toggle on -> allow.
- Descriptor assertions:
  - `present`: durable write true, owner curation false, local-bounded;
  - relation edits: owner curation true, local-bounded;
  - collection edits: owner curation true, local-bounded;
  - import start: owner curation true, local-bounded;
  - read tools: owner curation false, read.
- Dispatch compatibility tests proving current shipped happy paths still pass
  with runtime defaults.
- Public-veil tests proving gate public errors do not leak internal anchors or
  policy internals.

## Verification

Run narrow checks first:

```bash
npm run typecheck
npm run build:test
node ./.tmp-test/test/run-stage-core-tests.js
```

Then run:

```bash
npm test
```

If schema drift is detected, regenerate intentionally:

```bash
npm run generate:stage-interface-schemas
npm run check:stage-interface-schemas
```

For state sync:

```bash
git diff --name-only
```

## Acceptance Criteria

The issue is complete when:

- no shipped descriptor declares any old scenario auto-pass boolean;
- every shipped descriptor declares `sideEffect.ownerCurationWrite`;
- every shipped descriptor declares `invocationPolicy.impactClass`;
- gate policy is driven by `impactClass x actorTrustBasis`;
- source-of-truth edit tightening only upgrades curation writes to ask;
- `present` remains durable-write true but curation false;
- existing shipped tool happy paths still allow under default runtime context;
- formal tests pass;
- state docs are updated or explicitly reported as not needed.

## Stopping Condition

Stop after the contract, gate, descriptors, tests, generated schemas if needed,
and required state docs are consistent and verified. Do not continue into
Proposal Unit persistence, AG-UI Confirm cards, Web settings UI, or Radio
provenance wiring in this issue.
