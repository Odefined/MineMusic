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
- The card description format is a **MineMusic-owned card DTO** (a narrow
  `MineMusicCard` / `WorkbenchSurface` shape), serialized to A2UI at the Web
  boundary by a **version-pinned serializer** (e.g. `A2UiSerializerV091`).
  Refinement after review: "shaped as A2UI from the start, no protocol change" is
  withdrawn as an overclaim — A2UI is itself still versioning (v0.9.1 toward a v1
  candidate, with message/action semantics changing between them), so a product
  DTO that *is* a not-yet-locked A2UI schema would inherit that churn. Instead the
  DTO is owned by MineMusic and a swappable serializer absorbs A2UI version
  changes; future information/analysis cards graduate by extending the DTO +
  serializer, not by a wire-format break propagating into product code.
- This is a standard anti-corruption layer, **not** a private Card IR: MineMusic
  does not invent a competing declarative vocabulary — the external format is
  A2UI — it only owns the thin DTO and the version boundary in front of it.
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

- Action Card and Functional Card payloads are a MineMusic-owned DTO with an
  extensible component catalog, mapped to A2UI by a version-pinned serializer;
  changing the targeted A2UI version replaces the serializer, not the DTO or
  product code.
- A2UI surfaces ride the AG-UI Web boundary (ADR-0031); user actions on them
  return through Workbench Action Adapter as recognized action ids, never
  arbitrary code.
- A2UI's data-model binding (incremental `updateDataModel`) is preferred over
  re-projecting whole surfaces.
