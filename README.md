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
capability-registration baseline, the Phase 4 generic Music Database
foundation, the Phase 5 Music Data Platform identity write model, and the
Phase 6 Source Provider Slot search seam with a default NCM source-provider
plugin, the Phase 7 source-library import foundation with Platform Library
Provider Slot, NCM saved-library reads, and internal Music Data Platform import
wiring, the Phase 8 owner catalog projection foundation with
library-ref-based source-library facts and an internal SQL catalog view, and
the Phase 9 owner material relation foundation with deterministic
material-scope relation refs, current-state `owner_material_relations`,
owner-relation projection, and blocked catalog exclusion.

The skeleton creates a Stage Runtime, mounts Music Data Platform and Extension
runtime modules, starts them through Server Host, and exposes a JSON status
snapshot through the local server command. The only current Stage Interface
tool is `stage.runtime.status`. NCM source search and source-library import are
internal runtime seams, not public Stage Interface tools.

```text
Host clients
  -> Server Host
  -> Stage Core
  -> Music Data Platform identity/source-library/owner-relation facts
  -> Extension capability registration runtime
  -> Source Provider Slot search / Platform Library Provider reads
  -> Stage Interface
  -> Formal contracts
```

## Development Commands

```bash
npm test
npm run typecheck
npm run server:minemusic
npm run smoke:ncm
npm run smoke:ncm:library
```

## Current Runtime Non-Goals

The current formal skeleton does not implement public provider/import/query
tools, local pool query, text/FTS query, autoplay, queue mutation, source
writeback, playlist mutation, autonomous DJ sessions, query-to-present,
handbook tools, music-domain tools, or final musical judgment.
