# Music Data Platform

> Status: Current area documentation for implemented Phase 8
> Scope: Identity write model, source-library import, and owner catalog projection foundation

Music Data Platform owns formal music data truth. The implemented slices cover
source/material/canonical identity records, current source-to-material binding
facts, narrow identity write commands, transaction-scoped repositories,
source-library import persistence, library-ref-based source-library facts,
opaque material ref creation, the internal Library Import application service,
and the first owner catalog projection/read-model foundation.

This area does not yet implement Collection membership, owner-relation writes,
Library Update baselines, removed-from-library reconciliation, local pool query,
provider execution, Stage Interface tools, canonical review/merge workflow,
dirty-projection orchestration, Memory, or Music Experience.

## Documents

| Document | Purpose |
| --- | --- |
| `design.md` | Current identity, source-library, and owner catalog projection design authority. |
| `ports.md` | Provided/consumed ports, forbidden dependencies, and guards. |
| `progress.md` | Implementation state, verification evidence, and remaining gaps. |

## Current Source

```text
src/music_data_platform/errors.ts
src/music_data_platform/identity_schema.ts
src/music_data_platform/identity_records.ts
src/music_data_platform/identity_write_model.ts
src/music_data_platform/owner_scope.ts
src/music_data_platform/source_library_ref.ts
src/music_data_platform/material_ref_factory.ts
src/music_data_platform/source_library_import.ts
src/music_data_platform/source_library_records.ts
src/music_data_platform/source_library_schema.ts
src/music_data_platform/owner_catalog_schema.ts
src/music_data_platform/owner_catalog_records.ts
src/music_data_platform/owner_catalog_projection.ts
src/music_data_platform/index.ts
```

Formal phase specs:

- `docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md`
- `docs/formal-rebuild/phase-7-source-library-import-foundation.md`
- `docs/formal-rebuild/phase-8-owner-catalog-projection-foundation.md`
