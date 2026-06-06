# ADR-0004: Same-Repo Formal Rebuild

## Status

Accepted

## Context

MineMusic has a working MVP implementation and a large body of architecture
documentation. That history is useful evidence, but the project is moving into
a formal v1 architecture. Continuing to patch old MVP surfaces would keep stale
terms such as Material Resolve, Ephemeral Material, provisional public canonical
review, and MVP handle codecs alive as accidental architecture.

The project considered whether to start a new repository, keep patching the
MVP, or rebuild formally inside the current repository.

## Decision

MineMusic remains in the same repository and performs a formal rebuild.

Old MVP docs and old MVP code are evidence, donor material, deletion inventory,
and migration input only. They are not the formal architecture base.

Formal v1 does not add compatibility layers, adapters, aliases, or temporary
bridges merely to keep old MVP flows alive. Any compatibility exception must be
accepted explicitly in a later ADR.

Old code is preserved through git history and, if useful, a pre-formal snapshot
tag or branch. Do not copy old code into `src/archive`, `legacy`, `old`, or
docs archive folders.

## Rejected Alternatives

- New blank repository: rejected because it would discard useful git history,
  tests, provider experiments, and donor implementation evidence.
- MVP patching pass: rejected because it would keep stale concepts alive and
  force formal architecture to inherit accidental boundaries.
- Active-tree legacy archive: rejected because old code in active source
  folders would invite imports and compatibility pressure.

## Consequences

- `ARCHITECTURE.md`, `CURRENT_STATE.md`, `PROGRESS.md`, `INDEX.md`, formal
  glossary, and formal ADRs become the formal source-of-truth chain.
- Old root snapshots are archived under `docs/archive/root/`.
- Existing code remains migration/deletion inventory until the owning formal
  phase rewrites it.
- Phase plans must not use current code structure as target architecture merely
  because it compiles.
