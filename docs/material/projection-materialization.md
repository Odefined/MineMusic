# Material Projection And Materialization

This document records the current split between read projection and writer
materialization inside Material Flow.

## Projection

`src/material/projection/index.ts` is the read-only conversion layer from
registry-backed records to domain material output.

It provides:

- `materialRefToMaterialId(ref)` for public handle projection that preserves
  `Ref.kind`;
- `materialIdToRef(materialId)` for public handle parsing with exact
  `mat:*` / `emat:*` routing;
- `currentMaterialRecordForRef(...)` for redirect-aware record lookup;
- `materialForMaterialId(...)` for public-id-to-domain projection;
- internal helpers that project labels, source refs, playable links, and
  material state from current records and Source Entity facts.

Durable refs encode as `mat:*`. Process-local ephemeral refs encode as
`emat:*`. Decode must not treat raw ids or the wrong prefix as a fallback.

Projection reads only through `MaterialProjectionStorePort`. It does not own
query orchestration, registry writes, Stage Interface compact DTOs, or
recommendation presentation.

Any selector or presentation path that needs a public material handle must use
Projection's shared encode/decode helpers rather than rebuilding `materialId`
from raw `Ref.id`, because the public handle must preserve `mat:*` versus
`emat:*`.

## Materialization

`src/material/materialization/index.ts` is the shared durable writer boundary
for turning selected source-backed facts into registry-backed domain materials.

It provides:

- `MaterialSourceLibraryMaterializerPort` for explicit Source Library item
  materialization callers when needed;
- a narrow presentation materialization capability for turning selected
  `ephemeral_material` entries into durable `MaterialRecord`s;
- `createMaterializationService(...)` as the factory wired by Stage Core.

The materialization service can call registry writer capabilities through
`MaterialSourceMaterializerStorePort`, including source/canonical get-or-create
operations, source attachment, canonical promotion, and merges. Query and
Resolve do not receive those writer methods directly.

## Query And Resolve Use

Material Resolve is a text-query path. It uses Material Search for local
durable retrieval and request-scoped reranking, Source Grounding for provider
expansion, and process-local ephemeral entries for provider-backed non-durable
results. Resolve does not materialize durable `MaterialRecord`s.

Material Query no longer materializes ordinary Source Library rows during
retrieval. `all`, ordinary `source_library`, and `collection` pools retrieve
through Material Search and project durable MaterialRecords. Source-backed
track expansion and related callers that need a handle for a non-durable row
should allocate an `ephemeral_material` handle rather than materializing an
intermediate durable record.

Recommendation Presentation is the only boundary that may consume a selected
`emat:*` handle, materialize it into a durable record, and then emit final
durable `mat:*` handles in cards and events.

## Stage Context And Recent Cards

Recent card projection is not a Material Query responsibility. The current code
keeps bounded recent-card event projection in `src/stage/recent_cards.ts`, and
Stage Interface projects recent cards into compact context output.

## Guards

`test/architecture/material-boundary.test.ts` checks that:

- the materialization store port contains the registry writer capabilities;
- query does not reference materialization writer methods directly;
- resolve does not reference registry materialization writer methods directly;
- public material handle encode/decode preserves `Ref.kind` and does not fall
  back across `mat:*` / `emat:*`;
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
