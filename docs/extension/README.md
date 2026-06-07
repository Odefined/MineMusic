# Extension Area Docs

> Status: Current area authority
> Scope: Extension Plugin System and Capability Slot boundary

Extension owns MineMusic plugin semantics, capability-slot registration,
provider/plugin manifests, and adapter replaceability rules. It does not own
Stage Runtime graph composition, Stage Interface public tools, music facts,
provider HTTP/client/config details, query, materialization, or final
presentation.

## Documents

| Document | Purpose |
| --- | --- |
| `design.md` | Stable Extension design, concepts, ownership, non-goals, and lifecycle rules. |
| `ports.md` | Provided/consumed ports, read/write capabilities, forbidden dependencies, composition, and guards. |
| `progress.md` | Current implementation state, verification evidence, remaining gaps, and next slices. |
| `plugins/ncm.md` | NCM plugin-specific config, source search mapping, source refs, errors, and smoke usage. |

## Current Authority Chain

Use these documents together:

1. `ARCHITECTURE.md` for global area ownership and import direction.
2. `docs/formal-rebuild/phase-3-extension-capability-slot-baseline.md` for
   the implemented Phase 3 spec.
3. `docs/extension/design.md` for stable Extension design.
4. `docs/extension/ports.md` for dependency and capability boundaries.
5. `docs/extension/progress.md` for current implementation status.

Old provider/plugin/source-provider documents are archived evidence only. Do
not restore old `src/plugins/**`, `src/providers/**`, or old source-provider
runtime docs as current Extension authority.
