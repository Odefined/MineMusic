# MVP Verification Report

## Terminology Note

This report records historical Wave 5 through Wave 8 verification. Some
phrasing reflects the vocabulary that existed during those waves. As of the
2026-05-23 architecture refactor, current code uses Stage Modules for Session
Context and Material Gate, Stage Interface for callable tools, and Stage Core
for `src/stage_core/index.ts` runtime composition and lifecycle.

## Scope

This report covers the Wave 5 fixture end-to-end MVP slice, Wave 6 final review
verification, Wave 7 deterministic NetEase provider-adapter verification, and
Wave 8 deterministic Codex MCP plugin-surface verification.

The verified path is:

```text
natural request
-> Stage Interface
-> Stage context read
-> Material Resolve
-> Source Grounding fixture provider
-> Canonical Store identity attachment
-> Stage material preparation through tool-visible `stage.materials.prepare`
-> recommendation response with source-backed link
-> factual event recording
-> memory proposal
-> effect proposal
```

This report claims successful live NetEase search-link smoke validation against
the current local service. It also claims deterministic MCP/plugin packaging
verification, active-session Codex MCP tool usability, and user-confirmed
fresh Codex app plugin visibility. It does not claim durable storage,
autonomous DJ behavior, playback execution, queue mutation, playlist writes, or
source writeback.

## Verification Object

- `src/stage_core/index.ts`
- `src/app/index.ts`
- `fixtures/integration/mvp-fixture.ts`
- `test/integration/mvp-slice.test.ts`
- `docs/mvp/final-review.md`
- `src/providers/netease/index.ts`
- `test/providers/netease-source-provider.test.ts`
- `test/live/netease-source-smoke.ts`
- `src/surfaces/mcp/server.ts`
- `test/surfaces/mcp-server.test.ts`
- `test/plugins/plugin-packaging.test.ts`
- `plugins/minemusic/.codex-plugin/plugin.json`
- `plugins/minemusic/.mcp.json`
- `plugins/minemusic/skills/minemusic/SKILL.md`
- `.agents/plugins/marketplace.json`

## Method

The end-to-end slice constructs a runtime with:

- in-memory repositories.
- a fixture source provider.
- a fixture canonical record attached to a fixture source ref.
- Session Context and Material Gate through Stage Modules.
- Instrument Catalog and Tool Dispatch.
- Stage Interface facade.
- Codex MCP helper tests that create prefixed `minemusic.*` tool definitions
  from the same instrument descriptors.

The test runs `runRecommendationTranscript(...)` for a realistic request:

```text
I need quiet but not sleepy coding music.
```

## Verified Behavior

Material state:

- A fixture source item with a matching canonical record becomes
  `confirmed_playable`.
- An `exploration` fixture item remains non-playable for presentation even if
  fixture data contains a link.

Playable-link handling:

- The recommendation response includes the confirmed source-backed playable
  link.
- The recommendation response does not include the exploration item's
  unconfirmed link.

Event recording:

- The transcript leaves inspectable session events after the run.

Memory proposal:

- The transcript creates an evidence-backed memory proposal.
- The proposal is not accepted as durable memory during the recommendation
  transcript.

Effect boundary:

- The external action target is represented as an `EffectProposal`.
- The transcript does not execute the external action.

NetEase provider adapter:

- Fixture NetEase search payloads become `MusicMaterial` records with
  `source:netease` track refs.
- NetEase web song URLs are exposed as source-backed playable links.
- Paid or VIP-like fixture material marks `requiresAccount`.
- `noCopyrightRcmd` fixture material becomes `blocked` and does not expose
  playable links.
- The provider can be registered through `PluginRegistryPort` and consumed by
  `SourceGroundingPort`.
- Material Resolve can attach a matching canonical record and Source Grounding
  can normalize the material to `confirmed_playable`.
- Link refresh can reconstruct a NetEase web song URL from a NetEase source
  ref.

Codex MCP plugin surface:

- `stage.materials.prepare` is included in the stable Stage Interface / instrument
  tool set.
- Tool Dispatch rejects normal instrument tools when the current instrument
  catalog does not expose them, while `stage.context.read`, `handbook.*` lookup
  tools, and `stage.session.update` remain available.
- MCP tool definitions use `minemusic.*` names and map back to internal
  `ToolName` values.
- Argument-bearing MCP tools expose explicit input schemas for query,
  materials/purpose, material, event, proposal, and session patch payloads.
- MCP handlers delegate through `MineMusicStageInterface` and return JSON text
  containing the MineMusic `Result<T>` payload.
- Plugin manifest, MCP config, workflow skill, and repo-local marketplace
  config have no scaffold TODOs or stale old MineMusic tool names, and point at
  `npm --prefix /Users/jiajuzang/Documents/Codex/MineMusic run mcp:minemusic`.
- The workflow skill explicitly separates listening context from music
  candidates, so environment words such as writing code are not treated as
  literal song-title searches.
- The active Codex session can discover and call the `minemusic.*` MCP tools.
  A real recommendation scenario for quiet, not-sleepy coding music completed
  through `stage.session.update`, `music.material.resolve`, `stage.materials.prepare`,
  `stage.events.record`, `memory.propose`, and `stage.effects.propose`.
- The live active-session flow returned source-backed NetEase materials such as
  `Aruarian Dance - Nujabes, Fat Jon`
  (`https://music.163.com/#/song?id=22644323`), `Feather ... - Nujabes`
  (`https://music.163.com/#/song?id=22821099`, marked `requiresAccount`), and
  `Intro - The xx` (`https://music.163.com/#/song?id=26655232`).
- The real recommendation materials were `source_only_playable`, so Material
  Gate preserved their playable links for recommendation presentation, while
  effect handling remained a proposal and did not open or play anything.
- Fresh Codex app plugin-session validation is reported complete by the user.
  The captured repository evidence remains deterministic packaging/runtime
  tests and active-session MCP tool calls.

## Thin Stubs

- Source access is a fixture provider.
- NetEase live access is represented by an adapter and opt-in smoke command,
  plus active-session MCP tool use. Shell live-smoke access can still be
  environment-sensitive inside sandboxed command contexts.
- Codex plugin packaging is repo-local and deterministic. Fresh host-app
  visibility is user-confirmed rather than captured by a repository command
  transcript.
- Storage is in-memory.
- The transcript runner is deterministic and does not claim to be an LLM.
- Music Knowledge remains a thin service and is not on this critical path.
- Effect execution providers are not implemented.

## Verification Commands

```bash
npm test
npm run typecheck
npm run smoke:netease
git diff --check
```

All listed commands passed for Wave 7 deterministic verification in this
workspace and Wave 8 deterministic MCP/plugin verification in this workspace.
`npm run smoke:netease` passed through the default skip path.

The explicit live command:

```bash
MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease
```

was also run in this workspace and passed against
`http://127.0.0.1:3000`, returning at least one live material through the
NetEase provider adapter.

An active Codex MCP tool invocation also verified the plugin surface in the
current session:

```text
session.update
-> music.material.resolve
-> stage.materials.prepare
-> events.record
-> memory.propose
-> effects.propose
```

The flow returned real NetEase links and created inspectable event, memory, and
effect proposal records. The user also confirmed fresh Codex app plugin-session
validation in this thread; that host-app check is recorded as user-confirmed
evidence rather than a repo-command test.

## Remaining Work

- Durable repository implementations.
- Broader host-surface integration beyond the repo-local MCP plugin surface.
