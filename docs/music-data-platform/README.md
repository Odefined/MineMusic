# Music Data Platform

> Status: Current area documentation for implemented Phase 10
> Scope: Identity write model, source-library import, owner material relation, owner catalog projection, and material text projection foundation

Music Data Platform owns formal music data truth. The implemented slices cover
source/material/canonical identity records, current source-to-material binding
facts, narrow identity write commands, transaction-scoped repositories,
source-library import persistence, library-ref-based source-library facts,
opaque material ref creation, the internal Library Import application service,
material-scope owner relation facts, the internal owner catalog
projection/read-model foundation, and the owner-neutral material text
projection/FTS foundation.

This area does not yet implement Collection membership, Library Update
baselines, removed-from-library reconciliation, local pool query,
owner-scoped/public query, provider execution, Stage Interface tools,
canonical review/merge workflow, dirty-projection orchestration, Memory, or
Music Experience.

## Documents

| Document | Purpose |
| --- | --- |
| `design.md` | Current identity, source-library, owner relation, owner catalog, and material text projection design authority. |
| `ports.md` | Provided/consumed ports, forbidden dependencies, and guards. |
| `progress.md` | Implementation state, verification evidence, and remaining gaps. |

## Current Source

```text
src/music_data_platform/errors.ts
src/music_data_platform/identity_schema.ts
src/music_data_platform/identity_records.ts
src/music_data_platform/identity_write_model.ts
src/music_data_platform/owner_scope.ts
src/music_data_platform/ref_digest.ts
src/music_data_platform/source_library_ref.ts
src/music_data_platform/material_ref_factory.ts
src/music_data_platform/source_library_import.ts
src/music_data_platform/source_library_records.ts
src/music_data_platform/source_library_schema.ts
src/music_data_platform/owner_material_relation_ref.ts
src/music_data_platform/owner_material_relation_schema.ts
src/music_data_platform/owner_material_relation_records.ts
src/music_data_platform/owner_material_relation_commands.ts
src/music_data_platform/owner_catalog_schema.ts
src/music_data_platform/owner_catalog_records.ts
src/music_data_platform/owner_catalog_projection.ts
src/music_data_platform/material_text_projection_schema.ts
src/music_data_platform/material_text_normalization.ts
src/music_data_platform/material_text_projection_records.ts
src/music_data_platform/material_text_projection_commands.ts
src/music_data_platform/index.ts
```

Formal phase specs:

- `docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md`
- `docs/formal-rebuild/phase-7-source-library-import-foundation.md`
- `docs/formal-rebuild/phase-8-owner-catalog-projection-foundation.md`
- `docs/formal-rebuild/phase-9-owner-material-relations-foundation.md`
- `docs/formal-rebuild/phase-10-music-data-platform-material-text-projection-foundation.md`
