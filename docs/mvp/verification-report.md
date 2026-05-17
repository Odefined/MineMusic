# MVP Verification Report

## Scope

This report covers the Wave 5 fixture end-to-end MVP slice, Wave 6 final review
verification, Wave 7 deterministic NetEase provider-adapter verification, and
Wave 8 deterministic Codex MCP plugin-surface verification.

The verified path is:

```text
natural request
-> Tool API
-> Stage context read
-> Source Resolution fixture provider
-> Canonical Store identity attachment
-> Stage material preparation through tool-visible `stage.materials.prepare`
-> recommendation response with source-backed link
-> factual event recording
-> memory proposal
-> effect proposal
```

This report claims successful live NetEase search-link smoke validation against
the current local service. It also claims deterministic MCP/plugin packaging
verification. It does not claim fresh Codex app plugin visibility, durable
storage, autonomous DJ behavior, playback execution, queue mutation, playlist
writes, or source writeback.

## Verification Object

- `src/runtime/index.ts`
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
- Stage Kernel.
- Instrument Catalog and Tool Dispatch.
- Tool API facade.
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
  `SourceResolutionPort`.
- Source Resolution can attach a matching canonical record and normalize the
  material to `confirmed_playable`.
- Link refresh can reconstruct a NetEase web song URL from a NetEase source
  ref.

Codex MCP plugin surface:

- `stage.materials.prepare` is included in the stable Tool API / instrument
  tool set.
- Tool Dispatch rejects normal instrument tools when the current Handbook does
  not expose them, while `stage.context.read` and `session.update` remain
  available.
- MCP tool definitions use `minemusic.*` names and map back to internal
  `ToolName` values.
- Argument-bearing MCP tools expose explicit input schemas for query,
  materials/purpose, material, event, proposal, and session patch payloads.
- MCP handlers delegate through `MineMusicToolApi` and return JSON text
  containing the MineMusic `Result<T>` payload.
- Plugin manifest, MCP config, workflow skill, and repo-local marketplace
  config have no scaffold TODOs or stale old MineMusic tool names, and point at
  `npm --prefix /Users/jiajuzang/Documents/Codex/MineMusic run mcp:minemusic`.

## Thin Stubs

- Source access is a fixture provider.
- NetEase live access is represented by an adapter and opt-in smoke command,
  not by always-on runtime composition.
- Codex plugin packaging is repo-local and deterministic. It has not yet been
  verified in a fresh live Codex plugin session.
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

## Remaining Work

- Durable repository implementations.
- Fresh Codex app plugin-session validation.
- Broader host-surface integration beyond the repo-local MCP plugin surface.
