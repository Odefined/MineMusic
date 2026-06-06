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

## 2026-06-06: Phase 1 Contract Vocabulary Reset

Phase 1 resets active code instead of patching the MVP runtime:

- old active `src/**`, `test/**`, `fixtures/**`, `skills/minemusic`, and
  launchd reset script MVP implementation roots were removed;
- `src/contracts/index.ts` now contains formal Phase 1 contracts only;
- `Ref` no longer carries `url`;
- `refKey(ref)` is the canonical public ref string helper and rejects unsafe
  `:` components;
- source/material/canonical entities are separate from storage records;
- source-side kind vocabulary uses `track | album | artist`;
- material/canonical identity kind vocabulary uses
  `recording | album | artist | work | release`;
- `VersionInfo` is first-class source/material/canonical information;
- `PlayableLink` is source-owned and contains no `sourceRef` or `expiresAt`;
- `ProviderMaterialCandidate` wraps normalized `SourceEntity` facts rather than
  material identity;
- `SourceProvider` declares optional capabilities because providers do not all
  support the same operations;
- formal status vocabulary is split into lifecycle, identity, availability, and
  canonical record axes;
- minimal Stage Interface, Stage Core, and Server Host skeletons compile
  against the formal contracts;
- tests guard against old MVP runtime roots and deleted vocabulary returning to
  active source.
- pre-formal active area docs, host-adapter docs, provider docs, and operations
  docs were removed from active `docs/`; future area docs must be rebuilt by
  their owning formal phase.

Phase 1 intentionally does not implement query engine behavior, query hit
output shape, query-to-present flow, final `MaterialCard` key set, provider
integrations, source-library/collection/owner relation workflows, database
migrations, MCP transport, or full runtime architecture.

## Next Formal Milestones

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
