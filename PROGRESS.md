# Formal Rebuild Progress

> Status: Formal rebuild milestone index
> Scope: Project-level milestones only
> Not a task ledger: Detailed execution belongs to phase specs or future
> area-local progress documents.

## Pre-Formal Baseline

The MVP implementation and previous root progress history are preserved as
historical evidence. The pre-formal root snapshots live under:

```text
docs/archive/root/formal-rebuild-2026-06-06/
```

Use those snapshots to understand what existed before the formal rebuild, not
as current architecture authority.

## 2026-06-06: Phase 0 Source-Of-Truth Reset

Phase 0 establishes the formal rebuild authority chain:

- same-repo formal rebuild posture;
- old MVP docs/code as evidence and migration/deletion inventory only;
- no default MVP compatibility layers;
- root formal architecture authority in `ARCHITECTURE.md`;
- formal rebuild current-state authority in `CURRENT_STATE.md`;
- formal milestone index in this file;
- formal target vocabulary in `docs/formal-project-glossary.md`;
- formal ADRs for rebuild posture, architecture areas, identity/candidate
  boundaries, and Collection/owner-relation split;
- archived pre-formal root snapshots;
- superseded notices for selected area docs that still describe MVP resolve,
  ephemeral material, public canonical review, or old query paths.

Phase 0 intentionally does not change code, TypeScript contracts, provider
behavior, Stage Interface tool schemas, runtime wiring, database schemas, or
generated runtime artifacts.

## Next Formal Milestones

### Phase 1: Contract Vocabulary Reset

Planned source:

```text
docs/formal-rebuild/phase-1-contract-vocabulary-reset.md
```

Expected focus:

- `Ref` / `refKey(ref)` policy;
- entity vs record vocabulary;
- source/material/canonical kind vocabulary;
- first-class `VersionInfo`;
- source-owned links;
- provider candidate contract direction;
- removal of old MVP public/domain vocabulary from formal contracts.

Phase 1 must not redefine the top-level architecture taxonomy established in
Phase 0.

### Later Formal Phases

Later phases should rewrite area docs and code only when the owning boundary is
in scope. Known later areas include:

- Server Host and Stage Core runtime composition;
- Stage Interface instruments, tools, Handbook, and output policy;
- Extension Plugin System and Capability Slots;
- Music Data Platform source/material/canonical/owner facts;
- Music Intelligence Retrieval and Knowledge;
- Music Experience radio/listening behavior;
- Memory;
- Effect Boundary;
- provider integrations and storage infrastructure behind the formal ports.

Each later phase should keep old MVP code/docs as evidence only and should not
add compatibility layers unless a new accepted ADR explicitly allows an
exception.
