# Music Data Platform

> Status: Current area documentation for implemented Phase 7
> Scope: Identity write model and source-library import foundation

Music Data Platform owns formal music data truth. The implemented slices cover
source/material/canonical identity records, current source-to-material binding
facts, narrow identity write commands, transaction-scoped repositories,
source-library import persistence, opaque material ref creation, and the
internal Library Import application service.

This area does not yet implement owner facts, Collection membership, Library
Update baselines, removed-from-library reconciliation, query, projections,
provider execution, Stage Interface tools, canonical review/merge workflow,
Memory, or Music Experience.

## Documents

| Document | Purpose |
| --- | --- |
| `design.md` | Current identity write and source-library import design authority. |
| `ports.md` | Provided/consumed ports, forbidden dependencies, and guards. |
| `progress.md` | Implementation state, verification evidence, and remaining gaps. |

## Current Source

```text
src/music_data_platform/errors.ts
src/music_data_platform/identity_schema.ts
src/music_data_platform/identity_records.ts
src/music_data_platform/identity_write_model.ts
src/music_data_platform/material_ref_factory.ts
src/music_data_platform/source_library_import.ts
src/music_data_platform/source_library_records.ts
src/music_data_platform/source_library_schema.ts
src/music_data_platform/index.ts
```

Formal phase specs:

- `docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md`
- `docs/formal-rebuild/phase-7-source-library-import-foundation.md`
