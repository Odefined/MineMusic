# Stage Interface Design

Stage Interface is the stable callable surface for MineMusic host clients,
MCP adapters, Codex skill workflows, and LLM-facing tool use.

It owns:

- stable public tool names;
- tool descriptors and host input schemas;
- tool availability checks;
- runtime payload validation;
- dispatch from public tool calls to narrow domain ports;
- compact agent-facing output projection;
- Handbook lookup and tool-surface explanation.

It does not own provider behavior, storage shape, Material Store identity
state, final recommendation judgment, raw Source Library browsing, or domain
service output records.

## Current Code Mapping

| Responsibility | Code |
| --- | --- |
| Stage Interface facade | `src/stage_interface/facade.ts` |
| Governed dispatch | `src/stage_interface/dispatch.ts` |
| Tool definitions | `src/stage_interface/tool_definitions/**` |
| Stable names, descriptors, schemas | `src/stage_interface/tool_definitions/index.ts`, public re-exports in `src/stage_interface/index.ts` |
| Compact output projection | `src/stage_interface/outputs/**`, `src/stage_interface/outputs.ts` |
| MCP adapter | `src/surfaces/mcp/server.ts` |
| Handbook rendering | `src/handbook/index.ts`, `skills/minemusic/HANDBOOK.md` |

Detailed public tool contracts live in
`docs/stage-interface/tool-contracts.md`. Provided and consumed ports live in
`docs/stage-interface/ports.md`. Current implementation state and verification
records live in `docs/stage-interface/progress.md`.

## Tool Definition Boundary

Each stable tool is represented by a Tool Definition. Tool Definitions carry:

- `name`;
- `description`;
- `inputSchemaRef`;
- `outputSchemaRef`;
- optional `effectKind`;
- host-facing `inputSchema`;
- availability rule;
- optional typed `inputParser`;
- optional cross-field `validatePayload`;
- handler;
- optional compact `present` projection.

The current dispatch flow is:

```text
ToolDispatchPort.call({ sessionId, toolName, payload })
  -> look up the bound Tool Definition by toolName
  -> check availability when required
  -> parse payload with inputParser or z.object(inputSchema).passthrough()
  -> run optional validatePayload
  -> call the Tool Definition handler with parsed payload
  -> apply optional present projection
  -> return Result<unknown>
```

Availability checks run before payload validation. Undefined payload is treated
as `{}`. First-pass payload parsing is intentionally passthrough: extra keys
remain tolerated while required public fields and field types are enforced.
Invalid payloads return `stage_interface.invalid_payload` before the domain
port is called.

Tool names, descriptors, schemas, and registry entries are derived from the
ordered Tool Definition groups in
`src/stage_interface/tool_definitions/index.ts`. MCP consumes those derived
facts; it is not a separate tool-contract source.

## Public Output Ownership

Domain services return domain results. Stage Interface output modules project
those domain results into compact public shapes only at the public boundary.

Examples:

- Material query/related/selection results become compact cards in
  `src/stage_interface/outputs/material.ts`.
- Collection action/list results become compact public collection outputs at
  the Stage Interface boundary.
- Public display links are projected through
  `src/stage_interface/outputs/links.ts`.
- Recommendation presentation output is projected through
  `src/stage_interface/outputs/recommendation.ts`.

MaterialCard-like DTOs are Stage Interface output types. Domain modules must
not import Stage Interface output helpers or communicate with each other using
agent-facing compact DTOs.

## Public Surface Policy

Ordinary public material actions use `materialId`.

The public surface must not expose these as ordinary agent handles:

- internal `materialRef`;
- raw `sourceRef` or `canonicalRef` write targets;
- raw provider payloads;
- Source Library internal rows as the normal browse surface;
- raw `MusicMaterial` records;
- stored Collection internals;
- persisted recommendation feedback-binding internals.

Ordinary collection outputs must not expose raw `materialRef`, source refs,
canonical refs, stored CollectionItem rows, material snapshots, relation scopes,
identity requirements, stored status fields, or storage timestamps. Collection
write outputs should return only the ids needed for follow-up actions:
`itemId`, `collectionId`, and public `materialId`. Collection list output
should keep collection labels and item labels because list is the ordinary
display surface.

Source Library browsing is agent-facing through `music.pools.list` and
`music.material.query`, not through `library.source.list`. Library tools are
management and audit tools for import/update/status/summary/item facts.

Recommendation presentation is public through
`stage.recommendation.present`. Manual `recommendation.presented` writes
through `stage.events.record` are rejected by Stage Interface before
`EventPort.record` is called.

## Host Adapters

MCP exposes Stage Interface tools with the `minemusic.` prefix and maps them
back to stable internal tool names. MCP definitions are generated from Stage
Interface descriptors and input schemas.

The Codex skill is a workflow consumer of the Stage Interface tool surface. The
skill-local Handbook snapshot is not a source of truth for public tool names or
schemas; those come from Stage Interface definitions.

## Evidence

- Tool definitions: `src/stage_interface/tool_definitions/**`
- Dispatch: `src/stage_interface/dispatch.ts`
- Facade: `src/stage_interface/facade.ts`
- Output projection: `src/stage_interface/outputs/**`
- MCP adapter: `src/surfaces/mcp/server.ts`
- Public tool type: `src/contracts/index.ts`
- Ports: `src/ports/index.ts`
- Tests: `test/stage_interface/stage-interface.test.ts`,
  `test/stage_interface/stage-interface-dispatch.test.ts`,
  `test/stage_interface/stage-interface-outputs.test.ts`,
  `test/surfaces/mcp-server.test.ts`
