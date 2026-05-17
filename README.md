# MineMusic MVP Documentation Pack

MineMusic is a music stage for an LLM music partner, secretary, and agent.

This repository is currently in an MVP implementation-foundation stage. The
product source remains `proposal.md`, and the implementation contracts follow
the MVP documentation pack.

The MVP goal is to prove one user-facing chain:

```text
natural music request
  -> LLM musical interpretation
  -> MineMusic context and memory read
  -> grounded music material
  -> source-backed playable links when available
  -> honest material state
  -> LLM recommendation
  -> event record and memory proposal when appropriate
```

MineMusic does not replace the LLM's musical judgment. It provides grounding,
identity anchors, source-backed links, event records, memory proposals, and
effect boundaries.

## Source Of Truth

- Product proposal: `proposal.md`
- MVP architecture: `ARCHITECTURE.md`
- Document index: `INDEX.md`
- Current project state: `CURRENT_STATE.md`
- Progress log: `PROGRESS.md`
- MVP phase plan: `plan/mvp_phase_plan.md`

## MVP Docs

- `docs/mvp/interface-contracts.md`: shared data contracts.
- `docs/mvp/module-interfaces.md`: public ports for every MVP module.
- `docs/mvp/communication-protocols.md`: how modules call, notify, propose, and
  request interface changes.
- `docs/mvp/module-boundaries.md`: ownership and encapsulation rules.
- `docs/mvp/workstreams.md`: ownership areas for assigning parallel work.
- `docs/mvp/agent-collaboration.md`: communication protocol for multiple agents.
- `docs/mvp/verification-report.md`: fixture end-to-end MVP verification
  report.
- `plan/subagent_mvp_master_plan.md`: coordinator plan for completing the MVP
  with subagents.

## Development

Waves 1 through 5 have established the TypeScript contract, public-port
harness, in-memory repository foundation, plugin registry foundation, core
domain module skeletons, Stage Kernel, instrument registry, Tool API facade,
and a fixture end-to-end MVP slice.

```bash
npm test
```

The test command runs TypeScript contract/type checks, compiles tests into
`.tmp-test/`, and executes storage, plugin registry, core domain, stage,
instrument, tool API, and integration runtime tests.

## Non-Goals

The MVP does not implement autoplay, queue mutation, source writeback, a full
player runtime, autonomous DJ sessions, bulk playlist import, heavy recommender
scoring, or a full music intelligence pipeline.
