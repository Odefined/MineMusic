# Stage Interface Ports

This document records the Stage Interface provided and consumed ports, read and
write capabilities, composition points, and forbidden dependencies.

## Provides

| Port or surface | Provided to | Capabilities | Code |
| --- | --- | --- | --- |
| `MineMusicStageInterface` | Stage Core runtime, MCP server runtime, host adapters | `tools[stableToolName](payload)` facade that delegates to `ToolDispatchPort.call` with the held session id | `src/stage_interface/facade.ts` |
| `ToolDispatchPort` implementation | `MineMusicStageInterface` facade through Stage Core composition | Governed call routing, availability check, payload parsing, handler dispatch, compact presentation | `src/stage_interface/dispatch.ts` |
| `stableToolNames`, `agentToolDescriptors`, `stageInterfaceToolInputSchemas` | MCP adapter, Handbook/instrument surfaces, tests | Stable names, descriptions, effect metadata, raw host input schemas | `src/stage_interface/tool_definitions/index.ts` |
| Compact output projection helpers | Stage Interface Tool Definitions only | Convert domain outputs into public agent-facing shapes | `src/stage_interface/outputs/**` |

## Consumes

| Consumed port | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| `SessionContextPort` | Stage Module / Session Context | Context read, session update, instrument availability, Handbook context | `getSession`, `readContext` | `updateSession` |
| `InstrumentCatalogPort` | Stage Interface instruments / Handbook | Availability checks and Handbook rendering | `list` | None |
| `RecommendationPresentationPort` | Material Presentation | Final public recommendation presentation | None | `present` records presentation through the underlying service and may materialize selected `emat:*` handles into durable `mat:*` results |
| `EventPort` | Event Service | Factual event recording | None | `record` |
| `EffectBoundaryPort` | Effect Boundary | Durable-write and external-action proposals | None | `propose` |
| `MaterialResolvePort` | Material Resolve | Public text resolve | `resolve` returns query-keyed domain resolve results for public `queries[].text` plus optional `queries[].targetKind`, and may contain durable or ephemeral material handles | Resolve may allocate process-local ephemeral entries for provider-backed non-durable results; durable materialization remains inside Recommendation Presentation |
| `MaterialQueryPort`, `MaterialContextBriefPort`, `MaterialPoolsPort` | Material Query / Context / Pools | Public query, context brief, pool listing | `query`, optional `contextBrief`, optional `listPools` | None |
| `MaterialSelectorPort` | Material Selection | Public candidate selection helper | `select` over material ids and policy inputs | None |
| `StageInterfaceMaterialStorePort` | Material Store narrow read surface | Project material ids, resolve redirects, derive collection labels, inspect source-library-backed material facts | `resolveMaterialRedirect`, `getMaterialRecord`, `getSourceEntity`, `getCanonical`, `listSourceLibraryItems` | None |
| `SourceGroundingPort` | Source Grounding | Refresh playable links for `music.links.refresh` | `refreshPlayableLinks` through projected material | Link refresh may persist source evidence inside Source Grounding; Stage Interface does not write provider state directly |
| `CollectionPort` | Collection Service | Collection save/favorite/block/custom actions and lists | `listItems`, `listCollections` | `initializeOwnerCollections`, add/remove material entries, create/update/remove collection |
| `MusicKnowledgePort` | Music Knowledge | Provider-attributed knowledge lookup | `query` | None |
| `LibraryImportPort` | Library Import | Import/update start/continue/status/summary/item audit | `getStatus`, `getSummary`, `listItems` | `startImport`, `continueImport`, `startUpdate`, `continueUpdate` |
| `CanonicalMaintenancePort` | Canonical Store maintenance | Provisional review list/inspect/apply/auto-update | `reviewList`, `reviewInspect` | `reviewApply`, `reviewAutoUpdate` |
| `MemoryPort` | Memory Service | Feedback recording and memory proposal | None | `recordFeedback`, `propose` |

## Method-Level Capabilities

| Capability | Method(s) | Read/Write | Allowed consumer | Notes |
| --- | --- | --- | --- | --- |
| Public tool dispatch | `ToolDispatchPort.call` | Read/write depends on tool | Stage Interface facade | Dispatch owns schema and availability boundary before domain calls. |
| Public schema/descriptor exposure | `stableToolNames`, `agentToolDescriptors`, `stageInterfaceToolInputSchemas` | Read | MCP, Handbook, tests | Derived from Tool Definitions. |
| Material id projection | `StageInterfaceMaterialStorePort` methods | Read | Music Tool Group only | Narrow read surface; no registry writer capability. Public handles remain opaque `mat:*` / `emat:*` values. |
| Collection writes | `CollectionPort` add/remove/create/update/remove methods | Write | Music Tool Group only | Public inputs are materialId/collection labels; handlers derive internal refs. |
| Recommendation presentation | `RecommendationPresentationPort.present` | Write through presentation service | Stage Tool Group only | Manual `recommendation.presented` event writes are rejected by Stage Interface. Final presentation is the only public boundary that may consume `emat:*` handles and return final durable cards. |
| Library import/update management | `LibraryImportPort` start/continue methods | Write | Library Tool Group only | Preview methods exist on the port but are not public stable tools. |
| Canonical review maintenance | `CanonicalMaintenancePort` review apply/auto-update | Write | Canonical Review Tool Group only | Tool availability is posture/instrument gated. |

## Forbidden Dependencies

| Forbidden port or module | Reason |
| --- | --- |
| Full `MaterialStorePort` in `createToolDispatch` | Stage Interface only needs projection and Source Library read capabilities; writer capabilities belong to material services. |
| Raw provider adapters or provider payloads | Providers are below Plugin Slots and Source/Knowledge/Library services. |
| Storage repositories | Stage Interface consumes domain ports, not storage adapters. |
| Domain modules importing `src/stage_interface/outputs/**` | Compact agent-facing DTOs are public-boundary output types. |
| MCP adapter owning tool truth | MCP must consume Stage Interface descriptors and schemas. |
| Codex skill Handbook as schema authority | Skill docs are consumer snapshots, not runtime contracts. |

## Composition

Stage Core wires Stage Interface in `src/stage_core/compose.ts` and related
runtime factory files. `createToolDispatch` receives narrow domain ports and a
`StageInterfaceMaterialStorePort`; `createMineMusicStageInterface` exposes the
stable facade over that dispatch port.

MCP consumes the resulting runtime through `src/surfaces/mcp/server.ts`.

## Guards

| Guard | Protects |
| --- | --- |
| `test/stage_interface/stage-interface.test.ts` | Stable tool order, schema/descriptor parity, removed public tool names |
| `test/stage_interface/stage-interface-dispatch.test.ts` | Registry coverage, availability and payload validation, dispatch through injected ports |
| `test/stage_interface/stage-interface-outputs.test.ts` | Compact public output shapes |
| `test/surfaces/mcp-server.test.ts` | MCP prefixing and schema parity with Stage Interface definitions |
| `test/architecture/material-boundary.test.ts` | Material domain modules must not import Stage Interface output DTOs or legacy card DTO names |

## Evidence

- Ports: `src/ports/index.ts`
- Dispatch wiring: `src/stage_interface/dispatch.ts`
- Tool Definition registry: `src/stage_interface/tool_definitions/index.ts`
- MCP adapter: `src/surfaces/mcp/server.ts`
- Tests listed in `Guards`
