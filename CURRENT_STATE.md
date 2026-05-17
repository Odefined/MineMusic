# Current State

## Status

MineMusic is at the Wave 1 MVP implementation foundation.

The current implementation contains TypeScript shared contracts, public module
ports, and contract/type tests. No runtime module behavior is claimed complete.

## Source Basis

The current docs are based on `proposal.md` only.

## Established

- The MVP user-facing chain is a grounded recommendation with playable links
  when available.
- The LLM owns musical interpretation and final recommendation.
- MineMusic owns grounding, identity anchors, source-backed links, material
  states, events, memory proposals, and effect boundaries.
- Identity, source access, memory, events, and effects are separate modules.
- Modules are expected to communicate through public ports, domain events,
  proposals, provider slots, and interface change requests.
- Plugin packages extend capability slots. They do not define core business
  boundaries.
- A subagent orchestration plan now exists for implementing the MVP with
  isolated write scopes and review gates.
- Contract docs distinguish shared data contracts from public module ports.
- Stage/Instrument coordination is split into `InstrumentCatalogPort` and
  `ToolDispatchPort` to avoid a circular public-port contract.
- `StageVibe` is part of session/Handbook guidance, and Music Knowledge remains
  a thin MVP stub unless later promoted.
- Wave 1 TypeScript build harness exists in `package.json` and `tsconfig.json`.
- Shared contracts are exported from `src/contracts/index.ts`.
- Public ports and repository interfaces are exported from `src/ports/index.ts`.
- Contract/type coverage exists in `test/contracts/wave1-contracts.test.ts`.

## Not Yet Implemented

- Stage Kernel.
- Instrument registry and LLM-facing tool surface.
- Canonical Store.
- Source Resolution.
- Event Service.
- Memory Service.
- Effect Boundary.
- Plugin Edge providers.
- Storage repositories.
- End-to-end MVP runtime validation.

## Verification

- `npm test` passes as of Wave 1.
- `npm run typecheck` passes as of Wave 1.

## Known Constraints

- Do not collapse source identity into canonical identity.
- Do not treat knowledge material as playable until source resolution confirms
  a usable playable link.
- Do not turn weak LLM guesses into durable memory.
- Do not treat normal link display as playback.
- Do not build heavy recommender scoring into the MVP path.
- Do not treat a `source_only_playable` event target as durable canonical
  identity.
