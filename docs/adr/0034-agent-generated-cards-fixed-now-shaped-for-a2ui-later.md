# ADR-0034: Agent-Generated Cards Use Fixed Components Now, Shaped For A2UI Later

## Status

Accepted

## Context

The first product version needs a small, fixed set of cards: four Action Card
types (Confirm, Choose, Apply To, Open) plus the Functional Cards (Radio,
Recommendations, Library). The PRD's future direction also includes music
information/analysis cards whose structure cannot be predefined.

The industry generative-UI taxonomy spans Static (frontend owns components, the
agent selects), Declarative (the agent emits a structured UI spec the frontend
renders — standardized as A2UI), and Open-ended (the agent emits HTML/iframe).
A2UI (Google, with CopilotKit) is a real specification (v0.9 toward v1.0) with a
trusted component catalog, data-model binding, declarative actions, and no code
execution, and it layers on the AG-UI boundary (ADR-0031). The Consensus
currently calls this a "controlled Card IR/A2UI," as if A2UI were one option
beside a private IR.

## Decision

- The first version renders the fixed card set as Static generative UI:
  frontend-owned components that the agent selects and populates.
- The card description format is shaped as A2UI from the start, even with a
  catalog limited to the first-version components, so future
  information/analysis cards graduate to Declarative generative UI without a
  protocol change.
- MineMusic does not invent a private Card IR; the declarative format is A2UI.
- Open-ended generation (arbitrary HTML/JS/CSS) remains forbidden, consistent
  with the Consensus.

## Rejected Alternatives

- Invent a private Card IR: rejected — re-creates an already-standardized format
  (A2UI) and forgoes its data-model binding and cross-platform renderers.
- Full open-ended A2UI generation in v1: rejected — over-engineered; the
  first-version cards are few and fixed.
- Hard-code every future card forever: rejected — each new card type would need a
  frontend change and release, unsuitable for open-ended information/analysis
  cards.

## Consequences

- Action Card and Functional Card payloads conform to an A2UI-shaped schema with
  an extensible component catalog.
- A2UI surfaces ride the AG-UI Web boundary (ADR-0031); user actions on them
  return through Workbench Action Adapter as recognized action ids, never
  arbitrary code.
- A2UI's data-model binding (incremental `updateDataModel`) is preferred over
  re-projecting whole surfaces.
