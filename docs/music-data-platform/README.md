# Music Data Platform

> Status: Current area documentation for implemented Phase 5
> Scope: Phase 5 identity write model only

Music Data Platform owns formal music data truth. The implemented Phase 5
slice covers source/material/canonical identity records, current
source-to-material binding facts, narrow identity write commands, and
transaction-scoped repositories.

This area does not yet implement owner facts, Collection membership, Library
Import / Update orchestration, query, projections, provider execution, Stage
Interface tools, canonical review/merge workflow, Memory, or Music Experience.

## Documents

| Document | Purpose |
| --- | --- |
| `design.md` | Current Phase 5 identity write model design authority. |
| `ports.md` | Provided/consumed ports, forbidden dependencies, and guards. |
| `progress.md` | Implementation state, verification evidence, and remaining gaps. |

## Current Source

```text
src/music_data_platform/errors.ts
src/music_data_platform/identity_schema.ts
src/music_data_platform/identity_records.ts
src/music_data_platform/identity_write_model.ts
src/music_data_platform/index.ts
```

The formal phase spec is
`docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md`.
