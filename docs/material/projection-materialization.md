# Material Projection And Materialization

This document records the current split between read projection and writer
materialization inside Material Flow.

## Projection

`src/material/projection/index.ts` is the read-only conversion layer from
registry-backed records to domain material output.

It provides:

- `materialRefToMaterialId(ref)` for public handle projection;
- `materialIdToRef(materialId)` for public handle parsing;
- `currentMaterialRecordForRef(...)` for redirect-aware record lookup;
- `materialForMaterialId(...)` for public-id-to-domain projection;
- internal helpers that project labels, source refs, playable links, and
  material state from current records and Source Entity facts.

Projection reads only through `MaterialProjectionStorePort`. It does not own
query orchestration, registry writes, Stage Interface compact DTOs, or
recommendation presentation.

## Materialization

`src/material/materialization/index.ts` is the shared writer boundary for
turning source-backed facts into registry-backed domain materials.

It provides:

- `MaterialSourceMaterializerPort` for Material Resolve;
- `MaterialSourceLibraryMaterializerPort` for Material Query;
- `createMaterializationService(...)` as the factory wired by Stage Core.

The materialization service can call registry writer capabilities through
`MaterialSourceMaterializerStorePort`, including source/canonical get-or-create
operations, source attachment, canonical promotion, and merges. Query and
Resolve do not receive those writer methods directly.

## Query And Resolve Use

Material Resolve uses source materialization after canonical lookup, scoped
Source Library discovery, and provider grounding. It delegates known-canonical
attachment and source/provider materialization to
`MaterialSourceMaterializerPort`.

Material Query uses Source Library materialization when a pool returns stored
library items. This lets saved-track, followed-artist, saved-release,
release-track, all-material, and collection-backed pools return domain
materials without re-grounding provider search in the recommendation path.

## Stage Context And Recent Cards

Recent card projection is not a Material Query responsibility. The current code
keeps bounded recent-card event projection in `src/stage/recent_cards.ts`, and
Stage Interface projects recent cards into compact context output.

## Guards

`test/architecture/material-boundary.test.ts` checks that:

- the materialization store port contains the registry writer capabilities;
- query does not reference materialization writer methods directly;
- resolve does not reference registry materialization writer methods directly;
- materialization does not import query, resolve, Stage Interface,
  presentation, library import, or memory modules;
- former projection consumers import projection helpers instead of material
  query.

## Related Documents

- `docs/material/design.md`
- `docs/material/ports.md`
- `docs/material/progress.md`
- `docs/material-store/progress.md`
- `docs/stage-interface/tool-contracts.md`
