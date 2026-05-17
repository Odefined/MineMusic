# MineMusic MVP Documentation Pack

MineMusic is a music stage for an LLM music partner, secretary, and agent.

This repository is currently in a fresh MVP documentation stage. The only
product source for this document pack is `proposal.md`.

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
- `plan/subagent_mvp_master_plan.md`: coordinator plan for completing the MVP
  with subagents.

## Non-Goals

The MVP does not implement autoplay, queue mutation, source writeback, a full
player runtime, autonomous DJ sessions, bulk playlist import, heavy recommender
scoring, or a full music intelligence pipeline.
