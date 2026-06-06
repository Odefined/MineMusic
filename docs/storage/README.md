# Storage Area Docs

> Status: Current area authority
> Scope: Generic MusicDatabase boundary and SQLite adapter foundation

Storage is infrastructure behind area-owned ports. It is not a top-level
bounded context and does not own music facts, provider behavior, query
planning, public tools, memory, or effects.

Phase 4 defines a generic `MusicDatabase` boundary and implements SQLite as a
concrete adapter. Music Data Platform will later use this foundation to own
source/material/canonical/owner fact persistence.

## Documents

| Document | Purpose |
| --- | --- |
| `design.md` | Storage design, ownership, public abstraction, SQLite adapter boundary, and transaction rules. |
| `ports.md` | Provided/consumed ports, allowed capabilities, forbidden dependencies, and guard plan. |
| `progress.md` | Current implementation state, verification evidence, remaining gaps, and next slices. |

## Current Authority Chain

Use these documents together:

1. `ARCHITECTURE.md` for global area ownership and import direction.
2. `docs/formal-rebuild/phase-4-music-database-foundation.md` for the Phase 4
   spec and execution boundary.
3. `docs/storage/design.md` for stable Storage design.
4. `docs/storage/ports.md` for dependency and capability boundaries.
5. `docs/storage/progress.md` for current implementation status.

Old pre-formal storage and material-store documents are archived evidence only.
Do not restore old `src/storage/**` implementations or repository patterns as
compatibility layers.
