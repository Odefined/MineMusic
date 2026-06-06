# MineMusic

MineMusic is a music stage for an LLM music partner, secretary, and agent.

The LLM owns musical interpretation, conversation, and the final recommendation.
MineMusic owns grounding, identity anchors, source-backed links, material
states, event records, memory proposals, effect boundaries, callable
instruments, capability slots, and runtime lifecycle.

MineMusic is now in a same-repo formal rebuild. The formal architecture target
lives in `ARCHITECTURE.md`. The active TypeScript tree has been reset to the
formal skeleton; the old MVP implementation is preserved only by git history
and archived documentation evidence.

## Start Here

- `INDEX.md`: current documentation map.
- `ARCHITECTURE.md`: global architecture authority.
- `CURRENT_STATE.md`: formal rebuild current state.
- `docs/formal-project-glossary.md`: formal target vocabulary.
- `PROGRESS.md`: project-level milestone index.
- `CONTEXT.md`: pre-formal vocabulary file; not formal rebuild authority unless
  explicitly refreshed later.
- `docs/maintenance/documentation-architecture.md`: active documentation
  structure rules.

Historical MVP proposal, MVP baseline docs, root plans, Stage Core refactor
plans, and architecture review evidence are archived under `docs/archive/`.

## Current Runtime

The current runtime is a formal rebuild skeleton. It defines Phase 1 contracts,
the Phase 2 Stage Core runtime lifecycle baseline, the Phase 3 Extension
capability-registration baseline, minimal Stage Interface dispatch, and a thin
Server Host entrypoint. Real provider integrations, persistence, MCP
transport, query behavior, presentation cards, library import, and
recommendation workflows are not active runtime features until later formal
phases rebuild them.

The skeleton creates a Stage Runtime, mounts an empty Extension runtime module,
starts it through Server Host, and exposes a JSON status snapshot through the
local server command. The only current tool is `stage.runtime.status`.

```text
Host clients
  -> Server Host
  -> Stage Core
  -> Extension capability registration runtime
  -> Stage Interface
  -> Formal contracts
```

## Development Commands

```bash
npm test
npm run typecheck
npm run server:minemusic
```

## Current Runtime Non-Goals

The current formal skeleton does not implement provider calls, storage,
autoplay, queue mutation, source writeback, playlist mutation, autonomous DJ
sessions, query-to-present, handbook tools, music-domain tools, or final
musical judgment.
