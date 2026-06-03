# Stage Interface Tool Contracts

This document is the current authority for MineMusic's agent-facing,
MCP-facing, and Codex-skill-facing public tool surface.

Global ownership principles live in `ARCHITECTURE.md`. Runtime implementation
state lives in `docs/stage-interface/progress.md`.

## Contract Source

Tool Definitions under `src/stage_interface/tool_definitions/**` are the
contract source for:

- stable internal tool names;
- descriptions and effect kind;
- input schema references and raw host input schemas;
- output schema references;
- availability;
- dispatch handler;
- typed payload parsing or extra cross-field validation;
- compact public presentation.

`stableToolNames`, `agentToolDescriptors`, and
`stageInterfaceToolInputSchemas` are derived from the ordered Tool Definition
list in `src/stage_interface/tool_definitions/index.ts`. The public
`src/stage_interface/index.ts` barrel re-exports those derived facts; it is not
a second source of tool truth.

MCP exposes the same tools with the `minemusic.` prefix through
`src/surfaces/mcp/server.ts`.

## Stable Tool Groups

| Group | Public tools | Code |
| --- | --- | --- |
| Stage | `stage.context.read`, `stage.recommendation.present`, `stage.session.update`, `stage.events.record`, `stage.effects.propose` | `src/stage_interface/tool_definitions/stage.ts` |
| Handbook | `handbook.overview.read`, `handbook.instrument.read`, `handbook.tool.read` | `src/stage_interface/tool_definitions/handbook.ts` |
| Music | `music.material.resolve`, `music.material.query`, `music.material.related`, `music.material.select`, `music.material.context.brief`, `music.pools.list`, `music.links.refresh`, collection tools | `src/stage_interface/tool_definitions/music.ts` |
| Knowledge | `knowledge.query` | `src/stage_interface/tool_definitions/knowledge.ts` |
| Library | `library.import.start`, `library.import.continue`, `library.update.start`, `library.update.continue`, `library.import.status`, `library.import.summary`, `library.import.items.list` | `src/stage_interface/tool_definitions/library.ts` |
| Canonical Review | `canonical.review.list`, `canonical.review.inspect`, `canonical.review.apply`, `canonical.review.auto_update` | `src/stage_interface/tool_definitions/canonical_review.ts` |
| Memory | `memory.feedback.record`, `memory.propose` | `src/stage_interface/tool_definitions/memory.ts` |

The stable order is protected by
`test/stage_interface/stage-interface.test.ts`.

## Current Stable Order

```text
stage.context.read
handbook.overview.read
handbook.instrument.read
handbook.tool.read
stage.recommendation.present
stage.session.update
stage.events.record
stage.effects.propose
music.material.resolve
knowledge.query
music.material.query
music.material.related
music.material.select
music.material.context.brief
music.pools.list
music.links.refresh
music.collection.save
music.collection.unsave
music.collection.favorite
music.collection.unfavorite
music.collection.block
music.collection.unblock
music.collection.item.add
music.collection.item.remove
music.collection.create
music.collection.update
music.collection.delete
music.collection.list
library.import.start
library.import.continue
library.update.start
library.update.continue
library.import.status
library.import.summary
library.import.items.list
canonical.review.list
canonical.review.inspect
canonical.review.apply
canonical.review.auto_update
memory.feedback.record
memory.propose
```

The public surface intentionally does not include:

- `stage.materials.prepare`;
- `library.source.list`;
- `music.material.resolve.cards`;
- `library.import.preview`;
- `library.update.preview`.

## Schema Policy

Dispatch parses payloads before handlers run:

- use a tool's typed `inputParser` when present;
- otherwise use `z.object(inputSchema).passthrough()`;
- normalize undefined payload to `{}`;
- run optional cross-field validation after parsing;
- return `stage_interface.invalid_payload` for schema-boundary failures.

Passthrough parsing means extra fields are tolerated. Strict rejection of
unknown fields is a future per-tool decision, not the default public policy.

## Material Handle Policy

Ordinary public material actions use `materialId`.

Public material tools must not ask agents to construct:

- internal `materialRef`;
- raw `sourceRef`;
- raw `canonicalRef`;
- raw `MusicMaterial`;
- raw Source Library rows;
- provider payloads.

Public `music.material.resolve` accepts text `queries` and adapts them to the
internal resolve request. Public resolve output is compact:

- `items` with material cards carrying `materialId`, title, optional subtitle,
  and material `state`;
- optional unresolved text diagnostics when no materialized item exists.

`music.material.query` and `music.pools.list` are the ordinary public Source
Library browsing path. Public source-library pools use `libraryKinds` and
optional `target`. The old public `areas` / `expand` Source Library browsing
language is archived.

## Presentation And Feedback

`stage.recommendation.present` is the public final presentation boundary. It
calls `RecommendationPresentationPort.present`, then Stage Interface projects
the result into compact public cards.

`stage.events.record` rejects manual `recommendation.presented` events.

`memory.feedback.record` is the public tool for interpreted feedback against
recent presented cards, exact event positions, or a material id.

Public display links use:

```ts
type PublicDisplayLink = {
  label?: string;
  url: string;
};
```

Persisted recommendation events may retain source/link binding facts for
internal feedback resolution, but ordinary public cards do not expose raw
source handles.

## MCP And Skill Parity

MCP tool names are `minemusic.` plus the stable Stage Interface tool name.
`internalToolNameFor` rejects unprefixed names and removed public names.

`test/surfaces/mcp-server.test.ts` verifies that MCP definitions expose every
stable Stage Interface tool and reuse Stage Interface schemas.

The Codex skill and `skills/minemusic/HANDBOOK.md` are consumer-facing workflow
artifacts. They should be refreshed from Stage Interface facts when tool
descriptors change, but they do not define the public contract.

## Evidence

- Stable tool type: `src/contracts/index.ts`
- Tool definitions: `src/stage_interface/tool_definitions/**`
- Dispatch validation: `src/stage_interface/dispatch.ts`
- MCP parity: `src/surfaces/mcp/server.ts`,
  `test/surfaces/mcp-server.test.ts`
- Stable order and schema/descriptor parity:
  `test/stage_interface/stage-interface.test.ts`
- Dispatch and payload validation:
  `test/stage_interface/stage-interface-dispatch.test.ts`
