# Storage Area Docs

> Status: Current area authority
> Scope: Generic `MusicDatabase` boundary and Postgres runtime adapter

Storage is infrastructure behind area-owned ports. It is not a top-level
bounded context and does not own music facts, provider behavior, query
planning, public tools, memory, or effects.

The current formal runtime storage backend is Postgres through the generic
`MusicDatabase` boundary. Music Data Platform and Stage Interface own their
schema contributions and record semantics; Storage owns database lifecycle,
transactions, parameter binding, and adapter confinement.

## Documents

| Document | Purpose |
| --- | --- |
| `design.md` | Storage design, ownership, public abstraction, Postgres adapter boundary, and transaction rules. |
| `ports.md` | Provided/consumed ports, allowed capabilities, forbidden dependencies, and guard plan. |
| `progress.md` | Current implementation state, verification evidence, remaining gaps, and next slices. |

## Current Authority Chain

Use these documents together:

1. `ARCHITECTURE.md` for global area ownership and import direction.
2. `docs/formal-rebuild/phase-21-postgres-background-work-localize-implementation-plan.md`
   for the destructive Postgres migration plan.
3. `docs/storage/design.md` for stable Storage design.
4. `docs/storage/ports.md` for dependency and capability boundaries.
5. `docs/storage/progress.md` for current implementation status.

Old pre-formal storage and material-store documents are archived evidence only.
Do not restore old `src/storage/**` implementations or repository patterns as
compatibility layers.
