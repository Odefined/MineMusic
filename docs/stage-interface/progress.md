# Stage Interface Progress

## Current State

Stage Interface owns the host-facing and LLM-facing callable MineMusic surface:
instruments, tools, Handbook lookup, governed dispatch, and common MineMusic
flow ordering.

The Tool Definition / Tool Group direction is documented. The Stage, Handbook,
Music, Knowledge, Library, Canonical Review, and Memory Tool Groups are
implemented in the registry. Their tool names, descriptors, host input schemas,
dispatch routes, and output presentation rules now live under
`src/stage_interface/tool_definitions/`.

Stage Interface dispatch now resolves stable tools through the Tool Definition
registry. There is no fallback dispatch switch for stable tools. Tool
Definitions are now also the runtime payload validation boundary and the source
for derived aggregate tool facts.

The Stage Tool Group now includes `stage.recommendation.present`, the
agent-facing final boundary for user-visible recommendations. Manual
`recommendation.presented` writes through `stage.events.record` are rejected
before `EventPort.record` is called.
`stage.materials.prepare` has been removed from stable tools, MCP schemas, and
the Handbook snapshot; `stage.recommendation.present` is the only public
recommendation presentation boundary.
`music.material.select` remains public only as a candidate-selection helper:
the Stage Interface schema rejects `recommendation_presentation` and
`feedback_target` policy purposes. `stage.recommendation.present` is still the
only public presentation boundary. It returns compact public cards from
`src/stage_interface/outputs/recommendation.ts` and records domain
feedback-binding event items rather than persisting the display links returned
to the caller.

Material modules return domain results. Stage Interface output modules project
those results into compact agent-facing outputs. MaterialCard-like DTOs are
Stage Interface output types, not material service communication formats.
Material Presentation under `src/material/presentation` remains a core/runtime
service for final policy and event recording; only compact output projection
belongs to Stage Interface.

The Memory Tool Group now exposes `memory.feedback.record` for interpreted
feedback on presented recommendation cards. Its target resolver binds through
recent card handles or exact event positions and reads persisted presentation
`linkRefs` for source/link-scoped consequences.
Displayed recommendation links use `PublicDisplayLink` with only `label` and
`url`; raw `sourceRef` objects stay in the persisted
`recommendation.presented` event item for internal feedback binding, and public
cards no longer expose source handles.
Displayed cards now expose the underlying `MaterialState` as `state`; playable-link
availability stays visible through display links rather than an extra card field.
`music.links.refresh` now takes `materialId` as its public input and projects
the full material internally before calling Source Grounding, returning compact
`PublicDisplayLink[]` values when links are refreshed.

Tool Definitions now support optional typed input parsers in addition to their
raw host-facing schema shapes. `music.material.select`,
`stage.recommendation.present`, and `memory.feedback.record` use typed parsers
so their handlers receive typed payloads from shared dispatch validation rather
than re-casting `unknown` payloads locally. The migrated tools have a schema
drift regression that proves their typed parsers and raw public schemas accept
the same passthrough payload shape.

The Stage Interface language-normalization slice removes
`library.source.list` from stable public tools and MCP definitions. Source
Library browsing is exposed through `music.pools.list` plus
`music.material.query`: public source-library pools use `libraryKinds` and
optional `target`, `music.pools.list` returns query-ready all/source-library/
collection pool specs, and seed-dependent related pools are not listed.
Public schemas no longer advertise Source Library `areas`/`expand` or
`dynamic` pool filters. Ordinary collection material actions expose only
`materialId`; handlers project the material internally and derive the
CollectionPort label before writing.
The same normalization removes `music.material.resolve.cards`; public
`music.material.resolve` now accepts text `queries` and returns
`PublicMaterialResolveOutput` compact items. Library import summary output uses
top-level `scopeReports` and compact `absentItems`, while detailed import-item
listing keeps `sourceRef`.

## Established Decisions

- Keep `ToolDispatchPort.call({ sessionId, toolName, payload })` as the public
  dispatch Interface.
- Move tool truth behind that Interface into Tool Definitions.
- Group Tool Definitions by instrument or agent-facing work area.
- Give each Tool Group only the ports it needs.
- Keep availability checks in shared dispatch flow, with each Tool Definition
  declaring its availability rule.
- Treat compact agent-facing output presentation as part of each tool's
  Interface.
- Preserve MCP as an adapter over Stage Interface definitions, not a separate
  source of tool contracts.
- Use passthrough payload validation first. Extra keys remain tolerated while
  required fields and field types are enforced.
- Keep strict payload validation as a future per-tool opt-in decision, not a
  global default.

## Implemented

- `src/stage_interface/tool_definitions/types.ts`.
- `src/stage_interface/tool_definitions/canonical_review.ts`.
- `src/stage_interface/tool_definitions/handbook.ts`.
- `src/stage_interface/tool_definitions/knowledge.ts`.
- `src/stage_interface/tool_definitions/library.ts`.
- `src/stage_interface/tool_definitions/memory.ts`.
- `src/stage_interface/tool_definitions/music.ts`.
- `src/stage_interface/tool_definitions/stage.ts`.
- `src/stage_interface/tool_definitions/index.ts`.
- Stage Tool Group registry definitions.
- Handbook Tool Group registry definitions.
- Knowledge Tool Group registry definitions.
- Music Tool Group registry definitions.
- Library Tool Group registry definitions.
- Canonical Review Tool Group registry definitions.
- Memory Tool Group registry definitions.
- Registry-first dispatch for Stage tools.
- Registry-first dispatch for Handbook tools.
- Registry-first dispatch for Knowledge tools.
- Registry-first dispatch for Music tools.
- Registry-first dispatch for Library tools.
- Registry-first dispatch for Canonical Review tools.
- Registry-first dispatch for Memory tools.
- Fallback dispatch switch removed after every stable tool migrated.
- Compatibility exports for Stage, Handbook, Knowledge, Music, Library,
  Canonical Review, and Memory descriptors and schemas derived from the
  registry.
- Co-located compact Canonical Review output presentation rules.
- Focused registry dispatch test coverage.
- Runtime payload validation through each Tool Definition's `inputSchema`.
- `stage_interface.invalid_payload` for schema-boundary failures.
- Optional per-tool `validatePayload` for conditional contracts that raw host
  schemas cannot express without changing MCP compatibility.
- Optional typed `inputParser` support for tools that should receive typed
  handler payloads after dispatch validation while still exporting raw schema
  shapes for MCP/Handbook surfaces.
- Ordered definition-derived `stableToolNames`, `agentToolDescriptors`, and
  `stageInterfaceToolInputSchemas`.
- Registry-primary dispatch lookup.
- Low-risk Stage Tool Group payload handling cleanup after dispatch validation.
- `music.material.resolve` public validation requires non-empty text
  `queries`, validates optional query `kind`, and adapts those public queries
  to the internal candidate-set resolve request before `MaterialResolvePort` is
  called.
- MCP schema parity and stable tool aggregate tests.
- `stage.recommendation.present` dispatch to `RecommendationPresentationPort`.
- Manual recommendation presentation event rejection in `stage.events.record`.
- `stage.materials.prepare` removed from stable tool names, ToolName, Stage
  Interface registry, MCP definitions, and Handbook snapshot.
- `memory.feedback.record` descriptor, schema, and dispatch to
  `MemoryPort.recordFeedback`.
- Typed input parsers for `music.material.select`,
  `stage.recommendation.present`, and `memory.feedback.record`.
- Typed parser/raw schema drift regression for the migrated recommendation
  tools.
- `library.source.list` removed from stable tool names, ToolName, Stage
  Interface registry, MCP definitions, and Handbook snapshot.
- Public material pool schemas normalized to `libraryKinds` plus optional
  `target`; `music.pools.list` now returns query-ready `pool` specs and hides
  related pools.
- Public collection add/save/favorite/block schemas hide `canonicalRef`,
  `materialRef`, and `label`; handlers derive labels from material projection.
- Public presentation links without raw `sourceRef` exposure; feedback binding
  source refs remain in persisted presentation snapshots.
- Stage Interface output modules for material and recommendation compact
  projections.
- Architecture boundary test coverage that prevents material modules from
  importing Stage Interface output DTOs or legacy card DTO names.
- `music.material.resolve.cards` removed from stable tool names, ToolName,
  Stage Interface registry, MCP definitions, public contracts, Material Query
  support helpers, and Handbook snapshot.
- Public display-link projection centralized as `PublicDisplayLink`.
- `library.import.summary` output normalized to `scopeReports` and compact
  `absentItems`; `library.import.items.list` documents its detailed item-list
  output separately.

## Not Yet Implemented

- Per-tool strict payload mode.
- Gradual handler cleanup for remaining Memory, Knowledge, Handbook, Library,
  Music, Stage, and Canonical Review tools that still use untyped payload casts.

## Verification

- `npm run typecheck` passes as of recommendation-posture PR 7.
- `npm run build:test` passes as of recommendation-posture PR 7.
- `node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js`
  passes as of recommendation-posture PR 7.
- `node .tmp-test/test/stage_interface/stage-interface.test.js` passes as of
  recommendation-posture PR 7.
- `node .tmp-test/test/surfaces/mcp-server.test.js` passes as of the Stage
  Interface recommendation presentation, feedback, and typed parser coverage.
- `npm test` passes as of recommendation-posture PR 7.
- `node .tmp-test/test/stage_interface/stage-interface.test.js` passes as of
  the recommendation-posture follow-up schema drift regression.
- `npm run typecheck`, `npm run build:test`, and focused Stage Interface,
  material query, contract, integration, MCP, Stage Core factory, and server MCP
  tests pass for the Stage Interface language-normalization implementation.

## Next Slice

Continue the gradual handler cleanup only when a specific tool group needs
behavior work or stronger tests.
