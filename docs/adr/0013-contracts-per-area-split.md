# ADR-0013: Contracts Barrel Split into Per-Area Files

## Status

Accepted

## Context

`src/contracts/index.ts` was a single 398-line barrel of 61 exports imported by
59 files across every formal area (extension, music_data_platform,
music_intelligence, stage_core, stage_interface, server). It mixed at least four
abstraction levels in one namespace: runtime result/error primitives, reference
primitives, domain entities (source/material/canonical), provider/plugin
contracts, and stage runtime/tool types.

The cost was locality, not coherence: a change to a `music_data_platform`-only
entity re-parsed the import graph of `stage_interface` and `stage_core`, which
have no business seeing material types. AGENTS.md's bounded-context ownership
rules demand one owner per concern, but the single barrel collapsed all areas
into one shared namespace with zero locality. The deletion test on the barrel:
it existed for import convenience, not coherence — splitting it contracts each
area's diff surface to its own contract file without spreading complexity.

An architecture review (deepening candidate #1) surfaced the split. An
adversarial audit of the barrel and all 59 importers then verified the
boundaries: 46 of 61 symbols are imported by more than one area, and the
real dependency direction between areas is one-way and acyclic.

## Decision

Split the contracts barrel into per-area contract definition files behind a
shared leaf kernel:

```text
contracts/kernel.ts              leaf · imports nothing
contracts/music_data_platform.ts imports → kernel
contracts/storage.ts             imports → kernel, music_data_platform
contracts/stage_interface.ts     imports → kernel
contracts/stage_core.ts          imports → kernel, stage_interface
```

The shared kernel (`kernel.ts`) holds only genuinely cross-cutting primitives:
`Result`, `StageError`, `StageWarning`, `FormalArea`, `Ref`, `isRefComponentSafe`,
`assertRefSafe`, `refKey`. It is a strict leaf.

`contracts/index.ts` was a transitional pure re-export shim
(`export * from "./<area>.js"`) keeping the existing importers unchanged in
Phase 1. Phase 2 repointed every importer to the narrow per-area path and
deleted the shim; `contracts/index.ts` no longer exists.

### music_intelligence owns no contract surface

There is no `contracts/music_intelligence.ts`. music_intelligence is an
orchestration context that reads DOWNWARD into `music_data_platform` contracts
(verified import direction: `music_intelligence` → `music_data_platform`,
never the reverse). It does not own a contract surface; any future retrieval
domain types live in the music_intelligence area MODULES, not in a contract
file. The only music_intelligence contract candidates (`tokenizePrefixOrV1Text`,
`hasPrefixOrV1Token`) live in `contracts/music_data_platform.ts` because
material text normalization is a data-platform indexing concern and placing
them in an intelligence contract would force a forbidden reverse edge.

### Dropped exports

`PublicRefKey` and `PublicHandle` are removed from the contract surface.
`PublicRefKey` was never imported as a named type outside the barrel; `refKey`
returns a plain `string`. `PublicHandle` was an orphan with zero importers and
no reference from any barrel type. The typed handle concepts that matter
(Music Discovery Handle, Music Scope Handle) are distinct Public Agent Protocol
types defined by their owning contexts, not this orphan.

## Rejected Alternatives

- A flat wide barrel owned by no area: rejected; destroys locality and
  contradicts AGENTS.md bounded-context ownership.
- A `contracts/music_intelligence.ts` for tokenization: rejected; the verified
  import direction is intelligence → data_platform, so an intelligence contract
  would force `music_data_platform` to import upward, creating a forbidden
  reverse edge and a conceptual two-cycle.
- Keep `PublicRefKey`/`PublicHandle` in the kernel: rejected; they fail the
  multi-area test (zero or single-area consumers) and the kernel must stay a
  leaf. Keeping unused speculative aliases violates "avoid speculative
  abstractions".
- Clean break (delete the barrel in the same change): rejected; ~59 import sites
  (including `src/index.ts` and all formal tests) depend on the barrel path. A
  transitional shim with zero importer churn is the only non-atomic-safe path.

## Consequences

- Each formal area that owns a contract has its own definition file; changes to
  one area's contract no longer re-parse the import graph of unrelated areas.
- Three architecture guards in `test/formal/active-tree.test.ts` machine-check
  the split: the contracts DAG per-file allow-list (covering `from` clauses,
  dynamic `import()` calls, and bare side-effect imports so no relative edge
  slips through), a kernel-export allow-list (kernel must export only the eight
  cross-cutting primitives named above — additive, so any new area type placed
  in the kernel is flagged without a hand-maintained deny-list), and a
  ref-origin check (the ref primitives `isRefComponentSafe`, `assertRefSafe`,
  and `refKey` are imported only from `kernel.js`). These guards are the source
  of truth for the DAG; prose alone is not. (Phase 2 replaced the Phase 1
  barrel-integrity guard with this ref-origin guard once the barrel was deleted.)
- `refKey` returns `string`; `PublicRefKey` is gone. Callers are unaffected
  (`PublicRefKey` was `string` and never imported as a named type).
- ADR-0009's Tool Framework dimensions (`sideEffect`, `inputSchema`,
  `outputSchema`) remain a future addition to `contracts/stage_interface.ts`;
  this split does not implement them but gives them a home that does not touch
  material or runtime contracts.
- Phase 2 repointed all importers to the narrow per-area contract paths,
  deleted the `contracts/index.ts` shim, and added the ref-origin guard (G3)
  described above. The barrel no longer exists; each importer now pulls only the
  area files it uses, so a change to one area's contract no longer re-parses
  unrelated importers.

## References

- AGENTS.md — bounded-context ownership and import-direction rules.
- ADR-0005 — formal top-level architecture areas.
- ADR-0009 — Tool Framework (Stage Interface contract surface consumer).
